import React from 'react';

interface CancellationReasonQuickSelectProps {
  reasons: readonly string[];
  selectedReason?: string;
  onChange: (reason?: string) => void;
  disabled?: boolean;
}

const CancellationReasonQuickSelect: React.FC<CancellationReasonQuickSelectProps> = ({
  reasons,
  selectedReason,
  onChange,
  disabled = false,
}) => (
  <div className="flex flex-wrap gap-2" role="group" aria-label="Quick cancellation reasons">
    {reasons.map(reason => {
      const isSelected = selectedReason === reason;
      return (
        <button
          key={reason}
          type="button"
          disabled={disabled}
          aria-pressed={isSelected}
          onClick={() => onChange(isSelected ? undefined : reason)}
          className={`rounded-full border px-3 py-2 text-[11px] font-bold transition-colors disabled:cursor-wait disabled:opacity-60 ${
            isSelected
              ? 'border-red-500 bg-red-500 text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-red-700 dark:hover:bg-red-900/20 dark:hover:text-red-300'
          }`}
        >
          {reason}
        </button>
      );
    })}
  </div>
);

export default CancellationReasonQuickSelect;
