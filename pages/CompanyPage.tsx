import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,

  Sun,
  Moon,
  MapPin,
  MessageSquare,
  ShieldCheck,
  ExternalLink,
  Star,
  Sparkles,
  ChevronRight,
  Menu,
  X,
  Globe,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const useInView = (options?: IntersectionObserverInit) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, ...options },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isInView };
};

interface Props {
  onBack: () => void;
  isDarkMode?: boolean;
  onToggleDark?: () => void;
  onGetStarted: () => void;
  onLogin: () => void;
}

type ValueTab = {
  id: 'mission' | 'vision' | 'promise';
  title: string;
  headline: string;
  description: string;
  points: string[];
};

const CompanyPage: React.FC<Props> = ({ onBack, isDarkMode, onToggleDark, onGetStarted, onLogin }) => {
  const heroRef = useInView();

  const aboutRef = useInView();
  const teamRef = useInView();
  const showcaseRef = useInView();
  const mapRef = useInView();
  const joinRef = useInView();
  const reviewsRef = useInView();

  const [teamMembers, setTeamMembers] = useState<{
    id: string;
    name: string;
    role: string;
    photo_url: string | null;
    sort_order: number;
  }[]>([]);
  const [joinForm, setJoinForm] = useState({ fullName: '', email: '', phone: '', role: '', experience: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activeValue, setActiveValue] = useState<'mission' | 'vision' | 'promise'>('mission');

  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);


  const valueTabs: ValueTab[] = [
    {
      id: 'mission',
      title: 'Mission',
      headline: 'Technology that removes barriers for businesses.',
      description: 'Our focus is affordable, reliable systems that help teams do their best work every day.',
      points: ['Simple onboarding', 'Transparent pricing', 'Operational reliability'],
    },
    {
      id: 'vision',
      title: 'Vision',
      headline: 'Build smarter local businesses through practical digital tools.',
      description: 'We believe digital transformation should feel empowering, not overwhelming.',
      points: ['Local-first innovation', 'Scalable architecture', 'Long-term partnerships'],
    },
    {
      id: 'promise',
      title: 'Promise',
      headline: 'Stay responsive, honest, and committed to impact.',
      description: 'Every release and every support interaction should create clear value for our customers.',
      points: ['Faster issue response', 'Product-led improvement', 'Customer-centric decisions'],
    },
  ];

  const activeValueData = valueTabs.find((tab) => tab.id === activeValue) ?? valueTabs[0];



  const reviews = [
    {
      text: 'QuickServe simplified our entire ordering workflow. Setup was fast and the team has been incredibly responsive to our feedback.',
      author: 'Restaurant Owner',
      rating: 5,
    },
    {
      text: "The all-in-one POS system handles everything from QR ordering to kitchen display. It's exactly what our growing F&B business needed.",
      author: 'F&B Manager',
      rating: 5,
    },
    {
      text: "Lumora Tech's commitment to practical solutions shows in every feature. Transparent pricing and reliable uptime — consistently great.",
      author: 'Operations Lead',
      rating: 5,
    },
  ];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    supabase
      .from('team_members')
      .select('id, name, role, photo_url, sort_order')
      .order('sort_order')
      .then(({ data }) => {
        if (data) setTeamMembers(data);
      });
  }, []);

  const handleChange = (field: keyof typeof joinForm, value: string) => {
    setJoinForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setFeedback(null);

    const { error } = await supabase.from('join_team_applications').insert({
      full_name: joinForm.fullName.trim(),
      email: joinForm.email.trim(),
      phone: joinForm.phone.trim() || null,
      desired_role: joinForm.role.trim(),
      experience_summary: joinForm.experience.trim() || null,
      message: joinForm.message.trim() || null,
      source: 'company_page',
      status: 'new',
    });

    if (error) {
      setFeedback({ type: 'error', message: 'Unable to submit your application. Please try again.' });
    } else {
      setJoinForm({ fullName: '', email: '', phone: '', role: '', experience: '', message: '' });
      setFeedback({ type: 'success', message: 'Application received. Our team will review and contact you soon.' });
    }

    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b1120] font-sans overflow-x-hidden text-gray-900 dark:text-white">

      {/* ── NAVIGATION ── */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3">
          <div className="flex items-center h-14 px-4 sm:px-6 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-full border border-gray-200/60 dark:border-gray-700/50 shadow-lg shadow-black/[0.03]">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all mr-2"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <div className="flex items-center gap-2">
              <img src="/LOGO/9.png" alt="QuickServe" className="h-8 dark:hidden" />
              <img src="/LOGO/9-dark.png" alt="QuickServe" className="h-8 hidden dark:block" />
            </div>

            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500 dark:text-gray-400 mx-auto">
              <button onClick={onBack} className="hover:text-gray-900 dark:hover:text-white transition-colors">Home</button>
              <a href="#about" className="text-gray-900 dark:text-white font-semibold">About</a>
              <a href="#team" className="hover:text-gray-900 dark:hover:text-white transition-colors">Team</a>
              <a href="#location" className="hover:text-gray-900 dark:hover:text-white transition-colors">Location</a>
              <a href="#careers" className="hover:text-gray-900 dark:hover:text-white transition-colors">Careers</a>
            </div>

            <div className="flex-1 md:hidden" />

            <div className="flex items-center gap-2">
              <button
                onClick={onToggleDark}
                className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                title={isDarkMode ? 'Light mode' : 'Dark mode'}
              >
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                onClick={onLogin}
                className="hidden sm:block text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors px-3"
              >
                Log in
              </button>
              <button
                onClick={onGetStarted}
                className="px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full text-sm font-semibold hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all"
              >
                Started for Free
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          <div className={`md:hidden overflow-hidden transition-all duration-300 ${mobileMenuOpen ? 'max-h-72 mt-2' : 'max-h-0'}`}>
            <div className="flex flex-col gap-1 p-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/50 shadow-lg">
              <button onClick={() => { setMobileMenuOpen(false); onBack(); }} className="px-4 py-2.5 text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-orange-500 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-all">
                Home
              </button>
              {['#about|About', '#team|Team', '#location|Location', '#careers|Careers'].map((item) => {
                const [href, label] = item.split('|');
                return (
                  <a key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-orange-500 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-all">
                    {label}
                  </a>
                );
              })}
              <button onClick={() => { setMobileMenuOpen(false); onLogin(); }} className="px-4 py-2.5 text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-orange-500 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-all sm:hidden">
                Log in
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section ref={heroRef.ref} className="pt-36 sm:pt-40 pb-20 sm:pb-28 px-4 sm:px-6">
        <div className={`max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center transition-all duration-700 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight leading-[1.08]">
              Fuel Your{' '}
              <span className="text-orange-500 italic">Business</span>
              <br />
              with Advanced Tech
            </h1>
            <p className="mt-6 text-base sm:text-lg text-gray-500 dark:text-gray-400 max-w-lg leading-relaxed">
              Leverage the power of advanced technology to streamline operations and drive growth. Stay ahead with innovative solutions built for the future.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={onGetStarted}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full font-semibold text-sm hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all hover:shadow-lg hover:shadow-orange-500/25"
              >
                Get Started for Free
              </button>
              <div className="flex items-center gap-2">
                <Star size={18} className="fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">4.5</span>
              </div>
            </div>
            <div className="mt-10 flex items-center gap-3">
              <div className="flex -space-x-2">
                {teamMembers.slice(0, 3).map((m) =>
                  m.photo_url ? (
                    <img key={m.id} src={m.photo_url} alt="" className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-900 object-cover" />
                  ) : (
                    <div key={m.id} className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-900 bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-xs font-bold text-orange-500">
                      {m.name.charAt(0)}
                    </div>
                  ),
                )}
              </div>
              {teamMembers.length > 0 && <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Built by the Lumora team</span>}
            </div>
          </div>

          <div className="relative">
            <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 aspect-[4/3] shadow-2xl shadow-black/10 flex items-center justify-center">
              <div className="text-center p-8">
                <img src="/LOGO/9.png" alt="QuickServe" className="h-14 sm:h-16 mx-auto mb-4 dark:hidden" />
                <img src="/LOGO/9-dark.png" alt="QuickServe" className="h-14 sm:h-16 mx-auto mb-4 hidden dark:block" />
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">All-in-One F&B Platform</p>
              </div>
            </div>
            {teamMembers.length > 0 && (
              <div className="absolute -bottom-4 left-6 sm:left-10 bg-white dark:bg-gray-800 rounded-2xl px-5 py-3 shadow-xl shadow-black/10 border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                <div className="flex -space-x-1.5">
                  {teamMembers.slice(0, 2).map((m) =>
                    m.photo_url ? (
                      <img key={`badge-${m.id}`} src={m.photo_url} alt="" className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 object-cover" />
                    ) : (
                      <div key={`badge-${m.id}`} className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 bg-orange-100 flex items-center justify-center text-[10px] font-bold text-orange-500">
                        {m.name.charAt(0)}
                      </div>
                    ),
                  )}
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">Lumora Team</span>
              </div>
            )}
          </div>
        </div>
      </section>



      {/* ── DISCOVER / ABOUT ── */}
      <section id="about" className="py-20 px-4 sm:px-6 bg-gray-50/80 dark:bg-gray-900/30">
        <div ref={aboutRef.ref} className={`max-w-7xl mx-auto transition-all duration-700 ${aboutRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Discover our <span className="text-orange-500 italic">QuickServe</span>
            </h2>
            <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Unleash the full potential of your F&B business with QuickServe. Organize, collaborate, and achieve more with ease.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 p-7 sm:p-9 hover:shadow-xl hover:shadow-black/[0.04] transition-all duration-500">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-500 text-xs font-semibold mb-5">
                <Sparkles size={14} /> About Lumora
              </div>
              <h3 className="text-2xl font-extrabold tracking-tight">From Repair Services to Smart Operations</h3>
              <div className="mt-5 space-y-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                <p>Lumora Tech started as a trusted device service provider and grew through consistency, technical depth, and customer trust.</p>
                <p>Today, with QuickServe, we are bringing the same practical approach into restaurant operations through QR ordering, table workflows, kitchen display support, and staff POS in one connected system.</p>
                <p>Our direction is simple: practical products, transparent pricing, and a long-term commitment to customer growth.</p>
              </div>
              <div className="mt-6 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-orange-500 mb-1">Company Registration</p>
                <p className="text-2xl font-extrabold text-gray-900 dark:text-white">JR0174591U</p>
                <p className="text-xs text-gray-500 mt-1">SSM Registered — Malaysia</p>
              </div>
            </div>

            <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 p-7 sm:p-9 hover:shadow-xl hover:shadow-black/[0.04] transition-all duration-500">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-500 text-xs font-semibold mb-5">
                <ShieldCheck size={14} /> Core Values
              </div>
              <div className="flex gap-2 mb-6">
                {valueTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveValue(tab.id)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                      activeValue === tab.id
                        ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    {tab.title}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900 border border-gray-100 dark:border-gray-800 p-6 min-h-[220px]">
                <h3 className="text-xl font-extrabold tracking-tight">{activeValueData.headline}</h3>
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{activeValueData.description}</p>
                <div className="mt-5 space-y-2.5">
                  {activeValueData.points.map((point) => (
                    <div key={point} className="flex items-center gap-2.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <div className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                        <ShieldCheck size={12} className="text-orange-500" />
                      </div>
                      {point}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="https://www.linkedin.com/company/lumora-tech/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full text-sm font-semibold hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all"
                >
                  <Globe size={14} /> Follow Updates
                </a>
                <a
                  href="mailto:lumoratech.ent@gmail.com"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-orange-400 hover:text-orange-500 transition-all"
                >
                  <MessageSquare size={14} /> Contact Us
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRODUCT SHOWCASE ── */}
      <section ref={showcaseRef.ref} className="py-20 px-4 sm:px-6">
        <div className={`max-w-7xl mx-auto transition-all duration-700 ${showcaseRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="relative rounded-[2rem] overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 min-h-[360px] sm:min-h-[420px] flex items-center justify-center group cursor-pointer" onClick={onGetStarted}>
            <p className="text-7xl sm:text-8xl lg:text-9xl font-black text-white/[0.06] uppercase tracking-tighter select-none">QuickServe</p>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/90 group-hover:bg-white flex items-center justify-center shadow-2xl shadow-black/20 transition-all group-hover:scale-110 mx-auto">
                  <ChevronRight size={28} className="text-gray-900 ml-1" />
                </div>
                <p className="mt-4 text-sm font-semibold text-white/70">Explore Platform</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TEAM ── */}
      <section id="team" className="py-20 px-4 sm:px-6">
        <div ref={teamRef.ref} className={`max-w-7xl mx-auto transition-all duration-700 ${teamRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Our <span className="text-orange-500 italic">Leadership</span> Team
            </h2>
            <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Meet the people behind QuickServe — driven by innovation, committed to your success.
            </p>
          </div>

          {teamMembers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10">
              {teamMembers.map((member, idx) => {
                const bgColors = [
                  'bg-amber-400',
                  'bg-emerald-400',
                  'bg-rose-300',
                  'bg-sky-400',
                  'bg-violet-400',
                  'bg-orange-400',
                  'bg-teal-400',
                  'bg-pink-400',
                  'bg-indigo-400',
                ];
                const colorClass = bgColors[idx % bgColors.length];
                return (
                  <div
                    key={member.id}
                    className="transition-all duration-500"
                    style={{ transitionDelay: `${idx * 80}ms` }}
                  >
                    <div className="group">
                      {/* Photo with colored background */}
                      <div className={`rounded-2xl overflow-hidden ${colorClass} aspect-[3/4] flex items-end justify-center`}>
                        {member.photo_url ? (
                          <img
                            src={member.photo_url}
                            alt={member.name}
                            className="w-full h-full object-contain object-bottom group-hover:scale-105 transition-transform duration-700"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-7xl font-black text-white/40 select-none">{member.name.charAt(0)}</span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="mt-5">
                        <p className="font-extrabold text-gray-900 dark:text-white text-lg">{member.name}</p>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-1">{member.role}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400 text-sm font-medium">Loading team...</div>
          )}
        </div>
      </section>

      {/* ── LOVED BY TEAMS ── */}
      <section ref={reviewsRef.ref} className="py-20 px-4 sm:px-6 border-t border-gray-100 dark:border-gray-800/50">
        <div className={`max-w-7xl mx-auto transition-all duration-700 ${reviewsRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Loved by <span className="text-orange-500 italic">teams</span> around
              <br className="hidden sm:block" /> the world
            </h2>
            <div className="flex items-center gap-2 sm:ml-auto">
              <div className="flex -space-x-1.5">
                {teamMembers.slice(0, 3).map((m) =>
                  m.photo_url ? (
                    <img key={`rev-${m.id}`} src={m.photo_url} alt="" className="w-7 h-7 rounded-full border-2 border-white dark:border-[#0b1120] object-cover" />
                  ) : (
                    <div key={`rev-${m.id}`} className="w-7 h-7 rounded-full border-2 border-white dark:border-[#0b1120] bg-orange-100 flex items-center justify-center text-[10px] font-bold text-orange-500">
                      {m.name.charAt(0)}
                    </div>
                  ),
                )}
              </div>
              {teamMembers.length > 0 && <span className="text-sm text-gray-500 font-medium">Trusted by teams</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {reviews.map((review, idx) => (
              <div
                key={idx}
                className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 p-6 hover:shadow-xl hover:shadow-black/[0.04] transition-all duration-500 hover:-translate-y-1"
              >
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: review.rating }).map((_, i) => (
                    <Star key={i} size={14} className="fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{review.text}</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500">{review.author.charAt(0)}</div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{review.author}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LOCATION ── */}
      <section id="location" className="py-20 px-4 sm:px-6 bg-gray-50/80 dark:bg-gray-900/30">
        <div ref={mapRef.ref} className={`max-w-7xl mx-auto transition-all duration-700 ${mapRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Our <span className="text-orange-500 italic">Location</span>
            </h2>
            <p className="mt-3 text-gray-500 dark:text-gray-400">Visit us or get in touch anytime.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200/80 dark:border-gray-800 p-7 flex flex-col justify-between hover:shadow-xl hover:shadow-black/[0.04] transition-all duration-500">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center mb-5">
                  <MapPin size={22} className="text-orange-500" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-orange-500 mb-2">Address</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-relaxed">
                  Lumora Tech Ent.
                  <br />
                  Jalan Juruanalisis UI/35, Seksyen U1, 40150 Shah Alam, Selangor
                </p>
              </div>
              <div className="mt-6 space-y-3">
                <a
                  href="https://maps.app.goo.gl/LbvPzsx9y69htbkCA"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition-all hover:shadow-lg hover:shadow-orange-500/25"
                >
                  <ExternalLink size={14} /> Open in Google Maps
                </a>
                <a
                  href="https://wa.me/601154036303?text=Hello%2C%20I%20am%20interested%20to%20know%20about%20Lumora%20Tech"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-orange-400 hover:text-orange-500 transition-all"
                >
                  <MessageSquare size={14} /> WhatsApp Us
                </a>
              </div>
            </div>

            <div className="lg:col-span-2 rounded-3xl overflow-hidden border border-gray-200/80 dark:border-gray-800 h-80 sm:h-96 hover:shadow-xl transition-all duration-500">
              <iframe
                title="Lumora Tech Location"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3984.049003914267!2d101.56005191126862!3d3.0815952535497564!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31cc4d2289f72555%3A0x932d7efba279d7fb!2sLumora%20Tech%20Ent.!5e0!3m2!1sen!2smy!4v1775634323783!5m2!1sen!2smy"
                width="600"
                height="450"
                style={{ border: 0 }}
                className="w-full h-full border-0"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-gray-400 font-medium">
            Map not loading?{' '}
            <a
              href="https://maps.app.goo.gl/LbvPzsx9y69htbkCA"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-500 hover:underline font-semibold"
            >
              Click here to open in Google Maps
            </a>
          </p>
        </div>
      </section>

      {/* ── CAREERS ── */}
      <section id="careers" className="py-20 px-4 sm:px-6">
        <div ref={joinRef.ref} className={`max-w-7xl mx-auto transition-all duration-700 ${joinRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Join Our <span className="text-orange-500 italic">Team</span>
            </h2>
            <p className="mt-3 text-gray-500 dark:text-gray-400">Share your profile and we will review your application.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 p-7 hover:shadow-xl hover:shadow-black/[0.04] transition-all duration-500">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-500 text-xs font-semibold mb-5">
                <Users size={14} /> Culture
              </div>
              <h3 className="text-lg font-extrabold mb-4">What We Look For</h3>
              <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                {['Ownership and accountability', 'Customer-first thinking', 'Strong execution pace'].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <ShieldCheck size={12} className="text-orange-500" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="https://wa.me/601154036303?text=Hello%2C%20I%20want%20to%20know%20about%20joining%20Lumora%20Tech"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full text-sm font-semibold hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all"
              >
                <MessageSquare size={14} /> Ask About Openings
              </a>
            </div>

            <div className="lg:col-span-2 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800 p-7 sm:p-9 hover:shadow-xl hover:shadow-black/[0.04] transition-all duration-500">
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    required
                    type="text"
                    placeholder="Full name"
                    value={joinForm.fullName}
                    onChange={(e) => handleChange('fullName', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium dark:text-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email address"
                    value={joinForm.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium dark:text-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Phone number"
                    value={joinForm.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium dark:text-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                  />
                  <input
                    required
                    type="text"
                    placeholder="Role you are applying for"
                    value={joinForm.role}
                    onChange={(e) => handleChange('role', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium dark:text-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
                  />
                </div>
                <textarea
                  rows={3}
                  placeholder="Experience summary"
                  value={joinForm.experience}
                  onChange={(e) => handleChange('experience', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium dark:text-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all resize-none"
                />
                <textarea
                  rows={3}
                  placeholder="Additional message (optional)"
                  value={joinForm.message}
                  onChange={(e) => handleChange('message', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium dark:text-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all resize-none"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-4 py-3.5 rounded-full bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition-all disabled:opacity-60 hover:shadow-lg hover:shadow-orange-500/25"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Application'}
                </button>
                {feedback && (
                  <p className={`text-xs font-semibold text-center ${feedback.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                    {feedback.message}
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-12 px-4 sm:px-6 bg-gray-950">
        <div className="max-w-7xl mx-auto text-center">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 mb-6 text-sm font-semibold text-gray-400 hover:text-orange-500 transition-colors"
          >
            <ArrowLeft size={14} /> Back to QuickServe
          </button>
          <p className="text-xs text-white/30 font-medium tracking-wide">&copy; 2026 Lumora Tech (JR0174591U). All Rights Reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default CompanyPage;
