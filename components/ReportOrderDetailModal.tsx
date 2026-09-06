import React from 'react';
import { CheckCircle2, Clock3, CreditCard, Hash, List, MessageSquare, Printer, RotateCcw, ShoppingBag, UserRound, Utensils, X } from 'lucide-react';
import type { CartItem, Order } from '../src/types';

interface Props {
  order: Order;
  currencySymbol: string;
  taxes?: Array<{ percentage: number }>;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  onReprintReceipt: () => void;
  onReprintOrder: () => void;
  onRefund: () => void;
  onCollectPayment?: () => void;
}

const money = (currency: string, value: number) => `${currency}${Number(value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const numberValue = (order: Order, keys: string[]) => {
  const source = order as Order & Record<string, unknown>;
  const key = keys.find(candidate => typeof source[candidate] === 'number');
  return key ? Number(source[key]) : undefined;
};
const cancelled = (item: CartItem) => item.status === 'CANCELLED' || Boolean(item.kitchenCancelReason || item.cancelledAt);

const ItemDetails = ({ item, currencySymbol }: { item: CartItem; currencySymbol: string }) => {
  const details: string[] = [];
  if (item.selectedSize) details.push(item.selectedSize);
  if (item.selectedTemp) details.push(item.selectedTemp);
  if (item.selectedVariantOption) details.push(item.selectedVariantOption);
  if (item.selectedOtherVariant) details.push(item.selectedOtherVariant);
  Object.values(item.selectedModifiers || {}).forEach(value => value && details.push(value));
  const isCancelled = cancelled(item);
  const lineTotal = isCancelled ? 0 : item.price * item.quantity;
  return (
    <article className={`rounded-lg border p-2 ${isCancelled ? 'border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-900/10' : 'border-gray-200 bg-gray-50/70 dark:border-gray-700 dark:bg-gray-700/20'}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-black ${isCancelled ? 'bg-red-100 text-red-500 dark:bg-red-900/30' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'}`}>{item.quantity}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className={`text-xs font-black ${isCancelled ? 'text-red-500 line-through' : 'text-gray-900 dark:text-white'}`}>{item.name}</p>
            <p className={`shrink-0 text-xs font-black ${isCancelled ? 'text-red-500 line-through' : 'text-gray-900 dark:text-white'}`}>{money(currencySymbol, lineTotal)}</p>
          </div>
          {details.length > 0 && <p className="mt-1 text-[10px] font-bold uppercase text-gray-600 dark:text-gray-300">{details.join(', ').toUpperCase()}</p>}
          {item.selectedAddOns?.length ? <p className="mt-0.5 text-[10px] font-bold uppercase text-gray-600 dark:text-gray-300">{item.selectedAddOns.map(addOn => `+ ${addOn.name}${addOn.quantity > 1 ? ` X${addOn.quantity}` : ''} ${money(currencySymbol, addOn.price * addOn.quantity)}`).join(', ').toUpperCase()}</p> : null}
          {item.selectedMixMatch?.length ? <p className="mt-0.5 text-[10px] font-bold uppercase text-gray-600 dark:text-gray-300"><span className="font-bold">MIX & MATCH:</span> {item.selectedMixMatch.map(selection => `${selection.label}: ${selection.choice}`).join(', ').toUpperCase()}</p> : null}
          {item.remark && <p className="mt-0.5 text-[10px] italic text-gray-500 dark:text-gray-400">Remark: {item.remark}</p>}
          {isCancelled && <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-wider text-red-600 dark:text-red-400"><span className="rounded-full bg-red-100 px-1.5 py-0.5 dark:bg-red-900/30">Cancelled</span>{item.kitchenCancelReason && <span>{item.kitchenCancelReason}</span>}</div>}
        </div>
      </div>
    </article>
  );
};

