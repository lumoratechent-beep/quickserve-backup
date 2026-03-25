// Vercel serverless function: POST /api/stripe/webhook
// Handles Stripe webhook events for subscription lifecycle
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  supabaseServiceKey
);

const PLAN_PLATFORM_MAP: Record<string, { platformAccess: string; kitchenEnabled: boolean }> = {
  basic: { platformAccess: 'pos_only', kitchenEnabled: false },
  pro: { platformAccess: 'pos_and_qr', kitchenEnabled: false },
  pro_plus: { platformAccess: 'pos_and_qr', kitchenEnabled: true },
};

// Vercel requires raw body for Stripe signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabaseServiceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not configured.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing signature or webhook secret.' });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed.' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const restaurantId = session.metadata?.restaurant_id;
        const planId = session.metadata?.plan_id;
        let shouldUpdateFeaturesNow = true;

        if (!restaurantId) break;

        if (session.mode === 'subscription' && session.subscription) {
          // Recurring subscription created (with or without trial)
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          
          const isTrialing = subscription.status === 'trialing';
          const trialEnd = subscription.trial_end
            ? new Date(subscription.trial_end * 1000).toISOString()
            : null;

          const billingInterval = session.metadata?.billing_interval || 'monthly';

          const subItem = subscription.items.data[0];
          const periodStart = subItem?.current_period_start
            ? new Date(subItem.current_period_start * 1000).toISOString()
            : new Date(subscription.start_date * 1000).toISOString();
          const periodEnd = subItem?.current_period_end
            ? new Date(subItem.current_period_end * 1000).toISOString()
            : null;

          const subUpdate: Record<string, any> = {
              status: isTrialing ? 'trialing' : 'active',
              stripe_subscription_id: subscription.id,
              stripe_customer_id: session.customer as string,
              billing_interval: billingInterval,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              updated_at: new Date().toISOString(),
          };
          if (planId) subUpdate.plan_id = planId;
          if (isTrialing) {
            subUpdate.trial_start = new Date().toISOString();
            subUpdate.trial_end = trialEnd;
          }

          subUpdate.restaurant_id = restaurantId;
          const { error: subError } = await supabase
            .from('subscriptions')
            .upsert(subUpdate, { onConflict: 'restaurant_id' });

          if (subError) {
            console.error('Webhook: Failed to upsert subscription for', restaurantId, subError);
          }

          // Activate the vendor user now that card is saved
          await supabase
            .from('users')
            .update({ is_active: true })
            .eq('restaurant_id', restaurantId)
            .eq('role', 'VENDOR');

          // Update Stripe customer metadata for income tracking
          if (session.customer && typeof session.customer === 'string') {
            await stripe.customers.update(session.customer, {
              metadata: {
                restaurant_id: restaurantId,
                plan_id: planId || '',
                billing_interval: billingInterval,
              },
            });
          }
        } else if (session.mode === 'payment') {
          // Single payment renewal/change
          // If renew_from is set, extend from that date (not from today)
          const renewFrom = session.metadata?.renew_from;
          const billingInterval = session.metadata?.billing_interval || 'monthly';
          const changeType = session.metadata?.change_type || 'renew';
          const durationDays = billingInterval === 'annual' ? 365 : 30;
          const renewDate = renewFrom ? new Date(renewFrom) : null;
          const isFutureRenew = renewDate ? renewDate > new Date() : false;

          if (changeType === 'downgrade' && isFutureRenew) {
            shouldUpdateFeaturesNow = false;
          }

          const isScheduledDowngrade = changeType === 'downgrade' && isFutureRenew;

          if (isScheduledDowngrade) {
            // Scheduled downgrade: only set pending fields, don't touch current plan or period
            await supabase
              .from('subscriptions')
              .update({
                pending_plan_id: planId || null,
                pending_billing_interval: billingInterval,
                pending_change_effective_at: (renewDate || new Date()).toISOString(),
                stripe_customer_id: session.customer as string,
                updated_at: new Date().toISOString(),
              })
              .eq('restaurant_id', restaurantId);
          } else {
            // Immediate change (upgrade, renew, or expired downgrade)
            let periodStart: Date;
            if (renewFrom) {
              periodStart = renewDate && renewDate > new Date() ? renewDate : new Date();
            } else {
              periodStart = new Date();
            }
            const periodEnd = new Date(periodStart);
            periodEnd.setDate(periodEnd.getDate() + durationDays);

            const subscriptionUpdate: Record<string, any> = {
              status: 'active',
              stripe_customer_id: session.customer as string,
              current_period_start: periodStart.toISOString(),
              current_period_end: periodEnd.toISOString(),
              updated_at: new Date().toISOString(),
              billing_interval: billingInterval,
              pending_plan_id: null,
              pending_billing_interval: null,
              pending_change_effective_at: null,
            };
            if (planId) subscriptionUpdate.plan_id = planId;

            subscriptionUpdate.restaurant_id = restaurantId;
            await supabase
              .from('subscriptions')
              .upsert(subscriptionUpdate, { onConflict: 'restaurant_id' });
          }

          // Keep metadata in Stripe for easier support/debugging in dashboard.
          if (session.customer && typeof session.customer === 'string') {
            await stripe.customers.update(session.customer, {
              metadata: {
                restaurant_id: restaurantId,
                plan_id: planId || '',
                billing_interval: billingInterval,
                last_change_type: changeType,
              },
            });
          }
        }

        // Update restaurant features based on plan
        if (shouldUpdateFeaturesNow && planId && PLAN_PLATFORM_MAP[planId]) {
          const { platformAccess, kitchenEnabled } = PLAN_PLATFORM_MAP[planId];
          await supabase
            .from('restaurants')
            .update({ platform_access: platformAccess, kitchen_enabled: kitchenEnabled })
            .eq('id', restaurantId);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const restaurantId = subscription.metadata?.restaurant_id;
        if (!restaurantId) break;

        const statusMap: Record<string, string> = {
          active: 'active',
          trialing: 'trialing',
          past_due: 'past_due',
          canceled: 'canceled',
          unpaid: 'unpaid',
          incomplete: 'pending_payment',
          incomplete_expired: 'canceled',
        };

        const subItem = subscription.items.data[0];
        const periodStart = subItem?.current_period_start
          ? new Date(subItem.current_period_start * 1000).toISOString()
          : new Date(subscription.start_date * 1000).toISOString();
        const periodEnd = subItem?.current_period_end
          ? new Date(subItem.current_period_end * 1000).toISOString()
          : null;

        // Also update plan_id from metadata so the webhook acts as a safety net
        const planId = subscription.metadata?.plan_id;

        await supabase
          .from('subscriptions')
          .update({
            status: statusMap[subscription.status] || subscription.status,
            ...(planId ? { plan_id: planId } : {}),
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          })
          .eq('restaurant_id', restaurantId);

        // Update restaurant features based on plan
        if (planId && PLAN_PLATFORM_MAP[planId]) {
          const { platformAccess, kitchenEnabled } = PLAN_PLATFORM_MAP[planId];
          await supabase
            .from('restaurants')
            .update({ platform_access: platformAccess, kitchen_enabled: kitchenEnabled })
            .eq('id', restaurantId);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const restaurantId = subscription.metadata?.restaurant_id;
        if (!restaurantId) break;

        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('restaurant_id', restaurantId);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.parent?.subscription_details?.subscription
          ? (typeof invoice.parent.subscription_details.subscription === 'string'
            ? invoice.parent.subscription_details.subscription
            : invoice.parent.subscription_details.subscription)
          : null;
        if (!subscriptionId) break;

        await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscriptionId);
        break;
      }

      default:
        // Unhandled event type
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
}
