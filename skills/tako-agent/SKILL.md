---
name: tako-agent
description: 通过 tako CLI 启动、续接、监控、关闭 Claude Code 与 Codex 的长时 agent session。适用场景：你需要把一个研究/编码任务拆给另一个 agent 去 spawn 单独的 claude/codex 实例并行跑，定时回来收结果，或在多 turn 对话上保持持久化历史。触发：用户提到 "派一个 agent 去做..."、"让 codex 继续..."、"开一个 claude 子会话"、"管理 agent session"、"看 agent 跑到哪了"、"取消那个 agent" 等。
---

# tako-agent — 长时 agent session 管理

`tako agent <subcmd>` 让你在 shell 里像管 systemd unit 一样管 Claude Code / Codex
的对话。session 状态全部持久化到 `~/.tako/agent-sessions/<sid>/`，跨 shell、
跨进程都能续接。

每个 session 自带：
- meta.json（sid / backend / model / status / turnCount / lastActiveAt）
- log.ndjson（归一化事件流：text_delta / tool_use / tool_result / approval_required / turn_completed / error）
- claude 用 native `--resume <sid>` 持久化历史，codex 用 `thread/resume` 持久化 rollout
  —— **不需要自己存对话内容**

## 何时用 vs 不用

✅ **用本 skill**
- 拆"长任务给副 agent 跑"，主对话留着继续
- 想并发跑多个 agent 实例（codex 改 A 文件、claude 看 B 文件，互不打扰）
- 需要随时 cancel / attach 监控 / 关闭某个跑飞的 agent
- 跨多次 shell 重启续接同一 session

❌ **不用**
- 一次性短问题（直接跑 `tako --claude -p "..."`、`tako --codex exec "..."` 更快）
- 需要交互式 TUI（去 `tako` 主界面）
- 要让其他 agent 调用工具（这是 MCP 的活，不是 ACP/这个 skill）

## 快速速查

```bash
tako agent start <claude|codex> [--model X] [--name N] [--cwd .] [--provider id] [--approval yolo|external]
tako agent list                         # 表格：sid | backend | model | status | turns | age | last
tako agent send <sid> "prompt..."       # 阻塞，归一帧流到 stdout，turn 完返回
tako agent show  <sid> [--lines N]      # meta + 最近 N 条归一帧（默认 30）
tako agent attach <sid>                 # 实时 tail 归一帧（Ctrl-C 退出）
tako agent cancel <sid>                 # 中止当前正在跑的 turn（不关 session）
tako agent close  <sid> [--purge]       # 关 session，--purge 同时删本地目录
tako agent purge                        # 清理所有 closed/dead 的 session

# 外置审批模式（仅 codex 当前支持）
tako agent pending <sid>                                    # 列当前 pending 审批
tako agent approve <sid> <approvalId> <allow|deny>          # 回复一个 pending
                              [--reason "..."] [--by name]

tako agent default <claude|codex> <providerId>   # 配默认 provider
tako agent defaults                     # 看现有默认
```

`<sid>` 接受**前缀匹配**：`tako agent send abc123 "..."` 会自动展开到唯一匹配的完整 sid，
匹配不上多个就报错。

## 完整工作流示例

### 派一个 agent 去做研究，主线程继续干别的

```bash
# 1. 起 codex agent，gpt-5.5，工作目录设到目标 repo
SID=$(tako agent start codex --model gpt-5.5 --cwd ~/work/myrepo --name research \
        | grep "sid:" | awk '{print $2}')

# 2. 丢任务进去（阻塞，但你可以用 nohup/bg/另开 shell 让它后台跑）
nohup tako agent send "$SID" \
  "扫一下 src/ 里所有 TODO 注释，按文件分组列出，并对前 5 个最关键的提建议" \
  > ~/research.log 2>&1 &

# 3. 主线程继续工作，过一会回来看
tako agent attach "$SID"        # 实时跟流
# 或：
tako agent show "$SID" --lines 100  # 静态查看最近 100 条
```

### 多 turn 对话续接

```bash
SID=$(tako agent start claude --model claude-opus-4-7 --name code-review \
        | grep "sid:" | awk '{print $2}')

tako agent send "$SID" "review packages/cli/src/agent/manager.ts 里的并发安全"
# ...看完输出，决定追问
tako agent send "$SID" "针对你说的第 3 点，给一个 Lock 实现的最小补丁"
# 历史自动留着，不用每次重发上下文
```

### 并发多 session

```bash
A=$(tako agent start codex  --name alpha | grep sid: | awk '{print $2}')
B=$(tako agent start claude --name beta  | grep sid: | awk '{print $2}')

tako agent send "$A" "..." &        # 各跑各的
tako agent send "$B" "..." &
wait

tako agent list   # 看两个谁先完成
```

### 监控 + 取消

