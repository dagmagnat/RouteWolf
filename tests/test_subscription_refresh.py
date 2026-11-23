"""Check the shared subscription timer without touching router settings."""

from pathlib import Path
import subprocess
import tempfile
import unittest


SCHEDULE = (Path(__file__).resolve().parents[1] / 'luci-app-routewolf'
            / 'root/usr/libexec/routewolf-ui/subscription-refresh.sh')


class SubscriptionRefreshTests(unittest.TestCase):
    def test_interval_and_manual_request(self):
        script = SCHEDULE.read_text(encoding='utf-8') + '''
uci() {
    [ "${configured+x}" = x ] || return 1
    printf '%s\n' "$configured"
}
request=refresh-request
not_due() {
    if subscription_refresh_due "$@" "$request"; then
        printf '%s\n' 'Refresh became due too early' >&2
        exit 1
    fi
}
[ "$(subscription_interval)" = 3600 ]
not_due 3699 100
subscription_refresh_due 3700 100 "$request"
configured=5
not_due 399 100
subscription_refresh_due 400 100 "$request"
configured=15
not_due 400 100
subscription_refresh_due 1000 100 "$request"
subscription_refresh_due 100 -1 "$request"
configured=0
not_due 90000 100
not_due 90000 -1
touch "$request"
subscription_refresh_due 100 100 "$request"
for configured in '' 4 05 1441 999999999999 '5.5' 'abc'; do
    [ "$(subscription_interval)" = 3600 ]
done
configured=1440
[ "$(subscription_interval)" = 86400 ]
'''
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(['sh', '-eu'], cwd=directory, input=script,
                                    text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
