process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const jwt = require('jsonwebtoken');
const { authorizeRoles, authenticateToken, DEFAULT_GUEST_USER } = require('../dist/middlewares/auth.middleware');
const { createLoginHandler } = require('../dist/controllers/auth.controller');

const secret = 'auth-test-secret';

function responseRecorder() {
  const state = { statusCode: 200, body: undefined };
  const response = {
    status(code) { state.statusCode = code; return response; },
    json(body) { state.body = body; return response; },
  };
  return { response, state };
}

test('login returns a signed token and safe user profile for valid credentials', async () => {
  const handler = createLoginHandler({
    findByEmail: async (email) => ({ id: 'user-1', name: 'Priyanshu', email, role: 'typer', password_hash: 'hashed' }),
    comparePassword: async () => true,
    secret,
  });
  const { response, state } = responseRecorder();
  await handler({ body: { email: 'USER@example.com', password: 'good-password' } }, response);
  const { token, user } = state.body;
  assert.equal(state.statusCode, 200);
  assert.deepEqual(user, { id: 'user-1', name: 'Priyanshu', role: 'typer', email: 'user@example.com' });
  assert.deepEqual(jwt.verify(token, secret), {
    userId: 'user-1', role: 'typer', name: 'Priyanshu',
    iat: jwt.decode(token).iat, exp: jwt.decode(token).exp,
  });
});

test('login rejects an incorrect password', async () => {
  const handler = createLoginHandler({
    findByEmail: async (email) => ({ id: 'user-1', name: 'User', email, role: 'typer', password_hash: 'hashed' }),
    comparePassword: async () => false,
    secret,
  });
  const { response, state } = responseRecorder();
  await handler({ body: { email: 'user@example.com', password: 'wrong' } }, response);
  assert.equal(state.statusCode, 401);
});

test('authenticateToken rejects expired tokens', () => {
  const token = jwt.sign({ userId: 'user-1', role: 'typer', name: 'User', exp: Math.floor(Date.now() / 1000) - 10 }, secret);
  const { response, state } = responseRecorder();
  let continued = false;
  authenticateToken({ header: () => `Bearer ${token}` }, response, () => { continued = true; });
  assert.equal(state.statusCode, 401);
  assert.equal(continued, false);
});

test('authenticateToken falls back to guest typer in demo mode when header is missing or invalid', () => {
  const orig = process.env.DEMO_MODE;
  process.env.DEMO_MODE = 'true';
  try {
    const { response, state } = responseRecorder();
    let continued = false;
    const req1 = { header: () => undefined };
    authenticateToken(req1, response, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(req1.user?.userId, 'guest-typer-001');
    assert.equal(req1.user?.code, 'TYPER-001');
    assert.equal(req1.user?.role, 'typer');
    assert.equal(req1.user?.name, 'Field Typer (Guest)');

    // Missing token
    continued = false;
    const req2 = { header: () => 'Bearer invalid-token' };
    authenticateToken(req2, response, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(req2.user?.userId, 'guest-typer-001');
  } finally {
    if (orig !== undefined) {
      process.env.DEMO_MODE = orig;
    } else {
      delete process.env.DEMO_MODE;
    }
  }
});

test('authorizeRoles rejects a logged-in user with a disallowed role', () => {
  const { response, state } = responseRecorder();
  let continued = false;
  authorizeRoles('admin')({ user: { userId: 'user-1', role: 'typer', name: 'User' } }, response, () => { continued = true; });
  assert.equal(state.statusCode, 403);
  assert.equal(continued, false);
});
