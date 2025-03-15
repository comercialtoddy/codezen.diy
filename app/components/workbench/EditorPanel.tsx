import { useStore } from '@nanostores/react';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  CodeMirrorEditor,
  type EditorDocument,
  type EditorSettings,
  type OnChangeCallback as OnEditorChange,
  type OnSaveCallback as OnEditorSave,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import type { FileMap } from '~/lib/stores/files';
import type { FileHistory } from '~/types/actions';
import { themeStore } from '~/lib/stores/theme';
import { WORK_DIR } from '~/utils/constants';
import { renderLogger } from '~/utils/logger';
import { isMobile } from '~/utils/mobile';
import { FileBreadcrumb } from './FileBreadcrumb';
import { FileTree } from './FileTree';
import { DEFAULT_TERMINAL_SIZE, TerminalTabs } from './terminal/TerminalTabs';
import { workbenchStore } from '~/lib/stores/workbench';
import { diagnosticsStore } from '~/lib/stores/diagnostics';
import type { DiagnosticItem } from './diagnostics/DiagnosticsPanel';
import { diagnosticDecorationService } from '~/lib/diagnostics';
import { diagnosticService, DiagnosticSource } from '~/lib/diagnostics';

interface EditorPanelProps {
  files?: FileMap;
  unsavedFiles?: Set<string>;
  editorDocument?: EditorDocument;
  selectedFile?: string | undefined;
  isStreaming?: boolean;
  fileHistory?: Record<string, FileHistory>;
  onEditorChange?: OnEditorChange;
  onEditorScroll?: OnEditorScroll;
  onFileSelect?: (value?: string) => void;
  onFileSave?: OnEditorSave;
  onFileReset?: () => void;
}

const DEFAULT_EDITOR_SIZE = 100 - DEFAULT_TERMINAL_SIZE;

const editorSettings: EditorSettings = { tabSize: 2 };

