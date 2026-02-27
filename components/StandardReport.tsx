import React from 'react';
import { Order, OrderStatus, ReportResponse } from '../src/types';
import { Calendar, Download, Search, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';

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
  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Sales Report</h1>
      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">Financial performance and order history.</p>

      <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm flex flex-col md:flex-row items-center gap-4 mb-6">
        <div className="flex-1 flex flex-col sm:flex-row gap-4 w-full">
          <div className="flex-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Period Selection</label>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-orange-500 shrink-0" />
              <input type="date" value={reportStart} onChange={(e) => onChangeReportStart(e.target.value)} className="flex-1 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5" />
              <span className="text-gray-400 font-black">to</span>
              <input type="date" value={reportEnd} onChange={(e) => onChangeReportEnd(e.target.value)} className="flex-1 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5" />
            </div>
          </div>
          <div className="w-full sm:w-48">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Order Outcome</label>
            <select value={reportStatus} onChange={(e) => onChangeReportStatus(e.target.value)} className="w-full p-1.5 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white appearance-none cursor-pointer">
              <option value="ALL">All Outcomes</option>
              <option value={OrderStatus.COMPLETED}>Paid/Finalized</option>
              <option value={OrderStatus.SERVED}>Served (Unpaid)</option>
              <option value={OrderStatus.CANCELLED}>Rejected</option>
            </select>
          </div>
        </div>
        <button onClick={onDownloadReport} className="w-full md:w-auto px-6 py-2 bg-black text-white dark:bg-white dark:text-gray-900 rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-orange-500 transition-all"><Download size={16} /> Export CSV</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Revenue</p>
          <p className="text-xl md:text-2xl font-black dark:text-white">RM{reportData?.summary.totalRevenue.toFixed(2) || '0.00'}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Order Volume</p>
          <p className="text-xl md:text-2xl font-black dark:text-white">{reportData?.summary.orderVolume || 0}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Efficiency</p>
          <p className="text-xl md:text-2xl font-black text-green-500">{reportData?.summary.efficiency || 0}%</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search Order ID..." value={reportSearchQuery} onChange={(e) => onChangeReportSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-black dark:text-white outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Show</span>
            <select value={entriesPerPage} onChange={(e) => onChangeEntriesPerPage(Number(e.target.value))} className="bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5 outline-none cursor-pointer">
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Entries</span>
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
                <th className="px-4 py-3 text-right">Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {paginatedReports.map(report => (
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
                  <td className="px-4 py-2 text-right font-black dark:text-white text-xs">RM{report.total.toFixed(2)}</td>
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
