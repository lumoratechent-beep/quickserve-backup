import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import BodyPortal from './BodyPortal';

interface TableActionMenuProps {
  label: string;
  menuHeight?: number;
  trigger?: React.ReactNode;
  triggerClassName?: string;
  children: (close: () => void) => React.ReactNode;
}

const TableActionMenu: React.FC<TableActionMenuProps> = ({ label, menuHeight = 96, trigger, triggerClassName, children }) => {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOpen = position !== null;

  useEffect(() => {
    if (!isOpen) return;

    const close = () => setPosition(null);
    const outside = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); triggerRef.current?.focus(); }
    };
    const scroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
        close();
        return;
      }
      setPosition({
        top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8)),
        right: Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - 200)),
      });
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [isOpen, menuHeight]);

  const close = () => setPosition(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={event => {
          event.stopPropagation();
          if (position) {
            close();
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({
            top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8)),
            right: Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - 200)),
          });
        }}
        aria-label={label}
        aria-expanded={Boolean(position)}
        aria-haspopup="menu"
        className={triggerClassName || 'rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white'}
        title={trigger ? label : 'Actions'}
      >
        {trigger || <MoreVertical size={16} />}
      </button>

      {position && (
        <BodyPortal>
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onClick={event => event.stopPropagation()}
          className="fixed z-[100001] max-h-[calc(100dvh-1rem)] w-48 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 text-left shadow-xl dark:border-gray-700 dark:bg-gray-800"
          style={{ top: position.top, right: position.right }}
        >
          {children(close)}
        </div>
        </BodyPortal>
      )}
    </>
  );
};

export default TableActionMenu;
