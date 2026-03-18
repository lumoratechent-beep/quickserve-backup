import React, { useState, useEffect } from 'react';
import { Subscription, PlanId } from '../src/types';
import { PRICING_PLANS } from '../lib/pricingPlans';
import { daysLeftInTrial, isTrialActive, isSubscriptionActive } from '../lib/subscriptionService';
import { Loader2, Check, Plus } from 'lucide-react';

interface BillingHistory {
  id: string;
  date: string;
  description: string;
  amount: number;
  invoiceUrl?: string;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  type: string; // 'credit' | 'debit'
}

interface Props {
  restaurantId: string;
  subscription: Subscription | null;
  onUpgradeClick: () => void;
  onSubscriptionUpdated?: () => void;
}

const BillingPage: React.FC<Props> = ({ restaurantId, subscription, onUpgradeClick, onSubscriptionUpdated }) => {
  const [billingHistory, setBillingHistory] = useState<BillingHistory[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [autoRenew, setAutoRenew] = useState(!subscription?.cancel_at_period_end);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [isTogglingAutoRenew, setIsTogglingAutoRenew] = useState(false);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [isDeletingCard, setIsDeletingCard] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);

  const currentPlanId = subscription?.plan_id || 'basic';
  const isActive = subscription ? isSubscriptionActive(subscription) : false;
  const isTrial = subscription ? isTrialActive(subscription) : false;
  const daysLeft = subscription ? daysLeftInTrial(subscription) : 0;

  useEffect(() => {
    setAutoRenew(!subscription?.cancel_at_period_end);
  }, [subscription?.cancel_at_period_end]);

  useEffect(() => {
    if (subscription?.stripe_customer_id) {
      fetchBillingHistory();
      fetchPaymentMethods();
    }
  }, [subscription?.stripe_customer_id]);

  // Re-check for stripe_customer_id after returning from setup session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') === 'success') {
      onSubscriptionUpdated?.();
    }
  }, []);

  useEffect(() => {
    const def = paymentMethods.find(m => m.isDefault);
    if (def) setSelectedMethodId(def.id);
    else if (paymentMethods.length) setSelectedMethodId(paymentMethods[0].id);
  }, [paymentMethods]);

  const fetchBillingHistory = async () => {
    if (!subscription?.stripe_customer_id) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/stripe/billing?action=history&customerId=${encodeURIComponent(subscription.stripe_customer_id)}`);
      if (res.ok) {
        const data = await res.json();
        setBillingHistory(data.invoices || []);
      }
    } catch { /* silent */ } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchPaymentMethods = async () => {
    if (!subscription?.stripe_customer_id) return;
    setIsLoadingPayments(true);
    try {
      const res = await fetch(`/api/stripe/billing?action=payment-methods&customerId=${encodeURIComponent(subscription.stripe_customer_id)}`);
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(data.methods || []);
      }
    } catch { /* silent */ } finally {
      setIsLoadingPayments(false);
    }
  };

  const handleToggleAutoRenew = async () => {
    if (!subscription?.stripe_subscription_id) return;
    setIsTogglingAutoRenew(true);
    try {
      const res = await fetch('/api/stripe/billing?action=toggle-auto-renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: subscription.stripe_subscription_id,
          cancelAtPeriodEnd: autoRenew,
        }),
      });
      if (res.ok) {
        setAutoRenew(!autoRenew);
        onSubscriptionUpdated?.();
      }
    } catch { /* silent */ } finally {
      setIsTogglingAutoRenew(false);
    }
  };

  const handleAddCard = async () => {
    setIsAddingCard(true);
    try {
      const res = await fetch('/api/stripe/billing?action=setup-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: subscription?.stripe_customer_id, restaurantId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) window.location.href = data.url;
      }
    } catch { /* silent */ } finally {
      setIsAddingCard(false);
    }
  };

  const handleDeleteCard = async (methodId: string) => {
    setIsDeletingCard(methodId);
    try {
      const res = await fetch('/api/stripe/billing?action=delete-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethodId: methodId }),
      });
      if (res.ok) {
        setPaymentMethods(prev => prev.filter(m => m.id !== methodId));
      }
    } catch { /* silent */ } finally {
      setIsDeletingCard(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-MY', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatInvoiceLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleDateString('en-US', { month: 'long' });
    const year = String(d.getFullYear()).slice(-2);
    return `Invoice ${day} ${month} ${year}`;
  };

  const getDaysLabel = (plan: typeof PRICING_PLANS[number]) => {
    if (plan.id !== currentPlanId) return '';
    if (isTrial) return `${daysLeft} days remaining`;
    if (subscription?.current_period_end) {
      const end = new Date(subscription.current_period_end).getTime();
      const now = Date.now();
      const days = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
      return `${days} days remaining`;
    }
    return '';
  };

  const brandLogo = (brand: string) => {
    const b = brand.toLowerCase();
    if (b === 'mastercard') return (
      <div className="flex items-center justify-center w-10 h-7 rounded bg-gray-900">
        <span className="text-[8px] font-bold text-white tracking-tight leading-none">Master<br/>Card</span>
      </div>
    );
    if (b === 'visa') return (
      <div className="flex items-center justify-center w-10 h-7 rounded bg-blue-700">
        <span className="text-[9px] font-black text-white italic">VISA</span>
      </div>
    );
    return (
      <div className="flex items-center justify-center w-10 h-7 rounded bg-gray-500">
        <span className="text-[8px] font-bold text-white">{brand.slice(0, 4)}</span>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-10">

        {/* ── Plan ── */}
        <section>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Plan</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRICING_PLANS.map(plan => {
              const isCurrent = plan.id === currentPlanId;
              const isUpgrade = PRICING_PLANS.indexOf(plan) > PRICING_PLANS.findIndex(p => p.id === currentPlanId);
              const isDowngrade = PRICING_PLANS.indexOf(plan) < PRICING_PLANS.findIndex(p => p.id === currentPlanId);
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-xl border-2 p-5 transition-all ${
                    isCurrent
                      ? 'border-orange-400 bg-white dark:bg-gray-800'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60'
                  }`}
                >
                  {/* Checkmark badge */}
                  {isCurrent && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </div>
                  )}

                  {/* Name + price stacked */}
                  <h4 className="text-base font-bold text-gray-900 dark:text-white">{plan.name}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-semibold mb-0.5">RM{plan.price}<span className="text-xs font-medium text-gray-400">/month</span></p>

                  {/* Days remaining */}
                  <p className="text-xs text-gray-400 mb-5 min-h-[16px]">{getDaysLabel(plan)}</p>

                  {/* Action — all same height */}
                  <div className="flex items-center gap-3 min-h-[34px]">
                    {isCurrent ? (
                      subscription?.stripe_subscription_id ? (
                        <button
                          onClick={handleToggleAutoRenew}
                          disabled={isTogglingAutoRenew}
                          className="px-4 py-2 rounded-lg text-xs font-semibold border border-orange-400 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors disabled:opacity-50"
                        >
                          {isTogglingAutoRenew ? 'Processing...' : autoRenew ? 'Cancel Subscription' : 'Resume Subscription'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Current plan</span>
                      )
                    ) : isUpgrade ? (
                      <button
                        onClick={onUpgradeClick}
                        className="px-4 py-2 rounded-lg text-xs font-semibold border border-orange-400 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors"
                      >
                        Upgrade
                      </button>
                    ) : isDowngrade ? (
                      <button
                        onClick={onUpgradeClick}
                        className="px-4 py-2 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
                      >
                        Downgrade
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Enable auto renew ── */}
        <section>
          <div className="flex items-center justify-between gap-4 mb-1">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Enable auto renew</h3>
            <button
              onClick={handleToggleAutoRenew}
              disabled={isTogglingAutoRenew || !subscription?.stripe_subscription_id}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                autoRenew ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
              } ${isTogglingAutoRenew || !subscription?.stripe_subscription_id ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                autoRenew ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed max-w-xl">
            This option, if checked, will renew your productive subscription, if the current plan expires. However, this might prevent you from downgrading.
          </p>
        </section>

        {/* ── Payment Method ── */}
        <section>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Payment Method</h3>

          {isLoadingPayments ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
          ) : (
            <div className="flex items-stretch gap-4 overflow-x-auto pb-4" onClick={() => setConfirmingDeleteId(null)}>
              {paymentMethods.map(method => {
                const isSelected = method.id === selectedMethodId;
                const isConfirming = confirmingDeleteId === method.id;
                return (
                  <div
                    key={method.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isConfirming) {
                        handleDeleteCard(method.id);
                      } else {
                        setConfirmingDeleteId(method.id);
                      }
                    }}
                    onMouseLeave={() => { if (isConfirming) setConfirmingDeleteId(null); }}
                    className={`group relative rounded-xl border-2 px-5 py-5 min-w-[220px] cursor-pointer transition-all select-none overflow-hidden ${
                      isConfirming
                        ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                        : isSelected
                          ? 'border-orange-400 bg-white dark:bg-gray-800'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60'
                    }`}
                  >
                    {/* Checkmark */}
                    {isSelected && !isConfirming && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
                        <Check size={14} className="text-white" strokeWidth={3} />
                      </div>
                    )}

                    {/* Hover delete hint — shows on hover when not confirming */}
                    {!isConfirming && (
                      <div className="absolute inset-0 rounded-xl bg-red-500/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-10">
                        <p className="text-white text-xs font-bold">Click to delete</p>
                      </div>
                    )}

                    {/* Delete confirmation state */}
                    {isConfirming && (
                      <div className="absolute inset-0 rounded-xl bg-red-500/90 flex flex-col items-center justify-center z-10">
                        {isDeletingCard === method.id ? (
                          <Loader2 size={20} className="animate-spin text-white" />
                        ) : (
                          <>
                            <p className="text-white text-xs font-bold">Confirm delete?</p>
                            <p className="text-white/70 text-[10px] mt-1">Click to confirm · Hover away to cancel</p>
                          </>
                        )}
                      </div>
                    )}

                    {/* Label */}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-medium">
                      {method.type === 'debit' ? 'Debit Card' : 'Credit Card'}
                    </p>

                    {/* Card visual */}
                    <div className="flex items-center gap-3">
                      {brandLogo(method.brand)}
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-mono tracking-wider">
                        •••• •••• ••••{method.last4}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Add card */}
              <button
                onClick={handleAddCard}
                disabled={isAddingCard}
                className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 min-w-[140px] min-h-[100px] flex items-center justify-center hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-all"
              >
                {isAddingCard
                  ? <Loader2 size={24} className="animate-spin text-gray-400" />
                  : <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <Plus size={22} className="text-gray-400" />
                    </div>
                }
              </button>
            </div>
          )}
        </section>

        {/* ── Billing History ── */}
        <section>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Billing History</h3>

          {isLoadingHistory ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="pb-3 pr-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="pb-3 pr-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Details</th>
                    <th className="pb-3 pr-6 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Amount</th>
                    <th className="pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {billingHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-sm text-gray-400">
                        No billing history yet.
                      </td>
                    </tr>
                  ) : (
                    billingHistory.map(inv => (
                      <tr key={inv.id} className="border-b dark:border-gray-700/60 last:border-0">
                        <td className="py-4 pr-6 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(inv.date)}</td>
                        <td className="py-4 pr-6 text-sm text-gray-700 dark:text-gray-200">{inv.description}</td>
                        <td className="py-4 pr-6 text-sm font-semibold text-gray-900 dark:text-white text-right whitespace-nowrap">RM{inv.amount.toFixed(2)}</td>
                        <td className="py-4 text-right">
                          {inv.invoiceUrl ? (
                            <a
                              href={inv.invoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-orange-500 hover:text-orange-600 font-medium transition-colors"
                            >
                              {formatInvoiceLabel(inv.date)}
                            </a>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default BillingPage;
