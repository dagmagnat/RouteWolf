# RouteWolf

Простой скрипт для OpenWrt: домены и IPv4 CIDR из списков идут через выбранный туннель, обычный интернет остаётся через WAN.

Форк и доработка оригинального проекта: https://github.com/itdoginfo/domain-routing-openwrt

## Что поддерживается

Система: OpenWrt 23.05/24.10 с `opkg` и OpenWrt 25.12+ с `apk`; также совместимые X-WRT/ImmortalWrt при наличии `uci`, `netifd`, `procd` и `fw4/nftables`.

- WireGuard
- AmneziaWG / Amnezia WireGuard
- OpenVPN
- Sing-box, экспериментально: VLESS Reality через `sbtun0`

Безопасный режим по умолчанию: **fail-open**. Если туннель упал, обычный WAN-интернет не должен ломаться.

## Списки

По умолчанию используются списки из этого репозитория:

```text
https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/lists/domains-dnsmasq-nfset.lst
https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/lists/ipv4.lst
https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/lists/ipv6.lst
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
/usr/sbin/routewolf-load.sh
```

На слабых роутерах рекомендуется профиль `lite` и WireGuard/AmneziaWG. Sing-box проверяет flash/RAM перед установкой и не рекомендуется для 16/64 MB устройств.

## Установка с GitHub

Универсальная команда: сначала используется штатный `/bin/uclient-fetch`, затем `curl`, затем `wget`:

```sh
URL='https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/install.sh'
OUT='/tmp/routewolf-install.sh'
rm -f "$OUT"
if [ -x /bin/uclient-fetch ]; then
    /bin/uclient-fetch -O "$OUT" "$URL"
elif command -v curl >/dev/null 2>&1; then
    curl -kfsSL "$URL" -o "$OUT"
else
    wget -O "$OUT" "$URL"
fi && sh "$OUT"
```

Обычная команда `wget ... | sh` не может работать на прошивке, где сам `wget` собран без HTTPS. Это ограничение локального загрузчика, а не установщика RouteWolf.

## Обновление

```sh
URL='https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/update.sh'
OUT='/tmp/routewolf-update.sh'
rm -f "$OUT"
if [ -x /bin/uclient-fetch ]; then
    /bin/uclient-fetch -O "$OUT" "$URL"
elif command -v curl >/dev/null 2>&1; then
    curl -kfsSL "$URL" -o "$OUT"
else
    wget -O "$OUT" "$URL"
fi && sh "$OUT"
```

Обновление сохраняет текущую конфигурацию туннеля, обновляет списки и восстанавливает маршрутизацию.

## Удаление

```sh
URL='https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/uninstall.sh'
OUT='/tmp/routewolf-uninstall.sh'
rm -f "$OUT"
if [ -x /bin/uclient-fetch ]; then
    /bin/uclient-fetch -O "$OUT" "$URL"
elif command -v curl >/dev/null 2>&1; then
    curl -kfsSL "$URL" -o "$OUT"
else
    wget -O "$OUT" "$URL"
fi && sh "$OUT"
```

Полная очистка конфигов проекта:

```sh
URL='https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/uninstall.sh'
OUT='/tmp/routewolf-uninstall.sh'
rm -f "$OUT"
if [ -x /bin/uclient-fetch ]; then
    /bin/uclient-fetch -O "$OUT" "$URL"
elif command -v curl >/dev/null 2>&1; then
    curl -kfsSL "$URL" -o "$OUT"
else
    wget -O "$OUT" "$URL"
fi && sh "$OUT" --purge
```

## Ручная установка ZIP

Загрузите архив в `/tmp` на роутер и выполните:

```sh
cd /tmp
unzip -o RouteWolf.zip -d /tmp
mv /tmp/RouteWolf-main /tmp/routewolf 2>/dev/null || mv /tmp/routewolf-main /tmp/routewolf 2>/dev/null || true
cd /tmp/routewolf
chmod +x install.sh update.sh uninstall.sh routewolf-install.sh routewolf-uninstall.sh routewolf-check.sh
sh ./install.sh
```

