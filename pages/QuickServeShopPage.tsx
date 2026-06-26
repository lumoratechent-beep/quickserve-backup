import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CreditCard, Download, Loader2, Minus, Moon, Package, Plus, Search, ShoppingBag, Sun, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ShopItem = {
  id: string;
  name: string;
  sku: string;
  description: string;
  imageUrl: string;
  price: number;
  category: string;
};

type CartLine = ShopItem & { quantity: number };

type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

type PaidInvoice = {
  id: string;
  quoteNo: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  companyName: string;
  issueDate: string;
  items: InvoiceLine[];
};

type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  company: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  notes: string;
};

interface Props {
  onBack: () => void;
  isDarkMode?: boolean;
  onToggleDark?: () => void;
}

const normalizeShopItem = (row: any): ShopItem => {
  const item = row?.item_data || row || {};
  return {
    id: String(row?.id || item.id || ''),
    name: String(row?.name || item.name || ''),
    sku: String(row?.sku || item.sku || ''),
    description: String(row?.description || item.description || ''),
    imageUrl: String(row?.image_url || item.imageUrl || item.image_url || ''),
    price: Number(row?.price ?? item.price) || 0,
    category: String(row?.category || item.category || 'QuickServe'),
  };
};

const QuickServeShopPage: React.FC<Props> = ({ onBack, isDarkMode, onToggleDark }) => {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [viewMode, setViewMode] = useState<'shop' | 'product' | 'checkout' | 'invoice'>('shop');
  const [selectedProduct, setSelectedProduct] = useState<ShopItem | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [paidInvoice, setPaidInvoice] = useState<PaidInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [customer, setCustomer] = useState<CustomerForm>({
    name: '',
    email: '',
    phone: '',
    company: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postcode: '',
    country: 'Malaysia',
    notes: '',
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shopStatus = params.get('shop');
    const sessionId = params.get('checkout_session_id');

    if (shopStatus === 'success' && sessionId) {
      setMessage({ type: 'info', text: 'Payment received. Finalizing your order...' });
      fetch('/api/stripe/confirm-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutSessionId: sessionId }),
      })
        .then(async response => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Unable to confirm payment.');
          setCart([]);
          if (data.invoice) {
            setPaidInvoice(data.invoice);
            setViewMode('invoice');
          }
          setMessage({ type: 'success', text: 'Payment successful. Your invoice is ready. We will contact you shortly.' });
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch((error: any) => {
          setMessage({ type: 'error', text: error?.message || 'Payment was received, but order confirmation needs support review.' });
        });
    } else if (shopStatus === 'cancelled') {
      setMessage({ type: 'error', text: 'Checkout was cancelled. Your cart is still here when you are ready.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const loadItems = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('admin_sold_items')
          .select('id, name, sku, description, price, category, is_active, image_url, item_data')
          .eq('is_active', true)
          .order('updated_at', { ascending: false });
        if (error) throw error;
        setItems((data || []).map(normalizeShopItem).filter(item => item.id && item.name && item.price > 0));
      } catch (error: any) {
        setMessage({ type: 'error', text: error?.message || 'Unable to load shop products.' });
      } finally {
        setLoading(false);
      }
    };

    loadItems();
  }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(items.map(item => item.category).filter(Boolean))).sort()], [items]);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter(item => {
      if (category !== 'All' && item.category !== category) return false;
      if (!normalized) return true;
      return [item.name, item.sku, item.description, item.category]
        .some(value => value.toLowerCase().includes(normalized));
    });
  }, [category, items, query]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const fullAddress = [
    customer.addressLine1,
    customer.addressLine2,
    [customer.postcode, customer.city].filter(Boolean).join(' '),
    customer.state,
    customer.country,
  ].map(part => part.trim()).filter(Boolean).join('\n');
  const canCheckout = cart.length > 0
    && customer.name.trim()
    && customer.email.trim()
    && customer.phone.trim()
    && customer.addressLine1.trim()
    && customer.city.trim()
    && customer.state.trim()
    && customer.postcode.trim();
  const invoiceTotal = paidInvoice?.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0) || 0;

  const getInvoiceLineName = (description: string) => description.split('\n').filter(Boolean)[0] || 'QuickServe item';

  const openProduct = (item: ShopItem) => {
    setSelectedProduct(item);
    setSelectedQuantity(1);
    setViewMode('product');
  };

  const addQuantityToCart = (item: ShopItem, quantity = 1) => {
    const cleanQuantity = Math.max(1, Math.min(99, Math.floor(Number(quantity) || 1)));
    setCart(prev => {
      const existing = prev.find(line => line.id === item.id);
      if (existing) {
        return prev.map(line => line.id === item.id ? { ...line, quantity: line.quantity + cleanQuantity } : line);
      }
      return [...prev, { ...item, quantity: cleanQuantity }];
    });
  };

  const downloadInvoicePdf = async () => {
    if (!paidInvoice) return;
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const right = pageWidth - 16;
    const invoiceNo = paidInvoice.quoteNo.replace('QS-SHOP', 'INV');
    const issued = paidInvoice.issueDate || new Date().toISOString().split('T')[0];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('QuickServe', 16, 20);
    doc.setFontSize(24);
    doc.text('Invoice', right, 20, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('System generated invoice', right, 27, { align: 'right' });
    doc.text(`Invoice number: ${invoiceNo}`, right, 34, { align: 'right' });
    doc.text(`Paid on: ${issued}`, right, 39, { align: 'right' });

    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Amount paid', 16, 48);
    doc.setFontSize(22);
    doc.text(`RM ${invoiceTotal.toFixed(2)}`, 16, 58);

    doc.setFontSize(10);
    doc.text('Bill to', 16, 76);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const billToLines = [
      paidInvoice.companyName,
      paidInvoice.customerName,
      ...String(paidInvoice.customerAddress || '').split('\n'),
      paidInvoice.customerEmail,
      paidInvoice.customerPhone,
    ].filter(Boolean);
    billToLines.forEach((line, index) => doc.text(String(line), 16, 83 + index * 5));

    let y = Math.max(112, 88 + billToLines.length * 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setDrawColor(220);
    doc.line(16, y - 6, right, y - 6);
    doc.text('Description', 16, y);
    doc.text('Qty', 125, y, { align: 'right' });
    doc.text('Unit price', 158, y, { align: 'right' });
    doc.text('Amount', right, y, { align: 'right' });
    doc.line(16, y + 4, right, y + 4);
    y += 13;

    doc.setFont('helvetica', 'normal');
    paidInvoice.items.forEach(item => {
      const amount = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
      const nameLines = doc.splitTextToSize(getInvoiceLineName(item.description), 82);
      if (y + nameLines.length * 5 > 260) {
        doc.addPage();
        y = 20;
      }
      doc.text(nameLines, 16, y);
      doc.text(String(item.quantity), 125, y, { align: 'right' });
      doc.text(`RM ${Number(item.unitPrice || 0).toFixed(2)}`, 158, y, { align: 'right' });
      doc.text(`RM ${amount.toFixed(2)}`, right, y, { align: 'right' });
      y += Math.max(10, nameLines.length * 5 + 5);
    });

    doc.line(120, y, right, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('Total paid', 140, y);
    doc.text(`RM ${invoiceTotal.toFixed(2)}`, right, y, { align: 'right' });

    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text('Remark: We will contact you shortly to arrange fulfilment and next steps.', 16, y);
    doc.text('Thank you for your purchase.', 16, y + 6);

    doc.save(`${invoiceNo}.pdf`);
  };

  const addToCart = (item: ShopItem) => {
    addQuantityToCart(item);
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev
      .map(line => line.id === itemId ? { ...line, quantity: line.quantity + delta } : line)
      .filter(line => line.quantity > 0));
  };

  const checkout = async () => {
    if (!canCheckout) return;
    setCheckoutLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'admin_shop',
          items: cart.map(item => ({ id: item.id, quantity: item.quantity })),
          customer: {
            ...customer,
            address: fullAddress,
            addressDetails: {
              addressLine1: customer.addressLine1.trim(),
              addressLine2: customer.addressLine2.trim(),
              city: customer.city.trim(),
              state: customer.state.trim(),
              postcode: customer.postcode.trim(),
              country: customer.country.trim(),
            },
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to start checkout.');
      window.location.href = data.url;
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Unable to start checkout.' });
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/90">
        <div className="flex w-full items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button onClick={viewMode === 'checkout' || viewMode === 'product' ? () => setViewMode('shop') : onBack} className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-orange-300 hover:text-orange-500 dark:border-gray-700 dark:text-gray-300">
            <ArrowLeft size={18} />
          </button>
          <img src="/LOGO/9.png" alt="QuickServe" className="h-8 dark:hidden" />
          <img src="/LOGO/9-dark.png" alt="QuickServe" className="hidden h-8 dark:block" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">Shop</p>
            <h1 className="truncate text-sm font-black uppercase tracking-tight">{viewMode === 'invoice' ? 'Invoice' : viewMode === 'checkout' ? 'Checkout' : viewMode === 'product' ? 'Product Details' : 'QuickServe Products'}</h1>
          </div>
          <button onClick={onToggleDark} className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition hover:text-orange-500 dark:bg-gray-800 dark:text-gray-300">
            {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      {viewMode === 'shop' ? (
      <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-3">
              <h2 className="text-sm font-black uppercase tracking-tight text-gray-700 dark:text-gray-200">Categories</h2>
              <div className="space-y-1">
                {categories.map(name => (
                  <button
                    key={name}
                    onClick={() => setCategory(name)}
                    className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm font-bold transition ${
                      category === name
                        ? 'text-orange-500'
                        : 'text-gray-500 hover:text-orange-500 dark:text-gray-400 dark:hover:text-orange-300'
                    }`}
                  >
                    {name === 'All' ? 'All Products' : name}
                  </button>
                ))}
              </div>
            </div>
          </aside>

        <section className="min-w-0 space-y-5">
          {message && (
            <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${
              message.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300'
                : message.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300'
                  : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300'
            }`}>
              {message.text}
            </div>
          )}

          <div className="space-y-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search products"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm font-bold outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {categories.map(name => (
                <button
                  key={name}
                  onClick={() => setCategory(name)}
                  className={`h-10 shrink-0 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest transition ${
                    category === name
                      ? 'bg-orange-500 text-white'
                      : 'border border-gray-200 bg-white text-gray-500 hover:border-orange-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                  }`}
                >
                  {name === 'All' ? 'All Products' : name}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center">
              <Loader2 size={34} className="animate-spin text-orange-500" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center dark:border-gray-700 dark:bg-gray-900">
              <Package size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-black uppercase tracking-widest text-gray-400">No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredItems.map(item => (
                <article
                  key={item.id}
                  onClick={() => openProduct(item)}
                  className="flex min-h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-700 dark:bg-gray-900"
                >
                  <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-800">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package size={42} className="text-gray-300 dark:text-gray-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3 sm:p-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-orange-500">{item.category}</p>
                      <h2 className="mt-1 line-clamp-2 text-sm font-black leading-tight sm:text-base">{item.name}</h2>
                      {item.description && <p className="mt-2 line-clamp-2 text-[11px] font-medium leading-relaxed text-gray-500 sm:line-clamp-3 sm:text-xs dark:text-gray-400">{item.description}</p>}
                    </div>
                    <p className="mt-auto pt-4 text-base font-black text-gray-900 sm:text-lg dark:text-white">RM {item.price.toFixed(2)}</p>
                  </div>
                  <button
                    onClick={event => {
                      event.stopPropagation();
                      addToCart(item);
                    }}
                    className="flex h-12 w-full items-center justify-center gap-2 border-t border-gray-100 bg-gray-900 text-[11px] font-black uppercase tracking-widest text-white transition hover:bg-orange-500 dark:border-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-orange-500 dark:hover:text-white"
                  >
                    <Plus size={14} /> Add
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
        </div>
      </main>
      ) : viewMode === 'product' && selectedProduct ? (
      <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm font-bold text-gray-500 dark:text-gray-400">
          <button onClick={() => setViewMode('shop')} className="text-orange-500 hover:text-orange-600">All Products</button>
          <span>/</span>
          <span className="text-gray-700 dark:text-gray-200">{selectedProduct.name}</span>
        </div>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_460px] xl:grid-cols-[minmax(0,1.35fr)_520px]">
          <div className="min-w-0">
            <div className="overflow-hidden rounded-2xl bg-white dark:bg-gray-900">
              <div className="aspect-[16/10] bg-gray-100 dark:bg-gray-800">
                {selectedProduct.imageUrl ? (
                  <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package size={80} className="text-gray-300 dark:text-gray-600" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="min-w-0 space-y-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">{selectedProduct.category}</p>
              <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-gray-900 dark:text-white lg:text-4xl">{selectedProduct.name}</h2>
              <p className="mt-5 text-3xl font-black text-gray-900 dark:text-white">RM {selectedProduct.price.toFixed(2)}</p>
            </div>

            <div className="flex w-fit overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              <button onClick={() => setSelectedQuantity(prev => Math.max(1, prev - 1))} className="flex h-12 w-14 items-center justify-center text-gray-500 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800">
                <Minus size={16} />
              </button>
              <div className="flex h-12 w-14 items-center justify-center border-x border-gray-200 text-sm font-black dark:border-gray-700">{selectedQuantity}</div>
              <button onClick={() => setSelectedQuantity(prev => Math.min(99, prev + 1))} className="flex h-12 w-14 items-center justify-center text-gray-500 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800">
                <Plus size={16} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => addQuantityToCart(selectedProduct, selectedQuantity)}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 text-sm font-black text-white transition hover:bg-orange-500 dark:bg-white dark:text-gray-900 dark:hover:bg-orange-500 dark:hover:text-white"
              >
                <ShoppingBag size={17} /> Add to cart
              </button>
              <button
                onClick={() => {
                  addQuantityToCart(selectedProduct, selectedQuantity);
                  setViewMode('checkout');
                }}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-300 px-5 text-sm font-black text-gray-700 transition hover:border-orange-300 hover:text-orange-500 dark:border-gray-700 dark:text-gray-200"
              >
                <CreditCard size={17} /> Buy now
              </button>
            </div>

            {selectedProduct.description && (
              <div className="border-t border-gray-200 pt-5 dark:border-gray-800">
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">Description</h3>
                <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-relaxed text-gray-600 dark:text-gray-300">{selectedProduct.description}</p>
              </div>
            )}

            <div className="border-t border-gray-200 pt-5 text-sm font-semibold leading-relaxed text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <p className="font-black text-gray-700 dark:text-gray-200">Terms and Conditions</p>
              <p className="mt-2">Payment is processed securely via Stripe Checkout.</p>
              <p>We will contact you shortly after payment to arrange fulfilment and next steps.</p>
            </div>
          </aside>
        </section>
      </main>
      ) : viewMode === 'invoice' && paidInvoice ? (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-100 p-6 dark:border-gray-800">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300">
                  <CheckCircle2 size={26} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-green-600 dark:text-green-300">Payment Successful</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">RM {invoiceTotal.toFixed(2)} paid</h2>
                <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-gray-500 dark:text-gray-400">
                  Your system generated invoice is ready. We will contact you shortly to arrange fulfilment and next steps.
                </p>
              </div>
              <button onClick={downloadInvoicePdf} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-500 dark:bg-white dark:text-gray-900 dark:hover:bg-orange-500 dark:hover:text-white">
                <Download size={15} /> Download Invoice
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-8 grid gap-5 md:grid-cols-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Invoice Number</p>
                <p className="mt-1 text-sm font-black">{paidInvoice.quoteNo.replace('QS-SHOP', 'INV')}</p>
              </div>
              <div className="md:text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Paid Date</p>
                <p className="mt-1 text-sm font-black">{paidInvoice.issueDate || new Date().toISOString().split('T')[0]}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Bill To</p>
                <div className="mt-2 text-sm font-semibold leading-relaxed text-gray-600 dark:text-gray-300">
                  {paidInvoice.companyName && <p>{paidInvoice.companyName}</p>}
                  <p>{paidInvoice.customerName}</p>
                  {paidInvoice.customerAddress && String(paidInvoice.customerAddress).split('\n').filter(Boolean).map(line => <p key={line}>{line}</p>)}
                  <p>{paidInvoice.customerEmail}</p>
                  <p>{paidInvoice.customerPhone}</p>
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-950">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Remark</p>
                <p className="mt-2 text-sm font-bold text-gray-700 dark:text-gray-200">We will contact you shortly.</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-[minmax(0,1fr)_70px_110px] gap-3 bg-gray-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:bg-gray-950">
                <span>Product</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Amount</span>
              </div>
              {paidInvoice.items.map(item => {
                const amount = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                return (
                  <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_70px_110px] gap-3 border-t border-gray-100 px-4 py-4 text-sm dark:border-gray-800">
                    <div className="min-w-0">
                      <p className="font-black">{getInvoiceLineName(item.description)}</p>
                      <p className="mt-1 text-[11px] font-bold text-gray-400">RM {Number(item.unitPrice || 0).toFixed(2)} each</p>
                    </div>
                    <p className="text-right font-bold text-gray-500 dark:text-gray-300">{item.quantity}</p>
                    <p className="text-right font-black">RM {amount.toFixed(2)}</p>
                  </div>
                );
              })}
              <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-950">
                <div className="flex w-full max-w-xs items-center justify-between">
                  <span className="text-sm font-black uppercase tracking-widest text-gray-400">Total Paid</span>
                  <span className="text-xl font-black">RM {invoiceTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button onClick={downloadInvoicePdf} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-600">
                <Download size={15} /> Download Invoice
              </button>
              <button onClick={() => setViewMode('shop')} className="h-11 flex-1 rounded-xl border border-gray-200 text-xs font-black uppercase tracking-widest text-gray-500 transition hover:border-orange-300 hover:text-orange-500 dark:border-gray-700 dark:text-gray-300">
                Continue Shopping
              </button>
            </div>
          </div>
        </section>
      </main>
      ) : (
      <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-gray-800">
              <div>
                <h2 className="text-sm font-black uppercase tracking-tight">Checkout</h2>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{cartQuantity} items in cart</p>
              </div>
              <button onClick={() => setViewMode('shop')} className="rounded-xl border border-gray-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 transition hover:border-orange-300 hover:text-orange-500 dark:border-gray-700 dark:text-gray-300">
                Continue Shopping
              </button>
            </div>

            <div className="space-y-3 p-5">
              {cart.length === 0 ? (
                <div className="py-14 text-center">
                  <ShoppingBag size={38} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm font-black uppercase tracking-widest text-gray-400">Cart is empty</p>
                  <button onClick={() => setViewMode('shop')} className="mt-5 rounded-xl bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-600">
                    Browse Products
                  </button>
                </div>
              ) : cart.map(item => (
                <div key={item.id} className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-800">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" /> : <Package size={24} className="m-5 text-gray-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">{item.name}</p>
                    <p className="mt-1 text-[11px] font-bold text-gray-400">RM {item.price.toFixed(2)} each</p>
                    <div className="mt-2 flex items-center gap-1">
                      <button onClick={() => updateQuantity(item.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-500 dark:bg-gray-800"><Minus size={13} /></button>
                      <span className="w-9 text-center text-xs font-black">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-500 dark:bg-gray-800"><Plus size={13} /></button>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end justify-between">
                    <button onClick={() => updateQuantity(item.id, -item.quantity)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                      <Trash2 size={14} />
                    </button>
                    <p className="text-sm font-black text-orange-500">RM {(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight">Customer Details</h3>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Required before Stripe payment</p>
              </div>
              <input value={customer.name} onChange={event => setCustomer(prev => ({ ...prev, name: event.target.value }))} placeholder="Full name *" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
              <input value={customer.email} onChange={event => setCustomer(prev => ({ ...prev, email: event.target.value }))} placeholder="Email *" type="email" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
              <input value={customer.phone} onChange={event => setCustomer(prev => ({ ...prev, phone: event.target.value }))} placeholder="Phone *" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
              <input value={customer.company} onChange={event => setCustomer(prev => ({ ...prev, company: event.target.value }))} placeholder="Company" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
              <input value={customer.addressLine1} onChange={event => setCustomer(prev => ({ ...prev, addressLine1: event.target.value }))} placeholder="Address line 1 *" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
              <input value={customer.addressLine2} onChange={event => setCustomer(prev => ({ ...prev, addressLine2: event.target.value }))} placeholder="Address line 2" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
              <div className="grid grid-cols-2 gap-2">
                <input value={customer.postcode} onChange={event => setCustomer(prev => ({ ...prev, postcode: event.target.value }))} placeholder="Postcode *" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
                <input value={customer.city} onChange={event => setCustomer(prev => ({ ...prev, city: event.target.value }))} placeholder="City *" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={customer.state} onChange={event => setCustomer(prev => ({ ...prev, state: event.target.value }))} placeholder="State *" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
                <input value={customer.country} onChange={event => setCustomer(prev => ({ ...prev, country: event.target.value }))} placeholder="Country" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
              </div>
              <textarea value={customer.notes} onChange={event => setCustomer(prev => ({ ...prev, notes: event.target.value }))} placeholder="Notes" rows={3} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
            </div>

            <div className="mt-5 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <div className="flex items-center justify-between text-sm">
                <span className="font-black uppercase tracking-widest text-gray-400">Total</span>
                <span className="text-xl font-black">RM {subtotal.toFixed(2)}</span>
              </div>
              <button
                onClick={checkout}
                disabled={!canCheckout || checkoutLoading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checkoutLoading ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                Stripe Checkout
              </button>
            </div>
          </aside>
        </div>
      </main>
      )}

      {viewMode === 'shop' && cartQuantity > 0 && (
        <button
          onClick={() => setViewMode('checkout')}
          className="fixed bottom-5 right-5 z-40 flex h-16 items-center gap-3 rounded-full bg-orange-500 pl-5 pr-6 text-white shadow-2xl shadow-orange-500/30 transition active:scale-95"
        >
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <ShoppingBag size={21} />
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black shadow-lg">{cartQuantity}</span>
          </span>
          <span className="text-left">
            <span className="block text-[9px] font-black uppercase tracking-widest text-white/80">Cart</span>
            <span className="block text-sm font-black">RM {subtotal.toFixed(2)}</span>
          </span>
        </button>
      )}

      {message?.type === 'success' && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-green-200 bg-white px-4 py-2 text-xs font-black text-green-700 shadow-xl dark:border-green-900/40 dark:bg-gray-900 dark:text-green-300">
          <CheckCircle2 size={16} /> Paid order received
        </div>
      )}
    </div>
  );
};

export default QuickServeShopPage;
