# Domain Routing OpenWrt — Rafael Fork

> **Важно:** этот проект не написан с нуля. Это изменённый форк проекта [`itdoginfo/domain-routing-openwrt`](https://github.com/itdoginfo/domain-routing-openwrt).  
> Оригинальная идея, базовая логика маршрутизации по доменам/IP и часть кода взяты из оригинального проекта. В этом форке добавлены изменения под мои списки, AmneziaWG 2.0, автообновление и более безопасное поведение при сбоях.

## Что делает проект

Скрипт настраивает OpenWrt так, чтобы **только выбранные домены и IPv4 CIDR-сети** шли через VPN-интерфейс, а обычный интернет продолжал работать через основной WAN.

Основная схема:

1. `dnsmasq-full` получает IP-адреса доменов из списка.
2. Эти IP попадают в `nftset` `vpn_domains`.
3. IPv4 CIDR-сети из списка попадают в `vpn_subnets`.
4. Firewall помечает подходящий трафик меткой `0x1`.
5. Правило `ip rule` отправляет только помеченный трафик в таблицу маршрутизации `vpn`.
6. Таблица `vpn` отправляет этот трафик через `wg0`, `awg0` или `tun0`, в зависимости от выбранного туннеля.

Обычный трафик, который не попал в списки, **не должен затрагиваться** и должен продолжать идти через стандартный маршрут OpenWrt.

## Текущий статус проверки

На данный момент этот форк реально проверялся в первую очередь с:

- **AmneziaWG / AmneziaWG 2.0**
- OpenWrt 24.x
- `dnsmasq-full` + `nftset`
- IPv4 domain routing
- IPv4 CIDR routing

Пока **не подтверждена полноценная работа** с:

- обычным WireGuard во всех сценариях;
- Sing-box;
- OpenVPN;
- tun2socks;
- IPv6 routing.

Эти режимы оставлены в проекте, но их нужно дополнительно проверять на реальном роутере.

## Чем этот форк отличается от оригинала

- Убраны старые режимы выбора списков `russia-inside`, `russia-outside`, `ukraine`.
- По умолчанию используются мои списки из GitHub:
  - домены: `https://raw.githubusercontent.com/dagmagnat/Routing-OpenWrt/main/domains/my-domains.lst`
  - IPv4 CIDR: `https://raw.githubusercontent.com/dagmagnat/Routing-OpenWrt/main/domains/my-ip.lst`
- Списки обновляются автоматически каждый день в **02:00** через cron.
- Списки кешируются в `/etc/domain-routing/lists`, поэтому после перезагрузки роутер сначала восстанавливает последнюю рабочую версию из кеша.
- Если GitHub временно недоступен, DNS не поднялся или список скачался битым, скрипт старается использовать последнюю рабочую кешированную версию.
- Добавлена установка актуального AmneziaWG через внешний installer `awg-openwrt`.
- Добавлена поддержка параметров AmneziaWG 2.0, включая `S3`, `S4`, `I1`–`I5`.
- Можно вставить полный WireGuard/AmneziaWG конфиг целиком, завершив ввод строкой `END`.
- Добавлена проверка существующего `wg0`/`awg0`: можно пропустить настройку туннеля или заменить старый конфиг.
- IPv6 по умолчанию выключен: включается `filter_aaaa`, чтобы клиенты не уходили к YouTube/Google по IPv6 мимо IPv4-маршрутизации.
- Маршрут в таблице `vpn` восстанавливается отдельным helper-скриптом и init-сервисом.
- Если VPN-интерфейс не найден или не поднят, таблица `vpn` получает `blackhole default`. Это защищает от утечки маршрутизируемых доменов/IP в обычный WAN, но не трогает обычный интернет.

## Важная логика безопасности

Проект не должен ломать обычный интернет, если сломался VPN, VPS, список или интерфейс.

Для этого используется отдельная таблица маршрутизации:

```sh
ip rule show
ip route show table vpn
```

Только трафик с меткой `0x1` идёт в таблицу `vpn`. Остальной трафик продолжает идти через обычную таблицу `main`.

Если VPN-интерфейс поднят, в таблице `vpn` должен быть маршрут вида:

```sh
default dev awg0 scope link
```

Если VPN-интерфейс не найден или не поднят, helper ставит безопасный маршрут:

```sh
blackhole default
```

Это значит:

- обычный интернет работает через WAN;
- домены/IP из списков не уходят напрямую в WAN;
- маршрутизируемые через VPN ресурсы могут временно не открываться, пока VPN не восстановится.

## Поддерживаемые форматы списка доменов

Файл доменов может быть обычным списком:

```txt
youtube.com
youtu.be
googlevideo.com
ytimg.com
```

Можно писать через строки, пробелы или запятые. Скрипт сам преобразует обычные домены в формат `dnsmasq/nftset`.

Также поддерживается готовый формат:

```txt
nftset=/youtube.com/4#inet#fw4#vpn_domains
nftset=/youtu.be/4#inet#fw4#vpn_domains
nftset=/googlevideo.com/4#inet#fw4#vpn_domains
```

Если файл случайно загружен в одну строку через пробел, скрипт тоже попробует разбить его на отдельные `nftset=`-директивы.

## Поддерживаемый формат IPv4 CIDR

Файл IPv4 должен содержать сети или отдельные адреса:

```txt
8.8.8.8
13.69.0.0/16
142.250.0.0/15
172.217.0.0/16
```

Комментарии после `#` допускаются. Пустые строки игнорируются.

## IPv6

IPv6 по умолчанию выключен:

```sh
uci set dhcp.@dnsmasq[0].filter_aaaa='1'
```

Это сделано потому, что YouTube/Google часто возвращают IPv6-адреса. Если IPv6 не маршрутизировать через VPN, клиент может пойти мимо VPN.

Включение IPv6 оставлено в коде, но требует отдельной проверки. Для полноценного IPv6 нужны:

- IPv6 внутри VPN-туннеля;
- `AllowedIPs = ::/0` или аналогичная маршрутизация;
- IPv6 firewall/ipset правила;
- IPv6 CIDR-список, если он используется.

## Установка

Скопируйте архив проекта в `/tmp` на роутере и выполните:

```sh
cd /tmp
opkg update
opkg install unzip

rm -rf /tmp/domain-routing-openwrt-master
unzip -o /tmp/domain-routing-openwrt-rafael-fork.zip -d /tmp

cd /tmp/domain-routing-openwrt-master
chmod +x getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./getdomains-install.sh
```

Если архив имеет другое имя, проверьте:

```sh
ls -lh /tmp/*.zip
```

## Установка AmneziaWG

При выборе AmneziaWG скрипт предлагает вставить полный конфиг.

Пример:

```ini
[Interface]
PrivateKey = ...
Address = 10.28.8.160/32
DNS = 1.1.1.1, 1.0.0.1
Jc = 100
Jmin = 20
Jmax = 100
S1 = 0
S2 = 0
H1 = 1
H2 = 2
H3 = 3
H4 = 4
I1 = <b 0x...>

[Peer]
PublicKey = ...
PresharedKey = ...
Endpoint = example.com:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 15
```

После вставки всего конфига нужно отдельной строкой написать:

```txt
END
```

Важно: длинные строки `I1`, `I2` и похожие параметры должны вставляться как одна строка. Визуальный перенос в терминале — это нормально.

## Автообновление списков

После установки создаётся cron-задача:

```cron
0 2 * * * /etc/init.d/getdomains start
```

То есть каждый день в 02:00 роутер скачивает актуальные списки из GitHub, нормализует их, проверяет и применяет.

Проверить cron:

```sh
cat /etc/crontabs/root
/etc/init.d/cron status
```

Запустить обновление вручную:

```sh
/etc/init.d/getdomains start
```

## Где лежат настройки и кеш

Конфигурация ссылок:

```sh
/etc/domain-routing-user.conf
```

Кеш последней рабочей версии списков:

```sh
/etc/domain-routing/lists/domains.lst
/etc/domain-routing/lists/ipv4.lst
/etc/domain-routing/lists/ipv6.lst
```

Рабочие временные файлы после загрузки:

```sh
/tmp/dnsmasq.d/domains.lst
/tmp/lst/ipv4.lst
/tmp/lst/ipv6.lst
```

`/tmp` очищается после перезагрузки, поэтому кеш в `/etc/domain-routing/lists` обязателен.

## Проверка после установки

Быстрая проверка:

```sh
/usr/sbin/domain-routing-status.sh
```

Подробная проверка:

```sh
ip addr show awg0
ip route show table vpn
ip rule show

dnsmasq --test
head -n 20 /tmp/dnsmasq.d/domains.lst
head -n 20 /tmp/lst/ipv4.lst

nft list set inet fw4 vpn_domains | head -n 80
nft list set inet fw4 vpn_subnets | head -n 80
nft list ruleset | grep -E "vpn_domains|vpn_subnets|mark_domains|mark_subnet|0x00000001" -n

logread | grep -Ei "getdomains|vpnroute|dnsmasq|amnezia|awg|nft|error|failed" | tail -n 100
```

Проверка конкретного IP с меткой:

```sh
ip route get 172.217.19.238 mark 0x1
```

Ожидаемый результат — маршрут через `awg0`, `wg0` или `tun0`.

## Если YouTube не открывается

Проверьте, попали ли адреса YouTube/Google в `nftset`:

```sh
nslookup youtube.com 192.168.1.1
nslookup googlevideo.com 192.168.1.1
nft list set inet fw4 vpn_domains | head -n 80
```

В `nftset` будут IP-адреса, а не доменные имена. Поэтому `grep youtube` там обычно ничего не покажет.

Если YouTube всё равно не открывается:

1. Проверьте, что клиент использует DNS роутера.
2. Отключите на клиенте Private DNS / Secure DNS / DNS-over-HTTPS.
3. Убедитесь, что IPv6 выключен или корректно маршрутизируется через VPN.
4. Проверьте `ip route show table vpn`.
5. Проверьте, что VPN-интерфейс поднят.

## Диагностика обычного интернета

Обычный интернет не должен зависеть от VPN-таблицы. Проверьте основную таблицу:

```sh
ip route show default
```

Если обычные сайты, не входящие в списки, не открываются, проблема скорее всего не в таблице `vpn`, а в DNS, firewall, WAN или настройках клиента.

## Обновление своих списков

Обновляйте файлы в своём GitHub-репозитории:

```txt
domains/my-domains.lst
domains/my-ip.lst
```

Роутер сам заберёт изменения в 02:00. Для немедленного применения:

```sh
/etc/init.d/getdomains start
```

## Удаление

```sh
cd /tmp/domain-routing-openwrt-master
sh ./getdomains-uninstall.sh
```

После удаления желательно проверить:

```sh
ip rule show
ip route show table vpn
uci show firewall | grep -E "vpn_domains|vpn_subnets|mark_"
```

## Дисклеймер

Проект находится в доработке. Основной проверенный сценарий сейчас — AmneziaWG + IPv4 domain/CIDR routing. Перед публикацией и использованием на чужих роутерах рекомендуется тестировать на резервной конфигурации OpenWrt и иметь доступ к роутеру не только через VPN.
