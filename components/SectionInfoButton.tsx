import React, { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import BodyPortal from './BodyPortal';

interface SectionInfoButtonProps {
  title: string;
  description: string;
  compact?: boolean;
}

const SectionInfoButton: React.FC<SectionInfoButtonProps> = ({ title, description, compact = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePress = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node) && !popupRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsidePress);
    document.addEventListener('touchstart', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    const close = () => setIsOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsidePress);
      document.removeEventListener('touchstart', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({ top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 160)), left: Math.max(8, Math.min(rect.right - 288, window.innerWidth - 296)) });
          setIsOpen(open => !open);
        }}
        aria-label={`About ${title}`}
        aria-expanded={isOpen}
        className={`flex shrink-0 items-center justify-center transition-colors ${compact ? 'h-5 w-5 rounded-md' : 'h-9 w-9 rounded-xl border'} ${
          isOpen
            ? 'border-orange-300 bg-orange-50 text-orange-600 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-orange-300 hover:text-orange-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400'
        }`}
      >
        <Info size={compact ? 12 : 16} />
      </button>

      {isOpen && (
        <BodyPortal>
        <div
          ref={popupRef}
          role="dialog"
          aria-label={`About ${title}`}
          style={position}
          className="fixed z-[100001] max-h-[calc(100dvh-1rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800"
        >
          <h3 className="text-sm font-black text-gray-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        </BodyPortal>
      )}
    </div>
  );
};

export default SectionInfoButton;
