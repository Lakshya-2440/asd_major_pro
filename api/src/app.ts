import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import healthRouter from './routes/health';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN }));
app.use(express.json());
app.use(morgan('dev'));
app.use('/api/health', healthRouter);

export default app;
