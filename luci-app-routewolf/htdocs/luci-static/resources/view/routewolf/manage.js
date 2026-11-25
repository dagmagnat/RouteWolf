'use strict';
'require view';
'require form';
'require rpc';
'require ui';
'require uci';
'require poll';
'require view.routewolf.geo-catalog as geoCatalog';

const protocols = {
    amneziawg: 'AmneziaWG',
    wireguard: 'WireGuard',
    openvpn: 'OpenVPN',
    singbox: 'sing-box',
    vless: 'VLESS · Xray',
    outline: 'Outline'
};

const routeNames = {
    routewolf: _('Только списки через VPN'),
    inverse: _('Списки напрямую, остальное через VPN'),
    full: _('Весь интернет через VPN'),
    json: _('Правила из JSON-подписки'),
    none: _('Туннель не настроен')
};

const status = rpc.declare({ object: 'routewolf_ui', method: 'status', reject: true });
const startup = rpc.declare({ object: 'routewolf_ui', method: 'startup', params: ['action'], reject: true, expect: { ok: false } });
const codeUpdates = rpc.declare({ object: 'routewolf_ui', method: 'code_updates', params: ['action'], reject: true, expect: { ok: false } });
const commitProfiles = rpc.declare({ object: 'uci', method: 'commit', params: ['config'], reject: true });

const jobStart = rpc.declare({ object: 'routewolf_ui', method: 'job', params: ['action', 'profile'], reject: true, expect: { ok: false } });
const jobStatus = rpc.declare({ object: 'routewolf_ui', method: 'job_status', reject: true });
const listNodes = rpc.declare({ object: 'routewolf_ui', method: 'nodes', params: ['profile'], reject: true });
const preflight = rpc.declare({ object: 'routewolf_ui', method: 'preflight', params: ['profile', 'role'], reject: true });
const jobPhases = {
    preflight: [5, _('Проверка профиля')],
    packages: [20, _('Загрузка и установка компонентов')],
    download: [45, _('Загрузка подписки')],
    config: [60, _('Проверка конфигурации')],
    start: [75, _('Запуск туннеля')],
    verify: [90, _('Проверка соединения')],
    done: [100, _('Готово')]
};
const jobErrors = {
    'subscription-unavailable': _('Нет запущенной HTTPS-подписки для проверки.'),
    'invalid-profile': _('Проверьте адрес, ключи и режим запуска сохранённого профиля.'),
    'package-install': _('Не удалось установить компоненты. Проверьте DNS, доступ к репозиторию OpenWrt и свободное место.'),
    'source-download': _('Не удалось загрузить подписку или её компоненты. Проверьте ссылку и доступ в интернет.'),
    'config-invalid': _('Профиль не прошёл проверку формата или содержит неподдерживаемые параметры.'),
    'subscription-format': _('Подписка загружена. В ней не удалось найти совместимые серверы или прочитать её правила. Проверьте формат подписки и выбранную маршрутизацию.'),
    'engine-config': _('Установленный sing-box отклонил конфигурацию. Проверьте поддержку протокола и транспорта в этой версии.'),
    'xray-config': _('Xray отклонил конфигурацию VLESS. Проверьте параметры ссылки и поддержку TUN в установленной версии xray-core.'),
    'insufficient-proxy-ram': _('Для sing-box, Xray и Outline нужно не менее 64 МиБ RAM по данным Linux. Выберите AmneziaWG, WireGuard или OpenVPN.'),
    'tunnel-start': _('Интерфейс туннеля не удалось запустить.'),
    'tunnel-unreachable': _('Туннель запустился, но проверка связи не прошла.'),
    'network-restart-required': _('Компоненты установлены. Перезапустите сеть или перезагрузите роутер через «Система → Перезагрузка», затем снова активируйте профиль.'),
    'route-unavailable': _('Туннель поднят, но маршрут через него недоступен.'),
    'profile-dns': _('Не удалось подключить DNS профиля. Проверьте IP-адреса и конфигурацию dnsmasq.'),
    'backup-transition': _('Резервный профиль работает или переключается. Дождитесь завершения проверки либо отключите резерв в «Профилях».'),
    'runtime-missing': _('Не хватает файлов RouteWolf. Запустите установщик по SSH и выберите режим LuCI.'),
    'update-failed': _('Не удалось проверить стабильный выпуск. Подробности доступны по SSH через rw updates status.'),
    'update-schedule': _('Обновление завершилось, но восстановить расписание списков не удалось.'),
    paused: _('Сначала включите маршрутизацию кнопкой рядом с вкладками.')
};

const listSchedule = rpc.declare({ object: 'routewolf_ui', method: 'list_schedule', params: ['action'], reject: true, expect: { ok: false } });
const libraryPage = rpc.declare({ object: 'routewolf_ui', method: 'library', params: ['kind', 'query', 'offset', 'group', 'limit'], reject: true });
const geoData = rpc.declare({ object: 'routewolf_ui', method: 'geodata', params: ['kind', 'category'], reject: true });
const listReport = rpc.declare({ object: 'routewolf_ui', method: 'list_report', reject: true, expect: { report: '' } });
const settings = 'routewolf_ui';
const localLists = [
    ['domains', _('Домены'), 'example.org'],
    ['ipv4', _('IPv4 / CIDR'), '203.0.113.7\n198.51.100.0/24'],
    ['ipv6', _('IPv6 / CIDR'), '2001:db8::/48']
];

const libraryGroups = [
    ['all', _('Вся библиотека')],
    ['4pda', '4PDA'],
    ['youtube', 'YouTube'],
    ['telegram', 'Telegram'],
    ['meta', _('Meta · Instagram, WhatsApp, Facebook')]
];
const linkStates = {
    active: [_('Активен'), 'on'],
    waiting: [_('Ожидает трафика'), 'waiting'],
    up: [_('Интерфейс поднят'), 'on'],
    paused: [_('Выключен · WAN'), 'off'],
    fallback: [_('Переключён на WAN'), 'off'],
    backup: [_('Резерв подключён'), 'on'],
    down: [_('Остановлен'), 'off'],
    none: [_('Без туннеля'), 'off']
};
const backupStates = {
    active: _('Резерв подключён'),
    checking: _('Через WAN · проверяется основной профиль'),
    waiting: _('В ожидании'),
    wan: _('Через WAN · резерв проверяется'),
    idle: _('Ожидает основной профиль'),
    conflict: _('Этот ключ уже используется другим интерфейсом')
};
const pageSize = 35;
const bulkPageSize = 150;
const maxListBytes = 24576;

function button(label, callback, accent) {
    return E('button', {
        class: 'btn cbi-button ' + (accent ? 'cbi-button-positive' : 'cbi-button-action'),
        type: 'button',
        click: callback
    }, [label]);
}

function activateTabs(tabs, title, progress, toggle, feedback) {
    const buttons = [];
    const panels = [];
    const names = tabs.map(([id]) => id);
    const select = (index, focus) => {
        buttons.forEach((item, i) => {
            item.setAttribute('aria-selected', String(i === index));
            item.tabIndex = i === index ? 0 : -1;
            panels[i].hidden = i !== index;
        });
        tabs[index][3]?.();
        history.replaceState(null, '', '#' + names[index]);
        if (focus)
            buttons[index].focus();
    };
    tabs.forEach(([id, title, content], index) => {
        const item = E('button', { class: 'rw-tab', type: 'button', click: () => select(index, false) }, [title]);
        item.id = 'rw-tab-' + id;
        item.setAttribute('role', 'tab');
        item.setAttribute('aria-controls', 'rw-panel-' + id);
        item.addEventListener('keydown', event => {
            const keys = {ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length,
                Home: 0, End: tabs.length - 1};
            if (keys[event.key] === undefined)
                return;
            event.preventDefault();
            select(keys[event.key], true);
        });
        buttons.push(item);
        panels.push(E('section', { class: 'rw-panel', id: 'rw-panel-' + id, role: 'tabpanel', 'aria-labelledby': item.id }, [content]));
    });
    select(Math.max(0, names.indexOf(location.hash.slice(1))), false);
    return E('div', {}, [
        E('div', { class: 'rw-toolbar' }, [title,
            E('nav', { class: 'rw-tabs', role: 'tablist', 'aria-label': 'RouteWolf' }, buttons),
            progress, toggle
        ]),
        feedback, ...panels
    ]);
}

