"""Exercise the backup worker with fake interfaces without touching host routes."""

from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest


WORKER = (Path(__file__).resolve().parents[1] / 'luci-app-routewolf'
          / 'root/usr/libexec/routewolf-ui/backup.sh')


class LuCIBackupTests(unittest.TestCase):
    def test_primary_loss_backup_failure_and_primary_recovery(self):
        with tempfile.TemporaryDirectory(prefix='routewolf-backup-') as directory:
            work = shlex.quote(Path(directory).as_posix())
            worker, _, _ = WORKER.read_text(encoding='utf-8').rpartition('\ncase ')
            worker = (worker.replace('/var/run/routewolf-ui-backup', '$fixture/run')
                      .replace('/tmp/routewolf-ui-job', '$fixture/job')
                      .replace('/usr/libexec/routewolf-ui/backup-proxy.sh', '"$fixture/backup-proxy.sh"')
                      .replace('/sys/class/net/', '$fixture/net/'))
            fixture = r'''
exec 3>&1
cycle=1
read_settings() { dev="$fixture_device"; primary="$fixture_primary"; mode=routewolf; lan=lan; }
ensure_policy() { return 0; }
primary_healthy() { [ "$cycle" -eq 1 ] || [ "$cycle" -eq 7 ]; }
duplicate_interface() { return 1; }
status() { printf '%s:%s\n' "$cycle" "$1"; }
release() {
    if [ -d "$fixture/net/$fixture_device" ]; then
        rmdir "$fixture/net/$fixture_device"
        printf '%s:ifdown\n' "$cycle"
    fi
}
start_device() {
    mkdir -p "$fixture/net/$1"
    printf '%s:ifup\n' "$cycle" >&3
}
probe() { [ "$cycle" -eq 5 ]; }
renew() { printf '%s:%s\n' "$cycle" "$1"; }
clear_lease() { if [ "$1" = active_lans ]; then printf '%s:lease-cleared\n' "$cycle"; fi; }
sleep() {
    [ "$cycle" -lt 7 ] || exit 0
    cycle=$((cycle+1))
}
monitor
'''
            for primary, backup in [('rwsub0', 'awgrwb'), ('awgui0', 'awgrwb'),
                                    ('awgui0', 'tunrwb'), ('awgui0', 'rwsubb0')]:
                with self.subTest(primary=primary, backup=backup):
                    script = (f'fixture={work}\nfixture_primary={primary}\nfixture_device={backup}\n'
                              f'{worker}\n{fixture}')
                    result = subprocess.run(['sh'], input=script, text=True,
                                            capture_output=True, timeout=12)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    before = ['1:primary_lans'] if primary != 'rwsub0' else []
                    after = ['7:primary_lans'] if primary != 'rwsub0' else []
                    self.assertEqual(result.stdout.splitlines(), [
                        *before, '1:waiting', '2:checking', '3:checking', '4:checking',
                        '5:ifup', '5:active_lans', '5:active', '6:lease-cleared', '6:wan',
                        '7:ifdown', *after, '7:waiting',
                    ])
