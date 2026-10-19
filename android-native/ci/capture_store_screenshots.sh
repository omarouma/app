#!/usr/bin/env bash
#
# Capture Google Play phone screenshots from a real device or emulator.
#
# Play requires 2-8 phone screenshots at 320-3840 px with a 16:9 to 9:16 aspect
# ratio. These must be genuine captures of the release build — never mock-ups.
#
# Usage:
#   # 1. Connect a device (or start an emulator) and sign in to a test account.
#   # 2. Optionally install the release build first:
#   adb install -r path/to/gaga-release.apk
#   # 3. Run the capture helper:
#   bash android-native/ci/capture_store_screenshots.sh
#
# The script walks through the screens Play expects. At each step it prints the
# screen to open, waits for you to press Enter, then grabs the framebuffer. It
# also normalises every shot to a 1080x1920 (9:16) canvas so the listing grid
# stays consistent.
#
# Requires: adb, python3 + Pillow (only for the optional resize step).
set -euo pipefail

OUT_DIR="${OUT_DIR:-android-native/play/screenshots}"
PKG="${PKG:-gagachat.app}"
TARGET_W=1080
TARGET_H=1920

if ! command -v adb >/dev/null 2>&1; then
  echo "error: adb is not on PATH" >&2
  exit 1
fi

if [ "$(adb devices | grep -c 'device$')" -lt 1 ]; then
  echo "error: no device/emulator connected (adb devices is empty)" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Screens Play reviewers expect to see, in listing order.
declare -a SHOTS=(
  "01-chats|Open the Chats tab (conversation list)"
  "02-chatroom|Open a conversation with a few messages"
  "03-call|Open the call screen (or the call history)"
  "04-profile|Open the Me / profile screen"
  "05-settings|Open Settings"
  "06-today|Open the Today tab"
)

echo "Capturing to: $OUT_DIR"
echo "Package:      $PKG"
echo

for entry in "${SHOTS[@]}"; do
  name="${entry%%|*}"
  prompt="${entry#*|}"
  echo "→ $prompt"
  read -r -p "  Press Enter to capture '$name' (or type 's' to skip): " answer
  if [ "$answer" = "s" ]; then
    echo "  skipped"
    continue
  fi
  raw="$OUT_DIR/.raw-$name.png"
  adb exec-out screencap -p > "$raw"
  if command -v python3 >/dev/null 2>&1 && python3 -c "import PIL" >/dev/null 2>&1; then
    python3 - "$raw" "$OUT_DIR/$name.png" "$TARGET_W" "$TARGET_H" <<'PY'
import sys
from PIL import Image
src, dst, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert("RGB")
sw, sh = im.size
scale = max(w / sw, h / sh)
im = im.resize((round(sw * scale), round(sh * scale)), Image.LANCZOS)
left = (im.width - w) // 2
top = (im.height - h) // 2
im.crop((left, top, left + w, top + h)).save(dst, "PNG")
print(f"  saved {dst} ({w}x{h})")
PY
    rm -f "$raw"
  else
    mv "$raw" "$OUT_DIR/$name.png"
    echo "  saved $OUT_DIR/$name.png (Pillow not found — not resized)"
  fi
done

echo
echo "Done. Review the images, then upload 2-8 of them in Play Console →"
echo "Main store listing → Phone screenshots."
