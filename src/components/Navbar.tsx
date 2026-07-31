import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, MessageCircle, Download } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Logo from '@/components/Logo';
import { usePwaInstall } from '@/hooks/usePwaInstall';

const navLinks = [
  { label: 'Features', href: '/#features' },
  { label: 'Security', href: '/#security' },
  { label: 'Creators', href: '/creators' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const { canInstall, triggerInstall } = usePwaInstall();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (href: string) => {
    const id = href.replace('/#', '');
    if (location.pathname !== '/') {
      navigate(`/#${id}`);
    } else {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/90 backdrop-blur-md border-b border-[#EBEBEB]' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <Logo size={40} className="drop-shadow-sm" />
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button type="button" key={link.label}
                onClick={() => {
                  if (link.href.startsWith('/#')) {
                    scrollToSection(link.href);
                  } else {
                    navigate(link.href);
                    setMobileMenuOpen(false);
                  }
                }}
                className="text-sm font-medium uppercase tracking-wider text-[#8D8D8D] hover:text-[#111111] transition-colors relative group"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#00C300] transition-all duration-300 group-hover:w-full" />
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            {canInstall && (
              <button type="button" onClick={triggerInstall}
                className="flex items-center gap-2 border border-[#00C300] text-[#00C300] hover:bg-[#00C300] hover:text-white rounded-full px-5 py-2 text-sm font-bold transition-colors"
              >
                <Download size={14} /> Install App
              </button>
            )}
            {isAuthenticated ? (
              <button type="button" onClick={() => navigate('/chats')}
                className="bg-[#00C300] hover:bg-[#00A300] text-white rounded-full px-6 py-2 text-sm font-bold transition-colors flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />Open Chat
              </button>
            ) : (
              <>
                <button type="button" onClick={() => navigate('/auth')} className="text-[#8D8D8D] hover:text-[#111111] text-sm font-medium transition-colors">
                  Log In
                </button>
                <button type="button" onClick={() => navigate('/auth')}
                  className="bg-[#00C300] hover:bg-[#00A300] text-white rounded-full px-6 py-2 text-sm font-bold transition-colors"
                >
                  Get Started
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            aria-controls="mobile-menu"
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="md:hidden text-[#111111]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            id="mobile-menu"
            role="menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white dark:bg-slate-950 border-t border-[#EBEBEB] dark:border-slate-800"
          >
            <div className="px-4 py-4 space-y-3">
              {navLinks.map((link) => (
                <button type="button" key={link.label}
                  onClick={() => {
                    if (link.href.startsWith('/#')) {
                      scrollToSection(link.href);
                    } else {
                      navigate(link.href);
                      setMobileMenuOpen(false);
                    }
                  }}
                  className="block w-full text-left text-sm font-medium uppercase tracking-wider text-[#8D8D8D] hover:text-[#111111] py-2"
                >
                  {link.label}
                </button>
              ))}
              <div className="pt-3 border-t border-[#EBEBEB] flex flex-col gap-2">
                <button type="button" onClick={() => navigate('/auth')}
                  className="w-full bg-[#00C300] text-white rounded-full py-3 font-bold text-sm"
                >
                  Get Started
                </button>
                {canInstall && (
                  <button type="button" onClick={triggerInstall}
                    className="w-full flex items-center justify-center gap-2 border border-[#00C300] text-[#00C300] rounded-full py-3 font-bold text-sm"
                  >
                    <Download size={14} /> Install App
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
