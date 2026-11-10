import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthUser {
  userId: string;
  role: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function isAuthUser(payload: string | JwtPayload): payload is JwtPayload & AuthUser {
  return typeof payload !== 'string' &&
    typeof payload.userId === 'string' &&
    typeof payload.role === 'string' &&
    typeof payload.name === 'string';
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const [scheme, token, ...extra] = (req.header('authorization') ?? '').trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || !token || extra.length > 0) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (!isAuthUser(payload)) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    req.user = { userId: payload.userId, role: payload.role, name: payload.name };
    next();
  } catch {
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
