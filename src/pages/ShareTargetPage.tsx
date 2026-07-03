import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Share, X, Image, Link, FileText,
  ChevronRight, User, MessageCircle, TrendingUp
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTimelineStore } from '@/store/useTimelineStore';
import { useChatStore } from '@/store/useChatStore';
import BottomNav from '@/components/layout/BottomNav';
import { toast } from 'sonner';

interface SharedData {
  title: string;
  text: string;
  url: string;
  files: { name: string; type: string; size: number }[];
  timestamp: number;
}

export default function ShareTargetPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { createPost } = useTimelineStore();
  const { chats } = useChatStore();
  const [sharedData, setSharedData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState('');
  const [showChatPicker, setShowChatPicker] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);

  // Read shared data from service worker cache
  useEffect(() => {
    async function loadSharedData() {
      try {
        // Try to get from cache
        const cache = await caches.open('share-target-cache');
        const response = await cache.match('/shared-data');
        if (response) {
          const data: SharedData = await response.json();
          setSharedData(data);
          // Clear cache after reading
          await cache.delete('/shared-data');
        } else {
          // Check URL params as fallback
          const params = new URLSearchParams(window.location.search);
          const url = params.get('url') || '';
          const text = params.get('text') || '';
          const title = params.get('title') || '';
          if (url || text) {
            setSharedData({
              title,
              text,
              url,
              files: [],
              timestamp: Date.now(),
            });
          }
        }
      } catch (err) {
        console.error('Failed to load shared data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSharedData();
  }, []);

  // Handle file input for manual file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setMediaFiles(prev => [...prev, ...files]);
  };

  const handlePostToTimeline = async () => {
    if (!user) { toast.error('Please log in first'); return; }
    try {
      const text = `${caption}\n\n${sharedData?.text || ''}\n${sharedData?.url || ''}`.trim();
      const imageUrls = mediaFiles.map(f => URL.createObjectURL(f));
      await createPost(user.id, text, imageUrls, 'public');
      toast.success('Posted to timeline!');
      navigate('/timeline');
    } catch {
      toast.error('Failed to post');
    }
  };

  const handleShareInChat = (chatId: string) => {
    if (!user) { toast.error('Please log in first'); return; }
    const text = `${caption}\n\n${sharedData?.text || ''}\n${sharedData?.url || ''}`.trim();
    const { sendMessage } = useChatStore.getState();
    sendMessage(chatId, user.id, text, 'text');
    toast.success('Shared in chat!');
    navigate(`/chat/${chatId}`);
  };

  const hasContent = sharedData?.text || sharedData?.url || sharedData?.title || mediaFiles.length > 0;

  if (loading) {
    return (
      <div className="h-[100dvh] bg-white flex items-center justify-center">
        <div className="text-center">
          <Share size={40} className="mx-auto mb-3 text-[#00C300]" />
          <p className="text-[#8D8D8D] text-sm">Loading shared content...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#EBEBEB]">
        <div className="flex items-center gap-2">
          <Share size={20} className="text-[#00C300]" />
          <h1 className="text-lg font-semibold text-[#111111]">Share</h1>
        </div>
        <button type="button" onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-[#F5F5F5]">
          <X size={20} className="text-[#8D8D8D]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!hasContent ? (
          <div className="text-center py-12">
            <Share size={48} className="mx-auto mb-4 text-[#8D8D8D]" />
            <p className="text-[#8D8D8D] text-sm mb-4">No content shared</p>
            <p className="text-xs text-[#8D8D8D] mb-6">
              Share content from other apps to GaGa Chat to post it here.
            </p>
            <button
              type="button"
              onClick={() => navigate('/timeline')}
              className="bg-[#00C300] text-black px-6 py-2.5 rounded-xl font-medium text-sm"
            >
              Go to Timeline
            </button>
          </div>
        ) : (
          <>
            {/* Shared content preview */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#F5F5F5] rounded-2xl p-4 mb-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <Share size={16} className="text-[#00C300]" />
                <span className="text-xs font-medium text-[#8D8D8D] uppercase tracking-wide">Shared Content</span>
              </div>

              {sharedData?.title && (
                <p className="text-sm font-semibold text-[#111111] mb-1">{sharedData.title}</p>
              )}
              {sharedData?.text && (
                <p className="text-sm text-[#111111] mb-2 whitespace-pre-wrap">{sharedData.text}</p>
              )}
              {sharedData?.url && (
                <a
                  href={sharedData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[#00C300] hover:underline break-all"
                >
                  <Link size={14} />
                  {sharedData.url}
                </a>
              )}
              {sharedData?.files && sharedData.files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {sharedData.files.map((file, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1.5 text-xs">
                      <Image size={14} className="text-[#00C300]" />
                      <span className="text-[#111111] truncate max-w-[150px]">{file.name}</span>
                      <span className="text-[#8D8D8D]">({Math.round(file.size / 1024)}KB)</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Caption input */}
            <div className="mb-4">
              <label className="text-xs font-medium text-[#8D8D8D] uppercase tracking-wide mb-2 block">Add a caption</label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Say something about this..."
                className="w-full bg-[#F5F5F5] rounded-2xl p-4 text-sm text-[#111111] placeholder:text-[#8D8D8D] resize-none focus:outline-none focus:ring-2 focus:ring-[#00C300]/30"
                rows={3}
              />
            </div>

            {/* Add media */}
            <div className="mb-4">
              <label className="text-xs font-medium text-[#8D8D8D] uppercase tracking-wide mb-2 block">Add media</label>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="share-media-input"
              />
              <label
                htmlFor="share-media-input"
                className="flex items-center gap-2 bg-[#F5F5F5] rounded-2xl p-4 cursor-pointer hover:bg-[#EBEBEB] transition-colors"
              >
                <Image size={20} className="text-[#00C300]" />
                <span className="text-sm text-[#111111]">Tap to add photos or videos</span>
              </label>
              {mediaFiles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {mediaFiles.map((file, i) => (
                    <div key={i} className="relative">
                      {file.type.startsWith('image/') ? (
                        <img
                          src={URL.createObjectURL(file)}
                          alt=""
                          className="w-20 h-20 object-cover rounded-xl"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-[#111111] rounded-xl flex items-center justify-center">
                          <FileText size={20} className="text-[#00C300]" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setMediaFiles(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-[#FF3B30] rounded-full flex items-center justify-center"
                      >
                        <X size={10} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handlePostToTimeline}
                className="w-full flex items-center gap-3 bg-[#00C300] text-black rounded-2xl p-4 hover:bg-[#00b300] transition-colors"
              >
                <TrendingUp size={20} />
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold">Post to Timeline</p>
                  <p className="text-xs opacity-70">Share with all your followers</p>
                </div>
                <ChevronRight size={18} />
              </button>

              <button
                type="button"
                onClick={() => setShowChatPicker(true)}
                className="w-full flex items-center gap-3 bg-[#F5F5F5] rounded-2xl p-4 hover:bg-[#EBEBEB] transition-colors"
              >
                <MessageCircle size={20} className="text-[#00C300]" />
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-[#111111]">Send in Chat</p>
                  <p className="text-xs text-[#8D8D8D]">Share with a specific conversation</p>
                </div>
                <ChevronRight size={18} className="text-[#8D8D8D]" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Chat picker modal */}
      {showChatPicker && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-black/50 flex items-end"
          onClick={() => setShowChatPicker(false)}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            className="bg-white w-full rounded-t-3xl max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#EBEBEB] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#111111]">Select Chat</h2>
              <button type="button" onClick={() => setShowChatPicker(false)} className="p-2">
                <X size={20} className="text-[#8D8D8D]" />
              </button>
            </div>
            <div className="p-2">
              {chats.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[#8D8D8D]">No chats yet</p>
                  <button
                    type="button"
                    onClick={() => { setShowChatPicker(false); navigate('/contacts'); }}
                    className="mt-3 text-sm text-[#00C300] font-medium"
                  >
                    Start a new chat
                  </button>
                </div>
              ) : (
                chats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => handleShareInChat(chat.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#F5F5F5] text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#00C300]/10 flex items-center justify-center shrink-0">
                      <User size={18} className="text-[#00C300]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#111111] truncate">{chat.name || 'Chat'}</p>
                      <p className="text-xs text-[#8D8D8D] truncate">{typeof chat.lastMessage === 'string' ? chat.lastMessage : chat.lastMessage?.content || 'No messages'}</p>
                    </div>
                    <ChevronRight size={16} className="text-[#8D8D8D]" />
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      <BottomNav />
    </div>
  );
}
