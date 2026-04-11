import React, { useState } from 'react';
import { ChevronLeft, ArrowRight, ArrowDown, Monitor, QrCode, Tablet, ChefHat, CreditCard, CheckCircle2, XCircle, Users, ShoppingBag, Receipt, Clock } from 'lucide-react';
import { PRICING_PLANS } from '../lib/pricingPlans';

interface Props {
  onBack: () => void;
  onGetStarted?: () => void;
}

const PLAN_FLOWS = [
  {
    id: 'basic' as const,
    name: 'Basic',
    subtitle: 'Counter-Only POS',
    color: 'blue',
    accent: 'bg-blue-500',
    accentLight: 'bg-blue-50 dark:bg-blue-900/20',
    accentText: 'text-blue-600 dark:text-blue-400',
    accentBorder: 'border-blue-200 dark:border-blue-800',
    steps: [
      { icon: Users, label: 'Customer walks to counter', desc: 'Walk-in customer approaches the counter' },
      { icon: Monitor, label: 'Staff creates order on POS', desc: 'Cashier builds cart from menu on counter screen' },
      { icon: CreditCard, label: 'Process payment', desc: 'Cash, card, or QR payment recorded at checkout' },
      { icon: Receipt, label: 'Receipt auto-prints', desc: 'Thermal receipt prints automatically (if configured)' },
      { icon: CheckCircle2, label: 'Order completed instantly', desc: 'Order saved as COMPLETED — no status tracking needed' },
    ],
    summary: 'Straightforward counter service. Customer pays, order is done.',
    notIncluded: ['QR ordering', 'Tableside ordering', 'Kitchen display system', 'Order status tracking'],
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    subtitle: 'QR + Tableside Ordering',
    color: 'orange',
    accent: 'bg-orange-500',
    accentLight: 'bg-orange-50 dark:bg-orange-900/20',
    accentText: 'text-orange-600 dark:text-orange-400',
    accentBorder: 'border-orange-200 dark:border-orange-800',
    sources: [
      { icon: QrCode, label: 'QR Order', desc: 'Customer scans QR code at table and orders from their phone' },
      { icon: Tablet, label: 'Tableside Order', desc: 'Staff takes order on tablet at the table' },
      { icon: Monitor, label: 'Counter Order', desc: 'Walk-in customer — same instant flow as Basic' },
    ],
    steps: [
      { icon: ShoppingBag, label: 'Order arrives as PENDING', desc: 'QR & tableside orders appear in the order queue' },
      { icon: CheckCircle2, label: 'Staff accepts or rejects', desc: 'Counter staff reviews and accepts the order' },
      { icon: Clock, label: 'Status updates: Preparing → Served', desc: 'Staff updates status as order progresses' },
      { icon: CreditCard, label: 'Customer pays at counter', desc: 'Payment recorded when customer collects order' },
      { icon: CheckCircle2, label: 'Order completed', desc: 'Order marked COMPLETED with payment details' },
    ],
    summary: 'Multiple order sources flow into one queue. Counter staff manages the pipeline.',
    notIncluded: ['Kitchen display system', 'Auto kitchen routing'],
  },
  {
    id: 'pro_plus' as const,
    name: 'Pro Plus',
    subtitle: 'Full Kitchen Integration',
    color: 'purple',
    accent: 'bg-purple-500',
    accentLight: 'bg-purple-50 dark:bg-purple-900/20',
    accentText: 'text-purple-600 dark:text-purple-400',
    accentBorder: 'border-purple-200 dark:border-purple-800',
    sources: [
      { icon: QrCode, label: 'QR Order', desc: 'Customer self-order via phone' },
      { icon: Tablet, label: 'Tableside Order', desc: 'Staff tablet ordering' },
      { icon: Monitor, label: 'Counter Order', desc: 'Walk-in — instant flow as always' },
    ],
    steps: [
      { icon: ShoppingBag, label: 'Order arrives as PENDING', desc: 'All non-counter orders enter the system' },
      { icon: ChefHat, label: 'Kitchen Display receives order', desc: 'Orders auto-routed to kitchen screen by department' },
      { icon: Clock, label: 'Kitchen accepts & prepares', desc: 'Kitchen staff marks order as preparing' },
      { icon: CheckCircle2, label: 'Kitchen marks Ready', desc: 'Food is ready — status syncs to counter & customer' },
      { icon: CreditCard, label: 'Customer pays at counter', desc: 'Payment recorded at pickup or table' },
      { icon: CheckCircle2, label: 'Order completed', desc: 'Full lifecycle tracked from kitchen to customer' },
    ],
    summary: 'Orders route directly to kitchen. Department-based prep with real-time status sync everywhere.',
    notIncluded: [],
  },
];

