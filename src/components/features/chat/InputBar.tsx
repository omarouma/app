import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, X, Mic, Send, Clock, Smile, Camera, Image as ImageIcon, MapPin, File, User,
  Phone, BarChart3, Sticker, Navigation, Play, Pause, Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { attachmentOptions } from '@/lib/chatConstants';
import { EmojiPicker } from './EmojiPicker';
import { StickerPicker } from './StickerPicker';
import { RecordingWaveform } from './RecordingWaveform';
import type { Message } from '@/types';

interface InputBarProps {
  input: string;
  replyingTo: Message | null;
  showAttachments: boolean;
  showEmojiPicker: boolean;
  isRecording: boolean;
  duration: number;
  /** Object URL of a recorded-but-unsent voice clip (preview bar). */
  voicePreviewUrl?: string | null;
  /** Duration (seconds) of the clip in preview. */
  voicePreviewDuration?: number;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onTyping: () => void;
  onStopTyping: () => void;
  onToggleAttachments: () => void;
  onToggleEmojiPicker: () => void;
  onEmojiSelect: (emoji: string) => void;
  onCancelReply: () => void;
  onStartRecording: () => void;
  /** Fired when the user releases the mic (hold-to-record). */
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onVoiceSend: () => void;
  /** Discards the clip currently in preview. */
  onVoiceDiscard: () => void;
  onSchedule: () => void;
  onPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLocationShare: () => void;
  onLiveLocation: () => void;
  onContactShare: () => void;
  onCameraCapture: () => void;
  onPollOpen: () => void;
  onStickerSelect?: (sticker: { type: 'emoji' | 'gif'; content: string }) => void;
}

const ICON_MAP: Record<string, LucideIcon> = {
  image: ImageIcon,
  camera: Camera,
  phone: Phone,
  user: User,
  map: MapPin,
  navigation: Navigation,
  file: File,
  poll: BarChart3,
};

/** Distance (px) the finger must slide left over the mic to arm cancel. */
const SLIDE_CANCEL_THRESHOLD = 70;

