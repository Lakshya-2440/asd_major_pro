import { Router } from 'express';
import { getDatabaseStatus } from '../config/database';

const router = Router();

router.get('/', async (_req, res) => {
  const database = await getDatabaseStatus();
  res.json({ status: 'ok', uptime: process.uptime(), database });
});

export default router;
