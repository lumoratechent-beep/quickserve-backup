import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderStatus, ReportResponse, CashierShift } from '../src/types';
import type { PlanId } from '../src/types';
import { REPORT_HISTORY_LIMITS } from '../lib/pricingPlans';
import { getCalendarReportDateRange } from '../lib/reportDateRanges';
import {
  Download, Search, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, CreditCard, Users,
  Check, X, FileDown, FileText, Sheet, Info, ShieldCheck, CalendarDays, SlidersHorizontal,
  MoreVertical,
} from 'lucide-react';

export type ReportSectionKey = 'salesSummary' | 'dailyBreakdown' | 'hourlyDistribution' | 'byItem' | 'byCategory' | 'byEmployee' | 'byPayment' | 'byDiningOption' | 'transactions';
export type ReportDownloadInfoType = 'all' | 'summary' | 'transactions' | 'dailyBreakdown';
export type ReportDownloadFileType = 'excel' | 'pdf';
export type ExcelColumnKey = 'orderId' | 'date' | 'time' | 'status' | 'paymentMethod' | 'cashier' | 'table' | 'diningOption' | 'orderSource' | 'itemId' | 'sku' | 'item' | 'category' | 'options' | 'quantity' | 'unitPrice' | 'lineTotal' | 'orderTotal' | 'amountReceived' | 'change' | 'orderRemark' | 'itemRemark';

const excelColumnOptions: Array<{ key: ExcelColumnKey; label: string; description: string }> = [
  { key: 'orderId', label: 'Order ID', description: 'Unique order reference.' },
  { key: 'date', label: 'Date', description: 'Order date.' },
  { key: 'time', label: 'Time', description: 'Order time.' },
  { key: 'status', label: 'Status', description: 'Current order status.' },
  { key: 'paymentMethod', label: 'Payment Method', description: 'Payment type used.' },
  { key: 'cashier', label: 'Cashier', description: 'Cashier who handled it.' },
  { key: 'table', label: 'Table', description: 'Table reference.' },
  { key: 'diningOption', label: 'Dining Option', description: 'Dine-in or takeaway.' },
  { key: 'orderSource', label: 'Order Source', description: 'Origin of the order.' },
  { key: 'itemId', label: 'Item ID', description: 'Unique item reference.' },
  { key: 'sku', label: 'SKU', description: 'Item stock code.' },
  { key: 'item', label: 'Item', description: 'Sold item name.' },
  { key: 'category', label: 'Category', description: 'Item category.' },
  { key: 'options', label: 'Options', description: 'Variants and add-ons.' },
  { key: 'quantity', label: 'Quantity', description: 'Quantity sold.' },
  { key: 'unitPrice', label: 'Unit Price', description: 'Price per unit.' },
  { key: 'lineTotal', label: 'Line Total', description: 'Item line value.' },
  { key: 'orderTotal', label: 'Order Total', description: 'Full order value.' },
  { key: 'amountReceived', label: 'Amount Received', description: 'Customer payment.' },
  { key: 'change', label: 'Change', description: 'Change returned.' },
  { key: 'orderRemark', label: 'Order Remark', description: 'Order-level notes.' },
  { key: 'itemRemark', label: 'Item Remark', description: 'Item-level notes.' },
];
const allExcelColumnKeys = excelColumnOptions.map((option) => option.key);
const recommendedExcelColumnKeys: ExcelColumnKey[] = [
  'orderId', 'date', 'time', 'status', 'paymentMethod', 'cashier', 'table', 'diningOption',
  'item', 'category', 'options', 'quantity', 'unitPrice', 'lineTotal', 'orderTotal',
];

