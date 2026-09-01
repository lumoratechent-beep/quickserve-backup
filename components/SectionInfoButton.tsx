import React, { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

interface SectionInfoButtonProps {
  title: string;
  description: string;
}

const SectionInfoButton: React.FC<SectionInfoButtonProps> = ({ title, description }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePress = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsidePress);
    document.addEventListener('touchstart', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsidePress);
      document.removeEventListener('touchstart', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-label={`About ${title}`}
        aria-expanded={isOpen}
        className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
          isOpen
            ? 'border-orange-300 bg-orange-50 text-orange-600 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-orange-300 hover:text-orange-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400'
        }`}
      >
        <Info size={16} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={`About ${title}`}
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800"
        >
          <h3 className="text-sm font-black text-gray-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      )}
    </div>
  );
};

export default SectionInfoButton;
