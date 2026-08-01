import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  InternalServerError,
  RateLimitError,
} from '@anthropic-ai/sdk';

import { AppError } from '../utils/AppError.js';

// Shared between every service that calls the Anthropic API (ai.service.ts,
// invoice.service.ts) so the retryable-error classification and the
// thrown-error -> client-facing AppError mapping stay identical everywhere,
// per Anthropic SDK error-handling guidance (most specific to least specific).
export function isRetryableAnthropicError(error: unknown): boolean {
  return (
    error instanceof APIConnectionError ||
    error instanceof RateLimitError ||
    error instanceof InternalServerError
  );
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof APIConnectionTimeoutError) return new AppError('AI service timed out', 504);
  if (error instanceof RateLimitError)
    return new AppError('AI service is rate limited, try again shortly', 503);
  if (error instanceof APIError) return new AppError('AI service request failed', 502);
  return new AppError('AI request failed', 502);
}