`/tmp` рекомендуется для ручной установки, потому что это временная папка и она не занимает постоянную flash-память после перезагрузки.

## Диагностика

```sh
/usr/sbin/routewolf-diagnose.sh
```

Диагностика показывает туннель, маршрут YouTube, DNS, списки, nftset, fwmark, таблицу `vpn` и основные ошибки. Вывод можно отправить разработчику для анализа.

## Проверка

```sh
/usr/sbin/routewolf-status.sh
ip route show table vpn
ip rule show | grep fwmark
nft list set inet fw4 vpn_domains | head
```

### Быстрые команды после установки

```sh
rw help
rw status
rw diag
rw load
rw lists
rw repair
rw dco status
rw dco off
rw dco on
rw openvpn restart
```

По умолчанию для OpenVPN используется стабильный режим `disable-dco`. DCO можно включить командой `rw dco on`, если конкретная прошивка/ядро работает с ним стабильно.

## Sing-box: обычная ссылка и подписка

RouteWolf поддерживает два режима Sing-box:

```text
1. Обычная VLESS Reality ссылка — статичная, параметры не обновляются сами.
2. Ссылка подписки или JSON URL — короткая ссылка, RouteWolf периодически скачивает актуальные параметры.
```

Секретные ссылки не выводятся в лог полностью и хранятся в `/etc/routewolf/singbox.conf` с правами `600`.

Быстрые команды:

```sh
rw singbox set-link 'vless://...'
rw singbox set-url 'https://example.com/sub-or-json' 60
rw singbox update
rw singbox status
rw singbox restart
rw singbox log
```

Для подписки/JSON URL автообновление включается через cron. Интервал по умолчанию — 60 минут. Sing-box работает в безопасном режиме: `auto_route=false`, `strict_route=false`; RouteWolf отправляет в `sbtun0` только отмеченные домены/IP через `dnsmasq -> nftset -> fwmark -> table vpn`.


## RouteWolf v40: стабильная policy routing и универсальный watchdog

- Добавлен тестовый клиент **Outline** для обычных статических ключей `ss://`.
- На OpenWrt Outline запускается через пакет `sing-box-tiny` из официального репозитория OpenWrt в режиме Shadowsocks.
- `auto_route` выключен: через туннель идут только домены/IP из списков RouteWolf, обычный WAN остаётся основным маршрутом.
- Динамические Outline-ключи, `prefix`, WebSocket и плагины пока не поддерживаются.
- Для Sing-box/Outline установщик требует минимум 64 МБ flash, 40 МБ свободного места и 128 МБ RAM. На 16 МБ flash используйте WireGuard/AmneziaWG/OpenVPN.
- Универсальный watchdog каждые 30 минут проверяет выбранный туннель (WireGuard, AmneziaWG, OpenVPN, Sing-box или Outline), перезапускает только его при двух неудачных проверках и повторно применяет маршрутизацию.
- После перезагрузки роутера выбранный туннель принудительно восстанавливается. При сбое действует fail-open: основной WAN не блокируется.

### Исправления v40

- Удалено создание анонимного `network.@rule[-1]`, которое на части OpenWrt 24.10 выводило `uci: Invalid argument`.
- Правило `fwmark 0x1/0x1` теперь хранится в именованной секции `network.routewolf_mark` и использует таблицу `99`.
- После загрузки удаляются старые дубли правил с неверным приоритетом и создаётся одно правило с приоритетом `100`.
- Этап установки больше не показывает ложный `[OK]`: ошибка UCI останавливает установку с `[ERROR]`.
- Диагностика показывает актуальную версию сборки.

### OpenWrt 25.12 и APK

RouteWolf не устанавливает пакет `wget`/`wget-nossl`, потому что он может перекрыть системный `uclient-fetch` и сломать HTTPS-загрузки `apk`. Если системный `wget` уже неисправен, установщик временно подставляет `/bin/uclient-fetch` или `curl` только для своих команд APK, не изменяя системные файлы.
