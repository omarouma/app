import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Mic, Send, Clock, Smile, Camera, Image as ImageIcon, MapPin, File, User, Phone, BarChart3 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { attachmentOptions } from '@/lib/chatConstants';
import { EmojiPicker } from './EmojiPicker';
import type { Message } from '@/types';

interface InputBarProps {
  input: string;
  replyingTo: Message | null;
  showAttachments: boolean;
  showEmojiPicker: boolean;
  isRecording: boolean;
  duration: number;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onTyping: () => void;
  onStopTyping: () => void;
  onToggleAttachments: () => void;
  onToggleEmojiPicker: () => void;
  onEmojiSelect: (emoji: string) => void;
  onCancelReply: () => void;
  onStartRecording: () => void;
  onCancelRecording: () => void;
  onVoiceSend: () => void;
  onSchedule: () => void;
  onPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLocationShare: () => void;
  onContactShare: () => void;
  onPollOpen: () => void;
}

export function InputBar({
  input, replyingTo, showAttachments, showEmojiPicker, isRecording, duration,
  onInputChange, onSend, onTyping, onStopTyping,
  onToggleAttachments, onToggleEmojiPicker, onEmojiSelect, onCancelReply,
  onStartRecording, onCancelRecording, onVoiceSend, onSchedule,
  onPhotoUpload, onVideoUpload, onFileUpload,
  onLocationShare, onContactShare, onPollOpen,
}: InputBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {/* Reply preview */}
      <AnimatePresence>
        {replyingTo && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="shrink-0 bg-white border-t border-[#EBEBEB] px-4 py-2 flex items-center gap-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#00C300] font-medium">Replying to</p>
              <p className="text-[#8D8D8D] text-xs truncate">{replyingTo.content}</p>
            </div>
            <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="text-[#8D8D8D] hover:text-[#111111]">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attachments Panel */}
      <AnimatePresence>
        {showAttachments && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 220 }}
            exit={{ height: 0 }}
            className="shrink-0 bg-[#F5F5F5] border-t border-gray-200 overflow-hidden z-10"
          >
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-y-5 px-6 pt-5 pb-8">
              {attachmentOptions.map((item, i) => {
                const IconComponent: LucideIcon | null = {
                  image: ImageIcon, camera: Camera, phone: Phone, user: User,
                  map: MapPin, file: File, poll: BarChart3,
                }[item.iconKey] as LucideIcon | null;
                return (
                  <div key={i} className="flex flex-col items-center gap-2 active:opacity-70">
                    <button
                      type="button"
                      onClick={() => {
                        if (item.label === 'Photos') photoInputRef.current?.click();
                        else if (item.label === 'Camera') cameraInputRef.current?.click();
                        else if (item.label === 'Location') { onLocationShare(); }
                        else if (item.label === 'File') fileInputRef.current?.click();
                        else if (item.label === 'Audio') { onStartRecording(); }
                        else if (item.label === 'Contact') onContactShare();
                        else if (item.label === 'Poll') onPollOpen();
                      }}
                      className={`w-14 h-14 ${item.color} rounded-full flex items-center justify-center text-white shadow-sm cursor-pointer`}
                    >
                      {IconComponent ? <IconComponent size={28} strokeWidth={1.5} /> : null}
                    </button>
                    <span className="text-[11px] text-[#111111]">{item.label}</span>
                  </div>
                );
              })}
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onPhotoUpload(e); }} aria-label="Upload photo" />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPhotoUpload(e); }} aria-label="Take photo" />
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { onVideoUpload(e); }} aria-label="Upload video" />
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { onFileUpload(e); }} aria-label="Upload file" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="shrink-0 bg-[#F5F5F5] px-3 py-2.5 flex items-end gap-3 z-20">
        <button
          type="button"
          onClick={onToggleAttachments}
          className={`p-1.5 mb-0.5 rounded-full transition-colors ${showAttachments ? 'bg-gray-300 text-gray-700' : 'text-gray-500 hover:bg-gray-200'}`}
          aria-label="Toggle attachments"
        >
          <Plus size={24} strokeWidth={1.5} />
        </button>

        {isRecording ? (
          <div className="flex-1 bg-white rounded-2xl border border-[#FF3B30] flex items-center px-4 min-h-[40px] gap-3">
            <div className="w-3 h-3 rounded-full bg-[#FF3B30] animate-pulse" />
            <span className="text-[#FF3B30] text-sm font-medium">{Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}</span>
            <span className="text-[#8D8D8D] text-xs">Recording...</span>
            <button type="button" onClick={onCancelRecording} aria-label="Cancel recording" className="ml-auto text-[#8D8D8D] hover:text-[#111111]">
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-2xl border border-gray-200 flex items-center px-3 min-h-[40px]">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                onInputChange(e.target.value);
                if (e.target.value.trim().length > 0) onTyping();
                else onStopTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
              }}
              onClick={() => { if (showAttachments) onToggleAttachments(); }}
              aria-label="Type a message"
              placeholder="Aa"
              className="flex-1 py-2 text-[15px] focus:outline-none bg-transparent text-[#111111] placeholder:text-[#8D8D8D]"
            />
            <button type="button" className={`p-1 transition-colors mx-1 ${showEmojiPicker ? 'text-[#00C300]' : 'text-gray-400 hover:text-gray-600'}`} onClick={onToggleEmojiPicker} aria-label="Open emoji picker">
              <Smile size={20} strokeWidth={1.5} />
            </button>
            {!input.trim() && (
              <button type="button" className="text-gray-400 p-1 hover:text-gray-600 transition-colors" onClick={onStartRecording} aria-label="Toggle voice recording">
                <Mic size={20} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}

        {isRecording ? (
          <button type="button" onClick={onVoiceSend} className="mb-1 p-1.5 text-white bg-[#FF3B30] rounded-full active:scale-95 transition-transform shadow-sm" aria-label="Send voice message">
            <Send size={18} />
          </button>
        ) : input.trim() ? (
          <div className="flex items-center gap-1">
            <button type="button" onClick={onSchedule} className="mb-0.5 p-1.5 text-gray-500 hover:bg-gray-200 rounded-full transition-colors" title="Schedule message">
              <Clock size={22} strokeWidth={1.5} />
            </button>
            <button type="button" onClick={onSend} className="mb-1 p-1.5 text-white bg-[#00C300] rounded-full active:scale-95 transition-transform shadow-sm" aria-label="Send message">
              <Send size={18} />
            </button>
          </div>
        ) : (
          <button type="button" className="mb-0.5 p-1.5 text-gray-500 hover:bg-gray-200 rounded-full transition-colors" onClick={onSchedule} aria-label="Schedule message">
            <Clock size={24} strokeWidth={1.5} />
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
            className="shrink-0 z-20 bg-white border-t border-[#EBEBEB] px-3 py-2 overflow-hidden"
          >
            <EmojiPicker onEmojiSelect={(emoji) => { onEmojiSelect(emoji); onToggleEmojiPicker(); }} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
