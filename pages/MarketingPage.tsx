
import React from 'react';
import { CheckCircle2, Laptop, Smartphone, Zap, DollarSign, MessageSquare, ArrowRight, ShieldCheck, Globe, Clock } from 'lucide-react';

interface Props {
  onGetStarted: () => void;
}

const MarketingPage: React.FC<Props> = ({ onGetStarted }) => {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 font-sans selection:bg-orange-100 selection:text-orange-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white font-black text-xl">Q</div>
            <span className="text-2xl font-black tracking-tighter dark:text-white">QuickServe</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
            <a href="#features" className="hover:text-orange-500 transition-colors">Features</a>
            <a href="#mockup" className="hover:text-orange-500 transition-colors">Preview</a>
            <a href="#pricing" className="hover:text-orange-500 transition-colors">Pricing</a>
          </div>
          <button 
            onClick={onGetStarted}
            className="px-6 py-3 bg-black dark:bg-white text-white dark:text-gray-900 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-8 animate-bounce">
            <Zap size={14} /> Malaysia's #1 Value Choice
          </div>
          <h1 className="text-5xl md:text-8xl font-black text-gray-900 dark:text-white leading-[0.9] tracking-tighter mb-8">
            THE CHEAPEST <br />
            <span className="text-orange-500">QR ORDERING</span> <br />
            IN MALAYSIA.
          </h1>
          <p className="text-lg md:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-12 font-medium">
            Modernize your restaurant in 5 minutes. No expensive hardware, no hidden fees. Just scan, order, and serve.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={onGetStarted} className="w-full sm:w-auto px-10 py-5 bg-orange-500 text-white rounded-2xl font-black text-lg shadow-2xl shadow-orange-200 dark:shadow-none hover:bg-orange-600 hover:scale-105 transition-all flex items-center justify-center gap-3">
              Start Free Trial <ArrowRight size={20} />
            </button>
            <a 
              href="https://wa.me/601154036303?text=Hello%2C%20I%20am%20interested%20to%20know%20about%20the%20QuickServe%20QR%20system"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-10 py-5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl font-black text-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center justify-center gap-2"
            >
              Contact for Demo
            </a>
          </div>
        </div>
      </section>

      {/* Mockup Section */}
      <section id="mockup" className="py-20 bg-gray-50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black dark:text-white uppercase tracking-tighter mb-4">Powerful Simplicity</h2>
            <p className="text-gray-500 dark:text-gray-400 font-medium">One system, two perfectly crafted experiences.</p>
          </div>

          <div className="relative flex flex-col lg:flex-row items-center justify-center gap-12">
            {/* Laptop Mockup (Vendor) */}
            <div className="relative w-full max-w-3xl group">
              <div className="absolute -inset-4 bg-orange-500/10 rounded-[2.5rem] blur-2xl group-hover:bg-orange-500/20 transition-all"></div>
              <div className="relative bg-gray-900 rounded-[2rem] p-4 shadow-2xl border-8 border-gray-800 overflow-hidden">
                <div className="bg-white dark:bg-gray-900 rounded-xl aspect-video overflow-hidden relative">
                  <img 
                    src="https://qao3rwoi4hh7qspq.public.blob.vercel-storage.com/marketing-img/VENDOR%20VIEW-P0bv7W1mQ2wbxBpN8nDKPwxznuKvx9.png" 
                    alt="Vendor Dashboard Mockup" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-black text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl">
                Vendor Dashboard (Laptop View)
              </div>
            </div>

            {/* Mobile Mockup (Customer) */}
            <div className="relative w-72 shrink-0 group">
              <div className="absolute -inset-4 bg-orange-500/10 rounded-[3rem] blur-2xl group-hover:bg-orange-500/20 transition-all"></div>
              <div className="relative bg-gray-900 rounded-[3rem] p-3 shadow-2xl border-[12px] border-gray-800 h-[580px] overflow-hidden">
                <div className="bg-white dark:bg-gray-900 rounded-[2rem] h-full overflow-hidden relative">
                  <img 
                    src="https://qao3rwoi4hh7qspq.public.blob.vercel-storage.com/marketing-img/mobile-view-Fjp7UIn86T3yZtpuXltMyAIjKEE1eo" 
                    alt="Customer Menu Mockup" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-800 rounded-b-2xl z-10"></div>
              </div>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-black text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl whitespace-nowrap">
                Customer Menu (Mobile View)
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 hover:border-orange-500 transition-all group">
              <div className="w-14 h-14 bg-orange-50 dark:bg-orange-900/20 text-orange-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <DollarSign size={28} />
              </div>
              <h3 className="text-xl font-black dark:text-white uppercase tracking-tight mb-4">Unbeatable Value</h3>
              <p className="text-gray-500 dark:text-gray-400 font-medium">We guarantee the lowest subscription rates in Malaysia. Save up to 70% compared to traditional POS systems.</p>
            </div>
            <div className="p-8 bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 hover:border-orange-500 transition-all group">
              <div className="w-14 h-14 bg-orange-50 dark:bg-orange-900/20 text-orange-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap size={28} />
              </div>
              <h3 className="text-xl font-black dark:text-white uppercase tracking-tight mb-4">Instant Setup</h3>
              <p className="text-gray-500 dark:text-gray-400 font-medium">No hardware to install. Just print your QR codes and you're live. Works on any smartphone or laptop.</p>
            </div>
            <div className="p-8 bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 hover:border-orange-500 transition-all group">
              <div className="w-14 h-14 bg-orange-50 dark:bg-orange-900/20 text-orange-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Clock size={28} />
              </div>
              <h3 className="text-xl font-black dark:text-white uppercase tracking-tight mb-4">Real-time Sync</h3>
              <p className="text-gray-500 dark:text-gray-400 font-medium">Orders hit your kitchen dashboard instantly. No more missed orders or manual entry errors.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-20 bg-black text-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="max-w-xl">
            <h2 className="text-4xl md:text-6xl font-black leading-[0.9] tracking-tighter mb-6 uppercase">
              Trusted by <br />
              <span className="text-orange-500">Local Hubs</span> <br />
              Across Malaysia.
            </h2>
            <div className="grid grid-cols-2 gap-6 mt-12">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-orange-500" />
                <span className="text-xs font-black uppercase tracking-widest">SST Compliant</span>
              </div>
              <div className="flex items-center gap-3">
                <Globe className="text-orange-500" />
                <span className="text-xs font-black uppercase tracking-widest">Local Support</span>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-orange-500/20 blur-[100px]"></div>
            <div className="relative p-12 bg-white/5 backdrop-blur-xl rounded-[3rem] border border-white/10 text-center">
              <p className="text-5xl font-black text-orange-500 mb-2">RM 0</p>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-white/60 mb-8">Upfront Cost</p>
              <button onClick={onGetStarted} className="px-8 py-4 bg-white text-black rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all">
                Join the Revolution
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <footer className="py-20 px-6 border-t dark:border-gray-800">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl font-black dark:text-white uppercase tracking-tighter mb-8">Ready to transform your business?</h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <a 
              href="https://wa.me/601154036303?text=Hello%2C%20I%20am%20interested%20to%20know%20about%20the%20QuickServe%20QR%20system"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-gray-500 dark:text-gray-400 hover:text-orange-500 transition-colors"
            >
              <MessageSquare size={20} className="text-orange-500" />
              <span className="font-bold">WhatsApp: +60 11-5403 6303</span>
            </a>
            <div className="w-1 h-1 bg-gray-300 rounded-full hidden sm:block"></div>
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              <ShieldCheck size={20} className="text-orange-500" />
              <span className="font-bold">Email: hello@quickserve.my</span>
            </div>
          </div>
          <p className="mt-12 text-[10px] font-black text-gray-400 uppercase tracking-[0.4em]">© 2026 QuickServe Malaysia. All Rights Reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default MarketingPage;
