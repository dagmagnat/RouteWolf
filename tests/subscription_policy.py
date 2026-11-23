#!/usr/bin/env python3
"""Prove that kernel policy expires even if the monitor cannot clean up."""
from pathlib import Path
from subprocess import DEVNULL, run
import os
import time

root = Path(__file__).resolve().parents[1]
controller = (root / 'subscription/controller.sh').read_text(encoding='utf-8')
functions = controller[:controller.rindex('case "${1:-}"')]
prefix = f'rwsub-{os.getpid()}'
client, router, origin = (f'{prefix}-{role}' for role in ('client', 'router', 'origin'))


def command(*args, **kwargs):
    return run(args, check=True, **kwargs)


def inside(namespace, *args, **kwargs):
    return command('ip', 'netns', 'exec', namespace, *args, **kwargs)


def address(namespace, dev, cidr):
    inside(namespace, 'ip', 'addr', 'add', cidr, 'dev', dev)
    inside(namespace, 'ip', 'link', 'set', dev, 'up')


def ping(expected):
    result = run(['ip','netns','exec',client,'ping','-c','1','-W','1','198.51.100.2'],
                 stdout=DEVNULL, stderr=DEVNULL)
    assert (result.returncode == 0) == expected


try:
    for namespace in client, router, origin:
        command('ip', 'netns', 'add', namespace)
        inside(namespace, 'ip', 'link', 'set', 'lo', 'up')
    inside(router, 'ip', 'link', 'add', 'br-lan', 'type', 'veth', 'peer', 'name', 'client0', 'netns', client)
    inside(router, 'ip', 'link', 'add', 'wan', 'type', 'veth', 'peer', 'name', 'origin0', 'netns', origin)
    inside(router, 'ip', 'link', 'add', 'rwsub0', 'type', 'dummy')
    inside(router, 'ip', 'link', 'set', 'rwsub0', 'up')
    address(client, 'client0', '192.168.77.2/24')
    address(router, 'br-lan', '192.168.77.1/24')
    address(router, 'wan', '10.9.0.1/24')
    address(origin, 'origin0', '10.9.0.2/24')
    address(origin, 'lo', '198.51.100.2/32')
    inside(client, 'ip', 'route', 'add', 'default', 'via', '192.168.77.1')
    inside(router, 'ip', 'route', 'add', 'default', 'via', '10.9.0.2')
    inside(origin, 'ip', 'route', 'add', 'default', 'via', '10.9.0.1')
    inside(router, 'sysctl', '-qw', 'net.ipv4.ip_forward=1')
    ping(True)
    inside(router, 'sh', '-ec', functions + '\nlan=br-lan; mode=full; build_table; ensure_policy -4')
    # BusyBox ip appends a space after the table number on OpenWrt.
    inside(router, 'sh', '-ec', functions + '''
ip() {
    if [ "$2" = rule ] && [ "$3" = show ]; then
        command ip "$@" | sed 's/$/ /'
    else
        command ip "$@"
    fi
}
ensure_policy -4
''')
    ping(True)
    inside(router, 'nft', '-f', '-', input='add element inet routewolf_subscription active_lans { "br-lan" timeout 3s }\n', text=True)
    ping(False)
    time.sleep(3)
    ping(True)
    table = inside(router, 'ip', 'route', 'show', 'table', '190', capture_output=True, text=True).stdout
    assert 'default dev rwsub0' in table
    inside(router, 'sh', '-ec', functions + '\nremove_routing; lan=br-lan; mode=routewolf; build_table; ensure_policy -4')
    inside(router, 'nft', '-f', '-', input='add element inet routewolf_subscription active_lans { "br-lan" }\n', text=True)
    ping(True)
    inside(router, 'nft', '-f', '-', input='''
table inet routewolf_test_mark {
    chain lists {
        type filter hook prerouting priority -150; policy accept;
        ip daddr 198.51.100.2 meta mark set 0x1
    }
}
''', text=True)
    ping(False)
finally:
    for namespace in client, router, origin:
        run(['ip','netns','del',namespace], stdout=DEVNULL, stderr=DEVNULL)
