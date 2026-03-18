import React, { useState, useEffect } from 'react';
import { Subscription, PlanId } from '../src/types';
import { PRICING_PLANS } from '../lib/pricingPlans';
import { daysLeftInTrial, isTrialActive, isSubscriptionActive } from '../lib/subscriptionService';
import {
  CreditCard, Download, RefreshCw, ChevronRight, Crown, Star, Sparkles,
  Loader2, AlertCircle, Plus, Trash2
} from 'lucide-react';

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
}

interface Props {
  restaurantId: string;
  subscription: Subscription | null;
  onUpgradeClick: () => void;
  onSubscriptionUpdated?: () => void;
}

const planIcons: Record<PlanId, React.ReactNode> = {
  basic: <Star size={24} />,
  pro: <Crown size={24} />,
  pro_plus: <Sparkles size={24} />,
};

const BillingPage: React.FC<Props> = ({ restaurantId, subscription, onUpgradeClick, onSubscriptionUpdated }) => {
  const [billingHistory, setBillingHistory] = useState<BillingHistory[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [autoRenew, setAutoRenew] = useState(!subscription?.cancel_at_period_end);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [isTogglingAutoRenew, setIsTogglingAutoRenew] = useState(false);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [isDeletingCard, setIsDeletingCard] = useState<string | null>(null);

  const currentPlan = PRICING_PLANS.find(p => p.id === (subscription?.plan_id || 'basic'));
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

  const fetchBillingHistory = async () => {
    if (!subscription?.stripe_customer_id) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/stripe/billing-history?customerId=${encodeURIComponent(subscription.stripe_customer_id)}`);
      if (res.ok) {
        const data = await res.json();
        setBillingHistory(data.invoices || []);
      }
    } catch {
      // silent — billing history is non-critical
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchPaymentMethods = async () => {
    if (!subscription?.stripe_customer_id) return;
    setIsLoadingPayments(true);
    try {
      const res = await fetch(`/api/stripe/payment-methods?customerId=${encodeURIComponent(subscription.stripe_customer_id)}`);
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(data.methods || []);
      }
    } catch {
      // silent
    } finally {
      setIsLoadingPayments(false);
    }
  };

  const handleToggleAutoRenew = async () => {
    if (!subscription?.stripe_subscription_id) return;
    setIsTogglingAutoRenew(true);
    try {
      const res = await fetch('/api/stripe/toggle-auto-renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: subscription.stripe_subscription_id,
          cancelAtPeriodEnd: autoRenew, // toggle: if currently auto-renewing, cancel at period end
        }),
      });
      if (res.ok) {
        setAutoRenew(!autoRenew);
        onSubscriptionUpdated?.();
      }
    } catch {
      // silent
    } finally {
      setIsTogglingAutoRenew(false);
    }
  };

  const handleAddCard = async () => {
    if (!subscription?.stripe_customer_id) return;
    setIsAddingCard(true);
    try {
      const res = await fetch('/api/stripe/create-setup-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: subscription.stripe_customer_id,
          restaurantId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) window.location.href = data.url;
      }
    } catch {
      // silent
    } finally {
      setIsAddingCard(false);
    }
  };

  const handleDeleteCard = async (methodId: string) => {
    setIsDeletingCard(methodId);
    try {
      const res = await fetch('/api/stripe/delete-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethodId: methodId }),
      });
      if (res.ok) {
        setPaymentMethods(prev => prev.filter(m => m.id !== methodId));
      }
    } catch {
      // silent
    } finally {
      setIsDeletingCard(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = () => {
    if (!subscription) return { label: 'No Plan', color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' };
    if (isTrial) return { label: 'Trial', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
    if (subscription.status === 'active') return { label: 'Active', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
    if (subscription.status === 'past_due') return { label: 'Past Due', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
    if (subscription.status === 'canceled') return { label: 'Cancelled', color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' };
    return { label: subscription.status, color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' };
  };

  const statusBadge = getStatusBadge();

  const cardBrandIcon = (brand: string) => {
    const b = brand.toLowerCase();
    if (b === 'visa') return '💳 Visa';
    if (b === 'mastercard') return '💳 Mastercard';
    if (b === 'amex') return '💳 Amex';
    return `💳 ${brand}`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
      {/* ── Section 1: Current Plan ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between">
            {/* Left: plan info */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center text-orange-500">
                {currentPlan ? planIcons[currentPlan.id] : <Star size={24} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                    {currentPlan?.name || 'Basic'}
                  </h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${statusBadge.color}`}>
                    {statusBadge.label}
                  </span>
                </div>
                {isTrial && daysLeft > 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining in trial
                  </p>
                )}
                {subscription?.current_period_end && !isTrial && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Renews on {formatDate(subscription.current_period_end)}
                  </p>
                )}
                {subscription?.status === 'canceled' && (
                  <p className="text-sm text-red-500 dark:text-red-400 mt-1">
                    Your subscription has been cancelled
                  </p>
                )}
              </div>
            </div>

            {/* Right: price */}
            <div className="text-right">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-gray-900 dark:text-white">RM{currentPlan?.price || 30}</span>
                <span className="text-sm text-gray-400 font-bold">/mo</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6 pt-4 border-t dark:border-gray-700">
            <button
              onClick={onUpgradeClick}
              className="px-5 py-2.5 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center gap-2"
            >
              <ChevronRight size={14} />
              {subscription?.status === 'canceled' ? 'Resubscribe' : 'Upgrade Plan'}
            </button>
            {isActive && subscription?.stripe_subscription_id && (
              <button
                onClick={handleToggleAutoRenew}
                disabled={isTogglingAutoRenew}
                className="px-5 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
              >
                {isTogglingAutoRenew ? 'Processing...' : autoRenew ? 'Cancel Subscription' : 'Resume Subscription'}
              </button>
            )}
          </div>
        </div>

        {/* Learn more */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-t dark:border-gray-700">
          <button
            onClick={onUpgradeClick}
            className="text-xs text-orange-500 hover:text-orange-600 font-bold flex items-center gap-1 transition-colors"
          >
            Learn more about this plan <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Section 2: Auto-Renew ── */}
      {isActive && subscription?.stripe_subscription_id && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">
                Auto-Renewal
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {autoRenew
                  ? 'Your subscription will automatically renew at the end of each billing period.'
                  : 'Auto-renewal is off. Your subscription will expire at the end of the current period.'}
              </p>
            </div>
            <button
              onClick={handleToggleAutoRenew}
              disabled={isTogglingAutoRenew}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                autoRenew ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
              } ${isTogglingAutoRenew ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                  autoRenew ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* ── Section 3: Payment Methods ── */}
      {subscription?.stripe_customer_id && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700">
          <div className="p-6 border-b dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">
                Payment Methods
              </h3>
              <button
                onClick={handleAddCard}
                disabled={isAddingCard}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-600 transition-all flex items-center gap-2"
              >
                {isAddingCard ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Add Card
              </button>
            </div>
          </div>

          <div className="p-6">
            {isLoadingPayments ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-gray-400" />
              </div>
            ) : paymentMethods.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No payment methods saved</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Add a card to manage your subscription</p>
              </div>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map(method => (
                  <div
                    key={method.id}
                    className="flex items-center justify-between p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50"
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard size={20} className="text-gray-400" />
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          {cardBrandIcon(method.brand)} •••• {method.last4}
                        </p>
                        <p className="text-xs text-gray-400">
                          Expires {String(method.expMonth).padStart(2, '0')}/{method.expYear}
                        </p>
                      </div>
                      {method.isDefault && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                          Default
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteCard(method.id)}
                      disabled={isDeletingCard === method.id || method.isDefault}
                      className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      title={method.isDefault ? 'Cannot delete default payment method' : 'Remove card'}
                    >
                      {isDeletingCard === method.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Section 4: Billing History ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700">
        <div className="p-6 border-b dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">
              Billing History
            </h3>
            <button
              onClick={fetchBillingHistory}
              disabled={isLoadingHistory}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
              title="Refresh"
            >
              <RefreshCw size={16} className={isLoadingHistory ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : billingHistory.length === 0 ? (
            <div className="text-center py-12">
              <Receipt size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No billing history yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Your invoices will appear here after your first payment</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Details</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-center">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {billingHistory.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 font-medium whitespace-nowrap">
                      {formatDate(invoice.date)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">
                      {invoice.description}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-bold text-right whitespace-nowrap">
                      RM{invoice.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {invoice.invoiceUrl ? (
                        <a
                          href={invoice.invoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-orange-500 hover:text-orange-600 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-all"
                        >
                          <Download size={12} /> Download
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

// Need Receipt icon locally since it might not be imported in parent
const Receipt: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
    <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
    <path d="M12 17.5v-11" />
  </svg>
);

export default BillingPage;
