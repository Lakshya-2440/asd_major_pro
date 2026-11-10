const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');
const { AnalysisClient, AnalysisServiceError } = require('../dist/services/analysis.service');
const { persistAnalysisResult } = require('../dist/services/evaluations.service');

async function temporaryImage() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-atc-analysis-'));
  const imagePath = path.join(directory, 'animal.jpg');
  await fs.writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff]));
  return { imagePath, cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
}

test('AnalysisClient sends multipart image/species/breed and parses the result', async () => {
  const temp = await temporaryImage();
  const http = axios.create();
  const mock = new MockAdapter(http);
  try {
    let multipart;
    mock.onPost('http://analysis.local/predict').reply((config) => {
      multipart = config.data;
      return [200, {
        species: 'cattle', breed: 'Gir', pipeline_version: '0.2.0', quality_flags: [],
        landmarks: { withers: { x: 50, y: 20, confidence: 0.9 } },
        measurements: { height_at_withers: { value: 140, unit: 'cm', confidence: 0.8 } },
        trait_scores: { stature: 7 }, overall_score: 82.5,
      }];
    });
    const client = new AnalysisClient('http://analysis.local/', http);
    const result = await client.analyzeSideView(temp.imagePath, 'cattle', 'Gir');
    assert.ok(multipart instanceof FormData);
    assert.equal(multipart.get('species'), 'cattle');
    assert.equal(multipart.get('breed'), 'Gir');
    assert.equal(multipart.get('side_view').name, 'animal.jpg');
    assert.equal(result.overall_score, 82.5);
  } finally {
    mock.restore();
    await temp.cleanup();
  }
});

test('AnalysisClient returns a structured timeout error', async () => {
  const temp = await temporaryImage();
  const http = axios.create();
  const mock = new MockAdapter(http);
  try {
    mock.onPost('http://analysis.local/predict').timeout();
    const client = new AnalysisClient('http://analysis.local', http, 15);
    await assert.rejects(client.analyzeSideView(temp.imagePath, 'cattle', 'Gir'), (error) => {
      assert.ok(error instanceof AnalysisServiceError);
      assert.equal(error.code, 'timeout');
      return true;
    });
  } finally {
    mock.restore();
    await temp.cleanup();
  }
});

function fakeDatabase() {
  const statements = [];
  const client = {
    async query(sql, values) {
      statements.push({ sql, values });
      if (sql.includes('SELECT e.id, e.animal_id')) return { rows: [{ id: 'evaluation-1', status: 'analyzed' }] };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return { db: { connect: async () => client }, statements };
}

test('successful analysis persists landmarks, measurements, scores and aggregate status', async () => {
  const { db, statements } = fakeDatabase();
  const result = await persistAnalysisResult(db, {
    evaluationId: 'evaluation-1', imageId: 'image-1',
    analysis: {
      species: 'cattle', breed: 'Gir', pipeline_version: '0.2.0', quality_flags: [],
      landmarks: { withers: { x: 10, y: 20, confidence: 0.9 } },
      measurements: { height_at_withers: { value: 140, unit: 'cm', confidence: 0.8 } },
      trait_scores: { stature: 7 }, overall_score: 82.5,
    },
  });
  assert.equal(result.evaluation.status, 'analyzed');
  assert.deepEqual(result.qualityErrors, []);
  assert.ok(statements.some(({ sql }) => sql.includes('INSERT INTO landmarks')));
  assert.ok(statements.some(({ sql }) => sql.includes('INSERT INTO measurements')));
  assert.ok(statements.some(({ sql }) => sql.includes('INSERT INTO trait_scores')));
  assert.ok(statements.some(({ sql }) => sql.includes("status = 'analyzed'")));
});

test('blocking quality flags set failed_quality and skip score persistence', async () => {
  const { db, statements } = fakeDatabase();
  const result = await persistAnalysisResult(db, {
    evaluationId: 'evaluation-1', imageId: 'image-1',
    analysis: {
      quality_flags: ['blurry'], landmarks: {}, measurements: {}, trait_scores: {}, overall_score: 0,
    },
  });
  assert.deepEqual(result.qualityErrors, ['blurry']);
  assert.ok(statements.some(({ sql }) => sql.includes("status = 'failed_quality'")));
  assert.equal(statements.some(({ sql }) => sql.includes('INSERT INTO trait_scores')), false);
});
