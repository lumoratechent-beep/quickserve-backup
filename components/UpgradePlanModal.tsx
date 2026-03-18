import React, { useState } from 'react';
import { X, Check, ArrowRight, Loader2, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { PlanId, Subscription } from '../src/types';
import { PRICING_PLANS } from '../lib/pricingPlans';

interface Props {
  currentPlanId: PlanId;
  restaurantId: string;
  subscription: Subscription | null;
  onClose: () => void;
  onUpgraded: () => void;
}

const UpgradePlanModal: React.FC<Props> = ({ currentPlanId, restaurantId, subscription, onClose, onUpgraded }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState<PlanId | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>(
    subscription?.billing_interval === 'annual' ? 'annual' : 'monthly'
  );

  const annualSavePct = Math.round((1 - PRICING_PLANS[1].annualPrice / PRICING_PLANS[1].price) * 100);

  const handlePlanChange = async (newPlanId: PlanId) => {
    if (newPlanId === currentPlanId) return;
    setIsLoading(true);
    setLoadingPlanId(newPlanId);
    setError('');

    try {
      // If there's an active Stripe subscription, update it directly
      if (subscription?.stripe_subscription_id) {
        const res = await fetch('/api/stripe/upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId, newPlanId, billingInterval: billingCycle }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.action === 'checkout') {
            return handleCheckout(newPlanId);
          }
          setError(data.error || 'Plan change failed.');
          return;
        }
        onUpgraded();
      } else {
        return handleCheckout(newPlanId);
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
      setLoadingPlanId(null);
    }
  };

  const handleCheckout = async (planId: PlanId) => {
    setIsLoading(true);
    setLoadingPlanId(planId);
    setError('');

    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          planId,
          mode: 'subscription',
          source: 'upgrade',
          billingInterval: billingCycle,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create checkout.');
        return;
      }
      if (data.url) {
        setIsRedirecting(true);
        window.location.href = data.url;
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
      setLoadingPlanId(null);
    }
  };

  const planOrder: PlanId[] = ['basic', 'pro', 'pro_plus'];
  const currentIndex = planOrder.indexOf(currentPlanId);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* Redirecting overlay */}
      {isRedirecting && (
        <div className="absolute inset-0 z-[10000] flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
          <Loader2 size={40} className="animate-spin text-orange-500 mb-4" />
          <p className="text-sm font-black text-gray-700 dark:text-white uppercase tracking-widest">Redirecting to checkout...</p>
          <p className="text-[10px] text-gray-400 mt-1">Please wait while we set things up</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl lg:rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header with close button */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 pt-4 lg:pt-6 px-4 lg:px-6">
          <button onClick={onClose} className="absolute top-4 right-4 lg:top-6 lg:right-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X size={20} className="text-gray-500" />
          </button>

          <div className="text-center mb-3 lg:mb-5">
            <h1 className="text-2xl lg:text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">
              Change Your Plan
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium text-xs lg:text-sm">
              Current plan: <span className="text-orange-500 font-bold uppercase">{currentPlanId.replace('_', ' ')}</span>
              {subscription?.status === 'trialing' && (
                <span className="ml-2 text-green-500 font-bold">(Trial Active)</span>
              )}
            </p>

            {/* Monthly / Annual Toggle — same as registration */}
            <div className="inline-flex items-center mt-4 lg:mt-6 bg-gray-200 dark:bg-gray-700 rounded-full p-1">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 lg:px-6 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-bold transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-4 lg:px-6 py-1.5 lg:py-2 rounded-full text-xs lg:text-sm font-bold transition-all flex items-center gap-1.5 ${
                  billingCycle === 'annual'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                Annual
                <span className="text-[10px] lg:text-xs text-orange-500 font-black">Save {annualSavePct}%</span>
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-medium border border-red-100 dark:border-red-900/40">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-6">
            {PRICING_PLANS.map((plan, i) => {
              const isCurrent = plan.id === currentPlanId;
              const isUpgrade = i > currentIndex;
              const displayPrice = billingCycle === 'annual' ? plan.annualPrice : plan.price;
              const isThisPlanLoading = loadingPlanId === plan.id && isLoading;

              return (
                <div
                  key={plan.id}
                  className={`relative bg-white dark:bg-gray-800 rounded-2xl lg:rounded-3xl border-2 p-3 lg:p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer group flex flex-col ${
                    isCurrent
                      ? 'border-orange-500 shadow-lg shadow-orange-100 dark:shadow-orange-900/20'
                      : plan.highlight
                        ? 'border-orange-500 shadow-lg shadow-orange-100 dark:shadow-orange-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-orange-400'
                  }`}
                  onClick={() => !isCurrent && !isLoading && !isRedirecting && handlePlanChange(plan.id)}
                >
                  {isCurrent ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 lg:px-4 py-1 bg-orange-500 text-white text-[8px] lg:text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg whitespace-nowrap">
                      Current Plan ({subscription?.billing_interval === 'annual' ? 'Annual' : 'Monthly'})
                    </div>
                  ) : plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 lg:px-4 py-1 bg-orange-500 text-white text-[8px] lg:text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg whitespace-nowrap">
                      Most Popular
                    </div>
                  )}

                  <h3 className="text-sm lg:text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-0.5 lg:mb-1">
                    {plan.name}
                  </h3>

                  <p className="text-[9px] lg:text-xs text-gray-500 dark:text-gray-400 font-medium mb-2 lg:mb-4 line-clamp-2">
                    {plan.description}
                  </p>

                  {/* Price display */}
                  <div className="mb-1 lg:mb-2">
                    <div className="flex items-baseline gap-1 flex-wrap">
                      <span className="text-xl lg:text-3xl font-black text-orange-500">MYR {displayPrice}</span>
                      <span className="text-gray-400 font-bold text-[10px] lg:text-sm">/mo</span>
                    </div>
                    {billingCycle === 'annual' && (
                      <p className="text-[9px] lg:text-xs text-gray-400 font-medium mt-0.5">
                        Billed MYR {displayPrice * 12}/year
                      </p>
                    )}
                  </div>

                  <ul className="space-y-1 lg:space-y-2 mb-3 lg:mb-6 flex-1">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-1.5 lg:gap-3 text-[10px] lg:text-sm text-gray-600 dark:text-gray-300 font-medium">
                        <Check size={12} className="text-orange-500 shrink-0 mt-0.5 lg:w-4 lg:h-4" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    (() => {
                      const currentIsAnnual = subscription?.billing_interval === 'annual';
                      const selectedIsAnnual = billingCycle === 'annual';
                      const isSameInterval = currentIsAnnual === selectedIsAnnual;
                      const isThisPlanLoading2 = loadingPlanId === plan.id && isLoading;

                      return isSameInterval ? (
                        <button
                          disabled={isLoading || isRedirecting}
                          onClick={(e) => { e.stopPropagation(); handleCheckout(plan.id); }}
                          className="w-full py-2 lg:py-3 rounded-xl lg:rounded-2xl font-black text-[9px] lg:text-sm uppercase tracking-widest bg-orange-500 text-white shadow-xl shadow-orange-100 dark:shadow-none hover:bg-orange-600 hover:scale-[1.02] transition-all flex items-center justify-center gap-1 lg:gap-2 mt-auto disabled:opacity-50"
                        >
                          {isThisPlanLoading2 ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <><RefreshCw size={14} /> Renew Plan</>
                          )}
                        </button>
                      ) : (
                        <button
                          disabled={isLoading || isRedirecting}
                          onClick={(e) => { e.stopPropagation(); handleCheckout(plan.id); }}
                          className="w-full py-2 lg:py-3 rounded-xl lg:rounded-2xl font-black text-[9px] lg:text-sm uppercase tracking-widest bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-orange-500 hover:text-white hover:scale-[1.02] transition-all flex items-center justify-center gap-1 lg:gap-2 mt-auto disabled:opacity-50"
                        >
                          {isThisPlanLoading2 ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <><ArrowLeftRight size={14} /> {selectedIsAnnual ? 'Switch to Annual' : 'Switch to Monthly'}</>
                          )}
                        </button>
                      );
                    })()
                  ) : (
                    <button
                      disabled={isLoading || isRedirecting}
                      className={`w-full py-2 lg:py-3 rounded-xl lg:rounded-2xl font-black text-[9px] lg:text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-1 lg:gap-2 mt-auto disabled:opacity-50 ${
                        isUpgrade
                          ? 'bg-orange-500 text-white shadow-xl shadow-orange-100 dark:shadow-none hover:bg-orange-600 hover:scale-[1.02]'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-orange-500 hover:text-white hover:scale-[1.02]'
                      }`}
                    >
                      {isThisPlanLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <>{isUpgrade ? 'Upgrade' : 'Downgrade'} <ArrowRight size={14} /></>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-center text-gray-400 text-[10px] lg:text-xs font-medium pt-3 lg:pt-4">
            You will be charged the full plan price. Changes take effect immediately. Prices in Malaysian Ringgit (MYR).
          </p>
        </div>
      </div>
    </div>
  );
};

export default UpgradePlanModal;
