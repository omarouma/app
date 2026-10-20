"""Unit tests for safe GaGa production artifact labeling."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

# This CI workflow discovers only this filename. Import the additional
# signing-secrets safety tests so they execute as part of the existing gate,
# without changing privileged GitHub Actions workflow configuration.
from test_configure_signing_secrets import ConfigureSigningSecretsTests  # noqa: F401

MODULE_PATH = Path(__file__).with_name("verify_production_release.py")
spec = importlib.util.spec_from_file_location("gaga_release_gate", MODULE_PATH)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class ProductionReleaseGateTests(unittest.TestCase):
    VERSION = "2.7.4"

    def make_artifacts(self, directory: Path) -> None:
        for filename in (
            f"GaGa-{self.VERSION}-release-unsigned.apk",
            f"GaGa-{self.VERSION}-release-unsigned.aab",
        ):
            (directory / filename).write_bytes(b"unsigned-test-artifact")

    def test_development_ci_labels_unsigned_without_promising_play_release(self):
        with tempfile.TemporaryDirectory() as tmp:
            location = Path(tmp)
            self.make_artifacts(location)
            self.assertTrue(gate.check(location, False, self.VERSION, "refs/pull/68/merge"))
            report = (location / "PRODUCTION-READINESS.txt").read_text()
            self.assertIn("NOT PRESENT", report)
            self.assertIn("NOT Play-ready", report)

    def test_unsigned_production_release_must_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            location = Path(tmp)
            self.make_artifacts(location)
            self.assertFalse(gate.check(location, True, self.VERSION, "refs/tags/android-2.7.4"))
            self.assertIn("PRODUCTION RELEASE BLOCKED",
                          (location / "PRODUCTION-READINESS.txt").read_text())

    def test_signed_and_verified_outputs_allow_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            location = Path(tmp)
            self.make_artifacts(location)
            for filename in (
                f"GaGa-{self.VERSION}-release.apk",
                f"GaGa-{self.VERSION}-release.aab",
                "signature-verification.txt",
                "UPDATE-COMPATIBILITY.txt",
            ):
                (location / filename).write_bytes(b"verified-in-upstream-signing-step")
            self.assertTrue(gate.check(location, True, self.VERSION, "refs/tags/android-2.7.4"))

    def test_tag_must_match_app_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            location = Path(tmp)
            self.make_artifacts(location)
            with self.assertRaises(AssertionError):
                gate.check(location, True, self.VERSION, "refs/tags/android-2.7.3")


if __name__ == "__main__":
    unittest.main()
