const assert = require('node:assert/strict');
const { test } = require('node:test');
const multer = require('multer');
const { evaluationDraftSchema } = require('../dist/controllers/evaluations.controller');
const { evaluationListQuerySchema } = require('../dist/controllers/evaluations.controller');
const { landmarkPatchSchema, scoreOverrideSchema } = require('../dist/controllers/evaluations.controller');
const {
  getEvaluationDetail,
  listEvaluations,
  overrideTraitScores,
  persistLandmarkRecompute,
} = require('../dist/services/evaluations.service');
const {
  MAX_IMAGE_SIZE_BYTES,
  InvalidImageError,
  resolveStoredImage,
  validateImageMetadata,
} = require('../dist/services/storage.service');

test('upload validation rejects images larger than 10 MB', () => {
  assert.throws(
    () => validateImageMetadata({ mimetype: 'image/jpeg', originalname: 'photo.jpg', size: MAX_IMAGE_SIZE_BYTES + 1 }),
    (error) => error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE',
  );
});

test('upload validation rejects a disallowed file extension', () => {
  assert.throws(
    () => validateImageMetadata({ mimetype: 'image/jpeg', originalname: 'photo.gif', size: 100 }),
    InvalidImageError,
  );
});

test('draft validation requires animal_id and defaults view_type to side', () => {
  assert.equal(evaluationDraftSchema.safeParse({ view_type: 'side' }).success, false);
  assert.deepEqual(evaluationDraftSchema.parse({ animal_id: 'd9428888-122b-4a49-8ea2-f51bca1d46ec' }), {
    animal_id: 'd9428888-122b-4a49-8ea2-f51bca1d46ec',
    view_type: 'side',
  });
});

test('stored image paths accept generated filenames and reject traversal', () => {
  assert.ok(resolveStoredImage('d9428888-122b-4a49-8ea2-f51bca1d46ec-1234567890.jpg'));
  assert.equal(resolveStoredImage('../secret.jpg'), null);
});

test('evaluation list applies pagination and combined filters with parameterized queries', async () => {
  const calls = [];
  const db = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('COUNT(*)')) return { rows: [{ total: 42 }] };
    return { rows: [{ id: 'evaluation-1', status: 'analyzed' }] };
  } };
  const filters = {
    page: 3, limit: 5, species: 'cattle', breed: 'Gir', status: 'analyzed',
    village: 'Rampur', evaluator_id: 'd9428888-122b-4a49-8ea2-f51bca1d46ec',
    from_date: '2026-01-01', to_date: '2026-03-31',
  };
  const result = await listEvaluations(db, filters, {
    userId: 'd9428888-122b-4a49-8ea2-f51bca1d46ec', role: 'supervisor',
  });
  assert.deepEqual(result.data, [{ id: 'evaluation-1', status: 'analyzed' }]);
  assert.deepEqual(result.pagination, { total: 42, page: 3, limit: 5, totalPages: 9 });
  assert.match(calls[1].sql, /JOIN animals a/);
  assert.match(calls[1].sql, /JOIN users u/);
  assert.match(calls[1].sql, /a\.species = \$3::"Species"/);
  assert.match(calls[1].sql, /a\.breed ILIKE \$4/);
  assert.match(calls[1].sql, /e\.status = \$5::"EvaluationStatus"/);
  assert.match(calls[1].sql, /a\.village ILIKE \$6/);
  assert.match(calls[1].sql, /e\.evaluator_id = \$7::uuid/);
  assert.match(calls[1].sql, /LIMIT \$10 OFFSET \$11/);
  assert.deepEqual(calls[1].values.slice(-2), [5, 10]);
  assert.deepEqual(calls[1].values.slice(2, 9), [
    'cattle', '%Gir%', 'analyzed', '%Rampur%', filters.evaluator_id, '2026-01-01', '2026-03-31',
  ]);
});

test('evaluation list query validates date ranges and pagination limits', () => {
  assert.deepEqual(evaluationListQuerySchema.parse({}), { page: 1, limit: 20 });
  assert.equal(evaluationListQuerySchema.safeParse({ limit: '101' }).success, false);
  assert.equal(evaluationListQuerySchema.safeParse({ from_date: '2026-02-30' }).success, false);
  assert.equal(evaluationListQuerySchema.safeParse({ from_date: '2026-03-02', to_date: '2026-03-01' }).success, false);
});

