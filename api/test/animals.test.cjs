const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAnimalsService } = require('../dist/services/animals.service');

function fakeDb(handler) {
  const calls = [];
  return {
    calls,
    db: { query: async (sql, values) => {
      calls.push({ sql, values });
      return handler(sql, values);
    } },
  };
}

test('animal tag search matches exact and escaped prefix and returns evaluation counts', async () => {
  const animal = { id: 'animal-1', tag_id: 'TAG_100', previous_evaluations_count: 2 };
  const { db, calls } = fakeDb(async () => ({ rows: [animal], rowCount: 1 }));
  const result = await createAnimalsService(db).list('TAG_');
  assert.deepEqual(result, [animal]);
  assert.match(calls[0].sql, /a\.tag_id = \$1 OR a\.tag_id LIKE \$2/);
  assert.match(calls[0].sql, /COUNT\(e\.id\)::int AS previous_evaluations_count/);
  assert.deepEqual(calls[0].values, ['TAG_', 'TAG\\_%']);
});

test('animal creation inserts validated fields and returns the created record', async () => {
  const animal = { id: 'animal-1', tag_id: 'TAG-1', species: 'cattle', breed: 'Gir' };
  const { db, calls } = fakeDb(async () => ({ rows: [animal], rowCount: 1 }));
  const result = await createAnimalsService(db).create({
    tag_id: 'TAG-1', species: 'cattle', breed: 'Gir', owner_name: 'Asha', village: 'Rampur',
  });
  assert.deepEqual(result, animal);
  assert.match(calls[0].sql, /INSERT INTO animals/);
  assert.deepEqual(calls[0].values, ['TAG-1', 'cattle', 'Gir', 'Asha', 'Rampur']);
});

test('duplicate animal tags surface PostgreSQL unique constraint violations', async () => {
  const duplicateError = Object.assign(new Error('duplicate key'), { code: '23505' });
  const { db } = fakeDb(async () => { throw duplicateError; });
  await assert.rejects(
    createAnimalsService(db).create({
      tag_id: 'TAG-1', species: 'buffalo', breed: 'Murrah', owner_name: 'Asha', village: 'Rampur',
    }),
    (error) => error.code === '23505',
  );
});
