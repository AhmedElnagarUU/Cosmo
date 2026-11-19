import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePasswordSchema, forgotPasswordSchema, loginSchema } from '@cosmo/shared';
import { validate } from '../../core/validation';
import { requireLogin } from '../../core/permissions';
import { SESSION_COOKIE, config } from '../../core/config';
import { sessionCookieOptions } from '../../core/auth';
import { auth } from '../../core/context';
import { errors } from '../../core/errors';
import * as service from './auth.service';

export function authRoutes(): Router {
  const r = Router();

  // Limit per internet address, so one computer cannot try many phone numbers
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.isTest ? 1000 : 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: () => {
      throw errors.tooManyAttempts();
    },
  });

  r.post('/auth/login', loginLimit, async (req, res) => {
    const input = validate(loginSchema, req.body);
    const result = await service.login(res.locals.db, input);
    res.cookie(SESSION_COOKIE, result.token, sessionCookieOptions(result.userType));
    res.json({ ok: true });
  });

  r.post('/auth/logout', requireLogin, async (req, res) => {
    await service.logout(res.locals.db, auth(req).sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.post('/auth/change-password', requireLogin, async (req, res) => {
    const input = validate(changePasswordSchema, req.body);
    await service.changePassword(res.locals.db, auth(req), input.currentPassword, input.newPassword);
    res.json({ ok: true });
  });

  r.post('/auth/forgot-password', loginLimit, async (req, res) => {
    const input = validate(forgotPasswordSchema, req.body);
    await service.forgotPassword(res.locals.db, input.loginCode, input.phone);
    res.json({ ok: true });
  });

  r.get('/me', requireLogin, async (req, res) => {
    res.json(await service.me(res.locals.db, auth(req)));
  });

  return r;
}
