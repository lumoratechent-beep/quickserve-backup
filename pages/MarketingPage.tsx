
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, DollarSign, MessageSquare, ArrowRight, ShieldCheck, Globe, Clock, Check } from 'lucide-react';
import { PRICING_PLANS, TRIAL_DAYS } from '../lib/pricingPlans';

// Custom hook: triggers once when element enters viewport
const useInView = (options?: IntersectionObserverInit) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        observer.disconnect();
      }
    }, { threshold: 0.15, ...options });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, isInView };
};

// 3D tilt hook for mouse tracking
const useTilt = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState('');

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotateX = (0.5 - y) * 12;
    const rotateY = (x - 0.5) * 12;
    setTransform(`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02,1.02,1.02)`);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)');
  }, []);

  return { ref, transform, handleMouseMove, handleMouseLeave };
};

interface Props {
  onGetStarted: () => void;
  onLogin: () => void;
}

const MarketingPage: React.FC<Props> = ({ onGetStarted, onLogin }) => {
  const [mounted, setMounted] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const heroRef = useInView();
  const mockupRef = useInView({ threshold: 0.1 });
  const featuresRef = useInView({ threshold: 0.1 });
  const trustRef = useInView({ threshold: 0.15 });
  const footerRef = useInView({ threshold: 0.2 });
  const laptopTilt = useTilt();
  const phoneTilt = useTilt();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 font-sans selection:bg-orange-100 selection:text-orange-900 overflow-x-hidden">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b dark:border-gray-800 transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/LOGO/9.png" alt="QuickServe" className="h-10 dark:hidden" />
            <img src="/LOGO/9-dark.png" alt="QuickServe" className="h-10 hidden dark:block" />
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
            <a href="#features" className="hover:text-orange-500 transition-colors">Features</a>
            <a href="#mockup" className="hover:text-orange-500 transition-colors">Preview</a>
            <a href="#pricing" className="hover:text-orange-500 transition-colors">Pricing</a>
          </div>
          <button
            onClick={onLogin}
            className="px-6 py-3 bg-black dark:bg-white text-white dark:text-gray-900 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg hover:shadow-orange-500/25 hover:scale-105"
          >
            Login
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section ref={heroRef.ref} className="pt-40 pb-20 px-6 relative">
        {/* Background gradient blob */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="gradient-blob w-[600px] h-[600px] md:w-[900px] md:h-[900px] rounded-full"></div>
        </div>

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <div className={`inline-flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-8 transition-all duration-700 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <span className="animate-float inline-flex items-center gap-2">
              <Zap size={14} /> Malaysia's #1 Value Choice
            </span>
          </div>

          <h1 className={`text-4xl sm:text-5xl md:text-8xl font-black text-gray-900 dark:text-white leading-[0.9] tracking-tighter mb-8 transition-all duration-700 delay-150 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            THE CHEAPEST <br />
            <span className="text-orange-500 inline-block hover:scale-105 transition-transform duration-300">QR ORDERING</span> <br />
            IN MALAYSIA.
          </h1>

          <p className={`text-base sm:text-lg md:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-12 font-medium transition-all duration-700 delay-300 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            Modernize your restaurant in 5 minutes. No expensive hardware, no hidden fees. Just scan, order, and serve.
          </p>

          <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-[450ms] ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto px-10 py-5 bg-orange-500 text-white rounded-2xl font-black text-lg shadow-2xl shadow-orange-200 dark:shadow-orange-900/30 hover:bg-orange-600 hover:scale-105 hover:shadow-orange-300 dark:hover:shadow-orange-800/40 transition-all flex items-center justify-center gap-3 shimmer-btn relative overflow-hidden"
            >
              Start Free Trial <ArrowRight size={20} />
            </button>
            <a
              href="https://wa.me/601154036303?text=Hello%2C%20I%20am%20interested%20to%20know%20about%20the%20QuickServe%20QR%20system"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-10 py-5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl font-black text-lg hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105 transition-all flex items-center justify-center gap-2"
            >
              Contact for Demo
            </a>
          </div>
        </div>
      </section>

      {/* Mockup Section */}
      <section id="mockup" ref={mockupRef.ref} className="py-20 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className={`text-center mb-16 transition-all duration-700 ${mockupRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h2 className="text-3xl md:text-5xl font-black dark:text-white uppercase tracking-tighter mb-4">Powerful Simplicity</h2>
            <p className="text-gray-500 dark:text-gray-400 font-medium">One system, two perfectly crafted experiences.</p>
          </div>

          <div className="relative flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16">
            {/* Laptop Mockup (Vendor) */}
            <div
              className={`relative w-full max-w-3xl group transition-all duration-700 delay-200 ${mockupRef.isInView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-16'}`}
            >
              <div className="absolute -inset-4 bg-orange-500/10 rounded-[2.5rem] blur-2xl animate-glow-pulse"></div>
              <div
                ref={laptopTilt.ref}
                onMouseMove={laptopTilt.handleMouseMove}
                onMouseLeave={laptopTilt.handleMouseLeave}
                className="relative bg-gray-900 rounded-[2rem] p-4 shadow-2xl border-8 border-gray-800 overflow-hidden tilt-card cursor-pointer"
                style={{ transform: laptopTilt.transform || undefined }}
              >
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
            <div
              className={`relative w-56 sm:w-64 md:w-72 shrink-0 group transition-all duration-700 delay-[400ms] ${mockupRef.isInView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-16'}`}
            >
              <div className="absolute -inset-4 bg-orange-500/10 rounded-[3rem] blur-2xl animate-glow-pulse" style={{ animationDelay: '1.5s' }}></div>
              <div
                ref={phoneTilt.ref}
                onMouseMove={phoneTilt.handleMouseMove}
                onMouseLeave={phoneTilt.handleMouseLeave}
                className="relative bg-gray-900 rounded-[3rem] p-3 shadow-2xl border-[12px] border-gray-800 h-[440px] sm:h-[500px] md:h-[580px] overflow-hidden tilt-card cursor-pointer"
                style={{ transform: phoneTilt.transform || undefined }}
              >
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
      <section id="features" ref={featuresRef.ref} className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: <DollarSign size={28} />, title: 'Unbeatable Value', desc: "We guarantee the lowest subscription rates in Malaysia. Save up to 70% compared to traditional POS systems.", delay: '0ms' },
              { icon: <Zap size={28} />, title: 'Instant Setup', desc: "No hardware to install. Just print your QR codes and you're live. Works on any smartphone or laptop.", delay: '150ms' },
              { icon: <Clock size={28} />, title: 'Real-time Sync', desc: "Orders hit your kitchen dashboard instantly. No more missed orders or manual entry errors.", delay: '300ms' },
            ].map((feature, i) => (
              <div
                key={i}
                className={`p-8 bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 hover:border-orange-500 transition-all duration-500 group hover:-translate-y-2 hover:shadow-xl hover:shadow-orange-500/5 ${featuresRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                style={{ transitionDelay: featuresRef.isInView ? feature.delay : '0ms' }}
              >
                <div className={`w-14 h-14 bg-orange-50 dark:bg-orange-900/20 text-orange-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-black dark:text-white uppercase tracking-tight mb-4">{feature.title}</h3>
                <p className="text-gray-500 dark:text-gray-400 font-medium">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" ref={trustRef.ref} className="py-20 bg-black text-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className={`text-center mb-10 transition-all duration-700 ${trustRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h2 className="text-4xl md:text-6xl font-black leading-[0.9] tracking-tighter mb-4 uppercase">
              Simple, <span className="text-orange-500">Transparent</span> Pricing
            </h2>
            <p className="text-white/60 font-medium text-lg">Cancel at any time. All plans include a {TRIAL_DAYS}-day free trial.</p>

            {/* Monthly / Annual Toggle */}
            {(() => {
              const annualSavePct = Math.round((1 - PRICING_PLANS[1].annualPrice / PRICING_PLANS[1].price) * 100);
              return (
                <div className="inline-flex items-center mt-6 bg-white/10 rounded-full p-1">
                  <button
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                      billingCycle === 'monthly'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-white/50 hover:text-white/80'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingCycle('annual')}
                    className={`px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-1.5 ${
                      billingCycle === 'annual'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-white/50 hover:text-white/80'
                    }`}
                  >
                    Annual
                    <span className="text-xs text-orange-500 font-black">Save {annualSavePct}%</span>
                  </button>
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PRICING_PLANS.map((plan, i) => {
              const displayPrice = billingCycle === 'annual' ? plan.annualPrice : plan.price;

              return (
                <div
                  key={plan.id}
                  className={`relative p-8 rounded-3xl border transition-all duration-500 delay-[${i * 150}ms] hover:-translate-y-2 flex flex-col ${
                    plan.highlight
                      ? 'bg-white/10 border-orange-500 shadow-2xl shadow-orange-500/20'
                      : 'bg-white/5 border-white/10 hover:border-orange-500/40'
                  } ${trustRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full">
                      Most Popular
                    </div>
                  )}

                  <h3 className="text-xl font-black uppercase tracking-tight mb-1">{plan.name}</h3>

                  <p className="text-xs text-white/40 font-medium mb-4">{plan.description}</p>

                  {/* Price display */}
                  <div className="mb-4">
                    <div className="flex items-baseline gap-1 flex-wrap">
                      <span className="text-lg text-white/30 font-bold line-through">MYR {plan.price}</span>
                      <span className="text-4xl font-black text-orange-500">MYR 0</span>
                      <span className="text-white/40 font-bold text-sm">/mo</span>
                    </div>
                    <p className="text-xs text-white/40 font-medium mt-1">
                      For 1 month, MYR {displayPrice}/mo after
                    </p>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm text-white/70 font-medium">
                        <Check size={16} className="text-orange-500 shrink-0 mt-0.5" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={onGetStarted}
                    className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-auto ${
                      plan.highlight
                        ? 'bg-orange-500 text-white hover:bg-orange-600 hover:scale-[1.02]'
                        : 'bg-white/10 text-white hover:bg-orange-500 hover:scale-[1.02]'
                    }`}
                  >
                    Start Free Trial <ArrowRight size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-8 mt-16">
            <div className={`flex items-center gap-3 transition-all duration-500 delay-300 ${trustRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <ShieldCheck className="text-orange-500" />
              <span className="text-xs font-black uppercase tracking-widest">SST Compliant</span>
            </div>
            <div className={`flex items-center gap-3 transition-all duration-500 delay-[450ms] ${trustRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <Globe className="text-orange-500" />
              <span className="text-xs font-black uppercase tracking-widest">Local Support</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <footer ref={footerRef.ref} className="py-20 px-6 border-t dark:border-gray-800">
        <div className={`max-w-7xl mx-auto text-center transition-all duration-700 ${footerRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="text-3xl font-black dark:text-white uppercase tracking-tighter mb-8">Ready to transform your business?</h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <a
              href="https://wa.me/601154036303?text=Hello%2C%20I%20am%20interested%20to%20know%20about%20the%20QuickServe%20QR%20system"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-gray-500 dark:text-gray-400 hover:text-orange-500 transition-colors group"
            >
              <MessageSquare size={20} className="text-orange-500 group-hover:scale-110 transition-transform" />
              <span className="font-bold">WhatsApp: +60 11-5403 6303</span>
            </a>
            <div className="w-1 h-1 bg-gray-300 rounded-full hidden sm:block"></div>
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              <ShieldCheck size={20} className="text-orange-500" />
              <span className="font-bold">Email: hello@quickserve.my</span>
            </div>
          </div>
          <img src="/LOGO/7.png" alt="QuickServe" className="h-16 mx-auto mb-8 dark:invert" />
          <p className="mt-12 text-[10px] font-black text-gray-400 uppercase tracking-[0.4em]">&copy; 2026 QuickServe Malaysia. All Rights Reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default MarketingPage;
