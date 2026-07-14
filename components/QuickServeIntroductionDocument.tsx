import React, { useState } from 'react';
import {
  BarChart3,
  Check,
  ChefHat,
  CreditCard,
  Download,
  Globe2,
  PackageOpen,
  QrCode,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Tablet,
  Users,
  WalletCards,
  Workflow,
} from 'lucide-react';

type DocumentSection = {
  eyebrow: string;
  title: string;
  intro: string;
  groups: Array<{ title: string; items: string[] }>;
  callout?: string;
};

const sections: DocumentSection[] = [
  {
    eyebrow: '01 / Point of sale',
    title: 'A faster counter, built for real service',
    intro: 'QuickServe brings ordering, billing, payments and fulfilment into one responsive POS workspace for dine-in, takeaway and delivery operations.',
    groups: [
      {
        title: 'Order & sell',
        items: [
          'Fast menu and category navigation with search, SKU and barcode support',
          'Sizes, variants, temperatures, modifiers, add-ons and mix-and-match choices',
          'Dine-in, takeaway and delivery order types with notes and table assignment',
          'Saved bills, table layouts and bill recall for ongoing service',
          'Item promotions, discounts, taxes and service-charge configuration',
        ],
      },
      {
        title: 'Bill & collect',
        items: [
          'Configurable cash, card, DuitNow and custom payment methods',
          'Cash tender and change calculation with clear payment confirmation',
          'Custom receipts and kitchen order lists with manual or automatic printing',
          'Reprint, collect-later and manager-approved refund workflows',
          'Bluetooth, Wi-Fi/LAN, USB and SUNMI built-in printer support',
        ],
      },
      {
        title: 'Operate with control',
        items: [
          'Role-based access for vendor, cashier, manager, kitchen and order-taker teams',
          'Cashier shift opening, closing, cash reconciliation and shift reporting',
          'Live sales reports, order status tracking and customer-facing display support',
          'Configurable receipt, order-list, cash-drawer and payment settings',
        ],
      },
    ],
    callout: 'One transaction can update the kitchen, stock, sales reporting and finance records automatically.',
  },
  {
    eyebrow: '02 / Kitchen operations',
    title: 'The right item, to the right kitchen, automatically',
    intro: 'QuickServe connects every ordering channel to a kitchen workflow designed to reduce verbal instructions, duplicate entry and missed tickets.',
    groups: [
      {
        title: 'Kitchen routing',
        items: [
          'Create kitchen departments such as Hot Kitchen, Drinks, Dessert or Packing',
          'Assign menu categories to departments so each station sees only relevant items',
          'Route counter, QR, tableside and online orders through the same order pipeline',
          'Keep non-kitchen items out of preparation queues while preserving the full bill',
        ],
      },
      {
        title: 'Kitchen Display System',
        items: [
          'Real-time incoming orders with item notes, table and source information',
          'Pending, preparing, ready/served and completed progress visibility',
          'Kitchen-category access per staff account for focused station views',
          'Accept, reject and update orders with operational reasons and notes',
        ],
      },
      {
        title: 'Auto Kitchen',
        items: [
          'Automatically accept eligible incoming orders when configured',
          'Automatically print kitchen tickets to the selected printer',
          'Apply auto-approval and auto-print rules to QR and tableside channels',
          'Use KDS and printed tickets together for screen-and-paper redundancy',
        ],
      },
    ],
    callout: 'Kitchen routing removes manual sorting and gives every station a clear, accountable queue.',
  },
  {
    eyebrow: '03 / Omnichannel ordering',
    title: 'Serve customers wherever they choose to order',
    intro: 'Every channel uses the same products, prices and operational flow, giving the team one source of truth from order capture to fulfilment.',
    groups: [
      {
        title: 'QR ordering',
        items: [
          'Generate table QR codes for customer self-ordering',
          'Receive orders in an incoming-order queue with table details and remarks',
          'Approve manually or automatically and print on acceptance',
          'Send accepted items into configured kitchen routes',
        ],
      },
      {
        title: 'Tableside ordering',
        items: [
          'Give order takers a mobile-friendly menu on phone or tablet',
          'Select tables, capture item options and add service remarks at the table',
          'Submit directly to POS and kitchen without handwritten re-entry',
          'Use independent auto-approve and auto-print controls',
        ],
      },
      {
        title: 'Online shop',
        items: [
          'Publish a shareable storefront with product images and options',
          'Control which products are available online',
          'Offer pickup, Lalamove, postage or custom delivery methods and fees',
          'Support cash on delivery and configured online payment choices',
        ],
      },
    ],
    callout: 'Counter, QR, tableside and online orders converge into one connected operation.',
  },
  {
    eyebrow: '04 / Products & stock',
    title: 'Know what you sell, buy, make and use',
    intro: 'QuickServe links the product catalogue to practical inventory controls for finished goods, ingredients, recipes, purchasing and production.',
    groups: [
      {
        title: 'Items & catalogue',
        items: [
          'Create, edit, archive and restore items with categories, images and descriptions',
          'Manage price, cost, SKU, barcode, unit of sale and stock-tracking rules',
          'Build modifiers, add-ons, variants, sizes and promotional pricing',
          'Maintain ingredient and non-menu stock such as packaging and supplies',
        ],
      },
      {
        title: 'Inventory control',
        items: [
          'Purchase orders with status tracking and supplier records',
          'Transfer orders between locations or stock points',
          'Stock adjustments, physical counts, movement history and valuation',
          'Low-stock visibility and current-balance tracking by unit',
        ],
      },
      {
        title: 'Recipes & production',
        items: [
          'Define recipe quantities and units for ingredient consumption',
          'Record production batches and calculate produced stock',
          'Deduct finished stock or recipe ingredients automatically at POS completion',
          'Calculate item cost from production where configured',
        ],
      },
    ],
    callout: 'Sales and production can drive stock movements without duplicate manual entries.',
  },
  {
    eyebrow: '05 / People operations',
    title: 'Staff, payroll, claims and leave in one place',
    intro: 'QuickServe gives operators a practical HR workspace connected to access control, payroll expense records and day-to-day workforce administration.',
    groups: [
      {
        title: 'Staff management',
        items: [
          'Create staff accounts for cashier, kitchen, order taker, manager and HR roles',
          'Maintain employee codes, employment status, job details and contact information',
          'Organise departments and assign kitchen-category access',
          'Store bank, EPF and SOCSO information with salary and overtime setup',
        ],
      },
      {
        title: 'Payroll & payslips',
        items: [
          'Prepare payroll by pay period using reusable employee templates',
          'Calculate basic pay, overtime, allowances, bonuses and commissions',
          'Record EPF, SOCSO, EIS, PCB/tax, unpaid leave and other deductions',
          'Track employer contributions and generate, copy, print or download PDF payslips',
          'Sync payroll totals into staff expenses for financial reporting',
        ],
      },
      {
        title: 'Claims & leave',
        items: [
          'Create multi-line staff claims with type, receipt reference, notes and payment method',
          'Sync approved claim records into the Staff / Claims expense category',
          'Manage annual, medical, hospitalisation, paternity and other leave',
          'Track scheduled, approved, completed and cancelled leave with balances',
          'Set leave entitlements, including annual-leave levels by service year',
        ],
      },
    ],
    callout: 'Operational roles, employee records and financial impact stay connected.',
  },
  {
    eyebrow: '06 / Accounting & insight',
    title: 'Turn daily activity into decisions',
    intro: 'Live operational records flow into dashboards, expenses, finance summaries and detailed reports so owners can understand performance without rebuilding spreadsheets.',
    groups: [
      {
        title: 'Dashboard & sales reports',
        items: [
          'Monitor sales, orders, average order value and cancellations',
          'Analyse sales by hour, day, week or month',
          'Review sales by item, category, employee, payment method and modifier',
          'Report discounts and taxes with date filters and export-ready views',
        ],
      },
      {
        title: 'Expenses & accounting',
        items: [
          'Record and categorise cost of goods sold (COGS) and operating expenses (OPEX)',
          'Bring platform fees, payroll and staff claims into the expense ledger',
          'Review total revenue, expenses, gross profit and net profit',
          'Generate Profit & Loss, expense-breakdown and monthly-comparison reports',
        ],
      },
      {
        title: 'Contacts & audit trail',
        items: [
          'Maintain supplier contacts for purchasing and customer records for service',
          'Review inventory movement, order, shift and payment histories',
          'Use consistent records across sales, stock, expenses and finance',
        ],
      },
    ],
    callout: 'QuickServe turns transactions into a connected operational and financial record.',
  },
  {
    eyebrow: '07 / Platform administration',
    title: 'Control the business as it grows',
    intro: 'The administration workspace supports multi-vendor platform operations, commercial management and the controls needed to run QuickServe at scale.',
    groups: [
      {
        title: 'Business administration',
        items: [
          'Manage vendors, restaurants and hubs with availability and account controls',
          'Monitor platform income and operational reports',
          'Manage vendor subscriptions, plans, renewals and feature access',
          'Handle cashout records and DuitNow payment administration',
        ],
      },
      {
        title: 'Commercial tools',
        items: [
          'Create quotations and invoices with branded PDF output',
          'Operate the QuickServe shop and product catalogue',
          'Publish announcements and product updates to operators',
          'Maintain guides, setup references and sales documents',
        ],
      },
      {
        title: 'System control',
        items: [
          'Review system data and administrative records',
          'Apply role-based access and feature-level configuration',
          'Support multiple currencies, tax settings and outlet-specific preferences',
          'Use responsive web access across desktop, tablet and mobile devices',
        ],
      },
    ],
    callout: 'QuickServe can support a single outlet today and a wider operating network tomorrow.',
  },
];

