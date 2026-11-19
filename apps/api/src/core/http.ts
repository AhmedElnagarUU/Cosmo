import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors';
import { config } from './config';

// Arabic or English messages, from the Accept-Language header (C-51)
export function language(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers['accept-language'] ?? '';
  req.lang = header.toLowerCase().startsWith('en') ? 'en' : 'ar';
  next();
}

// Requests that change something must come from our own website (CSRF protection).
export function sameOrigin(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin ?? (req.headers.referer ? new URL(req.headers.referer).origin : undefined);
  if (origin !== config.webOrigin) {
    throw new AppError(403, 'NOT_ALLOWED', { en: 'Request refused', ar: 'تم رفض الطلب' });
  }
  next();
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'NOT_FOUND', { en: 'Not found', ar: 'غير موجود' }));
}

// One error shape for every error (docs/technical/02-api-design.md)
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.text[req.lang ?? 'ar'], ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }
  // Body that is not valid JSON
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: req.lang === 'en' ? 'The request is not valid JSON' : 'الطلب غير صالح' } });
    return;
  }
  // Unique phone number per wholesaler, raised by the database
  if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
    res.status(409).json({
      error: {
        code: 'RULE_BROKEN',
        message: req.lang === 'en' ? 'This value is already used' : 'هذه القيمة مستخدمة بالفعل',
      },
    });
    return;
  }
  if (!config.isTest) console.error(err);
  res.status(500).json({
    error: { code: 'SERVER_ERROR', message: req.lang === 'en' ? 'Something went wrong' : 'حدث خطأ ما' },
  });
}

export function param(req: Request, name: string): string {
  const v = req.params[name];
  // uuids only; anything else cannot exist
  if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v)) throw new AppError(404, 'NOT_FOUND', { en: 'Not found', ar: 'غير موجود' });
  return v;
}

export function pageOf(req: Request): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  return { page, limit, offset: (page - 1) * limit };
}
