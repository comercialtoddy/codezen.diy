import { useStore } from '@nanostores/react';
import { memo, useEffect, useMemo } from 'react';
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

    /*
     * Exemplo de como poderia detectar erros de sintaxe
     * Na prática, isso seria integrado a um linter real como ESLint
     */
    useEffect(() => {
      if (!editorDocument || isStreaming) {
        return;
      }

      /*
       * Quando o documento muda, a atualização já é detectada pela FilesStore
       * Não precisamos chamar explicitamente workspaceIndexService.queueFileForIndexing
       * porque o serviço já está observando mudanças na FilesStore
       */

      // A detecção básica de sintaxe é mantida como fallback enquanto o indexador ainda não concluiu
      const detectJSErrors = (content: string, filePath: string) => {
        // Procurar por possíveis erros comuns de sintaxe
        const lines = content.split('\n');
        const diagnostics: DiagnosticItem[] = [];

        lines.forEach((line, index) => {
          // Exemplo: verificar parênteses não fechados
          const openParens = (line.match(/\(/g) || []).length;
          const closeParens = (line.match(/\)/g) || []).length;

          if (openParens !== closeParens) {
            diagnostics.push({
              id: `syntax-error-${filePath}-${index}`,
              filePath,
              line: index + 1,
              column: line.indexOf('(') + 1 || 1,
              message: 'Parênteses não estão balanceados nesta linha',
              severity: 'error',
              source: 'syntax-checker',
            });
          }

          // Exemplo: verificar ponto-e-vírgula faltando em JS/TS
          if (/^.*\b(const|let|var).*=.*[^;,){]$/.test(line)) {
            diagnostics.push({
              id: `syntax-error-${filePath}-${index}-semicolon`,
              filePath,
              line: index + 1,
              column: line.length,
              message: 'Ponto-e-vírgula (;) faltando',
              severity: 'warning',
              source: 'syntax-checker',
            });
          }
        });

        return diagnostics;
      };

      // Apenas para fins de demo, detecte erros apenas em arquivos JS/TS
      if (editorDocument.filePath.match(/\.(js|jsx|ts|tsx)$/)) {
        const diagnostics = detectJSErrors(editorDocument.value, editorDocument.filePath);

        // Limpar diagnósticos anteriores
        diagnosticsStore.clearDiagnostics(editorDocument.filePath);

        // Adicionar novos diagnósticos
        diagnostics.forEach((diagnostic) => {
          diagnosticsStore.addDiagnostic(diagnostic);
        });
      }
    }, [editorDocument, isStreaming]);

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
