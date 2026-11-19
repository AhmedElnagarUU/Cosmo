import type { ErrorCode } from '@cosmo/shared';

export interface Text {
  en: string;
  ar: string;
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    public readonly text: Text,
    public readonly details?: Record<string, unknown>,
  ) {
    super(text.en);
  }
}

export const errors = {
  validation: (details: Record<string, unknown>) =>
    new AppError(400, 'VALIDATION_FAILED', { en: 'Some fields are not valid', ar: 'بعض البيانات غير صحيحة' }, details),
  notLoggedIn: () =>
    new AppError(401, 'NOT_LOGGED_IN', { en: 'Please log in', ar: 'من فضلك سجّل الدخول' }),
  wrongLogin: () =>
    new AppError(401, 'NOT_LOGGED_IN', {
      en: 'The phone number or password is wrong',
      ar: 'رقم الهاتف أو كلمة المرور غير صحيحة',
    }),
  passwordChangeRequired: () =>
    new AppError(401, 'PASSWORD_CHANGE_REQUIRED', {
      en: 'Please choose a new password first',
      ar: 'من فضلك اختر كلمة مرور جديدة أولاً',
    }),
  notAllowed: () =>
    new AppError(403, 'NOT_ALLOWED', { en: 'You are not allowed to do this', ar: 'غير مسموح لك بهذا الإجراء' }),
  notFound: () => new AppError(404, 'NOT_FOUND', { en: 'Not found', ar: 'غير موجود' }),
  tooManyAttempts: () =>
    new AppError(429, 'TOO_MANY_ATTEMPTS', {
      en: 'Too many attempts. Please try again in 15 minutes',
      ar: 'محاولات كثيرة. حاول مرة أخرى بعد ١٥ دقيقة',
    }),
  rule: (text: Text, details?: Record<string, unknown>) => new AppError(409, 'RULE_BROKEN', text, details),
};
