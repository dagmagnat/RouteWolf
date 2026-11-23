'use strict';
'require view';
'require form';
'require rpc';
'require ui';
'require uci';
'require poll';

const protocols = {
    amneziawg: 'AmneziaWG',
    wireguard: 'WireGuard',
    openvpn: 'OpenVPN',
    singbox: 'sing-box',
    outline: 'Outline'
};

const routeNames = {
    routewolf: _('Выборочно по спискам RouteWolf'),
    full: _('Весь интернет через туннель'),
    json: _('Правила из JSON-подписки'),
    none: _('Туннель не настроен')
};

const status = rpc.declare({ object: 'routewolf_ui', method: 'status', reject: true });
const startup = rpc.declare({ object: 'routewolf_ui', method: 'startup', params: ['action'], reject: true, expect: { ok: false } });
const codeUpdates = rpc.declare({ object: 'routewolf_ui', method: 'code_updates', params: ['action'], reject: true, expect: { ok: false } });
const commitProfiles = rpc.declare({ object: 'uci', method: 'commit', params: ['config'], reject: true });

const jobStart = rpc.declare({ object: 'routewolf_ui', method: 'job', params: ['action', 'profile'], reject: true, expect: { ok: false } });
const jobStatus = rpc.declare({ object: 'routewolf_ui', method: 'job_status', reject: true });
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
    'invalid-profile': _('Проверьте адрес, ключи и режим запуска сохранённого профиля.'),
    'package-install': _('Не удалось установить компоненты. Проверьте DNS, доступ к репозиторию OpenWrt и свободное место.'),
    'source-download': _('Не удалось загрузить подписку или её компоненты. Проверьте ссылку и доступ в интернет.'),
    'config-invalid': _('Профиль не прошёл проверку формата или содержит неподдерживаемые параметры.'),
    'subscription-format': _('Подписка загружена. В ней не удалось найти совместимые серверы или прочитать её правила. Проверьте формат подписки и выбранную маршрутизацию.'),
    'engine-config': _('Установленный sing-box отклонил конфигурацию. Проверьте поддержку протокола и транспорта в этой версии.'),
    'tunnel-start': _('Интерфейс туннеля не удалось запустить.'),
    'tunnel-unreachable': _('Туннель запустился, но проверка связи не прошла.'),
    'route-unavailable': _('Туннель поднят, но маршрут через него недоступен.'),
    'profile-dns': _('Не удалось подключить DNS профиля. Проверьте IP-адреса и конфигурацию dnsmasq.'),
    paused: _('Сначала возобновите маршрутизацию на вкладке «Обзор».')
};

const listSchedule = rpc.declare({ object: 'routewolf_ui', method: 'list_schedule', params: ['action'], reject: true, expect: { ok: false } });
const libraryPage = rpc.declare({ object: 'routewolf_ui', method: 'library', params: ['kind', 'query', 'offset', 'group', 'limit'], reject: true });
const geoData = rpc.declare({ object: 'routewolf_ui', method: 'geodata', params: ['kind', 'category'], reject: true });
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
    paused: [_('Пауза · WAN'), 'waiting'],
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

function activateTabs(tabs, title, progress) {
    const buttons = [];
    const panels = [];
    const names = tabs.map(([id]) => id);
    const select = (index, focus) => {
        buttons.forEach((item, i) => {
            item.setAttribute('aria-selected', String(i === index));
            item.tabIndex = i === index ? 0 : -1;
            panels[i].hidden = i !== index;
        });
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
            progress
        ]),
        ...panels
    ]);
}

function formatHandshake(timestamp) {
    if (!timestamp)
        return _('Нет данных');
    return new Date(timestamp * 1000).toLocaleString();
}

