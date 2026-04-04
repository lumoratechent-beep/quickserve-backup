import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderStatus, ReportResponse } from '../src/types';
import { Calendar, Download, Search, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, CreditCard, Users } from 'lucide-react';

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
  onSelectOrder?: (order: Order) => void;
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
  onSelectOrder,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPayment, setFilterPayment] = useState<string>('ALL');
  const [filterCashier, setFilterCashier] = useState<string>('ALL');
  const [detailRange, setDetailRange] = useState<'today' | 'week' | 'month'>('month');

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
    return paginatedReports.filter(o => {
      if (filterStatus !== 'ALL' && o.status !== filterStatus) return false;
      if (filterPayment !== 'ALL' && (o.paymentMethod || '-') !== filterPayment) return false;
      if (filterCashier !== 'ALL' && (o.cashierName || '-') !== filterCashier) return false;
      return true;
    });
  }, [paginatedReports, filterStatus, filterPayment, filterCashier]);

  // Transaction type and cashier breakdowns from the current filtered data
  const nonCancelledOrders = useMemo(
    () => paginatedReports.filter(o => o.status !== OrderStatus.CANCELLED),
    [paginatedReports],
  );

  const detailTransactions = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    nonCancelledOrders.forEach(o => {
      const method = o.paymentMethod || '-';
      if (!map[method]) map[method] = { count: 0, total: 0 };
      map[method].count += 1;
      map[method].total += o.total;
    });
    return Object.entries(map).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
  }, [nonCancelledOrders]);

  const detailCashiers = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    nonCancelledOrders.forEach(o => {
      const name = o.cashierName || '-';
      if (!map[name]) map[name] = { count: 0, total: 0 };
      map[name].count += 1;
      map[name].total += o.total;
    });
    return Object.entries(map).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
  }, [nonCancelledOrders]);

  return (
    <div className="animate-in fade-in duration-500">
      <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Sales Report</h1>
      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">Financial performance and order history.</p>

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
        <button onClick={onDownloadReport} className="w-full md:w-auto px-6 py-2 bg-black text-white dark:bg-white dark:text-gray-900 rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-orange-500 transition-all"><Download size={16} /> Export CSV</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
        {/* Total Revenue */}
        <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Revenue</p>
          <p className="text-xl md:text-2xl font-black dark:text-white">RM{reportData?.summary.totalRevenue.toFixed(2) || '0.00'}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-black mt-1">{reportData?.summary.orderVolume || 0} orders</p>
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
                  <p className="text-sm font-black text-orange-500">RM{t.total.toFixed(2)}</p>
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
                  <p className="text-sm font-black text-orange-500">RM{c.total.toFixed(2)}</p>
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
              {filteredReports.map(report => (
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
                    {report.status === OrderStatus.CANCELLED ? 'RM0.00' : `RM${report.total.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2 overflow-x-auto py-2 no-print">
          <button onClick={() => onChangeCurrentPage(1)} disabled={currentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
            <ChevronFirst size={16} />
          </button>
          <button onClick={() => onChangeCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => onChangeCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === page ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                {page}
              </button>
            ))}
          </div>

          <button onClick={() => onChangeCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => onChangeCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
            <ChevronLast size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default StandardReport;
