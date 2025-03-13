import { atom, map } from 'nanostores';
import { type DiagnosticItem } from '~/components/workbench/diagnostics/DiagnosticsPanel';
import { workspaceIndexService, type SymbolNode, type WorkspaceGraph } from '~/lib/services/WorkspaceIndexService';
import { workbenchStore } from './workbench';

/**
 * Store para gerenciar o estado de indexação do workspace e sua integração com a UI
 */
class WorkspaceIndexStore {
  // Estado de indexação
  isIndexing = atom<boolean>(false);
  progress = atom<number>(0);

  // Contadores de entidades indexadas
  stats = map({
    files: 0,
    symbols: 0,
    dependencies: 0,
  });

  // Seleção atual para visualização de dependências
  selectedSymbol = atom<SymbolNode | null>(null);
  showSymbolDetails = atom<boolean>(false);

  // Última atualização do grafo
  lastGraphUpdate = atom<number>(Date.now());

  constructor() {
    this._setupPeriodicUpdates();
    this._setupFileChangeMonitoring();

    // Atualização inicial
    const graph = workspaceIndexService.getGraph();
    this._updateGraphStats(graph);
  }

  /**
   * Força uma reindexação completa do workspace
   */
  forceReindex() {
    // Define o estado como indexando
    this.isIndexing.set(true);
    this.progress.set(0);

    // Limpa as estatísticas atuais
    this.stats.set({
      files: 0,
      symbols: 0,
      dependencies: 0,
    });

    // Chama o método de reindexação do serviço
    try {
      workspaceIndexService.reindexAll();
      console.log('[WorkspaceIndexStore] Reindexação iniciada');
    } catch (error) {
      console.error('[WorkspaceIndexStore] Erro ao iniciar reindexação:', error);
      this.isIndexing.set(false);
    }
  }

  /**
   * Configura as atualizações periódicas do grafo
   */
  private _setupPeriodicUpdates() {
    /*
     * CORRIGIDO: Aumento do intervalo de 2 segundos para 5 segundos
     * para reduzir a frequência de polling e reindexações desnecessárias
     */
    setInterval(() => {
      const graph = workspaceIndexService.getGraph();
      this._updateGraphStats(graph);
    }, 5000);
  }

  /**
   * Configura o monitoramento de mudanças nos arquivos
   */
  private _setupFileChangeMonitoring() {
    /*
     * As mudanças já são monitoradas pelo workspaceIndexService através do FilesStore
     * Aqui apenas atualizamos a UI em resposta a mudanças
     */

    // Monitorar estado de indexação
    const updateIndexingStatus = () => {
      const graph = workspaceIndexService.getGraph();
      const filesCount = Object.keys(graph.files).length;
      const symbolsCount = Object.keys(graph.symbols).length;

      if (this.isIndexing.get()) {
        // Se estava indexando e os contadores estabilizaram, consideramos concluído
        const currentStats = this.stats.get();

        if (currentStats.files === filesCount && currentStats.symbols === symbolsCount) {
          this.isIndexing.set(false);
          this.progress.set(100);
        } else {
          // Atualizar progresso
          this.progress.set(Math.min(99, this.progress.get() + 5));
        }
      }
    };

    // Verificar a cada 500ms
    setInterval(updateIndexingStatus, 500);
  }

  /**
   * Atualiza as estatísticas do grafo
   */
  private _updateGraphStats(graph: WorkspaceGraph) {
    const filesCount = Object.keys(graph.files).length;
    const symbolsCount = Object.keys(graph.symbols).length;
    const dependenciesCount = graph.dependencies.length;

    // Só atualiza se houver mudança
    const currentStats = this.stats.get();
    let _statsChanged = false;

    if (
      currentStats.files !== filesCount ||
      currentStats.symbols !== symbolsCount ||
      currentStats.dependencies !== dependenciesCount
    ) {
      _statsChanged = true;
      this.stats.set({
        files: filesCount,
        symbols: symbolsCount,
        dependencies: dependenciesCount,
      });
    }

    /*
     * CORRIGIDO: Apenas atualizamos lastGraphUpdate quando ocorre uma
     * mudança real no grafo (número de arquivos ou símbolos), e não
     * apenas quando as estatísticas mudam
     */
    const hasStructuralChanges = currentStats.files !== filesCount || currentStats.symbols !== symbolsCount;

    if (hasStructuralChanges) {
      this.lastGraphUpdate.set(Date.now());
    }
  }

  /**
   * Busca a definição de um símbolo no arquivo atual
   */
  findDefinition(symbolName: string) {
    const filePath = workbenchStore.selectedFile.get();

    if (!filePath) {
      return null;
    }

    const definition = workspaceIndexService.findDefinition(symbolName, filePath);

    if (definition) {
      this.selectedSymbol.set(definition);
      this.showSymbolDetails.set(true);

      return definition;
    }

    return null;
  }

  /**
   * Busca todas as referências de um símbolo
   */
  findAllReferences(symbolName: string, filePath?: string) {
    return workspaceIndexService.findAllReferences(symbolName, filePath);
  }

  /**
   * Seleciona um símbolo para mostrar detalhes
   */
  selectSymbol(symbol: SymbolNode) {
    this.selectedSymbol.set(symbol);
    this.showSymbolDetails.set(true);
  }

  /**
   * Fecha o painel de detalhes do símbolo
   */
  closeSymbolDetails() {
    this.showSymbolDetails.set(false);
  }

  /**
   * Obtém diagnósticos para um arquivo específico
   */
  getDiagnostics(_filePath: string): DiagnosticItem[] {
    /*
     * Implementação temporária, apenas retorna vazio
     * No futuro poderá ser implementado para obter diagnósticos específicos
     */
    return [];
  }

  /**
   * Inicia processo de reindexação do workspace
   */
  reindexWorkspace() {
    // Já implementado em forceReindex
    this.forceReindex();
  }

  /**
   * Visualiza dependências de um arquivo
   */
  viewFileDependencies(filePath: string) {
    try {
      const deps = workspaceIndexService.getFileDependencies(filePath);

      console.log(`Dependências para ${filePath}:`);
      console.log(`Importa (${deps.imports.length}):`);
      deps.imports.forEach((file) => console.log(`- ${file.path}`));

      console.log(`Importado por (${deps.importedBy.length}):`);
      deps.importedBy.forEach((file) => console.log(`- ${file.path}`));

      return deps;
    } catch (error) {
      console.error('Erro ao obter dependências:', error);
      return { imports: [], importedBy: [] };
    }
  }
}

export const workspaceIndexStore = new WorkspaceIndexStore();
