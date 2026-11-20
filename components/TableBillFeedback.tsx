import React from 'react';
import { ReceiptText, X } from 'lucide-react';

export const TABLE_BILL_FEEDBACK_DURATION = 4200;

interface Props {
  saving: boolean;
  success: { id: number; table: string } | null;
  onDismiss: () => void;
}

export default function TableBillFeedback({ saving, success, onDismiss }: Props) {
  return (
    <>
      {saving && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/20 p-5 backdrop-blur-sm" role="status" aria-label="Saving table bill" aria-busy="true">
          <div className="table-bill-saving-card flex w-full max-w-[300px] items-center gap-4 rounded-2xl border border-white/60 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500 dark:bg-orange-500/10" aria-hidden="true">
              <span className="table-bill-saving-orbit absolute -inset-1 rounded-full border border-dashed border-orange-300 dark:border-orange-700" />
              <ReceiptText size={24} strokeWidth={1.6} className="table-bill-saving-receipt" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Saving table bill...</p>
              <div className="table-bill-saving-track mt-2 h-0.5 overflow-hidden rounded-full bg-orange-100 dark:bg-orange-950" aria-hidden="true"><span className="block h-full w-1/2 rounded-full bg-orange-500" /></div>
            </div>
          </div>
        </div>
      )}
      {success && (
        <div key={success.id} role="status" aria-live="polite" aria-atomic="true" className="table-bill-success fixed z-[100100] overflow-hidden rounded-2xl border border-emerald-200 bg-white text-slate-900 shadow-lg shadow-emerald-900/10 dark:border-emerald-800 dark:bg-gray-900 dark:text-white" style={{ '--bill-feedback-duration': `${TABLE_BILL_FEEDBACK_DURATION}ms` } as React.CSSProperties}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50 via-transparent to-teal-50/70 dark:from-emerald-950/60 dark:to-teal-950/30" aria-hidden="true" />
          <div className="relative flex items-center gap-3 p-3 pr-12">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden="true">
              <span className="table-bill-success-ring absolute inset-0 rounded-full border-2 border-emerald-400" />
              <span className="table-bill-success-check flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/25">
                <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none"><path className="table-bill-check-stroke" d="m8 16 5.5 5.5L24 11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              {Array.from({ length: 6 }, (_, index) => <span key={index} className="table-bill-spark absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-emerald-400" style={{ '--spark-angle': `${index * 60}deg` } as React.CSSProperties} />)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-snug">Order saved to {success.table}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">Ready for the next order.</p>
            </div>
          </div>
          <button type="button" aria-label="Dismiss table bill notification" onClick={onDismiss} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-red-700 dark:hover:bg-red-950 dark:hover:text-red-400"><X size={16} /></button>
          <div className="h-0.5 overflow-hidden bg-emerald-100 dark:bg-emerald-950" aria-hidden="true"><div className="table-bill-success-countdown h-full origin-left bg-gradient-to-r from-emerald-500 to-teal-400" /></div>
        </div>
      )}
    </>
  );
}
