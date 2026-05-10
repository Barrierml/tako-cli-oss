/**
 * 模型目录类型
 */

export interface ModelEntry {
  /** 模型 id（去前缀、去变体后缀），如 "claude-haiku-4-5" */
  id: string;
  /** 显示名 */
  displayName: string;
  /** 提供商 id，如 "anthropic" / "openai" / "google" */
  provider: string;
  /** 上下文窗口大小（token 数） */
  contextWindow: number;
  /** 输出限额（token 数），可选 */
  outputLimit?: number;
}

export interface CatalogSnapshot {
  fetchedAt: number;
  entries: ModelEntry[];
}
