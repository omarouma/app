import { memo, useState } from 'react';
import { Link2, ExternalLink } from 'lucide-react';
import { sanitizeMediaUrl } from '@/lib/utils';
import type { LinkPreviewData } from '@/types';

export interface LinkPreviewProps {
  preview: LinkPreviewData;
  isMe: boolean;
  onOpen: (url: string) => void;
}

/**
 * Rich link-preview card rendered under a text message (§41).
 *
 * Shows the OG image (when present), title, description and the source domain.
 * Falls back to a slim domain chip when only the URL is known. The whole card
 * is a single tap target that opens the link in a new tab.
 */
export const LinkPreview = memo(function LinkPreview(props: LinkPreviewProps) {
  const { preview, isMe, onOpen } = props;
  const [imgFailed, setImgFailed] = useState(false);

  const image = sanitizeMediaUrl(preview.image);
  const showImage = !!image && !imgFailed;
  const hasRichContent = !!(preview.title || preview.description);

  // Slim chip when we only know the domain (no title/description/image).
  if (!hasRichContent && !showImage) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(preview.url);
        }}
        className={`mt-1.5 flex items-center gap-1.5 max-w-full rounded-xl px-2.5 py-1.5 text-left transition-colors ${
          isMe
            ? 'bg-black/15 hover:bg-black/25 text-white'
            : 'bg-muted hover:bg-muted/70 text-foreground'
        }`}
      >
        <Link2 size={13} className="shrink-0 opacity-80" />
        <span className="text-[12px] font-medium truncate">{preview.domain}</span>
        <ExternalLink size={11} className="shrink-0 opacity-60" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(preview.url);
      }}
      className={`mt-1.5 block w-full max-w-full overflow-hidden rounded-xl text-left transition-opacity hover:opacity-95 ${
        isMe ? 'bg-black/15' : 'bg-muted'
      }`}
    >
      {showImage && (
        <div className="w-full bg-black/5 dark:bg-white/5">
          <img
            src={image}
            alt={preview.title || preview.domain}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="w-full max-h-52 object-cover"
          />
        </div>
      )}
      <div className="px-3 py-2">
        <p className={`text-[10px] uppercase tracking-wide font-semibold truncate ${isMe ? 'text-white/70' : 'text-muted-foreground'}`}>
          {preview.siteName || preview.domain}
        </p>
        {preview.title && (
          <p className={`text-[13px] font-semibold leading-snug line-clamp-2 mt-0.5 ${isMe ? 'text-white' : 'text-foreground'}`}>
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className={`text-[11px] leading-snug line-clamp-2 mt-0.5 ${isMe ? 'text-white/80' : 'text-muted-foreground'}`}>
            {preview.description}
          </p>
        )}
        <p className={`text-[10px] mt-1 flex items-center gap-1 truncate ${isMe ? 'text-white/60' : 'text-muted-foreground/80'}`}>
          <Link2 size={10} className="shrink-0" />
          <span className="truncate">{preview.domain}</span>
        </p>
      </div>
    </button>
  );
});
