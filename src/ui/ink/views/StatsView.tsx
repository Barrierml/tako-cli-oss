import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { t, getLocale } from "../../../i18n";
import { getUserStats, formatNumber, type UsageStats } from "../../../stats";

export function StatsViewComponent({ onExit }: { onExit: () => void }) {
  const [data, setData] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(10);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const result = await getUserStats();
    if (result.success && result.data) setData(result.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((p) => { if (p <= 1) { fetchStats(); return 10; } return p - 1; });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchStats]);

  useInput((input, key) => { if (input === "q" || key.escape) onExit(); });

  const zh = getLocale() === "zh";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={2} paddingY={1}>
      <Text bold>{t("stats.title")}</Text>
      {loading && !data ? (
        <Text dimColor>Loading...</Text>
      ) : data ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>{t("stats.totalRequests", { count: formatNumber(data.totalRequests) })}</Text>
          <Text>{t("stats.totalCost", { cost: data.totalCost })}</Text>
          <Text>{t("stats.todayCost", { cost: data.todayCost })}</Text>
          {data.modelStats.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold dimColor>{zh ? "模型分布" : "Model Distribution"}</Text>
              {data.modelStats.map((stat, i) => (
                <Text key={stat.model} dimColor>
                  {i === data.modelStats.length - 1 ? "└─" : "├─"} {stat.model.padEnd(25)} {String(stat.requests).padStart(5)} {stat.cost}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      ) : (
        <Text color="red">{zh ? "获取失败" : "Failed to load"}</Text>
      )}
      <Box marginTop={1}>
        <Text dimColor>{zh ? `${countdown}s 后刷新  q 返回` : `Refresh in ${countdown}s  q back`}</Text>
      </Box>
    </Box>
  );
}
