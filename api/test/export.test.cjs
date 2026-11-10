const assert = require('node:assert/strict');
const { test } = require('node:test');
const { exportQuerySchema } = require('../dist/routes/export');
const {
  csvColumns,
  createCsvStringifier,
  getEvaluationExportRows,
  toCsvRecords,
  toJsonRecords,
} = require('../dist/services/export.service');

const sourceRow = {
  evaluation_id: 'eval-1',
  tag_id: 'TAG-1',
  species: 'cattle',
  breed: 'Gir',
  owner_name: 'Asha, Patel',
  village: 'Rampur',
  evaluator_name: 'Priyanshu',
  created_at: new Date('2026-10-12T10:30:00.000Z'),
  measurements: {
    height_at_withers_cm: 142.5,
    body_length_cm: 151,
    body_depth_cm: 76,
    rump_angle_deg: 4.5,
  },
  scores: { stature: 7, body_length: 6, body_depth: 8, rump_angle: 5 },
  overall_score: 82.5,
  bpa_sync_status: 'synced',
};

test('export query validates formats, filter values, and date ranges', () => {
  assert.equal(exportQuerySchema.safeParse({ format: 'csv', species: 'cattle' }).success, true);
  assert.equal(exportQuerySchema.safeParse({ format: 'xlsx' }).success, false);
  assert.equal(exportQuerySchema.safeParse({ format: 'json', species: 'goat' }).success, false);
  assert.equal(exportQuerySchema.safeParse({ format: 'csv', from_date: '2026-11-31' }).success, false);
  assert.equal(exportQuerySchema.safeParse({ format: 'csv', from_date: '2026-10-12', to_date: '2026-10-11' }).success, false);
});

test('export service applies all filters as SQL parameters', async () => {
  let call;
  const db = { query: async (sql, values) => {
    call = { sql, values };
    return { rows: [sourceRow] };
  } };
  const rows = await getEvaluationExportRows(db, {
    from_date: '2026-01-01', to_date: '2026-10-12', breed: 'Gir', species: 'cattle',
  });
  assert.deepEqual(rows, [sourceRow]);
  assert.match(call.sql, /JOIN animals a/);
  assert.match(call.sql, /JOIN users u/);
  assert.match(call.sql, /a\.breed ILIKE \$3/);
  assert.match(call.sql, /a\.species = \$4::"Species"/);
  assert.match(call.sql, /ORDER BY e\.created_at DESC/);
  assert.deepEqual(call.values, ['2026-01-01', '2026-10-12', '%Gir%', 'cattle']);
});

test('CSV output has the specified header order and preserves field data', async () => {
  const records = toCsvRecords([sourceRow]);
  assert.deepEqual(Object.keys(records[0]), [...csvColumns]);
  assert.equal(records[0].height_at_withers_cm, 142.5);
  assert.equal(records[0].body_length_score, 6);
  assert.equal(records[0].bpa_sync_status, 'synced');

  const csv = createCsvStringifier();
  const chunks = [];
  const finished = new Promise((resolve, reject) => {
    csv.on('data', (chunk) => chunks.push(chunk.toString()));
    csv.on('end', resolve);
    csv.on('error', reject);
  });
  csv.write(records[0]);
  csv.end();
  await finished;
  const output = chunks.join('');
  assert.equal(output.trimEnd().split(/\r?\n/)[0], csvColumns.join(','));
  assert.match(output, /"Asha, Patel"/);
  assert.match(output, /142\.5/);
  assert.match(output, /82\.5,synced/);
});

test('JSON export uses nested animal, evaluation, measurements, and score fields', () => {
  const [record] = toJsonRecords([sourceRow]);
  assert.equal(record.animal.tag_id, 'TAG-1');
  assert.equal(record.evaluator.name, 'Priyanshu');
  assert.equal(record.measurements.body_depth_cm, 76);
  assert.equal(record.linear_scores.rump_angle, 5);
  assert.equal(record.bpa_sync_status, 'synced');
});
