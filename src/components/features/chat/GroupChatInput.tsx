import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mic, Send, Smile, Plus, Camera, ImageIcon, MapPin, FileIcon, Phone, User, X, Video
} from 'lucide-react';
import type { Message } from '@/types';
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
}

const attachmentOptions = [
    { icon: <ImageIcon size={28} strokeWidth={1.5} />, label: 'Photos', color: 'bg-[#4CAF50]', action: 'photo' },
    { icon: <Camera size={28} strokeWidth={1.5} />, label: 'Camera', color: 'bg-[#2196F3]', action: 'camera' },
    { icon: <Video size={28} strokeWidth={1.5} />, label: 'Video', color: 'bg-[#9C27B0]', action: 'video' },
    { icon: <Phone size={28} strokeWidth={1.5} />, label: 'Audio', color: 'bg-[#00C300]', action: 'audio' },
    { icon: <User size={28} strokeWidth={1.5} />, label: 'Contact', color: 'bg-[#FF9800]', action: 'contact' },
    { icon: <MapPin size={28} strokeWidth={1.5} />, label: 'Location', color: 'bg-[#E91E63]', action: 'location' },
    { icon: <FileIcon size={28} strokeWidth={1.5} />, label: 'File', color: 'bg-[#673AB7]', action: 'file' },
];

export function GroupChatInput({
    input, setInput, handleSend, isRecording, startRecording, cancelRecording, handleVoiceSend, duration,
    replyingTo, setReplyingTo, handleMediaUpload, handleFileUpload, handleLocationShare, handleContactShare, onTyping
}: GroupChatInputProps) {
    const [showAttachments, setShowAttachments] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            default: break;
        }
    };

    return (
        <div className="shrink-0 bg-white border-t border-[#EBEBEB] p-3">
            <AnimatePresence>
                {replyingTo && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-[#F5F5F5] rounded-lg p-2 mb-2 text-sm text-[#111111] border-l-4 border-[#00C300]"
                    >
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-bold">Replying to {replyingTo.senderId}</p>
                                <p className="truncate max-w-[200px]">{replyingTo.content}</p>
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
                            className="absolute bottom-20 left-4 grid grid-cols-3 gap-4 bg-white p-4 rounded-xl shadow-lg border border-[#EBEBEB] z-20"
                        >
                            {attachmentOptions.map(opt => (
                                <button key={opt.label} type="button" onClick={() => handleAttachmentClick(opt.action)} className="flex flex-col items-center gap-2 text-center">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white ${opt.color}`}>{opt.icon}</div>
                                    <span className="text-xs text-[#8D8D8D]">{opt.label}</span>
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                <button type="button" onClick={() => setShowAttachments(!showAttachments)} className="p-2.5 min-w-11 min-h-11 active:bg-gray-100 rounded-full text-[#111111]" aria-label="Toggle attachments">
                    <Plus size={24} strokeWidth={1.5} className={`transition-transform duration-300 ${showAttachments ? 'rotate-45' : ''}`} />
                </button>

                <div className="flex-1 relative">
                    <input
                        value={input}
                        onChange={(e) => { setInput(e.target.value); onTyping(); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Type a message..."
                        className="w-full bg-[#F5F5F5] rounded-xl pl-4 pr-10 py-2.5 text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00C300] placeholder:text-[#8D8D8D]"
                    />
                    <button type="button" onClick={() => setShowEmojiPicker(p => !p)} className={`absolute right-2 top-1/2 -translate-y-1/2 min-w-10 min-h-10 flex items-center justify-center transition-colors ${showEmojiPicker ? 'text-[#00C300]' : 'text-[#8D8D8D]'}`} aria-label="Open emoji picker">
                        <Smile size={20} />
                    </button>
                </div>

                {input.trim() ? (
                    <button type="button" onClick={handleSend} className="w-10 h-10 flex items-center justify-center bg-[#00C300] rounded-full text-white">
                        <Send size={20} className="ml-0.5" />
                    </button>
                ) : isRecording ? (
                    <div className="flex-1 flex items-center gap-2 bg-[#F5F5F5] rounded-xl px-3 h-10">
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
                        className="overflow-hidden border-t border-[#EBEBEB] mt-2"
                    >
                        <EmojiPicker onEmojiSelect={(emoji) => { setInput(input + emoji); setShowEmojiPicker(false); }} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}