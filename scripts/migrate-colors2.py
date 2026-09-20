#!/usr/bin/env python3
"""Second-pass migration for remaining safe class-based hardcoded colors.

Only class-based utilities (not inline styles, not SVG props, not intentional
dark buttons like bg-[#111111] text-white).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET_DIRS = [ROOT / "src" / "pages", ROOT / "src" / "components"]

REPLACEMENTS = [
    (r"text-\[#EBEBEB\]", "text-border"),
    (r"bg-\[#8D8D8D\]", "bg-muted-foreground"),
    (r"text-\[#8D8D8D\]", "text-muted-foreground"),
    (r"border-\[#8D8D8D\]", "border-muted-foreground"),
    (r"border-\[#C7C7CC\]", "border-border"),
    (r"bg-\[#C7C7CC\]", "bg-muted-foreground"),
    (r"bg-\[#F5F5F5\]", "bg-secondary"),
]


def main() -> int:
    total = 0
    changed = 0
    for d in TARGET_DIRS:
        for path in sorted(d.rglob("*.tsx")) + sorted(d.rglob("*.ts")):
            original = path.read_text(encoding="utf-8")
            text = original
            n = 0
            for pat, repl in REPLACEMENTS:
                text, k = re.subn(pat, repl, text)
                n += k
            if n and text != original:
                path.write_text(text, encoding="utf-8")
                total += n
                changed += 1
                print(f"  {path.relative_to(ROOT)}: {n}")
    print(f"\nTotal: {total} across {changed} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
