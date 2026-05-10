/**
 * Claude Code 1M context beta 后缀（[1m]）自动追加规则测试
 *
 * 背景：Claude Code 通过 model id 末尾的 `[1m]` 触发 1M context；不带后缀
 * 即便模型本身支持 1M 也会被按 ~200k 处理 → 自动压缩。launcher 必须替用户
 * 自动加上，避免每次手填。
 *
 * 规则（claude-code.ts:appendOneMTagIfNeeded）：
 *  - claude-*、deepseek-*、kimi-* 系列
 *  - 仅 bundled catalog 标 contextWindow >= 1_000_000 的
 *  - 已带 [1m] / :1m 不重复加
 *  - 其他原样返回
 */
import { describe, it, expect } from "bun:test";
import { appendOneMTagIfNeeded, claudeCodeClient } from "../src/clients/claude-code";
import { getClient, getClientLaunchOptions } from "../src/clients/base";
import type { Provider } from "../src/providers/types";

import "../src/clients";

const fakeProvider = (overrides: Partial<Provider> = {}): Provider => ({
  id: "p",
  name: "P",
  type: "tako",
  apiKey: "sk",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("appendOneMTagIfNeeded", () => {
  it("claude-opus-4-7（catalog 1M）→ 加 [1m]", () => {
    expect(appendOneMTagIfNeeded("claude-opus-4-7")).toBe("claude-opus-4-7[1m]");
  });

  it("claude-sonnet-4-6（catalog 1M）→ 加 [1m]", () => {
    expect(appendOneMTagIfNeeded("claude-sonnet-4-6")).toBe("claude-sonnet-4-6[1m]");
  });

  it("claude-opus-4-6（catalog 1M）→ 加 [1m]", () => {
    expect(appendOneMTagIfNeeded("claude-opus-4-6")).toBe("claude-opus-4-6[1m]");
  });

  it("claude-sonnet-4-5（catalog 200k）→ 不加", () => {
    // bundled 里 claude-sonnet-4-5 是 200k native（1M 走 [1m] 变体走规则覆盖）
    expect(appendOneMTagIfNeeded("claude-sonnet-4-5")).toBe("claude-sonnet-4-5");
  });

  it("已带 [1m] 后缀 → 不重复加", () => {
    expect(appendOneMTagIfNeeded("claude-opus-4-7[1m]")).toBe("claude-opus-4-7[1m]");
  });

  it("已带 :1m 后缀 → 不再加 [1m]", () => {
    expect(appendOneMTagIfNeeded("claude-opus-4-7:1m")).toBe("claude-opus-4-7:1m");
  });

  it("deepseek-* 1M 模型 → 加 [1m]", () => {
    expect(appendOneMTagIfNeeded("deepseek-v4-flash")).toBe("deepseek-v4-flash[1m]");
  });

  it("kimi-* 非 1M 模型 → 不加", () => {
    expect(appendOneMTagIfNeeded("kimi-k2.5")).toBe("kimi-k2.5");
  });

  it("非 claude/deepseek/kimi 模型 → 原样返回（即便 catalog 1M）", () => {
    expect(appendOneMTagIfNeeded("qwen-plus")).toBe("qwen-plus");
  });

  it("空字符串 / undefined-like → 安全返回", () => {
    expect(appendOneMTagIfNeeded("")).toBe("");
  });
});

describe("Claude Code launchOptions 自动带 [1m]", () => {
  it("Claude 系 1M 模型的 args 用带 [1m] 的 id", () => {
    const opts = getClientLaunchOptions(claudeCodeClient, fakeProvider({ type: "tako" }));
    const opus47 = opts.find((o) => o.id === "model-claude-opus-4-7");
    expect(opus47).toBeDefined();
    // option.id 保留无后缀（持久化稳定）
    expect(opus47!.id).toBe("model-claude-opus-4-7");
    // 但实际命令行参数带 [1m]
    expect(opus47!.args).toEqual(["--model", "claude-opus-4-7[1m]"]);
    expect(opus47!.flag).toBe("--model claude-opus-4-7[1m]");
  });

  it("DeepSeek provider 下也加 [1m]", () => {
    const opts = getClientLaunchOptions(claudeCodeClient, fakeProvider({ type: "deepseek" }));
    const flash = opts.find((o) => o.id === "model-deepseek-v4-flash");
    expect(flash).toBeDefined();
    expect(flash!.args).toEqual(["--model", "deepseek-v4-flash[1m]"]);
  });
});

describe("Claude Code getEnvVars 自动带 [1m]", () => {
  it("tako provider + provider.model = claude-opus-4-7 → ANTHROPIC_MODEL 带 [1m]", () => {
    const env = claudeCodeClient.getEnvVars({
      type: "tako",
      apiKey: "sk",
      baseUrl: "https://x",
      model: "claude-opus-4-7",
    });
    expect(env.ANTHROPIC_MODEL).toBe("claude-opus-4-7[1m]");
  });

  it("anthropic provider + 200k 模型 → ANTHROPIC_MODEL 不加后缀", () => {
    const env = claudeCodeClient.getEnvVars({
      type: "anthropic",
      apiKey: "sk",
      model: "claude-sonnet-4-5",
    });
    expect(env.ANTHROPIC_MODEL).toBe("claude-sonnet-4-5");
  });

  it("custom provider + claude 1M 模型 → 带 [1m]", () => {
    const env = claudeCodeClient.getEnvVars({
      type: "custom",
      apiKey: "sk",
      baseUrl: "https://my-proxy.example.com",
      model: "claude-opus-4-6",
    });
    expect(env.ANTHROPIC_MODEL).toBe("claude-opus-4-6[1m]");
  });

  it("deepseek provider + 1M 模型 → ANTHROPIC_MODEL 带 [1m]", () => {
    const env = claudeCodeClient.getEnvVars({
      type: "deepseek",
      apiKey: "sk",
      model: "deepseek-v4-flash",
    });
    expect(env.ANTHROPIC_MODEL).toBe("deepseek-v4-flash[1m]");
  });

  it("provider 没设 model → 不下发 ANTHROPIC_MODEL", () => {
    const env = claudeCodeClient.getEnvVars({
      type: "tako",
      apiKey: "sk",
      baseUrl: "https://x",
    });
    expect(env.ANTHROPIC_MODEL).toBeUndefined();
  });
});
