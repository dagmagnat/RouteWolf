"""Exercise only AWG package selection/install functions with mocked OPKG."""
from pathlib import Path
import os
import hashlib
import io
import tarfile
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'routewolf-install.sh').read_text(encoding='utf-8')
START = SOURCE.index('    awg_valid_ipk() {')
IPK = SOURCE[START:SOURCE.index('\n    if awg_already_installed;', START)]
PACKAGES = ['kmod-amneziawg', 'amneziawg-tools', 'luci-proto-amneziawg']
POSTFIX = '_v24.10.8_mipsel_24kc_ramips_mt76x8.ipk'

class AwgIpkTests(unittest.TestCase):
    def run_case(self, local=False, missing=False, fail_download=False,
                 fail_install=False, fail_update=False, invalid_target=False,
                 version="24.10.8", target="ramips/mt76x8", arch="mipsel_24kc",
                 api_fallback=False, bad_digest=False, invalid_local=False,
                 absent_asset=False, installed=""):
        with tempfile.TemporaryDirectory(prefix='rw-awg-') as directory:
            base = Path(directory)
            folder = base / 'ipk'
            folder.mkdir()
            fixture = base/'fixture.ipk'
            with tarfile.open(fixture, 'w:gz') as archive:
                for name in ['control.tar.gz', 'data.tar.gz']:
                    info = tarfile.TarInfo('./' + name)
                    info.size = 7
                    archive.addfile(info, io.BytesIO(b'fixture'))
            postfix = '_v' + version + '_' + arch + '_' + target.replace('/', '_') + '.ipk'
            packages = PACKAGES.copy()
            if version in ['23.05.0', '23.05.5', '24.10.0', '24.10.2']:
                packages[-1] = 'luci-app-amneziawg'
            if local:
                for package in packages[:2] if missing else packages:
                    (folder / (package + postfix)).write_bytes(b'not an ipk' if invalid_local else fixture.read_bytes())
            source = IPK.replace('/etc/routewolf', str(base / 'state').replace('\\', '/'))
            prelude = r'''
msgc() { printf '%s\n' "$2"; }
msg() { printf '%s\n' "$1"; }
awg_openwrt_version() { echo "$TEST_VERSION"; }
awg_openwrt_target() { if [ "$INVALID_TARGET" = 1 ]; then echo 'ramips/../x'; else echo "$TEST_TARGET"; fi; }
pkg_is_installed() { case " $INSTALLED " in *" $1 "*) return 0 ;; esac; return 1; }
awg_verify_install() { return 0; }
opkg() {
    if [ "$1" = print-architecture ]; then
        printf 'arch all 1\narch noarch 1\narch %s 10\n' "$TEST_ARCH"; return 0
    fi
    printf 'OPKG:%s\n' "$*" >> "$ACTIONS"
    if [ "$1" = update ] && [ "$FAIL_UPDATE" = 1 ]; then echo 'feed unreachable'; return 1; fi
    if [ "$1" = install ] && [ "$FAIL_INSTALL" = 1 ]; then echo 'kernel dependency mismatch'; return 1; fi
}
download_url_to_file() {
    printf 'FETCH:%s\n' "$1" >> "$ACTIONS"
    if [ "$FAIL_DOWNLOAD" = 1 ]; then echo 'Connection timed out'; return 1; fi
    case "$1" in
        https://github.com/*)
            if [ "$API_FALLBACK" = 1 ]; then echo 'Connection timed out'; return 1; fi ;;
        */releases/tags/*) printf '{}' > "$2"; return 0 ;;
        */releases/assets/*)
            [ "${3:-}" = 'Accept: application/octet-stream' ] || return 2 ;;
    esac
    cp "$FIXTURE" "$2"
}
jsonfilter() {
    [ "$ABSENT_ASSET" != 1 ] || return 0
    case "$4" in
        *.id) echo 12345 ;;
        *.digest) if [ "$BAD_DIGEST" = 1 ]; then printf 'sha256:%064d\n' 0; else echo "sha256:$FIXTURE_HASH"; fi ;;
    esac
}
'''
            script = base / 'case.sh'
            script.write_text(prelude + source + '\ninstall_awg_with_ipk_release\n', encoding='utf-8', newline='\n')
            env = dict(os.environ, AWG_LOG=(base/'log').as_posix(), ACTIONS=(base/'actions').as_posix(),
                       FAIL_DOWNLOAD=str(int(fail_download)), FAIL_INSTALL=str(int(fail_install)),
                       FAIL_UPDATE=str(int(fail_update)), INVALID_TARGET=str(int(invalid_target)),
                       ROUTEWOLF_AWG_IPK_DIR=folder.as_posix() if local else '',
                       TEST_VERSION=version, TEST_TARGET=target, TEST_ARCH=arch,
                       API_FALLBACK=str(int(api_fallback)), BAD_DIGEST=str(int(bad_digest)),
                       ABSENT_ASSET=str(int(absent_asset)), INSTALLED=installed,
                       FIXTURE=fixture.as_posix(), FIXTURE_HASH=hashlib.sha256(fixture.read_bytes()).hexdigest())
            # Rewrite the owned online scratch directory into this test directory.
            script.write_text(script.read_text(encoding='utf-8').replace('/tmp/routewolf-awg-ipk', folder.as_posix()), encoding='utf-8', newline='\n')
            result = subprocess.run(['sh', script.as_posix()], env=env, capture_output=True, text=True, timeout=15)
            actions = (base/'actions').read_text() if (base/'actions').exists() else ''
            return result, actions, sorted(p.name for p in folder.iterdir())

    def test_exact_release_architecture_and_ipk_only(self):
        result, actions, files = self.run_case()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(actions.count('FETCH:'), 3)
        self.assertEqual(actions.count('OPKG:install '), 3)
        for package in PACKAGES:
            self.assertIn('/v24.10.8/' + package + POSTFIX, actions)
        self.assertNotIn('.apk', actions)
        self.assertNotIn('--force', actions)
        self.assertEqual(files, [])

    def test_local_files_are_preserved_and_never_downloaded(self):
        result, actions, files = self.run_case(local=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn('FETCH:', actions)
        self.assertEqual(actions.count('OPKG:install '), 3)
        self.assertEqual(files, sorted(p + POSTFIX for p in PACKAGES))

    def test_missing_local_file_stops_before_opkg(self):
        result, actions, _ = self.run_case(local=True, missing=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Local IPK file is missing or invalid', result.stdout)
        self.assertEqual(actions, '')

    def test_timeout_prints_url_and_log_without_installing(self):
        result, actions, _ = self.run_case(fail_download=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Connection timed out', result.stdout)
        self.assertIn('kmod-amneziawg' + POSTFIX, result.stdout)
        self.assertNotIn('OPKG:', actions)

    def test_kernel_mismatch_stops_without_force_or_retry(self):
        result, actions, _ = self.run_case(fail_install=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('kernel dependency mismatch', result.stdout)
        self.assertEqual(actions.count('OPKG:install '), 1)
        self.assertNotIn('--force', actions)

    def test_feed_failure_stops_before_installing(self):
        result, actions, _ = self.run_case(fail_update=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('feed unreachable', result.stdout)
        self.assertNotIn('OPKG:install ', actions)

    def test_invalid_platform_stops_before_network_or_opkg(self):
        result, actions, _ = self.run_case(invalid_target=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(actions, '')

    def test_multiple_versions_and_router_architectures(self):
        for version, target, arch, luci in [
            ('23.05.5', 'ath79/generic', 'mips_24kc', 'luci-app-amneziawg'),
            ('23.05.6', 'ramips/mt7621', 'mipsel_24kc', 'luci-proto-amneziawg'),
            ('24.10.2', 'bcm27xx/bcm2711', 'aarch64_cortex-a72', 'luci-app-amneziawg'),
            ('24.10.7', 'mediatek/filogic', 'aarch64_cortex-a53', 'luci-proto-amneziawg'),
            ('24.10.8', 'x86/64', 'x86_64', 'luci-proto-amneziawg'),
        ]:
            with self.subTest(version=version, target=target):
                result, actions, _ = self.run_case(version=version, target=target, arch=arch)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn('/v' + version + '/' + luci + '_v' + version + '_' + arch + '_' + target.replace('/', '_') + '.ipk', actions)

    def test_official_api_bypasses_unreachable_github_com(self):
        result, actions, _ = self.run_case(api_fallback=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(actions.count('FETCH:https://github.com/'), 1)
        self.assertEqual(actions.count('/releases/tags/v24.10.8'), 1)
        self.assertEqual(actions.count('/releases/assets/12345?download=1'), 3)
        self.assertEqual(actions.count('OPKG:install '), 3)

    def test_api_checksum_mismatch_prevents_any_installation(self):
        result, actions, _ = self.run_case(api_fallback=True, bad_digest=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('SHA-256 mismatch', result.stdout)
        self.assertNotIn('OPKG:', actions)

    def test_absent_exact_api_asset_prevents_installation(self):
        result, actions, _ = self.run_case(api_fallback=True, absent_asset=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('No exact IPK asset', result.stdout)
        self.assertNotIn('OPKG:', actions)

    def test_html_or_json_in_local_ipk_is_rejected(self):
        result, actions, _ = self.run_case(local=True, invalid_local=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(actions, '')

    def test_partial_previous_installation_skips_existing_packages(self):
        result, actions, _ = self.run_case(installed='kmod-amneziawg')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn('/kmod-amneziawg_', actions)
        self.assertEqual(actions.count('OPKG:install '), 2)

    def test_snapshot_does_not_use_packages_of_another_release(self):
        result, actions, _ = self.run_case(version='SNAPSHOT')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(actions, '')

    def test_shared_downloader_tries_curl_after_native_failure(self):
        start = SOURCE.index('download_url_to_file() (')
        downloader = SOURCE[start:SOURCE.index('\n# Colors', start)]
        with tempfile.TemporaryDirectory(prefix='rw-fetch-') as directory:
            base = Path(directory)
            # Use an absent absolute native client; the PATH native client fails.
            downloader = downloader.replace('/bin/uclient-fetch', (base/'absent').as_posix())
            script = base/'case.sh'
            script.write_text(r'''
uclient-fetch() { echo 'native timed out' >&2; return 1; }
curl() { while [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then shift; printf fixture > "$1"; return 0; fi; shift; done; return 1; }
''' + downloader + '\ndownload_url_to_file https://example.invalid/package.ipk "$1"\n', encoding='utf-8', newline='\n')
            out = base/'result.ipk'
            result = subprocess.run(['sh', script.as_posix(), out.as_posix()], capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(out.read_bytes(), b'fixture')

if __name__ == '__main__':
    unittest.main()
