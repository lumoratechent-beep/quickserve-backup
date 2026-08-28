import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, ReceiptText } from 'lucide-react';

type ReceiptItem = {
  name?: string;
  quantity?: number;
  price?: number;
  originalPrice?: number;
  selectedSize?: string;
  selectedTemp?: string;
  selectedOtherVariant?: string;
  otherVariantName?: string;
  selectedVariantOption?: string;
  selectedModifiers?: Record<string, string>;
  selectedMixMatch?: Array<{ label?: string; choice?: string; priceModifier?: number }>;
  selectedAddOns?: Array<{ name?: string; quantity?: number; price?: number }>;
};

type ReceiptSnapshot = {
  status?: string;
  orderId?: string;
  paidAt?: string;
  businessName?: string;
  businessAddressLine1?: string;
  businessAddressLine2?: string;
  businessCity?: string;
  businessState?: string;
  businessCountry?: string;
  businessPhone?: string;
  headerText?: string;
  footerText?: string;
  currency?: string;
  items?: ReceiptItem[];
  subtotal?: number;
  discountAmount?: number;
  taxes?: Array<{ name?: string; percentage?: number; amount?: number }>;
  total?: number;
  tableNumber?: string;
  diningType?: string;
  paymentMethod?: string;
  cashierName?: string;
  amountReceived?: number | null;
  changeAmount?: number | null;
};

interface Props { token: string }

const loadImageDataUrl = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Logo could not be loaded.');
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Logo could not be read.'));
    reader.readAsDataURL(blob);
  });
};

const getItemDetails = (item: ReceiptItem, formatMoney: (value: unknown) => string): string[] => {
  const details: string[] = [];
  if (item.selectedSize) details.push(`Size: ${item.selectedSize}`);
  if (item.selectedTemp) details.push(`Temperature: ${item.selectedTemp}`);
  if (item.selectedOtherVariant) details.push(`${item.otherVariantName || 'Option'}: ${item.selectedOtherVariant}`);
  if (item.selectedVariantOption) details.push(`Variant: ${item.selectedVariantOption}`);
  Object.entries(item.selectedModifiers || {}).forEach(([label, value]) => {
    if (value) details.push(`${label}: ${value}`);
  });
  (item.selectedMixMatch || []).forEach(selection => {
    if (!selection.choice) return;
    const price = Number(selection.priceModifier || 0);
    details.push(`${selection.label || 'Selection'}: ${selection.choice}${price ? ` (+${formatMoney(price)})` : ''}`);
  });
  (item.selectedAddOns || []).forEach(addOn => {
    const quantity = Number(addOn.quantity || 1);
    const price = Number(addOn.price || 0) * quantity;
    details.push(`Add-on: ${addOn.name || 'Add-on'}${quantity > 1 ? ` ×${quantity}` : ''}${price ? ` (+${formatMoney(price)})` : ''}`);
  });
  return details;
};

