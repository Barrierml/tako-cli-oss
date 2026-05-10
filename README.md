<div align="center">

# Tako CLI

**一个 CLI，管所有家 AI 编码工具 · 一份用量面板，看清所有家 API 花销**

[**🌐 官网 · tako.shiroha.tech**](https://tako.shiroha.tech) &nbsp;·&nbsp;
[安装](#安装) &nbsp;·&nbsp;
[文档](#文档) &nbsp;·&nbsp;
[GitHub](https://github.com/Barrierml/tako-cli-oss)

</div>

---

Tako 是一个 AI 编码工具的**统一启动器**和**会话管理层**。

- 🔌 **一处配置，全家通用** —— Claude Code / Codex / Gemini 共用同一份 provider 配置
- 💳 **6 种 provider 同时管理** —— 官方订阅、Anthropic 直连、DeepSeek、自定义代理、Tako 中继任意切换
- 📊 **实时用量统计** —— token、花费、配额窗口、剩余额度一屏看清，对接 [tako.shiroha.tech](https://tako.shiroha.tech) 还能看历史趋势
- 🤖 **Agent 会话调度** —— 把 Claude Code / Codex 当后台进程管，跨 shell 续接，外部 LLM 可远程审批

## 一处配置，全家通用

不再为每家工具单独维护一份 API key 和 base URL。Tako 把"工具"和"服务商"解耦：

| Provider 类型 | 说明 | 适配工具 |
|---|---|---|
| **Tako 中继** | 一键接入官方所有模型 + 用量面板 | Claude Code / Codex / Gemini |
| **Anthropic 直连** | 自己的 API key | Claude Code |
| **Claude Max 订阅** | OAuth 登录用订阅额度 | Claude Code |
| **Codex Plus 订阅** | OAuth 登录用 ChatGPT Plus 额度 | Codex |
| **DeepSeek** | 官方 API（OpenAI / Anthropic 双兼容） | Claude Code / Codex |
| **自定义代理** | 任意 OpenAI / Anthropic 兼容端点 | Claude Code / Codex |

> 在 `tako` 主菜单按 `p` 进 Provider 管理；同一工具可以绑定多个 provider 随时切换。

## 实时用量统计

每家 provider 的额度模型不一样——Tako 把它们归一化到一个数据结构，UI 里一眼看清：

```
┌─ Claude Subscription (Max) ──────────────────────────┐
│ 5h 窗口    ████████░░░░░░░░  47%   重置 22:30        │
│ 7d 窗口    ███░░░░░░░░░░░░░  18%   重置 周日 04:00   │
│ Opus 模型  ██████░░░░░░░░░░  35%                     │
└──────────────────────────────────────────────────────┘
┌─ Codex Subscription (Plus) ──────────────────────────┐
│ 5h 窗口    ██████████░░░░░░  61%   重置 21:00        │
│ 7d 窗口    █████░░░░░░░░░░░  29%                     │
└──────────────────────────────────────────────────────┘
┌─ Tako Proxy ─────────────────────────────────────────┐
│ 今日花费   $1.24 / $20.00       请求 87 次           │
│ 累计花费   $12.65               token 4.3M           │
└──────────────────────────────────────────────────────┘
```

- **Claude / Codex 订阅**：直接调官方 quota API 拉滑动窗口
- **Tako 中继**：每次请求按真实模型计费，看到的是聚合后的 token / cost / 请求数
- **DeepSeek / 自定义**：通过日志聚合（计划支持）

接 Tako 中继的话，[官网](https://tako.shiroha.tech)还有完整的可视化面板：每日 / 每模型用量曲线、API key 余额、调用历史。

## 一行启动三家工具

```bash
tako                                              # 交互式 TUI（选工具 + 选 provider）
tako --claude --model claude-opus-4-7 --yolo -p "fix bug in src/foo.ts"
tako --codex  --model gpt-5.5         --yolo -p "把 README 翻成中文"
tako --gemini --model gemini-2.5-pro            -p "..."
tako --models                                     # 列各家可用模型
```

`--model X` 自动路由到能跑这个模型的 provider，不会被默认绑定卡住。

## Agent 会话调度（让别的 LLM 当老板）

把 Claude / Codex 当后台进程托管 —— 跨 shell 续接、可监控、可审批：

```bash
SID=$(tako agent start codex --model gpt-5.5 --approval external --json | jq -r .sid)
tako agent send "$SID" "扫一下 TODO 注释，列前 5 个最关键的"
tako agent list           # 所有活动 session
tako agent attach "$SID"  # 实时跟事件流
```

**外部 LLM 当审批员**：你（外部 LLM）派 codex 干活，它每次想跑命令/改文件你都能介入决定批不批：

```bash
SID=$(tako agent start codex --approval external --model gpt-5.5 --json | jq -r .sid)
SINCE=$(tako agent send --bg --json "$SID" "改 README" | jq -r .since)

while :; do
  EVENT=$(tako agent wait --json --since "$SINCE" "$SID")
  case $? in
    0) APPROVAL_ID=$(echo "$EVENT" | jq -r '.pending[0].approvalId')
       DETAIL=$(echo "$EVENT" | jq -r '.pending[0].detail')
       # ⬅ LLM 在这里看 DETAIL 决策
       tako agent approve "$SID" "$APPROVAL_ID" allow --rule "<未来同款都批>" ;;
    2) echo "$EVENT" | jq -r .text; break ;;          # turn 完了
    1|3) break ;;                                      # error / closed
  esac
done
```

事件 → exit code 映射：`0` = 等审批 / `2` = turn 完成 / `3` = session 关闭 / `1` = 异常。

并且自带**静态策略层**减少审批噪音：`ls`/`cat`/`grep`/`git 只读子命令` 默认放行，`sudo`/`rm -rf $HOME`/`curl|sh` 默认拒绝，复杂命令才走外部 LLM 决策。

## 安装

```bash
# Unix（macOS / Linux）
curl -fsSL https://raw.githubusercontent.com/Barrierml/tako-cli-oss/main/install.sh | bash

# Windows PowerShell
iwr -useb https://raw.githubusercontent.com/Barrierml/tako-cli-oss/main/install.ps1 | iex

# 或 npm / bun
npm install -g tako-cli
bun install -g tako-cli
```

## 快速上手

```bash
tako                  # 进 TUI 第一次配 provider
tako --models         # 看可用模型
tako --claude         # 直接进 Claude Code
```

主 TUI 内：

| 键 | 功能 |
|---|---|
| `p` | Provider 管理（增删 / 切换 / 看用量） |
| `a` | Agents 管理 |
| `n` | （在 Agents 页）新建 session |
| Enter | 进入 detail view，实时事件 + 手动消息 |
| Ctrl-Y / Ctrl-N | 批 / 拒一条 pending 审批 |

## 文档

- [Agent 模块设计](./docs/agent/DESIGN.md) — 进程模型、driver 接口、审批桥
- [测试计划](./docs/agent/TESTPLAN.md) — 编号场景 TP-AG-XX
- [Quota 设计](./docs/quota/DESIGN.md) — 用量统一归一化模型
- [tako-agent skill](./skills/tako-agent/SKILL.md) — 给外部 LLM 用的速查 markdown

## 协议研究记录

实现过程中对比过的几家程序化协议：

| 协议 | 由谁出 | 形态 | 方向 |
|---|---|---|---|
| **ACP** | Zed Industries | stdio JSON-RPC 2.0 | host → agent |
| **MCP** | Anthropic | JSON-RPC（stdio / HTTP / SSE） | agent → 工具 |

各 CLI 的程序化接口：

- **Gemini CLI** —— 原生 `--experimental-acp`
- **Claude Code** —— `--print --input-format stream-json --output-format stream-json` headless
- **Codex** —— `codex app-server`（stdio JSON-RPC）+ `codex exec --json` NDJSON

Tako 内部的 driver 把它们翻译成统一的归一化事件流（`NormalizedFrame`）。

---

<div align="center">

**进一步配置可视化面板和 API key 管理 → [tako.shiroha.tech](https://tako.shiroha.tech)**

License: MIT

</div>
