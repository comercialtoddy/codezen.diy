import { DiagnosticSource, diagnosticService } from '~/lib/diagnostics/DiagnosticService';
import { DiagnosticSeverity, type DiagnosticData } from '~/lib/diagnostics/types';
import { createScopedLogger } from '~/utils/logger';
import { generateId } from '~/utils/fileUtils';

const _logger = createScopedLogger('ESLintDiagnosticProvider');

/**
 * Expressão regular para extrair informações de erros do ESLint
 */
const ESLINT_ERROR_REGEX = /(.+):(\d+):(\d+):\s+(error|warning|info)\s+(.+)\s+(\[[\w\-\/]+\])/;

/**
 * Provedor de diagnósticos para ESLint
 */
export class ESLintDiagnosticProvider {
  constructor() {
    this._registerProblemMatchers();
  }

  /**
   * Registra padrões para extração de erros
   */
  private _registerProblemMatchers() {
    // Registrar padrão para saída do ESLint
    diagnosticService.registerProblemMatcher('eslint', {
      regexp: ESLINT_ERROR_REGEX,
      file: 1,
      line: 2,
      column: 3,
      severity: 4,
      message: 5,
      code: 6,
    });
  }

  /**
   * Processa um arquivo para diagnósticos baseados em regras do ESLint
   */
  processFile(filePath: string, content: string): DiagnosticData[] {
    /*
     * Nota: em um ambiente real, você estaria invocando o ESLint API
     * Esta é uma implementação simplificada para demonstração
     */

    const diagnostics: DiagnosticData[] = [];

    // Detectar problemas comuns que o ESLint pegaria
    this._detectUnusedVariables(filePath, content, diagnostics);
    this._detectConsoleStatements(filePath, content, diagnostics);
    this._detectNoVarUse(filePath, content, diagnostics);
    this._detectEqEqEq(filePath, content, diagnostics);
    this._detectUnreachableCode(filePath, content, diagnostics);

    return diagnostics;
  }

  /**
   * Processa a saída do ESLint
   */
  processLintOutput(output: string, basePath?: string): DiagnosticData[] {
    return diagnosticService.extractDiagnosticsFromOutput(output, 'eslint', DiagnosticSource.ESLint, basePath);
  }

  /**
   * Detecta variáveis declaradas mas não utilizadas
   */
  private _detectUnusedVariables(filePath: string, content: string, diagnostics: DiagnosticData[]) {
    // Implementação simplificada - no real ESLint, isso seria mais robusto
    const declarationRegex = /(?:const|let|var)\s+(\w+)\s*=/g;
    const declarations: { name: string; pos: { line: number; column: number } }[] = [];

    let match: RegExpExecArray | null;

    while ((match = declarationRegex.exec(content)) !== null) {
      const varName = match[1];
      const position = this._getPositionFromMatch(content, match.index);
      declarations.push({ name: varName, pos: position });
    }

    // Verificar uso de cada variável (simplificado)
    for (const decl of declarations) {
      const usageRegex = new RegExp(`\\b${decl.name}\\b`, 'g');
      let usageCount = 0;
      let _usageMatch: RegExpExecArray | null;

      usageRegex.lastIndex = content.indexOf(
        '\n',
        content.substring(0, content.length).split('\n').slice(0, decl.pos.line).join('\n').length,
      );

      while ((_usageMatch = usageRegex.exec(content)) !== null) {
        usageCount++;
      }

      // Se só temos uma ocorrência, é somente a declaração
      if (usageCount <= 1) {
        diagnostics.push({
          id: `eslint-no-unused-vars-${filePath}-${decl.pos.line}-${decl.pos.column}-${generateId()}`,
          filePath,
          line: decl.pos.line,
          column: decl.pos.column,
          message: `Variável '${decl.name}' está declarada mas nunca é utilizada`,
          severity: DiagnosticSeverity.Warning,
          source: DiagnosticSource.ESLint,
          code: 'no-unused-vars',
        });
      }
    }
  }

