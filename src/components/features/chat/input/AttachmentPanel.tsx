import { memo, useRef } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Camera, File, ImageIcon, MapPin, Phone, User, BarChart3 } from 'lucide-react';
import { attachmentOptions } from '@/lib/chatConstants';

interface AttachmentPanelProps {
  onPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLocationShare: () => void;
  onContactShare: () => void;
  onPollOpen: () => void;
  onStartRecording: () => void;
}

export const AttachmentPanel = memo(function AttachmentPanel(props: AttachmentPanelProps) {
  const { onPhotoUpload, onVideoUpload, onFileUpload, onLocationShare, onContactShare, onPollOpen, onStartRecording } = props;
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <motion.div
      initial={{ height: 0 }}
      animate={{ height: 220 }}
      exit={{ height: 0 }}
      className="shrink-0 bg-[#F5F5F5] border-t border-gray-200 overflow-hidden z-10"
    >
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-y-5 px-6 pt-5 pb-8">
        {attachmentOptions.map((item, i) => {
          const IconComponent: LucideIcon | null = {
            image: ImageIcon,
            camera: Camera,
            phone: Phone,
            user: User,
            map: MapPin,
            file: File,
            poll: BarChart3,
          }[item.iconKey] as LucideIcon | null;
          return (
            <div key={i} className="flex flex-col items-center gap-2 active:opacity-70">
              <button
                type="button"
                onClick={() => {
                  if (item.label === 'Photos') photoInputRef.current?.click();
                  else if (item.label === 'Camera') cameraInputRef.current?.click();
                  else if (item.label === 'Location') onLocationShare();
                  else if (item.label === 'File') fileInputRef.current?.click();
                  else if (item.label === 'Audio') onStartRecording();
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
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={onPhotoUpload} aria-label="Upload photo" />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhotoUpload} aria-label="Take photo" />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={onVideoUpload} aria-label="Upload video" />
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFileUpload} aria-label="Upload file" />
      </div>
    </motion.div>
  );
});