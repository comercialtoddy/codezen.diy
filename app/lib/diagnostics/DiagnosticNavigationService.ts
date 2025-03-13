import { diagnosticsStore } from '~/lib/stores/diagnostics';
import { type DiagnosticItem } from '~/components/workbench/diagnostics/DiagnosticsPanel';
import { DiagnosticSeverity, fromSeverityEnum } from './types';
import { createScopedLogger } from '~/utils/logger';

const _logger = createScopedLogger('DiagnosticNavigationService');

/**
 * Coordenada para navegação de diagnósticos
 */
export interface DiagnosticPosition {
  filePath: string;
  line: number;
  column: number;
}

/**
 * Classe que gerencia navegação entre diagnósticos
 */
export class DiagnosticNavigationService {
  /**
   * Encontra o próximo diagnóstico a partir de uma posição
   */
  findNextDiagnostic(
    position: DiagnosticPosition,
    severityFilter?: DiagnosticSeverity | ('error' | 'warning' | 'info' | 'hint'),
  ): DiagnosticItem | null {
    const allDiagnostics = this._getSortedDiagnostics(severityFilter);

    if (allDiagnostics.length === 0) {
      return null;
    }

    // Encontrar o diagnóstico atual ou próximo na lista ordenada
    const currentIndex = allDiagnostics.findIndex(
      (d) => this._isAfterPosition(d, position) && !this._isSamePosition(d, position),
    );

    if (currentIndex !== -1) {
      return allDiagnostics[currentIndex];
    }

    // Se não encontrou nenhum à frente, voltar para o primeiro (circular)
    return allDiagnostics[0];
  }

  /**
   * Encontra o diagnóstico anterior a partir de uma posição
   */
  findPreviousDiagnostic(
    position: DiagnosticPosition,
    severityFilter?: DiagnosticSeverity | ('error' | 'warning' | 'info' | 'hint'),
  ): DiagnosticItem | null {
    const allDiagnostics = this._getSortedDiagnostics(severityFilter);

    if (allDiagnostics.length === 0) {
      return null;
    }

    // Encontrar o diagnóstico anterior na lista ordenada
    const currentIndex = allDiagnostics.findIndex(
      (d) => this._isAfterPosition(d, position) || this._isSamePosition(d, position),
    );

    if (currentIndex > 0) {
      return allDiagnostics[currentIndex - 1];
    } else if (currentIndex === 0) {
      // Se for o primeiro, ir para o último (circular)
      return allDiagnostics[allDiagnostics.length - 1];
    } else {
      // Se não encontrou nenhum, retornar o último
      return allDiagnostics[allDiagnostics.length - 1];
    }
  }

  /**
   * Encontra diagnósticos na posição atual
   */
  findDiagnosticsAtPosition(position: DiagnosticPosition): DiagnosticItem[] {
    const fileDiagnostics = diagnosticsStore.getDiagnostics(position.filePath);

    return fileDiagnostics.filter(
      (d) =>
        d.line === position.line &&
        d.column <= position.column &&
        d.column + (d.message.length > 30 ? 30 : d.message.length) >= position.column,
    );
  }

  /**
   * Obtém a distribuição de diagnósticos por arquivo
   */
  getDiagnosticDistribution(): { filePath: string; count: number; errors: number }[] {
    const files = diagnosticsStore.getFilesWithDiagnostics();

    return files
      .map((filePath) => {
        const diagnostics = diagnosticsStore.getDiagnostics(filePath);
        const errors = diagnostics.filter((d) => d.severity === 'error').length;

        return {
          filePath,
          count: diagnostics.length,
          errors,
        };
      })
      .sort((a, b) => b.errors - a.errors || b.count - a.count);
  }

  /**
   * Obtém estatísticas dos diagnósticos por severidade
   */
  getDiagnosticStats(): { errors: number; warnings: number; infos: number; hints: number; total: number } {
    const allDiagnostics = diagnosticsStore.getDiagnostics();

    return {
      errors: allDiagnostics.filter((d) => d.severity === 'error').length,
      warnings: allDiagnostics.filter((d) => d.severity === 'warning').length,
      infos: allDiagnostics.filter((d) => d.severity === 'info').length,
      hints: allDiagnostics.filter((d) => d.severity === 'hint').length,
      total: allDiagnostics.length,
    };
  }

  /**
   * Obtém lista ordenada de diagnósticos
   */
  private _getSortedDiagnostics(
    severityFilter?: DiagnosticSeverity | ('error' | 'warning' | 'info' | 'hint'),
  ): DiagnosticItem[] {
    let diagnostics = diagnosticsStore.getDiagnostics();

    // Filtrar por severidade se especificado
    if (severityFilter !== undefined) {
      const stringSeverity = typeof severityFilter === 'string' ? severityFilter : fromSeverityEnum(severityFilter);

      diagnostics = diagnostics.filter((d) => d.severity === stringSeverity);
    }

    // Ordenar por arquivo, linha, coluna
    return diagnostics.sort((a, b) => {
      if (a.filePath !== b.filePath) {
        return a.filePath.localeCompare(b.filePath);
      }

      if (a.line !== b.line) {
        return a.line - b.line;
      }

      return a.column - b.column;
    });
  }

  /**
   * Verifica se diagnóstico está na mesma posição
   */
  private _isSamePosition(diagnostic: DiagnosticItem, position: DiagnosticPosition): boolean {
    return (
      diagnostic.filePath === position.filePath &&
      diagnostic.line === position.line &&
      diagnostic.column === position.column
    );
  }

  /**
   * Verifica se diagnóstico está após a posição atual
   */
  private _isAfterPosition(diagnostic: DiagnosticItem, position: DiagnosticPosition): boolean {
    if (diagnostic.filePath !== position.filePath) {
      return diagnostic.filePath > position.filePath;
    }

    if (diagnostic.line !== position.line) {
      return diagnostic.line > position.line;
    }

    return diagnostic.column > position.column;
  }
}

// Instância global do serviço de navegação
export const diagnosticNavigationService = new DiagnosticNavigationService();
