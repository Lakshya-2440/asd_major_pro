import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { bpaClient, BpaAdapterError, transformEvaluationToBpaPayload } from '../services/bpa.adapter';
import {
  completeBpaSyncAttempt,
  ConfirmedEvaluationRequiredError,
  createBpaSyncAttempt,
  getBpaDatabase,
  getEvaluationForBpaSync,
} from '../services/bpa-sync.service';
import { authenticateToken } from '../middlewares/auth.middleware';

const bpaRouter = Router();
bpaRouter.post('/:id/sync-bpa', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const evaluationId = z.string().uuid().safeParse(req.params.id);
  if (!evaluationId.success) {
    res.status(400).json({ error: 'Invalid evaluation id' });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const database = getBpaDatabase();
    const evaluation = await getEvaluationForBpaSync(database, {
      evaluationId: evaluationId.data,
      userId: req.user.userId,
      role: req.user.role,
    });
    if (!evaluation) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }
    if (evaluation.status !== 'confirmed') {
      res.status(409).json({ error: 'Evaluation must be confirmed before BPA synchronization' });
      return;
    }

    let payload;
    try {
      payload = transformEvaluationToBpaPayload(evaluation);
    } catch (error) {
      if (error instanceof BpaAdapterError) {
        res.status(422).json({ error: error.message, code: error.code });
        return;
      }
      throw error;
    }

    const attempt = await createBpaSyncAttempt(database, evaluationId.data);
    try {
      const acknowledgement = await bpaClient.submit(payload);
      const state = await completeBpaSyncAttempt(database, {
        syncId: String(attempt.id),
        status: 'synced',
        bpaReferenceId: acknowledgement.bpaReferenceId,
      });
      res.status(200).json(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'BPA synchronization failed';
      const state = await completeBpaSyncAttempt(database, {
        syncId: String(attempt.id),
        status: 'failed',
        lastError: message,
      });
      res.status(200).json(state);
    }
  } catch (error) {
    if (error instanceof ConfirmedEvaluationRequiredError) {
      res.status(409).json({ error: error.message });
      return;
    }
    console.error('BPA synchronization failed', error);
    res.status(503).json({ error: 'Unable to synchronize evaluation with BPA' });
  }
});

export default bpaRouter;
