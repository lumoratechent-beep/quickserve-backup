import React from 'react';
import { BookOpen, CheckCircle2, ClipboardList, CreditCard, HelpCircle, Monitor, Printer, QrCode, ReceiptText, Settings, ShoppingBag, Users } from 'lucide-react';
import PublicNavbar from '../components/PublicNavbar';

interface Props {
  onHome: () => void;
  onHomeSection: (sectionId: string) => void;
  onShop: () => void;
  onCompany: () => void;
  onLogin: () => void;
  isDarkMode?: boolean;
  onToggleDark?: () => void;
}

type GuideSection = {
  id: string;
  title: string;
  eyebrow: string;
  icon: React.ReactNode;
  summary: string;
  steps: string[];
  tips?: string[];
};

const guideSections: GuideSection[] = [
  {
    id: 'overview',
    title: 'QuickServe Overview',
    eyebrow: 'Start here',
    icon: <BookOpen size={18} />,
    summary: 'QuickServe connects counter ordering, QR ordering, kitchen flow, staff access, reporting, billing, and online selling in one restaurant platform.',
    steps: [
      'Use the public pages to register, compare plans, log in, visit the shop, or read this guide.',
      'After login, vendors usually land in the POS workspace for live orders and billing.',
      'Back Office is where owners and managers maintain menus, tables, reports, staff, billing, and business settings.',
    ],
    tips: ['Use the same account across devices so orders, menus, and settings stay synchronized.'],
  },
  {
    id: 'setup',
    title: 'First-Time Setup',
    eyebrow: 'Go live',
    icon: <CheckCircle2 size={18} />,
    summary: 'A clean setup keeps daily service smooth. Complete the core business, menu, table, and printer settings before your first service session.',
    steps: [
      'Create your QuickServe account from the registration page and choose the plan that matches your operation.',
      'Open Back Office and review business details such as restaurant name, currency, taxes, receipt information, and service settings.',
      'Add categories and menu items with names, prices, photos, options, add-ons, and availability.',
      'Create dine-in areas and table numbers if you use QR ordering or table service.',
      'Test one order from POS, one QR order, and one receipt print before serving real customers.',
    ],
    tips: ['Keep one admin or owner account separate from cashier accounts so permissions remain easy to manage.'],
  },
  {
    id: 'pos',
    title: 'POS And Counter Orders',
    eyebrow: 'Daily sales',
    icon: <Monitor size={18} />,
    summary: 'The POS screen is built for fast counter service, takeaway orders, dine-in billing, item edits, discounts, and payment capture.',
    steps: [
      'Select items from the menu grid, then adjust quantities, options, add-ons, discounts, or notes where needed.',
      'Choose the order type, table, customer, or dining mode depending on your workflow.',
      'Review the cart total before payment and select the payment method used by the customer.',
      'Print or preview the receipt after payment, then clear the cart for the next customer.',
      'Use saved bills or open orders when an order needs to stay active before final payment.',
    ],
    tips: ['During busy service, keep the menu categories clean and hide unavailable items to reduce cashier mistakes.'],
  },
  {
    id: 'qr-orders',
    title: 'QR Ordering',
    eyebrow: 'Guest ordering',
    icon: <QrCode size={18} />,
    summary: 'QR ordering lets guests scan a table code, browse the menu, customize items, and send orders directly to your team.',
    steps: [
      'Enable QR ordering in your feature or order settings if your plan supports it.',
      'Create areas and tables, then generate or print the QR codes for each table.',
      'Ask guests to scan the table QR code and place their order from their own phone.',
      'Monitor new QR orders inside the POS order list and send accepted items to kitchen preparation.',
      'Close the table bill when the guest is ready to pay.',
    ],
    tips: ['Place QR codes where guests can scan without staff assistance, and label each one with the matching table number.'],
  },
  {
    id: 'kitchen',
    title: 'Kitchen Display',
    eyebrow: 'Preparation flow',
    icon: <ClipboardList size={18} />,
    summary: 'Kitchen display keeps incoming items visible by status so your team can prepare, complete, and track orders without paper confusion.',
    steps: [
      'Open the kitchen or order management view on a tablet, laptop, or kitchen screen.',
      'Use kitchen departments when different stations handle different item groups.',
      'Mark items or orders as preparing, ready, or completed as work moves through the kitchen.',
      'Keep kitchen devices online during service so orders appear quickly across stations.',
    ],
    tips: ['If you run multiple preparation stations, group menu categories by department before opening service.'],
  },
  {
    id: 'menu',
    title: 'Menu Management',
    eyebrow: 'Products',
    icon: <ReceiptText size={18} />,
    summary: 'Menu management controls what cashiers, staff, QR guests, and online shop customers can see or sell.',
    steps: [
      'Add every sellable item with a clear category, price, image, and description.',
      'Use item options for required choices such as size, spice level, toppings, or preparation style.',
      'Use add-ons for optional extras that affect the item price.',
      'Archive, hide, or mark unavailable items instead of deleting records you may need for reports.',
      'Review online visibility settings if an item should appear in the online shop.',
    ],
    tips: ['Use short item names for cashier speed and richer descriptions for customer-facing channels.'],
  },
  {
    id: 'printing',
    title: 'Receipt And Kitchen Printing',
    eyebrow: 'Hardware',
    icon: <Printer size={18} />,
    summary: 'QuickServe supports browser-based printing flows and printer settings for receipt and preparation workflows.',
    steps: [
      'Open Printer Settings from POS or Back Office and choose the printer connection method used by your device.',
      'Configure receipt content such as business name, address, footer notes, and order details.',
      'Run a test print before service and confirm paper size, alignment, and cut behavior.',
      'For kitchen printing, confirm that categories or departments are routed to the correct printer.',
      'Use the built-in help inside Printer Settings for LAN, Android, or supported device setup notes.',
    ],
    tips: ['Keep one backup device logged in during peak hours if receipt printing is business critical.'],
  },
  {
    id: 'online-shop',
    title: 'Online Shop',
    eyebrow: 'Sell online',
    icon: <ShoppingBag size={18} />,
    summary: 'Online shop tools let customers order from a shareable link while admin shop products can be sold through the public QuickServe shop.',
    steps: [
      'Enable online shop features from settings when available on your plan.',
      'Choose which menu items or products should be visible online.',
      'Share the shop link with customers for pickup, delivery, or external ordering workflows.',
      'Review incoming online orders inside POS so staff can accept, prepare, and complete them.',
      'Use the QuickServe Shop page for QuickServe products, add-ons, hardware, services, or paid setup packages.',
    ],
    tips: ['Check product photos and descriptions on a phone before sharing the shop link publicly.'],
  },
  {
    id: 'reports',
    title: 'Reports And Finance',
    eyebrow: 'Business view',
    icon: <CreditCard size={18} />,
    summary: 'Reports help you review sales, payment types, sold items, cashier activity, expenses, and operational performance.',
    steps: [
      'Open Back Office reports to review sales by date range, item, category, or payment method.',
      'Use standard reports when you need a printable or shareable business summary.',
      'Record expenses so profit views are more useful than sales totals alone.',
      'Review cashier shifts and payment summaries at the end of each service day.',
      'Export or save records when your accountant or owner needs supporting documents.',
    ],
    tips: ['Close shifts consistently so cash variance and payment totals stay easy to audit.'],
  },
  {
    id: 'staff',
    title: 'Staff And Permissions',
    eyebrow: 'Team access',
    icon: <Users size={18} />,
    summary: 'Staff management lets owners separate daily cashier access from manager, kitchen, order taker, and back-office responsibilities.',
    steps: [
      'Create staff profiles and assign the correct role for each person.',
      'Give managers only the settings and reports they need for their job.',
      'Use cashier shift records to track who opened, closed, and handled payments.',
      'Update or deactivate staff access quickly when responsibilities change.',
      'Use HR and payroll tools where available to keep employee records connected to operations.',
    ],
    tips: ['Avoid sharing one login across the whole team; individual accounts create cleaner audit trails.'],
  },
  {
    id: 'billing',
    title: 'Plans And Billing',
    eyebrow: 'Subscription',
    icon: <Settings size={18} />,
    summary: 'Billing tools manage your subscription, plan upgrades, wallet activity, add-ons, and payment records.',
    steps: [
      'Open Billing from the POS or Back Office workspace.',
      'Compare available plans when you need QR ordering, kitchen features, online shop, staff tools, or higher limits.',
      'Use the upgrade flow to change plans and confirm the payment status after checkout.',
      'Review wallet and billing records for top-ups, renewals, and subscription history.',
      'Contact support if a paid feature does not appear after checkout confirmation.',
    ],
    tips: ['After any plan change, refresh the app on all active devices so feature access updates everywhere.'],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    eyebrow: 'Fixes',
    icon: <HelpCircle size={18} />,
    summary: 'Most issues come from connectivity, device permissions, browser cache, payment redirects, or printer connection state.',
    steps: [
      'If orders do not sync, check internet status and refresh the affected device.',
      'If a QR code opens the wrong table, regenerate or reprint the correct table QR code.',
      'If printing fails, run a test print and confirm the printer, paper, connection, and browser permissions.',
      'If checkout succeeds but access does not update, wait briefly, refresh, and then contact support with the payment reference.',
      'If a user cannot access a screen, review their staff role and subscription feature access.',
    ],
    tips: ['Before service, test login, order entry, QR ordering, and printing on the devices you will actually use.'],
  },
];

