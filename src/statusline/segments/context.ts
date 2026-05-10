import type { Segment, StatusLineInput } from "../types";
import { theme, style, getIcon, fg } from "../colors";
import { getModelEntry } from "../../models";

const DEFAULT_CONTEXT_LIMIT = 200000;

/**
 * Context Segment：行内显示上下文剩余百分比
 * 格式：⚡73%
 *
 * 上下文窗口从 models 模块查询（覆盖全网主流模型 + [1m] 变体）。
 * 找不到对应条目时回落到 200K。
 */
export class ContextSegment implements Segment {
  id = "context";

  private static cache: { path: string; tokens: number | null; timestamp: number } | null = null;
  private static readonly CACHE_TTL = 5000;

  async render(input: StatusLineInput): Promise<string | null> {
    const tokens = await this.getTokensWithCache(input.transcript_path);
    const entry = getModelEntry(input.model.id);
    const limit = entry?.contextWindow ?? DEFAULT_CONTEXT_LIMIT;
    const usedPercent = Math.round(((tokens ?? 0) / limit) * 100);
    const remainingPercent = Math.max(0, 100 - usedPercent);

    const icon = getIcon("context");
    const color = remainingPercent <= 20 ? fg.brightRed
      : remainingPercent <= 50 ? fg.brightYellow
      : fg.brightGreen;

    return `${theme.context.icon}${icon}${style.reset} ${color}${remainingPercent}%${style.reset}`;
  }

  private async getTokensWithCache(transcriptPath: string): Promise<number | null> {
    const now = Date.now();
    if (
      ContextSegment.cache &&
      ContextSegment.cache.path === transcriptPath &&
      now - ContextSegment.cache.timestamp < ContextSegment.CACHE_TTL
    ) {
      return ContextSegment.cache.tokens;
    }
    const tokens = await this.parseTranscriptTokens(transcriptPath);
    ContextSegment.cache = { path: transcriptPath, tokens, timestamp: now };
    return tokens;
  }

  private async parseTranscriptTokens(transcriptPath: string): Promise<number | null> {
    try {
      const file = Bun.file(transcriptPath);
      if (!(await file.exists())) return null;
      const content = await file.text();
      if (!content.trim()) return null;

      const lines = content.split("\n").filter((line) => line.trim());
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry.type === "assistant" && entry.message?.usage) {
            const u = entry.message.usage;
            return (u.input_tokens || 0) + (u.output_tokens || 0) +
              (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
          }
        } catch { continue; }
      }
      return null;
    } catch { return null; }
  }
}
