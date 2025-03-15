import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { workspaceIndexStore } from '~/lib/stores/workspaceIndex';
import { getWorkspaceIndexService } from '~/lib/services/WorkspaceIndexService';
import { workbenchStore } from '~/lib/stores/workbench';
import { workspaceIndexService } from '~/lib/services/WorkspaceIndexService';
import type { File } from '~/lib/stores/files';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface StatusBarProps {
  className?: string;
  onShowGraph?: () => void;
}

export function StatusBar({ className, onShowGraph }: StatusBarProps) {
  const _stats = useStore(workspaceIndexStore.stats);
  const isIndexing = useStore(workspaceIndexStore.isIndexing);
  const progress = useStore(workspaceIndexStore.progress);
  const lastUpdate = useStore(workspaceIndexStore.lastGraphUpdate);
  const [indexedFilesCount, setIndexedFilesCount] = useState(0);
  const [packageCount, setPackageCount] = useState(0);
  const [packageDependencies, setPackageDependencies] = useState(0);

  // Obter número total de arquivos (incluindo pastas) do workbenchStore
  const totalFiles = workbenchStore.filesCount;

  // Atualizar contagem de arquivos indexados e package.json
  useEffect(() => {
    const graph = workspaceIndexService.getGraph();
    setIndexedFilesCount(Object.keys(graph.files).length);

    // Contar arquivos package.json e suas dependências
    const packageJsonFiles = Object.values(graph.files).filter((file) => file.path.endsWith('package.json'));
    setPackageCount(packageJsonFiles.length);

    // Processar os package.json para contar dependências reais
    const fetchDependencies = async () => {
      let totalDeps = 0;

      for (const pkgFile of packageJsonFiles) {
        try {
          // Obter conteúdo do arquivo
          const filesStore = workbenchStore.files;
          const fileEntry = filesStore.get()[pkgFile.path];

          // Verificar se é um arquivo e possui conteúdo
          if (fileEntry && fileEntry.type === 'file') {
            const fileContent = (fileEntry as File).content;

            if (fileContent) {
              try {
                const pkg = JSON.parse(fileContent) as PackageJson;

                // Contar todas as dependências
                const deps = Object.keys(pkg.dependencies || {}).length;
                const devDeps = Object.keys(pkg.devDependencies || {}).length;
                const peerDeps = Object.keys(pkg.peerDependencies || {}).length;

                totalDeps += deps + devDeps + peerDeps;
              } catch (parseError) {
                console.error('Erro ao analisar JSON do package.json:', parseError);

                // Arquivo inválido - não somar dependências
              }
            }
          }
        } catch (error) {
          console.error('Erro ao processar package.json:', error);
        }
      }

      // Apenas atualizar o estado local, sem modificar o workspaceIndexStore
      setPackageDependencies(totalDeps);

      /*
       * CORRIGIDO: Não modificamos mais o workspaceIndexStore.stats aqui,
       * evitando o loop de feedback com as reindexações
       */
    };

    fetchDependencies();
  }, [lastUpdate, isIndexing]);

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
          <span>{totalFiles} arquivos</span>
        </div>
        <div className="flex items-center">
          <div className="i-ph:file-js-duotone mr-1" />
          <span>{indexedFilesCount} indexados</span>
        </div>
        <div className="flex items-center">
          <div className="i-ph:graph-duotone mr-1" />
          <span>{packageDependencies} dependências</span>
        </div>
        {packageCount > 0 && (
          <div className="flex items-center">
            <div className="i-ph:package-duotone mr-1" />
            <span>{packageCount} package.json</span>
          </div>
        )}
      </div>

      {/* Última atualização */}
      <div className="ml-auto flex items-center">
        <div className="text-bolt-elements-textTertiary mr-3">Atualizado {getTimeAgo()}</div>

        {/* Botão para diagnósticos contextuais avançados */}
        <button
          className="flex items-center p-1 rounded hover:bg-bolt-elements-item-backgroundActive mr-2 text-bolt-elements-textSecondary relative group"
          onClick={() => {
            // Usar serviço do workspace para indexação contextual
            try {
              getWorkspaceIndexService().indexWithContextualDiagnostics();

              // Visual feedback
              const button = document.activeElement as HTMLButtonElement;

              if (button) {
                button.blur();
              } // Remove focus
            } catch (error) {
              console.error('Erro na indexação contextual:', error);
            }
          }}
          title="Análise contextual avançada"
        >
          <div className="i-ph:magnifying-glass-plus" />
          <span className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary text-xs rounded px-2 py-1 -top-8 left-50 transform -translate-x-1/2 pointer-events-none whitespace-nowrap">
            Análise contextual
          </span>
        </button>

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
