import React, { useState, useEffect } from 'react';
import { Subscription } from '../src/types';
import { getRenewalStatus, daysUntilExpiry, getSubscriptionEndDate, RenewalStatus, GRACE_PERIOD_DAYS } from '../lib/subscriptionService';
import { AlertCircle, Clock, XCircle, X } from 'lucide-react';

interface Props {
  subscription: Subscription | null;
  onRenewClick?: () => void;
}

const DISMISS_KEY_PREFIX = 'qs_renewal_banner_dismissed_';
/** Re-show the banner after 12 hours */
const DISMISS_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const RenewalBanner: React.FC<Props> = ({ subscription, onRenewClick }) => {
  const [dismissed, setDismissed] = useState(false);

  const status: RenewalStatus = subscription ? getRenewalStatus(subscription) : 'ok';
  const days = subscription ? daysUntilExpiry(subscription) : 0;
  const endDate = subscription ? getSubscriptionEndDate(subscription) : null;

  // On mount / status change: check if the dismiss cooldown has expired
  useEffect(() => {
    if (!subscription) return;
    const key = DISMISS_KEY_PREFIX + subscription.restaurant_id;
    const raw = localStorage.getItem(key);
    if (!raw) {
      setDismissed(false);
      return;
    }
    try {
      const stored = JSON.parse(raw);
      // If status escalated since last dismiss, clear and re-show
      if (stored.status !== status) {
        localStorage.removeItem(key);
        setDismissed(false);
        return;
      }
      // If 12 hours have passed since dismiss, re-show
      if (Date.now() - stored.timestamp >= DISMISS_COOLDOWN_MS) {
        localStorage.removeItem(key);
        setDismissed(false);
        return;
      }
      setDismissed(true);
    } catch {
      localStorage.removeItem(key);
      setDismissed(false);
    }
  }, [status, subscription]);

  if (!subscription || status === 'ok') return null;
  // Blocked cannot be dismissed
  if (status !== 'blocked' && dismissed) return null;

  const handleDismiss = () => {
    if (status === 'blocked') return;
    const key = DISMISS_KEY_PREFIX + subscription.restaurant_id;
    localStorage.setItem(key, JSON.stringify({ status, timestamp: Date.now() }));
    setDismissed(true);
  };

  const formattedEnd = endDate
    ? endDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  const graceDaysLeft = Math.max(0, GRACE_PERIOD_DAYS + days);
  const isPastDue = subscription.status === 'past_due';

  const configs: Record<Exclude<RenewalStatus, 'ok'>, {
    bg: string; icon: React.ReactNode; message: string; buttonLabel: string; buttonClass: string;
  }> = {
    warning: {
      bg: 'bg-yellow-50 border-yellow-300 dark:bg-yellow-900/30 dark:border-yellow-700',
      icon: <Clock size={16} className="text-yellow-600 dark:text-yellow-400 shrink-0" />,
      message: `Your plan expires on ${formattedEnd} (${days} day${days !== 1 ? 's' : ''} left). Renew now to avoid interruption.`,
      buttonLabel: 'Renew Plan',
      buttonClass: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    },
    urgent: {
      bg: 'bg-orange-50 border-orange-400 dark:bg-orange-900/30 dark:border-orange-600',
      icon: <AlertCircle size={16} className="text-orange-600 dark:text-orange-400 shrink-0" />,
      message: isPastDue
        ? 'Your last payment failed. Please update your payment method in Wallet & Billing to avoid service interruption.'
        : `Your plan expires ${days <= 0 ? 'today' : `in ${days} day${days !== 1 ? 's' : ''}`}! Renew immediately to keep your system running.`,
      buttonLabel: isPastDue ? 'Update Payment' : 'Renew Now',
      buttonClass: 'bg-orange-600 hover:bg-orange-700 text-white',
    },
    grace: {
      bg: 'bg-red-50 border-red-400 dark:bg-red-900/30 dark:border-red-600',
      icon: <XCircle size={16} className="text-red-600 dark:text-red-400 shrink-0" />,
      message: `Your plan expired on ${formattedEnd}. You have ${graceDaysLeft} day${graceDaysLeft !== 1 ? 's' : ''} of grace period remaining before your account is deactivated.`,
      buttonLabel: 'Renew Now',
      buttonClass: 'bg-red-600 hover:bg-red-700 text-white',
    },
    blocked: {
      bg: 'bg-red-100 border-red-500 dark:bg-red-900/50 dark:border-red-500',
      icon: <XCircle size={18} className="text-red-700 dark:text-red-400 shrink-0" />,
      message: 'Your plan has expired and the grace period is over. Please renew your subscription to continue using QuickServe.',
      buttonLabel: 'Renew Subscription',
      buttonClass: 'bg-red-700 hover:bg-red-800 text-white',
    },
  };

  const cfg = configs[status];

  return (
    <div className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 border-b text-xs sm:text-sm ${cfg.bg}`}>
      {cfg.icon}
      <span className="flex-1 font-medium text-gray-800 dark:text-gray-200 leading-tight">
        {cfg.message}
      </span>
      {onRenewClick && (
        <button
          onClick={onRenewClick}
          className={`shrink-0 px-3 py-1 rounded-md text-xs font-bold transition-colors ${cfg.buttonClass}`}
        >
          {cfg.buttonLabel}
        </button>
      )}
      {status !== 'blocked' && (
        <button
          onClick={handleDismiss}
          className="shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title="Dismiss"
        >
          <X size={14} className="text-gray-500 dark:text-gray-400" />
        </button>
      )}
    </div>
  );
};

export default RenewalBanner;
