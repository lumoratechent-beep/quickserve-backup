import React, { useState, useMemo } from 'react';
import { Restaurant } from '../src/types';
import {
  Users as UsersIcon, UserPlus, Plus, Search, Edit3, Trash2, Check, X,
  Phone, Mail, MapPin, FileText, Building2,
} from 'lucide-react';

// ─── Types ───
interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  totalOrders: number;
  totalSpent: number;
  createdAt: number;
}

type ContactSubTab = 'suppliers' | 'customers';

interface Props {
  restaurant: Restaurant;
  currencySymbol: string;
}

const ContactsManagement: React.FC<Props> = ({ restaurant, currencySymbol }) => {
  const [subTab, setSubTab] = useState<ContactSubTab>('suppliers');
  const storeKey = (key: string) => `inv_${restaurant.id}_${key}`;
  const contactKey = (key: string) => `contact_${restaurant.id}_${key}`;

  const loadState = <T,>(key: string, fallback: T, prefix: 'inv' | 'contact' = 'inv'): T => {
    try {
      const k = prefix === 'inv' ? storeKey(key) : contactKey(key);
      const saved = localStorage.getItem(k);
      return saved ? JSON.parse(saved) : fallback;
    } catch { return fallback; }
  };
  const saveState = <T,>(key: string, data: T, prefix: 'inv' | 'contact' = 'inv') => {
    const k = prefix === 'inv' ? storeKey(key) : contactKey(key);
    localStorage.setItem(k, JSON.stringify(data));
  };

  // ─── State ───
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadState('suppliers', []));
  const [customers, setCustomers] = useState<Customer[]>(() => loadState('customers', [], 'contact'));

  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Supplier form
  const [supplierForm, setSupplierForm] = useState<Supplier>({ id: '', name: '', email: '', phone: '', address: '', notes: '' });
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);

  // Customer form
  const [customerForm, setCustomerForm] = useState<Customer>({ id: '', name: '', email: '', phone: '', address: '', notes: '', totalOrders: 0, totalSpent: 0, createdAt: 0 });
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);

  // ─── Supplier Handlers ───
  const handleSaveSupplier = () => {
    if (!supplierForm.name.trim()) return;
    let updated: Supplier[];
    if (editingSupplierId) {
      updated = suppliers.map(s => s.id === editingSupplierId ? { ...supplierForm, id: editingSupplierId } : s);
    } else {
      updated = [...suppliers, { ...supplierForm, id: crypto.randomUUID() }];
    }
    setSuppliers(updated);
    saveState('suppliers', updated);
    setSupplierForm({ id: '', name: '', email: '', phone: '', address: '', notes: '' });
    setEditingSupplierId(null);
    setShowForm(false);
  };

  const handleDeleteSupplier = (id: string) => {
    if (!confirm('Delete this supplier?')) return;
    const updated = suppliers.filter(s => s.id !== id);
    setSuppliers(updated);
    saveState('suppliers', updated);
  };

  // ─── Customer Handlers ───
  const handleSaveCustomer = () => {
    if (!customerForm.name.trim()) return;
    let updated: Customer[];
    if (editingCustomerId) {
      updated = customers.map(c => c.id === editingCustomerId ? { ...customerForm, id: editingCustomerId } : c);
    } else {
      updated = [...customers, { ...customerForm, id: crypto.randomUUID(), createdAt: Date.now() }];
    }
    setCustomers(updated);
    saveState('customers', updated, 'contact');
    setCustomerForm({ id: '', name: '', email: '', phone: '', address: '', notes: '', totalOrders: 0, totalSpent: 0, createdAt: 0 });
    setEditingCustomerId(null);
    setShowForm(false);
  };

  const handleDeleteCustomer = (id: string) => {
    if (!confirm('Delete this customer?')) return;
    const updated = customers.filter(c => c.id !== id);
    setCustomers(updated);
    saveState('customers', updated, 'contact');
  };

  // ─── Filtered lists ───
  const filteredSuppliers = useMemo(() => {
    if (!searchQuery) return suppliers;
    const q = searchQuery.toLowerCase();
    return suppliers.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.phone.includes(q));
  }, [suppliers, searchQuery]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, searchQuery]);

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  const subTabs: { key: ContactSubTab; label: string; icon: React.ReactNode }[] = [
    { key: 'suppliers', label: 'Suppliers', icon: <Building2 size={16} /> },
    { key: 'customers', label: 'Customers', icon: <UserPlus size={16} /> },
  ];

  return (
    <div>
      {/* Sub-tab navigation */}
      <div className="flex overflow-x-auto hide-scrollbar border-b border-gray-200 dark:border-gray-700 mb-6">
        {subTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setSubTab(tab.key); setShowForm(false); setSearchQuery(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-[10px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all rounded-t-lg ${
              subTab === tab.key
                ? 'bg-amber-600 text-white'
                : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* SUPPLIERS                              */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'suppliers' && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-black">Suppliers</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Manage your supplier contacts</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input type="text" placeholder="Search suppliers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none w-48" />
              </div>
              <button onClick={() => { setShowForm(!showForm); setEditingSupplierId(null); setSupplierForm({ id: '', name: '', email: '', phone: '', address: '', notes: '' }); }} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20">
                <Plus size={14} /> Add Supplier
              </button>
            </div>
          </div>

          {showForm && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 mb-6">
              <h3 className="text-sm font-black mb-4">{editingSupplierId ? 'Edit' : 'Add'} Supplier</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Name *</label>
                  <input type="text" value={supplierForm.name} onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))} placeholder="Supplier name" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Email</label>
                  <input type="email" value={supplierForm.email} onChange={e => setSupplierForm(f => ({ ...f, email: e.target.value }))} placeholder="supplier@email.com" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Phone</label>
                  <input type="tel" value={supplierForm.phone} onChange={e => setSupplierForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Address</label>
                  <input type="text" value={supplierForm.address} onChange={e => setSupplierForm(f => ({ ...f, address: e.target.value }))} placeholder="Address" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              </div>
              <div className="mb-4">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Notes</label>
                <input type="text" value={supplierForm.notes} onChange={e => setSupplierForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowForm(false); setEditingSupplierId(null); }} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
                <button onClick={handleSaveSupplier} className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20">{editingSupplierId ? 'Update' : 'Add'} Supplier</button>
              </div>
            </div>
          )}

          {/* Suppliers List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSuppliers.length > 0 ? filteredSuppliers.map(supplier => (
              <div key={supplier.id} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-600/20 flex items-center justify-center text-amber-400 font-black text-sm">
                      {supplier.name.charAt(0).toUpperCase()}
                    </div>
                    <h4 className="text-sm font-black text-gray-900 dark:text-white">{supplier.name}</h4>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setSupplierForm(supplier); setEditingSupplierId(supplier.id); setShowForm(true); }} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-amber-400 transition-all"><Edit3 size={14} /></button>
                    <button onClick={() => handleDeleteSupplier(supplier.id)} className="p-2 rounded-lg text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-all"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {supplier.email && <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2"><Mail size={12} /> {supplier.email}</p>}
                  {supplier.phone && <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2"><Phone size={12} /> {supplier.phone}</p>}
                  {supplier.address && <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2"><MapPin size={12} /> {supplier.address}</p>}
                  {supplier.notes && <p className="text-xs text-gray-400 dark:text-gray-500 italic mt-2">{supplier.notes}</p>}
                </div>
              </div>
            )) : (
              <div className="col-span-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                <Building2 size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-bold">No suppliers yet</p>
                <p className="text-xs text-gray-500 mt-1">Add suppliers to manage contacts</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* CUSTOMERS                              */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'customers' && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-black">Customers</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Manage your customer directory</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input type="text" placeholder="Search customers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none w-48" />
              </div>
              <button onClick={() => { setShowForm(!showForm); setEditingCustomerId(null); setCustomerForm({ id: '', name: '', email: '', phone: '', address: '', notes: '', totalOrders: 0, totalSpent: 0, createdAt: 0 }); }} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20">
                <Plus size={14} /> Add Customer
              </button>
            </div>
          </div>

          {showForm && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 mb-6">
              <h3 className="text-sm font-black mb-4">{editingCustomerId ? 'Edit' : 'Add'} Customer</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Name *</label>
                  <input type="text" value={customerForm.name} onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))} placeholder="Customer name" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Email</label>
                  <input type="email" value={customerForm.email} onChange={e => setCustomerForm(f => ({ ...f, email: e.target.value }))} placeholder="customer@email.com" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Phone</label>
                  <input type="tel" value={customerForm.phone} onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Address</label>
                  <input type="text" value={customerForm.address} onChange={e => setCustomerForm(f => ({ ...f, address: e.target.value }))} placeholder="Address" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              </div>
              <div className="mb-4">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Notes</label>
                <input type="text" value={customerForm.notes} onChange={e => setCustomerForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowForm(false); setEditingCustomerId(null); }} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
                <button onClick={handleSaveCustomer} className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20">{editingCustomerId ? 'Update' : 'Add'} Customer</button>
              </div>
            </div>
          )}

          {/* Customers List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCustomers.length > 0 ? filteredCustomers.map(customer => (
              <div key={customer.id} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-400 font-black text-sm">
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-gray-900 dark:text-white">{customer.name}</h4>
                      {customer.createdAt > 0 && <p className="text-[10px] text-gray-400">Since {formatDate(customer.createdAt)}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setCustomerForm(customer); setEditingCustomerId(customer.id); setShowForm(true); }} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-amber-400 transition-all"><Edit3 size={14} /></button>
                    <button onClick={() => handleDeleteCustomer(customer.id)} className="p-2 rounded-lg text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-all"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {customer.email && <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2"><Mail size={12} /> {customer.email}</p>}
                  {customer.phone && <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2"><Phone size={12} /> {customer.phone}</p>}
                  {customer.address && <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2"><MapPin size={12} /> {customer.address}</p>}
                  {customer.notes && <p className="text-xs text-gray-400 dark:text-gray-500 italic mt-2">{customer.notes}</p>}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">{customer.totalOrders} orders</p>
                  <p className="text-[10px] font-bold text-amber-400">{currencySymbol}{customer.totalSpent.toFixed(2)} spent</p>
                </div>
              </div>
            )) : (
              <div className="col-span-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                <UserPlus size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-bold">No customers yet</p>
                <p className="text-xs text-gray-500 mt-1">Add customers to build your directory</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactsManagement;
