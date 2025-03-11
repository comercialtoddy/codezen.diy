import { useEffect, useState, useRef } from 'react';
import { type WorkspaceGraph, type FileNode, workspaceIndexService } from '~/lib/services/WorkspaceIndexService';
import { workspaceIndexStore } from '~/lib/stores/workspaceIndex';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';

interface DependencyGraphProps {
  filePath?: string;
  onFileSelect?: (filePath: string) => void;
  className?: string;
}

interface NodeVisual {
  id: string;
  label: string;
  type: 'file' | 'symbol';
  color: string;
  size: number;
  x: number;
  y: number;
}

interface EdgeVisual {
  id: string;
  source: string;
  target: string;
  color: string;
  width: number;
}

export function DependencyGraph({ filePath, onFileSelect, className }: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Estados do grafo
  const [nodes, setNodes] = useState<NodeVisual[]>([]);
  const [edges, setEdges] = useState<EdgeVisual[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Dados da store
  const isIndexing = useStore(workspaceIndexStore.isIndexing);
  const indexProgress = useStore(workspaceIndexStore.progress);
  const stats = useStore(workspaceIndexStore.stats);
  const lastGraphUpdate = useStore(workspaceIndexStore.lastGraphUpdate);

  const fetchGraph = () => {
    setIsLoading(true);

    try {
      const graph = workspaceIndexService.getGraph();

      if (filePath) {
        // Obter subgrafo focado no arquivo atual
        const fileNode = Object.values(graph.files).find((f) => f.path === filePath);

        if (fileNode) {
          const visualData = processGraphForVisualization(fileNode);
          setNodes(visualData.nodes);
          setEdges(visualData.links);
        } else {
          setNodes([]);
          setEdges([]);
        }
      } else {
        // Exibir grafo completo (limitado para desempenho)
        const fullGraph = convertFullGraphToVisual(graph);
        setNodes(fullGraph.nodes);
        setEdges(fullGraph.links);
      }
    } catch (error) {
      console.error('Erro ao carregar grafo de dependências:', error);
      setNodes([]);
      setEdges([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Efeito para atualizar o grafo quando a seleção de arquivo muda
  useEffect(() => {
    // Forçar reindexação na inicialização
    if (!isIndexing && stats.files === 0) {
      workspaceIndexStore.forceReindex();
    }

    fetchGraph();
  }, [filePath, lastGraphUpdate, isIndexing, stats.files]);

  const processGraphForVisualization = (centralNode: FileNode) => {
    const nodes: NodeVisual[] = [];
    const links: EdgeVisual[] = [];
    const processedNodes = new Set<string>();
    const processedEdges = new Set<string>();
    const graph = workspaceIndexService.getGraph();

    // Adicionar nó central (arquivo atual)
    const centralNodeVisual: NodeVisual = {
      id: centralNode.id,
      label: centralNode.path.split('/').pop() || '',
      type: 'file',
      color: '#61dafb', // Azul para o arquivo central
      size: 15,
      x: 0,
      y: 0,
    };

    nodes.push(centralNodeVisual);
    processedNodes.add(centralNode.id);

    // Adicionar arquivos importados
    const deps = workspaceIndexService.getFileDependencies(centralNode.path);

    // Arquivos importados pelo arquivo atual
    for (const importedFile of deps.imports) {
      if (!processedNodes.has(importedFile.id)) {
        const nodeVisual: NodeVisual = {
          id: importedFile.id,
          label: importedFile.path.split('/').pop() || '',
          type: 'file',
          color: '#4caf50', // Verde para arquivos importados
          size: 10,
          x: Math.random() * 100 - 50,
          y: Math.random() * 100 - 50,
        };

        nodes.push(nodeVisual);
        processedNodes.add(importedFile.id);
      }

      const edgeId = `${centralNode.id}->${importedFile.id}`;

      if (!processedEdges.has(edgeId)) {
        links.push({
          id: edgeId,
          source: centralNode.id,
          target: importedFile.id,
          color: '#4caf50',
          width: 2,
        });
        processedEdges.add(edgeId);
      }
    }

    // Arquivos que importam o arquivo atual
    for (const importingFile of deps.importedBy) {
      if (!processedNodes.has(importingFile.id)) {
        const nodeVisual: NodeVisual = {
          id: importingFile.id,
          label: importingFile.path.split('/').pop() || '',
          type: 'file',
          color: '#f44336', // Vermelho para arquivos que importam
          size: 10,
          x: Math.random() * 100 - 50,
          y: Math.random() * 100 - 50,
        };

        nodes.push(nodeVisual);
        processedNodes.add(importingFile.id);
      }

      const edgeId = `${importingFile.id}->${centralNode.id}`;

      if (!processedEdges.has(edgeId)) {
        links.push({
          id: edgeId,
          source: importingFile.id,
          target: centralNode.id,
          color: '#f44336',
          width: 2,
        });
        processedEdges.add(edgeId);
      }
    }

    // Adicionar símbolos do arquivo central
    for (const symbolId of centralNode.symbols) {
      const symbol = graph.symbols[symbolId];

      if (symbol && !processedNodes.has(symbolId)) {
        const nodeVisual: NodeVisual = {
          id: symbolId,
          label: symbol.name,
          type: 'symbol',
          color: '#9c27b0', // Roxo para símbolos
          size: 6,
          x: Math.random() * 30 - 15,
          y: Math.random() * 30 - 15,
        };

        nodes.push(nodeVisual);
        processedNodes.add(symbolId);

        // Conectar símbolo ao arquivo
        const edgeId = `${centralNode.id}->${symbolId}`;

        if (!processedEdges.has(edgeId)) {
          links.push({
            id: edgeId,
            source: centralNode.id,
            target: symbolId,
            color: '#9c27b0',
            width: 1,
          });
          processedEdges.add(edgeId);
        }
      }
    }

    return { nodes, links };
  };

  const convertFullGraphToVisual = (graph: WorkspaceGraph) => {
    const nodes: NodeVisual[] = [];
    const links: EdgeVisual[] = [];
    const processedNodes = new Set<string>();
    const processedEdges = new Set<string>();

    // Limitar a exibição para desempenho
    const MAX_FILES = 50;
    const MAX_LINKS = 100;

    // Adicionar nós de arquivo
    let fileCount = 0;

    for (const fileId in graph.files) {
      if (fileCount >= MAX_FILES) {
        break;
      }

      const file = graph.files[fileId];

      if (!processedNodes.has(fileId)) {
        nodes.push({
          id: fileId,
          label: file.path.split('/').pop() || '',
          type: 'file',
          color: '#61dafb',
          size: 10,
          x: Math.random() * 800 - 400,
          y: Math.random() * 800 - 400,
        });
        processedNodes.add(fileId);
        fileCount++;
      }
    }

    // Adicionar conexões de importação
    let linkCount = 0;

    for (const edge of graph.dependencies) {
      if (linkCount >= MAX_LINKS) {
        break;
      }

      if (edge.kind === 'import') {
        const sourceId = edge.source;
        const targetId = edge.target;

        if (processedNodes.has(sourceId) && processedNodes.has(targetId)) {
          const edgeId = `${sourceId}->${targetId}`;

          if (!processedEdges.has(edgeId)) {
            links.push({
              id: edgeId,
              source: sourceId,
              target: targetId,
              color: '#607d8b',
              width: Math.min(3, edge.weight),
            });
            processedEdges.add(edgeId);
            linkCount++;
          }
        }
      }
    }

    return { nodes, links };
  };

  const handleNodeClick = (node: NodeVisual) => {
    setSelectedNode(node.id);

    if (node.type === 'file' && onFileSelect) {
      const filePath = node.id.replace('file:', '');
      onFileSelect(filePath);
    }
  };

  const handleReindexWorkspace = () => {
    workspaceIndexStore.forceReindex();
  };

  // Renderização simplificada do grafo (SVG básico)
  const renderGraph = () => {
    if (isLoading || isIndexing) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent mb-4"></div>
          <div className="text-sm">{isIndexing ? `Indexando... ${indexProgress}%` : 'Carregando grafo...'}</div>
        </div>
      );
    }

    if (nodes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textSecondary">
          <div className="mb-4 text-3xl opacity-50">📦</div>
          <div className="text-sm mb-2">Nenhuma dependência encontrada para este arquivo</div>
          <button
            onClick={handleReindexWorkspace}
            className="mt-2 px-3 py-1 text-xs rounded bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary flex items-center"
          >
            <span className="mr-1">↻</span>
            Reindexar Workspace
          </button>
        </div>
      );
    }

    // Calcular limites do SVG
    const padding = 50;
    const minX = Math.min(...nodes.map((n) => n.x)) - padding;
    const maxX = Math.max(...nodes.map((n) => n.x)) + padding;
    const minY = Math.min(...nodes.map((n) => n.y)) - padding;
    const maxY = Math.max(...nodes.map((n) => n.y)) + padding;
    const width = Math.max(maxX - minX, 300);
    const height = Math.max(maxY - minY, 300);

    // Ajustar coordenadas para o centro do SVG
    const centerX = width / 2;
    const centerY = height / 2;

    return (
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        className="bg-bolt-elements-bg-depth-2 rounded"
      >
        {/* Arestas */}
        <g>
          {edges.map((edge) => {
            const source = nodes.find((n) => n.id === edge.source);
            const target = nodes.find((n) => n.id === edge.target);

            if (!source || !target) {
              return null;
            }

            return (
              <line
                key={edge.id}
                x1={source.x + centerX}
                y1={source.y + centerY}
                x2={target.x + centerX}
                y2={target.y + centerY}
                stroke={edge.color}
                strokeWidth={edge.width}
                opacity={0.6}
              />
            );
          })}
        </g>

        {/* Nós */}
        <g>
          {nodes.map((node) => (
            <g
              key={node.id}
              transform={`translate(${node.x + centerX}, ${node.y + centerY})`}
              onClick={() => handleNodeClick(node)}
              className="cursor-pointer"
            >
              <circle
                r={node.size}
                fill={node.color}
                opacity={selectedNode === node.id ? 1 : 0.8}
                stroke={selectedNode === node.id ? '#ffffff' : 'none'}
                strokeWidth={2}
              />
              <text textAnchor="middle" dy=".3em" fontSize={node.size * 0.8} fill="#ffffff">
                {node.type === 'symbol' ? '#' : ''}
                {node.label.substring(0, 1).toUpperCase()}
              </text>

              <text textAnchor="middle" y={node.size + 12} fontSize="10" fill="#e0e0e0" className="pointer-events-none">
                {node.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    );
  };

  return (
    <div className={classNames('flex flex-col h-full', className)}>
      <div className="flex items-center justify-between p-2 border-b border-bolt-elements-borderColor">
        <div className="flex items-center">
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Grafo de Dependências</h3>
          <div className="flex ml-2 space-x-2">
            <span className="px-2 py-0.5 text-xs rounded bg-bolt-elements-bg-depth-2 text-bolt-elements-textSecondary">
              {stats.files} arquivos
            </span>
            <span className="px-2 py-0.5 text-xs rounded bg-bolt-elements-bg-depth-2 text-bolt-elements-textSecondary">
              {stats.symbols} símbolos
            </span>
            <span className="px-2 py-0.5 text-xs rounded bg-bolt-elements-bg-depth-2 text-bolt-elements-textSecondary">
              {stats.dependencies} dependências
            </span>
          </div>
        </div>
        <div className="flex items-center">
          <button
            onClick={handleReindexWorkspace}
            disabled={isIndexing}
            className="p-1 rounded text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-bg-depth-2"
            title="Reindexar Workspace"
          >
            <span className={classNames('inline-block', { 'animate-spin': isIndexing })}>↻</span>
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {renderGraph()}
      </div>
      <div className="p-2 text-xs text-bolt-elements-textSecondary border-t border-bolt-elements-borderColor">
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <span className="inline-block w-3 h-3 rounded-full bg-[#61dafb] mr-1"></span>
            <span>Arquivo atual</span>
          </div>
          <div className="flex items-center">
            <span className="inline-block w-3 h-3 rounded-full bg-[#4caf50] mr-1"></span>
            <span>Importado</span>
          </div>
          <div className="flex items-center">
            <span className="inline-block w-3 h-3 rounded-full bg-[#f44336] mr-1"></span>
            <span>Importa</span>
          </div>
          <div className="flex items-center">
            <span className="inline-block w-3 h-3 rounded-full bg-[#9c27b0] mr-1"></span>
            <span>Símbolo</span>
          </div>
        </div>
      </div>
    </div>
  );
}
