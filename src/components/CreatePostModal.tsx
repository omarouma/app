import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/useAuthStore';
import { useEnhancedTimelineStore } from '@/store/useEnhancedTimelineStore';
import { uploadMediaBlob } from '@/lib/storage';
import { toast } from 'sonner';
import {
  Image, MapPin, BarChart2, Calendar, EyeOff, X,
  Smile, Send, Globe, Lock, Users, UserCheck, ChevronDown, Plus, Minus, Clock
} from 'lucide-react';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPost?: () => void;
}

const PRIVACY_OPTIONS = [
  { value: 'public', label: 'Public', icon: Globe, desc: 'Anyone can see' },
  { value: 'friends', label: 'Friends', icon: Users, desc: 'Only your friends' },
  { value: 'followers', label: 'Followers', icon: UserCheck, desc: 'Only your followers' },
  { value: 'private', label: 'Only Me', icon: Lock, desc: 'Only you' },
  { value: 'close_friends', label: 'Close Friends', icon: UserCheck, desc: 'Your close friends list' },
] as const;

const PRESET_LOCATIONS = [
  'New York, NY', 'Los Angeles, CA', 'London, UK', 'Paris, France',
  'Tokyo, Japan', 'Mumbai, India', 'Dubai, UAE',
  'Sydney, Australia', 'Berlin, Germany', 'Toronto, Canada', 'São Paulo, Brazil',
];

// Trimmed to a practical set — avoids shipping 500+ rarely-used emojis
const EMOJIS = [
  '😀', '😂', '😍', '😎', '🤔', '😭', '😡', '🥳', '🤩', '😴', '👏', '🔥', '❤️', '💯', '🙏',
  '💪', '🎉', '🌟', '🎵', '📸', '🍕', '✈️', '🏆', '🎮', '🎬', '💼', '🎓', '🏠', '🚗', '🌈',
  '🌊', '🌅', '🌺', '🐶', '🐱', '🦋', '🌻', '☕', '🍦', '🍔', '🍣', '🎂', '🍷', '🍹', '🎁',
  '👍', '👎', '👌', '🤞', '✌️', '🤟', '👋', '🙌', '🤝', '💡', '🎯', '🚀', '💎', '🌍', '⭐',
  '😊', '😇', '🥰', '😘', '🤗', '😏', '😒', '😔', '😢', '😤', '🤣', '😆', '😅', '🙃', '😬',
];

const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE_MB = 10; // matches MAX_IMAGE_SIZE in storage.ts
const MAX_VIDEO_SIZE_MB = 50;  // matches MAX_VIDEO_SIZE in storage.ts
const MAX_CHARS = 2200;

function getInitialState() {
  return {
    content: '',
    images: [] as { id: string; dataUrl: string; file: File; type: 'image' | 'video' }[],
    privacy: 'public' as 'public' | 'friends' | 'followers' | 'private' | 'close_friends',
    showPrivacy: false,
    showPoll: false,
    pollQuestion: '',
    pollOptions: ['', ''],
    location: '',
    showLocation: false,
    showEmoji: false,
    contentWarning: false,
    scheduledDate: '',
    showSchedule: false,
    hashtags: [] as string[],
    isPosting: false,
    showSuccess: false,
    uploadProgress: 0,
  };
}

