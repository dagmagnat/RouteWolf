function has_suffix(value, suffix) {
    return value == suffix || (length(value) > length(suffix) &&
        substr(value,length(value)-length(suffix),1) == "." &&
        substr(value,length(value)-length(suffix)+1) == suffix)
}
function member(value, names,    i, count, suffixes) {
    count=split(names,suffixes," ")
    for(i=1;i<=count;i++)
        if(has_suffix(value,suffixes[i])) return 1
    return 0
}
BEGIN {
    query=tolower(query)
    youtube="youtube.com youtu.be googlevideo.com ytimg.com youtube-nocookie.com youtube-tv.com withyoutube.com yt.be youtubei.googleapis.com youtube.googleapis.com youtubeembedding.googleapis.com"
    meta="facebook.com facebook.net facebook.org fb.com fb.me fb.gg fbcdn.net fbcdn.com fbcdn-sphotos-a.akamaihd.net fbsbx.com instagram.com cdninstagram.com whatsapp.com whatsapp.net wa.me messenger.com threads.net meta.com"
    telegram="t.me telegram.org telegram.me telegram.dog telegra.ph telesco.pe tdesktop.com telegram.space"
    # Exact published Telegram CIDRs. Only entries also present in the active
    # RouteWolf library are included. Shared IPs are never assigned by name.
    # https://core.telegram.org/resources/cidr.txt
    n=split("91.108.56.0/22 91.108.4.0/22 91.108.8.0/22 91.108.16.0/22 91.108.12.0/22 149.154.160.0/20 91.105.192.0/23 91.108.20.0/22 185.76.151.0/24 2001:b28:f23d::/48 2001:b28:f23f::/48 2001:67c:4e8::/48 2001:b28:f23c::/48 2a0a:f280::/32", tmp, " ")
    for(i=1;i<=n;i++) telegram_ip[tmp[i]]=1
}
{
    kind=FILENAME
    sub(/^.*\//,"",kind)
    sub(/\.lst$/,"",kind)
    item=tolower($0)
    if(kind=="domains") {
        if(item !~ /^nftset=\//) next
        sub(/^nftset=\//,"",item)
        sub(/\/.*/,"",item)
        if(item !~ /^[a-z0-9.-]+$/ || length(item)>253) next
    } else if(item !~ /^[a-f0-9.:\/]+$/ || length(item)>50) next

    if(query!="" && !index(item,query)) next
    if(group!="all") {
        if(kind!="domains") {
            if(group!="telegram" || !(item in telegram_ip)) next
        } else if(group=="4pda" && !member(item, "4pda.ru 4pda.to 4pda.ws")) next
        else if(group=="youtube" && !member(item,youtube) &&
            item !~ /(^|\.)youtube\.(com\.[a-z][a-z]|co\.[a-z][a-z]|[a-z][a-z])$/) next
        else if(group=="telegram" && !member(item,telegram)) next
        else if(group=="meta" && !member(item,meta) &&
            item !~ /(^|\.)facebook\.(com\.[a-z][a-z]|[a-z][a-z])$/) next
    }
    if(seen[kind SUBSEP item]++) next
    count++
    if(count>offset && count<=offset+limit) print kind, item
}
END { print count+0 }