export const EditorPanel = memo(
  ({
    files,
    unsavedFiles,
    editorDocument,
    selectedFile,
    isStreaming,
    fileHistory,
    onFileSelect,
    onEditorChange,
    onEditorScroll,
    onFileSave,
    onFileReset,
  }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    const theme = useStore(themeStore);
    const showTerminal = useStore(workbenchStore.showTerminal);
    const allDiagnostics = useStore(diagnosticsStore.diagnostics);

    const activeFileSegments = useMemo(() => {
      if (!editorDocument) {
        return undefined;
      }

      return editorDocument.filePath.split('/');
    }, [editorDocument]);

    const activeFileUnsaved = useMemo(() => {
      return editorDocument !== undefined && unsavedFiles?.has(editorDocument.filePath);
    }, [editorDocument, unsavedFiles]);

    const activeFileDiagnostics = useMemo(() => {
      if (!editorDocument) {
        return [];
      }

      return allDiagnostics[editorDocument.filePath] || [];
    }, [editorDocument, allDiagnostics]);

    // Adicionar um ref para registrar o renderizador de diagnósticos
    const editorRef = useRef<string | null>(null);

    useEffect(() => {
      // Registrar um ID único para o editor
      if (!editorRef.current) {
        editorRef.current = `editor-${Date.now()}`;
      }

      // Retornar função de limpeza para desregistrar o renderizador quando o componente é desmontado
      return () => {
        if (editorRef.current) {
          diagnosticDecorationService.unregisterRenderer(editorRef.current);
        }
      };
    }, []);

    /*
     * Integração com o sistema de diagnósticos
     */
    useEffect(() => {
      if (!editorDocument || isStreaming) {
        return;
      }

      // Criar renderizador para o editor atual
      if (editorRef.current) {
        diagnosticDecorationService.createCodeMirrorRenderer(editorRef.current, editorDocument.filePath, {
          showInline: true,
          showGutter: true,
          showUnderline: true,
        });
      }

      // Limpar diagnósticos antigos
      diagnosticsStore.clearDiagnostics(editorDocument.filePath);

      // Obter o arquivo original
      const originalFile = files && files[editorDocument.filePath];
      const originalContent = originalFile && 'content' in originalFile ? originalFile.content : undefined;

      // Atualizar contexto de arquivo no serviço de diagnóstico
      if (originalContent) {
        diagnosticService.updateFileContext(editorDocument.filePath, editorDocument.value, originalContent);

        // Analisar alterações para diagnósticos contextuais
        const changeDiagnostics = diagnosticService.analyzeChanges(editorDocument.filePath, editorDocument.value);

        // Adicionar diagnósticos baseados em alterações
        changeDiagnostics.forEach((diagnostic) => {
          diagnosticService.addDiagnostic(diagnostic);
        });
      }

      /*
       * Verificação básica de sintaxe para qualquer arquivo
       * usado como fallback enquanto o indexador não processa o arquivo
       */
      const basicSyntaxCheck = (content: string, filePath: string): DiagnosticItem[] => {
        const lines = content.split('\n');
        const diagnostics: DiagnosticItem[] = [];

        lines.forEach((line, index) => {
          // Verificar parênteses não fechados
          const openParens = (line.match(/\(/g) || []).length;
          const closeParens = (line.match(/\)/g) || []).length;

          if (openParens !== closeParens) {
            diagnostics.push({
              id: `syntax-error-${filePath}-${index}-parens`,
              filePath,
              line: index + 1,
              column: line.indexOf('(') + 1 || 1,
              message: 'Parênteses não estão balanceados nesta linha',
              severity: 'error',
              source: DiagnosticSource.Syntax,
            });
          }

          // Verificar chaves não fechadas
          const openCurly = (line.match(/\{/g) || []).length;
          const closeCurly = (line.match(/\}/g) || []).length;

          if (openCurly !== closeCurly) {
            diagnostics.push({
              id: `syntax-error-${filePath}-${index}-curly`,
              filePath,
              line: index + 1,
              column: line.indexOf('{') + 1 || 1,
              message: 'Chaves não estão balanceadas nesta linha',
              severity: 'error',
              source: DiagnosticSource.Syntax,
            });
          }

          // Verificar ponto-e-vírgula faltando em JS/TS
          if (/^.*\b(const|let|var).*=.*[^;,){]$/.test(line)) {
            diagnostics.push({
              id: `syntax-error-${filePath}-${index}-semicolon`,
              filePath,
              line: index + 1,
              column: line.length,
              message: 'Ponto-e-vírgula (;) faltando',
              severity: 'warning',
              source: DiagnosticSource.Syntax,
            });
          }
        });

        return diagnostics;
      };

      // Use o sistema de diagnósticos para análise rápida
      if (editorDocument.filePath.match(/\.(js|jsx|ts|tsx)$/)) {
        const diagnostics = basicSyntaxCheck(editorDocument.value, editorDocument.filePath);

        // Adicionar os diagnósticos através do serviço
        diagnostics.forEach((diagnostic) => {
          // Usar a versão mais avançada do sistema
          diagnosticService.addDiagnostic({
            id: diagnostic.id,
            filePath: diagnostic.filePath,
            line: diagnostic.line,
            column: diagnostic.column,
            message: diagnostic.message,
            severity: diagnostic.severity,
            source: diagnostic.source,
            code: diagnostic.code,
          });
        });
      }
    }, [editorDocument, isStreaming, files]);

    const handleToggleDiagnostics = () => {
      diagnosticsStore.toggleDiagnosticsPanel();
      workbenchStore.toggleTerminal(true);
    };

    return (
      <PanelGroup direction="vertical">
        <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
          <PanelGroup direction="horizontal">
            <Panel defaultSize={20} minSize={10} collapsible>
              <div className="flex flex-col border-r border-bolt-elements-borderColor h-full">
                <PanelHeader>
                  <div className="i-ph:tree-structure-duotone shrink-0" />
                  Files
                </PanelHeader>
                <FileTree
                  className="h-full"
                  files={files}
                  hideRoot
                  unsavedFiles={unsavedFiles}
                  fileHistory={fileHistory}
                  rootFolder={WORK_DIR}
                  selectedFile={selectedFile}
                  onFileSelect={onFileSelect}
                />
              </div>
            </Panel>
            <PanelResizeHandle />
            <Panel className="flex flex-col" defaultSize={80} minSize={20}>
              <PanelHeader className="overflow-x-auto">
                {activeFileSegments?.length && (
                  <div className="flex items-center flex-1 text-sm">
                    <FileBreadcrumb pathSegments={activeFileSegments} files={files} onFileSelect={onFileSelect} />
                    <div className="flex gap-1 ml-auto">
                      {activeFileDiagnostics.length > 0 && (
                        <PanelHeaderButton onClick={handleToggleDiagnostics} className="mr-2">
                          <div className="i-ph:bug-beetle-duotone" />
                          {activeFileDiagnostics.filter((d) => d.severity === 'error').length > 0 ? (
                            <span className="text-bolt-elements-icon-error">
                              {activeFileDiagnostics.filter((d) => d.severity === 'error').length}
                            </span>
                          ) : activeFileDiagnostics.filter((d) => d.severity === 'warning').length > 0 ? (
                            <span className="text-amber-500">
                              {activeFileDiagnostics.filter((d) => d.severity === 'warning').length}
                            </span>
                          ) : (
                            <span></span>
                          )}
                        </PanelHeaderButton>
                      )}
                      {activeFileUnsaved && (
                        <>
                          <PanelHeaderButton onClick={onFileSave}>
                            <div className="i-ph:floppy-disk-duotone" />
                            Save
                          </PanelHeaderButton>
                          <PanelHeaderButton onClick={onFileReset}>
                            <div className="i-ph:clock-counter-clockwise-duotone" />
                            Reset
                          </PanelHeaderButton>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </PanelHeader>
              <div className="h-full flex-1 overflow-hidden">
                <CodeMirrorEditor
                  theme={theme}
                  editable={!isStreaming && editorDocument !== undefined}
                  settings={editorSettings}
                  doc={editorDocument}
                  autoFocusOnDocumentChange={!isMobile()}
                  onScroll={onEditorScroll}
                  onChange={onEditorChange}
                  onSave={onFileSave}
                />
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle />
        <TerminalTabs />
      </PanelGroup>
    );
  },
);
