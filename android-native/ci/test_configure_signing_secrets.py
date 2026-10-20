"""Non-secret unit tests for the GaGa upload keystore verification utility."""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch, Mock

MODULE_FILE = Path(__file__).with_name("configure_signing_secrets.py")
spec = importlib.util.spec_from_file_location("gaga_signing_config", MODULE_FILE)
signing = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(signing)


class ConfigureSigningSecretsTests(unittest.TestCase):
    def test_valid_wrapped_base64_keystore_bytes(self):
        example = b"\x30" + b"example-placeholder" * 3
        wrapped = base64.encodebytes(example)
        self.assertEqual(signing.decode_base64_keystore(wrapped), example)

    def test_invalid_or_non_der_base64_rejected(self):
        for value in (b"no!base64", base64.b64encode(b"not-a-pkcs12-file")):
            with self.subTest(value=value[:6]), self.assertRaises(ValueError):
                signing.decode_base64_keystore(value)

    def test_certificate_hash_matches_only_expected_pin(self):
        cert = b"public-test-certificate"
        expected = hashlib.sha256(cert).hexdigest()
        completed = subprocess.CompletedProcess(args=[], returncode=0, stdout=cert, stderr=b"")
        with patch.object(signing.subprocess, "run", return_value=completed) as run:
            signing.verify_certificate(Path("/private/example.p12"), "gaga", "dummy-password", expected)
            args, kwargs = run.call_args
            self.assertNotIn("dummy-password", args[0])
            self.assertEqual(kwargs["env"]["GAGA_RELEASE_STORE_PASSWORD"], "dummy-password")
            self.assertTrue(kwargs["capture_output"])
        with patch.object(signing.subprocess, "run", return_value=completed):
            with self.assertRaisesRegex(ValueError, "mismatch"):
                signing.verify_certificate(Path("/private/example.p12"), "gaga",
                                           "dummy-password", "0" * 64)

    def test_keytool_failure_does_not_print_secrets(self):
        failure = subprocess.CalledProcessError(1, ["keytool"], stderr=b"secret-error-text")
        with patch.object(signing.subprocess, "run", side_effect=failure):
            with self.assertRaises(RuntimeError) as failure_info:
                signing.verify_certificate(Path("/tmp/example"), "gaga", "secret-pass", "0" * 64)
        self.assertNotIn("secret-pass", str(failure_info.exception))
        self.assertNotIn("secret-error-text", str(failure_info.exception))

    def test_configuration_uses_stdin_not_process_argv(self):
        with patch.object(signing.shutil, "which", return_value="/usr/bin/gh"):
            with patch.object(signing.subprocess, "run", return_value=Mock(returncode=0)) as run:
                output = io.StringIO()
                with redirect_stdout(output):
                    signing.set_actions_secrets("secret-base64", "secret-store", "gaga", "secret-key")
                self.assertEqual(run.call_count, 4)
                self.assertEqual(
                    [c.args[0][4] for c in run.call_args_list], ["--repo"] * 4
                )
                for call in run.call_args_list:
                    self.assertTrue(call.kwargs["capture_output"])
                    self.assertTrue(call.kwargs["check"])
                    self.assertEqual(call.args[0][-1], "omarouma/app")
                    self.assertNotIn("secret-base64", " ".join(call.args[0]))
                    self.assertNotIn("secret-store", " ".join(call.args[0]))
                    self.assertNotIn("secret-key", " ".join(call.args[0]))
                self.assertNotIn("secret-base64", output.getvalue())
                self.assertNotIn("secret-store", output.getvalue())
                self.assertNotIn("secret-key", output.getvalue())

    def test_verify_only_does_not_attempt_github_secret_writes(self):
        payload = b"\x30" + b"dummy-key-material" * 3
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "upload.txt"
            file.write_bytes(base64.b64encode(payload))
            with patch.object(signing, "verify_certificate") as verify:
                with patch.object(signing, "set_actions_secrets") as write:
                    with patch.object(signing, "expected_identity",
                                      return_value=("gaga", "a" * 64)):
                        with patch.dict(os.environ, {"GAGA_RELEASE_STORE_PASSWORD": "private"}, clear=False):
                            code = signing.run(["--base64-file", str(file), "--verify-only"])
            self.assertEqual(code, 0)
            verify.assert_called_once()
            write.assert_not_called()

    def test_mismatch_never_submits_secret(self):
        payload = b"\x30" + b"dummy-key-material" * 3
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "upload.txt"
            file.write_bytes(base64.b64encode(payload))
            with patch.object(signing, "verify_certificate",
                              side_effect=ValueError("Signing certificate mismatch")):
                with patch.object(signing, "set_actions_secrets") as write:
                    with patch.object(signing, "expected_identity",
                                      return_value=("gaga", "a" * 64)):
                        with patch.dict(os.environ, {"GAGA_RELEASE_STORE_PASSWORD": "private"}):
                            with self.assertRaisesRegex(ValueError, "mismatch"):
                                signing.run(["--base64-file", str(file), "--configure"])
            write.assert_not_called()


if __name__ == "__main__":
    unittest.main()
