import { memo, useMemo } from 'react';
import { MapPin, Navigation, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { sanitizeMediaUrl } from '@/lib/utils';
import type { Message } from '@/types';

export interface LocationMessageProps {
  msg: Message;
  isMe: boolean;
}

/** Extract "lat,lng" from a Google Maps ?q= URL or raw coordinate text. */
function parseCoords(url: string, content?: string): { lat: number; lng: number } | null {
  const sources = [url, content ?? ''];
  for (const src of sources) {
    const m = src.match(/(-?\d{1,2}\.\d+)\s*[,]\s*(-?\d{1,3}\.\d+)/);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

export const LocationMessage = memo(function LocationMessage(props: LocationMessageProps) {
  const { msg, isMe } = props;

  const safeUrl = sanitizeMediaUrl(msg.mediaUrl);
  const coords = useMemo(
    () => parseCoords(safeUrl || '', msg.content),
    [safeUrl, msg.content],
  );

  if (!coords) {
    return (
      <div className="flex items-center gap-2 bg-black/10 rounded-xl px-3 py-2 mb-1 max-w-full">
        <MapPin size={18} className="text-[#FF3B30] shrink-0" />
        <span className={`text-sm ${isMe ? 'text-white/80' : 'text-[#8D8D8D]'}`}>Location unavailable</span>
      </div>
    );
  }

  const { lat, lng } = coords;
  const coordLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  // Static map preview (OpenStreetMap tiles — allowed by the app's CSP img-src https:)
  const previewUrl =
    `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}` +
    `&zoom=15&size=480x220&markers=${lat},${lng},red-pushpin`;

  const copyCoords = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard?.writeText(coordLabel)
      .then(() => toast.success('Coordinates copied'))
      .catch(() => toast.error('Copy failed'));
  };

  return (
    <div className="mb-1 w-60 max-w-full rounded-2xl overflow-hidden bg-black/10">
      {/* Map preview — tap to open in Maps */}
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="block relative"
        aria-label="Open location in Maps"
      >
        <img
          src={previewUrl}
          alt={`Map at ${coordLabel}`}
          className="w-full h-28 object-cover"
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <MapPin size={28} className="text-[#FF3B30] drop-shadow-lg -translate-y-2" fill="#FF3B30" />
        </div>
      </a>

      {/* Footer: coordinates + actions */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold truncate ${isMe ? 'text-white' : 'text-[#111111]'}`}>
            Shared Location
          </p>
          <p className={`text-[11px] truncate ${isMe ? 'text-white/75' : 'text-[#8D8D8D]'}`}>
            {coordLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={copyCoords}
          className={`p-1.5 rounded-full transition-colors ${isMe ? 'hover:bg-white/15 text-white/85' : 'hover:bg-black/10 text-[#666]'}`}
          aria-label="Copy coordinates"
        >
          <Copy size={14} />
        </button>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`p-1.5 rounded-full transition-colors ${isMe ? 'hover:bg-white/15 text-white' : 'hover:bg-black/10 text-[#07C160]'}`}
          aria-label="Navigate to location"
        >
          <Navigation size={14} />
        </a>
      </div>
    </div>
  );
});
