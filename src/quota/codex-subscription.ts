/**
 * Codex 订阅 fetcher：GET https://chatgpt.com/backend-api/wham/usage
 *
 * 鉴权：Authorization: Bearer ${tokens.access_token}
 * Token 来源：provider.authData.tokens.access_token
 *
 * 返回示例（社区逆向，参考 steipete/codexbar）：
 * {
 *   "plan_type": "plus" | "pro",
 *   "rate_limit": {
 *     "primary_window":   { "used_percent": 45, "reset_at": <unix>, "limit_window_seconds": 18000 },
 *     "secondary_window": { "used_percent": 72, "reset_at": <unix>, "limit_window_seconds": 604800 }
 *   }
 * }
 */
import type { Provider } from "../providers/types";
import type { OfficialQuota, QuotaSlot } from "./types";

interface CodexUsageWindow {
  used_percent?: number;
  reset_at?: number; // unix seconds
  limit_window_seconds?: number;
}

interface CodexUsageResponse {
  plan_type?: string;
  rate_limit?: {
    primary_window?: CodexUsageWindow;
    secondary_window?: CodexUsageWindow;
  };
}

function toSlot(w: CodexUsageWindow | undefined): QuotaSlot | undefined {
  if (!w || typeof w.used_percent !== "number") return undefined;
  const slot: QuotaSlot = {
    usedPct: Math.min(100, Math.max(0, Math.round(w.used_percent))),
  };
  if (typeof w.reset_at === "number") {
    slot.resetsAt = new Date(w.reset_at * 1000).toISOString();
  }
  if (typeof w.limit_window_seconds === "number") {
    slot.windowMinutes = Math.round(w.limit_window_seconds / 60);
  }
  return slot;
}

function extractAuth(provider: Provider): { accessToken?: string; accountId?: string } {
  const tokens = provider.authData?.tokens as Record<string, any> | undefined;
  return {
    accessToken: tokens?.access_token,
    accountId: tokens?.account_id,
  };
}

/**
 * 实际打 ChatGPT wham/usage 的 HTTP 函数。
 *
 * 默认实现（defaultHttpFn）按下面顺序尝试，第一个成功就返回：
 *   1. **codex app-server RPC** — 用本地 codex CLI 的 Rust HTTP 栈
 *      （正经 TLS 指纹 + macOS keychain trust，CF 通常放行）
 *   2. **curl 子进程** — 兜底（Bun fetch 的 TLS 被 CF 当 bot）
 *
 * 测试通过 _setHttpFnForTest 替换。
 */
export interface HttpResult { status: number; body: string }
type HttpFn = (token: string, accountId?: string) => Promise<HttpResult>;

