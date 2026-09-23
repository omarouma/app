import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mic, Send, Smile, Plus, Camera, ImageIcon, MapPin, FileIcon, Phone, User, X, Video,
    BarChart3, CalendarClock, Sticker
} from 'lucide-react';
import type { Message } from '@/types';
import { getMessagePreview } from '@/lib/utils';
import { EmojiPicker } from './EmojiPicker';
import { RecordingWaveform } from './RecordingWaveform';

interface GroupChatInputProps {
    input: string;
    setInput: (input: string) => void;
    handleSend: () => void;
    isRecording: boolean;
    startRecording: () => void;
    cancelRecording: () => void;
    handleVoiceSend: () => void;
    duration: number;
    replyingTo: Message | null;
    setReplyingTo: (reply: Message | null) => void;
    handleMediaUpload: (e: React.ChangeEvent<HTMLInputElement>, mediaType: string) => void;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleLocationShare: () => void;
    handleContactShare: () => void;
    onTyping: () => void;
    /** Group members available for @mention autocomplete. */
    members?: Array<{ id: string; name: string }>;
    /** Open the poll composer. */
    onPollOpen?: () => void;
    /** Open the schedule-send picker. */
    onSchedule?: () => void;
    /** Toggle the sticker/GIF picker. */
    onStickerToggle?: () => void;
    /** Whether the sticker picker is currently open. */
    showStickerPicker?: boolean;
}

// Design-system rule (E1): ONE primary GaGa accent. Every attachment action
// uses the same GaGa green accent rendered as a soft tinted circle with a
// green glyph — no competing green/blue/purple/orange/pink buttons.
const GAGA_ACCENT_SURFACE = 'bg-[#00C300]/10 dark:bg-[#00C300]/15';
const GAGA_ACCENT_ICON = 'text-[#00C300]';

const attachmentOptions = [
    { icon: <ImageIcon size={24} strokeWidth={1.5} />, label: 'Photos', action: 'photo' },
    { icon: <Camera size={24} strokeWidth={1.5} />, label: 'Camera', action: 'camera' },
    { icon: <Video size={24} strokeWidth={1.5} />, label: 'Video', action: 'video' },
    { icon: <Phone size={24} strokeWidth={1.5} />, label: 'Audio', action: 'audio' },
    { icon: <User size={24} strokeWidth={1.5} />, label: 'Contact', action: 'contact' },
    { icon: <MapPin size={24} strokeWidth={1.5} />, label: 'Location', action: 'location' },
    { icon: <FileIcon size={24} strokeWidth={1.5} />, label: 'File', action: 'file' },
    { icon: <BarChart3 size={24} strokeWidth={1.5} />, label: 'Poll', action: 'poll' },
    { icon: <CalendarClock size={24} strokeWidth={1.5} />, label: 'Schedule', action: 'schedule' },
];

