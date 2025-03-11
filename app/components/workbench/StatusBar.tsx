import React from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { workspaceIndexStore } from '~/lib/stores/workspaceIndex';

interface StatusBarProps {
  className?: string;
  onShowGraph?: () => void;
}

export function StatusBar({ className, onShowGraph }: StatusBarProps) {
  const stats = useStore(workspaceIndexStore.stats);
  const isIndexing = useStore(workspaceIndexStore.isIndexing);
  const progress = useStore(workspaceIndexStore.progress);
  const lastUpdate = useStore(workspaceIndexStore.lastGraphUpdate);

  // Formatar o tempo desde a última atualização
  const getTimeAgo = () => {
    const now = Date.now();
    const seconds = Math.floor((now - lastUpdate) / 1000);

    if (seconds < 60) {
      return `${seconds}s atrás`;
    }

    if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m atrás`;
    }

    return `${Math.floor(seconds / 3600)}h atrás`;
  };

  return (
    <div
      className={classNames(
        'flex items-center bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary px-3 py-1 text-xs border-t border-bolt-elements-borderColor',
        className,
      )}
    >
      {/* Status de indexação */}
      <div className="flex items-center mr-4">
        <div
          className={classNames(
            'w-2 h-2 rounded-full mr-1',
            isIndexing ? 'bg-amber-500 animate-pulse-gentle' : 'bg-green-500',
          )}
        />
        <span>{isIndexing ? `Indexando workspace... ${progress}%` : `Workspace indexado`}</span>
      </div>

      {/* Estatísticas */}
      <div className="flex space-x-3">
        <div className="flex items-center">
          <div className="i-ph:code-duotone mr-1" />
          <span>{stats.files} arquivos</span>
        </div>
        <div className="flex items-center">
          <div className="i-ph:function-duotone mr-1" />
          <span>{stats.symbols} símbolos</span>
        </div>
        <div className="flex items-center">
          <div className="i-ph:graph-duotone mr-1" />
          <span>{stats.dependencies} dependências</span>
        </div>
      </div>

      {/* Última atualização */}
      <div className="ml-auto flex items-center">
        <div className="text-bolt-elements-textTertiary mr-3">Atualizado {getTimeAgo()}</div>

        {/* Botão para reindexar */}
        <button
          className="flex items-center p-1 rounded hover:bg-bolt-elements-item-backgroundActive mr-2"
          onClick={() => workspaceIndexStore.reindexWorkspace()}
          title="Reindexar workspace"
        >
          <div className="i-ph:arrows-clockwise" />
        </button>

        {/* Botão para mostrar grafo */}
        <button
          className="flex items-center p-1 rounded hover:bg-bolt-elements-item-backgroundActive"
          onClick={onShowGraph}
          title="Visualizar grafo de dependências"
        >
          <div className="i-ph:graph" />
        </button>
      </div>
    </div>
  );
}
