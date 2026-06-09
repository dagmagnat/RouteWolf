# routing-openwrt

Простая маршрутизация выбранных доменов через VPN на OpenWrt.

Проект является форком и доработкой оригинального проекта:
https://github.com/itdoginfo/domain-routing-openwrt

## Что делает проект

`routing-openwrt` скачивает список доменов с GitHub, подключает его к `dnsmasq`/`nftset` и отправляет только эти домены через выбранный туннель.
Обычный интернет, который не входит в список, остаётся через обычный WAN.

Сейчас автоматически поддерживаются:

- WireGuard
- AmneziaWG / Amnezia WireGuard
- OpenVPN

Sing-box запланирован отдельно. При выборе Sing-box установщик проверяет ресурсы роутера и не продолжает установку, если памяти мало.
`tun2socks` убран из меню, чтобы не путать пользователей.

## Списки

По умолчанию списки берутся отсюда:

```text
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/domains-dnsmasq-nfset.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv4.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv6.lst
```

Основной список — домены:

```text
lists/domains-dnsmasq-nfset.lst
```

Можно хранить домены простым списком:

```text
youtube.com
youtu.be
googlevideo.com
```

Установщик сам преобразует их в формат `dnsmasq/nftset`.

IPv4 CIDR и IPv6 по умолчанию выключены. Их лучше включать позже, когда доменная маршрутизация уже проверена.

## Установка с GitHub

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/install.sh | sh
```

При установке сначала выбирается язык:

```text
1) English
2) Русский
```

После этого всё меню будет на выбранном языке.

## Обновление проекта

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh | sh
```

Обновление не должно удалять существующий VPN-конфиг. Оно обновляет скрипты, правила маршрутизации, cron и служебные файлы.

## Удаление

Обычное удаление:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh
```

Полная очистка проекта:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh -s -- --purge
```

## Ручная установка ZIP

Если GitHub-загрузка не работает, можно скачать архив проекта и загрузить его на роутер.

Рекомендуемая папка для временной установки:

```text
/tmp
```

Пример:

```sh
cd /tmp
rm -rf /tmp/routing-openwrt /tmp/routing-openwrt-main /tmp/routing-openwrt.zip
unzip -o /tmp/routing-openwrt.zip -d /tmp
mv /tmp/routing-openwrt-main /tmp/routing-openwrt 2>/dev/null || true
cd /tmp/routing-openwrt
chmod +x install.sh update.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./install.sh --reinstall
```

`/tmp` очищается после перезагрузки, но это нормально: установщик копирует нужные файлы в `/usr/sbin`, `/etc/init.d` и `/etc/domain-routing`.

## OpenVPN

При выборе OpenVPN есть два варианта:

1. вставить полный `.ovpn` конфиг прямо в установщик;
2. создать OpenVPN вручную в LuCI, затем вернуться в установщик.

Если выбран ручной режим, установщик проверяет наличие `tun`-интерфейса. Если OpenVPN ещё не создан или не запущен, он покажет ошибку и предложит проверить ещё раз.

## Автообновление списков

Списки обновляются каждый день:

```text
02:00 — обновление списков
03:15 — проверка маршрутов, dnsmasq и VPN-таблицы
```

Если домен удалён из GitHub-списка, после обновления он удалится и на роутере. Локальный список заменяется целиком.

Если GitHub временно недоступен, используется последний рабочий кеш:

```text
/etc/domain-routing/lists
```

## Проверка

```sh
/usr/sbin/domain-routing-status.sh
ip route show table vpn
ip rule show | grep fwmark
nft list ruleset | grep mark_domains
```

Если VPN отключить, обычный интернет должен продолжить работать через WAN. Это режим fail-open.

## Важно

После установки задайте пароль root:

```sh
passwd
```
