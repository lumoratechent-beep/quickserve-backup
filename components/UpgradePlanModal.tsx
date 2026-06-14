import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, ArrowRight, Loader2, RefreshCw, ArrowLeftRight, ArrowLeft, CreditCard, Wallet, QrCode, Upload, CheckCircle } from 'lucide-react';
import { PlanId, Subscription } from '../src/types';
import { PRICING_PLANS } from '../lib/pricingPlans';
import { toast } from '../components/Toast';
import { supabase } from '../lib/supabase';

interface Props {
  currentPlanId: PlanId;
  restaurantId: string;
  subscription: Subscription | null;
  onClose: () => void;
  onUpgraded: (options?: { pendingDuitNow?: boolean }) => void;
}

type ModalStep = 'plans' | 'confirm' | 'payment' | 'duitnow' | 'redirect';
type PlanChangeType = 'upgrade' | 'downgrade' | 'renew';
type PaymentMethod = 'card' | 'wallet' | 'duitnow';
type VisualStep = 'plans' | 'confirm' | 'payment' | 'finish';

const planOrder: PlanId[] = ['basic', 'pro', 'pro_plus'];
const stepOrder: VisualStep[] = ['plans', 'confirm', 'payment', 'finish'];
const DEFAULT_DUITNOW_QR_SRC = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent('https://www.duitnow.my/qr/quickserve')}`;

const UpgradePlanModal: React.FC<Props> = ({ currentPlanId, restaurantId, subscription, onClose, onUpgraded }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState<PlanId | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<ModalStep>('plans');
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>(currentPlanId);
  const [selectedChangeType, setSelectedChangeType] = useState<PlanChangeType>('renew');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('card');
  const [walletBalance, setWalletBalance] = useState(0);
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [duitnowRef, setDuitnowRef] = useState('');
  const [duitnowAttachment, setDuitnowAttachment] = useState<File | null>(null);
  const [duitnowPreviewUrl, setDuitnowPreviewUrl] = useState<string | null>(null);
  const [paymentQrImageUrl, setPaymentQrImageUrl] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>(
    subscription?.billing_interval === 'annual' ? 'annual' : 'monthly'
  );

  const annualSavePct = Math.round((1 - PRICING_PLANS[1].annualPrice / PRICING_PLANS[1].price) * 100);
  const currentBillingInterval = subscription?.billing_interval === 'annual' ? 'annual' : 'monthly';
  const currentBillingLabel = currentBillingInterval === 'annual' ? 'Annual' : 'Monthly';
  const currentPlan = PRICING_PLANS.find(plan => plan.id === currentPlanId) || PRICING_PLANS[0];
  const currentPlanLabel = currentPlan?.name || currentPlanId.replace('_', ' ');
  const currentIndex = planOrder.indexOf(currentPlanId);
  const selectedPlan = PRICING_PLANS.find(plan => plan.id === selectedPlanId) || currentPlan;
  const selectedMonthlyPrice = billingCycle === 'annual' ? selectedPlan.annualPrice : selectedPlan.price;
  const selectedTotalAmount = billingCycle === 'annual' ? selectedMonthlyPrice * 12 : selectedMonthlyPrice;
  const selectedBillingLabel = billingCycle === 'annual' ? 'Annual' : 'Monthly';
  const isDuitNowEnabled = subscription?.duitnow_enabled ?? false;
  const isDuitNowRenewalAvailable = isDuitNowEnabled && selectedPlanId === currentPlanId;

  const actionLabel = useMemo(() => {
    const isSamePlan = selectedPlanId === currentPlanId;
    const isSameInterval = billingCycle === currentBillingInterval;
    if (selectedChangeType === 'upgrade') return 'Upgrade';
    if (selectedChangeType === 'downgrade') return 'Downgrade';
    if (isSamePlan && !isSameInterval) return 'Switch Plan';
    return 'Renew Plan';
  }, [billingCycle, currentBillingInterval, currentPlanId, selectedChangeType, selectedPlanId]);

  useEffect(() => {
    if (step !== 'payment') return;
    fetchWalletBalance();
  }, [step, restaurantId]);

  useEffect(() => {
    if (!isDuitNowEnabled) return;
    fetchPaymentQrImage();
  }, [isDuitNowEnabled]);

  useEffect(() => {
    return () => {
      if (duitnowPreviewUrl) URL.revokeObjectURL(duitnowPreviewUrl);
    };
  }, [duitnowPreviewUrl]);

  const fetchWalletBalance = async () => {
    setIsWalletLoading(true);
    try {
      const res = await fetch(`/api/wallet?action=balance&restaurantId=${encodeURIComponent(restaurantId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setWalletBalance(Number(data.balance) || 0);
    } catch {
      setWalletBalance(0);
    } finally {
      setIsWalletLoading(false);
    }
  };

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

  const resetDuitNowForm = () => {
    setDuitnowRef('');
    setDuitnowAttachment(null);
    setDuitnowPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const getChangeType = (planId: PlanId): PlanChangeType => {
    if (planId === currentPlanId) return 'renew';
    const newIndex = planOrder.indexOf(planId);
    return newIndex > currentIndex ? 'upgrade' : 'downgrade';
  };

  const openConfirmation = (planId: PlanId) => {
    const changeType = getChangeType(planId);
    setSelectedPlanId(planId);
    setSelectedChangeType(changeType);
    setSelectedPaymentMethod('card');
    resetDuitNowForm();
    setError('');
    setStep('confirm');
  };

  const handleCheckout = async (planId: PlanId, changeType: PlanChangeType = 'renew') => {
    setIsLoading(true);
    setLoadingPlanId(planId);
    setError('');

    try {
      const renewFrom = changeType === 'upgrade'
        ? undefined
        : (subscription?.current_period_end || subscription?.trial_end || undefined);

      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          planId,
          mode: 'payment',
          source: 'upgrade',
          billingInterval: billingCycle,
          renewFrom,
          changeType,
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

  const handleWalletPayment = async () => {
    setIsLoading(true);
    setLoadingPlanId(selectedPlanId);
    setError('');

    try {
      const res = await fetch('/api/stripe/billing?action=plan-change-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          planId: selectedPlanId,
          billingInterval: billingCycle,
          changeType: selectedChangeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Wallet payment failed.');
        return;
      }
      toast(`${actionLabel} paid with wallet.`, 'success');
      onUpgraded();
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
      setLoadingPlanId(null);
    }
  };

  const handleDuitNowPayment = async () => {
    if (!isDuitNowRenewalAvailable) {
      setError(selectedPlanId === currentPlanId
        ? 'DuitNow payment is not enabled for this restaurant.'
        : 'DuitNow QR is available for plan renewals only.');
      return;
    }

    setIsLoading(true);
    setLoadingPlanId(selectedPlanId);
    setError('');

    try {
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
          planId: selectedPlanId,
          billingInterval: billingCycle,
          amount: selectedTotalAmount,
          attachmentUrl,
          referenceNumber: duitnowRef.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to submit DuitNow payment.');
        return;
      }
      toast('DuitNow payment submitted. Provisional access is active for 24 hours while admin reviews it.', 'success');
      resetDuitNowForm();
      onUpgraded({ pendingDuitNow: true });
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
      setLoadingPlanId(null);
    }
  };

  const handlePaymentNext = () => {
    if (selectedPaymentMethod === 'card') {
      setError('');
      setStep('redirect');
      handleCheckout(selectedPlanId, selectedChangeType);
      return;
    }
    if (selectedPaymentMethod === 'wallet') {
      handleWalletPayment();
      return;
    }
    setError('');
    setStep('duitnow');
  };

  const getVisualStepIndex = (modalStep: ModalStep) => {
    if (modalStep === 'duitnow' || modalStep === 'redirect') return 3;
    if (modalStep === 'plans') return 0;
    if (modalStep === 'confirm') return 1;
    if (modalStep === 'payment') return 2;
    return stepOrder.indexOf(modalStep);
  };

  const renderStepDots = (className = '') => (
    <div className={`flex items-center justify-center gap-2 ${className}`} aria-label="Plan change progress">
      {stepOrder.map((item, index) => {
        const currentIndex = getVisualStepIndex(step);
        const isActive = index === currentIndex;
        const canNavigate = index < currentIndex && item !== 'finish' && !isLoading && !isRedirecting;
        return (
          <button
            key={item}
            type="button"
            onClick={() => {
              if (canNavigate) {
                setError('');
                setStep(item);
              }
            }}
            className={`h-2.5 rounded-full transition-all ${
              isActive ? 'w-8 bg-orange-500' : 'w-2.5 bg-gray-300 dark:bg-gray-600'
            }`}
            aria-label={`Step ${index + 1}`}
            aria-current={isActive ? 'step' : undefined}
            disabled={!canNavigate}
          />
        );
      })}
    </div>
  );

  const renderPlansStep = () => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-1 gap-3 pt-5 md:grid-cols-3 lg:gap-5 lg:pt-6">
        {PRICING_PLANS.map((plan, i) => {
          const isSamePlan = plan.id === currentPlanId;
          const isCurrent = isSamePlan && billingCycle === currentBillingInterval;
          const isUpgrade = i > currentIndex;
          const displayPrice = billingCycle === 'annual' ? plan.annualPrice : plan.price;
          const annualSavings = (plan.price - plan.annualPrice) * 12;
          const isThisPlanLoading = loadingPlanId === plan.id && isLoading;

          return (
            <div
              key={plan.id}
              className={`group relative flex min-h-[350px] cursor-pointer flex-col rounded-[16px] border bg-white p-5 pt-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:bg-gray-800 lg:min-h-[360px] ${
                isSamePlan
                  ? 'border-orange-500 shadow-lg shadow-orange-100 dark:shadow-orange-900/20'
                  : plan.highlight
                    ? 'border-orange-500 shadow-lg shadow-orange-100 dark:shadow-orange-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-orange-400'
              }`}
              onClick={() => !isLoading && !isRedirecting && openConfirmation(plan.id)}
            >
              {isSamePlan ? (
                <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500 px-3 py-1 text-[8px] font-black uppercase tracking-widest text-white shadow-lg shadow-orange-200/70 whitespace-nowrap dark:shadow-none lg:px-4 lg:text-[10px]">
                  Current Plan ({currentBillingLabel})
                </div>
              ) : plan.highlight && (
                <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500 px-3 py-1 text-[8px] font-black uppercase tracking-widest text-white shadow-lg shadow-orange-200/70 whitespace-nowrap dark:shadow-none lg:px-4 lg:text-[10px]">
                  Most Popular
                </div>
              )}

              <h3 className="mb-2 flex min-h-7 flex-wrap items-center gap-2 text-base font-black uppercase leading-none tracking-tight text-gray-900 dark:text-white lg:text-xl">
                <span className="leading-none">{plan.name}</span>
                {billingCycle === 'annual' && (
                  <span className="inline-flex h-6 items-center rounded-full bg-orange-500 px-2.5 text-[8px] font-black uppercase tracking-widest text-white shadow-sm lg:text-[10px]">
                    Save RM{annualSavings}
                  </span>
                )}
              </h3>

              <p className="mb-3 line-clamp-2 text-[10px] font-medium text-gray-500 dark:text-gray-400 lg:mb-4 lg:text-xs">
                {plan.description}
              </p>

              <div className="mb-2">
                <div className="flex flex-wrap items-baseline gap-1">
                  <span className="text-xl lg:text-3xl font-black text-orange-500">MYR {displayPrice}</span>
                  <span className="text-gray-400 font-bold text-[10px] lg:text-sm">/mo</span>
                </div>
                {billingCycle === 'annual' && (
                  <p className="text-[9px] lg:text-xs text-gray-400 font-medium mt-0.5">
                    Billed MYR {displayPrice * 12}/year
                  </p>
                )}
              </div>

              <ul className="mb-5 flex-1 space-y-2">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-start gap-2 text-[11px] font-medium text-gray-600 dark:text-gray-300 lg:gap-3 lg:text-sm">
                    <Check size={13} className="mt-0.5 shrink-0 text-orange-500 lg:h-4 lg:w-4" />
                    {feature}
                  </li>
                ))}
              </ul>

              {isSamePlan ? (
                <button
                  disabled={isLoading || isRedirecting}
                  onClick={(event) => {
                    event.stopPropagation();
                    openConfirmation(plan.id);
                  }}
                  className={`mt-auto flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 lg:py-3 lg:text-sm ${
                    isCurrent
                      ? 'bg-orange-500 text-white shadow-xl shadow-orange-100 dark:shadow-none hover:bg-orange-600 hover:scale-[1.02]'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-orange-500 hover:text-white hover:scale-[1.02]'
                  }`}
                >
                  {isThisPlanLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isCurrent ? (
                    <><RefreshCw size={14} /> Renew Plan</>
                  ) : (
                    <><ArrowLeftRight size={14} /> Switch Plan</>
                  )}
                </button>
              ) : (
                <button
                  disabled={isLoading || isRedirecting}
                  onClick={(event) => {
                    event.stopPropagation();
                    openConfirmation(plan.id);
                  }}
                  className={`mt-auto flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 lg:py-3 lg:text-sm ${
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

      <div className="mt-auto shrink-0 pt-3 text-center lg:pt-4">
        {renderStepDots('mb-2')}
        <p className="text-[10px] font-medium text-gray-400 lg:text-xs">
          You will be charged the full plan price. Changes take effect immediately. Prices in Malaysian Ringgit (MYR).
        </p>
      </div>
    </div>
  );

  const renderConfirmationStep = () => (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-5 dark:border-orange-900/40 dark:bg-orange-900/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Payment Confirmation</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-gray-900 dark:text-white">
              {actionLabel}
            </h2>
            <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
              Confirm the selected plan and billing cycle before choosing a payment method.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Current Plan</p>
              <p className="mt-1 text-lg font-black text-gray-900 dark:text-white">{currentPlanLabel}</p>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400">{currentBillingLabel}</p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-white p-4 dark:border-orange-900/50 dark:bg-gray-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Selected Plan</p>
              <p className="mt-1 text-lg font-black text-gray-900 dark:text-white">{selectedPlan.name}</p>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400">{selectedBillingLabel}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Monthly Price</p>
              <p className="mt-1 text-lg font-black text-orange-500">MYR {selectedMonthlyPrice}/mo</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Amount Due</p>
              <p className="mt-1 text-lg font-black text-orange-500">MYR {selectedTotalAmount}</p>
              <p className="text-[10px] font-bold text-gray-400">
                {billingCycle === 'annual' ? `MYR ${selectedMonthlyPrice}/mo x 12` : 'Monthly billing'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid shrink-0 grid-cols-[minmax(96px,1fr)_auto_minmax(96px,1fr)] items-center gap-3 pt-3 lg:pt-4">
        <button
          onClick={() => setStep('plans')}
          className="inline-flex justify-self-start items-center gap-2 rounded-xl border border-gray-300 px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <ArrowLeft size={14} /> Back
        </button>
        {renderStepDots('justify-self-center')}
        <button
          onClick={() => {
            setError('');
            setStep('payment');
          }}
          className="inline-flex justify-self-end items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600 dark:shadow-none"
        >
          Next <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );

  const paymentCardClass = (method: PaymentMethod, disabled = false) => {
    const selected = selectedPaymentMethod === method;
    return `relative h-[168px] rounded-xl border-2 p-5 text-left transition-all ${
      disabled
        ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-800/50'
        : selected
          ? 'cursor-pointer border-orange-500 bg-white shadow-lg shadow-orange-100 dark:bg-gray-800 dark:shadow-none'
          : 'cursor-pointer border-gray-200 bg-gray-50 hover:border-orange-300 dark:border-gray-700 dark:bg-gray-800/60'
    }`;
  };

  const renderPaymentStep = () => {
    const walletRemaining = walletBalance - selectedTotalAmount;
    const walletDisabled = isWalletLoading || walletBalance < selectedTotalAmount;

    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Choose Payment Method</p>
              <h2 className="text-2xl font-black uppercase tracking-tight text-gray-900 dark:text-white">
                MYR {selectedTotalAmount}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-5">
              <button
                type="button"
                onClick={() => setSelectedPaymentMethod('card')}
                className={paymentCardClass('card')}
              >
                {selectedPaymentMethod === 'card' && (
                  <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500">
                    <Check size={14} className="text-white" strokeWidth={3} />
                  </div>
                )}
                <CreditCard size={26} className="text-orange-500" />
                <p className="mt-4 text-sm font-black uppercase text-gray-900 dark:text-white">Credit / Debit Card</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-gray-500 dark:text-gray-400">
                  Pay securely through Stripe checkout.
                </p>
              </button>

              <button
                type="button"
                disabled={walletDisabled}
                onClick={() => !walletDisabled && setSelectedPaymentMethod('wallet')}
                className={paymentCardClass('wallet', walletDisabled)}
              >
                {selectedPaymentMethod === 'wallet' && (
                  <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500">
                    <Check size={14} className="text-white" strokeWidth={3} />
                  </div>
                )}
                <Wallet size={26} className="text-emerald-500" />
                <p className="mt-4 text-sm font-black uppercase text-gray-900 dark:text-white">Wallet Balance</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-gray-500 dark:text-gray-400">
                  {isWalletLoading ? 'Loading balance...' : `Available RM ${walletBalance.toFixed(2)}`}
                </p>
                {!isWalletLoading && (
                  <p className={`mt-1 text-[10px] font-black ${walletRemaining >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    After payment RM {walletRemaining.toFixed(2)}
                  </p>
                )}
              </button>

              <button
                type="button"
                disabled={!isDuitNowRenewalAvailable}
                onClick={() => isDuitNowRenewalAvailable && setSelectedPaymentMethod('duitnow')}
                className={paymentCardClass('duitnow', !isDuitNowRenewalAvailable)}
              >
                {selectedPaymentMethod === 'duitnow' && (
                  <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500">
                    <Check size={14} className="text-white" strokeWidth={3} />
                  </div>
                )}
                <QrCode size={26} className="text-[#ED2C67]" />
                <p className="mt-4 text-sm font-black uppercase text-gray-900 dark:text-white">DuitNow QR</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-gray-500 dark:text-gray-400">
                  {isDuitNowRenewalAvailable
                    ? 'Submit QR renewal for admin review.'
                    : selectedPlanId !== currentPlanId
                      ? 'Available for current-plan renewals only.'
                      : 'Not enabled for this restaurant.'}
                </p>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid shrink-0 grid-cols-[minmax(96px,1fr)_auto_minmax(96px,1fr)] items-center gap-3 pt-3 lg:pt-4">
          <button
            onClick={() => setStep('confirm')}
            disabled={isLoading}
            className="inline-flex justify-self-start items-center gap-2 rounded-xl border border-gray-300 px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ArrowLeft size={14} /> Back
          </button>
          {renderStepDots('justify-self-center')}
          <button
            onClick={handlePaymentNext}
            disabled={isLoading || isRedirecting || (selectedPaymentMethod === 'wallet' && walletDisabled) || (selectedPaymentMethod === 'duitnow' && !isDuitNowRenewalAvailable)}
            className="inline-flex min-w-[150px] justify-self-end items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600 disabled:opacity-50 dark:shadow-none"
          >
            {isLoading ? (
              <><Loader2 size={14} className="animate-spin" /> Processing</>
            ) : (
              <>Next <ArrowRight size={14} /></>
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderDuitNowStep = () => {
    const intervalLabel = billingCycle === 'annual' ? 'Annual' : 'Monthly';

    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <div className="grid min-h-full overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 md:grid-cols-[300px_minmax(0,1fr)]">
            <div className="bg-gradient-to-br from-[#ED2C67] to-[#c4214f] text-white">
              <div className="flex h-full flex-col px-6 py-5">
                <div className="mb-4 flex items-center gap-3">
                  <img
                    src="/LOGO/duitnow_logo.png"
                    alt="DuitNow"
                    className="h-8 w-auto object-contain brightness-0 invert"
                  />
                  <div>
                    <h3 className="text-sm font-black leading-tight">Pay via DuitNow</h3>
                    <p className="text-[10px] font-semibold text-white/75">Scan with any bank app or e-wallet</p>
                  </div>
                </div>

                <div className="mb-5 rounded-xl bg-white/12 p-3.5 backdrop-blur-sm">
                  <p className="mb-1 text-[10px] font-semibold text-white/75">Amount to pay</p>
                  <p className="text-3xl font-black leading-none">RM {selectedTotalAmount.toFixed(2)}</p>
                  <p className="mt-1 text-[10px] font-semibold text-white/75">
                    {selectedPlan.name} Plan - {intervalLabel}{billingCycle === 'annual' ? ` (RM${selectedMonthlyPrice}/mo x 12)` : ''}
                  </p>
                </div>

                <div className="flex flex-1 flex-col items-center justify-center">
                  <div className="rounded-xl bg-white p-3.5 shadow-lg">
                    <img
                      src={paymentQrImageUrl || DEFAULT_DUITNOW_QR_SRC}
                      alt="DuitNow QR Code"
                      className="h-40 w-40 object-contain"
                      onError={() => setPaymentQrImageUrl(null)}
                    />
                  </div>
                  <p className="mt-2 text-[10px] font-semibold text-white/75">Lumora HQ</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-xl bg-[#ED2C67]/5 p-3.5 dark:bg-[#ED2C67]/10">
                <div className="space-y-2">
                  {[
                    'Scan the QR code using any banking app or e-wallet',
                    `Enter the exact amount: RM ${selectedTotalAmount.toFixed(2)}`,
                    'Complete the transfer, then submit the details below',
                  ].map((instruction, index) => (
                    <div key={instruction} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#ED2C67] text-[10px] font-black text-white">
                        {index + 1}
                      </span>
                      <p className="text-xs font-semibold leading-relaxed text-gray-700 dark:text-gray-300">
                        {instruction}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-gray-300">
                  Bank Reference Number <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={duitnowRef}
                  onChange={event => setDuitnowRef(event.target.value)}
                  placeholder="e.g. 20260420123456"
                  maxLength={100}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-[#ED2C67]/40 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-gray-300">
                  Payment Proof <span className="font-normal text-gray-400">(optional - screenshot)</span>
                </label>
                {duitnowPreviewUrl ? (
                  <div className="relative overflow-hidden rounded-xl border-2 border-[#ED2C67]/40 dark:border-[#ED2C67]/30">
                    <img src={duitnowPreviewUrl} alt="Payment proof" className="h-28 w-full bg-gray-100 object-contain dark:bg-gray-700" />
                    <button
                      type="button"
                      onClick={() => {
                        setDuitnowAttachment(null);
                        setDuitnowPreviewUrl(null);
                      }}
                      className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-3.5 transition-all hover:border-[#ED2C67]/50 hover:bg-[#ED2C67]/5 dark:border-gray-600 dark:hover:bg-[#ED2C67]/10">
                    <Upload size={16} className="text-gray-400" />
                    <span className="text-xs font-semibold text-gray-500">Upload transfer screenshot</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={event => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          toast('File too large. Max 5MB.', 'error');
                          return;
                        }
                        setDuitnowAttachment(file);
                        setDuitnowPreviewUrl(URL.createObjectURL(file));
                      }}
                    />
                  </label>
                )}
              </div>

              <p className="text-center text-[10px] font-semibold leading-relaxed text-gray-400">
                Admin will verify your payment. Provisional plan access is available for 24 hours while the payment is pending.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid shrink-0 grid-cols-[minmax(96px,1fr)_auto_minmax(96px,1fr)] items-center gap-3 pt-3 lg:pt-4">
          <button
            onClick={() => setStep('payment')}
            disabled={isLoading}
            className="inline-flex justify-self-start items-center gap-2 rounded-lg border border-gray-300 px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ArrowLeft size={14} /> Back
          </button>
          {renderStepDots('justify-self-center')}
          <button
            onClick={handleDuitNowPayment}
            disabled={isLoading}
            className="inline-flex min-w-[180px] justify-self-end items-center justify-center gap-2 rounded-lg bg-[#ED2C67] px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-pink-100 transition-all hover:bg-[#c4214f] disabled:opacity-50 dark:shadow-none"
          >
            {isLoading ? (
              <><Loader2 size={14} className="animate-spin" /> Submitting</>
            ) : (
              <><CheckCircle size={14} /> I've Paid - Submit</>
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderRedirectStep = () => (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl bg-orange-100 text-orange-500 dark:bg-orange-900/25">
            <Loader2 size={30} className={isLoading || isRedirecting ? 'animate-spin' : ''} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-500">Stripe Checkout</p>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-gray-900 dark:text-white">
            Redirecting to Stripe...
          </h2>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-gray-500 dark:text-gray-400">
            Please keep this page open while secure checkout starts for RM {selectedTotalAmount.toFixed(2)}.
          </p>
          {error && !isLoading && !isRedirecting && (
            <button
              type="button"
              onClick={() => {
                setError('');
                setStep('payment');
              }}
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <ArrowLeft size={14} /> Choose Another Payment
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative flex h-[90vh] max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800 lg:h-[690px]">
        <div className="shrink-0 bg-white px-4 pt-4 dark:bg-gray-800 lg:px-6 lg:pt-5">
          <button onClick={onClose} className="absolute top-4 right-4 lg:top-6 lg:right-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X size={20} className="text-gray-500" />
          </button>

          <div className="text-center mb-2 lg:mb-4">
            <h1 className="text-2xl lg:text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">
              Change Your Plan
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium text-xs lg:text-sm">
              Current plan: <span className="text-orange-500 font-bold uppercase">{currentPlanLabel} - {currentBillingLabel}</span>
              {subscription?.status === 'trialing' && (
                <span className="ml-2 text-green-500 font-bold">(Trial Active)</span>
              )}
            </p>

            {step === 'plans' && (
              <div className="mt-4 flex h-10 items-center justify-center lg:mt-6">
                <div className="inline-flex items-center bg-gray-200 dark:bg-gray-700 rounded-full p-1">
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
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 lg:px-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-medium border border-red-100 dark:border-red-900/40">
              {error}
            </div>
          )}

          {step === 'plans' && renderPlansStep()}
          {step === 'confirm' && renderConfirmationStep()}
          {step === 'payment' && renderPaymentStep()}
          {step === 'duitnow' && renderDuitNowStep()}
          {step === 'redirect' && renderRedirectStep()}
        </div>

      </div>
    </div>
  );
};

export default UpgradePlanModal;
