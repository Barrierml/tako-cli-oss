import { homedir } from "os";
import { join } from "path";

// Tako 配置目录
export const TAKO_DIR = join(homedir(), ".tako");
export const CONFIG_PATH = join(TAKO_DIR, "config.json");
export const TOOLS_DIR = join(TAKO_DIR, "tools");

// Tako CLI 安装目录（Tako 本身安装在这里）
export const TAKO_CLI_DIR = join(TAKO_DIR, "cli");

// Tako 专属 Bun 目录（与用户系统完全隔离）
export const TAKO_BUN_DIR = join(TAKO_DIR, "bun");
export const TAKO_BUN_BIN = join(
  TAKO_BUN_DIR,
  "bin",
  process.platform === "win32" ? "bun.exe" : "bun"
);

// Tako 服务器地址 (可通过环境变量覆盖，用于本地开发)
export const TAKO_SERVER = process.env.TAKO_SERVER || "https://tako.shiroha.tech";

// 中转站地址（API 代理）
export const PROXY_BASE_URL = process.env.PROXY_BASE_URL || "https://tako.shiroha.tech";

// 是否为开发模式
// TAKO_DEV 接受 "1" / "true" 两种写法（package.json 的 `cli` script 用 "1"）
export const IS_DEV =
  process.env.TAKO_DEV === "true" ||
  process.env.TAKO_DEV === "1" ||
  TAKO_SERVER.includes("localhost");

/**
 * 每个客户端在项目中的使用记录
 */
export interface ClientUsage {
  /** 使用次数 */
  count: number;
  /** 最后使用时间 ISO */
  lastAt: string;
  /** 上次启动时勾选的 launchOption id 列表（用于下次启动时恢复默认选中状态） */
  lastSelectedOptionIds?: string[];
}

/**
 * 项目记录：用于追踪用户常用的项目目录
 */
export interface ProjectRecord {
  /** 项目绝对路径 */
  path: string;
  /** 启动次数（总计） */
  launchCount: number;
  /** 最后启动时间 ISO */
  lastLaunchedAt: string;
  /** 最后使用的客户端 ID */
  lastClientId?: string;
  /** 各客户端的使用记录 */
  clientUsage?: Record<string, ClientUsage>;
}

export interface TakoConfig {
  apiKey: string;
  apiId: string; // 从 get-key-id 返回的 uuid
  installedClients: Record<
    string,
    {
      version: string;
      installedAt: string;
    }
  >;
  /** 最近使用的项目列表 */
  recentProjects?: ProjectRecord[];
  /** 是否启用遥测（默认 true） */
  telemetryEnabled?: boolean;
  /** 用户最后查看过的更新日志版本 */
  lastSeenVersion?: string;
  /** Provider 列表 */
  providers?: import("./providers/types").Provider[];
  /** 默认 Provider ID */
  defaultProviderId?: string;
  /** 每个客户端绑定的 Provider ID（key=clientId, value=providerId） */
  clientProviderMap?: Record<string, string>;
  /** 已看过的远端公告 id 列表（popup_once=true 的公告关闭后入此列表，避免重复弹） */
  seenAnnouncementIds?: string[];
}

const defaultConfig: TakoConfig = {
  apiKey: "",
  apiId: "",
  installedClients: {},
};

/**
 * 确保 Tako 目录存在
 */
export async function ensureTakoDir(): Promise<void> {
  const fs = await import("fs/promises");

  try {
    await fs.mkdir(TAKO_DIR, { recursive: true });
    await fs.mkdir(TOOLS_DIR, { recursive: true });
  } catch {
    // 目录已存在
  }
}

/**
 * 读取配置文件
 */
export async function loadConfig(): Promise<TakoConfig> {
  await ensureTakoDir();

  try {
    const file = Bun.file(CONFIG_PATH);
    if (await file.exists()) {
      const content = await file.json();
      return { ...defaultConfig, ...content };
    }
  } catch {
    // 配置文件不存在或解析失败
  }

  return { ...defaultConfig };
}

/**
 * 保存配置文件
 */
export async function saveConfig(config: TakoConfig): Promise<void> {
  await ensureTakoDir();
  await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * 更新配置的部分字段
 */
export async function updateConfig(
  updates: Partial<TakoConfig>
): Promise<TakoConfig> {
  const config = await loadConfig();
  const newConfig = { ...config, ...updates };
  await saveConfig(newConfig);
  return newConfig;
}

/**
 * 检查是否已配置 API Key
 */
export async function hasApiKey(): Promise<boolean> {
  const config = await loadConfig();
  return !!config.apiKey;
}

/**
 * 获取 API Key
 */
export async function getApiKey(): Promise<string> {
  const config = await loadConfig();
  return config.apiKey;
}

/**
 * 获取 API ID
 */
export async function getApiId(): Promise<string> {
  const config = await loadConfig();
  return config.apiId;
}
