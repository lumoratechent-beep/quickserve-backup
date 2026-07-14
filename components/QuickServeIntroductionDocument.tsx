import React, { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  Download,
  Globe2,
  PackageOpen,
  QrCode,
  ShieldCheck,
  ShoppingCart,
  Users,
  Workflow,
} from 'lucide-react';
import { PRICING_PLANS, TRIAL_DAYS } from '../lib/pricingPlans';

type Story = {
  number: string;
  eyebrow: string;
  title: string;
  promise: string;
  situationTitle: string;
  situation: string;
  steps: Array<{ title: string; body: string }>;
  outcome: string;
  capabilities: string[];
  visual: 'cashier' | 'kitchen' | 'customer' | 'online' | 'inventory' | 'people' | 'finance' | 'devices';
};

export type CatalogueAssets = {
  cashier?: string;
  customer?: string;
  orderTaker?: string;
  logo?: string;
};

const stories: Story[] = [
  {
    number: '01',
    eyebrow: 'POS & BILLING',
    title: 'When the queue grows, service should keep moving.',
    promise: 'QuickServe turns a busy counter into a clear, repeatable sales flow—from the first item to the final receipt.',
    situationTitle: 'The peak-hour situation',
    situation: 'Lunch begins, the queue reaches the door and every order is different. One customer wants takeaway, another is dining in, and the next has modifiers, a promotion and a different payment method. Staff need speed, but the business still needs every bill to be accurate.',
    steps: [
      { title: 'Build the order quickly', body: 'The cashier selects products from a visual menu, then adds sizes, variants, temperatures, modifiers, add-ons and notes without leaving the sale screen.' },
      { title: 'Choose how it will be served', body: 'The order is marked dine-in, takeaway or delivery. For dine-in, staff can assign a table, save the bill and return to it when the guest is ready.' },
      { title: 'Apply the right commercial rules', body: 'QuickServe calculates configured promotions, discounts, taxes and service charges consistently, reducing manual calculation at the counter.' },
      { title: 'Collect and complete', body: 'The cashier selects cash, card, DuitNow or another enabled method. QuickServe calculates change, confirms payment and produces the receipt and kitchen order list.' },
    ],
    outcome: 'Customers move through the queue faster, staff follow one consistent process, and management receives a clean transaction record for reporting, stock and finance.',
    capabilities: ['Barcode & SKU', 'Saved bills', 'Table layouts', 'Cash change', 'Custom payments', 'Receipts', 'Refund approval', 'Shift closing'],
    visual: 'cashier',
  },
  {
    number: '02',
    eyebrow: 'KITCHEN ROUTING, KDS & AUTO KITCHEN',
    title: 'Every item reaches the right station—without shouting across the kitchen.',
    promise: 'QuickServe organises preparation around the way your kitchen actually works.',
    situationTitle: 'The mixed-order situation',
    situation: 'A single table orders grilled food, two drinks and dessert. In a manual workflow, one ticket is passed between stations or the cashier must explain the order verbally. During a rush, items can be missed, duplicated or prepared in the wrong sequence.',
    steps: [
      { title: 'Map the kitchen', body: 'Create departments such as Hot Kitchen, Drinks, Dessert and Packing, then assign the relevant menu categories to each department.' },
      { title: 'Route each item automatically', body: 'When an order arrives from POS, QR, tableside or online shop, QuickServe separates the items and sends each one to its responsible station.' },
      { title: 'Make progress visible', body: 'Kitchen staff see only the orders relevant to their station on the Kitchen Display System and update them from pending to preparing, ready or served.' },
      { title: 'Automate the repetitive work', body: 'Auto Kitchen can accept eligible incoming orders and print kitchen tickets automatically, while KDS and paper tickets can operate together when required.' },
    ],
    outcome: 'Each station has an accountable queue, front-of-house can see progress, and the kitchen spends less time sorting tickets or asking what should be prepared next.',
    capabilities: ['Department routing', 'Category access', 'Live order status', 'Reject with reason', 'Auto accept', 'Auto print', 'Multi-printer workflow'],
    visual: 'kitchen',
  },
  {
    number: '03',
    eyebrow: 'QR & TABLESIDE ORDERING',
    title: 'Give guests convenience without losing operational control.',
    promise: 'Let customers self-order or let staff take the full POS experience to the table.',
    situationTitle: 'The full dining-room situation',
    situation: 'All servers are occupied, a new table is ready to order and another table wants to add drinks. Guests wait for attention while staff walk between tables and the counter, then re-enter handwritten orders into the POS.',
    steps: [
      { title: 'Choose the service style', body: 'Place a generated QR code on each table for self-ordering, or give an order taker a mobile-friendly QuickServe screen on a phone or tablet.' },
      { title: 'Capture a complete order', body: 'Guests or staff browse the same menu and pricing, choose item options, enter quantities and remarks, and submit against the correct table.' },
      { title: 'Review or approve automatically', body: 'Incoming orders can wait for staff approval or follow configured auto-approval rules. Auto-print can produce the operational ticket immediately.' },
      { title: 'Send it into normal operations', body: 'Approved items enter the same kitchen routes and order-status flow as counter orders, so the team does not operate a separate system.' },
    ],
    outcome: 'Guests order sooner, servers spend more time on hospitality, and the business can increase ordering capacity without adding another cashier station.',
    capabilities: ['Table QR generator', 'Mobile ordering', 'Shared menu', 'Order remarks', 'Auto approval', 'Auto print', 'Kitchen integration'],
    visual: 'customer',
  },
  {
    number: '04',
    eyebrow: 'ONLINE SHOP',
    title: 'Turn your menu into a direct ordering channel.',
    promise: 'QuickServe helps the business accept orders beyond the counter through a branded, shareable storefront.',
    situationTitle: 'The off-premise situation',
    situation: 'Customers discover the business through social media or a recommendation, but ordering still happens through messages. Staff must confirm products, delivery, payment and totals manually—often while serving walk-in customers.',
    steps: [
      { title: 'Publish the right catalogue', body: 'Choose which products appear online and present them with images, descriptions, prices and available options from the QuickServe catalogue.' },
      { title: 'Let customers build the basket', body: 'Customers order through a shareable link, select product choices and review the total without waiting for a staff member to reply.' },
      { title: 'Offer practical fulfilment', body: 'Configure pickup, Lalamove, postage or custom delivery methods with the appropriate fees and availability.' },
      { title: 'Bring the order into one operation', body: 'Use cash on delivery or configured online payment choices, then manage the order alongside the outlet’s other incoming orders.' },
    ],
    outcome: 'The business gains a direct sales channel, customers receive a clearer buying experience, and staff avoid copying orders from chat into operational systems.',
    capabilities: ['Shareable storefront', 'Online availability', 'Product options', 'Pickup', 'Lalamove', 'Postage', 'Custom delivery', 'COD'],
    visual: 'online',
  },
  {
    number: '05',
    eyebrow: 'STOCK, RECIPES & PRODUCTION',
    title: 'Understand what was bought, produced and consumed.',
    promise: 'QuickServe connects everyday sales with the stock activity behind them.',
    situationTitle: 'The stock-control situation',
    situation: 'Sales look healthy, yet ingredients run out unexpectedly and food cost is difficult to explain. Purchases live in one spreadsheet, production in a notebook and sales in the POS, leaving the owner without a dependable stock picture.',
    steps: [
      { title: 'Structure what the business holds', body: 'Track finished items, ingredients, packaging and supplies with their own units, balances, thresholds, SKU, barcode and cost information.' },
      { title: 'Record stock coming in and moving', body: 'Create purchase orders, receive from suppliers, transfer stock, make controlled adjustments and perform physical inventory counts.' },
      { title: 'Describe how products are made', body: 'Create recipes with ingredient quantities and record production batches when raw materials become finished stock.' },
      { title: 'Let sales create stock movement', body: 'At completed checkout, QuickServe can deduct the available finished stock or consume the recipe ingredients required for the quantity sold.' },
    ],
    outcome: 'Operators gain a traceable view of purchasing, production and usage, helping them respond earlier to shortages and understand the cost behind each sale.',
    capabilities: ['Purchase orders', 'Transfers', 'Adjustments', 'Counts', 'Production', 'Recipe deduction', 'Movement history', 'Valuation'],
    visual: 'inventory',
  },
  {
    number: '06',
    eyebrow: 'STAFF, PAYROLL, CLAIMS & LEAVE',
    title: 'Manage the people behind the operation with less paperwork.',
    promise: 'QuickServe connects workforce administration with access, expenses and payroll records.',
    situationTitle: 'The month-end situation',
    situation: 'The manager is checking staff details, leave, overtime, claims and salary deductions across messages and spreadsheets. At the same time, every employee needs the correct system access and a clear payslip.',
    steps: [
      { title: 'Create the team structure', body: 'Maintain staff profiles, employment details and departments, then assign operational roles such as cashier, kitchen, order taker, manager or HR.' },
      { title: 'Control access to work', body: 'Each role receives the relevant workspace, while kitchen staff can be limited to their assigned categories or departments.' },
      { title: 'Manage claims and leave', body: 'Record multi-line claims with receipt references and payment methods, and manage annual, medical, hospitalisation, paternity and other leave with status and balance tracking.' },
      { title: 'Prepare payroll and payslips', body: 'Calculate basic pay, overtime, allowances, bonuses and commissions, then record EPF, SOCSO, EIS, PCB/tax, unpaid leave and other deductions before issuing a PDF payslip.' },
    ],
    outcome: 'Management keeps a clearer employee record, staff receive consistent documents, and payroll and claim totals can flow into business expenses instead of being entered again.',
    capabilities: ['Role access', 'Departments', 'Leave entitlement', 'Service-year rules', 'Claims', 'Statutory deductions', 'Employer contributions', 'PDF payslips'],
    visual: 'people',
  },
  {
    number: '07',
    eyebrow: 'REPORTING, EXPENSES & FINANCE',
    title: 'See what happened, why it happened and what needs attention next.',
    promise: 'QuickServe combines an advanced analytical dashboard, detailed item intelligence and financial reporting in one decision workspace.',
    situationTitle: 'The owner’s visibility situation',
    situation: 'The outlet is busy, but revenue alone does not answer the important questions: What sold? Which payment methods were used? What did the operation spend? Is gross profit improving? Which shifts, products or categories need attention?',
    steps: [
      { title: 'Start with advanced analytics', body: 'Use today, week, month or a custom date range to review total sales, orders, average order value, cancellations, daily sales, payment mix, hourly demand and top-selling items.' },
      { title: 'Investigate every item', body: 'Review unique items, total units, item revenue, average selling price and top performers, then continue into category, employee, payment, modifier, discount and tax reports.' },
      { title: 'Bring costs into view', body: 'Record expenses as cost of goods sold or operating expenses, including linked platform fees, payroll and staff claims.' },
      { title: 'Generate and share the report', body: 'QuickServe automatically builds professional PDF, Excel-compatible and CSV exports for deeper analysis, record keeping or management review.' },
    ],
    outcome: 'Owners can move from “we were busy” to evidence-based decisions about menu performance, staffing, costs and growth.',
    capabilities: ['Advanced dashboard', 'Item intelligence', 'Top sellers', 'Payment mix', 'Hourly demand', 'PDF report', 'Excel export', 'CSV export'],
    visual: 'finance',
  },
  {
    number: '08',
    eyebrow: 'GROWTH & ADMINISTRATION',
    title: 'Start with one outlet. Build for what comes next.',
    promise: 'QuickServe provides the operational foundation and administration tools to support a growing business network.',
    situationTitle: 'The growth situation',
    situation: 'A business expands from one counter to multiple teams, outlets or vendor locations. Different operating practices, subscriptions and records make it harder to maintain consistency and visibility at platform level.',
    steps: [
      { title: 'Standardise outlet operations', body: 'Use consistent ordering, kitchen, inventory, people and reporting workflows while retaining outlet-specific menus, settings and feature access.' },
      { title: 'Manage the commercial relationship', body: 'Admin teams can manage vendors, restaurants, hubs, subscriptions, renewals, plans, cashout and DuitNow records.' },
      { title: 'Create professional documents', body: 'Prepare branded quotations and invoices, maintain setup guides and share commercial product material from the document library.' },
      { title: 'Stay connected to operators', body: 'Publish announcements, manage platform records and support responsive access across desktop, tablet and mobile devices.' },
    ],
    outcome: 'The organisation gains a repeatable operating model with the controls needed to support new teams and locations without rebuilding the system each time.',
    capabilities: ['Vendors & hubs', 'Subscriptions', 'Cashout', 'DuitNow admin', 'Quotations', 'Invoices', 'Announcements', 'System controls'],
    visual: 'devices',
  },
];

