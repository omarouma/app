import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, MessageCircle, Phone, Shield, Zap, Users, Globe, Download, Play, Calendar, ShoppingBag, TrendingUp, Crown, Bookmark, Share, X, CheckCircle, ChevronDown, MessageSquare, Lock, Wifi, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Logo from '@/components/Logo';
import DeviceMockupCarousel from '@/components/DeviceMockupCarousel';
import FeatureCard from '@/components/FeatureCard';
import { useTranslation } from '@/hooks/useTranslation';
import { usePwaInstall } from '@/hooks/usePwaInstall';

const features = [
  { icon: MessageCircle, titleKey: 'freeMessaging', descKey: 'freeMessagingDesc' },
  { icon: Phone, titleKey: 'voiceVideoCalls', descKey: 'voiceVideoCallsDesc' },
  { icon: Play, titleKey: 'reelsShorts', descKey: 'reelsShortsDesc' },
  { icon: Calendar, titleKey: 'events', descKey: 'eventsDesc' },
  { icon: ShoppingBag, titleKey: 'marketplace', descKey: 'marketplaceDesc' },
  { icon: Shield, titleKey: 'secure', descKey: 'secureDesc' },
  { icon: Users, titleKey: 'groupChat', descKey: 'groupChatDesc' },
  { icon: Zap, titleKey: 'lightningFast', descKey: 'lightningFastDesc' },
  { icon: Globe, titleKey: 'globalReach', descKey: 'globalReachDesc' },
  { icon: Crown, titleKey: 'premiumFeatures', descKey: 'premiumFeaturesDesc' },
  { icon: TrendingUp, titleKey: 'creatorAnalytics', descKey: 'creatorAnalyticsDesc' },
  { icon: Bookmark, titleKey: 'bookmarks', descKey: 'bookmarksDesc' },
];

const testimonials = [
  { name: 'Elena Petrova', role: 'Marketing Manager, Tech Startup', text: 'GaGa Chat has revolutionized our team’s communication. The voice quality is exceptional for our international calls, and the file sharing is seamless. It’s the most reliable platform we’ve used.' },
  { name: 'Johnathan Lee', role: 'Freelance Designer', text: 'As a freelancer, secure and fast communication with clients is key. GaGa Chat delivers on all fronts. The creator tools are also a huge plus for showcasing my portfolio.' },
  { name: 'Aisha Diallo', role: 'Community Organizer', text: 'We use GaGa Chat to organize local events and stay connected with our community. It’s incredibly user-friendly and works flawlessly even in low-bandwidth areas. A real game-changer for us.' },
  { name: 'Mateo Rossi', role: 'University Student', text: 'Studying abroad, GaGa Chat is my lifeline to family and friends back home. It’s free, easy to use, and I never have to worry about call drops or poor video quality. Plus, no VPN needed!' },
];

const testimonialAvatars = [
  { name: 'Elena Petrova', src: 'https://i.pravatar.cc/150?u=a042581f4e29026704d' },
  { name: 'Johnathan Lee', src: 'https://i.pravatar.cc/150?u=a042581f4e29026704e' },
  { name: 'Aisha Diallo', src: 'https://i.pravatar.cc/150?u=a042581f4e29026704f' },
  { name: 'Mateo Rossi', src: 'https://i.pravatar.cc/150?u=a042581f4e29026704g' },
];

const stats = [
  { value: '100%', labelKey: 'freeForever' },
  { value: '190+', labelKey: 'countries' },
  { value: '24/7', labelKey: 'support' },
  { value: 'Early', labelKey: 'earlyAccess' },
];

const highlights = [
  'Private by design',
  'No VPN required',
  'Creator monetization',
];

