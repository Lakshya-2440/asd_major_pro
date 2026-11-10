const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createBpaSyncAttempt, completeBpaSyncAttempt } = require('../dist/services/bpa-sync.service');

test('BPA sync retry increments attempts and transitions failed to synced', async () => {
  const records = [];
  let evaluationStatus = 'confirmed';
  let nextId = 1;
  const client = {
    async query(sql, values) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT status FROM evaluations')) return { rows: [{ status: evaluationStatus }], rowCount: 1 };
      if (sql.includes('SELECT COALESCE(MAX(attempts)')) {
        return { rows: [{ next_attempt: records.reduce((max, item) => Math.max(max, item.attempts), 0) + 1 }] };
      }
      if (sql.includes('INSERT INTO bpa_sync')) {
        const record = {
          id: `sync-${nextId++}`, evaluation_id: values[1], status: 'pending', attempts: values[2],
          last_error: null, bpa_reference_id: null, synced_at: null,
        };
        records.push(record);
        return { rows: [record], rowCount: 1 };
      }
      if (sql.includes('UPDATE bpa_sync')) {
        const record = records.find((item) => item.id === values[3]);
        Object.assign(record, { status: values[0], bpa_reference_id: values[1], last_error: values[2] });
        if (values[0] === 'synced') record.synced_at = new Date();
        return { rows: [record], rowCount: 1 };
      }
      if (sql.includes('UPDATE evaluations SET status')) {
        evaluationStatus = 'synced';
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const db = { connect: async () => client };

  const first = await createBpaSyncAttempt(db, 'evaluation-1');
  assert.equal(first.attempts, 1);
  const failed = await completeBpaSyncAttempt(db, { syncId: first.id, status: 'failed', lastError: 'BPA returned HTTP 500' });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.last_error, 'BPA returned HTTP 500');

  const retry = await createBpaSyncAttempt(db, 'evaluation-1');
  assert.equal(retry.attempts, 2);
  const synced = await completeBpaSyncAttempt(db, { syncId: retry.id, status: 'synced', bpaReferenceId: 'BPA-5678' });
  assert.equal(synced.status, 'synced');
  assert.equal(synced.bpa_reference_id, 'BPA-5678');
  assert.ok(synced.synced_at);
  assert.equal(evaluationStatus, 'synced');
});
