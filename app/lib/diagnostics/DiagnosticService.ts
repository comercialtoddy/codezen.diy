import { diagnosticsStore } from '~/lib/stores/diagnostics';
import { type DiagnosticItem } from '~/components/workbench/diagnostics/DiagnosticsPanel';
import {
  type DiagnosticData,
  type CodeAction,
  type ProblemPattern,
  DiagnosticSeverity,
  fromSeverityEnum,
} from './types';
import { createScopedLogger } from '~/utils/logger';
import { generateId } from '~/utils/fileUtils';

const logger = createScopedLogger('DiagnosticService');

/**
 * Categorias de diagnósticos por fonte
 */
export enum DiagnosticSource {
  TypeScript = 'typescript',
  ESLint = 'eslint',
  Stylelint = 'stylelint',
  Webpack = 'webpack',
  Jest = 'jest',
  NPM = 'npm',
  Syntax = 'syntax-checker',
  WorkspaceIndex = 'workspace-index',
  Custom = 'custom',
}

/**
 * Categorias de ações de código
 */
export enum CodeActionKind {
  QuickFix = 'quickfix',
  Refactor = 'refactor',
  RefactorExtract = 'refactor.extract',
  RefactorInline = 'refactor.inline',
  RefactorRewrite = 'refactor.rewrite',
  Source = 'source',
  SourceOrganizeImports = 'source.organizeImports',
  SourceFixAll = 'source.fixAll',
}

/**
 * Serviço principal para gerenciamento de diagnósticos
 */
export class DiagnosticService {
  // Map para armazenar ações de código por diagnóstico
  private readonly _codeActions = new Map<string, CodeAction[]>();

  // Padrões para extração de erros de saídas de ferramentas externas
  private readonly _problemMatchers = new Map<string, ProblemPattern>();

  private readonly _fileContextCache = new Map<
    string,
    {
      originalContent?: string;
      lastModified: number;
      history: Array<{ timestamp: number; content: string }>;
    }
  >();

  /**
   * Registrar um novo provedor de diagnósticos
   */
  registerDiagnosticProvider(providerId: string, filter?: { language?: string; filePattern?: string }) {
    logger.debug(`Provedor de diagnósticos registrado: ${providerId}`, filter);

    // Implementação futura para registro de diagnósticos por provedores externos
  }

  /**
   * Registra um padrão para extração de diagnósticos de saídas de ferramentas
   */
  registerProblemMatcher(id: string, pattern: ProblemPattern) {
    this._problemMatchers.set(id, pattern);
  }

  /**
   * Adiciona um novo diagnóstico
   */
  addDiagnostic(diagnostic: DiagnosticData) {
    // Converter para o formato DiagnosticItem para compatibilidade
    const item: DiagnosticItem = {
      id: diagnostic.id,
      filePath: diagnostic.filePath,
      line: diagnostic.line,
      column: diagnostic.column,
      message: diagnostic.message,
      severity: typeof diagnostic.severity === 'string' ? diagnostic.severity : fromSeverityEnum(diagnostic.severity),
      source: diagnostic.source,
      code: typeof diagnostic.code === 'string' ? diagnostic.code : undefined,
    };

    // Adicionar usando o store existente
    diagnosticsStore.addDiagnostic(item);
  }

