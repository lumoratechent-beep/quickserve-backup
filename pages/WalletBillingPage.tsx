// pages/WalletBillingPage.tsx

import React, { useState } from 'react';
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
}

const WalletBillingPage: React.FC<Props> = ({
  restaurant,
  restaurantId,
  subscription,
  onUpgradeClick,
  onSubscriptionUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'BILLING' | 'WALLET'>('BILLING');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b dark:border-gray-700 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <h1 className="text-xl font-black dark:text-white uppercase tracking-tighter">
            Wallet & billing
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Manage your subscription plans, payments, wallet balance, and cashout requests.
          </p>
        </div>

        {/* Tab navigation */}
        <div className="max-w-5xl mx-auto px-4 pb-3">
          <div className="flex gap-2">
            {([
              { id: 'BILLING' as const, label: 'Billing', icon: <CreditCard size={13} /> },
              { id: 'WALLET' as const, label: 'Wallet', icon: <Wallet size={13} /> },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-150 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700 overflow-hidden">
          <div className="p-6">
            {activeTab === 'BILLING' && (
              <BillingPage
                restaurantId={restaurantId}
                subscription={subscription}
                onUpgradeClick={onUpgradeClick}
                onSubscriptionUpdated={onSubscriptionUpdated}
              />
            )}

            {activeTab === 'WALLET' && (
              <WalletTab restaurant={restaurant} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default WalletBillingPage;