export default function LandingView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { canInstall, triggerInstall, isIOS, showIOSGuide, dismissIOSGuide } = usePwaInstall();

  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Handle hash-based scrolling on load and hash change
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (!hash) { window.scrollTo({ top: 0 }); return; }
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const tryScroll = (attempts = 0) => {
      const el = document.getElementById(hash);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else if (attempts < 10) { timeoutId = setTimeout(() => tryScroll(attempts + 1), 100); }
    };
    tryScroll();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [location.hash]);

  return (
    <div className="bg-white min-h-[100dvh]">
      <Navbar />

      {/* Hero */}
      <section className="relative flex items-center justify-center pt-20 pb-12 sm:pt-24 sm:pb-16 overflow-hidden bg-gradient-to-b from-[#00C300]/10 via-white to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 items-center min-h-[60vh] sm:min-h-[70vh]">
            <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} className="text-center lg:text-left">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 bg-[#00C300]/10 border border-[#00C300]/20 rounded-full px-4 py-1.5 mb-4">
                <span className="w-2 h-2 rounded-full bg-[#00C300] animate-pulse" />
                <span className="text-[#00C300] text-sm font-medium">Trusted global communication platform</span>
              </motion.div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                {t('welcome')}
              </h1>
              <p className="text-gray-600 text-base sm:text-lg max-w-xl mb-8 leading-relaxed">
                GaGa Chat brings private conversations, high-quality voice and video, live experiences, and monetization tools together for people, teams, and creators worldwide.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button type="button" onClick={() => navigate('/auth')}
                  className="bg-[#00C300] hover:bg-[#00A300] text-white rounded-full px-8 py-4 text-base font-bold transition-all shadow-lg shadow-[#00C300]/20 hover:shadow-[#00C300]/30 flex items-center justify-center gap-2"
                >
                  {t('getStarted')} <ArrowRight size={18} />
                </button>
                {canInstall || isIOS ? (
                  <button type="button" onClick={triggerInstall}
                    className="bg-gray-800 hover:bg-gray-700 text-white rounded-full px-8 py-4 text-base font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Download size={18} /> {isIOS ? 'Add to Home Screen' : t('installApp')}
                  </button>
                ) : (
                  <a
                    href="#features"
                    className="bg-white border-2 border-gray-200 hover:border-[#00C300] text-gray-900 rounded-full px-8 py-4 text-base font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    {t('learnMore')}
                  </a>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 justify-center lg:justify-start">
                {highlights.map((item) => (
                  <div key={item} className="rounded-full border border-gray-200 bg-white/80 px-3 py-1.5 text-sm text-gray-700 shadow-sm">
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm max-w-xl mx-auto lg:mx-0">
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="font-semibold text-gray-900">Built for reliability</span>
                  <span className="text-[#00C300] font-medium">No VPN required</span>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-gray-100 p-3 text-left">
                    <Shield size={16} className="text-[#00C300] mb-2" />
                    <p className="text-sm font-semibold text-gray-900">Secure</p>
                    <p className="text-xs text-gray-600">Protected by design</p>
                  </div>
                  <div className="rounded-xl bg-gray-100 p-3 text-left">
                    <Globe size={16} className="text-[#00C300] mb-2" />
                    <p className="text-sm font-semibold text-gray-900">Global</p>
                    <p className="text-xs text-gray-600">Works worldwide</p>
                  </div>
                  <div className="rounded-xl bg-gray-100 p-3 text-left">
                    <Zap size={16} className="text-[#00C300] mb-2" />
                    <p className="text-sm font-semibold text-gray-900">Fast</p>
                    <p className="text-xs text-gray-600">Instant experience</p>
                  </div>
                </div>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.3 }} className="flex justify-center">
              <DeviceMockupCarousel />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats with trust badges */}
      <section className="py-16 border-y border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <motion.div key={stat.labelKey} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-[#00C300] mb-1">{stat.value}</p>
                <p className="text-gray-600 text-sm">{t(stat.labelKey)}</p>
              </motion.div>
            ))}
          </div>
          {/* Trust badges */}
          <div className="mt-10 pt-8 border-t border-gray-200/60">
            <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-10">
              {[
                { label: 'End-to-End Encryption', icon: Shield },
                { label: 'No Data Selling', icon: CheckCircle },
                { label: 'Open Source Ready', icon: Globe },
                { label: 'GDPR Compliant', icon: CheckCircle },
              ].map((badge, i) => (
                <motion.div key={badge.label} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-2 text-gray-600 text-xs font-medium"
                >
                  <badge.icon size={16} className="text-[#00C300]" />
                  {badge.label}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why GaGa Chat? */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Why GaGa Chat?</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Discover the key benefits that make GaGa Chat the ideal platform for communication and collaboration.</p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              { icon: Wifi, title: 'No VPN Required', description: 'Enjoy unrestricted access and seamless communication worldwide, without the need for a VPN.' },
              { icon: Lock, title: 'Private and Secure', description: 'Your conversations are protected with end-to-end encryption, ensuring your privacy.' },
              { icon: Smartphone, title: 'Cross-Platform', description: 'Stay connected on any device with our web and mobile-ready Progressive Web App (PWA).' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-[#00C300]/10 text-[#00C300] mx-auto mb-4">
                  <item.icon size={32} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#00C300]/10 border border-[#00C300]/20 rounded-full px-4 py-1.5 mb-4">
              <MessageCircle size={14} className="text-[#00C300]" />
              <span className="text-[#00C300] text-sm font-medium">Everything you need in one place</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">{t('features')}</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">From private conversation to creator monetization, every experience is designed to feel polished, fast, and effortless.</p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <FeatureCard key={f.titleKey} icon={f.icon} title={t(f.titleKey)} description={t(f.descKey)} delay={i * 0.1} />
            ))}
          </div>
        </div>
      </section>

      {/* Creator Center Promo */}
      <section className="py-24 border-y border-gray-200 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="inline-flex items-center gap-2 bg-[#00C300]/10 border border-[#00C300]/20 rounded-full px-4 py-1.5 mb-5">
                <Crown size={14} className="text-[#00C300]" />
                <span className="text-[#00C300] text-sm font-medium">For Creators</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Turn Followers Into Income
              </h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                GaGa Chat Creator Center gives you the tools to grow, monetize, and engage your audience. From tips and subscriptions to brand deals and analytics — everything you need to succeed as a creator worldwide.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {[
                  { label: 'Tips & Gifts', desc: 'Earn from fans directly' },
                  { label: 'Subscriptions', desc: 'Recurring monthly income' },
                  { label: 'Live Streaming', desc: 'Go live and interact' },
                  { label: 'Analytics', desc: 'Track growth & revenue' },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-2">
                    <CheckCircle size={18} className="text-[#00C300] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-gray-900 text-sm font-medium">{item.label}</p>
                      <p className="text-gray-600 text-xs">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={() => navigate('/creators')}
                  className="bg-[#00C300] hover:bg-[#00A300] text-white rounded-full px-8 py-3 text-sm font-bold transition-colors inline-flex items-center justify-center gap-2"
                >
                  Explore Creator Center <ArrowRight size={16} />
                </button>
                <button type="button" onClick={() => navigate('/auth')}
                  className="bg-white border-2 border-gray-200 hover:border-[#00C300] text-gray-900 rounded-full px-8 py-3 text-sm font-bold transition-colors inline-flex items-center justify-center gap-2"
                >
                  Become a Creator
                </button>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-lg">
                <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center">
                    <Logo size={32} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">Creator Dashboard</p>
                    <p className="text-[#00C300] text-xs flex items-center gap-1">
                      <TrendingUp size={10} /> +124% this month
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 py-4">
                  {[
                    { label: 'Followers', value: '12.5K', color: '#00C300' },
                    { label: 'Earnings', value: '$45,200', color: '#F59E0B' },
                    { label: 'Views', value: '482K', color: '#10B981' },
                    { label: 'Engagement', value: '8.4%', color: '#8B5CF6' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-gray-100 rounded-xl p-3 text-center">
                      <p className="font-bold text-gray-900 text-lg">{stat.value}</p>
                      <p className="text-gray-600 text-[10px]">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-gray-100 rounded-xl p-3">
                  <p className="text-gray-600 text-xs mb-2">Audience Growth</p>
                  <div className="h-16 flex items-end gap-1">
                    {[40, 55, 45, 70, 60, 85, 95].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm bg-[#00C300]/80"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 border-y border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">{t('howItWorks')}</h2>
            <p className="text-gray-600 max-w-lg mx-auto">{t('howItWorksDesc')}</p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', titleKey: 'step1', descKey: 'step1Desc' },
              { step: '2', titleKey: 'step2', descKey: 'step2Desc' },
              { step: '3', titleKey: 'step3', descKey: 'step3Desc' },
            ].map((item, i) => (
              <motion.div key={item.step} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="text-center">
                <div className="w-16 h-16 rounded-full bg-[#00C300] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{t(item.titleKey)}</h3>
                <p className="text-gray-600 text-sm">{t(item.descKey)}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 border-t border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#00C300]/10 border border-[#00C300]/20 rounded-full px-4 py-1.5 mb-4">
              <MessageSquare size={14} className="text-[#00C300]" />
              <span className="text-[#00C300] text-sm font-medium">Got Questions?</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] mb-4">Frequently Asked Questions</h2>
            <p className="text-[#8D8D8D] max-w-lg mx-auto">Everything you need to know about GaGa Chat</p>
          </motion.div>

          <div className="space-y-3">
            {[
              { q: 'Is GaGa Chat really free?', a: 'Yes! GaGa Chat is completely free to use. All messaging, voice calls, and video calls are free with no hidden fees or subscription required.' },
              { q: 'Do I need a VPN to use GaGa Chat?', a: 'No. GaGa Chat works everywhere without a VPN. Our infrastructure is designed to be accessible globally, including regions where other messaging apps may be blocked.' },
              { q: 'Is my data secure on GaGa Chat?', a: 'Absolutely. We use end-to-end encryption for messages, secure authentication, and industry-standard security practices. We never sell your data to third parties.' },
              { q: 'Can I use GaGa Chat on my computer?', a: 'Yes! GaGa Chat works on any device with a web browser. It is a Progressive Web App (PWA), so you can install it on desktop, tablet, and mobile devices.' },
              { q: 'How is GaGa Chat different from WhatsApp or Telegram?', a: 'GaGa Chat combines the best of all worlds: free messaging, voice/video calls, reels, stories, events, marketplace, and creator tools — all in one platform. No VPN needed, and it works in 190+ countries.' },
              { q: 'How do creators earn money on GaGa Chat?', a: 'Creators can earn through tips from fans, subscriptions, brand partnerships, and live streaming. Our Creator Center provides analytics and monetization tools to help you grow.' },
            ].map((faq, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                <button
                  type="button"
                  id={`faq-button-${i}`}
                  aria-expanded={openFaq === i}
                  aria-controls={`faq-panel-${i}`}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className={`w-full text-left bg-[#F5F5F5] border rounded-2xl p-5 transition-all ${openFaq === i ? 'border-[#00C300]/30 bg-white shadow-sm' : 'border-[#EBEBEB] hover:border-[#00C300]/20'}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[#111111] font-semibold text-sm">{faq.q}</span>
                    <ChevronDown size={18} className={`text-[#8D8D8D] shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                  </div>
                  <AnimatePresence>
                    {openFaq === i && (
                      <motion.div
                        id={`faq-panel-${i}`}
                        role="region"
                        aria-labelledby={`faq-button-${i}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <p className="text-[#8D8D8D] text-sm leading-relaxed mt-3 pt-3 border-t border-[#EBEBEB]/60">
                          {faq.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-24 border-t border-[#EBEBEB] bg-[#F5F5F5]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#00C300]/10 border border-[#00C300]/20 rounded-full px-4 py-1.5 mb-4">
              <CheckCircle size={14} className="text-[#00C300]" />
              <span className="text-[#00C300] text-sm font-medium">Why GaGa?</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] mb-4">GaGa Chat vs Others</h2>
            <p className="text-[#8D8D8D] max-w-lg mx-auto">See how GaGa Chat compares to the most popular messaging apps</p>
          </motion.div>

          <div className="overflow-x-auto -mx-4 px-4">
            <div className="min-w-full sm:min-w-[600px]">
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="text-sm font-semibold text-[#8D8D8D] p-3">Feature</div>
                <div className="text-sm font-bold text-[#00C300] p-3 bg-[#00C300]/5 rounded-xl text-center">GaGa Chat</div>
                <div className="text-sm font-semibold text-[#8D8D8D] p-3 text-center">WhatsApp</div>
                <div className="text-sm font-semibold text-[#8D8D8D] p-3 text-center">Telegram</div>
              </div>
              {[
                { feature: 'Free Messaging', gaga: true, wa: true, tg: true },
                { feature: 'Voice/Video Calls', gaga: true, wa: true, tg: true },
                { feature: 'Works Without VPN', gaga: true, wa: false, tg: false },
                { feature: 'Reels / Shorts', gaga: true, wa: false, tg: false },
                { feature: 'Stories', gaga: true, wa: true, tg: false },
                { feature: 'Events', gaga: true, wa: false, tg: false },
                { feature: 'Marketplace', gaga: true, wa: false, tg: false },
                { feature: 'Creator Monetization', gaga: true, wa: false, tg: false },
                { feature: 'Open Source Ready', gaga: true, wa: false, tg: true },
                { feature: 'No Phone Number Required', gaga: true, wa: false, tg: true },
                { feature: 'Group Calls (8+ people)', gaga: true, wa: false, tg: true },
                { feature: 'Web App (No Install)', gaga: true, wa: true, tg: true },
              ].map((row, i) => (
                <motion.div key={row.feature} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}
                  className={`grid grid-cols-4 gap-3 items-center ${i % 2 === 0 ? 'bg-white' : 'bg-[#F5F5F5]'} rounded-xl p-3 mb-1`}
                >
                  <span className="text-sm text-[#111111] font-medium">{row.feature}</span>
                  <div className="flex justify-center">
                    {row.gaga ? <CheckCircle size={18} className="text-[#00C300]" /> : <span className="text-[#C7C7CC] text-sm">—</span>}
                  </div>
                  <div className="flex justify-center">
                    {row.wa ? <CheckCircle size={18} className="text-[#8D8D8D]" /> : <span className="text-[#C7C7CC] text-sm">—</span>}
                  </div>
                  <div className="flex justify-center">
                    {row.tg ? <CheckCircle size={18} className="text-[#8D8D8D]" /> : <span className="text-[#C7C7CC] text-sm">—</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mt-8">
            <p className="text-[#8D8D8D] text-xs">Comparison based on publicly available features as of 2025. Features may change over time.</p>
          </motion.div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="py-24 border-t border-[#EBEBEB] bg-[#F5F5F5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="inline-flex items-center gap-2 bg-[#00C300]/10 border border-[#00C300]/20 rounded-full px-4 py-1.5 mb-6">
                <Shield size={14} className="text-[#00C300]" />
                <span className="text-[#00C300] text-sm font-medium">{t('securityFirst')}</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] mb-4">{t('yourPrivacy')}</h2>
              <p className="text-[#8D8D8D] mb-6 leading-relaxed">{t('privacyDesc')}</p>
              <ul className="space-y-3">
                {['secureAuth', 'selfDestruct', 'secureStorage', 'webStandards'].map(item => (
                  <li key={item} className="flex items-center gap-3 text-[#111111] text-sm">
                    <div className="w-5 h-5 rounded-full bg-[#00C300]/10 flex items-center justify-center shrink-0">
                      <span className="text-[#00C300] text-xs">✓</span>
                    </div>
                    {t(item)}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="relative">
              <div className="bg-white border border-[#EBEBEB] rounded-3xl p-6 space-y-4 shadow-sm">
                <div className="flex items-center gap-3 pb-4 border-b border-[#EBEBEB]">
                  <div className="w-10 h-10 rounded-full bg-[#00C300] flex items-center justify-center overflow-hidden">
                    <Logo size={36} />
                  </div>
                  <div>
                    <p className="text-[#111111] font-medium">{t('appName')}</p>
                    <p className="text-[#00C300] text-xs flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00C300]"/>{t('encrypted')}
                    </p>
                  </div>
                </div>
                {[
                  { me: false, text: 'Is this conversation secure?' },
                  { me: true, text: 'Yes! Your data is securely stored and protected.' },
                  { me: false, text: 'Great, I can share sensitive info safely.' },
                  { me: true, text: 'Absolutely. We use secure connections and industry-standard practices.' },
                ].map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                    className={`flex ${msg.me ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl ${msg.me ? 'bg-[#00C300] text-white rounded-br-sm' : 'bg-[#F5F5F5] text-[#111111] rounded-bl-sm'}`}>
                      <p className="text-sm">{msg.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Founder's Note */}
      <section className="py-24 border-t border-[#EBEBEB] bg-[#F5F5F5]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white border border-[#EBEBEB] rounded-3xl p-8 sm:p-12 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#00C300]/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="w-16 h-16 rounded-full bg-[#00C300]/10 flex items-center justify-center shrink-0">
                <Users size={32} className="text-[#00C300]" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-[#111111] mb-3">{t('foundersNote')}</h3>
                <p className="text-[#8D8D8D] leading-relaxed mb-4">{t('foundersMessage')}</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center text-[#00C300] font-bold text-sm">
                    OG
                  </div>
                  <div>
                    <p className="text-[#111111] text-sm font-medium">{t('foundersName')}</p>
                    <p className="text-[#8D8D8D] text-xs">{t('foundersTitle')}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 border-t border-[#EBEBEB] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] mb-4">{t('earlyUserFeedback')}</h2>
            <p className="text-[#8D8D8D] max-w-lg mx-auto">{t('testimonialsDesc')}</p>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {testimonials.map((testimonial, i) => {
              const avatar = testimonialAvatars[i];
              return (
                <motion.div key={testimonial.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                  className="bg-[#F5F5F5] border border-[#EBEBEB] rounded-2xl p-6 hover:border-[#00C300]/30 transition-all hover:shadow-lg hover:-translate-y-1">
                  <div className="flex gap-0.5 mb-4">
                    {[1, 2, 3, 4, 5].map(s => <span key={s} className="text-[#00C300] text-sm">★</span>)}
                  </div>
                  <p className="text-[#111111] text-sm leading-relaxed mb-5">&ldquo;{testimonial.text}&rdquo;</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-[#00C300]">
                      {avatar?.src
                        ? <img src={avatar.src} alt={avatar.name} className="w-full h-full object-cover" />
                        : <span className="text-white text-xs font-bold">{avatar?.name?.charAt(0) ?? '?'}</span>}
                    </div>
                    <div>
                      <p className="text-[#111111] font-medium text-sm">{testimonial.name}</p>
                      <p className="text-[#8D8D8D] text-xs">{testimonial.role}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Download / Install PWA Section */}
      <section className="py-24 border-t border-[#EBEBEB] bg-[#F5F5F5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="inline-flex items-center gap-2 bg-[#00C300]/10 border border-[#00C300]/20 rounded-full px-4 py-1.5 mb-5">
                <Download size={14} className="text-[#00C300]" />
                <span className="text-[#00C300] text-sm font-medium">Install on Any Device</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] mb-4">
                Add GaGa Chat to Your Home Screen
              </h2>
              <p className="text-[#8D8D8D] mb-6 leading-relaxed">
                GaGa Chat works like a native app on any device. No download from app stores required — just install from your browser and start chatting instantly. Works on iPhone, Android, and desktop.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {[
                  { label: 'iPhone & iPad', desc: 'Add to Home Screen' },
                  { label: 'Android', desc: 'Install as App' },
                  { label: 'Windows & Mac', desc: 'Desktop Shortcut' },
                  { label: 'Chromebook', desc: 'Chrome OS Install' },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-2">
                    <CheckCircle size={18} className="text-[#00C300] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[#111111] text-sm font-medium">{item.label}</p>
                      <p className="text-[#8D8D8D] text-xs">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                {canInstall || isIOS ? (
                  <button type="button" onClick={triggerInstall}
                    className="bg-[#00C300] hover:bg-[#00A300] text-white rounded-full px-8 py-4 text-sm font-bold transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <Download size={18} /> {isIOS ? 'Add to Home Screen' : 'Install Now'}
                  </button>
                ) : (
                  <button type="button" onClick={() => navigate('/auth')}
                    className="bg-[#00C300] hover:bg-[#00A300] text-white rounded-full px-8 py-4 text-sm font-bold transition-colors inline-flex items-center justify-center gap-2"
                  >
                    Get Started Free <ArrowRight size={18} />
                  </button>
                )}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="flex justify-center">
              <div className="bg-white border border-[#EBEBEB] rounded-3xl p-6 shadow-lg max-w-xs w-full">
                <div className="flex items-center justify-center mb-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center shadow-lg shadow-[#00C300]/20">
                    <Logo size={48} />
                  </div>
                </div>
                <div className="text-center mb-4">
                  <p className="font-bold text-[#111111] text-lg mb-1">GaGa Chat</p>
                  <p className="text-[#8D8D8D] text-xs">Free messaging & calls</p>
                </div>
                <div className="bg-[#F5F5F5] rounded-xl p-3 mb-4">
                  <div className="flex items-center justify-between text-xs text-[#8D8D8D]">
                    <span>Size</span>
<span className="font-medium text-[#111111]">&lt; 1 MB</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#8D8D8D] mt-1">
                    <span>Version</span>
                    <span className="font-medium text-[#111111]">2.0.0</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#8D8D8D] mt-1">
                    <span>Rating</span>
                    <span className="font-medium text-[#00C300]">4.9 ★</span>
                  </div>
                </div>
                <button type="button" onClick={() => navigate('/auth')}
                  className="w-full py-3 bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl text-sm font-bold transition-colors"
                >
                  Get Started
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-[#EBEBEB] bg-[#F5F5F5]">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-5xl font-bold text-[#111111] mb-6">{t('readyToStart')}</h2>
          <p className="text-[#8D8D8D] mb-8">{t('joinFounding')}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button type="button" onClick={() => navigate('/auth')}
              className="bg-[#00C300] hover:bg-[#00A300] text-white rounded-full px-10 py-4 text-lg font-bold transition-colors inline-flex items-center justify-center gap-2"
            >
              {t('getStarted')} <ArrowRight size={20} />
            </button>
            <button type="button" onClick={() => navigate('/auth')}
              className="bg-white border-2 border-[#EBEBEB] hover:border-[#00C300] text-[#111111] rounded-full px-10 py-4 text-lg font-bold transition-colors inline-flex items-center justify-center gap-2"
            >
              <Users size={20} /> Invite Friends
            </button>
          </div>
          <p className="text-[#8D8D8D] text-xs mt-6">No credit card required. Free forever.</p>
        </motion.div>
      </section>

      <Footer />

      {/* iOS Install Guide Modal */}
      <AnimatePresence>
        {showIOSGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={dismissIOSGuide}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#111111]">Install GaGa Chat</h3>
                <button type="button" onClick={dismissIOSGuide} className="p-1 text-[#8D8D8D] hover:text-[#111111]">
                  <X size={20} />
                </button>
              </div>
              <p className="text-[#8D8D8D] text-sm mb-4">
                To install GaGa Chat on your iPhone or iPad, follow these steps:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#00C300]/10 flex items-center justify-center shrink-0 text-[#00C300] font-bold text-sm">1</div>
                  <div>
                    <p className="text-[#111111] text-sm font-medium">Tap the Share button</p>
                    <p className="text-[#8D8D8D] text-xs">Tap the <Share size={12} className="inline mx-0.5" /> icon at the bottom of Safari.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#00C300]/10 flex items-center justify-center shrink-0 text-[#00C300] font-bold text-sm">2</div>
                  <div>
                    <p className="text-[#111111] text-sm font-medium">Scroll and tap "Add to Home Screen"</p>
                    <p className="text-[#8D8D8D] text-xs">Look for the + icon and tap it.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#00C300]/10 flex items-center justify-center shrink-0 text-[#00C300] font-bold text-sm">3</div>
                  <div>
                    <p className="text-[#111111] text-sm font-medium">Tap "Add"</p>
                    <p className="text-[#8D8D8D] text-xs">The app will appear on your home screen like a native app.</p>
                  </div>
                </div>
              </div>
              <button type="button" onClick={dismissIOSGuide}
                className="w-full mt-5 py-3 bg-[#00C300] text-white rounded-xl text-sm font-bold hover:bg-[#00A300] transition-colors"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}