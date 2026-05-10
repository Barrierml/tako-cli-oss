# Tako CLI

> 一个统一的 Claude Code / Codex / Gemini 启动器 + 多会话 agent 管理层。让你（或外部 LLM）能像管 systemd unit 一样起、监控、审批、关闭多个 agent 子会话。

## 它能做什么

### 1. 一行启动三家工具

```bash
tako                                              # 交互式 TUI 选工具 + provider
tako --claude --model claude-opus-4-7 --yolo -p "fix bug in src/foo.ts"
tako --codex --model gpt-5.5 --yolo -p "把 README 翻成中文"
tako --gemini --model gemini-2.5-pro -p "..."
tako --models                                     # 列各家可用模型
```

`--model X` 会**自动路由**到目录里包含此模型的 provider（不被绑定卡住），并自动加上 `[1m]` 之类的特殊后缀。

### 2. 长时 agent session 管理

```bash
# 起一个 codex session，跨 shell 续接、可监控、可审批
SID=$(tako agent start codex --model gpt-5.5 --approval external | grep sid: | awk '{print $2}')

tako agent send "$SID" "扫一下 TODO 注释，列前 5 个最关键的"
tako agent list             # 看所有跑着的 session
tako agent attach "$SID"    # 实时跟事件流
tako agent show "$SID"      # 看 meta + 最近日志
tako agent close "$SID" --purge
```

**全部状态持久化到 `~/.tako/agent-sessions/<sid>/`**，跨进程跨 shell 续接。`SessionMeta` 自动管 `--resume`（claude）/ `thread/resume`（codex）。

### 3. 让外部 LLM 当审批员（核心特性）

支持把工具调用审批权交给**另一个 LLM**——你（外部 LLM）派 codex 去改代码，每次 codex 想跑命令/改文件你都看一眼再决定批不批。

```bash
SID=$(tako agent start codex --approval external --model gpt-5.5 --json | jq -r .sid)
SINCE=$(tako agent send --bg --json "$SID" "改 README" | jq -r .since)

# LLM 友好的事件循环：每次 wait 拿一个事件，退出码区分类型
while :; do
  EVENT=$(tako agent wait --json --since "$SINCE" "$SID")
  case $? in
    0)  # approval_required；EVENT.pending[].detail 含具体命令
        APPROVAL_ID=$(echo "$EVENT" | jq -r '.pending[0].approvalId')
        DETAIL=$(echo "$EVENT" | jq -r '.pending[0].detail')
        # ⬅ LLM 在这里看 DETAIL 决定 allow/deny
        tako agent approve "$SID" "$APPROVAL_ID" allow --rule "<未来同款都批>" ;;
    2)  echo "$EVENT" | jq -r .text   # turn 完了
        break ;;
    1|3) break ;;                      # error / closed
  esac
done
```

事件 → exit code 映射：

| event | exit | LLM 应该 |
|---|---|---|
| `approval_required` | **0** | 看 `.pending[].detail` 决策 → approve → 再 wait |
| `turn_completed`    | **2** | 拿 `.text` 当结果，进入下一轮或结束 |
| `session_closed`    | **3** | 不用再轮询 |
| `error / timeout`   | **1** | 异常 |

### 4. 内置批量审批策略

每条 tool call 都让大模型审批太贵——tako 在 driver 和外置审批之间夹了一层**本地静态策略**：

```
codex 发 requestApproval
        ↓
  evaluatePolicy（默认 + 全局 + session 合并）
        ↓
   ┌─────────┬─────────┐
auto_allow  auto_deny  ask
   ↓          ↓          ↓
直接 reply   直接 reply  写文件桥让外部 LLM 决定
```

**默认策略**已覆盖大部分常见场景：
- `auto_allow`：`ls`/`cat`/`grep`/`find`/`git 只读子命令`/`tsc`/`npm run test` 等
- `auto_deny`：`sudo`/`rm -rf $HOME`/`curl|sh`/`fork bomb`/`git push --force` 等
- 其他 → `ask`

```bash
tako agent policy default-show              # 看内置默认
tako agent policy <sid> show                # 看本 session 生效策略
tako agent policy <sid> allow-exec '<regex>'
tako agent approve <sid> <id> allow --rule '<regex>'   # 审一条+加进白名单一条
```

## 安装

```bash
# Unix（macOS / Linux）
curl -fsSL https://raw.githubusercontent.com/Barrierml/tako-cli-oss/main/install.sh | bash

# Windows PowerShell
iwr -useb https://raw.githubusercontent.com/Barrierml/tako-cli-oss/main/install.ps1 | iex
```

或用 npm：

```bash
npm install -g tako-cli
# 或
bun install -g tako-cli
```

## 快速上手

```bash
tako                              # 进交互 TUI 第一次配 provider（API key）
tako --models                     # 看可用模型
tako --claude                     # 直接启动 Claude Code
```

主 TUI 里：
- 按 `a` 进 Agents 管理页面
- 按 `n` 新建 agent session
- Enter 进入 detail view 看实时事件、手动发消息
- Pending 审批 Ctrl-Y / Ctrl-N 批/拒

## Provider / Model

支持的 provider 类型：
- **Anthropic 直连**（API key）
- **Anthropic Claude Max 订阅**（OAuth）
- **Codex Plus 订阅**（OAuth）
- **DeepSeek**（OpenAI/Anthropic 兼容网关）
- **Tako 中继**（默认接 `https://tako.shiroha.tech`，可改 `PROXY_BASE_URL`）
- **Custom**（任意 OpenAI/Anthropic 兼容端点）

在 `tako` 主菜单按 `p` 配 provider。

## 给其他 agent 用的 Skill

`skills/tako-agent/SKILL.md` 是一份完整的 markdown skill，可以直接放到 Claude Code / Codex / 其他支持 skill 的 agent 框架里，让它学会通过 `tako agent` 调度子 agent + 审批。

## 文档

- [agent 模块设计](./docs/agent/DESIGN.md) — 进程模型、driver 接口、审批桥
- [测试计划](./docs/agent/TESTPLAN.md) — 编号场景 TP-AG-XX
- [tako-agent skill](./skills/tako-agent/SKILL.md) — 给外部 LLM 用的速查

## 协议研究记录

实现过程中扫过的 ACP / MCP / 各家 headless 协议事实：

| 协议 | 由谁出 | 形态 | 方向 |
|---|---|---|---|
| **ACP** | Zed Industries | stdio JSON-RPC 2.0 | host → agent |
| **MCP** | Anthropic | JSON-RPC（stdio/HTTP/SSE） | agent → 工具/数据 |

各 CLI 的程序化接口：
- **Gemini CLI**：原生 `--experimental-acp`
- **Claude Code**：`--print --input-format stream-json --output-format stream-json` headless 模式
- **Codex**：`codex app-server`（stdio JSON-RPC）+ `codex exec --json` NDJSON

Tako 内部的 driver 会把这些异构协议翻译成一个统一的归一化事件流（`NormalizedFrame`）。

## License

MIT
