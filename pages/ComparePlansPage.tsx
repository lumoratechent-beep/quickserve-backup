import React, { useLayoutEffect, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, Info, Minus } from 'lucide-react';
import { PRICING_PLANS } from '../lib/pricingPlans';

interface Props {
  onBack: () => void;
  onGetStarted?: () => void;
  embeddedInPos?: boolean;
}

type PlanKey = 'basic' | 'pro' | 'proPlus';
type ComparisonValue = boolean | string;

interface ComparisonRow {
  feature: string;
  note?: string;
  basic: ComparisonValue;
  pro: ComparisonValue;
  proPlus: ComparisonValue;
}

interface ComparisonSection {
  title: string;
  rows: ComparisonRow[];
}

const PLAN_META = {
  basic: {
    id: 'basic' as const,
    name: 'Basic',
    eyebrow: 'Counter POS',
    bestFor: 'Stalls, kiosks and simple counter service',
  },
  pro: {
    id: 'pro' as const,
    name: 'Pro',
    eyebrow: 'Digital Ordering',
    bestFor: 'Cafes and restaurants serving beyond the counter',
  },
  proPlus: {
    id: 'pro_plus' as const,
    name: 'Pro Plus',
    eyebrow: 'Kitchen Automation',
    bestFor: 'Busy restaurants with kitchen preparation stations',
  },
} as const;

const COMPARISON_SECTIONS: ComparisonSection[] = [
  {
    title: 'POS & daily operations',
    rows: [
      { feature: 'Counter POS', basic: true, pro: true, proPlus: true },
      { feature: 'Receipt printing', basic: true, pro: true, proPlus: true },
      { feature: 'Menu items and variants', basic: true, pro: true, proPlus: true },
      { feature: 'Promotions and discounts', basic: true, pro: true, proPlus: true },
      { feature: 'Ingredients and supplies', basic: true, pro: true, proPlus: true },
      { feature: 'Cashier shifts', basic: true, pro: true, proPlus: true },
      { feature: 'Permissions and refund approval', basic: true, pro: true, proPlus: true },
    ],
  },
  {
    title: 'Digital ordering',
    rows: [
      { feature: 'QR table ordering', basic: false, pro: true, proPlus: true },
      { feature: 'Tableside staff ordering', basic: false, pro: true, proPlus: true },
      { feature: 'Online ordering page', basic: false, pro: true, proPlus: true },
      { feature: 'Order accept or reject', basic: false, pro: true, proPlus: true },
      { feature: 'Customer order tracking', basic: false, pro: true, proPlus: true },
    ],
  },
  {
    title: 'Kitchen operations',
    rows: [
      { feature: 'Kitchen Display System', basic: false, pro: false, proPlus: true },
      { feature: 'Kitchen department routing', basic: false, pro: false, proPlus: true },
      { feature: 'Automatic kitchen routing', basic: false, pro: false, proPlus: true },
      { feature: 'Kitchen displays', basic: '—', pro: '—', proPlus: 'Up to 3' },
    ],
  },
  {
    title: 'Back Office — included in every plan',
    rows: [
      { feature: 'Dashboard and detailed sales reports', basic: true, pro: true, proPlus: true },
      { feature: 'Items, ingredients and stock', basic: true, pro: true, proPlus: true },
      { feature: 'Purchase and transfer orders', basic: true, pro: true, proPlus: true },
      { feature: 'Stock adjustments and counts', basic: true, pro: true, proPlus: true },
      { feature: 'Production and inventory history', basic: true, pro: true, proPlus: true },
      { feature: 'Inventory valuation', basic: true, pro: true, proPlus: true },
      { feature: 'Suppliers and customers', basic: true, pro: true, proPlus: true },
      { feature: 'Staff directory and departments', basic: true, pro: true, proPlus: true },
      { feature: 'Leave, payslips and claims', basic: true, pro: true, proPlus: true },
      { feature: 'Expenses and finance tools', basic: true, pro: true, proPlus: true },
    ],
  },
  {
    title: 'Usage, reports & support',
    rows: [
      { feature: 'Included outlets', note: 'Contact us when you need additional outlets.', basic: '1', pro: '1', proPlus: '1' },
      { feature: 'Operational users', note: 'POS, ordering, kitchen or Back Office users.', basic: 'Up to 3', pro: 'Up to 10', proPlus: 'Unlimited*' },
      { feature: 'Employee records and self-service', note: 'These do not count as operational users.', basic: 'Unlimited', pro: 'Unlimited', proPlus: 'Unlimited' },
      { feature: 'Visible report history', basic: '6 months', pro: '6 months', proPlus: '1 year' },
      { feature: 'Downloadable report data', note: 'Choose and download one calendar month per file.', basic: 'Past 3 months', pro: 'Past 6 months', proPlus: 'Past 1 year' },
      { feature: 'PDF report downloads', basic: true, pro: true, proPlus: true },
      { feature: 'Excel-compatible raw-data downloads', basic: true, pro: true, proPlus: true },
      { feature: 'Support', basic: 'Standard', pro: 'Priority', proPlus: 'Premium' },
    ],
  },
];

