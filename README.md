# routing-openwrt

`routing-openwrt` настраивает OpenWrt так, чтобы выбранные домены шли через VPN/туннель, а обычный интернет продолжал работать через основной WAN.

Это не проект с нуля. Это изменённый форк проекта [`itdoginfo/domain-routing-openwrt`](https://github.com/itdoginfo/domain-routing-openwrt).

## Что делает

Проект использует `dnsmasq-full` + `nftset` + policy routing:

```txt
домен из списка → dnsmasq получает IP → IP попадает в nftset → firewall ставит mark 0x1 → table vpn → awg0/wg0/tun0
```

По умолчанию включена только маршрутизация доменов. IPv4 CIDR, IPv6 и принудительный DNS redirect выключены, чтобы не ломать обычный интернет.

Если VPN/сервер/интерфейс не работает, проект не должен ломать обычный WAN-интернет. Домены из списка в таком случае могут временно не маршрутизироваться через VPN, но весь остальной интернет должен работать штатно.

## Что сейчас проверялось

Сейчас установщик автоматически настраивает только:

- WireGuard;
- AmneziaWG / AmneziaWG 2.0.

В меню также оставлены будущие пункты `OpenVPN`, `Sing-box` и `tun2socks`, но сейчас они помечены как `позже` и не запускают установку. Это сделано специально, чтобы пользователь видел план развития проекта, но скрипт не ломал роутер неподготовленной логикой.

Проверялось в первую очередь:

- OpenWrt 24.x;
- `dnsmasq-full` + `nftset`;
- AmneziaWG / AmneziaWG 2.0;
- IPv4 domain routing.

Требует дополнительной проверки:

- обычный WireGuard на разных сборках;
- OpenVPN/tun;
- Sing-box/tun2socks;
- IPv4 CIDR routing;
- полноценный IPv6 routing;
- OpenWrt 25.12+ с `apk`.

OpenWrt 24.10 и старее используют `opkg`. OpenWrt 25.12 и новее используют `apk`. Установочные скрипты проекта умеют использовать оба варианта, но OpenWrt 25.12+ ещё нужно проверять на реальном роутере.

## Списки по умолчанию

Сейчас проект берёт списки отсюда:

```txt
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/domains-dnsmasq-nfset.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv4.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv6.lst
```

По умолчанию реально используется только файл доменов:

```txt
lists/domains-dnsmasq-nfset.lst
```

IPv4 CIDR выключен по умолчанию. Чтобы включить его в своём форке, измените в `getdomains-install.sh`:

```sh
DEFAULT_USE_IPV4_LIST="1"
```

IPv6 выключен по умолчанию. Чтобы включить его в своём форке:

```sh
DEFAULT_IPV6_SUPPORT="1"
```

### Если списки будут в отдельном репозитории

Можно создать отдельный репозиторий, например:

```txt
dagmagnat/routing-openwrt-lists
```

И хранить там:

```txt
lists/domains-dnsmasq-nfset.lst
lists/ipv4.lst
lists/ipv6.lst
```

Тогда в `getdomains-install.sh` достаточно изменить:

```sh
DEFAULT_LISTS_REPO="dagmagnat/routing-openwrt-lists"
```

## Формат списка доменов

Поддерживаются два формата.

Обычный список доменов:

```txt
youtube.com
youtu.be
googlevideo.com
ytimg.com
```

Можно писать построчно, через пробел или через запятую. Скрипт сам преобразует домены в формат `dnsmasq/nftset`.

Также можно сразу использовать готовый формат:

```txt
nftset=/youtube.com/4#inet#fw4#vpn_domains
nftset=/youtu.be/4#inet#fw4#vpn_domains
nftset=/googlevideo.com/4#inet#fw4#vpn_domains
nftset=/ytimg.com/4#inet#fw4#vpn_domains
```

## Формат IPv4 CIDR

Файл:

```txt
lists/ipv4.lst
```

Пример:

```txt
8.8.8.8
13.69.0.0/16
142.250.0.0/15
172.217.0.0/16
```

IPv4 CIDR лучше включать только после того, как доменная маршрутизация уже работает.

## Установка с GitHub

Рекомендуемый способ, чтобы установщик нормально задавал вопросы:

```sh
cd /tmp
rm -rf /tmp/routing-openwrt /tmp/routing-openwrt-main /tmp/routing-openwrt.zip
wget --no-check-certificate -O /tmp/routing-openwrt.zip https://github.com/dagmagnat/routing-openwrt/archive/refs/heads/main.zip
unzip -o /tmp/routing-openwrt.zip -d /tmp
mv /tmp/routing-openwrt-main /tmp/routing-openwrt 2>/dev/null
cd /tmp/routing-openwrt
chmod +x install.sh update.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./install.sh
```

Если нужно принудительно заново настроить туннель и удалить старый `awg0/wg0` проекта:

```sh
sh ./install.sh --reinstall
```

Быстрая установка одной командой тоже поддерживается:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/install.sh | sh
```

Но если нужно вводить большой конфиг AmneziaWG, удобнее использовать рекомендуемый способ выше.

## Ручная установка из ZIP-архива

Скопируйте архив проекта на роутер в `/tmp`, например:

```txt
/tmp/routing-openwrt-v16.zip
```

Потом выполните:

```sh
cd /tmp
rm -rf /tmp/routing-openwrt /tmp/routing-openwrt-main
unzip -o /tmp/routing-openwrt-v16.zip -d /tmp
cd /tmp/routing-openwrt
chmod +x install.sh update.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./install.sh
```

Если после распаковки папка называется иначе, найдите её:

```sh
ls -lah /tmp | grep routing-openwrt
```

## Обновление проекта

Обновить скрипты проекта с GitHub без полной переустановки туннеля:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh | sh
```

Локальная команда после установки:

```sh
/usr/sbin/routing-openwrt-update.sh
```

## Удаление проекта

Удалить правила маршрутизации, cron, списки, init-скрипты и настройки проекта:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh
```

Локальная команда после установки:

```sh
/usr/sbin/routing-openwrt-uninstall.sh
```

Обычное удаление оставляет сам VPN-туннель `awg0/wg0`, чтобы случайно не удалить пользовательский конфиг.

Полная очистка с удалением `awg0/wg0`, если нужно поставить всё с нуля:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh -s -- --purge
```

Если нужно удалить вообще всё старое и поставить с нуля, используйте `--purge`, затем установку с `--reinstall`.

## Автообновление списков

Списки обновляются автоматически каждый день в 02:00:

```cron
0 2 * * * /etc/init.d/getdomains start
```

Проверить cron:

```sh
cat /etc/crontabs/root | grep getdomains
/etc/init.d/cron status
```

Обновить списки вручную:

```sh
/etc/init.d/getdomains start
```

Последняя рабочая версия списков хранится здесь:

```txt
/etc/domain-routing/lists
```

Если GitHub временно недоступен, используется кеш.

## Проверка работы

Статус:

```sh
/usr/sbin/domain-routing-status.sh
```

Основные проверки:

```sh
ip route show table vpn
ip rule show
nft list ruleset | grep -E "vpn_domains|mark_domains|vpn_subnets|mark_subnet" -n
nft list set inet fw4 vpn_domains | head -n 50
```

Проверка DNS/nftset:

```sh
nslookup youtube.com 192.168.1.1
nft list set inet fw4 vpn_domains | head -n 50
```

Если `youtube.com` появился в `vpn_domains` как IP-адрес, dnsmasq/nftset работает.

Если пакеты не маркируются, проверьте, что клиент использует DNS роутера, а не Private DNS / Secure DNS / DNS-over-HTTPS.

## Важно про AmneziaWG-конфиги

Можно вставлять полный конфиг WireGuard/AmneziaWG. После вставки введите отдельной строкой:

```txt
END
```

Для AmneziaWG 2.0 поддерживаются параметры вроде `Jc`, `Jmin`, `Jmax`, `S1`, `S2`, `H1`–`H4`, `S3`, `S4`, `I1`–`I5`.

Если вы уже публиковали `PrivateKey` или `PresharedKey` в чате/логе, лучше создать новый VPN-конфиг.


### Note about GitHub download on some routers

Some OpenWrt builds have unstable `wget` behavior on GitHub redirects. The installer uses `codeload.github.com` directly and falls back to `curl`/`wget` where available.

### Note about `opkg update` warnings

If one OpenWrt feed temporarily fails but the required packages are already installed or available from other feeds, the installer continues instead of stopping immediately.
