import app from './app';
import { env } from './config/env';
import { pool } from './config/database';

const server = app.listen(env.PORT, () => {
  console.log(`Auto-ATC API listening on port ${env.PORT}`);
});

function shutdown(): void {
  server.close(() => {
    void pool?.end().finally(() => process.exit(0));
    if (!pool) process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
