# `agent` 模块 — Agent Session 管理

## 概述

让 tako 像管 systemd unit 一样管理 Claude Code / Codex 的长时对话。
每个 session 持久化到 `~/.tako/agent-sessions/<sid>/`，跨 shell、跨进程续接，
归一化事件流写入 `log.ndjson`。

## 源文件

| 文件 | 职责 |
|---|---|
| `src/agent/types.ts` | `Backend`, `SessionMeta`, `NormalizedFrame`, `Driver` 接口 |
| `src/agent/storage.ts` | `~/.tako/agent-sessions/` IO（meta 原子写、log append-only、tail） |
| `src/agent/drivers/claude.ts` | Claude Code 驱动 — 每 turn spawn 一个 `claude --print` 子进程，stream-json 协议 |
| `src/agent/drivers/codex.ts` | Codex 驱动 — 每 turn spawn 一个 `codex app-server`（stdio JSON-RPC），通过 thread/start 或 thread/resume |
| `src/agent/manager.ts` | SessionManager — provider 路由、env 注入、driver 调度、agentDefaults |
| `src/agent/policy.ts` | 静态审批策略（exec/file 白黑名单 + 默认） + per-session 覆盖加载 |
| `src/agent/cmd.ts` | `tako agent <subcmd>` CLI 命令处理 |
| `src/ui/ink/views/AgentsView.tsx` | 主 TUI 的"Agents"页面（list/close/purge） |
| `skills/tako-agent/SKILL.md` | 给其他 AI agent 用的开源 skill markdown |

## 核心逻辑

### Driver 进程模型

| backend | 进程模型 | session 标识 | 多轮机制 |
|---|---|---|---|
| **claude** | per-turn spawn `claude --print --input-format stream-json --output-format stream-json` | UUID v4，作为 `--session-id`（首轮）/ `--resume`（后续） | claude 自带 `~/.claude/projects/...` 历史持久化 |
| **codex** | per-turn spawn `codex app-server`（stdio mode） | codex 自己生成的 `threadId`，存在 meta 里 | 首 send 调 `thread/start` 创建并立即 turn/start（rollout 才落盘）；后续 send 调 `thread/resume` |

> 前期尝试过 codex unix socket + `app-server proxy`，实测 socket 端有额外
> framing，proxy 转出去的 stdio 始终拿不到响应。回退到 stdio 模式稳定。
> 代价：每轮 ~200ms 启动开销，可接受。

### 归一化事件流

底层两家协议字段完全不同，统一翻译成一个简单事件流（见 `types.ts` 的 `NormalizedFrame`），
写入 `log.ndjson`。上层 CLI/TUI/外部 agent 只读这一种格式。

事件类型：`session_started` / `turn_started` / `text_delta` / `reasoning_delta` /
`tool_use` / `tool_result` / `approval_required` / `turn_completed` / `error` / `session_closed`。

### Provider 路由

`manager.resolveProvider()` 的优先级：

1. 显式 `--provider <id>` 指定
2. `agentDefaults.<backend>` 配置（`tako agent default <backend> <id>` 设置）
3. **模型路由**：扫该 client 兼容 provider，找哪个的 launchOptions 含 `model-<X>`
4. `clientProviderMap[<clientId>]`（与 launcher 共用绑定）
5. 第一个兼容 provider

### env 不持久化

API Key 等敏感 env vars **不写 meta**。每次 send/cancel/close 都通过 `manager.rebuildEnv()`
重新解析当前 provider 注入。`SessionMeta` 上下划线开头字段（`__env`, `__providerHint`）是
运行时态，`storage.writeMeta()` 序列化时跳过。

### 取消 / 中止

- claude：driver 持有 `runningChildren` map（in-process），`cancel` SIGINT
- codex：每次 send 把当前 PID 写到 `<sid>/turn.pid`，`cancel` 读出来 `process.kill(pid, SIGTERM)`

### 审批（两种模式）

`SessionMeta.approvalMode`：

