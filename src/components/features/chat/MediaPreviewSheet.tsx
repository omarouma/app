import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Trash2, ImageIcon, Film, FileText, Check } from 'lucide-react';

export interface MediaPreviewSheetProps {
  open: boolean;
  files: File[];
  onClose: () => void;
  onRemove: (index: number) => void;
  /** Called with the (possibly filtered) files, caption and quality choice. */
  onSend: (files: File[], opts: { caption: string; originalQuality: boolean }) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

function kindOf(file: File): 'image' | 'video' | 'file' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

/**
 * Bottom sheet shown before sending one or more attachments. Lets the user
 * review thumbnails, add a caption, remove items, and choose whether to send
 * at original quality (larger) or compressed (faster, less data).
 *
 * Design-system rule (E1): ONE primary GaGa accent (green) for the send action
 * and the active quality toggle; everything else stays neutral.
 */
export function MediaPreviewSheet({ open, files, onClose, onRemove, onSend }: MediaPreviewSheetProps) {
  const [caption, setCaption] = useState('');
  const [originalQuality, setOriginalQuality] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);

  // Build object URLs for image/video thumbnails; revoke on change/unmount.
  useEffect(() => {
    const urls = files.map((f) => (kindOf(f) === 'file' ? '' : URL.createObjectURL(f)));
    setPreviews(urls);
    return () => {
      urls.forEach((u) => {
        if (u) URL.revokeObjectURL(u);
      });
    };
  }, [files]);

  // Reset caption when the sheet is (re)opened.
  useEffect(() => {
    if (open) setCaption('');
  }, [open]);

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + (f.size || 0), 0), [files]);
  const hasMedia = files.some((f) => kindOf(f) !== 'file');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="bg-background rounded-t-3xl w-full max-w-lg flex flex-col max-h-[88vh]"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 dark:bg-white/20 rounded-full mx-auto mt-3 mb-2" />

            <div className="flex items-center justify-between px-5 pb-2">
              <h3 className="text-base font-bold text-foreground">
                {files.length > 1 ? `${files.length} attachments` : 'Attachment'}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-2 -mr-1 text-muted-foreground hover:text-foreground rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            {/* Thumbnail grid */}
            <div className="px-5 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2">
                {files.map((file, i) => {
                  const kind = kindOf(file);
                  const preview = previews[i];
                  return (
                    <div
                      key={`${file.name}-${i}`}
                      className="relative aspect-square rounded-xl overflow-hidden bg-muted flex items-center justify-center"
                    >
                      {kind === 'image' && preview ? (
                        <img src={preview} alt={file.name} className="w-full h-full object-cover" />
                      ) : kind === 'video' && preview ? (
                        <>
                          <video src={preview} className="w-full h-full object-cover" muted playsInline />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <Film size={22} className="text-white" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-1 p-2 text-center">
                          {kind === 'video' ? (
                            <Film size={22} className="text-[#00C300]" />
                          ) : file.type.startsWith('image/') ? (
                            <ImageIcon size={22} className="text-[#00C300]" />
                          ) : (
                            <FileText size={22} className="text-[#00C300]" />
                          )}
                          <span className="text-[9px] text-muted-foreground truncate w-full">{file.name}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemove(i)}
                        aria-label={`Remove ${file.name}`}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center active:scale-90 transition-transform"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
                <span>Total size</span>
                <span className="font-medium text-foreground">{formatBytes(totalSize)}</span>
              </div>
            </div>

            {/* Original quality toggle (only meaningful for media) */}
            {hasMedia && (
              <button
                type="button"
                onClick={() => setOriginalQuality((v) => !v)}
                className="mx-5 mt-3 flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted text-left"
              >
                <span
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                    originalQuality ? 'bg-[#00C300] border-[#00C300]' : 'border-muted-foreground/40'
                  }`}
                >
                  {originalQuality && <Check size={13} className="text-white" strokeWidth={3} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground">Send at original quality</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {originalQuality ? 'Full resolution · larger upload' : 'Compressed · faster, saves data'}
                  </span>
                </span>
              </button>
            )}

            {/* Caption */}
            <div className="px-5 mt-3">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={2}
                placeholder="Add a caption…"
                className="w-full bg-muted rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-[#00C300]"
              />
            </div>

            {/* Send */}
            <div className="px-5 pt-3">
              <button
                type="button"
                disabled={files.length === 0}
                onClick={() => onSend(files, { caption: caption.trim(), originalQuality })}
                className="w-full py-3.5 rounded-2xl bg-[#00C300] text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <Send size={17} />
                Send{files.length > 1 ? ` ${files.length}` : ''}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default MediaPreviewSheet;