const HelpTutorialPage: React.FC<Props> = ({ onHome, onHomeSection, onShop, onCompany, onLogin, isDarkMode, onToggleDark }) => {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
      <PublicNavbar
        activePage="help"
        isDarkMode={isDarkMode}
        onToggleDark={onToggleDark}
        onLogin={onLogin}
        onHome={onHome}
        onHomeSection={onHomeSection}
        onShop={onShop}
        onHelp={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        onCompany={onCompany}
      />

      <main className="mx-auto grid w-full max-w-7xl gap-8 px-4 pb-16 pt-28 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:pt-32">
        <aside className="lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)] lg:overflow-y-auto">
          <div className="mb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-500">QuickServe Help</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Tutorial Guide</h1>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-gray-500 dark:text-gray-400">
              Use the chapters to learn setup, daily ordering, printing, reporting, online sales, and team access.
            </p>
          </div>

          <nav className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            {guideSections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-[10px] font-black uppercase tracking-widest text-gray-500 transition hover:border-orange-300 hover:text-orange-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 lg:w-full lg:border-transparent lg:bg-transparent lg:text-left"
              >
                <span className="text-orange-500">{section.icon}</span>
                {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-7">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-500">Complete documentation</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">How to use QuickServe</h2>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-relaxed text-gray-600 dark:text-gray-300 sm:text-base">
              This guide is written for owners, managers, cashiers, order takers, and kitchen teams. Start with setup, then follow the chapters that match your day-to-day workflow.
            </p>
          </div>

          {guideSections.map((section) => (
            <article key={section.id} id={section.id} className="scroll-mt-28 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-orange-500">
                    {section.icon}
                    <p className="text-[10px] font-black uppercase tracking-[0.22em]">{section.eyebrow}</p>
                  </div>
                  <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{section.title}</h2>
                  <p className="mt-3 text-sm font-semibold leading-relaxed text-gray-600 dark:text-gray-300">{section.summary}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="space-y-3">
                  {section.steps.map((step, index) => (
                    <div key={step} className="flex gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-950">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-black text-white">{index + 1}</span>
                      <p className="pt-1 text-sm font-semibold leading-relaxed text-gray-700 dark:text-gray-200">{step}</p>
                    </div>
                  ))}
                </div>

                {section.tips && (
                  <div className="h-fit rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-500/20 dark:bg-orange-500/10">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600 dark:text-orange-300">Tip</p>
                    {section.tips.map((tip) => (
                      <p key={tip} className="mt-2 text-sm font-bold leading-relaxed text-orange-900 dark:text-orange-100">{tip}</p>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
};

export default HelpTutorialPage;
