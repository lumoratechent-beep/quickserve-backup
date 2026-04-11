
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, DollarSign, MessageSquare, ArrowRight, ShieldCheck, Globe, Clock, Check, QrCode, Smartphone, Monitor, ChefHat, BarChart3, Headphones, ChevronDown, Star, Users, TrendingUp, Wifi, Sun, Moon, MapPin, UtensilsCrossed, PackageCheck, Receipt, Menu, X } from 'lucide-react';
import { PRICING_PLANS, TRIAL_DAYS } from '../lib/pricingPlans';
import { supabase } from '../lib/supabase';

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

// FAQ Accordion item
const FaqItem: React.FC<{ q: string; a: string; isOpen: boolean; onClick: () => void; delay: string; inView: boolean }> = ({ q, a, isOpen, onClick, delay, inView }) => (
  <div
    className={`border border-gray-200 dark:border-gray-700 rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-500 hover:border-orange-500/50 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
    style={{ transitionDelay: inView ? delay : '0ms' }}
  >
    <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3 sm:p-6 text-left group">
      <span className="font-bold text-xs sm:text-base text-gray-900 dark:text-white pr-3 sm:pr-4">{q}</span>
      <ChevronDown size={16} className={`text-orange-500 shrink-0 transition-transform duration-300 sm:w-5 sm:h-5 ${isOpen ? 'rotate-180' : ''}`} />
    </button>
    <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-48 pb-3 px-4 sm:pb-6 sm:px-6' : 'max-h-0'}`}>
      <p className="text-gray-700 dark:text-gray-400 font-medium text-[11px] sm:text-sm leading-relaxed">{a}</p>
    </div>
  </div>
);

interface Props {
  onGetStarted: () => void;
  onLogin: () => void;
  onCompany: () => void;
  onComparePlans?: () => void;
  isDarkMode?: boolean;
  onToggleDark?: () => void;
}

