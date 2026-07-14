import React, { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  Download,
  PackageOpen,
  QrCode,
  ShieldCheck,
  ShoppingCart,
  Users,
  Workflow,
} from 'lucide-react';

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
  },
  {
    number: '07',
    eyebrow: 'REPORTING, EXPENSES & FINANCE',
    title: 'See what happened today—and what it means for the business.',
    promise: 'QuickServe transforms daily transactions into operational and financial visibility.',
    situationTitle: 'The owner’s visibility situation',
    situation: 'The outlet is busy, but revenue alone does not answer the important questions: What sold? Which payment methods were used? What did the operation spend? Is gross profit improving? Which shifts, products or categories need attention?',
    steps: [
      { title: 'Start with live operating signals', body: 'The dashboard highlights sales, order volume, average order value and cancellations for the selected period.' },
      { title: 'Investigate performance', body: 'Analyse sales by hour, day, week or month, then drill into item, category, employee, payment, modifier, discount and tax reports.' },
      { title: 'Bring costs into view', body: 'Record expenses as cost of goods sold or operating expenses, including linked platform fees, payroll and staff claims.' },
      { title: 'Read the financial story', body: 'QuickServe combines revenue and expense records into gross profit, net profit, Profit & Loss, expense breakdown and monthly comparison views.' },
    ],
    outcome: 'Owners can move from “we were busy” to evidence-based decisions about menu performance, staffing, costs and growth.',
    capabilities: ['Sales dashboard', 'Eight report views', 'COGS & OPEX', 'Expense ledger', 'P&L', 'Gross profit', 'Net profit', 'Monthly comparison'],
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

export const buildQuickServeIntroductionPdf = async () => {
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
  pdf.text('From order', 17, 83);
  pdf.text('to insight.', 17, 97);
  pdf.setTextColor(253, 186, 116);
  pdf.text('One connected flow.', 17, 111);
  text('Discover how QuickServe helps modern food businesses serve faster, coordinate better and make clearer decisions.', 17, 134, 127, 13, [226, 232, 240], 'normal', 1.45);
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

  stories.forEach((story, index) => {
    pdf.addPage();
    const top = heading(`${story.number} / ${story.eyebrow}`, story.title, story.promise) + 6;
    pdf.setFillColor(...navy);
    pdf.roundedRect(16, top, 178, 42, 4, 4, 'F');
    text(story.situationTitle.toUpperCase(), 25, top + 12, 156, 7.5, [253, 186, 116], 'bold');
    text(story.situation, 25, top + 23, 158, 8.6, [255, 255, 255], 'normal', 1.32);
    y = top + 54;
    text('HOW QUICKSERVE HANDLES IT', 16, y, 178, 8, orange, 'bold');
    y += 10;
    story.steps.forEach((step, stepIndex) => {
      pdf.setFillColor(...pale);
      pdf.circle(23, y + 2, 5, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...orange);
      pdf.text(String(stepIndex + 1), 23, y + 4, { align: 'center' });
      text(step.title, 33, y, 151, 9.5, navy, 'bold');
      const next = text(step.body, 33, y + 7, 151, 7.8, slate, 'normal', 1.25);
      y = next + 5;
    });
    pdf.setFillColor(240, 253, 244);
    pdf.roundedRect(16, y, 178, 29, 3, 3, 'F');
    text('THE BUSINESS RESULT', 25, y + 10, 155, 7.5, [22, 101, 52], 'bold');
    text(story.outcome, 25, y + 19, 157, 8, [22, 101, 52], 'normal', 1.25);
    const chipsY = Math.min(y + 39, 269);
    text('INCLUDED CAPABILITIES', 16, chipsY, 178, 7, orange, 'bold');
    text(story.capabilities.join('  •  '), 16, chipsY + 8, 178, 7.2, slate, 'bold', 1.2);
    footer(index + 4);
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
      const pdf = await buildQuickServeIntroductionPdf();
      pdf.save('introducing-quickserve-commercial-product-profile.pdf');
    } finally {
      setIsExporting(false);
    }
  };

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
            <h1 className="mt-[18%] max-w-[86%] text-[clamp(2rem,6vw,4.5rem)] font-black leading-[0.95] tracking-tighter">From order<br />to insight.<br /><span className="text-orange-400">One connected flow.</span></h1>
            <p className="mt-8 max-w-xl text-base font-medium leading-relaxed text-slate-300 md:text-xl">Discover how QuickServe helps modern food businesses serve faster, coordinate better and make clearer decisions.</p>
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

        {stories.map(story => (
          <section key={story.number} className="min-h-[720px] rounded-sm bg-white p-[7%] shadow-2xl md:min-h-[980px]">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-500">{story.number} / {story.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-black tracking-tighter text-slate-900 md:text-5xl">{story.title}</h2>
            <p className="mt-4 text-base font-bold leading-relaxed text-orange-600">{story.promise}</p>
            <div className="mt-6 rounded-3xl bg-slate-900 p-6 text-white">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">{story.situationTitle}</p>
              <p className="mt-3 text-sm font-medium leading-relaxed text-slate-200 md:text-base">{story.situation}</p>
            </div>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.2em] text-slate-400">How QuickServe handles it</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {story.steps.map((step, index) => <div key={step.title} className="rounded-2xl bg-slate-50 p-5"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-600">{index + 1}</span><h3 className="font-black text-slate-900">{step.title}</h3></div><p className="mt-3 text-sm leading-relaxed text-slate-600">{step.body}</p></div>)}
            </div>
            <div className="mt-5 rounded-2xl bg-emerald-50 p-5 text-emerald-900"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">The business result</p><p className="mt-2 text-sm font-bold leading-relaxed">{story.outcome}</p></div>
            <div className="mt-4 flex flex-wrap gap-2">{story.capabilities.map(item => <span key={item} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-orange-700">{item}</span>)}</div>
          </section>
        ))}

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
