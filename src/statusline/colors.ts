/**
 * ANSI 颜色工具
 *
 * 提供终端颜色支持，让状态栏更酷炫
 */

// ANSI 转义码
const ESC = "\x1b[";
const RESET = `${ESC}0m`;

// 16 色前景色
export const fg = {
  black: `${ESC}30m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,
  // 亮色
  brightBlack: `${ESC}90m`,
  brightRed: `${ESC}91m`,
  brightGreen: `${ESC}92m`,
  brightYellow: `${ESC}93m`,
  brightBlue: `${ESC}94m`,
  brightMagenta: `${ESC}95m`,
  brightCyan: `${ESC}96m`,
  brightWhite: `${ESC}97m`,
};

// 16 色背景色
export const bg = {
  black: `${ESC}40m`,
  red: `${ESC}41m`,
  green: `${ESC}42m`,
  yellow: `${ESC}43m`,
  blue: `${ESC}44m`,
  magenta: `${ESC}45m`,
  cyan: `${ESC}46m`,
  white: `${ESC}47m`,
  // 亮色
  brightBlack: `${ESC}100m`,
  brightRed: `${ESC}101m`,
  brightGreen: `${ESC}102m`,
  brightYellow: `${ESC}103m`,
  brightBlue: `${ESC}104m`,
  brightMagenta: `${ESC}105m`,
  brightCyan: `${ESC}106m`,
  brightWhite: `${ESC}107m`,
};

// 样式
export const style = {
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  italic: `${ESC}3m`,
  underline: `${ESC}4m`,
  reset: RESET,
};

/**
 * 256 色前景色
 */
export function fg256(code: number): string {
  return `${ESC}38;5;${code}m`;
}

/**
 * 256 色背景色
 */
export function bg256(code: number): string {
  return `${ESC}48;5;${code}m`;
}

/**
 * RGB 前景色 (真彩色)
 */
export function fgRgb(r: number, g: number, b: number): string {
  return `${ESC}38;2;${r};${g};${b}m`;
}

/**
 * RGB 背景色 (真彩色)
 */
export function bgRgb(r: number, g: number, b: number): string {
  return `${ESC}48;2;${r};${g};${b}m`;
}

/**
 * 给文本添加颜色
 */
export function color(text: string, ...codes: string[]): string {
  if (codes.length === 0) return text;
  return `${codes.join("")}${text}${RESET}`;
}

/**
 * 渲染带颜色的 segment
 */
export function segment(icon: string, text: string, iconColor: string, textColor: string): string {
  return `${iconColor}${icon}${style.reset} ${textColor}${text}${style.reset}`;
}

// 预定义的主题色（基于 CCLine 的风格）
export const theme = {
  // 目录 - 黄色系
  directory: {
    icon: fg.brightYellow,
    text: fg.brightGreen,
  },
  // Git - 蓝色系
  git: {
    icon: fg.brightBlue,
    text: fg.brightBlue,
    clean: fg.brightGreen,
    dirty: fg.brightYellow,
    conflict: fg.brightRed,
  },
  // 模型 - 青色系
  model: {
    icon: fg.brightCyan,
    text: fg.brightCyan,
  },
  // 版本 - 白色
  version: {
    icon: fg.brightWhite,
    text: fg.brightBlack,
  },
  // 输出样式 - 洋红色
  outputStyle: {
    icon: fg.brightMagenta,
    text: fg.brightMagenta,
  },
  // 上下文 - 根据使用率变色
  context: {
    icon: fg.brightMagenta,
    low: fg.brightGreen,    // < 50%
    medium: fg.brightYellow, // 50-80%
    high: fg.brightRed,      // > 80%
  },
  // 今日使用 - 绿色系
  todayUsage: {
    icon: fg.brightGreen,
    text: fg.brightGreen,
  },
  // 分隔符
  separator: fg.brightBlack,
};

// Nerd Font 图标（带 fallback）
export const icons = {
  directory: { nerd: "\uf07b", plain: "📁" },      // nf-fa-folder
  git: { nerd: "\ue725", plain: "🌿" },            // nf-dev-git_branch
  model: { nerd: "\uf11b", plain: "🤖" },          // nf-fa-gamepad (AI)
  version: { nerd: "\uf412", plain: "💾" },        // nf-oct-package
  outputStyle: { nerd: "\uf12f5", plain: "🎯" },   // target
  context: { nerd: "\uf0e7", plain: "⚡" },        // nf-fa-bolt
  todayUsage: { nerd: "\uf155", plain: "💰" },     // nf-fa-dollar
  gitClean: "✓",
  gitDirty: "●",
  gitConflict: "⚠",
  gitAhead: "↑",
  gitBehind: "↓",
};

/**
 * Nerd Font 检测
 * 当前始终返回 false，使用 emoji/plain 图标
 */
export function hasNerdFont(): boolean {
  return false;
}

/**
 * 获取图标（根据终端能力选择）
 */
export function getIcon(key: keyof typeof icons): string {
  const icon = icons[key];
  if (typeof icon === "string") return icon;

  return hasNerdFont() ? icon.nerd : icon.plain;
}