export default function CreatePostModal({ isOpen, onClose, onPost }: CreatePostModalProps) {
  const [state, setState] = useState(getInitialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuthStore();
  const { createPost, refreshPosts } = useEnhancedTimelineStore();

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setState(getInitialState());
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isOpen]);

  const set = useCallback(<K extends keyof ReturnType<typeof getInitialState>>(
    key: K,
    value: ReturnType<typeof getInitialState>[K]
  ) => setState((prev) => ({ ...prev, [key]: value })), []);

  const extractHashtags = useCallback((text: string) => {
    const tags = text.match(/#[\w\u0080-\uFFFF]+/g) || [];
    return [...new Set(tags.map((t) => t.slice(1).toLowerCase()))];
  }, []);

  const handleContentChange = useCallback((val: string) => {
    if (val.length > MAX_CHARS) return; // hard guard
    setState((prev) => ({
      ...prev,
      content: val,
      hashtags: extractHashtags(val),
    }));
  }, [extractHashtags]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = MAX_IMAGES - state.images.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }

    const toProcess = files.slice(0, remaining);
    let rejected = 0;

    toProcess.forEach((file) => {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        rejected++;
        return;
      }
      const limitMB = file.type.startsWith('image/') ? MAX_IMAGE_SIZE_MB : MAX_VIDEO_SIZE_MB;
      if (file.size > limitMB * 1024 * 1024) {
        rejected++;
        toast.error(`"${file.name}" exceeds ${limitMB}MB limit`);
        return;
      }
      // Use objectURL for video to avoid 67MB base64 in memory; dataURL for images
      if (file.type.startsWith('video/')) {
        const objectUrl = URL.createObjectURL(file);
        setState((prev) => ({
          ...prev,
          images: [...prev.images, {
            id: uuidv4(),
            dataUrl: objectUrl,
            file,
            type: 'video',
          }],
        }));
      } else {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            setState((prev) => ({
              ...prev,
              images: [...prev.images, {
                id: uuidv4(),
                dataUrl: ev.target!.result as string,
                file,
                type: 'image',
              }],
            }));
          }
        };
        reader.readAsDataURL(file);
      }
    });

    if (rejected > 0 && files.length - rejected > 0) {
      toast.warning(`${rejected} file(s) skipped due to size or type`);
    }

    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const removeImage = (id: string) => {
    setState((prev) => {
      const removed = prev.images.find((img) => img.id === id);
      if (removed?.dataUrl.startsWith('blob:')) URL.revokeObjectURL(removed.dataUrl);
      return { ...prev, images: prev.images.filter((img) => img.id !== id) };
    });
  };

  const addPollOption = () => {
    if (state.pollOptions.length < 4) {
      setState((prev) => ({ ...prev, pollOptions: [...prev.pollOptions, ''] }));
    }
  };

  const removePollOption = (idx: number) => {
    if (state.pollOptions.length > 2) {
      setState((prev) => ({ ...prev, pollOptions: prev.pollOptions.filter((_, i) => i !== idx) }));
    }
  };

  const updatePollOption = (idx: number, val: string) => {
    setState((prev) => ({
      ...prev,
      pollOptions: prev.pollOptions.map((o, i) => (i === idx ? val : o)),
    }));
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      handleContentChange(state.content + emoji);
      return;
    }
    const start = textarea.selectionStart ?? state.content.length;
    const end = textarea.selectionEnd ?? state.content.length;
    const newContent = state.content.slice(0, start) + emoji + state.content.slice(end);
    handleContentChange(newContent);
    set('showEmoji', false);
    // Restore focus and cursor position after state update
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + emoji.length;
      textarea.setSelectionRange(pos, pos);
    });
  };

  const handlePost = async () => {
    if (!user?.id) {
      toast.error('You must be logged in to post');
      return;
    }
    if (!state.content.trim() && state.images.length === 0 && !state.showPoll) {
      toast.error('Please add some content');
      return;
    }
    if (state.content.length > MAX_CHARS) {
      toast.error(`Content too long (max ${MAX_CHARS} chars)`);
      return;
    }
    if (state.showPoll) {
      if (!state.pollQuestion.trim()) {
        toast.error('Please enter a poll question');
        return;
      }
      if (state.pollOptions.some((o) => !o.trim())) {
        toast.error('Please fill in all poll options');
        return;
      }
    }
    if (state.scheduledDate) {
      if (new Date(state.scheduledDate) <= new Date()) {
        toast.error('Scheduled time must be in the future');
        return;
      }
    }

    set('isPosting', true);
    setState((prev) => ({ ...prev, uploadProgress: 0 }));
    try {
      const pollData = state.showPoll
        ? {
          question: state.pollQuestion,
          options: state.pollOptions.map((text) => ({ text, votes: [] })),
          totalVotes: 0,
        }
        : undefined;

      // Upload sequentially so progress is meaningful
      const total = state.images.length;
      const mediaUrls: string[] = [];
      for (let i = 0; i < total; i++) {
        const img = state.images[i];
        const url = await uploadMediaBlob({
          kind: img.type === 'video' ? 'reels' : 'posts',
          file: img.file,
          mimeType: img.file.type,
          onProgress: (pct) => {
            const overall = Math.round(((i + pct / 100) / total) * 100);
            setState((prev) => ({ ...prev, uploadProgress: overall }));
          },
        });
        if (url) mediaUrls.push(url);
      }
      setState((prev) => ({ ...prev, uploadProgress: 100 }));

      // Determine the video URL if any selected media is a video.
      const videoIdx = state.images.findIndex((img) => img.type === 'video');
      const videoUrl = videoIdx >= 0 ? mediaUrls[videoIdx] : undefined;
      // For video posts, keep only the video URL in the images array (rendered as <video>),
      // otherwise pass all image URLs through.
      const imageUrls = videoUrl ? [] : mediaUrls;

      await createPost(
        user.id,
        state.content,
        imageUrls,
        state.privacy,
        pollData,
        state.location,
        state.scheduledDate || undefined,
        state.contentWarning,
        state.hashtags,
        videoUrl,
      );

      // Refresh the feed so the newly created post appears at the top in
      // real-time, complementing the optimistic insert done in the store.
      void refreshPosts();

      toast.success(state.scheduledDate ? 'Post scheduled!' : 'Post created!');
      // Show a brief success animation before closing the modal.
      if (!state.scheduledDate) {
        set('showSuccess', true);
        setTimeout(() => {
          onPost?.();
          onClose();
        }, 700);
      } else {
        onPost?.();
        onClose();
      }
    } catch {
      toast.error('Failed to create post');
      setState((prev) => ({ ...prev, isPosting: false, uploadProgress: 0 }));
    }
  };

  const privacyOption = PRIVACY_OPTIONS.find((p) => p.value === state.privacy);
  const PrivacyIcon = privacyOption?.icon || Globe;
  const charCount = state.content.length;
  const isOverLimit = charCount > MAX_CHARS;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
            <h2 className="font-bold text-lg text-gray-900">Create Post</h2>
            <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Close">
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* User info */}
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shrink-0">
              {user?.avatar ? (
                <img src={user.avatar} alt="Your avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gray-500 text-sm font-bold">{(user?.name || 'U')[0]}</span>
              )}
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{user?.name || 'User'}</p>
              <button
                type="button"
                onClick={() => set('showPrivacy', !state.showPrivacy)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full"
                aria-expanded={state.showPrivacy}
              >
                <PrivacyIcon size={12} />
                {privacyOption?.label || 'Public'}
                <ChevronDown size={10} />
              </button>
            </div>
          </div>

          {/* Privacy dropdown */}
          <AnimatePresence>
            {state.showPrivacy && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden px-4"
              >
                <div className="bg-gray-50 rounded-xl p-2 space-y-1">
                  {PRIVACY_OPTIONS.map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setState((prev) => ({ ...prev, privacy: opt.value, showPrivacy: false }))}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${state.privacy === opt.value ? 'bg-white shadow-sm' : 'hover:bg-white/50'}`}
                    >
                      <opt.icon size={16} className={state.privacy === opt.value ? 'text-[#00C300]' : 'text-gray-400'} />
                      <div>
                        <p className={`text-sm font-medium ${state.privacy === opt.value ? 'text-gray-900' : 'text-gray-600'}`}>{opt.label}</p>
                        <p className="text-xs text-gray-400">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Textarea */}
          <div className="px-4 pb-2">
            <textarea
              ref={textareaRef}
              value={state.content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full min-h-[120px] resize-none text-gray-900 placeholder-gray-400 text-base outline-none"
              aria-label="Post content"
            />
          </div>

          {/* Image previews */}
          {state.images.length > 0 && (
            <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
              {state.images.map((img) => (
                <div key={img.id} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                  {img.type === 'video' ? (
                    <video src={img.dataUrl} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img src={img.dataUrl} alt="Attachment preview" className="w-full h-full object-cover" />
                  )}
                  <span className="absolute bottom-0.5 left-0.5 text-[8px] font-bold text-white bg-black/60 rounded px-1 py-0.5 uppercase">
                    {img.type === 'video' ? 'Video' : 'Photo'}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center"
                    aria-label="Remove image"
                  >
                    <X size={10} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Poll */}
          <AnimatePresence>
            {state.showPoll && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden px-4 pb-3"
              >
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase">Poll</p>
                  <input
                    type="text"
                    value={state.pollQuestion}
                    onChange={(e) => set('pollQuestion', e.target.value)}
                    placeholder="Ask a question..."
                    maxLength={200}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm outline-none focus:border-[#00C300]"
                  />
                  {state.pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => updatePollOption(idx, e.target.value)}
                        placeholder={`Option ${idx + 1}`}
                        maxLength={100}
                        className="flex-1 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm outline-none focus:border-[#00C300]"
                      />
                      {state.pollOptions.length > 2 && (
                        <button type="button" onClick={() => removePollOption(idx)} className="p-1 hover:bg-gray-200 rounded" aria-label="Remove option">
                          <Minus size={14} className="text-gray-400" />
                        </button>
                      )}
                    </div>
                  ))}
                  {state.pollOptions.length < 4 && (
                    <button type="button" onClick={addPollOption} className="flex items-center gap-1 text-xs text-[#00C300] font-medium">
                      <Plus size={12} /> Add option
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Location */}
          <AnimatePresence>
            {state.showLocation && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden px-4 pb-3"
              >
                <div className="bg-gray-50 rounded-xl p-2 flex flex-wrap gap-1">
                  {state.location && (
                    <button
                      type="button"
                      onClick={() => setState((prev) => ({ ...prev, location: '', showLocation: false }))}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-600"
                    >
                      Clear location
                    </button>
                  )}
                  {PRESET_LOCATIONS.map((loc) => (
                    <button
                      type="button"
                      key={loc}
                      onClick={() => setState((prev) => ({ ...prev, location: loc, showLocation: false }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${state.location === loc ? 'bg-[#00C300] text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Schedule */}
          <AnimatePresence>
            {state.showSchedule && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden px-4 pb-3"
              >
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">Schedule Post</p>
                  <input
                    type="datetime-local"
                    value={state.scheduledDate}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    onChange={(e) => set('scheduledDate', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm outline-none focus:border-[#00C300]"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Emoji picker */}
          <AnimatePresence>
            {state.showEmoji && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden px-4 pb-3"
              >
                <div className="bg-gray-50 rounded-xl p-2 max-h-36 overflow-y-auto">
                  <div className="flex flex-wrap gap-1">
                    {EMOJIS.map((emoji, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => insertEmoji(emoji)}
                        className="text-xl hover:bg-gray-200 rounded p-1 transition-colors leading-none"
                        aria-label={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hashtags display */}
          {state.hashtags.length > 0 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1">
              {state.hashtags.slice(0, 5).map((tag) => (
                <span key={tag} className="text-xs text-[#00C300] font-medium bg-[#00C300]/10 px-2 py-0.5 rounded-full">#{tag}</span>
              ))}
            </div>
          )}

          {/* Status bar: content warning + location + schedule */}
          <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => set('contentWarning', !state.contentWarning)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${state.contentWarning ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}
            >
              <EyeOff size={12} />
              {state.contentWarning ? 'Sensitive Content' : 'Content Warning'}
            </button>
            {state.location && (
              <button
                type="button"
                onClick={() => set('location', '')}
                className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors"
                title="Remove location"
              >
                <MapPin size={10} /> {state.location} <X size={8} />
              </button>
            )}
            {state.scheduledDate && (
              <button
                type="button"
                onClick={() => set('scheduledDate', '')}
                className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors"
                title="Remove schedule"
              >
                <Clock size={10} /> {new Date(state.scheduledDate).toLocaleString()} <X size={8} />
              </button>
            )}
          </div>

          {/* Character count */}
          <div className="px-4 pb-2 flex justify-end">
            <span className={`text-xs ${isOverLimit ? 'text-red-500 font-medium' : charCount > MAX_CHARS * 0.8 ? 'text-amber-500' : 'text-gray-400'}`}>
              {charCount}/{MAX_CHARS}
            </span>
          </div>

          {/* Toolbar */}
          <div className="px-4 pb-3 flex items-center gap-1 flex-wrap border-t border-gray-100 pt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title={`Photo/Video (${state.images.length}/${MAX_IMAGES})`}
              disabled={state.images.length >= MAX_IMAGES}
            >
              <Image size={20} className={state.images.length >= MAX_IMAGES ? 'text-gray-300' : 'text-[#00C300]'} />
            </button>
            <button
              type="button"
              onClick={() => set('showPoll', !state.showPoll)}
              className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${state.showPoll ? 'bg-[#00C300]/10' : ''}`}
              title="Poll"
            >
              <BarChart2 size={20} className={state.showPoll ? 'text-[#00C300]' : 'text-gray-500'} />
            </button>
            <button
              type="button"
              onClick={() => set('showLocation', !state.showLocation)}
              className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${state.location ? 'bg-[#00C300]/10' : ''}`}
              title="Location"
            >
              <MapPin size={20} className={state.location ? 'text-[#00C300]' : 'text-gray-500'} />
            </button>
            <button
              type="button"
              onClick={() => set('showEmoji', !state.showEmoji)}
              className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${state.showEmoji ? 'bg-[#00C300]/10' : ''}`}
              title="Emoji"
            >
              <Smile size={20} className={state.showEmoji ? 'text-[#00C300]' : 'text-gray-500'} />
            </button>
            <button
              type="button"
              onClick={() => set('showSchedule', !state.showSchedule)}
              className={`p-2 hover:bg-gray-100 rounded-lg transition-colors ${state.scheduledDate ? 'bg-[#00C300]/10' : ''}`}
              title="Schedule"
            >
              <Calendar size={20} className={state.scheduledDate ? 'text-[#00C300]' : 'text-gray-500'} />
            </button>
          </div>

          {/* Upload progress bar */}
          {state.isPosting && state.images.length > 0 && (
            <div className="px-4 pb-2">
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#00C300] rounded-full transition-all duration-300"
                  style={{ width: `${state.uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-right">{state.uploadProgress}%</p>
            </div>
          )}

          {/* Post button */}
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={handlePost}
              disabled={state.isPosting || isOverLimit}
              className="w-full py-3 bg-[#00C300] text-white rounded-xl font-bold text-sm hover:bg-[#00b000] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {state.isPosting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {state.scheduledDate ? 'Scheduling...' : state.images.length > 0 ? `Uploading ${state.uploadProgress}%` : 'Posting...'}
                </>
              ) : (
                <>
                  <Send size={16} />
                  {state.scheduledDate ? 'Schedule Post' : 'Post'}
                </>
              )}
            </button>
          </div>

          {/* Success overlay */}
          <AnimatePresence>
            {state.showSuccess && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 bg-white/95 flex flex-col items-center justify-center gap-3 rounded-2xl"
              >
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  className="w-16 h-16 rounded-full bg-[#00C300] flex items-center justify-center shadow-lg shadow-green-500/30"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-white">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.div>
                <p className="text-gray-900 font-semibold">Post published!</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
