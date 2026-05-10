import type { Segment, StatusLineInput } from "../types";
import { theme, style, getIcon } from "../colors";

/**
 * 模型名称映射表
 */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Opus 4.5
  "claude-opus-4-5-20251101": "Opus 4.5",
  "claude-opus-4-5": "Opus 4.5",
  // Sonnet 4.5
  "claude-sonnet-4-5-20250514": "Sonnet 4.5",
  "claude-sonnet-4-5": "Sonnet 4.5",
  // Sonnet 4
  "claude-sonnet-4-20250514": "Sonnet 4",
  "claude-sonnet-4": "Sonnet 4",
  // Sonnet 3.5
  "claude-sonnet-3-5-20241022": "Sonnet 3.5",
  "claude-3-5-sonnet-20241022": "Sonnet 3.5",
  "claude-3-5-sonnet": "Sonnet 3.5",
  // Haiku 3.5
  "claude-haiku-3-5-20241022": "Haiku 3.5",
  "claude-3-5-haiku-20241022": "Haiku 3.5",
  "claude-3-5-haiku": "Haiku 3.5",
};

/**
 * Model Segment：显示当前模型名称
 */
export class ModelSegment implements Segment {
  id = "model";

  render(input: StatusLineInput): string {
    const modelId = input.model.id;
    const displayName = MODEL_DISPLAY_NAMES[modelId] || this.simplifyModelName(input.model.display_name);
    const icon = getIcon("model");

    return `${theme.model.icon}${icon}${style.reset} ${theme.model.text}${displayName}${style.reset}`;
  }

  /**
   * 简化模型名称（对于未知模型）
   */
  private simplifyModelName(displayName: string): string {
    // 移除 "Claude " 前缀
    let name = displayName.replace(/^Claude\s+/i, "");
    // 移除日期后缀
    name = name.replace(/-\d{8}$/, "");
    return name;
  }
}
