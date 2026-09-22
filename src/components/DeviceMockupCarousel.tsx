import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, MessageCircle, Phone, Coins } from 'lucide-react';

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
    color: '#FF9800', icon: Coins, title: 'Gaga Coins', subtitle: 'Earn & Send Money',
    preview: null, isWallet: true,
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
      <div className="w-[220px] h-[440px] sm:w-[260px] sm:h-[520px] bg-background rounded-[2rem] sm:rounded-[2.5rem] border-4 border-border shadow-2xl relative overflow-hidden mx-auto">
        {/* Status bar */}
        <div className="absolute top-0 left-0 right-0 h-8 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-between px-5 pt-1">
          <span className="text-[9px] font-semibold text-[#111]">9:41</span>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-muted rounded-b-xl" />
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
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/60">
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: `${slide.color}20` }}>
                <Icon size={14} style={{ color: slide.color }} />
              </div>
              <span className="text-[11px] font-bold text-[#111]">{slide.title}</span>
              <span className="ml-auto text-[9px] text-muted-foreground">{slide.subtitle}</span>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
              {/* Chat preview */}
              {slide.preview && (
                <div className="w-full space-y-2">
                  {slide.preview.map((msg, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }}
                      className={`flex ${msg.me ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] px-3 py-2 rounded-2xl ${msg.me ? 'rounded-br-sm text-white' : 'rounded-bl-sm bg-muted text-[#111]'}`}
                        style={msg.me ? { backgroundColor: slide.color } : {}}>
                        <p className="text-[11px] leading-snug">{msg.text}</p>
                        <p className={`text-[8px] mt-0.5 ${msg.me ? 'text-white/70' : 'text-muted-foreground'}`}>{msg.time}</p>
                      </div>
                    </motion.div>
                  ))}
                  {/* Typing indicator */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex justify-start">
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 flex gap-1 items-center">
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
                  <motion.p className="text-[10px] text-muted-foreground mb-4"
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
                  <p className="text-[9px] text-muted-foreground mt-3">Free HD call • No VPN needed</p>
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
                  <div className="mt-2 bg-muted rounded-lg p-2">
                    <p className="text-[8px] text-muted-foreground mb-1">Recent</p>
                    <div className="flex justify-between items-center">
                      <p className="text-[9px] text-[#111]">Tip from @fan123</p>
                      <p className="text-[9px] font-bold" style={{ color: slide.color }}>+50 G</p>
                    </div>
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
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shadow-md">
        <ChevronLeft size={16} />
      </button>
      <button type="button" onClick={() => goTo((current + 1) % slides.length)}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shadow-md">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
