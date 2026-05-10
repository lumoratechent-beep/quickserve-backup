import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { CashierShift, Order } from '../src/types';
import { toast } from './Toast';
import {
  Clock, Search, User, Download, RefreshCw, Banknote, CreditCard, QrCode,
  TrendingUp, ChevronRight, DollarSign, FileText, Printer,
} from 'lucide-react';

interface Props {
  restaurantId: string;
  restaurantName: string;
  currencySymbol: string;
  orders: Order[];
}

type DownloadFileType = 'csv' | 'pdf';

const CashierShiftRecords: React.FC<Props> = ({ restaurantId, restaurantName, currencySymbol, orders }) => {
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);

  const fetchShifts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('cashier_shifts')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('opened_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (dateRange !== 'all') {
        const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('opened_at', since);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      setShifts((data || []) as CashierShift[]);
    } catch (err: any) {
      toast(err.message || 'Failed to load shifts', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchShifts();
  }, [restaurantId, statusFilter, dateRange]);

  useEffect(() => {
    if (!showDownloadMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!downloadMenuRef.current?.contains(event.target as Node)) {
        setShowDownloadMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDownloadMenu]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return shifts;
    const q = searchQuery.toLowerCase();
    return shifts.filter((s) =>
      (s.shift_code || '').toLowerCase().includes(q) ||
      s.cashier_name.toLowerCase().includes(q) ||
      (s.close_note || '').toLowerCase().includes(q)
    );
  }, [shifts, searchQuery]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedShiftId(null);
      return;
    }

    const hasSelectedShift = filtered.some((shift) => shift.id === selectedShiftId);
    if (!hasSelectedShift) {
      setSelectedShiftId(null);
    }
  }, [filtered, selectedShiftId]);

  const selectedShift = useMemo(
    () => filtered.find((shift) => shift.id === selectedShiftId) || null,
    [filtered, selectedShiftId],
  );

  const fmt = (v: number | undefined | null) => `${currencySymbol}${(v ?? 0).toFixed(2)}`;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const duration = (start: string, end?: string) => {
    const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  const summary = useMemo(() => {
    const closed = filtered.filter((s) => s.status === 'closed');
    const totalSales = closed.reduce((a, s) => a + (s.total_sales || 0), 0);
    const totalShorts = closed.reduce((a, s) => a + Math.min(0, s.difference || 0), 0);
    const totalOverage = closed.reduce((a, s) => a + Math.max(0, s.difference || 0), 0);
    return { count: filtered.length, closedCount: closed.length, totalSales, totalShorts, totalOverage };
  }, [filtered]);

  const shiftTransactions = useMemo(() => {
    if (!selectedShift) return [];

    const shiftStart = new Date(selectedShift.opened_at).getTime();
    const shiftEnd = selectedShift.closed_at ? new Date(selectedShift.closed_at).getTime() : Date.now();

    return orders
      .filter((order) => order.restaurantId === restaurantId)
      .filter((order) => order.timestamp >= shiftStart && order.timestamp <= shiftEnd)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [orders, restaurantId, selectedShift]);

  const completedShiftTransactions = useMemo(
    () => shiftTransactions.filter((order) => order.status === 'COMPLETED'),
    [shiftTransactions],
  );

  const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  const downloadTextFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const buildTransactionRows = (transactions: Order[]) => (
    transactions.map((order) => ([
      new Date(order.timestamp).toLocaleString('en-GB'),
      order.id,
      order.status,
      order.paymentMethod || '-',
      order.cashierName || selectedShift?.cashier_name || '-',
      order.items.map((item) => `${item.name} x${item.quantity}`).join('; '),
      order.total.toFixed(2),
    ]))
  );

  const buildOrderItemsText = (order: Order) => (
    order.items.length
      ? order.items.map((item) => `${item.name} x${item.quantity}`).join(', ')
      : '-'
  );

  const getShiftExportFilename = (shift: CashierShift, extension: string) => {
    const code = (shift.shift_code || shift.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `shift-report-${code}.${extension}`;
  };

  const handleDownloadReport = async (fileType: DownloadFileType) => {
    if (!selectedShift) return;

    setShowDownloadMenu(false);
    setIsDownloading(true);
    try {
      const transactionRows = buildTransactionRows(shiftTransactions);

      if (fileType === 'csv') {
        const rows = [
          ['Shift ID', selectedShift.shift_code || selectedShift.id],
          ['Cashier', selectedShift.cashier_name],
          ['Opened At', fmtDateTime(selectedShift.opened_at)],
          ['Closed At', selectedShift.closed_at ? fmtDateTime(selectedShift.closed_at) : 'Active'],
          ['Duration', duration(selectedShift.opened_at, selectedShift.closed_at)],
          ['Total Orders', String(selectedShift.total_orders || completedShiftTransactions.length)],
          ['Total Sales', (selectedShift.total_sales || 0).toFixed(2)],
          [],
          ['Transaction Time', 'Order ID', 'Status', 'Payment Method', 'Cashier', 'Items', 'Total'],
          ...transactionRows,
        ];
        const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
        downloadTextFile(csv, getShiftExportFilename(selectedShift, 'csv'), 'text/csv;charset=utf-8;');
        toast('Shift CSV downloaded.', 'success');
        return;
      }

      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const margin = 14;
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 14;
      const titleColor = [31, 41, 55] as [number, number, number];
      const accent = [217, 119, 6] as [number, number, number];

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...titleColor);
      doc.text('Shift Report', margin, y);
      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      doc.text(restaurantName, margin, y);
      doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageWidth - margin, y, { align: 'right' });
      y += 3;
      doc.setDrawColor(...accent);
      doc.setLineWidth(0.6);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        head: [['Field', 'Value']],
        body: [
          ['Shift ID', selectedShift.shift_code || selectedShift.id],
          ['Cashier', selectedShift.cashier_name],
          ['Status', selectedShift.status === 'open' ? 'Active' : 'Closed'],
          ['Opened', fmtDateTime(selectedShift.opened_at)],
          ['Closed', selectedShift.closed_at ? fmtDateTime(selectedShift.closed_at) : 'Active'],
          ['Duration', duration(selectedShift.opened_at, selectedShift.closed_at)],
          ['Opening Amount', fmt(selectedShift.opening_amount)],
          ['Cash Sales', fmt(selectedShift.total_cash_sales)],
          ['Card Sales', fmt(selectedShift.total_card_sales)],
          ['QR Sales', fmt(selectedShift.total_qr_sales)],
          ['Other Sales', fmt(selectedShift.total_other_sales)],
          ['Total Sales', fmt(selectedShift.total_sales)],
          ['Total Orders', String(selectedShift.total_orders || completedShiftTransactions.length)],
          ['Difference', selectedShift.status === 'closed' ? fmt(selectedShift.difference) : 'Pending'],
        ],
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [255, 247, 237] },
        theme: 'grid',
      });

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [['Time', 'Order ID', 'Status', 'Payment', 'Cashier', 'Items', 'Total']],
        body: shiftTransactions.length
          ? shiftTransactions.map((order) => [
              new Date(order.timestamp).toLocaleString('en-GB'),
              order.id,
              order.status,
              order.paymentMethod || '-',
              order.cashierName || selectedShift.cashier_name || '-',
              buildOrderItemsText(order),
              fmt(order.total),
            ])
          : [['No transactions found', '', '', '', '', '', '']],
        margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [255, 247, 237] },
        theme: 'grid',
        columnStyles: {
          5: { cellWidth: 60 },
        },
      });

      doc.save(getShiftExportFilename(selectedShift, 'pdf'));
      toast('Shift PDF downloaded.', 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to download shift report', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const escapeHtml = (value: string) => (
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  );

  const handleReprintShift = async () => {
    if (!selectedShift) return;

    setIsPrinting(true);
    try {
      const printWindow = window.open('', '_blank', 'width=960,height=720');
      if (!printWindow) {
        throw new Error('Please allow pop-ups to print the shift details.');
      }

      const transactionsMarkup = shiftTransactions.length
        ? shiftTransactions.map((order) => `
            <tr>
              <td>${escapeHtml(new Date(order.timestamp).toLocaleString('en-GB'))}</td>
              <td>${escapeHtml(order.id)}</td>
              <td>${escapeHtml(order.status)}</td>
              <td>${escapeHtml(order.paymentMethod || '-')}</td>
              <td>${escapeHtml(order.cashierName || selectedShift.cashier_name || '-')}</td>
              <td>${escapeHtml(buildOrderItemsText(order))}</td>
              <td>${escapeHtml(`${currencySymbol}${order.total.toFixed(2)}`)}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="7">No transactions found during this shift.</td></tr>';

      const noteMarkup = selectedShift.close_note
        ? `<div class="note"><strong>Note:</strong> ${escapeHtml(selectedShift.close_note)}</div>`
        : '';

      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <title>Shift Detail</title>
            <style>
              body { font-family: Arial, sans-serif; color: #1f2937; margin: 24px; }
              h1 { margin: 0 0 4px; font-size: 24px; }
              .sub { color: #6b7280; margin-bottom: 18px; }
              .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 18px; }
              .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
              .label { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; }
              .value { font-size: 15px; font-weight: 700; }
              .note { margin: 14px 0; padding: 12px; background: #fef3c7; border-radius: 12px; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; }
              th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 12px; vertical-align: top; }
              th { background: #f59e0b; color: white; }
              @media print { body { margin: 12px; } }
            </style>
          </head>
          <body>
            <h1>Shift Detail</h1>
            <div class="sub">${escapeHtml(restaurantName)} | ${escapeHtml(selectedShift.shift_code || selectedShift.id)} | ${escapeHtml(selectedShift.cashier_name)}</div>

            <div class="grid">
              <div class="card"><div class="label">Opened</div><div class="value">${escapeHtml(fmtDateTime(selectedShift.opened_at))}</div></div>
              <div class="card"><div class="label">Closed</div><div class="value">${escapeHtml(selectedShift.closed_at ? fmtDateTime(selectedShift.closed_at) : 'Active')}</div></div>
              <div class="card"><div class="label">Duration</div><div class="value">${escapeHtml(duration(selectedShift.opened_at, selectedShift.closed_at))}</div></div>
              <div class="card"><div class="label">Status</div><div class="value">${escapeHtml(selectedShift.status === 'open' ? 'Active' : 'Closed')}</div></div>
              <div class="card"><div class="label">Total Sales</div><div class="value">${escapeHtml(fmt(selectedShift.total_sales))}</div></div>
              <div class="card"><div class="label">Total Orders</div><div class="value">${escapeHtml(String(selectedShift.total_orders || completedShiftTransactions.length))}</div></div>
            </div>

            <div class="grid">
              <div class="card"><div class="label">Opening Amount</div><div class="value">${escapeHtml(fmt(selectedShift.opening_amount))}</div></div>
              <div class="card"><div class="label">Cash Sales</div><div class="value">${escapeHtml(fmt(selectedShift.total_cash_sales))}</div></div>
              <div class="card"><div class="label">Card Sales</div><div class="value">${escapeHtml(fmt(selectedShift.total_card_sales))}</div></div>
              <div class="card"><div class="label">QR Sales</div><div class="value">${escapeHtml(fmt(selectedShift.total_qr_sales))}</div></div>
            </div>

            ${noteMarkup}

            <h2>Transactions</h2>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Order ID</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Cashier</th>
                  <th>Items</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${transactionsMarkup}</tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      toast('Shift details ready to print.', 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to print shift details', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black dark:text-white flex items-center gap-2">
            <Clock size={22} className="text-amber-500" /> Cashier Shift Records
          </h2>
          <p className="text-sm text-gray-500 mt-1">{summary.count} shifts found &bull; {summary.closedCount} closed</p>
        </div>
        <button onClick={() => void fetchShifts()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Refresh">
          <RefreshCw size={18} className={`dark:text-white ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
          <p className="text-xs font-bold text-green-600 mb-1">Total Sales</p>
          <p className="text-2xl font-black text-green-700 dark:text-green-400">{fmt(summary.totalSales)}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
          <p className="text-xs font-bold text-red-600 mb-1">Total Shortages</p>
          <p className="text-2xl font-black text-red-700 dark:text-red-400">{fmt(summary.totalShorts)}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
          <p className="text-xs font-bold text-blue-600 mb-1">Total Overages</p>
          <p className="text-2xl font-black text-blue-700 dark:text-blue-400">{fmt(summary.totalOverage)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by cashier name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm focus:border-amber-400 outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | 'open' | 'closed')}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={dateRange}
          onChange={e => setDateRange(e.target.value as '7d' | '30d' | '90d' | 'all')}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-amber-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Clock size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-bold">No shift records found</p>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-gray-500 dark:text-gray-400">Shift ID</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-500 dark:text-gray-400">Cashier</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-500 dark:text-gray-400">Date</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-500 dark:text-gray-400">Time</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-500 dark:text-gray-400">Duration</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-500 dark:text-gray-400">Sales</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-500 dark:text-gray-400">Difference</th>
                    <th className="px-4 py-3 text-center font-bold text-gray-500 dark:text-gray-400">Status</th>
                    <th className="px-4 py-3 text-center font-bold text-gray-500 dark:text-gray-400"></th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {filtered.map((shift) => {
                    const isSelected = selectedShift?.id === shift.id;
                    return (
                      <tr
                        key={shift.id}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-amber-50 dark:bg-amber-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                        onClick={() => {
                          setShowDownloadMenu(false);
                          setSelectedShiftId(shift.id);
                        }}
                      >
                        <td className="px-4 py-3">
                          <span className="font-black text-gray-700 dark:text-gray-100">{shift.shift_code || shift.id}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                              <User size={14} className="text-amber-600" />
                            </div>
                            <span className="font-bold dark:text-white">{shift.cashier_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fmtDate(shift.opened_at)}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                          {fmtTime(shift.opened_at)} - {shift.closed_at ? fmtTime(shift.closed_at) : 'Now'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{duration(shift.opened_at, shift.closed_at)}</td>
                        <td className="px-4 py-3 text-right font-bold dark:text-white">{fmt(shift.total_sales)}</td>
                        <td className="px-4 py-3 text-right">
                          {shift.status === 'closed' ? (
                            <span className={`font-bold ${
                              (shift.difference || 0) === 0 ? 'text-green-600' :
                              (shift.difference || 0) > 0 ? 'text-blue-600' : 'text-red-600'
                            }`}>
                              {(shift.difference || 0) > 0 ? '+' : ''}{fmt(shift.difference)}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            shift.status === 'open'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          }`}>
                            {shift.status === 'open' ? 'Active' : 'Closed'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ChevronRight size={16} className={`mx-auto ${isSelected ? 'text-amber-500' : 'text-gray-400'}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {selectedShift && (
            <div className="fixed inset-0 z-[99999]">
              <div
                className="absolute inset-0 bg-slate-950/45 backdrop-blur-md"
                onClick={() => {
                  setShowDownloadMenu(false);
                  setSelectedShiftId(null);
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div
                  className="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
                  onClick={(e) => e.stopPropagation()}
                >
              <div className="flex flex-col gap-4 border-b dark:border-gray-700 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-600">Shift Detail</p>
                  <h3 className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{selectedShift.shift_code || selectedShift.id}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {selectedShift.cashier_name} &bull; {fmtDate(selectedShift.opened_at)} &bull; {selectedShift.status === 'open' ? 'Active shift' : 'Closed shift'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDownloadMenu(false);
                      setSelectedShiftId(null);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-black text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Close
                  </button>
                  <div className="relative" ref={downloadMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowDownloadMenu((prev) => !prev)}
                      disabled={isDownloading}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-amber-600 disabled:opacity-60"
                    >
                      <Download size={16} />
                      {isDownloading ? 'Downloading...' : 'Download Report'}
                    </button>

                    {showDownloadMenu && (
                      <div className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                        <button
                          type="button"
                          onClick={() => void handleDownloadReport('pdf')}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <FileText size={15} />
                          Download PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDownloadReport('csv')}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <Download size={15} />
                          Download CSV
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleReprintShift()}
                    disabled={isPrinting}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-black text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <Printer size={16} />
                    {isPrinting ? 'Preparing...' : 'Reprint Shift'}
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(92vh-96px)] overflow-y-auto space-y-6 p-6">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)]">
                  <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900/30">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-gray-400">Shift Overview</p>
                        <h4 className="mt-2 text-lg font-black text-gray-900 dark:text-white">{selectedShift.cashier_name}</h4>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {selectedShift.status === 'open' ? 'Active shift' : 'Closed shift'} for {restaurantName}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${
                        selectedShift.status === 'open'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                      }`}>
                        {selectedShift.status === 'open' ? 'Active' : 'Closed'}
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/80">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-300">Opened</p>
                        <p className="mt-2 text-base font-black text-gray-900 dark:text-white">{fmtTime(selectedShift.opened_at)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(selectedShift.opened_at)}</p>
                      </div>
                      <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/80">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-300">Closed</p>
                        <p className="mt-2 text-base font-black text-gray-900 dark:text-white">{selectedShift.closed_at ? fmtTime(selectedShift.closed_at) : '—'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{selectedShift.closed_at ? fmtDate(selectedShift.closed_at) : 'Still active'}</p>
                      </div>
                      <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/80">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-300">Duration</p>
                        <p className="mt-2 text-base font-black text-gray-900 dark:text-white">{duration(selectedShift.opened_at, selectedShift.closed_at)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Shift span</p>
                      </div>
                      <div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-900/20">
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Orders In Report</p>
                        <p className="mt-2 text-base font-black text-amber-800 dark:text-amber-200">{shiftTransactions.length}</p>
                        <p className="text-xs text-amber-700/80 dark:text-amber-300/80">Included in PDF and CSV export</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900/40">
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-gray-400">Cash Drawer</p>
                    <div className="mt-5 space-y-4">
                      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 dark:bg-gray-800">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Opening Amount</span>
                        <span className="font-black text-gray-900 dark:text-white">{fmt(selectedShift.opening_amount)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 dark:bg-gray-800">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Expected Closing</span>
                        <span className="font-black text-gray-900 dark:text-white">{fmt(selectedShift.expected_closing_amount)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 dark:bg-gray-800">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Actual Closing</span>
                        <span className="font-black text-gray-900 dark:text-white">{fmt(selectedShift.actual_closing_amount)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 dark:bg-gray-800">
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                          {selectedShift.status === 'closed'
                            ? (selectedShift.difference || 0) === 0 ? 'Balanced' : (selectedShift.difference || 0) > 0 ? 'Overage' : 'Shortage'
                            : 'Difference'}
                        </span>
                        <span className={`text-lg font-black ${
                          selectedShift.status !== 'closed'
                            ? 'text-gray-400'
                            : (selectedShift.difference || 0) === 0 ? 'text-green-600' : (selectedShift.difference || 0) > 0 ? 'text-blue-600' : 'text-red-600'
                        }`}>
                          {selectedShift.status === 'closed'
                            ? `${(selectedShift.difference || 0) > 0 ? '+' : ''}${fmt(selectedShift.difference)}`
                            : 'Pending'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedShift.close_note ? (
                    <div className="rounded-3xl bg-yellow-50 p-5 shadow-sm dark:bg-yellow-900/20">
                      <p className="text-xs font-bold uppercase tracking-wider text-yellow-700 dark:text-yellow-300">Close Note</p>
                      <p className="mt-3 text-sm leading-6 text-yellow-900 dark:text-yellow-100">{selectedShift.close_note}</p>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900/30">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Close Note</p>
                      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No closing note was added for this shift.</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl bg-green-50 p-4 dark:bg-green-900/20">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <Banknote size={15} />
                      <span className="text-xs font-bold uppercase tracking-wider">Cash</span>
                    </div>
                    <p className="mt-2 text-lg font-black text-green-700 dark:text-green-300">{fmt(selectedShift.total_cash_sales)}</p>
                  </div>
                  <div className="rounded-2xl bg-blue-50 p-4 dark:bg-blue-900/20">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      <CreditCard size={15} />
                      <span className="text-xs font-bold uppercase tracking-wider">Card</span>
                    </div>
                    <p className="mt-2 text-lg font-black text-blue-700 dark:text-blue-300">{fmt(selectedShift.total_card_sales)}</p>
                  </div>
                  <div className="rounded-2xl bg-violet-50 p-4 dark:bg-violet-900/20">
                    <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
                      <QrCode size={15} />
                      <span className="text-xs font-bold uppercase tracking-wider">QR</span>
                    </div>
                    <p className="mt-2 text-lg font-black text-violet-700 dark:text-violet-300">{fmt(selectedShift.total_qr_sales)}</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-700/60">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                      <DollarSign size={15} />
                      <span className="text-xs font-bold uppercase tracking-wider">Other</span>
                    </div>
                    <p className="mt-2 text-lg font-black text-gray-800 dark:text-gray-100">{fmt(selectedShift.total_other_sales)}</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-900/20">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-300">
                      <TrendingUp size={15} />
                      <span className="text-xs font-bold uppercase tracking-wider">Total Sales</span>
                    </div>
                    <p className="mt-2 text-lg font-black text-amber-700 dark:text-amber-200">{fmt(selectedShift.total_sales)}</p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80">{selectedShift.total_orders} completed orders</p>
                  </div>
                </div>

              </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CashierShiftRecords;
