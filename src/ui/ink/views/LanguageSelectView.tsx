import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { t, getLocale, setLocale, type Locale } from "../../../i18n";

const LANGUAGES: Array<{ value: Locale; label: string }> = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
];

export function LanguageSelectView({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(LANGUAGES.findIndex((l) => l.value === getLocale()));

  useInput((input, key) => {
    if (key.upArrow) setIdx((p) => (p > 0 ? p - 1 : LANGUAGES.length - 1));
    if (key.downArrow) setIdx((p) => (p < LANGUAGES.length - 1 ? p + 1 : 0));
    if (key.return) { setLocale(LANGUAGES[idx].value); onDone(); }
    if (key.escape) onDone();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={2} paddingY={1}>
      <Text bold>🌐 {t("menu.changeLanguage")}</Text>
      {LANGUAGES.map((lang, i) => (
        <Box key={lang.value} gap={1} marginTop={i === 0 ? 1 : 0}>
          <Text color="cyan" bold={i === idx}>{i === idx ? "▸" : " "}</Text>
          <Text bold={i === idx}>{lang.label}</Text>
          {lang.value === getLocale() && <Text dimColor>←</Text>}
        </Box>
      ))}
      <Box marginTop={1}><Text dimColor>Enter select  Esc back</Text></Box>
    </Box>
  );
}
