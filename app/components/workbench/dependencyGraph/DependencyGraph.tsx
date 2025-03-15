import { useEffect, useState, useRef } from 'react';
import { type WorkspaceGraph, type FileNode, workspaceIndexService } from '~/lib/services/WorkspaceIndexService';
import { workspaceIndexStore } from '~/lib/stores/workspaceIndex';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { workbenchStore } from '~/lib/stores/workbench';

interface DependencyGraphProps {
  filePath?: string;
  onFileSelect?: (filePath: string) => void;
  className?: string;
}

interface NodeVisual {
  id: string;
  label: string;
  type: 'file' | 'external';
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

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export function DependencyGraph({ filePath, onFileSelect, className }: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Estados do grafo
  const [nodes, setNodes] = useState<NodeVisual[]>([]);
  const [edges, setEdges] = useState<EdgeVisual[]>([]);
  const [_selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [packageDeps, setPackageDeps] = useState<Record<string, string[]>>({});
  const [filteredNodes, setFilteredNodes] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [indexedFilesCount, setIndexedFilesCount] = useState(0);
  const [_packageDependenciesCount, setPackageDependenciesCount] = useState(0);

  // Novo estado para controlar o zoom
  const [zoomLevel, setZoomLevel] = useState(1);

  // Dados da store
  const isIndexing = useStore(workspaceIndexStore.isIndexing);
  const indexProgress = useStore(workspaceIndexStore.progress);
  const stats = useStore(workspaceIndexStore.stats);
  const lastGraphUpdate = useStore(workspaceIndexStore.lastGraphUpdate);

  // Obter número total de arquivos (incluindo pastas)
  const totalFiles = workbenchStore.filesCount;

  // Atualizar a contagem de arquivos indexados
  useEffect(() => {
    const graph = workspaceIndexService.getGraph();
    setIndexedFilesCount(Object.keys(graph.files).length);

    // Atualizar contagem de dependências de pacotes
    const totalPackageDeps = Object.keys(packageDeps).reduce((total, pkg) => {
      const deps = packageDeps[pkg] || [];

      // Verificar se não são duplicadas
      const uniqueDeps = new Set(deps);

      return total + uniqueDeps.size;
    }, 0);

    setPackageDependenciesCount(totalPackageDeps);
  }, [lastGraphUpdate, isIndexing, packageDeps]);

  const fetchPackageJson = async () => {
    try {
      const graph = workspaceIndexService.getGraph();
      const files = Object.values(graph.files);

      // Encontrar todos os package.json no workspace
      const packageJsonFiles = files.filter((file) => file.path.endsWith('package.json'));

      const newPackageDeps: Record<string, string[]> = {};

      for (const pkgFile of packageJsonFiles) {
        const fileContent = await fetchFileContent(pkgFile.path);

        if (fileContent) {
          try {
            // Verificar se o conteúdo é um JSON válido e tem estrutura de package.json
            const pkg = JSON.parse(fileContent) as PackageJson;

            // Verificar se possui alguma seção de dependências
            if (!pkg.dependencies && !pkg.devDependencies && !pkg.peerDependencies) {
              console.log(`Package.json em ${pkgFile.path} não possui dependências`);
              newPackageDeps[pkgFile.path] = [];
              continue;
            }

            // Agrupar todas as dependências
            const allDeps = {
              ...pkg.dependencies,
              ...pkg.devDependencies,
              ...pkg.peerDependencies,
            };

            if (allDeps) {
              const depNames = Object.keys(allDeps);
              newPackageDeps[pkgFile.path] = depNames;

              // Log para depuração
              console.log(`Package.json em ${pkgFile.path} tem ${depNames.length} dependências`);
            } else {
              newPackageDeps[pkgFile.path] = [];
            }
          } catch (e) {
            console.error(`Erro ao analisar package.json em ${pkgFile.path}:`, e);

            // Arquivo com formato inválido - registrar como vazio
            newPackageDeps[pkgFile.path] = [];
          }
        } else {
          // Arquivo não encontrado ou binário
          newPackageDeps[pkgFile.path] = [];
        }
      }

      setPackageDeps(newPackageDeps);
    } catch (error) {
      console.error('Erro ao carregar dependências do package.json:', error);
      setPackageDeps({});
    }
  };

  const fetchFileContent = async (filePath: string): Promise<string | null> => {
    const files = workspaceIndexService.getAllWorkspaceFiles();

    if (files[filePath] && !files[filePath].isBinary) {
      return files[filePath].content;
    }

    return null;
  };

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
    fetchPackageJson();
  }, [filePath, lastGraphUpdate, isIndexing, stats.files]);

