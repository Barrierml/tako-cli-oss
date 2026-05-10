import { log, createSpinner } from "./logger";
import { getNpmRegistry } from "./region";
import { TAKO_BUN_BIN, TAKO_CLI_DIR, TAKO_DIR } from "./config";
import { join } from "path";
import { t } from "./i18n";
import { track } from "./analytics";
import { streamBunInstall } from "./bun-progress";

// Tako CLI 包名
const PACKAGE_NAME = "tako-cli";

// 当前版本（构建时自动从 package.json 注入）
export const CURRENT_VERSION = process.env.VERSION || "0.0.0";

/**
 * 比较版本号
 * 返回: 1 表示 a > b, -1 表示 a < b, 0 表示相等
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * 从 npm registry 获取最新版本
 */
async function getLatestVersion(): Promise<string | null> {
  try {
    const registry = await getNpmRegistry();
    const response = await fetch(`${registry}/${PACKAGE_NAME}/latest`, {
      signal: AbortSignal.timeout(5000), // 5 秒超时
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.version || null;
  } catch {
    return null;
  }
}

/**
 * 检查是否有新版本
 */
export async function checkForUpdates(): Promise<{
  hasUpdate: boolean;
  latestVersion?: string;
  currentVersion: string;
}> {
  const latestVersion = await getLatestVersion();

  if (!latestVersion) {
    return { hasUpdate: false, currentVersion: CURRENT_VERSION };
  }

  const hasUpdate = compareVersions(latestVersion, CURRENT_VERSION) > 0;

  return {
    hasUpdate,
    latestVersion,
    currentVersion: CURRENT_VERSION,
  };
}

/**
 * 更新 wrapper script，确保指向正确的安装位置
 * 解决从全局安装迁移到本地安装时 wrapper 指向错误的问题
 */
async function updateWrapperScript(): Promise<void> {
  const fs = await import("fs/promises");
  const takoBinDir = join(TAKO_DIR, "bin");
  const wrapperPath = join(takoBinDir, "tako");
  const takoEntry = join(TAKO_CLI_DIR, "node_modules/tako-cli/dist/index.js");

  // 确保 bin 目录存在
  await fs.mkdir(takoBinDir, { recursive: true });

  // 生成新的 wrapper script
  const isWindows = process.platform === "win32";

  if (isWindows) {
    // Windows: 创建 .cmd 文件
    const cmdContent = `@echo off\r\n"${TAKO_BUN_BIN}" "${takoEntry}" %*\r\n`;
    await fs.writeFile(join(takoBinDir, "tako.cmd"), cmdContent);
  } else {
    // Unix: 创建 bash script
    const shContent = `#!/bin/bash\nexec "${TAKO_BUN_BIN}" "${takoEntry}" "$@"\n`;
    await fs.writeFile(wrapperPath, shContent, { mode: 0o755 });
  }
}

/**
 * 执行自动更新
 */
async function performUpdate(latestVersion: string): Promise<boolean> {
  const s = createSpinner();
  const prefix = `正在更新到 v${latestVersion}`;
  s.start(prefix);

  try {
    const registry = await getNpmRegistry();

    // 确保 Tako CLI 目录存在
    const fs = await import("fs/promises");
    await fs.mkdir(TAKO_CLI_DIR, { recursive: true });

    // 初始化 package.json（如果不存在），与 install.sh 保持一致
    const packageJsonPath = join(TAKO_CLI_DIR, "package.json");
    try {
      await fs.access(packageJsonPath);
    } catch {
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({ name: "tako-local", private: true }, null, 2)
      );
    }

    // 在 Tako CLI 目录下执行更新
    // 使用 bun update --latest 强制更新到最新版本（bun add 受 lockfile 影响可能不会更新）
    const proc = Bun.spawn(
      [TAKO_BUN_BIN, "update", PACKAGE_NAME, "--latest"],
      {
        cwd: TAKO_CLI_DIR,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          BUN_CONFIG_REGISTRY: registry,
        },
      }
    );

    const output = await streamBunInstall(proc, prefix, (msg) => s.update(msg));
    await proc.exited;

    if (proc.exitCode === 0) {
      // 更新 wrapper script，确保指向新的安装位置
      // 这是解决从全局安装迁移到本地安装的关键步骤
      await updateWrapperScript();

      // 埋点：CLI 更新成功
      track("cli_updated", {
        from_version: CURRENT_VERSION,
        to_version: latestVersion,
      });

      s.stop(`更新成功！已更新到 v${latestVersion}`);
      return true;
    } else {
      s.stop(`更新失败: ${output || "未知错误"}`);
      return false;
    }
  } catch (error) {
    s.stop(`更新失败: ${error instanceof Error ? error.message : "未知错误"}`);
    return false;
  }
}

