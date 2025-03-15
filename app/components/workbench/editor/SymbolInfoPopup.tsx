import React from 'react';
import { type SymbolNode } from '~/lib/services/WorkspaceIndexService';
import { classNames } from '~/utils/classNames';
import { workspaceIndexStore } from '~/lib/stores/workspaceIndex';

interface SymbolInfoPopupProps {
  symbol: SymbolNode;
  onClose: () => void;
  onViewReferences: () => void;
  onGoToDefinition: () => void;
  className?: string;
}

export function SymbolInfoPopup({
  symbol,
  onClose,
  onViewReferences,
  onGoToDefinition,
  className,
}: SymbolInfoPopupProps) {
  const references = workspaceIndexStore.findAllReferences(symbol.name, symbol.filePath);

  return (
    <div
      className={classNames(
        'absolute z-50 bg-bolt-elements-background-depth-2 rounded shadow-lg border border-bolt-elements-borderColor',
        'p-4 w-80 max-h-96 overflow-auto',
        className,
      )}
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-medium text-bolt-elements-textPrimary">
          <span
            className="inline-block w-2 h-2 rounded-full mr-2"
            style={{ backgroundColor: getSymbolTypeColor(symbol.kind) }}
          ></span>
          {symbol.name}
        </h3>
        <button className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary" onClick={onClose}>
          <div className="i-ph:x text-lg" />
        </button>
      </div>

      <div className="mb-3">
        <div className="text-xs text-bolt-elements-textSecondary mb-1">
          Tipo: <span className="text-bolt-elements-textPrimary">{formatSymbolKind(symbol.kind)}</span>
        </div>
        <div className="text-xs text-bolt-elements-textSecondary mb-1">
          Arquivo: <span className="text-bolt-elements-textPrimary">{symbol.filePath.split('/').pop()}</span>
        </div>
        <div className="text-xs text-bolt-elements-textSecondary mb-1">
          Exportado:{' '}
          <span className="text-bolt-elements-textPrimary">{symbol.exportStatus === 'exported' ? 'Sim' : 'Não'}</span>
        </div>
        <div className="text-xs text-bolt-elements-textSecondary mb-1">
          Referências: <span className="text-bolt-elements-textPrimary">{references.length}</span>
        </div>
      </div>

      <div className="flex space-x-2 mb-3">
        <button
          className="flex-1 bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary rounded px-3 py-1 text-xs"
          onClick={onGoToDefinition}
        >
          Ir para definição
        </button>
        <button
          className="flex-1 bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary rounded px-3 py-1 text-xs"
          onClick={onViewReferences}
        >
          Ver referências
        </button>
      </div>

      {references.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-bolt-elements-textPrimary mb-2">Referências</h4>
          <div className="max-h-36 overflow-y-auto">
            <ul className="text-xs divide-y divide-bolt-elements-borderColor">
              {references.map((ref) => (
                <li key={ref.id} className="py-1.5">
                  <div className="text-bolt-elements-textPrimary">{ref.filePath.split('/').pop()}</div>
                  <div className="text-bolt-elements-textSecondary">
                    Linha {ref.range.startLine}, Coluna {ref.range.startColumn}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function getSymbolTypeColor(kind: SymbolNode['kind']): string {
  switch (kind) {
    case 'class':
      return '#4caf50'; // Verde
    case 'interface':
      return '#2196f3'; // Azul
    case 'function':
      return '#ff9800'; // Laranja
    case 'variable':
      return '#9c27b0'; // Roxo
    case 'type':
      return '#00bcd4'; // Ciano
    case 'enum':
      return '#cddc39'; // Lima
    default:
      return '#607d8b'; // Cinza azulado
  }
}

function formatSymbolKind(kind: SymbolNode['kind']): string {
  switch (kind) {
    case 'class':
      return 'Classe';
    case 'interface':
      return 'Interface';
    case 'function':
      return 'Função';
    case 'variable':
      return 'Variável';
    case 'type':
      return 'Tipo';
    case 'enum':
      return 'Enumeração';
    case 'namespace':
      return 'Namespace';
    case 'module':
      return 'Módulo';
    default:
      return kind;
  }
}
