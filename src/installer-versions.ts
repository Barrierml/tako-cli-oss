/**
 * 客户端历史版本管理
 *
 * 提供两个能力：
 *   - listAvailableVersions(pkg): 列出 npm registry 上的所有版本
 *   - installAtVersion(client, version): 安装指定版本到 TOOLS_DIR/<client>
 *
 * 不依赖 installer.ts 内部细节，只复用最低层的 bun + registry 配置。
 */
import { join } from "node:path";
import type { ClientConfig } from "./clients/base";
import { getClientDir } from "./clients/base";
import { TAKO_BUN_BIN, loadConfig, updateConfig } from "./config";
import { getNpmRegistry } from "./region";

export interface VersionInfo {
  version: string;
  publishedAt?: string;
  isCurrent: boolean;
}

interface RegistryResponse {
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, unknown>;
  time?: Record<string, string>;
}

/**
 * 从 npm registry 拉取某 package 的所有发布版本，按发布时间倒序。
 * 失败抛错，调用方自己 try/catch。
 */
export async function listAvailableVersions(packageName: string): Promise<VersionInfo[]> {
  const registry = await getNpmRegistry();
  const url = `${registry}/${encodeURIComponent(packageName).replace("%40", "@")}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`registry http ${res.status}`);
  const data = (await res.json()) as RegistryResponse;

  const versions = Object.keys(data.versions ?? {});
  if (!versions.length) throw new Error("no versions found");

  const time = data.time ?? {};
  const out: VersionInfo[] = versions.map((v) => ({
    version: v,
    publishedAt: time[v],
    isCurrent: false,
  }));

  // 按发布时间倒序
  out.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });

  return out;
}

/**
 * 在 TOOLS_DIR/<client> 下安装指定版本。
 * 流程：
 *   1. mkdir -p TOOLS_DIR/<client>
 *   2. 写入 package.json（如果不存在）
 *   3. bun add <package>@<version>
 *   4. 更新 ~/.tako/config.json 的 installedClients[client.id]
 */
export async function installAtVersion(client: ClientConfig, version: string): Promise<void> {
  const fs = await import("node:fs/promises");
  const clientDir = getClientDir(client.id);

  await fs.mkdir(clientDir, { recursive: true });

  // 确保 package.json 存在（bun add 需要）
  const pkgPath = join(clientDir, "package.json");
  const pkgFile = Bun.file(pkgPath);
  if (!(await pkgFile.exists())) {
    await Bun.write(pkgPath, JSON.stringify({ name: `tako-${client.id}-host`, version: "0.0.0", private: true }, null, 2));
  }

  const registry = await getNpmRegistry();
  const proc = Bun.spawn([TAKO_BUN_BIN, "add", `${client.package}@${version}`], {
    cwd: clientDir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, BUN_CONFIG_REGISTRY: registry },
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`bun add ${client.package}@${version} failed: ${err.slice(0, 500).trim()}`);
  }

  // 持久化记录
  const config = await loadConfig();
  await updateConfig({
    installedClients: {
      ...config.installedClients,
      [client.id]: { version, installedAt: new Date().toISOString() },
    },
  });
}

/**
 * 获取本地当前安装的版本（从配置读）。
 */
export async function getInstalledVersion(client: ClientConfig): Promise<string | null> {
  const config = await loadConfig();
  return config.installedClients[client.id]?.version ?? null;
}
