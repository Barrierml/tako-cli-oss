/**
 * Claude Code 凭据读写
 *
 * - macOS：keychain（service "Claude Code-credentials"，account "root"）
 * - Linux/Windows：~/.claude/.credentials.json
 *
 * 同时维护 ~/.claude.json 中的 oauthAccount 字段（账号身份）。
 * 多账号切换时把目标账号的 OAuth tokens 还原到 Claude Code 实际读取的位置。
 */

import { homedir, platform, userInfo } from "os";
import { join } from "path";

const KEYCHAIN_SERVICE = "Claude Code-credentials";
/** 新版 Claude Code (≥ v2.x) 用 $USER 作为 account；老版本用 "root"。两个都试。 */
function keychainAccountCandidates(): string[] {
  const user = process.env.USER || (() => { try { return userInfo().username; } catch { return ""; } })();
  return [user, "root"].filter(Boolean);
}
const CLAUDE_DIR = join(homedir(), ".claude");
const CREDENTIALS_PATH = join(CLAUDE_DIR, ".credentials.json");
const CLAUDE_JSON_PATH = join(homedir(), ".claude.json");

const isMac = platform() === "darwin";

export interface ClaudeAuthSnapshot {
  /** keychain 或 .credentials.json 解析后的对象 */
  credentials?: Record<string, any>;
  /** ~/.claude.json 中的 oauthAccount 字段 */
  oauthAccount?: Record<string, any>;
}

async function readKeychainOnce(account: string): Promise<Record<string, any> | null> {
  const proc = Bun.spawn(
    ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) return null;
  try { return JSON.parse(out.trim()); } catch { return null; }
}

/** 依次尝试 $USER / root 两个账户名（新老 Claude Code 兼容） */
async function readKeychain(): Promise<Record<string, any> | null> {
  for (const acct of keychainAccountCandidates()) {
    const data = await readKeychainOnce(acct);
    if (data) return data;
  }
  return null;
}

async function writeKeychain(data: Record<string, any>): Promise<void> {
  const value = JSON.stringify(data);
  // 写回到当前账户（优先 $USER；这是新版 Claude Code 实际使用的位置）
  const account = keychainAccountCandidates()[0];
  const proc = Bun.spawn(
    ["security", "add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", account, "-w", value],
    { stdout: "pipe", stderr: "pipe" },
  );
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`security add-generic-password failed (${code}): ${err.trim()}`);
  }
}

async function readCredentialsFile(): Promise<Record<string, any> | null> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(CREDENTIALS_PATH, "utf-8"));
  } catch { return null; }
}

async function writeCredentialsFile(data: Record<string, any>): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(CLAUDE_DIR, { recursive: true });
  await fs.writeFile(CREDENTIALS_PATH, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

/** 读取当前 Claude Code 的认证快照 */
export async function readClaudeAuth(): Promise<ClaudeAuthSnapshot> {
  const credentials = isMac ? await readKeychain() : await readCredentialsFile();

  let oauthAccount: Record<string, any> | undefined;
  try {
    const fs = await import("fs/promises");
    const json = JSON.parse(await fs.readFile(CLAUDE_JSON_PATH, "utf-8"));
    if (json.oauthAccount && typeof json.oauthAccount === "object") {
      oauthAccount = json.oauthAccount;
    }
  } catch { /* missing 文件视为无身份信息 */ }

  return {
    credentials: credentials ?? undefined,
    oauthAccount,
  };
}

/** 把认证快照写回 Claude Code 的存储位置 */
export async function writeClaudeAuth(snapshot: ClaudeAuthSnapshot): Promise<void> {
  if (snapshot.credentials) {
    if (isMac) await writeKeychain(snapshot.credentials);
    else await writeCredentialsFile(snapshot.credentials);
  }

  if (snapshot.oauthAccount) {
    const fs = await import("fs/promises");
    let json: Record<string, any> = {};
    try { json = JSON.parse(await fs.readFile(CLAUDE_JSON_PATH, "utf-8")); } catch { /* 新文件 */ }
    json.oauthAccount = snapshot.oauthAccount;
    await fs.writeFile(CLAUDE_JSON_PATH, JSON.stringify(json, null, 2) + "\n");
  }
}
