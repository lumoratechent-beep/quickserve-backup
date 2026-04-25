import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderStatus, ReportResponse, CashierShift } from '../src/types';
import { Calendar, Download, Search, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, CreditCard, Users, FileText } from 'lucide-react';

interface Props {
  reportStart: string;
  reportEnd: string;
  reportStatus: string;
  reportSearchQuery: string;
  entriesPerPage: number;
  currentPage: number;
  totalPages: number;
  paginatedReports: Order[];
  reportData: ReportResponse | null;
  onChangeReportStart: (value: string) => void;
  onChangeReportEnd: (value: string) => void;
  onChangeReportStatus: (value: string) => void;
  onChangeReportSearchQuery: (value: string) => void;
  onChangeEntriesPerPage: (value: number) => void;
  onChangeCurrentPage: (value: number | ((prev: number) => number)) => void;
  onDownloadReport: () => void;
  onDownloadPDF?: () => void;
  isDownloadingPDF?: boolean;
  onSelectOrder?: (order: Order) => void;
  title?: string;
  description?: string;
  activeShift?: CashierShift | null;
  applyCurrentShiftFilter?: boolean;
}

const StandardReport: React.FC<Props> = ({
  reportStart,
  reportEnd,
  reportStatus,
  reportSearchQuery,
  entriesPerPage,
  currentPage,
  totalPages,
  paginatedReports,
  reportData,
  onChangeReportStart,
  onChangeReportEnd,
  onChangeReportStatus,
  onChangeReportSearchQuery,
  onChangeEntriesPerPage,
  onChangeCurrentPage,
  onDownloadReport,
  onDownloadPDF,
  isDownloadingPDF,
  onSelectOrder,
  title = "Sales Report",
  description = "Financial performance and order history.",
  activeShift,
  applyCurrentShiftFilter = false,
}) => {
  const [detailRange, setDetailRange] = useState<'today' | 'week' | 'month'>('month');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPayment, setFilterPayment] = useState<string>('ALL');
  const [filterCashier, setFilterCashier] = useState<string>('ALL');
  const isShiftReportWithoutActiveShift = applyCurrentShiftFilter && !activeShift;

  // Auto-set date pickers when range preset changes
  useEffect(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayStr = toLocal(now);
    if (detailRange === 'today') {
      onChangeReportStart(todayStr);
      onChangeReportEnd(todayStr);
    } else if (detailRange === 'week') {
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      onChangeReportStart(toLocal(startOfWeek));
      onChangeReportEnd(todayStr);
    } else {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      onChangeReportStart(toLocal(startOfMonth));
      onChangeReportEnd(todayStr);
    }
  }, [detailRange]);

  const uniquePayments = useMemo(() => {
    const set = new Set(paginatedReports.map(o => o.paymentMethod || '-'));
    return Array.from(set).sort();
  }, [paginatedReports]);

  const uniqueCashiers = useMemo(() => {
    const set = new Set(paginatedReports.map(o => o.cashierName || '-'));
    return Array.from(set).sort();
  }, [paginatedReports]);

  const filteredReports = useMemo(() => {
    if (isShiftReportWithoutActiveShift) return [];

    let filtered = paginatedReports;

    // Apply shift filtering only when explicitly enabled
    if (applyCurrentShiftFilter && activeShift) {
      const shiftStart = new Date(activeShift.opened_at).getTime();
      const shiftEnd = activeShift.closed_at ? new Date(activeShift.closed_at).getTime() : Date.now();
      filtered = filtered.filter(o => {
        const orderTime = new Date(o.timestamp).getTime();
        return orderTime >= shiftStart && orderTime <= shiftEnd;
      });
    }

    // Apply other filters
    return filtered.filter(o => {
      if (filterStatus !== 'ALL' && o.status !== filterStatus) return false;
      if (filterPayment !== 'ALL' && (o.paymentMethod || '-') !== filterPayment) return false;
      if (filterCashier !== 'ALL' && (o.cashierName || '-') !== filterCashier) return false;
      return true;
    });
  }, [paginatedReports, filterStatus, filterPayment, filterCashier, activeShift, applyCurrentShiftFilter, isShiftReportWithoutActiveShift]);

  // Calculate filtered total pages
  const filteredTotalPages = useMemo(() => {
    return Math.ceil(filteredReports.length / entriesPerPage);
  }, [filteredReports.length, entriesPerPage]);

  // Reset to page 1 if current page exceeds filtered total pages (only for shift filtering)
  useEffect(() => {
    if (applyCurrentShiftFilter && currentPage > filteredTotalPages && filteredTotalPages > 0) {
      onChangeCurrentPage(1);
    }
  }, [applyCurrentShiftFilter, currentPage, filteredTotalPages, onChangeCurrentPage]);

  // Calculate summary statistics - use filtered data only when shift filtering is applied
  const displaySummary = useMemo(() => {
    if (applyCurrentShiftFilter) {
      // Use filtered data for shift management
      const nonCancelled = filteredReports.filter(o => o.status !== OrderStatus.CANCELLED);
      const totalRevenue = nonCancelled.reduce((sum, o) => sum + o.total, 0);
      const orderVolume = nonCancelled.length;
      return { totalRevenue, orderVolume };
    } else {
      // Use original report data for sales report
      return {
        totalRevenue: reportData?.summary.totalRevenue || 0,
        orderVolume: reportData?.summary.orderVolume || 0
      };
    }
  }, [applyCurrentShiftFilter, filteredReports, reportData]);

  // Transaction type and cashier breakdowns
  const detailTransactions = useMemo(() => {
    if (applyCurrentShiftFilter) {
      // Compute from filtered data for shift management
      const nonCancelled = filteredReports.filter(o => o.status !== OrderStatus.CANCELLED);
      const map: Record<string, { count: number; total: number }> = {};
      nonCancelled.forEach(o => {
        const method = o.paymentMethod || '-';
        if (!map[method]) map[method] = { count: 0, total: 0 };
        map[method].count += 1;
        map[method].total += o.total;
      });
      return Object.entries(map).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
    } else {
      // Use original report data for sales report
      return reportData?.summary?.byTransactionType || [];
    }
  }, [applyCurrentShiftFilter, filteredReports, reportData]);

  const detailCashiers = useMemo(() => {
    if (applyCurrentShiftFilter) {
      // Compute from filtered data for shift management
      const nonCancelled = filteredReports.filter(o => o.status !== OrderStatus.CANCELLED);
      const map: Record<string, { count: number; total: number }> = {};
      nonCancelled.forEach(o => {
        const name = o.cashierName || '-';
        if (!map[name]) map[name] = { count: 0, total: 0 };
        map[name].count += 1;
        map[name].total += o.total;
      });
      return Object.entries(map).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
    } else {
      // Use original report data for sales report
      return reportData?.summary?.byCashier || [];
    }
  }, [applyCurrentShiftFilter, filteredReports, reportData]);

  return (
    <div className="animate-in fade-in duration-500">
      <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">{title}</h1>
      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">{description}</p>
      {isShiftReportWithoutActiveShift && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
            No active shift. Open your shift to view shift transactions.
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm flex flex-col md:flex-row items-center gap-4 mb-6">
        <div className="flex-1 flex flex-col sm:flex-row gap-4 w-full">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Period Selection</label>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              {(['today', 'week', 'month'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setDetailRange(range)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                    detailRange === range
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {range === 'today' ? "Today" : range === 'week' ? 'This Week' : 'This Month'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Custom Range</label>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-orange-500 shrink-0" />
              <input type="date" value={reportStart} onChange={(e) => { onChangeReportStart(e.target.value); }} className="flex-1 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5" />
              <span className="text-gray-400 font-black">to</span>
              <input type="date" value={reportEnd} onChange={(e) => { onChangeReportEnd(e.target.value); }} className="flex-1 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={onDownloadReport} className="flex-1 md:flex-none px-6 py-2 bg-black text-white dark:bg-white dark:text-gray-900 rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-orange-500 transition-all"><Download size={16} /> Export CSV</button>
          {onDownloadPDF && <button onClick={onDownloadPDF} disabled={isDownloadingPDF} className={`flex-1 md:flex-none px-6 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${isDownloadingPDF ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'} text-white`}>{isDownloadingPDF ? (<><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Generating...</>) : (<><FileText size={16} /> Download PDF</>)}</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
        {/* Total Revenue */}
        <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Revenue</p>
          <p className="text-xl md:text-2xl font-black dark:text-white">RM{displaySummary.totalRevenue.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-black mt-1">{displaySummary.orderVolume} orders</p>
        </div>

        {/* By Transaction Type */}
        <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-1.5 mb-2">
            <CreditCard size={12} className="text-orange-500" />
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">By Transaction Type</p>
          </div>
          {detailTransactions.length > 0 ? (
            <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
              {detailTransactions.map(t => (
                <div key={t.name} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div>
                    <p className="text-xs font-black dark:text-white">{t.name}</p>
                    <p className="text-[10px] text-gray-400 font-bold">{t.count} order{t.count !== 1 ? 's' : ''}</p>
                  </div>
                  <p className="text-sm font-black text-orange-500">RM{t.total.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-gray-400 text-center py-4">No transactions</p>
          )}
        </div>

        {/* By Cashier */}
        <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-1.5 mb-2">
            <Users size={12} className="text-orange-500" />
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">By Cashier</p>
          </div>
          {detailCashiers.length > 0 ? (
            <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
              {detailCashiers.map(c => (
                <div key={c.name} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                      <span className="text-[10px] font-black text-orange-600 dark:text-orange-400">{c.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-xs font-black dark:text-white">{c.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold">{c.count} order{c.count !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <p className="text-sm font-black text-orange-500">RM{c.total.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-gray-400 text-center py-4">No orders</p>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b dark:border-gray-700 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search Order ID..." value={reportSearchQuery} onChange={(e) => onChangeReportSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-black dark:text-white outline-none focus:ring-1 focus:ring-orange-500" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="py-2 px-3 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white outline-none cursor-pointer focus:ring-1 focus:ring-orange-500">
              <option value="ALL">All Status</option>
              <option value={OrderStatus.COMPLETED}>Paid</option>
              <option value={OrderStatus.SERVED}>Served</option>
              <option value={OrderStatus.PENDING}>Pending</option>
              <option value={OrderStatus.ONGOING}>Ongoing</option>
              <option value={OrderStatus.CANCELLED}>Cancelled</option>
            </select>
            <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)} className="py-2 px-3 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white outline-none cursor-pointer focus:ring-1 focus:ring-orange-500">
              <option value="ALL">All Payment</option>
              {uniquePayments.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterCashier} onChange={(e) => setFilterCashier(e.target.value)} className="py-2 px-3 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white outline-none cursor-pointer focus:ring-1 focus:ring-orange-500">
              <option value="ALL">All Cashier</option>
              {uniqueCashiers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Show</span>
              <select value={entriesPerPage} onChange={(e) => onChangeEntriesPerPage(Number(e.target.value))} className="bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5 outline-none cursor-pointer">
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Entries</span>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
              <tr>
                <th className="px-4 py-3 text-left">Order ID</th>
                <th className="px-4 py-3 text-left">Table</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Source</th>
                <th className="px-4 py-3 text-left">Dining Option</th>
                <th className="px-4 py-3 text-left">Payment</th>
                <th className="px-4 py-3 text-left">Cashier</th>
                <th className="px-4 py-3 text-right">Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {filteredReports.length > 0 ? (
                filteredReports.map(report => (
                  <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-2">
                      {onSelectOrder ? (
                        <button
                          onClick={() => onSelectOrder(report)}
                          className="text-[10px] font-black text-orange-500 hover:text-orange-600 uppercase tracking-widest underline decoration-dotted underline-offset-4"
                        >
                          {report.id}
                        </button>
                      ) : (
                        <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{report.id}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[10px] font-black text-gray-900 dark:text-white">#{report.tableNumber}</td>
                    <td className="px-4 py-2 text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-tighter">{new Date(report.timestamp).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase">{new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                        report.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-600' :
                        report.status === OrderStatus.SERVED ? 'bg-blue-100 text-blue-600' :
                        'bg-orange-100 text-orange-600'
                      }`}>
                        {report.status === OrderStatus.COMPLETED ? 'Paid' : report.status === OrderStatus.SERVED ? 'Served' : report.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase">
                        {report.orderSource === 'counter' ? 'Counter' :
                         report.orderSource === 'qr_order' ? 'QR Order' :
                         report.orderSource === 'tableside' ? 'Tableside' :
                         report.orderSource === 'online' ? 'Online' : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase">
                      {report.diningType || '-'}
                    </td>
                    <td className="px-4 py-2 text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase">{report.paymentMethod || '-'}</td>
                    <td className="px-4 py-2 text-[10px] font-black text-gray-700 dark:text-gray-300">{report.cashierName || '-'}</td>
                    <td className="px-4 py-2 text-right font-black dark:text-white text-xs">
                      {report.status === OrderStatus.CANCELLED ? 'RM0.00' : `RM${report.total.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">
                    {isShiftReportWithoutActiveShift ? 'No active shift. Please open shift to view transactions.' : 'No transactions found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(applyCurrentShiftFilter ? filteredTotalPages : totalPages) > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2 overflow-x-auto py-2 no-print">
          <button onClick={() => onChangeCurrentPage(1)} disabled={currentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
            <ChevronFirst size={16} />
          </button>
          <button onClick={() => onChangeCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-1">
            {(() => {
              const displayTotalPages = applyCurrentShiftFilter ? filteredTotalPages : totalPages;
              const maxVisible = 10;
              let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
              let end = start + maxVisible - 1;
              if (end > displayTotalPages) {
                end = displayTotalPages;
                start = Math.max(1, end - maxVisible + 1);
              }
              const pages: number[] = [];
              for (let i = start; i <= end; i++) pages.push(i);
              return pages;
            })().map(page => (
              <button
                key={page}
                onClick={() => onChangeCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === page ? 'bg-orange-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                {page}
              </button>
            ))}
          </div>

          <button onClick={() => onChangeCurrentPage((prev) => Math.min(applyCurrentShiftFilter ? filteredTotalPages : totalPages, prev + 1))} disabled={currentPage === (applyCurrentShiftFilter ? filteredTotalPages : totalPages)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => onChangeCurrentPage(applyCurrentShiftFilter ? filteredTotalPages : totalPages)} disabled={currentPage === (applyCurrentShiftFilter ? filteredTotalPages : totalPages)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
            <ChevronLast size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default StandardReport;
