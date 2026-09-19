#!/usr/bin/env python3
"""Generate Android launcher icons + splash screens from public/logo-512.png.

Produces:
  - mipmap-*/ic_launcher.png            (legacy square icon, full-bleed logo)
  - mipmap-*/ic_launcher_round.png      (legacy round icon)
  - mipmap-*/ic_launcher_foreground.png (adaptive foreground, logo padded)
  - drawable-*/splash.png               (portrait + landscape splash)
  - drawable/splash.png                 (default)
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
LOGO = os.path.join(ROOT, "public", "logo-512.png")

GREEN = (0, 200, 83, 255)  # #00C853

# density -> (legacy icon px, adaptive foreground px)
DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

# density -> (portrait w,h), (landscape w,h)
SPLASH = {
    "mdpi": ((320, 480), (480, 320)),
    "hdpi": ((480, 800), (800, 480)),
    "xhdpi": ((720, 1280), (1280, 720)),
    "xxhdpi": ((960, 1600), (1600, 960)),
    "xxxhdpi": ((1280, 1920), (1920, 1280)),
}


def load_logo():
    img = Image.open(LOGO).convert("RGBA")
    return img


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def circle_mask(size):
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([0, 0, size[0] - 1, size[1] - 1], fill=255)
    return mask


def make_legacy(logo, px, round_icon=False):
    icon = logo.resize((px, px), Image.LANCZOS)
    if round_icon:
        mask = circle_mask((px, px))
        out = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        out.paste(icon, (0, 0), mask)
        return out
    return icon


def make_foreground(logo, px):
    """Adaptive foreground: full-bleed logo (green gradient + white mark).

    The white mark occupies the central ~57% of the source, which sits inside
    the adaptive-icon safe zone, so the gradient can safely bleed to the edges.
    """
    return logo.resize((px, px), Image.LANCZOS)


def make_splash(logo, size):
    w, h = size
    bg = Image.new("RGBA", (w, h), GREEN)
    # logo at ~28% of the shorter side
    side = int(min(w, h) * 0.28)
    art = logo.resize((side, side), Image.LANCZOS)
    # rounded corners on the splash logo
    mask = rounded_mask((side, side), int(side * 0.22))
    art_r = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    art_r.paste(art, (0, 0), mask)
    bg.paste(art_r, ((w - side) // 2, (h - side) // 2), art_r)
    return bg.convert("RGB")


def main():
    logo = load_logo()
    for dens, (legacy_px, fg_px) in DENSITIES.items():
        d = os.path.join(RES, f"mipmap-{dens}")
        os.makedirs(d, exist_ok=True)
        make_legacy(logo, legacy_px).save(os.path.join(d, "ic_launcher.png"))
        make_legacy(logo, legacy_px, round_icon=True).save(
            os.path.join(d, "ic_launcher_round.png"))
        make_foreground(logo, fg_px).save(
            os.path.join(d, "ic_launcher_foreground.png"))
        print(f"icons -> mipmap-{dens}")

    for dens, (port, land) in SPLASH.items():
        dp = os.path.join(RES, f"drawable-port-{dens}")
        dl = os.path.join(RES, f"drawable-land-{dens}")
        os.makedirs(dp, exist_ok=True)
        os.makedirs(dl, exist_ok=True)
        make_splash(logo, port).save(os.path.join(dp, "splash.png"))
        make_splash(logo, land).save(os.path.join(dl, "splash.png"))
        print(f"splash -> drawable-port-{dens}, drawable-land-{dens}")

    # default drawable splash (used by AppTheme.NoActionBarLaunch)
    dd = os.path.join(RES, "drawable")
    os.makedirs(dd, exist_ok=True)
    make_splash(logo, (480, 800)).save(os.path.join(dd, "splash.png"))
    print("splash -> drawable/splash.png")


if __name__ == "__main__":
    main()
