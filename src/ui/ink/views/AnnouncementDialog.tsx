/**
 * Ink 公告弹窗 — 启动时把 par 服务端推的当前公告显式提示一次。
 *
 * 不绑定本地版本号：服务端 admin 推啥就显示啥；类型决定边框颜色，popup_once
 * 决定是否记进「已看过」列表。
 *
 * 与 ConfirmDialog 不同点：单按钮（Enter/Esc/q 都关），不返回布尔值。
 */

import React from "react";
import { render, Box, Text, useInput } from "ink";

export interface AnnouncementPayload {
  id: string;
  title: string;
  content: string;
  /** info | success | warning | danger（与 par admin 后台一致） */
  type?: string;
  popup_once?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  info: "cyan",
  success: "green",
  warning: "yellow",
  danger: "red",
};

function colorForType(type?: string): string {
  return TYPE_COLORS[type ?? "info"] ?? "cyan";
}

function AnnouncementDialogComponent({
  ann,
  onClose,
}: {
  ann: AnnouncementPayload;
  onClose: () => void;
}) {
  useInput((input, key) => {
    if (key.return || key.escape || input === "q") {
      onClose();
    }
  });

  const color = colorForType(ann.type);
  const lines = ann.content.split(/\r?\n/);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={2}
      paddingY={1}
    >
      <Box>
        <Text color={color} bold>
          📣 {ann.title}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {lines.map((line, i) => (
          <Text key={i}>{line || " "}</Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {ann.popup_once
            ? "按 Enter / Esc / q 关闭，本条只提示一次"
            : "按 Enter / Esc / q 关闭"}
        </Text>
      </Box>
    </Box>
  );
}

/**
 * 显示公告弹窗。Promise 在用户关闭时 resolve。
 */
export async function showAnnouncementDialog(ann: AnnouncementPayload): Promise<void> {
  return new Promise((resolve) => {
    let instance: ReturnType<typeof render> | null = null;

    instance = render(
      <AnnouncementDialogComponent
        ann={ann}
        onClose={() => {
          instance?.clear();
          instance?.unmount();
          instance = null;
          resolve();
        }}
      />,
    );
  });
}
