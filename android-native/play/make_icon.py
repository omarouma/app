#!/usr/bin/env python3
"""Build the 512x512 Google Play store icon from the real app launcher assets.

The Play listing icon must match the installed app icon. The installed icon is an
adaptive icon: a solid ``gaga_green`` (#00C300) background plus a white "GaGa"
speech-bubble foreground whose canvas is exactly the 108dp adaptive-icon grid
(the xxxhdpi foreground is 432px = 108dp * 4).

Google applies its own rounding mask to the 512x512 listing icon, so this writes a
full-bleed square (no transparent corners) that reproduces the launcher icon.
"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
RES = HERE.parent / "app" / "src" / "main" / "res"

# gaga_green from app/src/main/res/values/colors.xml
GREEN = (0x00, 0xC3, 0x00, 255)
SIZE = 512

foreground = Image.open(RES / "drawable-xxxhdpi" / "ic_launcher_foreground.png").convert("RGBA")
foreground = foreground.resize((SIZE, SIZE), Image.LANCZOS)

canvas = Image.new("RGBA", (SIZE, SIZE), GREEN)
canvas.alpha_composite(foreground)

out = HERE / "icon-512.png"
canvas.convert("RGB").save(out, "PNG")
print(f"wrote {out} ({canvas.size[0]}x{canvas.size[1]})")
