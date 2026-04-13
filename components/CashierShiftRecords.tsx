// components/CashierShiftRecords.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { CashierShift } from '../src/types';
import { toast } from './Toast';
import {
  Clock, Search, Filter, ChevronDown, ChevronRight, Calendar, DollarSign,
  Banknote, CreditCard, QrCode, TrendingUp, TrendingDown, CheckCircle2,
  AlertTriangle, User, X, Download, RefreshCw
} from 'lucide-react';

interface Props {
  restaurantId: string;
  currencySymbol: string;
}

const CashierShiftRecords: React.FC<Props> = ({ restaurantId, currencySymbol }) => {
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [selectedShift, setSelectedShift] = useState<CashierShift | null>(null);

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

  useEffect(() => { fetchShifts(); }, [restaurantId, statusFilter, dateRange]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return shifts;
    const q = searchQuery.toLowerCase();
    return shifts.filter(s =>
      s.cashier_name.toLowerCase().includes(q) ||
      (s.close_note || '').toLowerCase().includes(q)
    );
  }, [shifts, searchQuery]);

  const fmt = (v: number | undefined | null) => `${currencySymbol}${(v ?? 0).toFixed(2)}`;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const duration = (start: string, end?: string) => {
    const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  // ──── Summary stats ────
  const summary = useMemo(() => {
    const closed = filtered.filter(s => s.status === 'closed');
    const totalSales = closed.reduce((a, s) => a + (s.total_sales || 0), 0);
    const totalShorts = closed.reduce((a, s) => a + Math.min(0, s.difference || 0), 0);
    const totalOverage = closed.reduce((a, s) => a + Math.max(0, s.difference || 0), 0);
    return { count: filtered.length, closedCount: closed.length, totalSales, totalShorts, totalOverage };
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black dark:text-white flex items-center gap-2">
            <Clock size={22} className="text-amber-500" /> Cashier Shift Records
          </h2>
          <p className="text-sm text-gray-500 mt-1">{summary.count} shifts found &bull; {summary.closedCount} closed</p>
        </div>
        <button onClick={fetchShifts} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Refresh">
          <RefreshCw size={18} className={`dark:text-white ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary Cards */}
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

      {/* Filters */}
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
          onChange={e => setStatusFilter(e.target.value as any)}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={dateRange}
          onChange={e => setDateRange(e.target.value as any)}
          className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Shifts Table */}
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
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
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
                {filtered.map(shift => (
                  <tr key={shift.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => setSelectedShift(shift)}>
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
                      <ChevronRight size={16} className="text-gray-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──── Shift Detail Modal ──── */}
      {selectedShift && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50" onClick={() => setSelectedShift(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
              <div>
                <h3 className="text-lg font-black dark:text-white">Shift Detail</h3>
                <p className="text-xs text-gray-500">{selectedShift.cashier_name} &bull; {fmtDate(selectedShift.opened_at)}</p>
              </div>
              <button onClick={() => setSelectedShift(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="dark:text-white" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Timing */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 font-bold">Opened</p>
                  <p className="font-bold dark:text-white">{fmtTime(selectedShift.opened_at)}</p>
                  <p className="text-xs text-gray-400">{fmtDate(selectedShift.opened_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-bold">Closed</p>
                  <p className="font-bold dark:text-white">{selectedShift.closed_at ? fmtTime(selectedShift.closed_at) : '—'}</p>
                  {selectedShift.closed_at && <p className="text-xs text-gray-400">{fmtDate(selectedShift.closed_at)}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                <span className="text-sm font-bold text-gray-500 dark:text-gray-300">Duration</span>
                <span className="font-black dark:text-white">{duration(selectedShift.opened_at, selectedShift.closed_at)}</span>
              </div>

              {/* Sales Breakdown */}
              <h4 className="text-sm font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider pt-2">Sales Breakdown</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
                  <div className="flex items-center gap-2 text-green-600 mb-1"><Banknote size={14} /><span className="text-xs font-bold">Cash</span></div>
                  <p className="text-lg font-black text-green-700 dark:text-green-400">{fmt(selectedShift.total_cash_sales)}</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                  <div className="flex items-center gap-2 text-blue-600 mb-1"><CreditCard size={14} /><span className="text-xs font-bold">Card</span></div>
                  <p className="text-lg font-black text-blue-700 dark:text-blue-400">{fmt(selectedShift.total_card_sales)}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3">
                  <div className="flex items-center gap-2 text-purple-600 mb-1"><QrCode size={14} /><span className="text-xs font-bold">QR</span></div>
                  <p className="text-lg font-black text-purple-700 dark:text-purple-400">{fmt(selectedShift.total_qr_sales)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 mb-1"><DollarSign size={14} /><span className="text-xs font-bold">Other</span></div>
                  <p className="text-lg font-black text-gray-700 dark:text-gray-200">{fmt(selectedShift.total_other_sales)}</p>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-amber-600">Total Sales ({selectedShift.total_orders} orders)</p>
                  <p className="text-xl font-black text-amber-700 dark:text-amber-400">{fmt(selectedShift.total_sales)}</p>
                </div>
                <TrendingUp size={28} className="text-amber-400" />
              </div>

              {/* Cash Drawer */}
              {selectedShift.status === 'closed' && (
                <>
                  <h4 className="text-sm font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider pt-2">Cash Drawer</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Opening Amount</span>
                      <span className="font-bold dark:text-white">{fmt(selectedShift.opening_amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Expected Closing</span>
                      <span className="font-bold dark:text-white">{fmt(selectedShift.expected_closing_amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Actual Closing</span>
                      <span className="font-bold dark:text-white">{fmt(selectedShift.actual_closing_amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t dark:border-gray-700 pt-2">
                      <span className="font-bold text-gray-700 dark:text-gray-200">
                        {(selectedShift.difference || 0) === 0 ? 'Balanced' :
                         (selectedShift.difference || 0) > 0 ? 'Overage' : 'Shortage'}
                      </span>
                      <span className={`font-black text-lg ${
                        (selectedShift.difference || 0) === 0 ? 'text-green-600' :
                        (selectedShift.difference || 0) > 0 ? 'text-blue-600' : 'text-red-600'
                      }`}>
                        {(selectedShift.difference || 0) > 0 ? '+' : ''}{fmt(selectedShift.difference)}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Note */}
              {selectedShift.close_note && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-3">
                  <p className="text-xs font-bold text-yellow-600 mb-1">Note</p>
                  <p className="text-sm dark:text-yellow-200">{selectedShift.close_note}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t dark:border-gray-700">
              <button
                onClick={() => setSelectedShift(null)}
                className="w-full py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashierShiftRecords;
