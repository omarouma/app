import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, MessageCircle, Phone, Clock, Shield } from 'lucide-react';

const slides = [
  { color: '#00C300', icon: MessageCircle, title: 'Messaging', subtitle: 'Instant & Secure' },
  { color: '#2196F3', icon: Phone, title: 'Calls', subtitle: 'Voice & Video' },
  { color: '#FF9800', icon: Clock, title: 'Timeline', subtitle: 'Share Moments' },
  { color: '#9C27B0', icon: Shield, title: 'Privacy', subtitle: 'End-to-End Encrypted' },
];

export default function DeviceMockupCarousel() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDirection(1);
      setCurrent(prev => (prev + 1) % slides.length);
    }, 4000);
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
      {/* Phone Frame - responsive sizing */}
      <div className="w-[220px] h-[440px] sm:w-[260px] sm:h-[520px] bg-white rounded-[2rem] sm:rounded-[2.5rem] border-4 border-[#EBEBEB] shadow-xl relative overflow-hidden mx-auto">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-[#F5F5F5] rounded-b-2xl z-10" />

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current}
            custom={direction}
            initial={{ x: direction * 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -100, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="h-full flex flex-col"
            style={{ background: `radial-gradient(circle at 40% 40%, ${slide.color}15, #ffffff)` }}
          >
            <div className="flex-1 flex flex-col items-center justify-center p-8 pt-16">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring' }}
                className="w-24 h-24 rounded-3xl mb-6 flex items-center justify-center"
                style={{ backgroundColor: `${slide.color}15` }}
              >
                <Icon size={48} style={{ color: slide.color }} />
              </motion.div>
              <motion.h3
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="text-3xl font-bold text-[#111111] mb-2"
              >
                {slide.title}
              </motion.h3>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="text-[#8D8D8D] text-sm"
              >
                {slide.subtitle}
              </motion.p>

              <div className="mt-8 w-full space-y-3">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.45 }}
                  className="bg-[#F5F5F5] rounded-2xl rounded-bl-sm p-3 max-w-[80%]"
                >
                  <p className="text-[#111111] text-sm">Hello! How are you?</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.55 }}
                  className="ml-auto bg-[#00C300] rounded-2xl rounded-br-sm p-3 max-w-[80%]"
                >
                  <p className="text-white text-sm font-medium">I am great! Thanks 🚀</p>
                </motion.div>
              </div>
            </div>

            <div className="shrink-0 h-12 flex items-center justify-center gap-6 pb-2">
              {slides.map((_, i) => (
                <button type="button" key={i}
                  onClick={() => goTo(i)}
                  className={`w-2 h-2 rounded-full transition-all ${i === current ? 'bg-[#111111] w-6' : 'bg-[#EBEBEB]'}`}
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <button type="button" onClick={() => goTo((current - 1 + slides.length) % slides.length)}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-8 h-8 rounded-full bg-white border border-[#EBEBEB] flex items-center justify-center text-[#8D8D8D] hover:text-[#111111] shadow-sm"
      >
        <ChevronLeft size={16} />
      </button>
      <button type="button" onClick={() => goTo((current + 1) % slides.length)}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-8 h-8 rounded-full bg-white border border-[#EBEBEB] flex items-center justify-center text-[#8D8D8D] hover:text-[#111111] shadow-sm"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
