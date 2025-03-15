import React, { useState, useRef, useEffect } from 'react';
import { classNames } from '~/utils/classNames';
import { type DiagnosticItem } from './DiagnosticsPanel';
import { type CodeAction } from '~/lib/diagnostics/types';
import { diagnosticService } from '~/lib/diagnostics/DiagnosticService';

interface QuickFixMenuProps {
  diagnostic: DiagnosticItem;
  position: { x: number; y: number };
  onActionSelect: (action: CodeAction) => void;
  onClose: () => void;
  className?: string;
}

export function QuickFixMenu({ diagnostic, position, onActionSelect, onClose, className }: QuickFixMenuProps) {
  const [actions, setActions] = useState<CodeAction[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Buscar ações disponíveis para o diagnóstico
  useEffect(() => {
    const availableActions = diagnosticService.getCodeActions(diagnostic.id);
    setActions(availableActions);
  }, [diagnostic.id]);

  // Manipuladores de teclado para navegação no menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prevIndex) => (prevIndex + 1) % actions.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prevIndex) => (prevIndex - 1 + actions.length) % actions.length);
          break;
        case 'Enter':
          e.preventDefault();

          if (actions[selectedIndex]) {
            onActionSelect(actions[selectedIndex]);
          }

          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [actions, selectedIndex, onActionSelect, onClose]);

  // Fechar quando clica fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Animação para entrada do menu
  useEffect(() => {
    if (menuRef.current) {
      menuRef.current.classList.add('dropdown-animation');
    }
  }, []);

  return (
    <div
      ref={menuRef}
      className={classNames(
        'absolute z-50 bg-bolt-elements-background-depth-2 rounded shadow-lg border border-bolt-elements-borderColor',
        'p-1 min-w-[200px] max-w-[300px]',
        className,
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {actions.length === 0 ? (
        <div className="text-sm text-bolt-elements-textSecondary p-2">Nenhuma ação disponível</div>
      ) : (
        <ul>
          {actions.map((action, index) => (
            <li
              key={`${action.kind}-${index}`}
              className={classNames(
                'cursor-pointer text-sm px-3 py-2 rounded flex items-center',
                index === selectedIndex
                  ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary'
                  : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundHover',
              )}
              onClick={() => {
                onActionSelect(action);
                onClose();
              }}
            >
              {action.isPreferred && <div className="i-ph:lightbulb-fill text-amber-500 mr-2" />}
              <div>
                <div>{action.title}</div>
                {action.kind === 'quickfix' && (
                  <div className="text-xs text-bolt-elements-textTertiary">Correção rápida</div>
                )}
                {action.kind === 'refactor' && (
                  <div className="text-xs text-bolt-elements-textTertiary">Refatoração</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default QuickFixMenu;
