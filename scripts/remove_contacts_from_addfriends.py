#!/usr/bin/env python3
"""Remove phone-contact import feature from AddFriendsPage.tsx."""
import re, sys

path = 'src/pages/AddFriendsPage.tsx'
src = open(path, encoding='utf-8').read()
orig = src

# 1. Remove useContacts import line
src = src.replace("import { useContacts } from '@/hooks/useContacts';\n", "")

# 2. Remove BookUser from lucide import
src = src.replace("Users, Sparkles, UserCheck, Ban, RefreshCw, Send, ScanLine, BookUser, MapPin, Navigation,",
                  "Users, Sparkles, UserCheck, Ban, RefreshCw, Send, ScanLine, MapPin, Navigation,")

# 3. activeTab type: drop 'contacts'
src = src.replace("useState<'search' | 'suggestions' | 'requests' | 'nearby' | 'contacts'>('search')",
                  "useState<'search' | 'suggestions' | 'requests' | 'nearby'>('search')")

# 4. Remove contactMatches + loadingContacts state lines
src = src.replace("  const [contactMatches, setContactMatches] = useState<User[]>([]);\n", "")
src = src.replace("  const [loadingContacts, setLoadingContacts] = useState(false);\n", "")

# 5. Remove useContacts hook call
src = src.replace("  const { contacts, loading: contactsLoading, selectContacts, isSupported: contactsSupported } = useContacts();\n", "")

# 6. Remove the Contacts logic block (from "// ─── Contacts ───" through the useEffect closing)
start = src.find("  // \u2500\u2500\u2500 Contacts \u2500\u2500\u2500")
end_marker = "  // \u2500\u2500\u2500 Handlers \u2500\u2500\u2500"
end = src.find(end_marker)
if start != -1 and end != -1 and end > start:
    src = src[:start] + src[end:]
else:
    print("WARN: contacts logic block markers not found", start, end)

# 7. Remove 'contacts' from tab list
src = src.replace("(['search', 'suggestions', 'requests', 'nearby', 'contacts'] as const)",
                  "(['search', 'suggestions', 'requests', 'nearby'] as const)")

# 8. Remove tab label ternary branch
src = src.replace("                  tab === 'nearby' ? 'Nearby' : 'Contacts'}",
                  "                  'Nearby'}")

# 9. Remove the entire Contacts Tab UI block
ui_start = src.find("        {/* \u2550\u2550\u2550 Contacts Tab \u2550\u2550\u2550 */}")
ui_end_marker = "      </AnimatePresence>\n\n      {/* QR Modal */}"
ui_end = src.find(ui_end_marker)
if ui_start != -1 and ui_end != -1 and ui_end > ui_start:
    src = src[:ui_start] + src[ui_end:]
else:
    print("WARN: contacts UI block markers not found", ui_start, ui_end)

open(path, 'w', encoding='utf-8').write(src)
print(f"Done. {len(orig)-len(src)} chars removed.")
