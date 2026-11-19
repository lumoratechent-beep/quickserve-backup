import React, { useEffect, useRef, useState } from 'react';
import { Store, Users, DoorOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Restaurant, Subscription, User } from '../src/types';
import { supabase } from '../lib/supabase';

interface Props {
  restaurant: Restaurant;
  users: User[];
  subscription?: Subscription;
  onSignIn: (user: User) => void;
  onClose: () => void;
}

interface BillingRecord {
  id: string;
  description: string;
  amount: number;
  created_at: string;
  created_by: string;
  type: string;
  reference_code: string | null;
}

const planNames: Record<string, string> = { basic: 'Basic', pro: 'Pro', pro_plus: 'Pro Plus' };
const billingMoney = new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' });

export default function AdminVendorDetailsModal({ restaurant, users, subscription, onSignIn, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [billingPage, setBillingPage] = useState(1);
  const [billingRows, setBillingRows] = useState<BillingRecord[]>([]);
  const [billingCount, setBillingCount] = useState(0);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState(false);
  const [billingRetry, setBillingRetry] = useState(0);
  const billingPages = Math.max(1, Math.ceil(billingCount / 5));
  const visibleBillingPages = Array.from(new Set([1, billingPages, billingPage - 1, billingPage, billingPage + 1]))
    .filter(page => page >= 1 && page <= billingPages).sort((left, right) => left - right);
  const owner = users.find(user => user.id === restaurant.vendorId)
    || users.find(user => user.role === 'VENDOR');
  const expiry = subscription?.current_period_end || subscription?.trial_end;
  const assignedUsers = [...users].sort((left, right) =>
    Number(right.id === owner?.id) - Number(left.id === owner?.id)
    || (left.name || left.username).localeCompare(right.name || right.username));

  useEffect(() => {
    let cancelled = false;
    async function loadBilling() {
      setBillingLoading(true);
      setBillingError(false);
      setBillingRows([]);
      try {
        const { data, error, count } = await supabase.from('billing_records')
          .select('id,description,amount,created_at,created_by,type,reference_code', { count: 'exact' })
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range((billingPage - 1) * 5, billingPage * 5 - 1);
        if (error) throw error;
        if (cancelled) return;
        const total = count ?? data?.length ?? 0;
        setBillingCount(total);
        const lastPage = Math.max(1, Math.ceil(total / 5));
        if (billingPage > lastPage) setBillingPage(lastPage);
        else setBillingRows(data || []);
      } catch {
        if (!cancelled) setBillingError(true);
      } finally {
        if (!cancelled) setBillingLoading(false);
      }
    }
    void loadBilling();
    return () => { cancelled = true; };
  }, [restaurant.id, billingPage, billingRetry]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="admin-vendor-details-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      className="m-auto h-[min(640px,92dvh)] max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-6xl overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-black/60 open:flex open:flex-col dark:border-gray-700 dark:bg-gray-900 dark:text-white"
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] md:grid-rows-1">
        <section aria-labelledby="admin-vendor-info-title" className="min-w-0 border-b border-gray-100 bg-gray-50/70 p-4 md:border-b-0 md:border-r dark:border-gray-700 dark:bg-gray-800/30">
          <div className="mb-3 flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/50">
              <Store size={22} />
              {restaurant.logo && <img src={restaurant.logo} alt="" className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.style.display = 'none'; }} />}
            </div>
            <div className="min-w-0">
              <h3 id="admin-vendor-info-title" className="text-xs text-gray-500 dark:text-gray-400">Vendor details</h3>
              <h2 id="admin-vendor-details-title" className="mt-0.5 break-words text-lg font-bold">{restaurant.name}</h2>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] leading-4">
          {[
            ['Owner', owner ? (owner.name || owner.username) : 'Not available'],
            ['Hub / location', restaurant.location || 'Unassigned'],
            ['Email', owner?.email || 'Not provided'],
            ['Phone', owner?.phone || 'Not provided'],
            ['Plan', subscription ? (planNames[subscription.plan_id] || subscription.plan_id) : 'No subscription'],
            ['Plan expiry', expiry ? new Date(expiry).toLocaleDateString() : 'Not set'],
            ['Live status', restaurant.isOnline ? 'Online' : 'Offline'],
            ['Owner account', owner ? (owner.isActive === false ? 'Disabled' : 'Active') : 'Not available'],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0"><dt className="text-gray-500 dark:text-gray-400">{label}</dt><dd title={value} className="truncate font-semibold">{value}</dd></div>
          ))}
          </dl>
          <section aria-labelledby="admin-vendor-billing-title" className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
            <h3 id="admin-vendor-billing-title" className="mb-2 text-xs font-semibold">Billing history</h3>
            <div aria-live="polite" aria-busy={billingLoading}>
              {billingLoading ? <p className="py-3 text-xs text-gray-500">Loading billing history…</p>
                : billingError ? <div className="py-3 text-xs text-red-600 dark:text-red-400">Unable to load billing history. <button type="button" onClick={() => setBillingRetry(value => value + 1)} className="font-semibold underline">Retry</button></div>
                : billingRows.length === 0 ? <p className="py-3 text-xs text-gray-500">No billing records yet.</p>
                : <table className="w-full table-fixed text-left text-[11px] leading-4">
                  <thead className="text-gray-500 dark:text-gray-400"><tr><th scope="col" className="w-20 py-1 font-medium">Date</th><th scope="col" className="px-1 py-1 font-medium">Description</th><th scope="col" className="w-20 py-1 text-right font-medium">Amount</th></tr></thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {billingRows.map(record => <tr key={record.id}>
                      <td className="py-1.5 whitespace-nowrap">{new Date(record.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                      <td className="px-1 py-1.5"><p className="truncate" title={[record.description, record.created_by, record.reference_code].filter(Boolean).join(' · ')}>{record.description || 'Subscription payment'}</p></td>
                      <td className="py-1.5 text-right font-medium whitespace-nowrap">{billingMoney.format(Number(record.amount) || 0)}</td>
                    </tr>)}
                  </tbody>
                </table>}
            </div>
            {billingPages > 1 && <nav aria-label="Billing history pagination" className="mt-2 flex items-center justify-end gap-1">
              <button type="button" aria-label="Previous billing page" disabled={billingPage === 1 || billingLoading} onClick={() => setBillingPage(page => page - 1)} className="rounded p-1 hover:bg-gray-200 disabled:opacity-30 dark:hover:bg-gray-700"><ChevronLeft size={14} /></button>
              {visibleBillingPages.map((page, index) => <React.Fragment key={page}>
                {index > 0 && page > visibleBillingPages[index - 1] + 1 && <span className="text-xs text-gray-400">…</span>}
                <button type="button" aria-label={`Billing page ${page}`} aria-current={page === billingPage ? 'page' : undefined} disabled={billingLoading} onClick={() => setBillingPage(page)} className={`h-6 min-w-6 rounded px-1 text-[11px] font-semibold disabled:opacity-50 ${page === billingPage ? 'bg-orange-500 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>{page}</button>
              </React.Fragment>)}
              <button type="button" aria-label="Next billing page" disabled={billingPage === billingPages || billingLoading} onClick={() => setBillingPage(page => page + 1)} className="rounded p-1 hover:bg-gray-200 disabled:opacity-30 dark:hover:bg-gray-700"><ChevronRight size={14} /></button>
            </nav>}
          </section>
        </section>

        <section aria-labelledby="admin-vendor-users-title" className="flex min-h-0 min-w-0 flex-col p-4 lg:p-6">
          <div className="mb-3 flex shrink-0 items-center gap-2">
            <Users size={18} className="text-orange-500" />
            <h3 id="admin-vendor-users-title" className="font-semibold">Assigned users</h3>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">{users.length}</span>
          </div>
          <div role="region" aria-label="Assigned user list" tabIndex={0} className="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200 focus-visible:outline-orange-500 dark:border-gray-700">
            <table className="w-full min-w-[500px] table-fixed text-left text-xs">
              <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400"><tr>
                <th scope="col" className="w-[38%] px-3 py-2 font-medium">User</th>
                <th scope="col" className="w-[25%] px-3 py-2 font-medium">Role</th>
                <th scope="col" className="w-[17%] px-3 py-2 font-medium">Status</th>
                <th scope="col" className="w-1/5 px-3 py-2 text-right font-medium">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {assignedUsers.map(user => <tr key={user.id}>
                  <td className="px-3 py-1.5 leading-4"><div className="flex min-w-0 items-center gap-2"><p title={user.name || user.username} className="truncate font-semibold">{user.name || user.username}</p>{user.id === owner?.id && <span className="shrink-0 text-[11px] font-medium text-orange-600 dark:text-orange-400">Owner</span>}</div><p title={`@${user.username}`} className="truncate text-[11px] text-gray-500 dark:text-gray-400">@{user.username}</p></td>
                  <td className="px-3 py-1.5"><span className="inline-flex h-5 w-24 max-w-full items-center justify-center rounded-md bg-gray-100 text-[11px] capitalize dark:bg-gray-800">{user.role.toLowerCase().replaceAll('_', ' ')}</span></td>
                  <td className="px-3 py-1.5"><span className={user.isActive === false ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}>{user.isActive === false ? 'Disabled' : 'Active'}</span></td>
                  <td className="px-3 py-1.5 text-right"><button type="button" aria-label={`Sign in as ${user.username}`} title={`Sign in as ${user.username}`} onClick={() => onSignIn(user)} className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium whitespace-nowrap hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-orange-500 dark:border-gray-700 dark:hover:bg-orange-900/20"><DoorOpen size={12} /><span>Sign in</span></button></td>
                </tr>)}
                {users.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No users assigned to this vendor.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <footer className="flex shrink-0 justify-end border-t border-gray-100 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900"><button type="button" onClick={onClose} className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700 focus-visible:outline-orange-500 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200">Close</button></footer>
    </dialog>
  );
}
