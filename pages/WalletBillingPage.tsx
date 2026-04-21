// pages/WalletBillingPage.tsx

import React, { useEffect, useState } from 'react';
import { Restaurant, Subscription } from '../src/types';
import BillingPage from './BillingPage';
import WalletTab from '../components/WalletTab';
import { CreditCard, Wallet } from 'lucide-react';

interface Props {
  restaurant: Restaurant;
  restaurantId: string;
  subscription: Subscription | null;
  onUpgradeClick: () => void;
  onSubscriptionUpdated?: () => void;
  onComparePlans?: () => void;
}

const WalletBillingPage: React.FC<Props> = ({
  restaurant,
  restaurantId,
  subscription,
  onUpgradeClick,
  onSubscriptionUpdated,
  onComparePlans
}) => {
  const [activeTab, setActiveTab] = useState<'BILLING' | 'WALLET'>(() => {
    const storedTab = localStorage.getItem('qs_wallet_billing_subtab');
    return storedTab === 'WALLET' ? 'WALLET' : 'BILLING';
  });

  useEffect(() => {
    localStorage.setItem('qs_wallet_billing_subtab', activeTab);
  }, [activeTab]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="w-full">
        {/* Header */}
        <div className="mb-5">
          <h2 className="text-lg font-black dark:text-white uppercase tracking-tighter">Wallet & Billing</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage your subscription plans, payments, wallet balance, and cashout requests.</p>
        </div>

        {/* Document-style tab bar */}
        <div className="flex gap-0 relative">
          {([
            { id: 'BILLING' as const, label: 'Billing', icon: <CreditCard size={13} /> },
            { id: 'WALLET' as const, label: 'Wallet', icon: <Wallet size={13} /> },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors duration-150 whitespace-nowrap -mb-px relative ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-800 text-orange-500 border-x border-t border-gray-200 dark:border-gray-600 dark:border-t-orange-500 z-10'
                  : 'bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-5 md:p-6 rounded-b-2xl rounded-tr-2xl">
          {activeTab === 'BILLING' && (
            <BillingPage
              restaurantId={restaurantId}
              subscription={subscription}
              onUpgradeClick={onUpgradeClick}
              onSubscriptionUpdated={onSubscriptionUpdated}
              onComparePlans={onComparePlans}
            />
          )}

          {activeTab === 'WALLET' && (
            <WalletTab restaurant={restaurant} subscription={subscription} />
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletBillingPage;