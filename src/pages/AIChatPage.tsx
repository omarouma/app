import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';
import {
  Send, ArrowLeft, Sparkles, Copy, Trash2, Bot, Wand2,
  Image as ImageIcon, Lightbulb, HelpCircle, Zap, X
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { getDefaultAvatar } from '@/lib/utils';
import { copyToClipboard } from '@/lib/share';
import { toast } from 'sonner';

interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

const SUGGESTED_PROMPTS = [
  { icon: Lightbulb, text: 'Give me a creative post idea' },
  { icon: HelpCircle, text: 'How do I make more friends on GaGa?' },
  { icon: Wand2, text: 'Write a funny caption for my reel' },
  { icon: Zap, text: 'What are trending topics today?' },
  { icon: ImageIcon, text: 'Describe a fun photo idea' },
  { icon: Sparkles, text: 'Motivate me with a quote' },
];

function generateAIResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  // Quick responses for common queries
  if (lower.includes('caption') || lower.includes('reel') || lower.includes('post idea')) {
    const captions = [
      "When the coffee hits just right ☕✨ #MorningVibes",
      "Plot twist: I'm the main character 🎬✨",
      "Just vibing through life one reel at a time 🎵",
      "Caption this: [insert your amazing moment here] 🌟",
      "Living my best life, no filter needed 😎",
      "POV: You found your people on GaGa Chat 💚",
      "Monday mood: Let's make it legendary 🔥",
    ];
    return `Here's a caption idea for you: \n\n${captions[Math.floor(Math.random() * captions.length)]}\n\nWant more options? Just ask! 😊`;
  }

  if (lower.includes('friend') || lower.includes('meet') || lower.includes('people')) {
    return `Great question! Here are some tips to make friends on GaGa Chat:\n\n1. **Join Voice Rooms** - It's the easiest way to meet people with similar interests! 🎙️\n2. **Share Stories** - Let people see your personality through daily stories 📸\n3. **React & Comment** - Engage with others' posts and reels to start conversations 💬\n4. **Use Nearby** - Find people in your area with the nearby feature 📍\n5. **Be Active Daily** - Consistency builds connections! Check in every day 🔥`;
  }

  if (lower.includes('trending') || lower.includes('popular') || lower.includes('topic')) {
    return `Here are the trending topics on GaGa right now:\n\n🔥 #GaGaChallenges\n🎵 #ReelStar\n💚 #VoiceRoomVibes\n📸 #StoryOfTheDay\n🎮 #GamingWithFriends\n\nJump into a voice room or create a reel on one of these topics to boost your engagement! 🚀`;
  }

  if (lower.includes('motivate') || lower.includes('quote') || lower.includes('inspire')) {
    const quotes = [
      "The best way to predict the future is to create it. ✨",
      "Your vibe attracts your tribe. Keep shining! 💫",
      "Every day is a fresh start. Make it count! 🌅",
      "Success is the sum of small efforts repeated daily. 💪",
      "Be the reason someone smiles today! 😊",
    ];
    return `${quotes[Math.floor(Math.random() * quotes.length)]}\n\nYou've got this! Remember, consistency is key. 🔥`;
  }

  if (lower.includes('photo') || lower.includes('picture') || lower.includes('selfie')) {
    return `Here are some fun photo ideas:\n\n📸 Golden hour selfie with natural light\n🎨 Color-themed outfit challenge\n🍕 "What I eat in a day" story series\n🌿 Nature walk with a friend\n🎭 Mirror selfie with a funny face\n\nPro tip: Use the story filters for extra flair! ✨`;
  }

  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return `Hey there! 👋 I'm GaGa AI, your personal assistant. I can help you with:\n\n💡 Content ideas & captions\n🤝 Tips for making friends\n📈 Trending topics & strategies\n✨ Motivation & inspiration\n\nWhat would you like help with today?`;
  }

  // Default creative responses
  const defaults = [
    `That's an interesting question! 🤔 Here's what I think:\n\nI'd suggest exploring the Voice Rooms feature - it's a great way to connect with people who share your interests. You can also try posting daily stories to show your personality! 💚`,
    `Great idea! 💡 For the best experience on GaGa Chat, I'd recommend:\n\n1. Check in daily for streak rewards 🔥\n2. Join voice rooms in your favorite categories 🎙️\n3. Create engaging reels with trending sounds 🎵\n4. React to friends' posts to stay connected 💬`,
    `I'm here to help! 🌟\n\nFor that specific question, try engaging with the community through comments and voice rooms. The more active you are, the more connections you'll make. Remember: consistency beats perfection! 💪`,
    `Awesome question! 🎯\n\nMy top tip: Be authentic in your interactions. People connect with real personalities. Share your thoughts, join discussions, and don't be afraid to start conversations in voice rooms! 🎙️✨`,
  ];

  return defaults[Math.floor(Math.random() * defaults.length)];
}

