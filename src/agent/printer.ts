/**
 * 归一帧 → stdout 渲染
 *
 * 输出模式：
 *   "human"   — 给人/LLM 看，简洁版（默认）。砍掉 timestamp / turnId / itemId / processId 等
 *               纯调度噪音，只留命令本体 + 工具结果首行 + 助手文本 + turn 边界
 *   "json"    — 每帧一行精简后 NDJSON，给 LLM 解析或管道下游
 *   "verbose" — 全量人类可读，含 timestamp / turnId / 完整 JSON
 *
 * Token 节省（demo 数据）：human ~80%、json ~70%（vs verbose）
 */

import type { NormalizedFrame } from "./types";

export type PrintMode = "human" | "json" | "verbose";

export function printFrame(f: NormalizedFrame, mode: PrintMode = "human"): void {
  if (mode === "json") {
    process.stdout.write(JSON.stringify(toLeanFrame(f)) + "\n");
    return;
  }
  if (mode === "verbose") {
    const ts = new Date(f.ts).toISOString().slice(11, 23);
    printVerbose(f, ts);
    return;
  }
  printHuman(f);
}

function printHuman(f: NormalizedFrame): void {
  switch (f.kind) {
    case "session_started":
      // 起 session 输出已在 cmdStart 给出
      break;
    case "turn_started":
      // turn 边界用 turn_completed 收尾
      break;
    case "text_delta":
      process.stdout.write(f.text);
      break;
    case "reasoning_delta":
      // 默认不打（噪音）
      break;
    case "tool_use": {
      const cmd = extractShellCommand(f.input) ?? truncate(JSON.stringify(f.input), 240);
      console.log(`\n$ ${cmd}`);
      break;
    }
    case "tool_result": {
      const summary = summarizeToolResult(f.output);
      if (summary) console.log(`  ${summary}`);
      break;
    }
    case "approval_required":
      console.log(`\n⚠ APPROVAL [${f.approvalType}] id=${f.approvalId}`);
      console.log(`  ${describeApproval(f.approvalType, f.params)}`);
      break;
    case "turn_completed":
      console.log(`\n◀ turn done${f.stopReason && f.stopReason !== "end_turn" ? ` (${f.stopReason})` : ""}`);
      break;
    case "error":
      console.log(`\n✗ ${f.message}`);
      break;
    case "session_closed":
      // 一般不展示
      break;
  }
}

function printVerbose(f: NormalizedFrame, ts: string): void {
  switch (f.kind) {
    case "session_started":
      console.log(`[${ts}] ▶ session_started ${f.backend}${f.model ? ` model=${f.model}` : ""}`);
      break;
    case "turn_started":
      console.log(`[${ts}] ▶ turn_started ${f.turnId}`);
      break;
    case "text_delta":
      process.stdout.write(f.text);
      break;
    case "reasoning_delta":
      console.log(`\n[${ts}] 💭 ${truncate(f.text, 240)}`);
      break;
    case "tool_use":
      console.log(`\n[${ts}] 🔧 ${f.name} ${truncate(JSON.stringify(f.input), 240)}${f.itemId ? ` id=${f.itemId}` : ""}`);
      break;
    case "tool_result":
      console.log(`[${ts}] ✓ ${truncate(JSON.stringify(f.output), 240)}`);
      break;
    case "approval_required":
      console.log(`[${ts}] ⚠ approval_required (${f.approvalType}) id=${f.approvalId} ${truncate(JSON.stringify(f.params), 240)}`);
      break;
    case "turn_completed":
      console.log(`\n[${ts}] ◀ turn_completed${f.stopReason ? ` (${f.stopReason})` : ""}${f.usage ? ` usage=${truncate(JSON.stringify(f.usage), 200)}` : ""}`);
      break;
    case "error":
      console.log(`\n[${ts}] ✗ ${f.message}`);
      break;
    case "session_closed":
      console.log(`[${ts}] ⏹ session_closed`);
      break;
  }
}

/**
 * 给 --json 模式做最小化版的帧。
 * 砍掉对 LLM 决策无意义的字段：threadId / turnId / itemId / processId / source /
 * commandActions / availableDecisions 等纯调度元数据。
 */