function formatHandshake(timestamp) {
    if (!timestamp)
        return _('Нет данных');
    return new Date(timestamp * 1000).toLocaleString();
}

function actionRow(title, description, change, state, showError) {
    const button = E('button', {
        class: 'cbi-button rw-control-toggle', type: 'button', 'data-action': state ? 'disable' : 'enable'
    },
        state ? _('Выключить') : _('Включить'));

    button.addEventListener('click', async () => {
        const next = !state;
        button.disabled = true;
        try {
            if (!await change(next ? 'enable' : 'disable'))
                return;
            state = next;
            button.dataset.action = state ? 'disable' : 'enable';
            button.textContent = state ? _('Выключить') : _('Включить');
        }
        catch (error) {
            showError(error.message);
        }
        finally {
            button.disabled = false;
        }
    });

    return E('div', { class: 'rw-control' }, [
        E('div', {}, [E('strong', {}, [title]), E('span', { class: 'rw-control-description' }, [description])]),
        button
    ]);
}

function statusBadge(state) {
    const [label, tone] = linkStates[state] || linkStates.none;
    return E('span', { class: 'rw-badge', 'data-state': tone }, [label]);
}

function tunnelCommand(state, profile) {
    if (state.paused) return 'resume';
    if (state.tunnel) return state.link_state === 'down' ? 'repair' : 'pause';
    return profile ? 'activate' : 'choose';
}

function statusPanel(result) {
    if (!result.project_auth)
        return E('p', { class: 'alert-message warning' }, [_('Сервис RouteWolf на роутере не найден.')]);

    const tunnel = [protocols[result.protocol], result.tunnel].filter(Boolean).join(' · ');
    const primary = [
        [_('Маршрутизация'), result.paused ? _('Через WAN') : routeNames[result.backup_mode || result.mode] || '—'],
        [_('Интернет по умолчанию'), result.wan_device || '—']
    ];
    const ram = result.ram;
    const memory = Number.isInteger(ram) && ram >= 0 && ram <= 100
        ? '%s %d%% · %s %d%%'.format(_('Занято'), ram, _('Свободно'), 100 - ram) : '—';
    const wireGuard = result.protocol === 'wireguard' || result.protocol === 'amneziawg';
    const subscription = result.tunnel === 'rwsub0';
    const tunnelFact = wireGuard
        ? [_('Последнее рукопожатие'), formatHandshake(result.handshake)]
        : [subscription ? _('Проверка туннеля') : _('Состояние туннеля'),
            subscription && result.link_state === 'active'
                ? _('Связь подтверждена') : (linkStates[result.link_state] || linkStates.none)[0]];
    const facts = [
        [_('Версия'), result.version || '—'],
        [_('Нагрузка за минуту'), result.load || '—'],
        [_('Оперативная память'), memory],
        tunnelFact
    ];
    const interfaces = (result.interfaces || []).map(item => E('div', { class: 'rw-interface' }, [
        E('span', {}, [protocols[item.protocol] || _('Туннель'), ' · ', item.name, item.selected ? ' • ' + _('RouteWolf') : '']),
        statusBadge(item.state)
    ]));

    return E('div', {}, [
        E('div', { class: 'rw-cards' }, [
            E('div', { class: 'rw-card rw-state-card' }, [
                E('span', { class: 'rw-card-label' }, [_('Состояние RouteWolf')]),
                statusBadge(result.link_state)
            ]),
            ...primary.map(([label, value]) => E('div', { class: 'rw-card' }, [
                E('span', { class: 'rw-card-label' }, [label]), E('strong', {}, [value])
            ]))
        ]),
        E('dl', { class: 'rw-facts' }, facts.map(([label, value]) => E('div', {}, [
            E('dt', {}, [label]), E('dd', {}, [value])
        ]))),
        E('div', { class: 'rw-interfaces', 'aria-label': _('Настроенные интерфейсы') },
            interfaces.length ? interfaces : [E('span', {}, [tunnel || _('Профиль пока не выбран')])]),
        result.backup_profile ? E('p', { class: 'rw-list-hint' }, [
            _('Резервный профиль'), ' · ', uci.get(settings, result.backup_profile, 'name') || '—',
            ' · ', backupStates[result.backup_state] || backupStates.waiting
        ]) : ''
    ]);
}

function subscriptionSchedule(action, save, showError) {
    const label = _('Обновление подписок');
    const presets = [
        ['60', _('Раз в час')], ['120', _('Раз в два часа')],
        ['30', _('Раз в 30 минут')], ['15', _('Раз в 15 минут')],
        ['10', _('Раз в 10 минут')], ['5', _('Раз в 5 минут')],
        ['custom', _('Свой интервал')], ['0', _('Выключено')]
    ];
    const valid = value => /^[1-9][0-9]{0,3}$/.test(value) && Number(value) >= 5 && Number(value) <= 1440;
    const current = uci.get(settings, 'ui', 'subscription_refresh_minutes') || '60';
    const interval = current === '0' || valid(current) ? current : '60';
    const choice = E('select', { 'aria-label': label }, presets.map(([value, name]) => E('option', { value }, [name])));
    choice.value = presets.some(([value]) => value === interval) ? interval : 'custom';
    const minutes = E('input', {
        type: 'number', min: 5, max: 1440, step: 1, value: interval === '0' ? '60' : interval,
        'aria-label': _('Интервал обновления в минутах')
    });
    const custom = E('label', { class: 'rw-subscription-custom', hidden: choice.value !== 'custom' }, [minutes, _('мин')]);
    const message = E('span', { role: 'status' });
    choice.addEventListener('change', () => { custom.hidden = choice.value !== 'custom'; });
    const saveSchedule = button(_('Сохранить интервал'), ui.createHandlerFn(null, async () => {
        const value = choice.value === 'custom' ? minutes.value : choice.value;
        message.textContent = '';
        if (value !== '0' && !valid(value)) {
            showError(_('Введите целое число минут от 5 до 1440.'));
            return;
        }
        try {
            uci.set(settings, 'ui', 'subscription_refresh_minutes', value);
            await save();
            message.textContent = _('Интервал сохранён.');
        }
        catch (error) { showError(error.message); }
    }), true);
    const checkNow = button(_('Проверить сейчас'), ui.createHandlerFn(null, async () => {
        message.textContent = '';
        if (await action('subscription_refresh'))
            message.textContent = _('Проверка подписки поставлена в очередь.');
    }));
    return E('section', { class: 'rw-subscription-schedule' }, [
        E('strong', {}, [label]),
        E('div', { class: 'rw-control-description' }, [_('Для текущей HTTPS-подписки sing-box или Xray. По умолчанию — раз в час.')]),
        E('div', { class: 'rw-actions rw-aligned-controls' }, [choice, custom, saveSchedule, checkNow]),
        message
    ]);
}

