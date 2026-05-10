# `agent` 模块 — 测试计划

## 已有覆盖

无单元测试 / 集成测试。MVP 阶段全部靠手动 smoke。

## 手动 Smoke 步骤（每次发版前）

```bash
# 0. 重置
rm -rf ~/.tako/agent-sessions/*

# 1. claude 双轮 + resume
SID=$(tako agent start claude --model claude-sonnet-4-6 --name smoke-c \
        | grep "sid:" | awk '{print $2}')
tako agent send "$SID" 'reply with exactly the word PONG'
tako agent send "$SID" 'now reply with the word PING'
tako agent list   # 期望 turns=2
tako agent close "$SID" --purge

# 2. codex 双轮 + thread/resume
SID=$(tako agent start codex --model gpt-5.5 --name smoke-x \
        | grep "sid:" | awk '{print $2}')
tako agent send "$SID" 'reply with exactly the word PONG'
tako agent send "$SID" 'now reply with the word PING'
tako agent list   # 期望 turns=2
tako agent close "$SID" --purge

# 3. cancel
SID=$(tako agent start codex --model gpt-5.5 | grep "sid:" | awk '{print $2}')
tako agent send "$SID" 'count from 1 to 100 slowly' &
sleep 3
tako agent cancel "$SID"  # 期望 send 进程被中止
wait
tako agent close "$SID" --purge

# 4. attach
SID=$(tako agent start claude | grep "sid:" | awk '{print $2}')
tako agent send "$SID" 'write a 5-line poem' &
tako agent attach "$SID"  # Ctrl-C 退出，期望看到 turn_started → text → turn_completed
wait

# 5. TUI Agents 页
tako    # 进入主 TUI，按 a，期望见会话列表
```

## 编号场景

| ID | 场景 | 步骤 | 期望 |
|---|---|---|---|
| TP-AG-01 | claude 首轮 | `start claude` → `send "ping"` | log 含 turn_started + text_delta + turn_completed；turnCount=1 |
| TP-AG-02 | claude 多轮 | TP-AG-01 之后 `send "again"` | turnCount=2，第二轮历史可见（claude 自己持久化） |
| TP-AG-03 | codex 首轮 | `start codex` → `send "ping"` | meta 中 `codexThreadId` 出现；rollout 落盘 |
| TP-AG-04 | codex 多轮 | TP-AG-03 之后 `send "again"` | thread/resume 不报 "no rollout found"；turnCount=2 |
| TP-AG-05 | 模型路由 | `start claude --model deepseek-v4-pro` | 自动找到含此模型的 provider（不被 OAuth 订阅卡住） |
| TP-AG-06 | sid 前缀展开 | `start` 后用前 8 字符 send | 自动匹配到完整 sid |
| TP-AG-07 | cancel | `send` 后台跑，另开 shell `cancel` | turn.pid 文件被 SIGTERM；session status 回 idle |
| TP-AG-08 | close + purge | `close --purge` | meta+log+目录全删 |
| TP-AG-09 | provider 默认 | `default codex <id>` 后 start | 用配置的 provider 而非默认绑定 |
| TP-AG-10 | TUI Agents 页 | 主 TUI 按 `a` | 进入 AgentsView，见列表 |
| TP-AG-11 | 归一帧顺序 | codex turn 含多个 delta | log.ndjson text_delta 顺序与子进程 stdout 顺序一致（不乱序） |
| TP-AG-12 | __env 不持久 | start 后 cat meta.json | 不含 `__env` / `__providerHint` 字段 |
| TP-AG-13 | external approval 通路 | `start codex --approval external` → `send` 让它调 shell | log 出现 `approval_required` 帧；`pending` 列出此请求 |
| TP-AG-14 | approve allow | TP-AG-13 后 `approve <id> allow` | codex 收到 accept 继续执行；log 出现 `tool_result approval=allowed` |
| TP-AG-15 | approve deny | TP-AG-13 但 `approve <id> deny --reason X` | codex 收到 decline；log 出现 `error approval denied: X` |
| TP-AG-16 | approval 超时 | TP-AG-13 后 5min 不批 | 自动 deny；by=tako-timeout |
| TP-AG-17 | TUI Ctrl-Y/N | detail view 看到 pending 后按 Ctrl-Y | 同 TP-AG-14 |
| TP-AG-18 | policy auto_allow | external 模式下让 codex 跑 `git status` | 不出 approval_required；log 出现 `auto_allowed` audit |
| TP-AG-19 | policy auto_deny | 让 codex 跑 `sudo rm` | log 出现 `auto_deny`；codex 收到 deny |
| TP-AG-20 | approve --rule 持久化 | approve 0 allow --rule "X" | session policy.json 出现该 regex；下次同款不再问 |
| TP-AG-21 | policy 单测 12/12 | 见 evaluatePolicy 12 case 表 | 全 pass |

## 运行方式

目前全手动。后续加自动化 smoke 时建议放到 `tests/integration.agent.test.ts`，
用 `bun:test`，mock provider env 改为指向 par 的免费小模型节省费用。

## 已知边界 / 不测

- 跨平台：MVP 仅 macOS arm64 验证。Linux 应可（fcntl/SIGTERM 都标准），
  Windows 没测（child_process detach + 信号语义不同）
- 高并发 N 个 session：理论无锁竞争（每 session 独立目录 + driver in-process map），
  但未压测
- approval 转发：MVP 全 deny，无需测
