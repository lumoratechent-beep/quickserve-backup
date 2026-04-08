import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  ArrowLeft,
  Sun,
  Moon,
  MapPin,
  MessageSquare,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  Cpu,
  Rocket,
  Users,
  ChevronRight,
  Menu,
  X,
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
  const mapRef = useInView();
  const joinRef = useInView();

  const [teamMembers, setTeamMembers] = useState<{
    id: string;
    name: string;
    role: string;
    photo_url: string | null;
    sort_order: number;
    collaboration_header: string | null;
    collaboration_description: string | null;
    trait_one: string | null;
    trait_two: string | null;
    trait_three: string | null;
  }[]>([]);
  const [joinForm, setJoinForm] = useState({ fullName: '', email: '', phone: '', role: '', experience: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activeValue, setActiveValue] = useState<'mission' | 'vision' | 'promise'>('mission');
  const [activeSpotlight, setActiveSpotlight] = useState(0);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const spotlightCards = [
    {
      icon: <Rocket size={16} />,
      title: 'Fast Launch',
      text: 'Set up your digital ordering workflow in minutes with low setup friction.',
    },
    {
      icon: <Cpu size={16} />,
      title: 'Practical Systems',
      text: 'QuickServe is designed for daily operations, not complicated dashboards.',
    },
    {
      icon: <Users size={16} />,
      title: 'Human Support',
      text: 'Real team guidance from onboarding to optimization as your business grows.',
    },
  ];

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
  const teamRows = (() => {
    const totalMembers = teamMembers.length;

    if (totalMembers <= 3) return [teamMembers];
    if (totalMembers === 4) return [teamMembers.slice(0, 2), teamMembers.slice(2, 4)];
    if (totalMembers === 5) return [teamMembers.slice(0, 3), teamMembers.slice(3, 5)];
    if (totalMembers === 6) return [teamMembers.slice(0, 3), teamMembers.slice(3, 6)];

    const rows: typeof teamMembers[] = [];
    for (let index = 0; index < totalMembers; index += 3) {
      rows.push(teamMembers.slice(index, index + 3));
    }
    return rows;
  })();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    supabase.from('team_members').select('id, name, role, photo_url, sort_order, collaboration_header, collaboration_description, trait_one, trait_two, trait_three').order('sort_order').then(({ data }) => {
      if (data) setTeamMembers(data);
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSpotlight((prev) => (prev + 1) % spotlightCards.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [spotlightCards.length]);

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
    <div className="min-h-screen bg-[#f8f8f5] dark:bg-[#0f131a] font-sans overflow-x-hidden text-gray-900 dark:text-white pt-20 sm:pt-24">
      <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="mx-auto max-w-7xl px-3 sm:px-6">
          <div className="mt-4 flex items-center h-14 sm:h-16 px-3 sm:px-6 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg shadow-black/5">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-gray-700 hover:text-orange-500 transition-all mr-2"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="flex items-center gap-2">
              <img src="/LOGO/9.png" alt="QuickServe" className="h-8 sm:h-9 dark:hidden" />
              <img src="/LOGO/9-dark.png" alt="QuickServe" className="h-8 sm:h-9 hidden dark:block" />
            </div>
            <div className="hidden md:flex items-center gap-8 text-[11px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-[0.15em] mx-auto">
              <button onClick={onBack} className="hover:text-orange-500 transition-colors">HOME</button>
              <a href="#about" className="hover:text-orange-500 transition-colors">About</a>
              <a href="#team" className="hover:text-orange-500 transition-colors">Team</a>
              <a href="#location" className="hover:text-orange-500 transition-colors">Location</a>
              <a href="#careers" className="hover:text-orange-500 transition-colors">Careers</a>
            </div>
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

          <div className={`md:hidden overflow-hidden transition-all duration-300 ${mobileMenuOpen ? 'max-h-64 mt-2' : 'max-h-0'}`}>
            <div className="flex flex-col gap-1 px-3 py-3 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg shadow-black/5">
              {[
                { type: 'button', label: 'HOME' },
                { href: '#about', label: 'About' },
                { href: '#team', label: 'Team' },
                { href: '#location', label: 'Location' },
                { href: '#careers', label: 'Careers' },
              ].map((link) => (
                'type' in link ? (
                  <button
                    key={link.label}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onBack();
                    }}
                    className="px-4 py-2.5 text-left text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-[0.15em] hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-gray-800 rounded-xl transition-all"
                  >
                    {link.label}
                  </button>
                ) : (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-2.5 text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-[0.15em] hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-gray-800 rounded-xl transition-all"
                >
                  {link.label}
                </a>
                )
              ))}
            </div>
          </div>
        </div>
      </nav>

      <section
        ref={heroRef.ref}
        className="relative px-4 sm:px-6 pt-12 sm:pt-16 pb-16 sm:pb-20 overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(251,146,60,0.22),transparent_45%),radial-gradient(circle_at_80%_15%,rgba(16,185,129,0.18),transparent_40%),linear-gradient(180deg,#171a21_0%,#11141b_100%)]"
      >
        <div className="absolute -left-24 top-24 w-72 h-72 rounded-full bg-orange-500/20 blur-[110px] pointer-events-none" />
        <div className="absolute -right-16 bottom-8 w-64 h-64 rounded-full bg-teal-500/20 blur-[110px] pointer-events-none" />

        <div className={`max-w-7xl mx-auto relative z-10 transition-all duration-700 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-10 items-start">
            <div className="lg:col-span-3">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-orange-300 text-[10px] font-black uppercase tracking-[0.25em]">
                <Sparkles size={12} /> Built by Lumora Tech
              </span>
              <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-black text-white uppercase tracking-tight leading-[0.95]">
                Systems That
                <br className="hidden sm:block" />
                Move Businesses Forward
              </h1>
              <p className="mt-5 max-w-2xl text-sm sm:text-base text-gray-300 font-medium leading-relaxed">
                Lumora Tech (JR0174591U) builds practical technology for ambitious teams. We started in device solutions and are now expanding with QuickServe, a modern all-in-one platform for F and B operations.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button
                  onClick={onGetStarted}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-black uppercase tracking-widest transition-all"
                >
                  Launch QuickServe <ChevronRight size={13} />
                </button>
                <a
                  href="https://www.linkedin.com/company/lumora-tech/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/20 text-white text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  <Globe size={13} /> LinkedIn
                </a>
                <a
                  href="https://wa.me/601154036303?text=Hello%2C%20I%20am%20interested%20to%20know%20about%20Lumora%20Tech"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-white/20 text-white text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  <MessageSquare size={13} /> WhatsApp
                </a>
              </div>

            </div>

            <div className="lg:col-span-2">
              <div className="rounded-3xl border border-white/15 bg-white/10 p-5 sm:p-6 backdrop-blur-md">
                <p className="text-[10px] uppercase tracking-widest text-orange-300 font-black">Spotlight</p>
                <h3 className="mt-2 text-xl text-white font-black uppercase">How We Work</h3>
                <div className="mt-4 space-y-3">
                  {spotlightCards.map((card, idx) => (
                    <button
                      key={card.title}
                      type="button"
                      onClick={() => setActiveSpotlight(idx)}
                      className={`w-full text-left rounded-2xl border p-4 transition-all ${activeSpotlight === idx ? 'border-orange-300 bg-orange-500/20 text-white' : 'border-white/15 bg-black/20 text-gray-300 hover:bg-white/10'}`}
                    >
                      <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
                        {card.icon} {card.title}
                      </p>
                      <p className="mt-2 text-xs leading-relaxed font-medium">{card.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="relative py-16 sm:py-20 px-4 sm:px-6 overflow-hidden bg-gradient-to-b from-[#f6f5f1] via-[#f4f3ee] to-[#f1f1ec] dark:from-[#141920] dark:via-[#151c24] dark:to-[#16202a]">
        <div ref={aboutRef.ref} className={`max-w-7xl mx-auto transition-all duration-700 ${aboutRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-[#0f141b]/80 p-6 sm:p-8">
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">About Lumora</p>
              <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">From Repair Services To Smart Operations</h2>
              <div className="mt-5 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300 font-medium">
                <p>Lumora Tech started as a trusted device service provider and grew through consistency, technical depth, and customer trust.</p>
                <p>Today, with QuickServe, we are bringing the same practical approach into restaurant operations through QR ordering, table workflows, kitchen display support, and staff POS in one connected system.</p>
                <p>Our direction is simple: practical products, transparent pricing, and a long-term commitment to customer growth.</p>
              </div>
              <div className="mt-6 rounded-2xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/40 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Company Registration</p>
                <p className="text-2xl font-black mt-1 text-gray-900 dark:text-white">JR0174591U</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mt-1">SSM Registered - Malaysia</p>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-[#0f141b]/80 p-5 sm:p-6">
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">Core Values</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {valueTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveValue(tab.id)}
                    className={`rounded-xl py-2 px-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeValue === tab.id ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:text-orange-500'}`}
                  >
                    {tab.title}
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-white to-orange-50 dark:from-[#131a23] dark:to-[#1b2530] p-5 min-h-52">
                <h3 className="text-xl font-black uppercase tracking-tight">{activeValueData.headline}</h3>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed font-medium">{activeValueData.description}</p>
                <div className="mt-4 space-y-2">
                  {activeValueData.points.map((point) => (
                    <p key={point} className="text-xs font-bold text-gray-700 dark:text-gray-200 inline-flex items-center gap-2">
                      <ShieldCheck size={14} className="text-orange-500" /> {point}
                    </p>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href="https://www.linkedin.com/company/lumora-tech/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[10px] font-black uppercase tracking-widest hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all"
                >
                  <Globe size={13} /> Follow Updates
                </a>
                <a
                  href="mailto:lumoratech.ent@gmail.com"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-[10px] font-black uppercase tracking-widest hover:border-orange-400 hover:text-orange-500 transition-all"
                >
                  <MessageSquare size={13} /> Contact Us
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="team" className="relative py-16 sm:py-20 px-4 sm:px-6 overflow-hidden bg-gradient-to-b from-[#f1f1ec] via-[#efefea] to-[#edede8] dark:from-[#16202a] dark:via-[#17222d] dark:to-[#182530]">
        <div ref={teamRef.ref} className={`max-w-7xl mx-auto transition-all duration-700 ${teamRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-8 sm:mb-10">
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">Our Team</span>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter">People Behind The Product</h2>
          </div>

          {teamMembers.length > 0 ? (
            <div className="space-y-4 lg:space-y-5">
              {teamRows.map((row, rowIndex) => {
                const rowLength = row.length;
                const rowGridClass = rowLength === 1
                  ? 'grid grid-cols-1 max-w-xl mx-auto'
                  : rowLength === 2
                    ? 'grid grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto'
                    : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

                return (
                  <div key={`row-${rowIndex}`} className={`${rowGridClass} gap-4 lg:gap-5 items-start`}>
                    {row.map((member, memberIndex) => {
                      const isSelected = selectedMemberId === member.id;
                      const isRightEdge = memberIndex === rowLength - 1;

                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => setSelectedMemberId((current) => current === member.id ? null : member.id)}
                          className={`text-left rounded-3xl border p-4 sm:p-5 transition-all duration-300 ${isSelected ? 'md:col-span-2 border-orange-400 bg-orange-50 dark:bg-orange-900/20 shadow-lg shadow-orange-500/10' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:-translate-y-0.5 hover:shadow-md'}`}
                          style={{ transitionDelay: `${(rowIndex * 3 + memberIndex) * 70}ms` }}
                        >
                          <div className={`flex flex-col gap-4 ${isSelected ? `lg:flex-row ${isRightEdge ? 'lg:flex-row-reverse' : ''} lg:items-start` : ''}`}>
                            <div className={`flex items-center gap-3 ${isSelected ? 'lg:w-[16rem] lg:shrink-0' : ''}`}>
                              {member.photo_url ? (
                                <img
                                  src={member.photo_url}
                                  alt={member.name}
                                  className={`${isSelected ? 'w-20 h-20 sm:w-24 sm:h-24 rounded-3xl' : 'w-14 h-14 rounded-2xl'} object-cover border border-orange-200 dark:border-orange-800`}
                                />
                              ) : (
                                <div className={`${isSelected ? 'w-20 h-20 sm:w-24 sm:h-24 rounded-3xl' : 'w-14 h-14 rounded-2xl'} bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 flex items-center justify-center`}>
                                  <span className={`${isSelected ? 'text-3xl' : 'text-xl'} text-orange-500 font-black`}>{member.name.charAt(0)}</span>
                                </div>
                              )}
                              <div>
                                <p className="text-sm sm:text-base font-black uppercase text-gray-900 dark:text-white">{member.name}</p>
                                <p className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 mt-0.5">{member.role}</p>
                              </div>
                            </div>

                            {isSelected && (
                              <div className="flex-1 lg:min-w-0">
                                <div className="rounded-2xl bg-white/70 dark:bg-gray-950/40 border border-orange-200/70 dark:border-orange-900/40 p-4 sm:p-5">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">{member.collaboration_header || 'Collaboration Style'}</p>
                                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                                    {member.collaboration_description || 'Our team combines technical execution, responsive support, and practical product thinking to build reliable experiences for growing businesses.'}
                                  </p>
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    {[member.trait_one || 'Customer Focused', member.trait_two || 'Fast Iteration', member.trait_three || 'Operational Mindset'].map((trait, traitIdx) => (
                                      <span
                                        key={`${member.id}-${traitIdx}-${trait}`}
                                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${traitIdx === 0 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
                                      >
                                        {trait}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400 text-sm font-medium">Loading team...</div>
          )}
        </div>
      </section>

      <section id="location" className="relative py-16 sm:py-20 px-4 sm:px-6 overflow-hidden bg-gradient-to-b from-[#edede8] via-[#ecebe6] to-[#ebeae5] dark:from-[#182530] dark:via-[#192733] dark:to-[#1a2936]">
        <div ref={mapRef.ref} className={`max-w-7xl mx-auto transition-all duration-700 ${mapRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-8 sm:mb-10">
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">Visit Us</span>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter">Our Location</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
                  <MapPin size={22} className="text-orange-500" />
                </div>
                <p className="text-xs font-black text-orange-500 uppercase tracking-widest mb-1">Address</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200 leading-relaxed">
                  Lumora Tech Ent.
                  <br />
                  Jalan Juruanalisis UI/35, Seksyen U1, 40150 Shah Alam, Selangor
                </p>
              </div>
              <a
                href="https://maps.app.goo.gl/LbvPzsx9y69htbkCA"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-500 text-white font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all"
              >
                <ExternalLink size={12} /> Open in Google Maps
              </a>
            </div>

            <div className="lg:col-span-2 rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 h-80 sm:h-96">
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

          <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400 font-semibold">
            Map not loading?{' '}
            <a
              href="https://maps.app.goo.gl/LbvPzsx9y69htbkCA"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-500 hover:underline font-bold"
            >
              Click here to open in Google Maps
            </a>
          </p>
        </div>
      </section>

      <section id="careers" className="relative py-16 sm:py-20 px-4 sm:px-6 overflow-hidden bg-gradient-to-b from-[#ebeae5] via-[#e9e8e3] to-[#e7e6e1] dark:from-[#1a2936] dark:via-[#1b2a38] dark:to-[#1c2b3a]">
        <div ref={joinRef.ref} className={`max-w-7xl mx-auto transition-all duration-700 ${joinRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-8 sm:mb-10">
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">Careers</span>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter">Join Our Team</h2>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 font-medium">Share your profile and we will review your application.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">What We Look For</p>
              <ul className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-300 font-medium">
                <li className="inline-flex items-start gap-2">
                  <ShieldCheck size={15} className="text-orange-500 mt-0.5" /> Ownership and accountability
                </li>
                <li className="inline-flex items-start gap-2">
                  <ShieldCheck size={15} className="text-orange-500 mt-0.5" /> Customer-first thinking
                </li>
                <li className="inline-flex items-start gap-2">
                  <ShieldCheck size={15} className="text-orange-500 mt-0.5" /> Strong execution pace
                </li>
              </ul>
              <a
                href="https://wa.me/601154036303?text=Hello%2C%20I%20want%20to%20know%20about%20joining%20Lumora%20Tech"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[10px] font-black uppercase tracking-widest hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all"
              >
                <MessageSquare size={12} /> Ask About Openings
              </a>
            </div>

            <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6 md:p-8">
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    required
                    type="text"
                    placeholder="Full name"
                    value={joinForm.fullName}
                    onChange={(e) => handleChange('fullName', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium dark:text-white outline-none focus:border-orange-500"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email address"
                    value={joinForm.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium dark:text-white outline-none focus:border-orange-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Phone number"
                    value={joinForm.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium dark:text-white outline-none focus:border-orange-500"
                  />
                  <input
                    required
                    type="text"
                    placeholder="Role you are applying for"
                    value={joinForm.role}
                    onChange={(e) => handleChange('role', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium dark:text-white outline-none focus:border-orange-500"
                  />
                </div>
                <textarea
                  rows={3}
                  placeholder="Experience summary"
                  value={joinForm.experience}
                  onChange={(e) => handleChange('experience', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium dark:text-white outline-none focus:border-orange-500 resize-none"
                />
                <textarea
                  rows={3}
                  placeholder="Additional message (optional)"
                  value={joinForm.message}
                  onChange={(e) => handleChange('message', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium dark:text-white outline-none focus:border-orange-500 resize-none"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 rounded-xl bg-orange-500 text-white font-black text-[11px] uppercase tracking-widest hover:bg-orange-600 transition-all disabled:opacity-60"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Application'}
                </button>
                {feedback && (
                  <p className={`text-xs font-bold text-center ${feedback.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                    {feedback.message}
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-10 px-4 sm:px-6 bg-gray-950 text-center">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 mb-6 text-[11px] font-black text-gray-400 uppercase tracking-widest hover:text-orange-500 transition-colors"
        >
          <ArrowLeft size={12} /> Back to QuickServe
        </button>
        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">&copy; 2026 Lumora Tech (JR0174591U). All Rights Reserved.</p>
      </footer>
    </div>
  );
};

export default CompanyPage;
