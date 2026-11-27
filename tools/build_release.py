#!/usr/bin/env python3
"""Build a deterministic, bounded runtime release from canonical source files."""
from pathlib import Path
import gzip
import hashlib
import io
import re
import tarfile
import sys

ROOT = Path(__file__).resolve().parents[1]
VERSION = int(re.fullmatch(r'v([0-9]+)\s*', (ROOT / 'version').read_text(encoding='utf-8')).group(1))
NAME = re.search(r'^PROJECT_VERSION="([a-zA-Z0-9._-]+)"$', (ROOT / 'routewolf-install.sh').read_text(encoding='utf-8'), re.M).group(1)
RELEASES = ROOT / 'releases'
MANIFEST = RELEASES / (f'v{VERSION}.manifest' if VERSION >= 60 else 'stable.manifest')
PANEL = RELEASES / f'routewolf-luci-v{VERSION}.tar.gz'
PANEL_UPDATE = RELEASES / 'routewolf-luci-v60-r33.tar.gz' if VERSION == 60 else None
PANEL_MANIFEST = RELEASES / 'luci-v60-r33.manifest' if VERSION == 60 else None
PANEL_CURRENT = RELEASES / 'luci-current.manifest'
MIGRATION_AGENT = RELEASES / 'routewolf-migrate-v60-r3.sh' if VERSION == 60 else None
AGENT_PATH = 'usr/sbin/routewolf-stable-update.sh'
FILES = (
    'etc/init.d/routewolf', 'etc/init.d/routewolf-watchdog', 'etc/init.d/routewolf-route',
    'etc/init.d/getdomains', 'etc/init.d/vpnroute',
    'etc/hotplug.d/iface/30-routewolf-route', 'etc/hotplug.d/net/30-routewolf-route',
    'usr/sbin/rw', 'usr/sbin/rwrt', 'usr/sbin/row',
    'usr/sbin/routewolf-watchdog.sh', 'usr/sbin/routewolf-awg-watchdog.sh',
    'usr/sbin/routewolf-route.sh', 'usr/sbin/routewolf-status.sh',
    'usr/sbin/routewolf-healthcheck.sh', 'usr/sbin/routewolf-diagnose.sh',
    'usr/sbin/routewolf-fetch.sh', 'usr/sbin/routewolf-apply.sh',
    'usr/sbin/routewolf-purge.sh', 'usr/sbin/routewolf-youtube.sh',
    'usr/sbin/routewolf-uninstall.sh', 'usr/sbin/routewolf-diagnose-update.sh',
    'usr/sbin/routewolf-load.sh', 'usr/sbin/domain-routing-route.sh',
    'usr/sbin/domain-routing-status.sh', 'usr/sbin/routing-openwrt-diagnose.sh',
    'usr/sbin/routing-openwrt-load.sh', 'usr/sbin/routewolf-reliability.sh',
    'usr/sbin/routewolf-stable-update.sh', 'usr/sbin/routewolf-update.sh',
)

def runtime_files():
    source = (ROOT / 'routewolf-install.sh').read_text(encoding='utf-8')
    files = {}
    for path in FILES:
        canonical = ROOT / 'runtime' / Path(path).name
        if canonical.exists():
            text = canonical.read_text(encoding='utf-8')
        elif path == 'usr/sbin/routewolf-uninstall.sh':
            text = (ROOT / 'routewolf-uninstall.sh').read_text(encoding='utf-8')
        else:
            target = 'etc/hotplug.d/iface/30-routewolf-route' if path == 'etc/hotplug.d/net/30-routewolf-route' else path
            pattern = r"cat\s+<<\s*'EOF'\s*>\s*/" + re.escape(target) + r'\n(.*?)\nEOF'
            matches = re.findall(pattern, source, re.S)
            if len(matches) != 1:
                raise ValueError(f'Expected exactly one literal heredoc for {path}')
            text = matches[0] + '\n'
        files[path] = text.replace('\r\n', '\n').encode('utf-8')
    return files

def panel_files():
    app = ROOT / 'luci-app-routewolf'
    paths = [ROOT / 'routewolf-install.sh', ROOT / 'routewolf-uninstall.sh',
             ROOT / 'update.sh', ROOT / 'project-entrypoint.sh',
             ROOT / 'runtime/routewolf-stable-update.sh', app / 'install.sh', app / 'uninstall.sh']
    paths.extend(p for directory in ('root', 'htdocs') for p in (app / directory).rglob('*') if p.is_file())
    paths.extend(ROOT / 'subscription' / p for p in ('install.sh', 'controller.sh', 'engine.init', 'monitor.init',
                                                     'assets.txt', 'assets-vless.txt', 'assets-names.txt'))
    text = {'.sh', '.init', '.js', '.css', '.json', '.awk', '.uc', '.txt'}
    files = {}
    for path in paths:
        content = path.read_bytes()
        if path.suffix in text or not path.suffix:
            content = content.replace(b'\r\n', b'\n')
        files[path.relative_to(ROOT).as_posix()] = content
    return files


def verify_archive(path, expected):
    with tarfile.open(path, 'r:gz') as archive:
        members = archive.getmembers()
        assert sorted(m.name for m in members) == sorted(expected)
        for member in members:
            assert member.isfile() and member.mode == 0o755
            assert archive.extractfile(member).read() == expected[member.name]


