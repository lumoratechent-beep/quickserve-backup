import { PricingPlan } from '../src/types';

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: 30,
    annualPrice: 25,
    description: 'Essential POS features to get your restaurant running smoothly.',
    features: [
      'Full POS system',
      'Back-office management',
      'Sales & performance reports',
      '24/7 customer support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 50,
    annualPrice: 42,
    highlight: true,
    description: 'Advanced ordering with QR and tablet for higher productivity.',
    features: [
      'Everything in Basic Plan',
      'QR ordering system (customers scan QR at table)',
      'Tablet ordering for staff',
    ],
  },
  {
    id: 'pro_plus',
    name: 'Pro Plus',
    price: 65,
    annualPrice: 55,
    description: 'Full kitchen integration with display system and smart routing.',
    features: [
      'Everything in Pro Plan',
      'Kitchen display system (orders sent directly to kitchen)',
      'Automatic bill routing to counter',
      'Order management by kitchen department (e.g. drinks, food, dessert)',
    ],
  },
];

export const TRIAL_DAYS = 30;
