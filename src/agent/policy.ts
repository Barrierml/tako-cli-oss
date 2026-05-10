/**
 * Agent 审批策略
 *
 * 在 external 审批模式下，codex 每个 tool call 都会发 requestApproval。
 * 让外部 LLM / 用户每条都批太贵太慢，所以加一层本地静态策略：
 *
 *   1. auto_allow 命中 → driver 直接 reply allow，不写 req 文件不打扰任何人
 *   2. auto_deny 命中 → driver 直接 reply deny + audit 帧，安全兜底
 *   3. 都没命中 → 走文件桥让外部审
 *
 * 策略层级（前者覆盖后者）：
 *   per-session：~/.tako/agent-sessions/<sid>/policy.json
 *   全局自定义：~/.tako/agent-policy.json
 *   内置默认：DEFAULT_POLICY（本文件常量）
 *
 * 黑名单优先白名单（同时命中按 deny 处理）。
 */

import { join, isAbsolute, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { sessionDir } from "./storage";

export interface Policy {
  /** 命令体（去掉 shell wrapper 后的核心命令）正则数组 */
  exec_allow?: string[];
  exec_deny?: string[];
  /** 写文件路径正则 */
  file_allow?: string[];
  file_deny?: string[];
  /** 不在 cwd 子树下的文件改动是否一律 ask（默认 true）；false=允许 */
  strict_workdir?: boolean;
}

export type PolicyDecision =
  | { kind: "auto_allow"; reason: string }
  | { kind: "auto_deny"; reason: string }
  | { kind: "ask" };

/**
 * 内置默认 — 倾向偏松（让用户少被打扰）
 *
 * 哲学：
 *   - 只读、信息查询、编译/测试这类正常工作流命令默认放
 *   - 真危险（sudo / rm -rf 根 / curl|sh / chmod 全树）默认拒
 *   - 拿不准的（curl 任意地址、git push、写 ~/.ssh）→ ask
 */
export const DEFAULT_POLICY: Policy = {
  exec_allow: [
    // 读 / 列 / 看
    "^\\s*(ls|pwd|whoami|hostname|date|uname|env|echo|printenv)(\\s|$)",
    "^\\s*(cat|head|tail|less|more|file|stat)\\s+",
    "^\\s*(grep|rg|ag|egrep|fgrep)\\s+",
    "^\\s*find\\s+\\S+\\s+(-name|-type|-maxdepth|-path)",
    "^\\s*(wc|awk|sed -n)\\s+",
    "^\\s*(which|type|whereis|command -v)\\s+",
    "^\\s*(ps|df|du|free|top -b|iostat|vmstat)(\\s|$)",
    "^\\s*tree(\\s|$)",
    // git 只读子命令
    "^\\s*git\\s+(status|log|diff|show|branch|remote|config --(get|list)|rev-parse|describe|ls-files|ls-tree|cat-file|tag\\s+--list|stash list|reflog|fetch)(\\s|$)",
    // 包管理器查询
    "^\\s*(npm|yarn|pnpm|bun)\\s+(list|outdated|info|view|search|--version)(\\s|$)",
    "^\\s*(node|bun|python|python3|deno|go|cargo|rustc|java|javac)\\s+(--version|-V|version)(\\s|$)",
    "^\\s*pip\\s+(list|show|--version)(\\s|$)",
    "^\\s*cargo\\s+(check|tree|metadata)(\\s|$)",
    // 编译/检查/测试（不会动外界）
    "^\\s*(tsc|tsc --noEmit)(\\s|$)",
    "^\\s*(eslint|prettier|stylelint|tslint)\\s+",
    "^\\s*(jest|vitest|mocha|pytest|bun test|cargo test)(\\s|$)",
    "^\\s*npm run (lint|test|build|typecheck|check)",
  ],
  exec_deny: [
    // 提权
    "\\bsudo\\b",
    "\\bsu\\s+-",
    "\\bdoas\\b",
    // 大杀器
    "\\brm\\s+-[rRf]+\\s+(/$|/\\s|/[^./])",         // rm -rf /xxx 不在 / 下
    "\\brm\\s+-[rRf]+\\s+\\$HOME(/?)?\\s",
    "\\brm\\s+-[rRf]+\\s+~(/?)?\\s",
    "\\bdd\\s+if=.*\\s+of=/dev/",
    "\\bmkfs\\.",
    "\\bshred\\b",
    "\\bdiskutil\\s+(erase|format)",
    // 远程下载即跑
    "\\bcurl\\s+[^|]*\\|\\s*(sh|bash|zsh|fish)",
    "\\bwget\\s+[^|]*\\|\\s*(sh|bash|zsh|fish)",
    "\\bcurl\\s+.*-o\\s+/(usr|etc|bin|sbin|lib)/",
    // shell fork bomb / chmod 全树
    ":\\(\\)\\s*\\{",
    "\\bchmod\\s+-R\\s+[0-7]+\\s+/",
    // SSH key / shell 密码
    "\\bssh-keygen\\s+-t",
    "\\bsshpass\\b",
    "\\b(passwd|chpasswd)\\b",
    "\\bgit\\s+push\\s+.*--force",   // force push 总归危险
  ],
  file_allow: [],
  file_deny: [
    "/\\.ssh/",
    "/\\.aws/",
    "/\\.gnupg/",
    "\\.env(\\.|$)",
    "/etc/(passwd|shadow|sudoers)",
    "/(usr|etc|bin|sbin)/",
  ],
  strict_workdir: false,    // 默认对工作目录外写也只 ask 不 auto-deny；要严格模式自己开
};

/**
 * 把 codex 用 zsh -lc 包过的 command body 抽出来，用于 regex 匹配。
 * 例如 `/bin/zsh -lc "git status"` → `git status`
 */
export function unwrapShellCommand(cmd: string): string {
  if (!cmd) return "";
  // /bin/zsh -lc '...' 或 /bin/bash -c "..." 或 sh -c '...'
  const m = cmd.match(/^(?:\S*sh|\S*bash|\S*zsh)(?:\s+-\w+)*\s+["'](.*)["']\s*$/s);
  return m ? m[1] : cmd;
}

/**
 * 路径是否在 cwd 子树下
 */
export function pathInWorkdir(path: string, workdir: string): boolean {
  if (!path) return false;
  const abs = isAbsolute(path) ? resolve(path) : resolve(workdir, path);
  const base = resolve(workdir);
  return abs === base || abs.startsWith(base + "/");
}

/**
 * 主评估：根据 method + params 给出策略决定。
 *
 *   method = "item/commandExecution/requestApproval" 等  → 看 command
 *   method = "item/fileChange/requestApproval"            → 看 changes 涉及的路径
 *   method = "applyPatchApproval"                         → 看 patch 涉及的路径
 *   其他                                                  → 默认 ask
 *
 * 黑名单优先白名单。
 */
export function evaluatePolicy(
  policy: Policy,
  method: string,
  params: any,
  workdir: string,
): PolicyDecision {
  if (
    method === "item/commandExecution/requestApproval" ||
    method === "execCommandApproval"
  ) {
    const cmdRaw = String(params?.command ?? "");
    const cmd = unwrapShellCommand(cmdRaw);
    for (const pat of policy.exec_deny ?? []) {
      try { if (new RegExp(pat).test(cmd)) return { kind: "auto_deny", reason: `policy deny: /${pat}/` }; }
      catch { /* skip bad regex */ }
    }
    for (const pat of policy.exec_allow ?? []) {
      try { if (new RegExp(pat).test(cmd)) return { kind: "auto_allow", reason: `policy allow: /${pat}/` }; }
      catch { /* skip */ }
    }
    return { kind: "ask" };
  }

  if (
    method === "item/fileChange/requestApproval" ||
    method === "applyPatchApproval"
  ) {
    const paths = collectChangedPaths(params);
    // 任一路径命中 deny → 拒
    for (const p of paths) {
      for (const pat of policy.file_deny ?? []) {
        try { if (new RegExp(pat).test(p)) return { kind: "auto_deny", reason: `file deny: ${p} matches /${pat}/` }; }
        catch { /* skip */ }
      }
    }
    // 严格模式且任一路径出 cwd → 拒
    if (policy.strict_workdir) {
      for (const p of paths) {
        if (!pathInWorkdir(p, workdir)) {
          return { kind: "auto_deny", reason: `file outside workdir: ${p}` };
        }
      }
    }
    // 全部命中 allow → 批
    let allMatched = paths.length > 0;
    for (const p of paths) {
      let hit = false;
      for (const pat of policy.file_allow ?? []) {
        try { if (new RegExp(pat).test(p)) { hit = true; break; } }
        catch { /* skip */ }
      }
      if (!hit) { allMatched = false; break; }
    }
    if (allMatched) return { kind: "auto_allow", reason: "all paths matched file_allow" };
    // 路径全在 cwd 内（默认）→ 直接 auto_allow，不打扰
    if (!policy.strict_workdir && paths.length > 0 && paths.every((p) => pathInWorkdir(p, workdir))) {
      return { kind: "auto_allow", reason: "all paths inside workdir (non-strict)" };
    }
    return { kind: "ask" };
  }

  return { kind: "ask" };
}

function collectChangedPaths(params: any): string[] {
  // codex 的 fileChange / patch params 形态多样，启发式抽
  const out: string[] = [];
  const pushIfStr = (x: unknown) => {
    if (typeof x === "string" && x.length > 0 && x.length < 1024) out.push(x);
  };
  pushIfStr(params?.path);
  if (Array.isArray(params?.changes)) {
    for (const c of params.changes) {
      pushIfStr(c?.path);
      pushIfStr(c?.target);
    }
  }
  if (Array.isArray(params?.files)) {
    for (const f of params.files) pushIfStr(f?.path ?? f);
  }
  if (typeof params?.patch === "string") {
    // 从 unified diff 抠 +++ b/<path>
    for (const line of params.patch.split("\n")) {
      const m = line.match(/^\+\+\+\s+b\/(.*)$/);
      if (m) out.push(m[1]);
    }
  }
  return Array.from(new Set(out));
}

// ──────────────────────────────────────────────────────────────────────
// 加载/保存

const GLOBAL_POLICY_PATH = join(homedir(), ".tako", "agent-policy.json");

function policyPath(sid: string): string {
  return join(sessionDir(sid), "policy.json");
}

async function readJsonSafe(path: string): Promise<Policy | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as Policy;
  } catch { return null; }
}

/**
 * 取该 session 的最终生效策略：default ∪ global ∪ session（后覆盖前；列表是合并）
 */
export async function loadPolicy(sid: string): Promise<Policy> {
  const global_ = await readJsonSafe(GLOBAL_POLICY_PATH);
  const session = await readJsonSafe(policyPath(sid));
  return mergePolicy(mergePolicy(DEFAULT_POLICY, global_), session);
}

function mergePolicy(base: Policy, over: Policy | null): Policy {
  if (!over) return base;
  return {
    exec_allow: [...(base.exec_allow ?? []), ...(over.exec_allow ?? [])],
    exec_deny: [...(base.exec_deny ?? []), ...(over.exec_deny ?? [])],
    file_allow: [...(base.file_allow ?? []), ...(over.file_allow ?? [])],
    file_deny: [...(base.file_deny ?? []), ...(over.file_deny ?? [])],
    strict_workdir: over.strict_workdir ?? base.strict_workdir,
  };
}

export async function readSessionPolicyOverride(sid: string): Promise<Policy> {
  return (await readJsonSafe(policyPath(sid))) ?? {};
}
export async function writeSessionPolicyOverride(sid: string, p: Policy): Promise<void> {
  await writeFile(policyPath(sid), JSON.stringify(p, null, 2), "utf-8");
}

/**
 * 给 approve --rule "<regex>" 用：往 session policy 的 exec_allow 增加一条
 */
export async function appendSessionExecAllow(sid: string, regex: string): Promise<void> {
  const p = await readSessionPolicyOverride(sid);
  const list = p.exec_allow ?? [];
  if (!list.includes(regex)) list.push(regex);
  p.exec_allow = list;
  await writeSessionPolicyOverride(sid, p);
}
