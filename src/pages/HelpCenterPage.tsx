import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, MessageCircle, Phone, Wallet, Shield,
  HelpCircle, ChevronDown, Mail, Crown
} from 'lucide-react';

const FAQS = [
  {
    category: 'Getting Started',
    icon: HelpCircle,
    items: [
      {
        q: 'What is GaGa Chat?',
        a: 'GaGa Chat is a global messaging and social platform. It includes chat, voice/video calls, timeline, marketplace, events, and a built-in wallet with rewards.',
      },
      {
        q: 'How do I add friends?',
        a: 'Go to the Contacts tab and tap "Add Friend". You can search by username, phone number, or scan their QR code. You can also use the Nearby feature to find friends around you.',
      },
      {
        q: 'Is GaGa Chat free?',
        a: 'Yes! GaGa Chat is completely free to use. All messaging, voice calls, and video calls are free. We also offer premium features for power users.',
      },
    ],
  },
  {
    category: 'Messaging',
    icon: MessageCircle,
    items: [
      {
        q: 'Can I send photos and videos?',
        a: 'Yes! In any chat, tap the attachment button to send photos, videos, files, voice messages, and even your location.',
      },
      {
        q: 'How do I create a group chat?',
        a: 'Go to Chats, tap the "+" button, and select "Create Group". Add members, set a group name and photo, and start chatting!',
      },
      {
        q: 'Can I schedule messages?',
        a: 'Yes! When composing a message, tap the clock icon to schedule it for a later time. The message will be sent automatically.',
      },
    ],
  },
  {
    category: 'Calls',
    icon: Phone,
    items: [
      {
        q: 'Are voice and video calls free?',
        a: 'Yes! All voice and video calls between GaGa Chat users are completely free, unlimited, and work over Wi-Fi or mobile data.',
      },
      {
        q: 'Can I flip the camera during a video call?',
        a: 'Yes! During a video call, tap the flip camera button to switch between front and rear cameras.',
      },
    ],
  },
  {
    category: 'Wallet & Rewards',
    icon: Wallet,
    items: [
      {
        q: 'What are Gaga Coins?',
        a: 'Gaga Coins are our in-app currency. You earn them by using the app, referring friends, and completing daily streaks. Use them for premium features, tips, and marketplace purchases.',
      },
      {
        q: 'How do I earn coins?',
        a: 'Earn coins through daily check-ins, referring friends, posting on the timeline, receiving tips, and staking your existing coins.',
      },
      {
        q: 'Is my wallet secure?',
        a: 'Yes! You can set a PIN to protect your wallet. All transactions are tracked and can be viewed in your transaction history.',
      },
    ],
  },
  {
    category: 'Privacy & Security',
    icon: Shield,
    items: [
      {
        q: 'Who can see my last seen?',
        a: 'You control this! Go to Settings > Privacy to set who can see your last seen status: everyone, friends only, or nobody.',
      },
      {
        q: 'Can I block someone?',
        a: 'Yes! In any chat, tap the user\'s name and select "Block". Blocked users cannot message you or see your profile.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Go to Settings > Account > Delete Account. This will permanently remove all your data from GaGa Chat.',
      },
    ],
  },
  {
    category: 'Premium',
    icon: Crown,
    items: [
      {
        q: 'What is GaGa Premium?',
        a: 'Premium unlocks exclusive features like custom themes, larger file uploads, priority support, analytics dashboard, and ad-free experience.',
      },
      {
        q: 'How do I upgrade?',
        a: 'Go to the Premium page from the More menu. Choose a plan and follow the payment instructions.',
      },
    ],
  },
];

export default function HelpCenterPage() {
  const navigate = useNavigate();
  const [openItem, setOpenItem] = useState<string | null>(null);

  const toggleItem = (key: string) => {
    setOpenItem(prev => (prev === key ? null : key));
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-[#EBEBEB] flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-[#F5F5F5] text-[#8D8D8D]">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-[#111111]">Help Center</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <p className="text-[#8D8D8D] text-sm mb-6">
            Find answers to common questions below. If you need more help, contact us at{' '}
            <a href="mailto:support@gagachat.app" className="text-[#00C300] underline">support@gagachat.app</a>
          </p>

          {FAQS.map((category, ci) => (
            <div key={category.category} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center">
                  <category.icon size={16} className="text-[#00C300]" />
                </div>
                <h2 className="text-sm font-bold text-[#111111]">{category.category}</h2>
              </div>

              <div className="space-y-2">
                {category.items.map((item, ii) => {
                  const key = `${ci}-${ii}`;
                  const isOpen = openItem === key;
                  return (
                    <div key={key} className="border border-[#EBEBEB] rounded-xl overflow-hidden">
                      <button type="button" onClick={() => toggleItem(key)}
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-[#F5F5F5] transition-colors"
                      >
                        <span className="text-sm font-medium text-[#111111] pr-4">{item.q}</span>
                        <ChevronDown
                          size={16}
                          className={`text-[#8D8D8D] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <p className="px-3 pb-3 text-sm text-[#8D8D8D] leading-relaxed">{item.a}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Contact section */}
          <div className="bg-[#F5F5F5] rounded-xl p-4 mt-4">
            <h3 className="text-sm font-bold text-[#111111] mb-2">Still need help?</h3>
            <div className="space-y-2">
              <a
                href="mailto:support@gagachat.app"
                className="flex items-center gap-2 text-sm text-[#00C300] hover:underline"
              >
                <Mail size={14} /> support@gagachat.app
              </a>
              <p className="text-xs text-[#8D8D8D]">
                We typically respond within 24 hours.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
