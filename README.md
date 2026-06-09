# routing-openwrt

Простой скрипт для OpenWrt: домены из списка идут через выбранный VPN-туннель, обычный интернет остаётся через WAN.

Проект является форком и доработкой оригинального проекта: https://github.com/itdoginfo/domain-routing-openwrt

## Что поддерживается

- WireGuard
- AmneziaWG / Amnezia WireGuard
- OpenVPN: можно вставить весь `.ovpn` конфиг или выбрать уже созданный tun-интерфейс
- Sing-box: пока не настраивается автоматически, есть проверка ресурсов

`tun2socks` убран из меню, чтобы не путать пользователей. Для VLESS/Reality в будущем лучше развивать Sing-box.

## Списки маршрутизации

По умолчанию списки берутся отсюда:

```text
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/domains-dnsmasq-nfset.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv4.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv6.lst
```

Списки обновляются каждый день в 02:00. Если домен удалён из GitHub-списка, после обновления он удаляется и на роутере. Если GitHub недоступен, используется последний рабочий кеш.

## Установка с GitHub

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/install.sh | sh
```

## Обновление

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh | sh
```

## Удаление

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh
```

Полная очистка конфигов проекта:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh -s -- --purge
```

## Ручная установка ZIP

Загрузите архив в `/tmp` на роутер, затем выполните:

```sh
cd /tmp
unzip -o routing-openwrt.zip -d /tmp
mv /tmp/routing-openwrt-main /tmp/routing-openwrt 2>/dev/null || true
cd /tmp/routing-openwrt
chmod +x install.sh update.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./install.sh
```

`/tmp` рекомендуется для ручной установки, потому что это временная папка и она не занимает постоянную flash-память после перезагрузки.

## OpenVPN

При выборе OpenVPN установщик проверяет и устанавливает нужные пакеты:

- `openvpn-openssl`
- `luci-app-openvpn` — опционально, для настройки через LuCI
- `kmod-ovpn-dco` — опционально, ускорение OpenVPN через DCO, если пакет доступен для вашей прошивки

Можно выбрать один из режимов:

1. вставить полный `.ovpn` конфиг прямо в установщик;
2. сначала создать OpenVPN вручную в LuCI, затем вернуться в установщик и выбрать существующий tun-интерфейс.

## Проверка

```sh
/usr/sbin/domain-routing-status.sh
ip route show table vpn
ip rule show | grep fwmark
nft list set inet fw4 vpn_domains | head
```

Если VPN временно упал, обычный интернет не должен ломаться. Режим по умолчанию — fail-open.