const platformCards = [
  { Icon: ShoppingCart, label: 'Sell', copy: 'POS, billing and payments' },
  { Icon: Workflow, label: 'Route', copy: 'Kitchen departments and automation' },
  { Icon: QrCode, label: 'Reach', copy: 'QR, tableside and online ordering' },
  { Icon: PackageOpen, label: 'Control', copy: 'Stock, recipes and production' },
  { Icon: Users, label: 'Manage', copy: 'Staff, payroll, claims and leave' },
  { Icon: BarChart3, label: 'Understand', copy: 'Reports, expenses and profit' },
];

const advantages = [
  { title: 'More than checkout', quickserve: 'POS, kitchen, ordering, stock, people and finance work as one operating flow.', alternative: 'A cashier-only system records sales but leaves the rest of the business in separate tools.' },
  { title: 'Back office included', quickserve: 'The Basic plan already includes back-office management and performance reports.', alternative: 'Many systems reserve deeper management tools for higher plans or separate add-ons.' },
  { title: 'Built for existing devices', quickserve: 'Browser-first access supports desktop, tablet and mobile workflows without forcing one hardware format.', alternative: 'Hardware-led packages can create a larger upfront decision before the workflow is proven.' },
  { title: 'Deeper people operations', quickserve: 'Manage staff, departments, payroll, statutory deductions, claims, leave and PDF payslips.', alternative: 'Typical POS staff tools often stop at user access, attendance or sales performance.' },
  { title: 'Operational accounting', quickserve: 'Connect sales with COGS, OPEX, payroll, claims, gross profit, net profit and P&L.', alternative: 'Disconnected stacks require exports and repeated entry before the owner sees the full picture.' },
  { title: 'Grow by workflow', quickserve: 'Start with counter POS, add QR and tableside, then introduce full kitchen routing when needed.', alternative: 'A one-size package may charge for complexity before the operation is ready to use it.' },
];

const backOfficeCatalogue = [
  {
    title: 'Dashboard & control centre',
    summary: 'See the health of the outlet before opening another report.',
    items: ['Sales, order count, average order and cancellations', 'Today, week, month and custom date views', 'Sales trend, order status and top-product visibility', 'Responsive owner access from desktop or tablet'],
  },
  {
    title: 'Items, menu & stock setup',
    summary: 'Maintain one sellable catalogue with the operational detail behind it.',
    items: ['Categories, images, descriptions, prices and costs', 'SKU, barcode, sold-by unit and stock-tracking rules', 'Sizes, temperatures, variants, modifiers and add-ons', 'Mix-and-match choices, promotions and discounts', 'Archive, restore and control online availability', 'Auto-cost from production where configured'],
  },
  {
    title: 'Inventory & production',
    summary: 'Trace stock from purchasing to production and final sale.',
    items: ['Purchase orders and supplier purchasing history', 'Transfer orders between stock points or locations', 'Stock adjustments with reason and movement history', 'Physical inventory counts and variance control', 'Ingredient and non-menu supply management', 'Recipes, unit conversion and checkout consumption', 'Production batches and finished-goods stock', 'Inventory history, low-stock thresholds and valuation'],
  },
  {
    title: 'Staff management',
    summary: 'Connect employee records with the access and responsibilities of the role.',
    items: ['Cashier, kitchen, order-taker, manager and HR accounts', 'Employee code, job title, status and hire information', 'Departments and kitchen-category assignment', 'Contact, address and emergency information', 'Bank, EPF and SOCSO details', 'Salary, overtime and leave-entitlement templates'],
  },
  {
    title: 'Payroll, claims & leave',
    summary: 'Turn month-end people administration into a documented workflow.',
    items: ['Basic pay, overtime, allowances, bonus and commission', 'EPF, SOCSO, EIS, PCB/tax and unpaid-leave deductions', 'Employer contributions and other adjustments', 'Create, copy, edit, print and download PDF payslips', 'Multi-line claims with receipt references and payment method', 'Claims and payroll synced into staff expenses', 'Annual, MC, hospitalisation, paternity and other leave', 'Leave status, balance and annual levels by service year'],
  },
  {
    title: 'Sales reports',
    summary: 'Move from total sales to the reason behind performance.',
    items: ['Advanced KPI dashboard with custom period selection', 'Daily sales, payment mix, hourly demand and top items', 'Item quantity, revenue, average price and top-10 chart', 'Sales by item and by category', 'Sales by employee and payment method', 'Sales by modifier', 'Discount and tax reporting', 'Hourly, daily, weekly and monthly analysis', 'Automatically generated PDF, Excel-compatible and CSV exports'],
  },
  {
    title: 'Expenses & finance',
    summary: 'Read revenue and cost together instead of managing two separate stories.',
    items: ['Categorised COGS and OPEX expense ledger', 'Platform subscriptions, payroll and claim entries', 'Revenue, total expenses, gross profit and net profit', 'Profit & Loss statement', 'Expense breakdown and monthly comparison'],
  },
  {
    title: 'Contacts, shifts & records',
    summary: 'Keep the supporting records that daily operations depend on.',
    items: ['Supplier directory connected to purchasing', 'Customer contact records', 'Cashier shift opening and closing', 'Require an active shift before payment can be completed', 'Opening float and payment-method totals', 'Expected cash, counted cash and variance reconciliation', 'Shift transaction history with cashier accountability', 'PDF and CSV shift reports', 'Order, payment, refund and stock movement histories'],
  },
];

const browserAsset = async (path: string) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const loadBrowserAssets = async (): Promise<CatalogueAssets> => {
  const [cashier, customer, orderTaker, logo] = await Promise.all([
    browserAsset('/marketing-img/cashier-view.png'),
    browserAsset('/marketing-img/customer-mobile-view.png'),
    browserAsset('/marketing-img/order-taker-view.png'),
    browserAsset('/LOGO/9.png'),
  ]);
  return { cashier, customer, orderTaker, logo };
};

