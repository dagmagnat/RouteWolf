"""Exercise real XHTTP traffic between isolated loopback Xray processes."""
import argparse
import contextlib
import hashlib
import http.server
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request
import zipfile

VERSION = '26.11.9'  # OpenWrt 25.12 package source version.
LINUX_ZIP_SHA256 = 'b651f7e1d9966ee2c1b1ee1bf8b52c72771824d3065dce96bbc8bcc19ed95f82'
USER_ID = 'a3e1e0f1-2c9b-4fef-abe6-ed637842d853'
TOKEN = '1' * 48
BODY = b'RouteWolf XHTTP test over a real tunnel\n'
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0


def download_xray(directory):
    url = f'https://github.com/XTLS/Xray-core/releases/download/v{VERSION}/Xray-linux-64.zip'
    with urllib.request.urlopen(url, timeout=35) as remote:
        archive = remote.read(100_000_001)
    if hashlib.sha256(archive).hexdigest() != LINUX_ZIP_SHA256:
        raise RuntimeError('Xray test archive checksum mismatch')
    binary = directory / 'xray'
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        binary.write_bytes(bundle.read('xray'))
    binary.chmod(0o755)
    return binary


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


@contextlib.contextmanager
def start_xray(binary, config, port):
    validate_config(binary, config)
    with config.with_suffix('.log').open('wb') as log:
        child = subprocess.Popen([binary, 'run', '-c', config], stdout=log,
                                 stderr=subprocess.STDOUT, creationflags=FLAGS)
        try:
            for _ in range(50):
                if child.poll() is not None:
                    raise RuntimeError(config.with_suffix('.log').read_text(errors='replace'))
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=0.1):
                        break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError('Xray did not open its test listener')
            yield
        finally:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=3)


def validate_config(binary, config):
    checked = subprocess.run([binary, 'run', '-test', '-c', config], capture_output=True,
                             text=True, timeout=15, creationflags=FLAGS)
    if checked.returncode:
        raise RuntimeError(f'{config.name}: {checked.stdout}\n{checked.stderr}')


class Origin(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Length', str(len(BODY)))
        self.end_headers()
        self.wfile.write(BODY)

    def log_message(self, *_):
        pass


def verify(directory, xray, helper):
    server_port, socks_port = free_port(), free_port()
    while server_port == socks_port:
        socks_port = free_port()
    stream = {'network': 'xhttp', 'security': 'none',
              'xhttpSettings': {'path': '/routewolf-test', 'mode': 'packet-up'}}
    server = directory / 'server.json'
    server_config = {
        'log': {'loglevel': 'debug'},
        'inbounds': [{'listen': '127.0.0.1', 'port': server_port, 'protocol': 'vless',
                      'settings': {'clients': [{'id': USER_ID}], 'decryption': 'none'},
                      'streamSettings': stream}],
        'outbounds': [{'protocol': 'freedom'}],
    }
    source = directory / 'subscription.json'
    public_stream = stream | {'security': 'tls', 'tlsSettings': {'serverName': 'vpn.example.net'}}
    source.write_text(json.dumps({'outbounds': [{
        'protocol': 'vless', 'streamSettings': public_stream, 'settings': {'vnext': [{
            'address': 'vpn.example.net', 'port': server_port,
            'users': [{'id': USER_ID, 'encryption': 'none'}],
        }]},
    }]}), encoding='utf-8')
    token = directory / 'token'
    token.write_text(TOKEN, encoding='ascii')
    client = directory / 'client.json'
    subprocess.run([helper, 'render-xray', source, token, 'full', client],
                   check=True, timeout=10, creationflags=FLAGS)
    validate_config(xray, client)
    config = json.loads(client.read_text(encoding='utf-8'))
    assert config['outbounds'][0]['streamSettings']['network'] == 'xhttp'
    backup = directory / 'backup.json'
    worker = Path(__file__).resolve().parents[1] / 'luci-app-routewolf/root/usr/libexec/routewolf-ui/backup-proxy.sh'
    functions = worker.read_text(encoding='utf-8').rsplit('\ncase "${1:-}"', 1)[0]
    subprocess.run(['sh', '-ec', functions + '\nprepare_config "$1" "$2" xray',
                    'sh', client, backup], env={**os.environ, 'PATH': str(Path(xray).resolve().parent) +
                                               os.pathsep + os.environ['PATH']}, check=True, timeout=20)
    reserve = json.loads(backup.read_text(encoding='utf-8'))
    assert reserve['inbounds'][0]['settings']['name'] == 'rwsubb0'
    assert reserve['inbounds'][0]['settings']['gateway'][0] == '198.18.80.1/30'
    assert reserve['inbounds'][1]['port'] == 18684
    assert reserve['outbounds'] == config['outbounds']
    # Compilation deliberately rejects loopback subscription addresses. Adapt
    # the validated fixture to the isolated loopback server, without a TUN.
    config['outbounds'][0]['settings']['vnext'][0]['address'] = '127.0.0.1'
    config['outbounds'][0]['streamSettings'] = stream
    config['log']['loglevel'] = 'debug'
    config['inbounds'] = [entry for entry in config['inbounds'] if entry['protocol'] == 'socks']
    config['inbounds'][0]['port'] = socks_port
    client.write_text(json.dumps(config), encoding='utf-8')
    with http.server.ThreadingHTTPServer(('127.0.0.1', 0), Origin) as origin:
        server_config['outbounds'][0]['settings'] = {'finalRules': [
            {'action': 'allow', 'network': 'tcp', 'ip': ['127.0.0.1/32'], 'port': origin.server_port},
        ]}
        server.write_text(json.dumps(server_config), encoding='utf-8')
        thread = threading.Thread(target=origin.serve_forever, daemon=True)
        thread.start()
        try:
            with start_xray(xray, client, socks_port):
                command = ['curl', '-fsS', '--max-time', '5', '--noproxy', '',
                           '--proxy', f'socks5h://127.0.0.1:{socks_port}',
                           '--proxy-user', f'routewolf:{TOKEN}',
                           f'http://127.0.0.1:{origin.server_port}/']
                with start_xray(xray, server, server_port):
                    result = subprocess.run(command, capture_output=True, timeout=7, creationflags=FLAGS)
                    if result.returncode:
                        raise RuntimeError(result.stderr.decode(errors='replace') + '\n' +
                                           client.with_suffix('.log').read_text(errors='replace') + '\n' +
                                           server.with_suffix('.log').read_text(errors='replace'))
                    response = result.stdout
                    assert response == BODY, response
                assert subprocess.run(command, capture_output=True, timeout=7,
                                      creationflags=FLAGS).returncode != 0
        finally:
            origin.shutdown()
            thread.join(timeout=2)
    print('Real Xray: XHTTP traffic passed, and the proxy stopped forwarding when its server stopped.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--xray', type=Path)
    parser.add_argument('--helper', required=True, type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='routewolf-xhttp-') as scratch:
        directory = Path(scratch)
        verify(directory, args.xray or download_xray(directory), args.helper)
