"""Verify the updater and tunnel discovery against isolated fixtures."""

import hashlib
import io
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class CurrentLuCITests(unittest.TestCase):
    def test_manual_update_loads_panel_even_when_runtime_is_already_v60(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory)
            (fixture / 'state').mkdir()
            (fixture / 'state/runtime_version').write_bytes(b'60\n')
            (fixture / 'state/route.conf').write_bytes(b'saved-configuration\n')
            (fixture / 'meminfo').write_bytes(b'MemAvailable: 12288 kB\n')
            for name in ('v60.manifest', 'luci-current.manifest'):
                shutil.copyfile(ROOT / 'releases' / name, fixture / name)
            with tarfile.open(fixture / 'panel.tar.gz', 'w:gz') as archive:
                data = b'#!/bin/sh\nprintf "%s\\n" "$1" > applied\n'
                info = tarfile.TarInfo('routewolf-install.sh')
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
            digest = hashlib.sha256((fixture / 'panel.tar.gz').read_bytes()).hexdigest()
            pointer = fixture / 'luci-current.manifest'
            prefix = pointer.read_text(encoding='utf-8').split('luci_sha256=', 1)[0]
            pointer.write_text(prefix + 'luci_sha256=' + digest + '\n', encoding='utf-8', newline='\n')
            source = (ROOT / 'update.sh').read_text(encoding='utf-8')
            start = source.index('\nfetch() {')
            end = source.index('\nverify()', start)
            source = (source[:start] + r'''
fetch() {
    case "$1" in
        */v60.manifest) cp v60.manifest "$2" ;;
        */luci-current.manifest) cp luci-current.manifest "$2" ;;
        */routewolf-luci-v60-r*.tar.gz) cp panel.tar.gz "$2" ;;
        *) return 1 ;;
    esac
}
''' + source[end:]).replace('state=/etc/routewolf', 'state=state').replace(
                '/proc/meminfo', 'meminfo').replace(
                'lock=/tmp/routewolf-project-update.lock', 'lock=./update.lock')
            result = subprocess.run(['sh', '-s'], cwd=directory, input=source, encoding='utf-8',
                                    capture_output=True, timeout=12)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((fixture / 'applied').read_text().strip(), '--luci-panel')
            self.assertEqual((fixture / 'state/luci_revision').read_text().strip(), digest)
            self.assertEqual((fixture / 'state/route.conf').read_bytes(), b'saved-configuration\n')

    def test_inventory_keeps_external_tunnels_and_excludes_internal_slots(self):
        source = (ROOT / 'luci-app-routewolf/root/usr/libexec/routewolf-ui/interfaces.sh').read_text(encoding='utf-8')
        functions = source.split('\ncase "${1:-}" in', 1)[0]
        mock = r'''
uci() {
    case "$*" in
        '-q show network')
            printf "%s\n" "network.custom.proto='wireguard'" "network.oldawg.proto='amneziawg'" \
                "network.awgui0.proto='amneziawg'" "network.tunnel.proto='none'" "network.wan.proto='dhcp'" \
                "network.outline_isp.proto='outline'"
            ;;
        '-q show openvpn') printf '%s\n' 'openvpn.provider=openvpn' ;;
        '-q get network.awgui0.routewolf_ui') echo 1 ;;
        '-q get network.tunnel.device'|'-q get openvpn.provider.dev') echo tun7 ;;
        '-q get network.outline_isp.device') echo outline7 ;;
        *) return 1 ;;
    esac
}
selected_device() { echo oldawg; }
inventory
'''
        result = subprocess.run(['sh', '-s'], input=functions + mock, encoding='utf-8',
                                capture_output=True, timeout=12)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), [
            'net_custom|wireguard|custom|custom|',
            'net_oldawg|amneziawg|oldawg|oldawg|',
            'net_tunnel|openvpn|tun7|tunnel|provider',
            'net_outline_isp|outline|outline7|outline_isp|',
        ])
