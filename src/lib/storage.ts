import { randomUUID } from 'node:crypto';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { env } from '../config/env.js';

let client: S3Client | undefined;

// Lazy singleton, same pattern as lib/mailer.ts: a missing S3 config only
// breaks the invoice upload/read path, not app startup.
function getClient(): S3Client {
  if (!env.s3Bucket || !env.s3AccessKeyId || !env.s3SecretAccessKey) {
    throw new Error(
      'S3 storage is not configured (S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY)',
    );
  }

  client ??= new S3Client({
    region: env.s3Region,
    endpoint: env.s3Endpoint || undefined,
    forcePathStyle: env.s3ForcePathStyle,
    credentials: {
      accessKeyId: env.s3AccessKeyId,
      secretAccessKey: env.s3SecretAccessKey,
    },
  });

  return client;
}

// Reference URL for display/linking only (e.g. a future review-queue UI).
// Reads always go through readFile() below via the SDK, not this URL, so it
// works the same whether the bucket is public or private.
function buildDocumentUrl(storageKey: string): string {
  if (env.s3Endpoint) {
    return `${env.s3Endpoint.replace(/\/$/, '')}/${env.s3Bucket}/${storageKey}`;
  }
  return `https://${env.s3Bucket}.s3.${env.s3Region}.amazonaws.com/${storageKey}`;
}

export interface StoredFile {
  storageKey: string;
  documentUrl: string;
}

// Persists an invoice source file (PDF/image) to the configured S3-compatible
// bucket. Keyed by a random UUID, never the original filename, so uploads
// can never collide or overwrite each other.
export async function saveFile(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}): Promise<StoredFile> {
  const ext = params.originalName.includes('.') ? params.originalName.split('.').pop() : undefined;
  const storageKey = `invoices/${randomUUID()}${ext ? `.${ext}` : ''}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: storageKey,
      Body: params.buffer,
      ContentType: params.mimeType,
    }),
  );

  return { storageKey, documentUrl: buildDocumentUrl(storageKey) };
}

// Reads a stored file back into memory — used by the extraction pipeline
// (Phase 9.3) to hand the original bytes to Claude/LlamaParse.
export async function readFile(storageKey: string): Promise<Buffer> {
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: env.s3Bucket, Key: storageKey }),
  );

  if (!response.Body) {
    throw new Error(`Object not found in storage: ${storageKey}`);
  }

  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}
