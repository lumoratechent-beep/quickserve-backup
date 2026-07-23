import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Building2, ImagePlus, Loader2, Receipt, Upload, X } from 'lucide-react';

export interface FirstTimeSetupValues {
  businessName: string;
  businessAddressLine1: string;
  businessAddressLine2: string;
  businessPhone: string;
  logoFile?: File;
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
    setError('');
    setIsSubmitting(true);
    try {
      await onComplete({
        businessName: businessName.trim(),
        businessAddressLine1: businessAddressLine1.trim(),
        businessAddressLine2: businessAddressLine2.trim(),
        businessPhone: businessPhone.trim(),
        logoFile: logoFile || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup could not be completed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden bg-gray-950/60 p-2 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-time-setup-title"
    >
      <div className="w-full max-w-[560px] overflow-hidden rounded-[1.75rem] border border-white/20 bg-gray-50 shadow-2xl dark:bg-gray-900">
        <div className="px-5 pb-3 pt-4 text-center sm:px-6">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-orange-500">First-time setup</p>
          <h1 id="first-time-setup-title" className="mt-1 text-xl font-black tracking-tight text-gray-900 dark:text-white sm:text-2xl">Let's set up your store</h1>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">Two quick steps, then you're ready to sell and print.</p>
          <div className="mt-3 flex items-center justify-center gap-2" aria-label={`Setup page ${page + 1} of 2`}>
            {[0, 1].map(index => (
              <button
                key={index}
                type="button"
                onClick={() => index === 0 ? setPage(0) : continueToLogo()}
                className={`h-2.5 rounded-full transition-all duration-300 ${page === index ? 'w-7 bg-orange-500' : 'w-2.5 bg-gray-300 hover:bg-orange-300 dark:bg-gray-600'}`}
                aria-label={`Go to setup page ${index + 1}`}
                aria-current={page === index ? 'step' : undefined}
              />
            ))}
          </div>
        </div>

        <div className="mx-3 mb-3 flex h-[370px] flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-lg shadow-gray-200/70 dark:border-gray-700 dark:bg-gray-800 dark:shadow-none sm:mx-4 sm:mb-4">
          {error && (
            <div className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {page === 0 ? (
            <section key="business" className="qs-setup-page-enter flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center gap-3 rounded-xl bg-orange-50 p-3 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">
                <Receipt size={19} className="shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-black">Business Information</p>
                  <p className="mt-0.5 text-[10px] font-medium leading-relaxed sm:text-[11px]">Saved to Receipt Settings for printing. You can change these details anytime later.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="mb-1 ml-1 block text-[10px] font-bold text-gray-700 dark:text-gray-300 sm:text-xs">Business Name</label>
                  <div className="relative">
                    <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input autoFocus value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Your store name" className="w-full min-w-0 rounded-xl border-none bg-gray-50 py-2.5 pl-9 pr-3 text-xs font-medium focus:ring-2 focus:ring-orange-500 dark:bg-gray-700 dark:text-white sm:text-sm" />
                  </div>
                </div>
                <div className="min-w-0">
                  <label className="mb-1 ml-1 block text-[10px] font-bold text-gray-700 dark:text-gray-300 sm:text-xs">Business Phone</label>
                  <input type="tel" value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} placeholder="+60 12-345 6789" className="w-full min-w-0 rounded-xl border-none bg-gray-50 px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-orange-500 dark:bg-gray-700 dark:text-white sm:text-sm" />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 ml-1 block text-[10px] font-bold text-gray-700 dark:text-gray-300 sm:text-xs">Address Line 1 <span className="font-medium text-gray-400">(optional)</span></label>
                  <input value={businessAddressLine1} onChange={e => setBusinessAddressLine1(e.target.value)} placeholder="Street address" className="w-full min-w-0 rounded-xl border-none bg-gray-50 px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-orange-500 dark:bg-gray-700 dark:text-white sm:text-sm" />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 ml-1 block text-[10px] font-bold text-gray-700 dark:text-gray-300 sm:text-xs">Address Line 2 <span className="font-medium text-gray-400">(optional)</span></label>
                  <input value={businessAddressLine2} onChange={e => setBusinessAddressLine2(e.target.value)} placeholder="Unit, city, state" className="w-full min-w-0 rounded-xl border-none bg-gray-50 px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-orange-500 dark:bg-gray-700 dark:text-white sm:text-sm" />
                </div>
              </div>

              <button type="button" onClick={continueToLogo} className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-xs font-black text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600 active:scale-[0.99] dark:shadow-none sm:text-sm">
                Continue <ArrowRight size={17} />
              </button>
            </section>
          ) : (
            <section key="logo" className="qs-setup-page-enter flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center gap-3 rounded-xl bg-orange-50 p-3 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">
                <ImagePlus size={19} className="shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-black">Add your store logo <span className="font-medium text-orange-500/80">(optional)</span></p>
                  <p className="mt-0.5 text-[10px] font-medium leading-relaxed sm:text-[11px]">Add one now or continue without it. You can upload a logo later.</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
                onDragOver={e => e.preventDefault()}
                className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-4 transition-colors hover:border-orange-400 dark:border-gray-600 dark:bg-gray-700/50"
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Business logo preview" className="h-32 w-32 rounded-2xl object-cover shadow-lg" />
                ) : (
                  <>
                    <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-500 dark:bg-orange-900/30"><Upload size={21} /></span>
                    <span className="text-xs font-black text-gray-800 dark:text-white sm:text-sm">Choose or drop your logo</span>
                    <span className="mt-1 text-[10px] font-medium text-gray-400 sm:text-xs">PNG, JPG or WEBP · maximum 5 MB</span>
                  </>
                )}
              </button>
              {logoFile && (
                <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-700">
                  <span className="min-w-0 truncate text-[10px] font-bold text-gray-600 dark:text-gray-300 sm:text-xs">{logoFile.name}</span>
                  <button type="button" onClick={() => setLogoFile(null)} className="ml-3 rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20" aria-label="Remove logo"><X size={15} /></button>
                </div>
              )}
              <div className="mt-auto grid grid-cols-[auto_1fr] gap-3">
                <button type="button" onClick={() => { setError(''); setPage(0); }} className="rounded-xl bg-gray-100 px-5 py-3 text-xs font-black text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:text-sm">Back</button>
                <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-xs font-black text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-none sm:text-sm">
                  {isSubmitting ? <><Loader2 size={17} className="animate-spin" /> Saving...</> : (logoFile ? 'Finish Setup' : 'Skip Logo & Finish')}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default FirstTimeSetupPage;
