#!/usr/bin/env python3
"""Build the Linux subscription helpers, keeping them out of the installer archive."""
import argparse
import gzip
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor

TARGETS = {
    'amd64': ('amd64', {}),
    'arm64': ('arm64', {}),
    'armv7': ('arm', {'GOARM': '7'}),
    'mipsle': ('mipsle', {'GOMIPS': 'softfloat'}),
    'mips': ('mips', {'GOMIPS': 'softfloat'}),
}


def build_item(item, compiler, sources, output):
    name, (architecture, tuning) = item
    environment = os.environ | {'CGO_ENABLED': '0', 'GOOS': 'linux', 'GOARCH': architecture} | tuning
    with tempfile.TemporaryDirectory() as scratch:
        executable = Path(scratch) / 'subscription'
        subprocess.run(
            [compiler, 'build', '-trimpath', '-ldflags', '-s -w', '-o', executable, *sources],
            env=environment, check=True,
        )
        compressed = gzip.compress(executable.read_bytes(), mtime=0)
    asset = f'routewolf-subscription-{name}.gz'
    (output / asset).write_bytes(compressed)
    return f'{hashlib.sha256(compressed).hexdigest()}  {asset}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--go', default='go')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    source_dir = Path(__file__).resolve().parent
    sources = [source_dir / name for name in ('main.go', 'compile.go', 'vless.go')]
    with ThreadPoolExecutor(len(TARGETS)) as pool:
        checksums = list(pool.map(lambda entry: build_item(entry, args.go, sources, args.output), TARGETS.items()))
    (args.output / 'SHA256SUMS').write_text('\n'.join(checksums) + '\n', encoding='ascii', newline='\n')


if __name__ == '__main__':
    main()