function servicePanel(result, action, showError, save) {
    const setting = change => async value => {
        if (!await change(value))
            throw new Error(_('RouteWolf не подтвердил изменение. Для старой установки проверьте обновление с параметром --luci по SSH.'));
        return true;
    };
    const items = [
        actionRow(_('Списки при загрузке'), _('Запускает загрузку списков после включения роутера.'), setting(startup), result.lists_boot, showError),
        actionRow(_('Автообновление кода'), _('Проверка стабильного выпуска по расписанию.'), setting(codeUpdates), result.code_auto, showError),
        actionRow(_('Перехват DNS'), _('Перенаправляет обычный DNS устройств LAN через dnsmasq роутера.'),
            value => action(value === 'enable' ? 'dns_on' : 'dns_off'), result.dns_force, showError)
    ];
    const commands = [
        [_('Обновить проект'), 'update'],
        [_('Перезапустить RouteWolf'), 'reload_project'],
        [_('Проверить правила'), 'check']
    ];
    if (result.tunnel && !result.paused) {
        commands.push([_('Восстановить маршруты'), 'repair'], [_('Перезапустить туннель'), 'restart']);
    }
    if (result.protocol === 'openvpn')
        commands.push([_('Включить DCO'), 'dco_on'], [_('Выключить DCO'), 'dco_off']);
    return E('div', { class: 'rw-service-panel' }, [
        ...items,
        subscriptionSchedule(action, save, showError),
        E('h3', { class: 'rw-service-heading' }, [_('Действия')]),
        E('div', { class: 'rw-actions rw-service-actions' }, commands.map(([label, cmd]) => button(label, ui.createHandlerFn(null, () => {
            if ((cmd === 'restart' || cmd === 'reload_project') &&
                !window.confirm(cmd === 'restart' ? _('Перезапустить действующий туннель?') : _('Перезапустить маршрутизацию RouteWolf?')))
                return;
            return action(cmd);
        }))))
    ]);
}

function libraryDialog(addEntries) {
    const groups = E('select', { 'aria-label': _('Группа сервисов') },
        libraryGroups.map(([id, label]) => E('option', { value: id }, [label])));
    const kinds = E('select', { 'aria-label': _('Тип записей') },
        [['all', _('Домены и IP')], ...localLists].map(([id, label]) => E('option', { value: id }, [label])));
    const search = E('input', { type: 'search', maxlength: 80, placeholder: _('Найти домен или IP'), 'aria-label': _('Поиск по библиотеке') });
    const results = E('div', { class: 'rw-library-results' });
    const metadata = E('span', { role: 'status' });
    const errorMessage = E('span', { class: 'rw-library-error', role: 'alert' });
    const choose = E('input', { type: 'checkbox' });
    const selected = new Map();
    let offset = 0, generation = 0, total = 0, updated = 0, revision = '';
    let entries = [], loading = true;
    const chooseAll = E('input', { type: 'checkbox' });
    const previous = button(_('Назад'), () => { offset -= pageSize; fetchPage(); });
    const next = button(_('Дальше'), () => { offset += pageSize; fetchPage(); });
    const copy = button(_('Добавить в свои'), () => applySelection(false, false), true);
    const copyAll = button(_('Добавить все'), () => applySelection(false, true));
    const exclude = button(_('Исключить'), () => applySelection(true, false));
    const close = button(_('Закрыть'), () => { ++generation; ui.hideModal(); });

    function id(entry) { return entry.kind + ':' + entry.value; }
    function metadataText() {
        const count = chooseAll.checked ? total : selected.size;
        const text = total ? (offset + 1) + '–' + Math.min(offset + pageSize, total) + ' / ' + total : _('Совпадений нет');
        metadata.textContent = text + (count ? ' · ' + _('Выбрано') + ' ' + count : '') +
            (updated ? ' · ' + new Date(updated * 1000).toLocaleDateString() : '');
    }
    function updateControls() {
        const visibleSelected = entries.filter(({ entry }) => chooseAll.checked || selected.has(id(entry))).length;
        choose.checked = !!entries.length && visibleSelected === entries.length;
        choose.indeterminate = visibleSelected > 0 && visibleSelected < entries.length;
        choose.disabled = loading || !entries.length;
        chooseAll.disabled = loading || !total;
        copy.disabled = exclude.disabled = loading || !(chooseAll.checked ? total : selected.size);
        copyAll.disabled = loading || !total;
        previous.disabled = loading || offset === 0;
        next.disabled = loading || offset + pageSize >= total;
        metadataText();
    }
    function syncCheckboxes() {
        entries.forEach(({ entry, field }) => { field.checked = chooseAll.checked || selected.has(id(entry)); });
    }
    function filter() {
        return [kinds.value, search.value.trim(), groups.value];
    }
    async function applySelection(excluded, all) {
        errorMessage.textContent = '';
        const current = generation;
        const scope = filter();
        const expected = revision;
        let values = [...selected.values()];
        if (all || chooseAll.checked) {
            try {
                loading = true;
                updateControls();
                values = [];
                for (let start = 0; start < total;) {
                    const page = await libraryPage(scope[0], scope[1], String(start), scope[2], String(bulkPageSize));
                    if (current !== generation)
                        return;
                    if (page.revision !== expected || page.total !== total || !page.entries?.length)
                        throw new Error(_('Список изменился. Обновите результаты поиска.'));
                    values.push(...page.entries);
                    const bytes = {};
                    for (const entry of values) {
                        bytes[entry.kind] = (bytes[entry.kind] || 0) + entry.value.length + 1;
                        if (bytes[entry.kind] > maxListBytes)
                            throw new Error(_('Слишком много записей. Уточните группу или поиск.'));
                    }
                    start += page.entries.length;
                }
            }
            catch (error) {
                if (current === generation)
                    errorMessage.textContent = error.message;
                return;
            }
            finally {
                if (current === generation) {
                    loading = false;
                    updateControls();
                }
            }
        }
        if (!values.length)
            return;
        try {
            addEntries(values, excluded);
            close.click();
        } catch (error) {
            errorMessage.textContent = error.message;
        }
    }
    async function fetchPage() {
        const current = ++generation;
        const scope = filter();
        loading = true;
        entries = [];
        updateControls();
        results.replaceChildren();
        errorMessage.textContent = '';
        try {
            const page = await libraryPage(scope[0], scope[1], String(offset), scope[2], String(pageSize));
            if (current !== generation)
                return;
            total = page.total;
            updated = page.updated;
            revision = page.revision;
            entries = (page.entries || []).map(entry => {
                const field = E('input', { type: 'checkbox' });
                field.addEventListener('change', () => {
                    if (chooseAll.checked) {
                        chooseAll.checked = false;
                        entries.forEach(item => { if (item.field.checked) selected.set(id(item.entry), item.entry); });
                    }
                    if (field.checked) selected.set(id(entry), entry); else selected.delete(id(entry));
                    updateControls();
                });
                return { entry, field };
            });
            results.replaceChildren(...entries.map(({ entry, field }) => E('label', {}, [
                field, entry.value, scope[0] === 'all' ? E('small', {}, [entry.kind === 'domains' ? _('домен') : entry.kind === 'ipv4' ? 'IPv4' : 'IPv6']) : ''
            ])));
            syncCheckboxes();
        }
        catch (error) {
            if (current === generation)
                errorMessage.textContent = _('Не удалось прочитать локальную копию библиотеки.');
        }
        finally {
            if (current === generation) {
                loading = false;
                updateControls();
            }
        }
    }
    const startSearch = () => {
        offset = total = 0;
        chooseAll.checked = false;
        selected.clear();
        return fetchPage();
    };
    kinds.value = 'domains';
    groups.addEventListener('change', () => {
        kinds.value = groups.value === 'all' ? 'domains' : 'all';
        search.value = '';
        startSearch();
    });
    kinds.addEventListener('change', startSearch);
    search.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            startSearch();
        }
    });
    search.addEventListener('input', () => {
        ++generation;
        loading = true;
        updateControls();
    });
    choose.addEventListener('change', () => {
        chooseAll.checked = false;
        entries.forEach(({ entry }) => {
            if (choose.checked) selected.set(id(entry), entry); else selected.delete(id(entry));
        });
        syncCheckboxes();
        updateControls();
    });
    chooseAll.addEventListener('change', () => {
        if (chooseAll.checked) selected.clear();
        syncCheckboxes();
        updateControls();
    });
    ui.showModal(_('Библиотека RouteWolf'), [
        E('div', { class: 'rw-library' }, [
            E('div', { class: 'rw-library-filter' }, [groups, kinds, search, button(_('Найти'), startSearch)]),
            E('div', { class: 'rw-library-meta' }, [
                E('div', { class: 'rw-library-selection' }, [
                    E('label', {}, [choose, _('Выбрать страницу')]), E('label', {}, [chooseAll, _('Выбрать все')])
                ]),
                metadata
            ]),
            results, errorMessage,
            E('div', { class: 'rw-library-footer' }, [previous, next, copy, copyAll, exclude, close])
        ])
    ], 'rw-library-modal');
    fetchPage();
}

