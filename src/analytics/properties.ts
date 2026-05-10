/**
 * Common Properties Generator
 *
 * Provides common properties for all analytics events.
 */

import { detectLocale } from "../i18n";

// Version injected at build time
const VERSION = process.env.VERSION || "dev";

/**
 * Get common properties included in every event
 */
export function getCommonProperties(): Record<string, string | number | boolean> {
  return {
    cli_version: VERSION,
    platform: process.platform,
    arch: process.arch,
    locale: detectLocale(),
    node_version: process.version,
  };
}

/**
 * Hash a project path for privacy
 * Only stores a short hash for deduplication, not the actual path
 */
export function hashProjectPath(path: string): string {
  // Use Bun's built-in hash function
  const hash = Bun.hash(path);
  // Convert to hex and take first 8 characters
  return hash.toString(16).slice(0, 8);
}
