import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  { id: 'features', label: 'FEATURES' },
  { id: 'how-it-works', label: 'HOW IT WORKS' },
  { id: 'mockup', label: 'PREVIEW' },
  { id: 'pricing', label: 'PRICING' },
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
  const [useHamburger, setUseHamburger] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const navRowRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateMenuFit = useCallback(() => {
    const navRow = navRowRef.current;
    const logo = logoRef.current;
    const menu = menuRef.current;
    const actions = actionsRef.current;
    if (!navRow || !logo || !menu || !actions) return;

    // Include comfortable spacing between the three groups so links never
    // collide with the logo or account controls at intermediate widths.
    const requiredWidth = logo.offsetWidth + menu.scrollWidth + actions.offsetWidth + 64;
    setUseHamburger(requiredWidth > navRow.clientWidth);
  }, []);

  useEffect(() => {
    updateMenuFit();
    const observer = new ResizeObserver(updateMenuFit);
    [navRowRef.current, logoRef.current, menuRef.current, actionsRef.current].forEach((element) => {
      if (element) observer.observe(element);
    });
    window.addEventListener('resize', updateMenuFit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateMenuFit);
    };
  }, [updateMenuFit]);

  useEffect(() => {
    if (activePage !== 'home') {
      setActiveSection(null);
      return;
    }

    const updateActiveSection = () => {
      const activationLine = window.scrollY + Math.max(120, window.innerHeight * 0.35);
      let current: string | null = null;

      sectionLinks.forEach(({ id }) => {
        const section = document.getElementById(id);
        if (section && section.offsetTop <= activationLine) current = id;
      });

      setActiveSection(current);
    };

    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);
    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, [activePage]);

  useEffect(() => {
    if (!useHamburger) setMobileMenuOpen(false);
  }, [useHamburger]);

  const goSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (activePage === 'home') {
      const target = document.getElementById(sectionId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.replaceState({}, '', `/#${sectionId}`);
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
    `${isActive ? 'font-black text-orange-500' : 'font-bold hover:text-orange-500'} transition-colors`;

  const mobileNavButtonClass = (isActive = false) =>
    `rounded-xl px-4 py-2.5 text-left text-[11px] uppercase tracking-[0.15em] transition-all ${
      isActive
        ? 'bg-orange-50 font-black text-orange-500 dark:bg-orange-500/10'
        : 'font-bold text-gray-700 hover:bg-orange-50 hover:text-orange-500 dark:text-gray-300 dark:hover:bg-gray-800'
    }`;

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
      <div className="mx-auto max-w-7xl px-3 sm:px-6">
        <div ref={navRowRef} className="relative mt-4 flex h-14 items-center rounded-2xl border border-gray-200/50 bg-white/70 px-3 shadow-lg shadow-black/5 backdrop-blur-xl dark:border-gray-700/50 dark:bg-gray-900/70 sm:h-16 sm:px-6">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`${useHamburger ? 'mr-2 flex' : 'hidden'} shrink-0 rounded-xl p-2 text-gray-600 transition-all hover:bg-orange-50 hover:text-orange-500 dark:text-gray-300 dark:hover:bg-gray-700`}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="public-navigation-menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <button ref={logoRef} onClick={() => runAction(onHome)} className="flex shrink-0 items-center gap-2" aria-label="QuickServe home">
            <img src="/LOGO/9.png" alt="QuickServe" className="h-8 dark:hidden sm:h-9" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = logoFallback('QuickServe'); }} />
            <img src="/LOGO/9-dark.png" alt="QuickServe" className="hidden h-8 dark:block sm:h-9" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = logoFallback('QuickServe'); }} />
          </button>

          <div ref={menuRef} className={`${useHamburger ? 'pointer-events-none invisible absolute' : 'mx-auto'} flex items-center gap-5 whitespace-nowrap text-[10px] uppercase tracking-[0.15em] text-gray-700 dark:text-gray-400 lg:gap-7 xl:text-[11px]`} aria-hidden={useHamburger}>
            {sectionLinks.map((link) => (
              <button key={link.id} onClick={() => goSection(link.id)} className={navButtonClass(activePage === 'home' && activeSection === link.id)} tabIndex={useHamburger ? -1 : undefined}>
                {link.label}
              </button>
            ))}
            <button onClick={() => runAction(onShop)} className={navButtonClass(activePage === 'shop')} tabIndex={useHamburger ? -1 : undefined}>SHOP</button>
            <button onClick={() => runAction(onHelp)} className={navButtonClass(activePage === 'help')} tabIndex={useHamburger ? -1 : undefined}>HELP</button>
            <button onClick={() => runAction(onCompany)} className={navButtonClass(activePage === 'company')} tabIndex={useHamburger ? -1 : undefined}>OUR COMPANY</button>
          </div>

          {useHamburger && <div className="flex-1" />}

          <div ref={actionsRef} className="flex shrink-0 items-center gap-2 sm:gap-3">
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

        <div id="public-navigation-menu" className={`${useHamburger ? 'block' : 'hidden'} overflow-hidden transition-all duration-300 ${mobileMenuOpen ? 'mt-2 max-h-[31rem]' : 'max-h-0'}`}>
          <div className="flex flex-col gap-1 rounded-2xl border border-gray-200/50 bg-white/90 px-3 py-3 shadow-lg shadow-black/5 backdrop-blur-xl dark:border-gray-700/50 dark:bg-gray-900/90">
            {sectionLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => goSection(link.id)}
                className={mobileNavButtonClass(activePage === 'home' && activeSection === link.id)}
              >
                {link.label}
              </button>
            ))}
            <button onClick={() => runAction(onShop)} className={mobileNavButtonClass(activePage === 'shop')}>
              SHOP
            </button>
            <button onClick={() => runAction(onHelp)} className={mobileNavButtonClass(activePage === 'help')}>
              HELP
            </button>
            <button onClick={() => runAction(onCompany)} className={mobileNavButtonClass(activePage === 'company')}>
              OUR COMPANY
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default PublicNavbar;