test('evaluation detail returns aggregate relations and applies typer village scope', async () => {
  let call;
  const aggregate = { id: 'evaluation-1', animal: { tag_id: 'TAG-1' }, images: [], landmarks: [], measurements: [], trait_scores: [], bpa_sync: [] };
  const db = { query: async (sql, values) => {
    call = { sql, values };
    return { rows: [aggregate] };
  } };
  const result = await getEvaluationDetail(db, {
    evaluationId: 'd9428888-122b-4a49-8ea2-f51bca1d46ec',
    userId: 'b11447fc-60c6-41e3-8913-9c9270062eb8', role: 'typer',
  });
  assert.deepEqual(result, aggregate);
  assert.match(call.sql, /'image_url'/);
  assert.match(call.sql, /corrected_pos/);
  assert.match(call.sql, /final_score/);
  assert.match(call.sql, /bpa_sync/);
  assert.match(call.sql, /own_animal\.village/);
  assert.deepEqual(call.values, ['d9428888-122b-4a49-8ea2-f51bca1d46ec', 'typer', 'b11447fc-60c6-41e3-8913-9c9270062eb8']);
});

test('landmark patches validate coordinates and persist corrected positions with recomputed values', async () => {
  const coordinates = { withers: { x: 100, y: 42 } };
  assert.equal(landmarkPatchSchema.safeParse({ landmarks: coordinates }).success, true);
  assert.equal(landmarkPatchSchema.safeParse({ landmarks: {} }).success, false);
  assert.equal(landmarkPatchSchema.safeParse({ landmarks: { withers: { x: '100', y: 42 } } }).success, false);

  const statements = [];
  const aggregate = { id: 'evaluation-1', status: 'analyzed' };
  const client = { query: async (sql, values) => {
    statements.push({ sql, values });
    if (sql.includes('SELECT e.id, e.animal_id')) return { rows: [aggregate] };
    return { rows: [], rowCount: 1 };
  }, release() {} };
  const result = await persistLandmarkRecompute({ connect: async () => client }, {
    evaluationId: 'evaluation-1', landmarks: coordinates,
    result: {
      measurements: { height_at_withers_cm: { value: 142, unit: 'cm' } },
      trait_scores: { stature: { score: 7, source: 'user_adjusted' } },
      overall_score: 82.5,
    },
  });
  assert.deepEqual(result, aggregate);
  assert.ok(statements.some(({ sql, values }) => sql.includes('SET corrected_pos') && values[0] === JSON.stringify(coordinates.withers)));
  assert.ok(statements.some(({ sql }) => sql.includes('INSERT INTO measurements')));
  assert.ok(statements.some(({ sql }) => sql.includes('INSERT INTO trait_scores')));
});

test('score overrides reject invalid scores and preserve each change in audit history', async () => {
  const validScore = { trait_name: 'stature', final_score: 7, override_reason: 'Clearer side view' };
  assert.equal(scoreOverrideSchema.safeParse({ scores: [validScore] }).success, true);
  assert.equal(scoreOverrideSchema.safeParse({ scores: [{ ...validScore, final_score: 10 }] }).success, false);
  assert.equal(scoreOverrideSchema.safeParse({ scores: [{ ...validScore, final_score: 7.5 }] }).success, false);
  assert.equal(scoreOverrideSchema.safeParse({ scores: [{ ...validScore, override_reason: 'bad' }] }).success, false);
  assert.equal(scoreOverrideSchema.safeParse({ scores: [validScore, validScore] }).success, false);

  const statements = [];
  const audit = { id: 'audit-1', trait_name: 'stature', previous_score: 5, final_score: 7, override_reason: 'Clearer side view' };
  const aggregate = { id: 'evaluation-1', status: 'confirmed', score_override_audit: [audit] };
  const client = { query: async (sql, values) => {
    statements.push({ sql, values });
    if (sql.includes('SELECT final_score FROM trait_scores')) return { rows: [{ final_score: 5 }], rowCount: 1 };
    if (sql.includes('SELECT e.id, e.animal_id')) return { rows: [aggregate] };
    return { rows: [], rowCount: 1 };
  }, release() {} };
  const result = await overrideTraitScores({ connect: async () => client }, {
    evaluationId: 'evaluation-1', changedBy: 'user-1', scores: [validScore],
  });
  assert.deepEqual(result.score_override_audit, [audit]);
  const auditInsert = statements.find(({ sql }) => sql.includes('INSERT INTO score_override_audit'));
  assert.ok(auditInsert);
  assert.equal(auditInsert.values[3], 5);
  assert.equal(auditInsert.values[4], 7);
  assert.equal(auditInsert.values[5], 'Clearer side view');
  assert.ok(statements.some(({ sql }) => sql.includes("status = 'confirmed'")));
  assert.ok(statements.some(({ sql }) => sql.includes('AVG(final_score)')));
});
