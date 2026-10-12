import test from "node:test";
import assert from "node:assert/strict";
import { mayFetchRemotePreview, plainLinkPreview } from "../security.mjs";

test("only exact approved public HTTPS domains may be fetched", () => {
  assert.equal(mayFetchRemotePreview("https://www.youtube.com/watch?v=123"), true);
  assert.equal(mayFetchRemotePreview("https://github.com/omarouma/app"), true);
  assert.equal(mayFetchRemotePreview("https://en.wikipedia.org/wiki/Bangladesh"), true);
  assert.equal(mayFetchRemotePreview("http://github.com/omarouma/app"), false);
  assert.equal(mayFetchRemotePreview("https://github.com.evil.example/x"), false);
  assert.equal(mayFetchRemotePreview("https://preview.github.com.evil.example/"), false);
  assert.equal(mayFetchRemotePreview("https://github.com:8443/x"), false);
  assert.equal(mayFetchRemotePreview("https://user:pass@github.com/"), false);
  assert.equal(mayFetchRemotePreview("https://github.com./"), false);
});

test("internal hosts, metadata and IP literals are never fetched", () => {
  for (const url of [
    "http://localhost:8080/",
    "https://localhost/",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "https://10.0.0.1/",
    "https://[::1]/",
    "https://intranet.local/",
    "https://localhost.github.com/",
    "https://github.com@127.0.0.1/",
    "file:///etc/passwd",
    "data:text/plain,secret",
    "https://github.com.evil.example/",
  ]) assert.equal(mayFetchRemotePreview(url), false, url);
});

test("other valid URLs have safe text-only fallback with no remote fetch", () => {
  const raw = "https://unlisted.example/article";
  assert.equal(mayFetchRemotePreview(raw), false);
  assert.deepEqual(plainLinkPreview(raw), {
    url: raw,
    title: "unlisted.example",
    description: null,
    image_url: null,
    site_name: "unlisted.example",
    cached: false,
  });
});

test("oversized, malformed and unsupported input cannot reach network", () => {
  assert.equal(mayFetchRemotePreview("https://github.com/" + "x".repeat(3000)), false);
  assert.equal(mayFetchRemotePreview("not a link"), false);
  assert.equal(mayFetchRemotePreview(null), false);
  assert.equal(mayFetchRemotePreview({}), false);
});

test("handler verifies caller and never follows remote redirects", async () => {
  // Defense-in-depth: helper tests alone cannot prove that the deployed
  // handler actually calls the helper, validates user identity, or avoids
  // following redirects. These source-level assertions prevent an accidental
  // bypass in later maintenance.
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.match(source, /\/auth\/v1\/user/);
  assert.match(source, /Authorization: authHeader/);
  assert.match(source, /if \(!mayFetchRemotePreview\(url\)\)/);
  assert.match(source, /redirect: "manual"/);
  assert.match(source, /response\.status >= 300 && response\.status < 400/);
  assert.match(source, /received > 500_000/);
  assert.doesNotMatch(source, /redirect: "follow"/);
  assert.doesNotMatch(source, /html = await response\.text\(\)/);
});
