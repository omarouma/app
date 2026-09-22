import { memo, useState, useCallback, useEffect } from 'react';
import { FileText, Download, Check, Loader } from 'lucide-react';
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

function getFileColor(_ext: string): string {
  // Design-system rule (E1): ONE primary GaGa accent. File cards use the same
  // soft green tint + green glyph regardless of extension so the chat stays
  // calm and premium (no competing red/blue/orange/purple/pink/cyan chips).
  return 'bg-[#00C300]/10 text-[#00C300]';
}

/** Human-readable byte size, e.g. 1.4 MB. */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export const FileMessage = memo(function FileMessage(props: FileMessageProps) {
  const { msg, isMe } = props;
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [size, setSize] = useState<number | null>(null);

  const safeUrl = sanitizeMediaUrl(msg.mediaUrl);
  const fileName = msg.content.replace('📁 ', '') || 'File';
  const ext = getFileExtension(fileName);
  const colorClass = getFileColor(ext);

  // Probe the file size with a lightweight HEAD request so the card can show
  // "PDF · 2.3 MB" instead of just the extension. Best-effort: many storage
  // backends omit Content-Length, in which case we simply show the extension.
  useEffect(() => {
    if (!safeUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(safeUrl, { method: 'HEAD' });
        const len = res.headers.get('content-length');
        if (!cancelled && len) setSize(Number(len));
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [safeUrl]);

  const handleDownload = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!safeUrl || downloading) return;
    setDownloading(true);
    try {
      // Fetch as a blob and save via an object URL. This works reliably inside
      // the Android WebView where a plain anchor with target="_blank" often
      // fails to trigger a real download.
      const res = await fetch(safeUrl);
      if (!res.ok) throw new Error('bad status');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
      setDownloaded(true);
      toast.success('Download started');
      setTimeout(() => setDownloaded(false), 2000);
    } catch {
      // Fallback: open the raw URL in a new tab.
      try {
        window.open(safeUrl, '_blank');
        toast.success('Opening file…');
      } catch {
        toast.error('Download failed');
      }
    } finally {
      setDownloading(false);
    }
  }, [safeUrl, fileName, downloading]);

  if (!safeUrl) {
    return (
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 mb-1 max-w-full ${isMe ? 'bg-[#00C300]' : 'bg-background border border-border'}`}>
        <FileText size={18} className={`shrink-0 ${isMe ? 'text-white' : 'text-foreground'}`} />
        <span className={`text-sm truncate ${isMe ? 'text-white' : 'text-foreground'}`}>
          File unavailable
        </span>
      </div>
    );
  }

  const sizeLabel = size ? formatBytes(size) : '';
  const meta = sizeLabel ? `${ext} · ${sizeLabel}` : `${ext} file`;

  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2 mb-1 max-w-full transition-colors cursor-pointer ${isMe ? 'bg-[#00C300] hover:bg-[#00B300]' : 'bg-background border border-border hover:bg-muted'}`}
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
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isMe ? 'bg-white/20 text-white' : colorClass}`}>
        <FileText size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-foreground'}`}>{fileName}</p>
        <p className={`text-[10px] ${isMe ? 'text-white/60' : 'text-muted-foreground'}`}>{meta}</p>
      </div>
      {downloading ? (
        <Loader size={16} className={`shrink-0 animate-spin ${isMe ? 'text-white' : 'text-[#00C300]'}`} />
      ) : downloaded ? (
        <Check size={16} className={`shrink-0 ${isMe ? 'text-white' : 'text-[#00C300]'}`} />
      ) : (
        <Download size={16} className={`shrink-0 ${isMe ? 'text-white/70' : 'text-muted-foreground'}`} />
      )}
    </div>
  );
});
