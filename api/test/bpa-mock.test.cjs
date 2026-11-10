const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createBpaMockRouter } = require('../dist/mock/bpa.mock');

function responseRecorder() {
  const state = { status: 200, body: undefined };
  const res = {
    destroyed: false,
    status(code) { state.status = code; return res; },
    json(body) { state.body = body; return res; },
    on() { return res; },
  };
  return { state, res };
}

test('BPA mock returns success, server failure, and delayed timeout responses', async () => {
  const success = createBpaMockRouter(() => 0.5, 5).stack[0].route.stack[0].handle;
  const successResponse = responseRecorder();
  success({}, successResponse.res);
  assert.equal(successResponse.state.status, 200);
  assert.match(successResponse.state.body.bpaReferenceId, /^BPA-\d{4}$/);

  const failure = createBpaMockRouter(() => 0.85, 5).stack[0].route.stack[0].handle;
  const failureResponse = responseRecorder();
  failure({}, failureResponse.res);
  assert.equal(failureResponse.state.status, 500);

  const timeout = createBpaMockRouter(() => 0.95, 5).stack[0].route.stack[0].handle;
  const timeoutResponse = responseRecorder();
  timeout({}, timeoutResponse.res);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(timeoutResponse.state.status, 504);
});