const journey = [
  ['1', 'Capture', 'Counter, QR, tableside or online'],
  ['2', 'Route', 'Automatically send items to the right kitchen'],
  ['3', 'Prepare', 'Track progress on KDS or printed tickets'],
  ['4', 'Bill', 'Collect payment and issue the right documents'],
  ['5', 'Record', 'Update stock, shifts, reports and finance'],
];

const iconCards = [
  { Icon: ShoppingCart, label: 'POS & Billing' },
  { Icon: Workflow, label: 'Kitchen Routing' },
  { Icon: ChefHat, label: 'Kitchen Display' },
  { Icon: Sparkles, label: 'Auto Kitchen' },
  { Icon: QrCode, label: 'QR Ordering' },
  { Icon: Tablet, label: 'Tableside Order' },
  { Icon: Globe2, label: 'Online Shop' },
  { Icon: PackageOpen, label: 'Stock & Recipes' },
  { Icon: Users, label: 'Staff & Payroll' },
  { Icon: WalletCards, label: 'Finance' },
  { Icon: BarChart3, label: 'Reporting' },
  { Icon: ShieldCheck, label: 'Administration' },
];

export const buildQuickServeIntroductionPdf = async () => {
  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const orange: [number, number, number] = [249, 115, 22];
  const navy: [number, number, number] = [15, 23, 42];
  const slate: [number, number, number] = [71, 85, 105];
  const pale: [number, number, number] = [255, 247, 237];
  const width = 210;
  const height = 297;

  const footer = (page: number) => {
    pdf.setDrawColor(226, 232, 240);
    pdf.line(16, 282, 194, 282);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...navy);
    pdf.text('QUICKSERVE', 16, 288);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text('One connected system for modern food service', 39, 288);
    pdf.text(String(page).padStart(2, '0'), 194, 288, { align: 'right' });
  };

  const wrapped = (text: string, x: number, y: number, maxWidth: number, size: number, color = slate, style: 'normal' | 'bold' = 'normal', lineHeight = 1.28) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(text, maxWidth) as string[];
    pdf.text(lines, x, y, { lineHeightFactor: lineHeight });
    return y + lines.length * size * 0.3528 * lineHeight;
  };

  // Cover
  pdf.setFillColor(...navy);
  pdf.rect(0, 0, width, height, 'F');
  pdf.setFillColor(...orange);
  pdf.circle(181, 31, 47, 'F');
  pdf.setFillColor(30, 41, 59);
  pdf.circle(195, 126, 65, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.text('QUICK', 17, 28);
  pdf.setTextColor(...orange);
  pdf.text('SERVE', 38, 28);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(34);
  pdf.text('Run every order.', 17, 88);
  pdf.text('Connect every team.', 17, 102);
  pdf.setTextColor(253, 186, 116);
  pdf.text('Know your business.', 17, 116);
  wrapped('A complete introduction to QuickServe POS, kitchen operations, omnichannel ordering and back-office management.', 17, 135, 126, 13, [226, 232, 240], 'normal', 1.45);
  pdf.setFillColor(...orange);
  pdf.roundedRect(17, 184, 76, 12, 6, 6, 'F');
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text('QUICKSERVE PRODUCT PROFILE', 55, 191.6, { align: 'center' });
  pdf.setDrawColor(71, 85, 105);
  pdf.line(17, 252, 193, 252);
  wrapped('POS  /  KITCHEN  /  ORDERING  /  INVENTORY  /  PEOPLE  /  FINANCE', 17, 263, 176, 8, [148, 163, 184], 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  pdf.text('Prepared as an A4 product introduction', 17, 281);

  // Overview
  pdf.addPage();
  pdf.setFillColor(...pale);
  pdf.rect(0, 0, width, 65, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...orange);
  pdf.setFontSize(8);
  pdf.text('THE QUICKSERVE PLATFORM', 16, 20);
  pdf.setTextColor(...navy);
  pdf.setFontSize(25);
  pdf.text('One system. Every service moment.', 16, 36);
  wrapped('QuickServe connects front-of-house speed with kitchen execution and back-office control—without making teams repeat the same work in separate systems.', 16, 48, 174, 10, slate);
  let y = 79;
  journey.forEach(([number, title, copy]) => {
    pdf.setFillColor(...orange);
    pdf.circle(24, y - 2, 5, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    pdf.text(number, 24, y, { align: 'center' });
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...navy);
    pdf.text(title, 36, y - 1);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...slate);
    pdf.text(copy, 36, y + 4.5);
    if (number !== '5') {
      pdf.setDrawColor(253, 186, 116);
      pdf.line(24, y + 4, 24, y + 20);
    }
    y += 31;
  });
  pdf.setFillColor(...navy);
  pdf.roundedRect(16, 239, 178, 27, 3, 3, 'F');
  wrapped('Designed for restaurants, cafés, food courts, kiosks, retail-food concepts and growing multi-outlet operators.', 25, 250, 160, 11, [255, 255, 255], 'bold', 1.35);
  footer(2);

  sections.forEach((section, index) => {
    pdf.addPage();
    pdf.setFillColor(...pale);
    pdf.rect(0, 0, width, 54, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...orange);
    pdf.text(section.eyebrow.toUpperCase(), 16, 18);
    wrapped(section.title, 16, 31, 178, 21, navy, 'bold', 1.05);
    let currentY = wrapped(section.intro, 16, 67, 178, 9.5, slate, 'normal', 1.4) + 8;

    section.groups.forEach((group, groupIndex) => {
      const groupHeight = 13 + group.items.reduce((sum, item) => sum + (pdf.splitTextToSize(item, 157) as string[]).length * 4.3 + 2.2, 0) + 4;
      pdf.setFillColor(groupIndex % 2 === 0 ? 248 : 255, groupIndex % 2 === 0 ? 250 : 255, groupIndex % 2 === 0 ? 252 : 255);
      pdf.roundedRect(16, currentY - 5, 178, groupHeight, 3, 3, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...navy);
      pdf.text(group.title, 24, currentY + 3);
      currentY += 12;
      group.items.forEach(item => {
        pdf.setFillColor(...orange);
        pdf.circle(25, currentY - 1.2, 1.25, 'F');
        currentY = wrapped(item, 30, currentY, 155, 8, slate, 'normal', 1.28) + 1.3;
      });
      currentY += 7;
    });

    if (section.callout) {
      pdf.setFillColor(...navy);
      pdf.roundedRect(16, Math.min(currentY + 1, 256), 178, 17, 3, 3, 'F');
      wrapped(section.callout, 23, Math.min(currentY + 11, 266), 164, 8.5, [255, 255, 255], 'bold', 1.2);
    }
    footer(index + 3);
  });

  // Closing checklist
  pdf.addPage();
  pdf.setFillColor(...navy);
  pdf.rect(0, 0, width, 76, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(253, 186, 116);
  pdf.text('COMPLETE CAPABILITY MAP', 16, 20);
  pdf.setFontSize(25);
  pdf.setTextColor(255, 255, 255);
  pdf.text('Everything connected.', 16, 38);
  wrapped('From first tap to final report, QuickServe gives every team the tools to move faster with less duplicate work.', 16, 50, 160, 10, [203, 213, 225]);
  const checklist = [
    ['Sell', 'POS, billing, discounts, payments, receipts, refunds, shifts'],
    ['Serve', 'Tables, saved bills, QR order, tableside order, online shop'],
    ['Prepare', 'Kitchen routing, KDS, kitchen tickets, Auto Kitchen'],
    ['Control stock', 'Items, ingredients, recipes, purchasing, transfers, counts, production, valuation'],
    ['Manage people', 'Staff, roles, departments, payroll, payslips, claims, leave'],
    ['Understand money', 'Expenses, COGS/OPEX, P&L, profit, reports, reconciliation'],
    ['Grow', 'Vendors, hubs, subscriptions, quotations, invoices and platform administration'],
  ];
  y = 94;
  checklist.forEach(([title, copy]) => {
    pdf.setFillColor(...orange);
    pdf.circle(22, y - 1.5, 3, 'F');
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(0.6);
    pdf.line(20.5, y - 1.5, 21.6, y - 0.4);
    pdf.line(21.6, y - 0.4, 23.7, y - 2.9);
    pdf.setTextColor(...navy);
    pdf.setFontSize(10);
    pdf.text(title, 31, y - 0.5);
    wrapped(copy, 31, y + 5, 157, 8, slate);
    y += 24;
  });
  pdf.setFillColor(...pale);
  pdf.roundedRect(16, 252, 178, 21, 3, 3, 'F');
  wrapped('QuickServe — one connected operating system for modern food service.', 25, 264, 160, 11, orange, 'bold');
  footer(sections.length + 3);

  pdf.setProperties({
    title: 'Introducing QuickServe - Complete Product Profile',
    subject: 'QuickServe POS, kitchen operations and back-office capabilities',
    author: 'QuickServe',
    creator: 'QuickServe Admin',
  });
  return pdf;
};

const drawPdf = async () => {
  const pdf = await buildQuickServeIntroductionPdf();
  pdf.save('introducing-quickserve-complete-product-profile.pdf');
};

const QuickServeIntroductionDocument: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = async () => {
    setIsExporting(true);
    try {
      await drawPdf();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-slate-100 p-3 dark:bg-slate-950 md:p-6">
      <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-400">A4 Product Profile</p>
          <p className="mt-1 text-sm font-bold">10-page complete QuickServe introduction</p>
        </div>
        <button
          onClick={() => void exportPdf()}
          disabled={isExporting}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-600 disabled:opacity-60"
        >
          <Download size={15} /> {isExporting ? 'Creating PDF...' : 'Download A4 PDF'}
        </button>
      </div>

      <div className="mx-auto max-w-[820px] space-y-6">
        <section className="relative aspect-[210/297] min-h-[620px] overflow-hidden rounded-sm bg-slate-950 p-[7%] text-white shadow-2xl">
          <div className="absolute -right-[12%] -top-[8%] h-[32%] w-[45%] rounded-full bg-orange-500" />
          <div className="absolute -right-[18%] top-[24%] h-[42%] w-[52%] rounded-full bg-slate-800" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="text-2xl font-black tracking-tighter">QUICK<span className="text-orange-500">SERVE</span></div>
            <div className="mt-[18%] max-w-[82%] text-[clamp(2rem,6vw,4.5rem)] font-black leading-[0.95] tracking-tighter">
              Run every order.<br />Connect every team.<br /><span className="text-orange-400">Know your business.</span>
            </div>
            <p className="mt-8 max-w-xl text-base font-medium leading-relaxed text-slate-300 md:text-xl">
              A complete introduction to QuickServe POS, kitchen operations, omnichannel ordering and back-office management.
            </p>
            <div className="mt-auto border-t border-slate-700 pt-6 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 md:text-xs">
              POS / Kitchen / Ordering / Inventory / People / Finance
            </div>
          </div>
        </section>

        <section className="min-h-[720px] rounded-sm bg-orange-50 p-[7%] shadow-2xl md:min-h-[980px]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-500">The QuickServe platform</p>
          <h2 className="mt-4 text-4xl font-black tracking-tighter text-slate-900 md:text-6xl">One system. Every service moment.</h2>
          <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-slate-600 md:text-lg">
            QuickServe connects front-of-house speed with kitchen execution and back-office control—without making teams repeat the same work in separate systems.
          </p>
          <div className="mt-9 grid grid-cols-2 gap-3 md:grid-cols-3">
            {iconCards.map(({ Icon, label }) => (
              <div key={label} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                <Icon size={22} className="text-orange-500" />
                <p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-800">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-9 rounded-2xl bg-slate-900 p-6 text-white">
            <p className="text-lg font-black">Capture → Route → Prepare → Bill → Record</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">One connected journey from the first tap to stock, staff, sales and financial reporting.</p>
          </div>
        </section>

        {sections.map(section => (
          <section key={section.eyebrow} className="min-h-[720px] rounded-sm bg-white p-[7%] shadow-2xl md:min-h-[980px]">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-500">{section.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-black tracking-tighter text-slate-900 md:text-5xl">{section.title}</h2>
            <p className="mt-4 max-w-3xl text-sm font-medium leading-relaxed text-slate-600 md:text-base">{section.intro}</p>
            <div className="mt-7 space-y-4">
              {section.groups.map(group => (
                <div key={group.title} className="rounded-2xl bg-slate-50 p-5 md:p-6">
                  <h3 className="text-base font-black text-slate-900 md:text-lg">{group.title}</h3>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {group.items.map(item => (
                      <div key={item} className="flex items-start gap-2 text-xs font-medium leading-relaxed text-slate-600 md:text-sm">
                        <span className="mt-0.5 rounded-full bg-orange-500 p-0.5 text-white"><Check size={10} strokeWidth={4} /></span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {section.callout && <div className="mt-5 rounded-2xl bg-slate-900 px-6 py-5 text-sm font-black leading-relaxed text-white md:text-base">{section.callout}</div>}
          </section>
        ))}

        <section className="min-h-[720px] rounded-sm bg-slate-950 p-[7%] text-white shadow-2xl md:min-h-[980px]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">Complete capability map</p>
          <h2 className="mt-4 text-4xl font-black tracking-tighter md:text-6xl">Everything connected.</h2>
          <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-slate-300 md:text-lg">From first tap to final report, QuickServe gives every team the tools to move faster with less duplicate work.</p>
          <div className="mt-10 grid gap-3 md:grid-cols-2">
            {[
              'POS, billing, discounts, payments, receipts, refunds and shifts',
              'Tables, saved bills, QR, tableside and online ordering',
              'Kitchen routing, KDS, printed tickets and Auto Kitchen',
              'Items, recipes, purchasing, production and stock control',
              'Staff, departments, payroll, claims, leave and payslips',
              'Expenses, accounting, P&L, profit and detailed reporting',
              'Vendors, hubs, subscriptions, quotations, invoices and administration',
            ].map(item => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm font-bold leading-relaxed text-slate-200">
                <span className="rounded-full bg-orange-500 p-1 text-white"><Check size={12} strokeWidth={4} /></span>{item}
              </div>
            ))}
          </div>
          <div className="mt-12 rounded-2xl bg-orange-500 p-7">
            <Store size={28} />
            <p className="mt-4 text-2xl font-black">QuickServe</p>
            <p className="mt-1 text-sm font-bold text-orange-100">One connected operating system for modern food service.</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default QuickServeIntroductionDocument;