function actionRow(title, description, change, state) {
    const button = E('button', {
        class: 'cbi-button rw-control-toggle', type: 'button', 'data-action': state ? 'disable' : 'enable'
    },
        state ? _('Выключить') : _('Включить'));

    button.addEventListener('click', async () => {
        const next = !state;
        button.disabled = true;
        try {
            if (!await change(next ? 'enable' : 'disable'))
                throw new Error(_('RouteWolf не подтвердил изменение.'));
            state = next;
            button.dataset.action = state ? 'disable' : 'enable';
            button.textContent = state ? _('Выключить') : _('Включить');
        }
        catch (error) {
            ui.addNotification(null, E('p', {}, [error.message]));
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

function statusPanel(result) {
    if (!result.project_auth)
        return E('p', { class: 'alert-message warning' }, [_('Сервис RouteWolf на роутере не найден.')]);

    const tunnel = [protocols[result.protocol], result.tunnel].filter(Boolean).join(' · ');
    const primary = [
        [_('Маршрутизация'), result.paused ? _('Через WAN') : routeNames[result.backup_mode || result.mode] || '—'],
        [_('Интернет по умолчанию'), result.wan_device || '—']
    ];
    const facts = [
        [_('Версия'), result.version || '—'],
        [_('Нагрузка за минуту'), result.load || '—'],
        [_('Занято ОЗУ'), result.ram >= 0 ? result.ram + '%' : '—'],
        [_('Последнее рукопожатие'), formatHandshake(result.handshake)]
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

function servicePanel(result, action) {
    const items = [
        actionRow(_('Списки при загрузке'), _('Запускает загрузку списков после включения роутера.'), startup, result.lists_boot),
        actionRow(_('Автообновление кода'), _('Проверка стабильного выпуска по расписанию.'), codeUpdates, result.code_auto),
        actionRow(_('Перехват DNS'), _('Перенаправляет обычный DNS устройств LAN через dnsmasq роутера.'),
            value => action(value === 'enable' ? 'dns_on' : 'dns_off'), result.dns_force)
    ];
    const commands = [
        [_('Обновить проект'), 'update'],
        [_('Перезапустить RouteWolf'), 'reload_project'],
        [_('Проверить правила'), 'check'],
        [_('Восстановить маршруты'), 'repair']
    ];
    if (result.tunnel && !result.paused)
        commands.push([_('Перезапустить туннель'), 'restart']);
    if (result.protocol === 'openvpn')
        commands.push([_('Включить DCO'), 'dco_on'], [_('Выключить DCO'), 'dco_off']);
    return E('div', {}, [
        ...items,
        E('div', { class: 'rw-actions' }, commands.map(([label, cmd]) => button(label, ui.createHandlerFn(null, () => {
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
    const kind = E('select', { 'aria-label': _('Тип геоданных') }, [
        E('option', { value: 'geosite' }, ['GeoSite · ', _('домены')]),
        E('option', { value: 'geoip' }, ['GeoIP · ', _('адреса')])
    ]);
    const category = E('input', {
        maxlength: 72, placeholder: 'youtube, geoip:telegram', 'aria-label': _('Категория')
    });
    const notice = E('p', { class: 'rw-list-hint', role: 'status' }, []);
    const error = E('p', { class: 'rw-install-error', role: 'alert' }, []);
    let entries = [];
    function reset() {
        entries = [];
        notice.textContent = '';
        error.textContent = '';
        copy.disabled = true;
    }
    const fetch = button(_('Загрузить'), ui.createHandlerFn(null, async () => {
        reset();
        const input = /^(?:(geosite|geoip):)?([a-z0-9_][a-z0-9_@.-]{0,63})$/.exec(category.value.trim().toLowerCase());
        if (!input) {
            error.textContent = _('Введите имя категории, например geosite:youtube или geoip:telegram.');
            return;
        }
        kind.disabled = category.disabled = true;
        try {
            const imported = await geoData(input[1] || kind.value, input[2]);
            if (imported.too_large)
                throw new Error(_('Эта категория превышает лимит списка 24 КБ.'));
            entries = imported.entries.filter(item => ipv6Enabled || item.kind !== 'ipv6');
            if (!entries.length)
                throw new Error(_('В категории нет записей, которые можно добавить.'));
            notice.textContent = _('Готово к добавлению: %d записей.').format(entries.length);
            if (imported.entries.length !== entries.length)
                notice.textContent += ' ' + _('IPv6 пропущен, потому что маршрутизация IPv6 отключена.');
            if (imported.skipped)
                notice.textContent += ' ' + _('Сложные правила пропущены.');
            copy.disabled = false;
        } catch (failure) {
            error.textContent = failure.message || _('Не удалось загрузить категорию.');
        } finally {
            kind.disabled = category.disabled = false;
        }
    }));
    const copy = button(_('Добавить в свои списки'), () => {
        try {
            addEntries(entries, false);
            ui.hideModal();
        } catch (failure) {
            error.textContent = failure.message;
        }
    }, true);
    copy.disabled = true;
    category.addEventListener('input', reset);
    kind.addEventListener('change', reset);
    ui.showModal(_('Импорт GeoIP и GeoSite'), [
        E('p', {}, [_('Загрузите категорию и проверьте записи в своих списках перед применением. Точные домены также включают поддомены.')]),
        E('div', { class: 'rw-actions rw-geo-fields' }, [kind, category, fetch]),
        notice, error,
        E('div', { class: 'rw-actions rw-activate-actions' }, [copy, button(_('Закрыть'), () => ui.hideModal())])
    ], 'rw-activate-modal');
}

function listPanel(result, save, action) {
    const useProject = E('input', { type: 'checkbox', checked: uci.get(settings, 'ui', 'project_lists') !== '0' || null });
    const drafts = {};
    const fields = {};
    for (const [key] of localLists) {
        drafts[key] = uci.get(settings, 'ui', key) || '';
        drafts['exclude_' + key] = uci.get(settings, 'ui', 'exclude_' + key) || '';
    }
    const sourceMode = E('select', { 'aria-label': _('Редактируемые списки') }, [
        E('option', { value: 'local' }, [_('Свои записи')]),
        E('option', { value: 'exclude' }, [_('Исключения из библиотеки')])
    ]);
    let editing = 'local';
    function readFields() {
        localLists.forEach(([key]) => { drafts[(editing === 'exclude' ? 'exclude_' : '') + key] = fields[key].value; });
    }
    function showFields(mode) {
        readFields();
        editing = sourceMode.value = mode;
        localLists.forEach(([key]) => { fields[key].value = drafts[(editing === 'exclude' ? 'exclude_' : '') + key]; });
    }
    function addEntries(entries, excluded) {
        readFields();
        const next = { ...drafts };
        for (const [key] of localLists) {
            const field = (excluded ? 'exclude_' : '') + key;
            const values = entries.filter(entry => entry.kind === key).map(entry => entry.value);
            next[field] = [...new Set([...drafts[field].split(/\r?\n/), ...values].map(item => item.trim()).filter(Boolean))].join('\n');
            if (new TextEncoder().encode(next[field]).length > maxListBytes)
                throw new Error(_('Список превышает 24 КБ. Добавьте меньше записей.'));
        }
        Object.assign(drafts, next);
        editing = sourceMode.value = excluded ? 'exclude' : 'local';
        localLists.forEach(([name]) => { fields[name].value = drafts[(excluded ? 'exclude_' : '') + name]; });
    }
    sourceMode.addEventListener('change', () => showFields(sourceMode.value));
    const cards = localLists.map(([key, label, placeholder]) => {
        const area = E('textarea', { rows: 6, maxlength: 24576, placeholder }, [drafts[key]]);
        fields[key] = area;
        return E('label', {}, [label, area]);
    });
    return E('div', {}, [
        E('div', { class: 'rw-list-sources' }, [
            E('label', { class: 'rw-list-checkbox' }, [useProject, _('Использовать списки проекта')]),
            button(_('Загрузить из библиотеки'), () => libraryDialog(addEntries)),
            button(_('Импорт GeoIP / GeoSite'), () => geoDialog(addEntries, result.ipv6_lists))
        ]),
        result.lists_schedule_available ? actionRow(_('Ночное обновление в 02:00'),
            _('Обновляет библиотеку по времени роутера.'), listSchedule, result.lists_scheduled) : '',
        E('p', { class: 'rw-list-hint' }, [_('В выборочном режиме исключения отправляются через WAN. Если запись есть и в своих списках, она идёт через туннель. Обновление библиотеки сохраняет свои записи и исключения.')]),
        sourceMode,
        E('div', { class: 'rw-list-grid' }, cards),
        E('div', { class: 'rw-actions rw-equal-actions' }, [
            button(_('Применить списки'), ui.createHandlerFn(null, async () => {
                readFields();
                uci.set(settings, 'ui', 'project_lists', useProject.checked ? '1' : '0');
                Object.entries(drafts).forEach(([key, value]) => uci.set(settings, 'ui', key, value));
                await save();
                return action('local_lists');
            }), true),
            button(_('Обновить библиотеку'), ui.createHandlerFn(null, () => action('lists')))
        ])
    ]);
}

function profileForm() {
    const map = new form.Map('routewolf_ui');
    const section = map.section(form.GridSection, 'profile', _('Профили туннелей'),
        _('Из панели можно активировать AmneziaWG, WireGuard, OpenVPN, sing-box и Outline.'));
    section.anonymous = true;
    section.addremove = true;
    section.addbtntitle = _('Добавить профиль');
    section.modaltitle = _('Профиль туннеля');

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
    option.depends('protocol', 'outline');
    option.password = true;
    option.rmempty = false;
    option.modalonly = true;
    option.validate = function(sectionId, value) {
        const protocol = this.section.getOption('protocol').formvalue(sectionId);
        if (protocol === 'outline')
            return (/^ss:\/\/\S+$/.test(value) && value.length <= 8192) || _('Введите ссылку ss://.');
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

async function confirmActivation(profile, action, backup = false) {
    try {
        const role = backup ? 'backup' : 'primary';
        const check = await preflight(profile, role);
        const missing = check.missing || [];
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
        const error = E('p', { class: 'rw-install-error', role: 'alert' }, []);
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
                        const remaining = (await preflight(profile, role)).missing || [];
                        updatePackages(remaining);
                        if (!remaining.length)
                            confirm.textContent = readyLabel;
                    } catch (error) {
                        // Keep the diagnostic from the job when the status check fails.
                    }
                }
            }), true);
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
        const commit = async () => {
            await commitProfiles(settings);
            await ui.changes.init();
        };
        const save = async () => {
            await uci.save();
            await commit();
        };
        const action = async (cmd, profile = '', refresh = false, observer = null) => {
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
                    if (state.result !== '0')
                        throw new Error(jobErrors[state.reason] || _('Операция завершилась ошибкой. Проверьте настройки и повторите.'));
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
                if (observer)
                    observer.fail(error.message);
                else
                    ui.addNotification(null, E('p', {}, [error.message]));
            }
            return false;
        };
        const profileSelect = E('select', { id: 'rw-primary-profile' });
        const backupSelect = E('select', { id: 'rw-backup-profile' });
        const connect = button(_('Сделать основным'), ui.createHandlerFn(null, () =>
            profileSelect.value ? confirmActivation(profileSelect.value, action) : null), true);
        const saveBackup = button(_('Сохранить резерв'), ui.createHandlerFn(null, () =>
            backupSelect.value ? confirmActivation(backupSelect.value, action, true) :
                action('backup', 'none', true)), true);
        function updateBackupButton() {
            saveBackup.disabled = !result.project_auth || (!backupSelect.value && !result.backup_profile);
        }
        backupSelect.addEventListener('change', updateBackupButton);
        function updateProfiles() {
            const profiles = uci.sections(settings, 'profile').filter(section =>
                ['wireguard', 'amneziawg', 'openvpn', 'singbox', 'outline'].includes(section.protocol));
            profileSelect.replaceChildren(...profiles.map(section => E('option', {
                value: section['.name'], selected: section['.name'] === result.active_profile || null
            }, [section.name])));
            connect.disabled = !profiles.length || result.paused || !result.project_auth;
            const eligible = profiles.filter(section =>
                section['.name'] !== result.active_profile || section['.name'] === result.backup_profile);
            backupSelect.replaceChildren(E('option', { value: '' }, [_('Без резерва')]), ...eligible.map(section =>
                E('option', { value: section['.name'], selected: section['.name'] === result.backup_profile || null },
                    [section.name])));
            updateBackupButton();
        }

        this.map = profileForm();
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
                            await project.map.save();
                            await commit();
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
            const controls = servicePanel(result, action);
            const liveStatus = E('div', {}, [statusPanel(result)]);
            const badge = statusBadge(result.link_state);
            poll.add(async () => {
                const panel = liveStatus.closest('.rw-panel');
                if (!panel || panel.hidden || document.hidden)
                    return;
                try {
                    const current = await status();
                    liveStatus.replaceChildren(statusPanel(current));
                    const [label, tone] = linkStates[current.link_state] || linkStates.none;
                    badge.textContent = label;
                    badge.dataset.state = tone;
                } catch (error) {
                    // Leave the previous state visible if a poll was interrupted.
                }
            }, 15);
            const stopped = !result.paused && result.link_state === 'down';
            const overview = E('div', {}, [
                liveStatus,
                result.tunnel || result.paused ? E('div', { class: 'rw-actions rw-routing-actions' }, [
                    button(result.paused ? _('Возобновить маршрутизацию') :
                        stopped ? _('Восстановить маршрутизацию') : _('Приостановить маршрутизацию'),
                        ui.createHandlerFn(null, () => action(result.paused ? 'resume' : stopped ? 'repair' : 'pause', '', true)))
                ]) : ''
            ]);
            return E('div', { class: 'rw-luci' }, [
                E('link', { rel: 'stylesheet', href: L.resource('view/routewolf/manage.css') }),
                activateTabs([
                    ['overview', _('Обзор'), overview],
                    ['profiles', _('Профили'), profiles],
                    ['lists', _('Списки'), listEditor],
                    ['service', _('Управление'), controls]
                ], E('div', { class: 'rw-title-row' }, [
                    E('h2', {}, ['RouteWolf']),
                    badge
                ]), progress)
            ]);
        });
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
