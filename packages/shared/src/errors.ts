// Error codes shared by the backend and the frontend (docs/technical/02-api-design.md).
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_LOGGED_IN',
  'PASSWORD_CHANGE_REQUIRED',
  'NOT_ALLOWED',
  'NOT_FOUND',
  'STATUS_CHANGED',
  'RULE_BROKEN',
  'TOO_MANY_ATTEMPTS',
  'SERVER_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
