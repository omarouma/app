"""Offline guardrails for GaGa Firebase rules; not an emulator authorization test.

Run from repository root:
    python3 -m unittest discover -s firebase/tests -p 'test_*.py'

The Firebase Emulator Suite must additionally exercise allow/deny scenarios
before the rules are deployed to production.
"""
import re
import unittest
from pathlib import Path

RULES = (Path(__file__).resolve().parents[2] / "firestore.rules").read_text(encoding="utf-8")


def block_after(match: str, source: str = RULES) -> str:
    """Return balanced-brace rule match body, ignoring comment-only braces."""
    lines = "\n".join(line.split("//", 1)[0] for line in source.splitlines())
    start = lines.index(match)
    opening = lines.index("{", start)
    depth = 1
    for i in range(opening + 1, len(lines)):
        if lines[i] == "{":
            depth += 1
        elif lines[i] == "}":
            depth -= 1
            if depth == 0:
                return lines[opening + 1:i]
    raise ValueError("Unclosed rule block: " + match)


class FirebaseRulesHardeningTests(unittest.TestCase):
    def test_user_profile_creation_cannot_grant_admin_fields(self):
        users = block_after("match /users/{userId}")
        create = re.search(r"allow create:\s*if\s*([\s\S]*?);", users)
        self.assertIsNotNone(create)
        text = create.group(1)
        self.assertIn("isSelf(userId)", text)
        self.assertIn("!request.resource.data.keys().hasAny", text)
        for forbidden in ("role", "admin", "isAdmin", "isModerator"):
            self.assertIn("'" + forbidden + "'", text)

    def test_firebase_clients_cannot_forge_supabase_chat_membership(self):
        chat = block_after("match /chats/{chatId}")
        self.assertRegex(chat, r"allow create:\s*if false\s*;")
        self.assertIn("request.resource.data.participants == resource.data.participants", chat)
        self.assertIn("request.resource.data.type == resource.data.type", chat)

    def test_chat_message_creation_requires_author_and_membership(self):
        message = block_after("match /messages/{messageId}")
        self.assertIn("isChatMember(chatId)", message)
        self.assertIn("request.resource.data.senderId == uid()", message)

    def test_no_unconditional_auth_bypass_for_wallet_or_calls(self):
        self.assertRegex(RULES, r"match /calls/\{callId\}")
        self.assertRegex(RULES, r"match /wallet/\{doc=\*\*\}")
        self.assertIn("allow write: if false;", RULES)

    def test_root_rules_default_deny(self):
        wildcard = block_after("match /{document=**}")
        self.assertIn("allow read, write: if false;", wildcard)


if __name__ == "__main__":
    unittest.main()
