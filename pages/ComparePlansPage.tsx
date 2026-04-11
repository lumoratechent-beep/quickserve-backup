import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { PRICING_PLANS } from '../lib/pricingPlans';

interface Props {
  onBack: () => void;
  onGetStarted?: () => void;
}

const ComparePlansPage: React.FC<Props> = ({ onBack, onGetStarted }) => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
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
        <div className="max-w-6xl mx-auto px-4 py-10 md:py-16">
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">
              Compare Plans
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium text-sm md:text-base max-w-lg mx-auto">
              Find the perfect plan for your restaurant. See what each tier includes.
            </p>
          </div>

          {/* Plan overview cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-12">
            {PRICING_PLANS.map(plan => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 p-6 bg-white dark:bg-gray-800 transition-all ${
                  plan.highlight
                    ? 'border-orange-500 shadow-lg shadow-orange-500/10'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-orange-500 text-white text-[10px] font-black uppercase tracking-wider rounded-full">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">{plan.name}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-xs mt-1 mb-4">{plan.description}</p>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-black text-gray-900 dark:text-white">${plan.price}</span>
                  <span className="text-gray-400 text-sm font-medium">/mo</span>
                </div>
                <ul className="space-y-2">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <span className="text-orange-500 mt-0.5 shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Comparison table placeholder */}
          <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white/50 dark:bg-gray-800/50 p-10 md:p-16 text-center">
            <p className="text-gray-400 dark:text-gray-500 font-bold text-sm uppercase tracking-wider">
              Detailed Comparison Table
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
              Coming soon — a full feature-by-feature breakdown across all plans.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComparePlansPage;