```bash
# 一个长 turn，跑飞了想中止：
tako agent cancel "$SID"            # SIGTERM 当前 send 子进程；session 不关

# 看不到进展担心卡住：
tako agent show "$SID" --lines 5    # 看最后几帧
# 或：
tako agent attach "$SID"            # 实时跟
```

### 外部 LLM 当门卫（codex 限定）— **wait 模式 ⭐**

**核心场景**：你（外部 LLM）派 codex 去改代码，但每次想跑命令/改文件你都要看一眼再批。

**LLM 友好的 request/response 范式**：用 `send --bg` + `wait` 把流式过程拆成离散事件，每次 wait 阻塞到下一个决策点，LLM 调一次拿一个事件。

```bash
# 1. 起带外置审批 + 让 LLM 当门卫的 codex
SID=$(tako agent start codex --approval external --model gpt-5.5 --cwd ~/work --json \
        2>/dev/null | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}')

# 2. send --bg 立即返回 — 不再阻塞等 turn 结束
SINCE=$(tako agent send --bg --json "$SID" "把 README 第一段翻成中文" | jq -r .since)

# 3. 事件循环：每次 wait 一个事件
while :; do
  EVENT=$(tako agent wait --json --since "$SINCE" "$SID")
  EXIT=$?
  case $EXIT in
    0)  # approval_required — LLM 决策点
        APPROVAL_ID=$(echo "$EVENT" | jq -r '.pending[0].approvalId')
        DETAIL=$(echo "$EVENT" | jq -r '.pending[0].detail')
        # ⬅ 这里 LLM 看 DETAIL 判断 allow/deny
        if echo "$DETAIL" | grep -qE '\b(rm -rf|sudo|curl.*\|.*sh)\b'; then
          tako agent approve "$SID" "$APPROVAL_ID" deny --reason "黑名单" --by my-llm
        else
          tako agent approve "$SID" "$APPROVAL_ID" allow --rule "$(echo "$DETAIL" | grep -oE 'command=\S+' | head)" --by my-llm
        fi
        ;;
    2)  # turn_completed — assistant 完整文本在 .text
        echo "$EVENT" | jq -r .text
        break
        ;;
    1|3) echo "error or closed: $EVENT"; break ;;
  esac
done
```

**事件 → 退出码映射**（LLM 用 `$?` 直接分支）：

| event | exit | 含义 |
|---|---|---|
| approval_required | 0 | 等你审批；stdout 含 pending 列表 |
| turn_completed    | 2 | turn 完了；stdout 含 assistant 最终文本 |
| session_closed    | 3 | session 被关闭 |
| error / timeout   | 1 | 异常 |

**为什么 wait 优于轮询 pending**：
- 轮询要 sleep + 判断"还有没有 pending"+"turn 完了没"，状态机外置在 LLM 上
- wait 把状态机塞进 tako 自己，LLM 一句 wait 拿到下一帧 + 退出码即知道做什么
- token 节省 ~70%（vs send 全流），延迟 ≤200ms（文件 stat 轮询粒度）

**`approve --rule` 把这次决策推广到未来**：审一条同时把同模式命令加进 session 白名单，下次同款 driver 直接 auto_allow，不再 wait。配 wait 用就是"开头几个 turn 教一下规则，后面全自动跑"。

**归一帧流里的关键事件**（外部 LLM 应当识别）：
- `approval_required` 帧 — codex 在等批；params 里有命令/补丁详情
- `tool_result` 带 `output.approval == "allowed"` — driver 把"批了"也写进日志
- `error` 带 `"approval denied"` — 拒绝的审计记录

**注意**：
- approve 命令是写文件 (`<sid>/approvals/<id>.resp.json`)，driver 进程通过 200ms 轮询发现，所以延迟最多 ~200ms
- 默认审批超时 5 分钟。超时按 deny 处理（保守）
- `agent pending` 仅返回 `<id>.req.json` 存在但 `.resp.json` 不存在的 — 已批的不再列
- 外部 LLM 千万不要把 approval_required 帧的 `params` 直接 echo 给 codex 当 prompt（prompt injection 风险）—— 用判断逻辑，不要"复读"

### 批量审批策略（policy 层）

每条 tool call 都让大模型审太贵；tako 在 driver 和外置审批文件桥之间夹了一层**本地静态策略**：

```
codex 发 requestApproval
        ↓
  evaluatePolicy(policy, method, params, workdir)
        ↓
   ┌─────────┬─────────┐
auto_allow  auto_deny  ask
   ↓          ↓          ↓
直接 reply   直接 reply  写文件桥让人/LLM 决定
+ audit 帧  + audit 帧
```

**默认策略**已经覆盖大部分常见场景：
- `auto_allow`：`ls`/`cat`/`grep`/`find`/`git status`/`tsc --noEmit`/`npm run test` 等只读、构建、测试类
- `auto_deny`：`sudo`/`rm -rf $HOME`/`curl|sh`/`fork bomb`/`git push --force` 等明显危险
- 其他（含一般 `curl`、`npm install`、写工作目录外文件）→ `ask`