function geoDialog(addEntries, ipv6Enabled) {
    const types = { geosite: 'GeoSite', geoip: 'GeoIP' };
    const limit = 8;
    const selected = new Map();
    const kind = E('select', { 'aria-label': _('Тип геоданных') }, [
        E('option', { value: 'all' }, [_('Домены и IP')]),
        E('option', { value: 'geosite' }, ['GeoSite · ', _('домены')]),
        E('option', { value: 'geoip' }, ['GeoIP · ', _('адреса')])
    ]);
    const search = E('input', {
        type: 'search', maxlength: 72, placeholder: _('Поиск, например YouTube или Telegram'),
        'aria-label': _('Поиск категорий')
    });
    const results = E('div', { class: 'rw-geo-results', 'aria-label': _('Категории') });
    const selectionCount = E('strong', { role: 'status' });
    const selectionItems = E('ul', { 'aria-label': _('Выбранные категории') });
    const summary = E('div', { class: 'rw-geo-selected', hidden: true }, [selectionCount, selectionItems]);
    const notice = E('p', { class: 'rw-list-hint', role: 'status' });
    const error = E('p', { class: 'rw-install-error', role: 'alert' });
    const close = button(_('Закрыть'), () => ui.hideModal());
    let running = false;

    function updateSelection() {
        copy.disabled = running || !selected.size;
        summary.hidden = !selected.size;
        const count = _('Выбрано категорий: %d').format(selected.size);
        if (selectionCount.textContent !== count)
            selectionCount.textContent = count;
        selectionItems.replaceChildren(...Array.from(selected.values(), match =>
            E('li', {}, [E('span', {}, [types[match.type]]), match.name])));
        results.querySelectorAll('input').forEach(box => {
            box.disabled = running || (!box.checked && selected.size >= limit);
        });
    }
    function renderResults() {
        const query = search.value.trim().toLowerCase();
        const filter = /^(geosite|geoip):(.*)$/.exec(query);
        const term = filter ? filter[2].trim() : query;
        const matches = Object.keys(types)
            .filter(type => filter ? filter[1] === type : kind.value === 'all' || kind.value === type)
            .flatMap(type => geoCatalog.categories[type].filter(name => name.includes(term))
                .map(name => ({ type, name, key: type + ':' + name })));
        matches.sort((a, b) => Number(b.name === term) - Number(a.name === term) ||
            Number(b.name.startsWith(term)) - Number(a.name.startsWith(term)) ||
            a.name.localeCompare(b.name));
        results.replaceChildren(...matches.slice(0, 40).map(match => {
            const box = E('input', { type: 'checkbox', checked: selected.has(match.key) || null });
            box.addEventListener('change', () => {
                if (box.checked) selected.set(match.key, match);
                else selected.delete(match.key);
                error.textContent = '';
                updateSelection();
            });
            return E('label', {}, [box, E('span', {}, [match.name]), E('small', {}, [types[match.type]])]);
        }));
        if (!matches.length)
            results.appendChild(E('p', {}, [_('Категории не найдены.')]));
        if (matches.length > 40)
            results.appendChild(E('p', {}, [_('Показаны первые 40 категорий. Уточните поиск.')]));
        results.scrollTop = 0;
        updateSelection();
    }
    const copy = button(_('Добавить в список'), async () => {
        if (running || !selected.size) return;
        running = kind.disabled = search.disabled = close.disabled = true;
        error.textContent = '';
        updateSelection();
        const requested = [...selected.values()];
        const entries = [];
        const failures = [];
        const imported = [];
        let skipped = false;
        try {
            for (const match of requested) {
                if (!search.isConnected) return;
                notice.textContent = _('Загрузка %s…').format(match.key);
                try {
                    const reply = await geoData(match.type, match.name);
                    if (reply.too_large)
                        throw new Error(_('категория превышает лимит 24 КБ'));
                    const usable = reply.entries.filter(item => ipv6Enabled || item.kind !== 'ipv6');
                    if (!usable.length)
                        throw new Error(_('нет подходящих записей'));
                    entries.push(...usable);
                    imported.push(match.key);
                    skipped ||= reply.skipped > 0 || usable.length !== reply.entries.length;
                } catch (failure) {
                    failures.push(match.key + ' — ' + (failure.message || _('не удалось загрузить')));
                }
            }
            if (!search.isConnected) return;
            if (entries.length)
                addEntries(entries, false);
            imported.forEach(key => selected.delete(key));
            if (!failures.length && !skipped) {
                ui.hideModal();
                return;
            }
            if (skipped)
                failures.push(_('Поддерживаемые записи добавлены. Сложные правила и отключённый IPv6 пропущены.'));
            error.textContent = failures.join('\n');
        } catch (failure) {
            error.textContent = failure.message;
        } finally {
            running = kind.disabled = search.disabled = close.disabled = false;
            notice.textContent = '';
            renderResults();
        }
    }, true);
    search.addEventListener('input', renderResults);
    kind.addEventListener('change', renderResults);
    ui.showModal(_('Импорт GeoIP и GeoSite'), [
        E('div', { class: 'rw-geo-fields' }, [kind, search]), results,
        E('p', { class: 'rw-list-hint' }, [_('До восьми категорий за раз. Записи появятся в своих списках. Затем нажмите «Применить списки».')]),
        summary, notice, error,
        E('div', { class: 'rw-geo-actions' }, [copy, close])
    ], 'rw-geo-modal');
    renderResults();
}

function listAddress(kind, address) {
    if (kind === 'ipv4') {
        const octets = address.split('.');
        if (octets.length !== 4 || octets.some(octet => !/^(0|[1-9][0-9]{0,2})$/.test(octet) || Number(octet) > 255))
            return null;
        return { address, value: octets.reduce((value, octet) => (value << 8n) | BigInt(octet), 0n) };
    }
    if (!/^[\da-f:.]+$/i.test(address))
        return null;
    try {
        const canonical = new URL('http://[' + address + ']/').hostname.slice(1, -1);
        const pieces = canonical.split('::');
        const left = pieces[0] ? pieces[0].split(':') : [];
        const right = pieces[1] ? pieces[1].split(':') : [];
        const words = pieces.length === 1 ? left : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
        return { address: canonical, value: BigInt('0x' + words.map(word => word.padStart(4, '0')).join('')) };
    } catch (error) {
        return null;
    }
}

