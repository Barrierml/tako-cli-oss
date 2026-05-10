import { homedir } from "os";
import { join } from "path";
import { ClientConfig, LaunchOption, registerClient } from "./base";
import { PROXY_BASE_URL } from "../config";
import type { ProviderContext, Provider } from "../providers/types";
import { parse, stringify } from "smol-toml";
import { loadCatalog, getTakoModels } from "../models";
import { BUNDLED_ENTRIES } from "../models/bundled";

const CODEX_DIR = join(homedir(), ".codex");
const CODEX_CONFIG_PATH = join(CODEX_DIR, "config.toml");
const CODEX_AUTH_PATH = join(CODEX_DIR, "auth.json");

function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value) &&
        result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function cleanLegacyConfig(config: Record<string, any>): Record<string, any> {
  if (config.model_providers?.crs) delete config.model_providers.crs;
  if (config.model_provider === "crs") delete config.model_provider;
  if (config.openai_base_url) delete config.openai_base_url;
  const tako = config.model_providers?.tako;
  if (tako) {
    delete tako.wire_api;
    delete tako.requires_openai_auth;
    delete tako.supports_websockets;
    delete tako.request_max_retries;
    delete tako.stream_max_retries;
    delete tako.api_key;
    delete tako.env_key;
    delete tako.experimental_bearer_token;
  }
  return config;
}

/**
 * 读取现有的 auth.json（安全合并用）
 */
async function readAuthJson(): Promise<Record<string, any>> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(CODEX_AUTH_PATH, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * 写 auth.json — 合并而非覆盖，保留 OAuth tokens
 */
async function writeAuthJson(updates: Record<string, any>): Promise<void> {
  const existing = await readAuthJson();
  const merged = { ...existing, ...updates };
  await Bun.write(CODEX_AUTH_PATH, JSON.stringify(merged, null, 2) + "\n");
}

async function setupCodexConfigFiles(
  provider: ProviderContext,
  selectedOptionIds?: string[],
): Promise<void> {
  const fs = await import("fs/promises");
  try { await fs.mkdir(CODEX_DIR, { recursive: true }); } catch { /* exists */ }

  // --- 读取现有 config.toml ---
  let existing: Record<string, any> = {};
  try { existing = parse(await fs.readFile(CODEX_CONFIG_PATH, "utf-8")); } catch { /* noop */ }
  existing = cleanLegacyConfig(existing);

  if (provider.type === "codex-subscription") {
    // ─── 订阅直连：切换 model_provider 到默认，保留所有 provider 定义 ───
    delete existing.model_provider; // 不指定 = Codex 使用内置 ChatGPT OAuth
    existing.check_for_update_on_startup = false;

    // 用户通过 --model / launcher 勾选指定了模型时，写进 config.toml。
    // OAuth 模式下 codex 启动 banner 与会话 model 都从 config 读，
    // 单靠 CLI --model 不够（且 banner 永远显示 config 的旧值）。
    const optionModel = selectedOptionIds
      ?.find((id) => id.startsWith("model-"))
      ?.slice("model-".length);
    if (optionModel) existing.model = optionModel;

    // auth.json：恢复该账号的 OAuth tokens（多账号切换核心）
    if (provider.authData) {
      // 完整恢复该账号的认证数据
      await Bun.write(CODEX_AUTH_PATH, JSON.stringify(provider.authData, null, 2) + "\n");
    } else {
      // 没有存储 tokens（旧 provider），清除 API Key，恢复 OAuth 模式
      await writeAuthJson({ OPENAI_API_KEY: null, auth_mode: "chatgpt" });
    }
  } else {
    // ─── Tako / DeepSeek / 自定义代理：切换 model_provider，确保定义存在 ───
    let baseUrl: string;
    if (provider.type === "tako") {
      baseUrl = `${PROXY_BASE_URL}/v1`;
    } else if (provider.type === "deepseek") {
      baseUrl = "https://api.deepseek.com/v1";
    } else {
      baseUrl = `${provider.baseUrl}/v1`;
    }

    // 优先级：launcher 里勾的 model-* > provider.model > gpt-5.5 默认
    const optionModel = selectedOptionIds
      ?.find((id) => id.startsWith("model-"))
      ?.slice("model-".length);
    const model = optionModel || provider.model || "gpt-5.5";
    // Codex 内置 catalog 没有 DeepSeek / 非 OpenAI 模型，默认会打印
    // "Model metadata for `xxx` not found. Defaulting to fallback metadata"
    // 优先级：bundled catalog → par 服务器返回的目录 → 用户在 provider 上录的 modelContextWindow
    const meta = BUNDLED_ENTRIES.find((e) => e.id === model);
    let ctxWindow = meta?.contextWindow;
    if (!ctxWindow && (provider.type === "tako" || provider.type === "custom") && provider.baseUrl) {
      const par = getTakoModels(provider.baseUrl, "openai")?.find((e) => e.id === model);
      if (par && par.contextWindow > 0) ctxWindow = par.contextWindow;
    }
    if (!ctxWindow) ctxWindow = provider.modelContextWindow;

    // wire_api 不再设置：codex 已废弃 wire_api="chat"（codex#7782，加载 config 直接报错），
    // 只剩 "responses"（默认）。所以现在所有 model 都强走 /v1/responses，
    // 非 OpenAI 后端（deepseek/mimo 等）的 Responses↔Chat 翻译必须由 par/sub2api 承担，
    // 不能在 CLI 侧解决。cleanLegacyConfig 已经会把存量 wire_api 删掉，避免加载失败。
    const cfg: Record<string, any> = {
      model_provider: "tako",
      model,
      check_for_update_on_startup: false,
      model_providers: {
        tako: { name: "tako", base_url: baseUrl },
      },
    };
    if (ctxWindow) cfg.model_context_window = ctxWindow;
    existing = deepMerge(existing, cfg);

    // auth.json：设置 API Key，清除 OAuth auth_mode 避免 Codex 走错认证流程
    if (provider.apiKey) {
      await writeAuthJson({ OPENAI_API_KEY: provider.apiKey, auth_mode: null });
    }
  }

  await Bun.write(CODEX_CONFIG_PATH, stringify(existing));
}

export const codexClient: ClientConfig = {
  id: "codex",
  name: "Codex",
  package: "@openai/codex",
  command: "codex",
  runtime: "bun",
  continueArg: "--continue",
  brandColor: "blue",

  getEnvVars(provider: ProviderContext) {
    // Codex 的 API key 通过 auth.json 注入，无需环境变量
    // 订阅模式也不需要额外环境变量
    return {};
  },

  setupConfigFiles: setupCodexConfigFiles,

  launchOptions: (provider?: Provider) => buildCodexLaunchOptions(provider),
};

// ─── launchOptions 构造逻辑 ──────────────────────────────────────────

const CODEX_BASE_FLAGS: LaunchOption[] = [
  {
    id: "search",
    label: { en: "Web Search", zh: "网络搜索" },
    shortLabel: "Search",
    description: {
      en: "Enable real-time web search",
      zh: "启用实时网页搜索",
    },
    flag: "--search",
    args: ["--search"],
  },
  {
    id: "bypass-sandbox",
    label: { en: "Bypass Sandbox", zh: "绕过审批与沙箱" },
    shortLabel: "Bypass",
    description: {
      en: "DANGEROUS: skip all approvals & sandbox (use only in disposable envs)",
      zh: "危险：跳过所有审批与沙箱限制（仅限隔离/临时环境使用）",
    },
    flag: "--dangerously-bypass-approvals-and-sandbox",
    args: ["--dangerously-bypass-approvals-and-sandbox"],
  },
];

/**
 * Codex 模型列表跟着 provider 走：
 *  - tako / codex-subscription / custom：GPT-5 系
 *  - deepseek：DeepSeek V4 系（OpenAI-compat 网关）
 */
const CODEX_MODEL_WHITELIST = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.3",
];

