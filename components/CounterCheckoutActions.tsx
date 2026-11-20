import React from 'react';

interface Props {
  canSaveBill: boolean;
  disabled: boolean;
  paymentLabel: string;
  onSaveBill: () => void;
  onPayment: () => void;
}

export default function CounterCheckoutActions({ canSaveBill, disabled, paymentLabel, onSaveBill, onPayment }: Props) {
  return (
    <div className={`counter-checkout-actions w-full ${canSaveBill ? 'has-save-bill' : ''}`}>
      <div className="counter-save-slot" aria-hidden={!canSaveBill} inert={!canSaveBill}>
        <button type="button" onClick={onSaveBill} disabled={disabled || !canSaveBill} tabIndex={canSaveBill ? 0 : -1} className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-gray-300 bg-white px-3 py-4 text-[10px] font-black uppercase tracking-widest text-gray-700 transition hover:border-orange-400 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
          Save Bill
        </button>
      </div>
      <button type="button" onClick={onPayment} disabled={disabled} className="flex min-w-0 items-center justify-center whitespace-nowrap rounded-xl bg-orange-500 px-3 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-orange-500/15 transition hover:bg-orange-600 disabled:opacity-50 disabled:shadow-none">
        {paymentLabel}
      </button>
    </div>
  );
}
