import type { SupabaseClient } from '@supabase/supabase-js';

export type SubscriptionPaymentProvider = 'stripe' | 'duitnow' | 'wallet';
export type SubscriptionPaymentStatus = 'pending' | 'succeeded' | 'failed' | 'approved' | 'rejected' | 'cancelled';

export interface SubscriptionPaymentInput {
  restaurantId: string;
  provider: SubscriptionPaymentProvider;
  status: SubscriptionPaymentStatus;
  providerReference: string;
  billingRecordId?: string | null;
  walletTransactionId?: string | null;
  duitnowPaymentId?: string | null;
}

export interface SubscriptionPaymentPatch {
  status?: SubscriptionPaymentStatus;
  billingRecordId?: string | null;
}

function isSubscriptionPaymentsUnavailable(error: any): boolean {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01'
    || code === 'PGRST205'
    || message.includes('subscription_payments')
    && (message.includes('does not exist') || message.includes('schema cache'));
}

export async function upsertSubscriptionPayment(
  supabase: SupabaseClient,
  input: SubscriptionPaymentInput
): Promise<string | null> {
  if (!input.restaurantId || !input.providerReference) return null;

  const payload = {
    restaurant_id: input.restaurantId,
    provider: input.provider,
    status: input.status,
    provider_reference: input.providerReference,
    billing_record_id: input.billingRecordId || null,
    wallet_transaction_id: input.walletTransactionId || null,
    duitnow_payment_id: input.duitnowPaymentId || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('subscription_payments')
    .upsert(payload, { onConflict: 'provider,provider_reference' })
    .select('id')
    .maybeSingle();

  if (error) {
    if (!isSubscriptionPaymentsUnavailable(error)) {
      console.error('Subscription payment upsert failed:', error);
    }
    return null;
  }

  return data?.id || null;
}

export async function patchSubscriptionPayment(
  supabase: SupabaseClient,
  provider: SubscriptionPaymentProvider,
  providerReference: string | null | undefined,
  patch: SubscriptionPaymentPatch
): Promise<void> {
  if (!providerReference) return;

  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status) payload.status = patch.status;
  if ('billingRecordId' in patch) payload.billing_record_id = patch.billingRecordId || null;

  const { error } = await supabase
    .from('subscription_payments')
    .update(payload)
    .eq('provider', provider)
    .eq('provider_reference', providerReference);

  if (error && !isSubscriptionPaymentsUnavailable(error)) {
    console.error('Subscription payment patch failed:', error);
  }
}
