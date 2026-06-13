import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, ArrowRight, Loader2, RefreshCw, ArrowLeftRight, ArrowLeft, CreditCard, Wallet, QrCode } from 'lucide-react';
import { PlanId, Subscription } from '../src/types';
import { PRICING_PLANS } from '../lib/pricingPlans';
import { toast } from '../components/Toast';

interface Props {
  currentPlanId: PlanId;
  restaurantId: string;
  subscription: Subscription | null;
  onClose: () => void;
  onUpgraded: () => void;
}

type ModalStep = 'plans' | 'confirm' | 'payment';
type PlanChangeType = 'upgrade' | 'downgrade' | 'renew';
type PaymentMethod = 'card' | 'wallet' | 'duitnow';

const planOrder: PlanId[] = ['basic', 'pro', 'pro_plus'];
const stepOrder: ModalStep[] = ['plans', 'confirm', 'payment'];

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
    if (!isDuitNowEnabled) {
      setError('DuitNow payment is not enabled for this restaurant.');
      return;
    }

    setIsLoading(true);
    setLoadingPlanId(selectedPlanId);
    setError('');

    try {
      const res = await fetch('/api/stripe/billing?action=duitnow-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          planId: selectedPlanId,
          billingInterval: billingCycle,
          amount: selectedTotalAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to submit DuitNow payment.');
        return;
      }
      toast('DuitNow payment submitted for review.', 'success');
      onUpgraded();
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
      setLoadingPlanId(null);
    }
  };

  const handlePaymentNext = () => {
    if (selectedPaymentMethod === 'card') {
      handleCheckout(selectedPlanId, selectedChangeType);
      return;
    }
    if (selectedPaymentMethod === 'wallet') {
      handleWalletPayment();
      return;
    }
    handleDuitNowPayment();
  };

  const renderStepDots = () => (
    <div className="mt-3 flex items-center justify-center gap-2" aria-label="Plan change progress">
      {stepOrder.map((item, index) => {
        const isActive = item === step;
        return (
          <button
            key={item}
            type="button"
            onClick={() => {
              if (index <= stepOrder.indexOf(step)) setStep(item);
            }}
            className={`h-2.5 rounded-full transition-all ${
              isActive ? 'w-8 bg-orange-500' : 'w-2.5 bg-gray-300 dark:bg-gray-600'
            }`}
            aria-label={`Step ${index + 1}`}
          />
        );
      })}
    </div>
  );

  const renderPlansStep = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-6">
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
              className={`relative bg-white dark:bg-gray-800 rounded-2xl lg:rounded-3xl border-2 p-3 lg:p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer group flex flex-col min-h-[360px] ${
                isCurrent
                  ? 'border-orange-500 shadow-lg shadow-orange-100 dark:shadow-orange-900/20'
                  : plan.highlight
                    ? 'border-orange-500 shadow-lg shadow-orange-100 dark:shadow-orange-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-orange-400'
              }`}
              onClick={() => !isLoading && !isRedirecting && openConfirmation(plan.id)}
            >
              {isCurrent ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 lg:px-4 py-1 bg-orange-500 text-white text-[8px] lg:text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg whitespace-nowrap">
                  Current Plan
                </div>
              ) : billingCycle === 'monthly' && plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 lg:px-4 py-1 bg-orange-500 text-white text-[8px] lg:text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg whitespace-nowrap">
                  Most Popular
                </div>
              )}

              <h3 className="text-sm lg:text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-0.5 lg:mb-1 flex flex-wrap items-center gap-1.5">
                <span>{plan.name}</span>
                {billingCycle === 'annual' && (
                  <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[8px] lg:text-[10px] font-black uppercase tracking-widest text-white shadow-sm">
                    - Save RM{annualSavings}
                  </span>
                )}
              </h3>

              <p className="text-[9px] lg:text-xs text-gray-500 dark:text-gray-400 font-medium mb-2 lg:mb-4 line-clamp-2">
                {plan.description}
              </p>

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

              {isSamePlan ? (
                <button
                  disabled={isLoading || isRedirecting}
                  onClick={(event) => {
                    event.stopPropagation();
                    openConfirmation(plan.id);
                  }}
                  className={`w-full py-2 lg:py-3 rounded-xl lg:rounded-2xl font-black text-[9px] lg:text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-1 lg:gap-2 mt-auto disabled:opacity-50 ${
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
    </>
  );

  const renderConfirmationStep = () => (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-5 dark:border-orange-900/40 dark:bg-orange-900/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Payment Confirmation</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-gray-900 dark:text-white">
              {actionLabel}
            </h2>
            <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
              Confirm the selected plan and billing cycle before choosing a payment method.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Current Plan</p>
              <p className="mt-1 text-lg font-black text-gray-900 dark:text-white">{currentPlanLabel}</p>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400">{currentBillingLabel}</p>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-white p-4 dark:border-orange-900/50 dark:bg-gray-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Selected Plan</p>
              <p className="mt-1 text-lg font-black text-gray-900 dark:text-white">{selectedPlan.name}</p>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400">{selectedBillingLabel}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Monthly Price</p>
              <p className="mt-1 text-lg font-black text-orange-500">MYR {selectedMonthlyPrice}/mo</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Amount Due</p>
              <p className="mt-1 text-lg font-black text-orange-500">MYR {selectedTotalAmount}</p>
              <p className="text-[10px] font-bold text-gray-400">
                {billingCycle === 'annual' ? `MYR ${selectedMonthlyPrice}/mo x 12` : 'Monthly billing'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-700">
        <button
          onClick={() => setStep('plans')}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <button
          onClick={() => {
            setError('');
            setStep('payment');
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600 dark:shadow-none"
        >
          Next <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );

  const paymentCardClass = (method: PaymentMethod, disabled = false) => {
    const selected = selectedPaymentMethod === method;
    return `relative h-[168px] rounded-2xl border-2 p-5 text-left transition-all ${
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
        <div className="flex-1 overflow-y-auto">
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
                disabled={!isDuitNowEnabled}
                onClick={() => isDuitNowEnabled && setSelectedPaymentMethod('duitnow')}
                className={paymentCardClass('duitnow', !isDuitNowEnabled)}
              >
                {selectedPaymentMethod === 'duitnow' && (
                  <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500">
                    <Check size={14} className="text-white" strokeWidth={3} />
                  </div>
                )}
                <QrCode size={26} className="text-[#ED2C67]" />
                <p className="mt-4 text-sm font-black uppercase text-gray-900 dark:text-white">DuitNow QR</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-gray-500 dark:text-gray-400">
                  {isDuitNowEnabled ? 'Submit QR payment for admin review.' : 'Not enabled for this restaurant.'}
                </p>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-700">
          <button
            onClick={() => setStep('confirm')}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <button
            onClick={handlePaymentNext}
            disabled={isLoading || isRedirecting || (selectedPaymentMethod === 'wallet' && walletDisabled) || (selectedPaymentMethod === 'duitnow' && !isDuitNowEnabled)}
            className="inline-flex min-w-[150px] items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600 disabled:opacity-50 dark:shadow-none"
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {isRedirecting && (
        <div className="absolute inset-0 z-[10000] flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
          <Loader2 size={40} className="animate-spin text-orange-500 mb-4" />
          <p className="text-sm font-black text-gray-700 dark:text-white uppercase tracking-widest">Redirecting to checkout...</p>
          <p className="text-[10px] text-gray-400 mt-1">Please wait while we set things up</p>
        </div>
      )}

      <div className="relative flex h-[90vh] max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800 lg:h-[720px] lg:rounded-3xl">
        <div className="shrink-0 bg-white px-4 pt-4 dark:bg-gray-800 lg:px-6 lg:pt-6">
          <button onClick={onClose} className="absolute top-4 right-4 lg:top-6 lg:right-6 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X size={20} className="text-gray-500" />
          </button>

          <div className="text-center mb-3 lg:mb-5">
            <h1 className="text-2xl lg:text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">
              Change Your Plan
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium text-xs lg:text-sm">
              Current plan: <span className="text-orange-500 font-bold uppercase">{currentPlanLabel} - {currentBillingLabel}</span>
              {subscription?.status === 'trialing' && (
                <span className="ml-2 text-green-500 font-bold">(Trial Active)</span>
              )}
            </p>
            {renderStepDots()}

            <div className="mt-4 flex h-10 items-center justify-center lg:mt-6">
              {step === 'plans' && (
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
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 lg:px-6 lg:pb-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-medium border border-red-100 dark:border-red-900/40">
              {error}
            </div>
          )}

          {step === 'plans' && renderPlansStep()}
          {step === 'confirm' && renderConfirmationStep()}
          {step === 'payment' && renderPaymentStep()}
        </div>
      </div>
    </div>
  );
};

export default UpgradePlanModal;
