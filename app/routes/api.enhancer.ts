import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { streamText } from '~/lib/.server/llm/stream-text';
import { stripIndents } from '~/utils/stripIndent';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { createScopedLogger } from '~/utils/logger';
import type { Message } from 'ai';

export async function action(args: ActionFunctionArgs) {
  try {
    return await enhancerAction(args);
  } catch (error) {
    console.error('Error in enhancer action:', error);

    if (error instanceof Response) {
      return error;
    }

    return new Response(JSON.stringify({ error: 'Internal Server Error', message: error?.toString() }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

const logger = createScopedLogger('api.enhancher');

type EnhancerRequestBody = {
  message: string;
  model: string;
  provider: ProviderInfo;
  apiKeys?: Record<string, string>;
};

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  try {
    // Parse JSON body
    let data: EnhancerRequestBody;

    try {
      data = (await request.json()) as EnhancerRequestBody;
    } catch (e) {
      logger.error('Failed to parse request body:', e);
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { message, model, provider, apiKeys: requestApiKeys } = data;

    if (!message) {
      return new Response(JSON.stringify({ error: 'Missing message' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const providerName = provider?.name;

    // validate 'model' and 'provider' fields
    if (!model || typeof model !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid or missing model' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!providerName || typeof providerName !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid or missing provider' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get API keys from cookies
    const cookieHeader = request.headers.get('Cookie');
    const cookieApiKeys = getApiKeysFromCookie(cookieHeader);
    const apiKeys = requestApiKeys || cookieApiKeys;
    const providerSettings = getProviderSettingsFromCookie(cookieHeader);

    // Log environment information for debugging
    const cloudflareEnvExists = !!context?.cloudflare?.env;
    logger.info(`CloudflareEnv exists: ${cloudflareEnvExists}`);

    // In production, we might need to use a different approach
    const envForLLM = context?.cloudflare?.env || {};

    // Check if we have API keys
    const apiKeyName = `${providerName.toUpperCase()}_API_KEY`;

    if (!apiKeys[providerName] && !(envForLLM as Record<string, any>)[apiKeyName]) {
      logger.warn(`No API key found for provider: ${providerName}`);
    }

    // Construct messages for the LLM
    const messages: Omit<Message, 'id'>[] = [
      {
        role: 'user' as const,
        content:
          `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n` +
          stripIndents`
          You are a professional prompt engineer specializing in crafting precise, effective prompts.
          Your task is to enhance prompts by making them more specific, actionable, and effective.

          I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

          For valid prompts:
          - Make instructions explicit and unambiguous
          - Add relevant context and constraints
          - Remove redundant information
          - Maintain the core intent
          - Ensure the prompt is self-contained
          - Use professional language

          For invalid or unclear prompts:
          - Respond with clear, professional guidance
          - Keep responses concise and actionable
          - Maintain a helpful, constructive tone
          - Focus on what the user should provide
          - Use a standard template for consistency

          IMPORTANT: Your response must ONLY contain the enhanced prompt text.
          Do not include any explanations, metadata, or wrapper tags.

          <original_prompt>
            ${message}
          </original_prompt>
        `,
      },
    ];

    try {
      // Use the streamText function with our prepared data
      const result = await streamText({
        messages,
        env: envForLLM,
        apiKeys,
        providerSettings,
        options: {
          system:
            'You are a senior software principal architect, you should help the user analyse the user query and enrich it with the necessary context and constraints to make it more specific, actionable, and effective. You should also ensure that the prompt is self-contained and uses professional language. Your response should ONLY contain the enhanced prompt text. Do not include any explanations, metadata, or wrapper tags.',
        },
      });

      // Process streaming errors in a non-blocking way
      (async () => {
        try {
          for await (const part of result.fullStream) {
            if (part.type === 'error') {
              const error: any = part.error;
              logger.error('Streaming error:', error);
              break;
            }
          }
        } catch (error) {
          logger.error('Error processing stream:', error);
        }
      })();

      // Set appropriate headers and return the stream
      return new Response(result.textStream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    } catch (error: unknown) {
      logger.error('Error in streamText:', error);

      // Handle specific API key errors
      if (error instanceof Error && error.message?.includes('API key')) {
        return new Response(
          JSON.stringify({
            error: 'Unauthorized',
            message: 'Invalid or missing API key',
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      // Handle other errors
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  } catch (error) {
    logger.error('Unhandled error in enhancerAction:', error);

    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
