import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CashierShift, Order, OrderStatus } from '../src/types';
import { toast } from './Toast';
import printerService, {
  DEFAULT_RECEIPT_CONFIG,
  ReceiptConfig,
  SavedPrinter,
  ShiftPrintData,
} from '../services/printerService';
import {
  X, DollarSign, Clock, CheckCircle2, TrendingUp, TrendingDown,
  Banknote, CreditCard, QrCode, ArrowRight, Printer, Delete
} from 'lucide-react';

interface Props {
  restaurantId: string;
  restaurantName: string;
  cashierName: string;
  cashierUserId?: string;
  currencySymbol: string;
  orders: Order[];
  onShiftChanged: (shift: CashierShift | null) => void;
  onClose: () => void;
  activeShift: CashierShift | null;
}

const CashierShiftModal: React.FC<Props> = ({
  restaurantId,
  restaurantName,
  cashierName,
  cashierUserId,
  currencySymbol,
  orders,
  onShiftChanged,
  onClose,
  activeShift,
}) => {
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [amountKeypadTarget, setAmountKeypadTarget] = useState<'opening' | 'closing' | null>(null);
  const [amountKeypadInput, setAmountKeypadInput] = useState('');
  const [amountKeypadFreshEntry, setAmountKeypadFreshEntry] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [closeStep, setCloseStep] = useState<'form' | 'confirm'>('form');
  const [pendingClosedAt, setPendingClosedAt] = useState<string | null>(null);
  const [hasPrintedShiftDetails, setHasPrintedShiftDetails] = useState(false);

  const shiftSales = useMemo(() => {
    if (!activeShift) return { cash: 0, card: 0, qr: 0, other: 0, total: 0, count: 0, refunds: 0 };

    const shiftStart = new Date(activeShift.opened_at).getTime();
    const shiftOrders = orders.filter(order => {
      if (order.restaurantId !== restaurantId) return false;
      if (order.timestamp < shiftStart) return false;
      if (order.status === OrderStatus.CANCELLED) return false;
      return true;
    });

    let cash = 0;
    let card = 0;
    let qr = 0;
    let other = 0;
    let refunds = 0;

    for (const order of shiftOrders) {
      if (order.status !== OrderStatus.COMPLETED) continue;
      const method = (order.paymentMethod || '').toLowerCase();
      if (method === 'cash') cash += order.total;
      else if (method === 'card') card += order.total;
      else if (method === 'qr') qr += order.total;
      else other += order.total;
    }

    return {
      cash,
      card,
      qr,
      other,
      total: cash + card + qr + other,
      count: shiftOrders.filter(order => order.status === OrderStatus.COMPLETED).length,
      refunds,
    };
  }, [activeShift, orders, restaurantId]);

  const expectedClosing = activeShift ? activeShift.opening_amount + shiftSales.cash : 0;
  const actualClose = parseFloat(closingAmount) || 0;
  const diff = actualClose - expectedClosing;

  useEffect(() => {
    setCloseStep('form');
    setPendingClosedAt(null);
    setHasPrintedShiftDetails(false);
  }, [activeShift?.id]);

  const fmt = (value: number) => `${currencySymbol}${value.toFixed(2)}`;

  const formatDateTime = (value: string) => (
    new Date(value).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  );

  const formatDuration = (start: string, end: string) => {
    const ms = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const sanitizeAmountInput = (value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    const normalized = firstDot === -1
      ? cleaned
      : `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;

    if (!normalized.includes('.')) return normalized;

    const [whole, decimal = ''] = normalized.split('.');
    return `${whole}.${decimal.slice(0, 2)}`;
  };

  const resetAmountKeypad = () => {
    setAmountKeypadTarget(null);
    setAmountKeypadInput('');
    setAmountKeypadFreshEntry(true);
  };

  const openAmountKeypad = (target: 'opening' | 'closing') => {
    setAmountKeypadTarget(target);
    setAmountKeypadInput(target === 'opening' ? openingAmount : closingAmount);
    setAmountKeypadFreshEntry(true);
  };

  const appendAmountKeypadValue = (token: string) => {
    if (amountKeypadFreshEntry) {
      setAmountKeypadInput(sanitizeAmountInput(token));
      setAmountKeypadFreshEntry(false);
      return;
    }

    setAmountKeypadInput((prev) => sanitizeAmountInput(`${prev}${token}`));
  };

  const backspaceAmountKeypadValue = () => {
    setAmountKeypadFreshEntry(false);
    setAmountKeypadInput((prev) => prev.slice(0, -1));
  };

  const saveAmountFromKeypad = () => {
    const next = sanitizeAmountInput(amountKeypadInput);

    if (amountKeypadTarget === 'opening') {
      setOpeningAmount(next);
    }

    if (amountKeypadTarget === 'closing') {
      setClosingAmount(next);
      setHasPrintedShiftDetails(false);
      setPendingClosedAt(null);
    }

    resetAmountKeypad();
  };

  const renderAmountKeypad = () => {
    if (!amountKeypadTarget) return null;

    const isOpeningKeypad = amountKeypadTarget === 'opening';
    const accentBorder = isOpeningKeypad ? 'border-green-500' : 'border-red-500';
    const accentText = isOpeningKeypad ? 'text-green-500' : 'text-red-500';
    const accentButton = isOpeningKeypad ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';
    const title = isOpeningKeypad ? 'Opening Amount' : 'Actual Cash In Drawer';

    return (
      <div className="absolute inset-0 z-20 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto px-5 lg:px-8 pb-6 lg:pb-8 pt-8 lg:pt-10 space-y-5 lg:space-y-6">
          <div className="text-center space-y-3">
            <p className="text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">{title}</p>
            <div className={`mx-auto w-64 lg:w-80 relative flex items-end border-b-2 ${accentBorder} pb-1`}>
              <span className={`absolute left-0 bottom-1 text-xl lg:text-2xl font-black ${accentText}`}>{currencySymbol}</span>
              <span className={`w-full text-4xl lg:text-5xl font-black tracking-tighter text-center ${accentText}`}>
                {amountKeypadInput || '0.00'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((token) => (
              <button
                key={`shift-amount-keypad-${token}`}
                type="button"
                onClick={() => appendAmountKeypadValue(token)}
                className="py-4 lg:py-5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-2xl lg:text-3xl font-black transition-all"
              >
                {token}
              </button>
            ))}
            <button
              type="button"
              onClick={() => appendAmountKeypadValue('.')}
              className="py-4 lg:py-5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-2xl lg:text-3xl font-black transition-all"
            >
              .
            </button>
            <button
              type="button"
              onClick={() => appendAmountKeypadValue('0')}
              className="py-4 lg:py-5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-2xl lg:text-3xl font-black transition-all"
            >
              0
            </button>
            <button
              type="button"
              onClick={backspaceAmountKeypadValue}
              className="py-4 lg:py-5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 flex items-center justify-center transition-all"
            >
              <Delete size={24} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setAmountKeypadFreshEntry(true);
              setAmountKeypadInput('');
            }}
            className="w-full py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-black uppercase tracking-widest transition-all"
          >
            Clear
          </button>
        </div>

        <div className="px-5 lg:px-8 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:py-5 border-t dark:border-gray-700 flex gap-3 lg:gap-4 flex-shrink-0">
          <button
            type="button"
            onClick={resetAmountKeypad}
            className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-black text-sm lg:text-lg uppercase tracking-normal lg:tracking-wider hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveAmountFromKeypad}
            className={`flex-1 py-3 text-white rounded-xl font-black text-sm lg:text-lg uppercase tracking-normal lg:tracking-wider transition-all ${accentButton}`}
          >
            Save
          </button>
        </div>
      </div>
    );
  };

  const resetCloseFlow = () => {
    setCloseStep('form');
    setPendingClosedAt(null);
    setHasPrintedShiftDetails(false);
  };

  const handleDismiss = () => {
    resetAmountKeypad();
    resetCloseFlow();
    onClose();
  };

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

  const ensureClosingAmount = () => {
    const amount = parseFloat(closingAmount);
    if (isNaN(amount) || amount < 0) {
      toast('Please enter the actual cash drawer amount.', 'error');
      return null;
    }
    return amount;
  };

  const buildShiftPrintData = (closedAt: string): ShiftPrintData | null => {
    const amount = ensureClosingAmount();
    if (!activeShift || amount === null) return null;

    return {
      shiftId: activeShift.id,
      cashierName: activeShift.cashier_name,
      openedAt: activeShift.opened_at,
      closedAt,
      openingAmount: activeShift.opening_amount,
      expectedClosingAmount: expectedClosing,
      actualClosingAmount: amount,
      difference: amount - expectedClosing,
      totalCashSales: shiftSales.cash,
      totalCardSales: shiftSales.card,
      totalQrSales: shiftSales.qr,
      totalOtherSales: shiftSales.other,
      totalSales: shiftSales.total,
      totalOrders: shiftSales.count,
      totalRefunds: shiftSales.refunds,
      closeNote: closeNote || null,
    };
  };

  const loadSavedPrinters = (): SavedPrinter[] => {
    try {
      const saved = localStorage.getItem(`printers_${restaurantId}`);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed as SavedPrinter[] : [];
    } catch {
      return [];
    }
  };

  const loadReceiptConfig = (): ReceiptConfig => {
    try {
      const saved = localStorage.getItem(`receipt_config_${restaurantId}`);
      const parsed = saved ? JSON.parse(saved) as Partial<ReceiptConfig> & { businessAddress?: string } : null;
      const legacyAddress = typeof parsed?.businessAddress === 'string' ? parsed.businessAddress : '';
      return {
        ...DEFAULT_RECEIPT_CONFIG,
        businessName: restaurantName,
        ...(parsed || {}),
        businessAddressLine1: parsed?.businessAddressLine1 || legacyAddress || '',
        businessAddressLine2: parsed?.businessAddressLine2 || '',
      };
    } catch {
      return {
        ...DEFAULT_RECEIPT_CONFIG,
        businessName: restaurantName,
      };
    }
  };

  const ensureShiftPrinterConnection = async (printer?: SavedPrinter | null) => {
    if (printerService.isConnected()) return true;

    const candidateDeviceNames = [
      (() => {
        try {
          const saved = localStorage.getItem(`printer_${restaurantId}`);
          if (!saved) return null;
          const parsed = JSON.parse(saved) as { name?: string } | null;
          return parsed?.name || null;
        } catch {
          return null;
        }
      })(),
      printer?.deviceName || null,
    ].filter((name, index, list): name is string => Boolean(name) && list.indexOf(name) === index);

    for (const deviceName of candidateDeviceNames) {
      if (await printerService.autoReconnect(deviceName)) {
        return true;
      }
    }

    return printerService.isConnected();
  };

  const handlePrepareCloseShift = () => {
    if (!activeShift) return;
    const amount = ensureClosingAmount();
    if (amount === null) return;

    setPendingClosedAt(new Date().toISOString());
    setHasPrintedShiftDetails(false);
    setCloseStep('confirm');
  };

  const handlePrintShiftDetails = async (closedAtOverride?: string) => {
    const closedAt = closedAtOverride || pendingClosedAt || new Date().toISOString();
    const shiftPrintData = buildShiftPrintData(closedAt);
    if (!shiftPrintData) return false;

    setPendingClosedAt(closedAt);
    setIsPrinting(true);
    try {
      const printer = loadSavedPrinters()[0];
      if (!printer) {
        toast('Printer is not connected.', 'error');
        return false;
      }

      if (!await ensureShiftPrinterConnection(printer)) {
        toast('Printer is not connected.', 'error');
        return false;
      }

      const receiptConfig = loadReceiptConfig();
      const printed = await printerService.printShiftDetails(
        shiftPrintData,
        { name: receiptConfig.businessName.trim() || restaurantName },
        {
          businessName: receiptConfig.businessName.trim() || restaurantName,
          businessAddressLine1: receiptConfig.businessAddressLine1,
          businessAddressLine2: receiptConfig.businessAddressLine2,
          businessPhone: receiptConfig.businessPhone,
          headerText: 'Shift Closing Summary',
          footerText: 'Shift closed successfully.',
          currencySymbol,
          paperSize: printer?.paperSize || '58mm',
          printDensity: printer?.printDensity || 'medium',
          autoCut: printer?.autoCut ?? true,
        },
      );

      if (!printed) throw new Error('Shift details printing failed.');

      setHasPrintedShiftDetails(true);
      toast('Shift details printed successfully.', 'success');
      return true;
    } catch (err: any) {
      toast(err?.message || 'Failed to print shift details', 'error');
      return false;
    } finally {
      setIsPrinting(false);
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift) return;
    const amount = ensureClosingAmount();
    if (amount === null) return;

    const closedAt = pendingClosedAt || new Date().toISOString();
    const shiftPrintData = buildShiftPrintData(closedAt);
    if (!shiftPrintData) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('cashier_shifts')
        .update({
          closed_at: closedAt,
          expected_closing_amount: shiftPrintData.expectedClosingAmount,
          actual_closing_amount: amount,
          difference: shiftPrintData.difference,
          total_cash_sales: shiftPrintData.totalCashSales,
          total_card_sales: shiftPrintData.totalCardSales,
          total_qr_sales: shiftPrintData.totalQrSales,
          total_other_sales: shiftPrintData.totalOtherSales,
          total_sales: shiftPrintData.totalSales,
          total_orders: shiftPrintData.totalOrders,
          total_refunds: shiftPrintData.totalRefunds,
          status: 'closed',
          close_note: closeNote || null,
        })
        .eq('id', activeShift.id);

      if (error) throw error;

      toast('Shift closed successfully!', 'success');
      onShiftChanged(null);
      handleDismiss();
    } catch (err: any) {
      toast(err.message || 'Failed to close shift', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!activeShift) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
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

          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                Cash Drawer Opening Amount
              </label>
              <button type="button" onClick={() => openAmountKeypad('opening')} className="relative w-full">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">{currencySymbol}</span>
                <div className="w-full pl-10 pr-4 py-4 text-2xl font-black border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white text-center">
                  {openingAmount || '0.00'}
                </div>
              </button>
              <p className="text-xs text-gray-400 mt-2">Tap the amount field to open the number pad.</p>
            </div>
          </div>

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

          {renderAmountKeypad()}
        </div>
      </div>
    );
  }

  const confirmClosedAt = pendingClosedAt || new Date().toISOString();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-end lg:items-center justify-center lg:p-4" onClick={handleDismiss}>
      <div className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-3xl shadow-2xl w-full lg:max-w-4xl h-[100dvh] lg:h-[900px] lg:max-h-[99dvh] flex flex-col relative overflow-hidden" onClick={e => e.stopPropagation()}>
        {closeStep === 'form' ? (
          <>
            <div className="px-5 lg:px-8 py-4 lg:py-5 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center">
                  <Clock size={22} className="text-red-600" />
                </div>
                <div>
                  <h2 className="font-black dark:text-white uppercase tracking-tighter text-xl lg:text-2xl">Close Shift</h2>
                  <p className="text-xs lg:text-sm text-gray-500">{cashierName} • Opened {new Date(activeShift.opened_at).toLocaleTimeString()}</p>
                </div>
              </div>
              <button onClick={handleDismiss} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all">
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 lg:px-8 pb-6 lg:pb-8 pt-6 lg:pt-8 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest mb-3">Shift Summary</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4">
                        <div className="flex items-center gap-2 text-green-600 mb-2">
                          <Banknote size={16} />
                          <span className="text-xs font-bold uppercase tracking-wider">Cash Sales</span>
                        </div>
                        <p className="text-2xl font-black text-green-700 dark:text-green-400 tracking-tighter">{fmt(shiftSales.cash)}</p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4">
                        <div className="flex items-center gap-2 text-blue-600 mb-2">
                          <CreditCard size={16} />
                          <span className="text-xs font-bold uppercase tracking-wider">Card Sales</span>
                        </div>
                        <p className="text-2xl font-black text-blue-700 dark:text-blue-400 tracking-tighter">{fmt(shiftSales.card)}</p>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-4">
                        <div className="flex items-center gap-2 text-purple-600 mb-2">
                          <QrCode size={16} />
                          <span className="text-xs font-bold uppercase tracking-wider">QR Sales</span>
                        </div>
                        <p className="text-2xl font-black text-purple-700 dark:text-purple-400 tracking-tighter">{fmt(shiftSales.qr)}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-2xl p-4">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 mb-2">
                          <DollarSign size={16} />
                          <span className="text-xs font-bold uppercase tracking-wider">Other</span>
                        </div>
                        <p className="text-2xl font-black text-gray-700 dark:text-gray-200 tracking-tighter">{fmt(shiftSales.other)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs lg:text-sm font-black text-amber-600 uppercase tracking-wider">Total Sales ({shiftSales.count} orders)</p>
                      <p className="text-3xl lg:text-4xl font-black text-amber-700 dark:text-amber-400 tracking-tighter">{fmt(shiftSales.total)}</p>
                    </div>
                    <TrendingUp size={34} className="text-amber-400" />
                  </div>

                  <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
                    <h3 className="text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">Cash Drawer</h3>
                    <div className="flex items-center justify-between text-sm lg:text-base">
                      <span className="text-gray-500 dark:text-gray-400">Opening Amount</span>
                      <span className="font-black dark:text-white">{fmt(activeShift.opening_amount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm lg:text-base">
                      <span className="text-gray-500 dark:text-gray-400">+ Cash Sales</span>
                      <span className="font-black text-green-600">{fmt(shiftSales.cash)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm lg:text-base border-t dark:border-gray-700 pt-3">
                      <span className="font-black text-gray-700 dark:text-gray-200 uppercase tracking-wide">Expected In Drawer</span>
                      <span className="text-2xl font-black dark:text-white tracking-tighter">{fmt(expectedClosing)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest mb-3">
                      Actual Cash In Drawer
                    </label>
                    <button type="button" onClick={() => openAmountKeypad('closing')} className="relative w-full">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xl">{currencySymbol}</span>
                      <div className="w-full pl-10 pr-4 py-5 lg:py-6 text-4xl lg:text-5xl font-black border-2 border-gray-200 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-700 dark:text-white text-center tracking-tighter">
                        {closingAmount || '0.00'}
                      </div>
                    </button>
                    <p className="text-xs text-gray-400 mt-2">Tap the amount field to open the number pad.</p>
                  </div>

                  {closingAmount && (
                    <div className={`rounded-2xl p-5 flex items-center justify-between ${
                      diff === 0 ? 'bg-green-50 dark:bg-green-900/20' :
                      diff > 0 ? 'bg-blue-50 dark:bg-blue-900/20' :
                      'bg-red-50 dark:bg-red-900/20'
                    }`}>
                      <div>
                        <p className={`text-xs lg:text-sm font-black uppercase tracking-widest ${
                          diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'
                        }`}>
                          {diff === 0 ? 'Balanced' : diff > 0 ? 'Overage' : 'Shortage'}
                        </p>
                        <p className={`text-3xl lg:text-4xl font-black tracking-tighter ${
                          diff === 0 ? 'text-green-700 dark:text-green-400' :
                          diff > 0 ? 'text-blue-700 dark:text-blue-400' :
                          'text-red-700 dark:text-red-400'
                        }`}>
                          {diff > 0 ? '+' : ''}{fmt(diff)}
                        </p>
                      </div>
                      {diff === 0 ? <CheckCircle2 size={34} className="text-green-400" /> :
                       diff > 0 ? <TrendingUp size={34} className="text-blue-400" /> :
                       <TrendingDown size={34} className="text-red-400" />}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest mb-3">Shift Note</label>
                    <textarea
                      value={closeNote}
                      onChange={e => {
                        setCloseNote(e.target.value);
                        setHasPrintedShiftDetails(false);
                      }}
                      rows={6}
                      placeholder="Add a note about this shift..."
                      className="w-full px-4 py-4 border-2 border-gray-200 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-700 dark:text-white focus:border-red-500 outline-none text-sm resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 lg:px-8 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:py-5 border-t dark:border-gray-700 flex gap-3 lg:gap-4 flex-shrink-0">
              <button
                onClick={handleDismiss}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-black text-sm lg:text-lg uppercase tracking-normal lg:tracking-wider hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handlePrepareCloseShift}
                disabled={loading || !closingAmount}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black text-sm lg:text-lg uppercase tracking-normal lg:tracking-wider hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? 'Closing...' : <>Close Shift <ArrowRight size={18} /></>}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-8 py-5 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0 relative">
              <div className="text-center flex-1">
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-2xl">Shift Close Ready</h3>
                <p className="text-xs text-gray-400 uppercase tracking-widest mt-1">Print the shift close details before finalizing</p>
              </div>
              <button onClick={handleDismiss} className="absolute right-5 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all">
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="w-full max-w-3xl">
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  <div className="sm:pr-8 text-center sm:text-right sm:border-r-2 border-dotted dark:border-gray-700 pb-4 sm:pb-0">
                    <div className="text-3xl lg:text-5xl font-black text-green-500 tracking-tighter">
                      {fmt(actualClose)}
                    </div>
                    <label className="block mt-2 lg:mt-3 text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">Actual Cash</label>
                  </div>
                  <div className="sm:pl-8 text-center sm:text-left border-t sm:border-t-0 border-dotted dark:border-gray-700 pt-4 sm:pt-0">
                    <div className={`text-3xl lg:text-5xl font-black tracking-tighter ${
                      diff === 0 ? 'text-green-500' : diff > 0 ? 'text-blue-500' : 'text-red-500'
                    }`}>
                      {diff > 0 ? '+' : ''}{fmt(diff)}
                    </div>
                    <label className="block mt-2 lg:mt-3 text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">
                      {diff === 0 ? 'Balanced' : diff > 0 ? 'Overage' : 'Shortage'}
                    </label>
                  </div>
                </div>
              </div>

              <div className="w-full max-w-3xl mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-2xl p-4">
                  <p className="text-2xl font-black text-amber-500 tracking-tighter">{fmt(shiftSales.total)}</p>
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mt-1">Total Sales</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-2xl p-4">
                  <p className="text-2xl font-black text-gray-700 dark:text-gray-100 tracking-tighter">{shiftSales.count}</p>
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mt-1">Orders</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-2xl p-4">
                  <p className="text-lg font-black text-gray-700 dark:text-gray-100 tracking-tight">{formatDuration(activeShift.opened_at, confirmClosedAt)}</p>
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mt-1">Shift Duration</p>
                </div>
              </div>

              <div className="w-full max-w-3xl mt-8 text-center space-y-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Opened {formatDateTime(activeShift.opened_at)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Closing at {formatDateTime(confirmClosedAt)}
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                  {hasPrintedShiftDetails ? 'Shift details printed. You can close the shift now.' : 'Closing the shift will print the shift details automatically.'}
                </p>
              </div>
            </div>

            <div className="px-8 py-5 border-t dark:border-gray-700 flex-shrink-0 flex gap-3">
              {!hasPrintedShiftDetails && (
                <button
                  onClick={() => void handlePrintShiftDetails()}
                  disabled={isPrinting || loading}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-black text-sm lg:text-lg uppercase tracking-wider hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isPrinting ? 'Printing...' : <><Printer size={18} /> Print Shift Details</>}
                </button>
              )}
              <button
                onClick={handleCloseShift}
                disabled={loading || isPrinting}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black text-sm lg:text-lg uppercase tracking-wider hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? 'Closing...' : <>Close Shift <ArrowRight size={18} /></>}
              </button>
            </div>
          </>
        )}

        {renderAmountKeypad()}
      </div>
    </div>
  );
};

export default CashierShiftModal;
