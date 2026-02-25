
export type Role = 'CUSTOMER' | 'VENDOR' | 'ADMIN';

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
  addOns?: AddOnItem[]; // New field
}

export interface AddOnItem {
  name: string;
  price: number;
  maxQuantity: number;
  required?: boolean;
}

export interface Area {
  id: string;
  name: string;
  city: string;
  state: string;
  code: string; // Unique prefix for Order IDs (e.g., NY, SF, LD)
  isActive?: boolean;
  type?: 'MULTI' | 'SINGLE';
}

export interface Restaurant {
  id: string;
  name: string;
  logo: string;
  menu: MenuItem[];
  vendorId: string;
  location: string; // This refers to the Area name
  isOnline?: boolean;
  created_at?: string;
  settings?: {
    showSalesReport?: boolean;
    showQrGenerator?: boolean;
  };
}

export interface CartItem extends MenuItem {
  quantity: number;
  restaurantId: string;
  selectedSize?: string;
  selectedTemp?: 'Hot' | 'Cold';
  selectedOtherVariant?: string;
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