const MarketingPage: React.FC<Props> = ({ onGetStarted, onLogin, onCompany, onComparePlans, isDarkMode, onToggleDark }) => {
  const [mounted, setMounted] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [testimonialIdx, setTestimonialIdx] = useState(0);
  const [pricingIdx, setPricingIdx] = useState(1);
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
  const addonsRef = useInView({ threshold: 0.1 });
  const laptopTilt = useTilt();
  const phoneTilt = useTilt();

  const [partnerLogos, setPartnerLogos] = useState<{ url: string; alt: string; crop_shape: string; display_width: number; display_height: number; category: string }[]>([]);
  const [addonImages, setAddonImages] = useState<Record<string, { url: string; alt: string; crop_shape: string; display_width: number; display_height: number }[]>>({});

  useEffect(() => { setMounted(true); }, []);

  // Fetch feature images for the partner carousel and add-on features
  useEffect(() => {
    const fetchLogos = async () => {
      const { data } = await supabase
        .from('feature_images')
        .select('url, alt, crop_shape, display_width, display_height, category')
        .order('sort_order');
      if (data) {
        setPartnerLogos(data.filter(d => (d.category || 'partner') === 'partner'));
        const grouped: Record<string, typeof data> = {};
        data.filter(d => d.category && d.category !== 'partner').forEach(d => {
          if (!grouped[d.category]) grouped[d.category] = [];
          grouped[d.category].push(d);
        });
        setAddonImages(grouped);
      }
    };
    fetchLogos();
  }, []);

  const faqs = [
    { q: 'Do I need any special hardware?', a: 'No! QuickServe runs on any device with a web browser — your existing phone, tablet, or laptop. No POS terminal or printer required to get started.' },
    { q: 'How fast can I set up my restaurant?', a: 'Most vendors go live in under 5 minutes. Just register, upload your menu items, set up your tables, and print your QR codes. That\'s it.' },
    { q: 'Is there a contract or lock-in?', a: `No contracts, no lock-in. Pay month-to-month and cancel anytime. Every plan starts with a ${TRIAL_DAYS}-day free trial.` },
    { q: 'Does it support a kitchen display system?', a: 'Yes. Orders placed via QR or by staff flow instantly to your kitchen display. You can configure separate kitchen departments and route items accordingly.' },
    { q: 'Can staff place orders at the table or counter?', a: 'Absolutely. Staff can place dine-in table orders, counter orders, and takeaways — all from any device with a browser. No special hardware needed.' },
    { q: 'Can I use this for multiple areas or branches?', a: 'Yes. QuickServe supports multiple areas and tables per venue. Multi-branch support is available on higher plans.' },
    { q: 'What happens after the free trial?', a: 'Your selected plan activates automatically. You can change or cancel your plan at any time from the billing page.' },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 font-sans selection:bg-orange-100 selection:text-orange-900 overflow-x-hidden">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="mx-auto max-w-7xl px-3 sm:px-6">
          <div className="mt-4 flex items-center h-14 sm:h-16 px-3 sm:px-6 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg shadow-black/5">
            {/* Mobile: Hamburger + Logo */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-gray-700 hover:text-orange-500 transition-all mr-2"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="flex items-center gap-2">
              <img src="/LOGO/9.png" alt="QuickServe" className="h-8 sm:h-9 dark:hidden" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><text x="0" y="24" font-size="20" font-weight="900" fill="%23f97316">QuickServe</text></svg>')}`; }} />
              <img src="/LOGO/9-dark.png" alt="QuickServe" className="h-8 sm:h-9 hidden dark:block" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><text x="0" y="24" font-size="20" font-weight="900" fill="%23f97316">QuickServe</text></svg>')}`; }} />
            </div>
            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-8 text-[11px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-[0.15em] mx-auto">
              <a href="#features" className="hover:text-orange-500 transition-colors">Features</a>
              <a href="#how-it-works" className="hover:text-orange-500 transition-colors">How It Works</a>
              <a href="#mockup" className="hover:text-orange-500 transition-colors">Preview</a>
              <a href="#pricing" className="hover:text-orange-500 transition-colors">Pricing</a>
              <a href="#faq" className="hover:text-orange-500 transition-colors">FAQ</a>
              <button onClick={onCompany} className="hover:text-orange-500 transition-colors">OUR COMPANY</button>
            </div>
            {/* Spacer for mobile */}
            <div className="flex-1 md:hidden" />
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={onToggleDark}
                className="p-2 sm:p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-gray-700 hover:text-orange-500 transition-all"
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                onClick={onLogin}
                className="px-3 sm:px-5 py-2 sm:py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all hover:scale-105"
              >
                Login
              </button>
            </div>
          </div>
          {/* Mobile dropdown menu */}
          <div className={`md:hidden overflow-hidden transition-all duration-300 ${mobileMenuOpen ? 'max-h-64 mt-2' : 'max-h-0'}`}>
            <div className="flex flex-col gap-1 px-3 py-3 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg shadow-black/5">
              {[
                { href: '#features', label: 'Features' },
                { href: '#how-it-works', label: 'How It Works' },
                { href: '#mockup', label: 'Preview' },
                { href: '#pricing', label: 'Pricing' },
                { href: '#faq', label: 'FAQ' },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-2.5 text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-[0.15em] hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-gray-800 rounded-xl transition-all"
                >
                  {link.label}
                </a>
              ))}
              <button
                onClick={() => { setMobileMenuOpen(false); onCompany(); }}
                className="px-4 py-2.5 text-left text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-[0.15em] hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-gray-800 rounded-xl transition-all"
              >
                OUR COMPANY
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════ HERO SECTION ═══════════════════════ */}
      <section ref={heroRef.ref} className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 relative overflow-hidden">
        {/* Animated grid background */}
        <div className="absolute inset-0 marketing-grid-bg opacity-40 dark:opacity-20 pointer-events-none" />
        {/* Gradient orbs */}
        <div className="absolute top-20 -left-32 w-96 h-96 bg-orange-400/20 rounded-full blur-[120px] pointer-events-none animate-float-slow" />
        <div className="absolute bottom-0 -right-32 w-96 h-96 bg-orange-600/10 rounded-full blur-[120px] pointer-events-none animate-float-slow" style={{ animationDelay: '2s' }} />

        <div className="max-w-7xl w-full mx-auto text-center relative z-10">
          {/* Badge */}
          <div className={`inline-flex items-center gap-2 sm:gap-2.5 px-3 sm:px-5 py-2 sm:py-2.5 bg-orange-500/10 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] mb-8 sm:mb-10 lg:mb-4 border border-orange-500/20 transition-all duration-700 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
            Malaysia's #1 Restaurant Platform
          </div>

          {/* Heading */}
          <h1 className={`font-black text-gray-900 dark:text-white tracking-tighter mb-6 sm:mb-8 lg:mb-4 transition-all duration-700 delay-150 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            {/* Mobile: 4 rows with larger text */}
            <span className="block sm:hidden text-4xl leading-[1.1]">
              THE COMPLETE<br />
              <span className="relative inline-block">
                <span className="text-orange-500 hero-text-glow">RESTAURANT</span>
                <svg className="absolute -bottom-1 left-0 w-full" viewBox="0 0 300 12" fill="none"><path d="M2 8 C50 2, 100 2, 150 6 S250 10, 298 4" stroke="rgb(249,115,22)" strokeWidth="3" strokeLinecap="round" className="marketing-underline-draw" /></svg>
              </span><br />
              MANAGEMENT<br />PLATFORM.
            </span>
            {/* Desktop: original layout */}
            <span className="hidden sm:block text-5xl md:text-[4.5rem] xl:text-[5.5rem] leading-[0.85]">
              THE COMPLETE <br />
              <span className="relative inline-block">
                <span className="text-orange-500 hero-text-glow">RESTAURANT</span>
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none"><path d="M2 8 C50 2, 100 2, 150 6 S250 10, 298 4" stroke="rgb(249,115,22)" strokeWidth="3" strokeLinecap="round" className="marketing-underline-draw" /></svg>
              </span> <br />
              MANAGEMENT PLATFORM.
            </span>
          </h1>

          {/* Desc */}
          <p className={`text-sm sm:text-lg md:text-xl lg:text-base text-gray-700 dark:text-gray-300 max-w-2xl mx-auto mb-10 sm:mb-16 lg:mb-12 font-medium leading-relaxed transition-all duration-700 delay-300 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            QR ordering, table management, kitchen display system, staff POS — everything your restaurant needs. No expensive hardware. No hidden fees. Live in 5 minutes.
          </p>

          {/* CTA Buttons */}
          <div className={`flex flex-row items-center justify-center gap-2.5 sm:gap-4 w-full max-w-sm sm:max-w-none mx-auto transition-all duration-700 delay-[450ms] ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            <button
              onClick={onGetStarted}
              className="group flex-1 sm:flex-initial min-w-0 px-3 sm:px-12 py-3 sm:py-5 bg-orange-500 text-white rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-lg shadow-2xl shadow-orange-500/25 hover:bg-orange-600 hover:scale-105 hover:shadow-orange-500/40 transition-all flex items-center justify-center gap-1 sm:gap-3 shimmer-btn relative overflow-hidden whitespace-nowrap"
            >
              Start Free Trial <ArrowRight size={14} className="shrink-0 group-hover:translate-x-1 transition-transform sm:hidden" /><ArrowRight size={22} className="shrink-0 group-hover:translate-x-1 transition-transform hidden sm:block" />
            </button>
            <a
              href="https://wa.me/601154036303?text=Hello%2C%20I%20am%20interested%20to%20know%20about%20the%20QuickServe%20QR%20system"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial min-w-0 px-3 sm:px-12 py-3 sm:py-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl sm:rounded-2xl font-black text-[11px] sm:text-lg border border-gray-200 dark:border-gray-700 hover:border-orange-500 hover:scale-105 transition-all flex items-center justify-center gap-1 shadow-lg shadow-black/5 whitespace-nowrap"
            >
              <MessageSquare size={13} className="shrink-0 sm:hidden" /><MessageSquare size={18} className="shrink-0 hidden sm:block" /> <span className="hidden sm:inline">Contact for Demo</span><span className="sm:hidden">Demo</span>
            </a>
          </div>

          {/* Trust row */}
          <div className={`flex flex-wrap items-center justify-center gap-2 sm:gap-6 mt-8 sm:mt-14 lg:mt-6 transition-all duration-700 delay-[600ms] ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {['No credit card required', 'Setup in 5 minutes', `${TRIAL_DAYS}-day free trial`].map((t, i) => (
              <span key={i} className="flex items-center gap-1 sm:gap-2 text-[9px] sm:text-xs font-bold text-gray-600 dark:text-gray-500 uppercase tracking-wide sm:tracking-wider whitespace-nowrap">
                <Check size={11} className="shrink-0 text-green-500" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ TRUSTED BY / PARTNER LOGOS ═══════════════════════ */}
      <section ref={statsRef.ref} className="py-12 relative overflow-hidden bg-white dark:bg-gray-950">
        <div className={`text-center mb-8 transition-all duration-700 ${statsRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <span className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Trusted by restaurants across Malaysia</span>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 font-medium max-w-md mx-auto">From local favourites to growing chains — QuickServe powers their daily operations.</p>
        </div>
        {partnerLogos.length > 0 && (() => {
          // Repeat logos enough times to fill the carousel seamlessly (min ~20 items)
          const repeatCount = Math.max(2, Math.ceil(20 / partnerLogos.length));
          const repeatedLogos = Array.from({ length: repeatCount * 2 }, () => partnerLogos).flat();
          return (
          <div className="max-w-full sm:max-w-[55%] mx-auto relative">
            {/* Fade edges */}
            <div className="absolute left-0 top-0 bottom-0 w-10 sm:w-16 bg-gradient-to-r from-white dark:from-gray-950 to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-10 sm:w-16 bg-gradient-to-l from-white dark:from-gray-950 to-transparent z-10 pointer-events-none" />
            <div className="overflow-hidden py-6 -my-6">
              <div className="partner-carousel-track flex items-center gap-4 sm:gap-12 w-max">
                {repeatedLogos.map((p, i) => (
                  <button key={i} className={`flex-shrink-0 flex items-center justify-center w-16 h-10 sm:w-20 sm:h-12 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 hover:scale-125 hover:border hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/10 rounded-xl transition-all duration-500 focus:grayscale-0 focus:opacity-100 focus:scale-125 focus:border focus:border-orange-500/40 focus:shadow-lg focus:shadow-orange-500/10 focus:outline-none ${p.crop_shape === 'circle' ? 'rounded-full overflow-hidden' : ''}`}>
                    <img src={p.url} alt={p.alt} className="max-h-full max-w-full object-contain pointer-events-none" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          );
        })()}
      </section>

      {/* ═══════════════════════ FEATURES BENTO GRID ═══════════════════════ */}
      <section id="features" ref={featuresRef.ref} className="py-14 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className={`text-center mb-8 sm:mb-16 transition-all duration-700 ${featuresRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-[10px] sm:text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-2 sm:mb-3 block">Why QuickServe</span>
            <h2 className="text-2xl md:text-5xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Everything You Need</h2>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-5">
            {[
              { icon: <QrCode className="w-4 h-4 sm:w-6 sm:h-6" />, title: 'QR Ordering', desc: 'Customers scan a table QR code, browse your menu, and order directly from their phone. No app install needed.', accent: 'from-orange-500 to-amber-500' },
              { icon: <MapPin className="w-4 h-4 sm:w-6 sm:h-6" />, title: 'Table Management', desc: 'Multiple areas, multiple tables. Manage your floor layout, track table status, and organise dine-in flow effortlessly.', accent: 'from-yellow-500 to-orange-500' },
              { icon: <ChefHat className="w-4 h-4 sm:w-6 sm:h-6" />, title: 'Kitchen Display System', desc: 'Orders hit the kitchen screen the moment they are placed. No tickets, no shouting — just a clear live queue by department.', accent: 'from-orange-500 to-red-500' },
              { icon: <Users className="w-4 h-4 sm:w-6 sm:h-6" />, title: 'Staff POS & Ordering', desc: 'Waitstaff can place and manage orders from any device at the table. Counter orders and takeaways supported too.', accent: 'from-amber-500 to-orange-500' },
              { icon: <BarChart3 className="w-4 h-4 sm:w-6 sm:h-6" />, title: 'Smart Analytics', desc: 'Daily sales, item performance, peak-hour insights, and full order reports — all in one back-office dashboard.', accent: 'from-orange-600 to-orange-400' },
              { icon: <Zap className="w-4 h-4 sm:w-6 sm:h-6" />, title: '5-Min Setup', desc: 'No hardware needed. Register, upload your menu, print QR codes, and you\'re live. Works on any device with a browser.', accent: 'from-orange-400 to-yellow-500' },
            ].map((f, i) => (
              <div
                key={i}
                className={`group relative p-2.5 sm:p-7 bg-white dark:bg-gray-900 rounded-xl sm:rounded-3xl border border-gray-100 dark:border-gray-800 hover:border-orange-500/50 transition-all duration-500 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-orange-500/5 ${featuresRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                style={{ transitionDelay: featuresRef.isInView ? `${i * 80}ms` : '0ms' }}
              >
                {/* Gradient line on top */}
                <div className={`absolute top-0 left-4 right-4 sm:left-8 sm:right-8 h-[2px] bg-gradient-to-r ${f.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-full`} />
                <div className="w-7 h-7 sm:w-12 sm:h-12 bg-orange-50 dark:bg-orange-500/10 text-orange-500 rounded-lg sm:rounded-2xl flex items-center justify-center mb-2 sm:mb-5 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  {f.icon}
                </div>
                <h3 className="text-[10px] sm:text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight mb-1 sm:mb-2 leading-tight">{f.title}</h3>
                <p className="text-[8px] sm:text-sm text-gray-700 dark:text-gray-400 font-medium leading-snug sm:leading-relaxed line-clamp-3 sm:line-clamp-none">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ ADD-ON FEATURES ═══════════════════════ */}
      <section ref={addonsRef.ref} className="py-14 sm:py-24 px-4 sm:px-6 bg-gray-50 dark:bg-gray-900/50 relative overflow-hidden">
        <div className="absolute top-1/3 right-0 w-96 h-96 bg-orange-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className={`text-center mb-8 sm:mb-16 transition-all duration-700 ${addonsRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-[10px] sm:text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-2 sm:mb-3 block">Add-on Features</span>
            <h2 className="text-2xl md:text-5xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Extend Your Platform</h2>
            <p className="mt-3 sm:mt-4 text-xs sm:text-base text-gray-600 dark:text-gray-400 font-medium max-w-xl mx-auto">Install powerful add-ons to customize QuickServe for your business needs.</p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-6">
            {[
              { id: 'backoffice', icon: <BarChart3 className="w-4 h-4 sm:w-6 sm:h-6" />, title: 'Back Office', desc: 'Sales dashboard, inventory, staff & finance management — all in one place.', accent: 'from-gray-600 to-gray-400' },
              { id: 'table', icon: <MapPin className="w-4 h-4 sm:w-6 sm:h-6" />, title: 'Table Management', desc: 'Configurable floor plan with saved bills per table and multi-floor support.', accent: 'from-sky-500 to-sky-400' },
              { id: 'qr', icon: <QrCode className="w-4 h-4 sm:w-6 sm:h-6" />, title: 'QR Ordering', desc: 'Customers scan, browse, and order from their phone — no app needed.', accent: 'from-violet-500 to-violet-400' },
              { id: 'tableside', icon: <Smartphone className="w-4 h-4 sm:w-6 sm:h-6" />, title: 'Tableside Ordering', desc: 'Staff take orders at the table using any tablet device.', accent: 'from-teal-500 to-teal-400' },
              { id: 'kitchen', icon: <ChefHat className="w-4 h-4 sm:w-6 sm:h-6" />, title: 'Kitchen Display', desc: 'Dedicated kitchen screen with department routing and auto-accept.', accent: 'from-orange-500 to-orange-400' },
              { id: 'online-shop', icon: <Globe className="w-4 h-4 sm:w-6 sm:h-6" />, title: 'Online Shop', desc: 'Let customers order online for delivery or pickup through your branded shop.', accent: 'from-blue-500 to-blue-400' },
            ].map((addon, i) => {
              const images = addonImages[addon.id] || [];
              return (
                <div
                  key={addon.id}
                  className={`group relative bg-white dark:bg-gray-900 rounded-xl sm:rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-orange-500/50 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-orange-500/5 overflow-hidden ${addonsRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                  style={{ transitionDelay: addonsRef.isInView ? `${i * 100}ms` : '0ms' }}
                >
                  {/* Feature image carousel / preview */}
                  {images.length > 0 && (
                    <div className="w-full h-20 sm:h-40 bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <img src={images[0].url} alt={images[0].alt || addon.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                  )}
                  <div className="p-2.5 sm:p-6">
                    <div className={`absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r ${addon.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-full`} style={images.length > 0 ? { top: '160px' } : {}} />
                    <div className="w-7 h-7 sm:w-10 sm:h-10 bg-orange-50 dark:bg-orange-500/10 text-orange-500 rounded-lg sm:rounded-xl flex items-center justify-center mb-2 sm:mb-4 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                      {addon.icon}
                    </div>
                    <h3 className="text-[10px] sm:text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight mb-1 sm:mb-2 leading-tight">{addon.title}</h3>
                    <p className="text-[8px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium leading-snug sm:leading-relaxed line-clamp-3 sm:line-clamp-none">{addon.desc}</p>
                    {images.length > 1 && (
                      <div className="hidden sm:flex items-center gap-2 mt-4 overflow-x-auto hide-scrollbar">
                        {images.slice(1, 4).map((img, j) => (
                          <div key={j} className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0 border border-gray-200 dark:border-gray-700">
                            <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />
                          </div>
                        ))}
                        {images.length > 4 && (
                          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex-shrink-0">+{images.length - 4} more</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ HOW IT WORKS ═══════════════════════ */}
      <section id="how-it-works" ref={howRef.ref} className="py-14 sm:py-24 px-4 sm:px-6 bg-gray-50 dark:bg-gray-900/50 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-500/5 rounded-full blur-[150px] pointer-events-none" />
        <div className="max-w-5xl mx-auto relative z-10">
          <div className={`text-center mb-10 sm:mb-20 transition-all duration-700 ${howRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-[10px] sm:text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-2 sm:mb-3 block">Simple Steps</span>
            <h2 className="text-2xl md:text-5xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Up & Running in Minutes</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8 relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-16 left-[12.5%] right-[12.5%] h-[2px] bg-gradient-to-r from-orange-500/0 via-orange-500/40 to-orange-500/0" />

            {[
              { step: '01', icon: <Monitor className="w-5 h-5 sm:w-7 sm:h-7" />, title: 'Register & Build Menu', desc: 'Create your account and upload your full menu with images, prices, categories, and options.' },
              { step: '02', icon: <MapPin className="w-5 h-5 sm:w-7 sm:h-7" />, title: 'Set Up Tables & Areas', desc: 'Define your restaurant floor — areas, tables, and QR codes. Print and place in minutes.' },
              { step: '03', icon: <ChefHat className="w-5 h-5 sm:w-7 sm:h-7" />, title: 'Configure Kitchen Display', desc: 'Assign menu categories to kitchen departments. Orders route to the right screen automatically.' },
              { step: '04', icon: <Smartphone className="w-5 h-5 sm:w-7 sm:h-7" />, title: 'Go Live & Take Orders', desc: 'Customers scan, staff order, kitchen sees — everything in real-time from one unified platform.' },
            ].map((s, i) => (
              <div
                key={i}
                className={`text-center relative transition-all duration-700 ${howRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                style={{ transitionDelay: howRef.isInView ? `${i * 200}ms` : '0ms' }}
              >
                <div className="relative inline-flex items-center justify-center w-20 h-20 sm:w-32 sm:h-32 mb-3 sm:mb-8">
                  <div className="absolute inset-0 bg-orange-500/10 rounded-full animate-pulse-soft" />
                  <div className="relative w-12 h-12 sm:w-20 sm:h-20 bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl shadow-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                    {s.icon}
                  </div>
                  <span className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 w-6 h-6 sm:w-8 sm:h-8 bg-orange-500 text-white rounded-full text-[9px] sm:text-[11px] font-black flex items-center justify-center shadow-lg">{s.step}</span>
                </div>
                <h3 className="text-xs sm:text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight mb-1 sm:mb-3">{s.title}</h3>
                <p className="text-[10px] sm:text-sm text-gray-700 dark:text-gray-400 font-medium leading-relaxed max-w-xs mx-auto">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ MOCKUP SECTION ═══════════════════════ */}
      <section id="mockup" ref={mockupRef.ref} className="py-14 sm:py-24 overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className={`text-center mb-16 transition-all duration-700 ${mockupRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">See It In Action</span>
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 dark:text-white uppercase tracking-tighter mb-4">Powerful Simplicity</h2>
            <p className="text-gray-700 dark:text-gray-400 font-medium">One platform, beautifully crafted for every role.</p>
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
      <section ref={testimonialsRef.ref} className="py-14 sm:py-24 px-4 sm:px-6 bg-gray-50 dark:bg-gray-900/50">
        <div className="max-w-6xl mx-auto">
          <div className={`text-center mb-8 sm:mb-16 transition-all duration-700 ${testimonialsRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-[10px] sm:text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-2 sm:mb-3 block">Loved By Vendors</span>
            <h2 className="text-2xl md:text-5xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">What They Say</h2>
          </div>

          {/* Desktop grid */}
          <div className="hidden md:grid md:grid-cols-3 gap-6">
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
                <p className="text-gray-700 dark:text-gray-300 font-medium text-sm leading-relaxed mb-6">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500 text-white rounded-full flex items-center justify-center font-black text-sm">{t.avatar}</div>
                  <div>
                    <div className="font-bold text-sm text-gray-900 dark:text-white">{t.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t.biz}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Mobile scrollable carousel */}
          <div className="md:hidden">
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-4 hide-scrollbar">
              {[
                { name: 'Ahmad R.', biz: 'Nasi Lemak Corner, KL', text: "Setup took me 3 minutes. The next day I already had customers ordering from their phones. Incredible value for the price.", avatar: 'A' },
                { name: 'Mei Ling T.', biz: 'Bubble Tea House, PJ', text: "We cut our wait times by half. Customers love scanning QR and ordering without waiting. Our staff is happier too.", avatar: 'M' },
                { name: 'Raj K.', biz: 'Mamak Express, Penang', text: "I tried 3 other POS systems before QuickServe. This is the only one that's actually affordable for a small restaurant.", avatar: 'R' },
              ].map((t, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 w-[75vw] snap-center"
                >
                  <div className="p-4 bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800">
                    <div className="flex gap-0.5 mb-3">
                      {[...Array(5)].map((_, j) => <Star key={j} size={12} className="fill-orange-400 text-orange-400" />)}
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 font-medium text-xs leading-relaxed mb-4">"{t.text}"</p>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-orange-500 text-white rounded-full flex items-center justify-center font-black text-[10px]">{t.avatar}</div>
                      <div>
                        <div className="font-bold text-xs text-gray-900 dark:text-white">{t.name}</div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400">{t.biz}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ COMING SOON — BACK OFFICE ═══════════════════════ */}
      <section className="py-24 px-6 bg-white dark:bg-gray-950 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-orange-500/5 dark:bg-orange-500/10 rounded-full blur-[150px] pointer-events-none" />
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-orange-500/20 mb-6">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse inline-block" />
              Coming to Back Office
            </span>
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 dark:text-white uppercase tracking-tighter mb-4">The Platform That Grows<br />With Your Business</h2>
            <p className="text-gray-700 dark:text-gray-400 font-medium max-w-xl mx-auto">We are building a complete back-office suite — so you never need another tool.</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            {[
              { icon: <PackageCheck size={22} />, title: 'Stock Management', desc: 'Track ingredient stock levels, get low-stock alerts, and tie usage directly to menu items.' },
              { icon: <Receipt size={22} />, title: 'Billing & Invoicing', desc: 'Generate e-invoices, manage SST, and keep all your billing records in one place.' },
              { icon: <TrendingUp size={22} />, title: 'P&L Analysis', desc: 'Visualise your revenue vs costs in real-time. Know exactly where your restaurant is profitable.' },
              { icon: <BarChart3 size={22} />, title: 'Sales Management', desc: 'Deep dive into sales trends, compare periods, and make smarter menu and staffing decisions.' },
            ].map((f, i) => (
              <div key={i} className="group relative p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-gray-800 hover:border-orange-500/40 transition-all duration-500 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-orange-500/5">
                <div className="absolute top-3 right-3 sm:top-4 sm:right-4 px-2 py-0.5 bg-orange-500/10 text-orange-500 text-[8px] sm:text-[9px] font-black uppercase tracking-widest rounded-full">Soon</div>
                <div className="w-9 h-9 sm:w-11 sm:h-11 bg-orange-50 dark:bg-orange-500/10 text-orange-500 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  {f.icon}
                </div>
                <h3 className="text-xs sm:text-base font-black text-gray-900 dark:text-white uppercase tracking-tight mb-1 sm:mb-2">{f.title}</h3>
                <p className="text-[11px] sm:text-sm text-gray-700 dark:text-gray-400 font-medium leading-relaxed">{f.desc}</p>
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

          {/* Desktop pricing grid */}
          <div className="hidden md:grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
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

          {/* Mobile pricing – scrollable */}
          <div className="md:hidden pt-4">
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-6 px-6 pb-4 pt-4 hide-scrollbar">
              {PRICING_PLANS.map((plan, i) => {
                const displayPrice = billingCycle === 'annual' ? plan.annualPrice : plan.price;
                return (
                  <div
                    key={plan.id}
                    className="flex-shrink-0 w-[80vw] snap-center"
                  >
                  <div className={`relative p-5 rounded-2xl border flex flex-col backdrop-blur-sm h-full ${
                      plan.highlight
                        ? 'bg-white/10 border-orange-500 shadow-2xl shadow-orange-500/20'
                        : 'bg-white/[0.03] border-white/10'
                    }`}
                  >
                    {plan.highlight && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-orange-500/30">
                        Most Popular
                      </div>
                    )}
                    <h3 className="text-lg font-black uppercase tracking-tight mb-1">{plan.name}</h3>
                    <p className="text-[10px] text-white/40 font-medium mb-4">{plan.description}</p>
                    <div className="mb-4">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-sm text-white/30 font-bold line-through">MYR {plan.price}</span>
                        <span className="text-3xl font-black text-orange-500">MYR 0</span>
                        <span className="text-white/40 font-bold text-xs">/mo</span>
                      </div>
                      <p className="text-[10px] text-white/40 font-medium mt-1">For 1 month, MYR {displayPrice}/mo after</p>
                    </div>
                    <ul className="space-y-2 mb-5 flex-1">
                      {plan.features.map((feature, j) => (
                        <li key={j} className="flex items-start gap-2 text-xs text-white/70 font-medium">
                          <Check size={14} className="text-orange-500 shrink-0 mt-0.5" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={onGetStarted}
                      className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-auto ${
                        plan.highlight
                          ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white'
                          : 'bg-white/10 text-white'
                      }`}
                    >
                      Start Free Trial <ArrowRight size={14} />
                    </button>
                  </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 sm:gap-8 mt-10 sm:mt-16">
            {onComparePlans && (
              <button
                onClick={onComparePlans}
                className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-orange-400 hover:text-orange-300 transition-colors"
              >
                <span className="text-orange-500">⇄</span>
                Compare Plans
              </button>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 sm:gap-8 mt-4 sm:mt-6">
            {[
              { icon: <ShieldCheck size={18} />, text: 'SST Compliant' },
              { icon: <Globe size={18} />, text: 'Local Support' },
              { icon: <Wifi size={18} />, text: 'Works Offline' },
            ].map((b, i) => (
              <div key={i} className={`flex items-center gap-1.5 sm:gap-2.5 transition-all duration-500 ${trustRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: `${300 + i * 100}ms` }}>
                <span className="text-orange-500 [&>svg]:w-3.5 [&>svg]:h-3.5 sm:[&>svg]:w-[18px] sm:[&>svg]:h-[18px]">{b.icon}</span>
                <span className="text-[8px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-widest text-white/60 whitespace-nowrap">{b.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ FAQ ═══════════════════════ */}
      <section id="faq" ref={faqRef.ref} className="py-14 sm:py-24 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <div className={`text-center mb-8 sm:mb-14 transition-all duration-700 ${faqRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-[10px] sm:text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-2 sm:mb-3 block">FAQ</span>
            <h2 className="text-2xl md:text-5xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Got Questions?</h2>
          </div>

          <div className="space-y-2 sm:space-y-3">
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
      <section ref={ctaRef.ref} className="py-14 sm:py-24 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-orange-600" />
        <div className="absolute inset-0 marketing-grid-bg opacity-10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-[100px] pointer-events-none" />

        <div className={`max-w-3xl mx-auto text-center relative z-10 transition-all duration-700 ${ctaRef.isInView ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'}`}>
          <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-white uppercase tracking-tighter mb-4 sm:mb-6 leading-tight">
            Ready to Modernize<br />Your Restaurant?
          </h2>
          <p className="text-white/80 font-medium text-sm sm:text-lg mb-6 sm:mb-10 max-w-lg mx-auto">
            Join hundreds of Malaysian restaurants already using QuickServe. Start your free {TRIAL_DAYS}-day trial today.
          </p>
          <div className="flex flex-row items-center justify-center gap-2.5 sm:gap-4">
            <button
              onClick={onGetStarted}
              className="group flex-1 sm:flex-initial min-w-0 px-4 sm:px-10 py-3 sm:py-5 bg-white text-orange-600 rounded-xl sm:rounded-2xl font-black text-xs sm:text-lg shadow-2xl shadow-black/20 hover:bg-gray-50 hover:scale-105 transition-all flex items-center justify-center gap-1.5 sm:gap-3 whitespace-nowrap"
            >
              Start Free Trial <ArrowRight size={14} className="shrink-0 group-hover:translate-x-1 transition-transform sm:hidden" /><ArrowRight size={20} className="shrink-0 group-hover:translate-x-1 transition-transform hidden sm:block" />
            </button>
            <a
              href="https://wa.me/601154036303?text=Hello%2C%20I%20am%20interested%20to%20know%20about%20the%20QuickServe%20QR%20system"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial min-w-0 px-4 sm:px-10 py-3 sm:py-5 bg-white/20 text-white rounded-xl sm:rounded-2xl font-black text-xs sm:text-lg hover:bg-white/30 hover:scale-105 transition-all flex items-center justify-center gap-1.5 sm:gap-2 backdrop-blur-sm border border-white/20 whitespace-nowrap"
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
              <img src="/LOGO/9-dark.png" alt="QuickServe" className="h-10" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><text x="0" y="24" font-size="20" font-weight="900" fill="%23f97316">QuickServe</text></svg>')}`; }} />
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
                lumoratech.ent@gmail.com
              </div>
              <div className="w-1 h-1 bg-white/20 rounded-full hidden sm:block" />
              <a
                href="https://www.linkedin.com/company/lumora-tech/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-white/50 hover:text-orange-500 transition-colors text-sm font-bold"
              >
                <Globe size={16} className="text-orange-500" />
                Powered by Lumora Tech
              </a>
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
