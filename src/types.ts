// src/types.ts

export const QS_DEFAULT_HUB = 'QuickServe Hub';

export type Role = 'CUSTOMER' | 'VENDOR' | 'ADMIN' | 'CASHIER' | 'KITCHEN';

// Platform access type
export type PlatformAccess = 'pos_and_kitchen' | 'pos_only' | 'pos_and_qr';

export enum OrderStatus {
  PENDING = 'PENDING',
  ONGOING = 'ONGOING',
  SERVED = 'SERVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export type OrderSource = 'counter' | 'qr_order' | 'online';

export interface MenuItemVariant {
  name: string;
  price: number;
}

export interface AddOnItem {
  name: string;
  price: number;
  maxQuantity: number;
  required?: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  isArchived?: boolean;
  // Loyverse-style fields
  cost?: number;           // COGS / cost price
  sku?: string;            // Stock Keeping Unit
  barcode?: string;        // Barcode / EAN / UPC
  soldBy?: 'each' | 'weight'; // Sold by each or weight/volume
  trackStock?: boolean;    // Enable inventory tracking for this item
  // Variant systems
  sizes?: MenuItemVariant[];
  otherVariantName?: string;
  otherVariants?: MenuItemVariant[];
  otherVariantsEnabled?: boolean;
  tempOptions?: {
    hot?: number;
    cold?: number;
    enabled: boolean;
    options?: MenuItemVariant[];
  };
  variantOptions?: {
    enabled: boolean;
    options?: MenuItemVariant[];
  };
  addOns?: AddOnItem[];
  linkedModifiers?: string[];
  color?: string; // Tile color for POS display
  onlineDisabled?: boolean;  // Hide from online shop
  onlinePrice?: number;      // Override price for online orders
}

export interface Area {
  id: string;
  name: string;
  city: string;
  state: string;
  code: string;
  isActive?: boolean;
}

export interface KitchenDepartment {
  name: string;
  categories: string[];
}

export interface Restaurant {
  id: string;
  name: string;
  logo: string;
  menu: MenuItem[];
  vendorId: string;
  location: string;
  isOnline?: boolean;
  created_at?: string;
  settings?: {
    showSalesReport?: boolean;
    showQrGenerator?: boolean;
    orderCode?: string; // 2-5 char prefix for order IDs, unique per restaurant
    // Cross-device persisted settings
    receipt?: Record<string, any>;
    features?: Record<string, any>;
    paymentTypes?: Array<{ id: string; name: string }>;
    taxes?: Array<{ id: string; name: string; percentage: number; applyToItems: boolean }>;
    font?: string;
    currency?: string;
    printers?: Array<Record<string, any>>;
    kitchenSettings?: { autoAccept: boolean; autoPrint: boolean };
    onlineDeliveryOptions?: Array<{ id: string; type: string; label: string; enabled: boolean; fee: number }>;
    onlinePaymentMethods?: Array<{ id: string; label: string; enabled: boolean }>;
    qrLocationLabel?: string; // Custom "Serving At" label for QuickServe Hub restaurants
    backoffice?: Record<string, any>;
  };
  categories?: CategoryData[];
  modifiers?: ModifierData[];
  addOnItems?: AddOnItemData[];
  platformAccess?: PlatformAccess; // Added for restaurant-based access control
  slug?: string; // Short URL identifier e.g. 'burger-palace'
  kitchenDivisions?: KitchenDepartment[];
  kitchenEnabled?: boolean; // Whether the Kitchen Display System is enabled
}

export interface SelectedAddOn {
  name: string;
  price: number;
  quantity: number;
}

export interface CartItem extends MenuItem {
  quantity: number;
  restaurantId: string;
  selectedSize?: string;
  selectedTemp?: string;
  selectedOtherVariant?: string;
  selectedModifiers?: Record<string, string>;
  selectedAddOns?: SelectedAddOn[];
  selectedVariantOption?: string;
  tableNumber?: string;
  remark?: string;
}

export interface Order {
  id: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  timestamp: number;
  customerId: string;
  restaurantId: string;
  tableNumber?: string;
  locationName?: string;
  remark?: string;
  rejectionReason?: string;
  rejectionNote?: string;
  paymentMethod?: string;
  cashierName?: string;
  amountReceived?: number;
  changeAmount?: number;
  orderSource?: OrderSource;
}

export interface User {
  id: string;
  username: string;
  role: Role;
  restaurantId?: string;
  password?: string;
  isActive?: boolean;
  email?: string;
  phone?: string;
  kitchenCategories?: string[];
}

export interface SalesData {
  name: string;
  sales: number;
}

export interface ReportResponse {
  orders: Order[];
  summary: {
    totalRevenue: number;
    orderVolume: number;
    efficiency: number;
  };
  totalCount: number;
}

export interface ReportFilters {
  restaurantId?: string;
  locationName?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  search?: string;
  timezoneOffsetMinutes?: string;
}

export interface CategoryData {
  name: string;
}

export interface ModifierData {
  name: string;
  options: ModifierOption[];
  required?: boolean;
}

export interface ModifierOption {
  name: string;
  price: number;
}

export interface AddOnItemData {
  name: string;
  price: number;
  maxQuantity: number;
  required?: boolean;
}

// Subscription & Pricing
export type PlanId = 'basic' | 'pro' | 'pro_plus';
export type SubscriptionStatus = 'pending_payment' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';

export interface PricingPlan {
  id: PlanId;
  name: string;
  price: number; // RM per month
  annualPrice: number; // RM per month when billed annually
  trialPrice: number; // RM per month during trial period
  description: string;
  features: string[];
  highlight?: boolean;
}

export interface Subscription {
  id: string;
  restaurant_id: string;
  plan_id: PlanId;
  pending_plan_id?: PlanId | null;
  status: SubscriptionStatus;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  billing_interval?: 'monthly' | 'annual';
  pending_billing_interval?: 'monthly' | 'annual' | null;
  pending_change_effective_at?: string | null;
  trial_start: string;
  trial_end: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  created_at: string;
  updated_at: string;
}
