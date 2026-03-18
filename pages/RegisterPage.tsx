import React, { useState } from 'react';
import { ChevronLeft, Check, AlertCircle, Loader2, ArrowRight, LogIn } from 'lucide-react';
import { PricingPlan, PlanId } from '../src/types';
import { PRICING_PLANS, TRIAL_DAYS } from '../lib/pricingPlans';

interface Props {
  onBack: () => void;
  onRegisterSuccess: () => void;
  onLoginClick: () => void;
}

const RegisterPage: React.FC<Props> = ({ onBack, onRegisterSuccess, onLoginClick }) => {
  const [step, setStep] = useState<'plan' | 'details'>('plan');
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('pro');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // Registration fields
  const [restaurantName, setRestaurantName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectPlan = (planId: PlanId) => {
    setSelectedPlan(planId);
    setStep('details');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantName,
          ownerName,
          email,
          phone,
          username,
          password,
          planId: selectedPlan,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed. Please try again.');
        return;
      }

      // Redirect to Stripe Checkout for payment
      const checkoutRes = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: data.restaurantId,
          planId: selectedPlan,
          mode: 'subscription',
        }),
      });

      const checkoutData = await checkoutRes.json();
      if (checkoutRes.ok && checkoutData.url) {
        window.location.href = checkoutData.url;
        return;
      }

      // If checkout fails, still let them log in
      onRegisterSuccess();
    } catch {
      setError('Connection error. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Plan selection step
  if (step === 'plan') {
    const annualSavePct = Math.round((1 - PRICING_PLANS[1].annualPrice / PRICING_PLANS[1].price) * 100);

    return (
      <div className="h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors flex flex-col">
        <button
          onClick={onBack}
          className="fixed top-4 left-4 lg:top-8 lg:left-8 z-50 flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 font-semibold transition-colors"
        >
          <ChevronLeft size={20} />
          Back
        </button>

        <button
          onClick={onLoginClick}
          className="fixed top-4 right-4 lg:top-8 lg:right-8 z-50 text-gray-600 dark:text-gray-400 font-semibold hover:text-orange-500 transition-colors"
        >
          Login
        </button>

        <div className="max-w-5xl mx-auto px-4 py-6 lg:py-10 flex flex-col flex-1 min-h-0">
          <div className="text-center mb-3 lg:mb-5 shrink-0">
            <img
              src="/LOGO/icon-192x192.png"
              alt="QuickServe logo"
              className="w-10 h-10 lg:w-14 lg:h-14 rounded-2xl object-contain mx-auto mb-2 lg:mb-3"
            />
            <h1 className="text-2xl lg:text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase">
              Choose Your Plan
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium text-xs lg:text-sm">
              Cancel at any time. All plans include a {TRIAL_DAYS}-day free trial.
            </p>

            {/* Monthly / Annual Toggle */}
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

          <div className="grid grid-cols-3 gap-3 lg:gap-6 flex-1 min-h-0">
            {PRICING_PLANS.map((plan) => {
              const displayPrice = billingCycle === 'annual' ? plan.annualPrice : plan.price;

              return (
                <div
                  key={plan.id}
                  className={`relative bg-white dark:bg-gray-800 rounded-2xl lg:rounded-3xl border-2 p-3 lg:p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer group flex flex-col ${
                    plan.highlight
                      ? 'border-orange-500 shadow-lg shadow-orange-100 dark:shadow-orange-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-orange-400'
                  }`}
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  {plan.highlight && (
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
                      <span className="text-sm lg:text-lg text-gray-400 font-bold line-through">MYR {plan.price}</span>
                      <span className="text-xl lg:text-3xl font-black text-orange-500">MYR 0</span>
                      <span className="text-gray-400 font-bold text-[10px] lg:text-sm">/mo</span>
                    </div>
                    <p className="text-[9px] lg:text-xs text-gray-400 font-medium mt-0.5">
                      For 1 month, MYR {displayPrice}/mo after
                    </p>
                  </div>

                  <ul className="space-y-1 lg:space-y-2 mb-3 lg:mb-6 flex-1">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-1.5 lg:gap-3 text-[10px] lg:text-sm text-gray-600 dark:text-gray-300 font-medium">
                        <Check size={12} className="text-orange-500 shrink-0 mt-0.5 lg:w-4 lg:h-4" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button className={`w-full py-2 lg:py-3 rounded-xl lg:rounded-2xl font-black text-[9px] lg:text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-1 lg:gap-2 mt-auto ${
                    plan.highlight
                      ? 'bg-orange-500 text-white shadow-xl shadow-orange-100 dark:shadow-none hover:bg-orange-600 hover:scale-[1.02]'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-orange-500 hover:text-white hover:scale-[1.02]'
                  }`}>
                    Start Free Trial <ArrowRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="shrink-0 pt-3 lg:pt-4">
            <p className="text-center text-gray-400 text-[10px] lg:text-xs font-medium">
              All plans include a {TRIAL_DAYS}-day free trial. Cancel anytime. Prices in Malaysian Ringgit (MYR).
            </p>

            <div className="text-center mt-2">
              <p className="text-gray-500 dark:text-gray-400 text-xs lg:text-sm font-medium">
                Already have an account?{' '}
                <button
                  onClick={onLoginClick}
                  className="text-orange-500 font-black hover:text-orange-600 transition-colors inline-flex items-center gap-1"
                >
                  <LogIn size={14} /> Log In
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Details / Registration form step
  const currentPlan = PRICING_PLANS.find(p => p.id === selectedPlan)!;

  return (
    <div className="h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors flex flex-col">
      <button
        onClick={() => setStep('plan')}
        className="fixed top-4 left-4 lg:top-6 lg:left-8 z-50 flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 font-semibold transition-colors"
      >
        <ChevronLeft size={20} />
        Change Plan
      </button>

      <div className="w-full max-w-lg mx-auto px-4 py-4 lg:py-6 flex flex-col flex-1 min-h-0">
        <div className="flex flex-col items-center mb-3 lg:mb-4 shrink-0">
          <img
            src="/LOGO/icon-192x192.png"
            alt="QuickServe logo"
            className="w-12 h-12 lg:w-16 lg:h-16 rounded-2xl object-contain mb-2"
          />
          <h1 className="text-xl lg:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            Create Your Account
          </h1>
          <div className="mt-1.5 inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 rounded-full">
            <span className="text-orange-600 dark:text-orange-400 text-xs font-black uppercase tracking-wider">
              {currentPlan.name} Plan
            </span>
            <span className="text-gray-400 dark:text-gray-500 text-xs font-bold">
              — MYR 0/mo for 1 month, then MYR {billingCycle === 'annual' ? currentPlan.annualPrice : currentPlan.price}/mo
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl lg:rounded-3xl shadow-2xl shadow-gray-200 dark:shadow-none border border-gray-100 dark:border-gray-700 p-4 lg:p-6 flex-1 min-h-0 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-3 lg:space-y-4">
            {error && (
              <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-medium border border-red-100 dark:border-red-900/40">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {/* Restaurant & Owner Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 ml-1">Restaurant Name</label>
                <input
                  type="text"
                  required
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder="e.g. Nasi Kandar Amin"
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-orange-500 dark:text-white text-sm font-medium transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 ml-1">Owner Name</label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-orange-500 dark:text-white text-sm font-medium transition-all"
                />
              </div>
            </div>

            {/* Email & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 ml-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-orange-500 dark:text-white text-sm font-medium transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 ml-1">Phone</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+60 12-345 6789"
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-orange-500 dark:text-white text-sm font-medium transition-all"
                />
              </div>
            </div>

            {/* Username */}
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 ml-1">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username for login"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-orange-500 dark:text-white text-sm font-medium transition-all"
              />
            </div>

            {/* Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 ml-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-orange-500 dark:text-white text-sm font-medium transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 ml-1">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-orange-500 dark:text-white text-sm font-medium transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-orange-500 text-white rounded-xl font-black text-sm shadow-xl shadow-orange-100 dark:shadow-none hover:bg-orange-600 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>Register & Pay Now</>
              )}
            </button>

            <p className="text-center text-gray-400 text-[10px] font-medium">
              By registering, you agree to our Terms of Service. You will be redirected to Stripe to complete payment.
            </p>

            <p className="text-center text-gray-500 dark:text-gray-400 text-xs font-medium">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onLoginClick}
                className="text-orange-500 font-black hover:text-orange-600 transition-colors inline-flex items-center gap-1"
              >
                <LogIn size={14} /> Log In
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
