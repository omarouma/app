import { useEffect } from 'react';

/**
 * Keyboard-safe layout (§45 / §47).
 *
 * On Android the on-screen keyboard can either resize the WebView (Capacitor
 * `Keyboard.resize: 'body'`) or overlay it. When it overlays, the composer and
 * reply bar would be hidden behind the keyboard. This hook measures the gap
 * between the layout viewport and the visual viewport and exposes it as the CSS
 * custom property `--kb-inset` on the document root, so any element can opt in
 * with `padding-bottom: var(--kb-inset, 0px)`.
 *
 * When the WebView already resizes (the normal Capacitor case) the gap is ~0,
 * so this is a no-op and never double-pads. It also keeps the composer pinned
 * above the keyboard without the layout jumping on open/close.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    let raf = 0;

    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Distance the visual viewport is pushed up from the layout viewport.
        const inset = Math.max(
          0,
          window.innerHeight - vv.height - vv.offsetTop,
        );
        // Ignore sub-pixel noise and tiny browser-chrome shifts.
        const value = inset > 24 ? Math.round(inset) : 0;
        root.style.setProperty('--kb-inset', `${value}px`);
      });
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
      root.style.setProperty('--kb-inset', '0px');
    };
  }, []);
}