  /**
   * Detecta uso de console.log e similares
   */
  private _detectConsoleStatements(filePath: string, content: string, diagnostics: DiagnosticData[]) {
    const consoleRegex = /console\.(log|warn|error|info)\(/g;
    let match: RegExpExecArray | null;

    while ((match = consoleRegex.exec(content)) !== null) {
      const consoleMethod = match[1];
      const position = this._getPositionFromMatch(content, match.index);

      diagnostics.push({
        id: `eslint-no-console-${filePath}-${position.line}-${position.column}-${generateId()}`,
        filePath,
        line: position.line,
        column: position.column,
        message: `Inesperado console.${consoleMethod}`,
        severity: DiagnosticSeverity.Warning,
        source: DiagnosticSource.ESLint,
        code: 'no-console',
      });
    }
  }

  /**
   * Detecta uso de 'var' (preferir const/let)
   */
  private _detectNoVarUse(filePath: string, content: string, diagnostics: DiagnosticData[]) {
    const varRegex = /\bvar\s+/g;
    let match: RegExpExecArray | null;

    while ((match = varRegex.exec(content)) !== null) {
      const position = this._getPositionFromMatch(content, match.index);

      diagnostics.push({
        id: `eslint-no-var-${filePath}-${position.line}-${position.column}-${generateId()}`,
        filePath,
        line: position.line,
        column: position.column,
        message: 'Uso inesperado de var. Use const ou let',
        severity: DiagnosticSeverity.Warning,
        source: DiagnosticSource.ESLint,
        code: 'no-var',
      });
    }
  }

  /**
   * Detecta uso de == em vez de ===
   */
  private _detectEqEqEq(filePath: string, content: string, diagnostics: DiagnosticData[]) {
    // Procurar por == mas não ===, != mas não !==
    const eqeqRegex = /([^=!])(==|!=)([^=])/g;
    let match: RegExpExecArray | null;

    while ((match = eqeqRegex.exec(content)) !== null) {
      const operator = match[2];
      const position = this._getPositionFromMatch(content, match.index + match[1].length);

      diagnostics.push({
        id: `eslint-eqeqeq-${filePath}-${position.line}-${position.column}-${generateId()}`,
        filePath,
        line: position.line,
        column: position.column,
        message: `Use ${operator}= em vez de ${operator}`,
        severity: DiagnosticSeverity.Warning,
        source: DiagnosticSource.ESLint,
        code: 'eqeqeq',
      });
    }
  }

  /**
   * Detecta código potencialmente inalcançável
   */
  private _detectUnreachableCode(filePath: string, content: string, diagnostics: DiagnosticData[]) {
    // Procurar por padrões comuns de código inalcançável
    const unreachableRegexes = [
      {
        pattern: /\breturn\b[^;]*;[\s\n]*((?!\/\/).)*?[\s\n]*\S+/g,
        message: 'Código após return nunca será executado',
      },
      {
        pattern: /\bbreak\b[^;]*;[\s\n]*((?!\/\/).)*?[\s\n]*\S+[\s\n]*\}/g,
        message: 'Código após break nunca será executado',
      },
      {
        pattern: /\bcontinue\b[^;]*;[\s\n]*((?!\/\/).)*?[\s\n]*\S+[\s\n]*\}/g,
        message: 'Código após continue nunca será executado',
      },
      { pattern: /\bthrow\b[^;]*;[\s\n]*((?!\/\/).)*?[\s\n]*\S+/g, message: 'Código após throw nunca será executado' },
    ];

    for (const { pattern, message } of unreachableRegexes) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;

      while ((match = pattern.exec(content)) !== null) {
        const position = this._getPositionFromMatch(content, match.index);

        diagnostics.push({
          id: `eslint-no-unreachable-${filePath}-${position.line}-${position.column}-${generateId()}`,
          filePath,
          line: position.line,
          column: position.column,
          message,
          severity: DiagnosticSeverity.Error,
          source: DiagnosticSource.ESLint,
          code: 'no-unreachable',
        });
      }
    }
  }

  /**
   * Converte índice de caractere em posição de linha/coluna
   */
  private _getPositionFromMatch(content: string, index: number): { line: number; column: number } {
    const lines = content.substring(0, index).split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;

    return { line, column };
  }
}

// Instância global do provedor
export const eslintDiagnosticProvider = new ESLintDiagnosticProvider();
