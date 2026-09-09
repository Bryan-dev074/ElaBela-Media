import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import type { Campaign, CopyOption, Job, Product, Reference } from '../shared/types.js';
import { ServiceError } from './contracts.js';
import { ensureDirectoryInside } from './media.js';
import type { Store } from './store.js';

interface SourceDescription {
  path: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

export async function persistGenerationSources(input: {
  store: Store;
  campaign: Campaign;
  copy: CopyOption;
  job: Job;
  model: string;
  products: { product: Product; buffer: Buffer }[];
  logo: Buffer;
  references: { reference: Reference; buffer: Buffer }[];
  requests: { variantId: string; slot: number; prompt: string }[];
}) {
  const now = new Date();
  const segments = [
    'contenido',
    now.getUTCFullYear().toString(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    input.campaign.id,
    'fuentes-generacion',
    input.job.id,
  ];
  const jobDirectory = await ensureDirectoryInside(input.store.root, segments);
  const productsDirectory = await ensureDirectoryInside(input.store.root, [...segments, 'productos']);
  const referencesDirectory = await ensureDirectoryInside(input.store.root, [...segments, 'referencias']);
  const outputsDirectory = await ensureDirectoryInside(input.store.root, [...segments, 'salidas-proveedor']);

  const products = [];
  for (const [index, source] of input.products.entries()) {
    products.push({
      id: source.product.id,
      url: source.product.productUrl,
      ...(await persistSource(jobDirectory, productsDirectory, `producto-${index + 1}`, source.buffer)),
    });
  }
  const logo = await persistSource(jobDirectory, jobDirectory, 'logo', input.logo);
  const references = [];
  for (const [index, source] of input.references.entries()) {
    references.push({
      id: source.reference.id,
      url: source.reference.url,
      assetId: source.reference.assetId,
      ...(await persistSource(jobDirectory, referencesDirectory, `referencia-${index + 1}`, source.buffer)),
    });
  }

  await writeFile(
    join(jobDirectory, 'manifest.json'),
    `${JSON.stringify(
      {
        version: 1,
        jobId: input.job.id,
        campaignId: input.campaign.id,
        campaignRevision: input.campaign.revision,
        copyId: input.copy.id,
        model: input.model,
        createdAt: now.toISOString(),
        products,
        logo,
        references,
        requests: input.requests,
      },
      null,
      2,
    )}\n`,
    { flag: 'wx' },
  );
  return { jobDirectory, outputsDirectory };
}

async function persistSource(
  jobDirectory: string,
  directory: string,
  baseName: string,
  buffer: Buffer,
): Promise<SourceDescription> {
  const description = await describeImage(buffer);
  const path = join(directory, `${baseName}.${description.extension}`);
  await writeFile(path, buffer, { flag: 'wx' });
  return {
    path: relative(jobDirectory, path).replaceAll('\\', '/'),
    mime: description.mime,
    width: description.width,
    height: description.height,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

export async function describeImage(buffer: Buffer) {
  const metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  if (!metadata.width || !metadata.height || !metadata.format)
    throw new ServiceError('Una fuente de generación no es una imagen válida.', 400);
  const formats = {
    png: { extension: 'png', mime: 'image/png' },
    jpeg: { extension: 'jpg', mime: 'image/jpeg' },
    webp: { extension: 'webp', mime: 'image/webp' },
  } as const;
  const format = formats[metadata.format as keyof typeof formats];
  if (!format) throw new ServiceError('Una fuente de generación no usa PNG, JPEG o WebP.', 400);
  return { ...format, width: metadata.width, height: metadata.height };
}