const ComparePlansPage: React.FC<Props> = ({ onBack, onGetStarted }) => {
  const [expandedPlan, setExpandedPlan] = useState<string | null>('pro');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 font-semibold transition-colors text-sm"
          >
            <ChevronLeft size={18} />
            Back
          </button>
          {onGetStarted && (
            <button
              onClick={onGetStarted}
              className="px-5 py-2 rounded-full bg-orange-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-orange-600 transition-colors"
            >
              Get Started
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 md:py-14">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">
              Compare Plans
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium text-sm md:text-base max-w-md mx-auto">
              See how each plan handles orders — from counter to kitchen.
            </p>
          </div>

          {/* Quick summary bar */}
          <div className="grid grid-cols-3 gap-2 md:gap-4 mb-10">
            {PLAN_FLOWS.map(plan => {
              const planData = PRICING_PLANS.find(p => p.id === plan.id);
              return (
                <button
                  key={plan.id}
                  onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                  className={`relative rounded-xl border-2 p-3 md:p-4 text-left transition-all ${
                    expandedPlan === plan.id
                      ? `${plan.accentBorder} ${plan.accentLight} shadow-md`
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${plan.accent} mb-2`} />
                  <h3 className="text-sm md:text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{plan.name}</h3>
                  <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">{plan.subtitle}</p>
                  {planData && (
                    <p className="text-lg md:text-xl font-black text-gray-900 dark:text-white mt-2">
                      ${planData.price}<span className="text-xs text-gray-400 font-medium">/mo</span>
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Plan flows */}
          <div className="space-y-6">
            {PLAN_FLOWS.map(plan => {
              const isExpanded = expandedPlan === plan.id;

              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl border-2 overflow-hidden transition-all duration-300 ${
                    isExpanded
                      ? `${plan.accentBorder} shadow-lg`
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {/* Plan header */}
                  <button
                    onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                    className={`w-full flex items-center gap-3 px-5 py-4 transition-colors text-left ${
                      isExpanded ? `${plan.accentLight}` : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${plan.accent} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">{plan.name} Plan</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{plan.subtitle}</p>
                    </div>
                    <ChevronLeft size={18} className={`text-gray-400 transition-transform duration-200 ${isExpanded ? '-rotate-90' : 'rotate-180'}`} />
                  </button>

                  {/* Expanded flow */}
                  {isExpanded && (
                    <div className="bg-white dark:bg-gray-800 px-5 pb-6">
                      {/* Order sources (Pro/Pro Plus) */}
                      {'sources' in plan && plan.sources && (
                        <div className="mb-6 pt-2">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Order Sources</p>
                          <div className="flex flex-wrap gap-2">
                            {plan.sources.map((src, i) => (
                              <div
                                key={i}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${plan.accentBorder} ${plan.accentLight}`}
                              >
                                <src.icon size={14} className={plan.accentText} />
                                <div>
                                  <p className="text-xs font-bold text-gray-900 dark:text-white">{src.label}</p>
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{src.desc}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-center my-4">
                            <ArrowDown size={20} className={plan.accentText} />
                          </div>
                        </div>
                      )}

                      {/* Flow steps */}
                      <div className="relative">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                          {'sources' in plan ? 'QR & Tableside Flow' : 'Order Flow'}
                        </p>
                        <div className="space-y-0">
                          {plan.steps.map((step, i) => (
                            <div key={i} className="flex items-start gap-3 relative">
                              {/* Vertical line */}
                              {i < plan.steps.length - 1 && (
                                <div className={`absolute left-[15px] top-[30px] w-0.5 h-[calc(100%-6px)] ${plan.accent} opacity-20`} />
                              )}
                              {/* Icon */}
                              <div className={`w-[30px] h-[30px] rounded-full ${plan.accentLight} ${plan.accentBorder} border flex items-center justify-center shrink-0 relative z-10`}>
                                <step.icon size={14} className={plan.accentText} />
                              </div>
                              {/* Text */}
                              <div className="pb-4 pt-1">
                                <p className="text-sm font-bold text-gray-900 dark:text-white">{step.label}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{step.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Summary */}
                      <div className={`mt-4 p-3 rounded-lg ${plan.accentLight} border ${plan.accentBorder}`}>
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{plan.summary}</p>
                      </div>

                      {/* Not included */}
                      {plan.notIncluded.length > 0 && (
                        <div className="mt-4">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Not Included</p>
                          <div className="flex flex-wrap gap-1.5">
                            {plan.notIncluded.map((item, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/50 px-2.5 py-1 rounded-full">
                                <XCircle size={10} />
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Side-by-side quick comparison */}
          <div className="mt-12">
            <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight mb-4 text-center">Quick Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-3 px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b dark:border-gray-700">Feature</th>
                    <th className="text-center py-3 px-4 text-[10px] font-black text-blue-500 uppercase tracking-widest border-b dark:border-gray-700">Basic</th>
                    <th className="text-center py-3 px-4 text-[10px] font-black text-orange-500 uppercase tracking-widest border-b dark:border-gray-700">Pro</th>
                    <th className="text-center py-3 px-4 text-[10px] font-black text-purple-500 uppercase tracking-widest border-b dark:border-gray-700">Pro Plus</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600 dark:text-gray-300">
                  {[
                    { feature: 'Counter POS', basic: true, pro: true, proPlus: true },
                    { feature: 'Sales Reports', basic: true, pro: true, proPlus: true },
                    { feature: 'Menu Editor', basic: true, pro: true, proPlus: true },
                    { feature: 'Receipt Printing', basic: true, pro: true, proPlus: true },
                    { feature: 'QR Ordering', basic: false, pro: true, proPlus: true },
                    { feature: 'Tableside Ordering', basic: false, pro: true, proPlus: true },
                    { feature: 'Online Shop', basic: false, pro: true, proPlus: true },
                    { feature: 'Order Accept / Reject', basic: false, pro: true, proPlus: true },
                    { feature: 'Order Status Tracking', basic: false, pro: true, proPlus: true },
                    { feature: 'Kitchen Display System', basic: false, pro: false, proPlus: true },
                    { feature: 'Kitchen Department Routing', basic: false, pro: false, proPlus: true },
                    { feature: 'Auto Kitchen Routing', basic: false, pro: false, proPlus: true },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="py-2.5 px-4 text-xs font-semibold text-gray-700 dark:text-gray-300">{row.feature}</td>
                      <td className="py-2.5 px-4 text-center">
                        {row.basic
                          ? <CheckCircle2 size={16} className="text-blue-500 mx-auto" />
                          : <XCircle size={16} className="text-gray-300 dark:text-gray-600 mx-auto" />}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {row.pro
                          ? <CheckCircle2 size={16} className="text-orange-500 mx-auto" />
                          : <XCircle size={16} className="text-gray-300 dark:text-gray-600 mx-auto" />}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {row.proPlus
                          ? <CheckCircle2 size={16} className="text-purple-500 mx-auto" />
                          : <XCircle size={16} className="text-gray-300 dark:text-gray-600 mx-auto" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CTA */}
          {onGetStarted && (
            <div className="mt-12 text-center">
              <button
                onClick={onGetStarted}
                className="px-8 py-3 rounded-full bg-orange-500 text-white text-sm font-black uppercase tracking-wider hover:bg-orange-600 transition-colors inline-flex items-center gap-2"
              >
                Start Free Trial <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ComparePlansPage;
