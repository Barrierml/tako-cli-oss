/**
 * SessionManager — 把 driver 接起来，给 CLI / Ink TUI 一个干净的接口。
 *
 * 职责：
 *   - 生成 sid（UUID v4）
 *   - 解析 backend → driver
 *   - 路由 provider（找含模型的 provider，注入 env）
 *   - 持久化 meta，写归一帧
 *
 * 不做：
 *   - UI 渲染 / TUI（CLI 层负责）
 *   - 多进程同步锁（同 sid 并发 send 由调用方避免）
 */

import { randomUUID } from "node:crypto";
import type { ApprovalMode, Backend, Driver, SendHooks, SessionMeta } from "./types";
import { claudeDriver, attachEnv as attachClaudeEnv } from "./drivers/claude";
import { codexDriver, attachEnv as attachCodexEnv } from "./drivers/codex";
import {
  initSession,
  listSessions,
  readMeta,
  removeSession,
  writeMeta,
  tailLog,
} from "./storage";
import { loadConfig } from "../config";
import {
  getProviders,
  getProvidersForClient,
  resolveProviderContext,
} from "../providers";
import { getClient, getClientLaunchOptions } from "../clients/base";
import type { ProviderContext, Provider } from "../providers/types";

const DRIVERS: Record<Backend, Driver> = {
  claude: claudeDriver,
  codex: codexDriver,
};

const CLIENT_ID: Record<Backend, string> = {
  claude: "claude-code",
  codex: "codex",
};

export interface StartArgs {
  backend: Backend;
  name?: string;
  model?: string;
  workdir?: string;
  /** 显式指定 provider id；不传走默认路由 */
  providerId?: string;
  /** 工具调用审批策略；不传走 yolo */
  approvalMode?: ApprovalMode;
}

export async function startSession(args: StartArgs): Promise<SessionMeta> {
  const driver = DRIVERS[args.backend];
  const clientId = CLIENT_ID[args.backend];
  const client = getClient(clientId);
  if (!client) throw new Error(`client ${clientId} 未注册`);

  // 选 provider
  const provider = await resolveProvider(args.backend, args.providerId, args.model);
  if (!provider) {
    throw new Error(
      `没找到 ${args.backend} 可用的 provider${args.model ? `（含模型 ${args.model}）` : ""}`,
    );
  }
  const providerCtx: ProviderContext = resolveProviderContext(provider);
  // 把 model 写回 ctx 让 getEnvVars 能用 ANTHROPIC_MODEL 之类
  if (args.model) (providerCtx as any).model = args.model;

  const env = client.getEnvVars(providerCtx);

  const sid = randomUUID();
  // 先建目录写空 meta（driver.start 内部会 appendFrame，需要目录已就位）
  const placeholder: SessionMeta = {
    sid,
    backend: args.backend,
    name: args.name ?? `${args.backend}-${sid.slice(0, 8)}`,
    model: args.model,
    workdir: args.workdir ?? process.cwd(),
    status: "idle",
    approvalMode: args.approvalMode ?? "yolo",
    turnCount: 0,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    providerId: provider.id,
  };
  await initSession(placeholder);

  const meta: SessionMeta = await driver.start({
    sid,
    name: placeholder.name,
    model: args.model,
    workdir: placeholder.workdir,
    approvalMode: args.approvalMode ?? "yolo",
    env: env as Record<string, string>,
    providerId: provider.id,
    providerHint: {
      type: provider.type,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
    },
  });
  // driver 可能补全了 codex* 字段，写一次最终 meta
  await writeMeta(meta);
  return meta;
}

export async function sendToSession(
  sid: string,
  prompt: string,
  hooks?: SendHooks,
): Promise<SessionMeta> {
  const meta = await readMeta(sid);
  if (!meta) throw new Error(`session ${sid} 不存在`);
  if (meta.status === "closed") throw new Error(`session ${sid} 已关闭`);
  const driver = DRIVERS[meta.backend];
  // 每次都要重新算 env（密钥不持久化在 meta）；attachEnv 把它塞 meta.__env
  const env = await rebuildEnv(meta);
  if (meta.backend === "claude") attachClaudeEnv(meta, env);
  else if (meta.backend === "codex") attachCodexEnv(meta, env);
  return driver.send(meta, prompt, hooks);
}

