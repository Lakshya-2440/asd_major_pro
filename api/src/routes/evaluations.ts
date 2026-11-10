import { Router } from 'express';
import { analyzeEvaluation, createEvaluation, getEvaluation, getEvaluationImage, listEvaluations } from '../controllers/evaluations.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { imageUpload, InvalidImageError } from '../services/storage.service';
import multer from 'multer';

const evaluationsRouter = Router();
evaluationsRouter.use(authenticateToken);

evaluationsRouter.post('/', (req, res, next) => {
  imageUpload.single('image')(req, res, (error?: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Image must be 10 MB or smaller' });
      return;
    }
    if (error instanceof InvalidImageError || error instanceof multer.MulterError && error.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ error: 'Only one JPEG or PNG image file is allowed' });
      return;
    }
    next(error);
  });
}, createEvaluation);

evaluationsRouter.post('/:id/analyze', analyzeEvaluation);
evaluationsRouter.get('/', listEvaluations);
evaluationsRouter.get('/:id', getEvaluation);
evaluationsRouter.get('/:evaluationId/images/:imageId', getEvaluationImage);

export default evaluationsRouter;