const PLAN_KEYS: PlanKey[] = ['basic', 'pro', 'proPlus'];

const ComparisonIntro: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div className={`relative flex flex-col overflow-hidden ${compact ? 'p-3 sm:p-4' : 'min-h-[156px]'}`}>
    <div className="relative">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">Compare plans</p>
      <h2 className={`${compact ? 'mt-1.5 max-w-md text-xl sm:text-[22px]' : 'mt-2 max-w-[240px] text-2xl'} font-black leading-tight tracking-[-0.035em] text-gray-950 dark:text-white`}>
        Choose what fits your operation
      </h2>
      <p className={`${compact ? 'mt-1.5 max-w-lg leading-4' : 'mt-2 max-w-[230px] leading-5'} text-[11px] font-medium text-gray-500 dark:text-gray-400`}>
        Review every feature across Basic, Pro and Pro Plus.
      </p>

      <div className={`${compact ? 'mt-2.5' : 'mt-3'} flex flex-wrap items-center gap-x-4 gap-y-2 text-[9px] font-bold text-gray-600 dark:text-gray-300`}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white"><Check size={12} strokeWidth={3} /></span>
          Included
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800"><Minus size={11} strokeWidth={2.5} /></span>
          Not included
        </span>
      </div>
    </div>
  </div>
);

