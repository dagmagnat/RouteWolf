"""Exercise the installer preflight without touching host network or packages."""
from pathlib import Path
import subprocess
import unittest


SOURCE = (Path(__file__).resolve().parents[1] / 'routewolf-install.sh').read_text(encoding='utf-8')


def function(name):
    start = SOURCE.index('\n' + name + '() {') + 1
    end = SOURCE.index('\n}', start) + 2
    return SOURCE[start:end]


def run(body, *names):
    definitions = '\n'.join(function(name) for name in names)
    return subprocess.run(['sh', '-s'], input=definitions + '\n' + body,
                          encoding='utf-8', capture_output=True, timeout=10)


class InstallerPreflightTests(unittest.TestCase):
    def test_luci_restarts_network_only_for_unloaded_protocol(self):
        dependencies = (Path(__file__).resolve().parents[1] /
                        'luci-app-routewolf/root/usr/libexec/routewolf-ui/dependencies.sh')
        definitions = dependencies.read_text(encoding='utf-8').replace(
            '/etc/init.d/network restart >/dev/null 2>&1', 'restart_network')
        behavior = r'''
phase() { printf '%s\n' "$1"; }
reason() { :; }
sleep() { :; }
network_protocol_loaded() { [ "$1" = openvpn ] || [ "$loaded" = yes ]; }
restart_network() { echo restart; loaded=$after_restart; }

loaded=no; after_restart=yes
load_network_protocol openvpn || exit 1
load_network_protocol wireguard || exit 2
load_network_protocol wireguard || exit 3
loaded=no; after_restart=no
if load_network_protocol amneziawg; then exit 4; fi
'''
        result = subprocess.run(['sh', '-s'], input=definitions + '\n' + behavior,
                                encoding='utf-8', capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ['network-restart', 'restart',
                                                      'network-restart', 'restart'])

    def test_removes_named_and_anonymous_legacy_domain_sets(self):
        result = run(r'''
uci() {
    case "$*" in
        '-X show firewall') cat <<'UCI'
firewall.routewolf_domains=ipset
firewall.routewolf_domains.name='vpn_domains'
firewall.cfg156e2a=ipset
firewall.cfg156e2a.name='vpn_domains'
firewall.rule=rule
firewall.rule.name='vpn_domains'
firewall.other=ipset
firewall.other.name='other'
UCI
        ;;
        '-q delete '*) printf '%s\n' "$3" ;;
        *) return 1 ;;
    esac
}
delete_uci_sections_by_name firewall ipset vpn_domains
''', 'uci_sections_by_option', 'delete_uci_sections_by_name')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ['firewall.routewolf_domains', 'firewall.cfg156e2a'])

    def test_picks_package_manager_by_firmware_even_with_both_installed(self):
        result = run(r'''
apk() { :; }
opkg() { :; }
for version in 23 24 25 26; do
    VERSION_ID=$version
    detect_pkg_manager || exit 1
    echo "$PKG_MANAGER"
done
''', 'detect_pkg_manager')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.split(), ['opkg', 'opkg', 'apk', 'apk'])

    def test_partial_signed_opkg_updates_continue(self):
        result = run(r'''
prepare_install_storage() { :; }
pkg_update() { return 1; }
grep() { [ "$*" = '-Fq Signature check passed. /tmp/routewolf-pkg-update.log' ] && [ "$signed" = yes ]; }
msgc() { printf '%s\n' "$2"; }
PKG_MANAGER=opkg; signed=yes
check_repo && [ "$ROUTEWOLF_OPKG_PARTIAL" = 1 ] || exit 1
signed=no
if check_repo; then exit 2; fi
PKG_MANAGER=apk; signed=yes
if check_repo; then exit 3; fi
''', 'check_repo')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('verified indexes', result.stdout)
        self.assertIn('retry opkg update', result.stdout)
        self.assertIn('configured APK repositories', result.stdout)
        self.assertNotIn('25.12', result.stdout)

    def test_missing_package_retries_after_partial_refresh(self):
        result = run(r'''
ROUTEWOLF_OPKG_PARTIAL=1
quiet_cmd() { shift; printf '%s\n' "$*"; [ "$retried" = yes ]; }
pkg_update() { retried=yes; echo 'refresh'; return 1; }
msg() { :; }
opkg_package_command install wireguard-tools kmod-wireguard
''', 'opkg_package_command')
        self.assertEqual(result.returncode, 0, result.stderr)
        install = 'opkg install wireguard-tools kmod-wireguard'
        self.assertEqual(result.stdout.splitlines(), [install, 'refresh', install])

    def test_heavy_backends_require_64_mib_of_actual_ram(self):
        result = run(r'''
awk() { printf 'MemTotal: %s kB\n' "$ram" | command awk "$1"; }
msgc() { :; }
ram=58260
if require_proxy_ram; then exit 1; fi
ram=65535
if require_proxy_ram; then exit 2; fi
ram=65536
require_proxy_ram || exit 3
ram=244000
require_proxy_ram
''', 'routewolf_proxy_ram_sufficient', 'require_proxy_ram')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_apk_dnsmasq_install_skips_low_memory_and_never_removes_on_failure(self):
        result = run(r'''
awk() { printf '%s\n' "$ram"; }
msgc() { printf '%s\n' "$2"; }
pkg_install() { printf 'install %s\n' "$*"; return 137; }
pkg_remove() { echo unexpected-removal; exit 99; }
ram=8191
if install_dnsmasq_full_apk; then exit 1; fi
ram=10240
install_dnsmasq_full_apk
[ "$?" -eq 137 ]
''', 'install_dnsmasq_full_apk')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.count('install dnsmasq-full\n'), 1)
        self.assertIn('Less than 8 MiB', result.stdout)
        self.assertIn('APK was killed', result.stdout)
        self.assertNotIn('unexpected-removal', result.stdout)


if __name__ == '__main__':
    unittest.main()
