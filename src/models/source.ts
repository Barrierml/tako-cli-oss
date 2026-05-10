/**
 * 从 models.dev 拉取并归一化模型目录。
 */
import type { ModelEntry } from "./types";

const SOURCE_URL = "https://models.dev/api.json";

interface ModelsDevModel {
  id?: string;
  name?: string;
  limit?: { context?: number; output?: number };
}

interface ModelsDevProvider {
  id?: string;
  name?: string;
  models?: Record<string, ModelsDevModel>;
}

type ModelsDevResponse = Record<string, ModelsDevProvider>;

/**
 * 把 models.dev 的嵌套结构展平为 ModelEntry 数组。
 * 跳过缺 context 字段的条目（无意义）。
 */
export function parseModelsDev(json: ModelsDevResponse): ModelEntry[] {
  const out: ModelEntry[] = [];
  for (const [providerId, prov] of Object.entries(json)) {
    if (!prov?.models) continue;
    for (const [modelId, m] of Object.entries(prov.models)) {
      const ctx = m?.limit?.context;
      if (typeof ctx !== "number" || ctx <= 0) continue;
      out.push({
        id: modelId,
        displayName: m.name || modelId,
        provider: providerId,
        contextWindow: ctx,
        outputLimit: typeof m.limit?.output === "number" ? m.limit.output : undefined,
      });
    }
  }
  return out;
}

/**
 * 拉取 models.dev 并解析。失败抛异常，调用方处理。
 */
export async function fetchModelsDev(): Promise<ModelEntry[]> {
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`models.dev http ${res.status}`);
  const json = (await res.json()) as ModelsDevResponse;
  return parseModelsDev(json);
}
