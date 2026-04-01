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
    <div className="h-full bg-gray-50 dark:bg-gray-900 lg:p-6 lg:pb-6 flex flex-col">
      <div className="max-w-5xl w-full mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden flex-1 flex flex-col">
        <div className="flex-shrink-0 p-6 border-b dark:border-gray-700 bg-gradient-to-r from-orange-500/10 via-orange-400/5 to-transparent relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent"></div>
          <div className="relative">
            <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter">
              Wallet & billing
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Manage your subscription plans, payments, wallet balance, and cashout requests.
            </p>
          </div>
        </div>

        {/* Document-style tab bar - Same pattern as Online Shop */}
        <div className="flex-shrink-0 px-6 pt-4">
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
        </div>

        {/* Tab content */}
        <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm mx-6 mb-6 rounded-b-2xl rounded-tr-2xl overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="p-5 md:p-6">
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
        </div>
      </div>
    </div>
  );
};

export default WalletBillingPage;