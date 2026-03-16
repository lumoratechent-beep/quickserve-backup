import React, { useState, useMemo } from 'react';
import { Order, OrderStatus } from '../src/types';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { Calendar, TrendingUp, TrendingDown, DollarSign, ShoppingBag, Users, Receipt, ChevronRight, Filter } from 'lucide-react';

interface Props {
  orders: Order[];
  currencySymbol: string;
  cashierName?: string;
}

type DateRange = '7d' | '30d' | '90d' | 'custom';

const COLORS = ['#D97706', '#F59E0B', '#92400E', '#B45309', '#78350F', '#FBBF24', '#FCD34D'];
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#22C55E',
  SERVED: '#3B82F6',
  PENDING: '#F59E0B',
  ONGOING: '#8B5CF6',
  CANCELLED: '#EF4444',
};

const DashboardReport: React.FC<Props> = ({ orders, currencySymbol, cashierName }) => {
  const today = new Date();
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => today.toISOString().split('T')[0]);

  const { startDate, endDate } = useMemo(() => {
    if (dateRange === 'custom') {
      return { startDate: new Date(customStart), endDate: new Date(customEnd + 'T23:59:59') };
    }
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const start = new Date(); start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: new Date() };
  }, [dateRange, customStart, customEnd]);

  const filteredOrders = useMemo(
    () => orders.filter(o => {
      const t = new Date(o.timestamp);
      return t >= startDate && t <= endDate;
    }),
    [orders, startDate, endDate],
  );

  // Previous period for comparison
  const prevPeriodOrders = useMemo(() => {
    const duration = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - duration);
    const prevEnd = new Date(startDate.getTime() - 1);
    return orders.filter(o => {
      const t = new Date(o.timestamp);
      return t >= prevStart && t <= prevEnd;
    });
  }, [orders, startDate, endDate]);

  // KPI calculations
  const kpis = useMemo(() => {
    const completed = filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED);
    const prevCompleted = prevPeriodOrders.filter(o => o.status !== OrderStatus.CANCELLED);

    const totalSales = completed.reduce((s, o) => s + o.total, 0);
    const prevTotalSales = prevCompleted.reduce((s, o) => s + o.total, 0);

    const totalOrders = completed.length;
    const prevTotalOrders = prevCompleted.length;

    const avgOrder = totalOrders > 0 ? totalSales / totalOrders : 0;
    const prevAvg = prevTotalOrders > 0 ? prevTotalSales / prevTotalOrders : 0;

    const cancelled = filteredOrders.filter(o => o.status === OrderStatus.CANCELLED).length;
    const prevCancelled = prevPeriodOrders.filter(o => o.status === OrderStatus.CANCELLED).length;

    const pct = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;

    return {
      totalSales, totalOrders, avgOrder, cancelled,
      salesChange: pct(totalSales, prevTotalSales),
      ordersChange: pct(totalOrders, prevTotalOrders),
      avgChange: pct(avgOrder, prevAvg),
      cancelledChange: pct(cancelled, prevCancelled),
    };
  }, [filteredOrders, prevPeriodOrders]);

  // Payment method breakdown (transaction types)
  const paymentData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED).forEach(o => {
      const method = o.paymentMethod || 'Cash';
      map[method] = (map[method] || 0) + 1;
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map).map(([name, value]) => ({
      name,
      value,
      pct: total > 0 ? ((value / total) * 100).toFixed(1) : '0',
    }));
  }, [filteredOrders]);

  // Daily sales for bar chart
  const dailySales = useMemo(() => {
    const map: Record<string, { date: string; sales: number; orders: number }> = {};
    filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED).forEach(o => {
      const d = new Date(o.timestamp);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!map[key]) map[key] = { date: key, sales: 0, orders: 0 };
      map[key].sales += o.total;
      map[key].orders += 1;
    });
    return Object.values(map).sort((a, b) => {
      const da = new Date(a.date + ', ' + today.getFullYear());
      const db = new Date(b.date + ', ' + today.getFullYear());
      return da.getTime() - db.getTime();
    });
  }, [filteredOrders]);

  // Cashier performance
  const cashierStats = useMemo(() => {
    const map: Record<string, { name: string; orders: number; revenue: number; avgOrder: number }> = {};
    filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED).forEach(o => {
      const name = o.cashierName || 'Unknown';
      if (!map[name]) map[name] = { name, orders: 0, revenue: 0, avgOrder: 0 };
      map[name].orders += 1;
      map[name].revenue += o.total;
    });
    return Object.values(map)
      .map(c => ({ ...c, avgOrder: c.orders > 0 ? c.revenue / c.orders : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders]);

  // Order status breakdown
  const statusData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => {
      map[o.status] = (map[o.status] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  // Recent orders (latest 10)
  const recentOrders = useMemo(
    () => [...filteredOrders]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10),
    [filteredOrders],
  );

  const ChangeIndicator = ({ value }: { value: number }) => {
    const isPositive = value >= 0;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2 py-0.5 ${
        isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
      }`}>
        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {isPositive ? '+' : ''}{value.toFixed(1)}%
      </span>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs font-bold text-white mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs text-gray-300">
            {p.name}: <span className="text-amber-400 font-bold">{p.name === 'sales' ? `${currencySymbol}${p.value.toFixed(2)}` : p.value}</span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white p-4 md:p-6 overflow-y-auto">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              Welcome{cashierName ? `, ${cashierName}` : ''}
            </h1>
            <p className="text-sm text-gray-400 mt-1">Good to see you again</p>
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {(['7d', '30d', '90d'] as DateRange[]).map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                  dateRange === range
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                    : 'bg-[#2a2a2a] text-gray-400 hover:bg-[#333] hover:text-white'
                }`}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
            <button
              onClick={() => setDateRange('custom')}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                dateRange === 'custom'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                  : 'bg-[#2a2a2a] text-gray-400 hover:bg-[#333] hover:text-white'
              }`}
            >
              Custom
            </button>
            {dateRange === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="bg-[#2a2a2a] border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <span className="text-gray-500 text-xs">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="bg-[#2a2a2a] border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* KPI Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total Sales */}
          <div className="bg-[#232323] rounded-2xl p-5 border border-gray-800 hover:border-gray-700 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600/20 flex items-center justify-center">
                  <DollarSign size={20} className="text-amber-500" />
                </div>
                <span className="text-sm font-bold text-gray-400">Total Sales</span>
              </div>
              <ChevronRight size={16} className="text-gray-600" />
            </div>
            <p className="text-2xl font-black">{currencySymbol}{kpis.totalSales.toFixed(2)}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-500">vs previous period</span>
              <ChangeIndicator value={kpis.salesChange} />
            </div>
          </div>

          {/* Total Orders */}
          <div className="bg-[#232323] rounded-2xl p-5 border border-gray-800 hover:border-gray-700 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
                  <ShoppingBag size={20} className="text-blue-400" />
                </div>
                <span className="text-sm font-bold text-gray-400">Total Orders</span>
              </div>
              <ChevronRight size={16} className="text-gray-600" />
            </div>
            <p className="text-2xl font-black">{kpis.totalOrders.toLocaleString()}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-500">vs previous period</span>
              <ChangeIndicator value={kpis.ordersChange} />
            </div>
          </div>

          {/* Average Order */}
          <div className="bg-[#232323] rounded-2xl p-5 border border-gray-800 hover:border-gray-700 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-600/20 flex items-center justify-center">
                  <Receipt size={20} className="text-green-400" />
                </div>
                <span className="text-sm font-bold text-gray-400">Avg. Order</span>
              </div>
              <ChevronRight size={16} className="text-gray-600" />
            </div>
            <p className="text-2xl font-black">{currencySymbol}{kpis.avgOrder.toFixed(2)}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-500">vs previous period</span>
              <ChangeIndicator value={kpis.avgChange} />
            </div>
          </div>

          {/* Cancelled */}
          <div className="bg-[#232323] rounded-2xl p-5 border border-gray-800 hover:border-gray-700 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/20 flex items-center justify-center">
                  <TrendingDown size={20} className="text-red-400" />
                </div>
                <span className="text-sm font-bold text-gray-400">Cancelled</span>
              </div>
              <ChevronRight size={16} className="text-gray-600" />
            </div>
            <p className="text-2xl font-black">{kpis.cancelled}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-500">vs previous period</span>
              <ChangeIndicator value={kpis.cancelledChange} />
            </div>
          </div>
        </div>

        {/* Middle Row: Payment Pie + Sales Bar + Cashier List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Payment Method Breakdown (Donut) */}
          <div className="bg-[#232323] rounded-2xl p-5 border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-amber-400">Transaction Types</h3>
            </div>
            {paymentData.length > 0 ? (
              <>
                <div className="flex justify-center">
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <Pie
                        data={paymentData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {paymentData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 shadow-xl">
                            <p className="text-xs font-bold text-white">{d.name}</p>
                            <p className="text-xs text-gray-300">{d.value} orders ({d.pct}%)</p>
                          </div>
                        );
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {paymentData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-gray-400 truncate">{d.name}</span>
                      <span className="text-xs font-bold text-white ml-auto">{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>
            )}
          </div>

          {/* Daily Sales Bar Chart */}
          <div className="bg-[#232323] rounded-2xl p-5 border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-amber-400">Sales Overview</h3>
            </div>
            {dailySales.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dailySales} barCategoryGap="20%">
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v => `${currencySymbol}${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="sales" fill="#D97706" radius={[6, 6, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-600 text-sm">No data</div>
            )}
          </div>

          {/* Cashier Performance */}
          <div className="bg-[#232323] rounded-2xl p-5 border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-amber-400">Cashier Performance</h3>
            </div>
            {cashierStats.length > 0 ? (
              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                {cashierStats.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-3 p-3 bg-[#2a2a2a] rounded-xl hover:bg-[#333] transition-all">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm ${
                      i === 0 ? 'bg-amber-600 text-white' : i === 1 ? 'bg-gray-500 text-white' : 'bg-gray-700 text-gray-300'
                    }`}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{c.name}</p>
                      <p className="text-[10px] text-gray-500">{c.orders} orders</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-amber-400">{currencySymbol}{c.revenue.toFixed(2)}</p>
                      <p className="text-[10px] text-gray-500">avg {currencySymbol}{c.avgOrder.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-600 text-sm">No data</div>
            )}
          </div>
        </div>

        {/* Bottom Row: Status Breakdown + Recent Orders */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Order Status Breakdown */}
          <div className="bg-[#232323] rounded-2xl p-5 border border-gray-800">
            <h3 className="text-sm font-bold text-amber-400 mb-4">Order Status</h3>
            {statusData.length > 0 ? (
              <div className="space-y-3">
                {statusData.map(s => {
                  const total = filteredOrders.length;
                  const pct = total > 0 ? (s.value / total) * 100 : 0;
                  return (
                    <div key={s.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold capitalize">{s.name.toLowerCase()}</span>
                        <span className="text-xs text-gray-400">{s.value} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 bg-[#333] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: STATUS_COLORS[s.name] || '#6B7280',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-600 text-sm">No data</div>
            )}
          </div>

          {/* Recent Orders Table */}
          <div className="lg:col-span-2 bg-[#232323] rounded-2xl p-5 border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-amber-400">Recent Orders</h3>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Filter size={12} /> Latest 10
              </div>
            </div>
            {recentOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="pb-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">No</th>
                      <th className="pb-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Order ID</th>
                      <th className="pb-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cashier</th>
                      <th className="pb-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Items</th>
                      <th className="pb-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Date</th>
                      <th className="pb-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="pb-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Payment</th>
                      <th className="pb-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order, idx) => (
                      <tr key={order.id} className="border-b border-gray-800/50 hover:bg-[#2a2a2a] transition-colors">
                        <td className="py-3 text-xs text-gray-400">{idx + 1}</td>
                        <td className="py-3 text-xs font-bold text-gray-300">#{order.id.slice(-6)}</td>
                        <td className="py-3 text-xs text-gray-300">{order.cashierName || '-'}</td>
                        <td className="py-3 text-xs text-gray-400 hidden md:table-cell truncate max-w-[150px]">
                          {order.items.map(i => i.name).join(', ')}
                        </td>
                        <td className="py-3 text-xs text-gray-400 hidden sm:table-cell">
                          {new Date(order.timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="py-3">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                            order.status === OrderStatus.COMPLETED ? 'bg-green-500/20 text-green-400' :
                            order.status === OrderStatus.SERVED ? 'bg-blue-500/20 text-blue-400' :
                            order.status === OrderStatus.PENDING ? 'bg-amber-500/20 text-amber-400' :
                            order.status === OrderStatus.ONGOING ? 'bg-purple-500/20 text-purple-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3 text-xs text-gray-300">{order.paymentMethod || '-'}</td>
                        <td className="py-3 text-xs font-bold text-amber-400 text-right">{currencySymbol}{order.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-600 text-sm">No orders in this period</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardReport;
