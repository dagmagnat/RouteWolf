#!/usr/bin/env python3
"""Build a deterministic, bounded runtime release from canonical source files."""
from pathlib import Path
import gzip
import hashlib
import io
import re
import tarfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = int(re.fullmatch(r'v([0-9]+)\s*', (ROOT / 'version').read_text(encoding='utf-8')).group(1))
NAME = re.search(r'^PROJECT_VERSION="([a-zA-Z0-9._-]+)"$', (ROOT / 'routewolf-install.sh').read_text(encoding='utf-8'), re.M).group(1)
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
        else:
            target = 'etc/hotplug.d/iface/30-routewolf-route' if path == 'etc/hotplug.d/net/30-routewolf-route' else path
            pattern = r"cat\s+<<\s*'EOF'\s*>\s*/" + re.escape(target) + r'\n(.*?)\nEOF'
            matches = re.findall(pattern, source, re.S)
            if len(matches) != 1:
                raise ValueError(f'Expected exactly one literal heredoc for {path}')
            text = matches[0] + '\n'
        files[path] = text.replace('\r\n', '\n').encode('utf-8')
    return files

def build():
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', mtime=0, filename='') as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as archive:
            for path, data in sorted(runtime_files().items()):
                info = tarfile.TarInfo('payload/' + path)
                info.size, info.mode, info.mtime = len(data), 0o755, 0
                info.uid = info.gid = 0
                info.uname = info.gname = 'root'
                archive.addfile(info, io.BytesIO(data))
    content = buffer.getvalue()
    releases = ROOT / 'releases'
    releases.mkdir(exist_ok=True)
    (releases / f'routewolf-v{VERSION}.tar.gz').write_bytes(content)
    agent = (ROOT / 'runtime/routewolf-stable-update.sh').read_bytes()
    manifest = '\n'.join((
        'format=1', f'version={VERSION}', f'name={NAME}',
        f'archive=routewolf-v{VERSION}.tar.gz',
        'archive_sha256=' + hashlib.sha256(content).hexdigest(),
        'agent_sha256=' + hashlib.sha256(agent).hexdigest(), '',
    ))
    (releases / 'stable.manifest').write_text(manifest, encoding='utf-8', newline='\n')
    print(f'Built v{VERSION}: {len(content)} bytes, {len(FILES)} regular files')

if __name__ == '__main__':
    build()
