import { diagnosticsStore } from '~/lib/stores/diagnostics';
import { FilesStore, type FileMap } from '~/lib/stores/files';
import { type MapStore } from 'nanostores';
import { workbenchStore } from '~/lib/stores/workbench';

// Logger simplificado para evitar dependências cíclicas
const logger = {
  info: console.info,
  debug: console.debug,
  error: console.error,
  warn: console.warn,
};

// Interfaces para o grafo de dependências
export interface SymbolNode {
  id: string;
  name: string;
  kind: 'class' | 'function' | 'variable' | 'interface' | 'type' | 'enum' | 'namespace' | 'module';
  filePath: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  exportStatus: 'exported' | 'default-exported' | 'private' | 'unknown';
}

export interface DependencyEdge {
  source: string; // ID do nó de origem
  target: string; // ID do nó de destino
  kind: 'import' | 'extends' | 'implements' | 'uses' | 'references';
  weight: number; // Peso baseado na frequência de uso
}

export interface FileNode {
  id: string;
  path: string;
  lastModified: number;
  symbols: string[]; // IDs dos símbolos contidos no arquivo
}

export interface WorkspaceGraph {
  files: Record<string, FileNode>;
  symbols: Record<string, SymbolNode>;
  dependencies: DependencyEdge[];
}

export class WorkspaceIndexService {
  private _graph: WorkspaceGraph = {
    files: {},
    symbols: {},
    dependencies: [],
  };

  private _fileWatchers: Map<string, () => void> = new Map();
  private _indexingQueue: string[] = [];
  private _isIndexing: boolean = false;
  private _indexVersion: number = 0;

  // Cache para evitar reanálise desnecessária
  private _fileHashes: Record<string, string> = {};

  // Referência ao FilesStore
  private _filesStore: FilesStore;
  private _filesMap: MapStore<FileMap>;
  private _unsubscribeFromFiles: () => void;

  // Estado de inicialização
  private _initialized: boolean = false;

  constructor(filesStore: FilesStore) {
    this._filesStore = filesStore;
    this._filesMap = filesStore.files;

    // Observar mudanças no mapa de arquivos
    this._unsubscribeFromFiles = this._filesMap.subscribe((files) => {
      this._handleFilesChanged(files);
    });

    // Inicialização adiada para garantir que tudo esteja pronto
    setTimeout(() => {
      this._initializeWorkspace();
    }, 500);

    logger.info('WorkspaceIndexService inicializado e integrado com FilesStore');
  }

  /**
   * Inicializa o workspace com os arquivos existentes
   */
  private async _initializeWorkspace() {
    try {
      const files = this._filesMap.get();
      logger.info(`Inicializando workspace com ${Object.keys(files).length} arquivos`);

      // Inicializar com os arquivos existentes
      for (const [filePath, dirent] of Object.entries(files)) {
        if (dirent?.type === 'file' && this._shouldIndexFile(filePath)) {
          // Não filtramos arquivos binários aqui para permitir indexação de todos os tipos
          this.queueFileForIndexing(filePath, dirent.content);
          logger.debug(`Arquivo enfileirado para indexação: ${filePath}`);
        }
      }

      this._initialized = true;
      logger.info('Workspace inicializado com arquivos existentes');
    } catch (error) {
      logger.error('Erro ao inicializar workspace', error);
    }
  }

