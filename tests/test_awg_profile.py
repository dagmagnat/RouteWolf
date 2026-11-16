"""Synthetic AWG profiles: never use real private keys in regression fixtures."""
from pathlib import Path
import os
import re
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
SOURCE=(ROOT/'routewolf-install.sh').read_text(encoding='utf-8')
def function(name):
    start=SOURCE.index(name+'() {')
    line=SOURCE[start:SOURCE.index('\n',start)]
    if line.endswith('}'): return line+'\n'
    return SOURCE[start:SOURCE.index('\n}\n',start)+3]+'\n'

HELPERS='\n'.join(function(n) for n in [
    'cfg_get_section_value','cfg_get_endpoint_host','cfg_get_endpoint_port',
    'awg_generation_rank','awg_generation_supports','awg_installed_generation',
    'awg_choose_profile_mode','awg_boolean_value','awg_detect_profile_generation',
    'awg_resolve_profile_version','awg_set_optional_uci','awg_apply_optional_config',
    'awg_ask_optional_config','parse_awg_config_file'])
BASE='''[Interface]
PrivateKey = synthetic-private-key
Address = 192.0.2.2/32
Jc = 4
Jmin = 40
Jmax = 120
S1 = 16
S2 = 16
H1 = 1
H2 = 2
H3 = 3
H4 = 4
{options}
[Peer]
PublicKey = synthetic-public-key
PresharedKey = synthetic-preshared-key
Endpoint = example.invalid:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = {keepalive}
'''
PRELUDE=r'''
msg() { printf '%s\n' "$1"; }
msgc() { printf '%s\n' "$2"; }
prompt() { printf '%s' "$1"; }
ui_header() { printf '%s\n' "$1"; }
ask_line() { read -r "$3"; }
ask_same_line() { read -r "$3"; }
uci() {
    if [ "$1" = set ]; then
        [ "$#" = 2 ] || return 97
        printf 'SET:%s\n' "$2"
    else printf 'DELETE:%s\n' "$3"; fi
}
'''