/** 走 codex app-server JSON-RPC：写隔离 CODEX_HOME，不污染用户主 codex 状态 */
async function fetchViaCodexRpc(token: string, accountId?: string): Promise<HttpResult | null> {
  // codex 必须存在
  const hasCodex = await Bun.spawn(["which", "codex"], { stdout: "pipe", stderr: "pipe" }).exited;
  if (hasCodex !== 0) return null;

  const fs = await import("node:fs/promises");
  const { mkdtemp } = fs;
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "tako-codex-"));
  try {
    // 写一份临时 auth.json，强制 chatgpt 模式
    const auth = {
      auth_mode: "chatgpt",
      tokens: { access_token: token, ...(accountId ? { account_id: accountId } : {}) },
    };
    await fs.writeFile(join(dir, "auth.json"), JSON.stringify(auth));

    const lines = [
      JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 0, params: { clientInfo: { name: "tako", version: "1.0" } } }),
      JSON.stringify({ jsonrpc: "2.0", method: "account/rateLimits/read", id: 1, params: {} }),
    ].join("\n") + "\n";

    const proc = Bun.spawn(["codex", "app-server"], {
      stdin: "pipe", stdout: "pipe", stderr: "pipe",
      env: { ...process.env, CODEX_HOME: dir },
    });
    proc.stdin.write(lines);
    const wait = new Promise((r) => setTimeout(r, 8000));
    await Promise.race([proc.exited, wait]);
    proc.kill();
    const out = await new Response(proc.stdout).text();

    // 解析 newline-delimited 响应，找 id=1 那条
    for (const line of out.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const msg = JSON.parse(t);
        if (msg.id !== 1) continue;
        if (msg.error) {
          // RPC 业务错误（包括 codex 自己的网络失败）— 让外层 fallback 到 curl
          return null;
        }
        // result.rateLimits 是 wham/usage 原始响应同形 — 直接序列化成 body
        const body = JSON.stringify(msg.result?.rateLimits ?? msg.result ?? {});
        return { status: 200, body };
      } catch { continue; }
    }
    return null;
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** 兜底：curl 直接打 wham/usage（Bun fetch 被 CF 拦） */
async function fetchViaCurl(token: string, accountId?: string): Promise<HttpResult> {
  const args = [
    "-s", "-S", "--max-time", "10",
    "-w", "\n__HTTP__%{http_code}",
    "https://chatgpt.com/backend-api/wham/usage",
    "-H", `Authorization: Bearer ${token}`,
    "-H", "User-Agent: codex_cli_rs/0.50.0",
    "-H", "Accept: application/json",
  ];
  if (accountId) args.push("-H", `ChatGPT-Account-Id: ${accountId}`);
  const proc = Bun.spawn(["curl", ...args], { stdout: "pipe", stderr: "pipe" });
  const raw = await new Response(proc.stdout).text();
  await proc.exited;
  const m = raw.match(/^([\s\S]*?)\n__HTTP__(\d+)$/);
  return { body: m ? m[1] : raw, status: m ? parseInt(m[2], 10) : 0 };
}

const defaultHttpFn: HttpFn = async (token, accountId) => {
  const viaRpc = await fetchViaCodexRpc(token, accountId).catch(() => null);
  if (viaRpc) return viaRpc;
  return fetchViaCurl(token, accountId);
};

let httpFn: HttpFn = defaultHttpFn;
export function _setHttpFnForTest(fn: HttpFn | null): void {
  httpFn = fn ?? defaultHttpFn;
}

export async function fetchCodexSubscriptionQuota(provider: Provider): Promise<OfficialQuota> {
  const fetchedAt = Date.now();
  const base: OfficialQuota = { provider: "codex-subscription", status: "error", fetchedAt };

  const { accessToken, accountId } = extractAuth(provider);
  if (!accessToken) {
    return {
      ...base,
      hint: "Codex OAuth 未保存：按 p → 选中账号 → d → 重新登录",
      error: "missing_access_token",
    };
  }

  try {
    const { status, body } = await httpFn(accessToken, accountId);
    if (status === 401) {
      return {
        ...base,
        hint: "Codex OAuth 已过期：按 p → 选中账号 → d → 重新登录",
        error: "unauthorized",
      };
    }
    if (status !== 200) {
      return {
        ...base,
        hint: status === 0
          ? "ChatGPT 用量获取失败：本机网络无法访问 chatgpt.com（可能 IP 被 Cloudflare 拦截，可试 HTTPS_PROXY）"
          : "ChatGPT 用量接口不可用",
        error: `http_${status}`,
      };
    }
    const json: CodexUsageResponse = JSON.parse(body);
    // RPC 路径返回 rateLimits 字段（驼峰），curl 路径返回 rate_limit（蛇形）— 两边都兼容
    const rl: any = (json as any).rate_limit ?? (json as any).rateLimits ?? json;
    const prim = rl.primary_window ?? rl.primary;
    const sec  = rl.secondary_window ?? rl.secondary;
    return {
      provider: "codex-subscription",
      status: "ok",
      primary: toSlot(prim),
      secondary: toSlot(sec),
      planType: json.plan_type ?? (json as any).planType,
      fetchedAt,
    };
  } catch (e) {
    return {
      ...base,
      hint: "ChatGPT 用量接口请求失败",
      error: String((e as Error).message ?? e),
    };
  }
}
