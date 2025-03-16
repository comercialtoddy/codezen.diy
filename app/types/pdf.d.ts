declare module 'pdfjs-dist/build/pdf.worker.mjs' {
  const worker: any;
  export default worker;
}

// Adicionar suporte para importação do CDN
declare module 'https://cdn.jsdelivr.net/npm/pdfjs-dist@latest/+esm' {
  export const getDocument: any;
  export const globalWorkerOptions: any;
  export const version: string;
  export const pdfDataRangeTransport: any;
  export const annotationMode: any;
  export const permissionFlag: any;
}

declare module 'https://cdn.jsdelivr.net/npm/pdfjs-dist@*/+esm' {
  export const getDocument: any;
  export const globalWorkerOptions: any;
  export const version: string;
  export const pdfDataRangeTransport: any;
  export const annotationMode: any;
  export const permissionFlag: any;
}

// Para caminhos específicos do worker
declare module 'https://cdn.jsdelivr.net/npm/pdfjs-dist@*/build/pdf.worker.*' {
  const worker: any;
  export default worker;
}

// Adicionar a interface do PDF.js ao objeto Window
interface Window {
  pdfjsLib?: {
    getDocument: any;
    globalWorkerOptions: any;
    version: string;
  };
}
