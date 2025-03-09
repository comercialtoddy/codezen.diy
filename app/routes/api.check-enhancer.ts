import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import { LLMManager } from '~/lib/modules/llm/manager';

const logger = createScopedLogger('api.check-enhancer');

// Loader para verificar a configuração do ambiente
export async function loader({ context, request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Adicione um token simples para evitar acessos não autorizados em produção
  const token = url.searchParams.get('token');

  if (process.env.NODE_ENV === 'production' && token !== 'check-enhancer-token') {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const cloudflareEnv = context?.cloudflare?.env || {};
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);
    const providerSettings = getProviderSettingsFromCookie(cookieHeader);

    // Obter informações sobre os provedores disponíveis
    const llmManager = LLMManager.getInstance(cloudflareEnv as any);
    const providers = llmManager.getAllProviders().map((provider) => {
      const apiKeyName = `${provider.name.toUpperCase()}_API_KEY`;
      const hasEnvKey = !!(cloudflareEnv as any)[apiKeyName];
      const hasCookieKey = !!apiKeys[provider.name];

      return {
        name: provider.name,
        hasApiKeyInEnv: hasEnvKey,
        hasApiKeyInCookie: hasCookieKey,
        models: provider.staticModels?.map((m) => m.name) || [],
      };
    });

    // Informações de diagnóstico
    const diagnosticInfo = {
      environment: process.env.NODE_ENV || 'unknown',
      cloudflareContextExists: !!context?.cloudflare,
      cloudflareEnvExists: !!context?.cloudflare?.env,
      availableProviders: providers,
      defaultProvider: DEFAULT_PROVIDER.name,
      defaultModel: DEFAULT_MODEL,
      apiKeysInCookie: Object.keys(apiKeys),
      requestHeaders: Object.fromEntries(request.headers.entries()),
    };

    logger.info('Enhancer diagnostic information collected', diagnosticInfo);

    return Response.json(diagnosticInfo);
  } catch (error) {
    logger.error('Error in check-enhancer:', error);
    return Response.json(
      {
        error: 'Error checking enhancer configuration',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// Action para testar o processamento de JSON
export async function action({ request }: ActionFunctionArgs) {
  try {
    // Tentar analisar JSON
    let data: Record<string, any>;

    try {
      data = (await request.json()) as Record<string, any>;
    } catch (error) {
      logger.error('Failed to parse JSON:', error);
      return Response.json(
        {
          error: 'JSON parsing failed',
          message: error instanceof Error ? error.message : String(error),
        },
        { status: 400 },
      );
    }

    // Se o JSON foi analisado com sucesso, retornar informações sobre ele
    return Response.json({
      success: true,
      parsedDataInfo: {
        hasMessage: !!data.message,
        hasModel: !!data.model,
        hasProvider: !!data.provider,
        providerName: data.provider?.name,
        messageLength: data.message ? data.message.length : 0,
        receivedKeys: Object.keys(data),
      },
    });
  } catch (error) {
    logger.error('Unhandled error in check-enhancer action:', error);
    return Response.json(
      {
        error: 'Unhandled error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
