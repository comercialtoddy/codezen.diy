import React, { memo } from 'react';
import { diagnosticsStore } from '~/lib/stores/diagnostics';
import { classNames } from '~/utils/classNames';

interface DiagnosticsTabProps {
  active: boolean;
  onClick: () => void;
}

export const DiagnosticsTab = memo(({ active, onClick }: DiagnosticsTabProps) => {
  const errorCount = diagnosticsStore.countDiagnostics('error');
  const warningCount = diagnosticsStore.countDiagnostics('warning');

  return (
    <button
      className={classNames(
        'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
        {
          'bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary': active,
          'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-terminals-buttonBackground':
            !active,
        },
      )}
      onClick={onClick}
    >
      <div className="i-ph:bug-beetle-duotone text-lg" />
      Problemas
      {(errorCount > 0 || warningCount > 0) && (
        <div className="flex space-x-1 ml-1">
          {errorCount > 0 && (
            <div className="flex items-center">
              <div className="i-ph:x-circle-fill text-bolt-elements-icon-error text-sm mr-0.5" />
              <span>{errorCount}</span>
            </div>
          )}
          {warningCount > 0 && (
            <div className="flex items-center">
              <div className="i-ph:warning-fill text-amber-500 text-sm mr-0.5" />
              <span>{warningCount}</span>
            </div>
          )}
        </div>
      )}
    </button>
  );
});
