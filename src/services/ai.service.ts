import { WorkflowStatus } from '../generated/prisma/enums.js';
import {
  ANTHROPIC_MAX_RETRIES,
  ANTHROPIC_MODEL,
  ANTHROPIC_REQUEST_TIMEOUT_MS,
  anthropic,
} from '../lib/anthropic.js';
import { isRetryableAnthropicError, toAppError } from '../lib/anthropicErrors.js';
import { logger } from '../lib/logger.js';
import { sendReplyEmail } from '../lib/mailer.js';
import { prisma } from '../lib/prisma.js';
import {
  buildEmailAnalysisUserPrompt,
  emailAnalysisOutputFormat,
  getEmailAnalysisSystemPrompt,
} from '../prompts/emailAnalysis.prompt.js';
import {
  buildEmailReplyUserPrompt,
  emailReplyOutputFormat,
  getEmailReplySystemPrompt,
} from '../prompts/emailReply.prompt.js';
import type {
  AnalyzeEmailInput,
  EmailAnalysis,
  EmailReply,
  EmailReplyInput,
} from '../schemas/ai.schema.js';
import { AppError } from '../utils/AppError.js';
import { searchArticles } from './knowledgeBase.service.js';

const REQUEST_OPTIONS = {
  timeout: ANTHROPIC_REQUEST_TIMEOUT_MS,
  maxRetries: ANTHROPIC_MAX_RETRIES,
};

async function logWorkflowFailure(params: {
  workflow: string;
  emailId?: number;
  error: unknown;
}): Promise<void> {
  const { workflow, emailId, error } = params;
  try {
    await prisma.workflowLog.create({
      data: {
        workflow,
        status: WorkflowStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
        retryCount: isRetryableAnthropicError(error) ? ANTHROPIC_MAX_RETRIES : 0,
        emailId,
      },
    });
  } catch (logError) {
    // A logging failure must never mask the original error.
    logger.error({ err: logError, workflow }, 'Failed to write workflow_logs entry');
  }
}

async function withWorkflowLogging<T>(
  params: { workflow: string; emailId?: number },
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    await logWorkflowFailure({ ...params, error });
    throw toAppError(error);
  }
}

export async function analyzeEmail(input: AnalyzeEmailInput): Promise<EmailAnalysis> {
  return withWorkflowLogging({ workflow: 'ai_analyze', emailId: input.emailId }, async () => {
    const response = await anthropic.messages.parse(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: await getEmailAnalysisSystemPrompt(),
        messages: [{ role: 'user', content: buildEmailAnalysisUserPrompt(input) }],
        output_config: { format: emailAnalysisOutputFormat },
      },
      REQUEST_OPTIONS,
    );

    if (!response.parsed_output) {
      throw new AppError('Claude returned an empty or unparseable analysis', 502);
    }

    return response.parsed_output;
  });
}

export async function draftEmailReply(input: EmailReplyInput): Promise<EmailReply> {
  const draft = await withWorkflowLogging(
    { workflow: 'ai_reply', emailId: input.emailId },
    async () => {
      // Basic RAG: retrieve KB articles relevant to this email's category and
      // issue before drafting, so the reply can be grounded in real reference
      // content instead of the model inventing policy specifics. A retrieval
      // failure must never block reply drafting — fall back to ungrounded.
      let knowledgeArticles: Awaited<ReturnType<typeof searchArticles>> = [];
      try {
        knowledgeArticles = await searchArticles({
          category: input.category,
          query: `${input.issueSummary} ${input.summary}`,
        });
      } catch (error) {
        logger.warn({ err: error }, 'Knowledge base retrieval failed, drafting reply ungrounded');
      }

      const response = await anthropic.messages.parse(
        {
          model: ANTHROPIC_MODEL,
          max_tokens: 1024,
          system: await getEmailReplySystemPrompt(),
          messages: [
            { role: 'user', content: buildEmailReplyUserPrompt(input, knowledgeArticles) },
          ],
          output_config: { format: emailReplyOutputFormat },
        },
        REQUEST_OPTIONS,
      );

      if (!response.parsed_output) {
        throw new AppError('Claude returned an empty or unparseable reply draft', 502);
      }

      return response.parsed_output;
    },
  );

  if (!input.send) {
    return { ...draft, sent: false };
  }

  try {
    await sendReplyEmail({ to: input.sender, subject: draft.subject, body: draft.body });
  } catch (error) {
    await logWorkflowFailure({ workflow: 'ai_reply_send', emailId: input.emailId, error });
    throw new AppError(
      'Reply was drafted but failed to send',
      502,
      error instanceof Error ? error.message : undefined,
    );
  }

  if (input.emailId) {
    // The send already succeeded; a failure to record it must not be
    // reported to the caller as a failed send.
    await prisma.email
      .update({ where: { id: input.emailId }, data: { repliedAt: new Date() } })
      .catch((error: unknown) => {
        logger.error(
          { err: error, emailId: input.emailId },
          'Failed to record repliedAt after sending reply',
        );
      });
  }

  return { ...draft, sent: true };
}
