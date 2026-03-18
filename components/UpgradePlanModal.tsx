import React, { useState } from 'react';
import { X, Check, ArrowRight, Loader2, Star, Crown, Sparkles, CreditCard } from 'lucide-react';
import { PricingPlan, PlanId, Subscription } from '../src/types';
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
  const [error, setError] = useState('');

  const planIcons: Record<PlanId, React.ReactNode> = {
    basic: <Star size={20} />,
    pro: <Crown size={20} />,
    pro_plus: <Sparkles size={20} />,
  };

  const handleUpgrade = async (newPlanId: PlanId) => {
    setIsLoading(true);
    setError('');

    try {
      // If there's an active Stripe subscription, upgrade via Stripe
      if (subscription?.stripe_subscription_id) {
        const res = await fetch('/api/stripe/upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId, newPlanId }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.action === 'checkout') {
            // No active subscription, redirect to checkout
            return handleCheckout(newPlanId, 'subscription');
          }
          setError(data.error || 'Upgrade failed.');
          return;
        }
        onUpgraded();
      } else {
        // No stripe subscription — redirect to checkout
        return handleCheckout(newPlanId, 'subscription');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckout = async (planId: PlanId, mode: 'subscription' | 'payment') => {
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, planId, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create checkout.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const planOrder: PlanId[] = ['basic', 'pro', 'pro_plus'];
  const currentIndex = planOrder.indexOf(currentPlanId);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 p-6 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">Manage Subscription</h2>
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
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-2xl font-black text-gray-900 dark:text-white">RM{plan.price}</span>
                    <span className="text-gray-400 text-xs font-bold">/mo</span>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300 font-medium">
                        <Check size={14} className="text-orange-500 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="flex flex-row gap-2">
                      <button
                        onClick={() => handleCheckout(plan.id, 'subscription')}
                        disabled={isLoading}
                        className="flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-orange-500 text-white hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        <CreditCard size={12} /> Subscribe
                      </button>
                      <button
                        onClick={() => handleCheckout(plan.id, 'payment')}
                        disabled={isLoading}
                        className="flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                      >
                        One-time
                      </button>
                    </div>
                  ) : isUpgrade ? (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={isLoading}
                      className="w-full py-3 rounded-lg text-xs font-black uppercase tracking-wider bg-orange-500 text-white hover:bg-orange-600 hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {isLoading ? <Loader2 size={14} className="animate-spin" /> : <><ArrowRight size={14} /> Upgrade</>}
                    </button>
                  ) : (
                    <button
                      disabled
                      className="w-full py-3 rounded-lg text-xs font-black uppercase tracking-wider bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                    >
                      Downgrade
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpgradePlanModal;
