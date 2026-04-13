// components/CashierShiftModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { CashierShift, Order, OrderStatus } from '../src/types';
import { toast } from './Toast';
import {
  X, DollarSign, Clock, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown,
  Banknote, CreditCard, QrCode, ArrowRight, Minus
} from 'lucide-react';

interface Props {
  restaurantId: string;
  cashierName: string;
  cashierUserId?: string;
  currencySymbol: string;
  orders: Order[];
  onShiftChanged: (shift: CashierShift | null) => void;
  onClose: () => void;
  activeShift: CashierShift | null;
}

const CashierShiftModal: React.FC<Props> = ({
  restaurantId, cashierName, cashierUserId, currencySymbol, orders, onShiftChanged, onClose, activeShift
}) => {
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [loading, setLoading] = useState(false);

  // Calculate sales breakdown for current shift from orders
  const shiftSales = useMemo(() => {
    if (!activeShift) return { cash: 0, card: 0, qr: 0, other: 0, total: 0, count: 0, refunds: 0 };

    const shiftStart = new Date(activeShift.opened_at).getTime();
    const shiftOrders = orders.filter(o => {
      if (o.restaurantId !== restaurantId) return false;
      if (o.timestamp < shiftStart) return false;
      if (o.status === OrderStatus.CANCELLED) return false;
      return true;
    });

    let cash = 0, card = 0, qr = 0, other = 0, refunds = 0;
    for (const o of shiftOrders) {
      if (o.status !== OrderStatus.COMPLETED) continue;
      const method = (o.paymentMethod || '').toLowerCase();
      if (method === 'cash') cash += o.total;
      else if (method === 'card') card += o.total;
      else if (method === 'qr') qr += o.total;
      else other += o.total;
    }

    return {
      cash, card, qr, other,
      total: cash + card + qr + other,
      count: shiftOrders.filter(o => o.status === OrderStatus.COMPLETED).length,
      refunds,
    };
  }, [activeShift, orders, restaurantId]);

  const expectedClosing = activeShift
    ? (activeShift.opening_amount + shiftSales.cash)
    : 0;

  const actualClose = parseFloat(closingAmount) || 0;
  const diff = actualClose - expectedClosing;

  const handleOpenShift = async () => {
    const amount = parseFloat(openingAmount);
    if (isNaN(amount) || amount < 0) {
      toast('Please enter a valid opening amount.', 'error');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cashier_shifts')
        .insert({
          restaurant_id: restaurantId,
          cashier_name: cashierName,
          cashier_user_id: cashierUserId || null,
          opening_amount: amount,
          status: 'open',
        })
        .select()
        .single();

      if (error) throw error;
      toast('Shift opened successfully!', 'success');
      onShiftChanged(data as CashierShift);
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to open shift', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift) return;
    const amount = parseFloat(closingAmount);
    if (isNaN(amount) || amount < 0) {
      toast('Please enter the actual cash drawer amount.', 'error');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cashier_shifts')
        .update({
          closed_at: new Date().toISOString(),
          expected_closing_amount: expectedClosing,
          actual_closing_amount: amount,
          difference: amount - expectedClosing,
          total_cash_sales: shiftSales.cash,
          total_card_sales: shiftSales.card,
          total_qr_sales: shiftSales.qr,
          total_other_sales: shiftSales.other,
          total_sales: shiftSales.total,
          total_orders: shiftSales.count,
          total_refunds: shiftSales.refunds,
          status: 'closed',
          close_note: closeNote || null,
        })
        .eq('id', activeShift.id)
        .select()
        .single();

      if (error) throw error;
      toast('Shift closed successfully!', 'success');
      onShiftChanged(null);
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to close shift', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: number) => `${currencySymbol}${v.toFixed(2)}`;

  // ──── OPEN SHIFT VIEW ────
  if (!activeShift) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                <Clock size={20} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-black dark:text-white">Open Shift</h2>
                <p className="text-xs text-gray-500">{cashierName}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <X size={20} className="dark:text-white" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                Cash Drawer Opening Amount
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">{currencySymbol}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingAmount}
                  onChange={e => setOpeningAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-4 text-2xl font-black border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none text-center"
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">Enter the amount of cash currently in the drawer</p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t dark:border-gray-700 flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancel
            </button>
            <button
              onClick={handleOpenShift}
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-green-600 text-white font-black hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? 'Opening...' : <>Open Shift <ArrowRight size={18} /></>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──── CLOSE SHIFT VIEW ────
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
              <Clock size={20} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-black dark:text-white">Close Shift</h2>
              <p className="text-xs text-gray-500">{cashierName} &bull; Opened {new Date(activeShift.opened_at).toLocaleTimeString()}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X size={20} className="dark:text-white" />
          </button>
        </div>

        {/* Sales Breakdown */}
        <div className="p-6 space-y-4">
          <h3 className="text-sm font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Shift Summary</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <Banknote size={16} />
                <span className="text-xs font-bold">Cash Sales</span>
              </div>
              <p className="text-lg font-black text-green-700 dark:text-green-400">{fmt(shiftSales.cash)}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <CreditCard size={16} />
                <span className="text-xs font-bold">Card Sales</span>
              </div>
              <p className="text-lg font-black text-blue-700 dark:text-blue-400">{fmt(shiftSales.card)}</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3">
              <div className="flex items-center gap-2 text-purple-600 mb-1">
                <QrCode size={16} />
                <span className="text-xs font-bold">QR Sales</span>
              </div>
              <p className="text-lg font-black text-purple-700 dark:text-purple-400">{fmt(shiftSales.qr)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 mb-1">
                <DollarSign size={16} />
                <span className="text-xs font-bold">Other</span>
              </div>
              <p className="text-lg font-black text-gray-700 dark:text-gray-200">{fmt(shiftSales.other)}</p>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-600">Total Sales ({shiftSales.count} orders)</p>
              <p className="text-xl font-black text-amber-700 dark:text-amber-400">{fmt(shiftSales.total)}</p>
            </div>
            <TrendingUp size={28} className="text-amber-400" />
          </div>

          {/* Cash Drawer Calculation */}
          <div className="border-t dark:border-gray-700 pt-4 space-y-3">
            <h3 className="text-sm font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cash Drawer</h3>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Opening Amount</span>
              <span className="font-bold dark:text-white">{fmt(activeShift.opening_amount)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">+ Cash Sales</span>
              <span className="font-bold text-green-600">{fmt(shiftSales.cash)}</span>
            </div>
            <div className="flex items-center justify-between text-sm border-t dark:border-gray-700 pt-2">
              <span className="font-bold text-gray-700 dark:text-gray-200">Expected in Drawer</span>
              <span className="font-black text-lg dark:text-white">{fmt(expectedClosing)}</span>
            </div>
          </div>

          {/* Actual amount input */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
              Actual Cash in Drawer
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">{currencySymbol}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={closingAmount}
                onChange={e => setClosingAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-10 pr-4 py-4 text-2xl font-black border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none text-center"
                autoFocus
              />
            </div>
          </div>

          {/* Difference display */}
          {closingAmount && (
            <div className={`rounded-xl p-4 flex items-center justify-between ${
              diff === 0 ? 'bg-green-50 dark:bg-green-900/20' :
              diff > 0 ? 'bg-blue-50 dark:bg-blue-900/20' :
              'bg-red-50 dark:bg-red-900/20'
            }`}>
              <div>
                <p className={`text-xs font-bold ${
                  diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'
                }`}>
                  {diff === 0 ? 'Balanced' : diff > 0 ? 'Overage' : 'Shortage'}
                </p>
                <p className={`text-xl font-black ${
                  diff === 0 ? 'text-green-700 dark:text-green-400' :
                  diff > 0 ? 'text-blue-700 dark:text-blue-400' :
                  'text-red-700 dark:text-red-400'
                }`}>
                  {diff > 0 ? '+' : ''}{fmt(diff)}
                </p>
              </div>
              {diff === 0 ? <CheckCircle2 size={28} className="text-green-400" /> :
               diff > 0 ? <TrendingUp size={28} className="text-blue-400" /> :
               <TrendingDown size={28} className="text-red-400" />}
            </div>
          )}

          {/* Close note */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Note (optional)</label>
            <textarea
              value={closeNote}
              onChange={e => setCloseNote(e.target.value)}
              rows={2}
              placeholder="Add a note about this shift..."
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white focus:border-red-500 outline-none text-sm resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t dark:border-gray-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button
            onClick={handleCloseShift}
            disabled={loading || !closingAmount}
            className="flex-1 py-3 rounded-xl bg-red-600 text-white font-black hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'Closing...' : <>Close Shift <ArrowRight size={18} /></>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CashierShiftModal;