const ReportOrderDetailModal: React.FC<Props> = ({ order, currencySymbol, taxes = [], loading, error, onRetry, onClose, onReprintReceipt, onReprintOrder, onRefund, onCollectPayment }) => {
  const storedSubtotal = numberValue(order, ['subtotal', 'subTotal', 'subtotalAmount']);
  const storedDiscount = numberValue(order, ['discountAmount', 'discount', 'discount_total']);
  const storedTax = numberValue(order, ['taxAmount', 'tax', 'tax_total']);
  const storedServiceCharge = numberValue(order, ['serviceCharge', 'service_charge', 'serviceChargeAmount']);
  const storedRefund = numberValue(order, ['refundedAmount', 'refundAmount', 'refund_total']);
  const itemSubtotal = order.items.reduce((sum, item) => cancelled(item) ? sum : sum + item.price * item.quantity, 0);
  const itemDiscount = order.items.reduce((sum, item) => cancelled(item) ? sum : sum + Math.max(0, (item.originalPrice || item.price) - item.price) * item.quantity, 0);
  const subtotal = storedSubtotal ?? itemSubtotal + (storedDiscount ?? itemDiscount);
  const discount = storedDiscount ?? itemDiscount;
  const tax = storedTax ?? taxes.reduce((sum, entry) => sum + (itemSubtotal * entry.percentage) / 100, 0);
  const serviceCharge = storedServiceCharge ?? 0;
  const amountReceived = numberValue(order, ['amountReceived', 'receivedAmount']);
  const change = numberValue(order, ['changeAmount', 'change']);
  const hasRefund = storedRefund != null || Boolean((order as any).refundStatus || (order as any).refundedAt || order.status === 'CANCELLED');
  const date = new Date(order.timestamp);
  const statusLabel = order.status === 'COMPLETED' ? 'PAID' : order.status;
  const infoRows = [
    [<Hash size={16} />, 'Order ID', `#${order.id}`],
    [<Utensils size={16} />, 'Table', order.tableNumber || 'Counter'],
    [<ShoppingBag size={16} />, 'Source', order.orderSource === 'qr_order' ? 'QR Order' : order.orderSource === 'tableside' ? 'Tableside' : order.orderSource === 'online' ? 'Online' : 'Counter'],
    [<Utensils size={16} />, 'Dining Option', order.diningType || '-'],
    [<UserRound size={16} />, 'Cashier', order.cashierName || '-'],
    [<CreditCard size={16} />, 'Payment Method', order.paymentMethod || '-'],
    [<Clock3 size={16} />, 'Date', date.toLocaleDateString('en-GB')],
    [<Clock3 size={16} />, 'Time', date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })],
  ] as const;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="flex h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800 md:h-[650px] md:w-[1000px]" onClick={event => event.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700 sm:px-6">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white"><ReceiptIcon /></div><div className="min-w-0"><h2 className="truncate text-lg font-black text-gray-900 dark:text-white">Order #{order.id}</h2><p className="text-xs text-gray-500 dark:text-gray-400">{date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close"><X size={22} /></button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[3fr_2fr]">
          <section className="flex min-h-0 flex-col border-b border-gray-200 dark:border-gray-700 md:border-b-0 md:border-r">
            <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4 sm:px-6"><h3 className="text-base font-black text-gray-900 dark:text-white">Ordered Items <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-300">{loading ? '...' : `${order.items.length} items`}</span></h3></div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 pb-4 sm:px-6">
              {loading ? <>{[1, 2, 3].map(index => <div key={index} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-700" />)}</> : error ? <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-center"><p className="text-sm font-bold text-red-600 dark:text-red-400">Unable to load order details.</p><button type="button" onClick={onRetry} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-white">Retry</button></div> : order.items.length === 0 ? <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">No items found for this order</p> : order.items.map((item, index) => <ItemDetails key={`${item.kdsItemId || item.name}-${index}`} item={item} currencySymbol={currencySymbol} />)}
              {!loading && !error && order.remark && <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-2 text-[10px] text-gray-600 dark:border-orange-900/50 dark:bg-orange-900/10 dark:text-gray-300"><MessageSquare size={12} className="mt-0.5 shrink-0 text-orange-500" />{order.remark}</div>}
            </div>
          </section>
          <aside className="min-h-0 overflow-hidden px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-black text-gray-900 dark:text-white">Order Information</h3><span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-black text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 size={12} /> {statusLabel}</span></div>
            <div className="space-y-1.5">{infoRows.map(([icon, label, value]) => <div key={label} className="flex items-center gap-2 text-xs"><span className="text-gray-400 dark:text-gray-500">{icon}</span><span className="text-gray-500 dark:text-gray-400">{label}</span><span className="ml-auto max-w-[55%] truncate text-right font-bold text-gray-800 dark:text-gray-200">{value}</span></div>)}</div>
            <div className="my-3 border-t border-gray-200 dark:border-gray-700" />
            <div className="space-y-1.5 text-xs"><MoneyRow label="Subtotal" value={money(currencySymbol, subtotal)} /><MoneyRow label="Discount" value={`-${money(currencySymbol, discount)}`} tone="green" /><MoneyRow label="Tax" value={money(currencySymbol, tax)} />{serviceCharge !== 0 && <MoneyRow label="Service Charge" value={money(currencySymbol, serviceCharge)} />}<div className="flex items-center justify-between rounded-lg bg-orange-50 px-3 py-2 dark:bg-orange-900/20"><span className="font-black text-gray-900 dark:text-white">Total</span><span className="text-xl font-black text-orange-600 dark:text-orange-400">{money(currencySymbol, order.total)}</span></div>{amountReceived != null && <MoneyRow label="Amount Received" value={money(currencySymbol, amountReceived)} />}{(change != null || amountReceived != null) && <MoneyRow label="Change" value={money(currencySymbol, change ?? Math.max(0, amountReceived! - order.total))} />}</div>
            {hasRefund && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs dark:border-red-900/50 dark:bg-red-900/10"><p className="mb-1 font-black text-red-700 dark:text-red-400">Refund Information</p><div className="space-y-1"><MoneyRow label="Refunded Amount" value={money(currencySymbol, storedRefund ?? order.total)} tone="red" /><MoneyRow label="Refund Status" value={(order as any).refundStatus || (order.status === 'CANCELLED' ? 'Refunded' : 'Pending')} tone="red" />{(order as any).refundedBy && <MoneyRow label="Refunded By" value={(order as any).refundedBy} tone="red" />}{(order as any).refundedAt && <MoneyRow label="Refund Date/Time" value={new Date((order as any).refundedAt).toLocaleString()} tone="red" />}{(order as any).refundReason && <MoneyRow label="Refund Reason" value={(order as any).refundReason} tone="red" />}</div></div>}
          </aside>
        </div>
        <footer className="grid shrink-0 grid-cols-1 gap-2 border-t border-gray-200 bg-white px-5 py-3 dark:border-gray-700 dark:bg-gray-800 sm:grid-cols-3 sm:px-6"><button type="button" disabled={loading || Boolean(error)} onClick={onReprintReceipt} className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-black text-gray-700 transition hover:border-orange-400 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-orange-500 dark:hover:bg-gray-700"><Printer size={17} /> Reprint Receipt</button><button type="button" disabled={loading || Boolean(error)} onClick={onReprintOrder} className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-black text-gray-700 transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"><List size={17} /> Reprint Order</button>{order.status === 'SERVED' && onCollectPayment ? <button type="button" disabled={loading || Boolean(error)} onClick={onCollectPayment} className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"><CreditCard size={17} /> Collect Payment</button> : <button type="button" disabled={loading || Boolean(error) || order.status === 'CANCELLED'} onClick={onRefund} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw size={17} /> Refund</button>}</footer>
      </div>
    </div>
  );
};

const MoneyRow = ({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) => <div className={`flex items-center justify-between ${tone === 'green' ? 'text-green-600 dark:text-green-400' : tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}><span>{label}</span><span className="font-bold">{value}</span></div>;
const ReceiptIcon = () => <Printer size={19} />;

export default ReportOrderDetailModal;
