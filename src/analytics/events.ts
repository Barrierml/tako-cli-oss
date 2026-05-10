/**
 * Analytics Event Definitions
 *
 * Type-safe event definitions for PostHog tracking.
 */

/**
 * All trackable events in Tako CLI
 */
export type TakoEvent =
  // Lifecycle
  | "cli_started"
  | "cli_updated"

  // Authentication
  | "api_key_validated"
  | "provider_added"

  // Client operations
  | "client_installed"
  | "client_updated"
  | "client_launched"

  // Remote mode
  | "remote_mode_enabled"
  | "remote_mode_disabled"

  // Menu interactions
  | "menu_action"

  // Errors
  | "error_occurred";

/**
 * Event property types for type safety
 */
export interface EventProperties {
  cli_started: {
    first_run?: boolean;
  };

  cli_updated: {
    from_version: string;
    to_version: string;
  };

  api_key_validated: {
    success: boolean;
    error_type?: string;
  };

  provider_added: {
    provider_type: string;
    method: "auto_detect" | "manual" | "migration";
  };

  client_installed: {
    client_id: string;
    client_version: string;
  };

  client_updated: {
    client_id: string;
    from_version: string;
    to_version: string;
  };

  client_launched: {
    client_id: string;
    client_version?: string;
    project_hash?: string;
    is_recent_project: boolean;
  };

  remote_mode_enabled: {
    client_id: string;
  };

  remote_mode_disabled: {
    client_id: string;
    duration_seconds?: number;
  };

  menu_action: {
    action: "stats" | "config" | "language" | "exit" | "launch" | "advanced";
    client_id?: string;
  };

  error_occurred: {
    error_type: string;
    error_message: string;
    context?: string;
  };
}