const ComparePlansPage: React.FC<Props> = ({ onBack, onGetStarted, embeddedInPos = false }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  const getPrice = (planKey: PlanKey) => {
    const plan = PRICING_PLANS.find(item => item.id === PLAN_META[planKey].id);
    if (!plan) return 0;
    return billingCycle === 'annual' ? plan.annualPrice : plan.price;
  };

  const renderValue = (value: ComparisonValue) => {
    if (value === true) {
      return (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" aria-label="Included">
          <Check size={12} strokeWidth={3} />
        </span>
      );
    }
    if (value === false || value === '—') {
      return <span className="text-xs font-semibold text-gray-300 dark:text-gray-600" aria-label="Not included">—</span>;
    }
    return <span className="text-[11px] font-bold text-gray-800 dark:text-gray-100 sm:text-xs">{value}</span>;
  };

  return (
    <div className={`${embeddedInPos ? 'h-full overflow-y-auto' : 'min-h-screen'} bg-[#f7f6f3] font-sans text-gray-900 selection:bg-orange-100 selection:text-orange-900 dark:bg-gray-950 dark:text-white`}>
      {!embeddedInPos && <header className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f7f6f3]/90 backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-950/90">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 transition-colors hover:text-orange-600 dark:text-gray-400 dark:hover:text-orange-400">
            <ChevronLeft size={17} /> Back
          </button>
          <span className="text-sm font-black tracking-tight">Quick<span className="text-orange-500">Serve</span></span>
          {onGetStarted ? (
            <button onClick={onGetStarted} className="rounded-full bg-gray-950 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-orange-500 dark:bg-white dark:text-gray-950 dark:hover:bg-orange-500 dark:hover:text-white">
              Get started
            </button>
          ) : <span className="w-20" />}
        </div>
      </header>}

      <main>
        <section className="px-4 pb-9 pt-11 text-center landscape:pb-8 landscape:pt-8 sm:px-6 sm:pb-14 sm:pt-20">
          <div className="mx-auto max-w-3xl">
            <span className="inline-flex items-center text-[10px] font-black uppercase tracking-[0.22em] text-orange-600 dark:text-orange-400">
              Simple, transparent pricing
            </span>
            <h1 className="mt-4 text-3xl font-black tracking-[-0.045em] text-gray-950 dark:text-white landscape:text-4xl sm:mt-5 sm:text-6xl">
              One platform. <span className="text-orange-500">Three ways to serve.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-xs font-medium leading-5 text-gray-600 dark:text-gray-400 landscape:max-w-xl sm:mt-5 sm:text-base sm:leading-6">
              Start with a fast counter POS, add digital ordering when you are ready, or connect your entire kitchen. Complete Back Office is included throughout.
            </p>
            <div className="mt-6 inline-flex rounded-full border border-black/10 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-gray-900 sm:mt-7">
              <button onClick={() => setBillingCycle('monthly')} className={`rounded-full px-5 py-2 text-[11px] font-black transition-colors ${billingCycle === 'monthly' ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950' : 'text-gray-500 dark:text-gray-400'}`}>
                Monthly
              </button>
              <button onClick={() => setBillingCycle('annual')} className={`rounded-full px-5 py-2 text-[11px] font-black transition-colors ${billingCycle === 'annual' ? 'bg-orange-500 text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                Annual
              </button>
            </div>
            {billingCycle === 'annual' && <p className="mt-2 text-[10px] font-bold text-orange-600 dark:text-orange-400">Lower monthly rate, billed annually</p>}
          </div>
        </section>

        <section className="px-3 pb-16 sm:px-6 sm:pb-24">
          <div className="mx-auto mb-3 max-w-6xl overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-sm dark:border-white/[0.09] dark:bg-gray-900 lg:hidden">
            <ComparisonIntro compact />
          </div>

          <div className="mx-auto mb-2 flex max-w-6xl items-center justify-between px-1 lg:hidden">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-gray-400">Plan features</p>
            <p className="text-[9px] font-bold text-orange-600 dark:text-orange-400">Swipe to compare →</p>
          </div>

          <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_20px_70px_rgba(15,23,42,0.06)] dark:border-white/[0.09] dark:bg-gray-900 dark:shadow-none">
            <div className="overscroll-x-contain overflow-x-auto scroll-smooth">
              <table className="w-full min-w-[640px] table-fixed border-collapse sm:min-w-[720px] lg:min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="sticky left-0 z-20 w-[40%] bg-white px-3 py-3 text-left align-middle dark:bg-gray-900 sm:px-4 lg:w-[34%] lg:px-6 lg:py-6 lg:align-top">
                      <div className="lg:hidden">
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">Feature</p>
                        <p className="mt-1 text-xs font-black text-gray-900 dark:text-white">Plan inclusion</p>
                      </div>
                      <div className="hidden lg:block">
                        <ComparisonIntro />
                      </div>
                    </th>
                    {PLAN_KEYS.map(planKey => {
                      const plan = PLAN_META[planKey];
                      const isPopular = planKey === 'pro';
                      return (
                        <th key={planKey} className={`relative w-[20%] border-l border-gray-200 px-2 py-3 text-center align-middle dark:border-gray-700 lg:w-[22%] lg:px-3 lg:py-5 lg:align-bottom ${isPopular ? 'bg-orange-50/60 pt-7 dark:bg-orange-500/[0.06] lg:pt-9' : ''}`}>
                          {isPopular && <span className="absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-1 text-[7px] font-black uppercase tracking-widest text-white shadow-lg shadow-orange-500/30 lg:top-3 lg:px-4 lg:text-[8px]">Most Popular</span>}
                          <p className="hidden text-[9px] font-black uppercase tracking-[0.16em] text-gray-400 lg:block">{plan.eyebrow}</p>
                          <h2 className="mt-2 text-sm font-black text-gray-950 dark:text-white lg:mt-1 lg:text-base">{plan.name}</h2>
                          <p className="mt-0.5 text-base font-black tracking-tight text-gray-950 dark:text-white sm:text-lg lg:mt-1 lg:text-2xl">RM{getPrice(planKey)}<span className="text-[8px] font-bold text-gray-400 lg:text-[9px]">/mo</span></p>
                          <p className="mx-auto mt-2 hidden min-h-8 max-w-[145px] text-[9px] font-medium leading-4 text-gray-500 dark:text-gray-400 lg:block">{plan.bestFor}</p>
                          {onGetStarted && (
                            <button onClick={onGetStarted} className={`mt-3 hidden w-full rounded-lg px-2 py-2 text-[9px] font-black uppercase tracking-wider transition-colors lg:block ${isPopular ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-950 text-white hover:bg-orange-500 dark:bg-white dark:text-gray-950 dark:hover:bg-orange-500 dark:hover:text-white'}`}>
                              Choose {plan.name}
                            </button>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {COMPARISON_SECTIONS.map(section => (
                  <tbody key={section.title}>
                    <tr>
                      <th colSpan={4} className="bg-[#f4f3f0] px-4 py-2 text-left text-[10px] font-black uppercase tracking-[0.12em] text-gray-700 dark:bg-gray-800 dark:text-gray-200 sm:px-6">
                        {section.title}
                      </th>
                    </tr>
                    {section.rows.map(row => (
                      <tr key={`${section.title}-${row.feature}`} className="group border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                        <th className="sticky left-0 z-10 bg-white px-4 py-2 text-left group-hover:bg-orange-50/30 dark:bg-gray-900 dark:group-hover:bg-orange-500/[0.03] sm:px-6">
                          <p className="text-[11px] font-semibold leading-4 text-gray-700 dark:text-gray-200 sm:text-xs">{row.feature}</p>
                          {row.note && <p className="mt-0.5 text-[9px] font-medium leading-3 text-gray-400 dark:text-gray-500">{row.note}</p>}
                        </th>
                        <td className="border-l border-gray-100 px-2 py-2 text-center group-hover:bg-orange-50/20 dark:border-gray-800 dark:group-hover:bg-orange-500/[0.02]">{renderValue(row.basic)}</td>
                        <td className="border-l border-gray-100 bg-orange-50/20 px-2 py-2 text-center group-hover:bg-orange-50/60 dark:border-gray-800 dark:bg-orange-500/[0.025] dark:group-hover:bg-orange-500/[0.05]">{renderValue(row.pro)}</td>
                        <td className="border-l border-gray-100 px-2 py-2 text-center group-hover:bg-orange-50/20 dark:border-gray-800 dark:group-hover:bg-orange-500/[0.02]">{renderValue(row.proPlus)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>

            <div className="flex items-start gap-2 border-t border-gray-200 bg-[#faf9f7] px-4 py-4 dark:border-gray-700 dark:bg-gray-900/70 sm:px-6">
              <Info size={14} className="mt-0.5 shrink-0 text-orange-500" />
              <div className="text-[10px] font-medium leading-4 text-gray-500 dark:text-gray-400">
                <p><strong className="text-gray-800 dark:text-gray-200">Need an older report?</strong> Contact QuickServe support for report history beyond your visible range, up to a maximum availability of 3 years.</p>
                <p className="mt-1">*Fair-use terms apply to unlimited operational users. Additional outlets can be arranged with our team.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 bg-gray-950 px-4 py-10 text-center text-white sm:px-6 sm:py-12">
          <div className="mx-auto max-w-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-400">Start when you are ready</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Run your restaurant with less friction.</h2>
            <p className="mx-auto mt-2 max-w-lg text-xs font-medium leading-5 text-white/55 sm:text-sm">No separate Back Office fee. No expensive hardware. Choose the workflow that fits your restaurant today.</p>
            {onGetStarted && (
              <button onClick={onGetStarted} className="mt-4 inline-flex items-center gap-2 rounded-full bg-orange-500 px-7 py-3 text-xs font-black uppercase tracking-wider text-white transition-all hover:bg-orange-600 hover:scale-[1.02]">
                Start free trial <ArrowRight size={15} />
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ComparePlansPage;
