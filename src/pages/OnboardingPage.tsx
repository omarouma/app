import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle, Users, Video, Wallet, Sparkles,
  ArrowRight, Check, Shield
} from 'lucide-react';
import Logo from '@/components/Logo';

const STEPS = [
  {
    icon: Sparkles,
    title: 'Welcome to GaGa Chat',
    description: 'The free messaging app for everyone. Chat, call, share, and earn — all in one place. No VPN needed, supports all languages.',
    color: 'text-[#00C300]',
    bg: 'bg-[#00C300]/10',
  },
  {
    icon: Users,
    title: 'Find Your Friends',
    description: 'Add friends by username, phone number, or scan their QR code. See who\'s online and start chatting instantly.',
    color: 'text-[#2196F3]',
    bg: 'bg-[#2196F3]/10',
  },
  {
    icon: MessageCircle,
    title: 'Rich Messaging',
    description: 'Send text, photos, videos, voice messages, and files. React with emojis, reply to messages, and forward to anyone.',
    color: 'text-[#FF9800]',
    bg: 'bg-[#FF9800]/10',
  },
  {
    icon: Video,
    title: 'Voice & Video Calls',
    description: 'Crystal-clear voice and video calls with your friends. Free, unlimited, and built right into the app.',
    color: 'text-[#8B5CF6]',
    bg: 'bg-[#8B5CF6]/10',
  },
  {
    icon: Wallet,
    title: 'Wallet & Rewards',
    description: 'Earn Gaga Coins by using the app, referring friends, and staking. Use coins for premium features and tips.',
    color: 'text-[#FFD700]',
    bg: 'bg-[#FFD700]/10',
  },
  {
    icon: Shield,
    title: 'Privacy First',
    description: 'Your messages are private. Control who can see your profile, last seen status, and friend list. Built with security in mind.',
    color: 'text-[#00C3C3]',
    bg: 'bg-[#00C3C3]/10',
  },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const goNext = () => {
    if (step < STEPS.length - 1) {
      setDirection(1);
      setStep(s => s + 1);
    } else {
      completeOnboarding();
    }
  };

  const goBack = () => {
    if (step > 0) {
      setDirection(-1);
      setStep(s => s - 1);
    }
  };

  const completeOnboarding = () => {
    localStorage.setItem('gaga-onboarding-complete', 'true');
    navigate('/contacts');
  };

  const skip = () => {
    localStorage.setItem('gaga-onboarding-complete', 'true');
    navigate('/contacts');
  };

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <div className="h-[100dvh] w-screen bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <span className="text-[#111111] font-bold text-sm">GaGa Chat</span>
        </div>
        <button type="button" onClick={skip}
          className="text-[#8D8D8D] text-sm font-medium hover:text-[#111111] transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Progress */}
      <div className="shrink-0 px-6 mb-4">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i <= step ? 'bg-[#00C300] flex-1' : 'bg-[#EBEBEB] flex-1'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 relative">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -50 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="text-center max-w-sm mx-auto"
          >
            <div className={`w-24 h-24 rounded-3xl ${current.bg} flex items-center justify-center mx-auto mb-6`}>
              <Icon size={40} className={current.color} />
            </div>
            <h2 className="text-2xl font-bold text-[#111111] mb-3">{current.title}</h2>
            <p className="text-[#8D8D8D] text-base leading-relaxed">{current.description}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 pb-8 pt-4">
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button type="button" onClick={goBack}
              className="px-4 py-3 rounded-xl bg-[#F5F5F5] text-[#111111] text-sm font-medium hover:bg-[#EBEBEB] transition-colors"
            >
              Back
            </button>
          )}
          <button type="button" onClick={goNext}
            className="flex-1 py-3 rounded-xl bg-[#00C300] text-white text-sm font-bold hover:bg-[#00A300] transition-colors flex items-center justify-center gap-2"
          >
            {step === STEPS.length - 1 ? (
              <>
                Get Started <Check size={16} />
              </>
            ) : (
              <>
                Next <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
        <p className="text-center text-[#8D8D8D] text-xs mt-4">
          Step {step + 1} of {STEPS.length}
        </p>
      </div>
    </div>
  );
}
