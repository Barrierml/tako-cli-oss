import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseModelsDev } from "../src/models/source";
import { normalizeModelId } from "../src/models/catalog";
import { BUNDLED_ENTRIES } from "../src/models/bundled";

// ─── normalize ──────────────────────────────────────────────────────

describe("TP-MODELS-01/02/03/04 normalizeModelId", () => {
  it("[1m] 后缀", () => {
    expect(normalizeModelId("claude-sonnet-4-5[1m]")).toEqual({
      lookupId: "claude-sonnet-4-5",
      is1m: true,
    });
  });
  it(":1m 后缀", () => {
    expect(normalizeModelId("claude-sonnet-4-5:1m")).toEqual({
      lookupId: "claude-sonnet-4-5",
      is1m: true,
    });
  });
  it("provider 前缀", () => {
    expect(normalizeModelId("anthropic/claude-sonnet-4-5")).toEqual({
      lookupId: "claude-sonnet-4-5",
      is1m: false,
    });
  });
  it("前缀 + 后缀", () => {
    expect(normalizeModelId("anthropic/claude-sonnet-4-5[1m]")).toEqual({
      lookupId: "claude-sonnet-4-5",
      is1m: true,
    });
  });
  it("无前缀无后缀", () => {
    expect(normalizeModelId("gpt-5.5")).toEqual({
      lookupId: "gpt-5.5",
      is1m: false,
    });
  });
});

// ─── source 解析 ────────────────────────────────────────────────────

describe("TP-MODELS-08 parseModelsDev", () => {
  it("展平嵌套结构 + 跳过缺 context 的条目", () => {
    const entries = parseModelsDev({
      anthropic: {
        id: "anthropic",
        name: "Anthropic",
        models: {
          "claude-haiku-4-5": {
            id: "claude-haiku-4-5",
            name: "claude-haiku-4-5",
            limit: { context: 200000, output: 64000 },
          },
          "broken": { id: "broken", name: "broken" }, // no limit -> skip
        },
      },
      openai: {
        id: "openai",
        name: "OpenAI",
        models: {
          "gpt-5": { id: "gpt-5", name: "gpt-5", limit: { context: 400000 } },
        },
      },
      empty: { id: "empty", name: "Empty" }, // no models -> skip
    } as any);
    expect(entries).toHaveLength(2);
    const claude = entries.find((e) => e.id === "claude-haiku-4-5");
    expect(claude?.provider).toBe("anthropic");
    expect(claude?.contextWindow).toBe(200000);
    expect(claude?.outputLimit).toBe(64000);
    const gpt = entries.find((e) => e.id === "gpt-5");
    expect(gpt?.provider).toBe("openai");
    expect(gpt?.outputLimit).toBeUndefined();
  });
});

// ─── catalog (使用隔离的 HOME 目录避免污染真实 ~/.tako) ──────────────

describe("TP-MODELS-05/06/07 getModelEntry / loadCatalog / refreshCatalog", () => {
  let tmpDir: string;
  let cacheFile: string;
  let originalFetch: typeof fetch;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "tako-models-"));
    cacheFile = join(tmpDir, "models-cache.json");
    const mod = await import("../src/models/catalog");
    mod._setCachePathForTest(cacheFile);
    originalFetch = globalThis.fetch;
  });

  afterEach(async () => {
    const mod = await import("../src/models/catalog");
    mod._setCachePathForTest(null);
    globalThis.fetch = originalFetch;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("TP-MODELS-05/06/07: bundled fallback + 1M 覆盖 + 未命中", async () => {
    const mod = await import("../src/models/catalog");
    mod._resetCatalog();
    mod.loadCatalog();

    // bundled 至少有 claude-haiku-4-5（来自 anthropic）
    const haiku = mod.getModelEntry("claude-haiku-4-5");
    expect(haiku?.provider).toBe("anthropic");
    expect(haiku?.contextWindow).toBe(200000);

    // 1M 后缀覆盖
    const haiku1m = mod.getModelEntry("claude-haiku-4-5[1m]");
    expect(haiku1m?.contextWindow).toBe(1_000_000);

    // 未命中 → undefined
    expect(mod.getModelEntry("totally-fake-model-12345")).toBeUndefined();
  });

  it("TP-MODELS-09/10: refreshCatalog 写磁盘 + loadCatalog 读磁盘", async () => {
    const mod = await import("../src/models/catalog");
    mod._resetCatalog();

    const fakeJson = {
      fakeprov: {
        id: "fakeprov",
        name: "Fake",
        models: {
          "test-model-x": { id: "test-model-x", name: "Test X", limit: { context: 333333 } },
        },
      },
    };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(fakeJson), { status: 200 })) as typeof fetch;

    await mod.refreshCatalog();

    // 内存已更新
    expect(mod.getModelEntry("test-model-x")?.contextWindow).toBe(333333);

    // 磁盘已写入
    expect(existsSync(cacheFile)).toBe(true);

    // 重置内存，loadCatalog() 应从磁盘恢复
    mod._resetCatalog();
    mod.loadCatalog();
    expect(mod.getModelEntry("test-model-x")?.contextWindow).toBe(333333);
  });

  it("TP-MODELS-11: 磁盘缓存过期 → 回落 bundled", async () => {
    // 写入 25h 前的缓存
    writeFileSync(
      cacheFile,
      JSON.stringify({
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
        entries: [
          {
            id: "stale-only",
            displayName: "Stale",
            provider: "x",
            contextWindow: 99,
          },
        ],
      })
    );

    const mod = await import("../src/models/catalog");
    mod._resetCatalog();
    mod.loadCatalog();

    // 过期缓存被忽略，应该是 bundled 快照
    expect(mod.getModelEntry("stale-only")).toBeUndefined();
    expect(mod.getModelEntry("claude-haiku-4-5")?.contextWindow).toBe(200000);
  });

  it("TP-MODELS-12: refreshCatalog 网络失败不抛错", async () => {
    const mod = await import("../src/models/catalog");
    mod._resetCatalog();
    mod.loadCatalog();
    const before = mod.getModelEntry("claude-haiku-4-5");

    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    await mod.refreshCatalog(); // 不应抛错
    // 内存数据保留
    expect(mod.getModelEntry("claude-haiku-4-5")).toEqual(before!);
  });
});

// ─── BUNDLED 完整性 ────────────────────────────────────────────────

describe("BUNDLED_ENTRIES sanity", () => {
  it("快照非空且包含主流 Claude 模型", () => {
    expect(BUNDLED_ENTRIES.length).toBeGreaterThan(50);
    const ids = new Set(BUNDLED_ENTRIES.map((e) => e.id));
    expect(ids.has("claude-haiku-4-5")).toBe(true);
  });
});
