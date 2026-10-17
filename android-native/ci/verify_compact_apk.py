"""Verify the separate compressed-native APK without changing the Play bundle.

https://developer.android.com/reference/tools/gradle-api/8.13/com/android/build/api/variant/JniLibsApkPackaging
"""
import argparse
import hashlib
from pathlib import Path
import re
import subprocess
from zipfile import ZipFile, ZIP_DEFLATED


def verify(normal: Path, compact: Path, aapt: str) -> dict:
    assert compact.stat().st_size < 50 * 1024 * 1024 - 256 * 1024, "Compact APK needs headroom under 50 MiB for signing"
    with ZipFile(normal) as base, ZipFile(compact) as small:
        def relevant(z):
            return {n for n in z.namelist() if n.startswith(('lib/', 'assets/', 'res/')) or re.fullmatch(r'classes\d*\.dex', n)}
        paths = relevant(base)
        assert paths == relevant(small), "Compact APK lost payload files"
        for path in paths:
            assert hashlib.sha256(base.read(path)).digest() == hashlib.sha256(small.read(path)).digest(), f"Payload changed: {path}"
        libs = [n for n in paths if n.startswith('lib/') and n.endswith('.so')]
        assert libs and all(small.getinfo(n).compress_type == ZIP_DEFLATED for n in libs), "Native libraries are not compressed"
        assert {n.split('/')[1] for n in libs} == {'arm64-v8a', 'armeabi-v7a'}, "ARM support changed"
    manifest = subprocess.check_output([aapt, 'dump', 'xmltree', str(compact), 'AndroidManifest.xml'], text=True)
    assert re.search(r'extractNativeLibs[^\n]*\(type 0x12\)0xffffffff', manifest), "Compressed libraries require extractNativeLibs=true"
    badging = []
    for path in (normal, compact):
        text = subprocess.check_output([aapt, 'dump', 'badging', str(path)], text=True)
        badging.append(next(line for line in text.splitlines() if line.startswith('package:')))
    assert badging[0] == badging[1], "Package/version changed"
    result = {'bytes': compact.stat().st_size, 'native_libraries': len(libs), 'identical_payload_files': len(paths), 'abi': ['arm64-v8a', 'armeabi-v7a']}
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--normal', required=True, type=Path)
    parser.add_argument('--compact', required=True, type=Path)
    parser.add_argument('--aapt', required=True)
    args = parser.parse_args()
    print(verify(args.normal, args.compact, args.aapt))
