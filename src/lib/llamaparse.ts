import { env } from '../config/env.js';

const LLAMAPARSE_BASE_URL = 'https://api.cloud.llamaindex.ai/api/parsing';

// LlamaParse parses documents asynchronously (upload -> poll -> fetch
// result). Kept small since, like the Claude calls in ai.service.ts, this
// sits inline in a request/response cycle (the post-upload extraction hook).
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;

// Lazy check, same pattern as lib/mailer.ts / lib/storage.ts: a missing
// LlamaParse config only breaks this specific extraction path — the caller
// (invoice.service.ts#extractInvoice) treats that as a LlamaParse failure
// and falls back to sending the PDF directly to Claude, so it must never
// break app startup or unrelated routes.
function getApiKey(): string {
  if (!env.llamaParseApiKey) {
    throw new Error('LlamaParse is not configured (LLAMAPARSE_API_KEY)');
  }
  return env.llamaParseApiKey;
}

interface LlamaParseUploadResponse {
  id: string;
}

interface LlamaParseJobStatusResponse {
  status: 'PENDING' | 'SUCCESS' | 'ERROR' | 'CANCELLED' | string;
}

interface LlamaParseMarkdownResultResponse {
  markdown: string;
}

async function llamaParseRequest<T>(path: string, apiKey: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${LLAMAPARSE_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...init?.headers },
  });

  if (!response.ok) {
    throw new Error(
      `LlamaParse request to ${path} failed: ${response.status} ${await response.text()}`,
    );
  }

  return response.json() as Promise<T>;
}

// Uploads an invoice document to LlamaParse's cloud OCR/parsing service and
// polls until the job completes, returning structured markdown text. This is
// the primary extraction path (Phase 9.3): the markdown is handed to Claude
// for structured field extraction in invoice.service.ts#extractInvoice.
//
// Any failure here (missing config, upload error, a terminal ERROR/CANCELLED
// status, or exceeding the poll timeout) throws — the caller treats that as
// "LlamaParse failed" and falls back to sending the original PDF straight to
// Claude, per the fallback rule in TASKS.md 9.3.
export async function parseInvoiceDocument(params: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<string> {
  const apiKey = getApiKey();

  const form = new FormData();
  form.append(
    'file',
    new Blob([Uint8Array.from(params.buffer)], { type: params.mimeType }),
    params.fileName,
  );

  const { id: jobId } = await llamaParseRequest<LlamaParseUploadResponse>('/upload', apiKey, {
    method: 'POST',
    body: form,
  });

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const { status } = await llamaParseRequest<LlamaParseJobStatusResponse>(
      `/job/${jobId}`,
      apiKey,
    );

    if (status === 'SUCCESS') break;
    if (status === 'ERROR' || status === 'CANCELLED') {
      throw new Error(`LlamaParse job ${jobId} finished with status ${status}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`LlamaParse job ${jobId} did not complete within ${POLL_TIMEOUT_MS}ms`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  const { markdown } = await llamaParseRequest<LlamaParseMarkdownResultResponse>(
    `/job/${jobId}/result/markdown`,
    apiKey,
  );

  return markdown;
}
