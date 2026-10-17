"""Short-lived, audience-bound release identity. Private keys never leave this process."""
import base64
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def google_token(credentials: Path, *, audience: str | None = None, scope: str | None = None) -> str:
    assert bool(audience) != bool(scope)
    key = json.loads(credentials.read_text())
    assert key['type'] == 'service_account' and key['project_id'] == 'oumagachat'
    if audience:
        assert audience == 'https://fcjgbbmfqdkucfpqjxae.supabase.co/functions/v1/gaga-publish-release-2812'
    if scope:
        assert scope == 'https://www.googleapis.com/auth/firebase.hosting'
    def b64(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=')
    now = int(time.time())
    claims = dict(iss=key['client_email'], aud='https://oauth2.googleapis.com/token', iat=now, exp=now+300)
    claims.update({'target_audience': audience} if audience else {'scope': scope})
    message = b64(dict(alg='RS256', typ='JWT', kid=key['private_key_id'])) + b'.' + b64(claims)
    private = serialization.load_pem_private_key(key['private_key'].encode(), None)
    signature = private.sign(message, padding.PKCS1v15(), hashes.SHA256())
    assertion = message + b'.' + base64.urlsafe_b64encode(signature).rstrip(b'=')
    request = urllib.request.Request('https://oauth2.googleapis.com/token', data=urllib.parse.urlencode({
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': assertion.decode()
    }).encode(), method='POST')
    with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
        data = json.load(response)
    return data['id_token' if audience else 'access_token']
