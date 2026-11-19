import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@cosmo/shared';
import { errors } from './errors';

// Requests that still work before a forced password change (C-29)
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/api/v1/auth/change-password', '/api/v1/auth/logout', '/api/v1/me']);

export function requireLogin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw errors.notLoggedIn();
  if (req.auth.mustChangePassword && !ALLOWED_BEFORE_PASSWORD_CHANGE.has(req.originalUrl.split('?')[0]!)) {
    throw errors.passwordChangeRequired();
  }
  next();
}

// Role check (C-64). The owner can do everything an employee can (C-22).
// A person with several roles has the permissions of all of them (C-31).
export function requireRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    requireLogin(req, res, () => {
      const a = req.auth!;
      if (a.userType !== 'employee') throw errors.notAllowed();
      if (a.roles.includes('owner') || a.roles.some((r) => roles.includes(r))) return next();
      throw errors.notAllowed();
    });
  };
}

export const requireOwner = requireRoles('owner');

export function requireEmployee(req: Request, res: Response, next: NextFunction) {
  requireLogin(req, res, () => {
    if (req.auth!.userType !== 'employee') throw errors.notAllowed();
    next();
  });
}

export function requireCustomer(req: Request, res: Response, next: NextFunction) {
  requireLogin(req, res, () => {
    if (req.auth!.userType !== 'customer') throw errors.notAllowed();
    next();
  });
}
