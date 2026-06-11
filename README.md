# routing-openwrt

Простой скрипт для OpenWrt: домены и IPv4 CIDR из списков идут через выбранный туннель, обычный интернет остаётся через WAN.

Форк и доработка оригинального проекта: https://github.com/itdoginfo/domain-routing-openwrt

## Что поддерживается

Система: OpenWrt 23.05/24.10, экспериментально OpenWrt/X-WRT/ImmortalWrt 25.x и 26.x при наличии `uci`, `netifd`, `procd`, `fw4/nftables`, `opkg` или `apk`.

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


## Профили списков

При установке можно выбрать профиль списков:

```text
full  — полный список из lists/domains-dnsmasq-nfset.lst и lists/ipv4.lst
lite  — облегчённый список из lists/profiles/lite/ для слабых роутеров
custom — свои URL списков
```

Для своих списков можно использовать обычные домены по одному в строке или обычные IPv4 CIDR. Скрипт сам конвертирует домены в формат `dnsmasq/nftset`.

Чтобы добавить новый профиль, создайте папку:

```text
lists/profiles/<name>/domains.lst
lists/profiles/<name>/ipv4.lst
lists/profiles/<name>/ipv6.lst
```

Имя папки будет показано в меню установки.

## Нагрузка на роутер

Проект не запускает постоянный тяжёлый процесс для маршрутизации. Основная работа идёт через `dnsmasq`, `nftables` и `ip rule`. Для проверки нагрузки:

```sh
/usr/sbin/routing-openwrt-load.sh
```

На слабых роутерах рекомендуется профиль `lite` и WireGuard/AmneziaWG. Sing-box проверяет flash/RAM перед установкой и не рекомендуется для 16/64 MB устройств.

## Установка с GitHub

```sh
wget -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/install.sh | sh
```

Если в X-WRT/ImmortalWrt `wget` не поддерживает HTTPS, сначала поставьте `curl` через `apk`:

```sh
apk update
apk add curl ca-certificates ca-bundle unzip
curl -kL https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/install.sh | sh
```

Если `curl` уже есть, достаточно последней строки.

## Обновление

```sh
wget -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh | sh
```

Обновление не только заменяет скрипты проекта, но и сразу скачивает свежие списки из GitHub, перезапускает `dnsmasq`/`firewall` и восстанавливает маршрут `table vpn`.

## Удаление

```sh
wget -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh
```

Полная очистка конфигов проекта:

```sh
wget -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh -s -- --purge
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

### Быстрые команды после установки

```sh
rwrt help
rwrt status
rwrt diag
rwrt load
rwrt lists
rwrt repair
rwrt dco status
rwrt dco off
rwrt dco on
rwrt openvpn restart
```

По умолчанию для OpenVPN используется стабильный режим `disable-dco`. DCO можно включить командой `rwrt dco on`, если конкретная прошивка/ядро работает с ним стабильно.
