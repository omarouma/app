import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight, Eye, EyeOff, CheckCircle, Zap, BarChart3, TrendingUp, Users, Wallet, Video, Music, Palette, BookOpen, Briefcase, Gamepad2, Camera, Globe, Star, Crown, Heart, MessageCircle, Sparkles, ArrowUpRight, Play, BadgeCheck, Flame, Utensils, Dumbbell, Plane, Shirt, Home, Baby, Car, Dog, Flower2, Wrench, Palette as PaletteIcon, Gamepad2 as GamepadIcon, ShoppingBag
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Logo from '@/components/Logo';
import { toast } from 'sonner';

// ─── Floating Bubble Data ───
const bubbleImages = [
  { size: 180, top: '8%', left: '2%', color: 'from-[#FF4081]/20 to-[#FF4081]/5', delay: 0, icon: Video },
  { size: 140, top: '55%', left: '5%', color: 'from-[#00C300]/20 to-[#00C300]/5', delay: 1.2, icon: Music },
  { size: 100, top: '20%', left: '35%', color: 'from-[#FF9800]/20 to-[#FF9800]/5', delay: 0.6, icon: Palette },
  { size: 200, top: '40%', left: '15%', color: 'from-[#8B5CF6]/20 to-[#8B5CF6]/5', delay: 2.1, icon: BookOpen },
  { size: 120, top: '75%', left: '25%', color: 'from-[#00BCD4]/20 to-[#00BCD4]/5', delay: 1.8, icon: Briefcase },
  { size: 160, top: '12%', left: '55%', color: 'from-[#FF5252]/20 to-[#FF5252]/5', delay: 0.9, icon: Gamepad2 },
  { size: 90, top: '65%', left: '45%', color: 'from-[#2196F3]/20 to-[#2196F3]/5', delay: 2.5, icon: Camera },
  { size: 130, top: '30%', left: '70%', color: 'from-[#FF4081]/20 to-[#FF4081]/5', delay: 1.5, icon: Globe },
  { size: 110, top: '80%', left: '70%', color: 'from-[#00C300]/20 to-[#00C300]/5', delay: 0.3, icon: Star },
  { size: 80, top: '5%', left: '80%', color: 'from-[#FF9800]/20 to-[#FF9800]/5', delay: 2.8, icon: Heart },
];

// ─── Topic Circles ───
const topicCircles = [
  { label: 'Food', icon: Utensils, color: '#FF9800', count: '50K+' },
  { label: 'Travel', icon: Plane, color: '#00BCD4', count: '32K+' },
  { label: 'Fitness', icon: Dumbbell, color: '#00C300', count: '28K+' },
  { label: 'Fashion', icon: Shirt, color: '#FF4081', count: '45K+' },
  { label: 'Home', icon: Home, color: '#8B5CF6', count: '18K+' },
  { label: 'Parenting', icon: Baby, color: '#FF5252', count: '22K+' },
  { label: 'Auto', icon: Car, color: '#2196F3', count: '15K+' },
  { label: 'Pets', icon: Dog, color: '#FF9800', count: '38K+' },
  { label: 'Garden', icon: Flower2, color: '#4CAF50', count: '12K+' },
  { label: 'DIY', icon: Wrench, color: '#607D8B', count: '20K+' },
  { label: 'Art', icon: PaletteIcon, color: '#8B5CF6', count: '25K+' },
  { label: 'Gaming', icon: GamepadIcon, color: '#FF5252', count: '55K+' },
  { label: 'Beauty', icon: Sparkles, color: '#FF4081', count: '42K+' },
  { label: 'Tech', icon: Zap, color: '#00BCD4', count: '30K+' },
  { label: 'Music', icon: Music, color: '#FF9800', count: '35K+' },
  { label: 'Dance', icon: Flame, color: '#FF4081', count: '24K+' },
];

// ─── Creator Stats ───
const creatorStats = [
  { value: '50K+', label: 'Active Creators', icon: Users },
{ value: '৳2M+', label: 'Creator Earnings', icon: Wallet },
  { value: '1B+', label: 'Monthly Views', icon: Eye },
  { value: '99%', label: 'Satisfaction', icon: Heart },
];

// ─── Animated Bubble Component ───
function FloatingBubble({ size, top, left, color, delay, icon: Icon }: typeof bubbleImages[0]) {
  return (
    <motion.div
      className={`absolute rounded-full bg-gradient-to-br ${color} backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-lg`}
      style={{ width: size, height: size, top, left }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: [0, -15, 0, -8, 0],
        x: [0, 8, 0, -5, 0],
      }}
      transition={{
        opacity: { duration: 1, delay: delay * 0.3 },
        scale: { duration: 0.8, delay: delay * 0.3, type: 'spring' },
        y: { duration: 6 + delay, repeat: Infinity, ease: 'easeInOut' },
        x: { duration: 7 + delay, repeat: Infinity, ease: 'easeInOut' },
      }}
    >
      <Icon size={size * 0.3} className="text-white/60" strokeWidth={1.5} />
    </motion.div>
  );
}

