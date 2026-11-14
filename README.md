# RouteWolf

Выборочная маршрутизация для OpenWrt: выбранные домены и IP идут через VPN,
обычный интернет — через WAN. Поддерживаются WireGuard, AmneziaWG, OpenVPN;
есть экспериментальные режимы Sing-box/VLESS REALITY и Outline.

Стабильный выпуск: [v56](https://github.com/dagmagnat/RouteWolf/releases/tag/v56).
Архитектура, история, аудит и планы — в одном [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

## Установка

```sh
/bin/uclient-fetch -O - https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/install.sh | sh
```

Нужны совместимые OpenWrt/fw4/nftables и пакеты для точной версии прошивки/ядра.
Поддерживаются `opkg` и `apk`. Если проверяемая HTTPS-загрузка не проходит,
проверьте время роутера и CA bundle.

## Обновление установленного проекта

```sh
rw update
```

Если такой команды ещё нет:

```sh
/bin/uclient-fetch -O - https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/update.sh | sh
```

Старые ссылки `getdomains-install.sh`, `getdomains-check.sh` и
`getdomains-uninstall.sh` сохранены как маленькие совместимые загрузчики.

## Ночные задания

| Время роутера | Действие |
|---|---|
| 02:00 ежедневно | Проверка списков доменов/IP |
| 03:00 ежедневно | Проверка опубликованного стабильного GitHub Release |

Неизменившиеся списки не перезапускают DNS/firewall. При той же версии архив
кода не скачивается. Изменения в `main` сами по себе не обновляют runtime
уже перешедших на v56 устройств.

Обновление проверяет SHA-256, состав архива и состояние после установки;
предыдущая версия сохраняется для отката. Ключи VPN и настройки WAN/DNS
сохраняются. При сбое загрузки остаются предыдущие рабочие файлы.

Нужно минимум 2 МиБ свободной flash и 8 МиБ доступной RAM. При меньшем резерве
обновление откладывается. Роутер с 16 МБ общей flash может обновлять скрипты
при достаточном свободном месте; установка Sing-box имеет отдельные требования.

## Управление и диагностика

```sh
rw status
rw diag
rw load
rw updates status
rw updates check
rw updates off
rw updates on
rw updates rollback
rw update
rw health
```

`off` отключает автообновление кода, но не списков. `health` проверяет и при
необходимости восстанавливает nft-наборы. Резервные копии содержат настройки
пользователя: не публикуйте их вместе с исходниками.

`rw update` проверяет стабильный релиз и списки (аналог `rw updates check`).
В v56 эта короткая команда ошибочно выводила Usage; исправление — v57.
Для разового обновления v56 используйте `rw updates check`, затем обычная
команда `rw update` снова работает. Ночные задания этой ошибкой не затронуты.

Для маршрутизации по доменам устройства должны использовать DNS роутера.
Проблемы upstream DNS и VPN проверяются отдельно. Google/Cloudflare
автоматически не подставляются; собственный DNS настраивается отдельно.
Fail-open сохраняет обычный WAN, но не обходит блокировку сервиса напрямую.

## Проверки для разработчика

```sh
python3 tools/build_release.py --check
docker build -t routewolf-tests -f tests/Dockerfile .
docker run --rm --network none --cap-add NET_ADMIN --memory=192m --cpus=1 \
  -v "$PWD:/work:ro" --entrypoint sh routewolf-tests -c \
  'touch /.routewolf-test-container; python3 -m unittest discover -s tests -p "test_*.py" -v'
```

Тесты создают одноразовые интерфейсы и firewall внутри контейнера.
Не запускайте тестовый Python-набор прямо на рабочем роутере.

Основа проекта: [itdoginfo/domain-routing-openwrt](https://github.com/itdoginfo/domain-routing-openwrt).
