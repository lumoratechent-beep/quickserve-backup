import { PricingPlan } from '../src/types';

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: 30,
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
    highlight: true,
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
    features: [
      'Everything in Pro Plan',
      'Kitchen display system (orders sent directly to kitchen)',
      'Automatic bill routing to counter',
      'Order management by kitchen department (e.g. drinks, food, dessert)',
    ],
  },
];

export const TRIAL_DAYS = 30;
