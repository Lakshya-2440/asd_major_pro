const assert = require('node:assert/strict');
const { test } = require('node:test');
const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');
const {
  BpaAdapterError,
  BpaClient,
  transformEvaluationToBpaPayload,
} = require('../dist/services/bpa.adapter');

const evaluation = {
  created_at: '2026-11-10T12:30:00.000Z',
  overall_score: 82.5,
  pipeline_version: '0.2.0',
  animal: { tag_id: 'TAG-101' },
  evaluator: { id: 'user-1', name: 'Priyanshu' },
  trait_scores: [
    { trait_name: 'stature', final_score: 7 },
    { trait_name: 'body_length', final_score: 6 },
    { trait_name: 'body_depth', final_score: 8 },
    { trait_name: 'rump_angle', final_score: 5 },
  ],
};

test('BPA adapter maps internal evaluation fields to its ATC contract', () => {
  assert.deepEqual(transformEvaluationToBpaPayload(evaluation), {
    tagId: 'TAG-101',
    evaluatorCode: 'user-1',
    evaluationTimestamp: '2026-11-10T12:30:00.000Z',
    linearScores: { stature: 7, bodyLength: 6, bodyDepth: 8, rumpAngle: 5 },
    overallScore: 82.5,
    deviceMetadata: { pipelineVersion: '0.2.0' },
  });
});

test('BPA adapter rejects records missing a required linear score', () => {
  assert.throws(
    () => transformEvaluationToBpaPayload({ ...evaluation, trait_scores: evaluation.trait_scores.slice(1) }),
    (error) => error instanceof BpaAdapterError && error.code === 'invalid_payload',
  );
});

test('BPA client handles success, server errors, and timeouts', async () => {
  const http = axios.create();
  const mock = new MockAdapter(http);
  try {
    mock.onPost('http://bpa.local/atc-records').replyOnce(200, { bpaReferenceId: 'BPA-1234' });
    mock.onPost('http://bpa.local/atc-records').replyOnce(500, { error: 'failure' });
    mock.onPost('http://bpa.local/atc-records').timeoutOnce();
    const client = new BpaClient('http://bpa.local/atc-records', http);
    const payload = transformEvaluationToBpaPayload(evaluation);
    assert.deepEqual(await client.submit(payload), { bpaReferenceId: 'BPA-1234' });
    await assert.rejects(client.submit(payload), (error) => error.code === 'http_error');
    await assert.rejects(client.submit(payload), (error) => error.code === 'timeout');
  } finally {
    mock.restore();
  }
});
