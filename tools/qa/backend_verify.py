#!/usr/bin/env python3
"""Live backend authorization verification for GaGa Chat.

Creates ONE throwaway Firebase Auth user, exercises Firestore/RTDB security
rules with and without that identity, then deletes the user. No data is left
behind. Read-only against Supabase.
"""
import json, time, urllib.request, urllib.error, sys

API_KEY = "AIzaSyDae1gz_UQ0jHMyekzLkHpBJaauha_xgQM"
PROJECT = "oumagachat"
RTDB = "https://oumagachat-default-rtdb.asia-southeast1.firebasedatabase.app"
FS = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
SUPA = "https://fcjgbbmfqdkucfpqjxae.supabase.co"
ANON = json.load(open("gaga-app/android-native/ci/backend-public.json"))["SUPABASE_ANON_KEY"]

def req(method, url, body=None, headers=None, timeout=25):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return -1, f"ERR {e}"

results = []
def rec(name, ok, detail):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")

print("=" * 78)
print("SECTION A - Supabase GoTrue health")
s, b = req("GET", f"{SUPA}/auth/v1/health", headers={"apikey": ANON})
rec("Supabase GoTrue reachable", s == 200, f"HTTP {s} {b[:80]}")

print("=" * 78)
print("SECTION B - Firebase Auth Email/Password provider")
email = f"qa-probe-{int(time.time())}@gagachat-qa.invalid"
pw = "QaProbe!2345"
s, b = req("POST", f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
           {"email": email, "password": pw, "returnSecureToken": True})
created = s == 200
id_token = None
local_id = None
if created:
    j = json.loads(b); id_token = j["idToken"]; local_id = j["localId"]
    rec("Email/Password signup works", True, f"uid={local_id}")
else:
    rec("Email/Password signup works", False, f"HTTP {s} {b[:160]}")

auth_hdr = {"Authorization": f"Bearer {id_token}"} if id_token else {}

print("=" * 78)
print("SECTION C - Firestore security rules")
# C1: unauthenticated read of a private path -> must be denied
s, b = req("GET", f"{FS}/users/someoneelse/private?key={API_KEY}")
rec("Firestore denies UNAUTH read of users/*/private", s == 403, f"HTTP {s}")
# C2: unauthenticated read of chats -> denied
s, b = req("GET", f"{FS}/chats/doesnotexist?key={API_KEY}")
rec("Firestore denies UNAUTH read of chats/*", s == 403, f"HTTP {s}")
# C3: authenticated read of ANOTHER user's private doc -> denied
s, b = req("GET", f"{FS}/users/not-my-uid/private?key={API_KEY}", headers=auth_hdr)
rec("Firestore denies AUTH read of another user's private", s == 403, f"HTTP {s}")
# C4: authenticated read of another user's public profile -> allowed (profiles are public)
s, b = req("GET", f"{FS}/users/not-my-uid?key={API_KEY}", headers=auth_hdr)
rec("Firestore public profile readable by AUTH (or 404 if absent)", s in (200, 404), f"HTTP {s}")
# C5: authenticated write into a chat the user is not a member of -> denied
s, b = req("PATCH", f"{FS}/chats/not-a-member/messages/m1?key={API_KEY}",
           {"fields": {"text": {"stringValue": "intruder"}}}, headers=auth_hdr)
rec("Firestore denies AUTH write to a non-member chat", s in (403, 404), f"HTTP {s}")
# C6: authenticated attempt to self-grant admin on a chat -> denied
s, b = req("PATCH", f"{FS}/chats/not-a-member?key={API_KEY}",
           {"fields": {"admins": {"arrayValue": {"values": [{"stringValue": local_id}]}}}}, headers=auth_hdr)
rec("Firestore denies AUTH self-grant of chat admin", s in (403, 404), f"HTTP {s}")

print("=" * 78)
print("SECTION D - Realtime Database security rules")
s, b = req("GET", f"{RTDB}/.json")
rec("RTDB denies UNAUTH read of root", s == 401 or "Permission denied" in b, f"HTTP {s} {b[:60]}")
s, b = req("PUT", f"{RTDB}/presence/{local_id}.json?auth={id_token}", {"online": True})
rec("RTDB allows AUTH write to own presence", s == 200, f"HTTP {s} {b[:80]}")
s, b = req("PUT", f"{RTDB}/presence/someone-else.json?auth={id_token}", {"online": True})
rec("RTDB denies AUTH write to another user's presence", s == 401 or "Permission denied" in b, f"HTTP {s} {b[:60]}")
# cleanup presence
if id_token:
    req("DELETE", f"{RTDB}/presence/{local_id}.json?auth={id_token}")

print("=" * 78)
print("SECTION E - Supabase Edge Function deployment state")
for fn, expect in [("firebase-token", "deployed"), ("firebase-identity", "MISSING"),
                   ("media-auth", "MISSING"), ("livekit-token", "deployed"),
                   ("create-call", "deployed"), ("send-fcm-push", "deployed"),
                   ("delete-account-secure", "deployed")]:
    s, b = req("POST", f"{SUPA}/functions/v1/{fn}", {}, headers={"Authorization": f"Bearer {ANON}"})
    deployed = not (s == 404 and "not found" in b.lower())
    status = "deployed" if deployed else "MISSING"
    ok = (status == expect)
    rec(f"Edge function {fn} ({expect})", ok, f"HTTP {s} -> {status}")

print("=" * 78)
print("SECTION F - Supabase PostgREST table presence")
s, b = req("GET", f"{SUPA}/rest/v1/firebase_identity?select=*&limit=1",
           headers={"apikey": ANON, "Authorization": f"Bearer {ANON}"})
missing = (s == 404 and "PGRST205" in b)
rec("Supabase table firebase_identity (migration applied)", not missing, f"HTTP {s} {'MISSING TABLE' if missing else ''}")
s, b = req("GET", f"{SUPA}/rest/v1/profiles?select=*&limit=1",
           headers={"apikey": ANON, "Authorization": f"Bearer {ANON}"})
rec("Supabase table profiles exists (RLS active)", s in (200, 401, 403), f"HTTP {s}")

print("=" * 78)
print("SECTION G - Cleanup test user")
if id_token:
    s, b = req("POST", f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={API_KEY}",
               {"idToken": id_token})
    rec("Throwaway test user deleted", s == 200, f"HTTP {s} {b[:80]}")
else:
    print("(no test user created)")

print("=" * 78)
passed = sum(1 for _, ok, _ in results if ok)
print(f"RESULT: {passed}/{len(results)} checks passed")
json.dump([{"name": n, "pass": ok, "detail": d} for n, ok, d in results],
          open("backend_verify_results.json", "w"), indent=2)
