"""Release regression: GaGa updates must not request self-install authority."""
from pathlib import Path
from xml.etree import ElementTree
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PlayUpdatePolicyTests(unittest.TestCase):
    def test_manifest_does_not_request_install_packages(self):
        manifest = ElementTree.parse(ROOT / 'app/src/main/AndroidManifest.xml')
        android = '{http://schemas.android.com/apk/res/android}'
        permissions = {element.get(android + 'name') for element in manifest.findall('uses-permission')}
        self.assertNotIn('android.permission.REQUEST_INSTALL_PACKAGES', permissions)

    def test_screen_opens_trusted_destination_instead_of_sideloading(self):
        screen = (ROOT / 'feature/settings/src/main/kotlin/app/gagachat/feature/settings/presentation/AppUpdateScreen.kt').read_text()
        vm = (ROOT / 'feature/settings/src/main/kotlin/app/gagachat/feature/settings/presentation/AppUpdateViewModel.kt').read_text()
        self.assertIn('Open Google Play', screen)
        self.assertIn('Open official download', screen)
        self.assertIn('update.destination', screen)
        self.assertNotIn('downloadAndInstall', screen)
        self.assertNotIn('ApkInstaller', vm)
        self.assertNotIn('AppUpdateDownloader', vm)
        self.assertNotIn('REQUEST_INSTALL_PACKAGES', vm)


if __name__ == '__main__':
    unittest.main()
