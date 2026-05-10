/**
 * 单个 agent session 的详情/监控/发送视图
 *
 * 显示：
 *   - 顶部 header（meta 摘要）
 *   - 中间 滚动日志（实时 tail log.ndjson）
 *   - 底部 输入框 + 当前 status
 *
 * 操作：
 *   输入文本 + Enter   → send 一轮
 *   Ctrl-C 或 ESC     → 中止当前 turn 并返回（不关 session）
 *   Ctrl-D 或 q（空输入时）  → 返回列表
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { detectLocale } from "../../../i18n";
import {
  cancelSession,
  sendToSession,
  showSession,
} from "../../../agent/manager";
import {
  logPath,
  listPendingApprovals,
  writeApprovalResponse,
  type ApprovalRequest,
} from "../../../agent/storage";
import type { NormalizedFrame, SessionMeta } from "../../../agent/types";

const POLL_MS = 300;
const MAX_FRAMES = 200;

function fmtAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function frameLine(f: NormalizedFrame, zh: boolean): { color?: string; text: string; dim?: boolean } {
  const ts = new Date(f.ts).toISOString().slice(11, 19);
  switch (f.kind) {
    case "session_started":
      return { dim: true, text: `[${ts}] ▶ session_started ${f.backend}${f.model ? ` model=${f.model}` : ""}` };
    case "turn_started":
      return { color: "cyan", text: `[${ts}] ▶ turn_started ${f.turnId ?? "?"}` };
    case "text_delta":
      return { text: f.text };
    case "reasoning_delta":
      return { dim: true, text: `[${ts}] 💭 ${truncate(f.text, 200)}` };
    case "tool_use":
      return { color: "yellow", text: `[${ts}] 🔧 ${f.name} ${truncate(JSON.stringify(f.input), 160)}` };
    case "tool_result":
      return { color: "green", text: `[${ts}] ✓ result ${truncate(JSON.stringify(f.output), 160)}` };
    case "approval_required":
      return { color: "magenta", text: `[${ts}] ⚠ approval(${f.approvalType}) ${truncate(JSON.stringify(f.params), 160)}` };
    case "turn_completed":
      return { color: "cyan", text: `[${ts}] ◀ turn_completed${f.stopReason ? ` (${f.stopReason})` : ""}` };
    case "error":
      return { color: "red", text: `[${ts}] ✗ ${f.message}` };
    case "session_closed":
      return { dim: true, text: `[${ts}] ⏹ closed` };
    default:
      return { text: JSON.stringify(f) };
  }
}

function truncate(s: string, n: number): string {
  if (!s || s.length <= n) return s ?? "";
  return s.slice(0, n) + `…(+${s.length - n})`;
}

export function AgentDetailView({ sid, onBack }: { sid: string; onBack: () => void }) {
  const zh = detectLocale() === "zh";
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [frames, setFrames] = useState<NormalizedFrame[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"idle" | "sending" | "cancelling">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const posRef = useRef(0);
  const { stdin, setRawMode } = useStdin();

  // 初次拉 meta + 整段 log
  const refreshMeta = useCallback(async () => {
    const data = await showSession(sid, MAX_FRAMES);
    if (!data) return;
    setMeta(data.meta);
    setFrames(data.log);
    // 初始化 pos 到当前 log 文件末尾
    try {
      const fs = await import("node:fs/promises");
      const stat = await fs.stat(logPath(sid));
      posRef.current = stat.size;
    } catch {
      posRef.current = 0;
    }
  }, [sid]);

  useEffect(() => { void refreshMeta(); }, [refreshMeta]);

  // 轮询 tail
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (stopped) return;
      try {
        const fs = await import("node:fs/promises");
        const stat = await fs.stat(logPath(sid));
        if (stat.size > posRef.current) {
          const fd = await fs.open(logPath(sid), "r");
          const buf = Buffer.alloc(stat.size - posRef.current);
          await fd.read(buf, 0, buf.length, posRef.current);
          await fd.close();
          posRef.current = stat.size;
          const newFrames: NormalizedFrame[] = [];
          for (const line of buf.toString("utf-8").split("\n")) {
            if (!line.trim()) continue;
            try { newFrames.push(JSON.parse(line) as NormalizedFrame); } catch { /* skip */ }
          }
          if (newFrames.length) {
            setFrames((prev) => {
              const merged = [...prev, ...newFrames];
              return merged.slice(-MAX_FRAMES);
            });
          }
        }
        // meta 也可能被另一进程改了，每 ~3s 拉一次
        if (Math.random() < 0.1) {
          const data = await showSession(sid, 0);
          if (data) setMeta(data.meta);
        }
        // 拉 pending approvals（开销小：仅扫小目录）
        const pend = await listPendingApprovals(sid);
        setPending(pend);
      } catch { /* file 暂时不可读 */ }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [sid]);

  // 提交
  const submit = useCallback(async () => {
    if (busy !== "idle" || !input.trim()) return;
    const prompt = input;
    setInput("");
    setError(null);
    setBusy("sending");
    try {
      await sendToSession(sid, prompt, {
        onFrame: () => {
          // 不直接 push 这里 — tail 轮询会接到，避免重复
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("idle");
      // 拉一次 meta 把 turnCount/status 同步过来
      const data = await showSession(sid, 0);
      if (data) setMeta(data.meta);
    }
  }, [sid, input, busy]);

  const doCancel = useCallback(async () => {
    if (busy !== "sending") return onBack();
    setBusy("cancelling");
    await cancelSession(sid).catch(() => {});
  }, [busy, sid, onBack]);

  // 输入：useInput 处理 esc/return/退格/单字符；raw stdin 兜住粘贴的多字符
  useEffect(() => {
    if (!stdin) return;
    setRawMode(true);
    const handler = (data: Buffer) => {
      const str = data.toString();
      if (str.length > 1 && !str.startsWith("\x1b")) {
        setInput((p) => p + str.replace(/[\r\n]/g, ""));
      }
    };
    stdin.on("data", handler);
    return () => { stdin.off("data", handler); };
  }, [stdin, setRawMode]);

  // Approval hotkeys：Ctrl-Y allow / Ctrl-N deny 最早一个 pending
  const approveTopmost = useCallback(async (allow: boolean) => {
    const top = pending[0];
    if (!top) return;
    await writeApprovalResponse(sid, top.approvalId, {
      decision: allow ? "allow" : "deny",
      by: "tui",
      decidedAt: Date.now(),
    });
    // 立刻从本地 state 移掉，让 UI 立即响应；下一轮 tail 会再 sync
    setPending((p) => p.filter((x) => x.approvalId !== top.approvalId));
  }, [pending, sid]);

  useInput((ch, key) => {
    // 优先：approval hotkeys（任何时候都能用，不被 input 抢）
    if (key.ctrl && ch === "y") { void approveTopmost(true); return; }
    if (key.ctrl && ch === "n") { void approveTopmost(false); return; }
    if (key.escape) { void doCancel(); return; }
    if (key.ctrl && ch === "c") { void doCancel(); return; }
    if (key.ctrl && ch === "d") { onBack(); return; }
    if (key.return) { void submit(); return; }
    if (key.backspace || key.delete) { setInput((p) => p.slice(0, -1)); return; }
    if (input.length === 0 && ch === "q") { onBack(); return; }
    if (ch && !key.ctrl && ch.length === 1) { setInput((p) => p + ch); }
  });

  if (!meta) {
    return <Box paddingX={2} paddingY={1}><Text dimColor>{zh ? "加载中..." : "loading..."}</Text></Box>;
  }

  const headerLine = `${meta.backend} · ${meta.model ?? "-"} · status=${meta.status} · turns=${meta.turnCount} · last ${fmtAge(Date.now() - meta.lastActiveAt)}`;
  const sidShort = meta.sid.slice(0, 8);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box>
        <Text bold>{zh ? "Session" : "Session"} </Text>
        <Text color="cyan">{sidShort}</Text>
        <Text>  </Text>
        <Text dimColor>{meta.name}</Text>
      </Box>
      <Box>
        <Text dimColor>{headerLine}</Text>
      </Box>
      <Box>
        <Text dimColor>{zh ? "工作目录：" : "cwd: "}{meta.workdir}</Text>
      </Box>

      {/* Pending approvals 横幅 */}
      {pending.length > 0 && (
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
          <Text color="magenta" bold>
            ⚠ {pending.length} {zh ? "个待审批" : "pending approval(s)"} —
            <Text bold> Ctrl-Y</Text> {zh ? "批准" : "allow"} /
            <Text bold> Ctrl-N</Text> {zh ? "拒绝" : "deny"} {zh ? "最早一个" : "topmost"}
          </Text>
          {pending.slice(0, 3).map((r, i) => (
            <Text key={r.approvalId} color={i === 0 ? "magenta" : undefined} dimColor={i !== 0}>
              {i === 0 ? "▶ " : "  "}[{r.approvalType}] {r.approvalId.slice(0, 12)}: {truncate(JSON.stringify(r.params), 120)}
            </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        {frames.length === 0 ? (
          <Text dimColor>{zh ? "（暂无日志，发条消息试试）" : "(no log yet — send something)"}</Text>
        ) : (
          frames.slice(-30).map((f, i) => {
            const line = frameLine(f, zh);
            return (
              <Text key={i} color={line.color} dimColor={line.dim}>
                {line.text || " "}
              </Text>
            );
          })
        )}
      </Box>

      {error && (
        <Box marginTop={1}><Text color="red">✗ {error}</Text></Box>
      )}

      <Box marginTop={1}>
        <Text color="cyan" bold>{busy === "sending" ? "⏳ " : busy === "cancelling" ? "✋ " : "▶ "}</Text>
        <Text>{input}</Text>
        {busy === "idle" && <Text inverse> </Text>}
        {busy === "sending" && <Text dimColor>  ({zh ? "正在发送…ESC 取消" : "sending… ESC to cancel"})</Text>}
      </Box>

      <Box marginTop={1} gap={2}>
        <Text dimColor bold>Enter</Text><Text dimColor>{zh ? "发送" : "send"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>^Y/^N</Text><Text dimColor>{zh ? "批/拒最早审批" : "allow/deny topmost approval"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>ESC/^C</Text><Text dimColor>{zh ? "取消/返回" : "cancel/back"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>q</Text><Text dimColor>{zh ? "返回（空输入）" : "back (empty input)"}</Text>
      </Box>
    </Box>
  );
}
