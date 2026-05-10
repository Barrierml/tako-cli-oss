/**
 * Analytics Module
 *
 * Provides anonymous usage tracking for Tako CLI.
 * - Non-blocking (fire-and-forget)
 * - Privacy-respecting (no sensitive data)
 * - Completely silent (never outputs errors)
 */

import { trackEvent, identifyUser, shutdown as shutdownClient } from "./client";
import { loadConfig } from "../config";
import { detectRegion } from "../region";
import { detectLocale } from "../i18n";
import { getCommonProperties } from "./properties";
import type { TakoEvent, EventProperties } from "./events";

export * from "./events";
export * from "./properties";

const VERSION = process.env.VERSION || "dev";

let identified = false;
let analyticsEnabled: boolean | null = null;

async function isEnabled(): Promise<boolean> {
  if (analyticsEnabled !== null) return analyticsEnabled;
  try {
    const config = await loadConfig();
    analyticsEnabled = config.telemetryEnabled !== false;
    return analyticsEnabled;
  } catch {
    analyticsEnabled = false;
    return false;
  }
}

/**
 * 获取用户唯一标识：
 * 1. Tako apiId（UUID）
 * 2. 默认 Provider 的 email（订阅用户）
 * 3. 默认 Provider 的 id
 * 4. "anonymous"
 */
async function getDistinctId(): Promise<string> {
  try {
    const config = await loadConfig();
    if (config.apiId) return config.apiId;

    // 从 Provider 获取
    const providers = config.providers ?? [];
    const defaultId = config.defaultProviderId;
    const defaultProv = defaultId
      ? providers.find((p) => p.id === defaultId)
      : providers[0];

    if (defaultProv) {
      if (defaultProv.apiId) return defaultProv.apiId;
      if (defaultProv.email) return defaultProv.email;
      return defaultProv.id;
    }

    return "anonymous";
  } catch {
    return "anonymous";
  }
}

/**
 * Identify the current user (once per session)
 */
export async function identify(): Promise<void> {
  if (identified) return;
  try {
    if (!(await isEnabled())) return;

    const config = await loadConfig();
    const distinctId = await getDistinctId();
    if (distinctId === "anonymous") return;

    // 从任意 Provider 获取 email（优先订阅用户的）
    const providers = config.providers ?? [];
    const email = providers.find((p) => p.email)?.email;

    const region = await detectRegion();
    identifyUser(distinctId, {
      ...(email ? { email } : {}),
      region,
      locale: detectLocale(),
      first_seen_version: VERSION,
      platform: process.platform,
      arch: process.arch,
    });
    identified = true;
  } catch {
    // Silently fail
  }
}

/**
 * Track an event (fire-and-forget)
 */
export function track<E extends TakoEvent>(
  event: E,
  properties?: EventProperties[E]
): void {
  trackImpl(event, properties).catch(() => {});
}

async function trackImpl<E extends TakoEvent>(
  event: E,
  properties?: EventProperties[E]
): Promise<void> {
  try {
    if (!(await isEnabled())) return;
    const distinctId = await getDistinctId();
    trackEvent(event, distinctId, {
      ...getCommonProperties(),
      ...properties,
    });
  } catch {
    // Silently fail
  }
}

/**
 * Shutdown analytics — waits for all pending requests
 */
export async function shutdown(): Promise<void> {
  await shutdownClient();
}

export function reset(): void {
  analyticsEnabled = null;
  identified = false;
}
