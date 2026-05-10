/**
 * Launcher Entry
 */

import type { ClientConfig } from "../clients/base";
import type { ProviderContext } from "../providers/types";
import { ensureClientReady } from "../installer";
import { getDefaultProvider, getProvidersForClient, resolveProviderContext } from "../providers";
import { loadConfig } from "../config";
import { recordProjectLaunch, isValidDirectory } from "../project-history";
import { log } from "../logger";
import { t } from "../i18n";
import { track, hashProjectPath } from "../analytics";
import { launchClient as legacyLaunchClient } from "../launcher-legacy";

export interface LaunchOptions {
  projectPath?: string;
  args?: string[];
  selectedOptionIds?: string[];
  /** 调用方直接指定的 Provider（跳过选择） */
  providerContext?: ProviderContext;
}

export interface LaunchResult {
  success: boolean;
  error?: string;
  exitCode?: number;
}

/**
 * 为客户端解析 ProviderContext
 * 优先用 options 里的，否则自动选择
 */
async function resolveProvider(
  client: ClientConfig,
  options?: LaunchOptions,
): Promise<ProviderContext | null> {
  if (options?.providerContext) return options.providerContext;

  // 尝试默认 Provider
  const defaultProvider = await getDefaultProvider();
  if (defaultProvider) {
    const compatible = await getProvidersForClient(client.id);
    const isDefault = compatible.some((p) => p.id === defaultProvider.id);
    if (isDefault) return resolveProviderContext(defaultProvider);
    // 默认不兼容，取第一个兼容的
    if (compatible.length > 0) return resolveProviderContext(compatible[0]);
  }

  return null;
}

/**
 * Launch client
 */
export async function launchClientUnified(
  client: ClientConfig,
  options?: LaunchOptions
): Promise<LaunchResult> {
  try {
    const workingDir = options?.projectPath || process.cwd();
    if (options?.projectPath) {
      const dirExists = await isValidDirectory(options.projectPath);
      if (!dirExists) {
        return {
          success: false,
          error: t("launcher.directoryNotFound", { path: options.projectPath })
        };
      }
    }

    const installResult = await ensureClientReady(client);
    if (!installResult.success) return installResult;

    // 解析 Provider
    const providerContext = await resolveProvider(client, options);
    if (!providerContext) {
      return { success: false, error: t("launcher.apiKeyNotConfigured") };
    }

    // Setup config files
    if (client.setupConfigFiles) {
      await client.setupConfigFiles(providerContext, options?.selectedOptionIds);
    }

    await recordProjectLaunch(workingDir, client.id, options?.selectedOptionIds);

    const config = await loadConfig();
    const clientVersion = config.installedClients[client.id]?.version;
    track("client_launched", {
      client_id: client.id,
      client_version: clientVersion,
      project_hash: hashProjectPath(workingDir),
      is_recent_project: !!options?.projectPath,
    });

    log.info(t("launcher.starting", { client: client.name }));

    return await legacyLaunchClient(client, {
      ...options,
      providerContext,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Launch failed",
    };
  }
}
