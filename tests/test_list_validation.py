"""Execute the real generated list normalizers using temporary data files.

These tests need no root, network, nftables, Python or other additions on the
router. Python is only the host-side test runner.
"""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import ipaddress
import random

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from build_release import runtime_files

SHELL = shutil.which('sh') or r'C:\Program Files\Git\bin\bash.exe'


class ListValidationTests(unittest.TestCase):
    def normalize(self, family, content, ipv6=0):
        with tempfile.TemporaryDirectory(prefix='rw-list-') as directory:
            root = Path(directory)
            service = root / 'service'
            service.write_bytes(runtime_files()['etc/init.d/routewolf'])
            (root / 'input').write_text(content, encoding='utf-8', newline='\n')
            environment = dict(os.environ, TEST_ROOT=root.as_posix(), FAMILY=family, IPV6=str(ipv6))
            script = '''
. "$TEST_ROOT/service"
IPV6_SUPPORT=$IPV6
VALIDATION_REPORT=$TEST_ROOT/report
case "$FAMILY" in
 domains) normalize_domain_list "$TEST_ROOT/input" "$TEST_ROOT/output";;
 ipv4) normalize_ipv4_cidr_list "$TEST_ROOT/input" "$TEST_ROOT/output";;
 ipv6) normalize_ipv6_cidr_list "$TEST_ROOT/input" "$TEST_ROOT/output";;
esac
'''
            result = subprocess.run([SHELL, '-c', script], env=environment, capture_output=True, timeout=20)
            output = (root / 'output').read_text(encoding='utf-8') if (root / 'output').exists() else ''
            report = (root / 'report').read_text(encoding='utf-8') if (root / 'report').exists() else ''
            return result.returncode, output, report, result.stderr.decode('utf-8')

    def test_domain_labels_numeric_addresses_and_length(self):
        content = ('Example.COM\nhttp://www.example.org/path\n*.good.example\n'
                   'bad..example\n-bad.example\nbad-.example\n111.111.111.111\n'
                   'a_b.example\nlocalhost\nwrong.example:abc\n' + 'a'*64 + '.example\n')
        code, out, report, error = self.normalize('domains', content)
        self.assertEqual(code, 0, error)
        self.assertEqual(out.splitlines(), [
            'nftset=/example.com/4#inet#fw4#vpn_domains',
            'nftset=/good.example/4#inet#fw4#vpn_domains',
            'nftset=/www.example.org/4#inet#fw4#vpn_domains'])
        self.assertIn('rejected=8', report)
        self.assertIn('line=7', report)
        self.assertIn('ip-or-numeric-tld-not-domain', report)

    def test_dnsmasq_own_directives_validate_each_domain(self):
        code, out, report, error = self.normalize('domains',
            'nftset=/Example.COM/bad..name/4#inet#fw4#vpn_domains\nexample.com.\n', ipv6=1)
        self.assertEqual(code, 0, error)
        self.assertEqual(out.splitlines(), [
            'nftset=/example.com/4#inet#fw4#vpn_domains',
            'nftset=/example.com/6#inet#fw4#vpn_domains6'])
        self.assertIn('invalid-label', report)
        self.assertIn('duplicates=1', report)

    def test_foreign_dns_directives_are_fatal(self):
        for directive in ('server=/#/192.0.2.1', 'conf-file=/etc/config/network',
                          'nftset=/example.com/4#inet#fw4#admin_whitelist'):
            with self.subTest(directive=directive):
                code, out, report, error = self.normalize('domains', 'good.example\n' + directive + '\n')
                self.assertNotEqual(code, 0, error)
                self.assertEqual(out, '')
                self.assertIn('fatal=1', report)

    def test_comments_bom_controls_and_shell_like_text_are_not_executed(self):
        code, out, report, error = self.normalize('domains', '# comment.example\r\n'
            'good.example # ignored.example\n\ufeffbroken.example\n'
            'evil\x1b[31m.example\n$(touch /tmp/should-not-run)\n')
        self.assertEqual(code, 0, error)
        self.assertEqual(out, 'nftset=/good.example/4#inet#fw4#vpn_domains\n')
        self.assertNotIn('\x1b', report)

    def test_ipv4_host_bits_are_rejected_without_widening(self):
        code, out, report, error = self.normalize('ipv4',
            '111.111.111.111/24\n111.111.111.111\n999.1.2.3\n'
            '1.2.3.4/33\n1.2.3.4/-1\n001.2.3.4\n')
        self.assertEqual(code, 0, error)
        self.assertEqual(out, '111.111.111.111/32\n')
        self.assertIn('host-bits-set_expected=111.111.111.0/24', report)
        self.assertIn('rejected=5', report)

    def test_ipv4_duplicate_and_nested_subnets_are_collapsed(self):
        code, out, report, error = self.normalize('ipv4',
            '203.0.113.1\n203.0.113.0/24\n203.0.113.0/25\n'
            '203.0.113.0/24\n203.0.114.0/24\n')
        self.assertEqual(code, 0, error)
        self.assertEqual(out, '203.0.113.0/24\n203.0.114.0/24\n')
        self.assertIn('duplicate-or-covered=3', report)

    def test_ipv4_special_destinations_and_broad_networks(self):
        code, out, report, error = self.normalize('ipv4',
            '0.0.0.0/0\n127.0.0.1\n169.254.0.0/16\n224.0.0.0/24\n'
            '255.255.255.255\n10.1.0.0/16\n100.64.1.0/24\n')
        self.assertEqual(code, 0, error)
        self.assertEqual(out, '10.1.0.0/16\n100.64.1.0/24\n')
        self.assertIn('network-too-wide', report)
        self.assertIn('non-unicast-or-link-local', report)

    def test_invalid_token_does_not_skip_other_tokens_on_same_line(self):
        code, out, report, error = self.normalize('ipv4', '1.2.3.4/99 111.111.111.111,203.0.113.7\n')
        self.assertEqual(code, 0, error)
        self.assertEqual(out, '111.111.111.111/32\n203.0.113.7/32\n')

    def test_ipv6_expansion_compression_and_duplicate_forms(self):
        code, out, report, error = self.normalize('ipv6',
            '2001:0DB8:0000:0000:0000:0000:0000:0001\n2001:db8::1/128\n'
            '2001:db8:0:1:0:0:0:1\n::ffff:111.111.111.111\n')
        self.assertEqual(code, 0, error)
        self.assertEqual(out.splitlines(), ['::ffff:6f6f:6f6f/128', '2001:db8::1/128', '2001:db8:0:1::1/128'])
        self.assertIn('duplicate-or-covered=1', report)

    def test_ipv6_invalid_groups_prefixes_and_host_bits(self):
        content = ('2001:::db8\n2001:db8::1::2\n12345::\n2001:db8::/129\n'
                   '2001:db8::1/64\n2001:db8:1:2:3:4:5\n::ffff:999.1.2.3\n'
                   'fe80::1\nff02::1\n::\n::1\n2001:db8::/32\n')
        code, out, report, error = self.normalize('ipv6', content)
        self.assertEqual(code, 0, error)
        self.assertEqual(out, '2001:db8::/32\n')
        self.assertIn('rejected=11', report)

    def test_ipv6_containment_handles_partial_hextet_and_nibble_prefixes(self):
        code, out, report, error = self.normalize('ipv6',
            '2001:db8::/33\n2001:db8:1000::/36\n2001:db8:8000::/33\n2001:db8:9000::/36\n')
        self.assertEqual(code, 0, error)
        self.assertEqual(out, '2001:db8::/33\n2001:db8:8000::/33\n')

    def test_rejection_report_is_bounded(self):
        code, out, report, error = self.normalize('domains', 'bad..example\n' * 1000)
        self.assertEqual(code, 0, error)
        self.assertEqual(out, '')
        self.assertEqual(report.count('REJECT domains'), 50)
        self.assertIn('rejected=1000', report)

    def test_comments_only_lists_can_intentionally_be_empty(self):
        for family in ('domains', 'ipv4', 'ipv6'):
            code, out, report, error = self.normalize(family, '# deliberately empty\n\r\n')
            self.assertEqual(code, 0, error)
            self.assertEqual(out, '')

    def test_random_ipv6_containment_matches_ipaddress_without_widening(self):
        rng = random.Random(59)
        networks = []
        for _ in range(80):
            number = (0x20010DB8 << 96) | rng.getrandbits(96)
            network = ipaddress.IPv6Network((number, rng.randrange(32, 129)), strict=False)
            networks.extend((network, ipaddress.IPv6Network((int(network.network_address), 128))))
        expected = {str(n) for n in networks if not any(n != other and n.subnet_of(other) for other in networks)}
        code, out, report, error = self.normalize('ipv6', '\n'.join(map(str, networks)) + '\n')
        self.assertEqual(code, 0, error)
        self.assertEqual(set(out.splitlines()), expected)


if __name__ == '__main__':
    unittest.main()
