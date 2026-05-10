import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { t, getLocale } from "../../../i18n";
import { validateAndSaveKey } from "../../../auth";
import { identify, reset as resetAnalytics } from "../../../analytics";

export function ApiKeyInputView({ isReconfigure, onDone }: { isReconfigure: boolean; onDone: (ok?: boolean) => void }) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "validating" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const { stdin, setRawMode } = useStdin();

  useEffect(() => {
    if (!stdin) return;
    setRawMode(true);
    const handler = (data: Buffer) => {
      const str = data.toString();
      if (str.length > 1 && !str.startsWith("\x1b")) {
        setValue((prev) => prev + str.replace(/[\r\n]/g, ""));
      }
    };
    stdin.on("data", handler);
    return () => { stdin.off("data", handler); };
  }, [stdin, setRawMode]);

  const submit = useCallback(async () => {
    if (!value || status === "validating") return;
    setStatus("validating");
    const result = await validateAndSaveKey(value);
    if (result.success) {
      setStatus("success");
      resetAnalytics();
      identify();
      setTimeout(() => onDone(true), 500);
    } else {
      setStatus("error");
      setErrorMsg(result.error || "Validation failed");
    }
  }, [value, status, onDone]);

  useInput((input, key) => {
    if (key.escape) { onDone(false); return; }
    if (key.return) { submit(); return; }
    if (key.backspace || key.delete) { setValue((p) => p.slice(0, -1)); setStatus("idle"); return; }
    if (input && !key.ctrl && input.length === 1) { setValue((p) => p + input); setStatus("idle"); }
  });

  const masked = value.length <= 6 ? value :
    `${value.slice(0, 3)}${"•".repeat(Math.min(value.length - 6, 20))}${value.slice(-3)}`;

  const zh = getLocale() === "zh";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold color="cyan">🔑 {isReconfigure ? t("prompts.enterApiKey") : "API Key"}</Text>
      <Box marginTop={1}>
        <Text color="cyan" bold>{">"} </Text>
        <Text>{masked}</Text>
        {status === "idle" && <Text color="cyan">█</Text>}
      </Box>
      {status === "validating" && <Text color="yellow">⏳ {t("prompts.validating")}</Text>}
      {status === "success" && <Text color="green">✓ {t("prompts.keyConfigured")}</Text>}
      {status === "error" && <Text color="red">✗ {errorMsg}</Text>}
      <Box marginTop={1}>
        <Text dimColor>Enter {zh ? "提交" : "submit"}  Esc {zh ? "取消" : "cancel"}</Text>
      </Box>
    </Box>
  );
}
