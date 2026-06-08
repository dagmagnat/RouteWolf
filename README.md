# routing-openwrt

> **Важно:** этот проект не создан с нуля. Это изменённый форк проекта [`itdoginfo/domain-routing-openwrt`](https://github.com/itdoginfo/domain-routing-openwrt).  
> Оригинальная идея, базовая логика маршрутизации по доменам/IP и часть кода взяты из оригинального проекта. В этом форке изменены списки, добавлена поддержка AmneziaWG 2.0, автообновление, кеширование списков и более безопасное поведение при сбоях.

## Что делает проект

`routing-openwrt` настраивает OpenWrt так, чтобы **только домены и IPv4/IPv6-сети из списков** шли через VPN-интерфейс, а обычный интернет продолжал работать через основной WAN.

Основная схема:

1. `dnsmasq-full` получает IP-адреса доменов из списка.
2. Эти IP попадают в `nftset` `vpn_domains`.
3. IPv4 CIDR-сети из списка попадают в `vpn_subnets`.
4. Firewall помечает подходящий трафик меткой `0x1`.
5. `ip rule` отправляет только помеченный трафик в отдельную таблицу маршрутизации `vpn`.
6. Таблица `vpn` отправляет этот трафик через выбранный VPN-интерфейс: `awg0`, `wg0`, `tun0` и т.п.

Трафик, который **не попал в списки**, не должен затрагиваться и должен идти через обычный маршрут OpenWrt.

## Репозиторий и списки по умолчанию

Проект рассчитан на репозиторий:

```txt
dagmagnat/routing-openwrt
```

По умолчанию установщик берёт списки только из папки `lists/` этого репозитория:

```txt
lists/domains-dnsmasq-nfset.lst
lists/ipv4.lst
lists/ipv6.lst
```

Raw-ссылки по умолчанию:

```txt
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/domains-dnsmasq-nfset.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv4.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv6.lst
```

Ручной ввод URL сейчас специально убран: проект использует списки владельца репозитория. Если вы делаете свой форк, измените значения в начале `getdomains-install.sh`.

## Статус проверки

Пока реально проверенный основной сценарий:

- OpenWrt 24.x;
- `dnsmasq-full` + `nftset`;
- AmneziaWG / AmneziaWG 2.0;
- IPv4 domain routing;
- IPv4 CIDR routing.

Пока требуют дополнительной проверки:

- обычный WireGuard во всех сценариях;
- OpenVPN/tun;
- Sing-box/tun2socks;
- полноценная IPv6-маршрутизация.

Режимы оставлены в проекте, но перед массовым использованием их нужно проверять на реальном роутере.

## Чем отличается от оригинала

- Убраны старые режимы списков `russia-inside`, `russia-outside`, `ukraine`.
- Списки берутся из `dagmagnat/routing-openwrt/lists`.
- Списки обновляются автоматически каждый день в **02:00**.
- Последняя рабочая версия списков кешируется в `/etc/domain-routing/lists`.
- Если GitHub, DNS или интернет временно недоступны, используется кеш.
- Если скачанный список пустой/битый, он не применяется.
- Добавлена установка актуального AmneziaWG через внешний installer `awg-openwrt`.
- Добавлена поддержка параметров AmneziaWG 2.0: `S3`, `S4`, `I1`–`I5`.
- Можно вставить полный WireGuard/AmneziaWG-конфиг целиком, завершив ввод строкой `END`.
- Если уже есть `wg0`/`awg0` или старая маршрутизация, установщик спрашивает: использовать существующий конфиг или заменить его.
- IPv6 по умолчанию выключен через `dnsmasq filter_aaaa`, чтобы клиенты не уходили к YouTube/Google по IPv6 мимо IPv4-маршрутизации.
- Маршрут в таблице `vpn` восстанавливается через отдельный helper и init-сервис.
- Если VPN-интерфейс не поднят, в таблицу `vpn` ставится `blackhole default`, чтобы домены/IP из списков не утекали напрямую в WAN.

## Безопасное поведение при сбоях

Проект должен сохранять обычный интернет, даже если сломался VPN, VPS, список или интерфейс.

Используется отдельная таблица маршрутизации:

```sh
ip rule show
ip route show table vpn
```

Только трафик с меткой `0x1` попадает в таблицу `vpn`. Остальной трафик идёт через обычную таблицу `main`.

Если VPN работает, в таблице `vpn` должно быть примерно так:

```sh
default dev awg0 scope link
```

Если VPN-интерфейс не найден или не поднят, helper ставит:

```sh
blackhole default
```

Это значит:

- обычный интернет через WAN продолжает работать;
- ресурсы из списков временно не открываются;
- трафик из списков не уходит напрямую через провайдера.

## Формат списка доменов

Файл:

```txt
lists/domains-dnsmasq-nfset.lst
```

Можно хранить в готовом `dnsmasq/nftset` формате:

```txt
nftset=/youtube.com/4#inet#fw4#vpn_domains
nftset=/youtu.be/4#inet#fw4#vpn_domains
nftset=/googlevideo.com/4#inet#fw4#vpn_domains
nftset=/ytimg.com/4#inet#fw4#vpn_domains
```

Также поддерживается обычный список доменов:

```txt
youtube.com
youtu.be
googlevideo.com
ytimg.com
```

Скрипт умеет читать домены построчно, через пробелы или через запятые и сам преобразует их в `nftset`-формат.

## Формат IPv4 CIDR

Файл:

```txt
lists/ipv4.lst
```

Формат:

```txt
8.8.8.8
13.69.0.0/16
142.250.0.0/15
172.217.0.0/16
```

Комментарии после `#` допускаются. Пустые строки игнорируются.

## Формат IPv6 CIDR

Файл:

```txt
lists/ipv6.lst
```

Формат:

```txt
2001:4860::/32
2a00:1450::/32
```

IPv6 по умолчанию выключен. Чтобы включить его в своём форке, измените в начале `getdomains-install.sh`:

```sh
DEFAULT_IPV6_SUPPORT="1"
```

Для полноценного IPv6 нужны IPv6-адрес внутри туннеля, корректный `AllowedIPs = ::/0`, IPv6 firewall/ipset правила и рабочий IPv6 CIDR-список.

## Установка из GitHub

На роутере OpenWrt:

```sh
cd /tmp
opkg update
opkg install unzip wget

rm -rf /tmp/routing-openwrt-main /tmp/routing-openwrt.zip
wget -O /tmp/routing-openwrt.zip https://github.com/dagmagnat/routing-openwrt/archive/refs/heads/main.zip
unzip -o /tmp/routing-openwrt.zip -d /tmp

cd /tmp/routing-openwrt-main
chmod +x install.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./install.sh
```

Если вы скопировали ZIP вручную в `/tmp`, распакуйте его и запустите `install.sh` из папки проекта.

## Установка AmneziaWG

При выборе AmneziaWG установщик может предложить вставить полный конфиг.

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

После вставки конфига завершите ввод отдельной строкой:

```txt
END
```

Длинные строки `I1`, `I2` и похожие параметры должны оставаться одной строкой. Визуальный перенос в терминале — это нормально.

## Автообновление списков

После установки создаётся cron-задача:

```cron
0 2 * * * /etc/init.d/getdomains start
```

Каждый день в 02:00 роутер скачивает списки из GitHub, нормализует их, проверяет и применяет.

Запустить обновление вручную:

```sh
/etc/init.d/getdomains start
```

Проверить cron:

```sh
cat /etc/crontabs/root
/etc/init.d/cron status
```

## Где лежат настройки и кеш

Конфигурация URL и режимов после установки:

```sh
/etc/domain-routing-user.conf
```

Кеш последней рабочей версии списков:

```sh
/etc/domain-routing/lists/domains.lst
/etc/domain-routing/lists/ipv4.lst
/etc/domain-routing/lists/ipv6.lst
```

Рабочие временные файлы:

```sh
/tmp/dnsmasq.d/domains.lst
/tmp/lst/ipv4.lst
/tmp/lst/ipv6.lst
```

`/tmp` очищается после перезагрузки, поэтому кеш в `/etc/domain-routing/lists` нужен обязательно.

## Проверка после установки

Быстрая диагностика:

```sh
/usr/sbin/domain-routing-status.sh
```

Подробная диагностика:

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

Проверка маршрута для конкретного IP с меткой:

```sh
ip route get 172.217.19.238 mark 0x1
```

Ожидаемый результат — маршрут через `awg0`, `wg0` или другой выбранный VPN-интерфейс.

## Если YouTube не открывается

Проверьте, попадают ли IP YouTube/Google в `vpn_domains`:

```sh
nslookup youtube.com 192.168.1.1
nslookup googlevideo.com 192.168.1.1
nft list set inet fw4 vpn_domains | head -n 80
```

В `nftset` хранятся IP-адреса, а не домены. Поэтому `grep youtube` обычно ничего не покажет.

Также проверьте:

1. Клиент использует DNS роутера.
2. На клиенте отключены Private DNS / Secure DNS / DNS-over-HTTPS.
3. IPv6 выключен или корректно маршрутизируется через VPN.
4. `ip route show table vpn` показывает маршрут через VPN.
5. VPN-интерфейс поднят и есть RX/TX.

## Удаление

```sh
cd /tmp/routing-openwrt-main
sh ./uninstall.sh
```

После удаления желательно проверить:

```sh
ip rule show
ip route show table vpn
uci show firewall | grep -E "vpn_domains|vpn_subnets|mark_"
```

## Дисклеймер

Проект находится в доработке. Основной проверенный сценарий сейчас — AmneziaWG + IPv4 domain/CIDR routing. Перед использованием на чужих роутерах рекомендуется тестировать на резервной конфигурации OpenWrt и иметь доступ к роутеру не только через VPN.
