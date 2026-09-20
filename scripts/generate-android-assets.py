#!/usr/bin/env python3
"""Generate Android launcher icons + splash screens for GaGa Chat.

Source: public/logo-512.png (green chat-bubble logo).
Outputs into android/app/src/main/res/.
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
LOGO = os.path.join(ROOT, "public", "logo-512.png")
BG = (11, 11, 15, 255)  # #0B0B0F

logo = Image.open(LOGO).convert("RGBA")

# ---- Launcher icons (legacy square + round) -------------------------------
ICON_SIZES = {
    "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192,
}
for density, size in ICON_SIZES.items():
    d = os.path.join(RES, f"mipmap-{density}")
    os.makedirs(d, exist_ok=True)
    icon = logo.resize((size, size), Image.LANCZOS)
    icon.save(os.path.join(d, "ic_launcher.png"))
    # Round icon: circular mask
    round_icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    round_icon.paste(icon, (0, 0), mask)
    round_icon.save(os.path.join(d, "ic_launcher_round.png"))

# ---- Adaptive icon foreground (logo centered in 108dp canvas) -------------
# Foreground canvas is 108dp; the visible safe zone is the inner 72dp.
FG_SIZES = {
    "mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432,
}
for density, canvas in FG_SIZES.items():
    d = os.path.join(RES, f"mipmap-{density}")
    os.makedirs(d, exist_ok=True)
    fg = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    inner = int(canvas * (72 / 108))
    scaled = logo.resize((inner, inner), Image.LANCZOS)
    off = (canvas - inner) // 2
    fg.paste(scaled, (off, off), scaled)
    fg.save(os.path.join(d, "ic_launcher_foreground.png"))

# ---- Splash screens (logo centered on dark background) --------------------
SPLASH = {
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
}
for folder, (w, h) in SPLASH.items():
    d = os.path.join(RES, folder)
    os.makedirs(d, exist_ok=True)
    canvas = Image.new("RGBA", (w, h), BG)
    logo_size = int(min(w, h) * 0.32)
    scaled = logo.resize((logo_size, logo_size), Image.LANCZOS)
    canvas.paste(scaled, ((w - logo_size) // 2, (h - logo_size) // 2), scaled)
    canvas.convert("RGB").save(os.path.join(d, "splash.png"))

# Default drawable splash (used when no density-specific asset matches)
d = os.path.join(RES, "drawable")
os.makedirs(d, exist_ok=True)
canvas = Image.new("RGBA", (480, 800), BG)
logo_size = int(min(480, 800) * 0.32)
scaled = logo.resize((logo_size, logo_size), Image.LANCZOS)
canvas.paste(scaled, ((480 - logo_size) // 2, (800 - logo_size) // 2), scaled)
canvas.convert("RGB").save(os.path.join(d, "splash.png"))

print("Generated launcher icons, adaptive foregrounds, and splash screens.")