/**
 * 删除 lockfile 以确保能更新到最新版本
 */
async function removeLockfile(): Promise<void> {
  const fs = await import("fs/promises");
  const lockfilePath = join(TAKO_CLI_DIR, "bun.lock");
  try {
    await fs.unlink(lockfilePath);
  } catch {
    // lockfile 不存在，忽略
  }
}

/**
 * 安装 Tako CLI 到本地目录（用于迁移）
 */
async function installToLocal(): Promise<boolean> {
  const fs = await import("fs/promises");

  try {
    const registry = await getNpmRegistry();

    // 确保目录存在
    await fs.mkdir(TAKO_CLI_DIR, { recursive: true });

    // 初始化 package.json
    const packageJsonPath = join(TAKO_CLI_DIR, "package.json");
    try {
      await fs.access(packageJsonPath);
    } catch {
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({ name: "tako-local", private: true }, null, 2)
      );
    }

    // 删除 lockfile 确保安装最新版本
    await removeLockfile();

    // 安装到本地
    const proc = Bun.spawn(
      [TAKO_BUN_BIN, "add", `${PACKAGE_NAME}@latest`],
      {
        cwd: TAKO_CLI_DIR,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          BUN_CONFIG_REGISTRY: registry,
        },
      }
    );

    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * 检查是否需要从全局安装迁移到本地安装
 * 修复旧版 wrapper 指向全局目录的问题
 */
async function migrateIfNeeded(): Promise<boolean> {
  const fs = await import("fs/promises");
  const takoBinDir = join(TAKO_DIR, "bin");
  const wrapperPath = join(takoBinDir, "tako");
  const takoEntry = join(TAKO_CLI_DIR, "node_modules/tako-cli/dist/index.js");

  try {
    // 检查 wrapper 是否存在
    const wrapperContent = await fs.readFile(wrapperPath, "utf-8");

    // 检查是否是旧版 wrapper（使用 bun run tako-cli）
    if (wrapperContent.includes("bun run tako-cli") || wrapperContent.includes("run tako-cli")) {
      log.info(t("updater.migrating"));

      // 检查本地安装是否存在
      let localExists = false;
      try {
        await fs.access(takoEntry);
        localExists = true;
      } catch {
        localExists = false;
      }

      // 如果本地不存在，先安装
      if (!localExists) {
        const ms = createSpinner();
        ms.start(t("updater.installingLocally"));
        const success = await installToLocal();
        if (!success) {
          ms.stop(t("updater.migrationFailed"));
          return false;
        }
        ms.stop(t("updater.installComplete"));
      }

      // 更新 wrapper
      await updateWrapperScript();
      return true; // 需要重启
    }
  } catch {
    // wrapper 不存在或读取失败，忽略
  }

  return false;
}

/**
 * 检查更新（在启动时调用）
 * 检测到新版本时自动更新
 */
export async function checkAndUpdate(): Promise<void> {
  try {
    // 首先检查是否需要迁移（从全局安装迁移到本地安装）
    const needsRestart = await migrateIfNeeded();
    if (needsRestart) {
      log.info(t("updater.migrationComplete"));
      process.exit(0);
    }

    const result = await checkForUpdates();

    if (result.hasUpdate && result.latestVersion) {
      log.warn(t("updater.newVersionAvailable", { version: result.latestVersion, current: CURRENT_VERSION }));

      const success = await performUpdate(result.latestVersion);

      if (success) {
        log.info(t("updater.pleaseRestart"));
        process.exit(0);
      }
    }
  } catch {
    // 静默失败，不影响正常使用
  }
}