const CatalogueVisual: React.FC<{ kind: Story['visual']; className?: string }> = ({ kind, className = '' }) => {
  if (kind === 'cashier') return <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-50 to-slate-200 ${className}`}><div className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-orange-600 shadow">Counter POS</div><img src="/marketing-img/cashier-view.png" alt="QuickServe cashier POS on desktop" className="h-full w-full object-contain p-3 drop-shadow-2xl" /></div>;
  if (kind === 'customer') return <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-orange-900 ${className}`}><div className="absolute left-5 top-5 z-10 rounded-full bg-orange-500 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow">Guest or Staff · One Menu</div><img src="/marketing-img/order-taker-view.png" alt="QuickServe tableside ordering" className="absolute -bottom-[8%] -left-[8%] h-[85%] w-[76%] object-contain drop-shadow-2xl" /><img src="/marketing-img/customer-mobile-view.png" alt="QuickServe mobile customer ordering" className="absolute bottom-[2%] right-[-1%] h-[78%] w-[49%] object-contain drop-shadow-2xl" /></div>;
  if (kind === 'online') return <div className={`overflow-hidden rounded-3xl bg-orange-50 p-5 ${className}`}><div className="flex h-full gap-4"><div className="flex-1 rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-widest text-orange-500">Your Online Shop</p><p className="mt-1 text-lg font-black text-slate-900">Order direct</p></div><Globe2 className="text-orange-500" /></div><div className="mt-4 grid grid-cols-3 gap-2">{['Signature Bowl','Iced Latte','Family Set'].map((name,index) => <div key={name} className="rounded-xl bg-slate-50 p-2"><div className={`h-16 rounded-lg ${index === 1 ? 'bg-amber-100' : index === 2 ? 'bg-orange-100' : 'bg-rose-100'}`} /><p className="mt-2 text-[9px] font-black text-slate-700">{name}</p><p className="text-[9px] font-black text-orange-500">RM {index === 0 ? '18.90' : index === 1 ? '7.50' : '39.90'}</p></div>)}</div></div><div className="w-[30%] rounded-2xl bg-slate-950 p-4 text-white"><p className="text-[9px] font-black text-orange-400">FULFILMENT</p>{['Pickup','Lalamove','Postage','Custom'].map((item,index) => <div key={item} className={`mt-3 rounded-lg p-2 text-[9px] font-bold ${index === 0 ? 'bg-orange-500' : 'bg-white/10'}`}>{item}</div>)}<p className="mt-5 text-[9px] text-slate-400">COD or configured online payment</p></div></div></div>;
  if (kind === 'devices') return <div className={`overflow-hidden rounded-3xl bg-slate-950 p-5 text-white ${className}`}><div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-widest text-orange-400">Platform Administration</p><p className="mt-1 text-lg font-black">Control growth from one place</p></div><ShieldCheck className="text-orange-400" /></div><div className="mt-5 grid grid-cols-4 gap-3">{[['18','Vendors'],['4','Hubs'],['RM 12.8k','Income'],['96%','Active']].map(([value,label]) => <div key={label} className="rounded-xl bg-white/10 p-3"><p className="font-black">{value}</p><p className="mt-1 text-[9px] text-slate-400">{label}</p></div>)}</div><div className="mt-5 grid grid-cols-3 gap-3">{['Subscriptions & renewals','Quotations & invoices','Cashout & DuitNow'].map((item,index) => <div key={item} className="rounded-xl bg-white p-4 text-slate-900"><span className="text-[9px] font-black text-orange-500">0{index + 1}</span><p className="mt-3 text-xs font-black">{item}</p></div>)}</div></div>;

  if (kind === 'kitchen') return <div className={`overflow-hidden rounded-3xl bg-slate-950 p-5 text-white ${className}`}><div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-400">Kitchen Display</p><p className="mt-1 text-lg font-black">Live preparation board</p></div><span className="rounded-full bg-emerald-500/20 px-3 py-1 text-[9px] font-black text-emerald-300">4 ACTIVE</span></div><div className="mt-5 grid grid-cols-3 gap-3">{[['#A104','HOT KITCHEN','Preparing'],['#A105','DRINKS','New'],['#A106','DESSERT','Ready']].map(([order,station,status], index) => <div key={order} className="rounded-2xl bg-white p-4 text-slate-900 shadow-xl"><div className="flex justify-between gap-2"><span className="text-xs font-black">{order}</span><span className={`h-2 w-2 rounded-full ${index === 2 ? 'bg-emerald-500' : index === 1 ? 'bg-orange-500' : 'bg-blue-500'}`} /></div><p className="mt-5 text-[9px] font-black text-slate-400">{station}</p><p className="mt-1 text-xs font-black">{status}</p><div className="mt-3 h-1.5 rounded-full bg-slate-100"><div className={`h-full rounded-full bg-orange-500 ${index === 0 ? 'w-2/3' : index === 1 ? 'w-1/4' : 'w-full'}`} /></div></div>)}</div></div>;
  if (kind === 'inventory') return <div className={`overflow-hidden rounded-3xl bg-slate-100 p-5 ${className}`}><div className="rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-widest text-orange-500">Inventory Control</p><p className="mt-1 text-lg font-black text-slate-900">Know what is moving</p></div><PackageOpen className="text-orange-500" /></div><div className="mt-5 grid grid-cols-3 gap-2">{[['RM 18,420','Stock Value'],['12','Low Stock'],['38','Movements']].map(([value,label]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="font-black text-slate-900">{value}</p><p className="mt-1 text-[9px] font-bold text-slate-400">{label}</p></div>)}</div><div className="mt-4 space-y-2">{[['Chicken Fillet','72%'],['Cooking Oil','34%'],['Packaging','88%']].map(([name,width]) => <div key={name} className="flex items-center gap-3"><span className="w-24 text-[10px] font-bold text-slate-600">{name}</span><div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-500" style={{ width }} /></div><span className="text-[9px] font-black text-slate-400">{width}</span></div>)}</div></div></div>;
  if (kind === 'people') return <div className={`overflow-hidden rounded-3xl bg-orange-50 p-5 ${className}`}><div className="grid h-full grid-cols-[0.8fr_1.2fr] gap-4"><div className="rounded-2xl bg-slate-950 p-5 text-white"><Users className="text-orange-400" /><p className="mt-4 text-3xl font-black">24</p><p className="text-[10px] font-bold text-slate-400">Team members</p><div className="mt-7 space-y-2">{['Cashier','Kitchen','Order Taker','Manager'].map((role,index) => <div key={role} className="flex items-center gap-2 text-[10px] font-bold"><span className={`h-2 w-2 rounded-full ${index === 0 ? 'bg-orange-400' : 'bg-slate-600'}`} />{role}</div>)}</div></div><div className="rounded-2xl bg-white p-5 shadow-xl"><p className="text-[9px] font-black uppercase tracking-widest text-orange-500">Payroll Summary</p><div className="mt-4 flex items-end justify-between"><div><p className="text-[10px] text-slate-400">Net payroll</p><p className="text-2xl font-black text-slate-900">RM 48,260</p></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-600">READY</span></div><div className="my-5 h-px bg-slate-100" />{[['Basic & earnings','RM 55,800'],['EPF · SOCSO · EIS','RM 6,940'],['Claims','RM 600']].map(([label,value]) => <div key={label} className="flex justify-between py-2 text-[10px]"><span className="font-bold text-slate-500">{label}</span><span className="font-black text-slate-900">{value}</span></div>)}</div></div></div>;
  return <div className={`overflow-hidden rounded-3xl bg-slate-950 p-4 text-white ${className}`}><div className="flex items-start justify-between"><div><p className="text-[9px] font-black uppercase tracking-widest text-orange-400">Advanced Analytical Dashboard</p><p className="mt-1 text-lg font-black">Sales overview</p></div><div className="flex gap-2"><span className="rounded-lg bg-white px-3 py-1.5 text-[8px] font-black text-slate-900">EXPORT CSV</span><span className="rounded-lg bg-red-600 px-3 py-1.5 text-[8px] font-black">PDF</span></div></div><div className="mt-3 grid grid-cols-4 gap-2">{[['RM 4,463','Total Sales'],['115','Orders'],['RM 38.81','Avg. Order'],['2','Cancelled']].map(([value,label]) => <div key={label} className="rounded-xl bg-white/10 p-2.5"><p className="font-black">{value}</p><p className="mt-1 text-[8px] text-slate-400">{label}</p></div>)}</div><div className="mt-3 grid grid-cols-[1.4fr_0.8fr] gap-3"><div className="rounded-xl bg-white/5 p-3"><p className="text-[9px] font-black text-orange-400">Daily Sales</p><div className="mt-3 flex h-20 items-end gap-1.5">{[12,58,28,17,8,24,11,36,29,7,15,19,8].map((height,index) => <div key={index} className="flex-1 rounded-t bg-gradient-to-t from-orange-600 to-orange-300" style={{ height }} />)}</div></div><div className="rounded-xl bg-white/5 p-3"><p className="text-[9px] font-black text-orange-400">Payment Mix</p><div className="mx-auto mt-3 h-20 w-20 rounded-full" style={{ background: 'conic-gradient(#f97316 0 82%, #fbbf24 82% 100%)' }}><div className="relative left-4 top-4 h-12 w-12 rounded-full bg-slate-950" /></div></div></div></div>;
};

export const buildQuickServeIntroductionPdf = async (assets: CatalogueAssets = {}) => {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const orange: [number, number, number] = [249, 115, 22];
  const navy: [number, number, number] = [15, 23, 42];
  const slate: [number, number, number] = [71, 85, 105];
  const pale: [number, number, number] = [255, 247, 237];

  const text = (value: string, x: number, y: number, maxWidth: number, size: number, color = slate, style: 'normal' | 'bold' = 'normal', lineHeight = 1.28) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(value, maxWidth) as string[];
    pdf.text(lines, x, y, { lineHeightFactor: lineHeight });
    return y + lines.length * size * 0.3528 * lineHeight;
  };

  const footer = (page: number) => {
    pdf.setDrawColor(226, 232, 240);
    pdf.line(16, 282, 194, 282);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...navy);
    pdf.text('QUICKSERVE', 16, 288);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text('A product by Lumora Tech Ent.  |  JR0174591U', 42, 288);
    pdf.text(String(page).padStart(2, '0'), 194, 288, { align: 'right' });
  };

  const heading = (eyebrow: string, title: string, intro: string) => {
    pdf.setFillColor(...pale);
    pdf.rect(0, 0, 210, 57, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...orange);
    pdf.text(eyebrow, 16, 18);
    text(title, 16, 31, 178, 21, navy, 'bold', 1.03);
    return text(intro, 16, 68, 178, 9.5, slate, 'normal', 1.38);
  };

  const addContainedImage = (data: string | undefined, x: number, y: number, w: number, h: number, ratio = 16 / 9) => {
    if (!data) return;
    let imageW = w;
    let imageH = imageW / ratio;
    if (imageH > h) {
      imageH = h;
      imageW = imageH * ratio;
    }
    pdf.addImage(data, 'PNG', x + (w - imageW) / 2, y + (h - imageH) / 2, imageW, imageH, undefined, 'FAST');
  };

  const drawUiVisual = (kind: Story['visual'], x: number, y: number, w: number, h: number) => {
    if (kind === 'cashier') {
      pdf.setFillColor(...pale);
      pdf.roundedRect(x, y, w, h, 4, 4, 'F');
      addContainedImage(assets.cashier, x + 3, y + 3, w - 6, h - 6, 16 / 9);
      return;
    }
    if (kind === 'customer') {
      pdf.setFillColor(...navy);
      pdf.roundedRect(x, y, w, h, 4, 4, 'F');
      addContainedImage(assets.orderTaker, x + 2, y + 5, w * 0.63, h - 8, 16 / 9);
      addContainedImage(assets.customer, x + w * 0.54, y - 5, w * 0.42, h - 1, 1.5);
      return;
    }
    if (kind === 'online') {
      pdf.setFillColor(...pale);
      pdf.roundedRect(x, y, w, h, 4, 4, 'F');
      text('YOUR DIRECT ONLINE SHOP', x + 8, y + 11, w - 16, 7, orange, 'bold');
      ['Signature Bowl', 'Iced Latte', 'Family Set'].forEach((name, index) => {
        const cardX = x + 8 + index * ((w * 0.67 - 12) / 3);
        const cardW = (w * 0.67 - 22) / 3;
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(cardX, y + 18, cardW, h - 26, 2, 2, 'F');
        pdf.setFillColor(index === 1 ? 254 : 255, index === 1 ? 243 : 237, index === 1 ? 199 : 213);
        pdf.roundedRect(cardX + 4, y + 22, cardW - 8, 20, 2, 2, 'F');
        text(name, cardX + 4, y + 49, cardW - 8, 6.2, navy, 'bold');
        text(index === 0 ? 'RM 18.90' : index === 1 ? 'RM 7.50' : 'RM 39.90', cardX + 4, y + 56, cardW - 8, 6.2, orange, 'bold');
      });
      pdf.setFillColor(...navy);
      pdf.roundedRect(x + w * 0.7, y + 12, w * 0.26, h - 20, 2, 2, 'F');
      text('FULFILMENT', x + w * 0.74, y + 23, w * 0.18, 6, [253, 186, 116], 'bold');
      ['Pickup', 'Lalamove', 'Postage', 'Custom'].forEach((item, index) => text(item, x + w * 0.74, y + 34 + index * 8, w * 0.18, 6.2, index === 0 ? orange : [203, 213, 225], 'bold'));
      return;
    }

    pdf.setFillColor(kind === 'inventory' || kind === 'people' ? 248 : 15, kind === 'inventory' || kind === 'people' ? 250 : 23, kind === 'inventory' || kind === 'people' ? 252 : 42);
    pdf.roundedRect(x, y, w, h, 4, 4, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...orange);
    pdf.text(kind === 'kitchen' ? 'LIVE KITCHEN DISPLAY' : kind === 'inventory' ? 'INVENTORY CONTROL' : kind === 'people' ? 'PEOPLE & PAYROLL' : kind === 'devices' ? 'PLATFORM ADMINISTRATION' : 'ADVANCED ANALYTICAL DASHBOARD', x + 8, y + 11);

    if (kind === 'kitchen') {
      [['#A104', 'HOT KITCHEN', 'PREPARING'], ['#A105', 'DRINKS', 'NEW'], ['#A106', 'DESSERT', 'READY']].forEach(([order, station, status], index) => {
        const cardX = x + 7 + index * ((w - 18) / 3);
        const cardW = (w - 26) / 3;
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(cardX, y + 18, cardW, h - 25, 2, 2, 'F');
        text(order, cardX + 5, y + 28, cardW - 10, 9, navy, 'bold');
        text(station, cardX + 5, y + 39, cardW - 10, 6.2, slate, 'bold');
        text(status, cardX + 5, y + 49, cardW - 10, 7.2, orange, 'bold');
        pdf.setFillColor(226, 232, 240);
        pdf.roundedRect(cardX + 5, y + h - 12, cardW - 10, 2, 1, 1, 'F');
        pdf.setFillColor(...orange);
        pdf.roundedRect(cardX + 5, y + h - 12, (cardW - 10) * (index === 0 ? 0.65 : index === 1 ? 0.3 : 1), 2, 1, 1, 'F');
      });
      return;
    }

    if (kind === 'inventory') {
      [['RM 18,420', 'STOCK VALUE'], ['12', 'LOW STOCK'], ['38', 'MOVEMENTS']].forEach(([value, label], index) => {
        const cardX = x + 7 + index * ((w - 18) / 3);
        const cardW = (w - 26) / 3;
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(cardX, y + 17, cardW, 19, 2, 2, 'F');
        text(value, cardX + 4, y + 26, cardW - 8, 8, navy, 'bold');
        text(label, cardX + 4, y + 32, cardW - 8, 5.6, slate, 'bold');
      });
      [['Chicken Fillet', 0.72], ['Cooking Oil', 0.34], ['Packaging', 0.88]].forEach(([label, percent], index) => {
        const lineY = y + 46 + index * 9;
        text(String(label), x + 8, lineY, 36, 6.5, slate, 'bold');
        pdf.setFillColor(226, 232, 240);
        pdf.roundedRect(x + 49, lineY - 2, w - 62, 2.5, 1, 1, 'F');
        pdf.setFillColor(...orange);
        pdf.roundedRect(x + 49, lineY - 2, (w - 62) * Number(percent), 2.5, 1, 1, 'F');
      });
      return;
    }

    if (kind === 'people') {
      pdf.setFillColor(...navy);
      pdf.roundedRect(x + 7, y + 17, w * 0.33, h - 24, 2, 2, 'F');
      text('24', x + 13, y + 31, 36, 18, [255, 255, 255], 'bold');
      text('TEAM MEMBERS', x + 13, y + 40, 36, 6, [148, 163, 184], 'bold');
      ['Cashier', 'Kitchen', 'Order Taker', 'Manager'].forEach((role, index) => text(role, x + 13, y + 51 + index * 6, 35, 6.2, [203, 213, 225], 'bold'));
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(x + w * 0.38, y + 17, w * 0.57, h - 24, 2, 2, 'F');
      text('NET PAYROLL', x + w * 0.43, y + 28, w * 0.45, 6, slate, 'bold');
      text('RM 48,260', x + w * 0.43, y + 39, w * 0.45, 13, navy, 'bold');
      [['Basic & earnings', 'RM 55,800'], ['Statutory', 'RM 6,940'], ['Claims', 'RM 600']].forEach(([label, value], index) => {
        text(label, x + w * 0.43, y + 50 + index * 8, w * 0.27, 6, slate);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6); pdf.setTextColor(...navy); pdf.text(value, x + w * 0.9, y + 50 + index * 8, { align: 'right' });
      });
      return;
    }

    const metricData = kind === 'devices' ? [['18', 'VENDORS'], ['4', 'HUBS'], ['96%', 'ACTIVE']] : [['RM 4,463', 'TOTAL SALES'], ['115', 'ORDERS'], ['RM 38.81', 'AVG ORDER'], ['2', 'CANCELLED']];
    metricData.forEach(([value, label], index) => {
      const cardX = x + 7 + index * ((w - 14) / metricData.length);
      const cardW = (w - 22) / metricData.length;
      pdf.setFillColor(30, 41, 59);
      pdf.roundedRect(cardX, y + 17, cardW, 19, 2, 2, 'F');
      text(value, cardX + 4, y + 26, cardW - 8, 8, [255, 255, 255], 'bold');
      text(label, cardX + 4, y + 32, cardW - 8, 5.6, [148, 163, 184], 'bold');
    });
    if (kind === 'devices') {
      ['Subscriptions & renewals', 'Quotations & invoices', 'Cashout & DuitNow'].forEach((label, index) => {
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(x + 8 + index * ((w - 18) / 3), y + 43, (w - 26) / 3, 17, 2, 2, 'F');
        text(label, x + 12 + index * ((w - 18) / 3), y + 51, (w - 34) / 3, 6.2, navy, 'bold');
      });
      return;
    }
    [13, 20, 15, 30, 23, 36, 28, 43, 34, 48, 39, 52].forEach((bar, index) => {
      pdf.setFillColor(249, 115 + Math.min(index * 3, 60), 22);
      pdf.roundedRect(x + 9 + index * ((w - 20) / 12), y + h - 8 - bar * 0.55, (w - 30) / 12, bar * 0.55, 1, 1, 'F');
    });
  };

  // Cover
  pdf.setFillColor(...navy);
  pdf.rect(0, 0, 210, 297, 'F');
  pdf.setFillColor(...orange);
  pdf.circle(181, 30, 48, 'F');
  pdf.setFillColor(30, 41, 59);
  pdf.circle(201, 130, 67, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(255, 255, 255);
  pdf.text('QUICK', 17, 28);
  pdf.setTextColor(...orange);
  pdf.text('SERVE', 38, 28);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(34);
  pdf.text('Run every order.', 17, 83);
  pdf.text('Connect every team.', 17, 97);
  pdf.setTextColor(253, 186, 116);
  pdf.text('Know your business.', 17, 111);
  text('A complete restaurant operating platform for POS, kitchen, ordering, stock, people and finance.', 17, 134, 127, 13, [226, 232, 240], 'normal', 1.45);
  pdf.setFillColor(...orange);
  pdf.roundedRect(17, 186, 79, 12, 6, 6, 'F');
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text('COMMERCIAL PRODUCT PROFILE', 56.5, 193.6, { align: 'center' });
  pdf.setDrawColor(71, 85, 105);
  pdf.line(17, 252, 193, 252);
  text('POS  /  KITCHEN  /  ORDERING  /  STOCK  /  PEOPLE  /  FINANCE', 17, 263, 176, 8, [148, 163, 184], 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text('A product by Lumora Tech Ent.  |  Malaysia', 17, 281);

  // About us
  pdf.addPage();
  let y = heading('ABOUT US', 'Practical technology, built around real business work.', 'QuickServe is developed by Lumora Tech Ent., a Malaysian technology company focused on making digital transformation useful, approachable and commercially meaningful.');
  y += 10;
  pdf.setFillColor(...navy);
  pdf.roundedRect(16, y, 178, 49, 4, 4, 'F');
  text('OUR STORY', 25, y + 13, 150, 8, [253, 186, 116], 'bold');
  text('Lumora Tech began as a trusted device service provider. Working close to customers taught us that good technology is not defined by complexity—it is defined by how reliably it solves everyday problems.', 25, y + 24, 158, 10, [255, 255, 255], 'normal', 1.4);
  y += 62;
  const values = [
    ['Our mission', 'Remove barriers for businesses with affordable, reliable systems that help teams do their best work every day.'],
    ['Our vision', 'Build smarter local businesses through practical digital tools that can grow with them.'],
    ['Our promise', 'Stay responsive, transparent and committed to improvements that create clear customer value.'],
  ];
  values.forEach(([title, body], index) => {
    pdf.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 252 : 255);
    pdf.roundedRect(16, y, 178, 29, 3, 3, 'F');
    pdf.setFillColor(...orange);
    pdf.circle(25, y + 10, 4, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(255, 255, 255);
    pdf.text(String(index + 1), 25, y + 12, { align: 'center' });
    text(title, 34, y + 8, 150, 10, navy, 'bold');
    text(body, 34, y + 16, 150, 7.7, slate, 'normal', 1.22);
    y += 33;
  });
  pdf.setFillColor(...pale);
  pdf.roundedRect(16, 250, 178, 23, 3, 3, 'F');
  text('Lumora Tech Ent.  |  SSM JR0174591U  |  Malaysia', 25, 260, 160, 8.5, orange, 'bold');
  text('lumoratech.ent@gmail.com  |  linkedin.com/company/lumora-tech', 25, 268, 160, 7.5, slate);
  footer(2);

  // Platform story
  pdf.addPage();
  heading('WHY QUICKSERVE', 'A restaurant is one operation. Its systems should work that way too.', 'Many businesses use separate tools for selling, kitchen tickets, stock sheets, staff records and finance. QuickServe connects those moments so information can move with the order.');
  y = 91;
  platformCards.forEach(({ label, copy }, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 16 + col * 91;
    const boxY = y + row * 43;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(x, boxY, 87, 35, 3, 3, 'F');
    pdf.setFillColor(...orange);
    pdf.roundedRect(x + 6, boxY + 7, 20, 20, 3, 3, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.text(String(index + 1), x + 16, boxY + 20, { align: 'center' });
    text(label, x + 32, boxY + 13, 48, 11, navy, 'bold');
    text(copy, x + 32, boxY + 21, 48, 7.7, slate);
  });
  pdf.setDrawColor(253, 186, 116);
  pdf.setLineWidth(0.8);
  pdf.line(26, 229, 184, 229);
  const flow = ['Order', 'Route', 'Prepare', 'Pay', 'Record'];
  flow.forEach((item, index) => {
    const x = 26 + index * 39.5;
    pdf.setFillColor(...orange);
    pdf.circle(x, 229, 4, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...navy);
    pdf.text(item, x, 242, { align: 'center' });
  });
  pdf.setFillColor(...navy);
  pdf.roundedRect(16, 253, 178, 20, 3, 3, 'F');
  text('One transaction can guide the kitchen, update stock and become part of the business report—without being entered three times.', 24, 264, 162, 9, [255, 255, 255], 'bold');
  footer(3);

  const drawStoryPage = (story: Story, pageNumber: number) => {
    pdf.addPage();
    const top = heading(`${story.number} / ${story.eyebrow}`, story.title, story.promise) + 4;
    drawUiVisual(story.visual, 16, top, 178, 67);
    const situationY = top + 73;
    pdf.setFillColor(...navy);
    pdf.roundedRect(16, situationY, 178, 31, 3, 3, 'F');
    text(story.situationTitle.toUpperCase(), 24, situationY + 10, 40, 6.5, [253, 186, 116], 'bold');
    text(story.situation, 66, situationY + 9, 120, 7.1, [255, 255, 255], 'normal', 1.16);
    y = situationY + 40;
    text('HOW QUICKSERVE HANDLES IT', 16, y, 178, 7.5, orange, 'bold');
    y += 8;
    story.steps.forEach((step, stepIndex) => {
      const col = stepIndex % 2;
      const row = Math.floor(stepIndex / 2);
      const cardX = 16 + col * 91;
      const cardY = y + row * 24;
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(cardX, cardY, 87, 20, 2, 2, 'F');
      pdf.setFillColor(...pale);
      pdf.circle(cardX + 8, cardY + 7, 4, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(...orange);
      pdf.text(String(stepIndex + 1), cardX + 8, cardY + 9, { align: 'center' });
      text(step.title, cardX + 15, cardY + 6, 65, 7.2, navy, 'bold', 1.03);
      text(`${step.body.split('.')[0]}.`, cardX + 15, cardY + 12, 65, 5.6, slate, 'normal', 1.05);
    });
    y += 52;
    pdf.setFillColor(240, 253, 244);
    pdf.roundedRect(16, y, 178, 24, 3, 3, 'F');
    text('THE BUSINESS RESULT', 24, y + 9, 38, 6.2, [22, 101, 52], 'bold');
    text(story.outcome, 64, y + 8, 122, 6.6, [22, 101, 52], 'normal', 1.12);
    footer(pageNumber);
  };

  const drawPartDivider = (part: string, title: string, description: string, labels: string[], pageNumber: number) => {
    pdf.addPage();
    pdf.setFillColor(...navy);
    pdf.rect(0, 0, 210, 297, 'F');
    pdf.setFillColor(...orange);
    pdf.circle(189, 45, 58, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(253, 186, 116);
    pdf.text(part.toUpperCase(), 17, 34);
    text(title, 17, 62, 158, 34, [255, 255, 255], 'bold', 1.02);
    text(description, 17, 102, 150, 13, [203, 213, 225], 'normal', 1.45);
    let labelY = 159;
    labels.forEach((label, index) => {
      pdf.setFillColor(30, 41, 59);
      pdf.roundedRect(17, labelY, 176, 18, 3, 3, 'F');
      pdf.setFillColor(...orange);
      pdf.circle(27, labelY + 9, 4, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(255, 255, 255); pdf.text(String(index + 1), 27, labelY + 11, { align: 'center' });
      text(label, 37, labelY + 11, 145, 9, [255, 255, 255], 'bold');
      labelY += 23;
    });
    pdf.setFontSize(7); pdf.setTextColor(100, 116, 139); pdf.text(`QUICKSERVE  /  ${String(pageNumber).padStart(2, '0')}`, 17, 281);
  };

  // Why QuickServe comparison
  pdf.addPage();
  heading('WHY QUICKSERVE', 'Choose a platform that removes work—not another screen to manage.', 'The real cost of a system is not only its subscription. It is the repeated entry, manual checking and disconnected decisions it leaves behind.');
  y = 92;
  pdf.setFillColor(...navy); pdf.roundedRect(16, y, 178, 15, 3, 3, 'F');
  text('DECISION AREA', 22, y + 10, 42, 6.5, [148, 163, 184], 'bold');
  text('QUICKSERVE', 66, y + 10, 57, 7, [253, 186, 116], 'bold');
  text('COMMON ALTERNATIVE', 127, y + 10, 59, 6.5, [148, 163, 184], 'bold');
  y += 18;
  advantages.forEach((item, index) => {
    const rowH = 25;
    pdf.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 252 : 255);
    pdf.rect(16, y, 178, rowH, 'F');
    text(item.title, 22, y + 9, 40, 7.3, navy, 'bold');
    text(item.quickserve, 66, y + 8, 57, 6.4, slate, 'normal', 1.12);
    text(item.alternative, 127, y + 8, 59, 6.4, slate, 'normal', 1.12);
    y += rowH;
  });
  pdf.setFillColor(...pale); pdf.roundedRect(16, 263, 178, 10, 3, 3, 'F');
  text('The QuickServe difference: operational depth at a practical starting price, with room to add workflow complexity when the business is ready.', 22, 269, 166, 7, orange, 'bold');
  footer(4);

  drawPartDivider('Part 1', 'POS & Service Operations', 'Everything that happens from the customer’s first order to kitchen fulfilment, payment and completion.', ['Counter POS & billing', 'QR and tableside ordering', 'Kitchen routing, KDS & Auto Kitchen', 'Online shop, printing and service controls'], 5);
  stories.slice(0, 4).forEach((story, index) => drawStoryPage(story, 6 + index));

  // Plan comparison
  pdf.addPage();
  heading('PACKAGES & PLANS', 'Start with the workflow you need today.', `All plans include a ${TRIAL_DAYS}-day free trial. Upgrade from counter POS to customer ordering and full kitchen integration as the operation grows.`);
  y = 91;
  PRICING_PLANS.forEach((plan, index) => {
    const x = 16 + index * 60;
    const isPro = plan.id === 'pro';
    pdf.setFillColor(isPro ? 255 : 248, isPro ? 247 : 250, isPro ? 237 : 252);
    pdf.setDrawColor(isPro ? 249 : 226, isPro ? 115 : 232, isPro ? 22 : 240);
    pdf.roundedRect(x, y, 56, 66, 4, 4, 'FD');
    text(plan.name.toUpperCase(), x + 6, y + 12, 44, 10, isPro ? orange : navy, 'bold');
    text(`RM ${plan.price}/month`, x + 6, y + 25, 44, 13, navy, 'bold');
    text(`RM ${plan.annualPrice}/mo annually`, x + 6, y + 34, 44, 6.5, slate, 'bold');
    text(plan.description, x + 6, y + 45, 44, 6.5, slate, 'normal', 1.15);
  });
  const planRows = [
    ['Full counter POS', true, true, true], ['Back office & reports', true, true, true], ['QR customer ordering', false, true, true], ['Staff tableside ordering', false, true, true], ['Kitchen Display System', false, false, true], ['Department kitchen routing', false, false, true], ['Automatic bill routing', false, false, true],
  ] as Array<[string, boolean, boolean, boolean]>;
  y = 168;
  pdf.setFillColor(...navy); pdf.rect(16, y, 178, 13, 'F');
  text('FEATURE', 22, y + 9, 80, 6.5, [148, 163, 184], 'bold');
  ['BASIC', 'PRO', 'PRO PLUS'].forEach((label, index) => text(label, 116 + index * 26, y + 9, 22, 6.2, index === 1 ? [253, 186, 116] : [255, 255, 255], 'bold'));
  y += 13;
  planRows.forEach((row, rowIndex) => {
    pdf.setFillColor(rowIndex % 2 === 0 ? 248 : 255, rowIndex % 2 === 0 ? 250 : 255, rowIndex % 2 === 0 ? 252 : 255); pdf.rect(16, y, 178, 11, 'F');
    text(row[0], 22, y + 7.5, 86, 6.8, navy, 'bold');
    [row[1], row[2], row[3]].forEach((enabled, index) => { pdf.setFillColor(enabled ? 34 : 203, enabled ? 197 : 213, enabled ? 94 : 225); pdf.circle(121 + index * 27, y + 5.5, 2.4, 'F'); });
    y += 11;
  });
  text('Prices shown in Malaysian Ringgit. Annual price is the monthly equivalent when billed annually.', 16, 270, 178, 6.5, slate);
  footer(10);

  drawPartDivider('Part 2', 'Back Office & Business Control', 'The management layer behind every sale—designed to help owners control products, stock, people, cost and performance.', ['Dashboard, items & catalogue', 'Inventory, purchasing & production', 'Staff, payroll, claims & leave', 'Reports, expenses, finance, contacts & shifts'], 11);
  stories.slice(4).forEach((story, index) => drawStoryPage(story, 12 + index));

  // Shift management spotlight
  pdf.addPage();
  heading('SHIFT MANAGEMENT', 'Every payment belongs to an accountable cashier shift.', 'Control opening, checkout access, payment totals, drawer reconciliation and the final shift record in one workflow.');
  y = 91;
  pdf.setFillColor(...navy); pdf.roundedRect(16, y, 178, 73, 4, 4, 'F');
  text('ACTIVE SHIFT  /  SH-2026-0714-A', 24, y + 13, 150, 7, [253, 186, 116], 'bold');
  [['RM 300', 'OPENING FLOAT'], ['RM 2,840', 'TOTAL SALES'], ['86', 'ORDERS'], ['04:38', 'DURATION']].forEach(([value, label], index) => {
    const cardX = 23 + index * 41;
    pdf.setFillColor(30, 41, 59); pdf.roundedRect(cardX, y + 21, 36, 22, 2, 2, 'F');
    text(value, cardX + 4, y + 31, 28, 8.5, [255, 255, 255], 'bold'); text(label, cardX + 4, y + 38, 28, 5.5, [148, 163, 184], 'bold');
  });
  [['Cash', 'RM 1,520'], ['Card', 'RM 860'], ['QR', 'RM 460'], ['Variance', 'RM 0.00']].forEach(([label, value], index) => { text(label, 24 + index * 41, y + 55, 30, 6.5, [148, 163, 184], 'bold'); text(value, 24 + index * 41, y + 64, 30, 8, index === 3 ? [74, 222, 128] : [255, 255, 255], 'bold'); });
  y += 84;
  const shiftSteps = [
    ['Open with accountability', 'Capture cashier, opening amount and start time.'],
    ['Enforce the active shift', 'Block payment completion when no cashier shift is open.'],
    ['Reconcile the drawer', 'Compare expected and counted cash with payment-method totals.'],
    ['Close with evidence', 'Retain transactions and generate PDF or CSV shift reports.'],
  ];
  shiftSteps.forEach(([title, body], index) => {
    const x = 16 + (index % 2) * 91; const boxY = y + Math.floor(index / 2) * 36;
    pdf.setFillColor(248, 250, 252); pdf.roundedRect(x, boxY, 87, 30, 3, 3, 'F');
    text(`0${index + 1}`, x + 7, boxY + 11, 12, 7, orange, 'bold'); text(title, x + 20, boxY + 10, 59, 8, navy, 'bold'); text(body, x + 20, boxY + 18, 59, 6.5, slate, 'normal', 1.12);
  });
  pdf.setFillColor(240, 253, 244); pdf.roundedRect(16, 251, 178, 22, 3, 3, 'F');
  text('RESULT', 24, 260, 25, 6.5, [22, 101, 52], 'bold'); text('Faster closing, clearer cash responsibility and a complete record for every cashier session.', 51, 260, 134, 7.5, [22, 101, 52], 'bold');
  footer(16);

  // Full back-office capability directory
  [backOfficeCatalogue.slice(0, 4), backOfficeCatalogue.slice(4)].forEach((groups, pageIndex) => {
    pdf.addPage();
    heading(`BACK OFFICE DIRECTORY / ${pageIndex + 1} OF 2`, pageIndex === 0 ? 'Everything behind the menu and stock.' : 'Everything behind the team and the numbers.', 'A complete view of the functions available from the QuickServe Back Office.');
    y = 91;
    groups.forEach((group, groupIndex) => {
      const boxH = 40;
      pdf.setFillColor(groupIndex % 2 === 0 ? 248 : 255, groupIndex % 2 === 0 ? 250 : 255, groupIndex % 2 === 0 ? 252 : 255);
      pdf.roundedRect(16, y, 178, boxH, 3, 3, 'F');
      text(group.title, 23, y + 10, 72, 10, navy, 'bold');
      text(group.summary, 23, y + 19, 72, 6.5, orange, 'bold', 1.12);
      const left = group.items.slice(0, Math.ceil(group.items.length / 2));
      const right = group.items.slice(Math.ceil(group.items.length / 2));
      [left, right].forEach((items, column) => items.forEach((item, itemIndex) => {
        pdf.setFillColor(...orange); pdf.circle(102 + column * 44, y + 9 + itemIndex * 7, 1, 'F');
        text(item, 106 + column * 44, y + 10 + itemIndex * 7, 39, 5.8, slate, 'normal', 1.05);
      }));
      y += 44;
    });
    footer(17 + pageIndex);
  });

  // Closing
  pdf.addPage();
  pdf.setFillColor(...navy);
  pdf.rect(0, 0, 210, 297, 'F');
  pdf.setFillColor(...orange);
  pdf.circle(192, 39, 51, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(253, 186, 116);
  pdf.text('LET’S BUILD A BETTER SERVICE FLOW', 17, 28);
  pdf.setFontSize(31);
  pdf.setTextColor(255, 255, 255);
  pdf.text('Your next order', 17, 57);
  pdf.text('can do more.', 17, 71);
  text('QuickServe is not only a place to record a sale. It is the connection between the customer, the service team, the kitchen and the decisions made after closing time.', 17, 92, 154, 12, [203, 213, 225], 'normal', 1.45);
  const closeItems = [
    ['Faster service', 'Give staff a clear workflow for every channel.'],
    ['Better coordination', 'Route information to the right people automatically.'],
    ['Stronger control', 'Connect stock, people, expenses and reporting.'],
    ['Room to grow', 'Add capabilities as the operation becomes more complex.'],
  ];
  y = 145;
  closeItems.forEach(([title, body], index) => {
    const x = index % 2 === 0 ? 17 : 108;
    const boxY = y + Math.floor(index / 2) * 48;
    pdf.setFillColor(30, 41, 59);
    pdf.roundedRect(x, boxY, 85, 38, 3, 3, 'F');
    text(title, x + 8, boxY + 13, 69, 10, [255, 255, 255], 'bold');
    text(body, x + 8, boxY + 22, 69, 7.8, [148, 163, 184]);
  });
  pdf.setDrawColor(71, 85, 105);
  pdf.line(17, 249, 193, 249);
  pdf.setFontSize(18);
  pdf.setTextColor(255, 255, 255);
  pdf.text('QUICK', 17, 265);
  pdf.setTextColor(...orange);
  pdf.text('SERVE', 38, 265);
  text('A product by Lumora Tech Ent.  |  JR0174591U  |  Malaysia', 17, 276, 176, 8, [148, 163, 184], 'bold');
  text('lumoratech.ent@gmail.com  |  linkedin.com/company/lumora-tech', 17, 284, 176, 7.5, [148, 163, 184]);

  pdf.setProperties({
    title: 'Introducing QuickServe - Commercial Product Profile',
    subject: 'How QuickServe connects POS, kitchen, ordering and back-office operations',
    author: 'Lumora Tech Ent.',
    creator: 'QuickServe Admin',
  });
  return pdf;
};

const QuickServeIntroductionDocument: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = async () => {
    setIsExporting(true);
    try {
      const assets = await loadBrowserAssets();
      const pdf = await buildQuickServeIntroductionPdf(assets);
      pdf.save('introducing-quickserve-commercial-product-profile.pdf');
    } finally {
      setIsExporting(false);
    }
  };

  const renderStory = (story: Story) => (
    <section key={story.number} className="min-h-[720px] rounded-sm bg-white p-[7%] shadow-2xl md:min-h-[980px]">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-500">{story.number} / {story.eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black tracking-tighter text-slate-900 md:text-5xl">{story.title}</h2>
      <p className="mt-4 text-base font-bold leading-relaxed text-orange-600">{story.promise}</p>
      <CatalogueVisual kind={story.visual} className="mt-6 h-64 md:h-80" />
      <div className="mt-6 grid gap-5 md:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-3xl bg-slate-900 p-6 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">{story.situationTitle}</p>
          <p className="mt-3 text-sm font-medium leading-relaxed text-slate-200">{story.situation}</p>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">How QuickServe handles it</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {story.steps.map((step, index) => <div key={step.title} className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-[10px] font-black text-orange-600">{index + 1}</span><h3 className="text-sm font-black text-slate-900">{step.title}</h3></div><p className="mt-2 text-xs leading-relaxed text-slate-600">{step.body}</p></div>)}
          </div>
        </div>
      </div>
      <div className="mt-5 rounded-2xl bg-emerald-50 p-5 text-emerald-900"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">The business result</p><p className="mt-2 text-sm font-bold leading-relaxed">{story.outcome}</p></div>
      <div className="mt-4 flex flex-wrap gap-2">{story.capabilities.map(item => <span key={item} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-orange-700">{item}</span>)}</div>
    </section>
  );

  return (
    <div className="bg-slate-100 p-3 dark:bg-slate-950 md:p-6">
      <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-400">Commercial A4 Product Profile</p>
          <p className="mt-1 text-sm font-bold">Company story, customer situations, workflows and business outcomes</p>
        </div>
        <button onClick={() => void exportPdf()} disabled={isExporting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-600 disabled:opacity-60">
          <Download size={15} /> {isExporting ? 'Creating PDF...' : 'Download A4 PDF'}
        </button>
      </div>

      <div className="mx-auto max-w-[820px] space-y-6">
        <section className="relative aspect-[210/297] min-h-[620px] overflow-hidden rounded-sm bg-slate-950 p-[7%] text-white shadow-2xl">
          <div className="absolute -right-[12%] -top-[8%] h-[32%] w-[45%] rounded-full bg-orange-500" />
          <div className="absolute -right-[18%] top-[24%] h-[42%] w-[52%] rounded-full bg-slate-800" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="text-2xl font-black tracking-tighter">QUICK<span className="text-orange-500">SERVE</span></div>
            <h1 className="mt-[18%] max-w-[86%] text-[clamp(2rem,6vw,4.5rem)] font-black leading-[0.95] tracking-tighter">Run every order.<br />Connect every team.<br /><span className="text-orange-400">Know your business.</span></h1>
            <p className="mt-8 max-w-xl text-base font-medium leading-relaxed text-slate-300 md:text-xl">A complete restaurant operating platform for POS, kitchen, ordering, stock, people and finance.</p>
            <div className="mt-auto border-t border-slate-700 pt-6 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 md:text-xs">A product by Lumora Tech Ent. · Malaysia</div>
          </div>
        </section>

        <section className="min-h-[720px] rounded-sm bg-white p-[7%] shadow-2xl md:min-h-[980px]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-500">About us</p>
          <h2 className="mt-4 text-4xl font-black tracking-tighter text-slate-900 md:text-6xl">Practical technology, built around real business work.</h2>
          <p className="mt-5 max-w-3xl text-base font-medium leading-relaxed text-slate-600 md:text-lg">QuickServe is developed by Lumora Tech Ent., a Malaysian technology company focused on making digital transformation useful, approachable and commercially meaningful.</p>
          <div className="mt-8 rounded-3xl bg-slate-900 p-7 text-white md:p-10">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Our story</p>
            <p className="mt-4 text-lg font-medium leading-relaxed text-slate-200 md:text-2xl">Lumora Tech began as a trusted device service provider. Working close to customers taught us that good technology is not defined by complexity—it is defined by how reliably it solves everyday problems.</p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              ['Mission', 'Remove barriers with affordable, reliable systems that help teams do their best work.'],
              ['Vision', 'Build smarter local businesses through practical digital tools that grow with them.'],
              ['Promise', 'Stay responsive, transparent and committed to improvements that create real value.'],
            ].map(([title, copy]) => <div key={title} className="rounded-2xl bg-orange-50 p-5"><ShieldCheck className="text-orange-500" size={22} /><h3 className="mt-4 font-black text-slate-900">{title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">{copy}</p></div>)}
          </div>
          <div className="mt-7 border-t border-slate-200 pt-5 text-sm font-bold text-slate-500">Lumora Tech Ent. · SSM JR0174591U · Malaysia · lumoratech.ent@gmail.com</div>
        </section>

        <section className="min-h-[720px] rounded-sm bg-orange-50 p-[7%] shadow-2xl md:min-h-[980px]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-500">Why QuickServe</p>
          <h2 className="mt-4 text-4xl font-black tracking-tighter text-slate-900 md:text-6xl">A restaurant is one operation. Its systems should work that way too.</h2>
          <p className="mt-5 max-w-3xl text-base font-medium leading-relaxed text-slate-600 md:text-lg">QuickServe connects the moments that usually live in separate tools, so information can move with the order instead of being entered again by each team.</p>
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
            {platformCards.map(({ Icon, label, copy }) => <div key={label} className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm"><Icon className="text-orange-500" size={24} /><h3 className="mt-4 font-black text-slate-900">{label}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">{copy}</p></div>)}
          </div>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-slate-900 p-6 text-white">
            {['Order', 'Route', 'Prepare', 'Pay', 'Record'].map((item, index) => <React.Fragment key={item}><span className="font-black">{item}</span>{index < 4 && <ArrowRight className="text-orange-400" size={16} />}</React.Fragment>)}
          </div>
        </section>

        <section className="min-h-[720px] rounded-sm bg-white p-[7%] shadow-2xl md:min-h-[980px]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-500">Why QuickServe</p>
          <h2 className="mt-4 text-4xl font-black tracking-tighter text-slate-900 md:text-6xl">Choose a platform that removes work—not another screen to manage.</h2>
          <p className="mt-5 max-w-3xl text-base font-medium leading-relaxed text-slate-600">QuickServe is designed around connected restaurant work. The difference becomes clear when it is compared with a cashier-only system or a stack of separate software.</p>
          <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200">
            <div className="grid grid-cols-[0.65fr_1fr_1fr] bg-slate-950 px-4 py-4 text-[10px] font-black uppercase tracking-wider text-white"><span>Decision area</span><span className="text-orange-400">QuickServe</span><span className="text-slate-400">Common alternative</span></div>
            {advantages.map((item, index) => <div key={item.title} className={`grid grid-cols-[0.65fr_1fr_1fr] gap-4 px-4 py-4 text-xs leading-relaxed ${index % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}><span className="font-black text-slate-900">{item.title}</span><span className="font-medium text-slate-700">{item.quickserve}</span><span className="text-slate-500">{item.alternative}</span></div>)}
          </div>
        </section>

        <section className="relative min-h-[720px] overflow-hidden rounded-sm bg-slate-950 p-[7%] text-white shadow-2xl md:min-h-[980px]"><div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-orange-500" /><div className="relative z-10"><p className="text-sm font-black uppercase tracking-[0.3em] text-orange-400">Part 1</p><h2 className="mt-8 max-w-2xl text-6xl font-black tracking-tighter md:text-8xl">POS & Service Operations</h2><p className="mt-7 max-w-xl text-xl font-medium leading-relaxed text-slate-300">Everything from the customer’s first order to kitchen fulfilment, payment and completion.</p><div className="mt-16 grid gap-3 md:grid-cols-2">{['Counter POS & billing','QR and tableside ordering','Kitchen routing, KDS & Auto Kitchen','Online shop, printing and service controls'].map((item,index) => <div key={item} className="flex items-center gap-4 rounded-2xl bg-white/5 p-5"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-xs font-black">{index+1}</span><span className="font-black">{item}</span></div>)}</div></div></section>

        {stories.slice(0, 4).map(renderStory)}

        <section className="min-h-[720px] rounded-sm bg-white p-[7%] shadow-2xl md:min-h-[980px]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-500">Packages & plans</p>
          <h2 className="mt-4 text-4xl font-black tracking-tighter text-slate-900 md:text-6xl">Start with the workflow you need today.</h2>
          <p className="mt-5 text-base font-medium text-slate-600">All plans include a {TRIAL_DAYS}-day free trial. Annual pricing shows the monthly equivalent when billed annually.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">{PRICING_PLANS.map(plan => <div key={plan.id} className={`rounded-3xl border p-6 ${plan.highlight ? 'border-orange-400 bg-orange-50 shadow-xl shadow-orange-500/10' : 'border-slate-200 bg-slate-50'}`}><p className="text-sm font-black uppercase tracking-wider text-orange-500">{plan.name}</p><p className="mt-4 text-4xl font-black text-slate-900">RM {plan.price}<span className="text-sm text-slate-400">/mo</span></p><p className="mt-1 text-xs font-bold text-slate-500">RM {plan.annualPrice}/mo annually</p><p className="mt-4 text-sm leading-relaxed text-slate-600">{plan.description}</p><div className="mt-5 space-y-2">{plan.features.map(item => <div key={item} className="flex gap-2 text-xs font-bold text-slate-700"><Check size={14} className="shrink-0 text-emerald-500" />{item}</div>)}</div></div>)}</div>
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200"><div className="grid grid-cols-[1.5fr_repeat(3,0.7fr)] bg-slate-950 px-4 py-3 text-[10px] font-black uppercase text-white"><span>Workflow</span><span>Basic</span><span className="text-orange-400">Pro</span><span>Pro Plus</span></div>{[['Counter POS',1,1,1],['Back office & reports',1,1,1],['QR ordering',0,1,1],['Tableside ordering',0,1,1],['Kitchen Display System',0,0,1],['Kitchen department routing',0,0,1]].map((row,index) => <div key={String(row[0])} className={`grid grid-cols-[1.5fr_repeat(3,0.7fr)] px-4 py-3 text-xs ${index%2===0?'bg-slate-50':'bg-white'}`}><span className="font-bold text-slate-700">{row[0]}</span>{row.slice(1).map((value,i)=><span key={i} className={value?'font-black text-emerald-500':'text-slate-300'}>{value?'Included':'—'}</span>)}</div>)}</div>
        </section>

        <section className="relative min-h-[720px] overflow-hidden rounded-sm bg-slate-950 p-[7%] text-white shadow-2xl md:min-h-[980px]"><div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-orange-500" /><div className="relative z-10"><p className="text-sm font-black uppercase tracking-[0.3em] text-orange-400">Part 2</p><h2 className="mt-8 max-w-2xl text-6xl font-black tracking-tighter md:text-8xl">Back Office & Business Control</h2><p className="mt-7 max-w-xl text-xl font-medium leading-relaxed text-slate-300">The management layer behind every sale—products, stock, people, cost, reporting and growth.</p><div className="mt-16 grid gap-3 md:grid-cols-2">{['Dashboard, items & catalogue','Inventory, purchasing & production','Staff, payroll, claims & leave','Reports, expenses, finance, contacts & shifts'].map((item,index) => <div key={item} className="flex items-center gap-4 rounded-2xl bg-white/5 p-5"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-xs font-black">{index+1}</span><span className="font-black">{item}</span></div>)}</div></div></section>

        {stories.slice(4).map(renderStory)}

        <section className="min-h-[720px] rounded-sm bg-white p-[7%] shadow-2xl md:min-h-[980px]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-500">Shift Management</p>
          <h2 className="mt-4 text-4xl font-black tracking-tighter text-slate-900 md:text-6xl">Every payment belongs to an accountable cashier shift.</h2>
          <p className="mt-5 text-base font-medium leading-relaxed text-slate-600">Control opening, checkout access, payment totals, drawer reconciliation and the final shift record in one workflow.</p>
          <div className="mt-8 rounded-3xl bg-slate-950 p-6 text-white">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Active Shift</p><p className="mt-1 text-lg font-black">SH-2026-0714-A</p></div><span className="rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-black text-emerald-300">OPEN</span></div>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">{[['RM 300','Opening Float'],['RM 2,840','Total Sales'],['86','Orders'],['04:38','Duration']].map(([value,label]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><p className="text-xl font-black">{value}</p><p className="mt-1 text-[9px] font-bold uppercase text-slate-400">{label}</p></div>)}</div>
            <div className="mt-4 grid grid-cols-4 gap-2">{[['Cash','RM 1,520'],['Card','RM 860'],['QR','RM 460'],['Variance','RM 0.00']].map(([label,value],index) => <div key={label} className="rounded-xl bg-white/5 p-3"><p className="text-[9px] text-slate-400">{label}</p><p className={`mt-1 text-sm font-black ${index===3?'text-emerald-400':'text-white'}`}>{value}</p></div>)}</div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">{[['Open with accountability','Capture cashier, opening amount and start time.'],['Enforce the active shift','Block payment completion when no cashier shift is open.'],['Reconcile the drawer','Compare expected and counted cash with each payment method.'],['Close with evidence','Retain transactions and generate PDF or CSV shift reports.']].map(([title,body],index)=><div key={title} className="rounded-2xl bg-slate-50 p-5"><span className="text-xs font-black text-orange-500">0{index+1}</span><h3 className="mt-2 font-black text-slate-900">{title}</h3><p className="mt-2 text-sm text-slate-600">{body}</p></div>)}</div>
        </section>

        {[backOfficeCatalogue.slice(0,4), backOfficeCatalogue.slice(4)].map((groups,pageIndex) => <section key={pageIndex} className="min-h-[720px] rounded-sm bg-white p-[7%] shadow-2xl md:min-h-[980px]"><p className="text-xs font-black uppercase tracking-[0.24em] text-orange-500">Complete Back Office Directory · {pageIndex+1}/2</p><h2 className="mt-4 text-4xl font-black tracking-tighter text-slate-900 md:text-6xl">{pageIndex===0?'Everything behind the menu and stock.':'Everything behind the team and numbers.'}</h2><div className="mt-8 grid gap-4 md:grid-cols-2">{groups.map(group => <div key={group.title} className="rounded-3xl bg-slate-50 p-5"><h3 className="text-lg font-black text-slate-900">{group.title}</h3><p className="mt-2 text-xs font-bold leading-relaxed text-orange-600">{group.summary}</p><div className="mt-4 space-y-2">{group.items.map(item => <div key={item} className="flex gap-2 text-xs leading-relaxed text-slate-600"><Check size={13} className="mt-0.5 shrink-0 text-emerald-500" />{item}</div>)}</div></div>)}</div></section>)}

        <section className="min-h-[720px] rounded-sm bg-slate-950 p-[7%] text-white shadow-2xl md:min-h-[980px]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">Let’s build a better service flow</p>
          <h2 className="mt-5 text-5xl font-black tracking-tighter md:text-7xl">Your next order can do more.</h2>
          <p className="mt-7 max-w-3xl text-lg font-medium leading-relaxed text-slate-300 md:text-2xl">QuickServe is not only a place to record a sale. It is the connection between the customer, the service team, the kitchen and the decisions made after closing time.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[
              ['Faster service', 'Give staff a clear workflow for every channel.'],
              ['Better coordination', 'Route information to the right people automatically.'],
              ['Stronger control', 'Connect stock, people, expenses and reporting.'],
              ['Room to grow', 'Add capabilities as the operation becomes more complex.'],
            ].map(([title, copy]) => <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><Check className="text-orange-400" size={20} /><h3 className="mt-4 text-lg font-black">{title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-400">{copy}</p></div>)}
          </div>
          <div className="mt-12 border-t border-slate-800 pt-8"><div className="text-2xl font-black tracking-tighter">QUICK<span className="text-orange-500">SERVE</span></div><p className="mt-2 text-sm font-bold text-slate-400">A product by Lumora Tech Ent. · JR0174591U · Malaysia</p><p className="mt-1 text-sm text-slate-500">lumoratech.ent@gmail.com · linkedin.com/company/lumora-tech</p></div>
        </section>
      </div>
    </div>
  );
};

export default QuickServeIntroductionDocument;
