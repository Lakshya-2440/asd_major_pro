import { Router } from 'express';
import { getCurrentUser, login } from '../controllers/auth.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const authRouter = Router();

authRouter.post('/login', login);
authRouter.get('/me', authenticateToken, getCurrentUser);

export default authRouter;
