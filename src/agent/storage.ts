/**
 * Agent session 存储层
 *
 * 全部落盘到 ~/.tako/agent-sessions/，每个 session 一个目录：
 *   <sid>/meta.json    — SessionMeta
 *   <sid>/log.ndjson   — NormalizedFrame 一行一帧追加
 *
 * 顶层 index.json 不维护 — list 用 readdir 扫，简单且不会和文件分裂。
 *
 * 多进程并发安全策略：写 meta 用临时文件 + rename，原子；写 log 是 append-only。
 * 同一 session 不允许多个进程并发 send（manager 的责任）。
 */

import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile, rename, readdir, rm, appendFile } from "node:fs/promises";
import type { SessionMeta, NormalizedFrame } from "./types";

const ROOT = join(homedir(), ".tako", "agent-sessions");

export function sessionDir(sid: string): string {
  return join(ROOT, sid);
}

export function metaPath(sid: string): string {
  return join(sessionDir(sid), "meta.json");
}

export function logPath(sid: string): string {
  return join(sessionDir(sid), "log.ndjson");
}

export function approvalsDir(sid: string): string {
  return join(sessionDir(sid), "approvals");
}
export function approvalReqPath(sid: string, approvalId: string): string {
  return join(approvalsDir(sid), `${approvalId}.req.json`);
}
export function approvalRespPath(sid: string, approvalId: string): string {
  return join(approvalsDir(sid), `${approvalId}.resp.json`);
}

async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

/**
 * 创建新 session 目录 + 写初始 meta。
 * 调用前 manager 已生成 sid。
 */
export async function initSession(meta: SessionMeta): Promise<void> {
  await ensureDir(sessionDir(meta.sid));
  await writeMeta(meta);
  // 创建空 log 文件，避免 attach 时 tail 报 no such file
  await appendFile(logPath(meta.sid), "");
}

export async function readMeta(sid: string): Promise<SessionMeta | null> {
  try {
    const text = await readFile(metaPath(sid), "utf-8");
    return JSON.parse(text) as SessionMeta;
  } catch {
    return null;
  }
}

/**
 * 原子写 meta：先写 .tmp 再 rename。
 * 防止读端读到半截 JSON。
 *
 * 跳过下划线开头字段（约定为运行时临时态，例如 __env），不持久化。
 */
export async function writeMeta(meta: SessionMeta): Promise<void> {
  const dir = sessionDir(meta.sid);
  await ensureDir(dir);
  const tmp = join(dir, "meta.json.tmp");
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k.startsWith("_")) continue;
    clean[k] = v;
  }
  await writeFile(tmp, JSON.stringify(clean, null, 2), "utf-8");
  await rename(tmp, metaPath(meta.sid));
}

/**
 * append-only 写一帧到 log.ndjson。
 * 多个并发 driver 不该写同一 sid 的 log（manager 保证），所以这里没加锁。
 */
export async function appendFrame(sid: string, frame: NormalizedFrame): Promise<void> {
  const line = JSON.stringify(frame) + "\n";
  await appendFile(logPath(sid), line, "utf-8");
}

/**
 * 列出所有已存在 session 的 meta（按 lastActiveAt desc）。
 * 跳过损坏 / 缺 meta 的目录。
 */
export async function listSessions(): Promise<SessionMeta[]> {
  await ensureDir(ROOT);
  const entries = await readdir(ROOT, { withFileTypes: true });
  const out: SessionMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = await readMeta(e.name);
    if (m) out.push(m);
  }
  out.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  return out;
}

/**
 * 读 log 最后 N 行（show 命令用）。
 * 大日志直接读全文然后 split 简单粗暴；若以后日志大可换成反向流式。
 */
