import { join, dirname } from "path";
import { homedir } from "os";
import { mkdir } from "fs/promises";

const TAKO_DIR = join(homedir(), ".tako");
const TAKO_CLI_DIR = join(TAKO_DIR, "cli");
const TAKO_BIN_PATH = join(TAKO_DIR, "bin", process.platform === "win32" ? "tako.cmd" : "tako");

function getClaudeSettingsPath(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "claude", "settings.json");
  }
  return join(homedir(), ".claude", "settings.json");
}

const isWindows = process.platform === "win32";

// 支持 statusline 功能的最低 Tako 版本
const MIN_STATUSLINE_VERSION = "0.1.48";

/**
 * 比较版本号
 * @returns 负数表示 a < b，0 表示相等，正数表示 a > b
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA !== numB) {
      return numA - numB;
    }
  }
  return 0;
}

/**
 * 获取已安装的 Tako 版本
 */
async function getInstalledTakoVersion(): Promise<string | null> {
  const pkgPath = join(TAKO_CLI_DIR, "node_modules", "tako-cli", "package.json");

  try {
    const file = Bun.file(pkgPath);
    if (!(await file.exists())) return null;

    const pkg = await file.json();
    return pkg.version || null;
  } catch {
    return null;
  }
}

/**
 * 检查已安装的 Tako 版本是否支持 statusline
 */
async function isStatusLineSupported(): Promise<boolean> {
  // 开发模式下（VERSION=dev），直接支持
  if (process.env.VERSION === "dev") {
    return true;
  }

  const version = await getInstalledTakoVersion();
  if (!version) return false;

  return compareVersions(version, MIN_STATUSLINE_VERSION) >= 0;
}

/**
 * 获取 Tako 可执行文件路径（跨平台）
 * 开发模式下使用 bun + 当前入口脚本，生产模式下使用全局安装的 bin
 */
function getTakoExecutablePath(): string {
  if (process.env.VERSION === "dev") {
    // dev 模式：用 bun 直接跑源码入口
    return process.argv[1] || TAKO_BIN_PATH;
  }
  return TAKO_BIN_PATH;
}

/**
 * 构建 statusline 命令（dev 模式需要 bun 前缀）
 */
function buildStatusLineCommand(): string {
  if (process.env.VERSION === "dev") {
    const entryPath = process.argv[1];
    if (entryPath) {
      return `bun "${toCommandPath(entryPath)}" statusline`;
    }
  }
  const takoPath = toCommandPath(getTakoExecutablePath());
  return `"${takoPath}" statusline`;
}

/**
 * 将路径转换为命令行友好格式（Windows 需要处理反斜杠）
 */
function toCommandPath(filePath: string): string {
  if (isWindows) {
    // Windows 命令行中可以使用正斜杠，且更不容易出问题
    return filePath.replace(/\\/g, "/");
  }
  return filePath;
}

/**
 * 注入状态栏配置到 Claude Code 的 settings.json
 *
 * 注意：只修改 statusLine 字段，保留用户其他配置
 * 只有当已安装的 Tako 版本支持 statusline 时才注入
 */
export async function injectStatusLineConfig(): Promise<void> {
  // 检查版本是否支持 statusline
  const supported = await isStatusLineSupported();
  if (!supported) {
    // 版本过低，跳过注入
    return;
  }

  const settingsPath = getClaudeSettingsPath();

  // 读取现有配置
  let settings: Record<string, unknown> = {};
  try {
    const file = Bun.file(settingsPath);
    if (await file.exists()) {
      settings = await file.json();
    }
  } catch {
    // 文件不存在或解析失败，使用空对象
  }

  // Tako 的状态栏配置（跨平台）
  const takoStatusLine = {
    type: "command",
    command: buildStatusLineCommand(),
    padding: 0,
  };

  // 检查是否已经是 Tako 的配置
  const currentCommand =
    typeof settings.statusLine === "object" && settings.statusLine !== null
      ? (settings.statusLine as Record<string, unknown>).command
      : null;

  if (typeof currentCommand === "string" && currentCommand.includes("tako statusline")) {
    // 已经配置过，无需重复注入
    return;
  }

  // 注入配置
  settings.statusLine = takoStatusLine;

  // 确保目录存在
  await mkdir(dirname(settingsPath), { recursive: true });

  // 写回文件（保留其他配置）
  await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
}

/**
 * 移除状态栏配置（用户禁用时调用）
 *
 * 只移除 Tako 注入的配置，不影响用户手动配置的其他 statusLine
 */
export async function removeStatusLineConfig(): Promise<void> {
  const settingsPath = getClaudeSettingsPath();

  try {
    const file = Bun.file(settingsPath);
    if (!(await file.exists())) return;

    const settings: Record<string, unknown> = await file.json();

    // 检查是否是 Tako 的配置
    const currentCommand =
      typeof settings.statusLine === "object" && settings.statusLine !== null
        ? (settings.statusLine as Record<string, unknown>).command
        : null;

    if (typeof currentCommand === "string" && currentCommand.includes("tako statusline")) {
      // 移除 Tako 的状态栏配置
      delete settings.statusLine;
      await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
    }
  } catch {
    // 静默失败
  }
}
