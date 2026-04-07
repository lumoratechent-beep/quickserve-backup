import React, { useState, useEffect, useRef } from 'react';
import { Globe, ArrowLeft, Sun, Moon, MapPin, MessageSquare, ShieldCheck, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

const useInView = (options?: IntersectionObserverInit) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setIsInView(true); observer.disconnect(); }
    }, { threshold: 0.1, ...options });
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

const CompanyPage: React.FC<Props> = ({ onBack, isDarkMode, onToggleDark, onGetStarted, onLogin }) => {
  const heroRef = useInView();
  const aboutRef = useInView();
  const teamRef = useInView();
  const mapRef = useInView();
  const joinRef = useInView();

  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; role: string; photo_url: string | null; sort_order: number }[]>([]);
  const [joinForm, setJoinForm] = useState({ fullName: '', email: '', phone: '', role: '', experience: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    supabase.from('team_members').select('id, name, role, photo_url, sort_order').order('sort_order').then(({ data }) => {
      if (data) setTeamMembers(data);
    });
  }, []);

  const handleChange = (field: keyof typeof joinForm, value: string) =>
    setJoinForm(prev => ({ ...prev, [field]: value }));

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
    <div className="min-h-screen bg-white dark:bg-gray-950 font-sans overflow-x-hidden">
      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 hover:text-orange-500 transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <div className="flex items-center gap-2 ml-2">
            <img src="/LOGO/9.png" alt="QuickServe" className="h-7 dark:hidden" />
            <img src="/LOGO/9-dark.png" alt="QuickServe" className="h-7 hidden dark:block" />
          </div>
          <div className="flex-1" />
          {onToggleDark && (
            <button
              onClick={onToggleDark}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:text-orange-500 transition-all"
            >
              {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          )}
          <button
            onClick={onLogin}
            className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all"
          >
            Login
          </button>
          <button
            onClick={onGetStarted}
            className="px-4 py-2 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div ref={heroRef.ref} className="relative bg-gradient-to-br from-gray-950 to-gray-900 py-24 px-6 overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[600px] h-[400px] bg-orange-500/15 rounded-full blur-[160px] pointer-events-none" />
        <div className={`max-w-4xl mx-auto text-center relative z-10 transition-all duration-700 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-4 block">Our Company</span>
          <h1 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter leading-none mb-6">
            Powered by<br />
            <span className="text-orange-500">Lumora Tech</span>
          </h1>
          <p className="text-sm md:text-base text-gray-400 font-medium max-w-2xl mx-auto leading-relaxed">
            Lumora Tech (JR0174591U) — Empowering Technology, Enabling Growth
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
            <a
              href="https://www.linkedin.com/company/lumora-tech/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-orange-500 text-white text-[11px] font-black uppercase tracking-widest transition-all"
            >
              <Globe size={13} /> LinkedIn
            </a>
            <a
              href="https://wa.me/601154036303?text=Hello%2C%20I%20am%20interested%20to%20know%20about%20Lumora%20Tech"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-orange-500 text-white text-[11px] font-black uppercase tracking-widest transition-all"
            >
              <MessageSquare size={13} /> WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* ── ABOUT ── */}
      <section className="py-20 px-6 bg-white dark:bg-gray-950">
        <div ref={aboutRef.ref} className={`max-w-7xl mx-auto transition-all duration-700 ${aboutRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-gray-50 dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6 md:p-8">
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">About Us</span>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-5">Who We Are</h2>
              <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                <p>Founded in 2021, Lumora Tech began as a small in house service driven by passion and technical expertise. Over the years, we have grown into a trusted provider of device solutions, including smartphone repairs, sales, trade ins, Chromebooks, laptops, and screen protection.</p>
                <p>Today, we are taking our first step into digital systems with the launch of QuickServe, our all in one restaurant management platform. Built for modern F&B businesses, QuickServe combines QR ordering, table management, kitchen display systems, and staff POS into one seamless and easy to use solution. No expensive hardware. No hidden fees. Go live in minutes.</p>
                <p>As industries continue to evolve, we are committed to growing alongside businesses by delivering innovative yet affordable technology. QuickServe marks the beginning of our journey in building smarter systems that simplify operations and create new opportunities.</p>
                <p>At Lumora Tech, we believe technology should be reliable, accessible, and cost effective. Our mission is to remove barriers to adoption and deliver solutions that create real impact for businesses and communities.</p>
                <p>With a strong focus on customer satisfaction, innovation, and long term partnerships, Lumora Tech is dedicated to delivering technology that truly works for you.</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6">
                <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">Connect</span>
                <a
                  href="https://www.linkedin.com/company/lumora-tech/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm font-black text-orange-600 dark:text-orange-400 hover:text-orange-500 transition-colors"
                >
                  <Globe size={15} /> Lumora Tech on LinkedIn
                </a>
                <div className="mt-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 font-medium">
                    <MessageSquare size={14} className="text-orange-500 shrink-0" />
                    +60 11-5403 6303
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 font-medium">
                    <ShieldCheck size={14} className="text-orange-500 shrink-0" />
                    hello@quickserve.my
                  </div>
                </div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-3xl border border-orange-100 dark:border-orange-900/30 p-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-1">Company Registration</p>
                <p className="text-xl font-black text-gray-800 dark:text-gray-200">JR0174591U</p>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">SSM Registered · Malaysia</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TEAM ── */}
      <section className="py-20 px-6 bg-gray-50 dark:bg-gray-900/50">
        <div ref={teamRef.ref} className={`max-w-7xl mx-auto transition-all duration-700 ${teamRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-10">
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">Our People</span>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Meet The Team</h2>
          </div>

          {teamMembers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {teamMembers.map((member, idx) => (
                <div
                  key={member.id}
                  className={`bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6 flex flex-col items-center text-center transition-all duration-700`}
                  style={{ transitionDelay: `${idx * 80}ms` }}
                >
                  {member.photo_url ? (
                    <img
                      src={member.photo_url}
                      alt={member.name}
                      className="w-24 h-24 rounded-full object-cover border-4 border-orange-500/20 mb-4"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-orange-100 dark:bg-orange-900/30 border-4 border-orange-200 dark:border-orange-800 flex items-center justify-center mb-4">
                      <span className="text-orange-500 font-black text-3xl">{member.name.charAt(0)}</span>
                    </div>
                  )}
                  <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">{member.name}</p>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">{member.role}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400 text-sm font-medium">Loading team...</div>
          )}
        </div>
      </section>

      {/* ── LOCATION / MAP ── */}
      <section className="py-20 px-6 bg-white dark:bg-gray-950">
        <div ref={mapRef.ref} className={`max-w-7xl mx-auto transition-all duration-700 ${mapRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-10">
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">Where To Find Us</span>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Our Location</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Info card */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
                  <MapPin size={22} className="text-orange-500" />
                </div>
                <p className="text-xs font-black text-orange-500 uppercase tracking-widest mb-1">Address</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200 leading-relaxed">
                  Lumora Tech<br />
                  Malaysia
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

            {/* Map embed */}
            <div className="lg:col-span-2 rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 h-80">
              <iframe
                title="Lumora Tech Location"
                src="https://maps.google.com/maps?q=Lumora+Tech&output=embed&z=16"
                className="w-full h-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          </div>

          {/* Fallback note with direct link */}
          <p className="mt-4 text-center text-xs text-gray-400 font-medium">
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

      {/* ── JOIN OUR TEAM ── */}
      <section className="py-20 px-6 bg-gray-50 dark:bg-gray-900/50">
        <div ref={joinRef.ref} className={`max-w-3xl mx-auto transition-all duration-700 ${joinRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="text-center mb-10">
            <span className="text-[11px] font-black text-orange-500 uppercase tracking-[0.2em] mb-3 block">Careers</span>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Join Our Team</h2>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 font-medium">Submit your details and our team will review your application.</p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6 md:p-8">
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
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-10 px-6 bg-gray-950 border-t border-gray-800 text-center">
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
