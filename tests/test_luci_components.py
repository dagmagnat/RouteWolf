"""Exercise LuCI component removal using an isolated package inventory."""

from pathlib import Path
import subprocess
import tempfile
import unittest


WORKER = (Path(__file__).resolve().parents[1] / 'luci-app-routewolf'
          / 'root/usr/libexec/routewolf-ui')
SOURCE = (WORKER / 'components.sh').read_text(encoding='utf-8')
SETUP = r"""
phase() { :; }
reason() { printf '%s\n' "$1"; }
present() { command -v "$1" >/dev/null 2>&1; }
pidof() { [ "$1" = "$running" ]; }
uci() {
    case "$*" in
        '-q show routewolf_ui') cat profiles ;;
        '-q show network') cat network ;;
        '-q show openvpn') return 1 ;;
        *) return 1 ;;
    esac
}
opkg() {
    case "$1" in
        list-installed) cat installed ;;
        remove) shift; remove_test_packages "$@" ;;
        *) exit 8 ;;
    esac
}
apk() {
    case "$*" in
        info) awk '{print $1}' installed ;;
        '--no-network del '*) shift 2; remove_test_packages "$@" ;;
        *) exit 8 ;;
    esac
}
remove_test_packages() {
    printf '%s\n' "$@" > removed
    for package do
        awk -v name="$package" '$1 != name' installed > next
        mv next installed
    done
}
"""


class LuCIComponentTests(unittest.TestCase):
    def remove(self, selection, *, profile='', network='', running='', firmware='', version=24):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'os-release').write_text(f'VERSION_ID="{version}.1"\n')
            (root / 'installed').write_text(
                'xray-core - 1\nsing-box-tiny - 1\nluci-app-openvpn - 1\n'
                'openvpn-openssl - 1\nkmod-tun - 1\nwireguard-tools - 1\nkmod-wireguard - 1\n'
            )
            (root / 'firmware').write_text(firmware)
            (root / 'profiles').write_text(profile + '\n', newline='\n')
            (root / 'network').write_text(network + '\n', newline='\n')
            script = SOURCE.replace('. "$lib/dependencies.sh"', ':')
            for original, fixture in {
                '/etc/os-release': 'os-release',
                '/rom/usr/lib/opkg/status': 'firmware',
                '/rom/lib/apk/db/installed': 'firmware',
                '/rom/usr/lib/apk/db/installed': 'firmware-other',
                '/etc/routewolf-subscription/': 'old-subscription/',
                '/etc/routewolf-ui/': 'ui-state/',
                '/etc/routewolf/': 'route-state/',
                '/tmp/routewolf-component-remove.log': 'remove.log',
            }.items():
                script = script.replace(original, fixture)
            config = 'running=$2\nset -- remove "$1"\n'
            result = subprocess.run(
                ['sh', '-s', '--', selection, running],
                cwd=directory, input=SETUP + config + script, text=True,
                capture_output=True, timeout=10,
            )
            removed = (root / 'removed').read_text().splitlines() if (root / 'removed').exists() else []
            return result, removed

    def test_opkg_removes_group_as_one_operation_and_keeps_base_packages(self):
        result, removed = self.remove('xray,openvpn,wireguard', firmware='Package: kmod-wireguard\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(removed, ['xray-core', 'luci-app-openvpn', 'openvpn-openssl', 'wireguard-tools'])

    def test_apk_removes_the_installed_xray_group(self):
        result, removed = self.remove('xray', version=25)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(removed, ['xray-core'])

    def test_shared_outline_profile_leaves_all_selected_packages_installed(self):
        result, removed = self.remove('xray,singbox', profile="routewolf_ui.cfg7.protocol='outline'")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('components-in-use', result.stdout)
        self.assertEqual(removed, [])

    def test_native_network_interface_and_running_process_block_removal(self):
        for group, configuration in [
            ('xray', {'running': 'xray'}),
            ('wireguard', {'network': "network.@interface[2].proto='wireguard'"}),
        ]:
            with self.subTest(group=group):
                result, removed = self.remove(group, **configuration)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('components-in-use', result.stdout)
                self.assertEqual(removed, [])

    def test_only_known_component_ids_are_accepted(self):
        for group in ('xray,curl', 'xray;reboot'):
            with self.subTest(group=group):
                result, removed = self.remove(group)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(removed, [])

    def test_profile_removal_keeps_primary_and_reserve(self):
        jobs = (WORKER / 'jobs.sh').read_text(encoding='utf-8')
        start = jobs.index('remove_profile() {')
        end = jobs.index('\n}', start) + 2
        script = jobs[start:end] + r'''
reason() { :; }
uci() {
    case "$*" in
        '-q get routewolf_ui.ui.active_profile') echo primary ;;
        '-q get routewolf_ui.ui.backup_profile') echo reserve ;;
        '-q get routewolf_ui.ui.preferred_profile') echo old ;;
        '-q get routewolf_ui.old') echo profile ;;
        'changes routewolf_ui') : ;;
        'delete '*|'commit '*) printf '%s\n' "$*" ;;
        *) return 1 ;;
    esac
}
if remove_profile primary; then exit 1; fi
if remove_profile reserve; then exit 2; fi
remove_profile old
'''
        result = subprocess.run(['sh', '-s'], input=script, capture_output=True,
                                text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), [
            'delete routewolf_ui.old', 'delete routewolf_ui.ui.preferred_profile',
            'commit routewolf_ui',
        ])
