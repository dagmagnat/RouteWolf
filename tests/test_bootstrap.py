"""Check download fallbacks using locally generated archives and fetchers."""
import io
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest


SOURCE = (Path(__file__).resolve().parents[1] / 'install.sh').read_text(encoding='utf-8')


class BootstrapTests(unittest.TestCase):
    def run_bootstrap(self, fallback_works):
        with tempfile.TemporaryDirectory(prefix='rw-bootstrap-') as temp:
            folder = Path(temp)
            valid, broken = folder / 'complete.tgz', folder / 'truncated.tgz'
            installer = (b'#!/bin/sh\n'
                         b'[ ! -e releases/routewolf-luci-v60-r22.tar.gz ] || exit 3\n'
                         b'[ -f releases/routewolf-v60.tar.gz ] || exit 4\n'
                         b'printf "Ran local installer with %s\\n" "$1"\n')
            with tarfile.open(valid, 'w:gz') as archive:
                for path, content in (
                    ('routewolf-install.sh', installer),
                    ('releases/routewolf-luci-v60-r22.tar.gz', b'published panel'),
                    ('releases/routewolf-v60.tar.gz', b'stable runtime'),
                ):
                    member = tarfile.TarInfo('dagmagnat-RouteWolf-testhash/' + path)
                    member.size = len(content)
                    archive.addfile(member, io.BytesIO(content))
            broken.write_bytes(valid.read_bytes()[:-8])
            scripts = {
                'uclient-fetch': '''#!/bin/sh
while [ "$#" -gt 1 ]; do
    case "$1" in -O) out=$2; shift ;; esac
    shift
done
printf '%s\\n' "$1"
case "$1" in
    https://api.github.com/*) cp "$FIXTURE_API" "$out" ;;
    *) cp "$FIXTURE_TRUNCATED" "$out" ;;
esac
''',
                'curl': '#!/bin/sh\nexit 1\n',
                'wget': '#!/bin/sh\nexit 1\n',
            }
            for name, code in scripts.items():
                path = folder / name
                path.write_text(code, encoding='utf-8', newline='\n')
                path.chmod(0o755)
            env = dict(os.environ, PATH=str(folder) + os.pathsep + os.environ['PATH'],
                       FIXTURE_API=(valid if fallback_works else broken).as_posix(),
                       FIXTURE_TRUNCATED=broken.as_posix())
            return subprocess.run(['sh', '-s', '--', '--fixture'],
                                  input=SOURCE.replace('/bin/uclient-fetch', '/missing-native-fetch'),
                                  capture_output=True, encoding='utf-8', env=env, timeout=20)

    def test_truncated_archive_uses_official_api_fallback(self):
        result = self.run_bootstrap(fallback_works=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('archive is incomplete', result.stderr)
        self.assertIn('https://api.github.com/repos/dagmagnat/RouteWolf/tarball/main', result.stdout)
        self.assertIn('Ran local installer with --fixture', result.stdout)

    def test_two_incomplete_archives_never_run_installer(self):
        result = self.run_bootstrap(fallback_works=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn('did not deliver a complete RouteWolf archive', result.stderr)
        self.assertNotIn('Ran local installer', result.stdout)


if __name__ == '__main__':
    unittest.main()
