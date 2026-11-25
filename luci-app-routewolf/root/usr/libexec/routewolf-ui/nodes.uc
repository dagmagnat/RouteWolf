import { readfile, writefile } from 'fs';
import { sha256 } from 'digest';

let config = json(readfile(ARGV[1]));
let names = ARGV[0] == 'list' && ARGV[2] ? json(readfile(ARGV[2])) : {};
let matches = [];
let seen = {};
for (let node in config.outbounds) {
    if (!match(node.tag || '', /^rw-(node|vless)-[0-9]+$/))
        continue;
    let server = node.protocol == 'vless' ? node.settings.vnext[0] : node;
    let address = server.address || server.server;
    let port = server.port || server.server_port;
    let identity = {};
    for (let key in node)
        if (key != 'tag') identity[key] = node[key];
    let id = sha256(sprintf('%J', identity));
    if (seen[id]) continue;
    seen[id] = true;
    push(matches, {
        id,
        tag: node.tag,
        label: names[node.tag] || sprintf('%s:%s', address, port),
        named: !!names[node.tag],
        transport: node.streamSettings?.network || node.transport?.type || node.type || 'vless'
    });
}
if (ARGV[0] == 'list') {
    for (let node in matches) delete node.tag;
    print(sprintf('%J', matches), '\n');
    exit(0);
}
let preferred = null;
for (let node in matches)
    if (node.id == ARGV[2]) { preferred = node; break; }
if (!preferred)
    exit(0);

if (ARGV[3] == 'xray') {
    if (length(matches) < 2) exit(0);
    let reserve = ARGV[4] == 'reserve';
    let check = config.inbounds[1];
    push(config.inbounds, {
        ...check, tag: 'rw-preferred-check', port: reserve ? 18686 : 18685
    });
    config.api = {
        tag: 'rw-control', listen: reserve ? '127.0.0.1:18688' : '127.0.0.1:18687',
        services: [ 'RoutingService' ]
    };
    unshift(config.routing.rules, {
        type: 'field', ruleTag: 'rw-preferred',
        inboundTag: [ 'rw-preferred-check' ], outboundTag: preferred.tag
    });
}
else {
    for (let group in config.outbounds) {
        if (group.type != 'selector' || index(group.outbounds, preferred.tag) < 0)
            continue;
        group.outbounds = [ preferred.tag, ...filter(group.outbounds, (tag) => tag != preferred.tag) ];
    }
}
if (!writefile(ARGV[5], sprintf('%.2J', config)))
    exit(1);