export interface ReportDownloadOptions {
  infoType?: ReportDownloadInfoType;
  sections?: ReportSectionKey[];
  excelColumns?: ExcelColumnKey[];
  downloadStartDate?: string;
  downloadEndDate?: string;
  fileType: ReportDownloadFileType;
  status?: string;
  search?: string;
  paymentMethod?: string;
  cashier?: string;
}

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
  onDownloadReport: (options: ReportDownloadOptions) => void | Promise<void>;
  isDownloadingReport?: boolean;
  onSelectOrder?: (order: Order) => void;
  title?: string;
  description?: string;
  showHeader?: boolean;
  activeShift?: CashierShift | null;
  applyCurrentShiftFilter?: boolean;
  isSidebarCollapsed?: boolean;
  planId?: PlanId;
  downloadOnly?: boolean;
  toolbarOnly?: boolean;
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
  isDownloadingReport,
  onSelectOrder,
  title = "Sales Report",
  description = "Financial performance and order history.",
  showHeader = true,
  activeShift,
  applyCurrentShiftFilter = false,
  planId = 'basic',
  downloadOnly = false,
  toolbarOnly = false,
}) => {
  const [detailRange, setDetailRange] = useState<'today' | 'week' | 'month' | 'lastMonth' | 'custom'>('month');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPayment, setFilterPayment] = useState<string>('ALL');
  const [filterCashier, setFilterCashier] = useState<string>('ALL');
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const reportSectionOptions = [
    { key: 'salesSummary' as const, label: 'Sales Summary', description: 'Overview of your sales performance.' },
    { key: 'dailyBreakdown' as const, label: 'Daily Sales Breakdown', description: 'Graph and table view of daily sales.' },
    { key: 'hourlyDistribution' as const, label: 'Hourly Sales Distribution', description: 'Graph and table view of hourly sales.' },
    { key: 'byItem' as const, label: 'By Item', description: 'Sales performance by individual items.' },
    { key: 'byCategory' as const, label: 'By Category', description: 'Sales performance by categories.' },
    { key: 'byEmployee' as const, label: 'By Employee', description: 'Sales performance by employees.' },
    { key: 'byPayment' as const, label: 'By Payment', description: 'Sales performance by payment methods.' },
    { key: 'byDiningOption' as const, label: 'By Dining Option', description: 'Dine-in, takeaway, and delivery sales.' },
  ];
  const allReportSectionKeys = reportSectionOptions.map((option) => option.key);
  const [downloadSections, setDownloadSections] = useState<ReportSectionKey[]>(allReportSectionKeys);
  const [excelColumns, setExcelColumns] = useState<ExcelColumnKey[]>(recommendedExcelColumnKeys);
  const [downloadFileType, setDownloadFileType] = useState<ReportDownloadFileType>('pdf');
  const maxDownloadHistoryMonths = REPORT_HISTORY_LIMITS[planId].downloadMonths;
  const [downloadMonthOffset, setDownloadMonthOffset] = useState(1);
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [showDateRangeModal, setShowDateRangeModal] = useState(false);
  const [draftReportStart, setDraftReportStart] = useState(reportStart);
  const [draftReportEnd, setDraftReportEnd] = useState(reportEnd);
  const [timeStartMinutes, setTimeStartMinutes] = useState(0);
  const [timeEndMinutes, setTimeEndMinutes] = useState(1439);
  const [draftTimeStartMinutes, setDraftTimeStartMinutes] = useState(0);
  const [draftTimeEndMinutes, setDraftTimeEndMinutes] = useState(1439);
  const isShiftReportWithoutActiveShift = applyCurrentShiftFilter && !activeShift;
  const showTopRangeAndExportControls = !applyCurrentShiftFilter;
  const hasCustomTimeRange = timeStartMinutes !== 0 || timeEndMinutes !== 1439;
  const periodOptions = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'custom', label: 'Custom Range' },
  ] as const;
  const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);
  const minuteOptions = Array.from({ length: 60 }, (_, minute) => minute);

  const formatMinuteToTime = (minutes: number) => {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  const formatDisplayDate = (value: string) => {
    if (!value) return '--';
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;
    return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
  };

  const downloadableMonths = useMemo(() => {
    const now = new Date();
    const toLocalDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return Array.from({ length: maxDownloadHistoryMonths }, (_, index) => {
      const offset = index + 1;
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
      return {
        offset,
        year: start.getFullYear(),
        label: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase(),
        start: toLocalDate(start),
        end: toLocalDate(end),
      };
    });
  }, [maxDownloadHistoryMonths]);
  const downloadDateRange = downloadableMonths.find((month) => month.offset === downloadMonthOffset) || downloadableMonths[0];

  useEffect(() => {
    setDownloadMonthOffset(1);
  }, [maxDownloadHistoryMonths]);

  const formatDisplayDateTime = (value: string) => {
    if (!value) return '--';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const day = parsed.getDate().toString().padStart(2, '0');
    const month = (parsed.getMonth() + 1).toString().padStart(2, '0');
    const year = parsed.getFullYear();
    const hour = parsed.getHours().toString().padStart(2, '0');
    const minute = parsed.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hour}:${minute}`;
  };

  const openNativeDatePicker = (
    event: React.MouseEvent<HTMLInputElement>
  ) => {
    const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
    if (!input.showPicker) return;
    try {
      input.showPicker();
    } catch {
      // Ignore NotAllowedError when the browser blocks picker opening.
    }
  };

  const getQuickDateRange = (range: 'today' | 'week' | 'month' | 'lastMonth') => {
    const { start, end } = getCalendarReportDateRange(range);
    return { start, end };
  };

  const detectQuickPreset = (start: string, end: string): 'today' | 'week' | 'month' | 'lastMonth' | null => {
    const presets: Array<'today' | 'week' | 'month' | 'lastMonth'> = ['today', 'week', 'month', 'lastMonth'];
    for (const preset of presets) {
      const range = getQuickDateRange(preset);
      if (range.start === start && range.end === end) return preset;
    }
    return null;
  };

  // Auto-set date pickers when range preset changes
  useEffect(() => {
    if (detailRange === 'custom') return;
    const range = getQuickDateRange(detailRange);
    onChangeReportStart(range.start);
    onChangeReportEnd(range.end);
    setTimeStartMinutes(0);
    setTimeEndMinutes(1439);
  }, [detailRange]);

  const revenuePeriodLabel = useMemo(() => {
    if (applyCurrentShiftFilter && activeShift) {
      return `Showing sales for current shift ${formatDisplayDateTime(activeShift.opened_at)} till now.`;
    }

    const timeLabel = hasCustomTimeRange ? `, ${formatMinuteToTime(timeStartMinutes)} - ${formatMinuteToTime(timeEndMinutes)}` : '';
    const preset = detailRange === 'custom' && hasCustomTimeRange ? null : detailRange === 'custom' ? detectQuickPreset(reportStart, reportEnd) : detailRange;
    if (preset === 'today') return `Showing sales for ${formatDisplayDate(reportStart)}.`;
    if (preset === 'week') return `Showing sales for ${formatDisplayDate(reportStart)} - ${formatDisplayDate(reportEnd)}.`;
    if (preset === 'month') return `Showing sales for ${formatDisplayDate(reportStart)} - ${formatDisplayDate(reportEnd)}.`;
    if (preset === 'lastMonth') return `Showing sales for ${formatDisplayDate(reportStart)} - ${formatDisplayDate(reportEnd)}.`;
    return `Showing sales for ${formatDisplayDate(reportStart)} - ${formatDisplayDate(reportEnd)}${timeLabel}.`;
  }, [applyCurrentShiftFilter, activeShift, detailRange, reportStart, reportEnd, hasCustomTimeRange, timeStartMinutes, timeEndMinutes]);

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
      const orderDate = new Date(o.timestamp);
      const orderMinutes = orderDate.getHours() * 60 + orderDate.getMinutes();
      if (orderMinutes < timeStartMinutes || orderMinutes > timeEndMinutes) return false;
      if (filterStatus !== 'ALL' && o.status !== filterStatus) return false;
      if (filterPayment !== 'ALL' && (o.paymentMethod || '-') !== filterPayment) return false;
      if (filterCashier !== 'ALL' && (o.cashierName || '-') !== filterCashier) return false;
      return true;
    });
  }, [paginatedReports, filterStatus, filterPayment, filterCashier, activeShift, applyCurrentShiftFilter, isShiftReportWithoutActiveShift, timeStartMinutes, timeEndMinutes]);

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

  const renderTimePicker = (
    value: number,
    onChange: (value: number) => void,
  ) => {
    const selectedHour = Math.floor(value / 60);
    const selectedMinute = value % 60;
    return (
      <div className="flex items-center gap-1.5">
        <select
          value={selectedHour}
          onChange={(e) => onChange(Number(e.target.value) * 60 + selectedMinute)}
          className="w-[4.25rem] bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-black dark:text-white p-2 outline-none focus:ring-1 focus:ring-orange-500"
          aria-label="Hour"
        >
          {hourOptions.map((hour) => (
            <option key={hour} value={hour}>{hour.toString().padStart(2, '0')}</option>
          ))}
        </select>
        <span className="text-xs font-black text-gray-400">:</span>
        <select
          value={selectedMinute}
          onChange={(e) => onChange(selectedHour * 60 + Number(e.target.value))}
          className="w-[4.25rem] bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-black dark:text-white p-2 outline-none focus:ring-1 focus:ring-orange-500"
          aria-label="Minute"
        >
          {minuteOptions.map((minute) => (
            <option key={minute} value={minute}>{minute.toString().padStart(2, '0')}</option>
          ))}
        </select>
      </div>
    );
  };

  const toggleDownloadSection = (section: ReportSectionKey) => {
    setDownloadSections((prev) => {
      if (prev.includes(section)) {
        return prev.filter((key) => key !== section);
      }
      return [...prev, section];
    });
  };

  const toggleExcelColumn = (column: ExcelColumnKey) => {
    setExcelColumns((prev) => prev.includes(column) ? prev.filter((key) => key !== column) : [...prev, column]);
  };

  const openDownloadModal = () => {
    setDownloadFileType('pdf');
    setDownloadSections(allReportSectionKeys);
    setExcelColumns(recommendedExcelColumnKeys);
    setDownloadMonthOffset(1);
    setShowSelectionMenu(false);
    setShowDownloadOptions(true);
  };

  const selectDownloadFileType = (type: ReportDownloadFileType) => {
    setShowSelectionMenu(false);
    if (type === downloadFileType) return;
    setDownloadFileType(type);
    if (type === 'pdf') setDownloadSections(allReportSectionKeys);
    else setExcelColumns(recommendedExcelColumnKeys);
  };

  return (
    <div className="animate-in fade-in duration-500">
      {showHeader && !downloadOnly && (
        <div className="mb-5">
          <h2 className="text-lg font-black mb-1 dark:text-white uppercase tracking-tighter">{title}</h2>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-widest">{description}</p>
        </div>
      )}
      {isShiftReportWithoutActiveShift && !downloadOnly && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
            No active shift. Open your shift to view shift transactions.
          </p>
        </div>
      )}

      {showTopRangeAndExportControls && (
        <div className={downloadOnly ? 'w-auto shrink-0' : 'bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-4 mb-6'}>
          {!downloadOnly && <div className="flex-1 w-full">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Period Selection</label>
              <div className="inline-flex max-w-full bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 overflow-x-auto hide-scrollbar">
                {periodOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      if (option.value === 'custom') {
                        setDraftReportStart(reportStart);
                        setDraftReportEnd(reportEnd);
                        setDraftTimeStartMinutes(timeStartMinutes);
                        setDraftTimeEndMinutes(timeEndMinutes);
                        setShowDateRangeModal(true);
                        return;
                      }
                      setDetailRange(option.value);
                    }}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                      detailRange === option.value
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
          </div>}
          <div className={downloadOnly ? 'w-full' : 'w-full md:w-auto md:min-w-[170px]'}>
            <label className="mb-1 ml-1 block whitespace-nowrap text-[10px] font-black uppercase tracking-widest text-gray-400">Download Report</label>
            <button
              onClick={openDownloadModal}
              disabled={isDownloadingReport}
              className={`w-full ${downloadOnly ? 'px-2' : 'px-6'} py-2 rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                isDownloadingReport
                  ? 'bg-orange-300 text-white cursor-not-allowed'
                  : 'bg-black text-white dark:bg-white dark:text-gray-900 hover:bg-orange-500'
              }`}
            >
              {isDownloadingReport ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Downloading...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Download
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {showDownloadOptions && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm md:p-6">
          <div className="flex h-[680px] max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700 md:px-6 md:py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${downloadFileType === 'pdf' ? 'bg-red-50 text-red-500 dark:bg-red-900/25' : 'bg-emerald-50 text-emerald-500 dark:bg-emerald-900/25'}`}>
                  <FileDown size={20} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-gray-900 dark:text-white md:text-lg">Download Sales Report</h3>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Select the sections to include and choose your file type.</p>
                </div>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                <select
                  value={downloadMonthOffset}
                  onChange={(event) => setDownloadMonthOffset(Number(event.target.value))}
                  className="h-9 w-[150px] rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-black uppercase tracking-wide text-gray-700 outline-none transition-colors focus:border-orange-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                  aria-label="Download report month"
                >
                  {Array.from(new Set(downloadableMonths.map((month) => month.year))).map((year) => (
                    <optgroup key={year} label={String(year)}>
                      {downloadableMonths.filter((month) => month.year === year).map((month) => (
                        <option key={month.offset} value={month.offset}>{month.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  onClick={() => setShowDownloadOptions(false)}
                  aria-label="Close download report"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
                >
                  <X size={19} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_280px] lg:grid-rows-1">
                <section className="report-selection-scrollbar min-h-0 overflow-x-hidden overflow-y-auto border-b border-gray-200 p-3 dark:border-gray-700 md:p-5 lg:border-b-0 lg:border-r">
                  {downloadFileType === 'pdf' ? (
                    <div key="pdf-options" className="report-format-slide-left">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Report Sections</p>
                        <div className="relative">
                          <button onClick={() => setShowSelectionMenu((prev) => !prev)} aria-label="PDF selection options" className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                            <MoreVertical size={18} />
                          </button>
                          {showSelectionMenu && (
                            <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                              <button onClick={() => { setDownloadSections(allReportSectionKeys); setShowSelectionMenu(false); }} className="w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-700 hover:bg-red-50 hover:text-red-600 dark:text-gray-200 dark:hover:bg-red-900/20">Select All</button>
                              <button onClick={() => { setDownloadSections([]); setShowSelectionMenu(false); }} className="w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-700 hover:bg-red-50 hover:text-red-600 dark:text-gray-200 dark:hover:bg-red-900/20">Deselect All</button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {reportSectionOptions.map((option) => {
                          const checked = downloadSections.includes(option.key);
                          return (
                            <button key={option.key} onClick={() => toggleDownloadSection(option.key)} className="flex min-h-[64px] items-center gap-2 rounded-xl border border-gray-200 bg-white p-2.5 text-left transition-colors hover:border-red-300 dark:border-gray-700 dark:bg-gray-800">
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-red-500 bg-red-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                                {checked && <Check size={11} strokeWidth={3} />}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[11px] font-black leading-4 text-gray-900 dark:text-white">{option.label}</span>
                                <span className="mt-0.5 hidden text-[9px] leading-3 text-gray-500 dark:text-gray-400 sm:block">{option.description}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div key="excel-options" className="report-format-slide-right">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Raw Data Columns</p>
                        <div className="relative">
                          <button onClick={() => setShowSelectionMenu((prev) => !prev)} aria-label="Excel column selection options" className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-emerald-50 hover:text-emerald-500 dark:hover:bg-emerald-900/20">
                            <MoreVertical size={18} />
                          </button>
                          {showSelectionMenu && (
                            <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                              <button onClick={() => { setExcelColumns(allExcelColumnKeys); setShowSelectionMenu(false); }} className="w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 dark:text-gray-200 dark:hover:bg-emerald-900/20">Select All</button>
                              <button onClick={() => { setExcelColumns([]); setShowSelectionMenu(false); }} className="w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 dark:text-gray-200 dark:hover:bg-emerald-900/20">Deselect All</button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                        {excelColumnOptions.map((option) => {
                          const checked = excelColumns.includes(option.key);
                          return (
                            <button key={option.key} onClick={() => toggleExcelColumn(option.key)} className="flex min-h-[58px] items-center gap-2 rounded-xl border border-gray-200 bg-white p-2.5 text-left transition-colors hover:border-emerald-300 dark:border-gray-700 dark:bg-gray-800">
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                                {checked && <Check size={11} strokeWidth={3} />}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[11px] font-black leading-4 text-gray-900 dark:text-white">{option.label}</span>
                                <span className="mt-0.5 hidden text-[9px] leading-3 text-gray-500 dark:text-gray-400 sm:block">{option.description}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>

                <aside className="shrink-0 p-3 dark:border-gray-700 md:p-5">
                  <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">File Type</p>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                    {(['pdf', 'excel'] as ReportDownloadFileType[]).map((type) => {
                      const selected = downloadFileType === type;
                      const TypeIcon = type === 'pdf' ? FileText : Sheet;
                      return (
                        <button
                          key={type}
                          onClick={() => selectDownloadFileType(type)}
                          className={`flex w-full items-center gap-2 rounded-xl border p-2.5 text-left transition-all ${
                            selected
                              ? type === 'pdf'
                                ? 'border-red-400 bg-red-50/70 shadow-sm dark:border-red-600 dark:bg-red-900/20'
                                : 'border-emerald-400 bg-emerald-50/70 shadow-sm dark:border-emerald-600 dark:bg-emerald-900/20'
                              : 'border-gray-200 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-800'
                          }`}
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? (type === 'pdf' ? 'border-red-500' : 'border-emerald-500') : 'border-gray-400'}`}>
                            {selected && <span className={`h-2.5 w-2.5 rounded-full ${type === 'pdf' ? 'bg-red-500' : 'bg-emerald-500'}`} />}
                          </span>
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${type === 'pdf' ? 'bg-red-50 text-red-500 dark:bg-red-900/20' : 'bg-emerald-50 text-emerald-500 dark:bg-emerald-900/20'}`}>
                            <TypeIcon size={16} />
                          </span>
                          <span>
                            <span className="block text-xs font-black uppercase text-gray-900 dark:text-white">{type}</span>
                            <span className="mt-0.5 hidden text-[9px] text-gray-500 dark:text-gray-400 sm:block">{type === 'pdf' ? 'Best for printing and sharing.' : 'Raw data for analysis.'}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 hidden gap-3 rounded-xl bg-blue-50/70 p-3 dark:bg-blue-900/15 lg:flex">
                    <Info size={17} className="mt-0.5 shrink-0 text-blue-500" />
                    <div>
                      <p className="text-xs font-black text-gray-900 dark:text-white">About the report</p>
                      <p className="mt-1 text-[10px] leading-4 text-gray-500 dark:text-gray-400">Data is generated from the selected date range and current report filters.</p>
                    </div>
                  </div>
                </aside>
              </div>
            </div>

            <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800 md:px-6">
              <div className="flex items-center justify-between gap-4">
                <div className="hidden min-w-0 gap-6 text-[10px] text-gray-500 dark:text-gray-400 md:flex md:items-center">
                  <div className="flex items-center gap-2">
                    <CalendarDays size={17} className="shrink-0" />
                    <span><span className="block font-bold">Download Range</span><span className="font-black text-orange-500 dark:text-orange-400">{formatDisplayDate(downloadDateRange.start)} – {formatDisplayDate(downloadDateRange.end)}</span></span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <SlidersHorizontal size={17} className="shrink-0" />
                    <span className="min-w-0"><span className="block font-bold">Filters</span><span className="block truncate font-black text-gray-700 dark:text-gray-200">{filterStatus === 'ALL' ? 'All Statuses' : filterStatus} · {filterCashier === 'ALL' ? 'All Cashiers' : filterCashier} · {filterPayment === 'ALL' ? 'All Payments' : filterPayment}</span></span>
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
                  <button
                    onClick={() => setShowDownloadOptions(false)}
                    className="rounded-xl border border-gray-300 px-5 py-2.5 text-xs font-black text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={(downloadFileType === 'pdf' ? downloadSections.length === 0 : excelColumns.length === 0) || isDownloadingReport}
                    onClick={async () => {
                      await onDownloadReport({
                        sections: downloadFileType === 'excel' ? ['transactions'] : downloadSections,
                        excelColumns: downloadFileType === 'excel' ? excelColumns : undefined,
                        downloadStartDate: downloadDateRange.start,
                        downloadEndDate: downloadDateRange.end,
                        fileType: downloadFileType,
                        status: filterStatus,
                        search: reportSearchQuery,
                        paymentMethod: filterPayment,
                        cashier: filterCashier,
                      });
                      setShowDownloadOptions(false);
                    }}
                    className={`flex w-[210px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${downloadFileType === 'pdf' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                  >
                    <Download size={15} />
                    {isDownloadingReport
                      ? 'Downloading...'
                      : downloadFileType === 'excel'
                        ? `Download ${excelColumns.length} Columns`
                        : `Download ${downloadSections.length} Selected`}
                  </button>
                </div>
              </div>
              <div className="mt-2 hidden items-center justify-center gap-2 border-t border-gray-100 pt-2 text-[9px] text-gray-400 dark:border-gray-700 md:flex">
                <ShieldCheck size={14} /> Your data is used only to generate this report.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={downloadOnly ? 'hidden' : undefined}>
      {showDateRangeModal && (
        <div className="fixed inset-0 z-[140] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 md:p-7 shadow-xl flex flex-col">
            <p className="text-sm font-black dark:text-white uppercase tracking-wider mb-1">Custom Range</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">
              Choose date and time range to filter report data.
            </p>

            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_max-content] gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">From Date</p>
                  <input
                    type="date"
                    value={draftReportStart}
                    onChange={(e) => setDraftReportStart(e.target.value)}
                    onClick={openNativeDatePicker}
                    className="w-full bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-black dark:text-white p-2"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">From Time</p>
                  {renderTimePicker(
                    draftTimeStartMinutes,
                    (next) => setDraftTimeStartMinutes(Math.min(next, draftTimeEndMinutes)),
                  )}
                </div>
              </div>
              <div className="flex items-center justify-center">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  To
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_max-content] gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">To Date</p>
                  <input
                    type="date"
                    value={draftReportEnd}
                    onChange={(e) => setDraftReportEnd(e.target.value)}
                    onClick={openNativeDatePicker}
                    className="w-full bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-black dark:text-white p-2"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">To Time</p>
                  {renderTimePicker(
                    draftTimeEndMinutes,
                    (next) => setDraftTimeEndMinutes(Math.max(next, draftTimeStartMinutes)),
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setDraftTimeStartMinutes(0);
                  setDraftTimeEndMinutes(1439);
                }}
                className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Reset Time
              </button>
              <button
                onClick={() => setShowDateRangeModal(false)}
                className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const nextStart = draftReportStart || reportStart;
                  const nextEnd = draftReportEnd || reportEnd;
                  if (nextStart <= nextEnd) {
                    onChangeReportStart(nextStart);
                    onChangeReportEnd(nextEnd);
                  } else {
                    onChangeReportStart(nextEnd);
                    onChangeReportEnd(nextStart);
                  }
                  setTimeStartMinutes(draftTimeStartMinutes);
                  setTimeEndMinutes(draftTimeEndMinutes);
                  setDetailRange('custom');
                  setShowDateRangeModal(false);
                }}
                className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-orange-500 text-white hover:bg-orange-600 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={toolbarOnly ? 'hidden' : undefined}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
        {/* Total Revenue */}
        <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Revenue</p>
          <p className="text-xl md:text-2xl font-black dark:text-white">RM{displaySummary.totalRevenue.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-black mt-1">{displaySummary.orderVolume} sales</p>
          <p className="text-[11px] text-orange-500 dark:text-orange-400 font-black mt-1">{revenuePeriodLabel}</p>
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
                <th className="px-4 py-3 text-center">Dining Option</th>
                <th className="px-4 py-3 text-center">Payment</th>
                <th className="px-4 py-3 text-center">Cashier</th>
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
                    <td className="px-4 py-2 text-center text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase">
                      {report.diningType || '-'}
                    </td>
                    <td className="px-4 py-2 text-center text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase">{report.paymentMethod || '-'}</td>
                    <td className="px-4 py-2 text-center text-[10px] font-black text-gray-700 dark:text-gray-300">{report.cashierName || '-'}</td>
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
      </div>
    </div>
  );
};

export default StandardReport;
