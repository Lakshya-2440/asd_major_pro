import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import animalsRouter from './routes/animals';
import authRouter from './routes/auth';
import evaluationsRouter from './routes/evaluations';
import healthRouter from './routes/health';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN }));
app.use(express.json());
app.use(morgan('dev'));
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/animals', animalsRouter);
app.use('/api/evaluations', evaluationsRouter);

export default app;
