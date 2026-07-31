import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, MessageCircle, Phone, Play, Coins, ShoppingBag, Mic } from 'lucide-react';

const slides = [
  {
    color: '#00C300', icon: MessageCircle, title: 'Messaging', subtitle: 'Instant & Secure',
    preview: [
      { me: false, text: 'Hey! Free tonight? 🎉', time: '7:42 PM' },
      { me: true, text: 'Yes! GaGa call? 📞', time: '7:43 PM' },
      { me: false, text: 'Sure, calling now!', time: '7:43 PM' },
    ],
  },
  {
    color: '#2196F3', icon: Phone, title: 'HD Calls', subtitle: 'Voice & Video — Free',
    preview: null, isCall: true,
  },
  {
    color: '#FF4081', icon: Play, title: 'Reels', subtitle: 'Short Videos & Stories',
    preview: null, isReels: true,
  },
  {
    color: '#FF9800', icon: Coins, title: 'Gaga Coins', subtitle: 'Earn & Send Money',
    preview: null, isWallet: true,
  },
  {
    color: '#9C27B0', icon: Mic, title: 'Voice Rooms', subtitle: 'Live Audio Spaces',
    preview: null, isVoice: true,
  },
  {
    color: '#00BCD4', icon: ShoppingBag, title: 'Marketplace', subtitle: 'Buy & Sell Locally',
    preview: null, isMarket: true,
  },
];

