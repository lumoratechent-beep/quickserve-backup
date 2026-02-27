// src/types.ts

export type Role = 'CUSTOMER' | 'VENDOR' | 'ADMIN';

// Add this new type for platform access
export type PlatformAccess = 'pos_and_kitchen' | 'pos_only';

export enum OrderStatus {
  PENDING = 'PENDING',
  ONGOING = 'ONGOING',
  SERVED = 'SERVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

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
  sizes?: MenuItemVariant[];
  otherVariantName?: string;
  otherVariants?: MenuItemVariant[];
  otherVariantsEnabled?: boolean;
  tempOptions?: {
    hot?: number;
    cold?: number;
    enabled: boolean;
  };
  addOns?: AddOnItem[];
}

export interface Area {
  id: string;
  name: string;
  city: string;
  state: string;
  code: string;
  isActive?: boolean;
  type?: 'MULTI' | 'SINGLE';
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
  };
  categories?: CategoryData[];
  modifiers?: ModifierData[];
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
  selectedTemp?: 'Hot' | 'Cold';
  selectedOtherVariant?: string;
  selectedAddOns?: SelectedAddOn[];
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
  platformAccess?: PlatformAccess; // ← NEW FIELD
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
}

export interface CategoryData {
  name: string;
  skipKitchen: boolean;
}

export interface ModifierData {
  name: string;
  options: ModifierOption[];
}

export interface ModifierOption {
  name: string;
  price: number;
}
