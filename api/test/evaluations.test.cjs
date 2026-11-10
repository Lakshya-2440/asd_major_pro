const assert = require('node:assert/strict');
const { test } = require('node:test');
const multer = require('multer');
const { evaluationDraftSchema } = require('../dist/controllers/evaluations.controller');
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
