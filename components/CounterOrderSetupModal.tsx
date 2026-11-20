import React, { useEffect, useRef } from 'react';
import { ArrowRight, Check, CheckCircle2, ShoppingBag, Truck, UtensilsCrossed, X } from 'lucide-react';

interface Props {
  diningOptions: string[];
  diningOption: string;
  selectedTable: string;
  tables: string[];
  pendingTables: ReadonlySet<string>;
  blockedTables?: ReadonlySet<string>;
  floorCount: number;
  selectedFloor: number;
  itemName?: string;
  onDiningChange: (option: string) => void;
  onTableChange: (table: string) => void;
  onFloorChange: (floor: number) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function CounterOrderSetupModal({
  diningOptions, diningOption, selectedTable, tables, pendingTables, blockedTables = pendingTables, floorCount,
  selectedFloor, itemName, onDiningChange, onTableChange, onFloorChange, onConfirm, onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isDineIn = diningOption === 'Dine-in';
  const displayDining = diningOption === 'Dine-in' ? 'Dine in' : diningOption === 'Takeaway' ? 'Take away' : diningOption;
  const displayTable = selectedTable === 'Counter' ? 'No table assigned' : selectedTable;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/50 backdrop-blur-[3px] sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Dining Option & Table"
        aria-describedby="counter-order-setup-description"
        tabIndex={-1}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
          if (event.key !== 'Tab') return;
          const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }}
        className="flex min-h-[min(620px,96dvh)] max-h-[96dvh] w-full max-w-[740px] flex-col overflow-hidden rounded-t-[28px] bg-white text-slate-900 shadow-2xl outline-none dark:bg-gray-900 dark:text-white sm:min-h-[min(640px,90dvh)] sm:max-h-[90dvh] sm:rounded-[24px]"
      >
        <div className="flex justify-center pt-3 sm:hidden" aria-hidden="true"><span className="h-1 w-10 rounded-full bg-slate-200 dark:bg-gray-700" /></div>
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-3 sm:px-6 sm:pt-4">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{itemName ? 'New counter order' : 'Order details'}</p>
            <h2 className="text-xl font-bold leading-tight tracking-tight sm:text-[22px]">How is this order served?</h2>
            <p id="counter-order-setup-description" className="mt-0 text-xs leading-snug text-slate-500 dark:text-slate-400">
              {itemName ? <>Choose an option to start adding <span className="font-semibold text-slate-700 dark:text-slate-200">{itemName}</span>.</> : 'Update the dining option and table for this order.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dining and table selection" className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 dark:hover:bg-gray-800"><X size={20} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 sm:px-8 sm:pb-7">
          <section aria-label="Dining option" className="pb-6">
            <p className="mb-3 text-sm font-semibold">Dining option</p>
            <div className="grid gap-2.5 sm:gap-3" style={{ gridTemplateColumns: `repeat(${diningOptions.length}, minmax(0, 1fr))` }}>
              {diningOptions.map(option => {
                const selected = diningOption === option;
                const Icon = option === 'Dine-in' ? UtensilsCrossed : option === 'Takeaway' ? ShoppingBag : Truck;
                const label = option === 'Dine-in' ? 'Dine in' : option === 'Takeaway' ? 'Take away' : option;
                const caption = option === 'Dine-in' ? 'Serve at a table' : option === 'Takeaway' ? 'Pack to go' : 'Send to customer';
                return (
                  <button type="button" key={option} aria-label={option} aria-pressed={selected} onClick={() => onDiningChange(option)}
                    className={`relative flex min-h-[110px] min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 px-2 py-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 sm:min-h-[122px] ${selected ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-300 dark:hover:bg-gray-800'}`}>
                    {selected && <CheckCircle2 size={17} className="absolute right-2 top-2 fill-orange-500 text-white" aria-hidden="true" />}
                    <Icon size={25} strokeWidth={1.7} aria-hidden="true" />
                    <span className="text-[13px] font-bold sm:text-base">{label}</span>
                    <span className="hidden text-xs font-normal text-slate-500 dark:text-slate-400 sm:block">{caption}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-label="Table selection" className="border-t border-slate-100 pt-5 dark:border-gray-800">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{isDineIn ? 'Choose a table' : 'Table selection'}</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{isDineIn ? 'Select a table or continue without one.' : `No table needed for ${displayDining.toLowerCase()}.`}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${isDineIn ? 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-slate-400' : 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300'}`}>{isDineIn ? `${tables.length} tables` : 'Not required'}</span>
            </div>
            <fieldset disabled={!isDineIn} className="min-w-0 disabled:opacity-40">
              <legend className="sr-only">Table selection</legend>
              {floorCount > 1 && <div className="mb-4 flex gap-2 overflow-x-auto">
                {Array.from({ length: floorCount }, (_, index) => index + 1).map(floor => (
                  <button type="button" key={floor} aria-pressed={selectedFloor === floor} onClick={() => onFloorChange(floor)} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-semibold ${floor === selectedFloor ? 'bg-slate-900 text-white dark:bg-white dark:text-gray-900' : 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-slate-300'}`}>Floor {floor}</button>
                ))}
              </div>}
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 sm:gap-3">
                {['Counter', ...tables].map(table => {
                  const noTable = table === 'Counter';
                  const selected = selectedTable === table;
                  const pending = !noTable && pendingTables.has(table);
                  return (
                    <button type="button" key={table} disabled={blockedTables.has(table)} aria-label={noTable ? 'No Table No table assigned' : `${table} ${pending ? 'Has pending bill' : 'Available'}`} aria-pressed={selected} onClick={() => onTableChange(table)}
                      className={`relative flex min-h-[86px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed sm:min-h-[92px] ${selected ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500 dark:bg-orange-500/10' : pending ? 'border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-900/10' : 'border-slate-200 bg-white enabled:hover:border-orange-300 enabled:hover:bg-orange-50/40 dark:border-gray-700 dark:bg-gray-900'}`}>
                      {selected && <Check size={13} strokeWidth={3} aria-hidden="true" className="absolute right-2 top-2 text-orange-600 dark:text-orange-400" />}
                      <span className={`max-w-full break-words text-center text-sm font-bold sm:text-base ${selected ? 'text-orange-700 dark:text-orange-300' : 'text-slate-700 dark:text-slate-200'}`}>{noTable ? 'No table' : table}</span>
                      <span className={`flex items-center gap-1 text-[11px] ${pending ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>{!noTable && <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${pending ? 'bg-amber-500' : 'bg-emerald-500'}`} />}{noTable ? 'Unassigned' : pending ? 'Open bill' : 'Available'}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </section>
        </div>

        <footer className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 dark:border-gray-800 dark:bg-gray-800/50 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-2.5">
          <div className="mb-2 flex min-w-0 items-center gap-2 text-xs sm:mb-0" aria-live="polite">
            <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
            <span className="font-semibold">{displayDining}</span>
            <span className="text-slate-300 dark:text-gray-600" aria-hidden="true">/</span>
            <span className="truncate text-slate-500 dark:text-slate-400">{isDineIn ? displayTable || 'Select a table' : 'No table needed'}</span>
          </div>
          <div className="flex gap-2.5 sm:shrink-0">
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-300">Cancel</button>
            <button type="button" onClick={onConfirm} disabled={isDineIn && (!selectedTable || blockedTables.has(selectedTable))} className="flex min-h-11 flex-1 items-center justify-center gap-3 rounded-xl bg-orange-500 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">
              {itemName ? 'Continue to Item' : 'Confirm Selection'}<ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