export default function DeviceMockupCarousel() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDirection(1);
      setCurrent(prev => (prev + 1) % slides.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  const slide = slides[current];
  const Icon = slide.icon;

  const goTo = (idx: number) => {
    setDirection(idx > current ? 1 : -1);
    setCurrent(idx);
  };

  return (
    <div className="relative">
      {/* Glow */}
      <div className="absolute inset-0 rounded-[3rem] blur-3xl opacity-20 transition-all duration-700"
        style={{ backgroundColor: slide.color }} />

      {/* Phone Frame */}
      <div className="w-[220px] h-[440px] sm:w-[260px] sm:h-[520px] bg-white rounded-[2rem] sm:rounded-[2.5rem] border-4 border-[#EBEBEB] shadow-2xl relative overflow-hidden mx-auto">
        {/* Status bar */}
        <div className="absolute top-0 left-0 right-0 h-8 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-between px-5 pt-1">
          <span className="text-[9px] font-semibold text-[#111]">9:41</span>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-[#F5F5F5] rounded-b-xl" />
          <div className="flex items-center gap-1">
            <div className="w-3 h-2 border border-[#111] rounded-[2px] relative"><div className="absolute inset-[1px] right-[2px] bg-[#111] rounded-[1px]" /></div>
          </div>
        </div>

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current}
            custom={direction}
            initial={{ x: direction * 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -80, opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="h-full flex flex-col pt-8"
            style={{ background: `radial-gradient(circle at 30% 20%, ${slide.color}18, #ffffff 60%)` }}
          >
            {/* App header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#EBEBEB]/60">
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: `${slide.color}20` }}>
                <Icon size={14} style={{ color: slide.color }} />
              </div>
              <span className="text-[11px] font-bold text-[#111]">{slide.title}</span>
              <span className="ml-auto text-[9px] text-[#8D8D8D]">{slide.subtitle}</span>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
              {/* Chat preview */}
              {slide.preview && (
                <div className="w-full space-y-2">
                  {slide.preview.map((msg, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }}
                      className={`flex ${msg.me ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] px-3 py-2 rounded-2xl ${msg.me ? 'rounded-br-sm text-white' : 'rounded-bl-sm bg-[#F5F5F5] text-[#111]'}`}
                        style={msg.me ? { backgroundColor: slide.color } : {}}>
                        <p className="text-[11px] leading-snug">{msg.text}</p>
                        <p className={`text-[8px] mt-0.5 ${msg.me ? 'text-white/70' : 'text-[#8D8D8D]'}`}>{msg.time}</p>
                      </div>
                    </motion.div>
                  ))}
                  {/* Typing indicator */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex justify-start">
                    <div className="bg-[#F5F5F5] rounded-2xl rounded-bl-sm px-3 py-2 flex gap-1 items-center">
                      {[0, 1, 2].map(i => (
                        <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-[#8D8D8D]"
                          animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }} />
                      ))}
                    </div>
                  </motion.div>
                </div>
              )}

              {/* Call screen */}
              {slide.isCall && (
                <div className="w-full text-center">
                  <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}
                    className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-white text-xl font-bold"
                    style={{ backgroundColor: slide.color }}>
                    KH
                  </motion.div>
                  <p className="text-[12px] font-bold text-[#111] mb-1">Kamal Hossain</p>
                  <motion.p className="text-[10px] text-[#8D8D8D] mb-4"
                    animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                    Calling... HD
                  </motion.p>
                  <div className="flex justify-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
                      <Phone size={16} className="text-white rotate-[135deg]" />
                    </div>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: slide.color }}>
                      <Phone size={16} className="text-white" />
                    </div>
                  </div>
                  <p className="text-[9px] text-[#8D8D8D] mt-3">Free HD call • No VPN needed</p>
                </div>
              )}

              {/* Reels screen */}
              {slide.isReels && (
                <div className="w-full">
                  <div className="rounded-xl overflow-hidden mb-2 relative" style={{ background: `linear-gradient(135deg, ${slide.color}30, #111 80%)`, height: 120 }}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <Play size={18} className="text-white ml-0.5" />
                      </div>
                    </div>
                    <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between">
                      <div>
                        <p className="text-white text-[9px] font-bold">@creator_bd</p>
                        <p className="text-white/70 text-[8px]">Trending in Bangladesh 🔥</p>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="text-white text-[8px] text-center">❤️<br/><span>12K</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 overflow-hidden">
                    {['#viral', '#bd', '#fun'].map(tag => (
                      <span key={tag} className="text-[8px] px-2 py-0.5 rounded-full" style={{ backgroundColor: `${slide.color}20`, color: slide.color }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Wallet screen */}
              {slide.isWallet && (
                <div className="w-full">
                  <div className="rounded-xl p-3 mb-2 text-white" style={{ background: `linear-gradient(135deg, ${slide.color}, #FF6B00)` }}>
                    <p className="text-[9px] opacity-80 mb-1">Gaga Coins Balance</p>
                    <p className="text-2xl font-bold">1,250 G</p>
                    <p className="text-[9px] opacity-70 mt-1">≈ $8.88 USD</p>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {['Send', 'Receive', 'Earn'].map((a) => (
                      <div key={a} className="rounded-lg p-2 text-center" style={{ backgroundColor: `${slide.color}15` }}>
                        <p className="text-[9px] font-bold" style={{ color: slide.color }}>{a}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 bg-[#F5F5F5] rounded-lg p-2">
                    <p className="text-[8px] text-[#8D8D8D] mb-1">Recent</p>
                    <div className="flex justify-between items-center">
                      <p className="text-[9px] text-[#111]">Tip from @fan123</p>
                      <p className="text-[9px] font-bold" style={{ color: slide.color }}>+50 G</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Voice room */}
              {slide.isVoice && (
                <div className="w-full text-center">
                  <p className="text-[10px] font-bold text-[#111] mb-3">🎙️ Tech Talk BD</p>
                  <div className="flex justify-center gap-2 mb-3">
                    {['AK', 'SR', 'NJ', 'MH'].map((u, i) => (
                      <motion.div key={u} className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                        style={{ backgroundColor: ['#00C300', '#2196F3', '#FF4081', '#FF9800'][i] }}
                        animate={i === 0 ? { scale: [1, 1.1, 1], boxShadow: ['0 0 0 0px #9C27B040', '0 0 0 6px #9C27B040', '0 0 0 0px #9C27B040'] } : {}}
                        transition={{ repeat: Infinity, duration: 1.5 }}>
                        {u}
                      </motion.div>
                    ))}
                  </div>
                  <p className="text-[9px] text-[#8D8D8D] mb-2">4 speakers • 128 listeners</p>
                  <div className="flex justify-center gap-2">
                    <div className="px-3 py-1.5 rounded-full text-white text-[9px] font-bold" style={{ backgroundColor: slide.color }}>
                      🎤 Raise Hand
                    </div>
                  </div>
                </div>
              )}

              {/* Marketplace */}
              {slide.isMarket && (
                <div className="w-full">
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { name: 'iPhone 14', price: '৳85,000', emoji: '📱' },
                      { name: 'Laptop', price: '৳55,000', emoji: '💻' },
                      { name: 'Headphones', price: '৳3,500', emoji: '🎧' },
                      { name: 'Camera', price: '৳42,000', emoji: '📷' },
                    ].map(item => (
                      <div key={item.name} className="bg-[#F5F5F5] rounded-xl p-2 text-center">
                        <p className="text-xl mb-1">{item.emoji}</p>
                        <p className="text-[9px] font-medium text-[#111] leading-tight">{item.name}</p>
                        <p className="text-[9px] font-bold" style={{ color: slide.color }}>{item.price}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom nav dots */}
            <div className="shrink-0 h-10 flex items-center justify-center gap-1.5 pb-1">
              {slides.map((_, i) => (
                <button type="button" key={i} onClick={() => goTo(i)}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === current ? 20 : 6,
                    height: 6,
                    backgroundColor: i === current ? slide.color : '#EBEBEB',
                  }}
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <button type="button" onClick={() => goTo((current - 1 + slides.length) % slides.length)}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 w-8 h-8 rounded-full bg-white border border-[#EBEBEB] flex items-center justify-center text-[#8D8D8D] hover:text-[#111111] shadow-md">
        <ChevronLeft size={16} />
      </button>
      <button type="button" onClick={() => goTo((current + 1) % slides.length)}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 w-8 h-8 rounded-full bg-white border border-[#EBEBEB] flex items-center justify-center text-[#8D8D8D] hover:text-[#111111] shadow-md">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
