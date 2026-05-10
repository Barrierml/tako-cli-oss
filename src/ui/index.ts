/**
 * UI 模块入口 — Ink 单实例路由
 */

import { launchClientUnified } from "../launcher";
import { getClient } from "../clients/base";
import { t } from "../i18n";
import { track } from "../analytics";
import { log } from "../logger";
import { migrateIfNeeded, fixupProviders, getProviders } from "../providers";
import { selectProviderForClient, runProviderDetection } from "./providers";
import { startApp, type LauncherResult } from "./ink";
import { fetchAndMaybeShowAnnouncement } from "../announcements";
import { refreshAllTakoCatalogs } from "../models";

/**
 * 主入口
 */
export async function main(): Promise<void> {
  await migrateIfNeeded();
  await fixupProviders();
  await runProviderDetection();

  // Par 模型目录刷新：冷桶（首次启动）阻塞到拉完，热桶（>1h 过期）后台刷新。
  // 加 3s 超时保护，网络抖时也不挂死 launcher。
  await Promise.race([
    refreshAllTakoCatalogs(await getProviders()),
    new Promise<void>((r) => setTimeout(r, 3000)),
  ]);

  // 启动公告：从默认 par 拉一次 popup，若有未看过的就先弹。
  // 任何失败（无 provider / 网络 / 解析）都静默跳过，不影响 launcher。
  await fetchAndMaybeShowAnnouncement();

  // Ink 单实例主循环（无 provider 时 LauncherView 会显示提示，不阻塞）
  while (true) {
    const result = await startApp();

    if (!result) break; // exit

    // launch — Ink 已 unmount，处理启动
    const client = getClient(result.clientId);
    if (!client) continue;

    track("menu_action", { action: "launch", client_id: result.clientId });

    const providerContext = await selectProviderForClient(result.clientId);
    if (!providerContext) {
      log.warn(t("cli.noProvider") || "未配置可用的服务商");
      continue;
    }

    const launchResult = await launchClientUnified(client, {
      projectPath: result.projectPath,
      args: result.args,
      selectedOptionIds: result.selectedOptionIds,
      providerContext,
    });

    if (!launchResult.success) {
      log.error(launchResult.error || t("cli.launchFailed"));
    }
    // 循环回 startApp()，重新渲染主菜单
  }
}
