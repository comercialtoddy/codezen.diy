import { DiagnosticSource, diagnosticService } from '~/lib/diagnostics/DiagnosticService';
import { DiagnosticSeverity, type DiagnosticData } from '~/lib/diagnostics/types';
import { createScopedLogger } from '~/utils/logger';
import { generateId } from '~/utils/fileUtils';

const _logger = createScopedLogger('TypeScriptDiagnosticProvider');

/**
 * Códigos de erro do TypeScript e suas descrições
 */
export const TS_ERROR_CODES: Record<string, string> = {
  '2304': 'Não é possível encontrar o nome',
  '2322': 'Tipo não pode ser atribuído ao tipo',
  '2339': 'A propriedade não existe no tipo',
  '2345': 'O argumento não é atribuível ao parâmetro',
  '2366': 'Esta condição sempre retornará true',
  '2320': 'Interface com o mesmo nome já foi declarada',
  '2420': 'Classe com o mesmo nome já foi declarada',
  '2451': 'Não foi possível encontrar o arquivo no argumento --project',
  '2307': 'Não é possível encontrar o módulo',
  '2578': 'Módulo não é referenciado',
};

/**
 * Expressão regular para extrair informações de erro do TypeScript
 */
const TS_ERROR_REGEX = /(.+)\((\d+),(\d+)\): error TS(\d+): (.+)/;

/**
 * Provedor de diagnósticos para TypeScript
 */
export class TypeScriptDiagnosticProvider {
  constructor() {
    this._registerProblemMatchers();
  }

  /**
   * Registra padrões de extração de erros
   */
  private _registerProblemMatchers() {
    // Registrar padrão para saída do tsc (TypeScript Compiler)
    diagnosticService.registerProblemMatcher('typescript', {
      regexp: TS_ERROR_REGEX,
      file: 1,
      line: 2,
      column: 3,
      code: 4,
      message: 5,
    });
  }

  /**
   * Processa um arquivo TypeScript para diagnósticos
   */
  processFile(filePath: string, content: string): DiagnosticData[] {
    const diagnostics: DiagnosticData[] = [];

    // Verifica uso de 'any' explícito
    this._detectUnsafeAnyUsage(filePath, content, diagnostics);

    // Verifica uso de não-nulo sem verificação (!.)
    this._detectNonNullAssertions(filePath, content, diagnostics);

    // Detecta uso de APIs obsoletas
    this._detectDeprecatedAPIs(filePath, content, diagnostics);

    // Detecta problemas de tipos
    this._detectTypeIssues(filePath, content, diagnostics);

    return diagnostics;
  }

  /**
   * Processa a saída do compilador TypeScript
   */
  processCompilerOutput(output: string, basePath?: string): DiagnosticData[] {
    return diagnosticService.extractDiagnosticsFromOutput(output, 'typescript', DiagnosticSource.TypeScript, basePath);
  }

  /**
   * Detecta uso perigoso de 'any'
   */
  private _detectUnsafeAnyUsage(filePath: string, content: string, diagnostics: DiagnosticData[]) {
    const anyRegex = /:\s*any\b|\bas\s+any\b/g;
    let match: RegExpExecArray | null;

    while ((match = anyRegex.exec(content)) !== null) {
      const position = this._getPositionFromMatch(content, match.index);

      diagnostics.push({
        id: `ts-any-${filePath}-${position.line}-${position.column}-${generateId()}`,
        filePath,
        line: position.line,
        column: position.column,
        message: 'Uso de "any" pode levar a erros de tipo em runtime. Considere usar tipos mais específicos.',
        severity: DiagnosticSeverity.Warning,
        source: DiagnosticSource.TypeScript,
        code: '2020',
      });
    }
  }

  /**
   * Detecta uso de non-null assertion operator (!)
   */
  private _detectNonNullAssertions(filePath: string, content: string, diagnostics: DiagnosticData[]) {
    const nonNullRegex = /(\w+)!\.|\(.*\)!\./g;
    let match: RegExpExecArray | null;

    while ((match = nonNullRegex.exec(content)) !== null) {
      const position = this._getPositionFromMatch(content, match.index);

      diagnostics.push({
        id: `ts-non-null-${filePath}-${position.line}-${position.column}-${generateId()}`,
        filePath,
        line: position.line,
        column: position.column,
        message:
          'Uso do operador non-null assertion (!) pode causar erro se o valor for null/undefined. Considere usar operador opcional (?.) ou verificação explícita.',
        severity: DiagnosticSeverity.Info,
        source: DiagnosticSource.TypeScript,
        code: '2074',
      });
    }
  }

  /**
   * Detecta uso de APIs obsoletas
   */
  private _detectDeprecatedAPIs(filePath: string, content: string, diagnostics: DiagnosticData[]) {
    // Lista de APIs obsoletas do TypeScript ou bibliotecas comuns
    const deprecatedAPIs = [
      {
        pattern: /componentWillMount|componentWillReceiveProps|componentWillUpdate/,
        message: 'API React obsoleta',
        code: '0001',
      },
      { pattern: /React\.createClass/, message: 'React.createClass está obsoleto, use ES6 classes', code: '0002' },
      { pattern: /findDOMNode/, message: 'findDOMNode está obsoleto, use refs', code: '0003' },
      {
        pattern: /new Buffer\(/,
        message: 'new Buffer() está obsoleto, use Buffer.from() ou Buffer.alloc()',
        code: '0004',
      },
      { pattern: /\.substr\(/, message: '.substr() está obsoleto, use .substring() ou .slice()', code: '0005' },
    ];

    for (const api of deprecatedAPIs) {
      let match: RegExpExecArray | null;

      while ((match = api.pattern.exec(content)) !== null) {
        const position = this._getPositionFromMatch(content, match.index);

        diagnostics.push({
          id: `ts-deprecated-${filePath}-${position.line}-${position.column}-${generateId()}`,
          filePath,
          line: position.line,
          column: position.column,
          message: `API obsoleta: ${api.message}`,
          severity: DiagnosticSeverity.Warning,
          source: DiagnosticSource.TypeScript,
          code: api.code,
          tags: [2], // DiagnosticTag.Deprecated
        });
      }
    }
  }

  /**
   * Detecta problemas comuns de tipos
   */
  private _detectTypeIssues(filePath: string, content: string, diagnostics: DiagnosticData[]) {
    /*
     * Exemplo: verificar se tipos estão sendo usados corretamente
     * Na implementação real, isso seria feito com o analisador do TypeScript
     */

    // Exemplo simplificado para demonstração
    const typeIssueRegexes = [
      {
        pattern: /Promise<void>\s*=\s*.*=>.*\{/g,
        message: 'Function que retorna Promise<void> deve usar async/await ou retornar Promise explicitamente',
        code: '2100',
      },
      {
        pattern: /interface\s+\w+\s*\{\s*\[key: string\]:\s*any\s*;/g,
        message: 'Uso de índice com tipo any deve ser evitado',
        code: '2101',
      },
    ];

    for (const issue of typeIssueRegexes) {
      let match: RegExpExecArray | null;

      while ((match = issue.pattern.exec(content)) !== null) {
        const position = this._getPositionFromMatch(content, match.index);

        diagnostics.push({
          id: `ts-type-${filePath}-${position.line}-${position.column}-${generateId()}`,
          filePath,
          line: position.line,
          column: position.column,
          message: issue.message,
          severity: DiagnosticSeverity.Info,
          source: DiagnosticSource.TypeScript,
          code: issue.code,
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
export const typeScriptDiagnosticProvider = new TypeScriptDiagnosticProvider();
