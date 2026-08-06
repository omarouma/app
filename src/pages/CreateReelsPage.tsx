import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Upload, Video, X, Music, Hash, Image as ImageIcon,
  Loader, Play, AlertCircle, Sparkles, Pause, Volume2, VolumeX,
  Globe, Users, Lock, Wand2, Scissors, Save
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useReelStore } from '@/store/useReelStore';
import { uploadMediaBlob } from '@/lib/storage';
import { REEL_CATEGORIES } from '@/lib/demoReels';
import { toast } from 'sonner';

const DRAFT_KEY = 'gaga_reel_draft';
// Aligned with storage.ts MAX_VIDEO_SIZE (50MB) so validation matches the actual upload limit.
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DURATION = 600; // 10 minutes

const safeStorage = {
  getItem(key: string) {
    try {
      return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(key, value);
    } catch {
      // ignore storage failures
    }
  },
  removeItem(key: string) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(key);
    } catch {
      // ignore storage failures
    }
  },
};

interface ReelDraft {
  caption: string;
  tags: string[];
  musicTitle: string;
  category: string;
  visibility: 'public' | 'friends' | 'private';
  savedAt: number;
}

function loadDraft(): ReelDraft | null {
  try {
    const raw = safeStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    // Only use drafts from last 24 hours
    if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
      safeStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return draft;
  } catch { return null; }
}

function saveDraft(draft: Omit<ReelDraft, 'savedAt'>) {
  try {
    safeStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch { /* ignore storage full */ }
}

function clearDraft() {
  safeStorage.removeItem(DRAFT_KEY);
}

function revokeObjectUrl(url?: string) {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore revoke failures
    }
  }
}