```bash
# 看默认策略
tako agent policy default-show

# 看本 session 的有效策略（默认 + 全局 + session 合并）
tako agent policy <sid> show

# 给 session 加自定义规则
tako agent policy <sid> allow-exec '^\s*curl https://api\.github\.com'
tako agent policy <sid> deny-exec  '^\s*npm\s+publish'

# 重置 session 策略
tako agent policy <sid> reset
```

**最爽的快捷方式 — `approve --rule`**：审批一条同时把同款命令加进白名单。下次同模式不再问：

```bash
# pending 显示一个 curl 请求；审了它，并且未来所有 curl -X 都自动批
tako agent approve <sid> 0 allow --rule '^\s*curl\s+-' --reason "GitHub API 安全"
```

之后这个 session 里所有 `curl -...` 会被 driver 直接自动批，不再发 approval_required 帧。

**全局策略**（影响所有未自定义的 session）：编辑 `~/.tako/agent-policy.json`，schema 同 session policy，driver 启动时合并。

**评估顺序**（黑名单优先白名单）：
1. exec_deny 任一命中 → auto_deny
2. exec_allow 任一命中 → auto_allow
3. 否则 ask

**写文件审批**（fileChange / patch）：默认非严格模式下，所有路径都在 cwd 子树内 → auto_allow；任一路径命中 file_deny（如 `.env` / `.ssh/`）→ auto_deny。开 `strict_workdir: true` 后，路径出 cwd 一律 auto_deny。

## 归一化事件帧（attach / show 看到的）

每行是一个 JSON 对象：

| kind | 含义 | 关键字段 |
|---|---|---|
| `session_started` | session 创建 | sid, backend, model |
| `turn_started` | 一轮开始 | turnId |
| `text_delta` | assistant 文本片段（流式 token / 整段一次给均有可能） | text, itemId |
| `reasoning_delta` | 思考流（codex / claude thinking） | text |
| `tool_use` | agent 调用了工具（shell/file/mcp） | name, input, itemId |
| `tool_result` | 工具执行结果 | itemId, output |
| `approval_required` | server 让 client 审批（MVP 自动 deny） | approvalType, params |
| `turn_completed` | 一轮结束 | turnId, stopReason, usage |
| `error` | 错误 | message, raw |
| `session_closed` | close 完成 | — |

## 常见坑

1. **没找到 provider**：`tako agent start` 报"没找到可用的 provider"
   → 先 `tako` 进交互菜单配一个，或显式 `--provider <id>`，或 `tako agent default codex <id>`

2. **claude 的 --model 跟 provider 不兼容**：例如 Claude Max 订阅访问不到 deepseek
   → tako 已经做了智能路由（找含模型的 provider），还不行就 `--provider <id>` 显式指定

3. **codex 第一轮没 threadId 是正常的**：codex 的 thread 必须在跑过一个 turn 之后才有持久化 rollout，
   所以 `start` 不真起 thread，第一次 `send` 才创建。这意味着：start 完没 send 就 close 不会留 codex 痕迹

4. **审批两种模式**：
   - 默认 `--approval yolo`：`approvalPolicy=never` + `sandbox=danger-full-access`，codex 不问、不沙箱，跑啥批啥。**不适合**让外部 agent 自动驱动。
   - `--approval external`：`approvalPolicy=untrusted` + `sandbox=workspace-write`，codex 主动发 requestApproval，driver 写文件等响应（`tako agent approve` 写回）。**外部 LLM 当门卫的正路。**
   - claude 当前还没接（claude headless 只能通过 MCP server `--permission-prompt-tool` 接，下一版加）

5. **send 是阻塞的**：在另一个 shell `agent attach` 才能边跑边看；或者 `agent send ... &` 后台

6. **`__env` 不持久化**：meta.json 里看不到 API key 等环境变量，运行时由 tako 现算注入；
   每次 send 都会重新解析 provider，所以你换默认 provider 后下一次 send 就跟着切了

## 与 ACP / MCP 的关系

- 本 skill **不是** ACP 也不是 MCP，是 tako 内部的薄管理层
- 底下：claude 用的是 `claude --print --input-format stream-json --output-format stream-json --resume <sid>`
  （headless 模式），codex 用的是 `codex app-server`（stdio JSON-RPC，per-turn spawn）
- 之后如果要把这层包成 ACP server / MCP server / 自定义 NDJSON 接口给外部调用，
  改外层 framing 即可，内部 SessionManager + Driver 不动

## 安装 / 自检

```bash
which tako                    # 必须存在
tako --version                # 0.2.53+
tako agent help               # 看子命令清单
```

如果 `tako agent` 报"未知子命令"，说明 tako 版本太老，升级一下。
