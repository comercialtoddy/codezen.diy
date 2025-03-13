/**
 * Representação simples de um URI (Universal Resource Identifier)
 * Baseado em uma versão simplificada do URI do VSCode
 */
export type URI = string;

/**
 * Utilitários para manipulação de URIs
 */
export const URI = {
  /**
   * Cria um URI a partir de um caminho de arquivo
   */
  file(path: string): URI {
    // Normaliza caminhos para o formato usado no projeto
    return path.startsWith('/') ? path : `/${path}`;
  },

  /**
   * Obtém o caminho de arquivo a partir de um URI
   */
  fsPath(uri: URI): string {
    // Remove o prefixo de protocolo file:// se presente
    if (uri.startsWith('file://')) {
      return uri.substring(7);
    }

    return uri;
  },

  /**
   * Obtém o nome do arquivo a partir de um URI
   */
  basename(uri: URI): string {
    const path = URI.fsPath(uri);
    const segments = path.split('/');

    return segments[segments.length - 1] || '';
  },

  /**
   * Obtém o diretório pai a partir de um URI
   */
  dirname(uri: URI): URI {
    const path = URI.fsPath(uri);
    const lastSlashIndex = path.lastIndexOf('/');

    if (lastSlashIndex === -1) {
      return URI.file('/');
    }

    return URI.file(path.substring(0, lastSlashIndex));
  },

  /**
   * Junta um URI base com um caminho relativo
   */
  joinPath(base: URI, ...pathSegments: string[]): URI {
    const basePath = URI.fsPath(base);
    const joinedPath = [basePath, ...pathSegments].join('/');

    // Normaliza caminhos com múltiplas barras
    return URI.file(joinedPath.replace(/\/+/g, '/'));
  },

  /**
   * Verifica se dois URIs são iguais
   */
  equals(a: URI, b: URI): boolean {
    return URI.fsPath(a) === URI.fsPath(b);
  },
};
