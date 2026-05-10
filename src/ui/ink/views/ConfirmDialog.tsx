/**
 * Ink 确认弹窗
 *
 * 替代 @clack/prompts 的 confirm()，统一在 Ink 框架内渲染。
 */

import React, { useState } from "react";
import { render, Box, Text, useInput } from "ink";

function ConfirmDialogComponent({ message, defaultValue, onResult }: {
  message: string;
  defaultValue: boolean;
  onResult: (confirmed: boolean) => void;
}) {
  const [selected, setSelected] = useState(defaultValue);

  useInput((input, key) => {
    if (key.leftArrow || key.rightArrow || input === "h" || input === "l") {
      setSelected((p) => !p);
      return;
    }
    if (input === "y" || input === "Y") { onResult(true); return; }
    if (input === "n" || input === "N") { onResult(false); return; }
    if (key.return) { onResult(selected); return; }
    if (key.escape) { onResult(false); return; }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box gap={1}>
        <Text color="yellow" bold>?</Text>
        <Text bold>{message}</Text>
      </Box>
      <Box marginTop={1} gap={3}>
        <Box gap={1}>
          <Text color={selected ? "green" : undefined} bold={selected} inverse={selected}>
            {selected ? " Yes " : " Yes "}
          </Text>
        </Box>
        <Box gap={1}>
          <Text color={!selected ? "red" : undefined} bold={!selected} inverse={!selected}>
            {!selected ? " No " : " No "}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>←→ 切换  y/n 快捷选择  Enter 确认  Esc 取消</Text>
      </Box>
    </Box>
  );
}

/**
 * 显示确认弹窗，返回用户选择
 */
export async function inkConfirm(options: {
  message: string;
  defaultValue?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let instance: ReturnType<typeof render> | null = null;

    instance = render(
      <ConfirmDialogComponent
        message={options.message}
        defaultValue={options.defaultValue ?? true}
        onResult={(confirmed) => {
          instance?.clear();
          instance?.unmount();
          instance = null;
          resolve(confirmed);
        }}
      />
    );
  });
}
