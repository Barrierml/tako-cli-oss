#!/usr/bin/env bun
/**
 * 重新生成 src/models/bundled.ts。
 *
 * 用法：bun scripts/build-models-bundle.ts
 *
 * 行为：
 *   1. 拉取 https://models.dev/api.json
 *   2. 只保留 CANONICAL 提供商，按 model id 去重（先到者赢）
 *   3. 写入 src/models/bundled.ts
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseModelsDev } from "../src/models/source";
import type { ModelEntry } from "../src/models/types";

const CANONICAL = [
  "anthropic",
  "openai",
  "google",
  "google-vertex-anthropic",
  "xai",
  "deepseek",
  "moonshotai",
  "mistral",
  "alibaba",
  "meta",
  "cohere",
  "amazon-bedrock",
  "azure",
];

const OUT_PATH = resolve(import.meta.dir, "../src/models/bundled.ts");

async function main() {
  const res = await fetch("https://models.dev/api.json");
  if (!res.ok) throw new Error(`models.dev http ${res.status}`);
  const json = await res.json();

  const allEntries = parseModelsDev(json);
  const wanted = new Set(CANONICAL);
  const seen = new Set<string>();
  const entries: ModelEntry[] = [];

  // 先按 CANONICAL 顺序遍历（保证 id 冲突时优先官方提供商）
  for (const prov of CANONICAL) {
    for (const e of allEntries) {
      if (e.provider !== prov) continue;
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      entries.push(e);
    }
  }

  const ts = new Date().toISOString();
  const lines: string[] = [
    "/**",
    " * 自动生成 — 请勿手改",
    " * 来源：models.dev (https://models.dev/api.json)",
    ` * 生成时间：${ts}`,
    ` * 模型数量：${entries.length}`,
    " * 重新生成：bun scripts/build-models-bundle.ts",
    " */",
    'import type { ModelEntry } from "./types";',
    "",
    `export const BUNDLED_AT = ${JSON.stringify(ts)};`,
    "",
    "export const BUNDLED_ENTRIES: ModelEntry[] = [",
  ];
  for (const e of entries) {
    const parts = [
      `id: ${JSON.stringify(e.id)}`,
      `displayName: ${JSON.stringify(e.displayName)}`,
      `provider: ${JSON.stringify(e.provider)}`,
      `contextWindow: ${e.contextWindow}`,
    ];
    if (typeof e.outputLimit === "number") parts.push(`outputLimit: ${e.outputLimit}`);
    lines.push(`  { ${parts.join(", ")} },`);
  }
  lines.push("];");
  lines.push("");

  await writeFile(OUT_PATH, lines.join("\n"), "utf-8");
  console.log(`✓ wrote ${entries.length} entries → ${OUT_PATH}`);
  // 提示：CANONICAL 中实际命中的 provider 数
  const hit = new Set(entries.map((e) => e.provider));
  console.log(`  providers: ${[...hit].sort().join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