**`yolo`（默认）**
- `approvalPolicy: "never"` + `sandbox: "danger-full-access"`
- Codex 不发 requestApproval；驱动收到 server-side request 也 `replyError` 拒绝
- 适合可信单机，不适合外部 agent 自动驱动

**`external`**
- `approvalPolicy: "untrusted"` + `sandbox: "workspace-write"`
- Codex 会主动发 `item/commandExecution/requestApproval` / `item/fileChange/requestApproval` 等
- 驱动顺序：
  1. **policy 评估**（`policy.ts`）：默认 + 全局 + session 合并后做 deny-then-allow 匹配；命中 → 直接 reply + 写 audit 帧（`tool_result.output.approval = auto_allowed/auto_denied`），不打扰人
  2. **文件桥**：policy 判 ask 才走 — 写 `<sid>/approvals/<approvalId>.req.json` + emit `approval_required` 帧 + 阻塞轮询 `.resp.json`
  3. 外部通过 `tako agent approve <sid> <id> allow|deny [--reason X] [--rule "<regex>"]` 写响应；`--rule` 把规则附加到 session policy 的 exec_allow，下次自动批
- 200ms 轮询，5min 超时（默认 deny）
- 决策回放：`buildApprovalReply()` 把通用 allow/deny 翻译成 codex 各 method 期望的 enum
  - `applyPatchApproval` / `execCommandApproval` → `ReviewDecision { approved | denied }`
  - `item/commandExecution/requestApproval` / `item/fileChange/requestApproval` → `{ accept | decline }`
  - `item/permissions/requestApproval` → `{ permissions, scope }`

文件协议（`<sid>/approvals/`）：

```
<approvalId>.req.json       # driver 写：{approvalId, method, params, approvalType, requestedAt}
<approvalId>.resp.json      # approver 写：{decision: allow|deny, reason?, by?, decidedAt}
```

req 与 resp 都保留作为审计；session close 时随目录删除。

claude 端的对应路（未实现）：用 `--permission-prompt-tool` flag + 一个最小 MCP server
暴露 `tako_permission_check` 工具。下一版加。

## 依赖

- `clients/base.ts` — 复用 `getClient()`/`getClientLaunchOptions()`/`getClientEntryPath()`
- `providers/index.ts` — `getProviders()`/`getProvidersForClient()`/`resolveProviderContext()`
- `installer.ts` — `getBunPath()`（codex 是 bun 跑，claude 是 native）
- `config.ts` — `loadConfig()`/`saveConfig()` for `agentDefaults`
- 外部：node 内置 `child_process` / `fs/promises` / `crypto`（randomUUID）

## CLI 接口

详见 `tako agent help` 与 `skills/tako-agent/SKILL.md`。

## 已有测试

- 手动 smoke：claude 双 turn（PONG → PING）+ codex 双 turn（thread/start → thread/resume）+
  list / show / close / purge 全链路验证通过
- 单元测试：未写（TODO，见 `TESTPLAN.md`）

## 已知限制（v2）

1. ~~Codex 的 server-initiated approval requests 一律 deny~~ → 已实现 external 模式
2. **Claude 的外置审批未做** — 需要起 MCP server + `--permission-prompt-tool`，下一版加
3. Claude 的 stream-json `--include-partial-messages` 帧 text 字段是累积值，
   driver 没开 partial，token 级流目前由 claude 一次性给（最终 assistant 帧）
4. Send 是 per-turn 阻塞调用，跨进程 attach 需另开 shell。无 daemon 化、无 IPC bus
5. external approval 的轮询是 200ms 文件 stat，N 个 session 同时 awaiting 不会阻塞，
   但响应延迟最多 ~200ms。要求亚秒级响应可以未来换 fs.watch / unix socket
6. 没有 web UI（hub 包不存在）。"管理界面" = Ink TUI 的 Agents 页（按 `a` 进入）
7. Approval 协议没有签名 — 文件级别只要能写 `<sid>/approvals/` 目录的人就能批。
   单机用户级权限够用；多用户/暴露给外部不可信进程时需要再上一层签名/HMAC
