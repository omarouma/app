#!/usr/bin/env python3
"""Mechanically migrate hardcoded hex colors to semantic Tailwind tokens.

Safe mappings (light-mode values are identical; dark-mode already remapped by
dark-mode.css, so visual output is unchanged while maintainability improves):
  bg-white            -> bg-card        (standalone only; bg-white/NN overlays kept)
  text-[#111111]      -> text-foreground
  text-[#8D8D8D]      -> text-muted-foreground
  text-[#C7C7CC]      -> text-muted-foreground
  bg-[#F5F5F5]        -> bg-secondary
  bg-[#EBEBEB]        -> bg-secondary
  border-[#EBEBEB]    -> border-border
  divide-[#EBEBEB]    -> divide-border
  bg-[#00C300]        -> bg-primary
  text-[#00C300]      -> text-primary
  border-[#00C300]    -> border-primary
  ring-[#00C300]      -> ring-primary
  from-[#00C300]      -> from-primary
  to-[#00C300]        -> to-primary
  bg-[#FF3B30]        -> bg-destructive
  text-[#FF3B30]      -> text-destructive
  border-[#FF3B30]    -> border-destructive
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET_DIRS = [ROOT / "src" / "pages", ROOT / "src" / "components"]

# Order matters: more specific prefixes first.
REPLACEMENTS = [
    (r"bg-\[#00C300\]", "bg-primary"),
    (r"text-\[#00C300\]", "text-primary"),
    (r"border-\[#00C300\]", "border-primary"),
    (r"ring-\[#00C300\]", "ring-primary"),
    (r"from-\[#00C300\]", "from-primary"),
    (r"to-\[#00C300\]", "to-primary"),
    (r"bg-\[#FF3B30\]", "bg-destructive"),
    (r"text-\[#FF3B30\]", "text-destructive"),
    (r"border-\[#FF3B30\]", "border-destructive"),
    (r"text-\[#111111\]", "text-foreground"),
    (r"text-\[#8D8D8D\]", "text-muted-foreground"),
    (r"text-\[#C7C7CC\]", "text-muted-foreground"),
    (r"bg-\[#F5F5F5\]", "bg-secondary"),
    (r"bg-\[#EBEBEB\]", "bg-secondary"),
    (r"border-\[#EBEBEB\]", "border-border"),
    (r"divide-\[#EBEBEB\]", "divide-border"),
]

# bg-white -> bg-card, but ONLY when not followed by / (opacity overlay) or a
# word char (e.g. bg-whiteish). Use a negative lookahead.
BG_WHITE = re.compile(r"bg-white(?![\/\w-])")


def migrate(text: str) -> tuple[str, int]:
    count = 0
    for pat, repl in REPLACEMENTS:
        text, n = re.subn(pat, repl, text)
        count += n
    text, n = BG_WHITE.subn("bg-card", text)
    count += n
    return text, count


def main() -> int:
    total = 0
    changed_files = 0
    for d in TARGET_DIRS:
        for path in sorted(d.rglob("*.tsx")) + sorted(d.rglob("*.ts")):
            original = path.read_text(encoding="utf-8")
            updated, n = migrate(original)
            if n and updated != original:
                path.write_text(updated, encoding="utf-8")
                total += n
                changed_files += 1
                print(f"  {path.relative_to(ROOT)}: {n} replacements")
    print(f"\nTotal: {total} replacements across {changed_files} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