const CODEX_DEEPSEEK_WHITELIST = [
  "deepseek-v4-flash",
  "deepseek-v4-pro",
];

function ctxStrOf(ctx: number): string {
  if (ctx >= 1_000_000) return "1M";
  if (ctx > 0) return `${Math.round(ctx / 1000)}k`;
  return "?";
}

/**
 * 启发式：明显是 Anthropic / Claude 家族的模型，不应该出现在 Codex（OpenAI 协议）下拉里。
 * 兜底用——par 服务端把模型标 api_type='all' 时（默认值），过滤还是会把 Claude 系
 * 也吐出来。规则保守：只挡明确以 claude- 开头的，避免误伤 deepseek / gpt-claude 桥接等。
 */
function isObviouslyAnthropicModel(id: string): boolean {
  return /^claude[-_]/i.test(id) || /^anthropic[-_/]/i.test(id);
}

/**
 * 优先用 par 服务器返回的 openai 系模型目录（tako/custom provider）。
 * 没缓存（首次启动 / 网络失败）时回退到内置 whitelist。
 */
function buildDynamicCodexModels(provider: Provider): LaunchOption[] | null {
  if (!provider.baseUrl) return null;
  const raw = getTakoModels(provider.baseUrl, "openai");
  if (!raw || raw.length === 0) return null;
  const entries = raw.filter((e) => !isObviouslyAnthropicModel(e.id));
  if (entries.length === 0) return null;
  return entries.map((e) => ({
    id: `model-${e.id}`,
    label: { en: e.displayName, zh: e.displayName },
    shortLabel: e.displayName,
    description: {
      en: `Use ${e.displayName} (${ctxStrOf(e.contextWindow)} ctx)`,
      zh: `使用 ${e.displayName}（上下文 ${ctxStrOf(e.contextWindow)}）`,
    },
    flag: `--model ${e.id}`,
    args: ["--model", e.id],
    group: "model",
  }));
}

function buildCodexModelOptions(provider?: Provider): LaunchOption[] {
  loadCatalog();

  if (provider && (provider.type === "tako" || provider.type === "custom")) {
    const dynamic = buildDynamicCodexModels(provider);
    if (dynamic) return dynamic;
  }

  const ids = provider?.type === "deepseek" ? CODEX_DEEPSEEK_WHITELIST : CODEX_MODEL_WHITELIST;
  const out: LaunchOption[] = [];
  for (const id of ids) {
    const entry = BUNDLED_ENTRIES.find((e) => e.id === id);
    const ctxStr = ctxStrOf(entry?.contextWindow ?? 0);
    const pretty = entry?.displayName ?? id;
    // model + model_context_window 由 setupCodexConfigFiles 直接写进 config.toml
    // （它会读 selectedOptionIds 解析出 model-* 选项），命令行只留个 --model 做提示
    out.push({
      id: `model-${id}`,
      label: { en: pretty, zh: pretty },
      shortLabel: pretty,
      description: {
        en: `Use ${pretty} (${ctxStr} ctx)`,
        zh: `使用 ${pretty}（上下文 ${ctxStr}）`,
      },
      flag: `--model ${id}`,
      args: ["--model", id],
      group: "model",
    });
  }
  return out;
}

function buildCodexLaunchOptions(provider?: Provider): LaunchOption[] {
  return [...CODEX_BASE_FLAGS, ...buildCodexModelOptions(provider)];
}

registerClient(codexClient);
