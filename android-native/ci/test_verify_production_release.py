"""Unit tests for safe GaGa production artifact labeling."""
import importlib.util
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

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
            with patch.object(gate, "verify_signed_artifacts", return_value=True) as verify:
                self.assertTrue(gate.check(location, True, self.VERSION, "refs/tags/android-2.7.4"))
                verify.assert_called_once()

    def test_present_but_invalid_signatures_block_production(self):
        with tempfile.TemporaryDirectory() as tmp:
            location = Path(tmp)
            self.make_artifacts(location)
            for filename in (f"GaGa-{self.VERSION}-release.apk", f"GaGa-{self.VERSION}-release.aab",
                             "signature-verification.txt", "UPDATE-COMPATIBILITY.txt"):
                (location / filename).write_bytes(b"not a signed artifact")
            with patch.object(gate, "verify_signed_artifacts", return_value=False):
                self.assertFalse(gate.check(location, True, self.VERSION, "refs/tags/android-2.7.4"))

    def test_signature_verifier_rejects_invalid_apk_bytes(self):
        import subprocess
        with patch.object(gate.shutil, "which", return_value="apksigner"), patch.object(
            gate.subprocess, "check_output", side_effect=subprocess.CalledProcessError(1, "apksigner")
        ):
            self.assertFalse(gate.verify_signed_artifacts(Path("bad.apk"), Path("bad.aab"), self.VERSION))

    def test_verifier_checks_both_certificates_and_apk_identity(self):
        import json
        pin = json.loads((gate.ROOT / "ci/release-signing-public.json").read_text())
        cert = pin["sha256"]
        valid = [f"Signer #1 certificate SHA-256 digest: {cert}", "jar verified.",
                 f"SHA256: {cert}", f"package: name='{pin['package']}' versionCode='73' versionName='{self.VERSION}'"]
        def verify(outputs):
            with patch.object(gate.shutil, "which", side_effect=lambda name: name), patch.object(
                gate.subprocess, "check_output", side_effect=outputs
            ):
                return gate.verify_signed_artifacts(Path("candidate.apk"), Path("candidate.aab"), self.VERSION)
        self.assertTrue(verify(valid))
        self.assertFalse(verify(["Signer #1 certificate SHA-256 digest: " + "0" * 64]))
        self.assertFalse(verify(valid[:2] + ["SHA256: " + "0" * 64]))
        self.assertFalse(verify(valid[:3] + ["package: name='wrong.app' versionCode='73' versionName='2.7.4'"]))
        self.assertFalse(verify(valid[:3] + [f"package: name='{pin['package']}' versionCode='73' versionName='0.0.1'"]))

    def test_tag_must_match_app_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            location = Path(tmp)
            self.make_artifacts(location)
            with self.assertRaises(AssertionError):
                gate.check(location, True, self.VERSION, "refs/tags/android-2.7.3")


if __name__ == "__main__":
    unittest.main()
