
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, DollarSign, MessageSquare, ArrowRight, ShieldCheck, Globe, Clock, Check, QrCode, Smartphone, Monitor, ChefHat, BarChart3, Headphones, ChevronDown, Star, Users, TrendingUp, Wifi } from 'lucide-react';
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

// Animated counter hook
const useCounter = (end: number, duration: number, inView: boolean, suffix = '') => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [end, duration, inView]);
  return count + suffix;
};

// FAQ Accordion item
const FaqItem: React.FC<{ q: string; a: string; isOpen: boolean; onClick: () => void; delay: string; inView: boolean }> = ({ q, a, isOpen, onClick, delay, inView }) => (
  <div
    className={`border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden transition-all duration-500 hover:border-orange-500/50 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
    style={{ transitionDelay: inView ? delay : '0ms' }}
  >
    <button onClick={onClick} className="w-full flex items-center justify-between p-6 text-left group">
      <span className="font-bold text-gray-900 dark:text-white pr-4">{q}</span>
      <ChevronDown size={20} className={`text-orange-500 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
    </button>
    <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-48 pb-6 px-6' : 'max-h-0'}`}>
      <p className="text-gray-500 dark:text-gray-400 font-medium text-sm leading-relaxed">{a}</p>
    </div>
  </div>
);

interface Props {
  onGetStarted: () => void;
  onLogin: () => void;
}

const MarketingPage: React.FC<Props> = ({ onGetStarted, onLogin }) => {
  const [mounted, setMounted] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const heroRef = useInView();
  const statsRef = useInView({ threshold: 0.2 });
  const mockupRef = useInView({ threshold: 0.1 });
  const featuresRef = useInView({ threshold: 0.1 });
  const howRef = useInView({ threshold: 0.1 });
  const trustRef = useInView({ threshold: 0.15 });
  const testimonialsRef = useInView({ threshold: 0.1 });
  const faqRef = useInView({ threshold: 0.1 });
  const ctaRef = useInView({ threshold: 0.15 });
  const footerRef = useInView({ threshold: 0.2 });
  const laptopTilt = useTilt();
  const phoneTilt = useTilt();

  const vendorCount = useCounter(500, 1400, statsRef.isInView, '+');
  const orderCount = useCounter(50, 1400, statsRef.isInView, 'K+');
  const uptimeCount = useCounter(99, 1200, statsRef.isInView, '.9%');

  useEffect(() => { setMounted(true); }, []);

  const faqs = [
    { q: 'Do I need any special hardware?', a: 'No! QuickServe runs on any device with a web browser — your existing phone, tablet, or laptop. No POS terminal or printer required to get started.' },
    { q: 'How fast can I set up my restaurant?', a: 'Most vendors go live in under 5 minutes. Just register, upload your menu items, and print your QR codes. That\'s it.' },
    { q: 'Is there a contract or lock-in?', a: `No contracts, no lock-in. Pay month-to-month and cancel anytime. Every plan starts with a ${TRIAL_DAYS}-day free trial.` },
    { q: 'Can I use this for dine-in and takeaway?', a: 'Absolutely. QuickServe supports dine-in QR ordering, counter orders, and takeaway — all from one dashboard.' },
    { q: 'What happens after the free trial?', a: 'Your selected plan activates automatically. You can change or cancel your plan at any time from the billing page.' },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 font-sans selection:bg-orange-100 selection:text-orange-900 overflow-x-hidden">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="mt-4 flex items-center justify-between h-16 px-6 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg shadow-black/5">
            <div className="flex items-center gap-2">
              <img src="/LOGO/9.png" alt="QuickServe" className="h-9 dark:hidden" />
              <img src="/LOGO/9-dark.png" alt="QuickServe" className="h-9 hidden dark:block" />
            </div>
            <div className="hidden md:flex items-center gap-8 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.15em]">
              <a href="#features" className="hover:text-orange-500 transition-colors">Features</a>
              <a href="#how-it-works" className="hover:text-orange-500 transition-colors">How It Works</a>
              <a href="#mockup" className="hover:text-orange-500 transition-colors">Preview</a>
              <a href="#pricing" className="hover:text-orange-500 transition-colors">Pricing</a>
              <a href="#faq" className="hover:text-orange-500 transition-colors">FAQ</a>
            </div>
            <button
              onClick={onLogin}
              className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all hover:scale-105"
            >
              Login
            </button>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════ HERO SECTION ═══════════════════════ */}
      <section ref={heroRef.ref} className="pt-36 pb-24 px-6 relative overflow-hidden">
        {/* Animated grid background */}
        <div className="absolute inset-0 marketing-grid-bg opacity-40 dark:opacity-20 pointer-events-none" />
        {/* Gradient orbs */}
        <div className="absolute top-20 -left-32 w-96 h-96 bg-orange-400/20 rounded-full blur-[120px] pointer-events-none animate-float-slow" />
        <div className="absolute bottom-0 -right-32 w-96 h-96 bg-orange-600/10 rounded-full blur-[120px] pointer-events-none animate-float-slow" style={{ animationDelay: '2s' }} />

        <div className="max-w-7xl mx-auto text-center relative z-10">
          {/* Badge */}
          <div className={`inline-flex items-center gap-2.5 px-5 py-2.5 bg-orange-500/10 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-10 border border-orange-500/20 transition-all duration-700 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
            Malaysia's #1 Value Choice
          </div>

          {/* Heading */}
          <h1 className={`text-5xl sm:text-6xl md:text-[6.5rem] font-black text-gray-900 dark:text-white leading-[0.85] tracking-tighter mb-8 transition-all duration-700 delay-150 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            THE CHEAPEST <br />
            <span className="relative inline-block">
              <span className="text-orange-500 hero-text-glow">QR ORDERING</span>
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none"><path d="M2 8 C50 2, 100 2, 150 6 S250 10, 298 4" stroke="rgb(249,115,22)" strokeWidth="3" strokeLinecap="round" className="marketing-underline-draw" /></svg>
            </span> <br />
            IN MALAYSIA.
          </h1>

          {/* Desc */}
          <p className={`text-base sm:text-lg md:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-12 font-medium leading-relaxed transition-all duration-700 delay-300 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            Modernize your restaurant in 5 minutes. No expensive hardware, no hidden fees. Just scan, order, and serve.
          </p>

          {/* CTA Buttons */}
          <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-[450ms] ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <button
              onClick={onGetStarted}
              className="group w-full sm:w-auto px-10 py-5 bg-orange-500 text-white rounded-2xl font-black text-lg shadow-2xl shadow-orange-500/25 hover:bg-orange-600 hover:scale-105 hover:shadow-orange-500/40 transition-all flex items-center justify-center gap-3 shimmer-btn relative overflow-hidden"
            >
              Start Free Trial <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="https://wa.me/601154036303?text=Hello%2C%20I%20am%20interested%20to%20know%20about%20the%20QuickServe%20QR%20system"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-10 py-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl font-black text-lg border border-gray-200 dark:border-gray-700 hover:border-orange-500 hover:scale-105 transition-all flex items-center justify-center gap-2 shadow-lg shadow-black/5"
            >
              <MessageSquare size={18} /> Contact for Demo
            </a>
          </div>

          {/* Trust row */}
          <div className={`flex flex-wrap items-center justify-center gap-6 mt-14 transition-all duration-700 delay-[600ms] ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {['No credit card required', 'Setup in 5 minutes', `${TRIAL_DAYS}-day free trial`].map((t, i) => (
              <span key={i} className="flex items-center gap-2 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <Check size={14} className="text-green-500" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ STATS MARQUEE ═══════════════════════ */}
      <section ref={statsRef.ref} className="py-6 border-y border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-3 gap-4">
          {[
            { value: vendorCount, label: 'Active Vendors' },
            { value: orderCount, label: 'Orders Processed' },
            { value: uptimeCount, label: 'Uptime' },
          ].map((s, i) => (
            <div key={i} className={`text-center transition-all duration-700 ${statsRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: `${i * 100}ms` }}>
              <div className="text-2xl sm:text-4xl font-black text-orange-500 tabular-nums">{s.value}</div>
              <div className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════ FEATURES BENTO GRID ═══════════════════════ */}
      <section id="features" ref={featuresRef.ref} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className={`text-center mb-16 transition-all duration-700 ${featuresRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">Why QuickServe</span>
            <h2 className="text-3xl md:text-5xl font-black dark:text-white uppercase tracking-tighter">Everything You Need</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: <DollarSign size={24} />, title: 'Unbeatable Value', desc: 'Lowest subscription rates in Malaysia. Save up to 70% compared to traditional POS systems.', accent: 'from-orange-500 to-amber-500' },
              { icon: <Zap size={24} />, title: '5-Min Setup', desc: "No hardware needed. Print QR codes and you're live. Works on any device with a browser.", accent: 'from-yellow-500 to-orange-500' },
              { icon: <Clock size={24} />, title: 'Real-time Sync', desc: 'Orders hit your kitchen dashboard instantly. Zero missed orders, zero manual errors.', accent: 'from-orange-500 to-red-500' },
              { icon: <QrCode size={24} />, title: 'QR Ordering', desc: 'Customers scan, browse the menu, and order — all from their phone. No app install needed.', accent: 'from-amber-500 to-orange-500' },
              { icon: <BarChart3 size={24} />, title: 'Smart Reports', desc: 'Daily sales, item performance, and peak-hour analytics — all in one dashboard.', accent: 'from-orange-600 to-orange-400' },
              { icon: <Headphones size={24} />, title: '24/7 Support', desc: 'WhatsApp support from real humans. We respond in minutes, not hours.', accent: 'from-orange-400 to-yellow-500' },
            ].map((f, i) => (
              <div
                key={i}
                className={`group relative p-7 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 hover:border-orange-500/50 transition-all duration-500 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-orange-500/5 ${featuresRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                style={{ transitionDelay: featuresRef.isInView ? `${i * 80}ms` : '0ms' }}
              >
                {/* Gradient line on top */}
                <div className={`absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r ${f.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-full`} />
                <div className="w-12 h-12 bg-orange-50 dark:bg-orange-500/10 text-orange-500 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  {f.icon}
                </div>
                <h3 className="text-lg font-black dark:text-white uppercase tracking-tight mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ HOW IT WORKS ═══════════════════════ */}
      <section id="how-it-works" ref={howRef.ref} className="py-24 px-6 bg-gray-50 dark:bg-gray-900/50 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-500/5 rounded-full blur-[150px] pointer-events-none" />
        <div className="max-w-5xl mx-auto relative z-10">
          <div className={`text-center mb-20 transition-all duration-700 ${howRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">3 Simple Steps</span>
            <h2 className="text-3xl md:text-5xl font-black dark:text-white uppercase tracking-tighter">Up & Running in Minutes</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-16 left-[16.67%] right-[16.67%] h-[2px] bg-gradient-to-r from-orange-500/0 via-orange-500/40 to-orange-500/0" />

            {[
              { step: '01', icon: <Monitor size={28} />, title: 'Register & Add Menu', desc: 'Create your account, upload your restaurant menu in minutes. Add images, prices, and categories.' },
              { step: '02', icon: <QrCode size={28} />, title: 'Print Your QR Codes', desc: 'Generate unique QR codes for each table. Print them and place on tables — done!' },
              { step: '03', icon: <Smartphone size={28} />, title: 'Start Receiving Orders', desc: 'Customers scan, order from their phones. Orders flow to your dashboard in real-time.' },
            ].map((s, i) => (
              <div
                key={i}
                className={`text-center relative transition-all duration-700 ${howRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                style={{ transitionDelay: howRef.isInView ? `${i * 200}ms` : '0ms' }}
              >
                <div className="relative inline-flex items-center justify-center w-32 h-32 mb-8">
                  <div className="absolute inset-0 bg-orange-500/10 rounded-full animate-pulse-soft" />
                  <div className="relative w-20 h-20 bg-white dark:bg-gray-800 rounded-2xl shadow-xl shadow-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                    {s.icon}
                  </div>
                  <span className="absolute -top-2 -right-2 w-8 h-8 bg-orange-500 text-white rounded-full text-[11px] font-black flex items-center justify-center shadow-lg">{s.step}</span>
                </div>
                <h3 className="text-lg font-black dark:text-white uppercase tracking-tight mb-3">{s.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium leading-relaxed max-w-xs mx-auto">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ MOCKUP SECTION ═══════════════════════ */}
      <section id="mockup" ref={mockupRef.ref} className="py-24 overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className={`text-center mb-16 transition-all duration-700 ${mockupRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">See It In Action</span>
            <h2 className="text-3xl md:text-5xl font-black dark:text-white uppercase tracking-tighter mb-4">Powerful Simplicity</h2>
            <p className="text-gray-500 dark:text-gray-400 font-medium">One system, two perfectly crafted experiences.</p>
          </div>

          <div className="relative flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16">
            {/* Laptop Mockup (Vendor) */}
            <div className={`relative w-full max-w-3xl group transition-all duration-700 delay-200 ${mockupRef.isInView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-16'}`}>
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
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl">
                Vendor Dashboard (Laptop View)
              </div>
            </div>

            {/* Mobile Mockup (Customer) */}
            <div className={`relative w-56 sm:w-64 md:w-72 shrink-0 group transition-all duration-700 delay-[400ms] ${mockupRef.isInView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-16'}`}>
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
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl whitespace-nowrap">
                Customer Menu (Mobile View)
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ TESTIMONIALS ═══════════════════════ */}
      <section ref={testimonialsRef.ref} className="py-24 px-6 bg-gray-50 dark:bg-gray-900/50">
        <div className="max-w-6xl mx-auto">
          <div className={`text-center mb-16 transition-all duration-700 ${testimonialsRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">Loved By Vendors</span>
            <h2 className="text-3xl md:text-5xl font-black dark:text-white uppercase tracking-tighter">What They Say</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Ahmad R.', biz: 'Nasi Lemak Corner, KL', text: "Setup took me 3 minutes. The next day I already had customers ordering from their phones. Incredible value for the price.", avatar: 'A' },
              { name: 'Mei Ling T.', biz: 'Bubble Tea House, PJ', text: "We cut our wait times by half. Customers love scanning QR and ordering without waiting. Our staff is happier too.", avatar: 'M' },
              { name: 'Raj K.', biz: 'Mamak Express, Penang', text: "I tried 3 other POS systems before QuickServe. This is the only one that's actually affordable for a small restaurant.", avatar: 'R' },
            ].map((t, i) => (
              <div
                key={i}
                className={`p-7 bg-white dark:bg-gray-800/50 rounded-3xl border border-gray-100 dark:border-gray-800 transition-all duration-500 hover:-translate-y-1 hover:shadow-xl hover:shadow-orange-500/5 ${testimonialsRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                style={{ transitionDelay: testimonialsRef.isInView ? `${i * 150}ms` : '0ms' }}
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => <Star key={j} size={14} className="fill-orange-400 text-orange-400" />)}
                </div>
                <p className="text-gray-600 dark:text-gray-300 font-medium text-sm leading-relaxed mb-6">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500 text-white rounded-full flex items-center justify-center font-black text-sm">{t.avatar}</div>
                  <div>
                    <div className="font-bold text-sm dark:text-white">{t.name}</div>
                    <div className="text-xs text-gray-400">{t.biz}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ PRICING ═══════════════════════ */}
      <section id="pricing" ref={trustRef.ref} className="py-24 bg-gray-950 text-white overflow-hidden relative">
        {/* Subtle grid */}
        <div className="absolute inset-0 marketing-grid-bg opacity-[0.03] pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[180px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className={`text-center mb-12 transition-all duration-700 ${trustRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">Pricing</span>
            <h2 className="text-4xl md:text-6xl font-black leading-[0.9] tracking-tighter mb-4 uppercase">
              Simple, <span className="text-orange-500">Transparent</span> Pricing
            </h2>
            <p className="text-white/50 font-medium text-lg max-w-lg mx-auto">Cancel at any time. All plans include a {TRIAL_DAYS}-day free trial.</p>

            {/* Toggle */}
            {(() => {
              const annualSavePct = Math.round((1 - PRICING_PLANS[1].annualPrice / PRICING_PLANS[1].price) * 100);
              return (
                <div className="inline-flex items-center mt-8 bg-white/10 rounded-full p-1 backdrop-blur-sm">
                  <button
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all ${billingCycle === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-white/50 hover:text-white/80'}`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingCycle('annual')}
                    className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-1.5 ${billingCycle === 'annual' ? 'bg-white text-gray-900 shadow-sm' : 'text-white/50 hover:text-white/80'}`}
                  >
                    Annual
                    <span className="text-[10px] text-orange-500 font-black bg-orange-500/10 px-2 py-0.5 rounded-full">-{annualSavePct}%</span>
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
                  className={`relative p-8 rounded-3xl border transition-all duration-500 hover:-translate-y-2 flex flex-col backdrop-blur-sm ${
                    plan.highlight
                      ? 'bg-white/10 border-orange-500 shadow-2xl shadow-orange-500/20 scale-[1.02]'
                      : 'bg-white/[0.03] border-white/10 hover:border-orange-500/40'
                  } ${trustRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                  style={{ transitionDelay: trustRef.isInView ? `${i * 150}ms` : '0ms' }}
                >
                  {plan.highlight && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-orange-500/30">
                      Most Popular
                    </div>
                  )}

                  <h3 className="text-xl font-black uppercase tracking-tight mb-1">{plan.name}</h3>
                  <p className="text-xs text-white/40 font-medium mb-5">{plan.description}</p>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-lg text-white/30 font-bold line-through">MYR {plan.price}</span>
                      <span className="text-4xl font-black text-orange-500">MYR 0</span>
                      <span className="text-white/40 font-bold text-sm">/mo</span>
                    </div>
                    <p className="text-xs text-white/40 font-medium mt-1">For 1 month, MYR {displayPrice}/mo after</p>
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
                        ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:shadow-lg hover:shadow-orange-500/30 hover:scale-[1.02]'
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
            {[
              { icon: <ShieldCheck size={18} />, text: 'SST Compliant' },
              { icon: <Globe size={18} />, text: 'Local Support' },
              { icon: <Wifi size={18} />, text: 'Works Offline' },
            ].map((b, i) => (
              <div key={i} className={`flex items-center gap-2.5 transition-all duration-500 ${trustRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: `${300 + i * 100}ms` }}>
                <span className="text-orange-500">{b.icon}</span>
                <span className="text-[11px] font-black uppercase tracking-widest text-white/60">{b.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ FAQ ═══════════════════════ */}
      <section id="faq" ref={faqRef.ref} className="py-24 px-6">
        <div className="max-w-2xl mx-auto">
          <div className={`text-center mb-14 transition-all duration-700 ${faqRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">FAQ</span>
            <h2 className="text-3xl md:text-5xl font-black dark:text-white uppercase tracking-tighter">Got Questions?</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <FaqItem
                key={i}
                q={faq.q}
                a={faq.a}
                isOpen={openFaq === i}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                delay={`${i * 80}ms`}
                inView={faqRef.isInView}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ FINAL CTA ═══════════════════════ */}
      <section ref={ctaRef.ref} className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-orange-600" />
        <div className="absolute inset-0 marketing-grid-bg opacity-10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-[100px] pointer-events-none" />

        <div className={`max-w-3xl mx-auto text-center relative z-10 transition-all duration-700 ${ctaRef.isInView ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'}`}>
          <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter mb-6 leading-tight">
            Ready to Modernize<br />Your Restaurant?
          </h2>
          <p className="text-white/80 font-medium text-lg mb-10 max-w-lg mx-auto">
            Join hundreds of Malaysian restaurants already using QuickServe. Start your free {TRIAL_DAYS}-day trial today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onGetStarted}
              className="group w-full sm:w-auto px-10 py-5 bg-white text-orange-600 rounded-2xl font-black text-lg shadow-2xl shadow-black/20 hover:bg-gray-50 hover:scale-105 transition-all flex items-center justify-center gap-3"
            >
              Start Free Trial <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="https://wa.me/601154036303?text=Hello%2C%20I%20am%20interested%20to%20know%20about%20the%20QuickServe%20QR%20system"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-10 py-5 bg-white/20 text-white rounded-2xl font-black text-lg hover:bg-white/30 hover:scale-105 transition-all flex items-center justify-center gap-2 backdrop-blur-sm border border-white/20"
            >
              <MessageSquare size={18} /> WhatsApp Us
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ FOOTER ═══════════════════════ */}
      <footer ref={footerRef.ref} className="py-16 px-6 bg-gray-950 text-white border-t border-gray-800">
        <div className={`max-w-7xl mx-auto transition-all duration-700 ${footerRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">
            <div className="flex items-center gap-3">
              <img src="/LOGO/9-dark.png" alt="QuickServe" className="h-10" />
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <a
                href="https://wa.me/601154036303?text=Hello%2C%20I%20am%20interested%20to%20know%20about%20the%20QuickServe%20QR%20system"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-white/50 hover:text-orange-500 transition-colors text-sm font-bold"
              >
                <MessageSquare size={16} className="text-orange-500" />
                +60 11-5403 6303
              </a>
              <div className="w-1 h-1 bg-white/20 rounded-full hidden sm:block" />
              <div className="flex items-center gap-2 text-white/50 text-sm font-bold">
                <ShieldCheck size={16} className="text-orange-500" />
                hello@quickserve.my
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 text-center">
            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">&copy; 2026 QuickServe Malaysia. All Rights Reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MarketingPage;
