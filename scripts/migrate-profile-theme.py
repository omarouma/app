#!/usr/bin/env python3
"""Migrate ProfilePage.tsx hardcoded light-mode colors to theme tokens."""
import re, sys

path = "src/pages/ProfilePage.tsx"
src = open(path).read()
orig = src

# Order matters: longer/more-specific first.
repls = [
    # backgrounds
    ('bg-white/95', 'bg-background/95'),
    ('bg-white', 'bg-card'),
    ('bg-[#F5F5F5]', 'bg-secondary'),
    ('hover:bg-[#F5F5F5]', 'hover:bg-secondary'),
    ('bg-[#EBEBEB]', 'bg-muted'),
    ('hover:bg-[#EBEBEB]', 'hover:bg-accent'),
    ('bg-[#00C300]/10', 'bg-primary/10'),
    ('bg-[#00C300]', 'bg-primary'),
    ('hover:bg-[#00A300]', 'hover:bg-primary/90'),
    ('bg-[#2196F3]/10', 'bg-blue-500/10'),
    ('bg-[#8B5CF6]/10', 'bg-purple-500/10'),
    # text
    ('text-[#111111]', 'text-foreground'),
    ('text-[#8D8D8D]', 'text-muted-foreground'),
    ('text-[#C7C7CC]', 'text-muted-foreground'),
    ('text-[#00C300]', 'text-primary'),
    ('text-[#2196F3]', 'text-blue-500'),
    ('text-[#8B5CF6]', 'text-purple-500'),
    # borders
    ('border-[#EBEBEB]', 'border-border'),
    ('divide-[#EBEBEB]', 'divide-border'),
    ('border-2 border-white', 'border-2 border-background'),
    ('focus:ring-[#00C300]', 'focus:ring-primary'),
    # gradient stops that should stay brand but use tokens where sensible
    ('from-[#00C300]/20', 'from-primary/20'),
    ('to-[#2196F3]/20', 'to-blue-500/20'),
]

for a, b in repls:
    src = src.replace(a, b)

open(path, "w").write(src)
print("changed" if src != orig else "no-change")
# report remaining hardcoded hex
remaining = re.findall(r'#[0-9A-Fa-f]{6}', src)
from collections import Counter
print("remaining hex:", Counter(remaining))
