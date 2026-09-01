import React, { useEffect, useState } from 'react';
import { MoreVertical } from 'lucide-react';

interface TableActionMenuProps {
  label: string;
  menuHeight?: number;
  children: (close: () => void) => React.ReactNode;
}

const TableActionMenu: React.FC<TableActionMenuProps> = ({ label, menuHeight = 96, children }) => {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!position) return;

    const close = () => setPosition(null);
    document.addEventListener('click', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [position]);

  const close = () => setPosition(null);

  return (
    <>
      <button
        type="button"
        onClick={event => {
          if (position) {
            close();
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({
            top: Math.max(4, Math.min(rect.bottom + 4, window.innerHeight - menuHeight)),
            right: Math.max(4, window.innerWidth - rect.right),
          });
        }}
        aria-label={label}
        aria-expanded={Boolean(position)}
        className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
        title="Actions"
      >
        <MoreVertical size={16} />
      </button>

      {position && (
        <div
          role="menu"
          className="fixed z-[60] w-48 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 text-left shadow-xl dark:border-gray-700 dark:bg-gray-800"
          style={{ top: position.top, right: position.right }}
        >
          {children(close)}
        </div>
      )}
    </>
  );
};

export default TableActionMenu;
