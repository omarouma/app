"""Regression checks for JDK jarsigner's non-obvious success semantics."""
import subprocess
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from verify_aab_signature import verify_aab_signature


class AabSignatureTests(unittest.TestCase):
    def check_report(self, code, report):
        with patch("verify_aab_signature.subprocess.run") as run:
            run.return_value = subprocess.CompletedProcess([], code, report, "")
            result = verify_aab_signature(Path("candidate.aab"))
            command = run.call_args.args[0]
            self.assertIn("-strict", command)
            self.assertIn("-J-Duser.language=en", command)
            return result

    def test_fully_signed_archive(self):
        self.check_report(0, "\njar verified.\n")

    def test_self_signed_upload_certificate_is_allowed(self):
        self.check_report(4, "jar verified, with signer errors.\n"
                          "The signer's certificate is self-signed.\n")

    def test_unsigned_archive_with_zero_exit_status_is_rejected(self):
        with self.assertRaises(ValueError):
            self.check_report(0, "no manifest.\njar is unsigned.\n")

    def test_appended_unsigned_entries_are_rejected(self):
        for code in (0, 16, 20):
            with self.subTest(code=code), self.assertRaises(ValueError):
                self.check_report(code, "jar verified.\nThis jar contains unsigned entries.")

    def test_strict_unsigned_bit_is_rejected_without_warning_text(self):
        with self.assertRaises(ValueError):
            self.check_report(16, "jar verified.\n")

    def test_invalid_signature_and_disabled_algorithm_are_rejected(self):
        for code, report in ((1, "java.lang.SecurityException: digest error"),
                             (0, "The jar will be treated as unsigned."),
                             (8, "jar verified, with signer errors.")):
            with self.subTest(code=code), self.assertRaises(ValueError):
                self.check_report(code, report)

    def test_expired_or_future_certificate_is_rejected(self):
        for warning in ("certificate has expired", "certificate is not yet valid"):
            with self.subTest(warning=warning), self.assertRaises(ValueError):
                self.check_report(4, "jar verified, with signer errors.\n" + warning)

    def test_missing_jdk_fails_closed(self):
        with patch("verify_aab_signature.subprocess.run", side_effect=FileNotFoundError):
            with self.assertRaises(FileNotFoundError):
                verify_aab_signature(Path("candidate.aab"))


@unittest.skipUnless(shutil.which("jarsigner") and shutil.which("keytool"),
                     "Requires a full JDK; GitHub Actions installs JDK 17")
class RealJdkAabSignatureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        cls.key = cls.root / "synthetic-test-key.p12"
        # Disposable synthetic test key only. Never reads a release credential.
        subprocess.run(["keytool", "-genkeypair", "-alias", "test", "-keyalg", "RSA",
                        "-keysize", "2048", "-validity", "2", "-dname", "CN=Test",
                        "-keystore", str(cls.key), "-storepass", "test-only-password"],
                       check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def archive(self, name, signed):
        path = self.root / name
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("base/manifest/AndroidManifest.xml", b"synthetic-payload")
        if signed:
            subprocess.run(["jarsigner", "-keystore", str(self.key), "-storepass",
                            "test-only-password", str(path), "test"],
                           check=True, capture_output=True)
        return path

    def test_real_self_signed_archive(self):
        verify_aab_signature(self.archive("signed.aab", True))

    def test_real_unsigned_archive(self):
        with self.assertRaises(ValueError):
            verify_aab_signature(self.archive("unsigned.aab", False))

    def test_real_appended_unsigned_payload(self):
        path = self.archive("partial.aab", True)
        with zipfile.ZipFile(path, "a") as archive:
            archive.writestr("base/assets/unverified.txt", b"not-signed")
        with self.assertRaises(ValueError):
            verify_aab_signature(path)
