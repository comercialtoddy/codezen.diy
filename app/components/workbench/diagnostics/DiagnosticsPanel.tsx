import React, { memo } from 'react';
import { classNames } from '~/utils/classNames';

export interface DiagnosticItem {
  id: string;
  filePath: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source?: string;
  code?: string;
}

export interface DiagnosticsPanelProps {
  diagnostics: DiagnosticItem[];
  onDiagnosticSelect?: (diagnostic: DiagnosticItem) => void;
  className?: string;
}

export const DiagnosticsPanel = memo(({ diagnostics, onDiagnosticSelect, className }: DiagnosticsPanelProps) => {
  const handleDiagnosticClick = (diagnostic: DiagnosticItem) => {
    if (onDiagnosticSelect) {
      onDiagnosticSelect(diagnostic);
    }
  };

  return (
    <div className={classNames('bg-bolt-elements-bg-depth-1 h-full flex flex-col', className)}>
      <div className="flex-1 overflow-auto">
        <div className="px-2 py-1">
          {diagnostics.length === 0 ? (
            <div className="text-bolt-elements-textSecondary text-sm p-2">Nenhum problema encontrado</div>
          ) : (
            <ul className="divide-y divide-bolt-elements-borderColor">
              {diagnostics.map((diagnostic) => (
                <li
                  key={diagnostic.id}
                  className="py-2 cursor-pointer hover:bg-bolt-elements-item-backgroundActive rounded"
                  onClick={() => handleDiagnosticClick(diagnostic)}
                >
                  <div className="flex items-start px-2">
                    <div className="mr-2 mt-0.5">
                      {diagnostic.severity === 'error' && (
                        <div className="i-ph:x-circle-fill text-bolt-elements-icon-error" />
                      )}
                      {diagnostic.severity === 'warning' && <div className="i-ph:warning-fill text-amber-500" />}
                      {diagnostic.severity === 'info' && (
                        <div className="i-ph:info-fill text-bolt-elements-icon-secondary" />
                      )}
                      {diagnostic.severity === 'hint' && (
                        <div className="i-ph:lightbulb-fill text-bolt-elements-icon-tertiary" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-bolt-elements-textPrimary break-all">{diagnostic.message}</div>
                      <div className="text-xs text-bolt-elements-textSecondary mt-1">
                        {diagnostic.filePath.split('/').pop()} ({diagnostic.line}:{diagnostic.column})
                        {diagnostic.code && (
                          <span className="ml-2 text-bolt-elements-textTertiary">[{diagnostic.code}]</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
});
