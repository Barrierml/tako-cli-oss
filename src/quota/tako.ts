/**
 * Tako 代理 fetcher：POST {PROXY_BASE_URL}/apiStats/api/user-stats
 *
 * 当前端点返回 RS-compat 格式（无限额信息）：
 *   { success, data: { id, name, limits: { currentDailyCost, ... }, usage: { total: {...} } } }
 *
 * 进阶端点 /apiStats/api/user-quota（如果服务端实现了，返回 plan + usage 完整结构）也会被尝试，
 * 拿到的话使用更完整的展示。两个端点都失败才报错。
 */
import { PROXY_BASE_URL, getApiId } from "../config";
import type { Provider } from "../providers/types";
import type { OfficialQuota, QuotaSlot } from "./types";

interface RsCompatStatsResponse {
  success?: boolean;
  data?: {
    id: string;
    name?: string;
    limits?: {
      currentDailyCost?: number;
      currentTotalCost?: number;
      currentWindowRequests?: number;
    };
    usage?: {
      total?: {
        cost?: number;
        formattedCost?: string;
        requests?: number;
      };
    };
  };
}

interface FullQuotaResponse {
  plan?: {
    daily_cost_limit?: number;
    weekly_cost_limit?: number;
    total_cost_limit?: number;
    window_cost_limit?: number;
    window_minutes?: number;
  };
  usage?: {
    dailyCost?: number;
    weeklyCost?: number;
    windowCost?: number;
  };
}

function makeSlot(used: number, limit: number, windowMinutes?: number): QuotaSlot | undefined {
  if (limit <= 0) return undefined;
  const usedPct = Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
  return { usedPct, costUsed: used, costLimit: limit, ...(windowMinutes ? { windowMinutes } : {}) };
}

/** 没有限额时也能展示"已花费"——usedPct=0 但 costUsed 真实
 * 注意：0 也要显示（"今日 $0.00"），只在拿到 NaN/负数等无效值时才返回 undefined */
function makeSpentSlot(used: number, windowMinutes?: number): QuotaSlot | undefined {
  if (!Number.isFinite(used) || used < 0) return undefined;
  return { usedPct: 0, costUsed: used, ...(windowMinutes ? { windowMinutes } : {}) };
}

async function tryFullQuota(apiId: string): Promise<OfficialQuota | null> {
  try {
    const res = await fetch(`${PROXY_BASE_URL}/apiStats/api/user-quota`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiId }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json: FullQuotaResponse = await res.json();
    if (!json.plan || !json.usage) return null;
    return {
      provider: "tako",
      status: "ok",
      primary: makeSlot(json.usage.windowCost ?? 0, json.plan.window_cost_limit ?? 0, json.plan.window_minutes),
      daily: makeSlot(json.usage.dailyCost ?? 0, json.plan.daily_cost_limit ?? 0),
      secondary: makeSlot(json.usage.weeklyCost ?? 0, json.plan.weekly_cost_limit ?? 0),
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function fetchTakoQuotaByApiId(apiId: string): Promise<OfficialQuota> {
  const fetchedAt = Date.now();
  const base: OfficialQuota = { provider: "tako", status: "error", fetchedAt };

  if (!apiId) {
    return { ...base, hint: "缺少 apiId，请重新配置 Tako Key", error: "missing_api_id" };
  }

  // 优先尝试带限额的完整端点
  const full = await tryFullQuota(apiId);
  if (full) return full;

  // 回落到 RS-compat（只有今日已花费）
  try {
    const res = await fetch(`${PROXY_BASE_URL}/apiStats/api/user-stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiId }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ...base, hint: "Tako 用量接口不可用", error: `http_${res.status}` };
    }
    const json: RsCompatStatsResponse = await res.json();
    const data = json?.data;
    if (!json?.success || !data) {
      return { ...base, hint: "Tako 用量数据格式异常", error: "bad_payload" };
    }

    const dailyCost = data.limits?.currentDailyCost ?? data.usage?.total?.cost ?? 0;
    return {
      provider: "tako",
      status: "ok",
      daily: makeSpentSlot(dailyCost),
      fetchedAt,
    };
  } catch (e) {
    return { ...base, hint: "Tako 用量接口请求失败", error: String((e as Error).message ?? e) };
  }
}

export async function fetchTakoQuota(_provider: Provider): Promise<OfficialQuota> {
  const apiId = await getApiId();
  return fetchTakoQuotaByApiId(apiId);
}
