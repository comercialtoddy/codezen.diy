import { type DiagnosticItem } from '~/components/workbench/diagnostics/DiagnosticsPanel';
import { DiagnosticSeverity, type DiagnosticData } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DiagnosticDecorationService');

/**
 * Tipos de decoração visual para diagnósticos
 */
export enum DiagnosticDecorationType {
  Underline = 'underline',
  Squiggly = 'squiggly',
  LineBackground = 'lineBackground',
  InlineMessage = 'inlineMessage',
  GutterIcon = 'gutterIcon',
}

/**
 * Estilos visuais para diagnósticos no editor
 */
export interface DiagnosticDecorationStyle {
  type: DiagnosticDecorationType;
  className: string;
  hoverMessage?: string;
}

/**
 * Define uma decoração visual para um diagnóstico
 */
export interface DiagnosticDecoration {
  diagnosticId: string;
  filePath: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  style: DiagnosticDecorationStyle;
}

/**
 * Opções de renderização de diagnósticos
 */
export interface DiagnosticRenderOptions {
  showInline?: boolean;
  showGutter?: boolean;
  showUnderline?: boolean;
}

/**
 * Serviço para gerenciar decorações visuais de diagnósticos
 */
export class DiagnosticDecorationService {
  // Mapeamento de decorações por arquivo
  private readonly _decorations = new Map<string, DiagnosticDecoration[]>();

  // Renderizadores registrados pelo ID do editor
  private readonly _renderers = new Map<string, (decorations: DiagnosticDecoration[]) => void>();

  /**
   * Criar decorações visuais a partir de diagnósticos
   */
  createDecorations(diagnostics: DiagnosticItem[] | DiagnosticData[]): DiagnosticDecoration[] {
    const decorations: DiagnosticDecoration[] = [];

    for (const diagnostic of diagnostics) {
      const endLine = 'endLine' in diagnostic ? diagnostic.endLine : diagnostic.line;
      const endColumn = 'endColumn' in diagnostic ? diagnostic.endColumn : diagnostic.column + 1;

      const decoration: DiagnosticDecoration = {
        diagnosticId: diagnostic.id,
        filePath: diagnostic.filePath,
        range: {
          startLine: diagnostic.line,
          startColumn: diagnostic.column,
          endLine: endLine || diagnostic.line,
          endColumn: endColumn || diagnostic.column + 1,
        },
        style: this._getStyleForDiagnostic(diagnostic),
      };

      decorations.push(decoration);
    }

    return decorations;
  }

  /**
   * Adiciona decorações para um arquivo
   */
  setDecorations(filePath: string, decorations: DiagnosticDecoration[]) {
    this._decorations.set(filePath, decorations);
    this._notifyRenderersForFile(filePath);
  }

  /**
   * Registra um renderizador para decorações
   */
  registerRenderer(editorId: string, renderer: (decorations: DiagnosticDecoration[]) => void) {
    this._renderers.set(editorId, renderer);
  }

  /**
   * Remove um renderizador
   */
  unregisterRenderer(editorId: string) {
    this._renderers.delete(editorId);
  }

  /**
   * Notifica renderizadores sobre atualizações de decoração
   */
  private _notifyRenderersForFile(filePath: string) {
    const decorations = this._decorations.get(filePath) || [];

    /*
     * Na implementação real, notificaríamos apenas os renderizadores
     * associados ao arquivo atual
     */
    for (const renderer of this._renderers.values()) {
      renderer(decorations);
    }
  }

  /**
   * Determina o estilo visual baseado no tipo de diagnóstico
   */
  private _getStyleForDiagnostic(diagnostic: DiagnosticItem | DiagnosticData): DiagnosticDecorationStyle {
    const severity =
      typeof diagnostic.severity === 'string' ? diagnostic.severity : this._getSeverityString(diagnostic.severity);

    switch (severity) {
      case 'error':
        return {
          type: DiagnosticDecorationType.Squiggly,
          className: 'text-bolt-elements-icon-error border-b-2 border-bolt-elements-icon-error border-dotted',
          hoverMessage: diagnostic.message,
        };
      case 'warning':
        return {
          type: DiagnosticDecorationType.Squiggly,
          className: 'text-amber-500 border-b-2 border-amber-500 border-dotted',
          hoverMessage: diagnostic.message,
        };
      case 'info':
        return {
          type: DiagnosticDecorationType.Underline,
          className: 'text-bolt-elements-icon-secondary border-b border-bolt-elements-icon-secondary',
          hoverMessage: diagnostic.message,
        };
      case 'hint':
        return {
          type: DiagnosticDecorationType.Underline,
          className: 'text-bolt-elements-icon-tertiary border-b border-bolt-elements-icon-tertiary border-dashed',
          hoverMessage: diagnostic.message,
        };
      default:
        return {
          type: DiagnosticDecorationType.Underline,
          className: 'text-bolt-elements-icon-secondary border-b border-bolt-elements-icon-secondary',
          hoverMessage: diagnostic.message,
        };
    }
  }

  /**
   * Converte enum de severidade para string
   */
  private _getSeverityString(severity: DiagnosticSeverity): 'error' | 'warning' | 'info' | 'hint' {
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
    return 'info'; // Fallback default
  }

  /**
   * Cria um renderizador de diagnósticos para CodeMirror
   * Esta função seria expandida para integrar com o editor CodeMirror
   */
  createCodeMirrorRenderer(editorId: string, filePath: string, _options: DiagnosticRenderOptions = {}) {
    /*
     * Na implementação real, retornaríamos uma função que aplicaria
     * decorações ao editor CodeMirror
     */
    logger.debug(`Criando renderizador de diagnósticos para ${filePath}`);

    // Registramos um renderizador de exemplo
    this.registerRenderer(editorId, (decorations) => {
      logger.debug(`Rendering ${decorations.length} decorations for ${filePath}`);

      // Implementação real aplicaria as decorações ao editor
    });
  }
}

// Instância global do serviço de decorações
export const diagnosticDecorationService = new DiagnosticDecorationService();
