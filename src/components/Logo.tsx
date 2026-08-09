interface LogoProps {
  size?: number;
  className?: string;
  /** Use a hard fallback to the raster PNG if the SVG fails to load. */
  fallback?: boolean;
  /** Render the icon alongside the "GaGa Chat" wordmark (used in headers/navbars). */
  withWordmark?: boolean;
}

/**
* Brand logo for GaGa Chat.
 *
 * Uses the crisp, scalable `public/logo.svg` (512x512, gradient rounded square
 * with a white chat-bubble "G" monogram) so it renders cleanly at any size — no
 * distortion or cropping like the legacy raster `logo.png` (which was 179x182
 * and non-square).
 *
 * If the SVG is unavailable, it gracefully falls back to the raster PNG.
 */
export default function Logo({ size = 40, className = '', fallback = false, withWordmark = false }: LogoProps) {
  const mark = (
    <img
      src="/logo.svg"
      alt="GaGa Chat - Free Global Messaging & Video Call App"
      width={size}
      height={size}
      className={`object-contain drop-shadow-sm ${withWordmark ? '' : className}`}
      draggable={false}
      loading="eager"
      decoding="async"
      onError={(e) => {
        // Fall back to the raster PNG if the SVG is not found.
        const img = e.currentTarget;
        if (img.src !== `${window.location.origin}/logo-192.png`) {
          img.src = '/logo-192.png';
        }
      }}
    />
  );

  if (fallback) {
    return (
      <img
        src="/logo-192.png"
        alt="GaGa Chat - Free Global Messaging & Video Call App"
        width={size}
        height={size}
        className={`rounded-full object-contain ${className}`}
        draggable={false}
        loading="eager"
        decoding="async"
      />
    );
  }

  if (withWordmark) {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        {mark}
        <span className="text-lg font-bold tracking-tight text-[#111111]">GaGa Chat</span>
      </span>
    );
  }

  return mark;
}