export function GroupChatInput({
    input, setInput, handleSend, isRecording, startRecording, cancelRecording, handleVoiceSend, duration,
    replyingTo, setReplyingTo, handleMediaUpload, handleFileUpload, handleLocationShare, handleContactShare, onTyping,
    members = [], onPollOpen, onSchedule, onStickerToggle, showStickerPicker = false
}: GroupChatInputProps) {
    const [showAttachments, setShowAttachments] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Detect an in-progress @mention token at the end of the current input.
    const handleInputChange = (value: string) => {
        setInput(value);
        onTyping();
        const match = value.match(/(?:^|\s)@([\w.-]*)$/);
        setMentionQuery(match ? match[1] : null);
    };

    const mentionSuggestions = mentionQuery !== null
        ? members.filter(m => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
        : [];

    const applyMention = (name: string) => {
        const next = input.replace(/(?:^|\s)@([\w.-]*)$/, (full) => {
            const prefix = full.startsWith(' ') ? ' ' : '';
            return `${prefix}@${name.replace(/\s+/g, '_')} `;
        });
        setInput(next);
        setMentionQuery(null);
    };

    const handleAttachmentClick = (action: string) => {
        setShowAttachments(false);
        switch (action) {
            case 'photo': photoInputRef.current?.click(); break;
            case 'camera': cameraInputRef.current?.click(); break;
            case 'video': videoInputRef.current?.click(); break;
            case 'file': fileInputRef.current?.click(); break;
            case 'location': handleLocationShare(); break;
            case 'contact': handleContactShare(); break;
            case 'audio': startRecording(); break;
            case 'poll': onPollOpen?.(); break;
            case 'schedule': onSchedule?.(); break;
            default: break;
        }
    };

    return (
        <div className="shrink-0 bg-background border-t border-border p-3">
            <AnimatePresence>
                {replyingTo && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-muted rounded-lg p-2 mb-2 text-sm text-foreground border-l-4 border-[#00C300]"
                    >
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-bold">Replying to {replyingTo.senderId}</p>
                                <p className="truncate max-w-[200px]">{getMessagePreview(replyingTo.type, replyingTo.content)}</p>
                            </div>
                            <button type="button" onClick={() => setReplyingTo(null)} className="p-1">
                                <X size={16} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex items-center gap-3">
                <AnimatePresence>
                    {showAttachments && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-20 left-4 grid grid-cols-3 gap-4 bg-background p-4 rounded-xl shadow-lg border border-border z-20"
                        >
                            {attachmentOptions.map(opt => (
                                <button key={opt.label} type="button" onClick={() => handleAttachmentClick(opt.action)} className="flex flex-col items-center gap-2 text-center">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${GAGA_ACCENT_SURFACE} ${GAGA_ACCENT_ICON}`}>{opt.icon}</div>
                                    <span className="text-xs text-muted-foreground">{opt.label}</span>
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                <button type="button" onClick={() => setShowAttachments(!showAttachments)} className="p-2.5 min-w-11 min-h-11 active:bg-muted rounded-full text-foreground" aria-label="Toggle attachments">
                    <Plus size={24} strokeWidth={1.5} className={`transition-transform duration-300 ${showAttachments ? 'rotate-45' : ''}`} />
                </button>

                <div className="flex-1 relative">
                    <AnimatePresence>
                        {mentionSuggestions.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 6 }}
                                className="absolute bottom-full left-0 mb-2 w-full max-h-48 overflow-y-auto bg-background rounded-xl shadow-lg border border-border z-30"
                            >
                                {mentionSuggestions.map(m => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => applyMention(m.name)}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted active:bg-muted"
                                    >
                                        <span className="w-7 h-7 rounded-full bg-[#00C300]/10 flex items-center justify-center text-[#00C300] text-xs font-bold shrink-0">
                                            {(m.name || 'U')[0].toUpperCase()}
                                        </span>
                                        <span className="text-sm text-foreground truncate">{m.name}</span>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <input
                        value={input}
                        onChange={(e) => handleInputChange(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Type a message..."
                        className="w-full bg-muted rounded-xl pl-4 pr-20 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-muted-foreground"
                    />
                    <button type="button" onClick={() => onStickerToggle?.()} className={`absolute right-10 top-1/2 -translate-y-1/2 min-w-10 min-h-10 flex items-center justify-center transition-colors ${showStickerPicker ? 'text-[#00C300]' : 'text-muted-foreground'}`} aria-label="Open sticker picker">
                        <Sticker size={20} />
                    </button>
                    <button type="button" onClick={() => setShowEmojiPicker(p => !p)} className={`absolute right-2 top-1/2 -translate-y-1/2 min-w-10 min-h-10 flex items-center justify-center transition-colors ${showEmojiPicker ? 'text-[#00C300]' : 'text-muted-foreground'}`} aria-label="Open emoji picker">
                        <Smile size={20} />
                    </button>
                </div>

                {input.trim() ? (
                    <button type="button" onClick={handleSend} className="w-10 h-10 flex items-center justify-center bg-[#00C300] rounded-full text-white">
                        <Send size={20} className="ml-0.5" />
                    </button>
                ) : isRecording ? (
                    <div className="flex-1 flex items-center gap-2 bg-muted rounded-xl px-3 h-10">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#FF3B30] animate-pulse shrink-0" />
                        <RecordingWaveform duration={duration} barColor="#00C300" />
                        <span className="text-[#FF3B30] text-xs font-medium shrink-0">{duration}s</span>
                        <button type="button" onClick={cancelRecording} className="text-red-500 text-xs shrink-0">Cancel</button>
                        <button type="button" onClick={handleVoiceSend} className="bg-[#00C300] text-white rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                            <Send size={16} />
                        </button>
                    </div>
                ) : (
                    <button type="button" onClick={startRecording} className="w-10 h-10 flex items-center justify-center bg-[#00C300] rounded-full text-white" aria-label="Start voice recording">
                        <Mic size={20} />
                    </button>
                )}
            </div>
            <input type="file" accept="image/*" ref={photoInputRef} onChange={(e) => handleMediaUpload(e, 'image')} className="hidden" />
            <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={(e) => handleMediaUpload(e, 'image')} className="hidden" />
            <input type="file" accept="video/*" ref={videoInputRef} onChange={(e) => handleMediaUpload(e, 'video')} className="hidden" />
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            <AnimatePresence>
                {showEmojiPicker && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-border mt-2"
                    >
                        <EmojiPicker onEmojiSelect={(emoji) => { setInput(input + emoji); setShowEmojiPicker(false); }} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}