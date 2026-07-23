import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Building2, ImagePlus, Loader2, Receipt, Upload, X } from 'lucide-react';

export interface FirstTimeSetupValues {
  businessName: string;
  businessAddressLine1: string;
  businessAddressLine2: string;
  businessPhone: string;
  logoFile: File;
}

interface Props {
  initialBusinessName: string;
  onComplete: (values: FirstTimeSetupValues) => Promise<void>;
}

const FirstTimeSetupPage: React.FC<Props> = ({ initialBusinessName, onComplete }) => {
  const [page, setPage] = useState(0);
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [businessAddressLine1, setBusinessAddressLine1] = useState('');
  const [businessAddressLine2, setBusinessAddressLine2] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview('');
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const continueToLogo = () => {
    setError('');
    if (!businessName.trim() || !businessPhone.trim()) {
      setError('Business name and phone are required.');
      return;
    }
    setPage(1);
  };

  const handleFile = (file?: File) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose a valid image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Logo must be smaller than 5 MB.');
      return;
    }
    setLogoFile(file);
  };

  const handleSubmit = async () => {
    if (!logoFile) {
      setError('Please upload your business logo.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await onComplete({
        businessName: businessName.trim(),
        businessAddressLine1: businessAddressLine1.trim(),
        businessAddressLine2: businessAddressLine2.trim(),
        businessPhone: businessPhone.trim(),
        logoFile,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup could not be completed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-gray-950/60 px-4 py-6 backdrop-blur-sm sm:py-10" role="dialog" aria-modal="true" aria-labelledby="first-time-setup-title">
      <div className="mx-auto w-full max-w-xl rounded-[2rem] border border-white/20 bg-gray-50 p-4 shadow-2xl dark:bg-gray-900 sm:p-6">
        <div className="mb-6 text-center">
          <img src="/LOGO/icon-192x192.png" alt="QuickServe logo" className="mx-auto mb-3 h-14 w-14 rounded-2xl object-contain" />
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-500">First-time setup</p>
          <h1 id="first-time-setup-title" className="mt-2 text-2xl font-black tracking-tight text-gray-900 dark:text-white sm:text-3xl">Let’s set up your store</h1>
          <p className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">Complete these details once, then you’re ready to sell and print.</p>
          <div className="mt-5 flex items-center justify-center gap-2" aria-label={`Setup page ${page + 1} of 2`}>
            {[0, 1].map(index => (
              <button key={index} type="button" onClick={() => index === 0 ? setPage(0) : continueToLogo()} className={`h-2.5 rounded-full transition-all duration-300 ${page === index ? 'w-7 bg-orange-500' : 'w-2.5 bg-gray-300 hover:bg-orange-300 dark:bg-gray-600'}`} aria-label={`Go to setup page ${index + 1}`} aria-current={page === index ? 'step' : undefined} />
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white p-5 shadow-2xl shadow-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:shadow-none sm:p-7">
          {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">{error}</div>}
          <div className="flex items-start transition-transform duration-700 ease-in-out" style={{ transform: `translateX(-${page * 100}%)` }}>
            <section className="w-full shrink-0 space-y-4 px-0.5" aria-hidden={page !== 0}>
              <div className="flex items-start gap-3 rounded-2xl bg-orange-50 p-4 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">
                <Receipt size={20} className="mt-0.5 shrink-0" />
                <div><p className="text-sm font-black">Business Information</p><p className="mt-1 text-xs font-medium leading-relaxed">These details automatically appear in Receipt Settings and on printed receipts.</p></div>
              </div>
              <div>
                <label className="mb-1.5 ml-1 block text-xs font-bold text-gray-700 dark:text-gray-300">Business Name</label>
                <div className="relative"><Building2 size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" /><input value={businessName} onChange={e => setBusinessName(e.target.value)} tabIndex={page === 0 ? 0 : -1} placeholder="Your store name" className="w-full rounded-xl border-none bg-gray-50 py-3 pl-10 pr-3 text-sm font-medium focus:ring-2 focus:ring-orange-500 dark:bg-gray-700 dark:text-white" /></div>
              </div>
              <div>
                <label className="mb-1.5 ml-1 block text-xs font-bold text-gray-700 dark:text-gray-300">Address Line 1 <span className="font-medium text-gray-400">(optional)</span></label>
                <input value={businessAddressLine1} onChange={e => setBusinessAddressLine1(e.target.value)} tabIndex={page === 0 ? 0 : -1} placeholder="Street address" className="w-full rounded-xl border-none bg-gray-50 px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-orange-500 dark:bg-gray-700 dark:text-white" />
              </div>
              <div>
                <label className="mb-1.5 ml-1 block text-xs font-bold text-gray-700 dark:text-gray-300">Address Line 2 <span className="font-medium text-gray-400">(optional)</span></label>
                <input value={businessAddressLine2} onChange={e => setBusinessAddressLine2(e.target.value)} tabIndex={page === 0 ? 0 : -1} placeholder="Suite, unit, city, state" className="w-full rounded-xl border-none bg-gray-50 px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-orange-500 dark:bg-gray-700 dark:text-white" />
              </div>
              <div>
                <label className="mb-1.5 ml-1 block text-xs font-bold text-gray-700 dark:text-gray-300">Business Phone</label>
                <input type="tel" value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} tabIndex={page === 0 ? 0 : -1} placeholder="+60 12-345 6789" className="w-full rounded-xl border-none bg-gray-50 px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-orange-500 dark:bg-gray-700 dark:text-white" />
              </div>
              <button type="button" onClick={continueToLogo} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-sm font-black text-white shadow-xl shadow-orange-100 transition-all hover:scale-[1.01] hover:bg-orange-600 active:scale-95 dark:shadow-none">Continue <ArrowRight size={18} /></button>
            </section>

            <section className="w-full shrink-0 space-y-5 px-0.5" aria-hidden={page !== 1}>
              <div className="flex items-start gap-3 rounded-2xl bg-orange-50 p-4 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">
                <ImagePlus size={20} className="mt-0.5 shrink-0" />
                <div><p className="text-sm font-black">Store Logo</p><p className="mt-1 text-xs font-medium leading-relaxed">Upload a clear square image for your store profile and customer-facing pages.</p></div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
              <button type="button" onClick={() => fileInputRef.current?.click()} onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }} onDragOver={e => e.preventDefault()} className="relative flex min-h-64 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 transition-colors hover:border-orange-400 dark:border-gray-600 dark:bg-gray-700/50">
                {logoPreview ? <img src={logoPreview} alt="Business logo preview" className="h-44 w-44 rounded-3xl object-cover shadow-lg" /> : <><span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-500 dark:bg-orange-900/30"><Upload size={25} /></span><span className="text-sm font-black text-gray-800 dark:text-white">Choose or drop your logo</span><span className="mt-1 text-xs font-medium text-gray-400">PNG, JPG or WEBP · maximum 5 MB</span></>}
              </button>
              {logoFile && <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-700"><span className="min-w-0 truncate text-xs font-bold text-gray-600 dark:text-gray-300">{logoFile.name}</span><button type="button" onClick={() => setLogoFile(null)} className="ml-3 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20" aria-label="Remove logo"><X size={16} /></button></div>}
              <div className="grid grid-cols-[auto_1fr] gap-3">
                <button type="button" onClick={() => { setError(''); setPage(0); }} className="rounded-xl bg-gray-100 px-5 py-3.5 text-sm font-black text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">Back</button>
                <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-sm font-black text-white shadow-xl shadow-orange-100 transition-all hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-none">{isSubmitting ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : 'Finish Setup'}</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirstTimeSetupPage;
