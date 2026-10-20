"""Regression checks for the public GaGa marketing site's crawl metadata.

Run from repository root:
    python3 -m unittest discover -s hosting/tests -p 'test_seo.py'

These are source checks, NOT a claim that Firebase Hosting has been deployed,
Search Console ownership is verified, or Google has indexed the URLs.
"""
from __future__ import annotations

import json
import re
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
PUBLIC = BASE / "public"
SITE = "https://gagachat.app"
PUBLIC_PAGES = {
    "index.html": "/",
    "download.html": "/download",
    "privacy.html": "/privacy",
    "terms.html": "/terms",
    "delete-account.html": "/delete-account",
}
VERIFICATION = "nmyW__zH-LC191JoeiIxM8EQbOOrcTYUL8A0nuay7l0"


class HeadParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_head = False
        self.meta: list[dict[str, str]] = []
        self.links: list[dict[str, str]] = []
        self.title: list[str] = []
        self.in_title = False
        self.json_ld = ""
        self.in_json_ld = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag == "head":
            self.in_head = True
        if not self.in_head:
            return
        if tag == "meta":
            self.meta.append({k: v or "" for k, v in a.items()})
        elif tag == "link":
            self.links.append({k: v or "" for k, v in a.items()})
        elif tag == "title":
            self.in_title = True
        elif tag == "script" and a.get("type") == "application/ld+json":
            self.in_json_ld = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.in_title = False
        elif tag == "script":
            self.in_json_ld = False
        elif tag == "head":
            self.in_head = False

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title.append(data)
        if self.in_json_ld:
            self.json_ld += data


def read_head(name: str) -> HeadParser:
    p = HeadParser()
    p.feed((PUBLIC / name).read_text(encoding="utf-8"))
    return p


class SeoSourceChecks(unittest.TestCase):
    def test_search_console_verification_in_homepage_head_once(self) -> None:
        source = (PUBLIC / "index.html").read_text(encoding="utf-8")
        head = read_head("index.html")
        tokens = [m["content"] for m in head.meta
                  if m.get("name") == "google-site-verification"]
        self.assertEqual(tokens, [VERIFICATION])
        self.assertEqual(source.count("google-site-verification"), 1)

    def test_public_pages_have_matching_self_canonicals(self) -> None:
        for file, relative in PUBLIC_PAGES.items():
            with self.subTest(file=file):
                head = read_head(file)
                urls = [link.get("href") for link in head.links
                        if link.get("rel") == "canonical"]
                self.assertEqual(urls, [SITE + relative])
                self.assertTrue("".join(head.title).strip())
                self.assertEqual(
                    len([m for m in head.meta if m.get("name") == "description"]), 1,
                )

    def test_sitemap_contains_only_canonical_public_pages(self) -> None:
        tree = ET.parse(PUBLIC / "sitemap.xml")
        ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
        urls = [node.text for node in tree.findall(f".//{ns}loc")]
        self.assertEqual(set(urls), {SITE + x for x in PUBLIC_PAGES.values()})
        self.assertEqual(len(urls), len(set(urls)))

    def test_robots_and_clean_urls_match_sitemap(self) -> None:
        robots = (PUBLIC / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("Sitemap: " + SITE + "/sitemap.xml", robots)
        for config in (BASE / "firebase.json", BASE.parent / "firebase.json"):
            document = json.loads(config.read_text(encoding="utf-8"))
            self.assertIs(document["hosting"]["cleanUrls"], True)

    def test_homepage_application_json_ld_has_no_fake_rating(self) -> None:
        head = read_head("index.html")
        app = json.loads(head.json_ld)
        self.assertEqual(app["@type"], "SoftwareApplication")
        self.assertEqual(app["operatingSystem"], "Android")
        self.assertEqual(app["url"], SITE + "/")
        self.assertNotIn("aggregateRating", app)

    def test_download_explains_existing_email_sign_in(self) -> None:
        text = (PUBLIC / "download.html").read_text(encoding="utf-8").lower()
        self.assertIn("sign up or sign in with your email", text)
        self.assertNotIn("verify your phone number", text)

    def test_account_deletion_page_is_public_and_discoverable(self) -> None:
        html = (PUBLIC / "delete-account.html").read_text(encoding="utf-8")
        self.assertIn("<h1>Delete your GaGa Chat account</h1>", html)
        self.assertIn("gagachat.app", html)
        self.assertIn('href="/privacy"', html)
        self.assertIn("without reinstalling the app", html)
        self.assertIn("Option 1", html)
        self.assertIn("Option 2", html)
        self.assertIn("privacy@gagachat.app", html)
        self.assertIn("mailto:privacy@gagachat.app", html)
        self.assertIn("not</strong> delete the account automatically", html)
        self.assertIn("We will need to verify", html)
        self.assertIn("Do not send a password", html)

    def test_account_deletion_link_from_home_and_privacy(self) -> None:
        for name in ("index.html", "privacy.html"):
            with self.subTest(page=name):
                html = (PUBLIC / name).read_text(encoding="utf-8")
                self.assertIn('href="/delete-account"', html)
        self.assertNotIn("/delete-account", (PUBLIC / "robots.txt").read_text())

    def test_app_deep_link_fallback_is_not_indexed(self) -> None:
        head = read_head("open.html")
        self.assertTrue(any(m.get("name") == "robots"
                            and "noindex" in m.get("content", "")
                            for m in head.meta))


if __name__ == "__main__":
    unittest.main()
