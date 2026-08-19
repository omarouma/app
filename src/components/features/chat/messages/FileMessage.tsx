import { memo, useState, useCallback } from 'react';
import { FileText, Download, Check } from 'lucide-react';
import type { Message } from '@/types';
import { sanitizeMediaUrl } from '@/lib/utils';
import { toast } from 'sonner';

export interface FileMessageProps {
  msg: Message;
  isMe: boolean;
}

function getFileExtension(name: string): string {
  const match = name.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toUpperCase() : 'FILE';
}

function getFileColor(ext: string): string {
  const map: Record<string, string> = {
    PDF: 'bg-red-500/10 text-red-500',
    DOC: 'bg-blue-500/10 text-blue-500',
    DOCX: 'bg-blue-500/10 text-blue-500',
    XLS: 'bg-green-500/10 text-green-500',
    XLSX: 'bg-green-500/10 text-green-500',
    PPT: 'bg-orange-500/10 text-orange-500',
    PPTX: 'bg-orange-500/10 text-orange-500',
    ZIP: 'bg-purple-500/10 text-purple-500',
    RAR: 'bg-purple-500/10 text-purple-500',
    MP3: 'bg-pink-500/10 text-pink-500',
    MP4: 'bg-cyan-500/10 text-cyan-500',
    TXT: 'bg-gray-500/10 text-gray-500',
  };
  return map[ext] || 'bg-[#00C300]/10 text-[#00C300]';
}

export const FileMessage = memo(function FileMessage(props: FileMessageProps) {
  const { msg, isMe } = props;
  const [downloaded, setDownloaded] = useState(false);

  const safeUrl = sanitizeMediaUrl(msg.mediaUrl);
  const fileName = msg.content.replace('📁 ', '') || 'File';
  const ext = getFileExtension(fileName);
  const colorClass = getFileColor(ext);

  const handleDownload = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!safeUrl) return;
    try {
      const a = document.createElement('a');
      a.href = safeUrl;
      a.download = fileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setDownloaded(true);
      toast.success('Download started');
      setTimeout(() => setDownloaded(false), 2000);
    } catch {
      toast.error('Download failed');
    }
  }, [safeUrl, fileName]);

  if (!safeUrl) {
    return (
      <div className="flex items-center gap-2 bg-black/10 rounded-xl px-3 py-2 mb-1 max-w-full">
        <FileText size={18} className={`shrink-0 ${isMe ? 'text-white' : 'text-[#111111]'}`} />
        <span className={`text-sm truncate ${isMe ? 'text-white' : 'text-[#111111]'}`}>
          File unavailable
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 bg-black/10 rounded-xl px-3 py-2 mb-1 max-w-full hover:bg-black/20 transition-colors cursor-pointer"
      onClick={handleDownload}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void handleDownload(e as unknown as React.MouseEvent);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Download ${fileName}`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
        <FileText size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-[#111111]'}`}>{fileName}</p>
        <p className={`text-[10px] ${isMe ? 'text-white/60' : 'text-[#8D8D8D]'}`}>{ext} file</p>
      </div>
      {downloaded ? (
        <Check size={16} className={`shrink-0 ${isMe ? 'text-white' : 'text-[#00C300]'}`} />
      ) : (
        <Download size={16} className={`shrink-0 ${isMe ? 'text-white/70' : 'text-[#8D8D8D]'}`} />
      )}
    </div>
  );
});