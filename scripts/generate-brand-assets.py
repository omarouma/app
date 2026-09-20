#!/usr/bin/env python3
"""
GaGa Chat — brand asset generator.

Renders the master SVG logo into every raster size the web app and the
native Android shell need:

  * Web / PWA:  favicon 16/32, apple-touch 180, logo 192/512, maskable 512
  * Android launcher:  mdpi..xxxhdpi  ic_launcher / ic_launcher_round / foreground
  * Android splash:    drawable + drawable-port-* + drawable-land-*

Run from the repo root:  python3 scripts/generate-brand-assets.py
"""
import os
import sys

try:
    import cairosvg
except ImportError:
    sys.exit("cairosvg is required:  pip install cairosvg")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
ANDROID_RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

LOGO_SVG = os.path.join(PUBLIC, "logo.svg")
FOREGROUND_SVG = os.path.join(PUBLIC, "logo-foreground.svg")

BRAND_BG = "#00C300"
SPLASH_BG = "#0B0B0F"


def render(svg_path, out_path, size):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    cairosvg.svg2png(
        url=svg_path,
        write_to=out_path,
        output_width=size,
        output_height=size,
    )
    print(f"  {os.path.relpath(out_path, ROOT)}  ({size}x{size})")


def render_splash(out_path, w, h):
    """Dark splash with the logo centered."""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    logo = cairosvg.svg2png(url=LOGO_SVG, output_width=int(min(w, h) * 0.30),
                            output_height=int(min(w, h) * 0.30))
    from PIL import Image
    import io
    canvas = Image.new("RGBA", (w, h), SPLASH_BG)
    mark = Image.open(io.BytesIO(logo)).convert("RGBA")
    canvas.paste(mark, ((w - mark.width) // 2, (h - mark.height) // 2), mark)
    canvas.convert("RGB").save(out_path, "PNG")
    print(f"  {os.path.relpath(out_path, ROOT)}  ({w}x{h})")


def main():
    print("== Web / PWA icons ==")
    render(LOGO_SVG, os.path.join(PUBLIC, "favicon-16x16.png"), 16)
    render(LOGO_SVG, os.path.join(PUBLIC, "favicon-32x32.png"), 32)
    render(LOGO_SVG, os.path.join(PUBLIC, "apple-touch-icon.png"), 180)
    render(LOGO_SVG, os.path.join(PUBLIC, "logo-192.png"), 192)
    render(LOGO_SVG, os.path.join(PUBLIC, "logo-512.png"), 512)
    render(LOGO_SVG, os.path.join(PUBLIC, "logo-maskable-512.png"), 512)
    render(LOGO_SVG, os.path.join(PUBLIC, "logo.png"), 512)

    print("== PWA icon set ==")
    for s in (72, 96, 128, 144, 152, 192, 384, 512):
        render(LOGO_SVG, os.path.join(PUBLIC, "icons", f"icon-{s}x{s}.png"), s)

    print("== Android launcher icons ==")
    densities = {
        "mdpi": 48, "hdpi": 72, "xhdpi": 96,
        "xxhdpi": 144, "xxxhdpi": 192,
    }
    for d, s in densities.items():
        base = os.path.join(ANDROID_RES, f"mipmap-{d}")
        render(LOGO_SVG, os.path.join(base, "ic_launcher.png"), s)
        render(LOGO_SVG, os.path.join(base, "ic_launcher_round.png"), s)
        # Adaptive foreground is 108dp -> 1.5x the legacy size
        render(FOREGROUND_SVG, os.path.join(base, "ic_launcher_foreground.png"), int(s * 1.5))

    print("== Android splash screens ==")
    render_splash(os.path.join(ANDROID_RES, "drawable", "splash.png"), 480, 480)
    port = {"mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280),
            "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920)}
    land = {"mdpi": (480, 320), "hdpi": (800, 480), "xhdpi": (1280, 720),
            "xxhdpi": (1600, 960), "xxxhdpi": (1920, 1280)}
    for d, (w, h) in port.items():
        render_splash(os.path.join(ANDROID_RES, f"drawable-port-{d}", "splash.png"), w, h)
    for d, (w, h) in land.items():
        render_splash(os.path.join(ANDROID_RES, f"drawable-land-{d}", "splash.png"), w, h)

    print("\nDone. All brand assets regenerated.")


if __name__ == "__main__":
    main()
