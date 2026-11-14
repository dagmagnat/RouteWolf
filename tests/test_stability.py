"""Run only in the isolated test container: creates disposable OpenWrt fixtures.

Uses real nftables/netlink in the container's own network namespace. Never run
this suite on an actual router or a host with production firewall rules.
"""
from pathlib import Path
import hashlib
import io
import json
import os
import shutil
import subprocess
import tarfile
import unittest
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from build_release import FILES, VERSION, runtime_files

def call(*args, check=False):
    return subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=check, timeout=35)

def write(path, content, executable=False):
    p=Path(path); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8'); p.chmod(0o755 if executable else 0o600)

def nft(text):
    return subprocess.run(['nft','-f','-'],input=text,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=10)

MOCK = r'''#!/usr/bin/python3
from pathlib import Path
import sys,json,os,shutil,subprocess
name=Path(sys.argv[0]).name;args=sys.argv[1:]
log=Path('/tmp/rw-actions')
def event(s):
 with log.open('a') as f:f.write(s+'\n')
def state():return json.loads(Path('/etc/config/firewall').read_text())
if name=='uci':
 if args and args[0]=='-q':args=args[1:]
 command=args[0]
 if command=='changes':
  if Path('/tmp/rw-pending').exists():print('firewall.pending=1')
 elif command=='show':
  for i,s in enumerate(state()['sets']):
   print("firewall.@ipset[%s].name='%s'"%(i,s['name']))
   print("firewall.@ipset[%s].match='%s'"%(i,s['match']))
 elif command=='get':
  import re
  m=re.fullmatch(r'firewall\.@ipset\[(\d+)\]\.(match|name)',args[1])
  if m:print(state()['sets'][int(m[1])][m[2]])
  else:sys.exit(1)
 elif command=='set':
  import re
  m=re.fullmatch(r'firewall\.@ipset\[(\d+)\]\.match=(.*)',args[1]);s=state()
  if not m:sys.exit(1)
  s['sets'][int(m[1])]['match']=m[2];Path('/etc/config/firewall').write_text(json.dumps(s))
 elif command=='commit':event('uci commit')
 else:sys.exit(1)
elif name=='fw4':
 event('fw4 '+args[0])
 if args[0]=='check':sys.exit(1 if Path('/tmp/rw-fail-check').exists() else 0)
 if args[0]=='reload':sys.exit(1 if Path('/tmp/rw-fail-reload').exists() else 0)
 if args[0]=='print':
  s=state()['sets'][0];flags='flags interval; auto-merge;' if s['match']=='dst_net' else ''
  print('table inet fw4 { set vpn_domains { type ipv4_addr; '+flags+' }; chain mangle_prerouting { ip daddr @vpn_domains counter meta mark set 1 comment "!fw4: mark_domains"; }; }')
elif name=='curl':
 event('curl '+' '.join(args))
 if '--interface' in args:
  sys.exit(7 if Path('/tmp/rw-tunnel-bad').exists() else 0)
 out=args[args.index('-o')+1];url=next((a for a in args if a.startswith('https://')),'')
 if Path('/tmp/rw-fail-download').exists():sys.exit(60)
 source=Path('/tmp/rw-downloads')/url.rsplit('/',1)[-1]
 if not source.exists():sys.exit(22)
 shutil.copyfile(source,out)
elif name=='df':
 free='1024' if Path('/tmp/rw-low-flash').exists() else ('5120' if Path('/tmp/rw-five-mib-flash').exists() else '24000')
 print('Filesystem 1024-blocks Used Available Capacity Mounted on\nfixture 64000 10000 '+free+' 20% /overlay')
elif name=='ip':
 if args==['route','show','default']:print('default via 192.0.2.1 dev wan')
elif name=='pidof':print('123')
elif name=='ping':sys.exit(1 if Path('/tmp/rw-tunnel-bad').exists() else 0)
elif name in ('ifup','ifdown','sleep'):event(name+' '+' '.join(args))
elif name=='logger':pass
elif name=='dnsmasq':
 print('dnsmasq: syntax check OK.')
 sys.exit(0)
else:sys.exit(2)
'''