const EReceiptPage: React.FC<Props> = ({ token }) => {
  const [receipt, setReceipt] = useState<ReceiptSnapshot | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/e-receipt?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Unable to load this receipt.');
        return body;
      })
      .then(body => {
        if (!active) return;
        setReceipt(body.receipt || null);
        setExpiresAt(body.expiresAt || '');
      })
      .catch(err => active && setError(err.message || 'Unable to load this receipt.'));
    return () => { active = false; };
  }, [token]);

  const formatter = useMemo(() => new Intl.NumberFormat('en-MY', {
    style: 'currency', currency: receipt?.currency || 'MYR', minimumFractionDigits: 2,
  }), [receipt?.currency]);
  const money = (value: unknown) => formatter.format(Number(value || 0));

  const downloadPdf = async () => {
    if (!receipt || downloading) return;
    setDownloading(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const left = 18;
      const right = 192;
      let y = 20;
      const addLine = (text: string, options?: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; gap?: number }) => {
        if (y > 276) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
        doc.setFontSize(options?.size || 10);
        const align = options?.align || 'left';
        const x = align === 'center' ? 105 : align === 'right' ? right : left;
        doc.text(String(text || ''), x, y, { align });
        y += options?.gap || 6;
      };
      const addPair = (label: string, value: string, bold = false) => {
        if (y > 276) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(10);
        doc.text(label, left, y);
        doc.text(value, right, y, { align: 'right' });
        y += 6;
      };

      addLine(receipt.businessName || 'QuickServe', { bold: true, size: 17, align: 'center', gap: 8 });
      [receipt.businessAddressLine1, receipt.businessAddressLine2,
        [receipt.businessCity, receipt.businessState, receipt.businessCountry].filter(Boolean).join(', '),
        receipt.businessPhone].filter(Boolean).forEach(line => addLine(String(line), { align: 'center', gap: 5 }));
      if (receipt.headerText) addLine(receipt.headerText, { align: 'center', gap: 7 });
      y += 2; doc.line(left, y, right, y); y += 7;
      addLine('E-PAYMENT RECEIPT', { bold: true, size: 13, align: 'center', gap: 8 });
      addPair('Order', `#${receipt.orderId || ''}`);
      addPair('Paid', new Date(receipt.paidAt || Date.now()).toLocaleString('en-MY'));
      if (receipt.tableNumber) addPair('Table', receipt.tableNumber);
      if (receipt.diningType) addPair('Dining', receipt.diningType);
      y += 2; doc.line(left, y, right, y); y += 7;
      (receipt.items || []).forEach(item => {
        addPair(`${Number(item.quantity || 1)}x ${item.name || 'Item'}`, money(Number(item.price || 0) * Number(item.quantity || 1)), true);
        getItemDetails(item, money).forEach(detail => addLine(`  ${detail}`, { size: 9, gap: 5 }));
      });
      y += 2; doc.line(left, y, right, y); y += 7;
      if (Number(receipt.discountAmount || 0) > 0) {
        addPair('Subtotal', money(receipt.subtotal));
        addPair('Discount', `-${money(receipt.discountAmount)}`);
      }
      (receipt.taxes || []).forEach(tax => addPair(`${tax.name || 'Tax'}${tax.percentage ? ` (${tax.percentage}%)` : ''}`, money(tax.amount)));
      addPair('TOTAL', money(receipt.total), true);
      if (receipt.paymentMethod) addPair('Paid by', receipt.paymentMethod);
      if (receipt.cashierName) addPair('Cashier', receipt.cashierName);
      if (receipt.amountReceived != null) addPair('Amount received', money(receipt.amountReceived));
      if (receipt.changeAmount != null) addPair('Change', money(receipt.changeAmount));
      if (receipt.status === 'REFUNDED') addLine('REFUNDED', { bold: true, size: 13, align: 'center', gap: 9 });
      if (receipt.footerText) { y += 4; addLine(receipt.footerText, { align: 'center' }); }
      if (y > 252) { doc.addPage(); y = 20; }
      y += 8;
      try {
        const quickServeLogo = await loadImageDataUrl('/LOGO/6.png');
        doc.addImage(quickServeLogo, 'PNG', 98, y, 14, 14, 'quickserve-mark', 'FAST');
        y += 18;
      } catch (logoError) {
        console.warn('QuickServe logo was omitted from the PDF:', logoError);
      }
      addLine('Powered by QuickServe POS', { size: 8, align: 'center', gap: 5 });
      doc.save(`QuickServe-Receipt-${receipt.orderId || token}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      setError('The PDF could not be generated. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (error) return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-5">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
        <ReceiptText className="mx-auto mb-4 text-gray-300" size={48} />
        <h1 className="text-xl font-black text-gray-900">E-receipt unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500">{error}</p>
      </section>
    </main>
  );

  if (!receipt) return <main className="min-h-screen bg-gray-100 flex items-center justify-center"><Loader2 className="animate-spin text-orange-500" size={38} /></main>;

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 text-gray-900">
      <div className="mx-auto w-full max-w-md">
        <section className="overflow-hidden rounded-3xl bg-white shadow-xl">
          <div className="bg-gray-900 px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <img src="/LOGO/9-dark.png" alt="QuickServe" className="h-9 w-auto max-w-[190px] object-contain" />
              <span className="text-xs font-black uppercase tracking-[0.2em] text-white">E-receipt</span>
            </div>
          </div>
          <div className="p-6">
            <div className="text-center">
              <h1 className="text-2xl font-black">{receipt.businessName || 'QuickServe'}</h1>
              {[receipt.businessAddressLine1, receipt.businessAddressLine2, [receipt.businessCity, receipt.businessState, receipt.businessCountry].filter(Boolean).join(', '), receipt.businessPhone].filter(Boolean).map((line, index) => <p key={index} className="mt-1 text-xs text-gray-500">{line}</p>)}
              {receipt.headerText && <p className="mt-3 text-sm font-semibold">{receipt.headerText}</p>}
            </div>
            <div className="my-5 border-t border-dashed border-gray-300" />
            <div className="flex justify-between text-xs"><span className="text-gray-500">Order</span><span className="font-black">#{receipt.orderId}</span></div>
            <div className="mt-2 flex justify-between text-xs"><span className="text-gray-500">Paid</span><span className="font-semibold">{new Date(receipt.paidAt || Date.now()).toLocaleString('en-MY')}</span></div>
            {receipt.tableNumber && <div className="mt-2 flex justify-between text-xs"><span className="text-gray-500">Table</span><span className="font-semibold">{receipt.tableNumber}</span></div>}
            {receipt.diningType && <div className="mt-2 flex justify-between text-xs"><span className="text-gray-500">Dining</span><span className="font-semibold">{receipt.diningType}</span></div>}
            {receipt.status === 'REFUNDED' && <div className="mt-4 rounded-xl bg-red-50 py-2 text-center text-xs font-black text-red-600">REFUNDED</div>}
            <div className="my-5 border-t border-dashed border-gray-300" />
            <div className="space-y-4">
              {(receipt.items || []).map((item, index) => (
                <div key={index} className="flex gap-3 text-sm">
                  <span className="font-black">{Number(item.quantity || 1)}x</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{item.name || 'Item'}</p>
                    {getItemDetails(item, money).map((detail, detailIndex) => <p key={detailIndex} className="mt-1 text-xs leading-4 text-gray-500">{detail}</p>)}
                  </div>
                  <span className="font-bold">{money(Number(item.price || 0) * Number(item.quantity || 1))}</span>
                </div>
              ))}
            </div>
            <div className="my-5 border-t border-dashed border-gray-300" />
            <div className="space-y-2 text-sm">
              {Number(receipt.discountAmount || 0) > 0 && <><div className="flex justify-between"><span>Subtotal</span><span>{money(receipt.subtotal)}</span></div><div className="flex justify-between text-green-600"><span>Discount</span><span>-{money(receipt.discountAmount)}</span></div></>}
              {(receipt.taxes || []).map((tax, index) => <div key={index} className="flex justify-between"><span>{tax.name || 'Tax'}{tax.percentage ? ` (${tax.percentage}%)` : ''}</span><span>{money(tax.amount)}</span></div>)}
              <div className="flex justify-between pt-2 text-lg font-black"><span>Total</span><span>{money(receipt.total)}</span></div>
              {receipt.paymentMethod && <div className="flex justify-between pt-2 text-xs text-gray-500"><span>Paid by</span><span>{receipt.paymentMethod}</span></div>}
              {receipt.cashierName && <div className="flex justify-between text-xs text-gray-500"><span>Cashier</span><span>{receipt.cashierName}</span></div>}
              {receipt.amountReceived != null && <div className="flex justify-between text-xs text-gray-500"><span>Amount received</span><span>{money(receipt.amountReceived)}</span></div>}
              {receipt.changeAmount != null && <div className="flex justify-between text-xs text-gray-500"><span>Change</span><span>{money(receipt.changeAmount)}</span></div>}
            </div>
            {receipt.footerText && <p className="mt-7 text-center text-xs text-gray-500">{receipt.footerText}</p>}
          </div>
        </section>
        <button onClick={downloadPdf} disabled={downloading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 px-5 py-4 text-sm font-black text-white shadow-lg disabled:opacity-60">{downloading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />} Download PDF</button>
        {expiresAt && <p className="mt-4 text-center text-xs text-gray-500">Available until {new Date(expiresAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
      </div>
    </main>
  );
};

export default EReceiptPage;
