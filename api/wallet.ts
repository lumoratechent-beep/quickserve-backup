// Vercel serverless function: /api/wallet
// Handles vendor wallet operations: bank details, transactions, cashout requests
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

const CREDIT_TRANSACTION_TYPES = new Set(['sale', 'deposit']);
const DEBIT_TRANSACTION_TYPES = new Set(['cashout', 'billing']);

async function getCompletedWalletBalance(restaurantId: string): Promise<number> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('amount, type')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed');

  if (error || !data) return 0;

  return data.reduce((total, transaction) => {
    const amount = Number(transaction.amount) || 0;
    if (CREDIT_TRANSACTION_TYPES.has(transaction.type)) return total + amount;
    if (DEBIT_TRANSACTION_TYPES.has(transaction.type)) return total - amount;
    return total;
  }, 0);
}

function buildDepositDescription(method: string, referenceNumber?: string, note?: string): string {
  const parts = [`Wallet deposit via ${method === 'card' ? 'Card' : 'QR'}`];
  if (referenceNumber) parts.push(`Ref: ${referenceNumber}`);
  if (note) parts.push(note);
  return parts.join(' - ');
}

function isQrDepositDescription(description?: string | null): boolean {
  return typeof description === 'string' && description.toLowerCase().startsWith('wallet deposit via qr');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action as string;

  try {
    switch (action) {

      // GET /api/wallet?action=bank&restaurantId=...
      case 'bank': {
        if (req.method === 'GET') {
          const restaurantId = req.query.restaurantId as string;
          if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

          const { data, error } = await supabase
            .from('vendor_bank_details')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .single();

          if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
          return res.status(200).json({ bank: data || null });
        }

        // POST /api/wallet?action=bank — save/update bank details
        if (req.method === 'POST') {
          const { restaurantId, bankName, accountHolderName, accountNumber } = req.body;
          if (!restaurantId || !bankName || !accountHolderName || !accountNumber) {
            return res.status(400).json({ error: 'All bank fields are required' });
          }

          const { data, error } = await supabase
            .from('vendor_bank_details')
            .upsert({
              restaurant_id: restaurantId,
              bank_name: bankName,
              account_holder_name: accountHolderName,
              account_number: accountNumber,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'restaurant_id' })
            .select()
            .single();

          if (error) return res.status(500).json({ error: error.message });
          return res.status(200).json({ bank: data });
        }

        return res.status(405).json({ error: 'Method not allowed' });
      }

      // GET /api/wallet?action=transactions&restaurantId=...
      case 'transactions': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const restaurantId = req.query.restaurantId as string;
        if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const offset = parseInt(req.query.offset as string) || 0;

        const { data, error, count } = await supabase
          .from('wallet_transactions')
          .select('*', { count: 'exact' })
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) return res.status(500).json({ error: error.message });

        // Calculate wallet balance (sales - cashouts)
        const balance = await getCompletedWalletBalance(restaurantId);

        return res.status(200).json({ transactions: data || [], totalCount: count || 0, balance });
      }

      // GET /api/wallet?action=balance&restaurantId=...
      case 'balance': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const restaurantId = req.query.restaurantId as string;
        if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

        const balance = await getCompletedWalletBalance(restaurantId);

        // Also get pending cashout total
        const { data: pendingData } = await supabase
          .from('cashout_requests')
          .select('amount')
          .eq('restaurant_id', restaurantId)
          .in('status', ['pending', 'approved']);

        const pendingCashout = pendingData?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;

        return res.status(200).json({ balance, pendingCashout });
      }

      // POST /api/wallet?action=deposit — add wallet funds via QR/manual confirmation
      case 'deposit': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

        const { restaurantId, amount, method, referenceNumber, note } = req.body || {};
        const parsedAmount = Number(amount);

        if (!restaurantId || !parsedAmount || parsedAmount <= 0) {
          return res.status(400).json({ error: 'Valid restaurantId and amount required' });
        }

        if (!['card', 'qr'].includes(method)) {
          return res.status(400).json({ error: 'Deposit method must be card or qr' });
        }

        if (method === 'qr') {
          const { data: pendingTopups, error: pendingTopupError } = await supabase
            .from('wallet_transactions')
            .select('id')
            .eq('restaurant_id', restaurantId)
            .eq('type', 'deposit')
            .eq('status', 'pending')
            .ilike('description', 'Wallet deposit via QR%')
            .limit(1);

          if (pendingTopupError) return res.status(500).json({ error: pendingTopupError.message });
          if ((pendingTopups || []).length > 0) {
            return res.status(409).json({ error: 'You already have a pending QR top up awaiting admin approval.' });
          }
        }

        const depositStatus = method === 'qr' ? 'pending' : 'completed';

        const { data, error } = await supabase
          .from('wallet_transactions')
          .insert({
            restaurant_id: restaurantId,
            amount: parsedAmount,
            type: 'deposit',
            status: depositStatus,
            description: buildDepositDescription(
              method,
              typeof referenceNumber === 'string' ? referenceNumber.slice(0, 100) : undefined,
              typeof note === 'string' ? note.slice(0, 200) : undefined,
            ),
          })
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });

        const balance = await getCompletedWalletBalance(restaurantId);
        return res.status(200).json({
          transaction: data,
          balance,
          pendingApproval: method === 'qr',
        });
      }

      // POST /api/wallet?action=cashout — request a cashout
      case 'cashout': {
        if (req.method === 'GET') {
          // List cashout requests for a restaurant
          const restaurantId = req.query.restaurantId as string;
          if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' });

          const { data, error } = await supabase
            .from('cashout_requests')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .order('created_at', { ascending: false });

          if (error) return res.status(500).json({ error: error.message });
          return res.status(200).json({ requests: data || [] });
        }

        if (req.method === 'POST') {
          const { restaurantId, amount, notes } = req.body;
          if (!restaurantId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Valid restaurantId and amount required' });
          }

          // Verify bank details exist
          const { data: bank, error: bankErr } = await supabase
            .from('vendor_bank_details')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .single();

          if (bankErr || !bank) {
            return res.status(400).json({ error: 'Please save your bank details first' });
          }

          // Verify sufficient balance
          const balance = await getCompletedWalletBalance(restaurantId);

          // Check pending cashouts
          const { data: pendingData } = await supabase
            .from('cashout_requests')
            .select('amount')
            .eq('restaurant_id', restaurantId)
            .in('status', ['pending', 'approved']);

          const pendingCashout = pendingData?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
          const availableBalance = balance - pendingCashout;

          if (amount > availableBalance) {
            return res.status(400).json({ error: `Insufficient balance. Available: ${availableBalance.toFixed(2)}` });
          }

          const { data, error } = await supabase
            .from('cashout_requests')
            .insert({
              restaurant_id: restaurantId,
              amount,
              status: 'pending',
              bank_name: bank.bank_name,
              account_holder_name: bank.account_holder_name,
              account_number: bank.account_number,
              notes: notes || null,
            })
            .select()
            .single();

          if (error) return res.status(500).json({ error: error.message });
          return res.status(200).json({ request: data });
        }

        return res.status(405).json({ error: 'Method not allowed' });
      }

      // Admin endpoints
      // GET /api/wallet?action=admin_cashouts — list all cashout requests (admin only)
      case 'admin_cashouts': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const status = req.query.status as string;

        let query = supabase
          .from('cashout_requests')
          .select('*')
          .order('created_at', { ascending: false });

        if (status && status !== 'ALL') {
          query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ requests: data || [] });
      }

      // GET /api/wallet?action=admin_topups — list QR wallet top-up requests (admin only)
      case 'admin_topups': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const status = req.query.status as string;

        let query = supabase
          .from('wallet_transactions')
          .select('*')
          .eq('type', 'deposit')
          .ilike('description', 'Wallet deposit via QR%')
          .order('created_at', { ascending: false });

        if (status && status !== 'ALL') {
          query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ transactions: data || [] });
      }

      // POST /api/wallet?action=admin_update_cashout — update cashout status (admin)
      case 'admin_update_cashout': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { requestId, status, adminNotes } = req.body;
        if (!requestId || !status) return res.status(400).json({ error: 'requestId and status required' });

        const updateData: any = { status, updated_at: new Date().toISOString() };
        if (adminNotes !== undefined) updateData.admin_notes = adminNotes;

        const { data: updatedRequest, error: updateError } = await supabase
          .from('cashout_requests')
          .update(updateData)
          .eq('id', requestId)
          .select()
          .single();

        if (updateError) return res.status(500).json({ error: updateError.message });

        // If completed, record a cashout transaction in wallet_transactions
        if (status === 'completed' && updatedRequest) {
          await supabase.from('wallet_transactions').insert({
            restaurant_id: updatedRequest.restaurant_id,
            amount: updatedRequest.amount,
            type: 'cashout',
            status: 'completed',
            description: `Cashout #${updatedRequest.id.slice(0, 8)} - Transferred to ${updatedRequest.bank_name}`,
          });
        }

        return res.status(200).json({ request: updatedRequest });
      }

      // POST /api/wallet?action=admin_update_topup — approve or reject QR wallet top-ups (admin)
      case 'admin_update_topup': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { transactionId, status } = req.body || {};

        if (!transactionId || !status) {
          return res.status(400).json({ error: 'transactionId and status required' });
        }

        if (!['completed', 'rejected'].includes(status)) {
          return res.status(400).json({ error: 'status must be completed or rejected' });
        }

        const { data: existingTransaction, error: existingTransactionError } = await supabase
          .from('wallet_transactions')
          .select('*')
          .eq('id', transactionId)
          .single();

        if (existingTransactionError || !existingTransaction) {
          return res.status(404).json({ error: 'Top up request not found' });
        }

        if (existingTransaction.type !== 'deposit' || !isQrDepositDescription(existingTransaction.description)) {
          return res.status(400).json({ error: 'Transaction is not a QR wallet top up' });
        }

        if (existingTransaction.status !== 'pending') {
          return res.status(409).json({ error: 'Top up request has already been reviewed' });
        }

        const { data: updatedTransaction, error: updateError } = await supabase
          .from('wallet_transactions')
          .update({
            status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', transactionId)
          .select()
          .single();

        if (updateError) return res.status(500).json({ error: updateError.message });

        const balance = await getCompletedWalletBalance(existingTransaction.restaurant_id);
        return res.status(200).json({ transaction: updatedTransaction, balance });
      }

      // POST /api/wallet?action=record_sale — record an online sale transaction
      case 'record_sale': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { restaurantId, orderId, amount, description } = req.body;
        if (!restaurantId || !amount) return res.status(400).json({ error: 'restaurantId and amount required' });

        const { data, error } = await supabase
          .from('wallet_transactions')
          .insert({
            restaurant_id: restaurantId,
            order_id: orderId || null,
            amount,
            type: 'sale',
            status: 'completed',
            description: description || `Online order payment`,
          })
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ transaction: data });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('Wallet API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