class AwgProfileTests(unittest.TestCase):
    def shell(self, script, inputs='', config='', extra_env=None):
        with tempfile.TemporaryDirectory(prefix='rw-profile-') as directory:
            base=Path(directory)
            cfg=base/'client.conf'; cfg.write_text(config,encoding='utf-8',newline='\n')
            test=base/'test.sh'
            test.write_text(PRELUDE+HELPERS+'\n'+script,encoding='utf-8',newline='\n')
            env=dict(os.environ,CONFIG_PATH=cfg.as_posix(),ROUTEWOLF_AWG_MODE='')
            env.update(extra_env or {})
            result=subprocess.run(['sh',test.as_posix()],input=inputs.encode('utf-8'),
                                  capture_output=True,env=env,timeout=15)
            result.stdout=result.stdout.decode('utf-8')
            result.stderr=result.stderr.decode('utf-8')
            return result

    def profile(self, options='', mode='auto', keepalive='25'):
        return self.shell('''AWG_PROFILE_MODE="$TEST_MODE"
parse_awg_config_file "$CONFIG_PATH" || exit $?
awg_resolve_profile_version || exit $?
printf 'PROFILE:%s\\nKEEPALIVE:%s\\n' "$AWG_PROFILE_VERSION" "$AWG_KEEPALIVE"
awg_apply_optional_config awg0
''',config=BASE.format(options=options,keepalive=keepalive),extra_env={'TEST_MODE':mode})

    def test_31_profile_preserves_every_new_field_and_ranges(self):
        result=self.profile('''S3 = 16
S4 = 16
I1 = <b 0xdeadbeef><r 4>
HeaderProtectionKey = AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
ContentPaddingAddition = 0-32
RekeyAfterTime = 120-180
RekeyTimeout = 5-10
RejectAfterTime = 180-240
KeepaliveTimeout = 10-15
MaxHandshakeAttempts = 15-20
RandomTrailers = on
DisableCookies = off''',keepalive='20-30')
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        for expected in ['PROFILE:3.1','KEEPALIVE:20-30',
            'SET:network.awg0.awg_header_protection_key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            'SET:network.awg0.awg_content_padding_addition=0-32',
            'SET:network.awg0.awg_rekey_after_time=120-180',
            'SET:network.awg0.awg_rekey_timeout=5-10',
            'SET:network.awg0.awg_reject_after_time=180-240',
            'SET:network.awg0.awg_keepalive_timeout=10-15',
            'SET:network.awg0.awg_max_handshake_attempts=15-20',
            'SET:network.awg0.awg_random_trailers=1',
            'SET:network.awg0.awg_disable_cookies=0',
            'SET:network.awg0.awg_i1=<b 0xdeadbeef><r 4>']:
            self.assertIn(expected,result.stdout)

    def test_20_config_is_detected_by_s3_s4_or_header_ranges(self):
        for options in ['S3 = 16\nS4 = 16','H1 = 100-200']:
            with self.subTest(options=options):
                config=BASE.format(options=options,keepalive=25)
                if options.startswith('H1'): config=config.replace('H1 = 1\n','')
                result=self.shell('AWG_PROFILE_MODE=auto\nparse_awg_config_file "$CONFIG_PATH"\nawg_resolve_profile_version\n',config=config)
                self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                self.assertIn('compatibility: 2.0',result.stdout)

    def test_15_profile_uses_i_fields_without_enabling_31_options(self):
        result=self.profile('I1 = <b 0xcafe>\nS3 = 0\nS4 = 0')
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('PROFILE:1.5',result.stdout)
        self.assertIn('SET:network.awg0.awg_i1=<b 0xcafe>',result.stdout)
        self.assertNotIn('SET:network.awg0.awg_random_trailers',result.stdout)
        self.assertNotIn('SET:network.awg0.awg_header_protection_key',result.stdout)

    def test_basic_profile_is_explicitly_ambiguous_and_uses_15_compatibility(self):
        result=self.profile()
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('cannot be distinguished',result.stdout)
        self.assertIn('PROFILE:1.5',result.stdout)
        self.assertNotIn('SET:',result.stdout)

    def test_manual_legacy_mode_preserves_old_profile(self):
        for mode in ['1.0','1.5','2.0','3.1']:
            with self.subTest(mode=mode):
                result=self.profile(mode=mode)
                self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                self.assertIn('PROFILE:'+mode,result.stdout)
                self.assertNotIn('SET:',result.stdout)

    def test_manual_older_mode_rejects_newer_parameters_before_uci(self):
        for mode,options in [('1.5','S3 = 16'),('2.0','RandomTrailers = on'),('1.0','I1 = <b 0xcafe>')]:
            with self.subTest(mode=mode):
                result=self.profile(options,mode=mode)
                self.assertNotEqual(result.returncode,0)
                self.assertIn('No parameters were discarded',result.stdout)
                self.assertNotIn('SET:',result.stdout)

    def test_invalid_boolean_does_not_apply_partial_config(self):
        result=self.profile('RandomTrailers = perhaps')
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn('SET:',result.stdout)

    def test_beta_only_parameters_are_not_silently_discarded(self):
        result=self.profile('Itime = 10')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('Legacy beta option Itime is unsupported',result.stdout)
        self.assertNotIn('SET:',result.stdout)

    def test_menu_defaults_to_auto_and_accepts_manual_versions(self):
        for answer,mode in [('\n','auto'),('2\n','1.5'),('3\n','2.0'),('4\n','3.1'),('3.1\n','3.1')]:
            with self.subTest(answer=answer):
                result=self.shell('AWG_RANDOM_TRAILERS=1\nawg_choose_profile_mode\nprintf "MODE:%s\\nSTALE:%s\\n" "$AWG_PROFILE_MODE" "$AWG_RANDOM_TRAILERS"\n',inputs=answer)
                self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                self.assertIn('MODE:'+mode,result.stdout)
                self.assertIn('STALE:\n',result.stdout)

    def test_31_package_capability_also_accepts_15_and_20_profiles(self):
        result=self.shell('awg_generation_supports 3.1 1.5 && awg_generation_supports 3.1 2.0 && awg_generation_supports 3.1 3.1 && ! awg_generation_supports 2.0 3.1\n')
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_main_flow_detects_profile_before_packages_and_uci(self):
        start=SOURCE.index('    if [ "$TUNNEL" = \'awg\' ]; then')
        end=SOURCE.index('\n    if [ "${TUNNEL:-0}"',start)
        branch=SOURCE[start:end].replace('/tmp/awg-client.conf','$CONFIG_PATH')
        script="""
read_multiline_config() { :; }
install_awg_packages() { printf 'INSTALL:%s\\n' "$AWG_PROFILE_VERSION"; }
route_vpn() { echo ROUTE; }
routewolf_mtu_or_default() { echo 1380; }
TUNNEL=awg
configure_test() {
"""+branch+'\n}\nconfigure_test\n'
        for mode,expected in [('auto',0),('2.0',1)]:
            with self.subTest(mode=mode):
                result=self.shell(script,inputs='y\n',config=BASE.format(options='RandomTrailers = on',keepalive=25),extra_env={'ROUTEWOLF_AWG_MODE':mode})
                self.assertEqual(result.returncode,expected,result.stdout+result.stderr)
                if expected==0:
                    self.assertLess(result.stdout.index('compatibility: 3.1'),result.stdout.index('INSTALL:3.1'))
                    self.assertLess(result.stdout.index('INSTALL:3.1'),result.stdout.index('ROUTE'))
                    self.assertIn('SET:network.awg0.awg_random_trailers=1',result.stdout)
                else:
                    self.assertNotIn('INSTALL:',result.stdout)
                    self.assertNotIn('SET:',result.stdout)
                    self.assertNotIn('ROUTE',result.stdout)

    def test_package_dispatcher_refreshes_incompatible_installed_packages(self):
        installer=function('install_awg_packages')
        start=installer.index('    install_awg_with_ipk_release() {')
        end=installer.index('\n    AWG_UPGRADE_PACKAGES=0',start)
        installer=installer[:start]+r'''    install_awg_with_ipk_release() {
            printf 'REFRESH:%s\n' "$AWG_UPGRADE_PACKAGES"
            TEST_CAPABILITY=3.1
        }
''' +installer[end:]
        # Isolate package dispatch from the actual router filesystem and tools.
        start=installer.index('    awg_already_installed() {')
        end=installer.index('    awg_verify_install() {',start)
        installer=installer[:start]+'    awg_already_installed() { return 0; }\n'+installer[end:]
        script=installer+'''
detect_pkg_manager() { PKG_MANAGER=opkg; }
awg_installed_generation() { echo "$TEST_CAPABILITY"; }
AWG_PROFILE_VERSION=3.1
TEST_CAPABILITY=2.0
install_awg_packages
'''
        result=self.shell(script)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('REFRESH:1',result.stdout)
        self.assertIn('package capability: 3.1',result.stdout)

    def test_package_dispatcher_reuses_31_for_a_15_profile(self):
        installer=function('install_awg_packages')
        start=installer.index('    awg_already_installed() {')
        end=installer.index('    awg_verify_install() {',start)
        installer=installer[:start]+'    awg_already_installed() { return 0; }\n'+installer[end:]
        result=self.shell(installer+'''
detect_pkg_manager() { PKG_MANAGER=opkg; }
awg_installed_generation() { echo 3.1; }
AWG_PROFILE_VERSION=1.5
install_awg_packages
''')
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('support 3.1; installation is skipped',result.stdout)
        self.assertNotIn('Installing AmneziaWG packages',result.stdout)

if __name__=='__main__': unittest.main()