  /**
   * Extrai diagnósticos de uma saída de texto usando padrões registrados
   */
  extractDiagnosticsFromOutput(output: string, matcherId: string, source: string, basePath?: string): DiagnosticData[] {
    const pattern = this._problemMatchers.get(matcherId);

    if (!pattern) {
      logger.warn(`Matcher não encontrado: ${matcherId}`);
      return [];
    }

    const diagnostics: DiagnosticData[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = pattern.regexp.exec(line);

      if (!match) {
        continue;
      }

      // Extrair informações com base nos grupos definidos no padrão
      const filePath =
        pattern.file !== undefined && match[pattern.file]
          ? basePath
            ? `${basePath}/${match[pattern.file]}`
            : match[pattern.file]
          : '';

      if (!filePath) {
        continue;
      }

      const lineNumber = pattern.line !== undefined && match[pattern.line] ? parseInt(match[pattern.line], 10) : 1;

      const column = pattern.column !== undefined && match[pattern.column] ? parseInt(match[pattern.column], 10) : 1;

      const message = pattern.message !== undefined && match[pattern.message] ? match[pattern.message] : line;

      const severityIndex =
        pattern.severity !== undefined && match[pattern.severity]
          ? parseInt(match[pattern.severity], 10)
          : DiagnosticSeverity.Error;

      const severity =
        severityIndex === DiagnosticSeverity.Error
          ? 'error'
          : severityIndex === DiagnosticSeverity.Warning
            ? 'warning'
            : 'info';

      const code = pattern.code !== undefined && match[pattern.code] ? match[pattern.code] : undefined;

      const diagnostic: DiagnosticData = {
        id: `${source}-${filePath}-${lineNumber}-${column}-${generateId()}`,
        filePath,
        line: lineNumber,
        column,
        message,
        severity,
        source,
        code,
      };

      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }

  /**
   * Adiciona uma ação de código para resolver diagnósticos
   */
  addCodeAction(diagnosticId: string, action: CodeAction) {
    const actions = this._codeActions.get(diagnosticId) || [];
    actions.push(action);
    this._codeActions.set(diagnosticId, actions);
  }

  /**
   * Obtém ações de código disponíveis para um diagnóstico
   */
  getCodeActions(diagnosticId: string): CodeAction[] {
    return this._codeActions.get(diagnosticId) || [];
  }

  /**
   * Aplica uma ação de código para resolver um problema
   */
  async applyCodeAction(action: CodeAction): Promise<void> {
    if (!action.edit) {
      logger.warn('Tentativa de aplicar ação de código sem edição');
      return;
    }

    // Implementação futura para aplicar edições
    logger.info(`Aplicando ação de código: ${action.title}`);
  }

  /**
   * Extrai diagnósticos de analisadores de código com formatos específicos
   */
  processDiagnosticsFromAnalyzer(
    _results: unknown,
    analyzerType: 'eslint' | 'typescript' | 'stylelint',
    basePath?: string,
  ): DiagnosticData[] {
    // Implementação específica para cada tipo de analisador
    if (analyzerType === 'eslint') {
      return this._processESLintResults(_results, basePath);
    }

    if (analyzerType === 'typescript') {
      return this._processTypeScriptResults(_results, basePath);
    }

    if (analyzerType === 'stylelint') {
      return this._processStylelintResults(_results, basePath);
    }

    return [];
  }

  /**
   * Processamento específico para resultados do ESLint
   */
  private _processESLintResults(_results: any, _basePath?: string): DiagnosticData[] {
    // Implementação futura
    return [];
  }

  /**
   * Processamento específico para resultados do TypeScript
   */
  private _processTypeScriptResults(_results: any, _basePath?: string): DiagnosticData[] {
    // Implementação futura
    return [];
  }

  /**
   * Processamento específico para resultados do Stylelint
   */
  private _processStylelintResults(_results: any, _basePath?: string): DiagnosticData[] {
    // Implementação futura
    return [];
  }

  /**
   * Adiciona contexto do arquivo para diagnósticos mais precisos
   */
  updateFileContext(filePath: string, currentContent: string, originalContent?: string) {
    let context = this._fileContextCache.get(filePath);

    if (!context) {
      // Criar novo contexto
      context = {
        originalContent,
        lastModified: Date.now(),
        history: [],
      };
      this._fileContextCache.set(filePath, context);
    }

    // Atualizar contexto com conteúdo atual
    context.lastModified = Date.now();
    context.history.push({
      timestamp: Date.now(),
      content: currentContent,
    });

    // Manter apenas as últimas 5 versões para limitar uso de memória
    if (context.history.length > 5) {
      context.history = context.history.slice(-5);
    }

    // Se original não foi definido antes, defina agora
    if (!context.originalContent && originalContent) {
      context.originalContent = originalContent;
    }

    logger.debug(`Contexto de arquivo atualizado para ${filePath}`);
  }

  /**
   * Obtém o contexto histórico de um arquivo
   */
  getFileContext(filePath: string) {
    return this._fileContextCache.get(filePath);
  }

  /**
   * Analisa o histórico de alterações para diagnósticos relevantes ao contexto
   */
  analyzeChanges(filePath: string, currentContent: string): DiagnosticData[] {
    const context = this._fileContextCache.get(filePath);
    const diagnostics: DiagnosticData[] = [];

    if (!context || !context.originalContent) {
      return diagnostics;
    }

    // Verificar padrões comuns que podem indicar problemas em alterações

    // 1. Verificar alterações em nomes de variáveis/funções
    const originalTokens = this._extractTokens(context.originalContent);
    const currentTokens = this._extractTokens(currentContent);

    // Detectar renomeações de símbolos
    const renamedTokens = this._findRenamedTokens(originalTokens, currentTokens);

    // Adicionar diagnósticos para símbolos renomeados
    for (const [oldName, newName] of Object.entries(renamedTokens)) {
      // Encontrar todas ocorrências do novo nome
      const regex = new RegExp(`\\b${newName}\\b`, 'g');
      let match;

      while ((match = regex.exec(currentContent)) !== null) {
        const position = this._getPositionFromIndex(currentContent, match.index);

        diagnostics.push({
          id: `rename-detection-${filePath}-${position.line}-${position.column}-${Date.now()}`,
          filePath,
          line: position.line,
          column: position.column,
          message: `Símbolo renomeado de '${oldName}' para '${newName}'. Verifique se todas as referências foram atualizadas.`,
          severity: DiagnosticSeverity.Info,
          source: DiagnosticSource.Custom,
          code: 'rename-detection',
        });
      }
    }

    // 2. Verificar mudanças estruturais (adição/remoção de blocos)
    const structuralChanges = this._detectStructuralChanges(context.originalContent, currentContent);

    if (structuralChanges.addedBlocks > 0 || structuralChanges.removedBlocks > 0) {
      // Adicionar um diagnóstico geral na primeira linha
      diagnostics.push({
        id: `structural-change-${filePath}-${Date.now()}`,
        filePath,
        line: 1,
        column: 1,
        message: `Alterações estruturais detectadas: ${structuralChanges.addedBlocks} blocos adicionados, ${structuralChanges.removedBlocks} blocos removidos.`,
        severity: DiagnosticSeverity.Info,
        source: DiagnosticSource.Custom,
        code: 'structural-change',
      });
    }

    return diagnostics;
  }

  /**
   * Extrai tokens (palavras-chave, identificadores) de um texto
   */
  private _extractTokens(content: string): Set<string> {
    // Regex simples para identificadores JavaScript/TypeScript
    const tokenRegex = /\b[a-zA-Z_$][\w$]*\b/g;
    const tokens = new Set<string>();

    let match;

    while ((match = tokenRegex.exec(content)) !== null) {
      tokens.add(match[0]);
    }

    return tokens;
  }

  /**
   * Encontra tokens que foram renomeados
   */
  private _findRenamedTokens(originalTokens: Set<string>, currentTokens: Set<string>): Record<string, string> {
    const renamedTokens: Record<string, string> = {};

    /*
     * Implementação simplificada - em um sistema real, precisaria de análise mais sofisticada
     * Aqui estamos apenas detectando padrões simples de renomeação
     */

    // Converter para arrays para facilitar comparação
    const origArray = Array.from(originalTokens);
    const currArray = Array.from(currentTokens);

    // Encontrar tokens que existiam e foram removidos
    const removedTokens = origArray.filter((token) => !currentTokens.has(token));

    // Encontrar tokens que não existiam e foram adicionados
    const addedTokens = currArray.filter((token) => !originalTokens.has(token));

    /*
     * Heurística simples: se o número de tokens removidos é similar ao de adicionados,
     * e os tokens são similares, podemos assumir que houve renomeação
     */
    if (removedTokens.length > 0 && removedTokens.length === addedTokens.length) {
      for (let i = 0; i < removedTokens.length; i++) {
        // Verificar similaridade
        if (this._tokenSimilarity(removedTokens[i], addedTokens[i]) > 0.5) {
          renamedTokens[removedTokens[i]] = addedTokens[i];
        }
      }
    }

    return renamedTokens;
  }

  /**
   * Calcula similaridade entre dois tokens
   */
  private _tokenSimilarity(token1: string, token2: string): number {
    // Implementação simplificada da distância de Levenshtein
    if (token1 === token2) {
      return 1.0;
    }

    const len1 = token1.length;
    const len2 = token2.length;

    // Se a diferença de tamanho é mais que 50%, são considerados diferentes
    if (Math.abs(len1 - len2) / Math.max(len1, len2) > 0.5) {
      return 0.0;
    }

    // Contar caracteres iguais na mesma posição
    let matches = 0;
    const minLen = Math.min(len1, len2);

    for (let i = 0; i < minLen; i++) {
      if (token1[i] === token2[i]) {
        matches++;
      }
    }

    return matches / Math.max(len1, len2);
  }

  /**
   * Detecta mudanças estruturais entre duas versões de código
   */
  private _detectStructuralChanges(originalContent: string, currentContent: string) {
    // Contagem simples de blocos de código
    const countBlocks = (content: string) => {
      return (content.match(/[{]/g) || []).length;
    };

    const originalBlocks = countBlocks(originalContent);
    const currentBlocks = countBlocks(currentContent);

    return {
      addedBlocks: Math.max(0, currentBlocks - originalBlocks),
      removedBlocks: Math.max(0, originalBlocks - currentBlocks),
    };
  }

  /**
   * Converte um índice de caractere em posição de linha/coluna
   */
  private _getPositionFromIndex(content: string, index: number) {
    const lines = content.substring(0, index).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }
}

// Instância global do serviço de diagnósticos
export const diagnosticService = new DiagnosticService();
