/**
 * Key Setup Guide — 引导用户配置 Tako API Key
 *
 * 非强制弹窗，每天最多一次，可永久关闭
 */

import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { join } from "path";
import { TAKO_DIR } from "../../../config";
import { hasApiKey } from "../../../config";
import { getLocale } from "../../../i18n";

// ─── Dismiss 节流 ────────────────────────────────────

const DISMISS_FILE = join(TAKO_DIR, ".key-prompt.json");

interface DismissData {
  dismissed?: string;  // ISO date "2026-04-24"
  never?: boolean;
}

async function readDismiss(): Promise<DismissData> {
  try {
    return await Bun.file(DISMISS_FILE).json();
  } catch {
    return {};
  }
}

async function writeDismiss(data: DismissData): Promise<void> {
  await Bun.write(DISMISS_FILE, JSON.stringify(data));
}

/**
 * 是否需要展示 Key 引导弹窗
 */
export async function shouldShowKeyGuide(): Promise<boolean> {
  if (await hasApiKey()) return false;

  const data = await readDismiss();
  if (data.never) return false;

  const today = new Date().toISOString().slice(0, 10);
  if (data.dismissed === today) return false;

  return true;
}

// ─── Guide Actions ───────────────────────────────────

export type GuideAction = "configure" | "skip" | "never";

export async function dismissKeyGuide(action: "skip" | "never"): Promise<void> {
  if (action === "never") {
    await writeDismiss({ never: true });
  } else {
    const today = new Date().toISOString().slice(0, 10);
    await writeDismiss({ dismissed: today });
  }
}

// ─── Component ───────────────────────────────────────

interface Option {
  id: GuideAction;
  label: { en: string; zh: string };
  hint: { en: string; zh: string };
  color?: string;
}

const OPTIONS: Option[] = [
  {
    id: "configure",
    label: { en: "Configure now", zh: "现在配置" },
    hint: { en: "Enter your Tako API Key", zh: "输入你的 Tako API Key" },
    color: "cyan",
  },
  {
    id: "skip",
    label: { en: "Not now", zh: "稍后再说" },
    hint: { en: "Remind me tomorrow", zh: "明天再提醒我" },
  },
  {
    id: "never",
    label: { en: "Don't ask again", zh: "不再提示" },
    hint: { en: "You can configure later via c key", zh: "之后可以按 c 随时配置" },
  },
];

export function KeySetupGuide({ onDone }: { onDone: (action: GuideAction) => void }) {
  const [idx, setIdx] = useState(0);
  const zh = getLocale() === "zh";

  useInput(useCallback((input: string, key: any) => {
    if (key.upArrow) { setIdx((p) => (p > 0 ? p - 1 : OPTIONS.length - 1)); return; }
    if (key.downArrow) { setIdx((p) => (p < OPTIONS.length - 1 ? p + 1 : 0)); return; }
    if (key.escape) { onDone("skip"); return; }
    if (key.return) { onDone(OPTIONS[idx].id); return; }
  }, [idx, onDone]));

  return (
    <Box flexDirection="column" paddingX={0} paddingY={1}>
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>

        {/* Title */}
        <Box gap={1}>
          <Text color="cyan" bold>🔑</Text>
          <Text bold>{zh ? "配置 Tako API Key" : "Configure Tako API Key"}</Text>
        </Box>

        {/* Description */}
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>
            {zh
              ? "配置 API Key 后即可使用 Tako 代理服务，获得统一的配额管理和更快的访问速度。"
              : "Configure your API Key to use Tako proxy service with unified quota and faster access."}
          </Text>
          <Text dimColor>
            {zh
              ? "你也可以跳过此步骤，直接使用其他服务商。"
              : "You can skip this and use other providers instead."}
          </Text>
        </Box>

        {/* Options */}
        <Box marginTop={1} flexDirection="column">
          {OPTIONS.map((opt, i) => {
            const focused = i === idx;
            return (
              <Box key={opt.id} paddingLeft={1} gap={1}>
                <Text color={focused ? (opt.color || "white") : undefined} bold={focused}>
                  {focused ? "▸" : " "}
                </Text>
                <Text bold={focused} color={focused ? (opt.color || "white") : undefined}>
                  {zh ? opt.label.zh : opt.label.en}
                </Text>
                {focused && (
                  <Text dimColor>{zh ? opt.hint.zh : opt.hint.en}</Text>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Footer */}
      <Box paddingX={2} marginTop={1} justifyContent="center" gap={2}>
        <Text dimColor bold>↑↓</Text><Text dimColor>{zh ? "选择" : "select"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>Enter</Text><Text dimColor>{zh ? "确认" : "confirm"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>Esc</Text><Text dimColor>{zh ? "跳过" : "skip"}</Text>
      </Box>
    </Box>
  );
}
