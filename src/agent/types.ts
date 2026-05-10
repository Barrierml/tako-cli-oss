/**
 * Agent session 模块共享类型
 *
 * 把 Claude Code 的 stream-json 和 Codex 的 app-server JSON-RPC 两套
 * 完全异构的协议，归一成一个简单事件流（NormalizedFrame）写进 log.ndjson。
 * 上层（CLI/TUI/外部 agent）只读这一种格式，省得每家都贴一遍。
 */

export type Backend = "claude" | "codex";

export type SessionStatus =
  | "idle"      // 创建好但还没发过 turn / 上一 turn 已完
  | "running"   // 当前正在跑一个 turn
  | "awaiting_approval"  // 当前 turn 卡在等审批
  | "closed"    // 用户主动 close
  | "dead";     // 子进程异常退出（仅 codex 长驻进程相关）

/**
 * 工具调用审批策略
 *
 * yolo:     默认。不审批，sandbox 全开 — 适合可信单机
 * external: 等外部审批。codex 发的 requestApproval RPC 会写到文件等响应，
 *           前台用户/外部 LLM/TUI 通过 `tako agent approve` 决定 allow/deny
 */
export type ApprovalMode = "yolo" | "external";

/**
 * 持久化 meta，存到 ~/.tako/agent-sessions/<sid>/meta.json
 */
export interface SessionMeta {
  sid: string;
  backend: Backend;
  /** 用户友好名（list 时展示） */
  name: string;
  /** 模型 id（如 claude-opus-4-7 / gpt-5.5），空表示由 driver 默认 */
  model?: string;
  /** 工作目录 */
  workdir: string;
  status: SessionStatus;
  /** 工具调用审批策略，默认 yolo */
  approvalMode?: ApprovalMode;
  /** 已完成 turn 数。0 = 从未 send 过 */
  turnCount: number;
  createdAt: number;
  lastActiveAt: number;

  /** Provider 选择记录（给 send 时还原 env） */
  providerId?: string;

  /** Codex 专用：当前 thread id（thread/start 后写入） */
  codexThreadId?: string;
  /** Codex 专用：长驻 app-server PID + socket 路径 */
  codexPid?: number;
  codexSocket?: string;
}

/**
 * 归一化事件帧 — 写进 log.ndjson 的每一行。
 * 加 ts 让 attach 看时间线，加 turnId 区分多轮。
 */
export type NormalizedFrame =
  | { ts: number; kind: "session_started"; sid: string; backend: Backend; model?: string }
  | { ts: number; kind: "turn_started"; turnId: string }
  | { ts: number; kind: "text_delta"; text: string; itemId?: string }
  | {
      ts: number;
      kind: "tool_use";
      name: string;
      input: unknown;
      itemId?: string;
    }
  | {
      ts: number;
      kind: "tool_result";
      itemId?: string;
      output: unknown;
    }
  | {
      ts: number;
      kind: "reasoning_delta";
      text: string;
    }
  | {
      ts: number;
      kind: "approval_required";
      approvalId: string | number;
      approvalType: "exec" | "patch" | "permission" | "tool" | "other";
      params: unknown;
    }
  | {
      ts: number;
      kind: "turn_completed";
      turnId?: string;
      stopReason?: string;
      usage?: unknown;
    }
  | { ts: number; kind: "error"; message: string; raw?: unknown }
  | { ts: number; kind: "session_closed" };

/**
 * Driver 接口 — 每家 backend 实现一份。
 * 负责把底层协议翻成 NormalizedFrame 并落盘。
 */
export interface Driver {
  readonly backend: Backend;

  /**
   * 创建 session 资源（不一定起子进程，例如 claude 是 lazy）。
   * 返回 sid（Driver 自己生成 UUID 还是用 caller 给的，由 manager 决定）。
   */
  start(opts: StartOpts): Promise<SessionMeta>;

  /**
   * 发送一轮用户输入，流式归一帧到 log.ndjson + 可选回调。
   * 阻塞直到 turn_completed 或 error。
   */
  send(meta: SessionMeta, prompt: string, hooks?: SendHooks): Promise<SessionMeta>;

  /** 中止当前 turn（不关闭 session） */
  cancel(meta: SessionMeta): Promise<void>;

  /** 关闭 session，回收所有资源 */
  close(meta: SessionMeta): Promise<void>;

  /** 检查长驻子进程是否还活着；claude 永远返回 true（无常驻） */
  isAlive(meta: SessionMeta): Promise<boolean>;
}

export interface StartOpts {
  sid: string;
  name: string;
  model?: string;
  workdir: string;
  approvalMode?: ApprovalMode;
  /** 已经解析好的 env（provider 注入），driver 直接用 */
  env: Record<string, string>;
  /** 给 driver 留一点 backend 特定 hint，例如 codex 用什么 model_provider */
  providerHint?: {
    type: string;
    apiKey?: string;
    baseUrl?: string;
  };
  providerId?: string;
}

export interface SendHooks {
  /** 每接收到归一帧就触发；attach 模式下用来转发给 stdout */
  onFrame?: (frame: NormalizedFrame) => void;
}
