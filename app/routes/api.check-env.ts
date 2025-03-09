import { type LoaderFunction } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.check-env');

export const loader: LoaderFunction = async ({ context, request }) => {
  // Security check - only available in development or with admin token
  const url = new URL(request.url);
  const adminToken = url.searchParams.get('token');

  // In production, require a token (should be set in Cloudflare environment)
  const isProduction = process.env.NODE_ENV === 'production';
  const expectedToken = isProduction ? (context?.cloudflare?.env as any)?.ADMIN_TOKEN : 'dev-token';

  if (isProduction && adminToken !== expectedToken) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // Get API keys from cookie
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Get environment information
    const llmManager = LLMManager.getInstance(context?.cloudflare?.env as any);
    const envKeys = context?.cloudflare?.env ? Object.keys(context.cloudflare.env) : [];

    // Get available providers
    const providers = llmManager.getAllProviders().map((provider) => {
      const config = provider.config;
      const hasEnvKey = config.apiTokenKey ? !!(context?.cloudflare?.env as any)?.[config.apiTokenKey] : false;
      const hasCookieKey = !!apiKeys[provider.name];

      return {
        name: provider.name,
        apiTokenKey: config.apiTokenKey,
        hasEnvKey,
        hasCookieKey,
        modelsCount: provider.staticModels?.length || 0,
      };
    });

    const response = {
      environment: isProduction ? 'production' : 'development',
      cloudflareEnvAvailable: !!context?.cloudflare?.env,
      envKeyCount: envKeys.length,
      availableProviders: providers,
      nodeEnv: process.env.NODE_ENV,
    };

    logger.info('Environment check completed', response);

    return Response.json(response);
  } catch (error) {
    logger.error('Error during environment check:', error);

    return Response.json(
      {
        error: 'Error checking environment',
        message: error instanceof Error ? error.message : String(error),
        stack: process.env.NODE_ENV !== 'production' && error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
};
