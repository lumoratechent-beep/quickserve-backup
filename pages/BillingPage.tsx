import React, { useState, useEffect } from 'react';
import { Subscription, PlanId, DuitNowPayment } from '../src/types';
import { PRICING_PLANS } from '../lib/pricingPlans';
import { daysLeftInTrial, isTrialActive, isSubscriptionActive, getRenewalStatus, daysUntilExpiry, GRACE_PERIOD_DAYS } from '../lib/subscriptionService';
import { Loader2, Check, Plus, RefreshCw, X, AlertCircle, CheckCircle, ArrowLeftRight, Upload, Clock, FileImage } from 'lucide-react';
import { toast } from '../components/Toast';
import { supabase } from '../lib/supabase';

interface BillingHistory {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: 'success' | 'pending' | 'approved' | 'rejected';
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
  onComparePlans?: () => void;
}

const DEFAULT_DUITNOW_QR_SRC = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('https://www.duitnow.my/qr/quickserve')}`;

const BillingPage: React.FC<Props> = ({ restaurantId, subscription, onUpgradeClick, onSubscriptionUpdated, onComparePlans }) => {
  const [billingHistory, setBillingHistory] = useState<BillingHistory[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [autoRenew, setAutoRenew] = useState(!subscription?.cancel_at_period_end);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [isTogglingAutoRenew, setIsTogglingAutoRenew] = useState(false);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [isDeletingCard, setIsDeletingCard] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [isRenewing, setIsRenewing] = useState(false);
  const [showRenewConfirm, setShowRenewConfirm] = useState(false);
  const [renewError, setRenewError] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(false);

  // DuitNow state
  const isDuitNowEnabled = subscription?.duitnow_enabled ?? false;
  const [duitnowPayments, setDuitnowPayments] = useState<DuitNowPayment[]>([]);
  const [duitnowLoading, setDuitnowLoading] = useState(false);
  const [showDuitNowModal, setShowDuitNowModal] = useState(false);
  const [duitnowSubmitting, setDuitnowSubmitting] = useState(false);
  const [duitnowRef, setDuitnowRef] = useState('');
  const [duitnowAttachment, setDuitnowAttachment] = useState<File | null>(null);
  const [duitnowPreviewUrl, setDuitnowPreviewUrl] = useState<string | null>(null);
  const [paymentQrImageUrl, setPaymentQrImageUrl] = useState<string | null>(null);

  const hasPendingDowngrade = Boolean(
    subscription?.pending_plan_id &&
    subscription?.pending_change_effective_at &&
    new Date(subscription.pending_change_effective_at) > new Date()
  );

  // After a downgrade, show the NEW plan as the selected/current plan
  // The old plan (plan_id) stays active until the effective date
  const currentPlanId = (hasPendingDowngrade ? subscription?.pending_plan_id : subscription?.plan_id) || 'basic';
  const currentPlanInterval = hasPendingDowngrade
    ? (subscription?.pending_billing_interval || subscription?.billing_interval)
    : subscription?.billing_interval;
  // The plan the user still has access to (before downgrade takes effect)
  const activePlanId = hasPendingDowngrade ? subscription?.plan_id : null;
  const activePlanEndDate = hasPendingDowngrade ? subscription?.pending_change_effective_at : null;
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

  useEffect(() => {
    fetchWalletBalance();
  }, [restaurantId]);

  // Re-check for stripe_customer_id after returning from setup session
  useEffect(() => {
    onSubscriptionUpdated?.();
    fetchPaymentMethods();
  }, []);

  useEffect(() => {
    if (selectedMethodId === 'wallet' || selectedMethodId === 'duitnow') return;
    const def = paymentMethods.find(m => m.isDefault);
    if (def) setSelectedMethodId(def.id);
    else if (paymentMethods.length) setSelectedMethodId(paymentMethods[0].id);
    else if (walletBalance > 0) setSelectedMethodId('wallet');
    else if (isDuitNowEnabled) setSelectedMethodId('duitnow');
  }, [paymentMethods, selectedMethodId, walletBalance, isDuitNowEnabled]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyPageSize, billingHistory.length, duitnowPayments.length]);

  // Fetch DuitNow payments if enabled
  useEffect(() => {
    if (isDuitNowEnabled) fetchDuitnowPayments();
  }, [isDuitNowEnabled]);

  useEffect(() => {
    if (isDuitNowEnabled) fetchPaymentQrImage();
  }, [isDuitNowEnabled]);

  const fetchPaymentQrImage = async () => {
    try {
      const { data } = await supabase
        .from('feature_images')
        .select('url')
        .eq('category', 'payment-qr')
        .order('sort_order', { ascending: false })
        .limit(1);

      setPaymentQrImageUrl(data?.[0]?.url || null);
    } catch {
      setPaymentQrImageUrl(null);
    }
  };

  const fetchDuitnowPayments = async () => {
    setDuitnowLoading(true);
    try {
      const res = await fetch(`/api/stripe/billing?action=duitnow-list&restaurantId=${encodeURIComponent(restaurantId)}`);
      if (res.ok) {
        const data = await res.json();
        setDuitnowPayments(data.payments || []);
      }
    } catch { /* silent */ } finally {
      setDuitnowLoading(false);
    }
  };

  const handleDuitNowSubmit = async () => {
    const plan = PRICING_PLANS.find(p => p.id === currentPlanId);
    if (!plan) return;
    const isAnnual = currentPlanInterval === 'annual';
    const monthlyPrice = isAnnual ? plan.annualPrice : plan.price;
    const totalAmount = isAnnual ? monthlyPrice * 12 : monthlyPrice;

    setDuitnowSubmitting(true);
    try {
      // Upload attachment if provided
      let attachmentUrl: string | null = null;
      if (duitnowAttachment) {
        const formData = new FormData();
        formData.append('file', duitnowAttachment);
        formData.append('filename', `duitnow/${restaurantId}/${Date.now()}-${duitnowAttachment.name}`);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          attachmentUrl = uploadData.url;
        }
      }

      const res = await fetch('/api/stripe/billing?action=duitnow-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          planId: currentPlanId,
          billingInterval: currentPlanInterval || 'monthly',
          amount: totalAmount,
          attachmentUrl,
          referenceNumber: duitnowRef || undefined,
        }),
      });

      if (res.ok) {
        toast('DuitNow payment submitted! Waiting for admin approval.', 'success');
        setShowDuitNowModal(false);
        setDuitnowRef('');
        setDuitnowAttachment(null);
        setDuitnowPreviewUrl(null);
        fetchDuitnowPayments();
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || 'Failed to submit payment', 'error');
      }
    } catch {
      toast('Connection error. Please try again.', 'error');
    } finally {
      setDuitnowSubmitting(false);
    }
  };

  const fetchBillingHistory = async () => {
    if (!subscription?.stripe_customer_id) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/stripe/billing?action=history&customerId=${encodeURIComponent(subscription.stripe_customer_id)}&restaurantId=${encodeURIComponent(restaurantId)}`);
      if (res.ok) {
        const data = await res.json();
        setBillingHistory((data.invoices || []).map((entry: Omit<BillingHistory, 'status'> & { status?: BillingHistory['status'] }) => ({
          ...entry,
          status: entry.status || 'success',
        })));
      }
    } catch { /* silent */ } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchWalletBalance = async () => {
    setWalletBalanceLoading(true);
    try {
      const res = await fetch(`/api/wallet?action=balance&restaurantId=${encodeURIComponent(restaurantId)}`);
      if (res.ok) {
        const data = await res.json();
        setWalletBalance(Number(data.balance) || 0);
      }
    } catch { /* silent */ } finally {
      setWalletBalanceLoading(false);
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
      } else {
        toast('Failed to start card setup. Please try again.', 'error');
      }
    } catch {
      toast('Connection error. Please check your internet and try again.', 'error');
    } finally {
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
        setConfirmingDeleteId(null);
        toast('Card removed successfully.', 'success');
      } else {
        toast('Failed to remove card. Please try again.', 'error');
      }
    } catch {
      toast('Connection error. Please check your internet and try again.', 'error');
    } finally {
      setIsDeletingCard(null);
    }
  };

  const handleRenew = async () => {
    setIsRenewing(true);
    setRenewError('');
    try {
      const action = selectedMethodId === 'wallet' ? 'renew-wallet' : 'renew-direct';
      const res = await fetch(`/api/stripe/billing?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          paymentMethodId: selectedMethodId && selectedMethodId !== 'wallet' ? selectedMethodId : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRenewError(data.error || 'Renewal failed. Please try again.');
        return;
      }
      // Success — close modal, show toast, refresh data
      setShowRenewConfirm(false);
      toast(`Plan renewed successfully! New expiry: ${new Date(data.newPeriodEnd).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`, 'success');
      onSubscriptionUpdated?.();
      fetchBillingHistory();
      fetchWalletBalance();
    } catch {
      setRenewError('Connection error. Please check your internet and try again.');
    } finally {
      setIsRenewing(false);
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

  const getStatusBadge = (status: BillingHistory['status']) => {
    const config: Record<BillingHistory['status'], { label: string; className: string }> = {
      success: {
        label: 'Successful',
        className: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800/40 dark:bg-green-900/20 dark:text-green-300',
      },
      pending: {
        label: 'Pending Review',
        className: 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800/40 dark:bg-yellow-900/20 dark:text-yellow-300',
      },
      approved: {
        label: 'Approved QR',
        className: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800/40 dark:bg-green-900/20 dark:text-green-300',
      },
      rejected: {
        label: 'Rejected QR',
        className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300',
      },
    };

    return config[status] || config.success;
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

  const combinedBillingHistory: BillingHistory[] = [
    ...billingHistory.map((entry) => ({
      ...entry,
      status: entry.status || 'success',
    })),
    ...duitnowPayments.map((payment) => ({
      id: payment.id,
      date: payment.created_at,
      description: [
        `DuitNow QR ${payment.plan_id.replace(/_/g, ' ').toUpperCase()} (${payment.billing_interval === 'annual' ? 'Annual' : 'Monthly'})`,
        payment.reference_number ? `Ref: ${payment.reference_number}` : null,
        payment.admin_note || null,
      ].filter(Boolean).join(' · '),
      amount: Number(payment.amount) || 0,
      status: payment.status,
      invoiceUrl: undefined,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalHistoryPages = Math.max(1, Math.ceil(combinedBillingHistory.length / historyPageSize));
  const paginatedHistory = combinedBillingHistory.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
  const showHistoryPagination = combinedBillingHistory.length > 10;

  const activePlanName = activePlanId
    ? (PRICING_PLANS.find(p => p.id === activePlanId)?.name || activePlanId)
    : '';

  const activePlanEndFormatted = activePlanEndDate
    ? new Date(activePlanEndDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  const activePlanDaysLeft = activePlanEndDate
    ? Math.max(0, Math.ceil((new Date(activePlanEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="w-full space-y-10">

        {/* ── Plan ── */}
        <section>
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Plan</h3>
            {onComparePlans && (
              <button
                onClick={onComparePlans}
                className="px-3 py-1 rounded-full text-[11px] font-bold text-orange-500 border border-orange-300 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
              >
                Compare Plans
              </button>
            )}
            {hasPendingDowngrade && (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/50">
                Pending Downgrade Active
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
            {PRICING_PLANS.map(plan => {
              const isCurrent = plan.id === currentPlanId;
              const isActivePlanCard = hasPendingDowngrade && plan.id === activePlanId;
              const isUpgrade = PRICING_PLANS.indexOf(plan) > PRICING_PLANS.findIndex(p => p.id === currentPlanId);
              const isDowngrade = PRICING_PLANS.indexOf(plan) < PRICING_PLANS.findIndex(p => p.id === currentPlanId);
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-xl border-2 p-5 transition-all h-full flex flex-col overflow-hidden ${
                    isCurrent
                      ? 'border-orange-400 bg-white dark:bg-gray-800 lg:col-span-2'
                      : isActivePlanCard
                        ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-900/10 lg:col-span-1'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 lg:col-span-1'
                  }`}
                >
                  {/* Checkmark badge */}
                  {isCurrent && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </div>
                  )}

                  {/* Name + price stacked */}
                  <h4 className="text-base font-bold text-gray-900 dark:text-white">
                    {plan.name}
                    {isCurrent && !hasPendingDowngrade && (
                      <span className="ml-1.5 text-xs text-orange-500 font-semibold">
                        — Current Plan ({currentPlanInterval === 'annual' ? 'Annually' : 'Monthly'})
                      </span>
                    )}
                    {isCurrent && hasPendingDowngrade && (
                      <span className="ml-1.5 text-xs text-orange-500 font-semibold">
                        — New Plan ({currentPlanInterval === 'annual' ? 'Annually' : 'Monthly'})
                      </span>
                    )}
                    {isActivePlanCard && (
                      <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400 font-semibold">
                        — Active until {activePlanEndFormatted}
                      </span>
                    )}
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-semibold mb-0.5">RM{plan.price}<span className="text-xs font-medium text-gray-400">/month</span></p>

                  {/* Active plan card: show remaining days */}
                  {isActivePlanCard && activePlanEndDate && (
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-0.5">
                      {activePlanName} access for {activePlanDaysLeft} more days
                    </p>
                  )}

                  {/* Expiry date for current plan */}
                  {isCurrent && (() => {
                    if (hasPendingDowngrade) {
                      // Show when the new plan starts
                      return (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-orange-500">
                            Starts on: {activePlanEndFormatted}
                          </p>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {activePlanName} Plan till: {activePlanEndFormatted} ({activePlanDaysLeft} days remaining)
                          </p>
                        </div>
                      );
                    }
                    const expiryDate = subscription?.current_period_end || subscription?.trial_end;
                    if (!expiryDate) return null;
                    const d = new Date(expiryDate);
                    const formatted = d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
                    const isExpired = d < new Date();
                    const currentPlanDaysLeft = Math.max(0, Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                    const renewalStatus = subscription ? getRenewalStatus(subscription) : 'ok';
                    const graceDays = subscription ? Math.max(0, GRACE_PERIOD_DAYS + daysUntilExpiry(subscription)) : 0;
                    return (
                      <div className="space-y-1">
                        <p className={`text-xs font-semibold ${
                          isExpired ? 'text-red-500' : renewalStatus === 'urgent' ? 'text-orange-500' : renewalStatus === 'warning' ? 'text-yellow-600' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {plan.name} Plan till: {formatted} ({currentPlanDaysLeft} days remaining)
                        </p>
                        {renewalStatus === 'grace' && (
                          <p className="text-[10px] font-bold text-red-500 animate-pulse">
                            ⚠ Grace period: {graceDays} day{graceDays !== 1 ? 's' : ''} left before account deactivation
                          </p>
                        )}
                        {renewalStatus === 'blocked' && (
                          <p className="text-[10px] font-bold text-red-600">
                            ❌ Plan expired — renew now to restore access
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Days remaining (legacy line hidden for current plan; now shown inline with expiry text) */}
                  <p className="text-xs text-gray-400 mb-5 min-h-[16px]">{isCurrent ? '' : getDaysLabel(plan)}</p>

                  {/* Action — all same height */}
                  <div className="mt-auto flex items-center gap-2 min-h-[34px] flex-wrap">
                    {isCurrent ? (
                      <>
                        {subscription?.stripe_subscription_id && (
                          <button
                            onClick={handleToggleAutoRenew}
                            disabled={isTogglingAutoRenew}
                            className="w-full md:flex-1 min-w-0 px-2.5 py-2 rounded-lg text-[11px] lg:text-xs font-semibold border border-orange-400 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors disabled:opacity-50 text-center leading-tight whitespace-normal break-words"
                          >
                            {isTogglingAutoRenew ? 'Processing...' : autoRenew ? 'Cancel Subscription' : 'Resume Subscription'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (selectedMethodId === 'duitnow') {
                              setShowDuitNowModal(true);
                              setDuitnowRef('');
                              setDuitnowAttachment(null);
                              setDuitnowPreviewUrl(null);
                            } else {
                              setRenewError('');
                              setShowRenewConfirm(true);
                            }
                          }}
                          disabled={isRenewing}
                          className="w-full md:flex-1 min-w-0 px-2.5 py-2 rounded-lg text-[11px] lg:text-xs font-semibold border border-orange-400 bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 text-center leading-tight whitespace-normal break-words"
                        >
                          <RefreshCw size={12} /> Renew Plan
                        </button>
                        <button
                          onClick={onUpgradeClick}
                          className="w-full md:flex-1 min-w-0 px-2.5 py-2 rounded-lg text-[11px] lg:text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center gap-1.5 text-center leading-tight whitespace-normal break-words"
                        >
                          <ArrowLeftRight size={12} />
                          {currentPlanInterval === 'annual' ? 'Switch to Monthly' : 'Switch to Annual'}
                        </button>
                      </>
                    ) : isUpgrade ? (
                      <button
                        onClick={onUpgradeClick}
                        className="w-full px-4 py-2 rounded-lg text-xs font-semibold border border-orange-400 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors text-center"
                      >
                        Upgrade
                      </button>
                    ) : isDowngrade ? (
                      <button
                        onClick={onUpgradeClick}
                        className="w-full px-4 py-2 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors text-center"
                      >
                        Downgrade
                      </button>
                    ) : (
                      <span className="w-full text-xs text-gray-400 text-center">—</span>
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
            <h3 className={`text-lg font-bold ${selectedMethodId === 'duitnow' || selectedMethodId === 'wallet' ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>Enable auto renew</h3>
            <button
              onClick={handleToggleAutoRenew}
              disabled={isTogglingAutoRenew || !subscription?.stripe_subscription_id || selectedMethodId === 'duitnow' || selectedMethodId === 'wallet'}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                selectedMethodId === 'duitnow' || selectedMethodId === 'wallet'
                  ? 'bg-gray-300 dark:bg-gray-600 opacity-40 cursor-not-allowed'
                  : autoRenew ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
              } ${(isTogglingAutoRenew || !subscription?.stripe_subscription_id) && selectedMethodId !== 'duitnow' && selectedMethodId !== 'wallet' ? 'opacity-60 cursor-not-allowed' : selectedMethodId !== 'duitnow' && selectedMethodId !== 'wallet' ? 'cursor-pointer' : ''}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                selectedMethodId === 'duitnow' || selectedMethodId === 'wallet' ? 'translate-x-1' : autoRenew ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed max-w-xl">
            {selectedMethodId === 'duitnow' || selectedMethodId === 'wallet'
              ? selectedMethodId === 'wallet'
                ? 'Auto-renew is not available with QuickServe Wallet. Top up your wallet and renew manually whenever needed.'
                : 'Auto-renew is not available with DuitNow. You will need to manually renew each billing cycle by scanning the QR code.'
              : 'This option, if checked, will renew your productive subscription, if the current plan expires. However, this might prevent you from downgrading.'}
          </p>
        </section>

        {/* ── Payment Method ── */}
        <section>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Payment Method</h3>

          {isLoadingPayments ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
          ) : (
            <div className="flex items-stretch gap-4 overflow-x-auto pb-4" onClick={() => setConfirmingDeleteId(null)}>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedMethodId('wallet');
                  setConfirmingDeleteId(null);
                }}
                className={`relative flex h-[132px] w-[220px] flex-none flex-col justify-between rounded-xl border-2 px-5 py-5 cursor-pointer transition-all select-none overflow-hidden ${
                  selectedMethodId === 'wallet'
                    ? 'border-emerald-500 bg-white dark:bg-gray-800 ring-2 ring-emerald-500/20 dark:ring-emerald-500/30'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 hover:border-emerald-400/60'
                }`}
              >
                {selectedMethodId === 'wallet' && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check size={14} className="text-white" strokeWidth={3} />
                  </div>
                )}
                <div className="flex items-start justify-between gap-3 pr-8">
                  <div className="flex h-11 items-center">
                    <img
                      src="/LOGO/9.png"
                      alt="QuickServe"
                      className="h-8 w-auto object-contain dark:hidden"
                    />
                    <img
                      src="/LOGO/9-dark.png"
                      alt="QuickServe"
                      className="hidden h-8 w-auto object-contain dark:block"
                    />
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Wallet
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-200 font-semibold">Wallet Balance</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-black">
                      {walletBalanceLoading ? 'Loading...' : `RM ${walletBalance.toFixed(2)}`}
                  </p>
                </div>
                <p className="text-[10px] text-gray-400">Use wallet balance to renew your plan without charging a card.</p>
              </div>

              {/* DuitNow payment method card — shown first when enabled */}
              {isDuitNowEnabled && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMethodId('duitnow');
                    setConfirmingDeleteId(null);
                  }}
                  className={`relative flex h-[132px] w-[220px] flex-none flex-col justify-between rounded-xl border-2 px-5 py-5 cursor-pointer transition-all select-none overflow-hidden ${
                    selectedMethodId === 'duitnow'
                      ? 'border-[#ED2C67] bg-white dark:bg-gray-800 ring-2 ring-[#ED2C67]/20 dark:ring-[#ED2C67]/30'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 hover:border-[#ED2C67]/50'
                  }`}
                >
                  {selectedMethodId === 'duitnow' && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#ED2C67] flex items-center justify-center">
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                  <p className="text-xs text-[#ED2C67] font-semibold">DuitNow QR</p>
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/LOGO/duitnow-white-theme.png"
                      alt="DuitNow"
                      className="h-10 w-auto object-contain dark:hidden"
                    />
                    <img
                      src="/LOGO/duitnow-dark-theme.png"
                      alt="DuitNow"
                      className="hidden h-10 w-auto object-contain dark:block"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-semibold">
                      Bank / e-Wallet
                    </span>
                  </div>
                </div>
              )}

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
                      } else if (!isSelected) {
                        setSelectedMethodId(method.id);
                        setConfirmingDeleteId(null);
                      } else {
                        setConfirmingDeleteId(method.id);
                      }
                    }}
                    className={`relative flex h-[132px] w-[220px] flex-none flex-col justify-between rounded-xl border-2 px-5 py-5 cursor-pointer transition-all select-none overflow-hidden ${
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

                    {isConfirming && (
                      <div className="absolute inset-0 rounded-xl bg-red-500/90 flex flex-col items-center justify-center z-10">
                        {isDeletingCard === method.id ? (
                          <Loader2 size={20} className="animate-spin text-white" />
                        ) : (
                          <>
                            <p className="text-white text-xs font-bold">Click to delete</p>
                            <p className="text-white/70 text-[10px] mt-1">Click elsewhere to cancel</p>
                          </>
                        )}
                      </div>
                    )}

                    {/* Label */}
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      Credit / Debit Card
                    </p>

                    {/* Card visual */}
                    <div className="flex items-center gap-3">
                      {brandLogo(method.brand)}
                      <span className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-mono tracking-wider">
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
                className="flex h-[132px] w-[220px] flex-none items-center justify-center rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-all"
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
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Billing History</h3>
            <div className="flex items-center gap-2">
              <label htmlFor="billing-history-page-size" className="text-xs font-medium text-gray-500 dark:text-gray-400">View</label>
              <select
                id="billing-history-page-size"
                value={historyPageSize}
                onChange={(e) => setHistoryPageSize(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </div>
          </div>

          {isLoadingHistory || duitnowLoading ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="pb-3 pr-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="pb-3 pr-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Details</th>
                    <th className="pb-3 pr-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="pb-3 pr-6 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Amount</th>
                    <th className="pb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedBillingHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-sm text-gray-400">
                        No billing history yet.
                      </td>
                    </tr>
                  ) : (
                    paginatedHistory.map(inv => (
                      <tr key={inv.id} className="border-b dark:border-gray-700/60 last:border-0">
                        <td className="py-4 pr-6 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(inv.date)}</td>
                        <td className="py-4 pr-6 text-sm text-gray-700 dark:text-gray-200">{inv.description}</td>
                        <td className="py-4 pr-6 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${getStatusBadge(inv.status).className}`}>
                            {getStatusBadge(inv.status).label}
                          </span>
                        </td>
                        <td className="py-4 pr-6 text-sm font-semibold text-gray-900 dark:text-white text-right whitespace-nowrap">RM{inv.amount.toFixed(2)}</td>
                        <td className="py-4 text-right">
                          {inv.invoiceUrl ? (
                            <button
                              onClick={async () => {
                                try {
                                  const resp = await fetch(`/api/stripe/billing?action=download-invoice&invoiceId=${encodeURIComponent(inv.id)}`);
                                  if (!resp.ok) throw new Error('Download failed');

                                  const contentType = resp.headers.get('content-type') || '';

                                  // If server returned a redirect URL (for charge receipts or fallback)
                                  if (contentType.includes('application/json')) {
                                    const data = await resp.json();
                                    if (data.redirect) {
                                      window.open(data.redirect, '_blank', 'noopener,noreferrer');
                                      return;
                                    }
                                    throw new Error('No document available');
                                  }

                                  // It's a real PDF — trigger download
                                  const blob = await resp.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `invoice-${inv.id}.pdf`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                } catch {
                                  window.open(inv.invoiceUrl, '_blank', 'noopener,noreferrer');
                                }
                              }}
                              className="text-sm text-orange-500 hover:text-orange-600 font-medium transition-colors"
                            >
                              {formatInvoiceLabel(inv.date)}
                            </button>
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

              {showHistoryPagination && (
                <div className="mt-4 flex items-center justify-end gap-2 flex-wrap">
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>

                  {Array.from({ length: totalHistoryPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => setHistoryPage(pageNum)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                        historyPage === pageNum
                          ? 'border-orange-400 bg-orange-500 text-white'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}

                  <button
                    onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                    disabled={historyPage === totalHistoryPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* ── Renew Confirmation Modal ── */}
      {showRenewConfirm && (() => {
        const plan = PRICING_PLANS.find(p => p.id === currentPlanId);
        const isAnnual = subscription?.billing_interval === 'annual';
        const price = plan ? (isAnnual ? plan.annualPrice : plan.price) : 0;
        const totalAmount = isAnnual ? price * 12 : price;
        const intervalLabel = isAnnual ? 'Annually' : 'Monthly';
        const selectedCard = paymentMethods.find(m => m.id === selectedMethodId);
        const usingWallet = selectedMethodId === 'wallet';
        const walletRemaining = walletBalance - totalAmount;
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
              <button
                onClick={() => { if (!isRenewing) { setShowRenewConfirm(false); setRenewError(''); } }}
                className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                disabled={isRenewing}
              >
                <X size={18} className="text-gray-400" />
              </button>

              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Renew Plan</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                Confirm renewal of your <span className="font-semibold text-orange-500">{plan?.name}</span> plan ({intervalLabel}).
              </p>

              {/* Summary */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Plan</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{plan?.name} ({intervalLabel})</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Amount</span>
                  <span className="font-bold text-orange-500">RM {totalAmount.toFixed(2)}</span>
                </div>
                {usingWallet && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Wallet Balance</span>
                      <span className="font-semibold text-gray-900 dark:text-white">RM {walletBalance.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Balance After Payment</span>
                      <span className={`font-semibold ${walletRemaining >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                        RM {walletRemaining.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
                {selectedCard && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Card</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {selectedCard.brand.toUpperCase()} •••• {selectedCard.last4}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Extends from</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {(() => {
                      const expiryDate = subscription?.current_period_end || subscription?.trial_end;
                      if (!expiryDate) return 'Today';
                      const d = new Date(expiryDate);
                      return d > new Date()
                        ? d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'Today';
                    })()}
                  </span>
                </div>
              </div>

              {/* Error */}
              {renewError && (
                <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/40">
                  <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">{renewError}</p>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowRenewConfirm(false); setRenewError(''); }}
                  disabled={isRenewing}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRenew}
                  disabled={isRenewing || (!usingWallet && paymentMethods.length === 0) || (usingWallet && walletBalance < totalAmount)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isRenewing ? (
                    <><Loader2 size={16} className="animate-spin" /> Processing...</>
                  ) : (
                    <><CheckCircle size={16} /> Confirm & Pay</>
                  )}
                </button>
              </div>

              {!usingWallet && paymentMethods.length === 0 && (
                <p className="text-xs text-red-500 mt-3 text-center">No payment method found. Please add a card first.</p>
              )}
              {usingWallet && walletBalance < totalAmount && (
                <p className="text-xs text-red-500 mt-3 text-center">Insufficient wallet balance. Top up your wallet first.</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── DuitNow Payment Modal ── */}
      {showDuitNowModal && (() => {
        const plan = PRICING_PLANS.find(p => p.id === currentPlanId);
        const isAnnual = currentPlanInterval === 'annual';
        const monthlyPrice = plan ? (isAnnual ? plan.annualPrice : plan.price) : 0;
        const totalAmount = isAnnual ? monthlyPrice * 12 : monthlyPrice;
        const intervalLabel = isAnnual ? 'Annual' : 'Monthly';
        const hasPendingDuitNow = duitnowPayments.some(p => p.status === 'pending');
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden relative flex flex-col md:flex-row max-h-[90vh]">
              <button
                onClick={() => { if (!duitnowSubmitting) setShowDuitNowModal(false); }}
                className="absolute top-3 right-3 z-10 p-1.5 hover:bg-white/20 md:hover:bg-gray-100 md:dark:hover:bg-gray-700 rounded-lg transition-colors"
                disabled={duitnowSubmitting}
              >
                <X size={18} className="text-white md:text-gray-400" />
              </button>

              {/* ── LEFT: DuitNow themed panel with QR + amount ── */}
              <div className="bg-gradient-to-br from-[#ED2C67] to-[#c4214f] text-white md:w-[340px] shrink-0 flex flex-col">
                <div className="px-6 pt-6 pb-4">
                  <div className="flex items-center gap-3 mb-4">
                    <img
                      src="/LOGO/duitnow_logo.png"
                      alt="DuitNow"
                      className="h-9 w-auto object-contain brightness-0 invert"
                    />
                    <div>
                      <h3 className="text-base font-bold leading-tight">Pay via DuitNow</h3>
                      <p className="text-white/70 text-[11px]">Scan with any bank app or e-wallet</p>
                    </div>
                  </div>
                  {/* Amount */}
                  <div className="bg-white/10 rounded-xl p-3.5 backdrop-blur-sm mb-5">
                    <p className="text-white/70 text-[10px] font-medium mb-0.5">Amount to pay</p>
                    <p className="text-3xl font-black tracking-tight leading-none">RM {totalAmount.toFixed(2)}</p>
                    <p className="text-white/70 text-[10px] mt-1">{plan?.name} Plan · {intervalLabel}{isAnnual ? ` (RM${monthlyPrice}/mo × 12)` : ''}</p>
                  </div>
                </div>
                {/* QR */}
                <div className="flex-1 flex flex-col items-center justify-center px-6 pb-5">
                  <div className="bg-white rounded-2xl p-3.5 shadow-lg">
                    <img
                      src={paymentQrImageUrl || DEFAULT_DUITNOW_QR_SRC}
                      alt="DuitNow QR Code"
                      className="w-40 h-40"
                      onError={() => setPaymentQrImageUrl(null)}
                    />
                  </div>
                  <p className="text-white/70 text-[10px] font-medium mt-2">Lumora HQ</p>
                </div>
              </div>

              {/* ── RIGHT: Steps + form ── */}
              <div className="flex-1 overflow-y-auto">
                {hasPendingDuitNow ? (
                  <div className="flex flex-col items-center justify-center h-full px-6 py-10 text-center">
                    <div className="w-14 h-14 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mb-3">
                      <Clock size={28} className="text-yellow-500" />
                    </div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Payment Pending Review</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
                      You already have a DuitNow payment awaiting admin approval. You'll be notified once it's reviewed.
                    </p>
                    <button
                      onClick={() => setShowDuitNowModal(false)}
                      className="mt-5 px-6 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <div className="px-6 py-5 space-y-4">
                    {/* Steps */}
                    <div className="bg-[#ED2C67]/5 dark:bg-[#ED2C67]/10 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-[#ED2C67] text-white text-[10px] font-bold flex items-center justify-center mt-0.5">1</span>
                        <p className="text-xs text-gray-700 dark:text-gray-300">Scan the QR code on the left using any banking app or e-wallet</p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-[#ED2C67] text-white text-[10px] font-bold flex items-center justify-center mt-0.5">2</span>
                        <p className="text-xs text-gray-700 dark:text-gray-300">Enter the exact amount: <strong className="text-[#ED2C67]">RM {totalAmount.toFixed(2)}</strong></p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-[#ED2C67] text-white text-[10px] font-bold flex items-center justify-center mt-0.5">3</span>
                        <p className="text-xs text-gray-700 dark:text-gray-300">Complete the transfer, then fill in details below</p>
                      </div>
                    </div>

                    {/* Reference number */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                        Bank Reference Number <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={duitnowRef}
                        onChange={e => setDuitnowRef(e.target.value)}
                        placeholder="e.g. 20260420123456"
                        maxLength={100}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#ED2C67]/40"
                      />
                    </div>

                    {/* Attachment */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                        Payment Proof <span className="text-gray-400 font-normal">(optional — screenshot)</span>
                      </label>
                      {duitnowPreviewUrl ? (
                        <div className="relative rounded-xl border-2 border-[#ED2C67]/40 dark:border-[#ED2C67]/30 overflow-hidden">
                          <img src={duitnowPreviewUrl} alt="Proof" className="w-full max-h-32 object-contain bg-gray-100 dark:bg-gray-700" />
                          <button
                            onClick={() => { setDuitnowAttachment(null); setDuitnowPreviewUrl(null); }}
                            className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 py-3.5 cursor-pointer hover:border-[#ED2C67]/50 hover:bg-[#ED2C67]/5 dark:hover:bg-[#ED2C67]/10 transition-all">
                          <Upload size={16} className="text-gray-400" />
                          <span className="text-xs text-gray-500 font-medium">Upload transfer screenshot</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 5 * 1024 * 1024) {
                                  toast('File too large. Max 5MB.', 'error');
                                  return;
                                }
                                setDuitnowAttachment(file);
                                setDuitnowPreviewUrl(URL.createObjectURL(file));
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={() => setShowDuitNowModal(false)}
                        disabled={duitnowSubmitting}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDuitNowSubmit}
                        disabled={duitnowSubmitting}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#ED2C67] text-white hover:bg-[#c4214f] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {duitnowSubmitting ? (
                          <><Loader2 size={16} className="animate-spin" /> Submitting...</>
                        ) : (
                          <><CheckCircle size={16} /> I've Paid · Submit</>
                        )}
                      </button>
                    </div>

                    <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                      Admin will verify your payment. Once approved, your plan will be extended automatically.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default BillingPage;