export function toLeanFrame(f: NormalizedFrame): unknown {
  const base: any = { kind: f.kind, ts: f.ts };
  switch (f.kind) {
    case "session_started":
      base.backend = f.backend;
      if (f.model) base.model = f.model;
      base.sid = f.sid;
      return base;
    case "turn_started":
      return base;
    case "text_delta":
      base.text = f.text;
      return base;
    case "reasoning_delta":
      base.text = f.text;
      return base;
    case "tool_use": {
      base.tool = f.name;
      const cmd = extractShellCommand(f.input);
      base.input = cmd ? { command: cmd } : f.input;
      return base;
    }
    case "tool_result":
      base.summary = summarizeToolResult(f.output) ?? "";
      return base;
    case "approval_required":
      base.approvalId = f.approvalId;
      base.approvalType = f.approvalType;
      base.detail = describeApproval(f.approvalType, f.params);
      return base;
    case "turn_completed":
      if (f.stopReason && f.stopReason !== "end_turn") base.stopReason = f.stopReason;
      return base;
    case "error":
      base.message = f.message;
      return base;
    case "session_closed":
      return base;
  }
}

/** 从 tool_use.input 抠 shell command（codex/claude Bash 都用 input.command） */
export function extractShellCommand(input: any): string | null {
  if (!input || typeof input !== "object") return null;
  const cmd = input.command ?? input.cmd;
  if (typeof cmd !== "string") return null;
  // /bin/zsh -lc "X" → X
  const m = cmd.match(/^(?:\S*sh|\S*bash|\S*zsh)(?:\s+-\w+)*\s+["'](.*)["']\s*$/s);
  return m ? m[1] : cmd;
}

/**
 * tool_result.output 各家形态不一，提炼一句话摘要。
 * 优先级：
 *   1. 我们自己塞的 approval audit ({approval, reason, by})
 *   2. codex commandExecution 完成态 (stdout / exit_code)
 *   3. 字符串 → 截断
 *   4. 其他 → JSON 截断
 */
export function summarizeToolResult(output: any): string | null {
  if (!output) return null;
  if (typeof output === "string") return truncate(output, 160);
  if (typeof output !== "object") return String(output);

  // 我们的 approval audit
  if ((output as any).approval) {
    const a = (output as any).approval;
    const reason = (output as any).reason ? `: ${(output as any).reason}` : "";
    const by = (output as any).by ? ` by ${(output as any).by}` : "";
    return `[${a}]${reason}${by}`;
  }

  // codex commandExecution 完成态
  const stdout = (output as any).stdout ?? (output as any).output;
  const exitCode = (output as any).exit_code ?? (output as any).exitCode;
  if (typeof stdout === "string" || typeof exitCode === "number") {
    const firstLine = typeof stdout === "string" ? stdout.split("\n").find((s) => s.trim()) ?? "" : "";
    const head = firstLine.length <= 120 ? firstLine : firstLine.slice(0, 120) + "…";
    const lines = typeof stdout === "string" ? stdout.split("\n").filter(Boolean).length : 0;
    const codePart = typeof exitCode === "number" ? ` (exit ${exitCode})` : "";
    const linesPart = lines > 1 ? ` [+${lines - 1} more lines]` : "";
    return `${head}${linesPart}${codePart}`;
  }

  return truncate(JSON.stringify(output), 160);
}

/** 把 approval params 提炼成给 LLM/人看的一句话 */
export function describeApproval(type: string, params: any): string {
  if (type === "exec") {
    const cmd = String((params as any)?.command ?? "");
    const cwd = (params as any)?.cwd;
    const inner = cmd.match(/^(?:\S*sh|\S*bash|\S*zsh)(?:\s+-\w+)*\s+["'](.*)["']\s*$/s);
    const stripped = inner ? inner[1] : cmd;
    return `command=${truncate(stripped, 200)}${cwd ? `   cwd=${cwd}` : ""}`;
  }
  if (type === "patch") {
    const paths: string[] = [];
    if (Array.isArray((params as any)?.changes)) {
      for (const c of (params as any).changes) if (c?.path) paths.push(c.path);
    }
    if ((params as any)?.path) paths.push((params as any).path);
    return paths.length
      ? `paths=${paths.slice(0, 5).join(", ")}${paths.length > 5 ? ` (+${paths.length - 5})` : ""}`
      : truncate(JSON.stringify(params), 200);
  }
  return truncate(JSON.stringify(params), 200);
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `…(+${s.length - n})`;
}
