import { theme, style } from "./colors";

/**
 * 状态栏渲染器 — 单行紧凑布局
 *
 * 📁 ~/ccgo │ 🌿 main ✓ │ 🤖 Opus 4.5 │ ⚡73% │ 💰5h:$47.70/$50
 */
export class StatusLineRenderer {
  private separator = `${theme.separator} │ ${style.reset}`;

  render(segments: Map<string, string | null>): string {
    const ids = ["directory", "git", "model", "context", "quota"];
    const parts: string[] = [];

    for (const id of ids) {
      const content = segments.get(id);
      if (content) parts.push(content);
    }

    return parts.join(this.separator);
  }
}
