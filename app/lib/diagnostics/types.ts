import { type URI } from '~/utils/uri';

/**
 * Níveis de severidade dos diagnósticos
 */
export enum DiagnosticSeverity {
  Hint = 1,
  Info = 2,
  Warning = 4,
  Error = 8,
}

/**
 * Tags opcionais para categorizar diagnósticos
 */
export enum DiagnosticTag {
  Unnecessary = 1,
  Deprecated = 2,
}

/**
 * Interface principal para dados de diagnóstico
 * Compatível com a interface DiagnosticItem existente
 */
export interface DiagnosticData {
  id: string;
  code?: string | { value: string; target: URI };
  severity: DiagnosticSeverity | 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source?: string;
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  relatedInformation?: RelatedInformation[];
  tags?: DiagnosticTag[];
}

/**
 * Informações relacionadas a um diagnóstico
 * Por exemplo, links para outros arquivos relacionados ao problema
 */
export interface RelatedInformation {
  resource: URI;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

/**
 * Ação de código para resolver um diagnóstico
 */
export interface CodeAction {
  title: string;
  kind: string;
  diagnostics: DiagnosticData[];
  edit?: WorkspaceEdit;
  isPreferred?: boolean;
}

/**
 * Edição de workspace para correções
 */
export interface WorkspaceEdit {
  edits: TextEdit[];
}

/**
 * Edição de texto para correções
 */
export interface TextEdit {
  resource: URI;
  edit: {
    range: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
    text: string;
  };
}

/**
 * Padrão para extrair diagnósticos de saídas de ferramentas externas
 */
export interface ProblemPattern {
  regexp: RegExp;
  file?: number;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity?: number;
  code?: number;
  message?: number;
}

/**
 * Conversor de severidade básica para DiagnosticSeverity enum
 */
export function toSeverityEnum(severity: 'error' | 'warning' | 'info' | 'hint'): DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return DiagnosticSeverity.Error;
    case 'warning':
      return DiagnosticSeverity.Warning;
    case 'info':
      return DiagnosticSeverity.Info;
    case 'hint':
      return DiagnosticSeverity.Hint;
  }
  return DiagnosticSeverity.Info;
}

/**
 * Conversor de DiagnosticSeverity enum para string
 */
export function fromSeverityEnum(severity: DiagnosticSeverity): 'error' | 'warning' | 'info' | 'hint' {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return 'error';
    case DiagnosticSeverity.Warning:
      return 'warning';
    case DiagnosticSeverity.Info:
      return 'info';
    case DiagnosticSeverity.Hint:
      return 'hint';
  }
  return 'info';
}
