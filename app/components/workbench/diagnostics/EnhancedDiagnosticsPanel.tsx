import React, { memo, useState, useMemo } from 'react';
import { classNames } from '~/utils/classNames';
import { type DiagnosticItem } from './DiagnosticsPanel';
import { diagnosticsStore } from '~/lib/stores/diagnostics';
import { diagnosticService } from '~/lib/diagnostics/DiagnosticService';
import { QuickFixMenu } from './QuickFixMenu';
import { type CodeAction } from '~/lib/diagnostics/types';

interface FilterOptions {
  severity: ('error' | 'warning' | 'info' | 'hint')[];
  source: string[];
  onlyCurrentFile: boolean;
}

interface EnhancedDiagnosticsPanelProps {
  diagnostics: DiagnosticItem[];
  onDiagnosticSelect?: (diagnostic: DiagnosticItem) => void;
  currentFilePath?: string;
  className?: string;
}

export const EnhancedDiagnosticsPanel = memo(
  ({ diagnostics, onDiagnosticSelect, currentFilePath, className }: EnhancedDiagnosticsPanelProps) => {
    const [filter, setFilter] = useState<FilterOptions>({
      severity: ['error', 'warning', 'info', 'hint'],
      source: [],
      onlyCurrentFile: false,
    });

    const [groupBy, setGroupBy] = useState<'file' | 'severity' | 'source'>('file');
    const [sortBy, _setSortBy] = useState<'severity' | 'location'>('severity');
    const [searchTerm, setSearchTerm] = useState('');

    const [quickFixDiagnostic, setQuickFixDiagnostic] = useState<DiagnosticItem | null>(null);
    const [quickFixPosition, setQuickFixPosition] = useState({ x: 0, y: 0 });

    // Fontes disponíveis para filtro
    const _availableSources = useMemo(() => {
      const sources = new Set<string>();
      diagnostics.forEach((d) => {
        if (d.source) {
          sources.add(d.source);
        }
      });

      return Array.from(sources);
    }, [diagnostics]);

    // Aplicar filtros e agrupamentos
    const filteredDiagnostics = useMemo(() => {
      return diagnostics.filter((d) => {
        // Filtrar por severidade
        if (!filter.severity.includes(d.severity)) {
          return false;
        }

        // Filtrar por fonte
        if (filter.source.length > 0 && d.source && !filter.source.includes(d.source)) {
          return false;
        }

        // Filtrar por arquivo atual
        if (filter.onlyCurrentFile && currentFilePath && d.filePath !== currentFilePath) {
          return false;
        }

        // Filtrar por termo de busca
        if (
          searchTerm &&
          !d.message.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !d.filePath.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          return false;
        }

        return true;
      });
    }, [diagnostics, filter, searchTerm, currentFilePath]);

    // Agrupar diagnósticos
    const groupedDiagnostics = useMemo(() => {
      const groups: Record<string, DiagnosticItem[]> = {};

      if (groupBy === 'file') {
        filteredDiagnostics.forEach((d) => {
          const fileName = d.filePath.split('/').pop() || d.filePath;

          if (!groups[fileName]) {
            groups[fileName] = [];
          }

          groups[fileName].push(d);
        });
      } else if (groupBy === 'severity') {
        filteredDiagnostics.forEach((d) => {
          if (!groups[d.severity]) {
            groups[d.severity] = [];
          }

          groups[d.severity].push(d);
        });
      } else if (groupBy === 'source') {
        filteredDiagnostics.forEach((d) => {
          const source = d.source || 'unknown';

          if (!groups[source]) {
            groups[source] = [];
          }

          groups[source].push(d);
        });
      }

      // Ordenar grupos
      Object.keys(groups).forEach((key) => {
        groups[key].sort((a, b) => {
          if (sortBy === 'severity') {
            const severityOrder = { error: 0, warning: 1, info: 2, hint: 3 };
            return severityOrder[a.severity] - severityOrder[b.severity];
          } else {
            // Ordenar por localização (arquivo, linha, coluna)
            if (a.filePath !== b.filePath) {
              return a.filePath.localeCompare(b.filePath);
            }

            if (a.line !== b.line) {
              return a.line - b.line;
            }

            return a.column - b.column;
          }
        });
      });

      return groups;
    }, [filteredDiagnostics, groupBy, sortBy]);

    // Ordenar as chaves dos grupos
    const sortedGroupKeys = useMemo(() => {
      if (groupBy === 'severity') {
        // Ordem fixa para severidade
        const keys = Object.keys(groupedDiagnostics);
        const order = { error: 0, warning: 1, info: 2, hint: 3 };

        return keys.sort((a, b) => order[a as keyof typeof order] - order[b as keyof typeof order]);
      }

      return Object.keys(groupedDiagnostics).sort();
    }, [groupedDiagnostics, groupBy]);

    const handleDiagnosticClick = (diagnostic: DiagnosticItem) => {
      if (onDiagnosticSelect) {
        onDiagnosticSelect(diagnostic);
      }
    };

    const handleDiagnosticContextMenu = (e: React.MouseEvent, diagnostic: DiagnosticItem) => {
      e.preventDefault();
      setQuickFixDiagnostic(diagnostic);
      setQuickFixPosition({ x: e.clientX, y: e.clientY });
    };

    const handleQuickFixSelect = async (action: CodeAction) => {
      try {
        await diagnosticService.applyCodeAction(action);

        // Após aplicar a ação, poderia remover o diagnóstico corrigido
      } catch (error) {
        console.error('Erro ao aplicar ação:', error);
      }
    };

    const handleClearAllDiagnostics = () => {
      diagnosticsStore.clearDiagnostics();
    };

    const _handleToggleSeverityFilter = (severity: 'error' | 'warning' | 'info' | 'hint') => {
      setFilter((prev) => {
        if (prev.severity.includes(severity)) {
          return {
            ...prev,
            severity: prev.severity.filter((s) => s !== severity),
          };
        } else {
          return {
            ...prev,
            severity: [...prev.severity, severity],
          };
        }
      });
    };

    const _handleToggleSourceFilter = (source: string) => {
      setFilter((prev) => {
        if (prev.source.includes(source)) {
          return {
            ...prev,
            source: prev.source.filter((s) => s !== source),
          };
        } else {
          return {
            ...prev,
            source: [...prev.source, source],
          };
        }
      });
    };

    return (
      <div className={classNames('bg-bolt-elements-bg-depth-1 h-full flex flex-col', className)}>
        {/* Barra de ferramentas */}
        <div className="flex items-center p-2 border-b border-bolt-elements-borderColor">
          <input
            type="text"
            placeholder="Filtrar problemas..."
            className="text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded px-2 py-1 flex-1"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {/* Dropdown para filtros */}
          <div className="relative ml-2">
            <button
              className="flex items-center text-sm px-2 py-1 rounded hover:bg-bolt-elements-item-backgroundHover"
              title="Filtros"
            >
              <div className="i-ph:funnel-duotone" />
            </button>

            {/* Menu de filtros (simplificado nesta versão) */}
          </div>

          {/* Dropdown para agrupamento */}
          <div className="relative ml-2">
            <select
              className="text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded px-2 py-1"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'file' | 'severity' | 'source')}
            >
              <option value="file">Agrupar por arquivo</option>
              <option value="severity">Agrupar por severidade</option>
              <option value="source">Agrupar por fonte</option>
            </select>
          </div>

          {/* Botão para limpar tudo */}
          <button
            className="ml-2 text-sm px-2 py-1 rounded hover:bg-bolt-elements-item-backgroundHover"
            onClick={handleClearAllDiagnostics}
            title="Limpar todos os problemas"
          >
            <div className="i-ph:trash-duotone" />
          </button>
        </div>

        {/* Lista de problemas */}
        <div className="flex-1 overflow-auto">
          <div className="px-2 py-1">
            {filteredDiagnostics.length === 0 ? (
              <div className="text-bolt-elements-textSecondary text-sm p-2">Nenhum problema encontrado</div>
            ) : (
              <div className="space-y-3">
                {sortedGroupKeys.map((group) => (
                  <div key={group} className="bg-bolt-elements-background-depth-2 rounded-lg overflow-hidden">
                    <div className="bg-bolt-elements-background-depth-1 px-3 py-1.5 font-medium text-sm border-b border-bolt-elements-borderColor">
                      {groupBy === 'severity' ? (
                        <div className="flex items-center">
                          {group === 'error' && (
                            <div className="i-ph:x-circle-fill text-bolt-elements-icon-error mr-2" />
                          )}
                          {group === 'warning' && <div className="i-ph:warning-fill text-amber-500 mr-2" />}
                          {group === 'info' && (
                            <div className="i-ph:info-fill text-bolt-elements-icon-secondary mr-2" />
                          )}
                          {group === 'hint' && (
                            <div className="i-ph:lightbulb-fill text-bolt-elements-icon-tertiary mr-2" />
                          )}
                          {group === 'error' && 'Erros'}
                          {group === 'warning' && 'Avisos'}
                          {group === 'info' && 'Informações'}
                          {group === 'hint' && 'Dicas'}
                          {groupBy !== 'severity' && group}
                          <span className="ml-2 text-bolt-elements-textSecondary">
                            ({groupedDiagnostics[group].length})
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <span>{group}</span>
                          <span className="ml-2 text-bolt-elements-textSecondary">
                            ({groupedDiagnostics[group].length})
                          </span>
                        </div>
                      )}
                    </div>
                    <ul className="divide-y divide-bolt-elements-borderColor">
                      {groupedDiagnostics[group].map((diagnostic) => (
                        <li
                          key={diagnostic.id}
                          className="py-2 px-3 cursor-pointer hover:bg-bolt-elements-item-backgroundActive"
                          onClick={() => handleDiagnosticClick(diagnostic)}
                          onContextMenu={(e) => handleDiagnosticContextMenu(e, diagnostic)}
                        >
                          <div className="flex items-start">
                            <div className="mr-2 mt-0.5">
                              {diagnostic.severity === 'error' && (
                                <div className="i-ph:x-circle-fill text-bolt-elements-icon-error" />
                              )}
                              {diagnostic.severity === 'warning' && (
                                <div className="i-ph:warning-fill text-amber-500" />
                              )}
                              {diagnostic.severity === 'info' && (
                                <div className="i-ph:info-fill text-bolt-elements-icon-secondary" />
                              )}
                              {diagnostic.severity === 'hint' && (
                                <div className="i-ph:lightbulb-fill text-bolt-elements-icon-tertiary" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-bolt-elements-textPrimary break-all line-clamp-2">
                                {diagnostic.message}
                              </div>
                              <div className="flex items-center text-xs text-bolt-elements-textSecondary mt-1 flex-wrap gap-1">
                                {groupBy !== 'file' && (
                                  <span className="truncate max-w-[150px]">{diagnostic.filePath.split('/').pop()}</span>
                                )}
                                <span>
                                  ({diagnostic.line}:{diagnostic.column})
                                </span>
                                {diagnostic.code && (
                                  <span className="text-bolt-elements-textTertiary">[{diagnostic.code}]</span>
                                )}
                                {groupBy !== 'source' && diagnostic.source && (
                                  <span className="ml-auto bg-bolt-elements-background-depth-1 px-1.5 py-0.5 rounded text-xs">
                                    {diagnostic.source}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Menu de quick fix */}
        {quickFixDiagnostic && (
          <QuickFixMenu
            diagnostic={quickFixDiagnostic}
            position={quickFixPosition}
            onActionSelect={handleQuickFixSelect}
            onClose={() => setQuickFixDiagnostic(null)}
          />
        )}
      </div>
    );
  },
);

export default EnhancedDiagnosticsPanel;
