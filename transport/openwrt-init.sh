#!/bin/sh /etc/rc.common
START=70
USE_PROCD=1

start_service() {
    procd_open_instance
    procd_set_param command /etc/routewolf-transport/transport /etc/routewolf-transport/config.json
    procd_set_param env GOMAXPROCS=2
    procd_set_param respawn 3600 5 0
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_close_instance
}
