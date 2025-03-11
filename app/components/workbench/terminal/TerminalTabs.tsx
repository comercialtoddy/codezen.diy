import { useStore } from '@nanostores/react';
import React, { memo, useEffect, useRef, useState } from 'react';
import { Panel, type ImperativePanelHandle } from 'react-resizable-panels';
import { IconButton } from '~/components/ui/IconButton';
import { shortcutEventEmitter } from '~/lib/hooks';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { Terminal, type TerminalRef } from './Terminal';
import { createScopedLogger } from '~/utils/logger';
import { DiagnosticsTab } from '~/components/workbench/diagnostics/DiagnosticsTab';
import { DiagnosticsPanel } from '~/components/workbench/diagnostics/DiagnosticsPanel';
import { diagnosticsStore } from '~/lib/stores/diagnostics';
import { DependencyGraph } from '~/components/workbench/dependencyGraph/DependencyGraph';

const logger = createScopedLogger('Terminal');

const MAX_TERMINALS = 3;
export const DEFAULT_TERMINAL_SIZE = 25;

// Tab types
type TabType = 'diagnostics' | 'terminal' | 'dependency-graph';

export const TerminalTabs = memo(() => {
  const showTerminal = useStore(workbenchStore.showTerminal);
  const theme = useStore(themeStore);
  const allDiagnostics = useStore(diagnosticsStore.diagnostics);
  const selectedFile = useStore(workbenchStore.selectedFile);

  const terminalRefs = useRef<Array<TerminalRef | null>>([]);
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalToggledByShortcut = useRef(false);

  const [activeTerminal, setActiveTerminal] = useState(0);
  const [terminalCount, setTerminalCount] = useState(1);
  const [activeTab, setActiveTab] = useState<TabType>('terminal');

  const addTerminal = () => {
    if (terminalCount < MAX_TERMINALS) {
      setTerminalCount(terminalCount + 1);
      setActiveTerminal(terminalCount);
      setActiveTab('terminal');
    }
  };

  const handleDiagnosticsTabClick = () => {
    setActiveTab('diagnostics');
    diagnosticsStore.toggleDiagnosticsPanel(true);

    // Make sure terminal panel is expanded if it's collapsed
    if (terminalPanelRef.current?.isCollapsed()) {
      workbenchStore.toggleTerminal(true);
    }
  };

  const handleDependencyGraphTabClick = () => {
    setActiveTab('dependency-graph');

    // Make sure terminal panel is expanded if it's collapsed
    if (terminalPanelRef.current?.isCollapsed()) {
      workbenchStore.toggleTerminal(true);
    }
  };

  const handleTerminalTabClick = (index: number) => {
    setActiveTerminal(index);
    setActiveTab('terminal');
  };

  const handleDiagnosticSelect = (diagnostic: any) => {
    // Implementar a seleção de um item de diagnóstico (por exemplo, ir para o local do arquivo)
    if (diagnostic.filePath) {
      workbenchStore.setSelectedFile(diagnostic.filePath);

      /*
       * Como a navegação para linha/coluna específica não está implementada,
       * apenas selecionamos o arquivo por enquanto
       */
      logger.debug(`Diagnostic selected: ${diagnostic.filePath} (${diagnostic.line}:${diagnostic.column})`);
    }
  };

  const handleFileSelect = (filePath: string) => {
    workbenchStore.setSelectedFile(filePath);
  };

  useEffect(() => {
    const { current: terminal } = terminalPanelRef;

    if (!terminal) {
      return;
    }

    const isCollapsed = terminal.isCollapsed();

    if (!showTerminal && !isCollapsed) {
      terminal.collapse();
    } else if (showTerminal && isCollapsed) {
      terminal.resize(DEFAULT_TERMINAL_SIZE);
    }

    terminalToggledByShortcut.current = false;
  }, [showTerminal]);

  useEffect(() => {
    const unsubscribeFromEventEmitter = shortcutEventEmitter.on('toggleTerminal', () => {
      terminalToggledByShortcut.current = true;
    });

    const unsubscribeFromThemeStore = themeStore.subscribe(() => {
      for (const ref of Object.values(terminalRefs.current)) {
        ref?.reloadStyles();
      }
    });

    return () => {
      unsubscribeFromEventEmitter();
      unsubscribeFromThemeStore();
    };
  }, []);

  // Flatten diagnostics for the panel
  const diagnosticsList = Object.values(allDiagnostics).flat();

  return (
    <Panel
      ref={terminalPanelRef}
      defaultSize={showTerminal ? DEFAULT_TERMINAL_SIZE : 0}
      minSize={10}
      collapsible
      onExpand={() => {
        if (!terminalToggledByShortcut.current) {
          workbenchStore.toggleTerminal(true);
        }
      }}
      onCollapse={() => {
        if (!terminalToggledByShortcut.current) {
          workbenchStore.toggleTerminal(false);
        }
      }}
    >
      <div className="h-full">
        <div className="bg-bolt-elements-terminals-background h-full flex flex-col">
          <div className="flex items-center bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor gap-1.5 min-h-[34px] p-2">
            {/* Diagnostics Tab */}
            <DiagnosticsTab active={activeTab === 'diagnostics'} onClick={handleDiagnosticsTabClick} />

            {/* Dependency Graph Tab */}
            <button
              className={classNames(
                'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                {
                  'bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary':
                    activeTab === 'dependency-graph',
                  'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-terminals-buttonBackground':
                    activeTab !== 'dependency-graph',
                },
              )}
              onClick={handleDependencyGraphTabClick}
            >
              <div className="i-ph:graph-duotone text-lg" />
              Dependências
            </button>

            {/* Terminal Tabs */}
            <button
              className={classNames(
                'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                {
                  'bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary':
                    activeTab === 'terminal' && activeTerminal === 0,
                  'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-terminals-buttonBackground':
                    activeTab !== 'terminal' || activeTerminal !== 0,
                },
              )}
              onClick={() => handleTerminalTabClick(0)}
            >
              <div className="i-ph:terminal-window-duotone text-lg" />
              Bolt Terminal
            </button>

            {Array.from({ length: terminalCount }, (_, index) => {
              const terminalIndex = index + 1;
              const isActive = activeTab === 'terminal' && activeTerminal === terminalIndex;

              return (
                <button
                  key={terminalIndex}
                  className={classNames(
                    'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                    {
                      'bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary': isActive,
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-terminals-buttonBackground':
                        !isActive,
                    },
                  )}
                  onClick={() => handleTerminalTabClick(terminalIndex)}
                >
                  <div className="i-ph:terminal-window-duotone text-lg" />
                  Terminal {terminalCount > 1 && terminalIndex}
                </button>
              );
            })}

            {terminalCount < MAX_TERMINALS && <IconButton icon="i-ph:plus" size="md" onClick={addTerminal} />}
            <IconButton
              className="ml-auto"
              icon="i-ph:caret-down"
              title="Close"
              size="md"
              onClick={() => workbenchStore.toggleTerminal(false)}
            />
          </div>

          {/* Diagnostics Panel */}
          <div className={classNames('h-full overflow-hidden', { hidden: activeTab !== 'diagnostics' })}>
            <DiagnosticsPanel diagnostics={diagnosticsList} onDiagnosticSelect={handleDiagnosticSelect} />
          </div>

          {/* Dependency Graph Panel */}
          <div className={classNames('h-full overflow-hidden', { hidden: activeTab !== 'dependency-graph' })}>
            <DependencyGraph filePath={selectedFile} onFileSelect={handleFileSelect} />
          </div>

          {/* Terminal Panels */}
          <Terminal
            key="bolt_terminal"
            id="terminal_bolt"
            className={classNames('h-full overflow-hidden', {
              hidden: activeTab !== 'terminal' || activeTerminal !== 0,
            })}
            ref={(ref) => {
              terminalRefs.current[0] = ref;
            }}
            onTerminalReady={(terminal) => workbenchStore.attachBoltTerminal(terminal)}
            onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
            theme={theme}
          />

          {Array.from({ length: terminalCount }, (_, index) => {
            const terminalIndex = index + 1;
            const isActive = activeTab === 'terminal' && activeTerminal === terminalIndex;

            return (
              <Terminal
                key={`terminal_${terminalIndex}`}
                id={`terminal_${terminalIndex}`}
                className={classNames('h-full overflow-hidden', {
                  hidden: !isActive,
                })}
                ref={(ref) => {
                  terminalRefs.current[terminalIndex] = ref;
                }}
                onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminal)}
                onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                theme={theme}
              />
            );
          })}
        </div>
      </div>
    </Panel>
  );
});
