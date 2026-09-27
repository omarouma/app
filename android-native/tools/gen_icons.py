"""Generate GaGa Chat launcher icons (violet rounded square + white chat bubble).

Run: python3 tools/gen_icons.py
Produces mipmap-*/ic_launcher.png and ic_launcher_round.png plus a 512px Play icon.
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..", "app", "src", "main", "res")
VIOLET = (108, 76, 241, 255)
WHITE = (255, 255, 255, 255)

DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def draw_bubble(size, rounded):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.ellipse([0, 0, size - 1, size - 1], fill=VIOLET)
    else:
        radius = int(size * 0.22)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=VIOLET)

    # Chat bubble
    pad = size * 0.24
    bw = size - 2 * pad
    bh = bw * 0.78
    bx = pad
    by = size * 0.30
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=int(bw * 0.28), fill=WHITE)
    # Tail
    tail = [
        (bx + bw * 0.22, by + bh - 1),
        (bx + bw * 0.22, by + bh + bh * 0.34),
        (bx + bw * 0.52, by + bh - 1),
    ]
    d.polygon(tail, fill=WHITE)
    # Three dots
    dot_r = bw * 0.075
    cy = by + bh / 2
    for i, fx in enumerate((0.30, 0.50, 0.70)):
        cx = bx + bw * fx
        d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=VIOLET)
    return img


def main():
    for folder, size in DENSITIES.items():
        out = os.path.join(ROOT, folder)
        os.makedirs(out, exist_ok=True)
        draw_bubble(size, rounded=False).save(os.path.join(out, "ic_launcher.png"))
        draw_bubble(size, rounded=True).save(os.path.join(out, "ic_launcher_round.png"))
    # Play Store icon
    play = os.path.join(ROOT, "..", "..", "..", "..", "play", "icon-512.png")
    os.makedirs(os.path.dirname(os.path.abspath(play)), exist_ok=True)
    draw_bubble(512, rounded=False).save(os.path.abspath(play))
    print("Icons generated.")


if __name__ == "__main__":
    main()
