import { randomUUID } from 'node:crypto';
import { mkdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import sharp, { type Metadata } from 'sharp';
import type { Asset } from '../shared/types.js';
import { ServiceError } from './contracts.js';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export interface StoredImage {
  asset: Asset;
  paths: { original: string; preview: string };
}

export async function storeCampaignImage(options: {
  root: string;
  campaignId: string;
  buffer: Buffer;
  role?: Asset['role'];
}): Promise<StoredImage> {
  if (options.buffer.length > MAX_IMAGE_BYTES) {
    throw new ServiceError('La imagen supera el límite de 20 MB', 413);
  }
  let metadata: Metadata;
  try {
    metadata = await sharp(options.buffer, { failOn: 'error' }).metadata();
  } catch {
    throw new ServiceError('El archivo no es una imagen válida', 400);
  }
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new ServiceError('El archivo no es una imagen válida', 400);
  }
  const mimeByFormat: Record<string, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };
  const extensionByFormat: Record<string, string> = { png: '.png', jpeg: '.jpg', webp: '.webp' };
  const mime = mimeByFormat[metadata.format];
  if (!mime) throw new ServiceError('Solo se permiten imágenes PNG, JPEG o WebP', 400);
  if (metadata.width * 5 !== metadata.height * 4) {
    throw new ServiceError('La imagen debe tener proporción 4:5', 400);
  }

  const now = new Date();
  const assetId = randomUUID();
  if (!/^[a-zA-Z0-9_-]+$/.test(options.campaignId)) {
    throw new ServiceError('Ruta de asset no autorizada', 403);
  }
  const baseSegments = [
    'contenido',
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    options.campaignId,
  ];
  const originals = await ensureDirectoryInside(options.root, [...baseSegments, 'originales']);
  const previews = await ensureDirectoryInside(options.root, [...baseSegments, 'previews']);
  const originalPath = join(originals, `${assetId}${extensionByFormat[metadata.format]}`);
  const previewPath = join(previews, `${assetId}.webp`);
  await writeFile(originalPath, options.buffer, { flag: 'wx' });
  await sharp(options.buffer)
    .resize({ width: 400, height: 500, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(previewPath);

  return {
    asset: {
      id: assetId,
      filename: `${assetId}${extname(originalPath)}`,
      mime,
      width: metadata.width,
      height: metadata.height,
      bytes: options.buffer.length,
      createdAt: now.toISOString(),
      campaignId: options.campaignId,
      role: options.role ?? 'imported',
    },
    paths: {
      original: relative(options.root, originalPath),
      preview: relative(options.root, previewPath),
    },
  };
}

export async function removeStoredImage(root: string, paths: StoredImage['paths']): Promise<void> {
  const rootReal = await realpath(resolve(root));
  for (const storedPath of [paths.original, paths.preview]) {
    if (isAbsolute(storedPath)) continue;
    const target = resolve(root, storedPath);
    if (!isPathInside(root, target)) continue;
    try {
      const targetReal = await realpath(target);
      if (isPathInside(rootReal, targetReal)) await unlink(targetReal);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
}

export async function ensureDirectoryInside(root: string, segments: string[]): Promise<string> {
  const rootPath = resolve(root);
  const rootReal = await realpath(rootPath);
  let currentPath = rootPath;
  let currentReal = rootReal;
  for (const segment of segments) {
    if (!/^[a-zA-Z0-9._-]+$/.test(segment) || segment === '.' || segment === '..') {
      throw new ServiceError('Ruta de asset no autorizada', 403);
    }
    const nextPath = join(currentPath, segment);
    try {
      await mkdir(nextPath);
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
    const nextReal = await realpath(nextPath);
    if (!isPathInside(rootReal, nextReal) || !isPathInside(currentReal, nextReal)) {
      throw new ServiceError('Ruta de asset no autorizada', 403);
    }
    currentPath = nextPath;
    currentReal = nextReal;
  }
  return currentPath;
}

function isPathInside(parent: string, child: string): boolean {
  const from = resolve(parent).toLocaleLowerCase();
  const to = resolve(child).toLocaleLowerCase();
  return to === from || to.startsWith(`${from}${sep}`);
}

function isAlreadyExists(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST');
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