  // Efeito para filtrar nós baseado no termo de busca
  useEffect(() => {
    if (!searchTerm) {
      setFilteredNodes([]);
      return;
    }

    const lowerSearch = searchTerm.toLowerCase();
    const filtered = nodes.filter((node) => node.label.toLowerCase().includes(lowerSearch)).map((node) => node.id);

    setFilteredNodes(filtered);
  }, [searchTerm, nodes]);

  const processGraphForVisualization = (centralNode: FileNode) => {
    const nodes: NodeVisual[] = [];
    const links: EdgeVisual[] = [];
    const processedNodes = new Set<string>();
    const processedEdges = new Set<string>();
    const _graph = workspaceIndexService.getGraph();

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

    // Adicionar dependências externas de package.json
    if (
      centralNode.path.endsWith('.js') ||
      centralNode.path.endsWith('.jsx') ||
      centralNode.path.endsWith('.ts') ||
      centralNode.path.endsWith('.tsx')
    ) {
      // Encontrar o package.json mais próximo na hierarquia
      const packagePaths = Object.keys(packageDeps);
      let closestPackage = '';
      let shortestPath = Number.MAX_SAFE_INTEGER;

      for (const pkgPath of packagePaths) {
        const pkgDir = pkgPath.substring(0, pkgPath.lastIndexOf('/'));

        if (centralNode.path.startsWith(pkgDir) && pkgDir.length < shortestPath) {
          closestPackage = pkgPath;
          shortestPath = pkgDir.length;
        }
      }

      if (closestPackage && packageDeps[closestPackage]) {
        // Verificar quais pacotes externos este arquivo está importando
        const fileContent = centralNode.path;
        const deps = packageDeps[closestPackage];

        for (const dep of deps) {
          // Verificação simplificada de importação (em uma implementação real, seria mais robusta)
          if (
            fileContent.includes(`from '${dep}'`) ||
            fileContent.includes(`from "${dep}"`) ||
            fileContent.includes(`require('${dep}')`) ||
            fileContent.includes(`require("${dep}")`)
          ) {
            const nodeId = `external:${dep}`;

            if (!processedNodes.has(nodeId)) {
              nodes.push({
                id: nodeId,
                label: dep,
                type: 'external',
                color: '#ff9800', // Laranja para pacotes externos
                size: 8,
                x: Math.random() * 100 - 50,
                y: Math.random() * 100 - 50,
              });
              processedNodes.add(nodeId);
            }

            const edgeId = `${centralNode.id}->${nodeId}`;

            if (!processedEdges.has(edgeId)) {
              links.push({
                id: edgeId,
                source: centralNode.id,
                target: nodeId,
                color: '#ff9800',
                width: 1.5,
              });
              processedEdges.add(edgeId);
            }
          }
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
    const MAX_FILES = 75;
    const MAX_LINKS = 150;

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

  // Funções para controlar o zoom
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.2, 3)); // Limitar zoom máximo a 3x
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.2, 0.4)); // Limitar zoom mínimo a 0.4x
  };

  const handleResetZoom = () => {
    setZoomLevel(1); // Resetar para o zoom padrão
  };

  // Manipulador de evento para o zoom com a roda do mouse
  const handleMouseWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();

    // Determinar direção do scroll
    const delta = e.deltaY > 0 ? -0.1 : 0.1;

    // Ajustar o zoom com limites
    const newZoom = Math.max(0.4, Math.min(3, zoomLevel + delta));
    setZoomLevel(newZoom);
  };

  // Renderização de grafo (visualização em SVG)
  const renderGraph = () => {
    if (isLoading || isIndexing) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-4 border-accent-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-t-accent-500 animate-spin" />
          </div>
          <div className="mt-4 text-sm text-bolt-elements-textSecondary">
            {isIndexing ? `Indexando... ${indexProgress}%` : 'Carregando grafo...'}
          </div>
        </div>
      );
    }

    if (nodes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="w-16 h-16 mb-4 text-bolt-elements-textTertiary">
            <div className="i-ph:graph" />
          </div>
          <div className="text-sm text-bolt-elements-textSecondary mb-4">
            Nenhuma dependência encontrada para este arquivo
          </div>
          <button
            onClick={handleReindexWorkspace}
            className="px-4 py-2 rounded-lg bg-accent-500/20 text-accent-500 text-sm flex items-center space-x-2 transition-all duration-200 hover:bg-accent-500/30"
          >
            <div className="i-ph:arrows-clockwise text-lg" />
            <span>Reindexar Workspace</span>
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

    // Calcular o centro da visualização
    const centerX = width / 2;
    const centerY = height / 2;

    // Calcular o centro atual dos nós
    const nodesGraphCenterX = (minX + maxX) / 2;
    const nodesGraphCenterY = (minY + maxY) / 2;

    // Calcular o deslocamento necessário para centralizar
    const offsetX = centerX - nodesGraphCenterX;
    const offsetY = centerY - nodesGraphCenterY;

    // Cálculo de zoom para viewBox
    const zoomedWidth = width / zoomLevel;
    const zoomedHeight = height / zoomLevel;
    const viewBoxX = centerX - zoomedWidth / 2;
    const viewBoxY = centerY - zoomedHeight / 2;

    // Filtrar pelos nós pesquisados
    const visibleNodes = searchTerm ? nodes.filter((n) => filteredNodes.includes(n.id)) : nodes;
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = searchTerm
      ? edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
      : edges;

    return (
      <div className="relative h-full rounded-lg overflow-hidden bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`${viewBoxX} ${viewBoxY} ${zoomedWidth} ${zoomedHeight}`}
          className="transition-all duration-200"
          onWheel={handleMouseWheel}
        >
          {/* Grid de fundo */}
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path
                d="M 50 0 L 0 0 0 50"
                fill="none"
                stroke="currentColor"
                strokeWidth={0.5 / Math.sqrt(zoomLevel)}
                className="text-bolt-elements-borderColor/20"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Arestas */}
          {visibleEdges.map((edge) => {
            const sourceNode = nodes.find((n) => n.id === edge.source);
            const targetNode = nodes.find((n) => n.id === edge.target);

            if (!sourceNode || !targetNode) {
              return null;
            }

            // Garantir que x e y são números
            const sourceX: number = sourceNode.x;
            const sourceY: number = sourceNode.y;
            const targetX: number = targetNode.x;
            const targetY: number = targetNode.y;

            return (
              <line
                key={edge.id}
                x1={sourceX + offsetX}
                y1={sourceY + offsetY}
                x2={targetX + offsetX}
                y2={targetY + offsetY}
                stroke={edge.color}
                strokeWidth={edge.width / Math.sqrt(zoomLevel)}
                strokeOpacity={0.6}
                className="transition-all duration-200"
              />
            );
          })}

          {/* Nós */}
          {visibleNodes.map((node) => (
            <g
              key={node.id}
              transform={`translate(${node.x + offsetX},${node.y + offsetY})`}
              onClick={() => handleNodeClick(node)}
              className="cursor-pointer transition-opacity duration-200 hover:opacity-80"
            >
              {/* Círculo de fundo */}
              <circle
                r={node.size / Math.sqrt(zoomLevel)}
                fill={node.color}
                fillOpacity={0.2}
                className="transition-all duration-200"
              />
              {/* Círculo principal */}
              <circle
                r={(node.size * 0.6) / Math.sqrt(zoomLevel)}
                fill={node.color}
                className="transition-all duration-200"
              />
              {/* Texto do nó */}
              <text
                y={(node.size * 0.8) / Math.sqrt(zoomLevel)}
                textAnchor="middle"
                fill="currentColor"
                className="text-bolt-elements-textPrimary select-none transition-all duration-200"
                style={{ fontSize: `${(node.size * 0.8) / Math.sqrt(zoomLevel)}px` }}
              >
                {node.label}
              </text>
            </g>
          ))}
        </svg>

        {/* Controles de zoom adaptáveis */}
        <div className="absolute bottom-4 right-4 flex flex-col space-y-1 bg-bolt-elements-background-depth-1 rounded-lg p-1.5 shadow-lg border border-bolt-elements-borderColor backdrop-blur-sm">
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-md text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2 transition-all duration-200"
            title="Aumentar Zoom"
          >
            <div className="i-ph:plus-bold text-base" />
          </button>

          <div className="text-center text-xs font-medium py-1 border-y border-bolt-elements-borderColor text-bolt-elements-textSecondary">
            {Math.round(zoomLevel * 100)}%
          </div>

          <button
            onClick={handleResetZoom}
            className="p-1.5 rounded-md text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2 transition-all duration-200"
            title="Resetar Zoom"
          >
            <div className="i-ph:arrows-out-bold text-base" />
          </button>

          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-md text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2 transition-all duration-200"
            title="Diminuir Zoom"
          >
            <div className="i-ph:minus-bold text-base" />
          </button>
        </div>
      </div>
    );
  };

  // Renderização de lista (modo alternativo)
  const renderList = () => {
    if (isLoading || isIndexing) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent mb-4"></div>
          <div className="text-sm">{isIndexing ? `Indexando... ${indexProgress}%` : 'Carregando arquivos...'}</div>
        </div>
      );
    }

    const graph = workspaceIndexService.getGraph();
    const files = Object.values(graph.files);

    // Filtrar arquivos por termo de busca
    const filteredFiles = searchTerm
      ? files.filter((file) => file.path.toLowerCase().includes(searchTerm.toLowerCase()))
      : files;

    return (
      <div className="overflow-auto h-full">
        <div className="p-2">
          <div className="flex flex-col space-y-1 mb-2">
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Workspace</h4>
            <div className="flex space-x-3 text-xs text-bolt-elements-textSecondary">
              <div className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-bolt-elements-textSecondary mr-1.5"></span>
                <span>Total: {totalFiles} arquivos</span>
              </div>
              <div className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-bolt-elements-textSecondary mr-1.5"></span>
                <span>Indexados: {indexedFilesCount} arquivos</span>
              </div>
            </div>
          </div>
          <ul className="space-y-1">
            {filteredFiles.map((file) => (
              <li
                key={file.id}
                className={classNames(
                  'py-1 px-2 text-xs rounded cursor-pointer hover:bg-bolt-elements-item-backgroundActive',
                  filePath === file.path
                    ? 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                    : 'text-bolt-elements-textSecondary',
                )}
                onClick={() => onFileSelect?.(file.path)}
              >
                <div className="flex items-center">
                  <span className={getFileIcon(file.path)}></span>
                  <span className="ml-1 truncate">{file.path}</span>
                </div>
                {filePath === file.path && (
                  <div className="mt-1 ml-4 text-bolt-elements-textTertiary">{renderFileDependencies(file)}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  // Renderiza dependências de um arquivo específico
  const renderFileDependencies = (file: FileNode) => {
    const deps = workspaceIndexService.getFileDependencies(file.path);

    return (
      <div className="space-y-2">
        {deps.imports.length > 0 && (
          <div>
            <div className="flex items-center mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-[#4caf50] mr-1"></span>
              <span>Importa ({deps.imports.length}):</span>
            </div>
            <ul className="space-y-1 ml-3">
              {deps.imports.slice(0, 5).map((imp) => (
                <li
                  key={imp.id}
                  className="text-xs hover:text-bolt-elements-textPrimary cursor-pointer truncate"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileSelect?.(imp.path);
                  }}
                >
                  {imp.path.split('/').pop()}
                </li>
              ))}
              {deps.imports.length > 5 && (
                <li className="text-xs text-bolt-elements-textTertiary">...e mais {deps.imports.length - 5}</li>
              )}
            </ul>
          </div>
        )}

        {deps.importedBy.length > 0 && (
          <div>
            <div className="flex items-center mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-[#f44336] mr-1"></span>
              <span>Importado por ({deps.importedBy.length}):</span>
            </div>
            <ul className="space-y-1 ml-3">
              {deps.importedBy.slice(0, 5).map((imp) => (
                <li
                  key={imp.id}
                  className="text-xs hover:text-bolt-elements-textPrimary cursor-pointer truncate"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileSelect?.(imp.path);
                  }}
                >
                  {imp.path.split('/').pop()}
                </li>
              ))}
              {deps.importedBy.length > 5 && (
                <li className="text-xs text-bolt-elements-textTertiary">...e mais {deps.importedBy.length - 5}</li>
              )}
            </ul>
          </div>
        )}

        {/* Mostrar pacotes externos se for um arquivo JS/TS */}
        {(file.path.endsWith('.js') ||
          file.path.endsWith('.jsx') ||
          file.path.endsWith('.ts') ||
          file.path.endsWith('.tsx')) &&
          renderExternalDependencies(file)}
      </div>
    );
  };

  // Renderiza dependências externas de um arquivo
  const renderExternalDependencies = (file: FileNode) => {
    // Encontrar o package.json mais próximo na hierarquia
    const packagePaths = Object.keys(packageDeps);
    let closestPackage = '';
    let shortestPath = Number.MAX_SAFE_INTEGER;

    for (const pkgPath of packagePaths) {
      const pkgDir = pkgPath.substring(0, pkgPath.lastIndexOf('/'));

      if (file.path.startsWith(pkgDir) && pkgDir.length < shortestPath) {
        closestPackage = pkgPath;
        shortestPath = pkgDir.length;
      }
    }

    if (!closestPackage || !packageDeps[closestPackage]) {
      return null;
    }

    // Verificar quais pacotes externos este arquivo está importando
    const externalDeps: string[] = [];
    const fileContent = file.path;
    const deps = packageDeps[closestPackage];

    for (const dep of deps) {
      if (
        fileContent.includes(`from '${dep}'`) ||
        fileContent.includes(`from "${dep}"`) ||
        fileContent.includes(`require('${dep}')`) ||
        fileContent.includes(`require("${dep}")`)
      ) {
        externalDeps.push(dep);
      }
    }

    if (externalDeps.length === 0) {
      return null;
    }

    return (
      <div>
        <div className="flex items-center mb-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[#ff9800] mr-1"></span>
          <span>Pacotes ({externalDeps.length}):</span>
        </div>
        <ul className="space-y-1 ml-3">
          {externalDeps.slice(0, 5).map((dep) => (
            <li key={dep} className="text-xs text-bolt-elements-textPrimary truncate">
              {dep}
            </li>
          ))}
          {externalDeps.length > 5 && (
            <li className="text-xs text-bolt-elements-textTertiary">...e mais {externalDeps.length - 5}</li>
          )}
        </ul>
      </div>
    );
  };

  // Retorna o ícone apropriado com base na extensão do arquivo
  const getFileIcon = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase();

    if (!ext) {
      return 'i-ph:file-duotone';
    }

    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'i-ph:file-ts-duotone';
      case 'js':
      case 'jsx':
        return 'i-ph:file-js-duotone';
      case 'json':
        return 'i-ph:brackets-curly-duotone';
      case 'html':
        return 'i-ph:file-html-duotone';
      case 'css':
        return 'i-ph:file-css-duotone';
      case 'scss':
      case 'sass':
        return 'i-ph:file-css-duotone';
      case 'md':
        return 'i-ph:file-text-duotone';
      case 'svg':
        return 'i-ph:image-duotone';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return 'i-ph:image-duotone';
      default:
        return 'i-ph:file-duotone';
    }
  };

  return (
    <div className={classNames('flex flex-col h-full bg-bolt-elements-background-depth-1', className)}>
      {/* Header com título e controles - Reduzido em 60% */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Grafo de Dependências</h3>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setView('graph')}
                className={classNames(
                  'px-2 py-0.5 rounded-full text-xs transition-all duration-200 ease-in-out',
                  view === 'graph'
                    ? 'bg-accent-500/20 text-accent-500 shadow-sm'
                    : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
                )}
              >
                <div className="flex items-center space-x-1">
                  <div className="i-ph:graph-duotone text-sm" />
                  <span>Grafo</span>
                </div>
              </button>
              <button
                onClick={() => setView('list')}
                className={classNames(
                  'px-2 py-0.5 rounded-full text-xs transition-all duration-200 ease-in-out',
                  view === 'list'
                    ? 'bg-accent-500/20 text-accent-500 shadow-sm'
                    : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
                )}
              >
                <div className="flex items-center space-x-1">
                  <div className="i-ph:list-duotone text-sm" />
                  <span>Lista</span>
                </div>
              </button>
            </div>
          </div>

          {/* Barra de pesquisa integrada ao header */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute left-2 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary">
              <div className="i-ph:magnifying-glass text-sm" />
            </div>
            <input
              type="text"
              placeholder="Buscar arquivos ou dependências..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary border border-bolt-elements-borderColor rounded-md pl-7 pr-2 py-0.5 text-xs placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-1 focus:ring-accent-500/50 transition-all duration-200"
            />
            {searchTerm && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-colors"
                onClick={() => setSearchTerm('')}
              >
                <div className="i-ph:x text-sm" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2 px-2 py-0.5 rounded-full bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor">
            <div className="flex -space-x-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#61dafb] ring-1 ring-bolt-elements-background-depth-2" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#4caf50] ring-1 ring-bolt-elements-background-depth-2" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#f44336] ring-1 ring-bolt-elements-background-depth-2" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#ff9800] ring-1 ring-bolt-elements-background-depth-2" />
            </div>
            <span className="text-xs text-bolt-elements-textSecondary font-medium">{indexedFilesCount} arquivos</span>
          </div>
          <button
            onClick={handleReindexWorkspace}
            disabled={isIndexing}
            className={classNames(
              'p-1 rounded-full transition-all duration-200 ease-in-out',
              isIndexing
                ? 'bg-accent-500/20 text-accent-500'
                : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
            )}
          >
            <div className={classNames('i-ph:arrows-clockwise text-sm', { 'animate-spin': isIndexing })} />
          </button>
        </div>
      </div>

      {/* Área principal do grafo/lista */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden p-2">
        {view === 'graph' ? renderGraph() : renderList()}
      </div>

      {/* Legenda - Reduzida em 60% */}
      <div className="p-2 bg-bolt-elements-background-depth-2 border-t border-bolt-elements-borderColor">
        <div className="flex items-center justify-center space-x-4">
          <div className="flex items-center space-x-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#61dafb] ring-1 ring-[#61dafb]/30" />
            <span className="text-xs text-bolt-elements-textSecondary">Arquivo atual</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#4caf50] ring-1 ring-[#4caf50]/30" />
            <span className="text-xs text-bolt-elements-textSecondary">Importado</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#f44336] ring-1 ring-[#f44336]/30" />
            <span className="text-xs text-bolt-elements-textSecondary">Importa</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ff9800] ring-1 ring-[#ff9800]/30" />
            <span className="text-xs text-bolt-elements-textSecondary">Pacote externo</span>
          </div>
        </div>
      </div>
    </div>
  );
}
