import type { PlanId, PricingPlan } from '../src/types';

export const REPORT_HISTORY_LIMITS: Record<PlanId, { visibleMonths: number; downloadMonths: number }> = {
  basic: { visibleMonths: 6, downloadMonths: 3 },
  pro: { visibleMonths: 6, downloadMonths: 6 },
  pro_plus: { visibleMonths: 12, downloadMonths: 12 },
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: 30,
    annualPrice: 25,
    trialPrice: 15,
    description: 'Essential POS features to get your restaurant running smoothly.',
    features: [
      'Full POS system',
      'Back-office management',
      'Sales & performance reports',
      '6 months visible report history',
      'Download monthly reports from the past 3 months',
      '24/7 customer support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 50,
    annualPrice: 42,
    trialPrice: 0,
    highlight: true,
    description: 'Advanced ordering with QR and tablet for higher productivity.',
    features: [
      'Everything in Basic Plan',
      'QR ordering system (customers scan QR at table)',
      'Tablet ordering for staff',
      '6 months visible history and monthly downloads',
    ],
  },
  {
    id: 'pro_plus',
    name: 'Pro Plus',
    price: 70,
    annualPrice: 60,
    trialPrice: 0,
    description: 'Full kitchen integration with display system and smart routing.',
    features: [
      'Everything in Pro Plan',
      'Kitchen display system (orders sent directly to kitchen)',
      'Automatic bill routing to counter',
      'Order management by kitchen department (e.g. drinks, food, dessert)',
      '1 year visible history and monthly downloads',
    ],
  },
];

export const TRIAL_DAYS = 30;