def published_runtime_files(archive_path):
    expected = runtime_files()
    if MIGRATION_AGENT is not None:
        # These v60 files were published before the separately revisioned LuCI update.
        with tarfile.open(archive_path, 'r:gz') as archive:
            for path in (AGENT_PATH, 'usr/sbin/routewolf-uninstall.sh'):
                expected[path] = archive.extractfile('payload/' + path).read()
    return expected


def verify_existing():
    archive_path = RELEASES / f'routewolf-v{VERSION}.tar.gz'
    fields = dict(line.split('=', 1) for line in MANIFEST.read_text(encoding='utf-8').splitlines())
    assert fields['format'] == '1' and fields['version'] == str(VERSION)
    assert fields['name'] == NAME and fields['archive'] == archive_path.name
    assert hashlib.sha256(archive_path.read_bytes()).hexdigest() == fields['archive_sha256']
    expected = {'payload/' + path: data for path, data in published_runtime_files(archive_path).items()}
    assert hashlib.sha256(expected['payload/' + AGENT_PATH]).hexdigest() == fields['agent_sha256']
    verify_archive(archive_path, expected)
    if VERSION >= 60:
        assert fields['luci_archive'] == PANEL.name
        assert fields['luci_sha256'] == hashlib.sha256(PANEL.read_bytes()).hexdigest()
        if PANEL_UPDATE is None:
            verify_archive(PANEL, panel_files())
        else:
            ui = dict(line.split('=', 1) for line in PANEL_MANIFEST.read_text(encoding='utf-8').splitlines())
            assert ui['format'] == '1' and ui['version'] == str(VERSION)
            assert ui['luci_archive'] == PANEL_UPDATE.name
            assert ui['luci_sha256'] == hashlib.sha256(PANEL_UPDATE.read_bytes()).hexdigest()
            assert PANEL_CURRENT.read_bytes() == PANEL_MANIFEST.read_bytes()
            bridge = MIGRATION_AGENT.read_bytes()
            assert ui['upgrade_agent_sha256'] == hashlib.sha256(bridge).hexdigest()
            assert bridge == (ROOT / 'runtime/routewolf-stable-update.sh').read_bytes()
            verify_archive(PANEL_UPDATE, panel_files())
    print(f'Verified immutable v{VERSION}: manifest, archive and {len(expected)} source files agree')

def archive_content(files):
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', mtime=0, filename='') as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as archive:
            for path, data in sorted(files.items()):
                info = tarfile.TarInfo(path)
                info.size, info.mode, info.mtime = len(data), 0o755, 0
                info.uid = info.gid = 0
                info.uname = info.gname = 'root'
                archive.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


def build():
    archive_path = RELEASES / f'routewolf-v{VERSION}.tar.gz'
    if archive_path.exists() and (PANEL_UPDATE is not None or '--replace-unpublished' not in sys.argv):
        # Deflate output may differ between zlib versions. Never rewrite a good
        # published artifact just to reproduce another compressor's byte stream.
        try:
            verify_existing()
        except (AssertionError, KeyError, ValueError, OSError) as exc:
            raise SystemExit('Existing release does not match source. Bump version before publishing a new release.') from exc
        return
    content = archive_content({'payload/' + path: data for path, data in runtime_files().items()})
    RELEASES.mkdir(exist_ok=True)
    archive_path.write_bytes(content)
    agent = (ROOT / 'runtime/routewolf-stable-update.sh').read_bytes()
    fields = [
        'format=1', f'version={VERSION}', f'name={NAME}',
        f'archive=routewolf-v{VERSION}.tar.gz',
        'archive_sha256=' + hashlib.sha256(content).hexdigest(),
        'agent_sha256=' + hashlib.sha256(agent).hexdigest(),
    ]
    if VERSION >= 60:
        panel = archive_content(panel_files())
        PANEL.write_bytes(panel)
        fields += ['luci_archive=' + PANEL.name, 'luci_sha256=' + hashlib.sha256(panel).hexdigest()]
    MANIFEST.write_text('\n'.join(fields) + '\n', encoding='utf-8', newline='\n')
    print(f'Built v{VERSION}: {len(content)} bytes, {len(FILES)} regular files')


def build_panel_update():
    if PANEL_UPDATE is None:
        raise SystemExit('This source has no separate LuCI update.')
    content = archive_content(panel_files())
    PANEL_UPDATE.write_bytes(content)
    bridge = (ROOT / 'runtime/routewolf-stable-update.sh').read_bytes()
    MIGRATION_AGENT.write_bytes(bridge)
    PANEL_MANIFEST.write_text(
        f'format=1\nversion={VERSION}\nluci_archive={PANEL_UPDATE.name}\n'
        f'luci_sha256={hashlib.sha256(content).hexdigest()}\n'
        f'upgrade_agent_sha256={hashlib.sha256(bridge).hexdigest()}\n',
        encoding='utf-8', newline='\n',
    )
    PANEL_CURRENT.write_bytes(PANEL_MANIFEST.read_bytes())
    print(f'Built {PANEL_UPDATE.name}: {len(content)} bytes')


if __name__ == '__main__':
    if '--check' in sys.argv:
        verify_existing()
    elif '--luci-update' in sys.argv:
        build_panel_update()
    else:
        build()
