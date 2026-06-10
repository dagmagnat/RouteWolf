# routing-openwrt

Простой скрипт для OpenWrt: домены и IPv4 CIDR из списков идут через выбранный туннель, обычный интернет остаётся через WAN.

Форк и доработка оригинального проекта: https://github.com/itdoginfo/domain-routing-openwrt

## Что поддерживается

- WireGuard
- AmneziaWG / Amnezia WireGuard
- OpenVPN
- Sing-box, экспериментально: VLESS Reality через `sbtun0`

Безопасный режим по умолчанию: **fail-open**. Если туннель упал, обычный WAN-интернет не должен ломаться.

## Списки

По умолчанию используются списки из этого репозитория:

```text
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/domains-dnsmasq-nfset.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv4.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv6.lst
```

Домены и IPv4 включены по умолчанию. IPv6 выключен по умолчанию.

Списки обновляются каждый день в 02:00. Локальный список заменяется полностью: если домен или IP удалён на GitHub, после обновления он удалится и на роутере. Если GitHub временно недоступен, используется последний рабочий кеш.

## Установка с GitHub

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/install.sh | sh
```

## Обновление

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh | sh
```

Обновление не только заменяет скрипты проекта, но и сразу скачивает свежие списки из GitHub, перезапускает `dnsmasq`/`firewall` и восстанавливает маршрут `table vpn`.

## Удаление

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh
```

Полная очистка конфигов проекта:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh -s -- --purge
```

## Ручная установка ZIP

Загрузите архив в `/tmp` на роутер и выполните:

```sh
cd /tmp
unzip -o routing-openwrt.zip -d /tmp
mv /tmp/routing-openwrt-main /tmp/routing-openwrt 2>/dev/null || true
cd /tmp/routing-openwrt
chmod +x install.sh update.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./install.sh
```

`/tmp` рекомендуется для ручной установки, потому что это временная папка и она не занимает постоянную flash-память после перезагрузки.

## Диагностика

```sh
/usr/sbin/routing-openwrt-diagnose.sh
```

Диагностика показывает туннель, маршрут YouTube, DNS, списки, nftset, fwmark, таблицу `vpn` и основные ошибки. Вывод можно отправить разработчику для анализа.

## Проверка

```sh
/usr/sbin/domain-routing-status.sh
ip route show table vpn
ip rule show | grep fwmark
nft list set inet fw4 vpn_domains | head
```
