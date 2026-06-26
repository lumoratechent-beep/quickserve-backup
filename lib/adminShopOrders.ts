const todayInput = () => new Date().toISOString().split('T')[0];

const addDaysInput = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};

const quoteNumberForOrder = (orderId: string) => {
  const now = new Date();
  return `QS-SHOP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${orderId.slice(-5).toUpperCase()}`;
};

export const normalizeAdminShopItem = (item: any) => ({
  id: String(item?.id || ''),
  name: String(item?.name || ''),
  sku: String(item?.sku || ''),
  description: String(item?.description || ''),
  imageUrl: String(item?.imageUrl || item?.image_url || ''),
  price: Number(item?.price) || 0,
  costPrice: Number(item?.costPrice || item?.cost_price) || 0,
  category: String(item?.category || ''),
  isActive: item?.isActive ?? item?.is_active ?? true,
  createdAt: Number(item?.createdAt || Date.now()),
  updatedAt: Number(item?.updatedAt || Date.now()),
});

export const buildAdminShopQuotation = (order: any) => {
  const orderData = order?.order_data || order || {};
  const customer = orderData.customer || {};
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const now = Date.now();
  const orderId = String(order?.id || orderData.id || `shop_${now}`);

  return {
    id: `shop_quote_${orderId}`,
    quoteNo: quoteNumberForOrder(orderId),
    sellerLogo: '',
    sellerCompanyName: 'QuickServe',
    sellerInfo: 'QuickServe Shop',
    sellerAddress: '',
    sellerSsmNumber: '',
    customerName: String(customer.name || ''),
    customerEmail: String(customer.email || ''),
    customerPhone: String(customer.phone || ''),
    customerAddress: String(customer.address || ''),
    customerSsmNumber: '',
    companyName: String(customer.company || ''),
    issueDate: todayInput(),
    validUntil: addDaysInput(14),
    status: 'paid',
    notes: [
      'Paid order received from QuickServe Shop.',
      order?.stripe_session_id ? `Stripe session: ${order.stripe_session_id}` : '',
      orderData.customer?.notes ? `Customer note: ${orderData.customer.notes}` : '',
    ].filter(Boolean).join('\n'),
    terms: 'Payment received via Stripe Checkout. Fulfilment and onboarding will be handled by the QuickServe team.',
    discount: 0,
    taxRate: 0,
    items: items.map((item: any, index: number) => ({
      id: `line_${orderId}_${index}`,
      itemId: String(item.id || ''),
      lookupQuery: String(item.name || ''),
      description: [
        item.name,
        item.description,
        item.sku ? `SKU: ${item.sku}` : '',
        item.category ? `Category: ${item.category}` : '',
      ].filter(Boolean).join('\n'),
      quantity: Math.max(1, Number(item.quantity) || 1),
      unitPrice: Math.max(0, Number(item.price) || 0),
    })),
    createdAt: order?.created_at ? new Date(order.created_at).getTime() : now,
    updatedAt: Date.now(),
    source: 'admin_shop',
    shopOrderId: orderId,
    stripeSessionId: order?.stripe_session_id || null,
    paymentStatus: 'paid',
  };
};

export const ensureAdminShopQuotationForOrder = async (supabase: any, order: any) => {
  const quote = buildAdminShopQuotation(order);
  const total = quote.items.reduce((sum: number, item: any) => (
    sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
  ), 0);

  const { error } = await supabase.from('admin_quotations').upsert({
    id: quote.id,
    quote_no: quote.quoteNo,
    customer_name: quote.customerName,
    company_name: quote.companyName,
    status: quote.status,
    total,
    quote_data: quote,
    created_at: new Date(quote.createdAt).toISOString(),
    updated_at: new Date(quote.updatedAt).toISOString(),
  });

  if (error) throw error;
  return quote;
};

export const ensureAdminShopQuotationForSession = async (supabase: any, session: any) => {
  const orderId = session?.metadata?.admin_shop_order_id;
  let query = supabase.from('admin_shop_orders').select('*');
  query = orderId
    ? query.eq('id', orderId)
    : query.eq('stripe_session_id', session.id);
  const { data: order, error } = await query.maybeSingle();

  if (error) throw error;
  if (!order) throw new Error('Admin shop order was not found.');

  const paidAt = new Date().toISOString();
  const nextOrder = {
    ...order,
    status: 'paid',
    paid_at: order.paid_at || paidAt,
    stripe_session_id: order.stripe_session_id || session.id,
  };

  await supabase
    .from('admin_shop_orders')
    .update({
      status: 'paid',
      paid_at: nextOrder.paid_at,
      stripe_session_id: nextOrder.stripe_session_id,
      updated_at: paidAt,
    })
    .eq('id', order.id);

  return ensureAdminShopQuotationForOrder(supabase, nextOrder);
};