export async function tailLog(sid: string, lines: number): Promise<NormalizedFrame[]> {
  let text: string;
  try {
    text = await readFile(logPath(sid), "utf-8");
  } catch {
    return [];
  }
  const all = text.split("\n").filter(Boolean);
  const tail = all.slice(-lines);
  const out: NormalizedFrame[] = [];
  for (const line of tail) {
    try { out.push(JSON.parse(line) as NormalizedFrame); }
    catch { /* 跳过坏行 */ }
  }
  return out;
}

/**
 * 整个删除 session 目录。close 之后调用。
 * 失败静默 — close 已经把进程杀了，目录残留下次 purge 处理。
 */
export async function removeSession(sid: string): Promise<void> {
  try { await rm(sessionDir(sid), { recursive: true, force: true }); }
  catch { /* ignore */ }
}

// ──────────────────────────────────────────────────────────────────────
// 审批文件协议（external approval mode）
//
// 1. driver 收到 codex 的 server→client 审批 RPC 时，写 <approvalId>.req.json，
//    emit approval_required 帧，然后阻塞轮询 <approvalId>.resp.json
// 2. 外部 LLM / 用户 / TUI 通过 `tako agent approve` 写 resp 文件
// 3. driver 读到 resp，把 decision 翻译成 codex 期望的回包格式 reply 回去
// 4. 处理完保留两个文件作为审计记录（close session 时随目录删）

export interface ApprovalRequest {
  approvalId: string;
  /** codex JSON-RPC method，如 "item/commandExecution/requestApproval" */
  method: string;
  /** codex 原 params，driver 直接 dump */
  params: unknown;
  /** 友好分类，UI 用：exec / patch / permission / tool / other */
  approvalType: "exec" | "patch" | "permission" | "tool" | "other";
  requestedAt: number;
}

export interface ApprovalResponse {
  decision: "allow" | "deny";
  reason?: string;
  /** 谁批的，留 audit。external_llm / user / tui / cli 等 */
  by?: string;
  decidedAt: number;
}

export async function writeApprovalRequest(sid: string, req: ApprovalRequest): Promise<void> {
  await ensureDir(approvalsDir(sid));
  const tmp = approvalReqPath(sid, req.approvalId) + ".tmp";
  await writeFile(tmp, JSON.stringify(req, null, 2), "utf-8");
  await rename(tmp, approvalReqPath(sid, req.approvalId));
}

export async function readApprovalRequest(
  sid: string,
  approvalId: string,
): Promise<ApprovalRequest | null> {
  try {
    const text = await readFile(approvalReqPath(sid, approvalId), "utf-8");
    return JSON.parse(text) as ApprovalRequest;
  } catch { return null; }
}

export async function writeApprovalResponse(
  sid: string,
  approvalId: string,
  resp: ApprovalResponse,
): Promise<void> {
  await ensureDir(approvalsDir(sid));
  const tmp = approvalRespPath(sid, approvalId) + ".tmp";
  await writeFile(tmp, JSON.stringify(resp, null, 2), "utf-8");
  await rename(tmp, approvalRespPath(sid, approvalId));
}

export async function readApprovalResponse(
  sid: string,
  approvalId: string,
): Promise<ApprovalResponse | null> {
  try {
    const text = await readFile(approvalRespPath(sid, approvalId), "utf-8");
    return JSON.parse(text) as ApprovalResponse;
  } catch { return null; }
}

/** 列当前 pending（有 req 无 resp）的审批 */
export async function listPendingApprovals(sid: string): Promise<ApprovalRequest[]> {
  try {
    const entries = await readdir(approvalsDir(sid));
    const out: ApprovalRequest[] = [];
    for (const e of entries) {
      if (!e.endsWith(".req.json")) continue;
      const id = e.slice(0, -".req.json".length);
      const req = await readApprovalRequest(sid, id);
      if (!req) continue;
      const resp = await readApprovalResponse(sid, id);
      if (!resp) out.push(req);
    }
    out.sort((a, b) => a.requestedAt - b.requestedAt);
    return out;
  } catch { return []; }
}

export const _internal = { ROOT };