  /**
   * Manipula mudanças no mapa de arquivos
   */
  private _handleFilesChanged(files: FileMap) {
    // Se ainda não inicializou completamente, não processamos mudanças individuais
    if (!this._initialized) {
      return;
    }

    // Verificar quais arquivos foram adicionados ou modificados
    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && this._shouldIndexFile(filePath)) {
        // Não filtramos arquivos binários aqui para permitir indexação de todos os tipos

        // Calcular hash do conteúdo
        const contentHash = this._simpleHash(dirent.content);

        // Verificar se o conteúdo mudou
        if (this._fileHashes[filePath] !== contentHash) {
          this._fileHashes[filePath] = contentHash;
          this.queueFileForIndexing(filePath, dirent.content);
          logger.debug(`Alteração detectada no arquivo: ${filePath}`);
        }
      }
    }

    // Verificar quais arquivos foram removidos
    for (const filePath of Object.keys(this._graph.files)) {
      if (!(filePath in files) || files[filePath]?.type !== 'file') {
        this._removeFileFromIndex(filePath);
        delete this._fileHashes[filePath];
        logger.debug(`Arquivo removido: ${filePath}`);
      }
    }
  }

  /**
   * Adiciona um arquivo à fila de indexação
   */
  queueFileForIndexing(filePath: string, content?: string) {
    if (!this._shouldIndexFile(filePath)) {
      logger.debug(`Arquivo ignorado para indexação (tipo não suportado): ${filePath}`);
      return;
    }

    if (content) {
      // Cálculo simplificado de hash para detectar mudanças
      const contentHash = this._simpleHash(content);

      if (this._fileHashes[filePath] === contentHash) {
        logger.debug(`Arquivo sem alterações, ignorando: ${filePath}`);
        return; // Arquivo não mudou, ignorar
      }

      this._fileHashes[filePath] = contentHash;
    }

    // Adiciona à fila se ainda não estiver presente
    if (!this._indexingQueue.includes(filePath)) {
      this._indexingQueue.push(filePath);
      logger.debug(`Arquivo adicionado à fila de indexação: ${filePath}`);
      this._processIndexQueue();
    }
  }

  /**
   * Processa a fila de indexação de forma assíncrona
   */
  private async _processIndexQueue() {
    if (this._isIndexing || this._indexingQueue.length === 0) {
      return;
    }

    this._isIndexing = true;
    this._indexVersion++;

    const currentVersion = this._indexVersion;

    logger.info(`Iniciando processamento da fila de indexação com ${this._indexingQueue.length} arquivos`);

    try {
      while (this._indexingQueue.length > 0 && currentVersion === this._indexVersion) {
        const filePath = this._indexingQueue.shift()!;
        await this._indexFile(filePath);
      }
    } catch (error) {
      logger.error('Erro ao processar fila de indexação', error);
    } finally {
      this._isIndexing = false;
      logger.info(
        `Processamento da fila de indexação concluído. Grafo atual: ${Object.keys(this._graph.files).length} arquivos, ${Object.keys(this._graph.symbols).length} símbolos, ${this._graph.dependencies.length} dependências`,
      );

      // Verificar se novos arquivos foram adicionados durante o processamento
      if (this._indexingQueue.length > 0) {
        this._processIndexQueue();
      }
    }
  }

  /**
   * Indexa um arquivo específico
   */
  private async _indexFile(filePath: string) {
    try {
      // Acessar diretamente o mapa de arquivos em vez de usar getFile
      const files = this._filesMap.get();
      const fileData = files[filePath];

      if (!fileData || fileData.type !== 'file') {
        logger.warn(`Arquivo não encontrado para indexação: ${filePath}`);
        return;
      }

      /*
       * No modo de compatibilidade, indexamos mesmo arquivos marcados como binários
       * Isso permite que JSX e outros tipos sejam analisados
       */

      // Limpar diagnósticos antigos para o arquivo
      diagnosticsStore.clearDiagnostics(filePath);

      // Garantir que temos um arquivo com conteúdo
      const fileContent = 'content' in fileData ? fileData.content : '';

      // Analisar o conteúdo do arquivo
      await this._analyzeFileContent(filePath, fileContent);

      logger.debug(`Arquivo indexado: ${filePath}`);
    } catch (error) {
      logger.error(`Erro ao indexar arquivo ${filePath}`, error);
    }
  }

  /**
   * Analisa o conteúdo do arquivo para extração de símbolos e diagnósticos
   */
  private async _analyzeFileContent(filePath: string, content: string) {
    // Criar ou atualizar nó do arquivo
    const fileId = `file:${filePath}`;
    this._graph.files[fileId] = {
      id: fileId,
      path: filePath,
      lastModified: Date.now(),
      symbols: [],
    };

    // Etapa 1: Detecção básica de símbolos usando regex (para simplificar)
    this._detectSymbols(filePath, content);

    // Etapa 2: Detecção de diagnósticos simples
    this._detectDiagnostics(filePath, content);

    // Etapa 3: Análise de importações e dependências
    this._analyzeImports(filePath, content);
  }

  /**
   * Detecta símbolos no arquivo usando expressões regulares
   * Nota: Uma implementação real usaria um parser AST completo
   */
  private _detectSymbols(filePath: string, content: string) {
    const fileId = `file:${filePath}`;
    const fileNode = this._graph.files[fileId];
    const detectedSymbols: string[] = [];

    // Para arquivos React, detectar componentes funcionais
    if (filePath.endsWith('.jsx') || filePath.endsWith('.tsx')) {
      // Detectar componentes funcionais
      const funcComponentRegex = /function\s+([A-Z]\w+)\s*\(/g;
      let match;

      while ((match = funcComponentRegex.exec(content)) !== null) {
        const [, componentName] = match;
        const symbolId = `symbol:${filePath}:${componentName}`;

        this._graph.symbols[symbolId] = {
          id: symbolId,
          name: componentName,
          kind: 'function',
          filePath,
          range: this._getPositionFromMatch(content, match.index),
          exportStatus:
            content.includes(`export default ${componentName}`) || content.includes(`export function ${componentName}`)
              ? 'exported'
              : 'private',
        };

        detectedSymbols.push(symbolId);
      }

      // Detectar componentes funcionais com arrow function
      const arrowComponentRegex = /const\s+([A-Z]\w+)\s*=\s*(?:\(|\w+)\s*=>/g;

      while ((match = arrowComponentRegex.exec(content)) !== null) {
        const [, componentName] = match;
        const symbolId = `symbol:${filePath}:${componentName}`;

        this._graph.symbols[symbolId] = {
          id: symbolId,
          name: componentName,
          kind: 'function',
          filePath,
          range: this._getPositionFromMatch(content, match.index),
          exportStatus: content.includes(`export default ${componentName}`)
            ? 'default-exported'
            : content.includes(`export const ${componentName}`)
              ? 'exported'
              : 'private',
        };

        detectedSymbols.push(symbolId);
      }
    }

    // Detecção de classes
    const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?/g;
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      const [, className, extendsClass] = match;
      const symbolId = `symbol:${filePath}:${className}`;

      this._graph.symbols[symbolId] = {
        id: symbolId,
        name: className,
        kind: 'class',
        filePath,
        range: this._getPositionFromMatch(content, match.index),
        exportStatus:
          content.includes(`export class ${className}`) || content.includes(`export default class ${className}`)
            ? 'exported'
            : 'private',
      };

      detectedSymbols.push(symbolId);

      // Se estende outra classe, registrar a dependência
      if (extendsClass) {
        this._addDependencyEdge(symbolId, extendsClass, 'extends');
      }
    }

    // Detecção de interfaces
    const interfaceRegex = /interface\s+(\w+)(?:\s+extends\s+(\w+))?/g;

    while ((match = interfaceRegex.exec(content)) !== null) {
      const [, interfaceName] = match;
      const symbolId = `symbol:${filePath}:${interfaceName}`;

      this._graph.symbols[symbolId] = {
        id: symbolId,
        name: interfaceName,
        kind: 'interface',
        filePath,
        range: this._getPositionFromMatch(content, match.index),
        exportStatus: content.includes(`export interface ${interfaceName}`) ? 'exported' : 'private',
      };

      detectedSymbols.push(symbolId);
    }

    // Detecção de funções
    const functionRegex = /function\s+(\w+)/g;

    while ((match = functionRegex.exec(content)) !== null) {
      const [, functionName] = match;

      // Ignorar nomes que começam com maiúscula, pois já foram detectados como componentes
      if (
        functionName[0] === functionName[0].toUpperCase() &&
        (filePath.endsWith('.jsx') || filePath.endsWith('.tsx'))
      ) {
        continue;
      }

      const symbolId = `symbol:${filePath}:${functionName}`;

      this._graph.symbols[symbolId] = {
        id: symbolId,
        name: functionName,
        kind: 'function',
        filePath,
        range: this._getPositionFromMatch(content, match.index),
        exportStatus: content.includes(`export function ${functionName}`) ? 'exported' : 'private',
      };

      detectedSymbols.push(symbolId);
    }

    // Detecção de variáveis React (useState, useEffect, etc.)
    const reactHookRegex = /const\s+\[(\w+),\s*set(\w+)\]\s*=\s*useState/g;

    while ((match = reactHookRegex.exec(content)) !== null) {
      const [, stateName] = match;
      const symbolId = `symbol:${filePath}:${stateName}`;

      this._graph.symbols[symbolId] = {
        id: symbolId,
        name: stateName,
        kind: 'variable',
        filePath,
        range: this._getPositionFromMatch(content, match.index),
        exportStatus: 'private',
      };

      detectedSymbols.push(symbolId);
    }

    // Atualizar lista de símbolos do arquivo
    fileNode.symbols = detectedSymbols;
  }

  /**
   * Detecta importações e suas dependências
   */
  private _analyzeImports(filePath: string, content: string) {
    const fileId = `file:${filePath}`;

    /*
     * Detectar importações ES6 - versão melhorada para capturar mais padrões
     * Isso captura:
     * - import { x } from 'y'
     * - import x from 'y'
     * - import * as x from 'y'
     * - import 'y'
     */
    const importRegex =
      /import\s+(?:(?:{([^}]+)}\s+from\s+)|(?:(\w+)\s+from\s+)|(?:\*\s+as\s+(\w+)\s+from\s+)|(?:(?![\{\*\w]).*?))['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      /*
       * Os grupos de captura podem ser:
       * [1]: importações nomeadas {x, y}
       * [2]: importação default
       * [3]: importação namespace * as x
       * [4]: caminho do módulo
       */
      const namedImports = match[1];
      const defaultImport = match[2];
      const importPath = match[4] || match[match.length - 1]; // O último grupo sempre será o caminho

      // Resolver caminho relativo para caminho absoluto
      const resolvedPath = this._resolveImportPath(filePath, importPath);

      if (!resolvedPath) {
        // Para dependências externas (como 'react'), criamos um nó virtual
        const virtualPath = `node_modules/${importPath}`;
        const targetFileId = `file:${virtualPath}`;

        // Verificar se já temos este arquivo virtual
        if (!(targetFileId in this._graph.files)) {
          this._graph.files[targetFileId] = {
            id: targetFileId,
            path: virtualPath,
            lastModified: Date.now(),
            symbols: [],
          };
        }

        // Adicionar dependência para o módulo externo
        const dependencyEdge: DependencyEdge = {
          source: fileId,
          target: targetFileId,
          kind: 'import',
          weight: 1,
        };

        // Verificar se esta dependência já existe
        const existingEdgeIndex = this._graph.dependencies.findIndex(
          (edge) => edge.source === dependencyEdge.source && edge.target === dependencyEdge.target,
        );

        if (existingEdgeIndex >= 0) {
          // Incrementar o peso se já existir
          this._graph.dependencies[existingEdgeIndex].weight += 1;
        } else {
          // Adicionar nova dependência
          this._graph.dependencies.push(dependencyEdge);
        }

        continue;
      }

      // Adicionar dependência de arquivo
      const targetFileId = `file:${resolvedPath}`;

      // Adicionar ao grafo de dependências mesmo que o arquivo destino ainda não esteja indexado
      const dependencyEdge: DependencyEdge = {
        source: fileId,
        target: targetFileId,
        kind: 'import',
        weight: 1,
      };

      // Verificar se esta dependência já existe
      const existingEdgeIndex = this._graph.dependencies.findIndex(
        (edge) => edge.source === dependencyEdge.source && edge.target === dependencyEdge.target,
      );

      if (existingEdgeIndex >= 0) {
        // Incrementar o peso se já existir
        this._graph.dependencies[existingEdgeIndex].weight += 1;
      } else {
        // Adicionar nova dependência
        this._graph.dependencies.push(dependencyEdge);
      }

      // Processar importações nomeadas se disponíveis
      if (namedImports) {
        const imports = namedImports.split(',').map((i) => i.trim());
        imports.forEach((importedSymbol) => {
          // Adicionar dependência de símbolo quando o arquivo destino for indexado
          if (resolvedPath in this._graph.files) {
            const targetSymbolId = `symbol:${resolvedPath}:${importedSymbol}`;

            if (targetSymbolId in this._graph.symbols) {
              // Adicionar dependências para cada símbolo no arquivo atual
              for (const sourceSymbolId of this._graph.files[fileId].symbols) {
                this._addDependencyEdge(sourceSymbolId, targetSymbolId, 'uses');
              }
            }
          }
        });
      }

      // Processar importação default se disponível
      if (defaultImport) {
        const targetSymbolId = `symbol:${resolvedPath}:default`;

        // Adicionar símbolo virtual para importação default
        if (!(targetSymbolId in this._graph.symbols)) {
          this._graph.symbols[targetSymbolId] = {
            id: targetSymbolId,
            name: defaultImport,
            kind: 'module',
            filePath: resolvedPath,
            range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
            exportStatus: 'default-exported',
          };
        }
      }

      // Adicionar o arquivo de destino para indexação se ainda não existir
      if (!(targetFileId in this._graph.files)) {
        this.queueFileForIndexing(resolvedPath);
      }
    }
  }

  /**
   * Detecta diagnósticos nos arquivos indexados
   */
  private _detectDiagnostics(filePath: string, content: string) {
    // Limpar diagnósticos antigos para o arquivo
    diagnosticsStore.clearDiagnostics(filePath);

    // Detectar apenas arquivos que podem conter código
    if (!this._shouldAnalyzeForDiagnostics(filePath)) {
      return;
    }

    // Verificar parênteses/colchetes/chaves desbalanceados
    this._detectUnbalancedBrackets(filePath, content);

    // Verificar importações não utilizadas
    this._detectUnusedImports(filePath, content);

    // Detectar variáveis potencialmente indefinidas
    this._detectUndefinedVariables(filePath, content);

    // Detecção específica de linguagem/framework
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      this._detectReactIssues(filePath, content);
    }

    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      this._detectTypeScriptIssues(filePath, content);
    }
  }

  /**
   * Verifica se há parênteses/colchetes/chaves desbalanceados
   */
  private _detectUnbalancedBrackets(filePath: string, content: string) {
    const openingBrackets = ['(', '[', '{'];
    const closingBrackets = [')', ']', '}'];
    const stack: { char: string; line: number; col: number }[] = [];

    const lines = content.split('\n');

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];

      for (let colIdx = 0; colIdx < line.length; colIdx++) {
        const char = line[colIdx];

        if (openingBrackets.includes(char)) {
          stack.push({ char, line: lineIdx + 1, col: colIdx + 1 });
        } else if (closingBrackets.includes(char)) {
          const bracketIdx = closingBrackets.indexOf(char);
          const matchingOpening = openingBrackets[bracketIdx];

          if (stack.length === 0 || stack[stack.length - 1].char !== matchingOpening) {
            // Colchete de fechamento sem abertura correspondente
            diagnosticsStore.addDiagnostic({
              id: `unbalanced-bracket-${filePath}-${lineIdx}-${colIdx}`,
              filePath,
              line: lineIdx + 1,
              column: colIdx + 1,
              message: `Colchete de fechamento '${char}' não tem abertura correspondente`,
              severity: 'error',
              source: 'workspace-index',
            });
          } else {
            stack.pop();
          }
        }
      }
    }

    // Verificar se sobraram colchetes de abertura
    stack.forEach((bracket) => {
      diagnosticsStore.addDiagnostic({
        id: `unbalanced-bracket-open-${filePath}-${bracket.line}-${bracket.col}`,
        filePath,
        line: bracket.line,
        column: bracket.col,
        message: `Colchete de abertura '${bracket.char}' não tem fechamento correspondente`,
        severity: 'error',
        source: 'workspace-index',
      });
    });
  }

  /**
   * Verifica importações não utilizadas
   */
  private _detectUnusedImports(filePath: string, content: string) {
    // Extrair todas as importações
    const imports = new Map<string, { line: number; column: number }>();
    const importRegex = /import\s+{([^}]+)}\s+from/g;
    let importMatch: RegExpExecArray | null;

    while ((importMatch = importRegex.exec(content)) !== null) {
      const importNames = importMatch[1].split(',').map((name) => name.trim().split(' as ')[0].trim());
      const lineNumber = content.substring(0, importMatch.index).split('\n').length;

      importNames.forEach((name) => {
        const columnPosition = content.split('\n')[lineNumber - 1].indexOf(name) + 1;
        imports.set(name, { line: lineNumber, column: columnPosition });
      });
    }

    // Verificar quais importações são usadas no código
    const importUseRegex = /\b(\w+)\b/g;
    let useMatch: RegExpExecArray | null;
    const usedImports = new Set<string>();

    // Pular as linhas de importação
    const contentAfterImports = content.replace(/import\s+.*?from\s+['"].*?['"]/g, '');

    while ((useMatch = importUseRegex.exec(contentAfterImports)) !== null) {
      const name = useMatch[1];

      if (imports.has(name)) {
        usedImports.add(name);
      }
    }

    // Adicionar diagnósticos para importações não utilizadas
    imports.forEach((position, name) => {
      if (!usedImports.has(name)) {
        diagnosticsStore.addDiagnostic({
          id: `unused-import-${filePath}-${name}`,
          filePath,
          line: position.line,
          column: position.column,
          message: `Importação não utilizada: ${name}`,
          severity: 'warning',
          source: 'workspace-index',
        });
      }
    });
  }

  /**
   * Verifica se a tag é uma tag HTML válida
   */
  private _isHtmlTag(tag: string): boolean {
    const htmlTags = [
      'a',
      'abbr',
      'address',
      'area',
      'article',
      'aside',
      'audio',
      'b',
      'base',
      'bdi',
      'bdo',
      'blockquote',
      'body',
      'br',
      'button',
      'canvas',
      'caption',
      'cite',
      'code',
      'col',
      'colgroup',
      'data',
      'datalist',
      'dd',
      'del',
      'details',
      'dfn',
      'dialog',
      'div',
      'dl',
      'dt',
      'em',
      'embed',
      'fieldset',
      'figcaption',
      'figure',
      'footer',
      'form',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'head',
      'header',
      'hgroup',
      'hr',
      'html',
      'i',
      'iframe',
      'img',
      'input',
      'ins',
      'kbd',
      'label',
      'legend',
      'li',
      'link',
      'main',
      'map',
      'mark',
      'meta',
      'meter',
      'nav',
      'noscript',
      'object',
      'ol',
      'optgroup',
      'option',
      'output',
      'p',
      'param',
      'picture',
      'pre',
      'progress',
      'q',
      'rp',
      'rt',
      'ruby',
      's',
      'samp',
      'script',
      'section',
      'select',
      'slot',
      'small',
      'source',
      'span',
      'strong',
      'style',
      'sub',
      'summary',
      'sup',
      'table',
      'tbody',
      'td',
      'template',
      'textarea',
      'tfoot',
      'th',
      'thead',
      'time',
      'title',
      'tr',
      'track',
      'u',
      'ul',
      'var',
      'video',
      'wbr',
    ];

    return htmlTags.includes(tag.toLowerCase());
  }

  /**
   * Verifica se a tag é uma tag SVG válida
   */
  private _isCommonSvgTag(tag: string): boolean {
    const svgTags = [
      'svg',
      'circle',
      'clipPath',
      'defs',
      'desc',
      'ellipse',
      'feBlend',
      'feColorMatrix',
      'feComponentTransfer',
      'feComposite',
      'feConvolveMatrix',
      'feDiffuseLighting',
      'feDisplacementMap',
      'feDistantLight',
      'feDropShadow',
      'feFlood',
      'feFuncA',
      'feFuncB',
      'feFuncG',
      'feFuncR',
      'feGaussianBlur',
      'feImage',
      'feMerge',
      'feMergeNode',
      'feMorphology',
      'feOffset',
      'fePointLight',
      'feSpecularLighting',
      'feSpotLight',
      'feTile',
      'feTurbulence',
      'filter',
      'foreignObject',
      'g',
      'image',
      'line',
      'linearGradient',
      'marker',
      'mask',
      'metadata',
      'path',
      'pattern',
      'polygon',
      'polyline',
      'radialGradient',
      'rect',
      'stop',
      'switch',
      'symbol',
      'text',
      'textPath',
      'tspan',
      'use',
      'view',
    ];

    return svgTags.includes(tag.toLowerCase());
  }

  /**
   * Verifica se um arquivo deve ser indexado com base em sua extensão
   */
  private _shouldIndexFile(filePath: string): boolean {
    // Ampliamos para incluir mais tipos de arquivo
    const indexableExtensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.less', '.html', '.vue'];
    return indexableExtensions.some((ext) => filePath.endsWith(ext));
  }

  /**
   * Força a reindexação de todos os arquivos
   */
  reindexAll() {
    // Limpar o grafo
    this._graph = {
      files: {},
      symbols: {},
      dependencies: [],
    };

    // Limpar caches
    this._fileHashes = {};
    this._indexingQueue = [];

    // Reiniciar indexação
    this._initializeWorkspace();

    logger.info('Reindexação completa iniciada');
  }

  /**
   * Adiciona uma aresta de dependência ao grafo
   */
  private _addDependencyEdge(sourceId: string, targetName: string, kind: DependencyEdge['kind']) {
    // Tentar encontrar o símbolo alvo
    let targetId: string | undefined;

    // Procurar em todos os símbolos
    for (const [id, symbol] of Object.entries(this._graph.symbols)) {
      if (symbol.name === targetName) {
        targetId = id;
        break;
      }
    }

    if (!targetId) {
      return;
    } // Símbolo alvo não encontrado

    // Verificar se já existe esta dependência
    const existingIndex = this._graph.dependencies.findIndex(
      (d) => d.source === sourceId && d.target === targetId && d.kind === kind,
    );

    if (existingIndex >= 0) {
      // Incrementar peso
      this._graph.dependencies[existingIndex].weight += 1;
    } else {
      // Adicionar nova dependência
      this._graph.dependencies.push({
        source: sourceId,
        target: targetId,
        kind,
        weight: 1,
      });
    }
  }

  /**
   * Calcula a posição no documento a partir de um índice
   */
  private _getPositionFromMatch(content: string, matchIndex: number) {
    const contentUpToMatch = content.substring(0, matchIndex);
    const lines = contentUpToMatch.split('\n');
    const startLine = lines.length;
    const startColumn = lines[lines.length - 1].length + 1;

    return {
      startLine,
      startColumn,
      endLine: startLine,
      endColumn: startColumn + 10, // Aproximação simplificada
    };
  }

  /**
   * Resolve um caminho de importação para caminho absoluto
   */
  private _resolveImportPath(sourcePath: string, importPath: string): string | null {
    // Ampliamos para reconhecer módulos comuns em projetos frontend
    if (importPath.startsWith('.')) {
      // Caminho relativo
      const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
      let resolvedPath = `${sourceDir}/${importPath}`;

      // Verificar se o caminho existe sem extensão
      const possibleExtensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];

      if (!possibleExtensions.some((ext) => resolvedPath.endsWith(ext))) {
        // Tentar encontrar o arquivo com alguma extensão
        for (const ext of possibleExtensions) {
          const testPath = `${resolvedPath}${ext}`;
          const files = this._filesMap.get();

          if (testPath in files) {
            return testPath;
          }

          // Verificar se é um index file em um diretório
          const indexPath = `${resolvedPath}/index${ext}`;

          if (indexPath in files) {
            return indexPath;
          }
        }

        // Se não encontrou, assumir .js como fallback
        resolvedPath += '.jsx';
      }

      return resolvedPath;
    } else if (importPath.startsWith('~/') || importPath.startsWith('@/')) {
      // Caminho a partir da raiz do projeto
      const aliasPath = importPath.substring(2);
      return `src/${aliasPath}`;
    }

    // Módulos externos - retornar null para criar nós virtuais
    return null;
  }

  /**
   * Calcula um hash simples para o conteúdo de um arquivo
   */
  private _simpleHash(content: string): string {
    let hash = 0;

    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Converter para inteiro de 32 bits
    }

    return hash.toString(16);
  }

  /**
   * Retorna o grafo de dependências atual
   */
  getGraph(): WorkspaceGraph {
    return this._graph;
  }

  /**
   * Encontra todos os símbolos no workspace
   */
  findAllSymbols(): SymbolNode[] {
    return Object.values(this._graph.symbols);
  }

  /**
   * Encontra todos os usos de um símbolo
   */
  findAllReferences(symbolName: string, filePath?: string): SymbolNode[] {
    const references: SymbolNode[] = [];

    // Encontrar o símbolo de origem
    let sourceSymbol: SymbolNode | undefined;

    if (filePath) {
      const symbolId = `symbol:${filePath}:${symbolName}`;
      sourceSymbol = this._graph.symbols[symbolId];
    } else {
      // Buscar em todos os símbolos
      sourceSymbol = Object.values(this._graph.symbols).find((s) => s.name === symbolName);
    }

    if (!sourceSymbol) {
      return [];
    }

    // Encontrar todas as dependências que referenciam este símbolo
    for (const dep of this._graph.dependencies) {
      if (dep.target === sourceSymbol.id) {
        const sourceSymbolId = dep.source;

        if (sourceSymbolId.startsWith('symbol:')) {
          const refSymbol = this._graph.symbols[sourceSymbolId];

          if (refSymbol) {
            references.push(refSymbol);
          }
        }
      }
    }

    return references;
  }

  /**
   * Navega para a definição de um símbolo
   */
  findDefinition(symbolName: string, filePath: string): SymbolNode | null {
    // Verificar primeiro no arquivo atual
    const localSymbolId = `symbol:${filePath}:${symbolName}`;

    if (localSymbolId in this._graph.symbols) {
      return this._graph.symbols[localSymbolId];
    }

    // Buscar em arquivos importados
    const fileId = `file:${filePath}`;
    const importedFiles = this._graph.dependencies
      .filter((dep) => dep.source === fileId && dep.kind === 'import')
      .map((dep) => dep.target.replace('file:', ''));

    for (const importedFile of importedFiles) {
      const symbolId = `symbol:${importedFile}:${symbolName}`;

      if (symbolId in this._graph.symbols) {
        return this._graph.symbols[symbolId];
      }
    }

    return null;
  }

  /**
   * Obtém todas as dependências de um arquivo
   */
  getFileDependencies(filePath: string): { imports: FileNode[]; importedBy: FileNode[] } {
    const fileId = `file:${filePath}`;
    const imports: FileNode[] = [];
    const importedBy: FileNode[] = [];

    // Arquivos que este arquivo importa
    for (const dep of this._graph.dependencies) {
      if (dep.source === fileId && dep.kind === 'import' && dep.target in this._graph.files) {
        imports.push(this._graph.files[dep.target]);
      }

      // Arquivos que importam este arquivo
      if (dep.target === fileId && dep.kind === 'import' && dep.source in this._graph.files) {
        importedBy.push(this._graph.files[dep.source]);
      }
    }

    return { imports, importedBy };
  }

  /**
   * Finaliza o serviço, liberando recursos
   */
  dispose() {
    if (this._unsubscribeFromFiles) {
      this._unsubscribeFromFiles();
    }

    // Limpar outros recursos
    this._fileWatchers.forEach((unsubscribe) => unsubscribe());
    this._fileWatchers.clear();

    logger.info('WorkspaceIndexService finalizado');
  }

  /**
   * Remove um arquivo do índice
   */
  private _removeFileFromIndex(filePath: string) {
    const fileId = `file:${filePath}`;

    // Remover símbolos do arquivo
    if (fileId in this._graph.files) {
      for (const symbolId of this._graph.files[fileId].symbols) {
        delete this._graph.symbols[symbolId];
      }

      // Remover o arquivo
      delete this._graph.files[fileId];

      // Remover dependências relacionadas
      this._graph.dependencies = this._graph.dependencies.filter(
        (dep) => dep.source !== fileId && dep.target !== fileId,
      );

      // Limpar diagnósticos
      diagnosticsStore.clearDiagnostics(filePath);

      logger.debug(`Arquivo removido do índice: ${filePath}`);
    }
  }

  /**
   * Verifica se um arquivo deve ser analisado para diagnósticos
   */
  private _shouldAnalyzeForDiagnostics(filePath: string): boolean {
    const codeFileExtensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro'];
    const extension = filePath.substring(filePath.lastIndexOf('.'));

    return codeFileExtensions.includes(extension);
  }

  /**
   * Verifica referências a variáveis possivelmente indefinidas
   */
  private _detectUndefinedVariables(filePath: string, content: string) {
    // Encontrar todas as definições de variáveis
    const varDefinitions = new Set<string>();

    // Declarações de variáveis
    const varDeclarationRegex = /\b(?:const|let|var)\s+(\w+)\b/g;
    let match: RegExpExecArray | null;

    while ((match = varDeclarationRegex.exec(content)) !== null) {
      varDefinitions.add(match[1]);
    }

    // Parâmetros de funções
    const funcParamRegex = /\bfunction\s+\w+\s*\(([^)]*)\)/g;

    while ((match = funcParamRegex.exec(content)) !== null) {
      const params = match[1].split(',').map((p) => p.trim().split(':')[0].split('=')[0].trim());
      params.forEach((param) => {
        if (param) {
          varDefinitions.add(param);
        }
      });
    }

    // Parâmetros de arrow functions
    const arrowFuncRegex = /\b(\w+)\s*=>\s*{/g;

    while ((match = arrowFuncRegex.exec(content)) !== null) {
      varDefinitions.add(match[1]);
    }

    // Parâmetros de arrow functions com múltiplos parâmetros
    const multiParamArrowRegex = /\(([^)]*)\)\s*=>\s*[{[]/g;

    while ((match = multiParamArrowRegex.exec(content)) !== null) {
      const params = match[1].split(',').map((p) => p.trim().split(':')[0].split('=')[0].trim());
      params.forEach((param) => {
        if (param) {
          varDefinitions.add(param);
        }
      });
    }

    // Importações
    const importRegex = /import\s+{([^}]+)}/g;

    while ((match = importRegex.exec(content)) !== null) {
      const imports = match[1].split(',').map((i) => i.trim().split(' as ')[0].trim());
      imports.forEach((imp) => {
        if (imp) {
          varDefinitions.add(imp);
        }
      });
    }

    // Adicionar globals comuns
    this._getCommonGlobals().forEach((g) => varDefinitions.add(g));

    // Agora procurar por uso de variáveis não definidas
    const varUsageRegex = /\b(\w+)\b/g;
    const checkedVars = new Set<string>();

    const lines = content.split('\n');
    lines.forEach((line, lineIndex) => {
      // Ignorar comentários
      const codeLine = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');

      let varMatch: RegExpExecArray | null;

      while ((varMatch = varUsageRegex.exec(codeLine)) !== null) {
        const varName = varMatch[1];

        // Ignorar palavras-chave, números e variáveis já verificadas
        if (
          varName.length <= 1 ||
          /^\d+$/.test(varName) ||
          /^(if|else|for|while|function|return|const|let|var|import|export|from|as|class|interface|type|enum|true|false|null|undefined|this|super|new|try|catch|finally|throw|break|continue|default|case|switch|in|of|instanceof|typeof)$/.test(
            varName,
          ) ||
          checkedVars.has(varName)
        ) {
          continue;
        }

        checkedVars.add(varName);

        if (!varDefinitions.has(varName) && !this._isCommonGlobal(varName)) {
          diagnosticsStore.addDiagnostic({
            id: `undefined-var-${filePath}-${varName}-${lineIndex}`,
            filePath,
            line: lineIndex + 1,
            column: codeLine.indexOf(varName) + 1,
            message: `Variável possivelmente não definida: ${varName}`,
            severity: 'warning',
            source: 'workspace-index',
          });
        }
      }
    });
  }

  /**
   * Detecta problemas específicos de React
   */
  private _detectReactIssues(filePath: string, content: string) {
    // const lines = content.split('\n');

    // Procurar por componentes que não começam com letra maiúscula
    const componentRegex = /<(\w+)[\s>]/g;
    let match: RegExpExecArray | null;

    while ((match = componentRegex.exec(content)) !== null) {
      const componentName = match[1];

      // Se começa com minúscula, não é uma tag HTML, e não é um componente conhecido
      if (
        componentName[0] === componentName[0].toLowerCase() &&
        !this._isHtmlTag(componentName) &&
        !this._isCommonSvgTag(componentName)
      ) {
        const lineIndex = content.substring(0, match.index).split('\n').length - 1;

        diagnosticsStore.addDiagnostic({
          id: `invalid-react-component-${filePath}-${componentName}-${lineIndex}`,
          filePath,
          line: lineIndex + 1,
          column: content.split('\n')[lineIndex].indexOf(componentName) + 1,
          message: `Possível erro: componentes React devem começar com letra maiúscula (${componentName})`,
          severity: 'warning',
          source: 'workspace-index',
        });
      }
    }

    // Verificar uso do "key" em listas
    const mapRegex = /\.map\s*\(\s*(?:\(\s*([^,)]+)(?:,\s*([^,)]+))?\s*\)|([^=>(]+))\s*=>\s*(?:<|\{)/g;

    while ((match = mapRegex.exec(content)) !== null) {
      const mapContentStartIndex = match.index + match[0].length;
      const openBracket = content[mapContentStartIndex - 1];
      const closeBracket = openBracket === '<' ? '>' : '}';

      // Encontrar o conteúdo renderizado no .map()
      let mapContent = '';
      let bracketCount = 1;
      let currentIndex = mapContentStartIndex;

      while (bracketCount > 0 && currentIndex < content.length) {
        if (content[currentIndex] === openBracket) {
          bracketCount++;
        }

        if (content[currentIndex] === closeBracket) {
          bracketCount--;
        }

        mapContent += content[currentIndex];
        currentIndex++;
      }

      // Verificar se há prop key
      if (!mapContent.includes('key=') && !mapContent.includes('key:')) {
        const lineIndex = content.substring(0, match.index).split('\n').length - 1;

        diagnosticsStore.addDiagnostic({
          id: `missing-key-${filePath}-${lineIndex}`,
          filePath,
          line: lineIndex + 1,
          column: content.split('\n')[lineIndex].indexOf('.map') + 1,
          message: 'Elementos em listas React devem ter a prop "key" para melhor performance',
          severity: 'warning',
          source: 'workspace-index',
        });
      }
    }

    // Verificar problemas de acessibilidade
    this._detectAccessibilityIssues(filePath, content);

    // Verificar problemas com manipuladores de eventos
    this._detectEventHandlerIssues(filePath, content);
  }

  /**
   * Detecta problemas de acessibilidade em componentes React
   */
  private _detectAccessibilityIssues(filePath: string, content: string) {
    // Verificar imagens sem alt
    const imgWithoutAltRegex = /<img(?![^>]*\balt=['"])/g;
    let match: RegExpExecArray | null;

    while ((match = imgWithoutAltRegex.exec(content)) !== null) {
      const lineIndex = content.substring(0, match.index).split('\n').length - 1;

      diagnosticsStore.addDiagnostic({
        id: `accessibility-img-alt-${filePath}-${lineIndex}`,
        filePath,
        line: lineIndex + 1,
        column: content.split('\n')[lineIndex].indexOf('<img') + 1,
        message: 'Imagem sem atributo alt - isso prejudica a acessibilidade para leitores de tela',
        severity: 'warning',
        source: 'workspace-index',
      });
    }

    // Verificar botões sem texto acessível
    const buttonWithoutTextRegex = /<button[^>]*>(\s*|<img[^>]*>)\s*<\/button>/g;

    while ((match = buttonWithoutTextRegex.exec(content)) !== null) {
      const lineIndex = content.substring(0, match.index).split('\n').length - 1;

      diagnosticsStore.addDiagnostic({
        id: `accessibility-button-text-${filePath}-${lineIndex}`,
        filePath,
        line: lineIndex + 1,
        column: content.split('\n')[lineIndex].indexOf('<button') + 1,
        message: 'Botão sem texto - adicione texto ou aria-label para acessibilidade',
        severity: 'warning',
        source: 'workspace-index',
      });
    }

    // Verificar elementos interativos sem aria-label quando não têm texto
    const interactiveNoTextRegex = /<(a|button|input|select|textarea)[^>]*>/g;

    while ((match = interactiveNoTextRegex.exec(content)) !== null) {
      const elementTag = match[1];
      const elementHtml = match[0];

      if (!elementHtml.includes('aria-label') && !elementHtml.includes('aria-labelledby')) {
        // Caso específico: elementos que precisam de label
        if (elementTag === 'input') {
          // Pular inputs que têm label associado no código
          const inputId = elementHtml.match(/id=["']([^"']+)["']/)?.[1];

          if (inputId && content.includes(`htmlFor="${inputId}"`)) {
            continue;
          }

          const lineIndex = content.substring(0, match.index).split('\n').length - 1;

          diagnosticsStore.addDiagnostic({
            id: `accessibility-input-label-${filePath}-${lineIndex}`,
            filePath,
            line: lineIndex + 1,
            column: content.split('\n')[lineIndex].indexOf('<input') + 1,
            message: 'Input sem label associado - use o atributo htmlFor ou aria-labelledby',
            severity: 'info',
            source: 'workspace-index',
          });
        }
      }
    }
  }

  /**
   * Detecta problemas específicos de TypeScript
   */
  private _detectTypeScriptIssues(filePath: string, content: string) {
    // Procurar possíveis type assertions que poderiam ser unsound
    const typeAssertionRegex = /as\s+any/g;
    let match: RegExpExecArray | null;

    while ((match = typeAssertionRegex.exec(content)) !== null) {
      const lineIndex = content.substring(0, match.index).split('\n').length - 1;

      diagnosticsStore.addDiagnostic({
        id: `unsafe-assertion-${filePath}-${lineIndex}`,
        filePath,
        line: lineIndex + 1,
        column: content.split('\n')[lineIndex].indexOf('as any') + 1,
        message: 'Uso de "as any" pode levar a bugs de tipo. Considere usar tipos mais específicos.',
        severity: 'info',
        source: 'workspace-index',
      });
    }
  }

  /**
   * Verifica se um nome é um identificador global comum
   */
  private _isCommonGlobal(name: string): boolean {
    return this._getCommonGlobals().includes(name);
  }

  /**
   * Retorna a lista de identificadores globais comuns
   */
  private _getCommonGlobals(): string[] {
    return [
      'window',
      'document',
      'console',
      'setTimeout',
      'setInterval',
      'fetch',
      'Promise',
      'Map',
      'Set',
      'Array',
      'Object',
      'String',
      'Number',
      'Boolean',
      'Math',
      'Date',
      'JSON',
      'localStorage',
      'sessionStorage',
      'navigator',
      'location',
      'history',
      'Error',

      // APIs React comuns
      'React',
      'useState',
      'useEffect',
      'useContext',
      'useRef',
      'useReducer',
      'useCallback',
      'useMemo',
      'useLayoutEffect',
    ];
  }

  /**
   * Detecta problemas relacionados a manipuladores de eventos em React
   */
  private _detectEventHandlerIssues(filePath: string, content: string) {
    // Verificar onClick recebendo função com invocação imediata em vez de referência
    const onClickWithInvocationRegex =
      /onClick\s*=\s*{(?!\s*[a-zA-Z0-9_]+\s*=>)(?!\s*function\s*\()(?!\s*\([^)]*\)\s*=>)[^}]*\([^)]*\)(?!\.bind)[^}]*}/g;
    let match: RegExpExecArray | null;

    while ((match = onClickWithInvocationRegex.exec(content)) !== null) {
      const matchedContent = match[0];

      // Ignorar casos em que é usado preventDefault, stopPropagation, etc.
      if (
        matchedContent.includes('.preventDefault') ||
        matchedContent.includes('.stopPropagation') ||
        matchedContent.includes('=>')
      ) {
        continue;
      }

      const lineIndex = content.substring(0, match.index).split('\n').length - 1;

      diagnosticsStore.addDiagnostic({
        id: `event-handler-invocation-${filePath}-${lineIndex}`,
        filePath,
        line: lineIndex + 1,
        column: content.split('\n')[lineIndex].indexOf('onClick') + 1,
        message:
          'O evento onClick recebe uma invocação de função imediata em vez de uma referência. Use onClick={() => handleClick()} ou onClick={handleClick}',
        severity: 'warning',
        source: 'workspace-index',
      });
    }

    // Verificar useState sem setter ou com setter não utilizado
    const useStateRegex = /const\s+\[\s*(\w+)\s*,\s*set(\w+)\s*\]\s*=\s*useState/g;

    while ((match = useStateRegex.exec(content)) !== null) {
      const setterName = 'set' + match[2];

      // Verificar se o setter é usado no arquivo
      const setterRegex = new RegExp(`\\b${setterName}\\s*\\(`, 'g');
      const setterUsages = content.match(setterRegex) || [];

      if (setterUsages.length === 0) {
        const lineIndex = content.substring(0, match.index).split('\n').length - 1;

        diagnosticsStore.addDiagnostic({
          id: `unused-state-setter-${filePath}-${setterName}-${lineIndex}`,
          filePath,
          line: lineIndex + 1,
          column: content.split('\n')[lineIndex].indexOf(setterName) + 1,
          message: `O setter de estado '${setterName}' nunca é utilizado. Considere usar useRef ou uma constante se o valor nunca muda.`,
          severity: 'info',
          source: 'workspace-index',
        });
      }
    }

    // Detectar useEffect sem dependências ou com array de dependências vazio
    const useEffectRegex = /useEffect\s*\(\s*\(\s*\)\s*=>\s*{[^}]*}\s*,\s*(\[\s*\]|\s*)\)/g;

    while ((match = useEffectRegex.exec(content)) !== null) {
      const effectCode = match[0];
      const hasDeps = effectCode.includes('[]');

      if (!hasDeps) {
        // Sem array de dependências - executa em cada renderização
        const lineIndex = content.substring(0, match.index).split('\n').length - 1;

        diagnosticsStore.addDiagnostic({
          id: `effect-no-deps-${filePath}-${lineIndex}`,
          filePath,
          line: lineIndex + 1,
          column: content.split('\n')[lineIndex].indexOf('useEffect') + 1,
          message:
            'useEffect sem array de dependências será executado em cada renderização. Adicione [] para executar apenas na montagem ou especifique as dependências.',
          severity: 'info',
          source: 'workspace-index',
        });
      } else if (
        effectCode.includes('[]') &&
        (effectCode.includes('document.addEventListener') || effectCode.includes('.addEventListener'))
      ) {
        // Evento DOM com array vazio de deps mas sem cleanup
        if (!effectCode.includes('return')) {
          const lineIndex = content.substring(0, match.index).split('\n').length - 1;

          diagnosticsStore.addDiagnostic({
            id: `effect-no-cleanup-${filePath}-${lineIndex}`,
            filePath,
            line: lineIndex + 1,
            column: content.split('\n')[lineIndex].indexOf('useEffect') + 1,
            message:
              'useEffect com eventos addEventListener deve retornar uma função de cleanup para remover os listeners',
            severity: 'warning',
            source: 'workspace-index',
          });
        }
      }
    }
  }
}

/**
 * Factory para obter uma instância do WorkspaceIndexService
 * integrada com o FilesStore do workbenchStore
 */
export function getWorkspaceIndexService(): WorkspaceIndexService {
  try {
    // Usar cast simples - vamos corrigir a implementação no próprio serviço
    return new WorkspaceIndexService(workbenchStore as unknown as FilesStore);
  } catch (error) {
    console.error('Erro ao criar instância do WorkspaceIndexService:', error);

    // Fallback simples
    return new WorkspaceIndexService(workbenchStore as unknown as FilesStore);
  }
}

// Singleton
export const workspaceIndexService = getWorkspaceIndexService();
