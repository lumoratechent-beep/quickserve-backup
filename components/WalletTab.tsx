// components/WalletTab.tsx

import React, { useState, useEffect } from 'react';
import { Restaurant } from '../src/types';
import { toast } from './Toast';
import {
  Wallet, RotateCw, Send, Building2, ChevronDown, Edit3, CheckCircle,
  X, Banknote, Receipt, ArrowUpRight, ArrowDownRight
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
}

const WalletTab: React.FC<Props> = ({ restaurant }) => {
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

  // Currency setup
  const userCurrency = restaurant.settings?.currency || localStorage.getItem(`ux_currency_${restaurant.id}`) || 'MYR';
  const currencySymbol = CURRENCY_OPTIONS.find(c => c.code === userCurrency)?.symbol || 'RM';

  // Fetch wallet data on mount
  useEffect(() => {
    fetchWalletData();
  }, []);

  // Wallet function implementations
  const fetchWalletData = async () => {
    setWalletLoading(true);
    try {
      const [balRes, txRes, bankRes, cashRes] = await Promise.all([
        fetch(`/api/wallet?action=balance&restaurantId=${restaurant.id}`).then(r => r.json()),
        fetch(`/api/wallet?action=transactions&restaurantId=${restaurant.id}`).then(r => r.json()),
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
          <p className="text-[10px] opacity-70">Revenue from completed online orders</p>
          {walletPendingCashout > 0 && (
            <span className="text-[9px] font-black bg-white/20 px-2 py-0.5 rounded-full">
              Pending Cashout: {currencySymbol}{walletPendingCashout.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => {
              if (!bankDetails) { toast('Please save your bank details first.', 'warning'); setShowBankSection(true); setShowBankForm(true); return; }
              setShowCashoutForm(true);
            }}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
          >
            <Send size={12} /> Request Cashout
          </button>
        </div>
        {/* Cashout Processing Note */}
        <p className="text-xs text-white/70 mt-2 italic">
          *Cashout requests typically take 1-3 working days to process
        </p>
      </div>

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
            <p className="text-[9px] text-gray-300 mt-1">Revenue from online orders will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {walletTransactions.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    tx.type === 'sale' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                  }`}>
                    {tx.type === 'sale' ? (
                      <ArrowDownRight size={14} className="text-green-600" />
                    ) : (
                      <ArrowUpRight size={14} className="text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-black dark:text-white">
                      {tx.type === 'sale' ? '+' : '-'}{currencySymbol}{Number(tx.amount).toFixed(2)}
                    </p>
                    <p className="text-[9px] text-gray-400">{tx.description || (tx.type === 'sale' ? 'Online order payment' : 'Cashout')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-gray-400">{new Date(tx.created_at).toLocaleDateString()}</p>
                  <p className="text-[8px] text-gray-300">{new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WalletTab;