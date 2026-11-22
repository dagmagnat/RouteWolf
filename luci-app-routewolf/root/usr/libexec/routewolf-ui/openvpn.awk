BEGIN {
    # Only client transport and cryptographic options. Reject hooks, external
    # credential paths, management endpoints and chained configuration files.
    n=split("client pull tls-client proto remote remote-random remote-random-hostname nobind resolv-retry connect-retry connect-retry-max connect-timeout ping ping-restart keepalive persist-key persist-tun remote-cert-tls verify-x509-name tls-version-min tls-version-max tls-cipher tls-ciphersuites key-direction auth auth-nocache cipher data-ciphers data-ciphers-fallback verb mute tun-mtu mssfix explicit-exit-notify sndbuf rcvbuf push-peer-info comp-lzo compress allow-compression", names," ")
    for(i=1;i<=n;i++) allowed[names[i]]=1
}
{
    sub(/\r$/,"")
    line=$0
    sub(/^[ \t]+/,"",line); sub(/[ \t]+$/,"",line)
    if(block!="") {
        if(line=="</" block ">") block=""
        else if(line~/^<\/?[a-z-]+>$/) { failed=1; exit }
        print
        next
    }
    if(line=="" || line~/^[#;]/) next
    if(line~/^<(ca|cert|key|tls-auth|tls-crypt|tls-crypt-v2|auth-user-pass)>$/) {
        block=substr(line,2,length(line)-2); print line; next
    }
    split(line, words, /[ \t]+/)
    opt=words[1]
    if(opt=="dev") { if(words[2]!~/^tun[0-9]*$/) { failed=1; exit }; next }
    if(opt=="dev-type") { if(words[2]!="tun") { failed=1; exit }; next }
    if(opt~/^(redirect-gateway|redirect-private|route|route-ipv6|route-nopull|route-noexec|dhcp-option|block-outside-dns|register-dns|setenv|disable-dco)$/) next
    if(!(opt in allowed) || line~/\\[ \t]*$/) { failed=1; exit }
    if(opt=="remote") remote=1
    print line
}
END { if(failed || block!="" || !remote) exit 1 }
