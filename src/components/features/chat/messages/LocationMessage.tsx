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
  // Prefer the message *content* over the mediaUrl. Live-location sessions
  // refresh the content every 30s while the mediaUrl keeps the ORIGINAL
  // coordinates, so reading the URL first would freeze the preview on the
  // first position and the map would never move.
  const sources = [content ?? '', url];
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

/** Convert lat/lng to an OpenStreetMap slippy-map tile coordinate. */
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
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
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 mb-1 max-w-full ${isMe ? 'bg-[#00C300]' : 'bg-background border border-border'}`}>
        <MapPin size={18} className="text-[#FF3B30] shrink-0" />
        <span className={`text-sm ${isMe ? 'text-white' : 'text-foreground'}`}>Location unavailable</span>
      </div>
    );
  }

  const { lat, lng } = coords;
  const coordLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  // Static map preview using OpenStreetMap tiles (reliable, no API key, allowed
  // by the app's CSP img-src https:). A 2×2 tile grid gives good coverage.
  const zoom = 15;
  const { x, y } = latLngToTile(lat, lng, zoom);
  const previewUrl = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

  const copyCoords = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard?.writeText(coordLabel)
      .then(() => toast.success('Coordinates copied'))
      .catch(() => toast.error('Copy failed'));
  };

  return (
    <div className={`mb-1 w-60 max-w-full rounded-2xl overflow-hidden ${isMe ? 'bg-[#00C300]' : 'bg-background border border-border'}`}>
      {/* Map preview — tap to open in Maps */}
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="block relative bg-[#dbe7d5]"
        aria-label="Open location in Maps"
      >
        <img
          src={previewUrl}
          alt={`Map at ${coordLabel}`}
          className="w-full h-28 object-cover"
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
        />
        <div className="absolute top-0 right-0 bottom-0 left-0 flex items-center justify-center pointer-events-none">
          <MapPin size={28} className="text-[#FF3B30] drop-shadow-lg -translate-y-2" fill="#FF3B30" />
        </div>
      </a>

      {/* Footer: coordinates + actions */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold truncate ${isMe ? 'text-white' : 'text-foreground'}`}>
            Shared Location
          </p>
          <p className={`text-[11px] truncate ${isMe ? 'text-white/75' : 'text-muted-foreground'}`}>
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