export async function cancelSession(sid: string): Promise<void> {
  const meta = await readMeta(sid);
  if (!meta) return;
  if (meta.backend === "codex") attachCodexEnv(meta, await rebuildEnv(meta));
  await DRIVERS[meta.backend].cancel(meta);
}

export async function closeSession(sid: string, purge = false): Promise<void> {
  const meta = await readMeta(sid);
  if (!meta) return;
  if (meta.backend === "codex") attachCodexEnv(meta, await rebuildEnv(meta));
  await DRIVERS[meta.backend].close(meta);
  if (purge) await removeSession(sid);
}

export async function listAllSessions(): Promise<SessionMeta[]> {
  return listSessions();
}

export async function showSession(sid: string, logLines = 50) {
  const meta = await readMeta(sid);
  if (!meta) return null;
  const log = await tailLog(sid, logLines);
  const alive = await DRIVERS[meta.backend].isAlive(meta);
  return { meta, log, alive };
}

export async function purgeDead(): Promise<number> {
  const all = await listSessions();
  let n = 0;
  for (const m of all) {
    if (m.status === "closed") {
      await removeSession(m.sid);
      n++;
      continue;
    }
    if (m.backend === "codex") {
      const alive = await DRIVERS.codex.isAlive(m);
      if (!alive) {
        m.status = "dead";
        await writeMeta(m);
      }
    }
  }
  return n;
}

// ──────────────────────────────────────────────────────────────────────
// Provider 路由

async function resolveProvider(
  backend: Backend,
  explicitId: string | undefined,
  model: string | undefined,
): Promise<Provider | undefined> {
  const config = await loadConfig();
  const all = await getProviders();
  const clientId = CLIENT_ID[backend];

  // 1. 显式指定
  if (explicitId) {
    const p = all.find((x) => x.id === explicitId);
    if (p) return p;
  }

  // 2. agentDefaults 配置
  const defaults = (config as any).agentDefaults as Record<string, string> | undefined;
  const cfgId = defaults?.[backend];
  if (cfgId) {
    const p = all.find((x) => x.id === cfgId);
    if (p) return p;
  }

  // 3. 用模型路由：找该 client 兼容 provider 中目录里含此 model 的
  const compatible = await getProvidersForClient(clientId);
  if (model) {
    const client = getClient(clientId);
    if (client) {
      for (const p of compatible) {
        const opts = getClientLaunchOptions(client, p);
        if (opts.some((o) => o.id === `model-${model}`)) return p;
      }
    }
  }

  // 4. 用绑定的 client provider
  const boundId = config.clientProviderMap?.[clientId];
  if (boundId) {
    const p = all.find((x) => x.id === boundId);
    if (p) return p;
  }

  // 5. 第一个兼容
  return compatible[0];
}

/** rebuildEnv 同时把 providerHint（codex 用）放回 meta，让跨进程 send 也有 hint */
async function rebuildEnv(meta: SessionMeta): Promise<Record<string, string>> {
  const clientId = CLIENT_ID[meta.backend];
  const client = getClient(clientId);
  if (!client) return {};
  const all = await getProviders();
  let provider = meta.providerId ? all.find((p) => p.id === meta.providerId) : undefined;
  if (!provider) provider = await resolveProvider(meta.backend, undefined, meta.model);
  if (!provider) return {};
  const ctx = resolveProviderContext(provider);
  if (meta.model) (ctx as any).model = meta.model;
  // 把 providerHint 塞 meta 给 codex driver 用
  (meta as any).__providerHint = {
    type: provider.type,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
  };
  return client.getEnvVars(ctx) as Record<string, string>;
}

/** 设置默认 provider —— `tako agent default <backend> <providerId>` 用 */
export async function setAgentDefault(backend: Backend, providerId: string): Promise<void> {
  const { saveConfig } = await import("../config");
  const config = await loadConfig();
  const cur = ((config as any).agentDefaults as Record<string, string>) ?? {};
  cur[backend] = providerId;
  (config as any).agentDefaults = cur;
  await saveConfig(config);
}

export async function getAgentDefaults(): Promise<Record<string, string>> {
  const config = await loadConfig();
  return ((config as any).agentDefaults as Record<string, string>) ?? {};
}