function cleanList(kind, draft) {
    const retained = [];
    const removed = [];
    const records = [];
    const bits = kind === 'ipv4' ? 32 : 128;
    const minimum = kind === 'ipv4' ? 16 : 32;
    const seen = new Set();
    for (const line of draft.split(/\r?\n/)) {
        const [entry, comment] = line.split(/#(.*)/);
        if (!entry.trim()) {
            if (comment != null)
                retained.push({ text: line });
            continue;
        }
        // Keep the same line-oriented format as the setting and validator.
        const original = entry.trim();
        if (kind === 'domains') {
            const name = original.toLowerCase().replace(/\.$/, '');
            const labels = name.split('.');
            if (name.length > 253 || labels.length < 2 || !/[a-z]/.test(labels[labels.length - 1]) ||
                labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
                removed.push([original, _('недопустимое доменное имя')]);
                continue;
            }
            if (seen.has(name)) {
                removed.push([original, _('дубликат')]);
                continue;
            }
            seen.add(name);
            retained.push({ text: line });
            continue;
        }
        const parts = original.split('/');
        const parsed = listAddress(kind, parts[0]);
        const prefix = parts.length === 1 ? bits : Number(parts[1]);
        if (!parsed || parts.length > 2 || (parts.length === 2 && !/^(0|[1-9][0-9]{0,2})$/.test(parts[1])) || prefix > bits) {
            removed.push([original, _('неверный IP-адрес или префикс')]);
            continue;
        }
        if (prefix < minimum) {
            removed.push([original, _('слишком широкая сеть, минимальный префикс /%d').format(minimum)]);
            continue;
        }
        const width = 1n << BigInt(bits - prefix);
        if (parsed.value % width !== 0n) {
            removed.push([original, _('адрес содержит биты узла для указанного префикса')]);
            continue;
        }
        const top = parsed.value >> BigInt(bits - (kind === 'ipv4' ? 8 : 16));
        const reserved = kind === 'ipv4'
            ? top === 0n || top === 127n || top >= 224n || (parsed.value >> 16n) === 0xa9fen
            : top >= 0xff00n || (top >= 0xfe80n && top <= 0xfebfn) || parsed.value <= 1n;
        if (reserved) {
            removed.push([original, _('служебный или локальный диапазон')]);
            continue;
        }
        const record = { original, text: line, first: parsed.value, last: parsed.value + width - 1n };
        records.push(record);
        retained.push(record);
    }
    records.sort((a, b) => a.first !== b.first ? (a.first < b.first ? -1 : 1) : (a.last > b.last ? -1 : a.last < b.last ? 1 : 0));
    let covering = null;
    for (const record of records) {
        if (covering && record.last <= covering.last) {
            record.omit = true;
            const reason = record.first === covering.first && record.last === covering.last
                ? _('дубликат записи %s') : _('уже входит в подсеть %s');
            removed.push([record.original, reason.format(covering.original)]);
        } else {
            covering = record;
        }
    }
    return { value: retained.filter(record => !record.omit).map(record => record.text).join('\n'), removed };
}

function listPanel(result, save, action) {
    const useProject = E('input', { type: 'checkbox', checked: uci.get(settings, 'ui', 'project_lists') !== '0' || null });
    const drafts = {};
    const fields = {};
    const previews = {};
    for (const [key] of localLists) {
        drafts[key] = uci.get(settings, 'ui', key) || '';
        drafts['exclude_' + key] = uci.get(settings, 'ui', 'exclude_' + key) || '';
    }
    const sourceMode = E('select', { 'aria-label': _('Источник списков') }, [
        E('option', { value: 'default' }, [_('Списки по умолчанию')]),
        E('option', { value: 'local' }, [_('Свои записи')])
    ]);
    let editing = 'default';
    let opened = false;
    let previewGeneration = 0;
    const changes = {};
    const checkStatus = E('p', { class: 'rw-list-hint', 'aria-live': 'polite' });
    function readFields() {
        if (editing === 'local')
            localLists.forEach(([key]) => { drafts[key] = fields[key].value; });
    }
    async function loadPreview(key, offset) {
        const generation = previewGeneration;
        const preview = previews[key];
        const { previous, next, status } = preview;
        previous.disabled = next.disabled = true;
        fields[key].value = '';
        status.textContent = _('Загрузка…');
        try {
            const page = await libraryPage(key, '', String(offset), 'all', String(bulkPageSize));
            if (generation !== previewGeneration)
                return;
            const entries = page.entries || [];
            if (!entries.length && offset > 0)
                return loadPreview(key, 0);
            fields[key].value = entries.map(entry => entry.value).join('\n');
            fields[key].scrollTop = 0;
            status.textContent = page.total ? (offset + 1) + '–' + (offset + entries.length) + ' / ' + page.total :
                _('В библиотеке нет записей');
            preview.offset = offset;
            preview.retry = null;
            next.textContent = _('Дальше');
            previous.disabled = offset === 0;
            next.disabled = offset + bulkPageSize >= page.total;
        } catch (error) {
            if (generation !== previewGeneration)
                return;
            status.textContent = _('Не удалось прочитать библиотеку');
            preview.retry = offset;
            next.textContent = _('Повторить');
            previous.disabled = offset === 0;
            next.disabled = false;
        }
    }
    function showFields(mode) {
        ++previewGeneration;
        editing = sourceMode.value = mode;
        const readOnly = mode === 'default';
        exclusions.hidden = !readOnly;
        for (const [key, , placeholder] of localLists) {
            fields[key].readOnly = readOnly;
            fields[key].placeholder = readOnly ? '' : placeholder;
            previews[key].navigation.hidden = !readOnly;
            if (readOnly) {
                previews[key].offset = 0;
                loadPreview(key, 0);
            } else {
                fields[key].value = drafts[key];
            }
        }
    }
    function editExclusions() {
        const inputs = {};
        const cards = localLists.map(([key, label]) => {
            inputs[key] = E('textarea', { rows: 5, maxlength: maxListBytes, spellcheck: false });
            inputs[key].value = drafts['exclude_' + key];
            return E('label', {}, [label, inputs[key]]);
        });
        ui.showModal(_('Исключения из библиотеки'), [
            E('p', {}, [_('Уберите из библиотечного набора домены и адреса. После редактирования нажмите «Применить списки».')]),
            E('div', { class: 'rw-list-grid' }, cards),
            E('div', { class: 'rw-actions rw-activate-actions' }, [
                button(_('Сохранить'), () => {
                    for (const [key] of localLists)
                        drafts['exclude_' + key] = inputs[key].value;
                    ui.hideModal();
                }, true),
                button(_('Закрыть'), () => ui.hideModal())
            ])
        ], 'rw-activate-modal', 'rw-exclusion-modal');
    }
    function cleanDraft(key, field, value) {
        const cleaned = cleanList(key, value);
        if (new TextEncoder().encode(cleaned.value).length > maxListBytes)
            throw new Error(_('Список превышает 24 КБ. Добавьте меньше записей.'));
        changes[field] = [...(changes[field] || []), ...cleaned.removed].slice(-200);
        return cleaned.value;
    }
    function refreshListStatus() {
        const count = Object.values(changes).reduce((total, records) => total + records.length, 0);
        checkStatus.textContent = count ? _('Исключено записей в текущем редакторе: %d.').format(count) : '';
    }
    async function showListReport() {
        const details = E('p', {}, [_('Загрузка отчёта библиотеки…')]);
        const rows = Object.entries(changes).flatMap(([field, records]) =>
            records.map(([entry, reason]) => [field, entry, reason]));
        ui.showModal(_('Проверка списков'), [
            E('h4', {}, [_('Свои записи и исключения')]),
            rows.length ? E('div', { class: 'rw-list-report' }, [E('ul', {}, rows.map(([field, entry, reason]) =>
                E('li', {}, [
                    field.startsWith('exclude_') ? _('Исключения') : _('Свои записи'),
                    ' · ', E('code', {}, [entry]), ' · ', reason
                ])))]) : E('p', {}, [_('В текущем редакторе пока нет отклонённых записей.')]),
            E('h4', {}, [_('Последняя проверка библиотеки RouteWolf')]),
            details,
            E('div', { class: 'rw-actions rw-activate-actions' }, [button(_('Закрыть'), () => ui.hideModal())])
        ], 'rw-activate-modal');
        try {
            const report = await listReport();
            if (report)
                details.replaceWith(E('pre', { class: 'rw-list-report' }, [report]));
            else
                details.textContent = _('Отчёт появится после обновления библиотеки.');
        } catch (error) {
            details.textContent = _('Не удалось открыть отчёт библиотеки.');
        }
    }
    function addEntries(entries, excluded) {
        readFields();
        const next = { ...drafts };
        for (const [key] of localLists) {
            const field = (excluded ? 'exclude_' : '') + key;
            const values = entries.filter(entry => entry.kind === key).map(entry => entry.value);
            next[field] = cleanDraft(key, field, [drafts[field], ...values].join('\n'));
        }
        Object.assign(drafts, next);
        showFields(excluded ? 'default' : 'local');
        refreshListStatus();
    }
    sourceMode.addEventListener('change', () => {
        readFields();
        showFields(sourceMode.value);
    });
    const exclusions = button(_('Редактировать исключения'), editExclusions);
    exclusions.hidden = true;
    const cards = localLists.map(([key, label, placeholder]) => {
        const area = E('textarea', { rows: 6, maxlength: maxListBytes, placeholder, spellcheck: false });
        area.value = drafts[key];
        fields[key] = area;
        const previous = button(_('Назад'), () => loadPreview(key, Math.max(0, previews[key].offset - bulkPageSize)));
        const next = button(_('Дальше'), () => {
            const preview = previews[key];
            loadPreview(key, preview.retry ?? (preview.offset + bulkPageSize));
        });
        const status = E('span', { role: 'status' });
        const navigation = E('div', { class: 'rw-list-preview-nav', hidden: true }, [previous, status, next]);
        previews[key] = { previous, next, status, navigation, offset: 0, retry: null };
        return E('div', {}, [E('label', {}, [label, area]), navigation]);
    });
    const panel = E('div', {}, [
        E('div', { class: 'rw-list-sources' }, [
            E('label', { class: 'rw-list-checkbox' }, [useProject, _('Использовать списки проекта')]),
            button(_('Загрузить из библиотеки'), () => libraryDialog(addEntries)),
            button(_('Импорт GeoIP / GeoSite'), () => geoDialog(addEntries, result.ipv6_lists))
        ]),
        result.lists_schedule_available ? actionRow(_('Ночное обновление в 02:00'),
            _('Обновляет библиотеку по времени роутера.'), listSchedule, result.lists_scheduled) : '',
        E('p', { class: 'rw-list-hint' }, [(result.backup_mode || result.mode) === 'inverse' ?
            _('Библиотека и свои списки задают прямой выход через WAN. Исключение убирает запись из библиотеки, а свои записи имеют приоритет.') :
            _('В выборочном режиме исключения отправляются через WAN. Если запись есть и в своих списках, она идёт через туннель. Обновление библиотеки сохраняет свои записи и исключения.')]),
        E('div', { class: 'rw-list-sources rw-aligned-controls' }, [sourceMode, exclusions]),
        E('div', { class: 'rw-list-grid' }, cards),
        checkStatus,
        E('div', { class: 'rw-actions rw-equal-actions' }, [
            button(_('Применить списки'), ui.createHandlerFn(null, async () => {
                readFields();
                for (const [key] of localLists) {
                    drafts[key] = cleanDraft(key, key, drafts[key]);
                    drafts['exclude_' + key] = cleanDraft(key, 'exclude_' + key, drafts['exclude_' + key]);
                }
                if (editing === 'local')
                    localLists.forEach(([key]) => { fields[key].value = drafts[key]; });
                refreshListStatus();
                uci.set(settings, 'ui', 'project_lists', useProject.checked ? '1' : '0');
                Object.entries(drafts).forEach(([key, value]) => uci.set(settings, 'ui', key, value));
                await save();
                return action('local_lists');
            }), true),
            button(_('Обновить библиотеку'), ui.createHandlerFn(null, async () => {
                if (await action('lists') && editing === 'default')
                    showFields('default');
            })),
            button(_('Почему записи пропущены'), ui.createHandlerFn(null, showListReport))
        ])
    ]);
    return {
        panel,
        open() {
            if (opened) return;
            opened = true;
            showFields('default');
        }
    };
}

function profileForm(openNodes) {
    const map = new form.Map('routewolf_ui');
    const section = map.section(form.GridSection, 'profile', _('Профили туннелей'),
        _('Из панели можно активировать AmneziaWG, WireGuard, OpenVPN, sing-box, VLESS · Xray и Outline.'));
    section.anonymous = true;
    section.addremove = true;
    section.addbtntitle = _('Добавить профиль');
    section.modaltitle = _('Профиль туннеля');
    const renderActions = section.renderRowActions;
    section.renderRowActions = function(id, ...args) {
        const cell = renderActions.call(this, id, ...args);
        const protocol = uci.get(settings, id, 'protocol');
        const source = uci.get(settings, id, 'source') || '';
        if ((protocol === 'vless' || protocol === 'singbox') && source.startsWith('https://')) {
            const actions = cell && cell.querySelector('div');
            if (actions) actions.firstElementChild.after(button(_('Серверы'), () => openNodes(id)));
        }
        return cell;
    };

    let option = section.option(form.Value, 'name', _('Название'));
    option.rmempty = false;
    option.datatype = 'maxlength(64)';

    option = section.option(form.ListValue, 'protocol', _('Протокол'));
    option.rmempty = false;
    option.default = 'amneziawg';
    Object.keys(protocols).forEach(key => option.value(key, protocols[key]));
    option.textvalue = function(sectionId) {
        return protocols[this.cfgvalue(sectionId)] || '—';
    };

    option = section.option(form.ListValue, 'routing', _('Маршрутизация'));
    option.value('routewolf', routeNames.routewolf);
    option.value('inverse', routeNames.inverse);
    option.value('full', routeNames.full);
    option.value('json', routeNames.json);
    option.default = 'routewolf';
    option.rmempty = false;
    option.textvalue = function(sectionId) {
        return routeNames[this.cfgvalue(sectionId)] || '—';
    };
    option.validate = function(sectionId, value) {
        const protocol = this.section.getOption('protocol').formvalue(sectionId);
        return value !== 'json' || protocol === 'singbox' || _('Правила JSON доступны для подписки sing-box.');
    };

    option = section.option(form.ListValue, 'launch', _('Режим запуска'));
    option.value('boot', _('При загрузке'));
    option.value('manual', _('Вручную'));
    option.default = 'boot';
    option.rmempty = false;
    option.modalonly = true;

    option = section.option(form.DynamicList, 'dns', _('DNS профиля'),
        _('До четырёх IP-адресов. DNS провайдера остаётся доступным.'));
    option.datatype = 'ipaddr';
    option.rmempty = true;
    option.modalonly = true;

    option = section.option(form.Value, 'source', _('Ссылка на подписку или узел'));
    option.depends('protocol', 'singbox');
    option.depends('protocol', 'vless');
    option.depends('protocol', 'outline');
    option.password = true;
    option.rmempty = false;
    option.modalonly = true;
    option.validate = function(sectionId, value) {
        const protocol = this.section.getOption('protocol').formvalue(sectionId);
        if (protocol === 'outline')
            return (/^ss:\/\/\S+$/.test(value) && value.length <= 8192) || _('Введите ссылку ss://.');
        if (protocol === 'vless')
            return (/^(vless|https):\/\/\S+$/.test(value) && value.length <= 8192) ||
                _('Введите ссылку vless:// или HTTPS-подписку VLESS в формате списка ссылок или JSON Xray.');
        return (/^(https|vless|trojan|hysteria2|hy2):\/\/\S+$/.test(value) && value.length <= 8192) ||
            _('Введите HTTPS-ссылку подписки или ссылку на узел.');
    };

    option = section.option(form.TextValue, 'config', _('Конфигурация клиента'));
    option.rows = 6;
    option.monospace = true;
    option.modalonly = true;
    option.rmempty = false;
    ['amneziawg', 'wireguard', 'openvpn'].forEach(protocol => option.depends('protocol', protocol));
    option.validate = function(sectionId, value) {
        if (value.length > 65536)
            return _('Максимальный размер конфигурации 64 КБ.');
        const protocol = this.section.getOption('protocol').formvalue(sectionId);
        if (protocol === 'openvpn')
            return /^\s*(client\s*$|remote\s+\S+)/m.test(value) ||
                _('Вставьте клиентскую конфигурацию OpenVPN.');
        return (/^\s*\[Interface\]\s*$/mi.test(value) && /^\s*\[Peer\]\s*$/mi.test(value)) ||
            _('Нужны секции [Interface] и [Peer].');
    };

    return map;
}

function serverLabel(label) {
    // A pair of Unicode regional indicators indexes the local 26 × 26 sprite.
    const pieces = label.split(/([\u{1F1E6}-\u{1F1FF}]{2})/u);
    return E('span', { class: 'rw-server-label' }, pieces.map((piece, index) => {
        if (!(index % 2)) return piece;
        const [first, second] = Array.from(piece, letter => letter.codePointAt(0) - 0x1f1e6);
        return E('span', {
            class: 'rw-server-flag', 'aria-hidden': 'true',
            style: 'background-position:' + (-first * 20) + 'px ' + (-second * 15) + 'px'
        });
    }));
}

function subscriptionExpiry(value) {
    if (!Number.isInteger(value) || value <= 0)
        return _('Срок действия не указан');
    const expires = new Date(value * 1000);
    const date = expires.toLocaleDateString('ru-RU');
    const left = expires.getTime() - Date.now();
    if (left <= 0)
        return _('Срок истёк %s').format(date);
    const remaining = left < 86400000 ? _('меньше суток')
        : new Intl.RelativeTimeFormat('ru').format(Math.ceil(left / 86400000), 'day');
    return _('До %s · %s').format(date, remaining);
}

async function serverDialog(profile, action, save, current) {
    const message = E('p', { role: 'status', 'aria-live': 'polite' }, [_('Загрузка списка серверов…')]);
    const error = E('p', { role: 'alert', class: 'rw-library-error' });
    const input = E('div', { class: 'rw-server-input' });
    const summary = E('p', { class: 'rw-server-summary', hidden: true });
    let dropdown;
    const observer = { update() {}, fail: text => { error.textContent = text; } };
    const close = button(_('Закрыть'), () => ui.hideModal());
    const submit = button(_('Сохранить'), async () => {
        const value = dropdown.getValue();
        const selected = value === 'auto' ? '' : value;
        const previous = uci.get(settings, profile, 'preferred_node') || '';
        if (selected === previous) return;
        error.textContent = '';
        message.textContent = _('Сохранение…');
        submit.disabled = input.inert = close.disabled = true;
        try {
            if (selected) uci.set(settings, profile, 'preferred_node', selected);
            else uci.unset(settings, profile, 'preferred_node');
            await save();
            const state = await current();
            const operation = state.backup_profile === profile ? 'backup'
                : state.active_profile === profile && !state.paused ? 'activate' : '';
            if (operation && !await action(operation, profile, false, observer)) {
                message.textContent = _('Выбор сохранён. Он будет применён при следующей активации профиля.');
            } else {
                message.textContent = _('Выбор сохранён.');
            }
        } catch (err) {
            error.textContent = err.message;
            message.textContent = '';
        } finally {
            submit.disabled = input.inert = close.disabled = false;
        }
    }, true);
    submit.disabled = true;
    ui.showModal(_('Серверы подписки'), [
        E('p', {}, [_('Если выбранный сервер недоступен, RouteWolf использует другой доступный узел подписки и возвращается к выбранному после восстановления.')]),
        summary, input, message, error,
        E('div', { class: 'rw-actions rw-activate-actions' }, [submit, close])
    ], 'rw-servers-modal');

    try {
        let result = await listNodes(profile);
        if (result.fetch) {
            if (await action('nodes', profile, false, observer)) {
                result = await listNodes(profile);
            } else if (!result.nodes?.length) {
                message.textContent = '';
                return;
            }
        }
        const nodes = result.nodes || [];
        if (!nodes.length) throw new Error(_('В подписке нет совместимых серверов.'));
        const choices = { auto: _('Автовыбор') };
        nodes.forEach(node => {
            choices[node.id] = serverLabel(node.named ? node.label : node.label + ' · ' + node.transport);
        });
        const selected = uci.get(settings, profile, 'preferred_node') || '';
        const value = Object.hasOwn(choices, selected) ? selected : 'auto';
        dropdown = new ui.Dropdown(value, choices, {
            multiple: false,
            optional: false,
            sort: ['auto', ...new Set(nodes.map(node => node.id))],
            select_placeholder: _('Предпочитаемый сервер')
        });
        const control = dropdown.render();
        control.setAttribute('aria-label', _('Предпочитаемый сервер'));
        input.appendChild(control);
        summary.textContent = _('Серверов: %d').format(nodes.length) + ' · ' + subscriptionExpiry(result.expires);
        summary.hidden = false;
        submit.disabled = false;
        message.textContent = selected && value === 'auto' ? _('Ранее выбранного сервера больше нет в подписке.') : '';
    } catch (err) {
        error.textContent = err.message;
        message.textContent = '';
    }
}

async function confirmActivation(profile, action, backup = false, quick = false) {
    try {
        const role = backup ? 'backup' : 'primary';
        const check = await preflight(profile, role);
        const missing = check.missing || [];
        if (quick && !missing.length && !check.restart_required)
            return await action('activate', profile, true);
        const packageInfo = E('p', {}, []);
        function updatePackages(packages) {
            packageInfo.replaceChildren(...(packages.length ? [
                _('Будут установлены компоненты '), E('code', {}, [packages.join(', ')])
            ] : []));
            packageInfo.hidden = !packages.length;
        }
        updatePackages(missing);
        const spinner = E('span', { class: 'rw-install-spinner', 'aria-hidden': 'true', hidden: true });
        const status = E('span', {}, []);
        const meter = E('progress', { max: 100, value: 0, 'aria-label': _('Прогресс активации') });
        const reading = E('span', {}, []);
        const progress = E('div', { class: 'rw-install-progress', hidden: true }, [
            E('div', { class: 'rw-install-status', role: 'status' }, [spinner, status, reading]),
            meter
        ]);
        const error = E('p', { class: 'rw-install-error', role: 'alert' },
            check.restart_required ? [jobErrors['network-restart-required']] : []);
        let reloadOnClose = false;
        const close = button(_('Отмена'), () => {
            ui.hideModal();
            if (reloadOnClose)
                location.reload();
        });
        function setProgress(phase) {
            const [percent, name] = jobPhases[phase] || jobPhases.preflight;
            meter.value = Math.max(meter.value, percent);
            reading.textContent = meter.value + '%';
            status.textContent = name;
        }
        const readyLabel = backup ? _('Назначить резерв') : _('Активировать');
        const confirm = button(missing.length ? (backup ? _('Установить и назначить') : _('Установить и активировать')) : readyLabel,
            ui.createHandlerFn(null, async () => {
                close.disabled = true;
                error.textContent = '';
                progress.hidden = false;
                spinner.hidden = false;
                meter.value = 0;
                setProgress('preflight');
                const ok = await action(backup ? 'backup' : 'activate', profile, false, {
                    update: state => {
                        setProgress(state.phase);
                        if (['download', 'config', 'start', 'verify', 'done'].includes(state.phase) &&
                            meter.value >= 45)
                            packageInfo.hidden = true;
                    },
                    fail: message => { error.textContent = message; }
                });
                spinner.hidden = true;
                close.disabled = false;
                close.textContent = _('Закрыть');
                if (ok) {
                    setProgress('done');
                    reloadOnClose = true;
                    confirm.hidden = true;
                } else {
                    progress.hidden = true;
                    try {
                        const current = await preflight(profile, role);
                        const remaining = current.missing || [];
                        updatePackages(remaining);
                        if (current.restart_required) {
                            error.textContent = jobErrors['network-restart-required'];
                            confirm.hidden = true;
                        }
                        if (!remaining.length)
                            confirm.textContent = readyLabel;
                    } catch (error) {
                        // Keep the diagnostic from the job when the status check fails.
                    }
                }
            }), true);
        if (check.restart_required)
            confirm.disabled = true;
        ui.showModal(backup ? _('Резервный профиль') : _('Активация профиля'), [
            E('p', {}, [backup ? _('Резерв включится при отказе основного профиля. Для подписки сначала проверяются все серверы.') :
                _('Маршрут переключится после проверки нового туннеля.')]),
            packageInfo,
            progress,
            error,
            E('div', { class: 'rw-actions rw-activate-actions' }, [confirm, close])
        ], 'rw-activate-modal');
    } catch (error) {
        ui.addNotification(null, E('p', {}, [_('Не удалось проверить компоненты. Сохраните профиль и повторите попытку.')]));
    }
}

return view.extend({
    load: function() {
        return Promise.all([status(), uci.load(settings)]);
    },

    render: function(data) {
        const result = data[0];
        const project = this;
        const progress = E('span', { role: 'status' }, []);
        const errorText = E('span', { role: 'alert' });
        const dismissError = () => { feedback.hidden = true; errorText.textContent = ''; };
        const feedback = E('div', { class: 'rw-feedback', hidden: true }, [
            errorText, button(_('Закрыть'), dismissError)
        ]);
        const showError = message => { feedback.hidden = false; errorText.textContent = message; };
        const commit = async () => {
            await commitProfiles(settings);
            await ui.changes.init();
        };
        const save = async () => {
            await uci.save();
            await commit();
        };
        let actionRunning = false;
        const action = async (cmd, profile = '', refresh = false, observer = null) => {
            const reportError = observer ? message => observer.fail(message) : showError;
            if (actionRunning) {
                reportError(_('Дождитесь завершения текущей операции.'));
                return false;
            }
            dismissError();
            actionRunning = true;
            progress.textContent = _('Запуск…');
            try {
                if (!await jobStart(cmd, profile))
                    throw new Error(_('Действие недоступно или уже выполняется другая операция.'));
                for (let attempt = 0; attempt < 150; attempt++) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const state = await jobStatus();
                    if (observer)
                        observer.update(state);
                    if (state.running)
                        continue;
                    if (state.action && state.action !== cmd)
                        throw new Error(_('Роутер уже обрабатывает другую операцию. Проверьте состояние и повторите попытку.'));
                    if (String(state.result) !== '0')
                        throw new Error(jobErrors[state.reason] || _('Операция завершилась ошибкой. Для диагностики запустите rw diag по SSH.'));
                    progress.textContent = _('Готово');
                    if (refresh)
                        location.reload();
                    return true;
                }
                progress.textContent = _('Операция ещё выполняется.');
                if (observer)
                    observer.fail(_('Операция ещё выполняется в фоне.'));
            }
            catch (error) {
                progress.textContent = '';
                reportError(error.message);
            }
            finally {
                actionRunning = false;
            }
            return false;
        };
        const profileSelect = E('select', { id: 'rw-primary-profile' });
        const backupSelect = E('select', { id: 'rw-backup-profile' });
        let current = result;
        let preferred = uci.get(settings, 'ui', 'preferred_profile');
        const availableProfiles = () => uci.sections(settings, 'profile').filter(section =>
            Object.hasOwn(protocols, section.protocol));
        function primaryProfile() {
            const ids = availableProfiles().map(section => section['.name']);
            const primary = [preferred, current.active_profile].find(id => ids.includes(id));
            return primary || (ids.length === 1 && ids[0] !== current.backup_profile ? ids[0] : '');
        }
        const tunnelToggle = button('', ui.createHandlerFn(null, async () => {
            const primary = primaryProfile();
            const cmd = tunnelCommand(current, primary);
            if (cmd === 'choose') {
                document.getElementById('rw-tab-profiles').click();
                profileSelect.focus();
            } else if (cmd === 'activate') {
                await confirmActivation(primary, action, false, true);
            } else {
                await action(cmd, '', true);
            }
        }));
        tunnelToggle.classList.add('rw-control-toggle', 'rw-tunnel-toggle');
        function updateTunnelToggle() {
            const primary = primaryProfile();
            const cmd = tunnelCommand(current, primary);
            tunnelToggle.textContent = cmd === 'pause' ? _('Выключить') :
                cmd === 'choose' ? _('Выбрать профиль') : _('Включить');
            tunnelToggle.dataset.action = cmd === 'pause' ? 'disable' : 'enable';
            const name = cmd === 'activate' ? uci.get(settings, primary, 'name') : '';
            tunnelToggle.title = cmd === 'pause' ? _('Переключить трафик на WAN') : name || _('Включить маршрутизацию через туннель');
            if (!tunnelToggle.classList.contains('spinning'))
                tunnelToggle.disabled = !current.project_auth;
        }
        const connect = button(_('Активировать профиль'), ui.createHandlerFn(null, () =>
            profileSelect.value ? confirmActivation(profileSelect.value, action) : null), true);
        const saveBackup = button(_('Сохранить резерв'), ui.createHandlerFn(null, () =>
            backupSelect.value ? confirmActivation(backupSelect.value, action, true) :
                action('backup', 'none', true)), true);
        function updateBackupButton() {
            saveBackup.disabled = !result.project_auth || (!backupSelect.value && !result.backup_profile);
        }
        function updateConnect() {
            connect.disabled = !profileSelect.value || current.paused || !current.project_auth;
        }
        backupSelect.addEventListener('change', updateBackupButton);
        profileSelect.addEventListener('change', updateConnect);
        function updateProfiles() {
            const profiles = availableProfiles();
            const primary = primaryProfile();
            profileSelect.replaceChildren(E('option', { value: '' }, [_('Выберите профиль')]), ...profiles.map(section => E('option', {
                value: section['.name'], selected: section['.name'] === primary || null
            }, [section.name])));
            updateConnect();
            const eligible = profiles.filter(section => section['.name'] !== result.active_profile);
            backupSelect.replaceChildren(E('option', { value: '' }, [_('Без резерва')]), ...eligible.map(section =>
                E('option', { value: section['.name'], selected: section['.name'] === result.backup_profile || null },
                    [section.name])));
            updateBackupButton();
            updateTunnelToggle();
        }

        this.map = profileForm(id => serverDialog(id, action, save, status));
        return this.map.render().then(node => {
            updateProfiles();
            const listEditor = listPanel(result, save, action);
            const profiles = E('div', {}, [
                E('div', { class: 'rw-compact-table' }, [node]),
                E('div', { class: 'rw-actions rw-profile-actions' }, [
                    E('div', { class: 'rw-profile-picker' }, [
                        E('label', { for: 'rw-primary-profile' }, [_('Основной профиль')]), profileSelect, connect
                    ]),
                    button(_('Сохранить профили'), ui.createHandlerFn(project, async () => {
                        try {
                            const primary = profileSelect.value;
                            if (primary)
                                uci.set(settings, 'ui', 'preferred_profile', primary);
                            await project.map.save();
                            await commit();
                            preferred = uci.get(settings, 'ui', 'preferred_profile');
                            updateProfiles();
                            ui.addNotification(null, E('p', {}, [_('Профили сохранены.')]), 'info');
                        } catch (error) {
                            ui.addNotification(null, E('p', {}, [error.message]));
                        }
                    }), true)
                ]),
                E('div', { class: 'rw-actions rw-profile-actions' }, [
                    E('div', { class: 'rw-profile-picker' }, [
                        E('label', { for: 'rw-backup-profile' }, [_('Резервный профиль')]), backupSelect, saveBackup
                    ])
                ]),
                E('p', { class: 'rw-list-hint' }, [
                    _('Выберите другой сохранённый профиль для резерва.')
                ])
            ]);
            const controls = servicePanel(result, action, showError, save);
            const liveStatus = E('div', {}, [statusPanel(result)]);
            const badge = statusBadge(result.link_state);
            badge.setAttribute('aria-live', 'polite');
            poll.add(async () => {
                const panel = liveStatus.closest('.rw-panel');
                if (!panel || document.hidden || actionRunning)
                    return;
                try {
                    current = await status();
                    liveStatus.replaceChildren(statusPanel(current));
                    const [label, tone] = linkStates[current.link_state] || linkStates.none;
                    if (badge.textContent !== label)
                        badge.textContent = label;
                    badge.dataset.state = tone;
                    updateTunnelToggle();
                    updateConnect();
                } catch (error) {
                    // Leave the previous state visible if a poll was interrupted.
                }
            }, 15);
            return E('div', { class: 'rw-luci', keydown: event => {
                if (event.key === 'Escape' && !feedback.hidden) dismissError();
            } }, [
                E('link', { rel: 'stylesheet', href: L.resource('view/routewolf/manage.css') + '?v=29' }),
                activateTabs([
                    ['overview', _('Обзор'), liveStatus],
                    ['profiles', _('Профили'), profiles],
                    ['lists', _('Списки'), listEditor.panel, listEditor.open],
                    ['service', _('Управление'), controls]
                ], E('div', { class: 'rw-title-row' }, [
                    E('h2', {}, ['RouteWolf']),
                    badge
                ]), progress, tunnelToggle, feedback)
            ]);
        });
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
