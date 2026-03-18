import React, { useState } from 'react';
import { X, Check, ArrowRight, ArrowDown, Loader2, Star, Crown, Sparkles } from 'lucide-react';
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
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');

  const planIcons: Record<PlanId, React.ReactNode> = {
    basic: <Star size={20} />,
    pro: <Crown size={20} />,
    pro_plus: <Sparkles size={20} />,
  };

  const handlePlanChange = async (newPlanId: PlanId) => {
    setIsLoading(true);
    setLoadingPlanId(newPlanId);
    setError('');

    try {
      // If there's an active Stripe subscription, update it directly
      if (subscription?.stripe_subscription_id) {
        const res = await fetch('/api/stripe/upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId, newPlanId, billingInterval }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.action === 'checkout') {
            // No active subscription, redirect to checkout
            return handleCheckout(newPlanId);
          }
          setError(data.error || 'Plan change failed.');
          return;
        }
        onUpgraded();
      } else {
        // No stripe subscription — redirect to checkout (no trial coupon)
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
          billingInterval,
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

  const getDisplayPrice = (plan: typeof PRICING_PLANS[number]) => {
    return billingInterval === 'annual' ? plan.annualPrice : plan.price;
  };

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
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 p-6 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">Change Plan</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Current plan: <span className="text-orange-500 font-bold uppercase">{currentPlanId.replace('_', ' ')}</span>
              {subscription?.status === 'trialing' && (
                <span className="ml-2 text-green-500 font-bold">(Trial Active)</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {/* Monthly / Annual toggle */}
          <div className="flex items-center justify-center mb-6">
            <div className="inline-flex items-center bg-gray-100 dark:bg-gray-700 rounded-full p-1">
              <button
                onClick={() => setBillingInterval('monthly')}
                className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                  billingInterval === 'monthly'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval('annual')}
                className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                  billingInterval === 'annual'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Annual
                <span className="ml-1.5 text-[9px] font-black text-green-500">Save up to 16%</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium border border-red-100 dark:border-red-900/40">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PRICING_PLANS.map((plan, i) => {
              const isCurrent = plan.id === currentPlanId;
              const isDowngrade = i < currentIndex;
              const isUpgrade = i > currentIndex;
              const displayPrice = getDisplayPrice(plan);
              const isThisPlanLoading = loadingPlanId === plan.id && isLoading;

              return (
                <div
                  key={plan.id}
                  className={`relative p-6 rounded-xl border-2 transition-all ${
                    isCurrent
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/10'
                      : 'border-gray-200 dark:border-gray-700 hover:border-orange-300'
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-orange-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full">
                      Current
                    </div>
                  )}

                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                    isCurrent ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-orange-500'
                  }`}>
                    {planIcons[plan.id]}
                  </div>

                  <h3 className="font-black text-gray-900 dark:text-white uppercase tracking-tight">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-2xl font-black text-gray-900 dark:text-white">RM{displayPrice}</span>
                    <span className="text-gray-400 text-xs font-bold">/mo</span>
                  </div>
                  {billingInterval === 'annual' && (
                    <p className="text-[10px] text-green-600 dark:text-green-400 font-bold mb-3">
                      Billed RM{displayPrice * 12}/year (save RM{(plan.price - plan.annualPrice) * 12}/yr)
                    </p>
                  )}
                  {billingInterval === 'monthly' && <div className="mb-4" />}

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300 font-medium">
                        <Check size={14} className="text-orange-500 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="w-full py-3 rounded-lg text-xs font-black uppercase tracking-wider bg-gray-100 dark:bg-gray-700 text-gray-400 text-center">
                      Current Plan
                    </div>
                  ) : isUpgrade ? (
                    <button
                      onClick={() => handlePlanChange(plan.id)}
                      disabled={isLoading || isRedirecting}
                      className="w-full py-3 rounded-lg text-xs font-black uppercase tracking-wider bg-orange-500 text-white hover:bg-orange-600 hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {isThisPlanLoading ? <Loader2 size={14} className="animate-spin" /> : <><ArrowRight size={14} /> Upgrade</>}
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePlanChange(plan.id)}
                      disabled={isLoading || isRedirecting}
                      className="w-full py-3 rounded-lg text-xs font-black uppercase tracking-wider border-2 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-orange-400 hover:text-orange-500 hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {isThisPlanLoading ? <Loader2 size={14} className="animate-spin" /> : <><ArrowDown size={14} /> Downgrade</>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Info notice */}
          <p className="text-[11px] text-gray-400 text-center mt-6">
            You will be charged the full plan price. Changes take effect immediately.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UpgradePlanModal;