export default function AIChatPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hey ${user?.name || 'there'}! 👋 I'm GaGa AI, your personal assistant.\n\nI can help you with:\n💡 Content ideas & captions\n🤝 Tips for making friends\n📈 Trending topics & strategies\n✨ Motivation & inspiration\n\nWhat would you like help with today?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: AIMessage = {
      id: `msg_${uuidv4()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate AI thinking delay
    setTimeout(() => {
      const response = generateAIResponse(userMsg.content);
      const aiMsg: AIMessage = {
        id: `ai_${uuidv4()}`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
    }, 800 + Math.random() * 1000);
  };

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      toast.success('Copied to clipboard');
    } else {
      toast.error('Unable to copy in this browser');
    }
  };

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `Hey ${user?.name || 'there'}! 👋 I'm GaGa AI.\n\nWhat would you like help with today?`,
        timestamp: new Date(),
      },
    ]);
  };

  const handleSuggestedPrompt = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  return (
    <div className="h-[100dvh] bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-[#1a1a1a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2">
            <ArrowLeft size={22} />
          </button>
          <div className="w-9 h-9 rounded-full bg-[#00C300]/20 flex items-center justify-center">
            <Sparkles size={18} className="text-[#00C300]" />
          </div>
          <div>
            <p className="text-sm font-bold">GaGa AI</p>
            <p className="text-[10px] text-[#00C300]">{isTyping ? 'typing...' : 'Online'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleClear} className="p-2 rounded-full bg-[#1a1a1a]" title="Clear chat">
            <Trash2 size={16} className="text-[#8D8D8D]" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div className="shrink-0">
                {msg.role === 'assistant' ? (
                  <div className="w-8 h-8 rounded-full bg-[#00C300]/20 flex items-center justify-center">
                    <Bot size={16} className="text-[#00C300]" />
                  </div>
                ) : (
                  <img
                    src={user?.avatar || getDefaultAvatar(user?.id || 'U')}
                    alt="User"
                    className="w-8 h-8 rounded-full object-cover"
                  />
                )}
              </div>

              {/* Message bubble */}
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${msg.role === 'user'
                      ? 'bg-[#00C300] text-black rounded-tr-sm'
                      : 'bg-[#1a1a1a] text-white rounded-tl-sm'
                    }`}
                >
                  {msg.content}
                </div>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1 mt-1 px-1">
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.content)}
                      className="text-[#8D8D8D] hover:text-white transition-colors"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-[#00C300]/20 flex items-center justify-center shrink-0">
                <Bot size={16} className="text-[#00C300]" />
              </div>
              <div className="bg-[#1a1a1a] px-4 py-3 rounded-2xl rounded-tl-sm">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-[#8D8D8D] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-[#8D8D8D] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-[#8D8D8D] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Suggested prompts (shown when few messages) */}
      {messages.length < 3 && (
        <div className="shrink-0 px-4 py-2 border-t border-[#1a1a1a]">
          <p className="text-[10px] text-[#8D8D8D] uppercase tracking-wider mb-2">Suggested</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {SUGGESTED_PROMPTS.map((prompt, i) => {
              const Icon = prompt.icon;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSuggestedPrompt(prompt.text)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-[#1a1a1a] rounded-full text-xs text-[#8D8D8D] hover:text-white hover:bg-[#2a2a2a] transition-colors"
                >
                  <Icon size={12} />
                  <span className="whitespace-nowrap">{prompt.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 px-4 py-3 border-t border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask GaGa AI anything..."
              className="w-full bg-[#1a1a1a] rounded-full pl-4 pr-10 py-3 text-sm text-white placeholder:text-[#8D8D8D] outline-none focus:ring-2 focus:ring-[#00C300]/30"
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="w-10 h-10 rounded-full bg-[#00C300] flex items-center justify-center text-black disabled:opacity-50 hover:bg-[#00A300] transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-center text-[10px] text-[#8D8D8D] mt-2">
          GaGa AI can make mistakes. Consider checking important information.
        </p>
      </div>
    </div>
  );
}
