// components/WalletTab.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { Restaurant, Subscription } from '../src/types';
import { toast } from './Toast';
import { supabase } from '../lib/supabase';
import {
  Wallet, RotateCw, Send, Building2, ChevronDown, Edit3, CheckCircle,
  X, Banknote, Receipt, ArrowUpRight, ArrowDownRight, PlusCircle, CreditCard, QrCode, Plus,
  Search, ChevronLeft, ChevronRight, ChevronFirst, ChevronLast
} from 'lucide-react';

const MALAYSIA_BANKS = [
  { name: 'Maybank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Maybank_logo.svg/200px-Maybank_logo.svg.png' },
  { name: 'CIMB Bank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/CIMB_logo.svg/200px-CIMB_logo.svg.png' },
  { name: 'Public Bank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Public_Bank_logo.svg/200px-Public_Bank_logo.svg.png' },
  { name: 'RHB Bank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/RHB_Bank_logo.svg/200px-RHB_Bank_logo.svg.png' },
  { name: 'Hong Leong Bank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Hong_Leong_Bank_logo.svg/200px-Hong_Leong_Bank_logo.svg.png' },
  { name: 'AmBank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/AmBank_logo.svg/200px-AmBank_logo.svg.png' },
  { name: 'Bank Islam Malaysia', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Bank_Islam_Malaysia_logo.svg/200px-Bank_Islam_Malaysia_logo.svg.png' },
  { name: 'Bank Rakyat', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Bank_Rakyat_Malaysia_logo.svg/200px-Bank_Rakyat_Malaysia_logo.svg.png' },
  { name: 'Bank Simpanan Nasional', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/BSN_logo.svg/200px-BSN_logo.svg.png' },
  { name: 'OCBC Bank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/OCBC_Bank_logo.svg/200px-OCBC_Bank_logo.svg.png' },
];

const CURRENCY_OPTIONS = [
  { code: 'MYR', symbol: 'RM', label: 'Ringgit Malaysia (RM)' },
  { code: 'USD', symbol: '$', label: 'US Dollar ($)' },
  { code: 'EUR', symbol: '€', label: 'Euro (€)' },
  { code: 'GBP', symbol: '£', label: 'British Pound (£)' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar (S$)' },
  { code: 'IDR', symbol: 'Rp', label: 'Indonesian Rupiah (Rp)' },
  { code: 'THB', symbol: '฿', label: 'Thai Baht (฿)' },
  { code: 'PHP', symbol: '₱', label: 'Philippine Peso (₱)' },
  { code: 'VND', symbol: '₫', label: 'Vietnamese Dong (₫)' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen (¥)' },
  { code: 'KRW', symbol: '₩', label: 'Korean Won (₩)' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee (₹)' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar (A$)' },
  { code: 'CNY', symbol: '¥', label: 'Chinese Yuan (¥)' },
  { code: 'TWD', symbol: 'NT$', label: 'Taiwan Dollar (NT$)' },
  { code: 'BND', symbol: 'B$', label: 'Brunei Dollar (B$)' },
];

interface Props {
  restaurant: Restaurant;
  subscription?: Subscription | null;
}

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  type: string;
}

const DEFAULT_QR_SRC = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent('https://www.duitnow.my/qr/quickserve-wallet')}`;

const WalletTab: React.FC<Props> = ({ restaurant, subscription }) => {
  // Wallet state
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletPendingCashout, setWalletPendingCashout] = useState<number>(0);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [cashoutRequests, setCashoutRequests] = useState<any[]>([]);
  const [bankDetails, setBankDetails] = useState<{ bankName: string; accountHolderName: string; accountNumber: string } | null>(null);
  const [bankFormData, setBankFormData] = useState({ bankName: '', accountHolderName: '', accountNumber: '' });
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);
  const [showBankSection, setShowBankSection] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState('');
  const [cashoutNotes, setCashoutNotes] = useState('');
  const [isRequestingCashout, setIsRequestingCashout] = useState(false);
  const [showCashoutForm, setShowCashoutForm] = useState(false);
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState<'card' | 'qr'>('card');
  const [depositReference, setDepositReference] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [paymentQrImageUrl, setPaymentQrImageUrl] = useState<string | null>(null);
  const [walletSearchQuery, setWalletSearchQuery] = useState('');
  const [walletStatusFilter, setWalletStatusFilter] = useState('ALL');
  const [walletTypeFilter, setWalletTypeFilter] = useState('ALL');
  const [walletMethodFilter, setWalletMethodFilter] = useState('ALL');
  const [walletEntriesPerPage, setWalletEntriesPerPage] = useState(30);
  const [walletCurrentPage, setWalletCurrentPage] = useState(1);

  // Currency setup
  const userCurrency = restaurant.settings?.currency || localStorage.getItem(`ux_currency_${restaurant.id}`) || 'MYR';
  const currencySymbol = CURRENCY_OPTIONS.find(c => c.code === userCurrency)?.symbol || 'RM';

  // Fetch wallet data on mount
  useEffect(() => {
    fetchWalletData();
  }, []);

  useEffect(() => {
    fetchPaymentQrImage();
  }, []);

  useEffect(() => {
    if (subscription?.stripe_customer_id) {
      fetchSavedCards(subscription.stripe_customer_id);
    }
  }, [subscription?.stripe_customer_id]);

  // Wallet function implementations
  const fetchWalletData = async () => {
    setWalletLoading(true);
    try {
      const [balRes, txRes, bankRes, cashRes] = await Promise.all([
        fetch(`/api/wallet?action=balance&restaurantId=${restaurant.id}`).then(r => r.json()),
        fetch(`/api/wallet?action=transactions&restaurantId=${restaurant.id}&limit=200`).then(r => r.json()),
        fetch(`/api/wallet?action=bank&restaurantId=${restaurant.id}`).then(r => r.json()),
        fetch(`/api/wallet?action=cashout&restaurantId=${restaurant.id}`).then(r => r.json()),
      ]);
      setWalletBalance(balRes.balance ?? 0);
      setWalletPendingCashout(balRes.pendingCashout ?? 0);
      setWalletTransactions(txRes.transactions ?? []);
      if (bankRes.bank) {
        setBankDetails({ bankName: bankRes.bank.bank_name, accountHolderName: bankRes.bank.account_holder_name, accountNumber: bankRes.bank.account_number });
        setBankFormData({ bankName: bankRes.bank.bank_name, accountHolderName: bankRes.bank.account_holder_name, accountNumber: bankRes.bank.account_number });
      }
      setCashoutRequests(cashRes.requests ?? []);
    } catch (err) {
      console.error('Failed to fetch wallet data:', err);
    } finally {
      setWalletLoading(false);
    }
  };

  const fetchPaymentQrImage = async () => {
    try {
      const { data } = await supabase
        .from('feature_images')
        .select('url')
        .eq('category', 'payment-qr')
        .order('sort_order', { ascending: false })
        .limit(1);

      setPaymentQrImageUrl(data?.[0]?.url || null);
    } catch {
      setPaymentQrImageUrl(null);
    }
  };

  const fetchSavedCards = async (customerId: string) => {
    setLoadingCards(true);
    try {
      const res = await fetch(`/api/stripe/billing?action=payment-methods&customerId=${encodeURIComponent(customerId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const methods = data.methods || [];
      setSavedCards(methods);
      const defaultCard = methods.find((method: SavedCard) => method.isDefault);
      setSelectedCardId(defaultCard?.id || methods[0]?.id || null);
    } catch {
      setSavedCards([]);
      setSelectedCardId(null);
    } finally {
      setLoadingCards(false);
    }
  };

  const handleAddCard = async () => {
    setIsAddingCard(true);
    try {
      localStorage.setItem('qs_wallet_billing_subtab', 'WALLET');
      const res = await fetch('/api/stripe/billing?action=setup-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: subscription?.stripe_customer_id, restaurantId: restaurant.id }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      toast(data.error || 'Failed to start card setup.', 'error');
    } catch {
      toast('Failed to start card setup.', 'error');
    } finally {
      setIsAddingCard(false);
    }
  };

  const handleSaveBank = async () => {
    if (!bankFormData.bankName || !bankFormData.accountHolderName || !bankFormData.accountNumber) {
      toast('Please fill in all bank fields.', 'warning');
      return;
    }
    setIsSavingBank(true);
    try {
      const res = await fetch('/api/wallet?action=bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: restaurant.id, bankName: bankFormData.bankName, accountHolderName: bankFormData.accountHolderName, accountNumber: bankFormData.accountNumber }),
      });
      const data = await res.json();
      if (res.ok) {
        setBankDetails({ bankName: bankFormData.bankName, accountHolderName: bankFormData.accountHolderName, accountNumber: bankFormData.accountNumber });
        setShowBankForm(false);
        toast('Bank details saved!', 'success');
      } else {
        toast(data.error || 'Failed to save bank details', 'error');
      }
    } catch { toast('Failed to save bank details', 'error'); }
    finally { setIsSavingBank(false); }
  };

  const handleRequestCashout = async () => {
    const amount = parseFloat(cashoutAmount);
    if (isNaN(amount) || amount <= 0) { toast('Enter a valid amount.', 'warning'); return; }
    if (!bankDetails) { toast('Please save your bank details first.', 'warning'); return; }
    const available = walletBalance - walletPendingCashout;
    if (amount > available) { toast(`Insufficient balance. Available: ${currencySymbol}${available.toFixed(2)}`, 'warning'); return; }
    setIsRequestingCashout(true);
    try {
      const res = await fetch('/api/wallet?action=cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: restaurant.id, amount, notes: cashoutNotes || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setCashoutAmount(''); setCashoutNotes(''); setShowCashoutForm(false);
        toast(`Cashout request for ${currencySymbol}${amount.toFixed(2)} submitted!`, 'success');
        fetchWalletData();
      } else {
        toast(data.error || 'Failed to request cashout', 'error');
      }
    } catch { toast('Failed to request cashout', 'error'); }
    finally { setIsRequestingCashout(false); }
  };

  const handleDeposit = async () => {
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) {
      toast('Enter a valid deposit amount.', 'warning');
      return;
    }
    if (amount < 20) {
      toast('Minimum top up amount is RM20.', 'warning');
      return;
    }
    if (amount > 1000) {
      toast('Maximum top up amount is RM1,000.', 'warning');
      return;
    }

    setIsDepositing(true);
    try {
      if (depositMethod === 'card') {
        localStorage.setItem('qs_return_tab', 'BILLING');
        localStorage.setItem('qs_wallet_billing_subtab', 'WALLET');

        const res = await fetch('/api/stripe/billing?action=wallet-topup-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantId: restaurant.id,
            amount,
            customerId: subscription?.stripe_customer_id,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast(data.error || 'Failed to start wallet top up.', 'error');
          return;
        }

        if (data.url) {
          window.location.href = data.url;
          return;
        }

        toast('Failed to start wallet top up.', 'error');
        return;
      } else {
        const res = await fetch('/api/wallet?action=deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantId: restaurant.id,
            amount,
            method: 'qr',
            referenceNumber: depositReference || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast(data.error || 'Failed to record wallet deposit.', 'error');
          return;
        }
      }

      setDepositAmount('');
      setDepositReference('');
      setShowDepositForm(false);
      toast(`Wallet topped up with ${currencySymbol}${amount.toFixed(2)}.`, 'success');
      fetchWalletData();
    } catch {
      toast('Failed to process wallet deposit.', 'error');
    } finally {
      setIsDepositing(false);
    }
  };

  const renderCardBadge = (card: SavedCard) => {
    const brand = card.brand.toLowerCase();
    if (brand === 'visa') {
      return <span className="text-[10px] font-black italic text-blue-700">VISA</span>;
    }
    if (brand === 'mastercard') {
      return <span className="text-[9px] font-black text-gray-900">MC</span>;
    }
    return <span className="text-[9px] font-black text-gray-700 uppercase">{card.brand.slice(0, 4)}</span>;
  };

  const isCreditTransaction = (type: string) => type === 'sale' || type === 'deposit';

  const getRawTransactionDescription = (tx: any) => (
    tx.description || (
      tx.type === 'sale' ? 'Online order payment' :
      tx.type === 'deposit' ? 'Wallet deposit' :
      tx.type === 'billing' ? 'Subscription payment from wallet' :
      'Cashout'
    )
  );

  const getCleanTransactionDescription = (tx: any) => (
    getRawTransactionDescription(tx)
      .replace(/\bcs_(test|live)_\S+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );

  const getTransactionMethodLabel = (tx: any) => {
    const descLower = getRawTransactionDescription(tx).toLowerCase();
    if (descLower.includes('via card')) return 'Card';
    if (descLower.includes('via qr')) return 'QR';
    if (tx.type === 'billing') return 'Wallet';
    if (tx.type === 'cashout') return 'Bank Transfer';
    if (tx.type === 'sale') return 'Stripe';
    return 'Other';
  };

  const walletTransactionsWithMeta = useMemo(() => {
    return walletTransactions.map((tx: any) => {
      const createdAt = new Date(tx.created_at);
      const cleanDescription = getCleanTransactionDescription(tx);
      const methodLabel = getTransactionMethodLabel(tx);
      const referenceLabel = tx.order_id || `TXN-${String(tx.id || '').slice(0, 8).toUpperCase()}`;

      return {
        ...tx,
        cleanDescription,
        methodLabel,
        referenceLabel,
        formattedDate: createdAt.toLocaleDateString(),
        formattedTime: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    });
  }, [walletTransactions]);

  const walletMethodOptions = useMemo(() => {
    return Array.from(new Set(walletTransactionsWithMeta.map((tx) => tx.methodLabel))).sort((a, b) => a.localeCompare(b));
  }, [walletTransactionsWithMeta]);

  const walletTypeOptions = useMemo(() => {
    return Array.from(new Set(walletTransactionsWithMeta.map((tx) => tx.type))).sort((a, b) => a.localeCompare(b));
  }, [walletTransactionsWithMeta]);

  const filteredWalletTransactions = useMemo(() => {
    const query = walletSearchQuery.trim().toLowerCase();

    return walletTransactionsWithMeta.filter((tx) => {
      if (walletStatusFilter !== 'ALL' && tx.status !== walletStatusFilter) return false;
      if (walletTypeFilter !== 'ALL' && tx.type !== walletTypeFilter) return false;
      if (walletMethodFilter !== 'ALL' && tx.methodLabel !== walletMethodFilter) return false;

      if (!query) return true;

      const searchableFields = [
        tx.referenceLabel,
        tx.order_id,
        tx.cleanDescription,
        tx.methodLabel,
        tx.type,
        tx.status,
        tx.formattedDate,
        String(tx.amount),
      ].filter(Boolean);

      return searchableFields.some((value) => String(value).toLowerCase().includes(query));
    });
  }, [walletMethodFilter, walletSearchQuery, walletStatusFilter, walletTransactionsWithMeta, walletTypeFilter]);

  const walletTotalPages = Math.max(1, Math.ceil(filteredWalletTransactions.length / walletEntriesPerPage));

  const paginatedWalletTransactions = useMemo(() => {
    const startIndex = (walletCurrentPage - 1) * walletEntriesPerPage;
    return filteredWalletTransactions.slice(startIndex, startIndex + walletEntriesPerPage);
  }, [filteredWalletTransactions, walletCurrentPage, walletEntriesPerPage]);

  useEffect(() => {
    setWalletCurrentPage(1);
  }, [walletEntriesPerPage, walletMethodFilter, walletSearchQuery, walletStatusFilter, walletTypeFilter]);

  useEffect(() => {
    if (walletCurrentPage > walletTotalPages) {
      setWalletCurrentPage(walletTotalPages);
    }
  }, [walletCurrentPage, walletTotalPages]);

  const walletVisiblePages = useMemo(() => {
    const maxVisible = 10;
    let start = Math.max(1, walletCurrentPage - Math.floor(maxVisible / 2));
    let end = start + maxVisible - 1;

    if (end > walletTotalPages) {
      end = walletTotalPages;
      start = Math.max(1, end - maxVisible + 1);
    }

    const pages: number[] = [];
    for (let page = start; page <= end; page += 1) pages.push(page);
    return pages;
  }, [walletCurrentPage, walletTotalPages]);

  return (
    <div>
      {/* Wallet Balance Card */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 mb-6 text-white shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Wallet size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Wallet Balance</span>
          </div>
          <button
            onClick={fetchWalletData}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
          >
            <RotateCw size={12} className={walletLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <p className="text-3xl font-black">
          {walletLoading ? (
            <span className="text-white/50">Loading...</span>
          ) : (
            `${currencySymbol}${walletBalance.toFixed(2)}`
          )}
        </p>
        <div className="flex items-center gap-4 mt-2">
          <p className="text-[10px] opacity-70">Available for renewals, payouts, and online sales</p>
          {walletPendingCashout > 0 && (
            <span className="text-[9px] font-black bg-white/20 px-2 py-0.5 rounded-full">
              Pending Cashout: {currencySymbol}{walletPendingCashout.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setShowDepositForm(true)}
            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden shadow-sm">
              <div className="p-4 border-b dark:border-gray-700 flex flex-col gap-3">
                <h3 className="text-sm font-black dark:text-white uppercase tracking-widest flex items-center gap-2">
                  <Receipt size={14} className="text-orange-500" />
                  Transaction History
                </h3>
                {walletTransactions.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative flex-1 min-w-0">
                      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search Transaction / Order ID..."
                        value={walletSearchQuery}
                        onChange={(e) => setWalletSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-black dark:text-white outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <select
                      value={walletStatusFilter}
                      onChange={(e) => setWalletStatusFilter(e.target.value)}
                      className="py-2 px-3 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white outline-none cursor-pointer focus:ring-1 focus:ring-orange-500"
                    >
                      <option value="ALL">All Status</option>
                      <option value="completed">Completed</option>
                      <option value="pending">Pending</option>
                      <option value="failed">Failed</option>
                    </select>
                    <select
                      value={walletTypeFilter}
                      onChange={(e) => setWalletTypeFilter(e.target.value)}
                      className="py-2 px-3 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white outline-none cursor-pointer focus:ring-1 focus:ring-orange-500"
                    >
                      <option value="ALL">All Type</option>
                      {walletTypeOptions.map((type) => (
                        <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                      ))}
                    </select>
                    <select
                      value={walletMethodFilter}
                      onChange={(e) => setWalletMethodFilter(e.target.value)}
                      className="py-2 px-3 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white outline-none cursor-pointer focus:ring-1 focus:ring-orange-500"
                    >
                      <option value="ALL">All Method</option>
                      {walletMethodOptions.map((method) => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Show</span>
                      <select
                        value={walletEntriesPerPage}
                        onChange={(e) => setWalletEntriesPerPage(Number(e.target.value))}
                        className="bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5 outline-none cursor-pointer"
                      >
                        <option value={30}>30</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Entries</span>
                    </div>
                  </div>
                )}
              </div>
            onClick={() => {
              if (!bankDetails) { toast('Please save your bank details first.', 'warning'); setShowBankSection(true); setShowBankForm(true); return; }
              setShowCashoutForm(true);
            }}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
          >
            <Send size={12} /> Request Cashout
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                        <tr>
                          <th className="px-4 py-3 text-left">Reference</th>
                          <th className="px-4 py-3 text-left">Date</th>
                          <th className="px-4 py-3 text-left">Time</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-left">Method</th>
                          <th className="px-4 py-3 text-left">Type</th>
                          <th className="px-4 py-3 text-left">Description</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-gray-700">
                        {paginatedWalletTransactions.map((tx: any) => (
                          <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <td className="px-4 py-2">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{tx.referenceLabel}</span>
                                {tx.order_id && (
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Order</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-tighter whitespace-nowrap">
                              {tx.formattedDate}
                            </td>
                            <td className="px-4 py-2 text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                              {tx.formattedTime}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                                tx.status === 'completed' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                                tx.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                              }`}>
                                {tx.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase whitespace-nowrap">
                              {tx.methodLabel}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex items-center gap-1 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                                tx.type === 'sale' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                                tx.type === 'deposit' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                                tx.type === 'billing' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                                'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                              }`}>
                                {isCreditTransaction(tx.type)
                                  ? <ArrowDownRight size={9} />
                                  : <ArrowUpRight size={9} />}
                                {tx.type}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-[10px] font-black text-gray-700 dark:text-gray-200 min-w-[240px]">
                              {tx.cleanDescription}
                            </td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">
                              <span className={`text-xs font-black ${
                                isCreditTransaction(tx.type) ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                              }`}>
                                {isCreditTransaction(tx.type) ? '+' : '-'}{currencySymbol}{Number(tx.amount).toFixed(2)}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {paginatedWalletTransactions.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-16 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              No matching records found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {walletTotalPages > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-2 overflow-x-auto py-2 px-4 no-print">
                      <button onClick={() => setWalletCurrentPage(1)} disabled={walletCurrentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
                        <ChevronFirst size={16} />
                      </button>
                      <button onClick={() => setWalletCurrentPage((prev) => Math.max(1, prev - 1))} disabled={walletCurrentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
                        <ChevronLeft size={16} />
                      </button>

                      <div className="flex items-center gap-1">
                        {walletVisiblePages.map((page) => (
                          <button
                            key={page}
                            onClick={() => setWalletCurrentPage(page)}
                            className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${walletCurrentPage === page ? 'bg-orange-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                          >
                            {page}
                          </button>
                        ))}
                      </div>

                      <button onClick={() => setWalletCurrentPage((prev) => Math.min(walletTotalPages, prev + 1))} disabled={walletCurrentPage === walletTotalPages} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
                        <ChevronRight size={16} />
                      </button>
                      <button onClick={() => setWalletCurrentPage(walletTotalPages)} disabled={walletCurrentPage === walletTotalPages} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
                        <ChevronLast size={16} />
                      </button>
                    </div>
                  )}
                </>
                    <button
                      key={card.id}
                      onClick={() => setSelectedCardId(card.id)}
                      className={`w-full rounded-lg border p-3 flex items-center justify-between gap-3 text-left transition-all ${selectedCardId === card.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-600'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-7 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center">{renderCardBadge(card)}</div>
                        <div>
                          <p className="text-xs font-black dark:text-white">•••• {card.last4}</p>
                          <p className="text-[9px] text-gray-400">{card.expMonth}/{card.expYear} {card.isDefault ? '• default' : ''}</p>
                        </div>
                      </div>
                      {selectedCardId === card.id && <CheckCircle size={14} className="text-emerald-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 items-start mb-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-600 p-4 flex items-center justify-center">
                <img
                  src={paymentQrImageUrl || DEFAULT_QR_SRC}
                  alt="Wallet top up QR"
                  className="w-44 h-44 object-contain"
                  onError={() => setPaymentQrImageUrl(null)}
                />
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-600 p-4 space-y-3">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">QR Top Up</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Scan the QR with your banking app, then confirm the top-up below.</p>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Reference (Optional)</label>
                  <input
                    type="text"
                    value={depositReference}
                    onChange={e => setDepositReference(e.target.value)}
                    placeholder="Bank reference / note"
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-gray-400">This records the top up in your wallet after you complete the transfer.</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <p className="text-[9px] text-gray-400 flex-1">
              {depositMethod === 'card'
                ? 'Card top ups are charged immediately and added to your wallet balance.'
                : 'QR top ups use the payment QR shown above and are added when you confirm the transfer.'}
            </p>
            <button
              onClick={handleDeposit}
              disabled={isDepositing || !depositAmount}
              className="px-5 py-2.5 bg-emerald-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {isDepositing ? <RotateCw size={12} className="animate-spin" /> : <PlusCircle size={12} />}
              {depositMethod === 'card' ? 'Top Up by Card' : 'Confirm QR Top Up'}
            </button>
          </div>
        </div>
      )}

      {/* Cashout Request Form */}
      {showCashoutForm && (
        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black dark:text-white uppercase tracking-widest flex items-center gap-2">
              <Send size={14} className="text-orange-500" />
              Request Cashout
            </h3>
            <button onClick={() => setShowCashoutForm(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-all">
              <X size={14} className="text-gray-400" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Amount ({currencySymbol})</label>
              <input
                type="number"
                step="0.01"
                min="1"
                value={cashoutAmount}
                onChange={e => setCashoutAmount(e.target.value)}
                placeholder={`Max: ${(walletBalance - walletPendingCashout).toFixed(2)}`}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Notes (Optional)</label>
              <input
                type="text"
                value={cashoutNotes}
                onChange={e => setCashoutNotes(e.target.value)}
                placeholder="e.g. Monthly withdrawal"
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[9px] text-gray-400 flex-1">
              Funds will be transferred to: <span className="font-bold text-gray-600 dark:text-gray-300">{bankDetails?.bankName} — {bankDetails?.accountNumber}</span>
            </p>
            <button
              onClick={handleRequestCashout}
              disabled={isRequestingCashout}
              className="px-5 py-2.5 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {isRequestingCashout ? <RotateCw size={12} className="animate-spin" /> : <Send size={12} />}
              Submit Request
            </button>
          </div>
        </div>
      )}

      {/* Bank Details Section */}
      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 mb-6">
        <button
          onClick={() => setShowBankSection(prev => !prev)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <h3 className="text-sm font-black dark:text-white uppercase tracking-widest flex items-center gap-2">
            <Building2 size={14} className="text-orange-500" />
            Bank Details
          </h3>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${showBankSection ? 'rotate-180' : ''}`} />
        </button>

        {showBankSection && (
          <div className="px-5 pb-5">
            {bankDetails && !showBankForm ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Bank Name</span>
                  <div className="flex items-center gap-2">
                    {(() => { const b = MALAYSIA_BANKS.find(bk => bk.name === bankDetails.bankName); return b ? <img src={b.logo} alt={b.name} className="h-5 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : null; })()}
                    <span className="text-xs font-black dark:text-white">{bankDetails.bankName}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account Holder</span>
                  <span className="text-xs font-black dark:text-white">{bankDetails.accountHolderName}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account Number</span>
                  <span className="text-xs font-black dark:text-white">{bankDetails.accountNumber}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setShowBankForm(true)}
                    className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-gray-300 dark:hover:bg-gray-500 transition-all flex items-center gap-1.5 text-gray-600 dark:text-gray-300"
                  >
                    <Edit3 size={11} /> Edit
                  </button>
                  <button
                    onClick={() => setShowBankSection(false)}
                    className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-gray-300 dark:hover:bg-gray-500 transition-all text-gray-600 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Bank Name</label>
                  <div className="relative">
                    <select
                      value={bankFormData.bankName}
                      onChange={e => setBankFormData(prev => ({ ...prev, bankName: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500 appearance-none cursor-pointer"
                    >
                      <option value="">Select a bank...</option>
                      {MALAYSIA_BANKS.map(b => (
                        <option key={b.name} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  {bankFormData.bankName && (() => {
                    const selected = MALAYSIA_BANKS.find(b => b.name === bankFormData.bankName);
                    return selected ? (
                      <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <img src={selected.logo} alt={selected.name} className="h-6 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <span className="text-xs font-bold dark:text-white">{selected.name}</span>
                      </div>
                    ) : null;
                  })()}
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Account Holder Name</label>
                  <input
                    type="text"
                    value={bankFormData.accountHolderName}
                    onChange={e => setBankFormData(prev => ({ ...prev, accountHolderName: e.target.value }))}
                    placeholder="e.g. Ahmad bin Ali"
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Account Number</label>
                  <input
                    type="text"
                    value={bankFormData.accountNumber}
                    onChange={e => setBankFormData(prev => ({ ...prev, accountNumber: e.target.value }))}
                    placeholder="e.g. 1234567890"
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleSaveBank}
                    disabled={isSavingBank}
                    className="px-5 py-2.5 bg-green-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSavingBank ? <RotateCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                    Save Changes
                  </button>
                  <button
                    onClick={() => { setShowBankForm(false); setShowBankSection(false); }}
                    className="px-4 py-2.5 bg-gray-200 dark:bg-gray-600 rounded-lg font-black text-[10px] uppercase tracking-widest text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cashout Request History */}
      {cashoutRequests.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 p-5 mb-6">
          <h3 className="text-sm font-black dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
            <Banknote size={14} className="text-orange-500" />
            Cashout Requests
          </h3>
          <div className="space-y-2">
            {cashoutRequests.map((req: any) => (
              <div key={req.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    req.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                    req.status === 'approved' ? 'bg-blue-100 dark:bg-blue-900/30' :
                    req.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30' :
                    'bg-red-100 dark:bg-red-900/30'
                  }`}>
                    <ArrowUpRight size={14} className={
                      req.status === 'pending' ? 'text-yellow-600' :
                      req.status === 'approved' ? 'text-blue-600' :
                      req.status === 'completed' ? 'text-green-600' :
                      'text-red-600'
                    } />
                  </div>
                  <div>
                    <p className="text-xs font-black dark:text-white">{currencySymbol}{Number(req.amount).toFixed(2)}</p>
                    <p className="text-[9px] text-gray-400">{new Date(req.created_at).toLocaleDateString()} — {req.bank_name} •••{req.account_number.slice(-4)}</p>
                  </div>
                </div>
                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                  req.status === 'pending' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                  req.status === 'approved' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                  req.status === 'completed' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                  'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 p-5">
        <h3 className="text-sm font-black dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
          <Receipt size={14} className="text-orange-500" />
          Transaction History
        </h3>
        {walletTransactions.length === 0 ? (
          <div className="text-center py-10">
            <Receipt size={24} className="mx-auto text-gray-300 mb-2" />
            <p className="text-[10px] text-gray-400 font-bold">No transactions yet</p>
            <p className="text-[9px] text-gray-300 mt-1">Sales, deposits, and wallet billing payments will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b dark:border-gray-600">
                  <th className="pb-2 pr-4 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="pb-2 pr-4 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Time</th>
                  <th className="pb-2 pr-4 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                  <th className="pb-2 pr-4 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Method</th>
                  <th className="pb-2 pr-4 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="pb-2 text-[9px] font-semibold text-gray-400 uppercase tracking-wider text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {walletTransactions.map((tx: any) => {
                  const rawDesc = tx.description || (
                    tx.type === 'sale' ? 'Online order payment' :
                    tx.type === 'deposit' ? 'Wallet deposit' :
                    tx.type === 'billing' ? 'Subscription payment from wallet' :
                    'Cashout'
                  );
                  // Strip Stripe session IDs (cs_test_xxx / cs_live_xxx)
                  const cleanDesc = rawDesc.replace(/\bcs_(test|live)_\S+/gi, '').replace(/\s{2,}/g, ' ').trim();

                  // Derive payment type label
                  const descLower = rawDesc.toLowerCase();
                  const paymentType =
                    descLower.includes('via card') ? 'via Card' :
                    descLower.includes('via qr') ? 'via QR' :
                    tx.type === 'billing' ? 'via Wallet' :
                    tx.type === 'cashout' ? 'via Bank Transfer' :
                    tx.type === 'sale' ? 'via Stripe' :
                    '—';

                  return (
                    <tr key={tx.id} className="border-b dark:border-gray-700/50 last:border-0 hover:bg-white/60 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="py-2 pr-4 text-[10px] text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4 text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2 pr-4 text-[10px] text-gray-700 dark:text-gray-200">
                        {cleanDesc}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight ${
                          tx.type === 'sale' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                          tx.type === 'deposit' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                          tx.type === 'billing' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                          'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {isCreditTransaction(tx.type)
                            ? <ArrowDownRight size={9} />
                            : <ArrowUpRight size={9} />}
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {paymentType}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <span className={`text-xs font-black ${
                          isCreditTransaction(tx.type) ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                        }`}>
                          {isCreditTransaction(tx.type) ? '+' : '-'}{currencySymbol}{Number(tx.amount).toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WalletTab;