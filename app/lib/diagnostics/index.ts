/**
 * Módulo de diagnósticos - Exporta todos os serviços e tipos relacionados a diagnósticos
 */

// Exportar tipos principais
export * from './types';

// Importar para uso local
import { DiagnosticSource, CodeActionKind, diagnosticService } from './DiagnosticService';
import { DiagnosticDecorationType, diagnosticDecorationService } from './DiagnosticDecorationService';
import { diagnosticNavigationService, type DiagnosticPosition } from './DiagnosticNavigationService';
import { typeScriptDiagnosticProvider } from './languageProviders/TypeScriptDiagnosticProvider';
import { eslintDiagnosticProvider } from './languageProviders/ESLintDiagnosticProvider';

// Re-exportar para uso externo
export { DiagnosticSource, CodeActionKind, diagnosticService };
export { DiagnosticDecorationType, diagnosticDecorationService };
export type { DiagnosticPosition };
export { diagnosticNavigationService };
export { typeScriptDiagnosticProvider };
export { eslintDiagnosticProvider };

/**
 * Inicializa o sistema de diagnósticos
 */
export function initializeDiagnosticSystem() {
  /*
   * Garantir que todas as instâncias são criadas
   * e seus construtores são executados
   */

  // Registrar provedores
  const providers = [typeScriptDiagnosticProvider, eslintDiagnosticProvider];

  // Registrar outros serviços conforme necessário
  const _services = [diagnosticService, diagnosticDecorationService, diagnosticNavigationService];

  console.log('[DiagnosticSystem] Inicializado com', providers.length, 'provedores');
}

// Adicionar mapeamentos para diagnósticos comuns em arquivos populares
export const fileExtensionToProviderMap: Record<string, string[]> = {
  // TypeScript
  '.ts': ['typescript', 'eslint'],
  '.tsx': ['typescript', 'eslint', 'react'],

  // JavaScript
  '.js': ['eslint'],
  '.jsx': ['eslint', 'react'],

  // Estilos
  '.css': ['stylelint'],
  '.scss': ['stylelint'],
  '.less': ['stylelint'],

  // Web
  '.html': ['htmlhint'],
  '.json': ['jsonlint'],

  // Markdown
  '.md': ['markdownlint'],

  // Python
  '.py': ['pylint', 'flake8'],

  // Java
  '.java': ['checkstyle'],

  // Outros
  '.go': ['golint'],
  '.rs': ['rustlint'],
};