export function InputBar({
  input, replyingTo, showAttachments, showEmojiPicker, isRecording, duration,
  voicePreviewUrl, voicePreviewDuration = 0,
  onInputChange, onSend, onTyping, onStopTyping,
  onToggleAttachments, onToggleEmojiPicker, onEmojiSelect, onCancelReply,
  onStartRecording, onStopRecording, onCancelRecording, onVoiceSend, onVoiceDiscard, onSchedule,
  onPhotoUpload, onVideoUpload, onFileUpload,
  onLocationShare, onLiveLocation, onContactShare, onCameraCapture, onPollOpen, onStickerSelect,
}: InputBarProps) {
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const micStartXRef = useRef(0);

  const clearInputValue = (element: HTMLInputElement | null) => {
    if (element) element.value = '';
  };
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize the multi-line input to fit content (capped at ~5 rows).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  // Reset preview playback state whenever the clip changes.
  useEffect(() => {
    setPreviewPlaying(false);
  }, [voicePreviewUrl]);

  const handleAttachmentAction = useCallback((label: string) => {
    switch (label) {
      case 'Photos': photoInputRef.current?.click(); break;
      case 'Camera': onCameraCapture(); break;
      case 'Video': videoInputRef.current?.click(); break;
      case 'Audio': onStartRecording(); break;
      case 'Contact': onContactShare(); break;
      case 'Location': onLocationShare(); break;
      case 'Live Location': onLiveLocation(); break;
      case 'File': fileInputRef.current?.click(); break;
      case 'Poll': onPollOpen(); break;
    }
  }, [onCameraCapture, onStartRecording, onContactShare, onLocationShare, onLiveLocation, onPollOpen]);

  // ── Hold-to-record mic handlers ──
  const handleMicDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    micStartXRef.current = e.clientX;
    setCancelArmed(false);
    onStartRecording();
  }, [onStartRecording]);

  const handleMicMove = useCallback((e: React.PointerEvent) => {
    if (!isRecording) return;
    const dx = e.clientX - micStartXRef.current;
    setCancelArmed(dx < -SLIDE_CANCEL_THRESHOLD);
  }, [isRecording]);

  const handleMicUp = useCallback(() => {
    if (!isRecording) return;
    if (cancelArmed) {
      onCancelRecording();
    } else {
      onStopRecording();
    }
    setCancelArmed(false);
  }, [isRecording, cancelArmed, onCancelRecording, onStopRecording]);

  const togglePreviewPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setPreviewPlaying(true)).catch(() => setPreviewPlaying(false));
    } else {
      audio.pause();
      setPreviewPlaying(false);
    }
  }, []);

  const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <>
      {/* Reply preview */}
      <AnimatePresence>
        {replyingTo && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="shrink-0 bg-background border-t border-border px-4 py-2 flex items-center gap-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#00C300] font-medium">Replying to</p>
              <p className="text-muted-foreground text-xs truncate">{replyingTo.content}</p>
            </div>
            <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attachments bottom sheet */}
      <AnimatePresence>
        {showAttachments && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={onToggleAttachments}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => { if (info.offset.y > 120) onToggleAttachments(); }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl shadow-2xl border-t border-border"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
            >
              <div className="w-10 h-1 bg-gray-200 dark:bg-white/20 rounded-full mx-auto mt-3 mb-1" />
              <div className="grid grid-cols-4 gap-y-5 px-5 pt-4 pb-6">
                {attachmentOptions.map((item) => {
                  const IconComponent = ICON_MAP[item.iconKey] ?? null;
                  return (
                    <div key={item.label} className="flex flex-col items-center gap-2 active:opacity-70">
                      <button
                        type="button"
                        onClick={() => handleAttachmentAction(item.label)}
                        className={`w-12 h-12 ${item.color} rounded-full flex items-center justify-center ${item.iconColor} shadow-sm cursor-pointer`}
                        aria-label={item.label}
                      >
                        {IconComponent ? <IconComponent size={22} strokeWidth={1.8} /> : null}
                      </button>
                      <span className="text-[11px] text-foreground text-center leading-tight">{item.label}</span>
                    </div>
                  );
                })}
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onPhotoUpload(e); clearInputValue(e.currentTarget); }} aria-label="Upload photo" />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPhotoUpload(e); clearInputValue(e.currentTarget); }} aria-label="Take photo" />
              <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => { onVideoUpload(e); clearInputValue(e.currentTarget); }} aria-label="Upload video" />
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { onFileUpload(e); clearInputValue(e.currentTarget); }} aria-label="Upload file" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Voice preview bar */}
      <AnimatePresence>
        {voicePreviewUrl && !isRecording && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 bg-background border-t border-border px-3 py-2 overflow-hidden"
          >
            <div className="flex items-center gap-2 bg-muted rounded-3xl px-3 py-2">
              <button
                type="button"
                onClick={togglePreviewPlay}
                aria-label={previewPlaying ? 'Pause preview' : 'Play preview'}
                className="w-9 h-9 rounded-full bg-[#00C300] text-white flex items-center justify-center shrink-0 active:scale-95 transition-transform"
              >
                {previewPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <div className="flex-1 min-w-0">
                <RecordingWaveform duration={voicePreviewDuration} barColor="#00C300" />
              </div>
              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{fmtDuration(voicePreviewDuration)}</span>
              <button
                type="button"
                onClick={onVoiceDiscard}
                aria-label="Discard voice message"
                className="p-2 text-muted-foreground hover:text-[#FF3B30] shrink-0"
              >
                <Trash2 size={18} />
              </button>
              <button
                type="button"
                onClick={onVoiceSend}
                aria-label="Send voice message"
                className="w-9 h-9 rounded-full bg-[#00C300] text-white flex items-center justify-center shrink-0 active:scale-95 transition-transform"
              >
                <Send size={16} />
              </button>
              <audio ref={audioRef} src={voicePreviewUrl} onEnded={() => setPreviewPlaying(false)} className="hidden" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="shrink-0 bg-background border-t border-border px-3 py-2.5 flex items-end gap-2 z-20">
        <button
          type="button"
          onClick={onToggleAttachments}
          className={`p-2 mb-0.5 rounded-full transition-all tap-scale ${showAttachments ? 'bg-[#00C300] text-white rotate-45' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          aria-label="Toggle attachments"
        >
          <Plus size={22} strokeWidth={2} />
        </button>

        {isRecording ? (
          <div className={`flex-1 rounded-3xl border flex items-center px-4 min-h-[44px] gap-3 shadow-sm transition-colors ${cancelArmed ? 'bg-[#FF3B30]/10 border-[#FF3B30]' : 'bg-background border-[#FF3B30]'}`}>
            <div className="w-3 h-3 rounded-full bg-[#FF3B30] animate-pulse shrink-0" />
            <span className="text-[#FF3B30] text-sm font-medium shrink-0 tabular-nums">{fmtDuration(duration)}</span>
            <RecordingWaveform duration={duration} barColor="#00C300" />
            <span className="text-[11px] text-muted-foreground shrink-0">
              {cancelArmed ? 'Release to cancel' : 'Slide to cancel'}
            </span>
          </div>
        ) : (
          <div className="flex-1 bg-muted rounded-3xl flex items-center px-3 min-h-[44px] max-h-[128px]">
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              onChange={(e) => {
                onInputChange(e.target.value);
                if (e.target.value.trim().length > 0) onTyping();
                else onStopTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
              }}
              onBlur={onStopTyping}
              onClick={() => { if (showAttachments) onToggleAttachments(); }}
              aria-label="Type a message"
              placeholder="Message"
              className="flex-1 py-2.5 text-[15px] focus:outline-none bg-transparent text-foreground placeholder:text-muted-foreground resize-none overflow-y-auto"
            />
            <button type="button" className={`p-1.5 transition-colors ${showStickerPicker ? 'text-[#00C300]' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => { setShowStickerPicker(p => !p); if (showEmojiPicker) onToggleEmojiPicker(); }} aria-label="Open sticker picker">
              <Sticker size={20} strokeWidth={1.5} />
            </button>
            <button type="button" className={`p-1.5 transition-colors ${showEmojiPicker ? 'text-[#00C300]' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => { onToggleEmojiPicker(); setShowStickerPicker(false); }} aria-label="Open emoji picker">
              <Smile size={20} strokeWidth={1.5} />
            </button>
            {!input.trim() && (
              <button
                type="button"
                className={`p-1.5 transition-colors touch-none select-none ${cancelArmed ? 'text-[#FF3B30]' : 'text-muted-foreground hover:text-foreground'}`}
                onPointerDown={handleMicDown}
                onPointerMove={handleMicMove}
                onPointerUp={handleMicUp}
                onPointerCancel={handleMicUp}
                onPointerLeave={() => { if (isRecording) handleMicUp(); }}
                aria-label="Hold to record voice message"
              >
                <Mic size={20} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}

        {isRecording ? (
          <button type="button" onClick={onVoiceSend} className="mb-0.5 p-2.5 text-white bg-[#FF3B30] rounded-full active:scale-95 transition-transform shadow-md" aria-label="Send voice message">
            <Send size={18} />
          </button>
        ) : input.trim() ? (
          <div className="flex items-center gap-1">
            <button type="button" onClick={onSchedule} className="mb-0.5 p-2 text-muted-foreground hover:text-foreground rounded-full transition-colors" title="Schedule message">
              <Clock size={20} strokeWidth={1.5} />
            </button>
            <button type="button" onClick={onSend} className="mb-0.5 p-2.5 text-white bg-[#00C300] rounded-full active:scale-95 transition-transform shadow-md" aria-label="Send message">
              <Send size={18} />
            </button>
          </div>
        ) : (
          <button type="button" className="mb-0.5 p-2 text-muted-foreground hover:text-foreground rounded-full transition-colors" onClick={onSchedule} aria-label="Schedule message">
            <Clock size={22} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Emoji Picker */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 z-20 bg-background border-t border-border px-3 py-2 overflow-hidden"
          >
            <EmojiPicker onEmojiSelect={(emoji) => { onEmojiSelect(emoji); onToggleEmojiPicker(); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticker / GIF Picker */}
      <AnimatePresence>
        {showStickerPicker && (
          <StickerPicker
            onSelect={(sticker) => {
              onStickerSelect?.(sticker);
              setShowStickerPicker(false);
            }}
            onClose={() => setShowStickerPicker(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
