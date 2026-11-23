"""Exercise the backup worker with fake interfaces without touching host routes."""

from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest


WORKER = (Path(__file__).resolve().parents[1] / 'luci-app-routewolf'
          / 'root/usr/libexec/routewolf-ui/backup.sh')


class LuCIBackupTests(unittest.TestCase):
    def test_only_one_tunnel_runs_during_failover_and_primary_recovery(self):
        with tempfile.TemporaryDirectory(prefix='routewolf-backup-') as directory:
            work = shlex.quote(Path(directory).as_posix())
            worker, _, _ = WORKER.read_text(encoding='utf-8').rpartition('\ncase ')
            worker = (worker.replace('/var/run/routewolf-ui-backup', '$fixture/run')
                      .replace('/usr/libexec/routewolf-ui/subscription-refresh.sh', '"$fixture/subscription-refresh.sh"')
                      .replace('/tmp/routewolf-watchdog.lock', '$fixture/watchdog')
                      .replace('/tmp/routewolf-ui-job', '$fixture/job')
                      .replace('/usr/libexec/routewolf-ui/backup-proxy.sh', '"$fixture/backup-proxy.sh"')
                      .replace('$(cut -d. -f1 /proc/uptime)', '$((cycle*120))'))
            fixture = r'''
exec 3>&1
cycle=1
retry_primary_seconds=120
mkdir -p "$fixture/net/$fixture_primary"
read_settings() { dev="$fixture_device"; primary="$fixture_primary"; mode=routewolf; lan=lan; }
ensure_policy() { return 0; }
primary_healthy() { [ "$cycle" -eq 1 ] || [ "$cycle" -eq 7 ]; }
duplicate_interface() { return 1; }
status() { printf '%s:%s\n' "$cycle" "$1"; }
setting() { :; }
owned() { return 0; }
clear_primary_probe() { :; }
ip() { :; }
link_active() { [ -d "$fixture/net/$1" ]; }
control_device() {
    if [ "$2" = start ]; then
        if [ -n "$(ls -A "$fixture/net")" ]; then
            printf 'overlap: %s\n' "$1" >&2
            exit 55
        fi
        mkdir "$fixture/net/$1"
        printf '%s:start:%s\n' "$cycle" "$1" >&3
    elif link_active "$1"; then
        [ "$block_stop" != "$cycle" ] || return 1
        rmdir "$fixture/net/$1"
        printf '%s:stop:%s\n' "$cycle" "$1" >&3
    fi
}
probe() { return 0; }
renew() { printf '%s:%s\n' "$cycle" "$1"; }
clear_lease() { :; }
sleep() {
    # Simulate the proxy's asynchronous health publication without advancing the outer loop.
    [ "$1" != 1 ] || return 0
    [ "$cycle" -lt 7 ] || exit 0
    cycle=$((cycle+1))
}
monitor
'''
            Path(directory, 'subscription-refresh.sh').write_bytes(
                WORKER.with_name('subscription-refresh.sh').read_bytes())
            for primary, backup in [('rwsub0', 'awgrwb'), ('awgui0', 'awgrwb'),
                                    ('awgui0', 'tunrwb'), ('awgui0', 'rwsubb0')]:
                with self.subTest(primary=primary, backup=backup):
                    # Simulate the optional hourly refresh of a proxy backup.
                    Path(directory, 'backup-proxy.sh').write_text('exit 0\n', encoding='utf-8')
                    script = (f'fixture={work}\nfixture_primary={primary}\nfixture_device={backup}\n'
                              f'block_stop=5\n{worker}\n{fixture}')
                    result = subprocess.run(['sh'], input=script, text=True,
                                            capture_output=True, timeout=12)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertNotIn('overlap', result.stderr)
                    before = ['1:primary_lans'] if primary != 'rwsub0' else []
                    after = ['7:primary_lans'] if primary != 'rwsub0' else []
                    self.assertEqual(result.stdout.splitlines(), [
                        *before, '1:waiting', '2:checking', '3:checking',
                        f'4:stop:{primary}', f'4:start:{backup}', '4:active_lans', '4:active',
                        '5:active_lans', '5:active',
                        f'6:stop:{backup}', '6:checking', f'6:start:{primary}',
                        f'6:stop:{primary}', f'6:start:{backup}', '6:active_lans', '6:active',
                        f'7:stop:{backup}', '7:checking', f'7:start:{primary}', *after, '7:waiting',
                    ])
                    for path in (Path(directory, 'net', primary), Path(directory, 'run')):
                        if path.name == 'run':
                            for file in path.iterdir():
                                file.unlink()
                        path.rmdir()
