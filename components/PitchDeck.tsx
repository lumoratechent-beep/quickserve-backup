import React, { useState, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, Monitor, Smartphone, Utensils, QrCode, BarChart3, Zap, Clock, ShieldCheck, Users, Star, CheckCircle2, ArrowRight, Globe, Phone } from 'lucide-react';

interface PitchDeckProps {
  onClose: () => void;
}

const SLIDE_W = 1024;
const SLIDE_H = 768;

const PitchDeck: React.FC<PitchDeckProps> = ({ onClose }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);

  const handleDownload = useCallback(() => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank', `width=${SLIDE_W},height=${SLIDE_H}`);
    if (!printWindow) return;

    const slides = printRef.current.querySelectorAll('[data-slide]');
    let slidesHtml = '';
    slides.forEach((slide) => {
      slidesHtml += `<div style="width:${SLIDE_W}px;height:${SLIDE_H}px;overflow:hidden;page-break-after:always;position:relative;">${slide.innerHTML}</div>`;
    });

    printWindow.document.write(`<!DOCTYPE html><html><head><title>QuickServe Pitch Deck</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Inter',sans-serif;background:#fff;}
@media print{
  @page{size:${SLIDE_W}px ${SLIDE_H}px;margin:0;}
  body{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  div[style*="page-break-after"]{page-break-inside:avoid;}
}
</style></head><body>${slidesHtml}</body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  }, []);

  const nextSlide = () => setCurrentSlide(s => Math.min(s + 1, slides.length - 1));
  const prevSlide = () => setCurrentSlide(s => Math.max(s - 1, 0));

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === ' ') nextSlide();
    else if (e.key === 'ArrowLeft') prevSlide();
    else if (e.key === 'Escape') onClose();
  }, [onClose]);

  // ── Slide definitions ──
  const slides = [
    // 1. TITLE SLIDE
    <div key="title" data-slide style={{ width: SLIDE_W, height: SLIDE_H, background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#fff', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      {/* Background pattern */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.05 }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} style={{ position: 'absolute', width: 200, height: 200, border: '1px solid #f97316', borderRadius: '50%', left: `${(i % 5) * 25}%`, top: `${Math.floor(i / 5) * 25}%`, transform: 'translate(-50%, -50%)' }} />
        ))}
      </div>
      {/* Orange accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: 'linear-gradient(90deg, #f97316, #ea580c, #f97316)' }} />
      {/* Badge */}
      <div style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 100, padding: '8px 24px', fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#fb923c', marginBottom: 32 }}>
        Malaysia's #1 Restaurant Platform
      </div>
      {/* Logo */}
      <div style={{ width: 80, height: 80, background: '#f97316', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, boxShadow: '0 20px 60px rgba(249,115,22,0.3)' }}>
        <span style={{ fontSize: 36, fontWeight: 900, color: '#fff' }}>Q</span>
      </div>
      <h1 style={{ fontSize: 56, fontWeight: 900, letterSpacing: -3, textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.1, marginBottom: 16 }}>
        Quick<span style={{ color: '#f97316' }}>Serve</span>
      </h1>
      <p style={{ fontSize: 18, color: '#94a3b8', maxWidth: 600, textAlign: 'center', lineHeight: 1.6, fontWeight: 500 }}>
        The Complete Restaurant Management Platform — QR ordering, POS, kitchen display & smart analytics.
      </p>
      <div style={{ display: 'flex', gap: 24, marginTop: 40, fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 2 }}>
        <span>No Hardware Required</span>
        <span style={{ color: '#f97316' }}>•</span>
        <span>5-Min Setup</span>
        <span style={{ color: '#f97316' }}>•</span>
        <span>30-Day Free Trial</span>
      </div>
      {/* Bottom bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f97316, #ea580c)' }} />
    </div>,

    // 2. PROBLEM SLIDE
    <div key="problem" data-slide style={{ width: SLIDE_W, height: SLIDE_H, background: '#fff', position: 'relative', display: 'flex', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      {/* Left panel */}
      <div style={{ width: '45%', background: 'linear-gradient(135deg, #0F172A, #1E293B)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 50px', color: '#fff' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: '#f97316', marginBottom: 16 }}>The Problem</div>
        <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: -2, lineHeight: 1.15, textTransform: 'uppercase' }}>
          Restaurants Are <span style={{ color: '#f97316' }}>Stuck</span> In The Past
        </h2>
        <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 20, lineHeight: 1.7 }}>
          Traditional systems are expensive, complex, and slow. Most F&B businesses struggle with outdated tools that don't scale.
        </p>
      </div>
      {/* Right panel - pain points */}
      <div style={{ width: '55%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 50px', gap: 20 }}>
        {[
          { icon: '💰', title: 'Expensive POS Hardware', desc: 'RM 5,000–15,000+ for legacy terminal systems that lock you in' },
          { icon: '⏳', title: 'Slow & Manual Ordering', desc: 'Handwritten orders, miscommunication, long wait times' },
          { icon: '📊', title: 'No Real-Time Insights', desc: 'No visibility into sales trends, peak hours, or staff performance' },
          { icon: '🔧', title: 'Complex Setup & Maintenance', desc: 'Weeks of installation, training, and ongoing IT support needed' },
          { icon: '📱', title: 'No Digital Ordering', desc: 'Missing out on QR/online orders while competitors modernize' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ width: 44, height: 44, background: '#FFF7ED', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{item.icon}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', letterSpacing: -0.3 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>,

    // 3. SOLUTION SLIDE
    <div key="solution" data-slide style={{ width: SLIDE_W, height: SLIDE_H, background: 'linear-gradient(135deg, #f97316, #ea580c)', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#fff', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.1 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ position: 'absolute', width: 300 + i * 100, height: 300 + i * 100, border: '2px solid #fff', borderRadius: '50%', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
        ))}
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', background: 'rgba(255,255,255,0.2)', padding: '8px 24px', borderRadius: 100, marginBottom: 32 }}>The Solution</div>
      <h2 style={{ fontSize: 48, fontWeight: 900, letterSpacing: -3, textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.1, marginBottom: 20, maxWidth: 700 }}>
        One Platform. Everything You Need.
      </h2>
      <p style={{ fontSize: 18, maxWidth: 550, textAlign: 'center', lineHeight: 1.6, opacity: 0.9, fontWeight: 500 }}>
        QuickServe replaces expensive hardware with a powerful cloud platform. Works on any device, any browser. Live in 5 minutes.
      </p>
      <div style={{ display: 'flex', gap: 32, marginTop: 48 }}>
        {[
          { icon: '🖥️', label: 'Cloud POS' },
          { icon: '📱', label: 'QR Ordering' },
          { icon: '👨‍🍳', label: 'Kitchen Display' },
          { icon: '📊', label: 'Analytics' },
        ].map((item, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 10 }}>{item.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>,

    // 4. FEATURE - QR ORDERING
    <div key="qr" data-slide style={{ width: SLIDE_W, height: SLIDE_H, background: '#fff', position: 'relative', display: 'flex', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      <div style={{ width: '50%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 50px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, background: '#FFF7ED', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 20 }}>📱</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: '#f97316' }}>Feature</span>
        </div>
        <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -2, color: '#0F172A', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 16 }}>
          QR Code <span style={{ color: '#f97316' }}>Ordering</span>
        </h2>
        <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.7, marginBottom: 28 }}>
          Customers scan a table QR code, browse the full menu, customize items, and place orders — all from their phone. No app download needed.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {['Scan & order in seconds', 'Full menu with images & descriptions', 'Item customization (sizes, add-ons)', 'Real-time order tracking', 'Zero contact, zero wait'].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 22, height: 22, background: '#f97316', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 900 }}>✓</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ width: '50%', background: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ width: 220, height: 400, background: '#0F172A', borderRadius: 32, padding: 8, boxShadow: '0 40px 80px rgba(0,0,0,0.15)' }}>
          <div style={{ width: '100%', height: '100%', background: '#fff', borderRadius: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px', gap: 12 }}>
            <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 4 }} />
            <div style={{ width: 50, height: 50, background: '#f97316', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 22 }}>Q</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#0F172A' }}>Menu</div>
            {['Classic Burger', 'Truffle Fries', 'Vanilla Shake'].map((item, i) => (
              <div key={i} style={{ width: '100%', background: '#f8fafc', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#0F172A' }}>{item}</div>
                  <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>RM {(12.99 - i * 3).toFixed(2)}</div>
                </div>
                <div style={{ width: 24, height: 24, background: '#f97316', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>+</span>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 'auto', width: '100%', background: '#f97316', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
              <span style={{ color: '#fff', fontSize: 10, fontWeight: 800 }}>Place Order</span>
            </div>
          </div>
        </div>
        {/* Floating QR badge */}
        <div style={{ position: 'absolute', bottom: 40, right: 40, width: 80, height: 80, background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <div style={{ width: 40, height: 40, background: '#0F172A', borderRadius: 6, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr 1fr', gap: 2, padding: 4 }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{ background: i % 2 === 0 ? '#fff' : 'transparent', borderRadius: 1 }} />
            ))}
          </div>
          <span style={{ fontSize: 7, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Scan Me</span>
        </div>
      </div>
    </div>,

    // 5. FEATURE - FULL POS SYSTEM
    <div key="pos" data-slide style={{ width: SLIDE_W, height: SLIDE_H, background: '#0F172A', position: 'relative', display: 'flex', fontFamily: 'Inter, sans-serif', overflow: 'hidden', color: '#fff' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f97316, #ea580c)' }} />
      <div style={{ width: '50%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 50px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, background: 'rgba(249,115,22,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 20 }}>🖥️</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: '#f97316' }}>Feature</span>
        </div>
        <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -2, textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 16 }}>
          Full <span style={{ color: '#f97316' }}>POS</span> System
        </h2>
        <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.7, marginBottom: 28 }}>
          A powerful point-of-sale built for speed. Counter orders, takeaways, dine-in — all in one beautiful interface that works on any device.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Counter Orders', desc: 'Fast checkout flow' },
            { label: 'Multiple Payment', desc: 'Cash, card, e-wallet' },
            { label: 'Receipt Printing', desc: 'Bluetooth thermal printers' },
            { label: 'Offline Support', desc: 'Works without internet' },
            { label: 'Multi-Staff', desc: 'Cashier role management' },
            { label: 'Custom Menus', desc: 'Categories & modifiers' },
          ].map((item, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: -0.3 }}>{item.label}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ width: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {/* POS Screen Mockup */}
        <div style={{ width: 380, height: 260, background: '#1E293B', borderRadius: 16, border: '2px solid rgba(255,255,255,0.1)', padding: 16, boxShadow: '0 40px 80px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, background: '#ef4444', borderRadius: '50%' }} />
            <div style={{ width: 8, height: 8, background: '#eab308', borderRadius: '50%' }} />
            <div style={{ width: 8, height: 8, background: '#22c55e', borderRadius: '50%' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, height: 'calc(100% - 24px)' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['Burger', 'Fries', 'Drink'].map((item, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{item}</span>
                  <span style={{ fontSize: 9, color: '#f97316', fontWeight: 700 }}>RM {(12.99 - i * 3).toFixed(2)}</span>
                </div>
              ))}
              <div style={{ marginTop: 'auto', background: '#f97316', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: '#fff' }}>CHARGE RM 26.97</span>
              </div>
            </div>
            <div style={{ width: 100, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 7, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 2 }}>Menu</div>
              {['Main', 'Sides', 'Drinks'].map((cat, i) => (
                <div key={i} style={{ background: i === 0 ? '#f97316' : 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                  <span style={{ fontSize: 7, fontWeight: 700, color: i === 0 ? '#fff' : '#64748b' }}>{cat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Stand */}
        <div style={{ position: 'absolute', bottom: 160, left: '50%', transform: 'translateX(-50%)', width: 60, height: 80, background: 'linear-gradient(to bottom, #334155, #1E293B)', borderRadius: '0 0 8px 8px' }} />
        <div style={{ position: 'absolute', bottom: 140, left: '50%', transform: 'translateX(-50%)', width: 120, height: 12, background: '#334155', borderRadius: 6 }} />
      </div>
    </div>,

    // 6. FEATURE - KITCHEN DISPLAY SYSTEM
    <div key="kds" data-slide style={{ width: SLIDE_W, height: SLIDE_H, background: '#fff', position: 'relative', display: 'flex', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      <div style={{ width: '55%', background: 'linear-gradient(135deg, #FFF7ED, #FEF3C7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 50 }}>
        {/* KDS Screen Mockup */}
        <div style={{ width: 420, background: '#0F172A', borderRadius: 16, padding: 16, boxShadow: '0 30px 60px rgba(0,0,0,0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: 2 }}>Kitchen Display</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ width: 8, height: 8, background: '#22c55e', borderRadius: '50%' }} />
              <span style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>LIVE</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { id: '#041', items: ['2x Burger', '1x Fries'], time: '2m', status: 'NEW', color: '#f97316' },
              { id: '#042', items: ['1x Pizza', '2x Cola'], time: '5m', status: 'PREP', color: '#3b82f6' },
              { id: '#043', items: ['3x Sushi', '1x Miso'], time: '8m', status: 'READY', color: '#22c55e' },
            ].map((order) => (
              <div key={order.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 10, border: `1px solid ${order.color}30` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>{order.id}</span>
                  <span style={{ fontSize: 7, fontWeight: 700, color: order.color, background: `${order.color}20`, padding: '2px 6px', borderRadius: 4 }}>{order.status}</span>
                </div>
                {order.items.map((item, i) => (
                  <div key={i} style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{item}</div>
                ))}
                <div style={{ fontSize: 7, color: '#64748b', marginTop: 4 }}>⏱ {order.time} ago</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ width: '45%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 50px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, background: '#FFF7ED', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 20 }}>👨‍🍳</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: '#f97316' }}>Feature</span>
        </div>
        <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: -2, color: '#0F172A', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 16 }}>
          Kitchen <span style={{ color: '#f97316' }}>Display</span> System
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, marginBottom: 24 }}>
          Orders flow directly to the kitchen screen. Staff see a live queue organized by department — no paper tickets, no shouting.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {['Live order queue by department', 'Status tracking (New → Prep → Ready)', 'Auto bill routing to counter', 'Kitchen category filtering', 'Multiple kitchen departments'].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 22, height: 22, background: '#f97316', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 900 }}>✓</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,

    // 7. FEATURE - SMART ANALYTICS
    <div key="analytics" data-slide style={{ width: SLIDE_W, height: SLIDE_H, background: '#0F172A', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 70px', fontFamily: 'Inter, sans-serif', overflow: 'hidden', color: '#fff' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f97316, #ea580c)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, background: 'rgba(249,115,22,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 20 }}>📊</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: '#f97316' }}>Feature</span>
      </div>
      <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -2, textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 12 }}>
        Smart <span style={{ color: '#f97316' }}>Analytics</span> & Reports
      </h2>
      <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.6, marginBottom: 36, maxWidth: 500 }}>
        Real-time dashboards that give you full visibility into your business — from daily sales to staff performance.
      </p>
      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
        {[
          { label: 'Daily Sales', value: 'RM 4,320', change: '+12%', up: true },
          { label: 'Orders Today', value: '186', change: '+8%', up: true },
          { label: 'Avg Order', value: 'RM 23.20', change: '+3%', up: true },
          { label: 'Top Item', value: 'Burger', change: '42 sold', up: true },
        ].map((stat, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{stat.label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -1 }}>{stat.value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', marginTop: 4 }}>↑ {stat.change}</div>
          </div>
        ))}
      </div>
      {/* Chart mockup */}
      <div style={{ marginTop: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: '20px 24px', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#94a3b8' }}>Weekly Revenue</span>
          <span style={{ fontSize: 10, color: '#64748b' }}>Last 7 days</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 100 }}>
          {[65, 40, 80, 55, 90, 70, 95].map((h, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', height: h, background: `linear-gradient(to top, #f97316, #fb923c)`, borderRadius: 6, opacity: i === 6 ? 1 : 0.6 }} />
              <span style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,

    // 8. FEATURE - 5 MIN SETUP
    <div key="setup" data-slide style={{ width: SLIDE_W, height: SLIDE_H, background: '#fff', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: '#f97316', marginBottom: 16 }}>How It Works</div>
      <h2 style={{ fontSize: 44, fontWeight: 900, letterSpacing: -3, color: '#0F172A', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.1, marginBottom: 12 }}>
        Live in <span style={{ color: '#f97316' }}>5 Minutes</span>
      </h2>
      <p style={{ fontSize: 15, color: '#64748b', textAlign: 'center', maxWidth: 500, lineHeight: 1.6, marginBottom: 48 }}>
        No technicians. No expensive hardware. Just sign up and start serving.
      </p>
      <div style={{ display: 'flex', gap: 24, maxWidth: 880 }}>
        {[
          { step: '01', title: 'Register', desc: 'Create your account and choose a plan. 30-day free trial on all plans.', icon: '📝', color: '#f97316' },
          { step: '02', title: 'Setup Menu', desc: 'Upload your menu items with images, prices, sizes, and add-ons.', icon: '🍕', color: '#ea580c' },
          { step: '03', title: 'Print QR Codes', desc: 'Generate unique QR codes for each table. Print and stick.', icon: '📲', color: '#dc2626' },
          { step: '04', title: 'Go Live!', desc: 'Start receiving orders instantly. Train staff in under 10 minutes.', icon: '🚀', color: '#b91c1c' },
        ].map((item, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
            {i < 3 && <div style={{ position: 'absolute', top: 36, right: -16, width: 32, height: 2, background: '#e2e8f0' }} />}
            <div style={{ width: 72, height: 72, background: `${item.color}10`, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px', border: `2px solid ${item.color}20` }}>
              {item.icon}
            </div>
            <div style={{ fontSize: 11, fontWeight: 900, color: item.color, letterSpacing: 2, marginBottom: 6 }}>STEP {item.step}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 6, letterSpacing: -0.5 }}>{item.title}</div>
            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>{item.desc}</div>
          </div>
        ))}
      </div>
    </div>,

    // 9. PRICING PLANS
    <div key="pricing" data-slide style={{ width: SLIDE_W, height: SLIDE_H, background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, sans-serif', overflow: 'hidden', color: '#fff' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f97316, #ea580c)' }} />
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: '#f97316', marginBottom: 12 }}>Pricing</div>
      <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -2, textTransform: 'uppercase', textAlign: 'center', marginBottom: 8 }}>
        Simple, <span style={{ color: '#f97316' }}>Transparent</span> Pricing
      </h2>
      <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 40 }}>30-day free trial on all plans. No credit card required.</p>
      <div style={{ display: 'flex', gap: 20, maxWidth: 880 }}>
        {[
          {
            name: 'Basic', price: 30, annual: 25, desc: 'Essential POS features',
            features: ['Full POS system', 'Back-office management', 'Sales & performance reports', '24/7 customer support'],
            highlighted: false,
          },
          {
            name: 'Pro', price: 50, annual: 42, desc: 'QR ordering & tablet support',
            features: ['Everything in Basic', 'QR ordering system', 'Tablet ordering for staff', 'Online shop page'],
            highlighted: true,
          },
          {
            name: 'Pro Plus', price: 70, annual: 60, desc: 'Full kitchen integration',
            features: ['Everything in Pro', 'Kitchen display system', 'Auto bill routing', 'Multi-department kitchen'],
            highlighted: false,
          },
        ].map((plan) => (
          <div key={plan.name} style={{
            flex: 1, borderRadius: 24, padding: 32,
            background: plan.highlighted ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'rgba(255,255,255,0.05)',
            border: plan.highlighted ? 'none' : '1px solid rgba(255,255,255,0.1)',
            position: 'relative',
            transform: plan.highlighted ? 'scale(1.05)' : 'none',
            boxShadow: plan.highlighted ? '0 20px 60px rgba(249,115,22,0.3)' : 'none',
          }}>
            {plan.highlighted && (
              <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: '#fff', color: '#f97316', fontSize: 9, fontWeight: 800, padding: '4px 14px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: 1 }}>
                Most Popular
              </div>
            )}
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4, letterSpacing: -0.5 }}>{plan.name}</div>
            <div style={{ fontSize: 11, color: plan.highlighted ? 'rgba(255,255,255,0.8)' : '#64748b', marginBottom: 20 }}>{plan.desc}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: -2 }}>RM {plan.price}</span>
              <span style={{ fontSize: 12, color: plan.highlighted ? 'rgba(255,255,255,0.7)' : '#64748b' }}>/mo</span>
            </div>
            <div style={{ fontSize: 10, color: plan.highlighted ? 'rgba(255,255,255,0.7)' : '#64748b', marginBottom: 20 }}>
              or RM {plan.annual}/mo billed annually
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {plan.features.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 18, height: 18, background: plan.highlighted ? 'rgba(255,255,255,0.2)' : 'rgba(249,115,22,0.15)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: plan.highlighted ? '#fff' : '#f97316' }}>✓</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: plan.highlighted ? 'rgba(255,255,255,0.9)' : '#94a3b8' }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>,

    // 10. WHY QUICKSERVE
    <div key="why" data-slide style={{ width: SLIDE_W, height: SLIDE_H, background: '#fff', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, sans-serif', overflow: 'hidden', padding: '60px 70px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: '#f97316', marginBottom: 16 }}>Why Choose Us</div>
      <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: -2, color: '#0F172A', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.1, marginBottom: 40 }}>
        Built For <span style={{ color: '#f97316' }}>Malaysian</span> Restaurants
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, width: '100%' }}>
        {[
          { icon: '⚡', title: 'Zero Hardware Cost', desc: 'No POS terminals to buy. Works on any phone, tablet, or laptop you already own.' },
          { icon: '🌐', title: 'Cloud-Based', desc: 'Access your business from anywhere. Real-time sync across all devices.' },
          { icon: '🔒', title: 'Secure & Reliable', desc: 'Enterprise-grade security with 99.9% uptime. Your data is always safe.' },
          { icon: '📱', title: 'Mobile-First', desc: 'Designed for mobile from day one. Beautiful on every screen size.' },
          { icon: '🇲🇾', title: 'Made For Malaysia', desc: 'Ringgit pricing, local support, SST-ready. Built by Malaysians, for Malaysians.' },
          { icon: '🚀', title: 'Always Evolving', desc: 'Regular updates with new features. Stock management, e-invoicing, and more coming soon.' },
        ].map((item, i) => (
          <div key={i} style={{ background: '#f8fafc', borderRadius: 20, padding: '28px 24px', border: '1px solid #e2e8f0' }}>
            <div style={{ width: 48, height: 48, background: '#FFF7ED', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 14 }}>{item.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 6, letterSpacing: -0.3 }}>{item.title}</div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{item.desc}</div>
          </div>
        ))}
      </div>
    </div>,

    // 11. CTA / CONTACT SLIDE
    <div key="cta" data-slide style={{ width: SLIDE_W, height: SLIDE_H, background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, sans-serif', overflow: 'hidden', color: '#fff' }}>
      {/* Orange accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: 'linear-gradient(90deg, #f97316, #ea580c, #f97316)' }} />
      {/* Background glow */}
      <div style={{ position: 'absolute', width: 400, height: 400, background: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
      {/* Logo */}
      <div style={{ width: 72, height: 72, background: '#f97316', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28, boxShadow: '0 20px 60px rgba(249,115,22,0.3)' }}>
        <span style={{ fontSize: 32, fontWeight: 900, color: '#fff' }}>Q</span>
      </div>
      <h2 style={{ fontSize: 44, fontWeight: 900, letterSpacing: -3, textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.1, marginBottom: 16 }}>
        Ready to <span style={{ color: '#f97316' }}>Modernize</span>
        <br />Your Restaurant?
      </h2>
      <p style={{ fontSize: 16, color: '#94a3b8', textAlign: 'center', maxWidth: 500, lineHeight: 1.6, marginBottom: 36 }}>
        Join hundreds of Malaysian restaurants already using QuickServe. Start your 30-day free trial today.
      </p>
      {/* CTA Buttons */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 48 }}>
        <div style={{ background: '#f97316', padding: '14px 36px', borderRadius: 14, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, boxShadow: '0 10px 40px rgba(249,115,22,0.3)' }}>
          Start Free Trial
        </div>
        <div style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '14px 36px', borderRadius: 14, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
          Book a Demo
        </div>
      </div>
      {/* Contact */}
      <div style={{ display: 'flex', gap: 32, fontSize: 13, color: '#64748b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📧</span>
          <span style={{ fontWeight: 600 }}>hello@quickserve.my</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📱</span>
          <span style={{ fontWeight: 600 }}>+60 11-5403 6303</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🌐</span>
          <span style={{ fontWeight: 600 }}>quickserve.my</span>
        </div>
      </div>
      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 24, fontSize: 10, color: '#475569', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
        © 2026 QuickServe Malaysia. All Rights Reserved.
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f97316, #ea580c)' }} />
    </div>,
  ];

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{ outline: 'none' }}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 h-14 bg-gray-900/80 backdrop-blur-sm flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-sm">Q</span>
          </div>
          <span className="text-white font-bold text-sm">QuickServe Pitch Deck</span>
          <span className="text-gray-500 text-xs font-bold ml-2">
            {currentSlide + 1} / {slides.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-colors"
          >
            <Download size={14} />
            Download PDF
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Slide viewport */}
      <div className="relative" style={{ width: SLIDE_W, height: SLIDE_H, transform: 'scale(var(--deck-scale, 0.85))' }}>
        <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/50" style={{ width: SLIDE_W, height: SLIDE_H }}>
          {slides[currentSlide]}
        </div>
      </div>

      {/* Navigation */}
      <div className="absolute bottom-6 flex items-center gap-4">
        <button
          onClick={prevSlide}
          disabled={currentSlide === 0}
          className="p-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        {/* Slide dots */}
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                i === currentSlide ? 'bg-orange-500 w-8' : 'bg-gray-600 hover:bg-gray-500'
              }`}
            />
          ))}
        </div>
        <button
          onClick={nextSlide}
          disabled={currentSlide === slides.length - 1}
          className="p-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Hidden print-ready slides */}
      <div ref={printRef} style={{ position: 'absolute', left: -99999, top: 0 }}>
        {slides.map((slide, i) => (
          <div key={i} data-slide>
            {slide}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PitchDeck;
