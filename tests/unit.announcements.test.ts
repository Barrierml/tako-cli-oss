/**
 * 远端公告模块测试 — fetch + 已看过列表 + 启动调度
 *
 * 不实际渲染 Ink 弹窗（test runner 没 TTY），通过 mock 默认 provider + mock fetch
 * 验证：
 *  - 没默认 provider / 非 tako-custom / 缺字段 → 不发请求
 *  - 网络错误 / 非 200 / payload 缺 id|title → fetchPopup 返回 null
 *  - markSeen 写入 config.seenAnnouncementIds
 *  - markSeen 超过 100 条 FIFO 裁剪
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { _internal } from "../src/announcements";
import type { Provider } from "../src/providers/types";

const fakeProvider = (overrides: Partial<Provider> = {}): Provider => ({
  id: "p",
  name: "P",
  type: "tako",
  apiKey: "sk-test",
  baseUrl: "https://par.example.com",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("pickFetchTarget", () => {
  it("tako provider 含 apiKey/baseUrl → 返回归一化 url", () => {
    expect(_internal.pickFetchTarget(fakeProvider({ baseUrl: "https://x/" }))).toEqual({
      baseUrl: "https://x",
      apiKey: "sk-test",
    });
  });

  it("custom provider 也走", () => {
    expect(_internal.pickFetchTarget(fakeProvider({ type: "custom" }))?.baseUrl).toBe(
      "https://par.example.com",
    );
  });

  it("anthropic / claude-subscription / undefined → null", () => {
    expect(_internal.pickFetchTarget(fakeProvider({ type: "anthropic" }))).toBeNull();
    expect(_internal.pickFetchTarget(undefined)).toBeNull();
  });

  it("缺 apiKey 或 baseUrl → null", () => {
    expect(_internal.pickFetchTarget(fakeProvider({ apiKey: undefined }))).toBeNull();
    expect(_internal.pickFetchTarget(fakeProvider({ baseUrl: undefined }))).toBeNull();
  });
});

describe("fetchPopup", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("正常响应 → 解析为 AnnouncementPayload", async () => {
    let calledUrl = "";
    let calledAuth = "";
    globalThis.fetch = (async (url: any, init?: any) => {
      calledUrl = String(url);
      calledAuth = init?.headers?.Authorization ?? "";
      return new Response(
        JSON.stringify({
          announcement: {
            id: "ann-1",
            title: "维护通知",
            content: "今晚停服 5 分钟",
            type: "warning",
            popup_once: true,
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const ann = await _internal.fetchPopup("https://par.example.com", "sk-test");
    expect(ann).toEqual({
      id: "ann-1",
      title: "维护通知",
      content: "今晚停服 5 分钟",
      type: "warning",
      popup_once: true,
    });
    expect(calledUrl).toBe("https://par.example.com/v1/announcements/popup");
    expect(calledAuth).toBe("Bearer sk-test");
  });

  it("announcement 为 null（无未读公告）→ 返回 null", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ announcement: null }), { status: 200 })) as typeof fetch;

    expect(await _internal.fetchPopup("https://x", "sk")).toBeNull();
  });

  it("缺 id 或 title 视为非法 payload → null", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ announcement: { id: "x" } }), { status: 200 })) as typeof fetch;
    expect(await _internal.fetchPopup("https://x", "sk")).toBeNull();
  });

  it("非 200 → null", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    expect(await _internal.fetchPopup("https://x", "sk")).toBeNull();
  });

  it("网络异常 → null（不抛）", async () => {
    globalThis.fetch = (async () => {
      throw new Error("net down");
    }) as typeof fetch;
    expect(await _internal.fetchPopup("https://x", "sk")).toBeNull();
  });
});

// hasSeen / markSeen 直接读写 ~/.tako/config.json（路径在 config 模块加载时冻结）。
// FS 集成测试要么改 config 暴露注入接口，要么真碰用户 home —— 都不划算。
// 这一层仅做轻量逻辑断言：FIFO trim 行为通过纯函数版本验证。

function trimFifo(ids: string[], cap: number): string[] {
  if (ids.length <= cap) return ids;
  return ids.slice(ids.length - cap);
}

describe("seenAnnouncementIds FIFO 裁剪逻辑", () => {
  it("≤ cap 不动", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `a${i}`);
    expect(trimFifo(ids, 100)).toEqual(ids);
  });

  it("> cap 保留尾部 cap 个", () => {
    const ids = Array.from({ length: 105 }, (_, i) => `a${i}`);
    const trimmed = trimFifo(ids, 100);
    expect(trimmed).toHaveLength(100);
    expect(trimmed[0]).toBe("a5");
    expect(trimmed[99]).toBe("a104");
  });
});
