/**
 * Every `code` a refusal can carry (docs/ARCHITECTURE.md, "API conventions"): the one list the
 * server throws from (`AppError`) and the app reads (`ApiError`), so a code is never a string
 * one side knows and the other misspells. A new refusal adds its code here first; the message
 * beside it is the reader's (`tr`), never the code. Three are the app's own, said on the device
 * before anything is sent (a private conversation this device may not write in yet: `waiting`,
 * `code_changed`, `unconfirmed_devices`); the rest are the server's.
 */
export const ERROR_CODES = [
  'ai_adults_only',
  'ai_busy',
  'ai_declined',
  'ai_failed',
  'ai_off',
  'ai_private',
  'ai_unavailable',
  'already_connected',
  'already_in',
  'already_requested',
  'already_subscribed',
  'already_verified',
  'awaiting_acceptance',
  'backup_running',
  'bad_request',
  'bad_signature',
  'billing_unavailable',
  'blocked',
  'busy',
  'call_ended',
  'call_full',
  'call_on',
  'code_changed',
  'code_expired',
  'collection_in_use',
  'conflict',
  'conversation_closed',
  'csrf',
  'device_exists',
  'devices_changed',
  'domain_taken',
  'email_taken',
  'email_unavailable',
  'export_too_large',
  'forbidden',
  'handle_closed_org',
  'handle_taken',
  'in_call',
  'internal',
  'invalid_credentials',
  'invalid_recovery',
  'invalid_request',
  'invalid_reset',
  'limit',
  'location_ended',
  'not_accepting_requests',
  'not_found',
  'not_in_call',
  'not_reclaimable',
  'not_resumable',
  'not_undoable',
  'offset_mismatch',
  'org_blocked',
  'org_closed',
  'org_open',
  'paying',
  'plan_included',
  'plan_limit',
  'rate_limited',
  'recently_declined',
  'record_not_found',
  'rule_exists',
  'saved_full',
  'suspended',
  'token_route',
  'token_scope',
  'too_large',
  'too_many_devices',
  'too_young',
  'unauthorized',
  'unconfirmed_devices',
  'unknown_device',
  'upload_complete',
  'waiting',
  'wrong_account',
  'wrong_code',
  'wrong_password',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** What a refused request answers with: the status is the HTTP status, this is the body. */
export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}