@unittest.skipUnless(Path('/.routewolf-test-container').exists(), 'isolated test container required')
class StabilityTests(unittest.TestCase):
    def setUp(self):
        for path in ['/etc/routewolf','/tmp/dnsmasq.d','/tmp/lst','/tmp/rw-downloads','/etc/crontabs']:
            shutil.rmtree(path,ignore_errors=True);Path(path).mkdir(parents=True)
        for p in Path('/tmp').glob('rw-*'):
            if p.is_dir():shutil.rmtree(p)
            else:p.unlink()
        for p in Path('/tmp').glob('routewolf-*'):
            if p.is_dir():shutil.rmtree(p)
            else:p.unlink()
        Path('/tmp/rw-downloads').mkdir(exist_ok=True)
        call('nft','delete','table','inet','fw4')
        self.config([{'name':'vpn_domains','match':'dst_net'}])
        write('/etc/config/network','fixture-private-key-do-not-copy\n')
        write('/etc/crontabs/root','7 4 * * * unrelated-job\n0 2 * * * /usr/sbin/routewolf-update.sh --auto\n')
        write('/etc/routewolf/runtime_version','54\n')
        write('/etc/routewolf/installed_version','v54-dco-user-choice\n')
        write('/etc/routewolf/user.conf',"DOMAINS_URL='https://lists.example/domains'\nIPV4_URL='https://lists.example/ipv4'\nIPV6_URL=''\nIPV6_SUPPORT=0\n")
        write('/tmp/rw-downloads/domains','nftset=/youtube.com/4#inet#fw4#vpn_domains\n')
        write('/tmp/rw-downloads/ipv4','203.0.113.0/24\n')
        write('/etc/rc.common','#!/bin/sh\nscript=$1; shift; . "$script"; "$@"\n',True)
        write('/etc/init.d/dnsmasq','#!/bin/sh\necho "dnsmasq $*" >> /tmp/rw-actions\n[ ! -f /tmp/rw-fail-dns ]\n',True)
        write('/etc/init.d/cron','#!/bin/sh\necho "cron $*" >> /tmp/rw-actions\n',True)
        write('/usr/sbin/routewolf-route.sh','#!/bin/sh\nexit 0\n',True)
        for path in FILES:
            write('/'+path,'#!/bin/sh\necho old-runtime\n',True)
        # Real nft: fixture rules have no hook, are restricted to this namespace.
        self.make_set()
        for name in ['uci','fw4','curl','df','ip','pidof','logger','dnsmasq','ping','ifup','ifdown','sleep']:
            write('/mockbin/'+name,MOCK,True)
        self.previous_path=os.environ['PATH'];os.environ['PATH']='/mockbin:'+self.previous_path
        self.bundle=Path('/tmp/test-runtime.tgz');shutil.copyfile(ROOT/f'releases/routewolf-v{VERSION}.tar.gz',self.bundle)
        self.manifest=Path('/tmp/test-release.manifest');shutil.copyfile(ROOT/'releases/stable.manifest',self.manifest)

    def tearDown(self):
        os.environ['PATH']=self.previous_path

    def config(self,sets):write('/etc/config/firewall',json.dumps({'sets':sets}))
    def make_set(self,interval=True,elements='198.51.100.1-198.51.100.3,203.0.113.7'):
        call('nft','delete','table','inet','fw4')
        flags='flags interval; auto-merge;' if interval else ''
        if not interval:elements='198.51.100.1,203.0.113.7'
        result=nft('table inet fw4 { set vpn_domains { type ipv4_addr; '+flags+' elements={'+elements+'}; }; chain mangle_prerouting { ip daddr @vpn_domains counter meta mark set 1 comment "!fw4: mark_domains"; }; }')
        self.assertEqual(result.returncode,0,result.stdout)
    def actions(self):return Path('/tmp/rw-actions').read_text() if Path('/tmp/rw-actions').exists() else ''
    def health(self,mode='repair'):return call('sh',str(ROOT/'runtime/routewolf-reliability.sh'),mode)
    def updater(self,*args):return call('sh',str(ROOT/'runtime/routewolf-stable-update.sh'),*args)
    def install_local(self):return self.updater('--local',str(self.bundle),str(self.manifest))
    def seed_lists(self):
        for path in ['/etc/routewolf/lists/domains.lst','/tmp/dnsmasq.d/domains.lst']:
            write(path,'nftset=/youtube.com/4#inet#fw4#vpn_domains\n')
        for path in ['/etc/routewolf/lists/ipv4.lst','/tmp/lst/ipv4.lst']:write(path,'203.0.113.0/24\n')
        for path in ['/etc/routewolf/lists/ipv6.lst','/tmp/lst/ipv6.lst']:write(path,'')
    def list_service(self):
        write('/usr/sbin/routewolf-fetch.sh',(ROOT/'runtime/routewolf-fetch.sh').read_text(),True)
        write('/etc/init.d/routewolf',runtime_files()['etc/init.d/routewolf'].decode(),True)
        return call('/etc/init.d/routewolf','start')
    def repack(self,mutate):
        with tarfile.open(self.bundle,'r:gz') as t:
            entries=[(i,t.extractfile(i).read() if i.isfile() else b'') for i in t.getmembers()]
        mutate(entries)
        with tarfile.open(self.bundle,'w:gz') as t:
            for i,data in entries:i.size=len(data);t.addfile(i,io.BytesIO(data) if i.isfile() else None)
        digest=hashlib.sha256(self.bundle.read_bytes()).hexdigest()
        import re
        self.manifest.write_text(re.sub(r'archive_sha256=.*','archive_sha256='+digest,self.manifest.read_text()))

    def test_migrates_real_interval_set_and_preserves_all_hosts(self):
        r=self.health();self.assertEqual(r.returncode,0,r.stdout)
        definition=call('nft','-t','list','set','inet','fw4','vpn_domains').stdout
        self.assertNotIn('interval',definition)
        for ip in ['198.51.100.1','198.51.100.2','198.51.100.3','203.0.113.7']:
            self.assertEqual(call('nft','get','element','inet','fw4','vpn_domains','{ '+ip+' }').returncode,0)
        self.assertEqual(json.loads(Path('/etc/config/firewall').read_text())['sets'][0]['match'],'dst_ip')
        self.assertEqual(self.actions().count('dnsmasq restart'),1)

    def test_healthy_hash_set_is_idempotent(self):
        self.make_set(False);self.config([{'name':'vpn_domains','match':'dst_ip'}])
        r=self.health();self.assertEqual(r.returncode,0,r.stdout);self.assertNotIn('dnsmasq restart',self.actions())
        self.assertNotEqual(call('nft','get','element','inet','fw4','vpn_domains','{ 192.0.2.254 }').returncode,0)

    def test_pending_firewall_edits_are_preserved(self):
        write('/tmp/rw-pending','yes');r=self.health();self.assertNotEqual(r.returncode,0)
        self.assertIn('interval',call('nft','-t','list','set','inet','fw4','vpn_domains').stdout)

    def test_unexpected_references_abort_without_destroying_rules(self):
        self.assertEqual(nft('add chain inet fw4 foreign; add rule inet fw4 foreign ip daddr @vpn_domains accept').returncode,0)
        self.assertNotEqual(self.health().returncode,0)
        self.assertIn('@vpn_domains',call('nft','list','chain','inet','fw4','foreign').stdout)

    def test_large_interval_refuses_unbounded_expansion(self):
        self.make_set(elements='10.0.0.0/8');r=self.health();self.assertNotEqual(r.returncode,0)
        self.assertIn('interval',call('nft','-t','list','set','inet','fw4','vpn_domains').stdout)

    def test_ipv6_single_hosts_migrate(self):
        self.make_set(False);self.config([{'name':'vpn_domains','match':'dst_ip'},{'name':'vpn_domains6','match':'dst_net'}])
        r=nft('add set inet fw4 vpn_domains6 { type ipv6_addr; flags interval; auto-merge; elements={2001:db8::1}; }; add rule inet fw4 mangle_prerouting ip6 daddr @vpn_domains6 counter meta mark set 1 comment "!fw4: mark_domains6"')
        self.assertEqual(r.returncode,0,r.stdout)
        r=self.health();self.assertEqual(r.returncode,0,r.stdout)
        self.assertNotIn('interval',call('nft','-t','list','set','inet','fw4','vpn_domains6').stdout)

    def test_missing_set_is_reported_as_failure(self):
        call('nft','delete','table','inet','fw4');self.assertNotEqual(self.health().returncode,0)

    def test_live_health_lock_is_not_stolen(self):
        write('/tmp/routewolf-domain-health.lock/pid',str(os.getpid()));self.assertEqual(self.health().returncode,75)

    def test_stale_health_lock_is_recovered(self):
        write('/tmp/routewolf-domain-health.lock/pid','99999999');r=self.health();self.assertEqual(r.returncode,0,r.stdout)

    def test_verified_local_release_installs_with_backup_and_schedule(self):
        network=Path('/etc/config/network').read_bytes();r=self.install_local();self.assertEqual(r.returncode,0,r.stdout)
        self.assertEqual(Path('/etc/routewolf/runtime_version').read_text(),f'{VERSION}\n')
        self.assertEqual(Path('/etc/config/network').read_bytes(),network)
        self.assertTrue(Path('/etc/routewolf/rollback/runtime.tgz').exists())
        cron=Path('/etc/crontabs/root').read_text();self.assertIn('0 2 * * * /usr/sbin/routewolf-update.sh --lists-auto',cron);self.assertIn('0 3 * * * /usr/sbin/routewolf-update.sh --code-auto',cron);self.assertNotIn('*/2',cron);self.assertIn('*/5 * * * *',cron);self.assertIn('unrelated-job',cron)
        self.assertFalse(Path('/etc/routewolf/pending-runtime').exists())

    def test_tampered_archive_never_overwrites_runtime(self):
        self.bundle.write_bytes(self.bundle.read_bytes()+b'tampered')
        self.assertNotEqual(self.install_local().returncode,0)
        self.assertEqual(Path('/etc/routewolf/runtime_version').read_text(),'54\n')
        self.assertIn('old-runtime',Path('/usr/sbin/rw').read_text())

    def test_unexpected_tar_entry_rejected_even_with_matching_digest(self):
        def mutate(entries):entries.append((tarfile.TarInfo('payload/../../tmp/escaped'),b'bad'))
        self.repack(mutate);self.assertNotEqual(self.install_local().returncode,0);self.assertFalse(Path('/tmp/escaped').exists())

    def test_tar_symlink_rejected_before_extract(self):
        def mutate(entries):entries[0][0].type=tarfile.SYMTYPE;entries[0][0].linkname='/tmp/escaped'
        self.repack(mutate);self.assertNotEqual(self.install_local().returncode,0)

    def test_invalid_shell_in_payload_rejected(self):
        def mutate(entries):entries[0]=(entries[0][0],b'#!/bin/sh\nif then broken\n')
        self.repack(mutate);self.assertNotEqual(self.install_local().returncode,0)

    def test_manifest_is_not_executed(self):
        self.manifest.write_text(self.manifest.read_text().replace('name=v56-nightly-releases','name=$(touch /tmp/manifest-executed)'))
        self.assertNotEqual(self.install_local().returncode,0);self.assertFalse(Path('/tmp/manifest-executed').exists())

    def test_low_flash_defers_without_changing_runtime(self):
        write('/tmp/rw-low-flash','yes');self.assertNotEqual(self.install_local().returncode,0)
        self.assertIn('old-runtime',Path('/usr/sbin/rw').read_text())

    def test_local_downgrade_is_refused(self):
        write('/etc/routewolf/runtime_version',f'{VERSION+1}\n')
        self.assertNotEqual(self.install_local().returncode,0)
        self.assertEqual(Path('/etc/routewolf/runtime_version').read_text(),f'{VERSION+1}\n')

    def test_large_expanded_payload_is_rejected_before_extract(self):
        def mutate(entries):entries[0]=(entries[0][0],b'#'+b' '*600000)
        self.repack(mutate);self.assertNotEqual(self.install_local().returncode,0)

    def test_live_list_job_defers_runtime_promotion(self):
        write('/tmp/routewolf-lists.lock/pid',str(os.getpid()))
        self.assertNotEqual(self.install_local().returncode,0)
        self.assertEqual(Path('/etc/routewolf/runtime_version').read_text(),'54\n')

    def test_local_health_failure_rolls_back_files_config_and_markers(self):
        before=Path('/etc/config/firewall').read_bytes();write('/tmp/rw-fail-check','yes')
        r=self.install_local();self.assertNotEqual(r.returncode,0,r.stdout)
        self.assertIn('old-runtime',Path('/usr/sbin/rw').read_text())
        self.assertEqual(Path('/etc/config/firewall').read_bytes(),before)
        self.assertEqual(Path('/etc/routewolf/runtime_version').read_text(),'54\n')
        self.assertEqual(Path('/etc/routewolf/failed-runtime').read_text(),f'{VERSION}\n')
        self.assertFalse(Path('/etc/routewolf/pending-runtime').exists())

    def test_manual_rollback_restores_last_version(self):
        self.assertEqual(self.install_local().returncode,0)
        r=self.updater('rollback');self.assertEqual(r.returncode,0,r.stdout)
        self.assertEqual(Path('/etc/routewolf/runtime_version').read_text(),'54\n');self.assertIn('old-runtime',Path('/usr/sbin/rw').read_text())

    def test_interrupted_update_recovers_before_new_install(self):
        self.assertEqual(self.install_local().returncode,0)
        write('/etc/routewolf/pending-runtime',f'{VERSION}\n')
        r=self.updater('--auto');self.assertEqual(r.returncode,0,r.stdout)
        self.assertEqual(Path('/etc/routewolf/runtime_version').read_text(),'54\n');self.assertFalse(Path('/etc/routewolf/pending-runtime').exists())

    def test_update_lock_blocks_parallel_installer(self):
        write('/tmp/routewolf-code-update.lock/pid',str(os.getpid()));self.assertEqual(self.install_local().returncode,75)

    def test_download_or_tls_failure_keeps_current_runtime(self):
        write('/tmp/rw-fail-download','yes');self.assertNotEqual(self.updater('--auto').returncode,0)
        self.assertEqual(Path('/etc/routewolf/runtime_version').read_text(),'54\n');self.assertNotIn(' -k',self.actions())

    def test_disabled_auto_code_still_runs_list_service(self):
        write('/etc/routewolf/update.conf','AUTO_CODE_UPDATES=0\n')
        write('/etc/init.d/routewolf','#!/bin/sh\necho lists-only >> /tmp/rw-actions\n',True)
        self.make_set(False);self.config([{'name':'vpn_domains','match':'dst_ip'}])
        write('/usr/sbin/routewolf-reliability.sh',(ROOT/'runtime/routewolf-reliability.sh').read_text(),True)
        r=self.updater('--auto');self.assertEqual(r.returncode,0,r.stdout);self.assertIn('lists-only',self.actions());self.assertNotIn('curl ',self.actions())

    def test_unchanged_lists_do_not_restart_services_or_write_cache(self):
        self.seed_lists();before=Path('/etc/routewolf/lists/domains.lst').stat().st_mtime_ns
        r=self.list_service();self.assertEqual(r.returncode,0,r.stdout)
        self.assertEqual(Path('/etc/routewolf/lists/domains.lst').stat().st_mtime_ns,before)
        self.assertNotIn('fw4 reload',self.actions());self.assertNotIn('dnsmasq restart',self.actions())

    def test_changed_lists_apply_once(self):
        self.seed_lists();write('/tmp/rw-downloads/domains','youtube.com\ngooglevideo.com\n')
        r=self.list_service();self.assertEqual(r.returncode,0,r.stdout)
        self.assertEqual(self.actions().count('fw4 reload'),1);self.assertEqual(self.actions().count('dnsmasq restart'),1)

    def test_html_response_preserves_previous_lists(self):
        self.seed_lists();write('/tmp/rw-downloads/domains','<!doctype html><html>error</html>')
        before=Path('/tmp/dnsmasq.d/domains.lst').read_bytes();r=self.list_service();self.assertNotEqual(r.returncode,0,r.stdout)
        self.assertEqual(Path('/tmp/dnsmasq.d/domains.lst').read_bytes(),before);self.assertNotIn('fw4 reload',self.actions())

    def test_arbitrary_text_cannot_erase_routing(self):
        self.seed_lists();write('/tmp/rw-downloads/domains','503 Service Unavailable\n')
        r=self.list_service();self.assertNotEqual(r.returncode,0,r.stdout);self.assertIn('youtube.com',Path('/etc/routewolf/lists/domains.lst').read_text())

    def test_second_list_failure_rolls_back_first_list(self):
        self.seed_lists();write('/tmp/rw-downloads/domains','youtube.com\ngooglevideo.com\n');write('/tmp/rw-downloads/ipv4','invalid\n')
        before=Path('/tmp/dnsmasq.d/domains.lst').read_bytes();r=self.list_service();self.assertNotEqual(r.returncode,0,r.stdout)
        self.assertEqual(Path('/tmp/dnsmasq.d/domains.lst').read_bytes(),before);self.assertEqual(Path('/etc/routewolf/lists/domains.lst').read_bytes(),before)

    def test_failed_firewall_reload_rolls_back_lists(self):
        self.seed_lists();write('/tmp/rw-downloads/domains','youtube.com\ngooglevideo.com\n');write('/tmp/rw-fail-reload','yes')
        before=Path('/tmp/dnsmasq.d/domains.lst').read_bytes();r=self.list_service();self.assertNotEqual(r.returncode,0,r.stdout)
        self.assertEqual(Path('/tmp/dnsmasq.d/domains.lst').read_bytes(),before)

    def test_offline_boot_restores_saved_cache(self):
        self.seed_lists();Path('/tmp/dnsmasq.d/domains.lst').unlink();Path('/tmp/lst/ipv4.lst').unlink();write('/tmp/rw-fail-download','yes')
        r=self.list_service();self.assertNotEqual(r.returncode,0,r.stdout)
        self.assertIn('youtube.com',Path('/tmp/dnsmasq.d/domains.lst').read_text());self.assertIn('fw4 reload',self.actions())

    def test_oversized_cidr_list_does_not_disable_existing_routes(self):
        self.seed_lists();write('/tmp/rw-downloads/ipv4','203.0.113.1/32\n203.0.113.2/32\n')
        os.environ['ROUTEWOLF_IPV4_MAX_LINES']='1'
        try:r=self.list_service()
        finally:os.environ.pop('ROUTEWOLF_IPV4_MAX_LINES')
        self.assertNotEqual(r.returncode,0,r.stdout);self.assertEqual(Path('/tmp/lst/ipv4.lst').read_text(),'203.0.113.0/24\n')

    def seed_release(self):
        shutil.copyfile(self.manifest,'/tmp/rw-downloads/stable.manifest')
        shutil.copyfile(self.bundle,f'/tmp/rw-downloads/routewolf-v{VERSION}.tar.gz')

    def test_0200_lists_never_fetch_or_install_code(self):
        self.seed_release();self.seed_lists()
        write('/etc/init.d/routewolf',runtime_files()['etc/init.d/routewolf'].decode(),True)
        write('/usr/sbin/routewolf-fetch.sh',(ROOT/'runtime/routewolf-fetch.sh').read_text(),True)
        r=self.updater('--lists-auto');self.assertEqual(r.returncode,0,r.stdout)
        self.assertNotIn('stable.manifest',self.actions());self.assertIn('old-runtime',Path('/usr/sbin/rw').read_text())

    def test_0300_code_only_does_not_refresh_lists(self):
        self.seed_release();write('/etc/routewolf/runtime_version',f'{VERSION}\n')
        r=self.updater('--code-auto');self.assertEqual(r.returncode,0,r.stdout)
        self.assertIn('/releases/latest/download/stable.manifest',self.actions())
        self.assertNotIn('https://lists.example/',self.actions());self.assertNotIn('fw4 reload',self.actions())

    def test_new_release_is_downloaded_from_its_fixed_tag(self):
        self.seed_release();r=self.updater('--code-auto');self.assertEqual(r.returncode,0,r.stdout)
        self.assertIn(f'/releases/download/v{VERSION}/routewolf-v{VERSION}.tar.gz',self.actions())
        self.assertEqual(Path('/etc/routewolf/runtime_version').read_text(),f'{VERSION}\n')

    def test_failed_release_is_not_automatically_retried(self):
        self.seed_release();write('/etc/routewolf/failed-runtime',f'{VERSION}\n')
        r=self.updater('--code-auto');self.assertEqual(r.returncode,0,r.stdout)
        self.assertNotIn(f'/routewolf-v{VERSION}.tar.gz',self.actions())

    def test_five_mib_free_flash_accepts_small_verified_release(self):
        write('/tmp/rw-five-mib-flash','yes')
        r=self.install_local();self.assertEqual(r.returncode,0,r.stdout)

    def test_untrusted_dns_server_directive_is_rejected(self):
        self.seed_lists();write('/tmp/rw-downloads/domains','server=/#/192.0.2.99\n')
        r=self.list_service();self.assertNotEqual(r.returncode,0,r.stdout)
        self.assertIn('youtube.com',Path('/tmp/dnsmasq.d/domains.lst').read_text())

    def test_foreign_firewall_set_is_rejected(self):
        self.seed_lists();write('/tmp/rw-downloads/domains','nftset=/youtube.com/4#inet#fw4#admin_whitelist\n')
        r=self.list_service();self.assertNotEqual(r.returncode,0,r.stdout)
        self.assertNotIn('admin_whitelist',Path('/tmp/dnsmasq.d/domains.lst').read_text())

    def test_corrupt_rollback_snapshot_keeps_pending_recovery(self):
        r=self.install_local();self.assertEqual(r.returncode,0,r.stdout)
        write('/etc/routewolf/pending-runtime',f'{VERSION}\n')
        backup=Path('/etc/routewolf/rollback/runtime.tgz');data=bytearray(backup.read_bytes());data[len(data)//2]^=1;backup.write_bytes(data)
        r=self.updater('recover');self.assertNotEqual(r.returncode,0,r.stdout)
        self.assertTrue(Path('/etc/routewolf/pending-runtime').exists())

    def test_legacy_v55_snapshot_without_checksum_is_still_recoverable(self):
        self.assertEqual(self.install_local().returncode,0)
        backup=Path('/etc/routewolf/rollback/runtime.tgz')
        with tarfile.open(backup,'r:gz') as t:
            entries=[(i,t.extractfile(i).read() if i.isfile() else b'') for i in t.getmembers() if i.name!='./format']
        with tarfile.open(backup,'w:gz') as t:
            for i,data in entries:t.addfile(i,io.BytesIO(data) if i.isfile() else None)
        Path('/etc/routewolf/rollback/runtime.sha256').unlink()
        self.assertEqual(self.updater('rollback').returncode,0)

    def test_user_config_quote_prevents_shell_injection(self):
        import re
        text=(ROOT/'routewolf-install.sh').read_text(encoding='utf-8')
        fn=re.search(r'singbox_shell_quote\(\) \{.*?\n\}',text,re.S).group(0)
        script=fn+'''\nprintf "DOMAINS_URL='%s'\\n" "$(singbox_shell_quote "$CUSTOM")" >/tmp/rw-quoted.conf
. /tmp/rw-quoted.conf
[ "$DOMAINS_URL" = "$CUSTOM" ]\n'''
        env=dict(os.environ,CUSTOM="https://example.test/list';touch /tmp/rw-quote-executed;: '")
        r=subprocess.run(['sh'],input=script,text=True,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        self.assertEqual(r.returncode,0,r.stdout);self.assertFalse(Path('/tmp/rw-quote-executed').exists())


@unittest.skipUnless(Path('/.routewolf-test-container').exists(), 'isolated test container required')
class RoutingTests(unittest.TestCase):
    config=StabilityTests.config
    make_set=StabilityTests.make_set
    actions=StabilityTests.actions
    def setUp(self):
        StabilityTests.setUp(self)
        Path('/mockbin/ip').unlink()
        for dev in ['rw_wan','wg0']:call('ip','link','del',dev)
        call('ip','rule','del','priority','100')
        call('ip','route','flush','table','99')
        for dev in ['rw_wan','wg0']:
            call('ip','link','add',dev,'type','dummy',check=True);call('ip','link','set',dev,'up',check=True)
        call('ip','addr','add','192.0.2.2/24','dev','rw_wan',check=True)
        call('ip','route','replace','default','via','192.0.2.1','dev','rw_wan',check=True)
        call('ip','rule','add','fwmark','1/1','table','99','priority','100',check=True)
        write('/etc/iproute2/rt_tables','255 local\n254 main\n253 default\n99 vpn\n')
        write('/etc/routewolf/route.conf',"VPN_ROUTE_DEV='wg0'\n")
        write('/etc/routewolf/watchdog.conf',"WATCHDOG_TYPE='wg'\nWATCHDOG_DEVICE='wg0'\nWATCHDOG_UCI_IFACE='wg0'\n")
        for path in ['usr/sbin/routewolf-route.sh','usr/sbin/routewolf-watchdog.sh']:
            write('/'+path,runtime_files()[path].decode(),True)

    def tearDown(self):
        for dev in ['wg0','rw_wan']:call('ip','link','del',dev)
        call('ip','rule','del','priority','100')
        StabilityTests.tearDown(self)

    def test_unreachable_up_tunnel_keeps_marked_and_unmarked_wan(self):
        write('/tmp/rw-tunnel-bad','yes')
        r=call('/usr/sbin/routewolf-watchdog.sh','check');self.assertNotEqual(r.returncode,0,r.stdout)
        self.assertEqual(call('ip','route','show','table','99').stdout.strip(),'')
        for args in [[],['mark','1']]:
            self.assertIn('dev rw_wan',call('ip','route','get','8.8.8.8',*args).stdout)
        # A hotplug/list refresh cannot undo the verified fail-open state.
        call('/usr/sbin/routewolf-route.sh',check=True)
        self.assertIn('dev rw_wan',call('ip','route','get','8.8.8.8','mark','1').stdout)

    def test_healthy_tunnel_recovery_restores_only_policy_route(self):
        write('/tmp/routewolf-tunnel-unhealthy','wg0\n')
        r=call('/usr/sbin/routewolf-watchdog.sh','check');self.assertEqual(r.returncode,0,r.stdout)
        self.assertIn('dev wg0',call('ip','route','get','8.8.8.8','mark','1').stdout)
        self.assertIn('dev rw_wan',call('ip','route','get','8.8.8.8').stdout)
        self.assertFalse(Path('/tmp/routewolf-tunnel-unhealthy').exists())

    def test_missing_interface_keeps_wan(self):
        call('ip','link','del','wg0')
        call('/usr/sbin/routewolf-route.sh',check=True)
        self.assertIn('dev rw_wan',call('ip','route','get','8.8.8.8','mark','1').stdout)

    def test_v55_counterexample_preserves_wan_but_readds_dead_policy_route(self):
        # Negative control with the actual previously published v55 scripts.
        # The finding is about marked destinations, not a claim that all WAN failed.
        with tarfile.open(ROOT/'releases/routewolf-v55.tar.gz','r:gz') as archive:
            for path in ['usr/sbin/routewolf-route.sh','usr/sbin/routewolf-watchdog.sh']:
                write('/'+path,archive.extractfile('payload/'+path).read().decode(),True)
        write('/tmp/rw-tunnel-bad','yes')
        self.assertNotEqual(call('/usr/sbin/routewolf-watchdog.sh','check').returncode,0)
        self.assertIn('dev wg0',call('ip','route','get','8.8.8.8','mark','1').stdout)
        self.assertIn('dev rw_wan',call('ip','route','get','8.8.8.8').stdout)


class SourceChecks(unittest.TestCase):
    def test_release_bytes_match_manifest_and_source(self):
        manifest=dict(line.split('=',1) for line in (ROOT/'releases/stable.manifest').read_text().splitlines())
        data=(ROOT/f'releases/routewolf-v{VERSION}.tar.gz').read_bytes();self.assertEqual(hashlib.sha256(data).hexdigest(),manifest['archive_sha256'])
        self.assertEqual(hashlib.sha256((ROOT/'runtime/routewolf-stable-update.sh').read_bytes()).hexdigest(),manifest['agent_sha256'])
        with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as t:
            for name,content in runtime_files().items():self.assertEqual(t.extractfile('payload/'+name).read(),content)

    def test_all_shell_and_extracted_runtime_has_valid_syntax(self):
        for p in list(ROOT.glob('*.sh'))+list((ROOT/'runtime').glob('*.sh')):
            self.assertNotIn(b'\r\n',p.read_bytes(),str(p))
            r=call('sh','-n',str(p));self.assertEqual(r.returncode,0,r.stdout)
        for name,data in runtime_files().items():
            r=subprocess.run(['sh','-n'],input=data,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
            self.assertEqual(r.returncode,0,(name,r.stdout))

    def test_cidr_sets_keep_interval_match_type(self):
        text=(ROOT/'routewolf-install.sh').read_text()
        self.assertIn(".name='vpn_subnets'\n            uci set firewall.@ipset[-1].match='dst_net'",text)
        self.assertIn(".name='vpn_domains'\n    uci set firewall.@ipset[-1].match='dst_ip'",text)

    def test_no_full_installer_or_insecure_tls_in_automatic_path(self):
        text=(ROOT/'update.sh').read_text().split('# RouteWolf universal bootstrapper')[0]
        self.assertNotIn('--no-check-certificate',text);self.assertNotIn('curl -k',text);self.assertNotIn('routewolf-install.sh',text)

if __name__=='__main__':unittest.main()
