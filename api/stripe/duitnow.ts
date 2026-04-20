// Vercel serverless function: /api/stripe/duitnow
// DuitNow QR payment management — submit, review (approve/reject), list
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  try {
    switch (action) {
      // POST /api/stripe/duitnow?action=submit
      // Vendor submits a DuitNow payment request
      case 'submit': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { restaurantId, planId, billingInterval, amount, attachmentUrl, referenceNumber } = req.body || {};

        if (!restaurantId || !planId || !amount) {
          return res.status(400).json({ error: 'restaurantId, planId, and amount are required.' });
        }

        // Verify DuitNow is enabled for this restaurant
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('duitnow_enabled')
          .eq('restaurant_id', restaurantId)
          .single();

        if (!sub?.duitnow_enabled) {
          return res.status(403).json({ error: 'DuitNow payment is not enabled for this restaurant.' });
        }

        // Check for existing pending payment
        const { data: existing } = await supabase
          .from('duitnow_payments')
          .select('id')
          .eq('restaurant_id', restaurantId)
          .eq('status', 'pending')
          .limit(1);

        if (existing && existing.length > 0) {
          return res.status(409).json({ error: 'You already have a pending DuitNow payment. Please wait for admin review.' });
        }

        // Sanitize inputs
        const safeRef = referenceNumber ? String(referenceNumber).slice(0, 100) : null;
        const safeAttachment = attachmentUrl ? String(attachmentUrl).slice(0, 500) : null;

        const { data: payment, error: insertErr } = await supabase
          .from('duitnow_payments')
          .insert({
            restaurant_id: restaurantId,
            plan_id: planId,
            billing_interval: billingInterval || 'monthly',
            amount: Number(amount),
            status: 'pending',
            attachment_url: safeAttachment,
            reference_number: safeRef,
          })
          .select()
          .single();

        if (insertErr) {
          console.error('DuitNow submit error:', insertErr);
          return res.status(500).json({ error: 'Failed to submit payment request.' });
        }

        return res.status(200).json({ success: true, payment });
      }

      // GET /api/stripe/duitnow?action=list&restaurantId=...
      // Vendor: list own payments. Admin: list all (if no restaurantId)
      case 'list': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const restaurantId = req.query.restaurantId as string;
        const statusFilter = req.query.status as string;

        let query = supabase
          .from('duitnow_payments')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (restaurantId) {
          query = query.eq('restaurant_id', restaurantId);
        }
        if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
          query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;
        if (error) {
          return res.status(500).json({ error: 'Failed to fetch DuitNow payments.' });
        }

        // If admin view (no restaurantId), enrich with restaurant names
        if (!restaurantId && data) {
          const restIds = [...new Set(data.map((d: any) => d.restaurant_id))];
          if (restIds.length > 0) {
            const { data: rests } = await supabase
              .from('restaurants')
              .select('id, name')
              .in('id', restIds);

            const nameMap: Record<string, string> = {};
            rests?.forEach((r: any) => { nameMap[r.id] = r.name; });

            data.forEach((d: any) => {
              d.restaurant_name = nameMap[d.restaurant_id] || 'Unknown';
            });
          }
        }

        return res.status(200).json({ payments: data || [] });
      }

      // POST /api/stripe/duitnow?action=review
      // Admin approves or rejects a DuitNow payment
      case 'review': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { paymentId, decision, adminNote } = req.body || {};

        if (!paymentId || !decision) {
          return res.status(400).json({ error: 'paymentId and decision (approved/rejected) are required.' });
        }

        if (!['approved', 'rejected'].includes(decision)) {
          return res.status(400).json({ error: 'decision must be "approved" or "rejected".' });
        }

        // Fetch the payment
        const { data: payment, error: fetchErr } = await supabase
          .from('duitnow_payments')
          .select('*')
          .eq('id', paymentId)
          .single();

        if (fetchErr || !payment) {
          return res.status(404).json({ error: 'Payment not found.' });
        }

        if (payment.status !== 'pending') {
          return res.status(409).json({ error: 'Payment has already been reviewed.' });
        }

        // Update payment status
        const { error: updateErr } = await supabase
          .from('duitnow_payments')
          .update({
            status: decision,
            admin_note: adminNote ? String(adminNote).slice(0, 500) : null,
            reviewed_by: 'admin',
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', paymentId);

        if (updateErr) {
          return res.status(500).json({ error: 'Failed to update payment.' });
        }

        // If approved, extend subscription (same as admin-extend paid)
        if (decision === 'approved') {
          const restaurantId = payment.restaurant_id;
          const planId = payment.plan_id || 'basic';
          const billingInterval = payment.billing_interval || 'monthly';
          const isAnnual = billingInterval === 'annual';

          const { data: sub } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .single();

          if (sub) {
            const currentEnd = sub.current_period_end || sub.trial_end;
            const baseDate = currentEnd && new Date(currentEnd) > new Date()
              ? new Date(currentEnd)
              : new Date();
            const newEnd = new Date(baseDate);
            newEnd.setDate(newEnd.getDate() + (isAnnual ? 365 : 30));

            await supabase
              .from('subscriptions')
              .update({
                status: 'active',
                plan_id: planId,
                billing_interval: billingInterval,
                current_period_start: baseDate.toISOString(),
                current_period_end: newEnd.toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('restaurant_id', restaurantId);

            // Update kitchen_enabled based on plan
            const kitchenEnabled = planId === 'pro_plus';
            await supabase
              .from('restaurants')
              .update({ kitchen_enabled: kitchenEnabled })
              .eq('id', restaurantId);

            // Record in billing_records
            const { data: rest } = await supabase
              .from('restaurants').select('name').eq('id', restaurantId).single();

            await supabase.from('billing_records').insert({
              restaurant_id: restaurantId,
              description: `DuitNow Payment (${isAnnual ? 'Annual' : 'Monthly'})`,
              amount: Number(payment.amount),
              type: 'paid',
              gross: Number(payment.amount),
              fee: 0,
              net: Number(payment.amount),
              plan_id: planId,
              restaurant_name: rest?.name || 'Unknown',
              created_by: 'duitnow',
            });

            return res.status(200).json({
              success: true,
              decision: 'approved',
              newPeriodEnd: newEnd.toISOString(),
            });
          }
        }

        return res.status(200).json({ success: true, decision });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Use: submit, list, review' });
    }
  } catch (err: any) {
    console.error(`DuitNow API error (${action}):`, err);
    return res.status(500).json({ error: err?.message || `DuitNow operation failed: ${action}` });
  }
}
