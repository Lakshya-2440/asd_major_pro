import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthUser {
  userId: string;
  id?: string;
  code?: string;
  role: string;
  name: string;
}

export const DEFAULT_GUEST_USER: AuthUser = {
  userId: 'guest-typer-001',
  id: 'guest-typer-001',
  code: 'TYPER-001',
  name: 'Field Typer (Guest)',
  role: 'typer',
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === 'false' || process.env.DEMO_MODE === '0') {
    return false;
  }
  if (process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1') {
    return true;
  }
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  return env.DEMO_MODE;
}

function isAuthUser(payload: string | JwtPayload): payload is JwtPayload & AuthUser {
  return typeof payload !== 'string' &&
    typeof payload.userId === 'string' &&
    typeof payload.role === 'string' &&
    typeof payload.name === 'string';
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.header('authorization') ?? '';
  const [scheme, token, ...extra] = authHeader.trim().split(/\s+/);

  const fallbackToGuest = (): boolean => {
    if (isDemoMode() || req.header('x-demo-mode') === 'true' || token === 'demo' || token === 'guest') {
      req.user = { ...DEFAULT_GUEST_USER };
      next();
      return true;
    }
    return false;
  };

  if (scheme?.toLowerCase() !== 'bearer' || !token || extra.length > 0) {
    if (fallbackToGuest()) return;
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (token === 'demo' || token === 'guest') {
    req.user = { ...DEFAULT_GUEST_USER };
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (!isAuthUser(payload)) {
      if (fallbackToGuest()) return;
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    req.user = {
      userId: payload.userId,
      id: payload.userId,
      code: typeof payload.code === 'string' ? payload.code : undefined,
      role: payload.role,
      name: payload.name,
    };
    next();
  } catch {
    if (fallbackToGuest()) return;
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function authorizeRoles(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