// ─── Creator Login Card ───
function CreatorLoginCard() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!agreed) {
      toast.error('Please agree to the terms');
      return;
    }
    if (!email.trim() || !password.trim()) {
      toast.error('Please enter your email and password');
      return;
    }

    const result = await login(email, password);
    if (result.success) {
      toast.success('Welcome to GaGa Creator Center!');
      navigate('/timeline');
      return;
    }

    toast.error(result.error || 'Login failed. Please try again.');
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 w-full max-w-md relative overflow-hidden"
    >
      {/* Decorative corner */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#00C300]/10 to-transparent rounded-bl-full" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center">
              <Logo size={28} />
            </div>
            <div>
              <h3 className="font-bold text-[#111111] text-sm">GaGa Creator</h3>
              <p className="text-[#8D8D8D] text-[10px]">Creator Center Login</p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-[#F5F5F5] rounded-xl text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
          />
        </div>

        <div className="relative mb-4">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-[#F5F5F5] rounded-xl text-sm text-[#111111] placeholder:text-[#C7C7CC] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all pr-10"
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <button type="button" onClick={handleLogin}
          className="w-full py-3.5 bg-[#00C300] hover:bg-[#00A300] text-white rounded-xl text-sm font-bold transition-colors mb-4 shadow-lg shadow-[#00C300]/20"
        >
          Log In
        </button>

        <div className="flex items-center gap-2 mb-4">
          <button type="button" onClick={() => setAgreed(!agreed)}
            className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${
              agreed ? 'bg-[#00C300] border-[#00C300]' : 'border-[#C7C7CC]'
            }`}
          >
            {agreed && <CheckCircle size={12} className="text-white" />}
          </button>
          <span className="text-[#8D8D8D] text-xs">
            I agree to the{' '}
            <button type="button" onClick={() => navigate('/terms')} className="text-[#00C300] hover:underline">User Agreement</button>
            {' '}and{' '}
            <button type="button" onClick={() => navigate('/privacy')} className="text-[#00C300] hover:underline">Privacy Policy</button>
          </span>
        </div>

        <div className="text-center">
          <button type="button" onClick={() => navigate('/auth')}
            className="text-[#8D8D8D] text-xs hover:text-[#00C300] transition-colors"
          >
            New to GaGa? Sign up here
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ───
export default function CreatorCenterPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();
  const isLoggedIn = isAuthenticated;

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/creator-dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
    <div ref={containerRef} className="min-h-[100dvh] bg-gradient-to-br from-[#E8F5E9] via-[#FFF3E0] to-[#FCE4EC] relative overflow-x-hidden">
      {/* Floating Bubbles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {bubbleImages.map((bubble, i) => (
          <FloatingBubble key={i} {...bubble} />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="px-6 sm:px-12 lg:px-20 py-6 flex items-center justify-between"
        >
          <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center shadow-lg shadow-[#00C300]/20">
              <Logo size={28} />
            </div>
            <span className="font-bold text-[#111111] text-lg hidden sm:block">GaGa Creator</span>
          </button>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => navigate('/analytics')}
              className="text-[#8D8D8D] hover:text-[#111111] text-sm font-medium transition-colors hidden sm:block"
            >
              Analytics
            </button>
            <button type="button" onClick={() => navigate('/premium')}
              className="text-[#8D8D8D] hover:text-[#111111] text-sm font-medium transition-colors hidden sm:block"
            >
              Premium
            </button>
            <button type="button" onClick={() => navigate(isLoggedIn ? '/timeline' : '/auth')}
              className="bg-[#00C300] hover:bg-[#00A300] text-white rounded-full px-6 py-2 text-sm font-bold transition-colors shadow-lg shadow-[#00C300]/20"
            >
              {isLoggedIn ? 'Dashboard' : 'Get Started'}
            </button>
          </div>
        </motion.header>

        {/* Hero Section */}
        <section className="px-6 sm:px-12 lg:px-20 py-12 lg:py-20">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Left: Headline */}
              <motion.div
                style={{ y: y1 }}
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-sm border border-white/50 rounded-full px-4 py-1.5 mb-6 shadow-sm"
                >
                  <Crown size={14} className="text-[#00C300]" />
                  <span className="text-[#00C300] text-sm font-medium">GaGa Chat Creator Center</span>
                </motion.div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#111111] leading-tight mb-4">
                  Join us to<br />
                  <span className="bg-gradient-to-r from-[#00C300] to-[#FF9800] bg-clip-text text-transparent">
                    unlock exclusive
                  </span><br />
                  features for creators.
                </h1>

                <p className="text-[#8D8D8D] text-base sm:text-lg max-w-md mb-8 leading-relaxed">
                  Make creation, publishing, data analysis, and monetization more efficient. Turn your passion into income with the world&apos;s fastest growing creator platform.
                </p>

                <div className="flex flex-wrap gap-3 mb-8">
                  {creatorStats.map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                      className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm"
                    >
                      <stat.icon size={18} style={{ color: '#00C300' }} />
                      <div>
                        <p className="font-bold text-[#111111] text-sm">{stat.value}</p>
                        <p className="text-[#8D8D8D] text-[10px]">{stat.label}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button type="button" onClick={() => navigate(isLoggedIn ? '/timeline' : '/auth')}
                    className="bg-[#00C300] hover:bg-[#00A300] text-white rounded-full px-8 py-4 text-sm font-bold transition-colors shadow-lg shadow-[#00C300]/20 flex items-center justify-center gap-2"
                  >
                    Start Creating <ArrowRight size={18} />
                  </button>
                  <button type="button" onClick={() => navigate('/analytics')}
                    className="bg-white/60 backdrop-blur-sm border border-white/50 hover:border-[#00C300]/30 text-[#111111] rounded-full px-8 py-4 text-sm font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <BarChart3 size={18} /> View Analytics
                  </button>
                </div>
              </motion.div>

              {/* Right: Login Card */}
              <motion.div style={{ y: y2 }} className="flex justify-center lg:justify-end">
                <CreatorLoginCard />
              </motion.div>
            </div>
          </div>
        </section>

        {/* Topic Circles Section */}
        <section className="px-6 sm:px-12 lg:px-20 py-16">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] mb-3">
                Discover Your Creative Path
              </h2>
              <p className="text-[#8D8D8D] max-w-lg mx-auto">
                Choose from 16+ creator categories. Every passion has a home on GaGa Chat.
              </p>
            </motion.div>

            <div className="flex flex-wrap justify-center gap-4 sm:gap-5">
              {topicCircles.map((topic, i) => (
                <motion.button
                  key={topic.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.03 }}
                  whileHover={{ scale: 1.1, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveTopic(activeTopic === topic.label ? null : topic.label)}
                  className={`group flex flex-col items-center gap-2 transition-all ${
                    activeTopic === topic.label ? 'scale-110' : ''
                  }`}
                >
                  <div
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 group-hover:shadow-xl"
                    style={{
                      backgroundColor: `${topic.color}15`,
                      boxShadow: activeTopic === topic.label ? `0 8px 30px ${topic.color}30` : undefined,
                    }}
                  >
                    <topic.icon size={28} style={{ color: topic.color }} strokeWidth={1.5} />
                  </div>
                  <div className="text-center">
                    <p className="text-[#111111] text-xs font-medium">{topic.label}</p>
                    <p className="text-[#8D8D8D] text-[10px]">{topic.count} creators</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="px-6 sm:px-12 lg:px-20 py-16">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] mb-3">
                Everything You Need to Succeed
              </h2>
              <p className="text-[#8D8D8D] max-w-lg mx-auto">
                Powerful tools designed to help you create, grow, and earn.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: TrendingUp, title: 'Analytics', desc: 'Real-time insights', color: '#00C300' },
                { icon: Wallet, title: 'Monetize', desc: 'Tips, subs, deals', color: '#FF9800' },
                { icon: Video, title: 'Reels & Live', desc: 'Short & live video', color: '#FF4081' },
                { icon: BadgeCheck, title: 'Verified', desc: 'Creator badge', color: '#8B5CF6' },
                { icon: Users, title: 'Community', desc: 'Audience growth', color: '#2196F3' },
                { icon: Zap, title: 'Promotion', desc: 'Boost reach', color: '#00BCD4' },
                { icon: BarChart3, title: 'Data', desc: 'Deep insights', color: '#FF5252' },
                { icon: Star, title: 'Premium', desc: 'Exclusive tools', color: '#00C300' },
              ].map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -5, scale: 1.02 }}
                  className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-2xl p-5 hover:shadow-lg transition-all cursor-pointer group"
                  onClick={() => navigate('/analytics')}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${f.color}15` }}
                  >
                    <f.icon size={20} style={{ color: f.color }} />
                  </div>
                  <h3 className="font-bold text-[#111111] text-sm mb-1">{f.title}</h3>
                  <p className="text-[#8D8D8D] text-xs">{f.desc}</p>
                  <ArrowUpRight size={14} className="text-[#8D8D8D] mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="px-6 sm:px-12 lg:px-20 py-16">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] mb-3">
                Four Steps to Start Earning
              </h2>
              <p className="text-[#8D8D8D] max-w-lg mx-auto">
                From signup to your first income in minutes.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { step: '1', title: 'Create', desc: 'Set up your profile with bio, links, and portfolio' },
                { step: '2', title: 'Publish', desc: 'Share posts, reels, and live streams daily' },
                { step: '3', title: 'Engage', desc: 'Reply, host Q&As, and grow your audience' },
                { step: '4', title: 'Earn', desc: 'Tips, subscriptions, brand deals, and ad revenue' },
              ].map((item, i) => (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="relative text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00C300] to-[#00A300] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4 shadow-lg shadow-[#00C300]/20">
                    {item.step}
                  </div>
                  {i < 3 && (
                    <div className="hidden lg:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-[#00C300]/30 to-transparent" />
                  )}
                  <h3 className="font-bold text-[#111111] mb-1">{item.title}</h3>
                  <p className="text-[#8D8D8D] text-xs">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Monetization Models */}
        <section className="px-6 sm:px-12 lg:px-20 py-16">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] mb-3">Ways to Earn</h2>
              <p className="text-[#8D8D8D] max-w-lg mx-auto">Multiple revenue streams for creators.</p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { icon: Heart, title: 'Tips & Gifts', desc: 'Fans send tips on posts and live streams', color: '#FF4081' },
                { icon: Crown, title: 'Subscriptions', desc: 'Exclusive content for monthly subscribers', color: '#FF9800' },
                { icon: Briefcase, title: 'Brand Deals', desc: 'Partner with brands through marketplace', color: '#00BCD4' },
                { icon: Play, title: 'Ad Revenue', desc: 'Earn from ads on reels and videos', color: '#00C300' },
                { icon: ShoppingBag, title: 'Sell Products', desc: 'List in GaGa Marketplace', color: '#8B5CF6' },
                { icon: MessageCircle, title: 'Paid Messages', desc: 'Charge for consultations', color: '#2196F3' },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white/60 backdrop-blur-sm border border-white/50 rounded-2xl p-5 flex items-start gap-4 hover:shadow-lg transition-all"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${item.color}15` }}>
                    <item.icon size={20} style={{ color: item.color }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#111111] text-sm mb-1">{item.title}</h3>
                    <p className="text-[#8D8D8D] text-xs">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Footer */}
        <section className="px-6 sm:px-12 lg:px-20 py-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center"
          >
            <div className="bg-white/60 backdrop-blur-xl border border-white/50 rounded-3xl p-10 sm:p-16 shadow-2xl">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#00C300]/20">
                <Sparkles size={32} className="text-white" />
              </div>
              <h2 className="text-3xl sm:text-5xl font-bold text-[#111111] mb-4">
                Ready to Create?
              </h2>
              <p className="text-[#8D8D8D] mb-8 max-w-md mx-auto">
                Join thousands of creators on GaGa Chat. Free to join, forever.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button type="button" onClick={() => navigate(isLoggedIn ? '/timeline' : '/auth')}
                  className="bg-[#00C300] hover:bg-[#00A300] text-white rounded-full px-10 py-4 text-lg font-bold transition-colors shadow-lg shadow-[#00C300]/20 flex items-center justify-center gap-2"
                >
                  Become a Creator <ArrowRight size={20} />
                </button>
                <button type="button" onClick={() => navigate('/analytics')}
                  className="bg-white border-2 border-[#EBEBEB] hover:border-[#00C300] text-[#111111] rounded-full px-10 py-4 text-lg font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <BarChart3 size={20} /> Explore
                </button>
              </div>
              <p className="text-[#8D8D8D] text-xs mt-6">
                Already a creator?{' '}
                <button type="button" onClick={() => navigate('/timeline')} className="text-[#00C300] font-medium hover:underline">
                  Access your dashboard
                </button>
              </p>
            </div>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="px-6 sm:px-12 lg:px-20 py-8 border-t border-white/30">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00C300] to-[#00A300] flex items-center justify-center">
                <Logo size={22} />
              </div>
              <span className="font-bold text-[#111111] text-sm">GaGa Chat Creator Center</span>
            </div>
            <div className="flex gap-6">
              <button type="button" onClick={() => navigate('/privacy')} className="text-[#8D8D8D] text-xs hover:text-[#111111] transition-colors">Privacy</button>
              <button type="button" onClick={() => navigate('/terms')} className="text-[#8D8D8D] text-xs hover:text-[#111111] transition-colors">Terms</button>
              <button type="button" onClick={() => navigate('/help')} className="text-[#8D8D8D] text-xs hover:text-[#111111] transition-colors">Help</button>
            </div>
            <p className="text-[#8D8D8D] text-xs">© 2026 GaGa Chat. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
