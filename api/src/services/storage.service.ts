import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const uploadDirectory = path.resolve(__dirname, '../../uploads/evaluations');

export class InvalidImageError extends Error {}

export function validateImageMetadata(file: { mimetype: string; originalname: string; size?: number }): string {
  const extension = path.extname(file.originalname).toLowerCase();
  const accepted = (file.mimetype === 'image/jpeg' && ['.jpg', '.jpeg'].includes(extension)) ||
    (file.mimetype === 'image/png' && extension === '.png');
  if (!accepted) throw new InvalidImageError('Only JPEG and PNG images are allowed');
  if (file.size !== undefined && file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new multer.MulterError('LIMIT_FILE_SIZE');
  }
  return extension;
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    fs.mkdir(uploadDirectory, { recursive: true }, (error) => callback(error, uploadDirectory));
  },
  filename: (_req, file, callback) => {
    try {
      const extension = validateImageMetadata(file);
      callback(null, `${randomUUID()}-${Date.now()}${extension}`);
    } catch (error) {
      callback(error as Error, '');
    }
  },
});

export const imageUpload = multer({
  storage: diskStorage,
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    try {
      validateImageMetadata(file);
      callback(null, true);
    } catch (error) {
      (callback as unknown as (error: Error | null, acceptFile?: boolean) => void)(error as Error, false);
    }
  },
});

export async function removeUploadedFile(filePath?: string): Promise<void> {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function resolveStoredImage(filename: string): string | null {
  if (path.basename(filename) !== filename || !/^[\da-f-]+-\d+\.(?:jpg|jpeg|png)$/i.test(filename)) return null;
  const absolutePath = path.resolve(uploadDirectory, filename);
  return absolutePath.startsWith(`${uploadDirectory}${path.sep}`) ? absolutePath : null;
}