export default function CreateReelsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { createReel } = useReelStore();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [musicTitle, setMusicTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<string>(REEL_CATEGORIES[0]);
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [hasDraft, setHasDraft] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilter, setActiveFilter] = useState('none');

  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  // Load draft on mount
  useLayoutEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setHasDraft(true);
      setCaption(draft.caption || '');
      setTags(draft.tags || []);
      setMusicTitle(draft.musicTitle || '');
      setCategory(draft.category || REEL_CATEGORIES[0]);
      setVisibility(draft.visibility || 'public');
    }
  }, []);

  // Auto-save draft
  useEffect(() => {
    if (caption || tags.length > 0 || musicTitle) {
      const timeout = setTimeout(() => {
        saveDraft({ caption, tags, musicTitle, category, visibility });
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [caption, tags, musicTitle, category, visibility]);

  // Cleanup blob URLs on unmount and when they change
  useEffect(() => {
    return () => {
      revokeObjectUrl(videoPreviewUrl);
      revokeObjectUrl(thumbnailUrl);
    };
  }, [videoPreviewUrl, thumbnailUrl]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    // Validate file type
    if (!file.type.startsWith('video/')) {
      setError('Please select a video file (MP4, MOV, WEBM)');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError(`Video must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      return;
    }

    if (videoPreviewUrl) revokeObjectUrl(videoPreviewUrl);
    if (thumbnailUrl) revokeObjectUrl(thumbnailUrl);

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreviewUrl(url);
    setThumbnailUrl('');
    setThumbnailBlob(null);
    setIsPlaying(false);
    setCurrentTime(0);

    // Get video duration and validate
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      setDuration(video.duration);
      if (video.duration > MAX_DURATION) {
        setError(`Video is too long (${Math.round(video.duration / 60)}min). Max ${MAX_DURATION / 60}min.`);
      }
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => {
      setError('Could not load video. Please try a different file.');
    };
    video.src = url;
  }, [thumbnailUrl, videoPreviewUrl]);

  const handleThumbnailSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (thumbnailUrl) revokeObjectUrl(thumbnailUrl);
    const url = URL.createObjectURL(file);
    setThumbnailUrl(url);
    setThumbnailBlob(file);
  }, [thumbnailUrl]);

  const generateThumbnail = useCallback(() => {
    if (!videoRef.current || !videoPreviewUrl) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Seek to middle of video for best thumbnail
    const seekTime = video.duration ? video.duration / 2 : 0;
    video.currentTime = seekTime;

    const capture = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          if (thumbnailUrl) revokeObjectUrl(thumbnailUrl);
          const url = URL.createObjectURL(blob);
          setThumbnailUrl(url);
          setThumbnailBlob(blob);
        }
      }, 'image/jpeg', 0.9);
    };

    // Wait for seek to complete
    video.onseeked = () => {
      capture();
      video.onseeked = null;
    };
  }, [thumbnailUrl, videoPreviewUrl]);

  // Auto-generate thumbnail when video is loaded
  useEffect(() => {
    if (videoPreviewUrl && !thumbnailUrl && videoRef.current) {
      const video = videoRef.current;
      const onLoaded = () => {
        if (!thumbnailUrl) {
          generateThumbnail();
        }
      };
      video.addEventListener('loadeddata', onLoaded, { once: true });
      return () => video.removeEventListener('loadeddata', onLoaded);
    }
  }, [videoPreviewUrl, thumbnailUrl, generateThumbnail]);

  const handleAddTag = () => {
    const tag = tagInput.trim().replace(/^#/, '');
    if (!tag) return;
    if (tags.includes(tag)) {
      setTagInput('');
      return;
    }
    if (tags.length >= 10) {
      toast.error('Max 10 tags allowed');
      return;
    }
    setTags([...tags, tag]);
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pos * duration;
  };

  const handlePost = async () => {
    if (!user?.id) {
      toast.error('Please log in to post reels');
      navigate('/auth');
      return;
    }
    if (!videoFile) {
      setError('Please select a video');
      return;
    }
    if (duration > MAX_DURATION) {
      setError(`Video is too long. Max ${MAX_DURATION / 60} minutes.`);
      return;
    }

    setUploading(true);
    setError('');
    uploadAbortRef.current = new AbortController();

try {
      // Upload video with real Cloudinary progress (falls back to Firebase/local).
      setUploadStep('Uploading video...');
      setUploadProgress(5);
      const videoUrl = await uploadMediaBlob({
        kind: 'reels',
        file: videoFile,
        mimeType: videoFile.type,
        userId: user.id,
        onProgress: (pct) => setUploadProgress(Math.max(5, Math.min(70, pct))),
      });

      // Upload thumbnail
      setUploadStep('Uploading thumbnail...');
      let finalThumbnail = '';
      if (thumbnailBlob) {
        finalThumbnail = await uploadMediaBlob({
          kind: 'reels',
          file: thumbnailBlob,
          mimeType: 'image/jpeg',
          userId: user.id,
          onProgress: (pct) => setUploadProgress(Math.max(70, Math.min(90, 70 + pct * 0.2))),
        });
      } else if (thumbnailUrl && thumbnailUrl.startsWith('blob:')) {
        const response = await fetch(thumbnailUrl);
        const blob = await response.blob();
        const thumbFile = new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' });
        finalThumbnail = await uploadMediaBlob({
          kind: 'reels',
          file: thumbFile,
          mimeType: 'image/jpeg',
          userId: user.id,
          onProgress: (pct) => setUploadProgress(Math.max(70, Math.min(90, 70 + pct * 0.2))),
        });
      }
      setUploadProgress(92);

      // Create reel
      setUploadStep('Publishing...');
      await createReel(user.id, {
        videoUrl,
        thumbnailUrl: finalThumbnail || undefined,
        caption: caption.trim(),
        musicTitle: musicTitle.trim() || undefined,
        duration: Math.round(duration),
        tags: tags.length > 0 ? tags : undefined,
        category,
        visibility,
        filter: activeFilter,
      });

      setUploadProgress(100);
      clearDraft();
      toast.success('Reel posted successfully!');
      navigate('/timeline');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to post reel';
      setError(msg);
      toast.error('Failed to post reel. Please try again.');
      setUploading(false);
    }
  };

  const handleClear = () => {
    revokeObjectUrl(videoPreviewUrl);
    revokeObjectUrl(thumbnailUrl);
    setVideoFile(null);
    setVideoPreviewUrl('');
    setThumbnailUrl('');
    setThumbnailBlob(null);
    setCaption('');
    setTags([]);
    setTagInput('');
    setMusicTitle('');
    setDuration(0);
    setCurrentTime(0);
    setError('');
    setHasDraft(false);
    clearDraft();
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
  };

  const handleLoadDraft = () => {
    const draft = loadDraft();
    if (draft) {
      setCaption(draft.caption || '');
      setTags(draft.tags || []);
      setMusicTitle(draft.musicTitle || '');
      setCategory(draft.category || REEL_CATEGORIES[0]);
      setVisibility(draft.visibility || 'public');
      setHasDraft(false);
      toast.success('Draft loaded');
    }
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setHasDraft(false);
    toast.success('Draft discarded');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const filters = [
    { key: 'none', label: 'Original', style: '' },
    { key: 'warm', label: 'Warm', style: 'sepia(0.3) contrast(1.1)' },
    { key: 'cool', label: 'Cool', style: 'hue-rotate(180deg) saturate(0.8)' },
    { key: 'bw', label: 'B&W', style: 'grayscale(1)' },
    { key: 'vivid', label: 'Vivid', style: 'saturate(1.5) contrast(1.2)' },
    { key: 'fade', label: 'Fade', style: 'brightness(1.1) contrast(0.9) saturate(0.8)' },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#0d0d0d] text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0d0d0d]/90 backdrop-blur-sm border-b border-[#1a1a1a] px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-[#1a1a1a] transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-base font-bold">Create Reel</h1>
          <button
            type="button"
            onClick={handlePost}
            disabled={uploading || !videoFile}
            className="px-5 py-2 bg-[#00C300] text-black rounded-full text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#00A300] transition-colors"
          >
            {uploading ? <Loader size={16} className="animate-spin" /> : 'Post'}
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Draft notification */}
        <AnimatePresence>
          {hasDraft && !videoFile && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-[#00C300]/10 border border-[#00C300]/20 rounded-xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Save size={16} className="text-[#00C300]" />
                <span className="text-sm text-[#00C300]">You have an unsaved draft</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleLoadDraft} className="text-xs text-[#00C300] font-medium hover:underline">Load</button>
                <button type="button" onClick={handleDiscardDraft} className="text-xs text-[#FF3B30] font-medium hover:underline">Discard</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm"
            >
              <AlertCircle size={16} />
              {error}
              <button type="button" onClick={() => setError('')} className="ml-auto">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Video Upload Area */}
        {!videoPreviewUrl ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full aspect-[9/16] max-h-[60vh] bg-[#1a1a1a] border-2 border-dashed border-[#2a2a2a] rounded-2xl flex flex-col items-center justify-center gap-4 hover:border-[#00C300]/50 hover:bg-[#1a1a1a]/80 transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-[#2a2a2a] group-hover:bg-[#00C300]/20 flex items-center justify-center transition-colors">
              <Video size={28} className="text-[#8D8D8D] group-hover:text-[#00C300]" />
            </div>
            <div className="text-center">
<p className="text-white font-medium text-sm">Upload a video</p>
              <p className="text-[#8D8D8D] text-xs mt-1">MP4, MOV, WEBM up to 50MB</p>
              <p className="text-[#8D8D8D] text-xs">Up to 10 minutes</p>
            </div>
            <div className="flex items-center gap-2 text-[#00C300] text-xs font-medium">
              <Upload size={14} /> Select from device
            </div>
          </button>
        ) : (
          <div className="relative bg-[#1a1a1a] rounded-2xl overflow-hidden">
            {/* Video Preview */}
            <video
              ref={videoRef}
              src={videoPreviewUrl}
              className="w-full aspect-[9/16] max-h-[60vh] object-cover"
              style={{ filter: filters.find(f => f.key === activeFilter)?.style || '' }}
              playsInline
              muted={isMuted}
              onTimeUpdate={() => {
                if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
              }}
              onEnded={() => setIsPlaying(false)}
              onClick={handlePlayPause}
            />
            {/* Play/Pause Overlay */}
            {!isPlaying && (
              <button
                type="button"
                onClick={handlePlayPause}
                className="absolute inset-0 flex items-center justify-center bg-black/20"
              >
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Play size={28} className="text-white ml-1" />
                </div>
              </button>
            )}
            {/* Duration badge */}
            {duration > 0 && (
              <div className="absolute top-3 left-3 bg-black/60 px-2 py-1 rounded-full text-xs">
                {formatTime(duration)}
              </div>
            )}
            {/* Mute toggle */}
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="absolute top-3 right-12 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            {/* Clear button */}
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
            >
              <X size={16} />
            </button>
            {/* Progress bar */}
            {duration > 0 && (
              <div
                ref={progressRef}
                className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 cursor-pointer"
                onClick={handleSeek}
              >
                <div
                  className="h-full bg-[#00C300]"
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
            )}
          </div>
        )}
        <input
          type="file"
          ref={fileInputRef}
          accept="video/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Video controls when preview is shown */}
        {videoPreviewUrl && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              type="button"
              onClick={handlePlayPause}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#1a1a1a] rounded-full text-xs text-white hover:bg-[#2a2a2a] transition-colors"
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  videoRef.current.play().catch(() => {});
                  setIsPlaying(true);
                }
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#1a1a1a] rounded-full text-xs text-white hover:bg-[#2a2a2a] transition-colors"
            >
              <Scissors size={12} /> Restart
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs transition-colors ${showFilters ? 'bg-[#00C300] text-black' : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'}`}
            >
              <Wand2 size={12} /> Filters
            </button>
          </div>
        )}

        {/* Filters */}
        <AnimatePresence>
          {showFilters && videoPreviewUrl && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2">
                {filters.map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setActiveFilter(f.key)}
                    className={`shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${activeFilter === f.key ? 'bg-[#00C300] text-black' : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'}`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#333] overflow-hidden">
                      {videoPreviewUrl && (
                        <video
                          src={videoPreviewUrl}
                          className="w-full h-full object-cover"
                          style={{ filter: f.style }}
                          muted
                        />
                      )}
                    </div>
                    <span className="text-[10px] font-medium">{f.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Thumbnail */}
        {videoPreviewUrl && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#8D8D8D]">Cover Image</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={generateThumbnail}
                  className="text-xs text-[#00C300] hover:underline"
                >
                  Auto-generate
                </button>
                <button
                  type="button"
                  onClick={() => thumbnailInputRef.current?.click()}
                  className="text-xs text-[#00C300] hover:underline"
                >
                  Upload custom
                </button>
              </div>
            </div>
            {thumbnailUrl ? (
              <div className="relative w-24 h-36 rounded-xl overflow-hidden">
                <img src={thumbnailUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => { setThumbnailUrl(''); setThumbnailBlob(null); }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => thumbnailInputRef.current?.click()}
                className="w-24 h-36 rounded-xl border-2 border-dashed border-[#2a2a2a] flex items-center justify-center hover:border-[#00C300]/50 transition-colors"
              >
                <ImageIcon size={20} className="text-[#8D8D8D]" />
              </button>
            )}
            <input
              type="file"
              ref={thumbnailInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleThumbnailSelect}
            />
          </div>
        )}

        {/* Caption */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-[#8D8D8D]">Caption <span className="text-[#8D8D8D]/50">(optional)</span></label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Describe your reel..."
            rows={3}
            className="w-full bg-[#1a1a1a] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#8D8D8D] outline-none focus:ring-2 focus:ring-[#00C300]/30 resize-none transition-all"
            maxLength={2000}
          />
          <p className="text-[#8D8D8D] text-xs text-right">{caption.length}/2000</p>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-[#8D8D8D]">Category</label>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {REEL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  category === cat
                    ? 'bg-[#00C300] text-black'
                    : 'bg-[#1a1a1a] text-[#8D8D8D] hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Visibility */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-[#8D8D8D]">Who can see this?</label>
          <div className="flex gap-2">
            {[
              { key: 'public' as const, label: 'Public', icon: Globe, desc: 'Anyone can see' },
              { key: 'friends' as const, label: 'Friends', icon: Users, desc: 'Friends only' },
              { key: 'private' as const, label: 'Private', icon: Lock, desc: 'Only you' },
            ].map(opt => {
              const Icon = opt.icon;
              const isActive = visibility === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setVisibility(opt.key)}
                  className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl transition-colors ${
                    isActive
                      ? 'bg-[#00C300]/10 text-[#00C300] border border-[#00C300]/30'
                      : 'bg-[#1a1a1a] text-[#8D8D8D] border border-transparent'
                  }`}
                >
                  <Icon size={16} />
                  <span className="text-xs font-medium">{opt.label}</span>
                  <span className="text-[10px] opacity-60">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-[#8D8D8D]">Tags</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                placeholder="Add tags (press Enter)"
                className="w-full bg-[#1a1a1a] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-[#8D8D8D] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
              />
            </div>
            <button
              type="button"
              onClick={handleAddTag}
              className="px-4 py-3 bg-[#2a2a2a] rounded-xl text-[#00C300] text-sm font-medium hover:bg-[#333] transition-colors"
            >
              Add
            </button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#00C300]/10 text-[#00C300] rounded-full text-xs font-medium"
                >
                  #{tag}
                  <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-white">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Music */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-[#8D8D8D]">Music / Sound</label>
          <div className="relative">
            <Music size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D8D8D]" />
            <input
              type="text"
              value={musicTitle}
              onChange={(e) => setMusicTitle(e.target.value)}
              placeholder="Add a music title or sound name..."
              className="w-full bg-[#1a1a1a] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-[#8D8D8D] outline-none focus:ring-2 focus:ring-[#00C300]/30 transition-all"
            />
          </div>
        </div>

        {/* Upload Progress */}
        <AnimatePresence>
          {uploading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-[#1a1a1a] rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-[#00C300]" />
                  <span className="text-sm font-medium">{uploadStep}</span>
                </div>
                <span className="text-xs text-[#8D8D8D]">{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-[#00C300] rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tips */}
        <div className="bg-[#1a1a1a] rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-[#8D8D8D]">Tips for great reels:</p>
          <ul className="text-xs text-[#8D8D8D] space-y-1 list-disc list-inside">
            <li>Keep it engaging in the first 3 seconds</li>
            <li>Use trending sounds to boost discoverability</li>
            <li>Add captions for accessibility</li>
            <li>Use relevant tags to reach more people</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
