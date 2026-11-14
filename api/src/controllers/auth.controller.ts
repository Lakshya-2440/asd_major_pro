import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../config/database';
import { env } from '../config/env';

interface Account {
  id: string;
  name: string;
  email: string;
  role: string;
  password_hash: string;
}

class DatabaseUnavailableError extends Error {}

export function createLoginHandler(dependencies: {
  findByEmail: (email: string) => Promise<Account | undefined>;
  comparePassword: (password: string, hash: string) => Promise<boolean>;
  secret: string;
}) {
  return async (req: Request, res: Response): Promise<void> => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email or password format' });
      return;
    }

    try {
      const account = await dependencies.findByEmail(parsed.data.email.toLowerCase());
      if (!account || !(await dependencies.comparePassword(parsed.data.password, account.password_hash))) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }
      const token = jwt.sign(
        { userId: account.id, role: account.role, name: account.name },
        dependencies.secret,
        { expiresIn: '1h' },
      );
      res.json({ token, user: { id: account.id, name: account.name, role: account.role, email: account.email } });
    } catch (error) {
      if (error instanceof DatabaseUnavailableError) {
        res.status(503).json({ error: 'Database is unavailable' });
        return;
      }
      console.error('Authentication lookup failed', error);
      res.status(500).json({ error: 'Unable to authenticate at this time' });
    }
  };
}

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(1024),
}).strict();

export const login = createLoginHandler({
  findByEmail: async (email) => {
    if (!pool) throw new DatabaseUnavailableError();
    const result = await pool.query<Account>(
      'SELECT id, name, email, role, password_hash FROM users WHERE email = $1 LIMIT 1',
      [email],
    );
    return result.rows[0];
  },
  comparePassword: bcrypt.compare,
  secret: env.JWT_SECRET,
});

export function getCurrentUser(req: Request, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  res.json({
    id: req.user.id || req.user.userId,
    code: req.user.code || 'TYPER-001',
    name: req.user.name,
    role: req.user.role,
  });
}
