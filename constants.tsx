
import { Restaurant, User, OrderStatus } from './types';

export const MOCK_RESTAURANTS: Restaurant[] = [
  {
    id: 'res_1',
    name: 'Burger Palace',
    logo: 'https://picsum.photos/seed/burger/200/200',
    vendorId: 'vendor_1',
    location: 'Floor 1 - Zone A',
    menu: [
      { id: 'm1', name: 'Classic Cheeseburger', description: 'Juicy beef patty with cheddar', price: 12.99, category: 'Main', image: 'https://picsum.photos/seed/burger1/400/300' },
      { id: 'm2', name: 'Truffle Fries', description: 'Hand-cut fries with truffle oil', price: 6.99, category: 'Sides', image: 'https://picsum.photos/seed/fries/400/300' },
      { id: 'm3', name: 'Vanilla Shake', description: 'Creamy Madagascar vanilla', price: 5.49, category: 'Drinks', image: 'https://picsum.photos/seed/shake/400/300' },
      { id: 'm10', name: 'Double Bacon Burger', description: 'Double meat, double bacon', price: 15.99, category: 'Main', image: 'https://picsum.photos/seed/burger2/400/300' },
    ]
  },
  {
    id: 'res_2',
    name: 'Sushi Zen',
    logo: 'https://picsum.photos/seed/sushi/200/200',
    vendorId: 'vendor_2',
    location: 'Floor 2 - Zone B',
    menu: [
      { id: 'm4', name: 'Salmon Nigiri', description: 'Fresh Atlantic salmon over rice', price: 8.99, category: 'Sushi', image: 'https://picsum.photos/seed/sushi1/400/300' },
      { id: 'm5', name: 'California Roll', description: 'Crab, avocado, and cucumber', price: 10.99, category: 'Rolls', image: 'https://picsum.photos/seed/sushi2/400/300' },
      { id: 'm6', name: 'Miso Soup', description: 'Traditional soybean paste soup', price: 3.99, category: 'Appetizer', image: 'https://picsum.photos/seed/miso/400/300' },
    ]
  },
  {
    id: 'res_3',
    name: 'Pizza Roma',
    logo: 'https://picsum.photos/seed/pizza/200/200',
    vendorId: 'vendor_3',
    location: 'Floor 1 - Zone A',
    menu: [
      { id: 'm7', name: 'Margherita Pizza', description: 'San Marzano tomatoes, mozzarella', price: 14.99, category: 'Pizza', image: 'https://picsum.photos/seed/pizza1/400/300' },
      { id: 'm8', name: 'Pepperoni Feast', description: 'Spicy pepperoni and mozzarella', price: 16.99, category: 'Pizza', image: 'https://picsum.photos/seed/pizza2/400/300' },
      { id: 'm9', name: 'Garlic Knots', description: 'Buttery knots with marinara', price: 5.99, category: 'Sides', image: 'https://picsum.photos/seed/knots/400/300' },
    ]
  }
];

export const INITIAL_USERS: User[] = [
  { id: 'admin_1', username: 'admin', role: 'ADMIN', password: '123456', isActive: true },
  { id: 'vendor_1', username: 'burger_king', role: 'VENDOR', restaurantId: 'res_1', password: 'password123', isActive: true },
  { id: 'vendor_2', username: 'zen_master', role: 'VENDOR', restaurantId: 'res_2', password: 'password123', isActive: true },
  { id: 'vendor_3', username: 'pizza_chef', role: 'VENDOR', restaurantId: 'res_3', password: 'password123', isActive: true },
];
