import { Router, type Request, type Response } from 'express';
import { randomInt } from 'node:crypto';

export function createBpaMockRouter(random: () => number = Math.random, timeoutMs = 10_000) {
  const router = Router();
  router.post('/atc-records', (req: Request, res: Response) => {
    const outcome = random();
    if (outcome < 0.8) {
      res.status(200).json({ bpaReferenceId: `BPA-${randomInt(1000, 10_000)}` });
      return;
    }
    if (outcome < 0.9) {
      res.status(500).json({ error: 'Simulated BPA server failure' });
      return;
    }
    const timeout = setTimeout(() => {
      if (!res.destroyed) res.status(504).json({ error: 'Simulated BPA timeout' });
    }, timeoutMs);
    res.on('close', () => clearTimeout(timeout));
  });
  return router;
}

export default createBpaMockRouter();
