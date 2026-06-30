import React, { useEffect, useState } from 'react';
import { Menu, Moon, Sun, X } from 'lucide-react';

type PublicPage = 'home' | 'shop' | 'help' | 'company';

interface PublicNavbarProps {
  activePage?: PublicPage;
  isDarkMode?: boolean;
  onToggleDark?: () => void;
  onLogin: () => void;
  onHome?: () => void;
  onHomeSection?: (sectionId: string) => void;
  onShop?: () => void;
  onHelp?: () => void;
  onCompany?: () => void;
}

const sectionLinks = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'mockup', label: 'Preview' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
];

const logoFallback = (label: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><text x="0" y="24" font-size="20" font-weight="900" fill="%23f97316">${label}</text></svg>`)}`;

const PublicNavbar: React.FC<PublicNavbarProps> = ({
  activePage = 'home',
  isDarkMode,
  onToggleDark,
  onLogin,
  onHome,
  onHomeSection,
  onShop,
  onHelp,
  onCompany,
}) => {
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const goSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (activePage === 'home') {
      const target = document.getElementById(sectionId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.replaceState({}, '', `${window.location.pathname}#${sectionId}`);
      }
      return;
    }
    onHomeSection?.(sectionId);
  };

  const runAction = (action?: () => void) => {
    setMobileMenuOpen(false);
    action?.();
  };

  const navButtonClass = (isActive = false) =>
    `${isActive ? 'text-orange-500' : 'hover:text-orange-500'} transition-colors`;

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
      <div className="mx-auto max-w-7xl px-3 sm:px-6">
        <div className="mt-4 flex h-14 items-center rounded-2xl border border-gray-200/50 bg-white/70 px-3 shadow-lg shadow-black/5 backdrop-blur-xl dark:border-gray-700/50 dark:bg-gray-900/70 sm:h-16 sm:px-6">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="mr-2 rounded-xl p-2 text-gray-600 transition-all hover:bg-orange-50 hover:text-orange-500 dark:text-gray-300 dark:hover:bg-gray-700 md:hidden"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <button onClick={() => runAction(onHome)} className="flex items-center gap-2" aria-label="QuickServe home">
            <img src="/LOGO/9.png" alt="QuickServe" className="h-8 dark:hidden sm:h-9" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = logoFallback('QuickServe'); }} />
            <img src="/LOGO/9-dark.png" alt="QuickServe" className="hidden h-8 dark:block sm:h-9" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = logoFallback('QuickServe'); }} />
          </button>

          <div className="mx-auto hidden items-center gap-5 text-[10px] font-bold uppercase tracking-[0.15em] text-gray-700 dark:text-gray-400 lg:gap-7 xl:flex xl:text-[11px]">
            {sectionLinks.map((link) => (
              <button key={link.id} onClick={() => goSection(link.id)} className={navButtonClass(activePage === 'home' && window.location.hash === `#${link.id}`)}>
                {link.label}
              </button>
            ))}
            <button onClick={() => runAction(onShop)} className={navButtonClass(activePage === 'shop')}>Shop</button>
            <button onClick={() => runAction(onHelp)} className={navButtonClass(activePage === 'help')}>Help</button>
            <button onClick={() => runAction(onCompany)} className={navButtonClass(activePage === 'company')}>Our Company</button>
          </div>

          <div className="flex-1 xl:hidden" />

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onToggleDark}
              className="rounded-xl bg-gray-100 p-2 text-gray-600 transition-all hover:bg-orange-50 hover:text-orange-500 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 sm:p-2.5"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={onLogin}
              className="rounded-xl bg-gray-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:scale-105 hover:bg-orange-500 dark:bg-white dark:text-gray-900 dark:hover:bg-orange-500 dark:hover:text-white sm:px-5 sm:py-2.5 sm:text-[11px]"
            >
              Login
            </button>
          </div>
        </div>

        <div className={`xl:hidden overflow-hidden transition-all duration-300 ${mobileMenuOpen ? 'mt-2 max-h-[31rem]' : 'max-h-0'}`}>
          <div className="flex flex-col gap-1 rounded-2xl border border-gray-200/50 bg-white/90 px-3 py-3 shadow-lg shadow-black/5 backdrop-blur-xl dark:border-gray-700/50 dark:bg-gray-900/90">
            {sectionLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => goSection(link.id)}
                className="rounded-xl px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.15em] text-gray-700 transition-all hover:bg-orange-50 hover:text-orange-500 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {link.label}
              </button>
            ))}
            <button onClick={() => runAction(onShop)} className="rounded-xl px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.15em] text-gray-700 transition-all hover:bg-orange-50 hover:text-orange-500 dark:text-gray-300 dark:hover:bg-gray-800">
              Shop
            </button>
            <button onClick={() => runAction(onHelp)} className="rounded-xl px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.15em] text-gray-700 transition-all hover:bg-orange-50 hover:text-orange-500 dark:text-gray-300 dark:hover:bg-gray-800">
              Help
            </button>
            <button onClick={() => runAction(onCompany)} className="rounded-xl px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.15em] text-gray-700 transition-all hover:bg-orange-50 hover:text-orange-500 dark:text-gray-300 dark:hover:bg-gray-800">
              Our Company
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default PublicNavbar;
