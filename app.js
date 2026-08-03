require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { randomUUID, randomBytes, timingSafeEqual, createHmac, createHash } = require('crypto');
const fetch = require('node-fetch');
const QRCode = require('qrcode');
const TelegramBot = require('node-telegram-bot-api');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const net = require('net');
const tls = require('tls');
const https = require('https');
const dns = require('dns').promises;
const { encrypt, decrypt } = require('./lib_crypto');
const { createVpnManager } = require('./lib_vpn_manager');

const COUNTRIES = [
  { code: 'AE', name_ru: 'ОАЭ', flag: '🇦🇪' },
  { code: 'AL', name_ru: 'Албания', flag: '🇦🇱' },
  { code: 'AM', name_ru: 'Армения', flag: '🇦🇲' },
  { code: 'AR', name_ru: 'Аргентина', flag: '🇦🇷' },
  { code: 'AT', name_ru: 'Австрия', flag: '🇦🇹' },
  { code: 'AU', name_ru: 'Австралия', flag: '🇦🇺' },
  { code: 'AZ', name_ru: 'Азербайджан', flag: '🇦🇿' },
  { code: 'BA', name_ru: 'Босния и Герцеговина', flag: '🇧🇦' },
  { code: 'BE', name_ru: 'Бельгия', flag: '🇧🇪' },
  { code: 'BG', name_ru: 'Болгария', flag: '🇧🇬' },
  { code: 'BH', name_ru: 'Бахрейн', flag: '🇧🇭' },
  { code: 'BR', name_ru: 'Бразилия', flag: '🇧🇷' },
  { code: 'BY', name_ru: 'Беларусь', flag: '🇧🇾' },
  { code: 'CA', name_ru: 'Канада', flag: '🇨🇦' },
  { code: 'CH', name_ru: 'Швейцария', flag: '🇨🇭' },
  { code: 'CL', name_ru: 'Чили', flag: '🇨🇱' },
  { code: 'CN', name_ru: 'Китай', flag: '🇨🇳' },
  { code: 'CO', name_ru: 'Колумбия', flag: '🇨🇴' },
  { code: 'CR', name_ru: 'Коста-Рика', flag: '🇨🇷' },
  { code: 'CY', name_ru: 'Кипр', flag: '🇨🇾' },
  { code: 'CZ', name_ru: 'Чехия', flag: '🇨🇿' },
  { code: 'DE', name_ru: 'Германия', flag: '🇩🇪' },
  { code: 'DK', name_ru: 'Дания', flag: '🇩🇰' },
  { code: 'EE', name_ru: 'Эстония', flag: '🇪🇪' },
  { code: 'EG', name_ru: 'Египет', flag: '🇪🇬' },
  { code: 'ES', name_ru: 'Испания', flag: '🇪🇸' },
  { code: 'FI', name_ru: 'Финляндия', flag: '🇫🇮' },
  { code: 'FR', name_ru: 'Франция', flag: '🇫🇷' },
  { code: 'GB', name_ru: 'Великобритания', flag: '🇬🇧' },
  { code: 'GE', name_ru: 'Грузия', flag: '🇬🇪' },
  { code: 'GR', name_ru: 'Греция', flag: '🇬🇷' },
  { code: 'HK', name_ru: 'Гонконг', flag: '🇭🇰' },
  { code: 'HR', name_ru: 'Хорватия', flag: '🇭🇷' },
  { code: 'HU', name_ru: 'Венгрия', flag: '🇭🇺' },
  { code: 'ID', name_ru: 'Индонезия', flag: '🇮🇩' },
  { code: 'IE', name_ru: 'Ирландия', flag: '🇮🇪' },
  { code: 'IL', name_ru: 'Израиль', flag: '🇮🇱' },
  { code: 'IN', name_ru: 'Индия', flag: '🇮🇳' },
  { code: 'IQ', name_ru: 'Ирак', flag: '🇮🇶' },
  { code: 'IS', name_ru: 'Исландия', flag: '🇮🇸' },
  { code: 'IT', name_ru: 'Италия', flag: '🇮🇹' },
  { code: 'JO', name_ru: 'Иордания', flag: '🇯🇴' },
  { code: 'JP', name_ru: 'Япония', flag: '🇯🇵' },
  { code: 'KG', name_ru: 'Кыргызстан', flag: '🇰🇬' },
  { code: 'KR', name_ru: 'Южная Корея', flag: '🇰🇷' },
  { code: 'KW', name_ru: 'Кувейт', flag: '🇰🇼' },
  { code: 'KZ', name_ru: 'Казахстан', flag: '🇰🇿' },
  { code: 'LT', name_ru: 'Литва', flag: '🇱🇹' },
  { code: 'LU', name_ru: 'Люксембург', flag: '🇱🇺' },
  { code: 'LV', name_ru: 'Латвия', flag: '🇱🇻' },
  { code: 'MA', name_ru: 'Марокко', flag: '🇲🇦' },
  { code: 'MD', name_ru: 'Молдова', flag: '🇲🇩' },
  { code: 'ME', name_ru: 'Черногория', flag: '🇲🇪' },
  { code: 'MK', name_ru: 'Северная Македония', flag: '🇲🇰' },
  { code: 'MT', name_ru: 'Мальта', flag: '🇲🇹' },
  { code: 'MX', name_ru: 'Мексика', flag: '🇲🇽' },
  { code: 'MY', name_ru: 'Малайзия', flag: '🇲🇾' },
  { code: 'NG', name_ru: 'Нигерия', flag: '🇳🇬' },
  { code: 'NL', name_ru: 'Нидерланды', flag: '🇳🇱' },
  { code: 'NO', name_ru: 'Норвегия', flag: '🇳🇴' },
  { code: 'NZ', name_ru: 'Новая Зеландия', flag: '🇳🇿' },
  { code: 'OM', name_ru: 'Оман', flag: '🇴🇲' },
  { code: 'PA', name_ru: 'Панама', flag: '🇵🇦' },
  { code: 'PE', name_ru: 'Перу', flag: '🇵🇪' },
  { code: 'PH', name_ru: 'Филиппины', flag: '🇵🇭' },
  { code: 'PK', name_ru: 'Пакистан', flag: '🇵🇰' },
  { code: 'PL', name_ru: 'Польша', flag: '🇵🇱' },
  { code: 'PT', name_ru: 'Португалия', flag: '🇵🇹' },
  { code: 'QA', name_ru: 'Катар', flag: '🇶🇦' },
  { code: 'RO', name_ru: 'Румыния', flag: '🇷🇴' },
  { code: 'RS', name_ru: 'Сербия', flag: '🇷🇸' },
  { code: 'RU', name_ru: 'Россия', flag: '🇷🇺' },
  { code: 'SA', name_ru: 'Саудовская Аравия', flag: '🇸🇦' },
  { code: 'SE', name_ru: 'Швеция', flag: '🇸🇪' },
  { code: 'SG', name_ru: 'Сингапур', flag: '🇸🇬' },
  { code: 'SI', name_ru: 'Словения', flag: '🇸🇮' },
  { code: 'SK', name_ru: 'Словакия', flag: '🇸🇰' },
  { code: 'TH', name_ru: 'Таиланд', flag: '🇹🇭' },
  { code: 'TJ', name_ru: 'Таджикистан', flag: '🇹🇯' },
  { code: 'TR', name_ru: 'Турция', flag: '🇹🇷' },
  { code: 'TW', name_ru: 'Тайвань', flag: '🇹🇼' },
  { code: 'UA', name_ru: 'Украина', flag: '🇺🇦' },
  { code: 'US', name_ru: 'США', flag: '🇺🇸' },
  { code: 'UZ', name_ru: 'Узбекистан', flag: '🇺🇿' },
  { code: 'VN', name_ru: 'Вьетнам', flag: '🇻🇳' },
  { code: 'AD', name_ru: 'Андорра', flag: '🇦🇩' },
  { code: 'BD', name_ru: 'Бангладеш', flag: '🇧🇩' },
  { code: 'BN', name_ru: 'Бруней', flag: '🇧🇳' },
  { code: 'BO', name_ru: 'Боливия', flag: '🇧🇴' },
  { code: 'DO', name_ru: 'Доминикана', flag: '🇩🇴' },
  { code: 'DZ', name_ru: 'Алжир', flag: '🇩🇿' },
  { code: 'EC', name_ru: 'Эквадор', flag: '🇪🇨' },
  { code: 'ET', name_ru: 'Эфиопия', flag: '🇪🇹' },
  { code: 'KE', name_ru: 'Кения', flag: '🇰🇪' },
  { code: 'KH', name_ru: 'Камбоджа', flag: '🇰🇭' },
  { code: 'LA', name_ru: 'Лаос', flag: '🇱🇦' },
  { code: 'LI', name_ru: 'Лихтенштейн', flag: '🇱🇮' },
  { code: 'LK', name_ru: 'Шри-Ланка', flag: '🇱🇰' },
  { code: 'MC', name_ru: 'Монако', flag: '🇲🇨' },
  { code: 'MN', name_ru: 'Монголия', flag: '🇲🇳' },
  { code: 'MO', name_ru: 'Макао', flag: '🇲🇴' },
  { code: 'MV', name_ru: 'Мальдивы', flag: '🇲🇻' },
  { code: 'NP', name_ru: 'Непал', flag: '🇳🇵' },
  { code: 'SM', name_ru: 'Сан-Марино', flag: '🇸🇲' },
  { code: 'SV', name_ru: 'Сальвадор', flag: '🇸🇻' },
  { code: 'TN', name_ru: 'Тунис', flag: '🇹🇳' },
  { code: 'UY', name_ru: 'Уругвай', flag: '🇺🇾' },
  { code: 'VA', name_ru: 'Ватикан', flag: '🇻🇦' },
  { code: 'VE', name_ru: 'Венесуэла', flag: '🇻🇪' },
  { code: 'XK', name_ru: 'Косово', flag: '🇽🇰' },
  { code: 'EU', name_ru: 'Европейский союз', flag: '🇪🇺' },
  { code: 'ZZ', name_ru: 'Другое / свой регион', flag: '🇪🇺' },
  { code: 'ZA', name_ru: 'ЮАР', flag: '🇿🇦' }
];


function sanitizeCustomFlag(value, { strict = false, fallback = '' } = {}) {
  const raw = String(value || '').normalize('NFKC').trim();
  if (!raw) return fallback;
  if (/^[a-z]{2}$/i.test(raw)) return getFlagEmojiFromCode(raw) || fallback;

  const codePoints = Array.from(raw);
  const emojiOnly = /^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\p{Emoji_Component}\u200D\uFE0F]+$/u.test(raw);
  if (!emojiOnly || codePoints.length > 8) {
    if (strict) throw new Error('Свой флаг должен быть emoji-флагом или коротким emoji без HTML и текста.');
    return fallback;
  }
  return raw;
}

function buildCountryFromForm(countryCode, customName, customFlag) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (code === 'ZZ' || code === 'CUSTOM' || code === '__CUSTOM__') {
    const name = String(customName || '').trim();
    if (!name) throw new Error('Для своего региона укажи название.');
    return { code: 'ZZ', name_ru: name, flag: sanitizeCustomFlag(customFlag, { strict: true, fallback: '🌐' }) };
  }
  return COUNTRIES.find(c => c.code === code) || null;
}

function getFlagEmojiFromCode(code) {
  const cc = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || ['ZZ', 'XX'].includes(cc)) return '';
  return Array.from(cc).map(ch => String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 65)).join('');
}

function normalizeEmojiFlag(value) {
  return sanitizeCustomFlag(value, { fallback: '' });
}

function getCountryFlag(countryName) {
  const raw = String(countryName || '').trim();
  if (!raw) return '🌐';

  const byCode = COUNTRIES.find(c => String(c.code || '').toUpperCase() === raw.toUpperCase());
  if (byCode) return byCode.flag || getFlagEmojiFromCode(byCode.code) || '🌐';

  const lower = raw.toLowerCase();
  const found = COUNTRIES.find(c => String(c.name_ru || '').trim().toLowerCase() === lower);
  if (found) return found.flag || getFlagEmojiFromCode(found.code) || '🌐';

  const contained = COUNTRIES.find(c => {
    const name = String(c.name_ru || '').trim().toLowerCase();
    return name && (lower.includes(name) || name.includes(lower));
  });
  return contained?.flag || getFlagEmojiFromCode(raw) || '🌐';
}

function getCountryCodeByName(countryName) {
  const raw = String(countryName || '').trim().toLowerCase();
  if (!raw) return '';
  const byCode = COUNTRIES.find(c => String(c.code || '').trim().toLowerCase() === raw);
  if (byCode) return String(byCode.code || '').toLowerCase();
  const found = COUNTRIES.find(c => String(c.name_ru || '').trim().toLowerCase() === raw);
  return found ? String(found.code || '').toLowerCase() : '';
}

function getCountryFlagFromParts(code = '', fallbackFlag = '', countryName = '') {
  const direct = normalizeEmojiFlag(fallbackFlag);
  if (direct && direct !== '🌐') return direct;
  const byCode = getFlagEmojiFromCode(code);
  if (byCode) return byCode;
  const byName = getCountryFlag(countryName);
  return byName || direct || '🌐';
}

function getNodeFlag(node = {}) {
  return getCountryFlagFromParts(
    node?.country_code || node?.countryCode || '',
    node?.country_flag || node?.countryFlag || node?.flag || '',
    node?.country_name_ru || node?.countryNameRu || node?.countryName || node?.name || node?.node_name || node?.nodeName || ''
  );
}

function getNodeCountryCode(node = {}) {
  const rawCode = String(node?.country_code || node?.countryCode || '').trim();
  if (rawCode) return rawCode.toLowerCase();
  return getCountryCodeByName(node?.country_name_ru || node?.countryNameRu || node?.countryName || node?.name || node?.node_name || node?.nodeName || '');
}

function enrichNodeFlagFields(node = {}) {
  return {
    ...node,
    country_code: node.country_code || node.countryCode || getNodeCountryCode(node),
    country_flag: getNodeFlag(node)
  };
}

function getNodeDisplayName(node) {
  const base = String(node?.country_name_ru || node?.name || 'Узел').trim();
  const suffix = String(node?.label_suffix || '').trim();

  if (!suffix) return base;
  if (/^\d+$/.test(suffix)) return `${base}-${suffix}`;

  return `${base} ${suffix}`;
}

function getNodePublicName(node) {
  const name = getNodeDisplayName(node);
  const flag = getNodeFlag(node);
  return `${flag} ${name}`.trim();
}

function getSortedCountriesRu() {
  const customCodes = new Set(['ZZ', 'CUSTOM', '__CUSTOM__']);
  return [...COUNTRIES].sort((a, b) => {
    const ac = customCodes.has(String(a.code || '').toUpperCase());
    const bc = customCodes.has(String(b.code || '').toUpperCase());
    if (ac !== bc) return ac ? 1 : -1;
    return String(a.name_ru || '').localeCompare(String(b.name_ru || ''), 'ru', { sensitivity: 'base' });
  });
}

function getNodesPageSize() {
  const n = Number(getSetting('nodes_page_size', '10'));
  return [10, 12, 15].includes(n) ? n : 10;
}

const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
const db = new Database(path.join(DATA_DIR, 'app.db'));


function assertKnownIdentifier(value) {
  const clean = String(value || '');
  if (!/^[A-Za-z0-9_]+$/.test(clean)) throw new Error(`Unsafe database identifier: ${clean}`);
  return clean;
}

function columnExists(table, column) {
  const safeTable = assertKnownIdentifier(table);
  return db.prepare(`PRAGMA table_info(${safeTable})`).all().some(row => row.name === column);
}

function addColumnIfMissing(table, column, definition) {
  const safeTable = assertKnownIdentifier(table);
  const safeColumn = assertKnownIdentifier(column);
  if (columnExists(safeTable, safeColumn)) return;
  db.prepare(`ALTER TABLE ${safeTable} ADD COLUMN ${safeColumn} ${definition}`).run();
}

function nodeOrderSql(alias = '') {
  const prefix = alias ? `${assertKnownIdentifier(alias)}.` : '';
  return `COALESCE(${prefix}sort_order, ${prefix}id) ASC, ${prefix}id ASC`;
}

function backfillSchemaDefaults() {
  try { db.prepare("UPDATE clients SET display_name = login WHERE (display_name IS NULL OR display_name = '') AND login IS NOT NULL").run(); } catch (_) {}
  try { db.prepare("UPDATE clients SET comment = '' WHERE comment IS NULL").run(); } catch (_) {}
  try { db.prepare("UPDATE clients SET flow = '' WHERE flow IS NULL").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET panel_path = '' WHERE panel_path IS NULL").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET sub_base_url = '' WHERE sub_base_url IS NULL").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET node_type = '3xui' WHERE node_type IS NULL OR node_type = ''").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET label_suffix = '' WHERE label_suffix IS NULL").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET h1cloud_link_mode = 'vless_reality' WHERE h1cloud_link_mode IS NULL OR h1cloud_link_mode = ''").run(); } catch (_) {}
  try {
    db.prepare(`
      UPDATE nodes
      SET h1cloud_link_types = CASE
        WHEN h1cloud_link_mode IN ('all', 'vless_all') THEN 'reality,xhttp,xhttp_cdn'
        WHEN h1cloud_link_mode IN ('vless_ws', 'xhttp') THEN 'xhttp'
        WHEN h1cloud_link_mode = 'xhttp_cdn' THEN 'xhttp_cdn'
        ELSE 'reality'
      END
      WHERE h1cloud_link_types IS NULL OR TRIM(h1cloud_link_types) = ''
         OR (TRIM(h1cloud_link_types) = 'reality' AND h1cloud_link_mode IN ('all', 'vless_all', 'vless_ws', 'xhttp', 'xhttp_cdn'))
    `).run();
  } catch (_) {}
  try { db.prepare("UPDATE nodes SET h1cloud_fingerprint = '' WHERE h1cloud_fingerprint IS NULL").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET h1cloud_xhttp_backend_path = '/api/v1/sync/' WHERE h1cloud_xhttp_backend_path IS NULL OR TRIM(h1cloud_xhttp_backend_path) = ''").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET h1cloud_xhttp_method = 'GET' WHERE h1cloud_xhttp_method IS NULL OR TRIM(h1cloud_xhttp_method) = ''").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET h1cloud_xhttp_alpn = 'h2,http1' WHERE h1cloud_xhttp_alpn IS NULL OR TRIM(h1cloud_xhttp_alpn) = ''").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET h1cloud_cdn_port = 443 WHERE h1cloud_cdn_port IS NULL OR h1cloud_cdn_port < 1").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET h1cloud_cdn_tag = 'CDN' WHERE h1cloud_cdn_tag IS NULL OR TRIM(h1cloud_cdn_tag) = ''").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET h1cloud_reality_sni = 'proxy11.h1guro.ovh' WHERE h1cloud_reality_sni IS NULL OR TRIM(h1cloud_reality_sni) = ''").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET h1cloud_3xui_shared_traffic = 0 WHERE h1cloud_3xui_shared_traffic IS NULL OR node_type = 'h1cloud_3xui'").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET h1cloud_3xui_json_url_template = '' WHERE h1cloud_3xui_json_url_template IS NULL").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET h1cloud_3xui_local_expiry = 1 WHERE h1cloud_3xui_local_expiry IS NULL").run(); } catch (_) {}
  try { db.prepare("UPDATE nodes SET h1cloud_3xui_sub_port = 25555 WHERE h1cloud_3xui_sub_port IS NULL OR h1cloud_3xui_sub_port < 1").run(); } catch (_) {}
  try {
    const rows = db.prepare('SELECT id, name, country_code, country_name_ru, country_flag FROM nodes').all();
    const update = db.prepare('UPDATE nodes SET country_code = ?, country_flag = ? WHERE id = ?');
    for (const row of rows) {
      const code = row.country_code || getNodeCountryCode(row) || '';
      const flag = getNodeFlag({ ...row, country_code: code });
      if (String(row.country_code || '') !== String(code || '') || String(row.country_flag || '') !== String(flag || '')) {
        update.run(String(code || ''), String(flag || '🌐'), row.id);
      }
    }
  } catch (_) {}
  try { db.prepare("UPDATE client_nodes SET remote_sub_url = '' WHERE remote_sub_url IS NULL").run(); } catch (_) {}
  // stage68 temporarily rewrote H1Cloud mappings to the public master SUB.
  // Peer aggregation must read /local to avoid receiving the whole H1Cloud mesh.
  try {
    db.prepare(`
      UPDATE client_nodes
      SET remote_sub_url = RTRIM(remote_sub_url, '/') || '/local'
      WHERE node_id IN (SELECT id FROM nodes WHERE node_type = 'h1cloud')
        AND remote_sub_url LIKE 'http%/sub/%'
        AND remote_sub_url NOT LIKE '%/local'
    `).run();
  } catch (_) {}
  try {
    const missingOrder = db.prepare('SELECT id FROM nodes WHERE sort_order IS NULL OR sort_order = 0 ORDER BY id DESC').all();
    let maxOrder = Number(db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM nodes WHERE sort_order IS NOT NULL AND sort_order > 0').get().n || 0);
    const setOrder = db.prepare('UPDATE nodes SET sort_order = ? WHERE id = ?');
    for (const row of missingOrder) setOrder.run(++maxOrder, row.id);
  } catch (_) {}

  try {
    const rows = db.prepare("SELECT id, uuid, sub_slug FROM clients WHERE sub_slug IS NULL OR sub_slug = ''").all();
    const existing = new Set(db.prepare("SELECT sub_slug FROM clients WHERE sub_slug IS NOT NULL AND sub_slug != ''").all().map(r => String(r.sub_slug)));
    const update = db.prepare('UPDATE clients SET sub_slug = ? WHERE id = ?');
    for (const row of rows) {
      let slug = String(row.uuid || '').replace(/-/g, '').slice(0, 16).toLowerCase();
      if (!slug || existing.has(slug)) {
        do { slug = randomUUID().replace(/-/g, '').slice(0, 16); } while (existing.has(slug));
      }
      existing.add(slug);
      update.run(slug, row.id);
    }
  } catch (_) {}
}

const PORT = Number(process.env.PORT || 3000);
const APP_SECRET = process.env.APP_SECRET || 'change-me';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-session-secret';
const SENSITIVE_SETTING_KEYS = new Set([
  'panel_access_key',
  'telegram_bot_token',
  'telegram_manager_bot_token',
  'telegram_backup_bot_token',
  'telegram_manager_proxy_url'
]);
const ENCRYPTED_SETTING_PREFIX = 'enc:v1:';
const ADMIN_BIND_SESSION_TO_IP = String(process.env.ADMIN_BIND_SESSION_TO_IP || '0') === '1';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DEFAULT_SUBSCRIPTION_NAME = process.env.SUBSCRIPTION_NAME || 'VPN';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const PANEL_ACCESS_KEY = String(process.env.PANEL_ACCESS_KEY || '').trim();
const TRUST_PROXY = String(process.env.TRUST_PROXY || '').toLowerCase() === '1' || String(process.env.TRUST_PROXY || '').toLowerCase() === 'true';
const SESSION_SECURE = String(process.env.SESSION_SECURE || '').toLowerCase() === '1' || String(process.env.SESSION_SECURE || '').toLowerCase() === 'true';
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
const LOGIN_LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);
const INSTALL_BIND_IP = String(process.env.INSTALL_BIND_IP || '').trim();
const APP_DIR_HINT = process.env.APP_DIR || '/opt/3xui-aggregator';
const BACKUP_DIR_HINT = process.env.BACKUP_DIR || '/opt/3xui-backups';
const PROJECT_UPDATE_REQUEST_FILE = path.join(DATA_DIR, 'project_update_request.json');
const PROJECT_UPDATE_STATUS_FILE = path.join(DATA_DIR, 'project_update_status.json');
const IS_PRODUCTION = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

function assertSecureRuntimeConfiguration() {
  if (!IS_PRODUCTION) return;
  const problems = [];
  if (!APP_SECRET || APP_SECRET === 'change-me' || APP_SECRET.length < 32) problems.push('APP_SECRET должен содержать минимум 32 символа');
  if (!SESSION_SECRET || SESSION_SECRET === 'change-session-secret' || SESSION_SECRET.length < 32) problems.push('SESSION_SECRET должен содержать минимум 32 символа');
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'admin') problems.push('ADMIN_PASSWORD не должен быть пустым или равным admin');
  else if (ADMIN_PASSWORD.length < 12) console.warn('WARNING: ADMIN_PASSWORD короче 12 символов. Рекомендуется сменить пароль администратора.');
  if (problems.length) {
    throw new Error(`Небезопасная production-конфигурация:
- ${problems.join('\n- ')}`);
  }
}

assertSecureRuntimeConfiguration();

if (TRUST_PROXY) app.set('trust proxy', 1);

const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 12000);
// 3x-ui v3.4.0 may need more time for the first authenticated request after
// restart and for installations with many clients. Keep subscription fetches
// short, but give panel API calls a separate, configurable timeout.
const NODE_API_TIMEOUT_MS = Number(process.env.NODE_API_TIMEOUT_MS || 30000);
// Ручная проверка узла и операции удаления не должны блокировать интерфейс на
// десятки секунд, если VPS уже выключен или порт панели недоступен.
const NODE_HEALTHCHECK_TIMEOUT_MS = Number(process.env.NODE_HEALTHCHECK_TIMEOUT_MS || 7000);
const CLIENT_DELETE_TIMEOUT_MS = Number(process.env.CLIENT_DELETE_TIMEOUT_MS || 8000);
const SUBSCRIPTION_STATS_TIMEOUT_MS = Number(process.env.SUBSCRIPTION_STATS_TIMEOUT_MS || 3500);

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal
    });
  } catch (err) {
    const raw = String(err?.message || err || '');
    if (String(err?.name || '') === 'AbortError' || /aborted|timeout|timed out/i.test(raw)) {
      const seconds = Math.max(1, Math.round(Number(timeoutMs || 0) / 1000));
      const timed = new Error(`Тайм-аут ${seconds} с при запросе ${url}`);
      timed.name = 'NodeApiTimeoutError';
      timed.code = 'ETIMEDOUT';
      timed.url = String(url || '');
      timed.timeoutMs = Number(timeoutMs || 0);
      timed.cause = err;
      throw timed;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const H1CLOUD_INSECURE_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

function shouldVerifyH1CloudTls() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.H1CLOUD_TLS_VERIFY || '1').trim().toLowerCase());
}

function getH1CloudFetchAgent(url) {
  if (!/^https:\/\//i.test(String(url || ''))) return undefined;
  return shouldVerifyH1CloudTls() ? undefined : H1CLOUD_INSECURE_HTTPS_AGENT;
}

if (!shouldVerifyH1CloudTls()) {
  console.warn('WARNING: H1CLOUD_TLS_VERIFY=0 отключает проверку TLS-сертификата H1Cloud. Используйте только как временный режим совместимости.');
}

function toAsciiHeaderFilename(value, fallback = 'subscription') {
  const text = String(value || '').trim();
  const cleaned = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);

  return cleaned || fallback;
}


function stripHeaderControls(value) {
  return String(value ?? '').replace(/[\r\n\0]+/g, ' ').trim();
}

function normalizeMultilineHeaderText(value) {
  // HTTP headers cannot contain raw CR/LF, but the base64 payload can safely
  // encode line breaks. This keeps Happ announce/sub-info text multiline.
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\0/g, '')
    .trim();
}

function toUtf8Base64Header(value) {
  const text = normalizeMultilineHeaderText(value);
  if (!text) return '';
  return `base64:${Buffer.from(text, 'utf8').toString('base64')}`;
}

function toAsciiHttpHeader(value) {
  const text = stripHeaderControls(value);
  if (!text) return '';
  // HTTP response headers in Node.js cannot contain emoji/Cyrillic.
  // For URLs keep ASCII by percent-encoding non-ASCII characters.
  return encodeURI(text).replace(/[\u0100-\uFFFF]/g, '');
}

function setSafeAsciiHeader(res, key, value) {
  const safeKey = String(key || '').replace(/[^A-Za-z0-9!#$%&'*+.^_`|~-]/g, '');
  const safeValue = toAsciiHttpHeader(value);
  if (safeKey && safeValue) res.setHeader(safeKey, safeValue);
}

function setSafeBase64TextHeader(res, key, value) {
  const safeKey = String(key || '').replace(/[^A-Za-z0-9!#$%&'*+.^_`|~-]/g, '');
  const safeValue = toUtf8Base64Header(value);
  if (safeKey && safeValue) res.setHeader(safeKey, safeValue);
}

function setEmptyHappMetaHeader(res, key) {
  const safeKey = String(key || '').replace(/[^A-Za-z0-9!#$%&'*+.^_`|~-]/g, '');
  if (safeKey) res.setHeader(safeKey, '');
}

function setAttachmentDispositionHeader(res, unicodeFileName, fallbackBaseName = 'subscription') {
  // Node.js rejects non-Latin-1 characters in ordinary header values.
  // Emoji/Cyrillic names such as "⚡Aero⚡.json" must therefore be sent
  // with an ASCII fallback in `filename=` and the real UTF-8 name in
  // RFC 5987 `filename*=`. Otherwise /json subscriptions crash with 502.
  const original = String(unicodeFileName || `${fallbackBaseName}.txt`).replace(/[\r\n]/g, '_');
  const ext = (original.match(/\.([A-Za-z0-9]{1,12})$/) || [])[1] || 'txt';
  const fallback = `${toAsciiHeaderFilename(original.replace(/\.[^.]*$/, ''), fallbackBaseName)}.${ext}`
    .replace(/[\\";\r\n]/g, '_');

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(original)}`
  );
}

function setSubscriptionNoCacheHeaders(res, subscriptionName = 'VPN', ext = 'txt') {
  const safeName = String(subscriptionName || 'VPN').trim() || 'VPN';
  const displayTitle = getSubscriptionDisplayTitle(safeName);
  const base64Title = Buffer.from(displayTitle, 'utf8').toString('base64');
  const fileName = `${safeName}.${ext}`;
  const intervalHours = getSubscriptionUpdateIntervalHours();
  const clientAutoUpdate = getSetting('subscription_client_auto_update_enabled', '1') !== '0';
  const revision = getSubscriptionRevision();

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('ETag', `W/"subscription-${revision}"`);
  res.setHeader('Last-Modified', new Date(revision).toUTCString());
  res.setHeader('X-Subscription-Revision', String(revision));
  res.setHeader('Profile-Title', `base64:${base64Title}`);
  res.setHeader('Subscription-Title', `base64:${base64Title}`);
  // Бесплатные заголовки: клиенты, которые умеют читать период обновления,
  // снова видят автообновление подписки.
  if (clientAutoUpdate) {
    res.setHeader('Profile-Update-Interval', String(intervalHours));
    res.setHeader('Subscription-Update-Interval', String(intervalHours));
    res.setHeader('Subscription-Auto-Update-Enable', '1');
  }
  setAttachmentDispositionHeader(res, fileName, 'subscription');
}

function safeFileSegment(value, fallback = 'panel') {
  const text = String(value || '').trim().toLowerCase();
  const safe = text
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/g, '')
    .replace(/[^a-z0-9а-яё._-]+/giu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || fallback;
}

function getRequestPanelHost(req) {
  const forwardedHost = TRUST_PROXY ? String(req.headers['x-forwarded-host'] || '').split(',')[0].trim() : '';
  const hostHeader = String(forwardedHost || req.headers.host || '').trim();
  if (hostHeader) return hostHeader;

  try {
    return new URL(BASE_URL).host || 'localhost';
  } catch (_) {
    return 'localhost';
  }
}

function getBackupPanelIdentity(req) {
  return safeFileSegment(getRequestPanelHost(req), safeFileSegment(BASE_URL, 'panel'));
}

function buildBackupFileName(req, ext = 'json') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const panelId = getBackupPanelIdentity(req);
  return `3xui-aggregator-backup-${stamp}-${panelId}.${ext}`;
}

function signTelegramBackupDownload(expiresAt) {
  const secretPart = getCurrentPanelAccessKey() || PANEL_ACCESS_KEY || '';
  return createHmac('sha256', SESSION_SECRET)
    .update(`telegram-backup:${Number(expiresAt)}:${secretPart}`)
    .digest('hex');
}

function buildTelegramBackupDownloadUrl() {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const signature = signTelegramBackupDownload(expiresAt);
  const url = new URL('/backup/telegram-download', getPanelPublicUrl());
  url.searchParams.set('expires', String(expiresAt));
  url.searchParams.set('sig', signature);
  return url.toString();
}

function isValidTelegramBackupDownload(req) {
  const expiresAt = Number(req.query.expires || 0);
  const sig = String(req.query.sig || '').trim();
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !sig) return false;
  return safeTokenEquals(sig, signTelegramBackupDownload(expiresAt));
}


app.set('view engine', 'ejs');
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'");
  if (SESSION_SECURE) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static('public'));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: DATA_DIR }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: SESSION_SECURE,
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

app.use((req, res, next) => {
  const token = ensureCsrfToken(req);
  res.locals.csrfToken = token;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const provided = String(req.body?._csrf || req.headers['x-csrf-token'] || '').trim();
  if (!safeTokenEquals(provided, token)) {
    return res.status(403).send('Недействительный CSRF-токен. Обновите страницу и повторите действие.');
  }
  next();
});

function safeTokenEquals(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length || right.length === 0) return false;
  return timingSafeEqual(left, right);
}

const PANEL_REMEMBER_COOKIE = 'agg_panel_access';
const PANEL_REMEMBER_DAYS = 30;

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  const out = {};
  raw.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value || '');
  });
  return out;
}

function signPanelRememberToken(accessKey) {
  if (!accessKey) return '';
  return createHmac('sha256', SESSION_SECRET)
    .update('panel-access:' + String(accessKey))
    .digest('hex');
}

function hasValidPanelRememberCookie(req, accessKey) {
  const token = parseCookies(req)[PANEL_REMEMBER_COOKIE] || '';
  const expected = signPanelRememberToken(accessKey);
  return safeTokenEquals(token, expected);
}

function setPanelRememberCookie(res, accessKey) {
  const token = signPanelRememberToken(accessKey);
  if (!token) return;
  res.cookie(PANEL_REMEMBER_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SESSION_SECURE,
    maxAge: PANEL_REMEMBER_DAYS * 24 * 60 * 60 * 1000
  });
}

function isPublicSubscriptionPath(pathname) {
  return pathname.startsWith('/sub/')
    || pathname.startsWith('/json/')
    || pathname.startsWith('/happ/')
    || pathname.startsWith('/happ-routing/')
    || pathname.startsWith('/happ-routing-json/')
    || pathname.startsWith('/open/')
    || pathname === '/backup/telegram-download'
    || pathname === '/qr'
    || pathname === '/healthz';
}

function isStaticAssetPath(pathname) {
  return pathname.startsWith('/css/')
    || pathname.startsWith('/js/')
    || pathname.startsWith('/img/')
    || pathname === '/favicon.ico';
}

function requirePanelAccessKey(req, res, next) {
  const accessKey = getCurrentPanelAccessKey();
  if (!accessKey) return next();
  if (isPublicSubscriptionPath(req.path) || isStaticAssetPath(req.path)) return next();

  // Если пользователь уже прошёл обычный вход, secret-key больше не нужен для
  // переходов внутри панели. Иначе после успешного /login браузер попадал на
  // /dashboard уже без параметра key и получал 404.
  if (req.session?.userId) return next();
  if (req.session?.panelAccessGranted === true) return next();

  if (hasValidPanelRememberCookie(req, accessKey)) {
    req.session.panelAccessGranted = true;
    return next();
  }

  const providedKey = String(req.query.key || req.query.panel_key || req.headers['x-panel-key'] || '').trim();
  if (safeTokenEquals(providedKey, accessKey)) {
    req.session.panelAccessGranted = true;
    setPanelRememberCookie(res, accessKey);

    // /mobile-login специально не очищаем на уровне middleware: этот маршрут
    // ставит долгий cookie и сам перенаправляет пользователя. Его удобно
    // сохранять ярлыком на телефоне.
    if (req.path === '/mobile-login') return next();

    if (req.method === 'GET' && (req.query.key || req.query.panel_key)) {
      const cleanUrl = req.originalUrl
        .replace(/([?&])(key|panel_key)=[^&]*&?/g, '$1')
        .replace(/[?&]$/, '')
        .replace('?&', '?');
      return res.redirect(cleanUrl || '/login');
    }

    return next();
  }

  return res.status(404).send('Not found');
}

app.use(requirePanelAccessKey);

function buildLoginRedirectPath(message = '') {
  const params = new URLSearchParams();
  if (message) params.set('message', message);
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      node_type TEXT NOT NULL DEFAULT '3xui',
      panel_url TEXT NOT NULL,
      panel_path TEXT DEFAULT '',
      sub_base_url TEXT DEFAULT '',
      h1cloud_link_mode TEXT NOT NULL DEFAULT 'vless_reality',
      h1cloud_link_types TEXT NOT NULL DEFAULT 'reality',
      h1cloud_fingerprint TEXT DEFAULT '',
      h1cloud_xhttp_backend_path TEXT DEFAULT '/api/v1/sync/',
      h1cloud_xhttp_method TEXT DEFAULT 'GET',
      h1cloud_xhttp_alpn TEXT DEFAULT 'h2,http1',
      h1cloud_cdn_host TEXT DEFAULT '',
      h1cloud_cdn_sni TEXT DEFAULT '',
      h1cloud_cdn_port INTEGER NOT NULL DEFAULT 443,
      h1cloud_cdn_tag TEXT DEFAULT 'CDN',
      h1cloud_cdn_public_path TEXT DEFAULT '',
      h1cloud_reality_port INTEGER NOT NULL DEFAULT 0,
      h1cloud_reality_public_port INTEGER NOT NULL DEFAULT 0,
      h1cloud_reality_sni TEXT DEFAULT 'proxy11.h1guro.ovh',
      h1cloud_reality_dest TEXT DEFAULT '',
      h1cloud_3xui_shared_traffic INTEGER NOT NULL DEFAULT 0,
      h1cloud_3xui_json_url_template TEXT DEFAULT '',
      h1cloud_3xui_local_expiry INTEGER NOT NULL DEFAULT 1,
      h1cloud_3xui_sub_port INTEGER NOT NULL DEFAULT 25555,
      username TEXT NOT NULL,
      password_enc TEXT NOT NULL,
      api_auth_mode TEXT NOT NULL DEFAULT 'password',
      api_token_enc TEXT DEFAULT '',
      remnawave_caddy_token_enc TEXT DEFAULT '',
      remnawave_internal_squad_uuid TEXT DEFAULT '',
      remnawave_node_uuid TEXT DEFAULT '',
      remnawave_host_uuid TEXT DEFAULT '',
      remnawave_link_mode TEXT NOT NULL DEFAULT 'first',
      remnawave_link_filter TEXT DEFAULT '',
      remnawave_remark_mode TEXT NOT NULL DEFAULT 'aggregator',
      inbound_id INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_status TEXT DEFAULT 'unknown',
      last_error TEXT DEFAULT '',
      country_code TEXT DEFAULT '',
      country_name_ru TEXT DEFAULT '',
      country_flag TEXT DEFAULT '',
      label_suffix TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      uuid TEXT NOT NULL,
      sub_slug TEXT UNIQUE NOT NULL,
      duration_days INTEGER NOT NULL DEFAULT 0,
      traffic_gb INTEGER NOT NULL DEFAULT 0,
      limit_ip INTEGER NOT NULL DEFAULT 1,
      expiry_time INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      comment TEXT NOT NULL DEFAULT '',
      flow TEXT NOT NULL DEFAULT '',
      last_online_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS client_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      node_id INTEGER NOT NULL,
      remote_email TEXT NOT NULL,
      remote_uuid TEXT NOT NULL,
      remote_sub_url TEXT DEFAULT '',
      traffic_gb INTEGER NOT NULL DEFAULT 0,
      limit_ip INTEGER DEFAULT NULL,
      upload_bytes INTEGER NOT NULL DEFAULT 0,
      download_bytes INTEGER NOT NULL DEFAULT 0,
      used_bytes INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(client_id, node_id)
    );

    CREATE TABLE IF NOT EXISTS node_inbound_cache (
      node_id INTEGER PRIMARY KEY,
      inbound_id INTEGER NOT NULL,
      inbound_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS redirect_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bind_ip TEXT NOT NULL,
      node_id INTEGER NOT NULL,
      target_host TEXT NOT NULL,
      target_port INTEGER NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'tcp',
      rewrite_enabled INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_status TEXT DEFAULT 'pending',
      last_error TEXT DEFAULT '',
      metrics_json TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(bind_ip, node_id, target_port, protocol)
    );


    CREATE TABLE IF NOT EXISTS sni_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sni TEXT NOT NULL UNIQUE,
      comment TEXT DEFAULT '',
      is_builtin INTEGER NOT NULL DEFAULT 0,
      last_status TEXT DEFAULT '',
      last_check_json TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS traffic_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_bytes INTEGER NOT NULL DEFAULT 0,
      download_bytes INTEGER NOT NULL DEFAULT 0,
      used_bytes INTEGER NOT NULL DEFAULT 0,
      created_at_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS node_traffic_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL,
      upload_bytes INTEGER NOT NULL DEFAULT 0,
      download_bytes INTEGER NOT NULL DEFAULT 0,
      used_bytes INTEGER NOT NULL DEFAULT 0,
      created_at_ms INTEGER NOT NULL,
      source_kind TEXT NOT NULL DEFAULT 'legacy',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS client_traffic_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      node_id INTEGER NOT NULL,
      upload_bytes INTEGER NOT NULL DEFAULT 0,
      download_bytes INTEGER NOT NULL DEFAULT 0,
      used_bytes INTEGER NOT NULL DEFAULT 0,
      created_at_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );


    CREATE TABLE IF NOT EXISTS telegram_users (
      telegram_id TEXT PRIMARY KEY,
      username TEXT DEFAULT '',
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      client_id INTEGER DEFAULT NULL,
      state TEXT DEFAULT '',
      state_data TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS telegram_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      plan_key TEXT NOT NULL DEFAULT '',
      plan_title TEXT NOT NULL DEFAULT '',
      duration_days INTEGER NOT NULL DEFAULT 0,
      price_rub INTEGER NOT NULL DEFAULT 0,
      ip_limit INTEGER NOT NULL DEFAULT 2,
      status TEXT NOT NULL DEFAULT 'new',
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS telegram_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS telegram_ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      telegram_id TEXT NOT NULL,
      from_admin INTEGER NOT NULL DEFAULT 0,
      message_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS telegram_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      sent_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  addColumnIfMissing('nodes', 'node_type', "TEXT NOT NULL DEFAULT '3xui'");
  addColumnIfMissing('nodes', 'panel_path', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'sub_base_url', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'h1cloud_link_mode', "TEXT NOT NULL DEFAULT 'vless_reality'");
  addColumnIfMissing('nodes', 'h1cloud_link_types', "TEXT NOT NULL DEFAULT 'reality'");
  addColumnIfMissing('nodes', 'h1cloud_fingerprint', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'h1cloud_xhttp_backend_path', "TEXT DEFAULT '/api/v1/sync/'");
  addColumnIfMissing('nodes', 'h1cloud_xhttp_method', "TEXT DEFAULT 'GET'");
  addColumnIfMissing('nodes', 'h1cloud_xhttp_alpn', "TEXT DEFAULT 'h2,http1'");
  addColumnIfMissing('nodes', 'h1cloud_cdn_host', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'h1cloud_cdn_sni', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'h1cloud_cdn_port', 'INTEGER NOT NULL DEFAULT 443');
  addColumnIfMissing('nodes', 'h1cloud_cdn_tag', "TEXT DEFAULT 'CDN'");
  addColumnIfMissing('nodes', 'h1cloud_cdn_public_path', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'h1cloud_reality_port', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('nodes', 'h1cloud_reality_public_port', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('nodes', 'h1cloud_reality_sni', "TEXT DEFAULT 'proxy11.h1guro.ovh'");
  addColumnIfMissing('nodes', 'h1cloud_reality_dest', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'h1cloud_3xui_shared_traffic', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('nodes', 'h1cloud_3xui_json_url_template', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'h1cloud_3xui_local_expiry', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('nodes', 'h1cloud_3xui_sub_port', 'INTEGER NOT NULL DEFAULT 25555');
  addColumnIfMissing('nodes', 'api_auth_mode', "TEXT NOT NULL DEFAULT 'password'");
  addColumnIfMissing('nodes', 'api_token_enc', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'remnawave_caddy_token_enc', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'remnawave_internal_squad_uuid', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'remnawave_node_uuid', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'remnawave_host_uuid', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'remnawave_link_mode', "TEXT NOT NULL DEFAULT 'first'");
  addColumnIfMissing('nodes', 'remnawave_link_filter', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'remnawave_remark_mode', "TEXT NOT NULL DEFAULT 'aggregator'");
  addColumnIfMissing('nodes', 'country_code', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'country_name_ru', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'country_flag', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'label_suffix', "TEXT DEFAULT ''");
  addColumnIfMissing('nodes', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('nodes', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('nodes', 'last_status', "TEXT DEFAULT 'unknown'");
  addColumnIfMissing('nodes', 'last_error', "TEXT DEFAULT ''");

  addColumnIfMissing('nodes', 'sni_mode', "TEXT NOT NULL DEFAULT 'inbound'");
  addColumnIfMissing('nodes', 'sni_profile_id', 'INTEGER DEFAULT NULL');
  addColumnIfMissing('nodes', 'sni_override', "TEXT DEFAULT ''");

  addColumnIfMissing('clients', 'display_name', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('clients', 'uuid', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('clients', 'last_online_at', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('clients', 'sub_slug', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('clients', 'duration_days', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('clients', 'traffic_gb', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('clients', 'limit_ip', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('clients', 'expiry_time', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('clients', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('clients', 'comment', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('clients', 'flow', "TEXT NOT NULL DEFAULT ''");

  addColumnIfMissing('client_nodes', 'remote_sub_url', "TEXT DEFAULT ''");
  addColumnIfMissing('client_nodes', 'traffic_gb', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('client_nodes', 'limit_ip', 'INTEGER DEFAULT NULL');
  addColumnIfMissing('client_nodes', 'upload_bytes', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('client_nodes', 'download_bytes', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('client_nodes', 'used_bytes', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('traffic_snapshots', 'source_kind', "TEXT NOT NULL DEFAULT 'legacy'");
  addColumnIfMissing('client_nodes', 'enabled', 'INTEGER NOT NULL DEFAULT 1');

  addColumnIfMissing('telegram_users', 'username', "TEXT DEFAULT ''");
  addColumnIfMissing('telegram_users', 'first_name', "TEXT DEFAULT ''");
  addColumnIfMissing('telegram_users', 'last_name', "TEXT DEFAULT ''");
  addColumnIfMissing('telegram_users', 'role', "TEXT NOT NULL DEFAULT 'user'");
  addColumnIfMissing('telegram_users', 'client_id', 'INTEGER DEFAULT NULL');
  addColumnIfMissing('telegram_users', 'state', "TEXT DEFAULT ''");
  addColumnIfMissing('telegram_users', 'state_data', "TEXT DEFAULT ''");
  addColumnIfMissing('telegram_users', 'last_seen_at', "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
  addColumnIfMissing('telegram_users', 'last_expiry_notice_key', "TEXT DEFAULT ''");
  addColumnIfMissing('telegram_orders', 'note', "TEXT DEFAULT ''");
  addColumnIfMissing('telegram_orders', 'updated_at', "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");

  addColumnIfMissing('redirect_rules', 'bind_ip', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('redirect_rules', 'bind_label', "TEXT DEFAULT ''");
  addColumnIfMissing('redirect_rules', 'node_id', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('redirect_rules', 'target_host', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('redirect_rules', 'target_port', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('redirect_rules', 'protocol', "TEXT NOT NULL DEFAULT 'tcp'");
  addColumnIfMissing('redirect_rules', 'rewrite_enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('redirect_rules', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('redirect_rules', 'last_status', "TEXT DEFAULT 'pending'");
  addColumnIfMissing('redirect_rules', 'last_error', "TEXT DEFAULT ''");
  addColumnIfMissing('redirect_rules', 'metrics_json', "TEXT DEFAULT ''");
  addColumnIfMissing('redirect_rules', 'created_at', "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
  addColumnIfMissing('redirect_rules', 'updated_at', "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");

  backfillSchemaDefaults();
  seedDefaultSniProfiles();

  const existingAdmin = db.prepare('SELECT id FROM app_users WHERE username = ?').get(ADMIN_USERNAME);
  if (!existingAdmin) {
    const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    db.prepare('INSERT INTO app_users (username, password_hash) VALUES (?, ?)').run(ADMIN_USERNAME, passwordHash);
  }

  const existingSubName = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('subscription_name');
  if (!existingSubName) {
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('subscription_name', DEFAULT_SUBSCRIPTION_NAME);
  }

  const existingAllowedIps = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('admin_allowed_ips');
  if (!existingAllowedIps) {
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('admin_allowed_ips', '');
  }

  const defaultSettings = [
    ['show_sub_links', '1'],
    ['show_json_links', '1'],
    ['admin_idle_timeout_minutes', '20'],
    ['admin_bind_session_to_ip', ADMIN_BIND_SESSION_TO_IP ? '1' : '0'],
    ['subscription_show_limits', '1'],
    ['subscription_userinfo_header', '1'],
    ['subscription_live_usage', '1'],
    ['subscription_update_interval_hours', '1'],
    ['subscription_client_auto_update_enabled', '1'],
    ['subscription_support_note', ''],
    ['subscription_support_url', ''],
    ['subscription_show_empty_limits', '0'],
    ['subscription_revision', '1'],
    ['subscription_happ_info_enabled', '1'],
    ['subscription_happ_info_template', '👤 Логин: {login}\n📱 Устройств: {ip_usage}\n\n{support_note}'],
    ['subscription_happ_info_announce_fallback_enabled', '1'],
    ['subscription_happ_info_color', 'blue'],
    ['subscription_happ_info_button_text', 'Поддержка'],
    ['subscription_happ_info_button_link', ''],
    ['subscription_happ_server_description_enabled', '1'],
    ['subscription_happ_server_description_template', 'VLESS / {network} / JSON'],
    ['happ_provider_id', ''],
    ['json_mux_enabled', '0'],
    ['json_sniffing_enabled', '0'],
    ['ios_safe_routing_enabled', '1'],
    ['happ_app_controls_enabled', '0'],
    ['happ_ping_tcp', '1'],
    ['happ_ping_result_icon', '1'],
    ['happ_fragmentation_enabled', '0'],
    ['happ_noises_enabled', '0'],
    ['happ_mux_enabled', '0'],
    ['happ_subscription_auto_update_enabled', '1'],
    ['happ_update_on_open_enabled', '0'],
    ['happ_ping_on_open_enabled', '0'],
    ['happ_subscriptions_collapse_enabled', '1'],
    ['happ_expand_now_enabled', '0'],
    ['happ_check_url_via_proxy_enabled', '0'],
    ['happ_sniffing_enabled', '0'],
    ['happ_force_apply_on_update_enabled', '0'],
    ['happ_no_limit_mode', 'off'],
    ['show_happ_links', '0'],
    ['json_mux_enabled', '0'],
    ['json_sniffing_enabled', '0'],
    ['ios_safe_routing_enabled', '1'],
    ['update_repo_url', 'https://github.com/dagmagnat/3xui-Aggregator'],
    ['panel_interface_theme', 'classic'],
    ['clients_view_mode', 'modern'],
    ['panel_mobile_client_compact', '0'],
    ['panel_mobile_nav_mode', 'bottom'],
    ['panel_mobile_ui_scale', 'compact'],
    ['nodes_page_size', '10'],
    ['telegram_manager_enabled', '0'],
    ['telegram_manager_bot_token', ''],
    ['telegram_manager_proxy_url', ''],
    ['telegram_manager_admin_ids', ''],
    ['telegram_manager_support_username', ''],
    ['telegram_manager_welcome_text', 'Добро пожаловать! Здесь можно получить VPN-доступ, посмотреть подписку и написать в поддержку.'],
    ['telegram_manager_status_text', 'Сервис работает в штатном режиме.'],
    ['telegram_manager_instruction_text', 'Скопируйте HAPP-ссылку подписки и добавьте её в приложение Happ. Если нужна помощь — нажмите Поддержка.'],
    ['telegram_manager_mtproto_text', '📡 Telegram-прокси для постоянной связи будет опубликован здесь. Нажмите ссылку, чтобы подключить прокси в Telegram.'],
    ['telegram_manager_plans_json', '[{"key":"1m","title":"1 месяц","days":30,"price":300},{"key":"3m","title":"3 месяца","days":90,"price":800},{"key":"6m","title":"6 месяцев","days":180,"price":1500},{"key":"12m","title":"12 месяцев","days":365,"price":2800}]'],
    ['telegram_manager_base_ip_limit', '2'],
    ['telegram_manager_extra_ip_price_rub', '80'],
    ['telegram_manager_expiry_notice_days', '2'],
    ['telegram_backup_enabled', '0'],
    ['telegram_backup_locked', '1'],
    ['telegram_backup_bot_token', ''],
    ['telegram_backup_chat_id', ''],
    ['telegram_notifications_enabled', '0'],
    ['telegram_bot_token', ''],
    ['telegram_chat_id', ''],
    ['telegram_notify_offline_nodes', '1'],
    ['telegram_notify_suspicious_clients', '1'],
    ['telegram_suspicious_daily_gb', '100']
  ];

  for (const [key, value] of defaultSettings) {
    const existing = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    if (!existing) db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
  }

  // Мягкая миграция старого шаблона: "Ключ" заменяем на более понятный "Логин".
  const currentHappTemplate = getSetting('subscription_happ_info_template', '');
  if (currentHappTemplate && currentHappTemplate.includes('Ключ: {login}')) {
    setSetting('subscription_happ_info_template', currentHappTemplate.replace('Ключ: {login}', 'Логин: {login}'));
  }

  // Stage46: убираем слово REALITY из описания сервера Happ, если стоит старый шаблон.
  const currentServerDescriptionTemplate = getSetting('subscription_happ_server_description_template', '');
  if (String(currentServerDescriptionTemplate || '').trim() === 'VLESS / {network} / REALITY / JSON') {
    setSetting('subscription_happ_server_description_template', 'VLESS / {network} / JSON');
  }
}

initDb();
const vpnManager = createVpnManager({ db, appSecret: APP_SECRET, encrypt, decrypt, dataDir: DATA_DIR });
ensureMissingAppSettings();
applyHappSafeDefaultMigration();
syncDeploymentPublicUrlSettings();

function getClientIp(req) {
  const raw = TRUST_PROXY
    ? String(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '')
    : String(req.socket.remoteAddress || req.ip || '');

  return raw
    .split(',')[0]
    .trim()
    .replace(/^::ffff:/, '');
}

function parseAllowedIps() {
  const raw = getSetting('admin_allowed_ips', '');
  return String(raw || '')
    .split(/[\s,;]+/)
    .map(v => v.trim())
    .filter(Boolean);
}

function isAdminIpAllowed(req) {
  const allowed = parseAllowedIps();
  if (!allowed.length) return true;
  return allowed.includes(getClientIp(req));
}

function requireAllowedAdminIp(req, res, next) {
  if (isAdminIpAllowed(req)) return next();
  return res.status(403).send('Access denied: this IP is not allowed for admin panel.');
}

const loginFailures = new Map();

function loginFailureKey(req, username) {
  return `${getClientIp(req)}:${String(username || '').toLowerCase()}`;
}

function getLoginFailure(req, username) {
  const key = loginFailureKey(req, username);
  const item = loginFailures.get(key);
  if (!item) return { key, count: 0, lockedUntil: 0 };
  if (item.lockedUntil && Date.now() > item.lockedUntil) {
    loginFailures.delete(key);
    return { key, count: 0, lockedUntil: 0 };
  }
  return { key, ...item };
}

function requireAuth(req, res, next) {
  if (!isAdminIpAllowed(req)) {
    return req.session.destroy(() => res.status(403).send('Access denied: this IP is not allowed for admin panel.'));
  }

  if (!req.session.userId) return res.redirect(buildLoginRedirectPath());
  const now = Date.now();
  const currentIp = getClientIp(req);
  const lastActivity = Number(req.session.lastActivity || 0);
  const loginIp = String(req.session.loginIp || '');

  if (isAdminSessionIpBindEnabled() && loginIp && currentIp && loginIp !== currentIp) {
    return req.session.destroy(() => res.redirect(buildLoginRedirectPath()));
  }

  const idleTimeoutMs = getAdminIdleTimeoutMinutes() * 60 * 1000;
  if (lastActivity && idleTimeoutMs > 0 && now - lastActivity > idleTimeoutMs) {
    return req.session.destroy(() => res.redirect(buildLoginRedirectPath()));
  }

  req.session.loginIp = currentIp;
  req.session.lastActivity = now;
  next();
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ru-RU');
}

const escapeHtml = htmlEscape;

function formatServerErrorPage(title, err) {
  const errorId = randomUUID();
  const showDetails = !IS_PRODUCTION;
  const message = showDetails ? htmlEscape(err?.message || err || 'Unknown error') : 'Подробности скрыты в production-режиме.';
  const stack = showDetails ? htmlEscape(err?.stack || '') : '';
  console.error(`Server error ${errorId}:`, err);
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${htmlEscape(title)} — ошибка</title>
  <style>
    body{font-family:Arial,sans-serif;background:#f6f7fb;color:#111827;padding:24px;line-height:1.5}
    .box{max-width:980px;margin:0 auto;background:white;border:1px solid #e5e7eb;border-radius:14px;padding:20px;box-shadow:0 8px 24px rgba(15,23,42,.08)}
    code,pre{background:#111827;color:#e5e7eb;border-radius:10px;padding:10px;display:block;overflow:auto;white-space:pre-wrap}
    .muted{color:#6b7280}.btn{display:inline-block;margin-top:12px;padding:10px 14px;border-radius:10px;background:#2563eb;color:white;text-decoration:none}
  </style>
</head>
<body>
  <div class="box">
    <h1>${htmlEscape(title)}</h1>
    <p>Страница не смогла отрисоваться. Точная ошибка уже записана в лог контейнера.</p>
    <p class="muted">Команда для проверки:</p>
    <code>docker logs --tail=200 3xui-aggregator</code>
    <p class="muted">Код ошибки: <code>${errorId}</code></p>
    <p class="muted">Ошибка:</p>
    <code>${message}</code>
    ${stack ? `<details><summary>Stack trace</summary><pre>${stack}</pre></details>` : ''}
    <a class="btn" href="/dashboard">На главную</a>
  </div>
</body>
</html>`;
}

function renderClientsFallbackPage(res, params, err) {
  const clients = Array.isArray(params?.clients) ? params.clients : [];
  const baseUrl = String(params?.baseUrl || '').replace(/\/+$/, '');
  const rows = clients.map(client => {
    const slug = htmlEscape(client.sub_slug || '');
    const jsonUrl = slug ? `${baseUrl}/json/${slug}` : '';
    return `<tr>
      <td>${htmlEscape(client.id)}</td>
      <td>${htmlEscape(client.display_name || client.login || '')}</td>
      <td>${htmlEscape(client.login || '')}</td>
      <td>${htmlEscape(client.comment || '')}</td>
      <td>${client.enabled !== 0 ? 'Включён' : 'Отключён'}</td>
      <td>${jsonUrl ? `<code>${htmlEscape(jsonUrl)}</code>` : '-'}</td>
    </tr>`;
  }).join('');

  console.error('Clients EJS render failed, fallback page used:', err);
  return res.status(500).send(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Клиенты — аварийный режим</title>
  <style>
    body{font-family:Arial,sans-serif;background:#f6f7fb;color:#111827;padding:24px;line-height:1.5}
    .box{max-width:1200px;margin:0 auto;background:white;border:1px solid #e5e7eb;border-radius:14px;padding:20px;box-shadow:0 8px 24px rgba(15,23,42,.08)}
    table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border-bottom:1px solid #e5e7eb;padding:9px;text-align:left;vertical-align:top}
    code{background:#111827;color:#e5e7eb;border-radius:8px;padding:5px 7px;display:inline-block}.muted{color:#6b7280}.err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:10px;padding:12px}.btn{display:inline-block;margin:8px 8px 0 0;padding:10px 14px;border-radius:10px;background:#2563eb;color:white;text-decoration:none}
  </style>
</head>
<body>
  <div class="box">
    <h1>Клиенты</h1>
    <div class="err">Основной шаблон страницы клиентов упал, поэтому открыт аварийный список. Пришли лог <code>docker logs --tail=200 3xui-aggregator</code>, если эта страница появится снова.</div>
    <p class="muted">Ошибка шаблона: <code>${IS_PRODUCTION ? 'Подробности скрыты в production-режиме.' : htmlEscape(err?.message || err || 'Unknown error')}</code></p>
    <a class="btn" href="/dashboard">На главную</a>
    <a class="btn" href="/settings">Настройки</a>
    <h2>Всего клиентов: ${clients.length}</h2>
    <table>
      <thead><tr><th>ID</th><th>Имя</th><th>Логин</th><th>Комментарий</th><th>Статус</th><th>JSON</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">Клиентов пока нет.</td></tr>'}</tbody>
    </table>
  </div>
</body>
</html>`);
}

function render(res, view, params = {}) {
  let currentAdminUsername = '';
  try {
    currentAdminUsername = db.prepare('SELECT username FROM app_users WHERE id = ?').get(res.req?.session?.userId)?.username || '';
  } catch (_) {}
  const data = {
    ...params,
    isDevelopment: !IS_PRODUCTION,
    currentAdminUsername,
    currentPath: res.req.path,
    panelInterfaceTheme: getPanelInterfaceTheme(),
    clientsViewMode: getClientsViewMode(),
    panelMobileClientCompact: getPanelMobileClientCompact(),
    panelMobileNavMode: getPanelMobileNavMode(),
    panelMobileUiScale: getPanelMobileUiScale(),
    countries: params.countries || getSortedCountriesRu(),
    countryFlagText: getCountryFlagFromParts,
    countryFlagByName: getCountryFlag,
    countryCodeByName: getCountryCodeByName,
    nodeFlagText: getNodeFlag
  };

  res.render(view, data, (err, html) => {
    if (!err) return res.send(html);

    console.error(`Render failed for view "${view}":`, err);

    if (view === 'clients') {
      return renderClientsFallbackPage(res, data, err);
    }

    return res.status(500).send(formatServerErrorPage(`Ошибка страницы ${view}`, err));
  });
}

function encodeSettingValue(key, value) {
  const text = String(value ?? '');
  if (!SENSITIVE_SETTING_KEYS.has(String(key)) || !text) return text;
  return ENCRYPTED_SETTING_PREFIX + encrypt(text, APP_SECRET);
}

function decodeSettingValue(key, value, fallback = '') {
  const text = String(value ?? '');
  if (!SENSITIVE_SETTING_KEYS.has(String(key)) || !text) return text || fallback;
  if (!text.startsWith(ENCRYPTED_SETTING_PREFIX)) return text;
  try { return decrypt(text.slice(ENCRYPTED_SETTING_PREFIX.length), APP_SECRET); }
  catch (err) {
    console.error(`Не удалось расшифровать настройку ${key}:`, err);
    return fallback;
  }
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  if (!row) return fallback;
  const raw = String(row.value ?? '');
  const decoded = decodeSettingValue(key, raw, fallback);

  // Одноразовая прозрачная миграция старых plaintext-секретов.
  if (SENSITIVE_SETTING_KEYS.has(String(key)) && raw && !raw.startsWith(ENCRYPTED_SETTING_PREFIX)) {
    db.prepare('UPDATE app_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?')
      .run(encodeSettingValue(key, raw), key);
  }
  return decoded;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `).run(key, encodeSettingValue(key, value));
}

function migrateSensitiveSettingsAtRest() {
  const select = db.prepare('SELECT value FROM app_settings WHERE key = ?');
  const update = db.prepare('UPDATE app_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?');
  const migrate = db.transaction(() => {
    for (const key of SENSITIVE_SETTING_KEYS) {
      const row = select.get(key);
      const raw = String(row?.value ?? '');
      if (!raw || raw.startsWith(ENCRYPTED_SETTING_PREFIX)) continue;
      update.run(encodeSettingValue(key, raw), key);
    }
  });
  migrate();
}

migrateSensitiveSettingsAtRest();



function getAdminIdleTimeoutMinutes() {
  const raw = Number(getSetting('admin_idle_timeout_minutes', '20'));
  if (!Number.isFinite(raw)) return 20;
  return Math.min(1440, Math.max(5, Math.floor(raw)));
}

function isAdminSessionIpBindEnabled() {
  return getSetting('admin_bind_session_to_ip', ADMIN_BIND_SESSION_TO_IP ? '1' : '0') === '1';
}

function trimForRedirect(value, maxLen = 900) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

function resultToQuery(message, result = null) {
  const qs = new URLSearchParams({ message: trimForRedirect(message, 700) });
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  if (errors.length) {
    const visible = errors.slice(0, 5).map(e => trimForRedirect(e, 220));
    const suffix = errors.length > visible.length ? ` | ещё ${errors.length - visible.length} ошибок смотри в docker logs` : '';
    qs.set('error', trimForRedirect(visible.join(' | ') + suffix, 1200));
  }
  return qs;
}

function appendQueryToPath(targetPath, query) {
  const base = String(targetPath || '/').trim() || '/';
  const text = query instanceof URLSearchParams ? query.toString() : String(query || '').replace(/^\?/, '');
  if (!text) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${text}`;
}

const LONG_OPERATION_TTL_MS = 30 * 60 * 1000;
const longOperations = new Map();

function createLongOperation(req, label = '') {
  const operation = {
    id: randomUUID(),
    ownerSessionId: String(req?.sessionID || ''),
    label: String(label || '').trim(),
    status: 'running',
    cancelRequested: false,
    completed: 0,
    total: 0,
    detail: '',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    finishedAt: 0,
    setProgress(completed, total, detail = '') {
      if (Number.isFinite(Number(completed))) this.completed = Math.max(0, Number(completed));
      if (Number.isFinite(Number(total))) this.total = Math.max(0, Number(total));
      if (detail !== undefined) this.detail = String(detail || '').trim();
      this.updatedAt = Date.now();
    },
    setDetail(detail = '') {
      this.detail = String(detail || '').trim();
      this.updatedAt = Date.now();
    },
    isCancelled() {
      return this.cancelRequested === true;
    }
  };
  longOperations.set(operation.id, operation);
  return operation;
}

function longOperationSnapshot(operation) {
  if (!operation) return null;
  return {
    id: operation.id,
    status: operation.status,
    cancelRequested: operation.cancelRequested === true,
    completed: Math.max(0, Number(operation.completed || 0)),
    total: Math.max(0, Number(operation.total || 0)),
    detail: String(operation.detail || ''),
    elapsedSec: Math.max(1, Math.round((Date.now() - Number(operation.startedAt || Date.now())) / 1000))
  };
}

function finishLongOperation(operation, status = 'done') {
  if (!operation) return;
  operation.status = status;
  operation.finishedAt = Date.now();
  operation.updatedAt = Date.now();
  setTimeout(() => {
    if (longOperations.get(operation.id) === operation) longOperations.delete(operation.id);
  }, LONG_OPERATION_TTL_MS).unref?.();
}

app.post('/operations/:id/cancel', requireAuth, (req, res) => {
  const operation = longOperations.get(String(req.params.id || ''));
  if (!operation || operation.ownerSessionId !== String(req.sessionID || '')) {
    return res.status(404).json({ ok: false, error: 'Операция не найдена или уже завершена.' });
  }
  if (operation.status !== 'running') {
    return res.json({ ok: true, alreadyFinished: true, operation: longOperationSnapshot(operation) });
  }
  operation.cancelRequested = true;
  operation.detail = 'Запрошена безопасная отмена. Завершается текущий запрос к узлу…';
  operation.updatedAt = Date.now();
  return res.json({ ok: true, operation: longOperationSnapshot(operation) });
});

async function finishLongPost(req, res, targetPath, work, buildMessage, options = {}) {
  const operation = createLongOperation(req, options.label || 'Длительная операция');
  const operationId = operation.id;
  const csrfToken = String(req?.session?.csrfToken || res?.locals?.csrfToken || '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.write(`<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Выполняется операция</title>
<style>
  :root{color-scheme:dark;--bg:#061725;--panel:#102f4e;--panel2:#123b63;--line:#2d69a8;--text:#f4f8ff;--muted:#a9bdd5;--blue:#3f8cff;--blue2:#61a1ff;--ok:#20d3a2;--warn:#ffb020}
  *{box-sizing:border-box}
  html,body{height:100%;margin:0}
  body{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 50% 25%,rgba(45,105,168,.32),transparent 34%),linear-gradient(180deg,#071827,#051521 58%,#04111c);color:var(--text);display:grid;place-items:center;padding:22px;overflow:auto}
  .busy-shell{width:min(760px,100%);text-align:center;animation:busyIn .28s ease-out both}
  .busy-card{position:relative;overflow:hidden;border:1px solid rgba(97,161,255,.42);border-radius:28px;padding:34px 28px;background:linear-gradient(180deg,rgba(27,74,119,.92),rgba(12,41,68,.95));box-shadow:0 26px 90px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08)}
  .busy-card:before{content:"";position:absolute;inset:-1px;background:radial-gradient(circle at 50% 0%,rgba(91,150,255,.22),transparent 36%);pointer-events:none}
  .busy-icon{position:relative;width:86px;height:86px;margin:0 auto 20px;border-radius:26px;background:linear-gradient(180deg,var(--blue2),var(--blue));display:grid;place-items:center;box-shadow:0 16px 42px rgba(63,140,255,.35)}
  .busy-spinner{width:44px;height:44px;border-radius:50%;border:5px solid rgba(255,255,255,.28);border-top-color:#fff;animation:spin 1s linear infinite}
  h1{position:relative;margin:0 0 12px;font-size:clamp(26px,4.5vw,38px);line-height:1.08;font-weight:900;letter-spacing:-.03em}
  p{position:relative;margin:0 auto 20px;max-width:620px;color:var(--muted);font-size:clamp(15px,2.4vw,18px);line-height:1.45}
  .busy-status{position:relative;display:flex;justify-content:center;align-items:center;gap:10px;margin:20px auto 0;padding:13px 16px;border-radius:16px;background:rgba(4,18,31,.48);border:1px solid rgba(97,161,255,.22);color:#d9e9ff;font-weight:800;min-height:52px}
  .busy-dot{width:9px;height:9px;flex:0 0 auto;border-radius:50%;background:var(--ok);box-shadow:0 0 0 0 rgba(32,211,162,.65);animation:pulse 1.5s infinite}
  .busy-progress{position:relative;margin-top:12px;color:#c9dcf5;font-size:14px;min-height:20px}
  .busy-bar{position:relative;height:8px;margin:16px 0 0;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}
  .busy-bar span{position:absolute;inset:0 auto 0 0;width:0;border-radius:999px;background:linear-gradient(90deg,var(--blue),var(--ok));transition:width .25s ease}
  .busy-bar.indeterminate span{width:42%;animation:bar 1.65s ease-in-out infinite}
  .busy-actions{position:relative;margin-top:22px;display:flex;justify-content:center}
  .cancel-btn{border:1px solid rgba(255,176,32,.65);background:rgba(255,176,32,.12);color:#ffe0a0;border-radius:14px;padding:12px 18px;font:inherit;font-weight:800;cursor:pointer;min-width:210px}
  .cancel-btn:hover{background:rgba(255,176,32,.2)}
  .cancel-btn:disabled{opacity:.65;cursor:wait}
  .busy-note{position:relative;margin-top:15px;font-size:13px;color:#8ea7c5}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{70%{box-shadow:0 0 0 12px rgba(32,211,162,0)}}
  @keyframes bar{0%{transform:translateX(-110%)}100%{transform:translateX(240%)}}
  @keyframes busyIn{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
  @media(max-width:520px){body{padding:16px}.busy-card{border-radius:24px;padding:28px 18px}.busy-icon{width:74px;height:74px;border-radius:22px}.busy-spinner{width:38px;height:38px}.cancel-btn{width:100%}}
</style>
<div class="busy-shell">
  <div class="busy-card">
    <div class="busy-icon"><div class="busy-spinner" aria-hidden="true"></div></div>
    <h1>Выполняю операцию</h1>
    <p>Можно безопасно остановить процесс кнопкой ниже. Уже завершённые изменения сохранятся, новые клиенты после точки остановки создаваться не будут.</p>
    <div class="busy-status"><span class="busy-dot"></span><span id="s">Идёт обработка…</span></div>
    <div class="busy-progress" id="p"></div>
    <div class="busy-bar indeterminate" id="b"><span></span></div>
    <div class="busy-actions"><button type="button" class="cancel-btn" id="cancelBtn" onclick="requestSafeCancel()">Безопасная отмена</button></div>
    <div class="busy-note">Отмена срабатывает после завершения текущего запроса к 3x-ui. Закрытие вкладки само по себе операцию не отменяет.</div>
  </div>
</div>
<script>
window.__operationId=${JSON.stringify(operationId)};
window.__busyStart=Date.now();
function __busyTick(t){var el=document.getElementById('s');if(!el)return;var sec=Math.max(1,Math.round((Date.now()-window.__busyStart)/1000));el.textContent=(t||'Идёт обработка')+' · '+sec+' сек.';}
function __busyUpdate(state){
  if(!state)return;
  var status=document.getElementById('s');
  var progress=document.getElementById('p');
  var bar=document.getElementById('b');
  var fill=bar&&bar.querySelector('span');
  var total=Number(state.total||0), done=Number(state.completed||0);
  if(status) status.textContent=(state.cancelRequested?'Останавливаю безопасно…':'Идёт обработка')+' · '+Number(state.elapsedSec||1)+' сек.';
  if(progress) progress.textContent=(state.detail||'')+(total>0?' · '+Math.min(done,total)+' из '+total:'');
  if(bar&&fill){
    if(total>0){bar.classList.remove('indeterminate');fill.style.width=Math.max(2,Math.min(100,done/total*100))+'%';}
    else{bar.classList.add('indeterminate');fill.style.width='42%';}
  }
}
async function requestSafeCancel(){
  var btn=document.getElementById('cancelBtn');
  if(btn){btn.disabled=true;btn.textContent='Запрашиваю отмену…';}
  try{
    var r=await fetch('/operations/'+encodeURIComponent(window.__operationId)+'/cancel',{method:'POST',headers:{'Accept':'application/json','X-CSRF-Token':${JSON.stringify(csrfToken)}}});
    var data=await r.json().catch(function(){return {};});
    if(!r.ok||data.ok===false)throw new Error(data.error||'Не удалось отменить операцию');
    if(btn)btn.textContent='Отмена запрошена';
    __busyUpdate(data.operation||{cancelRequested:true,detail:'Завершается текущий запрос…'});
  }catch(e){
    if(btn){btn.disabled=false;btn.textContent='Повторить безопасную отмену';}
    var progress=document.getElementById('p');if(progress)progress.textContent=String(e&&e.message||e);
  }
}
setInterval(function(){__busyTick('Идёт обработка');},1000);
</script>`);
  const heartbeat = setInterval(() => {
    try { res.write('<script>__busyUpdate(' + JSON.stringify(longOperationSnapshot(operation)) + ')</script>'); } catch (_) {}
  }, 1500);
  try {
    const result = await work(operation);
    clearInterval(heartbeat);
    const wasCancelled = Boolean(result?.cancelled || operation.cancelRequested);
    finishLongOperation(operation, wasCancelled ? 'cancelled' : 'done');
    const rawMessage = buildMessage(result);
    const finalMessage = wasCancelled ? `Операция безопасно остановлена. ${rawMessage}` : rawMessage;
    const qs = resultToQuery(finalMessage, result);
    res.end(`<script>__busyUpdate(${JSON.stringify(longOperationSnapshot(operation))});document.getElementById("s").textContent=${JSON.stringify(wasCancelled ? 'Остановлено. Возвращаю в панель…' : 'Готово. Возвращаю в панель…')};setTimeout(function(){location.replace(${JSON.stringify(appendQueryToPath(targetPath, qs))});},650);</script>`);
  } catch (err) {
    clearInterval(heartbeat);
    finishLongOperation(operation, 'failed');
    const qs = new URLSearchParams({ error: trimForRedirect(String(err.message || err), 1200) });
    res.end(`<script>document.getElementById("s").textContent="Ошибка. Возвращаю в панель…";setTimeout(function(){location.replace(${JSON.stringify(appendQueryToPath(targetPath, qs))});},850);</script>`);
  }
}


function getPanelInterfaceTheme() {
  const raw = String(getSetting('panel_interface_theme', 'classic') || 'classic').trim().toLowerCase();
  return ['classic', 'mobile_lite'].includes(raw) ? raw : 'classic';
}

function getClientsViewMode() {
  const raw = String(getSetting('clients_view_mode', 'modern') || 'modern').trim().toLowerCase();
  return ['modern', 'classic'].includes(raw) ? raw : 'modern';
}

function getPanelMobileClientCompact() {
  return getSetting('panel_mobile_client_compact', '0') === '1';
}

function getPanelMobileNavMode() {
  const raw = String(getSetting('panel_mobile_nav_mode', 'bottom') || 'bottom').trim().toLowerCase();
  return ['bottom', 'side'].includes(raw) ? raw : 'bottom';
}

function getPanelMobileUiScale() {
  const raw = String(getSetting('panel_mobile_ui_scale', 'compact') || 'compact').trim().toLowerCase();
  return ['compact', 'normal', 'large'].includes(raw) ? raw : 'compact';
}

function getSubscriptionRevision() {
  const n = Number(getSetting('subscription_revision', '1'));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function bumpSubscriptionRevision() {
  const next = Math.max(Date.now(), getSubscriptionRevision() + 1);
  setSetting('subscription_revision', String(next));
  return next;
}

function compactSubscriptionNoticeTitle(note) {
  const text = String(note || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > 54 ? text.slice(0, 54).trim() + '…' : text;
}

function getSubscriptionDisplayTitle(subscriptionName) {
  // v22: do not put the support/notice text into the profile title.
  // Some clients show Profile-Title in a single short row; long notices there
  // become unreadable. The notice is sent separately through description/
  // announcement metadata and through the subscription body.
  return String(subscriptionName || DEFAULT_SUBSCRIPTION_NAME || 'VPN').trim() || 'VPN';
}

function addQueryParam(url, key, value) {
  if (!url) return '';
  const sep = String(url).includes('?') ? '&' : '?';
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function addSubscriptionRevision(url) {
  return addQueryParam(url, 'rev', getSubscriptionRevision());
}

function maybeRedirectToCurrentSubscriptionRevision(req, res) {
  // Stage32: do not redirect public subscription endpoints.
  // Some iOS clients and CLI tests do not follow 302 correctly and receive only
  // "Found. Redirecting..." instead of the real SUB/JSON body.  The revision is
  // still sent in headers and in newly generated URLs, but old/bare links must
  // return the subscription directly with HTTP 200.
  if (req?.path && (/^\/(sub|json|happ)\//.test(String(req.path)))) return false;

  const currentRev = String(getSubscriptionRevision());
  if (String(req.query?.rev || '') === currentRev || String(req.query?.no_redirect || '') === '1') return false;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === 'rev') continue;
    if (Array.isArray(value)) {
      value.forEach(v => params.append(key, String(v)));
    } else if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  params.set('rev', currentRev);
  res.redirect(302, `${req.path}?${params.toString()}`);
  return true;
}


function getSubscriptionSupportNote() {
  return String(getSetting('subscription_support_note', '') || '').trim();
}

function getSubscriptionSupportUrl() {
  const raw = String(getSetting('subscription_support_url', '') || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || /^tg:\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw;
  return `https://${raw}`;
}

function shouldShowEmptySubscriptionLimits() {
  return getSetting('subscription_show_empty_limits', '0') === '1';
}

function getSubscriptionSupportMeta() {
  return {
    note: getSubscriptionSupportNote(),
    url: getSubscriptionSupportUrl()
  };
}

function isClientExpiredAt(expiryTimeMs) {
  const expiry = normalizeEpochMillis(expiryTimeMs || 0);
  return expiry > 0 && expiry <= Date.now();
}

function isClientExpired(clientRow) {
  return isClientExpiredAt(clientRow?.expiry_time || 0);
}

function getExpiredSubscriptionNotice() {
  return '⛔ Срок доступа закончился.\n💳 Продлите доступ и обновите подписку 🔄';
}

function getEffectiveSubscriptionSupportNote(clientRow) {
  return isClientExpired(clientRow) ? getExpiredSubscriptionNotice() : getSubscriptionSupportNote();
}

function getEffectiveSubscriptionSupportMeta(clientRow) {
  const meta = getSubscriptionSupportMeta();
  if (isClientExpired(clientRow)) {
    return { ...meta, note: getExpiredSubscriptionNotice() };
  }
  return meta;
}

function isClientEffectivelyEnabled(clientRow, expiryOverride = undefined) {
  if (Number(clientRow?.enabled) === 0) return false;
  const expiry = expiryOverride !== undefined ? expiryOverride : clientRow?.expiry_time;
  return !isClientExpiredAt(expiry || 0);
}

async function enforceExpiredClientRemoteState(clientRow) {
  if (!clientRow || !isClientExpired(clientRow)) return;
  try {
    await updateClientEverywhere(clientRow, { enabled: false });
  } catch (err) {
    console.error('Expired client auto-disable failed:', err.message || err);
  }
}

function isHappInfoBlockEnabled() {
  return getSetting('subscription_happ_info_enabled', '1') !== '0';
}

function isHappInfoAnnounceFallbackEnabled() {
  return getSetting('subscription_happ_info_announce_fallback_enabled', '1') !== '0';
}

function getHappInfoTemplate() {
  return String(getSetting(
    'subscription_happ_info_template',
    '👤 Логин: {login}\n📱 Устройств: {ip_usage}\n\n{support_note}'
  ) || '').trim();
}

function getHappInfoColor() {
  const raw = String(getSetting('subscription_happ_info_color', 'blue') || 'blue').trim().toLowerCase();
  return ['blue', 'green', 'red'].includes(raw) ? raw : 'blue';
}

function getHappInfoButtonText() {
  return String(getSetting('subscription_happ_info_button_text', 'Поддержка') || '').trim().slice(0, 25);
}

function getHappInfoButtonLink() {
  const raw = String(getSetting('subscription_happ_info_button_link', '') || '').trim() || getSubscriptionSupportUrl();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || /^tg:\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw;
  return `https://${raw}`;
}

function isHappServerDescriptionEnabled() {
  return getSetting('subscription_happ_server_description_enabled', '1') !== '0';
}

function getHappServerDescriptionTemplate() {
  return String(getSetting('subscription_happ_server_description_template', 'VLESS / {network} / JSON') || '').trim();
}

function safeHappText(value, maxLen = 200) {
  // Preserve intentional blank lines and leading spaces. This is useful for
  // Happ announce/sub-info formatting where operators may visually center
  // short lines with spaces.
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\0/g, '')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/^\n+|\n+$/g, '')
    .slice(0, maxLen);
}

function getClientLimitIpText(clientRow) {
  const limitIp = Math.max(0, Number(clientRow?.limit_ip ?? 0));
  return limitIp > 0 ? String(limitIp) : '∞';
}

function formatClientTrafficUsageFromUserInfo(subscriptionUserInfo) {
  const raw = String(subscriptionUserInfo || '');
  const pairs = Object.fromEntries(raw.split(';').map(part => {
    const [k, v] = part.split('=').map(x => String(x || '').trim());
    return k ? [k, Number(v || 0)] : null;
  }).filter(Boolean));
  const used = Math.max(0, Number(pairs.upload || 0) + Number(pairs.download || 0));
  const total = Math.max(0, Number(pairs.total || 0));
  if (total <= 0) return `${formatTrafficBytes(used)}/∞`;
  return `${formatTrafficBytes(used)}/${formatTrafficBytes(total)}`;
}

function renderTemplate(template, vars) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return String(vars[key] ?? '');
    return m;
  });
}

function buildHappInfoText(clientRow, subscriptionUserInfo = '') {
  if (!isHappInfoBlockEnabled()) return '';
  const template = getHappInfoTemplate();
  if (!template) return '';

  const expiryMs = normalizeEpochMillis(clientRow?.expiry_time || 0);
  const vars = {
    login: clientRow?.login || '',
    display_name: clientRow?.display_name || clientRow?.login || '',
    limit_ip: getClientLimitIpText(clientRow),
    ip_usage: getClientLimitIpText(clientRow),
    traffic_usage: formatClientTrafficUsageFromUserInfo(subscriptionUserInfo),
    days_left: getDaysLeftText(expiryMs),
    expiry_date: expiryMs > 0 ? new Date(expiryMs).toLocaleDateString('ru-RU') : '∞',
    support_note: getEffectiveSubscriptionSupportNote(clientRow)
  };

  return safeHappText(renderTemplate(template, vars), 200);
}

function normalizeComparableHappText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\0/g, '')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsComparableHappText(haystack, needle) {
  const normalizedNeedle = normalizeComparableHappText(needle);
  if (!normalizedNeedle) return true;
  return normalizeComparableHappText(haystack).includes(normalizedNeedle);
}

function buildHappAnnounceText(support, happInfoText) {
  // Textarea values can arrive as CRLF, while happInfoText is normalized to LF.
  // Compare normalized values so {support_note} is not appended a second time
  // when the note contains line breaks or trailing spaces before a line break.
  const note = safeHappText(support?.note || '', 200);
  // Do not trim ordinary spaces here: the Happ info template may intentionally
  // start a line with spaces for visual centering.
  const info = String(happInfoText || '').replace(/^\n+|\n+$/g, '');

  if (!isHappInfoAnnounceFallbackEnabled()) {
    return note;
  }

  const parts = [];
  if (info) parts.push(info);
  if (note && !containsComparableHappText(info, note)) parts.push(note);

  return safeHappText(parts.join('\n'), 350);
}

function buildHappServerDescriptionFromLine(line) {
  const raw = String(line || '');
  const idx = raw.indexOf('#');
  if (idx < 0) return '';
  const fragment = raw.slice(idx + 1);
  const m = fragment.match(/[?&]serverDescription=([^&]+)/);
  if (!m) return '';
  try {
    const encoded = decodeURIComponent(m[1]);
    return Buffer.from(encoded, 'base64').toString('utf8').trim();
  } catch (_) {
    return '';
  }
}

function buildHappServerDescription(node, inbound) {
  if (!isHappServerDescriptionEnabled()) return '';
  const stream = safeParseJsonField(inbound?.streamSettings, {});
  const network = String(stream?.network || 'tcp').toUpperCase();
  const protocol = String(inbound?.protocol || 'vless').toUpperCase();
  const security = String(stream?.security || 'reality').toUpperCase();
  const template = getHappServerDescriptionTemplate();
  const text = renderTemplate(template, {
    protocol,
    network,
    security,
    node: getNodePublicName(node),
    country: node?.country_name_ru || node?.name || ''
  });
  return safeHappText(text, 30);
}

function toPlainBase64(value) {
  const text = stripHeaderControls(value);
  if (!text) return '';
  return Buffer.from(text, 'utf8').toString('base64');
}

async function sendTelegramNotification(text) {
  const enabled = getSetting('telegram_notifications_enabled', '0') === '1';
  const token = String(getSetting('telegram_bot_token', '') || '').trim();
  const chatId = String(getSetting('telegram_chat_id', '') || '').trim();
  if (!enabled || !token || !chatId) return { ok: false, skipped: true, reason: 'Telegram уведомления выключены или не заполнен Bot Token / Chat ID' };

  const body = JSON.stringify({
    chat_id: chatId,
    text: String(text || '').slice(0, 3900),
    disable_web_page_preview: true
  });

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.description || `Telegram HTTP ${response.status}`);
  }
  return { ok: true };
}

function parseGbThreshold(value, fallback = 100) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function ensureMissingAppSettings() {
  const defaults = [
    ['show_sub_links', '1'],
    ['show_json_links', '1'],
    ['admin_idle_timeout_minutes', '20'],
    ['admin_bind_session_to_ip', ADMIN_BIND_SESSION_TO_IP ? '1' : '0'],
    ['subscription_show_limits', '1'],
    ['subscription_userinfo_header', '1'],
    ['subscription_live_usage', '1'],
    ['subscription_update_interval_hours', '1'],
    ['subscription_client_auto_update_enabled', '1'],
    ['subscription_support_note', ''],
    ['subscription_support_url', ''],
    ['subscription_show_empty_limits', '0'],
    ['subscription_revision', '1'],
    ['subscription_happ_info_enabled', '1'],
    ['subscription_happ_info_template', '👤 Логин: {login}\n📱 Устройств: {ip_usage}\n\n{support_note}'],
    ['subscription_happ_info_announce_fallback_enabled', '1'],
    ['subscription_happ_info_color', 'blue'],
    ['subscription_happ_info_button_text', 'Поддержка'],
    ['subscription_happ_info_button_link', ''],
    ['subscription_happ_server_description_enabled', '1'],
    ['subscription_happ_server_description_template', 'VLESS / {network} / JSON'],
    ['happ_provider_id', ''],
    ['json_mux_enabled', '0'],
    ['json_sniffing_enabled', '0'],
    ['ios_safe_routing_enabled', '1'],
    ['happ_app_controls_enabled', '0'],
    ['happ_ping_tcp', '1'],
    ['happ_ping_result_icon', '1'],
    ['happ_fragmentation_enabled', '0'],
    ['happ_noises_enabled', '0'],
    ['happ_mux_enabled', '0'],
    ['happ_subscription_auto_update_enabled', '1'],
    ['happ_update_on_open_enabled', '0'],
    ['happ_ping_on_open_enabled', '0'],
    ['happ_subscriptions_collapse_enabled', '1'],
    ['happ_expand_now_enabled', '0'],
    ['happ_check_url_via_proxy_enabled', '0'],
    ['happ_sniffing_enabled', '0'],
    ['happ_force_apply_on_update_enabled', '0'],
    ['happ_no_limit_mode', 'off'],
    ['show_happ_links', '0'],
    ['json_mux_enabled', '0'],
    ['json_sniffing_enabled', '0'],
    ['ios_safe_routing_enabled', '1'],
    ['update_repo_url', 'https://github.com/dagmagnat/3xui-Aggregator'],
    ['panel_interface_theme', 'classic'],
    ['clients_view_mode', 'modern'],
    ['panel_mobile_client_compact', '0'],
    ['panel_mobile_nav_mode', 'bottom'],
    ['panel_mobile_ui_scale', 'compact'],
    ['nodes_page_size', '10'],
    ['telegram_manager_enabled', '0'],
    ['telegram_manager_bot_token', ''],
    ['telegram_manager_proxy_url', ''],
    ['telegram_manager_admin_ids', ''],
    ['telegram_manager_support_username', ''],
    ['telegram_manager_welcome_text', 'Добро пожаловать! Здесь можно получить VPN-доступ, посмотреть подписку и написать в поддержку.'],
    ['telegram_manager_status_text', 'Сервис работает в штатном режиме.'],
    ['telegram_manager_instruction_text', 'Скопируйте HAPP-ссылку подписки и добавьте её в приложение Happ. Если нужна помощь — нажмите Поддержка.'],
    ['telegram_manager_mtproto_text', '📡 Telegram-прокси для постоянной связи будет опубликован здесь. Нажмите ссылку, чтобы подключить прокси в Telegram.'],
    ['telegram_manager_plans_json', '[{"key":"1m","title":"1 месяц","days":30,"price":300},{"key":"3m","title":"3 месяца","days":90,"price":800},{"key":"6m","title":"6 месяцев","days":180,"price":1500},{"key":"12m","title":"12 месяцев","days":365,"price":2800}]'],
    ['telegram_manager_base_ip_limit', '2'],
    ['telegram_manager_extra_ip_price_rub', '80'],
    ['telegram_manager_expiry_notice_days', '2'],
    ['telegram_backup_enabled', '0'],
    ['telegram_backup_locked', '1'],
    ['telegram_backup_bot_token', ''],
    ['telegram_backup_chat_id', ''],
    ['telegram_notifications_enabled', '0'],
    ['telegram_bot_token', ''],
    ['telegram_chat_id', ''],
    ['telegram_notify_offline_nodes', '1'],
    ['telegram_notify_suspicious_clients', '1'],
    ['telegram_suspicious_daily_gb', '100'],
    ['panel_public_url', process.env.PANEL_PUBLIC_URL || BASE_URL],
    ['sub_public_url', process.env.SUB_PUBLIC_URL || BASE_URL],
    ['sub_url_mode', process.env.SUB_URL_MODE || 'custom'],
    ['panel_access_key', PANEL_ACCESS_KEY]
  ];

  for (const [key, value] of defaults) {
    const existing = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    if (!existing) {
      db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
      continue;
    }

    // После восстановления старого backup ключ мог отсутствовать или быть пустым.
    // Если в .env есть PANEL_ACCESS_KEY, аккуратно подставляем его, не трогая
    // вручную заданные значения.
    if (key === 'panel_access_key' && !String(existing.value || '').trim() && String(value || '').trim()) {
      setSetting(key, value);
    }
  }
}

function applyHappSafeDefaultMigration() {
  const marker = 'happ_safe_defaults_migrated_v12';
  if (getSetting(marker, '') === '1') return;

  // Старые сборки включали Happ/MUX/fragmentation/noises по умолчанию.
  // Это могло ломать интернет у клиентов и упираться в лимиты happ-proxy.com.
  // Один раз переводим существующую установку в безопасный режим: обычная JSON
  // подписка без расширенного Happ-управления.
  const safeOff = [
    'happ_app_controls_enabled',
    'happ_fragmentation_enabled',
    'happ_noises_enabled',
    'happ_mux_enabled',
    'happ_check_url_via_proxy_enabled',
    'happ_sniffing_enabled',
    'happ_force_apply_on_update_enabled',
    'happ_expand_now_enabled',
    'show_happ_links'
  ];
  for (const key of safeOff) setSetting(key, '0');
  setSetting('happ_update_on_open_enabled', '0');
  setSetting('happ_ping_on_open_enabled', '0');
  setSetting('happ_subscriptions_collapse_enabled', '1');
  setSetting('happ_subscription_auto_update_enabled', '1');
  setSetting(marker, '1');
}

function syncDeploymentPublicUrlSettings() {
  const envPanelUrl = normalizePublicUrl(process.env.PANEL_PUBLIC_URL || BASE_URL, BASE_URL);
  const envSubUrl = normalizePublicUrl(process.env.SUB_PUBLIC_URL || envPanelUrl || BASE_URL, envPanelUrl || BASE_URL);
  const envMode = String(process.env.SUB_URL_MODE || 'custom').trim() || 'custom';
  const fingerprint = `${envPanelUrl}|${envSubUrl}|${envMode}`;
  const current = getSetting('install_public_url_fingerprint', '');

  if (!envPanelUrl || current === fingerprint) return;

  // При смене режима через install.sh/agg .env меняется, а старая база может
  // хранить старые URL (например, :3030). Синхронизируем один раз на новый
  // fingerprint, чтобы настройки панели совпадали с текущей установкой.
  setSetting('panel_public_url', envPanelUrl);
  setSetting('sub_public_url', envSubUrl);
  setSetting('sub_url_mode', ['custom', 'panel', 'panel_without_port'].includes(envMode) ? envMode : 'custom');
  setSetting('install_public_url_fingerprint', fingerprint);
}

function normalizeRootUrl(panelUrl, panelPath) {
  let url = String(panelUrl || '').trim().replace(/\/+$/, '');
  let path = String(panelPath || '').trim();

  if (path && !path.startsWith('/')) path = `/${path}`;

  return `${url}${path}`.replace(/\/+$/, '');
}

const NODE_TYPE_3XUI = '3xui';
const NODE_TYPE_H1CLOUD_3XUI = 'h1cloud_3xui';
const NODE_TYPE_H1CLOUD = 'h1cloud';
const NODE_TYPE_REMNAWAVE = 'remnawave';

const H1CLOUD_LINK_MODE_VLESS_REALITY = 'vless_reality';
const H1CLOUD_LINK_MODE_VLESS_ALL = 'vless_all';
const H1CLOUD_LINK_MODE_VLESS_WS = 'vless_ws';
const H1CLOUD_LINK_MODE_ALL = 'all';
const H1CLOUD_LINK_MODE_CUSTOM = 'custom';
const H1CLOUD_LINK_MODE_XHTTP = 'xhttp';
const H1CLOUD_LINK_MODE_XHTTP_CDN = 'xhttp_cdn';
const H1CLOUD_LINK_MODES = new Set([
  H1CLOUD_LINK_MODE_VLESS_REALITY,
  H1CLOUD_LINK_MODE_VLESS_ALL,
  H1CLOUD_LINK_MODE_VLESS_WS,
  H1CLOUD_LINK_MODE_ALL,
  H1CLOUD_LINK_MODE_CUSTOM,
  H1CLOUD_LINK_MODE_XHTTP,
  H1CLOUD_LINK_MODE_XHTTP_CDN
]);

const H1CLOUD_LINK_TYPE_REALITY = 'reality';
const H1CLOUD_LINK_TYPE_XHTTP = 'xhttp';
const H1CLOUD_LINK_TYPE_XHTTP_CDN = 'xhttp_cdn';
const H1CLOUD_LINK_TYPE_ORDER = [
  H1CLOUD_LINK_TYPE_REALITY,
  H1CLOUD_LINK_TYPE_XHTTP,
  H1CLOUD_LINK_TYPE_XHTTP_CDN
];
const H1CLOUD_LINK_TYPE_SET = new Set(H1CLOUD_LINK_TYPE_ORDER);
const UTLS_FINGERPRINT_CHOICES = new Set(['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', '360', 'qq', 'random', 'randomized']);
const H1CLOUD_FINGERPRINT_CHOICES = UTLS_FINGERPRINT_CHOICES;

function normalizeNodeTypeValue(value) {
  const raw = String(value || NODE_TYPE_3XUI).trim().toLowerCase();
  if (raw === NODE_TYPE_H1CLOUD) return NODE_TYPE_H1CLOUD;
  if (raw === NODE_TYPE_REMNAWAVE || raw === 'remna' || raw === 'remnawave_panel') return NODE_TYPE_REMNAWAVE;
  if (raw === NODE_TYPE_H1CLOUD_3XUI || raw === 'h1cloud-3xui' || raw === 'h1_3xui') return NODE_TYPE_H1CLOUD_3XUI;
  return NODE_TYPE_3XUI;
}

function getNodeType(node) {
  return normalizeNodeTypeValue(node?.node_type);
}

// Historical name: this means the separate H1Cloud main.sh API, not the
// provider-managed 3x-ui panel.
function isH1CloudNode(node) {
  return getNodeType(node) === NODE_TYPE_H1CLOUD;
}

function isH1Cloud3xuiNode(node) {
  return getNodeType(node) === NODE_TYPE_H1CLOUD_3XUI;
}

function isRemnawaveNode(node) {
  return getNodeType(node) === NODE_TYPE_REMNAWAVE;
}

function isClientManagedNode(node) {
  // Stage96: Remnawave Panel is a full client provider. It participates in
  // client creation/update/delete and contributes its VLESS hosts to the common
  // Aggregator subscription just like 3x-ui/H1Cloud nodes.
  return true;
}

function is3xuiFamilyNode(node) {
  const type = getNodeType(node);
  return type === NODE_TYPE_3XUI || type === NODE_TYPE_H1CLOUD_3XUI;
}

function isInboundReadOnlyNode(node) {
  return isH1Cloud3xuiNode(node);
}

function getNodeTypeLabel(node) {
  if (isRemnawaveNode(node)) return 'Remnawave Panel';
  if (isH1CloudNode(node)) return 'H1Cloud VLESS API';
  if (isH1Cloud3xuiNode(node)) return 'H1Cloud 3x-ui';
  return '3x-ui';
}

function normalizeH1CloudLinkMode(value) {
  const mode = String(value || H1CLOUD_LINK_MODE_VLESS_REALITY).trim().toLowerCase();
  return H1CLOUD_LINK_MODES.has(mode) ? mode : H1CLOUD_LINK_MODE_VLESS_REALITY;
}

function legacyH1CloudLinkModeToTypes(value) {
  const mode = normalizeH1CloudLinkMode(value);
  if (mode === H1CLOUD_LINK_MODE_ALL || mode === H1CLOUD_LINK_MODE_VLESS_ALL) {
    return [...H1CLOUD_LINK_TYPE_ORDER];
  }
  if (mode === H1CLOUD_LINK_MODE_VLESS_WS || mode === H1CLOUD_LINK_MODE_XHTTP) {
    return [H1CLOUD_LINK_TYPE_XHTTP];
  }
  if (mode === H1CLOUD_LINK_MODE_XHTTP_CDN) {
    return [H1CLOUD_LINK_TYPE_XHTTP_CDN];
  }
  return [H1CLOUD_LINK_TYPE_REALITY];
}

function normalizeH1CloudLinkTypes(value, legacyMode = H1CLOUD_LINK_MODE_VLESS_REALITY) {
  let values = [];
  if (Array.isArray(value)) values = value;
  else if (value !== null && value !== undefined) values = String(value).split(/[\s,;|]+/);
  const normalized = [];
  for (const item of values) {
    const type = String(item || '').trim().toLowerCase();
    if (H1CLOUD_LINK_TYPE_SET.has(type) && !normalized.includes(type)) normalized.push(type);
  }
  if (!normalized.length) return legacyH1CloudLinkModeToTypes(legacyMode);
  return H1CLOUD_LINK_TYPE_ORDER.filter(type => normalized.includes(type));
}

function serializeH1CloudLinkTypes(value, legacyMode = H1CLOUD_LINK_MODE_VLESS_REALITY) {
  return normalizeH1CloudLinkTypes(value, legacyMode).join(',');
}

function h1CloudLegacyModeFromTypes(value) {
  const types = normalizeH1CloudLinkTypes(value);
  if (types.length === H1CLOUD_LINK_TYPE_ORDER.length) return H1CLOUD_LINK_MODE_ALL;
  if (types.length === 1 && types[0] === H1CLOUD_LINK_TYPE_REALITY) return H1CLOUD_LINK_MODE_VLESS_REALITY;
  if (types.length === 1 && types[0] === H1CLOUD_LINK_TYPE_XHTTP) return H1CLOUD_LINK_MODE_XHTTP;
  if (types.length === 1 && types[0] === H1CLOUD_LINK_TYPE_XHTTP_CDN) return H1CLOUD_LINK_MODE_XHTTP_CDN;
  return H1CLOUD_LINK_MODE_CUSTOM;
}

function normalizeH1CloudLinkTypesFromForm(body = {}, fallbackMode = H1CLOUD_LINK_MODE_VLESS_REALITY) {
  const raw = body.h1cloud_link_types;
  if (raw === undefined || raw === null || (Array.isArray(raw) && !raw.length) || String(raw).trim() === '') {
    throw new Error('Для H1Cloud выбери хотя бы один тип ссылки: Reality, XHTTP или XHTTP CDN.');
  }
  return normalizeH1CloudLinkTypes(raw, fallbackMode);
}

function getH1CloudLinkTypesLabel(value, legacyMode = H1CLOUD_LINK_MODE_VLESS_REALITY) {
  const types = normalizeH1CloudLinkTypes(value, legacyMode);
  if (types.length === H1CLOUD_LINK_TYPE_ORDER.length) return 'Reality + XHTTP + XHTTP CDN';
  return types.map(type => {
    if (type === H1CLOUD_LINK_TYPE_XHTTP) return 'XHTTP';
    if (type === H1CLOUD_LINK_TYPE_XHTTP_CDN) return 'XHTTP CDN';
    return 'Reality';
  }).join(' + ');
}

function normalizeUtlsFingerprint(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === 'keep') return '';
  // Xray accepts short aliases (chrome/firefox/...) and native uTLS names.
  // Do not allow spaces or URL separators here because the value is written into fp=...
  // inside a share link or into streamSettings.*Settings.fingerprint. Unsupported
  // names may be rejected by the remote 3x-ui/Xray core.
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(raw)) {
    throw new Error('uTLS fingerprint должен быть коротким идентификатором без пробелов: firefox, edge, random, randomized или uTLS Hello...');
  }
  return raw;
}

function normalizeH1CloudFingerprint(value) {
  return normalizeUtlsFingerprint(value);
}

function normalizeH1CloudFingerprintFromForm(body = {}) {
  const selected = String(body.h1cloud_fingerprint_select ?? body.h1cloud_fingerprint ?? '').trim();
  if (!selected || selected === 'keep') return '';
  if (selected === 'custom') {
    const custom = String(body.h1cloud_fingerprint_custom || '').trim();
    if (!custom) throw new Error('Укажи свой uTLS fingerprint или выбери готовый вариант из списка.');
    return normalizeH1CloudFingerprint(custom);
  }
  return normalizeH1CloudFingerprint(selected);
}

function normalizeInboundFingerprintFromForm(body = {}) {
  const selected = String(body.inbound_fingerprint_select ?? '').trim();
  if (!selected || selected === 'keep') {
    // Backward compatibility with the old free-text input.
    return normalizeUtlsFingerprint(body.inbound_fingerprint || '');
  }
  if (selected === 'custom') {
    const custom = String(body.inbound_fingerprint_custom || '').trim();
    if (!custom) throw new Error('Укажи свой uTLS fingerprint для inbound или выбери готовый вариант из списка.');
    return normalizeUtlsFingerprint(custom);
  }
  return normalizeUtlsFingerprint(selected);
}

function getH1CloudLinkModeLabel(value, linkTypes = '') {
  return getH1CloudLinkTypesLabel(linkTypes, value);
}

function getH1CloudFingerprintLabel(value) {
  const fp = String(value || '').trim();
  return fp ? `fp=${fp}` : 'fp: как в H1Cloud';
}

function getNodeApiAuthMode(node) {
  const raw = String(node?.api_auth_mode || 'password').trim().toLowerCase();
  return raw === 'token' ? 'token' : 'password';
}

function decryptOptional(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  try { return decrypt(text, APP_SECRET); } catch (_) { return fallback; }
}

function getNodeApiToken(node) {
  return decryptOptional(node?.api_token_enc || '', '');
}

function getRemnawaveCaddyToken(node) {
  return decryptOptional(node?.remnawave_caddy_token_enc || '', '');
}

function normalizeRemnawaveBaseUrl(value) {
  let raw = String(value || '').trim().replace(/\/+$/, '');
  raw = raw.replace(/\/api$/i, '');
  return raw;
}

function getRemnawaveApiHeaders(node) {
  const token = getNodeApiToken(node);
  if (!token) throw new Error('Для Remnawave не сохранён API Token. Создай токен в панели Remnawave и вставь его в узел.');
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  const caddyToken = getRemnawaveCaddyToken(node);
  if (caddyToken) headers['X-Api-Key'] = caddyToken;
  return headers;
}

function explainRemnawaveApiError(response, data, endpoint) {
  const status = Number(response?.status || 0);
  const detail = String(
    data?.message || data?.error?.message || data?.error || data?.response?.message || data?.raw || ''
  ).trim();
  if (status === 401 || status === 403) {
    return `Remnawave отклонил API Token (${status}). Создай токен в разделе API Tokens и проверь дополнительный X-Api-Key.`;
  }
  if (status === 404) {
    return `Remnawave API endpoint не найден: ${endpoint}. Проверь, что указан корень панели, например https://rw.example.com, без /api.`;
  }
  return `Remnawave API вернул ${status || 'ошибку'}${detail ? `: ${detail}` : ''}`;
}

async function remnawaveApiRequest(node, method, endpoint, body = undefined, timeoutMs = NODE_API_TIMEOUT_MS, options = {}) {
  const baseUrl = normalizeRemnawaveBaseUrl(node?.panel_url);
  if (!baseUrl) throw new Error('Не указан URL панели Remnawave.');
  const headers = getRemnawaveApiHeaders(node);
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetchWithTimeout(`${baseUrl}${endpoint}`, {
    method: String(method || 'GET').toUpperCase(),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'follow'
  }, timeoutMs);
  const data = await safeJson(response);

  if (Number(response.status) === 404 && options.allowNotFound === true) return null;
  if (!response.ok) {
    const err = new Error(explainRemnawaveApiError(response, data, endpoint));
    err.status = response.status;
    err.path = endpoint;
    err.responseData = data;
    throw err;
  }
  return data;
}

async function remnawaveApiGet(node, endpoint, timeoutMs = NODE_API_TIMEOUT_MS, options = {}) {
  return remnawaveApiRequest(node, 'GET', endpoint, undefined, timeoutMs, options);
}

async function remnawaveApiPost(node, endpoint, body, timeoutMs = FETCH_TIMEOUT_MS) {
  return remnawaveApiRequest(node, 'POST', endpoint, body, timeoutMs);
}

async function remnawaveApiPatch(node, endpoint, body, timeoutMs = FETCH_TIMEOUT_MS) {
  return remnawaveApiRequest(node, 'PATCH', endpoint, body, timeoutMs);
}

async function remnawaveApiDelete(node, endpoint, timeoutMs = CLIENT_DELETE_TIMEOUT_MS, options = {}) {
  return remnawaveApiRequest(node, 'DELETE', endpoint, undefined, timeoutMs, options);
}

function unwrapRemnawaveResponse(data) {
  return data?.response ?? data?.data ?? data?.result ?? data ?? null;
}

function extractRemnawaveUser(data) {
  const root = unwrapRemnawaveResponse(data);
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  if (root.user && typeof root.user === 'object') return root.user;
  return root;
}

function extractRemnawaveUsers(data) {
  const root = unwrapRemnawaveResponse(data) || {};
  const list = root.users ?? root.items ?? root.rows ?? root.data ?? (Array.isArray(root) ? root : []);
  return Array.isArray(list) ? list : [];
}

function extractRemnawaveUsersTotal(data) {
  const root = unwrapRemnawaveResponse(data) || {};
  const total = Number(root?.total ?? root?.totalCount ?? root?.count ?? extractRemnawaveUsers(data).length ?? 0);
  return Number.isFinite(total) && total >= 0 ? total : 0;
}

function extractRemnawaveCollection(data, preferredKeys = []) {
  const root = unwrapRemnawaveResponse(data);
  if (Array.isArray(root)) return root;
  if (!root || typeof root !== 'object') return [];
  for (const key of preferredKeys) {
    if (Array.isArray(root[key])) return root[key];
  }
  for (const value of Object.values(root)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function remnawaveResourceUuid(item) {
  return String(item?.uuid || item?.id || item?.nodeUuid || item?.hostUuid || item?.squadUuid || '').trim();
}

function remnawaveNodeResourceLabel(item) {
  const name = String(item?.name || item?.nodeName || item?.internalName || item?.title || 'Remnawave node').trim();
  const country = String(item?.countryCode || item?.country || item?.countryEmoji || '').trim();
  const address = String(item?.address || item?.nodeAddress || item?.host || '').trim();
  const statusRaw = String(item?.isConnected ?? item?.connected ?? item?.status ?? '').trim().toLowerCase();
  const status = ['true','connected','online','1'].includes(statusRaw) ? 'online' : (['false','disconnected','offline','0'].includes(statusRaw) ? 'offline' : '');
  return [country, name, address ? `(${address})` : '', status ? `[${status}]` : ''].filter(Boolean).join(' ');
}

function remnawaveHostResourceLabel(item) {
  const name = String(item?.remark || item?.name || item?.title || 'Host').trim();
  const address = String(item?.address || item?.hostname || item?.host || '').trim();
  const port = String(item?.port || '').trim();
  return [name, address ? `${address}${port ? `:${port}` : ''}` : ''].filter(Boolean).join(' · ');
}

function remnawaveSquadResourceLabel(item) {
  const name = String(item?.name || item?.title || item?.internalName || 'Internal Squad').trim();
  const members = Number(item?.membersCount ?? item?.usersCount ?? item?.userCount ?? NaN);
  return Number.isFinite(members) ? `${name} · пользователей: ${members}` : name;
}

const remnawaveHostDescriptorCache = new Map();

function normalizeRemnawaveLinkMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return ['first', 'unique', 'all'].includes(mode) ? mode : 'first';
}

function normalizeRemnawaveRemarkMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return ['aggregator', 'provider', 'combined'].includes(mode) ? mode : 'aggregator';
}

function normalizeRemnawaveLinkFilter(value) {
  return String(value || '').trim().slice(0, 300);
}

function extractRemnawaveHost(data) {
  const root = unwrapRemnawaveResponse(data);
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  if (root.host && typeof root.host === 'object') return root.host;
  return root;
}

async function getRemnawaveHostDescriptor(node) {
  const hostUuid = String(node?.remnawave_host_uuid || '').trim();
  if (!hostUuid || !isUuidText(hostUuid)) return null;
  const key = `${Number(node?.id || node?.node_id || 0)}:${hostUuid}`;
  const cached = remnawaveHostDescriptorCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const data = await remnawaveApiGet(node, `/api/hosts/${encodeURIComponent(hostUuid)}`, Math.min(NODE_API_TIMEOUT_MS, 5000), { allowNotFound: true });
    const value = extractRemnawaveHost(data);
    remnawaveHostDescriptorCache.set(key, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
    return value;
  } catch (err) {
    console.error(`Remnawave Host UUID lookup failed (${node?.id || node?.node_id || '?'}):`, err.message || err);
    remnawaveHostDescriptorCache.set(key, { value: null, expiresAt: Date.now() + 60 * 1000 });
    return null;
  }
}

function parseRemnawaveShareCandidate(line) {
  const raw = String(line || '').trim();
  if (!raw.toLowerCase().startsWith('vless://')) return null;
  try {
    const url = new URL(raw);
    let remark = '';
    try { remark = decodeURIComponent(String(url.hash || '').replace(/^#/, '')); } catch (_) { remark = String(url.hash || '').replace(/^#/, ''); }
    const params = {};
    for (const [key, value] of url.searchParams.entries()) params[String(key || '').toLowerCase()] = String(value || '');
    const canonical = new URL(url.toString());
    canonical.hash = '';
    const sorted = Array.from(canonical.searchParams.entries()).sort((a, b) => `${a[0]}=${a[1]}`.localeCompare(`${b[0]}=${b[1]}`));
    canonical.search = '';
    sorted.forEach(([key, value]) => canonical.searchParams.append(key, value));
    return {
      line: raw,
      url,
      remark,
      params,
      key: canonical.toString(),
      haystack: [raw, url.hostname, url.port, url.pathname, remark, ...Object.values(params)].join(' ').toLowerCase()
    };
  } catch (_) {
    return { line: raw, url: null, remark: '', params: {}, key: raw.replace(/#.*$/, ''), haystack: raw.toLowerCase() };
  }
}

function filterRemnawaveCandidatesByText(candidates, filterText) {
  const tokens = String(filterText || '').split(/[\n,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return candidates;
  return candidates.filter(candidate => tokens.some(token => candidate.haystack.includes(token)));
}

function remnawaveHostMatchScore(candidate, host) {
  if (!candidate || !host || typeof host !== 'object') return 0;
  const address = String(host.address || host.serverAddress || host.hostname || '').trim().toLowerCase();
  const port = String(host.port || '').trim();
  const remark = String(host.remark || host.name || host.title || '').trim().toLowerCase();
  const hostHeader = String(host.host || '').trim().toLowerCase();
  const sni = String(host.sni || host.serverName || '').trim().toLowerCase();
  const path = String(host.path || '').trim();
  let score = 0;
  if (candidate.url) {
    if (address && String(candidate.url.hostname || '').toLowerCase() === address) score += 10;
    if (port && String(candidate.url.port || (candidate.url.protocol === 'vless:' ? '' : '')) === port) score += 4;
  }
  if (remark && String(candidate.remark || '').trim().toLowerCase() === remark) score += 5;
  if (hostHeader && String(candidate.params.host || '').toLowerCase() === hostHeader) score += 3;
  if (sni && String(candidate.params.sni || candidate.params.servername || '').toLowerCase() === sni) score += 3;
  if (path && String(candidate.params.path || '') === path) score += 3;
  return score;
}

function filterRemnawaveCandidatesByHost(candidates, host) {
  if (!host || !candidates.length) return candidates;
  const scored = candidates.map(candidate => ({ candidate, score: remnawaveHostMatchScore(candidate, host) }));
  const maxScore = Math.max(0, ...scored.map(item => item.score));
  return maxScore > 0 ? scored.filter(item => item.score === maxScore).map(item => item.candidate) : candidates;
}

function uniqueRemnawaveCandidates(candidates) {
  const seen = new Set();
  return candidates.filter(candidate => {
    const key = String(candidate?.key || candidate?.line || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isUuidText(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function requireRemnawaveSquadUuid(node) {
  const uuid = String(node?.remnawave_internal_squad_uuid || '').trim();
  if (!uuid) throw new Error('Для Remnawave укажи Internal Squad UUID в настройках узла. Без squad пользователь не получит Host в подписке.');
  if (!isUuidText(uuid)) throw new Error('Internal Squad UUID Remnawave имеет неверный формат.');
  return uuid;
}

function normalizeRemnawaveUsername(value, client = null) {
  const raw = String(value || '').trim();
  if (/^[A-Za-z0-9_-]{3,36}$/.test(raw)) return raw;

  let safe = raw
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  if (safe.length >= 3) return safe;

  const fallback = String(client?.sub_slug || client?.uuid || client?.id || randomUUID()).replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  return `agg_${fallback || randomAlphaNum(12)}`.slice(0, 36);
}

function remnawaveExpiryState(expiryValue) {
  const ms = normalizeRemoteEpochMillis(expiryValue || 0);
  if (!ms) return { expired: false, unlimited: true, iso: '2099-12-31T23:59:59.000Z' };
  if (ms <= Date.now()) return { expired: true, unlimited: false, iso: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
  return { expired: false, unlimited: false, iso: new Date(ms).toISOString() };
}

function getRemnawaveUserSquadUuids(user) {
  const squads = Array.isArray(user?.activeInternalSquads) ? user.activeInternalSquads : [];
  return uniqueList(squads.map(item => String(item?.uuid || item || '').trim()).filter(isUuidText));
}

function normalizeRemnawaveSubscriptionUrl(node, value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, `${normalizeRemnawaveBaseUrl(node?.panel_url)}/`).toString();
  } catch (_) {
    return raw;
  }
}

function buildRemnawaveUserPayload(node, client, opts = {}, current = null, mode = 'create') {
  const squadUuid = requireRemnawaveSquadUuid(node);
  const desiredUsername = normalizeRemnawaveUsername(opts.email || client.login || current?.username, client);
  const expiry = remnawaveExpiryState(opts.expiry_time ?? client.expiry_time ?? current?.expireAt ?? 0);
  const nodeEnabled = opts.node_enabled !== undefined ? Boolean(opts.node_enabled) : true;
  const globalEnabled = opts.enabled !== undefined ? Boolean(opts.enabled) : client.enabled !== 0;
  // A Remnawave user is panel-wide. Disabling only this Aggregator connection
  // must remove its configured squad, not disable access through other squads.
  const status = globalEnabled && !expiry.expired ? 'ACTIVE' : 'DISABLED';
  const trafficGb = Math.max(0, Number(opts.traffic_gb ?? client.traffic_gb ?? 0));
  const limitIp = Math.max(0, Number(opts.limit_ip ?? client.limit_ip ?? 0));
  const currentSquads = getRemnawaveUserSquadUuids(current);
  const activeInternalSquads = nodeEnabled
    ? uniqueList([...currentSquads, squadUuid])
    : currentSquads.filter(uuid => !sameText(uuid, squadUuid));
  const description = String(opts.comment ?? client.comment ?? current?.description ?? '').trim();

  const payload = {
    username: desiredUsername,
    status,
    trafficLimitBytes: toTotalGbBytes(trafficGb),
    trafficLimitStrategy: 'NO_RESET',
    description: description || '',
    hwidDeviceLimit: limitIp,
    activeInternalSquads
  };

  if (mode === 'create') {
    payload.vlessUuid = String(client.uuid || opts.uuid || '').trim();
    if (!isUuidText(payload.vlessUuid)) throw new Error('У клиента Aggregator отсутствует корректный VLESS UUID для Remnawave.');
    payload.expireAt = expiry.iso;
  } else {
    payload.uuid = String(current?.uuid || opts.remote_uuid || '').trim();
    // Remnawave rejects an expired date in PATCH. For an expired local client
    // status=DISABLED is enough; the exact future date will be written on extend.
    if (!expiry.expired) payload.expireAt = expiry.iso;
  }

  return { payload, desiredUsername, expiry, trafficGb, limitIp, nodeEnabled, status };
}

async function getRemnawaveUserByUsername(node, username, timeoutMs = FETCH_TIMEOUT_MS) {
  const clean = String(username || '').trim();
  if (!clean) return null;
  const data = await remnawaveApiGet(node, `/api/users/by-username/${encodeURIComponent(clean)}`, timeoutMs, { allowNotFound: true });
  return data ? extractRemnawaveUser(data) : null;
}

async function getRemnawaveUserByUuid(node, uuid, timeoutMs = FETCH_TIMEOUT_MS) {
  const clean = String(uuid || '').trim();
  if (!isUuidText(clean)) return null;
  const data = await remnawaveApiGet(node, `/api/users/${encodeURIComponent(clean)}`, timeoutMs, { allowNotFound: true });
  return data ? extractRemnawaveUser(data) : null;
}

async function listRemnawaveUsers(node, timeoutMs = FETCH_TIMEOUT_MS) {
  const users = [];
  const pageSize = 200;
  for (let start = 0; start < 100000; start += pageSize) {
    const data = await remnawaveApiGet(node, `/api/users?start=${start}&size=${pageSize}`, timeoutMs);
    const page = extractRemnawaveUsers(data);
    users.push(...page);
    const total = extractRemnawaveUsersTotal(data);
    if (!page.length || page.length < pageSize || (total > 0 && users.length >= total)) break;
  }
  return users;
}

function remnawaveRemoteToImportRecord(user) {
  const rawExpireAtMs = normalizeRemoteEpochMillis(user?.expireAt || 0);
  // Stage96 encodes Aggregator's unlimited term as 2099 because Remnawave
  // requires expireAt. Convert that marker back to local infinity on import.
  const expireAtMs = rawExpireAtMs >= Date.UTC(2099, 0, 1) ? 0 : rawExpireAtMs;
  const usedBytes = clampByteNumber(user?.userTraffic?.usedTrafficBytes || 0);
  return {
    uuid: String(user?.vlessUuid || '').trim(),
    remoteUserUuid: String(user?.uuid || '').trim(),
    email: String(user?.username || '').trim(),
    limitIp: Math.max(0, Number(user?.hwidDeviceLimit || 0)),
    expiryTime: expireAtMs,
    flow: '',
    enable: String(user?.status || '').toUpperCase() === 'ACTIVE',
    subId: String(user?.shortUuid || '').trim(),
    reset: 0,
    comment: String(user?.description || '').trim(),
    totalGB: clampByteNumber(user?.trafficLimitBytes || 0),
    uploadBytes: 0,
    downloadBytes: usedBytes,
    usedBytes,
    originalSub: String(user?.subscriptionUrl || '').trim(),
    subscriptionUrl: String(user?.subscriptionUrl || '').trim()
  };
}

function remnawaveUserConflictError(node, username, current, client) {
  const currentVless = String(current?.vlessUuid || '').trim();
  const expected = String(client?.uuid || '').trim();
  return new Error(`${getNodePublicName(node)}: пользователь ${username} уже существует в Remnawave, но его VLESS UUID ${currentVless || 'не указан'} не совпадает с UUID клиента Aggregator ${expected || 'не указан'}. Автоматическое перезаписывание отменено.`);
}

async function ensureRemnawaveUserOnNode(node, client, opts = {}) {
  let map = opts.map || db.prepare('SELECT * FROM client_nodes WHERE client_id = ? AND node_id = ?').get(client.id, node.id);
  const requestedUsername = normalizeRemnawaveUsername(opts.email || client.login || map?.remote_email, client);

  let current = null;
  if (map?.remote_uuid) current = await getRemnawaveUserByUuid(node, map.remote_uuid, FETCH_TIMEOUT_MS);
  if (!current && map?.remote_email) current = await getRemnawaveUserByUsername(node, map.remote_email, FETCH_TIMEOUT_MS);
  if (!current) current = await getRemnawaveUserByUsername(node, requestedUsername, FETCH_TIMEOUT_MS);

  if (current) {
    const currentVlessUuid = String(current.vlessUuid || '').trim();
    const expectedVlessUuid = String(client.uuid || opts.uuid || '').trim();
    if (currentVlessUuid && expectedVlessUuid && !sameText(currentVlessUuid, expectedVlessUuid)) {
      throw remnawaveUserConflictError(node, requestedUsername, current, client);
    }
  }

  const existedBefore = Boolean(current);
  let remoteCreated = false;
  let remoteUpdated = false;

  if (!current) {
    const target = buildRemnawaveUserPayload(node, client, opts, null, 'create');
    const data = await remnawaveApiPost(node, '/api/users', target.payload, FETCH_TIMEOUT_MS);
    current = extractRemnawaveUser(data);
    remoteCreated = true;
    if (!current?.uuid) current = await getRemnawaveUserByUsername(node, target.desiredUsername, FETCH_TIMEOUT_MS);
  } else if (opts.skip_existing !== true) {
    const target = buildRemnawaveUserPayload(node, client, { ...opts, remote_uuid: current.uuid }, current, 'update');
    const data = await remnawaveApiPatch(node, '/api/users', target.payload, FETCH_TIMEOUT_MS);
    current = extractRemnawaveUser(data) || current;
    remoteUpdated = true;
  } else {
    // “Создать отсутствующих” не должен менять срок/лимит существующего
    // пользователя, но обязан восстановить доступ к настроенному squad. Иначе
    // пользователь формально существует, а Host Remnawave не появляется в его
    // подписке.
    const squadUuid = requireRemnawaveSquadUuid(node);
    const currentSquads = getRemnawaveUserSquadUuids(current);
    if (!currentSquads.some(uuid => sameText(uuid, squadUuid))) {
      const data = await remnawaveApiPatch(node, '/api/users', {
        uuid: String(current.uuid || '').trim(),
        activeInternalSquads: uniqueList([...currentSquads, squadUuid])
      }, FETCH_TIMEOUT_MS);
      current = extractRemnawaveUser(data) || current;
      remoteUpdated = true;
    }
  }

  if (!current?.uuid) throw new Error(`${getNodePublicName(node)}: Remnawave не вернул UUID созданного пользователя.`);
  if (!current?.subscriptionUrl) {
    const refreshed = await getRemnawaveUserByUuid(node, current.uuid, FETCH_TIMEOUT_MS);
    if (refreshed) current = refreshed;
  }

  const target = buildRemnawaveUserPayload(node, client, opts, current, 'update');
  const usageBytes = clampByteNumber(current?.userTraffic?.usedTrafficBytes || map?.used_bytes || 0);
  const remoteUsername = String(current?.username || target.desiredUsername || requestedUsername).trim();
  const remoteSubUrl = normalizeRemnawaveSubscriptionUrl(node, current?.subscriptionUrl || map?.remote_sub_url || '');
  const nodeEnabled = target.nodeEnabled;

  if (!map) {
    const info = db.prepare('INSERT INTO client_nodes (client_id,node_id,remote_email,remote_uuid,remote_sub_url,traffic_gb,limit_ip,upload_bytes,download_bytes,used_bytes,enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(client.id, node.id, remoteUsername, String(current.uuid), remoteSubUrl, target.trafficGb, target.limitIp, 0, usageBytes, usageBytes, nodeEnabled ? 1 : 0);
    map = db.prepare('SELECT * FROM client_nodes WHERE id = ?').get(info.lastInsertRowid);
    return { mapCreated: true, remoteCreated, remoteUpdated, skippedExisting: existedBefore && opts.skip_existing === true };
  }

  db.prepare(`
    UPDATE client_nodes
    SET remote_email = ?, remote_uuid = ?, remote_sub_url = ?, traffic_gb = ?, limit_ip = ?, upload_bytes = ?, download_bytes = ?, used_bytes = ?, enabled = ?
    WHERE id = ?
  `).run(remoteUsername, String(current.uuid), remoteSubUrl, target.trafficGb, target.limitIp, 0, usageBytes, usageBytes, nodeEnabled ? 1 : 0, map.id);

  return { mapCreated: false, remoteCreated, remoteUpdated, skippedExisting: existedBefore && opts.skip_existing === true };
}

async function updateRemnawaveUserOnNode(node, map, client, opts = {}) {
  return ensureRemnawaveUserOnNode(node, client, { ...opts, map });
}

async function deleteRemnawaveUser(node, clientUuid, username, timeoutMs = CLIENT_DELETE_TIMEOUT_MS) {
  let remoteUuid = String(clientUuid || '').trim();
  if (!isUuidText(remoteUuid)) {
    const current = await getRemnawaveUserByUsername(node, username, timeoutMs);
    if (!current) return { success: true, alreadyMissing: true };
    remoteUuid = String(current.uuid || '').trim();
  }
  const result = await remnawaveApiDelete(node, `/api/users/${encodeURIComponent(remoteUuid)}`, timeoutMs, { allowNotFound: true });
  return { success: true, alreadyMissing: result === null };
}

async function detachRemnawaveUserFromNode(node, clientUuid, username, timeoutMs = CLIENT_DELETE_TIMEOUT_MS) {
  let current = null;
  const remoteUuid = String(clientUuid || '').trim();
  if (isUuidText(remoteUuid)) current = await getRemnawaveUserByUuid(node, remoteUuid, timeoutMs);
  if (!current) current = await getRemnawaveUserByUsername(node, username, timeoutMs);
  if (!current) return { success: true, alreadyMissing: true, detachedSquad: false };

  const squadUuid = requireRemnawaveSquadUuid(node);
  const currentSquads = getRemnawaveUserSquadUuids(current);
  const remainingSquads = currentSquads.filter(uuid => !sameText(uuid, squadUuid));
  if (remainingSquads.length === currentSquads.length) {
    return { success: true, alreadyMissing: false, detachedSquad: false };
  }

  await remnawaveApiPatch(node, '/api/users', {
    uuid: String(current.uuid || '').trim(),
    activeInternalSquads: remainingSquads
  }, timeoutMs);
  return { success: true, alreadyMissing: false, detachedSquad: true };
}

async function checkRemnawaveApi(node, timeoutMs = NODE_API_TIMEOUT_MS) {
  let data;
  try {
    data = await remnawaveApiGet(node, '/api/users?start=0&size=1', timeoutMs);
  } catch (err) {
    if (Number(err?.status || 0) !== 404) throw err;
    data = await remnawaveApiGet(node, '/api/users/stream?size=1', timeoutMs);
  }
  return { usersTotal: extractRemnawaveUsersTotal(data) };
}

function makeTokenAuthHeaders(token) {
  const clean = String(token || '').trim();
  // Official 3x-ui v3.4.0 API authentication checks Authorization: Bearer.
  // X-Requested-With makes an invalid token return a useful 401 instead of a
  // disguised 404. Do not send unofficial X-API-* headers through proxies/WAFs.
  return {
    'Authorization': `Bearer ${clean}`,
    'X-Requested-With': 'XMLHttpRequest'
  };
}

function normalizeH1CloudApiRoot(node) {
  return normalizeRootUrl(node?.panel_url || '', node?.panel_path || '').replace(/\/+$/, '');
}

function normalizeH1CloudSubBaseUrl(node) {
  let raw = String(node?.sub_base_url || '').trim().replace(/\/+$/, '');
  if (!raw) {
    raw = normalizeH1CloudApiRoot(node).replace(/\/api\/?$/i, '');
    try {
      const u = new URL(raw);
      const p = Number(u.port || 0);
      if (p > 0 && p < 65535) u.port = String(p + 1);
      raw = u.toString().replace(/\/+$/, '');
    } catch (_) {}
  }
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  try {
    const u = new URL(raw);
    u.pathname = u.pathname.replace(/\/sub\/?$/i, '').replace(/\/+$/, '');
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/+$/, '');
  } catch (_) {
    return raw.replace(/\/+$/, '');
  }
}

function buildH1CloudClientSubUrl(node, uuid, local = true) {
  const cleanUuid = String(uuid || '').trim();
  const base = normalizeH1CloudSubBaseUrl(node);
  if (!base || !cleanUuid) return '';
  return `${base}/sub/${encodeURIComponent(cleanUuid)}${local ? '/local' : ''}`;
}

function normalizeH1Cloud3xuiSubPort(value, fallback = 25555) {
  const port = Number(value || fallback || 25555);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Порт подписки H1Cloud 3x-ui должен быть числом от 1 до 65535.');
  }
  return port;
}

function normalizeH1Cloud3xuiSubBaseUrl(nodeOrForm = {}) {
  let raw = String(nodeOrForm.sub_base_url || '').trim().replace(/\/+$/, '');
  const subPort = normalizeH1Cloud3xuiSubPort(nodeOrForm.h1cloud_3xui_sub_port || 25555);
  if (!raw) {
    const panelRaw = String(nodeOrForm.panel_url || '').trim();
    try {
      const u = new URL(/^https?:\/\//i.test(panelRaw) ? panelRaw : `http://${panelRaw}`);
      u.port = String(subPort);
      u.pathname = '';
      u.search = '';
      u.hash = '';
      raw = u.toString().replace(/\/+$/, '');
    } catch (_) {
      raw = '';
    }
  }
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  try {
    const u = new URL(raw);
    if (!u.port) u.port = String(subPort);
    u.pathname = u.pathname.replace(/\/sub\/?$/i, '').replace(/\/+$/, '');
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/+$/, '');
  } catch (_) {
    return raw.replace(/\/+$/, '');
  }
}

function buildH1Cloud3xuiClientSubUrl(node, subId) {
  const cleanSubId = String(subId || '').trim();
  const base = normalizeH1Cloud3xuiSubBaseUrl(node);
  if (!base || !cleanSubId) return '';
  return `${base}/sub/${encodeURIComponent(cleanSubId)}`;
}

function normalizeH1Cloud3xuiJsonUrlTemplate(value, nodeOrForm = {}) {
  let raw = String(value || '').trim();
  if (!raw) return '';

  // Convenience: the provider may only give a dedicated JSON port. In that
  // case reuse the panel/SUB host and build the usual /json/{subId} endpoint.
  if (/^\d{1,5}$/.test(raw)) {
    const jsonPort = Math.max(1, Math.min(65535, Number(raw)));
    const baseCandidate = String(
      nodeOrForm.h1cloud_3xui_sub_base_url ||
      nodeOrForm.sub_base_url ||
      nodeOrForm.panel_url ||
      ''
    ).trim();
    try {
      const u = new URL(/^https?:\/\//i.test(baseCandidate) ? baseCandidate : `http://${baseCandidate}`);
      u.port = String(jsonPort);
      u.pathname = '/json/__H1_SUB_ID__';
      u.search = '';
      u.hash = '';
      raw = u.toString().replace('__H1_SUB_ID__', '{subId}');
    } catch (_) {
      throw new Error('Для JSON-порта сначала укажи корректный URL панели H1Cloud 3x-ui.');
    }
  } else {
    if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
    if (!raw.includes('{subId}')) {
      try {
        const u = new URL(raw);
        const cleanPath = String(u.pathname || '').replace(/\/+$/, '');
        u.pathname = cleanPath && cleanPath !== '/'
          ? `${cleanPath}/__H1_SUB_ID__`
          : '/json/__H1_SUB_ID__';
        raw = u.toString().replace('__H1_SUB_ID__', '{subId}');
      } catch (_) {
        raw = `${raw.replace(/\/+$/, '')}/json/{subId}`;
      }
    }
  }

  try {
    const sample = raw.replaceAll('{subId}', 'sample');
    const parsed = new URL(sample);
    if (!parsed.hostname || !parsed.port) {
      // Port is not universally mandatory, but H1Cloud exposes this JSON feed
      // as a dedicated endpoint. Requiring an explicit port prevents silently
      // pointing at the web panel by mistake.
      throw new Error('missing host/port');
    }
  } catch (_) {
    throw new Error('JSON H1Cloud 3x-ui: укажи порт (например 25556), Base URL или полный шаблон http://IP:PORT/json/{subId}.');
  }
  return raw;
}

function buildH1Cloud3xuiJsonUrl(node, subId) {
  const cleanSubId = String(subId || '').trim();
  const template = normalizeH1Cloud3xuiJsonUrlTemplate(node?.h1cloud_3xui_json_url_template || '', node || {});
  if (!template || !cleanSubId) return '';
  return template.replaceAll('{subId}', encodeURIComponent(cleanSubId));
}

function normalizeNativeJsonConfigs(value) {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object' && !Array.isArray(item));
  if (!value || typeof value !== 'object') return [];
  for (const key of ['configs', 'subscriptions', 'items', 'data', 'result']) {
    if (Array.isArray(value[key])) {
      const items = normalizeNativeJsonConfigs(value[key]);
      if (items.length) return items;
    }
  }
  // A regular Xray JSON configuration has at least one of these top-level keys.
  if (Array.isArray(value.outbounds) || Array.isArray(value.inbounds) || value.routing || value.dns) return [value];
  return [];
}

async function fetchH1Cloud3xuiNativeJsonConfigs(node, subId) {
  const url = buildH1Cloud3xuiJsonUrl(node, subId);
  if (!url) return [];
  const response = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,text/plain,*/*' },
    redirect: 'follow',
    agent: getH1CloudFetchAgent(url)
  }, Math.min(FETCH_TIMEOUT_MS, 8000));
  if (!response.ok) throw new Error(`H1Cloud JSON subscription failed (${response.status})`);
  const text = String(await response.text() || '').trim();
  if (!text) return [];
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (_) { throw new Error('H1Cloud JSON subscription returned invalid JSON'); }
  return normalizeNativeJsonConfigs(parsed);
}

function h1Cloud3xuiUsesSharedTraffic(node) {
  // Stage75: H1Cloud's purchased pool is shared at the provider level, but each
  // 3x-ui client must still receive an explicit quota. Keep the legacy column
  // readable for old databases, but never turn an assigned client quota into
  // remote unlimited traffic.
  return false;
}

function h1Cloud3xuiUsesLocalExpiry(node) {
  return isH1Cloud3xuiNode(node) && Number(node?.h1cloud_3xui_local_expiry ?? 1) !== 0;
}

function getRemoteTrafficGbForNode(node, localTrafficGb) {
  return Math.max(0, Number(localTrafficGb || 0));
}

function getRemoteExpiryForNode(node, localExpiryTime) {
  return h1Cloud3xuiUsesLocalExpiry(node) ? 0 : Math.max(0, Number(localExpiryTime || 0));
}

function getRemoteResetForNode(node, durationDays, localTrafficGb, fallback = 0) {
  if (h1Cloud3xuiUsesLocalExpiry(node)) return 0;
  const days = Math.max(0, Number(durationDays || 0));
  const traffic = Math.max(0, Number(localTrafficGb || 0));
  return days > 0 && traffic > 0 ? days : Math.max(0, Number(fallback || 0));
}

function buildH1CloudLocalSubUrlFromMapping(node, uuid, remoteSubUrl = '') {
  const stored = String(remoteSubUrl || '').trim();
  if (/^https?:\/\//i.test(stored)) {
    try {
      const url = new URL(stored);
      url.pathname = url.pathname
        .replace(/\/(raw|clash|sing-box|json|page)\/?$/i, '')
        .replace(/\/local\/?$/i, '')
        .replace(/\/+$/, '') + '/local';
      return url.toString();
    } catch (_) {}
  }
  return buildH1CloudClientSubUrl(node, uuid, true);
}

function normalizeH1CloudHost(value, fallback = '') {
  let host = String(value || fallback || '').trim();
  host = host.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].trim();
  if (!host) return '';
  if (!/^[A-Za-z0-9._-]+$/.test(host)) throw new Error(`Некорректный домен H1Cloud: ${host}`);
  return host;
}

function normalizeH1CloudPath(value, fallback = '/api/v1/sync/') {
  let pathValue = String(value || fallback || '').trim();
  if (!pathValue) pathValue = fallback;
  if (!pathValue.startsWith('/')) pathValue = `/${pathValue}`;
  return pathValue.replace(/\/+/g, '/');
}

function normalizeH1CloudPort(value, fallback = 0, required = false) {
  const port = Number(value || fallback || 0);
  if (!port && !required) return 0;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Порт H1Cloud должен быть числом от 1 до 65535.');
  return port;
}

function normalizeH1CloudXhttpMethod(value) {
  const method = String(value || 'GET').trim().toUpperCase();
  if (!['GET', 'POST', 'PUT'].includes(method)) throw new Error('Для XHTTP выбери GET, POST или PUT.');
  return method;
}

function normalizeH1CloudAlpn(value) {
  const items = String(value || 'h2,http1').split(/[\s,;]+/).map(v => v.trim()).filter(Boolean);
  const normalized = [];
  for (let item of items) {
    if (item === 'http/1.1') item = 'http1';
    if (!['h2', 'http1', 'h3'].includes(item)) throw new Error(`Неподдерживаемый ALPN: ${item}`);
    if (!normalized.includes(item)) normalized.push(item);
  }
  return (normalized.length ? normalized : ['h2', 'http1']).join(',');
}

function normalizeH1CloudTransportForm(body = {}, node = {}) {
  const backendPath = normalizeH1CloudPath(body.h1cloud_xhttp_backend_path ?? node.h1cloud_xhttp_backend_path ?? '/api/v1/sync/');
  const method = normalizeH1CloudXhttpMethod(body.h1cloud_xhttp_method ?? node.h1cloud_xhttp_method ?? 'GET');
  const alpn = normalizeH1CloudAlpn(body.h1cloud_xhttp_alpn ?? node.h1cloud_xhttp_alpn ?? 'h2,http1');
  const cdnHost = normalizeH1CloudHost(body.h1cloud_cdn_host ?? node.h1cloud_cdn_host ?? '');
  const cdnSni = normalizeH1CloudHost(body.h1cloud_cdn_sni ?? node.h1cloud_cdn_sni ?? cdnHost, cdnHost);
  const cdnPort = normalizeH1CloudPort(body.h1cloud_cdn_port ?? node.h1cloud_cdn_port ?? 443, 443, true);
  const cdnTag = String(body.h1cloud_cdn_tag ?? node.h1cloud_cdn_tag ?? 'CDN').trim().replace(/[\r\n]/g, ' ').slice(0, 40) || 'CDN';
  const cdnPublicPath = normalizeH1CloudPath(body.h1cloud_cdn_public_path ?? node.h1cloud_cdn_public_path ?? backendPath, backendPath);
  const realityPort = normalizeH1CloudPort(body.h1cloud_reality_port ?? node.h1cloud_reality_port ?? 0, 0, false);
  const realityPublicPort = normalizeH1CloudPort(body.h1cloud_reality_public_port ?? node.h1cloud_reality_public_port ?? 0, 0, false);
  const realitySni = normalizeH1CloudHost(body.h1cloud_reality_sni ?? node.h1cloud_reality_sni ?? 'proxy11.h1guro.ovh', 'proxy11.h1guro.ovh');
  const realityDestRaw = String(body.h1cloud_reality_dest ?? node.h1cloud_reality_dest ?? '').trim();
  const realityDest = realityDestRaw || (realitySni ? `${realitySni}:443` : '');
  if (realityDest && !/^[A-Za-z0-9._-]+:\d{1,5}$/.test(realityDest)) {
    throw new Error('Reality DEST укажи в формате domain.example:443.');
  }
  return {
    backendPath,
    method,
    alpn,
    cdnHost,
    cdnSni,
    cdnPort,
    cdnTag,
    cdnPublicPath,
    realityPort,
    realityPublicPort,
    realitySni,
    realityDest
  };
}

function buildH1CloudRealityCommand(config = {}) {
  if (!config.realityPort) return 'vpn reality PORT [PUBLIC_PORT] [SNI] [DEST]';
  const parts = ['vpn', 'reality', String(config.realityPort)];
  if (config.realityPublicPort) parts.push(String(config.realityPublicPort));
  else if (config.realitySni || config.realityDest) parts.push(String(config.realityPort));
  if (config.realitySni) parts.push(config.realitySni);
  if (config.realityDest) parts.push(config.realityDest);
  return parts.join(' ');
}

function buildH1CloudXhttpCommands(config = {}) {
  const commands = [
    `vpn xhttp on ${config.backendPath || '/api/v1/sync/'} ${config.method || 'GET'}`,
    `vpn xhttp alpn ${config.alpn || 'h2,http1'}`
  ];
  if (config.cdnHost) {
    commands.push(`vpn cdn xhttp ${config.cdnHost} ${config.cdnSni || config.cdnHost} ${config.cdnPort || 443} ${config.cdnTag || 'CDN'} ${config.cdnPublicPath || config.backendPath || '/api/v1/sync/'}`);
  }
  commands.push('vpn restart');
  return commands;
}

function joinH1CloudApiPath(node, apiPath) {
  const root = normalizeH1CloudApiRoot(node);
  const cleanPath = String(apiPath || '/').startsWith('/') ? String(apiPath || '/') : `/${apiPath}`;
  if (!root) throw new Error('H1Cloud API Base URL пустой. Укажи http://IP:API_PORT/api.');
  return `${root}${cleanPath}`;
}

async function h1CloudRequest(node, method, apiPath, body = null, timeoutMs = FETCH_TIMEOUT_MS) {
  const token = getNodeApiToken(node);
  if (!token) throw new Error('Для H1Cloud нужен API token из команды vpn api token.');
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    ...makeTokenAuthHeaders(token)
  };
  const options = { method, headers };
  if (body !== null && body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const requestUrl = joinH1CloudApiPath(node, apiPath);
  const h1Agent = getH1CloudFetchAgent(requestUrl);
  const response = await fetchWithTimeout(requestUrl, {
    ...options,
    ...(h1Agent ? { agent: h1Agent } : {})
  }, timeoutMs);
  const data = await safeJson(response);
  if (!response.ok || data?.ok === false || data?.success === false) {
    const message = data?.error || data?.msg || data?.message || `${method} ${apiPath} failed (${response.status})`;
    const err = new Error(`H1Cloud ${getNodePublicName(node)}: ${message}`);
    err.status = response.status;
    err.path = apiPath;
    err.responseData = data;
    throw err;
  }
  return data;
}

async function h1CloudGetStatus(node, timeoutMs = FETCH_TIMEOUT_MS) {
  return h1CloudRequest(node, 'GET', '/status', null, timeoutMs);
}

async function h1CloudGetCapabilities(node, timeoutMs = FETCH_TIMEOUT_MS) {
  try {
    const data = await h1CloudRequest(node, 'GET', '/', null, timeoutMs);
    const endpoints = Array.isArray(data?.endpoints) ? data.endpoints.map(v => String(v)) : [];
    return {
      endpoints,
      cdnXhttp: endpoints.some(v => /server\/(?:config\/)?(?:cdn-xhttp|xhttp-cdn|relay)/i.test(v)),
      reality: endpoints.some(v => /server\/(?:config\/)?reality/i.test(v))
    };
  } catch (_) {
    return { endpoints: [], cdnXhttp: false, reality: false };
  }
}

async function h1CloudConfigureXhttpCdn(node, config) {
  if (!config.cdnHost) throw new Error('Укажи CDN host для XHTTP CDN.');
  const payload = {
    cdn_host: config.cdnHost,
    sni: config.cdnSni || config.cdnHost,
    cdn_port: config.cdnPort || 443,
    tag: config.cdnTag || 'CDN',
    public_path: config.cdnPublicPath || config.backendPath,
    backend_path: config.backendPath,
    method: config.method,
    alpn: config.alpn
  };
  return h1CloudRequest(node, 'PATCH', '/server/config/cdn-xhttp', payload, 25000);
}

async function h1CloudConfigureReality(node, config, enabled = true) {
  const payload = enabled ? {
    enabled: true,
    port: config.realityPort,
    public_port: config.realityPublicPort || config.realityPort,
    sni: config.realitySni,
    dest: config.realityDest
  } : { enabled: false };
  try {
    return await h1CloudRequest(node, 'PATCH', '/server/config/reality', payload, 25000);
  } catch (err) {
    if (Number(err?.status || 0) === 404 || /not_found|404/i.test(String(err?.message || ''))) {
      return {
        ok: false,
        unsupported: true,
        command: enabled ? buildH1CloudRealityCommand(config) : 'vpn reality off'
      };
    }
    throw err;
  }
}

function h1CloudNormalizeClient(raw = {}) {
  const expiresRaw = raw.expires_at ?? raw.expiresAt ?? raw.expire ?? raw.expiryTime ?? raw.expiry_time ?? 0;
  const expiresMs = normalizeRemoteEpochMillis(expiresRaw);
  return {
    uuid: String(raw.uuid || raw.id || raw.client_uuid || '').trim(),
    email: String(raw.name || raw.email || raw.login || '').trim(),
    name: String(raw.name || raw.email || raw.login || '').trim(),
    expiryTime: expiresMs,
    expires_at: expiresMs ? toEpochSeconds(expiresMs) : 0,
    leftDays: Number(raw.left_days ?? raw.leftDays ?? 0) || 0,
    link: String(raw.link || raw.url || '').trim(),
    enable: raw.banned === true || raw.enable === false || raw.enabled === false ? false : true,
    subId: String(raw.uuid || raw.id || '').trim(),
    totalGB: 0,
    limitIp: 0,
    flow: '',
    comment: String(raw.reason || raw.comment || '').trim(),
    uploadBytes: 0,
    downloadBytes: 0,
    usedBytes: 0
  };
}

function h1CloudExtractClients(data) {
  const root = data?.clients ?? data?.users ?? data?.obj?.clients ?? data?.data?.clients ?? data?.data ?? data?.obj ?? data;
  if (Array.isArray(root)) return root;
  if (root && typeof root === 'object') {
    for (const key of ['items', 'rows', 'records', 'list', 'clients', 'users']) {
      if (Array.isArray(root[key])) return root[key];
    }
  }
  return [];
}

async function h1CloudGetClients(node, timeoutMs = FETCH_TIMEOUT_MS) {
  const data = await h1CloudRequest(node, 'GET', '/clients', null, timeoutMs);
  return h1CloudExtractClients(data).map(h1CloudNormalizeClient).filter(c => c.email || c.uuid);
}

async function h1CloudFindClient(node, nameOrUuid, timeoutMs = FETCH_TIMEOUT_MS) {
  const wanted = String(nameOrUuid || '').trim();
  if (!wanted) return null;
  const clients = await h1CloudGetClients(node, timeoutMs);
  return clients.find(c => sameText(c.email, wanted) || sameText(c.name, wanted) || sameText(c.uuid, wanted)) || null;
}

async function h1CloudGetClientInfo(node, name, timeoutMs = FETCH_TIMEOUT_MS) {
  const clean = String(name || '').trim();
  if (!clean) return null;

  // H1Cloud currently documents both GET /clients/NAME and GET /info?name=NAME.
  // Try both before falling back to a full list so an existing client can be
  // adopted instead of failing with user_already_exists/email already in use.
  for (const path of [`/clients/${encodeURIComponent(clean)}`, `/info?name=${encodeURIComponent(clean)}`]) {
    try {
      const data = await h1CloudRequest(node, 'GET', path, null, timeoutMs);
      const root = data?.client || data?.user || data?.data || data?.obj || data;
      const normalized = h1CloudNormalizeClient(root);
      if (normalized.email || normalized.uuid) return normalized;
    } catch (_) {}
  }
  return h1CloudFindClient(node, clean, timeoutMs);
}

function h1CloudClientLimitPayload(opts = {}, client = {}) {
  const payload = {};
  const trafficGb = Math.max(0, Number(opts.traffic_gb ?? opts.trafficGb ?? client.traffic_gb ?? 0));
  const deviceLimit = Math.max(0, Number(opts.limit_ip ?? opts.limitIp ?? client.limit_ip ?? 0));
  if (trafficGb > 0) payload.traffic_limit_gb = trafficGb;
  if (deviceLimit > 0) payload.device_limit = deviceLimit;
  return payload;
}

function h1CloudDaysFromTargetExpiry(expiryTimeMs, fallbackDays = 0) {
  const target = normalizeEpochMillis(expiryTimeMs || 0);
  if (target > Date.now()) return Math.max(1, Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000)));
  const fallback = Math.max(0, Number(fallbackDays || 0));
  if (fallback > 0) return Math.ceil(fallback);
  return Math.max(1, Number(process.env.H1CLOUD_DEFAULT_DAYS || 3650));
}

async function h1CloudCreateClient(node, client, opts = {}) {
  const name = String(opts.email || client?.login || '').trim();
  if (!name) throw new Error('H1Cloud: не указан login/name клиента.');
  const days = h1CloudDaysFromTargetExpiry(opts.expiry_time ?? client?.expiry_time, opts.duration_days ?? client?.duration_days);
  let data = null;
  const createPayload = { name, days, ...h1CloudClientLimitPayload(opts, client) };
  try {
    data = await h1CloudRequest(node, 'POST', '/create', createPayload, FETCH_TIMEOUT_MS);
  } catch (err) {
    // H1Cloud отвечает ошибкой, если клиент с таким именем уже есть на сервере.
    // Для агрегатора это не фатально: такой профиль нужно не создавать заново,
    // а аккуратно привязать к локальному клиенту и забрать его remote UUID/SUB.
    const text = String(err?.message || err || '').toLowerCase();
    if (/already|exists|exist|использ|занят|duplicate|дублик/i.test(text)) {
      const existing = await h1CloudGetClientInfo(node, name, FETCH_TIMEOUT_MS);
      if (existing?.uuid) {
        existing.email = existing.email || existing.name || name;
        return existing;
      }
    }
    throw err;
  }
  let remote = h1CloudNormalizeClient(data?.client || data?.user || data?.data || data?.obj || data);
  if (!remote.uuid || !remote.email) remote = await h1CloudGetClientInfo(node, name, FETCH_TIMEOUT_MS) || remote;
  if (!remote.uuid) throw new Error('H1Cloud создал клиента, но не вернул UUID. Проверь GET /clients или /info.');
  if (!remote.email) remote.email = name;
  return remote;
}

async function h1CloudMaybeRenameClient(node, oldName, newName) {
  const from = String(oldName || '').trim();
  const to = String(newName || '').trim();
  if (!from || !to || sameText(from, to)) return;
  await h1CloudRequest(node, 'PATCH', '/edit', { name: from, new_name: to }, FETCH_TIMEOUT_MS);
}

async function h1CloudMaybeRenewClient(node, name, currentExpiryMs, targetExpiryMs) {
  const current = normalizeEpochMillis(currentExpiryMs || 0);
  const target = normalizeEpochMillis(targetExpiryMs || 0);
  if (!name || !target || !current) return false;
  if (target <= current + 12 * 60 * 60 * 1000) return false;
  const days = Math.max(1, Math.ceil((target - current) / (24 * 60 * 60 * 1000)));
  await h1CloudRequest(node, 'PATCH', '/edit', { name, days }, FETCH_TIMEOUT_MS);
  return true;
}

async function h1CloudMaybeUpdateClientLimits(node, name, opts = {}, client = {}) {
  const limitsPayload = h1CloudClientLimitPayload(opts, client);
  if (!name || !Object.keys(limitsPayload).length) return false;
  await h1CloudRequest(node, 'PATCH', '/edit', { name, ...limitsPayload }, FETCH_TIMEOUT_MS);
  return true;
}

async function h1CloudSetClientEnabled(node, name, enabled, reason = '') {
  const clean = String(name || '').trim();
  if (!clean) return;
  const path = `/clients/${encodeURIComponent(clean)}/${enabled ? 'unban' : 'ban'}`;
  try {
    await h1CloudRequest(node, 'PATCH', path, enabled ? {} : { reason: reason || 'disabled in aggregator' }, FETCH_TIMEOUT_MS);
  } catch (err) {
    console.error('H1Cloud ban/unban skipped:', err.message || err);
  }
}

function h1CloudRemoteToImportRecord(node, remote) {
  const c = h1CloudNormalizeClient(remote);
  return {
    uuid: c.uuid,
    email: c.email || c.name,
    limitIp: 0,
    expiryTime: c.expiryTime,
    flow: '',
    enable: c.enable !== false,
    subId: c.uuid,
    tgId: '',
    reset: c.leftDays || 0,
    comment: c.comment || '',
    totalGB: 0,
    uploadBytes: 0,
    downloadBytes: 0,
    usedBytes: 0,
    originalSub: buildH1CloudClientSubUrl(node, c.uuid, true),
    originalJson: ''
  };
}

async function ensureH1CloudClientOnNode(node, client, opts = {}) {
  let map = db.prepare('SELECT * FROM client_nodes WHERE client_id = ? AND node_id = ?').get(client.id, node.id);
  const email = String(opts.email || client.login || map?.remote_email || '').trim();
  if (!email) throw new Error('H1Cloud: у клиента нет login/name.');

  const nodeTrafficGb = Math.max(0, Number(opts.traffic_gb ?? map?.traffic_gb ?? client.traffic_gb ?? 0));
  const limitIp = Math.max(0, Number(opts.limit_ip ?? map?.limit_ip ?? client.limit_ip ?? 0));
  const nodeEnabled = opts.node_enabled !== undefined ? Boolean(opts.node_enabled) : (map ? map.enabled !== 0 : true);
  const targetExpiry = Math.max(0, Number(opts.expiry_time ?? client.expiry_time ?? 0));
  const effectiveEnabled = (opts.enabled !== undefined ? Boolean(opts.enabled) : client.enabled !== 0) && nodeEnabled && !isClientExpiredAt(targetExpiry);

  let remote = null;
  // /clients usually returns active clients. /info?name can also find a known user by name,
  // which is important when the client is currently banned/disabled on H1Cloud.
  if (map?.remote_email) remote = await h1CloudGetClientInfo(node, map.remote_email, FETCH_TIMEOUT_MS);
  if (!remote && email) remote = await h1CloudGetClientInfo(node, email, FETCH_TIMEOUT_MS);
  if (!remote && map?.remote_uuid) remote = await h1CloudFindClient(node, map.remote_uuid, FETCH_TIMEOUT_MS);
  if (!remote) remote = await h1CloudFindClient(node, email, FETCH_TIMEOUT_MS);

  const remoteExistedBefore = Boolean(remote);
  let remoteCreated = false;
  let remoteUpdated = false;

  if (!remote) {
    remote = await h1CloudCreateClient(node, client, { ...opts, email });
    remoteCreated = true;
  } else if (opts.skip_existing !== true) {
    const oldName = String(map?.remote_email || remote.email || remote.name || '').trim();
    if (oldName && email && !sameText(oldName, email)) {
      await h1CloudMaybeRenameClient(node, oldName, email);
      remote = await h1CloudGetClientInfo(node, email, FETCH_TIMEOUT_MS) || { ...remote, email };
      remoteUpdated = true;
    }
    const renewed = await h1CloudMaybeRenewClient(node, email, remote.expiryTime, targetExpiry);
    if (renewed) {
      remote = await h1CloudGetClientInfo(node, email, FETCH_TIMEOUT_MS) || remote;
      remoteUpdated = true;
    }
  }

  if (!remoteExistedBefore || opts.skip_existing !== true) {
    const limitsChanged = await h1CloudMaybeUpdateClientLimits(node, email, opts, client).catch(err => {
      console.error('H1Cloud limits update skipped:', err.message || err);
      return false;
    });
    if (limitsChanged) {
      remote = await h1CloudGetClientInfo(node, email, FETCH_TIMEOUT_MS) || remote;
      remoteUpdated = true;
    }

    await h1CloudSetClientEnabled(node, email, effectiveEnabled, effectiveEnabled ? '' : (isClientExpiredAt(targetExpiry) ? 'expired in aggregator' : 'disabled in aggregator'));
  }

  const remoteUuid = String(remote.uuid || map?.remote_uuid || '').trim();
  if (!remoteUuid) throw new Error('H1Cloud: не удалось определить UUID клиента.');
  const remoteSubUrl = buildH1CloudClientSubUrl(node, remoteUuid, true);
  const mappedEmail = remoteExistedBefore && opts.skip_existing === true
    ? String(remote.email || remote.name || map?.remote_email || email).trim()
    : email;

  if (!map) {
    const info = db.prepare('INSERT INTO client_nodes (client_id,node_id,remote_email,remote_uuid,remote_sub_url,traffic_gb,limit_ip,upload_bytes,download_bytes,used_bytes,enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(client.id, node.id, mappedEmail, remoteUuid, remoteSubUrl, nodeTrafficGb, limitIp, 0, 0, 0, nodeEnabled ? 1 : 0);
    map = db.prepare('SELECT * FROM client_nodes WHERE id = ?').get(info.lastInsertRowid);
    return { mapCreated: true, remoteCreated, remoteUpdated, skippedExisting: remoteExistedBefore && !remoteCreated };
  }

  db.prepare('UPDATE client_nodes SET remote_email = ?, remote_uuid = ?, remote_sub_url = ?, traffic_gb = ?, limit_ip = ?, enabled = ? WHERE id = ?')
    .run(mappedEmail, remoteUuid, remoteSubUrl, nodeTrafficGb, limitIp, nodeEnabled ? 1 : 0, map.id);
  return { mapCreated: false, remoteCreated, remoteUpdated, skippedExisting: remoteExistedBefore && !remoteCreated };
}

async function updateH1CloudClientOnNode(node, map, client, opts = {}) {
  return ensureH1CloudClientOnNode(node, client, opts);
}

function isRemoteEntityMissingError(err) {
  const status = Number(err?.status || 0);
  const raw = String(err?.originalMessage || err?.message || err || '').toLowerCase();
  const dataCode = String(err?.responseData?.error || err?.responseData?.code || '').toLowerCase();
  if (/cannot (post|delete|get)|no route|route not found|404 page not found|method not allowed/.test(raw)) return false;
  if (dataCode === 'not_found') return false; // H1Cloud: путь не существует, а не клиент
  if (dataCode === 'user_not_found') return true;
  return /user_not_found|record not found|client not found|клиент не найден|пользователь не найден|user does not exist|client does not exist|no such client/.test(raw)
    || (status === 404 && /client|user|record|email/.test(raw));
}

function isNodeFastFailError(err) {
  const raw = String(err?.originalMessage || err?.message || err || '').toLowerCase();
  const code = String(err?.code || '').toUpperCase();
  const name = String(err?.name || '');
  return name === 'NodeApiTimeoutError'
    || name === 'AbortError'
    || ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)
    || /тайм-аут|timeout|timed out|aborted|econnrefused|enotfound|eai_again|host unreachable|network unreachable/.test(raw);
}

async function deleteH1CloudClient(node, uuid, email, timeoutMs = CLIENT_DELETE_TIMEOUT_MS) {
  let name = String(email || '').trim();
  if (!name && uuid) {
    const remote = await h1CloudFindClient(node, uuid, timeoutMs);
    name = String(remote?.email || remote?.name || '').trim();
  }
  if (!name) {
    throw new Error(`H1Cloud ${getNodePublicName(node)}: не найдено имя клиента для удаления.`);
  }

  let deleted = false;
  let lastError = null;
  const attempts = [
    () => h1CloudRequest(node, 'DELETE', `/clients/${encodeURIComponent(name)}`, null, timeoutMs),
    () => h1CloudRequest(node, 'POST', '/delete', { name }, timeoutMs)
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
      deleted = true;
      break;
    } catch (err) {
      if (isRemoteEntityMissingError(err)) {
        deleted = true; // повторное удаление считается успешным
        break;
      }
      lastError = err;
      if (isNodeFastFailError(err)) break;
    }
  }

  if (!deleted) throw lastError || new Error(`H1Cloud ${getNodePublicName(node)}: клиент не удалён.`);

  // Не сообщаем об успехе, если API приняло команду, но запись всё ещё существует.
  const stillExists = await h1CloudGetClientInfo(node, name, timeoutMs).catch(err => {
    if (isRemoteEntityMissingError(err)) return null;
    throw err;
  });
  if (stillExists) {
    throw new Error(`H1Cloud ${getNodePublicName(node)}: клиент ${name} остался на сервере после команды удаления.`);
  }
  return { success: true, deleted: true };
}

async function buildNodeApiAuth(node, timeoutMs = FETCH_TIMEOUT_MS) {
  const rootUrl = normalizeRootUrl(node.panel_url, node.panel_path);
  const mode = getNodeApiAuthMode(node);
  if (mode === 'token') {
    const token = getNodeApiToken(node);
    if (!token) {
      throw new Error('Для этого узла выбран новый метод API Token, но токен не задан. Открой узел → Изменить → вставь API Token из 3x-ui.');
    }
    return {
      rootUrl,
      mode,
      headers: makeTokenAuthHeaders(token)
    };
  }

  const login = await loginNode(node, timeoutMs);
  return {
    rootUrl: login.rootUrl,
    mode,
    headers: { 'Cookie': login.cookie }
  };
}

function explainNodeApiAuthError(node, response, data, path) {
  const mode = getNodeApiAuthMode(node);
  const msg = data?.msg || data?.message || '';
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    if (mode === 'token') {
      return `API Token не принят 3x-ui (${response.status}). Проверь токен в удалённой панели: Настройки → Токен API.`;
    }
    return `Login failed (${response.status}). Для новых версий 3x-ui выбери в узле «Новый метод: API Token» и вставь токен из Настройки → Токен API.`;
  }
  return msg || `${path} failed (${response.status})`;
}

function isBrowserSubscriptionRequest(req) {
  if (String(req.query.raw || '') === '1' || String(req.query.download || '') === '1') return false;
  const accept = String(req.headers.accept || '').toLowerCase();
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  if (accept.includes('text/html')) return true;
  if (/(telegram|whatsapp|instagram|facebook|chrome|safari|firefox|edge|opera|miuibrowser|browser)/i.test(ua)) return true;
  return false;
}

function normalizePublicUrl(value, fallback = '') {
  let url = String(value || '').trim();
  if (!url) url = String(fallback || '').trim();
  url = url.replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch (_) {
    return String(fallback || BASE_URL || `http://localhost:${PORT}`).trim().replace(/\/+$/, '');
  }
}

function stripPortFromPublicUrl(value) {
  const normalized = normalizePublicUrl(value, BASE_URL);
  try {
    const parsed = new URL(normalized);
    parsed.port = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch (_) {
    return normalized;
  }
}

function getSettingRaw(key) {
  return db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
}

function getPanelPublicUrl() {
  return normalizePublicUrl(getSetting('panel_public_url', process.env.PANEL_PUBLIC_URL || BASE_URL), process.env.PANEL_PUBLIC_URL || BASE_URL);
}

function getCurrentPanelAccessKey() {
  return String(getSetting('panel_access_key', PANEL_ACCESS_KEY) || '').trim();
}

function getSubscriptionUrlMode() {
  const mode = String(getSetting('sub_url_mode', process.env.SUB_URL_MODE || 'custom') || 'custom').trim();
  return ['custom', 'panel', 'panel_without_port'].includes(mode) ? mode : 'custom';
}

function getPublicSubBaseUrl() {
  const mode = getSubscriptionUrlMode();
  if (mode === 'panel') return getPanelPublicUrl();
  if (mode === 'panel_without_port') return stripPortFromPublicUrl(getPanelPublicUrl());
  return normalizePublicUrl(getSetting('sub_public_url', process.env.SUB_PUBLIC_URL || BASE_URL), process.env.SUB_PUBLIC_URL || BASE_URL);
}

function buildPublicSubUrl(slug) {
  if (!slug) return '';
  return addSubscriptionRevision(`${getPublicSubBaseUrl()}/sub/${slug}`);
}

function buildPublicPlainSubUrl(slug) {
  if (!slug) return '';
  return addSubscriptionRevision(`${getPublicSubBaseUrl()}/sub-plain/${slug}`);
}

function buildPublicJsonUrl(slug) {
  if (!slug) return '';
  return addSubscriptionRevision(`${getPublicSubBaseUrl()}/json/${slug}`);
}

function buildPublicHappUrl(slug) {
  if (!slug) return '';
  return addSubscriptionRevision(`${getPublicSubBaseUrl()}/happ/${slug}`);
}

function normalizeSubscriptionBaseUrl(node) {
  return getPublicSubBaseUrl();
}

function buildNativeSubUrl(node, subId) {
  if (isH1CloudNode(node)) return buildH1CloudClientSubUrl(node, subId, true);
  if (isH1Cloud3xuiNode(node)) return buildH1Cloud3xuiClientSubUrl(node, subId);
  return buildPublicSubUrl(subId);
}

function buildNativeJsonUrl(node, subId) {
  return buildPublicJsonUrl(subId);
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractCookieHeader(response) {
  if (!response || !response.headers) return '';

  if (typeof response.headers.raw === 'function') {
    const rawCookies = response.headers.raw()['set-cookie'] || [];
    return rawCookies.map(c => c.split(';')[0]).join('; ');
  }

  if (typeof response.headers.get === 'function') {
    const cookie = response.headers.get('set-cookie');
    if (cookie) return cookie.split(';')[0];
  }

  return '';
}

function safeParseJsonField(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;

  const text = String(value).trim();
  if (!text) return fallback;

  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function loginNode(node, timeoutMs = NODE_API_TIMEOUT_MS) {
  const rootUrl = normalizeRootUrl(node.panel_url, node.panel_path);
  const password = decrypt(node.password_enc, APP_SECRET);

  const body = new URLSearchParams({
    username: node.username,
    password
  });

  const response = await fetchWithTimeout(`${rootUrl}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/plain, */*'
    },
    body: body.toString(),
    redirect: 'manual'
  }, timeoutMs);

  const cookie = extractCookieHeader(response);
  const data = await safeJson(response);

  if (!cookie) {
    throw new Error(explainNodeApiAuthError({ ...node, api_auth_mode: 'password' }, response, data, '/login'));
  }

  return { rootUrl, cookie };
}

async function apiGet(node, path, timeoutMs = NODE_API_TIMEOUT_MS) {
  const auth = await buildNodeApiAuth(node, timeoutMs);

  const response = await fetchWithTimeout(`${auth.rootUrl}${path}`, {
    headers: {
      'Accept': 'application/json',
      ...auth.headers
    }
  }, timeoutMs);

  const data = await safeJson(response);

  if (!response.ok) {
    const apiErr = new Error(explainNodeApiAuthError(node, response, data, `GET ${path}`));
    apiErr.status = response.status;
    apiErr.path = path;
    apiErr.responseData = data;
    throw apiErr;
  }

  return data;
}

async function apiPost(node, path, body, asForm = false, timeoutMs = NODE_API_TIMEOUT_MS) {
  const auth = await buildNodeApiAuth(node, timeoutMs);

  let headers = {
    'Accept': 'application/json',
    ...auth.headers
  };

  let payload;

  if (asForm) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(flattenForm(body)).toString();
  } else {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetchWithTimeout(`${auth.rootUrl}${path}`, {
    method: 'POST',
    headers,
    body: payload
  }, timeoutMs);

  const data = await safeJson(response);

  if (!response.ok || data?.success === false) {
    const apiErr = new Error(data?.msg || explainNodeApiAuthError(node, response, data, `POST ${path}`));
    apiErr.status = response.status;
    apiErr.path = path;
    apiErr.responseData = data;
    throw apiErr;
  }

  return data;
}

async function apiDelete(node, path, body = null, timeoutMs = NODE_API_TIMEOUT_MS) {
  const auth = await buildNodeApiAuth(node, timeoutMs);
  const headers = {
    'Accept': 'application/json',
    ...auth.headers
  };
  const options = { method: 'DELETE', headers };
  if (body !== null && body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetchWithTimeout(`${auth.rootUrl}${path}`, options, timeoutMs);
  const data = await safeJson(response);
  if (!response.ok || data?.success === false) {
    const apiErr = new Error(data?.msg || explainNodeApiAuthError(node, response, data, `DELETE ${path}`));
    apiErr.status = response.status;
    apiErr.path = path;
    apiErr.responseData = data;
    throw apiErr;
  }
  return data;
}

function flattenForm(obj, prefix = '', out = {}) {
  Object.entries(obj).forEach(([key, value]) => {
    const formKey = prefix ? `${prefix}[${key}]` : key;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          flattenForm(item, `${formKey}[${index}]`, out);
        } else {
          out[`${formKey}[${index}]`] = item;
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      flattenForm(value, formKey, out);
    } else {
      out[formKey] = value;
    }
  });

  return out;
}

function getCachedInbound(node) {
  const row = db.prepare('SELECT inbound_json FROM node_inbound_cache WHERE node_id = ? AND inbound_id = ?')
    .get(Number(node.id), Number(node.inbound_id));

  if (!row || !row.inbound_json) return null;
  return safeParseJsonField(row.inbound_json, null);
}

function saveInboundCache(node, inbound) {
  if (!node || !node.id || !inbound) return;

  db.prepare(`
    INSERT INTO node_inbound_cache (node_id, inbound_id, inbound_json, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(node_id) DO UPDATE SET
      inbound_id = excluded.inbound_id,
      inbound_json = excluded.inbound_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(Number(node.id), Number(node.inbound_id), JSON.stringify(inbound));
}

async function getInbound(node, timeoutMs = NODE_API_TIMEOUT_MS) {
  const data = await apiGet(node, `/panel/api/inbounds/get/${node.inbound_id}`, timeoutMs);
  const inbound = data.obj || data;
  saveInboundCache(node, inbound);
  return inbound;
}

async function getInboundFast(node) {
  const cached = getCachedInbound(node);
  if (cached) return cached;

  const data = await apiGet(node, `/panel/api/inbounds/get/${node.inbound_id}`);
  const inbound = data.obj || data;
  saveInboundCache(node, inbound);
  return inbound;
}


function parseInboundJsonField(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  const text = String(value || '').trim();
  if (!text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

function stringifyInboundField(value) {
  return JSON.stringify(value ?? {});
}

function getInboundTransportInfo(inbound) {
  const stream = parseInboundJsonField(inbound?.streamSettings, {});
  const network = normalizeInboundNetwork(stream.network || 'raw');
  const protocol = normalizeInboundProtocol(inbound?.protocol || 'vless');
  const security = String(stream.security || '').toLowerCase();
  const transport = getTransportEditorValues(stream);
  const parts = [];
  parts.push(protocol.toUpperCase());
  parts.push(transportLabel(network));
  if (security) parts.push(security.toUpperCase());
  if (network === 'xhttp' && transport.xhttpMode) parts.push(String(transport.xhttpMode));
  if (network === 'grpc' && transport.serviceName) parts.push(String(transport.serviceName));
  return {
    protocol,
    network,
    security,
    label: parts.filter(Boolean).join(' / '),
    xhttpPath: transport.path || '',
    xhttpHost: transport.host || '',
    transport
  };
}

function enrichNodeWithCachedTransport(node) {
  if (isRemnawaveNode(node)) {
    return {
      ...node,
      transport_network: 'remnawave',
      transport_security: 'api',
      transport_label: 'Remnawave API · Bearer',
      transport_loaded: 1,
      node_type_label: getNodeTypeLabel(node)
    };
  }
  if (isH1CloudNode(node)) {
    const linkTypes = normalizeH1CloudLinkTypes(node.h1cloud_link_types, node.h1cloud_link_mode);
    const modeLabel = getH1CloudLinkTypesLabel(linkTypes, node.h1cloud_link_mode);
    const fpLabel = getH1CloudFingerprintLabel(node.h1cloud_fingerprint);
    return {
      ...node,
      h1cloud_link_mode: h1CloudLegacyModeFromTypes(linkTypes),
      h1cloud_link_types: serializeH1CloudLinkTypes(linkTypes),
      h1cloud_link_types_list: linkTypes,
      h1cloud_link_types_label: modeLabel,
      h1cloud_fingerprint: String(node.h1cloud_fingerprint || '').trim(),
      transport_network: 'h1cloud',
      transport_security: linkTypes.length === 1 && linkTypes[0] === H1CLOUD_LINK_TYPE_REALITY ? 'reality' : 'mixed',
      transport_label: `${modeLabel} · ${fpLabel}`,
      transport_loaded: 1,
      node_type_label: getNodeTypeLabel(node)
    };
  }
  const inbound = getCachedInbound(node);
  const info = getInboundTransportInfo(inbound);
  let inboundFingerprint = '';
  let inboundSni = '';
  let inboundPort = '';
  let inboundRemark = '';
  if (inbound) {
    inboundPort = String(inbound.port || '');
    inboundRemark = String(inbound.remark || inbound.tag || '');
    const stream = parseInboundJsonField(inbound.streamSettings, {});
    const reality = stream.realitySettings && typeof stream.realitySettings === 'object' ? stream.realitySettings : {};
    const realityInner = reality.settings && typeof reality.settings === 'object' ? reality.settings : {};
    const tls = stream.tlsSettings && typeof stream.tlsSettings === 'object' ? stream.tlsSettings : {};
    inboundFingerprint = String(reality.fingerprint || realityInner.fingerprint || tls.fingerprint || stream.fingerprint || '').trim();
    const serverNames = Array.isArray(reality.serverNames) ? reality.serverNames : [];
    inboundSni = String(serverNames[0] || reality.serverName || realityInner.serverName || tls.serverName || '').trim();
  }
  return {
    ...node,
    transport_network: info.network,
    transport_security: info.security,
    transport_label: inbound ? info.label : 'не загружено',
    transport_loaded: inbound ? 1 : 0,
    inbound_fingerprint: inboundFingerprint,
    inbound_sni: inboundSni,
    inbound_port: inboundPort,
    inbound_remark: inboundRemark,
    node_type_label: getNodeTypeLabel(node)
  };
}

function extractRealityTarget(reality = {}) {
  const inner = reality.settings || {};
  return reality.dest || inner.dest || reality.target || inner.target || reality.server || reality.targetHost || '';
}

function normalizeRealityTarget(value, sni = '') {
  const raw = String(value || '').trim();
  if (raw) return raw.includes(':') ? raw : `${raw}:443`;
  const cleanSni = normalizeSniValue(sni || '');
  return cleanSni ? `${cleanSni}:443` : '';
}

function splitRealityTargetHost(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('[')) return raw.replace(/^\[([^\]]+)\].*$/, '$1');
  return raw.replace(/:\d+$/, '').trim();
}

function ensureRealityInnerSettings(reality) {
  if (!reality || typeof reality !== 'object') return null;
  if (reality.settings && typeof reality.settings === 'object') return reality.settings;
  if (typeof reality.settings === 'string') {
    const parsed = parseInboundJsonField(reality.settings, null);
    if (parsed && typeof parsed === 'object') {
      reality.settings = parsed;
      return parsed;
    }
  }
  // Новая 3x-ui v3.2.x иногда отдаёт realitySettings.settings = null.
  // При обратном сохранении такая структура вызывает ошибку панели
  // `setting is null`, поэтому создаём совместимый объект сразу.
  reality.settings = {};
  return reality.settings;
}

function applyRealitySniTarget(reality, sniValue, targetValue) {
  if (!reality || typeof reality !== 'object') return;
  const cleanSni = normalizeSniValue(sniValue || '');
  const cleanTarget = normalizeRealityTarget(targetValue || '', cleanSni);

  if (cleanSni) {
    reality.serverNames = [cleanSni];
    reality.serverName = cleanSni;
  }
  if (cleanTarget) {
    // Different 3x-ui/Xray versions read/write this field from slightly
    // different places. Keep aliases in sync so the panel does not update
    // only SNI while leaving Target/dest stale.
    reality.dest = cleanTarget;
    reality.target = cleanTarget;
    reality.targetHost = splitRealityTargetHost(cleanTarget);
  }

  const inner = ensureRealityInnerSettings(reality);
  if (inner) {
    if (cleanSni) inner.serverName = cleanSni;
    if (cleanTarget) {
      inner.dest = cleanTarget;
      inner.target = cleanTarget;
      inner.targetHost = splitRealityTargetHost(cleanTarget);
    }
  }
}

function extractInboundEditorValues(inbound) {
  if (!inbound) return null;
  const stream = parseInboundJsonField(inbound.streamSettings, {});
  const sniffing = parseInboundJsonField(inbound.sniffing, {});
  if (!stream || typeof stream !== 'object') throw new Error('streamSettings inbound пустой или повреждён');
  const reality = stream.realitySettings && typeof stream.realitySettings === 'object' ? stream.realitySettings : {};
  const tls = stream.tlsSettings && typeof stream.tlsSettings === 'object' ? stream.tlsSettings : {};
  const sockopt = stream.sockopt || {};
  const serverNames = Array.isArray(reality.serverNames) ? reality.serverNames : [];
  const shortIds = Array.isArray(reality.shortIds) ? reality.shortIds : [];
  const transport = getTransportEditorValues(stream);
  const sni = serverNames[0] || reality.serverName || tls.serverName || '';
  return {
    id: inbound.id,
    remark: inbound.remark || inbound.tag || '',
    port: inbound.port || '',
    protocol: normalizeInboundProtocol(inbound.protocol || 'vless'),
    network: transport.network,
    security: stream.security || '',
    sni,
    target: extractRealityTarget(reality) || normalizeRealityTarget('', sni || ''),
    fingerprint: reality.settings?.fingerprint || reality.fingerprint || tls.settings?.fingerprint || tls.fingerprint || '',
    publicKey: reality.settings?.publicKey || reality.publicKey || '',
    shortId: shortIds[0] || reality.shortId || '',
    spiderX: reality.settings?.spiderX || reality.spiderX || '/',
    transportPath: transport.path || '',
    transportHost: transport.host || '',
    serviceName: transport.serviceName || '',
    grpcMode: transport.grpcMode || '',
    headerType: transport.kcpHeaderType || transport.rawHeaderType || 'none',
    kcpSeed: transport.kcpSeed || '',
    xhttpHost: transport.host || '',
    xhttpPath: transport.path || '/xhttp',
    xhttpMode: transport.xhttpMode || 'stream-one',
    scMaxConcurrentPosts: transport.scMaxConcurrentPosts || 10,
    scMaxEachPostBytes: transport.scMaxEachPostBytes || 1000000,
    scMinPostsIntervalMs: transport.scMinPostsIntervalMs || 30,
    dialerProxy: sockopt.dialerProxy || '',
    sniffingEnabled: sniffing.enabled !== false,
    sniffingDestOverride: Array.isArray(sniffing.destOverride) ? sniffing.destOverride.join(', ') : '',
    raw: inbound
  };
}


function getSniFromModeValues(mode, profileId, override) {
  const m = String(mode || 'inbound').trim();
  if (m === 'manual') return normalizeSniValue(override || '');
  if (m === 'profile') {
    const profile = getSniProfileById(profileId);
    return normalizeSniValue(profile?.sni || '');
  }
  return '';
}

async function applyNodeSelectedSniToRemoteInbound(node, sniValue) {
  if (isH1Cloud3xuiNode(node)) {
    return { ok: false, skipped: true, reason: 'H1Cloud 3x-ui inbound работает только для чтения' };
  }
  const sni = normalizeSniValue(sniValue || '');
  if (!sni) return { ok: false, skipped: true, reason: 'SNI не выбран' };
  const form = {
    inbound_sni: sni,
    inbound_target: `${sni}:443`
  };
  await updateInboundBasicSettings(node, form);
  return { ok: true, sni, target: form.inbound_target };
}

function defaultInboundSettingsForProtocol(protocol) {
  const p = normalizeInboundProtocol(protocol || 'vless');
  if (p === 'vless') return { clients: [], decryption: 'none' };
  if (p === 'trojan') return { clients: [], fallbacks: [] };
  if (p === 'shadowsocks') return { clients: [], method: '2022-blake3-aes-128-gcm', password: '' };
  if (p === 'wireguard') return { secretKey: '', peers: [] };
  if (p === 'hysteria') return { clients: [] };
  return { clients: [] };
}

function ensureInboundSettingsPayload(inbound) {
  const protocol = normalizeInboundProtocol(inbound?.protocol || 'vless');
  const parsed = safeParseJsonField(inbound?.settings, null);
  const settings = parsed && typeof parsed === 'object' ? parsed : defaultInboundSettingsForProtocol(protocol);
  if (!Array.isArray(settings.clients) && ['vless', 'trojan', 'hysteria'].includes(protocol)) settings.clients = [];
  if (protocol === 'vless' && !settings.decryption) settings.decryption = 'none';
  return stringifyInboundField(settings);
}

async function updateInboundBasicSettings(node, form) {
  if (isH1Cloud3xuiNode(node)) {
    throw new Error('H1Cloud 3x-ui: параметры провайдерского inbound доступны только для чтения и не могут быть изменены агрегатором.');
  }
  const inbound = await getInbound(node, 15000);
  const stream = parseInboundJsonField(inbound.streamSettings, {});
  const sniffing = parseInboundJsonField(inbound.sniffing, {});
  const reality = stream.realitySettings || {};
  const tls = stream.tlsSettings || {};
  const currentPort = normalizePortNumber(inbound.port || 0);
  const requestedPort = normalizePortNumber(form.inbound_port || inbound.port);
  let port = requestedPort || currentPort;
  const portWasChanged = !!requestedPort && !!currentPort && Number(requestedPort) !== Number(currentPort);
  if (portWasChanged) {
    port = assertInboundPortAllowed(requestedPort, node.id);
  } else if (!port) {
    port = assertInboundPortAllowed(form.inbound_port || inbound.port, node.id);
  }

  inbound.port = port;
  if (form.inbound_remark !== undefined) inbound.remark = String(form.inbound_remark || inbound.remark || '').trim();
  if (form.inbound_protocol !== undefined) inbound.protocol = normalizeInboundProtocol(form.inbound_protocol, inbound.protocol || 'vless');

  const requestedNetwork = normalizeInboundNetwork(form.inbound_network || stream.network || 'raw', stream.network || 'raw');
  updateTransportFromForm(stream, { ...form, inbound_network: requestedNetwork });

  if (stream.security === 'reality' || Object.keys(reality).length) {
    stream.realitySettings = reality;
    const sni = normalizeSniValue(form.inbound_sni || '');
    const target = normalizeRealityTarget(form.inbound_target, sni);
    const shortId = String(form.inbound_short_id || '').trim();
    const spiderX = String(form.inbound_spider_x || '/').trim() || '/';
    const fingerprint = normalizeInboundFingerprintFromForm(form);
    applyRealitySniTarget(reality, sni, target);
    const realityInner = ensureRealityInnerSettings(reality);
    if (shortId) reality.shortIds = [shortId];
    if (realityInner) realityInner.spiderX = spiderX;
    if (Object.prototype.hasOwnProperty.call(reality, 'spiderX')) reality.spiderX = spiderX;
    if (fingerprint && realityInner) realityInner.fingerprint = fingerprint;
    if (fingerprint && Object.prototype.hasOwnProperty.call(reality, 'fingerprint')) reality.fingerprint = fingerprint;
  } else if (stream.security === 'tls' || Object.keys(tls).length) {
    stream.tlsSettings = tls;
    const sni = normalizeSniValue(form.inbound_sni || tls.serverName || '');
    const fingerprint = normalizeInboundFingerprintFromForm(form);
    if (sni) tls.serverName = sni;
    if (fingerprint) tls.fingerprint = fingerprint;
  }

  if (form.inbound_sniffing_enabled !== undefined) {
    sniffing.enabled = form.inbound_sniffing_enabled === '1';
  }
  if (form.inbound_sniffing_dest !== undefined) {
    const dest = String(form.inbound_sniffing_dest || '').split(/[\n,;]+/).map(v => v.trim()).filter(Boolean);
    if (dest.length) sniffing.destOverride = dest;
  }

  inbound.streamSettings = stringifyInboundField(stream);
  inbound.sniffing = stringifyInboundField(sniffing && typeof sniffing === 'object' ? sniffing : {});
  inbound.settings = ensureInboundSettingsPayload(inbound);

  const payload = { ...inbound };
  const data = await apiPost(node, `/panel/api/inbounds/update/${encodeURIComponent(inbound.id || node.inbound_id)}`, payload, true);
  saveInboundCache(node, inbound);
  return data;
}

async function getInbounds(node) {
  const data = await apiGet(node, '/panel/api/inbounds/list');
  return data.obj || data;
}

function getPayloadClientEmail(payload) {
  try {
    const settings = safeParseJsonField(payload?.settings, {});
    const clients = Array.isArray(settings.clients) ? settings.clients : [];
    return String(clients[0]?.email || '').trim();
  } catch (_) {
    return '';
  }
}

function enrich3xuiError(node, err, payload = null) {
  const raw = String(err?.message || err || 'unknown error');
  const nodeName = getNodePublicName(node);
  const duplicateMatch = raw.match(/Duplicate email:\s*([^);]+)/i);

  if (duplicateMatch) {
    const email = String(duplicateMatch[1] || getPayloadClientEmail(payload) || '').trim();
    const message = email
      ? `На узле ${nodeName} уже есть клиент с email ${email}. Агрегатор сравнивает email без учёта регистра: user005 и User005 считаются одним клиентом. Проверь или удали дубль в 3x-ui.`
      : `На узле ${nodeName} уже есть клиент с таким email. Проверь или удали дубль в 3x-ui.`;
    const enriched = new Error(message);
    enriched.originalMessage = raw;
    enriched.code = 'DUPLICATE_EMAIL';
    return enriched;
  }

  let message = raw;
  const code = String(err?.code || '').toUpperCase();
  const name = String(err?.name || '');

  if (name === 'AbortError' || name === 'NodeApiTimeoutError' || code === 'ETIMEDOUT' || /aborted|timeout|timed out|тайм-аут/i.test(raw)) {
    const pathHint = String(err?.path || err?.url || '').trim();
    message = `узел не ответил за ${Math.max(1, Math.round(Number(err?.timeoutMs || NODE_API_TIMEOUT_MS) / 1000))} с${pathHint ? ` (${pathHint})` : ''}. Вход в панель из браузера не гарантирует, что порт доступен с сервера агрегатора`;
  } else if (code === 'ECONNREFUSED' || /ECONNREFUSED/i.test(raw)) {
    message = 'невозможно подключиться к панели 3x-ui: соединение отклонено';
  } else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /ENOTFOUND|EAI_AGAIN/i.test(raw)) {
    message = 'не удалось найти домен или IP узла';
  } else if (/401|403|unauthorized|forbidden|login failed/i.test(raw)) {
    message = '3x-ui не приняла авторизацию. Проверь логин, пароль и путь панели';
  }

  const enriched = new Error(`${nodeName}: ${message}`);
  enriched.originalMessage = raw;
  if (err && err.status !== undefined) enriched.status = err.status;
  if (err && err.path !== undefined) enriched.path = err.path;
  if (err && err.responseData !== undefined) enriched.responseData = err.responseData;
  return enriched;
}


function is3xuiV3Mode(node) {
  return isH1Cloud3xuiNode(node) || getNodeApiAuthMode(node) === 'token' || String(node?.api_version || '').toLowerCase().includes('v3');
}

function isMissingApiEndpointError(err) {
  const status = Number(err?.status || 0);
  const raw = String(err?.originalMessage || err?.message || err || '').toLowerCase();
  // `record not found` is an entity/database error in 3x-ui v3, not a missing
  // HTTP route. Treating it as a missing endpoint caused the aggregator to
  // fall back to the legacy inbound API and append orphan/duplicate clients.
  if (/record not found|client not found|user not found|клиент не найден|пользователь не найден/.test(raw)) return false;
  return status === 404 || raw.includes('cannot post') || raw.includes('cannot get') || raw.includes('no route') || raw.includes('endpoint not found') || raw.includes('404 page not found');
}

function shouldFallbackToClientApi(err) {
  return isMissingApiEndpointError(err) || /addclient|updateclient|delclient|getclienttraffics|onlines/i.test(String(err?.path || err?.message || ''));
}

function extractLegacyClientFromPayload(payload) {
  const settings = safeParseJsonField(payload?.settings, {});
  const clients = Array.isArray(settings.clients) ? settings.clients : [];
  return clients[0] || {};
}

function randomAlphaNum(len = 16) {
  return randomUUID().replace(/-/g, '').slice(0, Math.max(1, Number(len) || 16));
}

const INBOUND_PROTOCOL_OPTIONS = ['vless', 'trojan', 'shadowsocks', 'wireguard', 'hysteria', 'http', 'mixed', 'tunnel'];
// UI uses the names from the current 3x-ui panel. In Xray JSON the "RAW"
// transport is still stored as network:"tcp" with tcpSettings. Therefore the
// aggregator keeps RAW as the UI value and converts it to tcp only when writing
// the inbound back to 3x-ui or when generating client links.
const INBOUND_NETWORK_OPTIONS = ['raw', 'kcp', 'ws', 'grpc', 'httpupgrade', 'xhttp'];

function normalizeInboundProtocol(value, fallback = 'vless') {
  const clean = String(value || '').trim().toLowerCase();
  return INBOUND_PROTOCOL_OPTIONS.includes(clean) ? clean : String(fallback || 'vless').toLowerCase();
}

function normalizeInboundNetwork(value, fallback = 'raw') {
  const clean = String(value || '').trim().toLowerCase();
  if (clean === 'raw' || clean === 'tcp') return 'raw';
  if (clean === 'websocket') return 'ws';
  if (clean === 'mkcp') return 'kcp';
  if (clean === 'http upgrade' || clean === 'http-upgrade' || clean === 'httpupgrade') return 'httpupgrade';
  if (INBOUND_NETWORK_OPTIONS.includes(clean)) return clean;
  return normalizeInboundNetwork(fallback || 'raw', 'raw');
}

function toXrayInboundNetwork(network) {
  const n = normalizeInboundNetwork(network || 'raw');
  return n === 'raw' ? 'tcp' : n;
}

function toClientLinkNetwork(network) {
  const n = normalizeInboundNetwork(network || 'raw');
  return n === 'raw' ? 'tcp' : n;
}

function transportLabel(network) {
  const n = normalizeInboundNetwork(network, network || 'raw');
  const labels = {
    raw: 'RAW',
    kcp: 'mKCP',
    ws: 'WebSocket',
    grpc: 'gRPC',
    httpupgrade: 'HTTP Upgrade',
    xhttp: 'xHTTP'
  };
  return labels[n] || String(network || '').toUpperCase();
}

function getTransportSettings(stream = {}, network = '') {
  const n = normalizeInboundNetwork(network || stream.network || 'raw');
  if (n === 'raw') return stream.tcpSettings || stream.rawSettings || {};
  if (n === 'kcp') return stream.kcpSettings || {};
  if (n === 'ws') return stream.wsSettings || {};
  if (n === 'grpc') return stream.grpcSettings || {};
  if (n === 'httpupgrade') return stream.httpupgradeSettings || stream.httpUpgradeSettings || {};
  if (n === 'xhttp') return stream.xhttpSettings || {};
  return {};
}

function setTransportSettings(stream = {}, network = '', settings = {}) {
  const n = normalizeInboundNetwork(network || stream.network || 'raw');
  if (n === 'raw') {
    stream.tcpSettings = settings;
    delete stream.rawSettings;
  } else if (n === 'kcp') stream.kcpSettings = settings;
  else if (n === 'ws') stream.wsSettings = settings;
  else if (n === 'grpc') stream.grpcSettings = settings;
  else if (n === 'httpupgrade') stream.httpupgradeSettings = settings;
  else if (n === 'xhttp') stream.xhttpSettings = settings;
  return stream;
}

function cleanupInactiveTransportSettings(stream = {}, activeNetwork = '') {
  const n = normalizeInboundNetwork(activeNetwork || stream.network || 'raw');
  for (const key of ['rawSettings', 'tcpSettings', 'kcpSettings', 'wsSettings', 'grpcSettings', 'httpupgradeSettings', 'httpUpgradeSettings', 'xhttpSettings']) {
    const belongs =
      (n === 'raw' && key === 'tcpSettings') ||
      (n === 'kcp' && key === 'kcpSettings') ||
      (n === 'ws' && key === 'wsSettings') ||
      (n === 'grpc' && key === 'grpcSettings') ||
      (n === 'httpupgrade' && (key === 'httpupgradeSettings' || key === 'httpUpgradeSettings')) ||
      (n === 'xhttp' && key === 'xhttpSettings');
    if (!belongs && stream[key] && Object.keys(stream[key] || {}).length === 0) delete stream[key];
  }
  if (n === 'raw' && stream.rawSettings) {
    stream.tcpSettings = stream.tcpSettings || stream.rawSettings;
    delete stream.rawSettings;
  }
  return stream;
}

function firstHeaderHost(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function getTransportEditorValues(stream = {}) {
  const network = normalizeInboundNetwork(stream.network || 'raw');
  const t = getTransportSettings(stream, network);
  const header = t.header || {};
  const headers = t.headers || {};
  return {
    network,
    path: t.path || '',
    host: t.host || firstHeaderHost(headers.Host) || firstHeaderHost(header.request?.headers?.Host) || '',
    serviceName: t.serviceName || t.service_name || '',
    grpcMode: t.multiMode ? 'multi' : (t.mode || ''),
    kcpHeaderType: header.type || t.headerType || 'none',
    kcpSeed: t.seed || '',
    rawHeaderType: header.type || t.headerType || 'none',
    xhttpMode: t.mode || 'auto',
    scMaxConcurrentPosts: t.scMaxConcurrentPosts ?? '',
    scMaxEachPostBytes: t.scMaxEachPostBytes ?? '',
    scMinPostsIntervalMs: t.scMinPostsIntervalMs ?? ''
  };
}

function updateTransportFromForm(stream = {}, form = {}) {
  const previousNetwork = normalizeInboundNetwork(stream.network || 'raw');
  const network = normalizeInboundNetwork(form.inbound_network || previousNetwork, previousNetwork);
  stream.network = toXrayInboundNetwork(network);
  const existing = getTransportSettings(stream, network);

  if (network === 'raw' || network === 'tcp') {
    const settings = { ...(existing || {}) };
    const headerType = String(form.inbound_header_type || settings.header?.type || 'none').trim() || 'none';
    settings.header = { ...(settings.header || {}), type: headerType };
    setTransportSettings(stream, network, settings);
  } else if (network === 'kcp') {
    const settings = { ...(existing || {}) };
    settings.header = { ...(settings.header || {}), type: String(form.inbound_header_type || settings.header?.type || 'none').trim() || 'none' };
    if (form.inbound_kcp_seed !== undefined) settings.seed = String(form.inbound_kcp_seed || '').trim();
    setTransportSettings(stream, network, settings);
  } else if (network === 'ws') {
    const settings = { ...(existing || {}) };
    settings.path = String(form.inbound_path || settings.path || '/').trim() || '/';
    const host = String(form.inbound_host || '').trim();
    if (host) settings.headers = { ...(settings.headers || {}), Host: host };
    setTransportSettings(stream, network, settings);
  } else if (network === 'grpc') {
    const settings = { ...(existing || {}) };
    settings.serviceName = String(form.inbound_service_name || settings.serviceName || '').trim();
    const mode = String(form.inbound_grpc_mode || '').trim().toLowerCase();
    if (mode === 'multi') settings.multiMode = true;
    else if (mode === 'gun') settings.multiMode = false;
    setTransportSettings(stream, network, settings);
  } else if (network === 'httpupgrade') {
    const settings = { ...(existing || {}) };
    settings.path = String(form.inbound_path || settings.path || '/').trim() || '/';
    const host = String(form.inbound_host || settings.host || '').trim();
    if (host) settings.host = host;
    setTransportSettings(stream, network, settings);
  } else if (network === 'xhttp') {
    const settings = { ...(existing || {}) };
    settings.host = String(form.inbound_host || settings.host || '').trim();
    settings.path = String(form.inbound_path || settings.path || '/xhttp').trim() || '/xhttp';
    settings.mode = String(form.inbound_xhttp_mode || settings.mode || 'auto').trim() || 'auto';
    const scRaw = String(form.inbound_xhttp_sc || '').trim();
    if (scRaw) {
      // Accept both the legacy numeric triple and Xray's current dash-ranges,
      // e.g. `0, 500000-1000000, 10-50`. The first field is legacy and is
      // retained only for old/forked cores; current share links never emit it.
      const scParts = scRaw.split(',').map(v => String(v || '').trim());
      const legacyConcurrent = Number(scParts[0]);
      if (Number.isFinite(legacyConcurrent) && legacyConcurrent > 0) settings.scMaxConcurrentPosts = Math.floor(legacyConcurrent);
      else delete settings.scMaxConcurrentPosts;
      const rangeValue = value => /^\d+(?:-\d+)?$/.test(value || '') ? value : '';
      const eachPost = rangeValue(scParts[1]);
      const interval = rangeValue(scParts[2]);
      if (eachPost) settings.scMaxEachPostBytes = eachPost;
      else delete settings.scMaxEachPostBytes;
      if (interval) settings.scMinPostsIntervalMs = interval;
      else delete settings.scMinPostsIntervalMs;
    } else {
      // Let the running Xray core choose its current transport defaults. In
      // particular, do not serialize the old fixed 1 MB / 30 ms pair: it is a
      // stable on-wire fingerprint and upstream 3x-ui deliberately leaves it blank.
      delete settings.scMaxConcurrentPosts;
      delete settings.scMaxEachPostBytes;
      delete settings.scMinPostsIntervalMs;
    }
    setTransportSettings(stream, network, settings);
  }

  if (network === 'xhttp' && form.inbound_xhttp_fragment === '1') {
    stream.sockopt = stream.sockopt || {};
    stream.sockopt.dialerProxy = 'fragment';
  } else if (stream.sockopt) {
    delete stream.sockopt.dialerProxy;
    if (!Object.keys(stream.sockopt).length) delete stream.sockopt;
  }

  return cleanupInactiveTransportSettings(stream, network);
}

function buildXhttpShareExtra(t = {}) {
  const extra = {};
  const putString = (key, value) => {
    if (typeof value === 'string' && value.length > 0) extra[key] = value;
  };

  putString('mode', t.mode);
  putString('xPaddingBytes', t.xPaddingBytes);
  if (t.xPaddingObfsMode === true) {
    extra.xPaddingObfsMode = true;
    for (const key of ['xPaddingKey', 'xPaddingHeader', 'xPaddingPlacement', 'xPaddingMethod']) putString(key, t[key]);
  }

  const coreDefaults = { scMaxEachPostBytes: '1000000', scMinPostsIntervalMs: '30' };
  for (const key of [
    'uplinkHTTPMethod', 'sessionIDPlacement', 'sessionIDKey',
    'sessionIDTable', 'sessionIDLength', 'seqPlacement', 'seqKey',
    'uplinkDataPlacement', 'uplinkDataKey', 'scMaxEachPostBytes',
    'scMinPostsIntervalMs'
  ]) {
    const value = t[key];
    if (typeof value === 'string' && value.length > 0 && value !== coreDefaults[key]) extra[key] = value;
  }

  if (extra.sessionIDPlacement === undefined && typeof t.sessionPlacement === 'string' && t.sessionPlacement) {
    extra.sessionIDPlacement = t.sessionPlacement;
  }
  if (extra.sessionIDKey === undefined && typeof t.sessionKey === 'string' && t.sessionKey) {
    extra.sessionIDKey = t.sessionKey;
  }
  if (extra.sessionIDTable === undefined && typeof t.sessionTable === 'string' && t.sessionTable) {
    extra.sessionIDTable = t.sessionTable;
  }
  if (extra.sessionIDLength === undefined && typeof t.sessionLength === 'string' && t.sessionLength) {
    extra.sessionIDLength = t.sessionLength;
  }

  if ((typeof t.uplinkChunkSize === 'number' && t.uplinkChunkSize !== 0)
      || (typeof t.uplinkChunkSize === 'string' && t.uplinkChunkSize !== '')) {
    extra.uplinkChunkSize = t.uplinkChunkSize;
  }
  if (t.noGRPCHeader === true) extra.noGRPCHeader = true;

  for (const key of ['xmux', 'downloadSettings']) {
    const value = t[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) extra[key] = value;
  }

  if (t.headers && typeof t.headers === 'object' && !Array.isArray(t.headers)) {
    const headers = {};
    for (const [name, value] of Object.entries(t.headers)) {
      if (String(name).toLowerCase() === 'host') continue;
      headers[name] = value;
    }
    if (Object.keys(headers).length > 0) extra.headers = headers;
  }

  return Object.keys(extra).length > 0 ? extra : null;
}

function appendTransportQuery(query, streamSettings = {}) {
  const network = normalizeInboundNetwork(streamSettings.network || 'raw');
  const linkNetwork = toClientLinkNetwork(network);
  const t = getTransportSettings(streamSettings, network);
  if (network === 'ws') {
    if (t.path) query.set('path', t.path);
    const host = t.host || firstHeaderHost(t.headers?.Host);
    if (host) query.set('host', host);
  } else if (network === 'grpc') {
    if (t.serviceName) query.set('serviceName', t.serviceName);
    if (t.multiMode !== undefined) query.set('mode', t.multiMode ? 'multi' : 'gun');
  } else if (network === 'httpupgrade') {
    if (t.path) query.set('path', t.path);
    if (t.host) query.set('host', t.host);
  } else if (network === 'xhttp') {
    if (t.path) query.set('path', t.path);
    if (t.host) query.set('host', t.host);
    if (t.mode) query.set('mode', t.mode);

    // Keep the URI byte-shape aligned with current 3x-ui: only fields the
    // client consumes go into `extra`; server-only values stay off the wire.
    const extra = buildXhttpShareExtra(t);
    if (extra) query.set('extra', JSON.stringify(extra));

    if (streamSettings.sockopt?.dialerProxy) query.set('dialerProxy', streamSettings.sockopt.dialerProxy);
  } else if (network === 'kcp') {
    if (t.header?.type) query.set('headerType', t.header.type);
    if (t.seed) query.set('seed', t.seed);
  } else if ((network === 'raw' || network === 'tcp') && t.header?.type && t.header.type !== 'none') {
    query.set('headerType', t.header.type);
  }
  return query;
}

function getTlsServerNameFromStream(streamSettings = {}) {
  const tls = streamSettings.tlsSettings || {};
  const reality = streamSettings.realitySettings || {};
  const realityInner = reality.settings || {};
  return tls.serverName || reality.serverName || reality.serverNames?.[0] || realityInner.serverName || realityInner.serverNames?.[0] || '';
}

function normalizeClientFor3xuiV3(client = {}) {
  const c = { ...client };
  const uuid = String(c.id || c.uuid || c.clientId || c.client_id || '').trim();
  if (uuid) c.id = uuid;
  else delete c.id;
  delete c.uuid;
  delete c.clientId;
  delete c.client_id;

  c.email = String(c.email || c.login || c.name || '').trim();
  delete c.login;
  delete c.name;

  if (c.enable === undefined && c.enabled !== undefined) c.enable = Boolean(c.enabled);
  delete c.enabled;
  if (c.enable === undefined) c.enable = true;

  c.limitIp = Math.max(0, Number(c.limitIp ?? c.limit_ip ?? 0));
  delete c.limit_ip;
  c.totalGB = clampByteNumber(c.totalGB ?? c.total ?? 0);
  delete c.total;
  c.expiryTime = normalizeRemoteEpochMillis(c.expiryTime ?? c.expiry_time ?? c.expire ?? 0);
  delete c.expiry_time;
  delete c.expire;
  c.reset = Math.max(0, Number(c.reset || 0));

  c.subId = String(c.subId || c.sub_id || '').trim() || randomAlphaNum(16);
  delete c.sub_id;

  // Do not invent protocol credentials on update. Current 3x-ui preserves
  // omitted credentials and generates protocol-specific defaults on create;
  // random password/auth values here would rotate Trojan/Hysteria credentials.
  if (c.password !== undefined || c.pass !== undefined) c.password = String(c.password || c.pass || '').trim();
  else delete c.password;
  delete c.pass;
  if (c.auth !== undefined) c.auth = String(c.auth || '').trim();
  if (c.security !== undefined) c.security = String(c.security || '').trim();

  const tgRaw = c.tgId ?? c.tg_id ?? 0;
  c.tgId = tgRaw === '' || tgRaw === null || tgRaw === undefined ? 0 : Number(tgRaw);
  if (!Number.isFinite(c.tgId)) c.tgId = 0;
  delete c.tg_id;

  c.group = String(c.group || c.groupName || '').trim();
  delete c.groupName;
  c.comment = String(c.comment || c.remark || '').trim();
  delete c.remark;
  c.flow = String(c.flow || '').trim();

  // Keep current v3 fields when they are supplied by /clients/get or /list.
  for (const key of ['adTag', 'privateKey', 'publicKey', 'preSharedKey', 'secret']) {
    if (c[key] !== undefined) c[key] = String(c[key] || '').trim();
  }
  if (c.allowedIPs !== undefined && !Array.isArray(c.allowedIPs)) {
    c.allowedIPs = String(c.allowedIPs || '').split(',').map(v => v.trim()).filter(Boolean);
  }
  if (c.keepAlive !== undefined) c.keepAlive = Math.max(0, Number(c.keepAlive || 0));
  if (c.reverse !== undefined && c.reverse !== null && typeof c.reverse === 'string') {
    c.reverse = safeParseJsonField(c.reverse, null);
  }

  return c;
}

function normalizeClientPatchFor3xuiV3(client = {}) {
  const source = { ...client };
  const out = {};
  const has = (...keys) => keys.some(key => Object.prototype.hasOwnProperty.call(source, key));

  if (has('id', 'uuid', 'clientId', 'client_id')) {
    const value = String(source.id || source.uuid || source.clientId || source.client_id || '').trim();
    if (value) out.id = value;
  }
  if (has('email', 'login', 'name')) out.email = String(source.email || source.login || source.name || '').trim();
  if (has('enable', 'enabled')) out.enable = Boolean(source.enable ?? source.enabled);
  if (has('limitIp', 'limit_ip')) out.limitIp = Math.max(0, Number(source.limitIp ?? source.limit_ip ?? 0));
  if (has('totalGB', 'total')) out.totalGB = clampByteNumber(source.totalGB ?? source.total ?? 0);
  if (has('expiryTime', 'expiry_time', 'expire')) out.expiryTime = normalizeRemoteEpochMillis(source.expiryTime ?? source.expiry_time ?? source.expire ?? 0);
  if (has('reset')) out.reset = Math.max(0, Number(source.reset || 0));
  if (has('subId', 'sub_id')) out.subId = String(source.subId || source.sub_id || '').trim();
  if (has('password', 'pass')) out.password = String(source.password || source.pass || '').trim();
  if (has('auth')) out.auth = String(source.auth || '').trim();
  if (has('security')) out.security = String(source.security || '').trim();
  if (has('tgId', 'tg_id')) {
    const value = Number(source.tgId ?? source.tg_id ?? 0);
    out.tgId = Number.isFinite(value) ? value : 0;
  }
  if (has('group', 'groupName')) out.group = String(source.group || source.groupName || '').trim();
  if (has('comment', 'remark')) out.comment = String(source.comment || source.remark || '').trim();
  if (has('flow')) out.flow = String(source.flow || '').trim();
  if (has('reverse')) out.reverse = typeof source.reverse === 'string' ? safeParseJsonField(source.reverse, null) : source.reverse;

  for (const key of ['adTag', 'privateKey', 'publicKey', 'preSharedKey', 'secret']) {
    if (has(key)) out[key] = String(source[key] || '').trim();
  }
  if (has('allowedIPs')) {
    out.allowedIPs = Array.isArray(source.allowedIPs)
      ? source.allowedIPs
      : String(source.allowedIPs || '').split(',').map(v => v.trim()).filter(Boolean);
  }
  if (has('keepAlive')) out.keepAlive = Math.max(0, Number(source.keepAlive || 0));
  return out;
}

function getDefaultClientFlowForInbound(inbound) {
  if (!inbound) return '';
  const protocol = normalizeInboundProtocol(inbound.protocol || 'vless');
  const stream = safeParseJsonField(inbound.streamSettings, {});
  const network = normalizeInboundNetwork(stream.network || 'raw');
  const security = String(stream.security || '').toLowerCase();
  if (protocol === 'vless' && security === 'reality' && ['raw', 'tcp'].includes(network)) return 'xtls-rprx-vision';
  return '';
}

function normalizeClientFlowForInbound(node, client) {
  const inbound = getCachedInbound(node);
  if (!inbound) return client;

  // H1Cloud owns the inbound. Never infer or force Vision from transport/security:
  // use exactly the flow already present in the provider inbound template. If the
  // provider did not set flow, keep it empty.
  if (isH1Cloud3xuiNode(node)) {
    const settings = safeParseJsonField(inbound.settings, {});
    const providerFlow = pickClientFlow(settings, String(client?.id || ''), '');
    client.flow = String(client.flow || providerFlow || '').trim();
    return client;
  }

  const protocol = normalizeInboundProtocol(inbound.protocol || 'vless');
  const settings = safeParseJsonField(inbound.settings, {});
  const stream = safeParseJsonField(inbound.streamSettings, {});
  const network = normalizeInboundNetwork(stream.network || 'raw');
  const security = String(stream.security || '').toLowerCase();
  const vlessEncryption = String(settings.encryption || settings.decryption || '').trim().toLowerCase();
  const hasVlessEncryption = !!vlessEncryption && vlessEncryption !== 'none';
  const allowsVisionFlow = protocol === 'vless' && (
    (network === 'raw' && ['tls', 'reality'].includes(security)) ||
    (network === 'xhttp' && hasVlessEncryption)
  );
  if (allowsVisionFlow) {
    client.flow = String(client.flow || getDefaultClientFlowForInbound(inbound) || '').trim();
  } else if (client.flow !== undefined) {
    delete client.flow;
  }
  return client;
}

function legacyPayloadToClientCreatePayload(node, payload) {
  const client = normalizeClientFlowForInbound(node, normalizeClientFor3xuiV3(extractLegacyClientFromPayload(payload)));
  return { client, inboundIds: [Number(node.inbound_id || payload?.id)].filter(Boolean) };
}

function legacyPayloadToClientUpdatePayload(payload, node = null) {
  const client = normalizeClientFor3xuiV3(extractLegacyClientFromPayload(payload));
  return node ? normalizeClientFlowForInbound(node, client) : client;
}

function getClientEmailFromLegacyPayload(payload, fallback = '') {
  const client = legacyPayloadToClientUpdatePayload(payload);
  return String(client.email || fallback || '').trim();
}

async function addClientViaNewApi(node, payload) {
  const body = legacyPayloadToClientCreatePayload(node, payload);
  if (!body.client.email) throw new Error('Не указан email/login клиента для нового API 3x-ui.');
  if (!body.inboundIds.length) throw new Error('Не выбран inbound для нового API 3x-ui.');
  return apiPost(node, '/panel/api/clients/add', body, false);
}

async function updateClientViaNewApi(node, clientUuidOrEmail, payload) {
  const requested = normalizeClientPatchFor3xuiV3(extractLegacyClientFromPayload(payload));
  const originalIdentifier = String(clientUuidOrEmail || '').trim();
  const requestedEmail = String(requested.email || '').trim();
  if (!originalIdentifier && !requestedEmail) throw new Error('Не найден UUID или email/login клиента для обновления через новый API 3x-ui.');

  // Legacy callers pass the UUID, while the current first-class Clients API
  // updates by the *current email*. Resolve the full row by either identifier
  // first; using the UUID as /clients/get/:email caused false "полная запись не
  // найдена" errors and cancelled otherwise valid updates.
  // Normal updates keep the email unchanged, so try the direct email hydrate
  // first. UUID lookup is the fallback needed for email renames.
  let current = requestedEmail ? await findClientViaNewApi(node, requestedEmail) : null;
  if (!current && originalIdentifier && !sameText(requestedEmail, originalIdentifier)) {
    current = await findClientViaNewApi(node, originalIdentifier);
  }
  if (!current) {
    const shown = requestedEmail || originalIdentifier;
    throw new Error(`3x-ui не вернул полную запись клиента ${shown}; безопасное обновление отменено. Проверь API Token и доступность /panel/api/clients/get/:email.`);
  }

  const lookupEmail = String(current.email || requestedEmail || '').trim();
  const email = String(requestedEmail || current.email || '').trim();
  if (!lookupEmail || !email) throw new Error('3x-ui вернул запись клиента без email/login; обновление отменено.');

  const client = normalizeClientFlowForInbound(node, normalizeClientFor3xuiV3({ ...current, ...requested, email }));
  for (const key of ['recordId', 'inboundIds', 'inboundTags', 'traffic', 'externalLinks']) delete client[key];
  return apiPost(node, `/panel/api/clients/update/${encodeURIComponent(lookupEmail)}`, client, false);
}

async function attachClientViaNewApi(node, email, inboundIds = null) {
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) throw new Error('Не найден email/login клиента для привязки к inbound.');
  const ids = (Array.isArray(inboundIds) ? inboundIds : [Number(node.inbound_id || 0)])
    .map(Number)
    .filter(id => Number.isInteger(id) && id > 0);
  if (!ids.length) throw new Error('Не выбран inbound для привязки клиента.');
  return apiPost(node, `/panel/api/clients/${encodeURIComponent(cleanEmail)}/attach`, { inboundIds: ids }, false);
}

function isClientLinkedToInbound(row, node) {
  if (!row) return false;
  return rowMatchesInbound(row, Number(node?.inbound_id || 0), node);
}

async function findClientViaNewApi(node, identifier, timeoutMs = NODE_API_TIMEOUT_MS) {
  const cleanIdentifier = String(identifier || '').trim();
  const wanted = cleanIdentifier.toLowerCase();
  if (!wanted) return null;
  let endpointWorked = false;
  let lastError = null;
  let slimCandidate = null;

  const matches = row => {
    if (!row) return false;
    const email = String(row.email || '').trim().toLowerCase();
    const uuid = String(row.uuid || row.id || '').trim().toLowerCase();
    return email === wanted || uuid === wanted;
  };

  // Direct lookup is email-based in current 3x-ui. It is still attempted for
  // every identifier because some forks also accept UUIDs. The hydrate payload
  // is { client, inboundIds, externalLinks }; normalize3xuiV3ClientRow unwraps
  // the nested `client` object and preserves linked inbound ids.
  for (const directPath of [
    `/panel/api/clients/get/${encodeURIComponent(cleanIdentifier)}`,
    `/panel/api/clients/${encodeURIComponent(cleanIdentifier)}`
  ]) {
    try {
      const data = await apiGet(node, directPath, timeoutMs);
      endpointWorked = true;
      const root = data?.obj ?? data?.data ?? data?.result ?? data;
      const candidate = root && typeof root === 'object' && !Array.isArray(root)
        ? normalize3xuiV3ClientRow(root)
        : null;
      if (candidate && matches(candidate)) return candidate;
    } catch (err) {
      lastError = err;
      if (!isMissingApiEndpointError(err) && !isRemoteEntityMissingError(err)) throw err;
    }
  }

  // Prefer the full list before the paged list. /list contains credentials;
  // /list/paged intentionally omits uuid/password/auth/flow/security.
  try {
    const data = await apiGet(node, '/panel/api/clients/list', timeoutMs);
    endpointWorked = true;
    const match = extract3xuiClientRowsFromResponse(data)
      .map(normalize3xuiV3ClientRow)
      .find(matches);
    if (match) return match;
  } catch (err) {
    lastError = err;
  }

  for (const basePath of ['/panel/api/clients/list/paged', '/panel/api/clients/paged']) {
    try {
      for (let page = 1; page <= 20; page += 1) {
        const qs = new URLSearchParams({ page: String(page), pageSize: '200', sort: 'createdAt', order: 'desc' });
        const data = await apiGet(node, `${basePath}?${qs.toString()}`, timeoutMs);
        endpointWorked = true;
        const rows = extract3xuiClientRowsFromResponse(data).map(normalize3xuiV3ClientRow);
        const match = rows.find(matches);
        if (match) {
          slimCandidate = match;
          // A fork may include credentials even in the paged row. Use it only
          // when it actually contains a protocol credential; otherwise a
          // replacement update could clear fields omitted by the slim endpoint.
          if (match.id || match.password || match.auth || match.secret || match.privateKey) return match;
          break;
        }
        const root = data?.obj ?? data?.data ?? data?.result ?? data;
        const total = Number(root?.total ?? root?.totalCount ?? root?.count ?? 0);
        if (!rows.length || rows.length < 200 || (total > 0 && page * 200 >= total)) break;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (slimCandidate) return null;
  if (!endpointWorked && lastError) throw lastError;
  return null;
}


async function verifyClientRemovedViaNewApi(node, email, timeoutMs = NODE_API_TIMEOUT_MS) {
  try {
    const existing = await findClientViaNewApi(node, email, timeoutMs);
    return existing ? false : true;
  } catch (err) {
    // Старые/нестандартные сборки могут иметь delete endpoint без list/paged.
    // В этом случае успешный ответ удаления остаётся источником истины.
    if (isMissingApiEndpointError(err)) return null;
    throw err;
  }
}

async function deleteLegacyInboundClient(node, clientUuid, email, timeoutMs = CLIENT_DELETE_TIMEOUT_MS) {
  const inboundId = Number(node?.inbound_id || 0);
  if (!inboundId) throw new Error('У узла не указан Inbound ID.');
  const uuid = String(clientUuid || '').trim();
  const cleanEmail = String(email || '').trim();
  let lastError = null;

  if (uuid) {
    try {
      return await apiPost(node, `/panel/api/inbounds/${inboundId}/delClient/${encodeURIComponent(uuid)}`, {}, true, timeoutMs);
    } catch (err) {
      if (isRemoteEntityMissingError(err)) return { success: true, alreadyMissing: true };
      lastError = err;
      if (isNodeFastFailError(err)) throw err;
    }
  }
  if (cleanEmail) {
    try {
      return await apiPost(node, `/panel/api/inbounds/${inboundId}/delClientByEmail/${encodeURIComponent(cleanEmail)}`, {}, true, timeoutMs);
    } catch (err) {
      if (isRemoteEntityMissingError(err)) return { success: true, alreadyMissing: true };
      lastError = err;
      if (isNodeFastFailError(err)) throw err;
    }
  }
  throw lastError || new Error('Не найден UUID/email клиента для удаления из inbound.');
}

async function deleteH1Cloud3xuiClientViaNewApi(node, email, timeoutMs = CLIENT_DELETE_TIMEOUT_MS) {
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) throw new Error('Не найден email/login клиента для удаления из H1Cloud 3x-ui.');

  // Provider-managed H1Cloud panels use the global v3 Clients database as the
  // source of truth. Never call legacy inbound delClient first: that can leave
  // a global/inbound mismatch and reproduce the same `record not found` state.
  let lastError = null;
  const attempts = [
    () => apiPost(node, `/panel/api/clients/del/${encodeURIComponent(cleanEmail)}`, {}, false, timeoutMs),
    () => apiPost(node, '/panel/api/clients/bulkDel', { emails: [cleanEmail], keepTraffic: false }, false, timeoutMs)
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      const removed = await verifyClientRemovedViaNewApi(node, cleanEmail, timeoutMs);
      if (removed === false) {
        lastError = new Error(`${getNodePublicName(node)}: клиент ${cleanEmail} остался в глобальном списке 3x-ui после удаления.`);
        continue;
      }
      return result || { success: true, verified: removed === true };
    } catch (err) {
      if (isRemoteEntityMissingError(err)) return { success: true, alreadyMissing: true };
      lastError = err;
      if (isNodeFastFailError(err)) break;
    }
  }
  throw lastError || new Error(`${getNodePublicName(node)}: удалённая панель не подтвердила удаление клиента ${cleanEmail}.`);
}

async function deleteClientViaNewApi(node, email, clientUuid = '', timeoutMs = CLIENT_DELETE_TIMEOUT_MS) {
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) throw new Error('Не найден email/login клиента для удаления через новый API 3x-ui.');

  // Начиная с 3x-ui v3 detach только отвязывает клиента от inbound, но оставляет
  // глобальную запись. Для полного удаления нужен clients/del/:email.
  let legacyRemoved = false;
  let lastError = null;
  try {
    await deleteLegacyInboundClient(node, clientUuid, cleanEmail, timeoutMs);
    legacyRemoved = true;
  } catch (err) {
    lastError = err;
    if (isNodeFastFailError(err)) throw err;
  }

  const fullDeleteAttempts = [
    () => apiPost(node, `/panel/api/clients/del/${encodeURIComponent(cleanEmail)}`, {}, false, timeoutMs),
    () => apiPost(node, '/panel/api/clients/bulkDel', { emails: [cleanEmail] }, false, timeoutMs),
    () => apiDelete(node, `/panel/api/clients/${encodeURIComponent(cleanEmail)}`, null, timeoutMs)
  ];

  for (const attempt of fullDeleteAttempts) {
    try {
      const result = await attempt();
      const removed = await verifyClientRemovedViaNewApi(node, cleanEmail, timeoutMs);
      if (removed === false) {
        lastError = new Error(`${getNodePublicName(node)}: клиент ${cleanEmail} остался в глобальном списке 3x-ui после команды удаления.`);
        continue;
      }
      return result || { success: true, verified: removed === true };
    } catch (err) {
      if (isRemoteEntityMissingError(err)) {
        // Если клиент уже исчез из глобальной таблицы, удаление идемпотентно.
        return { success: true, alreadyMissing: true };
      }
      lastError = err;
      if (isNodeFastFailError(err)) break;
    }
  }

  // Некоторые сборки требуют сначала отвязать клиента, затем удалить запись.
  try {
    await apiPost(node, `/panel/api/clients/${encodeURIComponent(cleanEmail)}/detach`, { inboundIds: [Number(node.inbound_id)].filter(Boolean) }, false, timeoutMs);
  } catch (err) {
    if (isNodeFastFailError(err)) throw err;
    if (!isRemoteEntityMissingError(err) && !isMissingApiEndpointError(err)) lastError = err;
  }

  for (const attempt of fullDeleteAttempts.slice(0, 2)) {
    try {
      const result = await attempt();
      const removed = await verifyClientRemovedViaNewApi(node, cleanEmail, timeoutMs);
      if (removed === false) {
        lastError = new Error(`${getNodePublicName(node)}: клиент ${cleanEmail} остался в глобальном списке 3x-ui после повторного удаления.`);
        continue;
      }
      return result || { success: true, verified: removed === true };
    } catch (err) {
      if (isRemoteEntityMissingError(err)) return { success: true, alreadyMissing: true };
      lastError = err;
      if (isNodeFastFailError(err)) break;
    }
  }

  // На старой панели глобального clients API может не быть; если реальный клиент
  // из inbound удалён, этого достаточно. На v3 без подтверждённого удаления не
  // стираем локальную запись, чтобы администратор мог повторить операцию.
  if (legacyRemoved && fullDeleteAttempts.every(Boolean) && isMissingApiEndpointError(lastError)) {
    return { success: true, legacyOnly: true };
  }
  throw lastError || new Error(`${getNodePublicName(node)}: удалённая панель не подтвердила удаление клиента ${cleanEmail}.`);
}

async function addClient(node, payload) {
  // Provider-managed H1Cloud 3x-ui panels run the v3 global Clients model.
  // Never fall back to the legacy inbound append endpoint: it can create a
  // client in settings.clients without a matching DB record, after which the
  // panel answers `record not found` and may show duplicates.
  if (isH1Cloud3xuiNode(node)) {
    try { return await addClientViaNewApi(node, payload); }
    catch (err) { throw enrich3xuiError(node, err, payload); }
  }

  if (is3xuiV3Mode(node)) {
    try { return await addClientViaNewApi(node, payload); }
    catch (err) { if (!isMissingApiEndpointError(err)) throw enrich3xuiError(node, err, payload); }
  }

  try {
    return await apiPost(node, '/panel/api/inbounds/addClient', payload, true);
  } catch (err) {
    const enriched = enrich3xuiError(node, err, payload);
    if (shouldFallbackToClientApi(enriched)) {
      try { return await addClientViaNewApi(node, payload); }
      catch (err2) { throw enrich3xuiError(node, err2, payload); }
    }
    throw enriched;
  }
}

async function updateClient(node, clientUuid, payload) {
  if (isH1Cloud3xuiNode(node)) {
    throw new Error('H1Cloud 3x-ui: полное обновление записи клиента заблокировано. Используется только защищённое изменение явно выбранных клиентских полей.');
  }

  if (is3xuiV3Mode(node)) {
    try { return await updateClientViaNewApi(node, clientUuid, payload); }
    catch (err) { if (!isMissingApiEndpointError(err)) throw enrich3xuiError(node, err, payload); }
  }

  try {
    return await apiPost(node, `/panel/api/inbounds/updateClient/${encodeURIComponent(clientUuid)}`, payload, true);
  } catch (err) {
    const enriched = enrich3xuiError(node, err, payload);
    if (shouldFallbackToClientApi(enriched)) {
      try { return await updateClientViaNewApi(node, clientUuid, payload); }
      catch (err2) { throw enrich3xuiError(node, err2, payload); }
    }
    throw enriched;
  }
}

async function deleteClient(node, clientUuid, email, timeoutMs = CLIENT_DELETE_TIMEOUT_MS) {
  if (isRemnawaveNode(node)) return deleteRemnawaveUser(node, clientUuid, email, timeoutMs);
  if (isH1CloudNode(node)) return deleteH1CloudClient(node, clientUuid, email, timeoutMs);
  if (isH1Cloud3xuiNode(node)) {
    try { return await deleteH1Cloud3xuiClientViaNewApi(node, email || clientUuid, timeoutMs); }
    catch (err) { throw enrich3xuiError(node, err); }
  }
  if (is3xuiV3Mode(node)) {
    try { return await deleteClientViaNewApi(node, email || clientUuid, clientUuid, timeoutMs); }
    catch (err) { throw enrich3xuiError(node, err); }
  }

  try {
    return await deleteLegacyInboundClient(node, clientUuid, email, timeoutMs);
  } catch (err) {
    const enriched = enrich3xuiError(node, err);
    if (shouldFallbackToClientApi(enriched)) {
      try { return await deleteClientViaNewApi(node, email || clientUuid, clientUuid, timeoutMs); }
      catch (err2) { throw enrich3xuiError(node, err2); }
    }
    throw enriched;
  }
}

async function deleteClientFromSpecificNode(node, clientUuid, email, timeoutMs = CLIENT_DELETE_TIMEOUT_MS) {
  if (isRemnawaveNode(node)) return detachRemnawaveUserFromNode(node, clientUuid, email, timeoutMs);
  if (isH1CloudNode(node)) {
    return deleteH1CloudClient(node, clientUuid, email, timeoutMs);
  }

  const cleanEmail = String(email || '').trim();
  if (!is3xuiV3Mode(node)) {
    return deleteLegacyInboundClient(node, clientUuid, cleanEmail, timeoutMs);
  }

  let current = null;
  for (const identifier of uniqueList([cleanEmail, clientUuid].map(value => String(value || '').trim()).filter(Boolean))) {
    try {
      current = await findClientViaNewApi(node, identifier, timeoutMs);
      if (current) break;
    } catch (err) {
      if (isNodeFastFailError(err)) throw err;
    }
  }

  const resolvedEmail = String(current?.email || cleanEmail).trim();
  if (!resolvedEmail) throw new Error('Не найден email/login клиента для удаления из выбранного inbound.');
  const inboundIds = [Number(node.inbound_id)].filter(id => Number.isInteger(id) && id > 0);
  if (!inboundIds.length) throw new Error('У выбранного узла не указан Inbound ID.');

  let detached = false;
  try {
    await apiPost(node, `/panel/api/clients/${encodeURIComponent(resolvedEmail)}/detach`, { inboundIds }, false, timeoutMs);
    detached = true;
  } catch (err) {
    if (isRemoteEntityMissingError(err)) return { success: true, alreadyMissing: true };
    if (isNodeFastFailError(err)) throw err;
    if (!isMissingApiEndpointError(err)) throw err;
    await deleteLegacyInboundClient(node, clientUuid || current?.id, resolvedEmail, timeoutMs);
    detached = true;
  }

  let fresh = null;
  try {
    fresh = await findClientViaNewApi(node, resolvedEmail, timeoutMs);
  } catch (err) {
    if (isNodeFastFailError(err)) throw err;
    if (!isMissingApiEndpointError(err)) throw err;
  }

  if (fresh && isClientLinkedToInbound(fresh, node)) {
    throw new Error(`${getNodePublicName(node)}: 3x-ui не подтвердила отвязку клиента ${resolvedEmail} от inbound ${node.inbound_id}.`);
  }

  // If this was the client's last inbound on the panel, remove the now-unused
  // global row as a best-effort cleanup. Failure here does not restore access
  // on the selected node, so the node-scoped removal itself is still valid.
  const remainingInboundIds = fresh ? extractLinkedInboundValues(fresh).inboundIds.map(Number).filter(id => id > 0) : [];
  let globalDeleted = false;
  let cleanupWarning = '';
  if (fresh && remainingInboundIds.length === 0) {
    try {
      await apiPost(node, `/panel/api/clients/del/${encodeURIComponent(resolvedEmail)}`, {}, false, timeoutMs);
      globalDeleted = true;
    } catch (err) {
      if (!isRemoteEntityMissingError(err)) cleanupWarning = String(err?.message || err || 'не удалось удалить глобальную запись');
      else globalDeleted = true;
    }
  }

  return { success: true, detached, globalDeleted, cleanupWarning };
}

function extract3xuiPanelVersion(statusData) {
  const root = statusData?.obj ?? statusData?.data ?? statusData ?? {};
  return String(root?.version || root?.panelVersion || root?.panel_version || '').trim();
}

async function getInboundForNodeHealthCheck(node, timeoutMs = NODE_API_TIMEOUT_MS) {
  try {
    return await getInbound(node, timeoutMs);
  } catch (err) {
    // Current 3x-ui exposes /get/:id. Only use list fallbacks for genuinely
    // older/non-standard builds. v3.4.0 also provides /list/slim, which avoids
    // serialising every client and prevents timeouts on large panels.
    if (!isMissingApiEndpointError(err)) throw err;
  }

  let lastError = null;
  for (const endpoint of ['/panel/api/inbounds/list/slim', '/panel/api/inbounds/list']) {
    try {
      const data = await apiGet(node, endpoint, timeoutMs);
      const rows = data?.obj ?? data?.data ?? data;
      const list = Array.isArray(rows) ? rows : [];
      const inbound = list.find(row => Number(row?.id) === Number(node.inbound_id));
      if (!inbound) {
        const notFound = new Error(`Inbound ID ${node.inbound_id} не найден в удалённой 3x-ui.`);
        notFound.code = 'INBOUND_NOT_FOUND';
        throw notFound;
      }
      saveInboundCache(node, inbound);
      return inbound;
    } catch (err) {
      lastError = err;
      if (!isMissingApiEndpointError(err)) throw err;
    }
  }
  throw lastError || new Error(`Inbound ID ${node.inbound_id} не удалось загрузить.`);
}

async function checkNode(node, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || NODE_API_TIMEOUT_MS));
  const lightweight = options.lightweight === true;
  try {
    let panelVersion = '';
    let providerInfo = null;
    if (isRemnawaveNode(node)) {
      providerInfo = await checkRemnawaveApi(node, timeoutMs);
    } else if (isH1CloudNode(node)) {
      await h1CloudGetStatus(node, timeoutMs);
    } else {
      const statusData = await apiGet(node, '/panel/api/server/status', timeoutMs);
      panelVersion = extract3xuiPanelVersion(statusData);
      if (!lightweight) await getInboundForNodeHealthCheck(node, timeoutMs);
    }

    db.prepare('UPDATE nodes SET last_status = ?, last_error = ? WHERE id = ?')
      .run('online', '', node.id);

    return { ok: true, status: 'online', panelVersion, providerInfo };
  } catch (err) {
    const enriched = (isH1CloudNode(node) || isRemnawaveNode(node)) ? err : enrich3xuiError(node, err);
    const errorText = String(enriched?.message || enriched || 'unknown error');
    db.prepare('UPDATE nodes SET last_status = ?, last_error = ? WHERE id = ?')
      .run('offline', errorText, node.id);

    return { ok: false, status: 'offline', error: errorText };
  }
}

function decodeMaybeBase64Subscription(text) {
  const raw = String(text || '').trim();

  if (!raw) return '';
  if (raw.includes('://')) return raw;

  try {
    const normalized = raw.replace(/\s+/g, '');
    const decoded = Buffer.from(normalized, 'base64').toString('utf8').trim();
    if (decoded.includes('://')) return decoded;
  } catch (_) {}

  return raw;
}

async function fetchSubscriptionLines(url, options = {}) {
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'text/plain,*/*',
      ...(options.headers || {})
    },
    redirect: 'follow',
    agent: options.agent
  }, options.timeoutMs || FETCH_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Failed to fetch subscription (${response.status})`);
  }

  const text = decodeMaybeBase64Subscription(await response.text());

  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => (
      line.startsWith('vless://') ||
      line.startsWith('vmess://') ||
      line.startsWith('trojan://') ||
      line.startsWith('ss://') ||
      line.startsWith('hysteria://') ||
      line.startsWith('hy2://') ||
      line.startsWith('tuic://')
    ));
}

function clientHasActiveH1CloudSubscription(clientId) {
  return Boolean(db.prepare(`
    SELECT 1
    FROM client_nodes cn
    JOIN nodes n ON n.id = cn.node_id
    WHERE cn.client_id = ?
      AND n.node_type IN (?, ?)
      AND n.enabled = 1
      AND cn.enabled = 1
    LIMIT 1
  `).get(Number(clientId), NODE_TYPE_H1CLOUD, NODE_TYPE_H1CLOUD_3XUI));
}


const REDIRECT_RULES_FILE = path.join(DATA_DIR, 'redirect_rules.json');
const REDIRECT_STATUS_FILE = path.join(DATA_DIR, 'redirect_status.json');
const REDIRECT_HOST_IPS_FILE = path.join(DATA_DIR, 'redirect_host_ips.json');

function normalizeRedirectProtocol(value) {
  const proto = String(value || 'tcp').toLowerCase().trim();
  return ['tcp', 'udp', 'both'].includes(proto) ? proto : 'tcp';
}

function isValidIpv4(value) {
  const parts = String(value || '').trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function isPrivateOrServiceIpv4(value) {
  if (!isValidIpv4(value)) return true;
  const [a, b] = String(value).split('.').map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  return false;
}

function readJsonFileSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJsonFileSafe(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function getRedirectRules(includeDisabled = true) {
  const rows = db.prepare(`
    SELECT rr.*, n.name, n.country_code, n.country_name_ru, n.country_flag, n.label_suffix, n.panel_url, n.inbound_id, n.enabled AS node_enabled
    FROM redirect_rules rr
    JOIN nodes n ON n.id = rr.node_id
    ${includeDisabled ? '' : 'WHERE rr.enabled = 1'}
    ORDER BY rr.enabled DESC, rr.updated_at DESC, rr.id DESC
  `).all();
  return rows.map(row => ({
    ...row,
    nodeLabel: getNodeDisplayName(row),
    nodeDisplayName: getNodePublicName(row),
    metrics: safeParseJsonField(row.metrics_json, {})
  }));
}

function getRedirectStatus() {
  const status = readJsonFileSafe(REDIRECT_STATUS_FILE, { ok: false, message: 'Статус helper пока не создан', rules: [], updatedAt: null });
  try {
    if (fs.existsSync(REDIRECT_RULES_FILE) && fs.existsSync(REDIRECT_STATUS_FILE)) {
      const rulesMtime = fs.statSync(REDIRECT_RULES_FILE).mtimeMs;
      const statusMtime = fs.statSync(REDIRECT_STATUS_FILE).mtimeMs;
      status.stale = rulesMtime > statusMtime + 1000;
      if (status.stale) {
        status.staleMessage = 'Правила сохранены позже последнего запуска helper. Подожди несколько секунд или перезапусти helper.';
      }
    }
  } catch (_) {}
  return status;
}

function getDetectedHostIps() {
  const fromHelper = readJsonFileSafe(REDIRECT_HOST_IPS_FILE, []);
  const helperIps = Array.isArray(fromHelper) ? fromHelper.filter(isValidIpv4) : [];
  const envIps = String(process.env.REDIRECT_BIND_IPS || INSTALL_BIND_IP || '')
    .split(/[,;\s]+/).map(v => v.trim()).filter(isValidIpv4);
  const osIps = [];
  try {
    const nets = os.networkInterfaces();
    for (const entries of Object.values(nets)) {
      for (const item of entries || []) {
        if (item.family === 'IPv4' && !item.internal && isValidIpv4(item.address)) osIps.push(item.address);
      }
    }
  } catch (_) {}
  const all = [...new Set([...envIps, ...helperIps, ...osIps])];
  const publicIps = all.filter(ip => !isPrivateOrServiceIpv4(ip));
  const showPrivate = String(process.env.REDIRECT_SHOW_PRIVATE_IPS || '').trim() === '1';
  if (showPrivate) return all;
  return publicIps.length ? publicIps : all;
}

function getRedirectReplacementHost(nodeId, fallbackHost) {
  const row = db.prepare(`
    SELECT bind_ip FROM redirect_rules
    WHERE node_id = ? AND enabled = 1 AND rewrite_enabled = 1
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get(Number(nodeId));
  return row?.bind_ip || fallbackHost;
}

function getNodeTargetHost(node) {
  try { return new URL(node.panel_url).hostname; } catch (_) { return ''; }
}

function getNodeInboundPort(node, inbound = null) {
  const fromInbound = Number(inbound?.port || 0);
  if (Number.isInteger(fromInbound) && fromInbound > 0 && fromInbound <= 65535) return fromInbound;
  try {
    const parsed = new URL(node.panel_url);
    const fromUrl = Number(parsed.port || 0);
    if (Number.isInteger(fromUrl) && fromUrl > 0 && fromUrl <= 65535) return fromUrl;
  } catch (_) {}
  return 443;
}

function getRedirectTargetPort(node, inbound = null) {
  const fromInbound = Number(inbound?.port || 0);
  if (Number.isInteger(fromInbound) && fromInbound > 0 && fromInbound <= 65535) return fromInbound;
  return 0;
}

const RESERVED_PANEL_PORTS = new Set([80, 443]);

function normalizePortNumber(value) {
  const port = Number(value || 0);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 0;
}

function assertReservedPanelPortFree(port, context = 'Порт') {
  const p = normalizePortNumber(port);
  if (!p) throw new Error(`${context}: порт должен быть от 1 до 65535.`);
  if (RESERVED_PANEL_PORTS.has(p)) {
    throw new Error(`${context}: порт ${p} запрещён. Порты 80 и 443 зарезервированы под вход в панель/Caddy. Выбери другой порт.`);
  }
  return p;
}

function collectKnownNodeInboundPorts(exceptNodeId = 0) {
  const rows = db.prepare('SELECT * FROM nodes').all();
  const result = [];
  for (const row of rows) {
    if (Number(row.id) === Number(exceptNodeId || 0)) continue;
    const inbound = getCachedInbound(row);
    const port = normalizePortNumber(inbound?.port || 0);
    if (port) result.push({ port, label: getNodePublicName(row), nodeId: Number(row.id) });
  }
  return result;
}

function assertInboundPortAllowed(port, exceptNodeId = 0) {
  const p = assertReservedPanelPortFree(port, 'Inbound узла');
  const sameNodePort = collectKnownNodeInboundPorts(exceptNodeId).find(item => Number(item.port) === p);
  if (sameNodePort) {
    throw new Error(`Inbound узла: порт ${p} уже используется узлом «${sameNodePort.label}». Выбери свободный порт.`);
  }
  const redirect = db.prepare(`
    SELECT rr.*, n.name, n.country_name_ru, n.label_suffix
    FROM redirect_rules rr
    LEFT JOIN nodes n ON n.id = rr.node_id
    WHERE rr.enabled = 1
      AND rr.target_port = ?
      AND rr.node_id != ?
    ORDER BY rr.updated_at DESC, rr.id DESC
    LIMIT 1
  `).get(p, Number(exceptNodeId || 0));
  if (redirect) {
    throw new Error(`Inbound узла: порт ${p} уже используется активным перенаправлением для «${getNodePublicName(redirect)}». Сначала измени или удали правило перенаправления.`);
  }
  return p;
}

function assertRedirectListenPortAllowed(bindIp, port, protocol, exceptNodeId = 0) {
  const p = assertReservedPanelPortFree(port, 'Перенаправление');
  const proto = normalizeRedirectProtocol(protocol || 'tcp');
  const conflicts = db.prepare(`
    SELECT rr.*, n.name, n.country_name_ru, n.label_suffix
    FROM redirect_rules rr
    LEFT JOIN nodes n ON n.id = rr.node_id
    WHERE rr.enabled = 1
      AND rr.bind_ip = ?
      AND rr.target_port = ?
      AND rr.node_id != ?
      AND (rr.protocol = ? OR rr.protocol = 'both' OR ? = 'both')
    ORDER BY rr.updated_at DESC, rr.id DESC
  `).all(String(bindIp || ''), p, Number(exceptNodeId || 0), proto, proto);
  if (conflicts.length) {
    const first = conflicts[0];
    throw new Error(`Перенаправление: порт ${p}/${proto.toUpperCase()} на IP ${bindIp} уже занят правилом для «${getNodePublicName(first)}». Удали старое правило или выбери другой порт inbound.`);
  }
  const nodeConflict = collectKnownNodeInboundPorts(exceptNodeId).find(item => Number(item.port) === p);
  if (nodeConflict) {
    throw new Error(`Перенаправление: порт ${p} уже используется узлом «${nodeConflict.label}». Нельзя повесить два назначения на один порт.`);
  }
  return p;
}

function serializeRedirectDesiredState() {
  const rules = db.prepare(`
    SELECT rr.id, rr.bind_ip, rr.node_id, rr.target_host, rr.target_port, rr.protocol, rr.rewrite_enabled, rr.enabled,
           n.country_name_ru, n.name, n.label_suffix
    FROM redirect_rules rr
    JOIN nodes n ON n.id = rr.node_id
    WHERE rr.enabled = 1
    ORDER BY rr.id ASC
  `).all().map(row => ({
    id: Number(row.id),
    bind_ip: String(row.bind_ip || ''),
    node_id: Number(row.node_id),
    target_host: String(row.target_host || ''),
    target_port: Number(row.target_port || 0),
    protocol: normalizeRedirectProtocol(row.protocol),
    rewrite_enabled: Number(row.rewrite_enabled) === 1,
    label: getNodePublicName(row)
  })).filter(r => isValidIpv4(r.bind_ip) && r.target_host && r.target_port > 0);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    appDir: APP_DIR_HINT,
    rules
  };
}

function exportRedirectRulesForHelper() {
  const desired = serializeRedirectDesiredState();
  writeJsonFileSafe(REDIRECT_RULES_FILE, desired);
  return desired;
}

function updateRedirectRulesFromStatus() {
  const status = getRedirectStatus();
  const rules = Array.isArray(status.rules) ? status.rules : [];
  const update = db.prepare(`UPDATE redirect_rules SET last_status = ?, last_error = ?, metrics_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
  for (const rule of rules) {
    if (!rule || !rule.id) continue;
    update.run(rule.status || (status.ok ? 'active' : 'error'), rule.error || '', JSON.stringify(rule.metrics || {}), Number(rule.id));
  }
}


function tcpProbe(host, port, timeoutMs = 3000) {
  return new Promise(resolve => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const done = (ok, message) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch (_) {}
      resolve({ ok, message, latencyMs: Date.now() - started });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true, 'OK'));
    socket.once('timeout', () => done(false, 'timeout'));
    socket.once('error', err => done(false, err.code || err.message || 'connection failed'));
    try { socket.connect(Number(port), String(host)); } catch (err) { done(false, err.message || String(err)); }
  });
}

function normalizeSniValue(value) {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
}

function getDefaultSniProfiles() {
  return [
    { name: 'VK Mobile', sni: 'm.vk.com', comment: 'Мобильный VK-кандидат' },
    { name: 'VK Main', sni: 'vk.com', comment: 'Основной VK-кандидат' },
    { name: 'MAX Web', sni: 'web.max.ru', comment: 'MAX web-кандидат' },
    { name: 'MAX Main', sni: 'max.ru', comment: 'MAX основной кандидат' },
    { name: 'MAX Static', sni: 'st.max.ru', comment: 'MAX static-кандидат' },
    { name: 'Yandex Browser', sni: 'browser.yandex.ru', comment: 'Яндекс.Браузер RU' },
    { name: 'Yandex Main', sni: 'yandex.ru', comment: 'Яндекс основной домен' },
    { name: 'Yandex Static', sni: 'yastatic.net', comment: 'Яндекс static/CDN' }
  ];
}

function seedDefaultSniProfiles() {
  const insert = db.prepare(`
    INSERT INTO sni_profiles (name, sni, comment, is_builtin, updated_at)
    VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(sni) DO UPDATE SET
      name = excluded.name,
      comment = CASE WHEN sni_profiles.is_builtin = 1 THEN excluded.comment ELSE sni_profiles.comment END,
      updated_at = CURRENT_TIMESTAMP
  `);
  for (const item of getDefaultSniProfiles()) insert.run(item.name, item.sni, item.comment || '');
}

function getSniProfiles() {
  try {
    return db.prepare('SELECT * FROM sni_profiles ORDER BY is_builtin DESC, name COLLATE NOCASE ASC, id ASC').all();
  } catch (_) { return []; }
}

function getSniProfileById(id) {
  const n = Number(id || 0);
  if (!n) return null;
  try { return db.prepare('SELECT * FROM sni_profiles WHERE id = ?').get(n) || null; } catch (_) { return null; }
}

function getNodeSniOverride(node) {
  const mode = String(node?.sni_mode || 'inbound');
  if (mode === 'manual') return normalizeSniValue(node?.sni_override || '');
  if (mode === 'profile') {
    const profile = getSniProfileById(node?.sni_profile_id);
    return normalizeSniValue(profile?.sni || '');
  }
  return '';
}

function getRealitySniFromStream(realitySettings = {}, realityInner = {}) {
  return normalizeSniValue(
    realityInner?.serverName ||
    realitySettings?.serverNames?.[0] ||
    realityInner?.serverNames?.[0] ||
    realitySettings?.serverName ||
    realitySettings?.targetSni ||
    realitySettings?.target ||
    realitySettings?.dest ||
    ''
  );
}

// Mirrors 3x-ui's current per-client SpiderX derivation. The inbound stores a
// seed; share links carry a deterministic path derived from that seed and the
// client's stable subscription id (falling back to email).
function deriveRealitySpiderX(seed, clientKey) {
  const cleanSeed = String(seed || '');
  const cleanKey = String(clientKey || '');
  if (!cleanSeed && !cleanKey) return '';
  return '/' + createHash('sha256').update(`${cleanSeed}|${cleanKey}`, 'utf8').digest('hex').slice(0, 15);
}

function getVlessEncryption(settings = {}) {
  const value = String(settings.encryption || 'none').trim();
  return value || 'none';
}

function hasVlessEncryption(settings = {}) {
  const isSet = value => {
    const clean = String(value || '').trim().toLowerCase();
    return clean !== '' && clean !== 'none';
  };
  return isSet(settings.encryption) || isSet(settings.decryption);
}

function canUseVlessVision(network, security, settings = {}) {
  const n = normalizeInboundNetwork(network || 'raw');
  const sec = String(security || 'none').trim().toLowerCase();
  return (n === 'raw' && (sec === 'tls' || sec === 'reality'))
    || (n === 'xhttp' && hasVlessEncryption(settings));
}

function getEffectiveNodeSni(node, realitySettings = {}, realityInner = {}) {
  return getNodeSniOverride(node) || getRealitySniFromStream(realitySettings, realityInner);
}

async function checkSniHost(sniValue, timeoutMs = 6000) {
  const host = normalizeSniValue(sniValue);
  if (!host || !/^[a-z0-9.-]+$/i.test(host) || !host.includes('.')) {
    throw new Error('Укажи корректный SNI-домен, например m.vk.com');
  }
  const started = Date.now();
  let addresses = [];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch (err) {
    throw new Error('DNS не найден: ' + (err.code || err.message || err));
  }
  return await new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: timeoutMs, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate(true) || {};
      const latencyMs = Date.now() - started;
      try { socket.end(); } catch (_) {}
      resolve({
        ok: true,
        host,
        latencyMs,
        addresses: addresses.map(a => a.address),
        authorized: socket.authorized,
        authorizationError: socket.authorizationError || '',
        subject: cert.subject ? Object.entries(cert.subject).map(([k, v]) => `${k}=${v}`).join(', ') : '',
        issuer: cert.issuer ? Object.entries(cert.issuer).map(([k, v]) => `${k}=${v}`).join(', ') : '',
        validFrom: cert.valid_from || '',
        validTo: cert.valid_to || '',
        altNames: String(cert.subjectaltname || '').replace(/DNS:/g, '').split(',').map(v => v.trim()).filter(Boolean).slice(0, 12)
      });
    });
    socket.setTimeout(timeoutMs, () => {
      try { socket.destroy(); } catch (_) {}
      reject(new Error('TLS timeout'));
    });
    socket.once('error', err => reject(new Error(err.code || err.message || 'TLS error')));
  });
}

function buildInboundRealityWarnings(inbound, node = null) {
  const warnings = [];
  const stream = safeParseJsonField(inbound?.streamSettings, {});
  const settings = safeParseJsonField(inbound?.settings, {});
  const reality = stream.realitySettings || {};
  const realityInner = reality.settings || {};
  const network = String(stream.network || 'tcp').toLowerCase();
  const security = String(stream.security || '').toLowerCase();
  const sni = getEffectiveNodeSni(node || {}, reality, realityInner);
  const pbk = realityInner.publicKey || reality.publicKey || '';
  const sid = reality.shortIds?.[0] || realityInner.shortIds?.[0] || reality.shortId || realityInner.shortId || '';
  const flow = settings.clients?.[0]?.flow || '';
  if (security === 'reality' || Object.keys(reality).length) {
    if (!sni) warnings.push('REALITY: пустой SNI/serverName.');
    if (!pbk) warnings.push('REALITY: нет publicKey.');
    if (!sid) warnings.push('REALITY: нет shortId.');
  }
  if (network === 'xhttp' && flow) warnings.push('XHTTP + flow обнаружен. Проверь совместимость: Vision-flow обычно нужен TCP/REALITY, а для XHTTP может быть лишним.');
  if (network === 'xhttp') {
    const xhttp = stream.xhttpSettings || {};
    if (!xhttp.path) warnings.push('XHTTP: не задан path.');
    if (!xhttp.mode) warnings.push('XHTTP: не задан mode.');
  }
  return warnings;
}

async function buildNodeConnectivityProbe(nodeId) {
  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(Number(nodeId || 0));
  if (!node) return null;
  let inbound = getCachedInbound(node);
  try { inbound = await getInboundFast(node); } catch (_) {}
  const targetHost = getNodeTargetHost(node);
  const targetPort = getRedirectTargetPort(node, inbound);
  const activeRule = db.prepare(`
    SELECT * FROM redirect_rules
    WHERE node_id = ? AND enabled = 1 AND rewrite_enabled = 1
    ORDER BY updated_at DESC, id DESC LIMIT 1
  `).get(Number(node.id));
  const redirectHost = activeRule?.bind_ip || '';
  const direct = targetHost && targetPort ? await tcpProbe(targetHost, targetPort, 4500) : { ok: false, message: 'нет host/port', latencyMs: 0 };
  const redirect = redirectHost && targetPort ? await tcpProbe(redirectHost, targetPort, 4500) : null;
  const stream = safeParseJsonField(inbound?.streamSettings, {});
  const reality = stream.realitySettings || {};
  const realityInner = reality.settings || {};
  const sni = getEffectiveNodeSni(node, reality, realityInner);
  let sniCheck = null;
  if (sni) {
    try { sniCheck = await checkSniHost(sni, 6000); }
    catch (err) { sniCheck = { ok: false, host: sni, error: err.message || String(err) }; }
  }
  return {
    generatedAt: new Date().toISOString(),
    node: { id: node.id, name: getNodePublicName(node), panelUrl: node.panel_url },
    inbound: inbound ? extractInboundEditorValues(inbound) : null,
    direct: { host: targetHost, port: targetPort, ...direct },
    redirect: redirect ? { host: redirectHost, label: activeRule?.bind_label || '', port: targetPort, protocol: activeRule?.protocol || '', ...redirect } : null,
    sni,
    sniCheck,
    warnings: inbound ? buildInboundRealityWarnings(inbound, node) : ['Inbound-кэш не найден. Сначала загрузи параметры узла из 3x-ui.']
  };
}

async function buildRedirectProbeResults(nodeIds = [], bindIp = '') {
  const ids = [...new Set((nodeIds || []).map(v => Number(v)).filter(Number.isFinite))];
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const nodes = db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...ids);
  const byId = new Map(nodes.map(n => [Number(n.id), n]));
  const results = [];
  for (const id of ids) {
    const node = byId.get(id);
    if (!node) continue;
    let inbound = getCachedInbound(node);
    try { inbound = await getInboundFast(node); } catch (_) {}
    const targetHost = getNodeTargetHost(node);
    const targetPort = getRedirectTargetPort(node, inbound);
    let probe = { ok: false, message: 'нет target host/port', latencyMs: 0 };
    if (targetHost && targetPort) probe = await tcpProbe(targetHost, targetPort, 3500);
    results.push({
      nodeId: id,
      nodeName: getNodePublicName(node),
      nodeLabel: getNodeDisplayName(node),
      countryCode: node.country_code || '',
      countryFlag: getNodeFlag(node),
      bindIp,
      targetHost,
      targetPort,
      ok: !!probe.ok,
      message: probe.message,
      latencyMs: probe.latencyMs
    });
  }
  return results;
}

function saveRedirectCheckReport(results) {
  const file = path.join(DATA_DIR, 'redirect_check_report.json');
  writeJsonFileSafe(file, { generatedAt: new Date().toISOString(), results: results || [] });
}

function getRedirectCheckReport() {
  const file = path.join(DATA_DIR, 'redirect_check_report.json');
  return readJsonFileSafe(file, { generatedAt: null, results: [] });
}



function getShareLinkProtocol(line) {
  const match = String(line || '').trim().match(/^([a-z][a-z0-9+.-]*):\/\//i);
  return match ? match[1].toLowerCase() : '';
}

function getShareLinkQueryParams(line) {
  const raw = String(line || '').trim();
  const hashIndex = raw.indexOf('#');
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = withoutHash.indexOf('?');
  if (queryIndex < 0) return new URLSearchParams();
  return new URLSearchParams(withoutHash.slice(queryIndex + 1));
}

function getShareLinkSecurity(line) {
  return String(getShareLinkQueryParams(line).get('security') || '').trim().toLowerCase();
}

function getShareLinkTransport(line) {
  const params = getShareLinkQueryParams(line);
  return String(params.get('type') || params.get('network') || params.get('transport') || '').trim().toLowerCase();
}

function classifyH1CloudShareLink(line) {
  if (getShareLinkProtocol(line) !== 'vless') return '';
  const security = getShareLinkSecurity(line);
  const transport = getShareLinkTransport(line);
  if (security === 'reality') return H1CLOUD_LINK_TYPE_REALITY;
  if (transport === 'xhttp') {
    return security === 'tls' ? H1CLOUD_LINK_TYPE_XHTTP_CDN : H1CLOUD_LINK_TYPE_XHTTP;
  }
  return '';
}

function isH1CloudShareLinkAllowed(line, linkTypes, legacyMode = H1CLOUD_LINK_MODE_VLESS_REALITY) {
  const type = classifyH1CloudShareLink(line);
  if (!type) return false;
  return normalizeH1CloudLinkTypes(linkTypes, legacyMode).includes(type);
}

function rewriteShareLinkQueryParam(line, key, value) {
  const raw = String(line || '').trim();
  if (!raw) return '';
  const hashIndex = raw.indexOf('#');
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const queryIndex = withoutHash.indexOf('?');
  const prefix = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const queryText = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';
  const params = new URLSearchParams(queryText);
  params.set(key, value);
  return `${prefix}?${params.toString()}${hash}`;
}

function applyH1CloudFingerprintToShareLink(line, fingerprint) {
  const fp = normalizeH1CloudFingerprint(fingerprint);
  if (!fp) return String(line || '').trim();
  if (getShareLinkProtocol(line) !== 'vless') return String(line || '').trim();
  return rewriteShareLinkQueryParam(line, 'fp', fp);
}

function decodeShareLinkQueryComponent(value) {
  try { return decodeURIComponent(String(value || '').replace(/\+/g, '%20')); }
  catch (_) { return String(value || ''); }
}

function sanitizeH1CloudXhttpExtra(extra, options = {}) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return null;
  const result = JSON.parse(JSON.stringify(extra));

  // H1Cloud share links currently use sessionPlacement/sessionKey. Keep those
  // names untouched in the mixed VLESS subscription, but translate them when
  // producing native Xray JSON, whose current fields are sessionIDPlacement
  // and sessionIDKey.
  if (options.normalizeSessionAliases === true) {
    if (result.sessionIDPlacement === undefined && result.sessionPlacement !== undefined) {
      result.sessionIDPlacement = result.sessionPlacement;
    }
    if (result.sessionIDKey === undefined && result.sessionKey !== undefined) {
      result.sessionIDKey = result.sessionKey;
    }
    if (result.sessionIDTable === undefined && result.sessionTable !== undefined) {
      result.sessionIDTable = result.sessionTable;
    }
    if (result.sessionIDLength === undefined && result.sessionLength !== undefined) {
      result.sessionIDLength = result.sessionLength;
    }
    delete result.sessionPlacement;
    delete result.sessionKey;
    delete result.sessionTable;
    delete result.sessionLength;
  }

  // FinalMask is not part of the H1Cloud XHTTP transport settings. A stale or
  // GUI-generated noise mask can make the whole profile fail before connecting.
  for (const key of Object.keys(result)) {
    const normalized = String(key).toLowerCase().replace(/[-_]/g, '');
    if (['fm', 'finalmask', 'mask', 'noise', 'noises'].includes(normalized)) delete result[key];
  }

  // The supplied H1Cloud links use xPaddingObfsMode=true. Some Happ builds
  // convert that URI option into FinalMask type=noise and then reject it as an
  // unknown mask. Keep all padding ranges/keys/placements, but disable only
  // this optional obfuscation switch in the compatibility output.
  if (options.disablePaddingObfs !== false && result.xPaddingObfsMode === true) {
    result.xPaddingObfsMode = false;
  }

  return result;
}

function parseH1CloudXhttpExtra(value, options = {}) {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    return sanitizeH1CloudXhttpExtra(JSON.parse(text), options);
  } catch (_) {
    return null;
  }
}

function normalizeH1CloudShareLinkForCompatibility(line) {
  const raw = String(line || '').trim();
  if (!raw || getShareLinkProtocol(raw) !== 'vless' || getShareLinkTransport(raw) !== 'xhttp') return raw;

  const hashIndex = raw.indexOf('#');
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const queryIndex = withoutHash.indexOf('?');
  if (queryIndex < 0) return raw;

  const prefix = withoutHash.slice(0, queryIndex);
  const queryText = withoutHash.slice(queryIndex + 1);
  const parsedQuery = new URLSearchParams(queryText);
  const hasVlessEncryption = String(parsedQuery.get('encryption') || 'none').trim().toLowerCase() !== 'none';
  const kept = [];

  for (const part of queryText.split('&')) {
    if (!part) continue;
    const eqIndex = part.indexOf('=');
    const encodedKey = eqIndex >= 0 ? part.slice(0, eqIndex) : part;
    const encodedValue = eqIndex >= 0 ? part.slice(eqIndex + 1) : '';
    const decodedKey = decodeShareLinkQueryComponent(encodedKey).trim();
    const normalizedKey = decodedKey.toLowerCase().replace(/[-_]/g, '');

    // Current Xray permits Vision over XHTTP only when VLESS-level
    // encryption is enabled. Strip legacy invalid combinations, preserve vlessenc.
    if (normalizedKey === 'flow') {
      const flow = decodeShareLinkQueryComponent(encodedValue).trim().toLowerCase();
      if (flow.startsWith('xtls-rprx-vision') && !hasVlessEncryption) continue;
    }

    if (normalizedKey === 'fm' || normalizedKey === 'finalmask') continue;

    if (normalizedKey === 'extra') {
      const extra = parseH1CloudXhttpExtra(decodeShareLinkQueryComponent(encodedValue), {
        disablePaddingObfs: true,
        normalizeSessionAliases: false
      });
      if (extra) {
        kept.push(`${encodedKey}=${encodeURIComponent(JSON.stringify(extra))}`);
        continue;
      }
    }

    // Preserve untouched parameters byte-for-byte and in their original order.
    kept.push(part);
  }

  return `${prefix}${kept.length ? `?${kept.join('&')}` : ''}${hash}`;
}

function relabelRemoteShareLink(line, nodeName) {
  const raw = String(line || '').trim();
  if (!raw) return '';
  const hashIndex = raw.indexOf('#');
  const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  // The transport is already visible in the client application. Keep one clean
  // public node name instead of appending “XHTTP” / “XHTTP CDN” to the title.
  return `${base}#${encodeURIComponent(String(nodeName || 'H1Cloud').trim())}`;
}

async function buildH1CloudSubscriptionEntries(row, clientRow, includeOffline = true) {
  if (Number(row.node_enabled) !== 1) return [];
  if (Number(row.client_node_enabled) !== 1) return [];
  if (!includeOffline && row.last_status === 'offline') return [];

  const baseNodeName = getNodePublicName(row);
  const totalBytes = getClientNodeLimitBytes(clientRow, row, 0);
  const expiryTimeMs = getClientNodeExpiryMs(clientRow, 0);
  const subscriptionInfo = {
    inbound: null,
    source: 'h1cloud-sub',
    uploadBytes: clampByteNumber(row.upload_bytes || 0),
    downloadBytes: clampByteNumber(row.download_bytes || 0),
    usedBytes: clampByteNumber(row.used_bytes || 0),
    totalBytes,
    expiryTimeMs,
    enabled: true
  };
  const visibleNodeName = buildNodeLimitRemark(baseNodeName, subscriptionInfo);
  // Always read the peer/local H1Cloud subscription and merge its VLESS links
  // into this client's common aggregator subscription.
  const subUrl = buildH1CloudLocalSubUrlFromMapping(row, row.remote_uuid || clientRow.uuid, row.remote_sub_url);
  if (!subUrl) return [];
  let lines = [];
  try {
    lines = await fetchSubscriptionLines(subUrl, { agent: getH1CloudFetchAgent(subUrl) });
  } catch (err) {
    console.error(`H1Cloud subscription fetch failed (${row.node_id}):`, err.message || err);
    return [];
  }
  const linkTypes = normalizeH1CloudLinkTypes(row.h1cloud_link_types, row.h1cloud_link_mode);
  const fingerprint = normalizeH1CloudFingerprint(row.h1cloud_fingerprint);
  return lines
    .filter(line => isH1CloudShareLinkAllowed(line, linkTypes, row.h1cloud_link_mode))
    .map(line => normalizeH1CloudShareLinkForCompatibility(line))
    .map(line => applyH1CloudFingerprintToShareLink(line, fingerprint))
    .map(line => ({
      line: relabelRemoteShareLink(line, visibleNodeName),
      nodeId: row.node_id,
      nodeType: NODE_TYPE_H1CLOUD,
      nodeName: visibleNodeName,
      baseNodeName,
      subscriptionInfo
    }))
    .filter(e => e.line);
}


function collectShareLinksFromValue(value, out = [], depth = 0) {
  if (depth > 6 || value === null || value === undefined) return out;
  if (typeof value === 'string') {
    const decoded = decodeMaybeBase64Subscription(value);
    for (const line of String(decoded || '').split(/\r?\n/)) {
      const clean = line.trim();
      if (/^(?:vless|vmess|trojan|ss|hysteria|hy2|tuic):\/\//i.test(clean)) out.push(clean);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectShareLinksFromValue(item, out, depth + 1);
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (['success', 'msg', 'message', 'error', 'code', 'status'].includes(String(key).toLowerCase())) continue;
      collectShareLinksFromValue(item, out, depth + 1);
    }
  }
  return out;
}

function extractSubIdFromSubscriptionUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const match = parsed.pathname.match(/\/sub\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  } catch (_) {
    const match = raw.match(/\/sub\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  }
}

async function fetchH1Cloud3xuiPanelShareLinks(node, email, subId = '') {
  const cleanEmail = String(email || '').trim();
  const cleanSubId = String(subId || '').trim();
  const paths = [];
  if (cleanEmail) paths.push(`/panel/api/clients/links/${encodeURIComponent(cleanEmail)}`);
  if (cleanSubId) paths.push(`/panel/api/clients/subLinks/${encodeURIComponent(cleanSubId)}`);

  let lastError = null;
  for (const apiPath of paths) {
    try {
      const data = await apiGet(node, apiPath, Math.min(FETCH_TIMEOUT_MS, 8000));
      const links = uniqueList(collectShareLinksFromValue(data));
      if (links.length) return links;
    } catch (err) {
      lastError = err;
      if (!isMissingApiEndpointError(err) && !isRemoteEntityMissingError(err)) break;
    }
  }
  if (lastError && !isMissingApiEndpointError(lastError) && !isRemoteEntityMissingError(lastError)) throw lastError;
  return [];
}

async function buildH1Cloud3xuiSubscriptionEntries(row, clientRow, inbound, subscriptionInfo, visibleNodeName, baseNodeName) {
  const remoteSubUrl = String(row?.remote_sub_url || '').trim();
  const subId = String(
    row?.remote_sub_id || row?.sub_id || extractSubIdFromSubscriptionUrl(remoteSubUrl) || clientRow?.sub_slug || ''
  ).trim();
  const email = String(row?.remote_email || clientRow?.login || '').trim();
  const resolvedSubUrl = remoteSubUrl || buildH1Cloud3xuiClientSubUrl(row, subId);
  const errors = [];

  // Stage75: the exact provider SUB is the source of truth. On H1Cloud the
  // /panel/api/clients/links response may differ from the working /sub/:subId
  // link (especially for XHTTP + External Proxy). The user-confirmed working
  // provider subscription therefore has priority and is merged byte-for-byte
  // except for the harmless visible remark after '#'.
  if (resolvedSubUrl) {
    try {
      const lines = await fetchSubscriptionLines(resolvedSubUrl, {
        agent: getH1CloudFetchAgent(resolvedSubUrl),
        timeoutMs: Math.min(FETCH_TIMEOUT_MS, 8000)
      });
      const entries = lines
        .filter(line => String(line || '').startsWith('vless://'))
        .map(line => relabelRemoteShareLink(line, visibleNodeName))
        .filter(Boolean)
        .map(line => ({
          line,
          nodeId: row.node_id,
          nodeType: NODE_TYPE_H1CLOUD_3XUI,
          nodeName: visibleNodeName,
          baseNodeName,
          subscriptionInfo,
          providerSubUrl: resolvedSubUrl,
          providerSubId: subId,
          providerJsonUrl: buildH1Cloud3xuiJsonUrl(row, subId)
        }));
      if (entries.length) return entries;
    } catch (err) {
      errors.push(`subscription: ${String(err.message || err)}`);
    }
  }

  // API links remain a secondary fallback only.
  try {
    const apiLines = await fetchH1Cloud3xuiPanelShareLinks(row, email, subId);
    const entries = apiLines
      .filter(line => String(line || '').startsWith('vless://'))
      .map(line => relabelRemoteShareLink(line, visibleNodeName))
      .filter(Boolean)
      .map(line => ({
        line,
        nodeId: row.node_id,
        nodeType: NODE_TYPE_H1CLOUD_3XUI,
        nodeName: visibleNodeName,
        baseNodeName,
        subscriptionInfo,
        providerSubUrl: resolvedSubUrl,
        providerSubId: subId,
        providerJsonUrl: buildH1Cloud3xuiJsonUrl(row, subId)
      }));
    if (entries.length) return entries;
  } catch (err) {
    errors.push(`panel links: ${String(err.message || err)}`);
  }

  if (errors.length) {
    console.error(`H1Cloud 3x-ui share links unavailable (${row.node_id}):`, errors.join(' | '));
  }
  return [];
}

function buildRemnawaveSubscriptionInfo(row, clientRow) {
  const totalBytes = toTotalGbBytes(Math.max(0, Number(row?.client_node_traffic_gb ?? clientRow?.traffic_gb ?? 0)));
  const usedBytes = clampByteNumber(row?.used_bytes || 0);
  return {
    inbound: null,
    source: 'remnawave',
    uploadBytes: clampByteNumber(row?.upload_bytes || 0),
    downloadBytes: clampByteNumber(row?.download_bytes || usedBytes),
    usedBytes,
    totalBytes,
    expiryTimeMs: normalizeEpochMillis(clientRow?.expiry_time || 0),
    enabled: Number(row?.client_node_enabled) === 1 && Number(clientRow?.enabled) === 1
  };
}

async function buildRemnawaveSubscriptionEntries(row, clientRow, includeOffline = true) {
  if (Number(row?.node_enabled) !== 1 || Number(row?.client_node_enabled) !== 1) return [];
  if (!includeOffline && String(row?.last_status || '') === 'offline') return [];

  let subscriptionUrl = String(row?.remote_sub_url || '').trim();
  if (!subscriptionUrl && row?.remote_uuid) {
    try {
      const user = await getRemnawaveUserByUuid(row, row.remote_uuid, Math.min(FETCH_TIMEOUT_MS, 8000));
      subscriptionUrl = String(user?.subscriptionUrl || '').trim();
      if (subscriptionUrl && row?.client_node_id) {
        db.prepare('UPDATE client_nodes SET remote_sub_url = ?, used_bytes = ?, download_bytes = ? WHERE id = ?')
          .run(
            subscriptionUrl,
            clampByteNumber(user?.userTraffic?.usedTrafficBytes || row?.used_bytes || 0),
            clampByteNumber(user?.userTraffic?.usedTrafficBytes || row?.download_bytes || 0),
            row.client_node_id
          );
      }
    } catch (err) {
      console.error(`Remnawave user refresh failed (${row?.node_id || row?.id}):`, err.message || err);
    }
  }
  if (!subscriptionUrl) return [];

  const subscriptionInfo = buildRemnawaveSubscriptionInfo(row, clientRow);
  const baseNodeName = getNodePublicName(row);
  const visibleNodeName = buildNodeLimitRemark(baseNodeName, subscriptionInfo);

  try {
    const lines = await fetchSubscriptionLines(subscriptionUrl, {
      timeoutMs: Math.min(FETCH_TIMEOUT_MS, 8000),
      headers: {
        'User-Agent': 'v2rayN/7.0',
        'Accept': 'text/plain,*/*'
      }
    });
    let candidates = lines.map(parseRemnawaveShareCandidate).filter(Boolean);
    candidates = filterRemnawaveCandidatesByText(candidates, row?.remnawave_link_filter || '');

    if (String(row?.remnawave_host_uuid || '').trim()) {
      const hostDescriptor = await getRemnawaveHostDescriptor(row);
      candidates = filterRemnawaveCandidatesByHost(candidates, hostDescriptor);
    }

    const linkMode = normalizeRemnawaveLinkMode(row?.remnawave_link_mode);
    if (linkMode !== 'all') candidates = uniqueRemnawaveCandidates(candidates);
    if (linkMode === 'first') candidates = candidates.slice(0, 1);

    const remarkMode = normalizeRemnawaveRemarkMode(row?.remnawave_remark_mode);
    return candidates.map((candidate, index) => {
      const providerRemark = String(candidate.remark || '').trim();
      let line = candidate.line;
      let nodeName = visibleNodeName;
      if (remarkMode === 'provider') {
        nodeName = providerRemark || visibleNodeName;
      } else if (remarkMode === 'combined') {
        nodeName = providerRemark ? `${visibleNodeName} · ${providerRemark}` : (candidates.length > 1 ? `${visibleNodeName} · ${index + 1}` : visibleNodeName);
        line = relabelRemoteShareLink(candidate.line, nodeName);
      } else {
        nodeName = candidates.length > 1 ? `${visibleNodeName} · ${index + 1}` : visibleNodeName;
        line = relabelRemoteShareLink(candidate.line, nodeName);
      }
      return {
        line,
        nodeId: row.node_id,
        nodeType: NODE_TYPE_REMNAWAVE,
        nodeName,
        baseNodeName,
        subscriptionInfo,
        providerSubUrl: subscriptionUrl
      };
    }).filter(entry => entry.line);
  } catch (err) {
    console.error(`Remnawave subscription fetch failed (${row?.node_id || row?.id}):`, err.message || err);
    return [];
  }
}

async function buildSubscriptionEntryForRow(row, clientRow, includeOffline = true) {
  try {
    if (isRemnawaveNode(row)) return buildRemnawaveSubscriptionEntries(row, clientRow, includeOffline);
    if (isH1CloudNode(row)) return buildH1CloudSubscriptionEntries(row, clientRow, includeOffline);
    if (Number(row.node_enabled) !== 1) return null;
    if (Number(row.client_node_enabled) !== 1) return null;
    if (!includeOffline && row.last_status === 'offline') return null;

    let inbound = getCachedInbound(row);

    if (!inbound) {
      try {
        inbound = await getInboundFast(row);
      } catch (err) {
        console.error(`No cached inbound and node is unavailable (${row.node_id}):`, err.message);
        return null;
      }
    }

    const subscriptionInfo = await getSubscriptionNodeInfo(row, clientRow, inbound);
    inbound = subscriptionInfo.inbound || inbound;

    const baseNodeName = getNodePublicName(row);
    const visibleNodeName = buildNodeLimitRemark(baseNodeName, subscriptionInfo);
    if (isH1Cloud3xuiNode(row)) {
      const remoteEntries = await buildH1Cloud3xuiSubscriptionEntries(
        row,
        clientRow,
        inbound,
        subscriptionInfo,
        visibleNodeName,
        baseNodeName
      );
      if (remoteEntries.length) return remoteEntries;
    }

    const shareLinks = buildOutboundShareLinks(
      row,
      inbound,
      row.remote_uuid || clientRow.uuid,
      row.remote_email || clientRow.login,
      clientRow.display_name,
      visibleNodeName
    );

    if (!shareLinks.length) return null;

    return shareLinks.map(line => ({
      line,
      nodeId: row.node_id,
      nodeType: isH1Cloud3xuiNode(row) ? NODE_TYPE_H1CLOUD_3XUI : NODE_TYPE_3XUI,
      nodeName: visibleNodeName,
      baseNodeName,
      subscriptionInfo
    }));
  } catch (err) {
    console.error('Build subscription line failed:', err.message);
    return null;
  }
}

async function buildSubscriptionEntries(clientRow, includeOffline = true, options = {}) {
  // Подписка/JSON должны открываться быстро: Happ может зависать, если ждать каждый узел последовательно.
  // Поэтому узлы собираются параллельно, а live-статистика имеет короткий timeout.
  const mappedRows = db.prepare(`
    SELECT
      cn.id AS client_node_id,
      cn.remote_sub_url,
      cn.remote_uuid,
      cn.remote_email,
      cn.traffic_gb AS client_node_traffic_gb,
      cn.enabled AS client_node_enabled,
      n.id AS id,
      n.id AS node_id,
      n.name,
      n.node_type,
      cn.upload_bytes,
      cn.download_bytes,
      cn.used_bytes,
      n.panel_url,
      n.panel_path,
      n.sub_base_url,
      n.h1cloud_3xui_shared_traffic,
      n.h1cloud_3xui_local_expiry,
      n.h1cloud_3xui_sub_port,
      n.h1cloud_3xui_json_url_template,
      n.h1cloud_link_mode,
      n.h1cloud_link_types,
      n.h1cloud_fingerprint,
      n.username,
      n.password_enc,
      n.api_auth_mode,
      n.api_token_enc,
      n.remnawave_caddy_token_enc,
      n.remnawave_internal_squad_uuid,
      n.remnawave_node_uuid,
      n.remnawave_host_uuid,
      n.remnawave_link_mode,
      n.remnawave_link_filter,
      n.remnawave_remark_mode,
      n.inbound_id,
      n.enabled AS node_enabled,
      n.last_status,
      n.last_error,
      n.country_code,
      n.country_name_ru,
      n.country_flag,
      n.label_suffix
    FROM client_nodes cn
    JOIN nodes n ON n.id = cn.node_id
    WHERE cn.client_id = ?
    ORDER BY ${nodeOrderSql('n')}, cn.id ASC
  `).all(clientRow.id);

  const excludedNodeTypes = new Set((options.excludeNodeTypes || []).map(value => String(value || '').trim()));
  const onlyNodeTypes = new Set((options.onlyNodeTypes || []).map(value => String(value || '').trim()));
  const rows = mappedRows.filter(row => {
    const nodeType = getNodeType(row);
    if (excludedNodeTypes.has(nodeType)) return false;
    if (onlyNodeTypes.size && !onlyNodeTypes.has(nodeType)) return false;
    return true;
  });
  const seen = new Set();
  const results = await Promise.all(rows.map(row => buildSubscriptionEntryForRow(row, clientRow, includeOffline)));
  const entries = [];

  for (const item of results) {
    const list = Array.isArray(item) ? item : [item];
    for (const entry of list) {
      if (!entry || !entry.line) continue;
      if (seen.has(entry.line)) continue;
      seen.add(entry.line);
      entries.push(entry);
    }
  }

  return entries;
}

async function buildSubscriptionLines(clientRow, includeOffline = true) {
  const entries = await buildSubscriptionEntries(clientRow, includeOffline);
  return entries.map(e => e.line);
}

function getClientFromInboundSettings(inbound, uuid, email) {
  const settings = safeParseJsonField(inbound?.settings, {});
  const clients = Array.isArray(settings.clients) ? settings.clients : [];
  const cleanUuid = String(uuid || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  return clients.find(c => cleanUuid && String(c.id || c.uuid || '').trim() === cleanUuid)
    || clients.find(c => cleanEmail && String(c.email || c.name || '').trim().toLowerCase() === cleanEmail)
    || clients[0]
    || {};
}

function getInboundExternalProxyEntries(inbound) {
  const streamSettings = safeParseJsonField(inbound?.streamSettings, {});
  return normalizeObjectArray(streamSettings?.externalProxy)
    .map(item => ({
      ...item,
      dest: String(item?.dest || item?.address || item?.host || '').trim(),
      port: normalizePortNumber(item?.port || 443),
      forceTls: String(item?.forceTls || item?.security || '').trim().toLowerCase()
    }))
    .filter(item => item.dest && item.port);
}

function buildVlessExternalProxyLinks(node, inbound, uuid, displayName, nodeName, email = '') {
  const proxies = getInboundExternalProxyEntries(inbound);
  if (!proxies.length) return [];

  const streamSettings = safeParseJsonField(inbound.streamSettings, {});
  const settings = safeParseJsonField(inbound.settings, {});
  const network = normalizeInboundNetwork(streamSettings.network || 'raw');
  if (network !== 'xhttp') return [];

  const client = (Array.isArray(settings?.clients) ? settings.clients : [])
    .find(c => sameText(c?.id, uuid) || isSameLogin(c?.email, email)) || {};
  const encryption = getVlessEncryption(settings);

  return proxies.map(proxy => {
    const security = proxy.forceTls === 'tls' ? 'tls' : (proxy.forceTls === 'reality' ? 'reality' : String(streamSettings.security || 'none').toLowerCase());
    const query = new URLSearchParams({ type: 'xhttp', security: security || 'none', encryption });

    if (security === 'tls') {
      const tls = streamSettings.tlsSettings || {};
      const sni = String(proxy.sni || proxy.serverName || proxy.dest || tls.serverName || '').trim();
      if (sni) query.set('sni', sni);
      const proxyFp = String(proxy.fingerprint || tls.fingerprint || '').trim();
      if (proxyFp) query.set('fp', proxyFp);
      const alpn = Array.isArray(proxy.alpn) ? proxy.alpn : (Array.isArray(tls.alpn) ? tls.alpn : []);
      if (alpn.length) query.set('alpn', alpn.join(','));
      if (proxy.allowInsecure || tls.allowInsecure) query.set('allowInsecure', '1');
    } else if (security === 'reality') {
      const reality = streamSettings.realitySettings || {};
      const inner = reality.settings || {};
      const sni = String(proxy.sni || proxy.serverName || getEffectiveNodeSni(node, reality, inner) || '').trim();
      if (sni) query.set('sni', sni);
      if (inner.publicKey || reality.publicKey) query.set('pbk', inner.publicKey || reality.publicKey);
      const sid = reality.shortIds?.[0] || inner.shortIds?.[0] || reality.shortId || inner.shortId || '';
      if (sid) query.set('sid', sid);
      const proxyFp = String(proxy.fingerprint || inner.fingerprint || reality.fingerprint || '').trim();
      if (proxyFp) query.set('fp', proxyFp);
      const clientKey = client.subId || client.sub_id || client.email || email;
      const proxySpiderX = deriveRealitySpiderX(inner.spiderX || reality.spiderX || '', clientKey);
      if (proxySpiderX) query.set('spx', proxySpiderX);
      const pqv = String(inner.mldsa65Verify || reality.mldsa65Verify || '').trim();
      if (pqv) query.set('pqv', pqv);
    }

    appendTransportQuery(query, streamSettings);
    if (client.flow && canUseVlessVision(network, security, settings)) query.set('flow', client.flow);

    const remark = encodeURIComponent(nodeName || getNodePublicName(node));
    const serverDescription = buildHappServerDescription(node, inbound);
    const descriptionPart = serverDescription
      ? `?serverDescription=${encodeURIComponent(Buffer.from(serverDescription, 'utf8').toString('base64'))}`
      : '';
    return `vless://${uuid}@${proxy.dest}:${proxy.port}?${query.toString()}#${remark}${descriptionPart}`;
  });
}

function buildOutboundShareLinks(node, inbound, uuid, email, displayName, nodeName) {
  const protocol = normalizeInboundProtocol(inbound?.protocol || 'vless');
  if (protocol === 'vless') {
    if (isH1Cloud3xuiNode(node)) {
      const external = buildVlessExternalProxyLinks(node, inbound, uuid, displayName, nodeName, email);
      if (external.length) return external;
    }
    const line = buildVlessRealityLink(node, inbound, uuid, displayName, nodeName, email);
    return line ? [line] : [];
  }
  if (protocol === 'trojan') {
    const line = buildTrojanLink(node, inbound, uuid, email, nodeName);
    return line ? [line] : [];
  }
  if (protocol === 'shadowsocks') {
    const line = buildShadowsocksLink(node, inbound, uuid, email, nodeName);
    return line ? [line] : [];
  }
  // WireGuard/Hysteria/HTTP/Mixed/Tunnel store very different client credentials
  // in current 3x-ui builds. We can manage/import clients for those inbounds,
  // but generic SUB link generation is intentionally skipped until their exact
  // remote payload is cached per client.
  return [];
}

function buildOutboundShareLink(node, inbound, uuid, email, displayName, nodeName) {
  return buildOutboundShareLinks(node, inbound, uuid, email, displayName, nodeName)[0] || '';
}

function buildVlessRealityLink(node, inbound, uuid, displayName, nodeName, email = '') {
  const streamSettings = safeParseJsonField(inbound.streamSettings, {});
  const settings = safeParseJsonField(inbound.settings, {});
  const realitySettings = streamSettings?.realitySettings || {};
  const realityInner = realitySettings?.settings || {};
  const tlsSettings = streamSettings?.tlsSettings || {};

  const panelUrl = new URL(node.panel_url);
  const originalHost = panelUrl.hostname;
  const host = getRedirectReplacementHost(node.node_id || node.id, originalHost);
  const port = inbound.port || panelUrl.port || 443;

  const security = String(streamSettings.security || 'none').toLowerCase() || 'none';
  const network = normalizeInboundNetwork(streamSettings.network || 'raw');
  const query = new URLSearchParams({
    type: toClientLinkNetwork(network),
    security,
    encryption: getVlessEncryption(settings)
  });

  if (security === 'reality') {
    const pbk = realityInner?.publicKey || realitySettings?.publicKey || '';
    const sni = getEffectiveNodeSni(node, realitySettings, realityInner);
    const sid =
      realitySettings?.shortIds?.[0] ||
      realityInner?.shortIds?.[0] ||
      realitySettings?.shortId ||
      realityInner?.shortId ||
      '';
    const providerManaged = isH1Cloud3xuiNode(node);
    const fp = realityInner?.fingerprint || realitySettings?.fingerprint || streamSettings?.fingerprint || (providerManaged ? '' : 'chrome');
    const client = getClientFromInboundSettings(inbound, uuid, email);
    const clientKey = client.subId || client.sub_id || client.email || email;
    const spiderX = deriveRealitySpiderX(realityInner?.spiderX || realitySettings?.spiderX || '', clientKey);
    const pqv = String(realityInner?.mldsa65Verify || realitySettings?.mldsa65Verify || '').trim();
    if (pbk) query.set('pbk', pbk);
    if (fp) query.set('fp', fp);
    if (sni) query.set('sni', sni);
    if (sid) query.set('sid', sid);
    if (spiderX) query.set('spx', spiderX);
    if (pqv) query.set('pqv', pqv);
  } else if (security === 'tls') {
    const sni = getEffectiveNodeSni(node, tlsSettings, {}) || tlsSettings.serverName || getTlsServerNameFromStream(streamSettings);
    if (sni) query.set('sni', sni);
    if (tlsSettings.fingerprint) query.set('fp', tlsSettings.fingerprint);
    if (Array.isArray(tlsSettings.alpn) && tlsSettings.alpn.length) query.set('alpn', tlsSettings.alpn.join(','));
    if (tlsSettings.allowInsecure) query.set('allowInsecure', '1');
  }

  appendTransportQuery(query, streamSettings);

  const flow =
    settings?.clients?.find(c => c.id === uuid || c.email === email)?.flow ||
    settings?.clients?.[0]?.flow ||
    '';

  if (flow && canUseVlessVision(network, security, settings)) query.set('flow', flow);

  const remark = encodeURIComponent(nodeName || getNodePublicName(node));
  const serverDescription = buildHappServerDescription(node, inbound);
  const descriptionPart = serverDescription
    ? `?serverDescription=${encodeURIComponent(Buffer.from(serverDescription, 'utf8').toString('base64'))}`
    : '';
  return `vless://${uuid}@${host}:${port}?${query.toString()}#${remark}${descriptionPart}`;
}

function buildTrojanLink(node, inbound, uuid, email, nodeName) {
  const streamSettings = safeParseJsonField(inbound.streamSettings, {});
  const client = getClientFromInboundSettings(inbound, uuid, email);
  const password = String(client.password || client.pass || client.id || uuid || '').trim();
  if (!password) return '';
  const panelUrl = new URL(node.panel_url);
  const host = getRedirectReplacementHost(node.node_id || node.id, panelUrl.hostname);
  const port = inbound.port || panelUrl.port || 443;
  const security = String(streamSettings.security || 'tls').toLowerCase() || 'tls';
  const network = normalizeInboundNetwork(streamSettings.network || 'raw');
  const query = new URLSearchParams({ type: toClientLinkNetwork(network), security });
  const sni = getEffectiveNodeSni(node, streamSettings.tlsSettings || streamSettings.realitySettings || {}, {}) || getTlsServerNameFromStream(streamSettings);
  if (sni) query.set('sni', sni);
  appendTransportQuery(query, streamSettings);
  const remark = encodeURIComponent(nodeName || getNodePublicName(node));
  return `trojan://${encodeURIComponent(password)}@${host}:${port}?${query.toString()}#${remark}`;
}

function buildShadowsocksLink(node, inbound, uuid, email, nodeName) {
  const streamSettings = safeParseJsonField(inbound.streamSettings, {});
  const settings = safeParseJsonField(inbound.settings, {});
  const client = getClientFromInboundSettings(inbound, uuid, email);
  const method = String(client.method || client.security || settings.method || settings.security || '2022-blake3-aes-128-gcm').trim();
  const password = String(client.password || client.pass || settings.password || uuid || '').trim();
  if (!method || !password) return '';
  const panelUrl = new URL(node.panel_url);
  const host = getRedirectReplacementHost(node.node_id || node.id, panelUrl.hostname);
  const port = inbound.port || panelUrl.port || 443;
  const network = normalizeInboundNetwork(streamSettings.network || 'raw');
  const user = Buffer.from(`${method}:${password}`, 'utf8').toString('base64url');
  const query = new URLSearchParams({ type: toClientLinkNetwork(network) });
  appendTransportQuery(query, streamSettings);
  const remark = encodeURIComponent(nodeName || getNodePublicName(node));
  return `ss://${user}@${host}:${port}?${query.toString()}#${remark}`;
}

function buildRemoteClientRecord(node, inbound, remoteClient) {
  const c = remoteClient || {};
  const uuid = String(c.id || c.uuid || c.clientId || c.client_id || '').trim();
  const email = String(c.email || c.login || c.name || '').trim();
  const stat = findClientStat(inbound, uuid, email) || {};

  const subId = String(
    c.subId || c.sub_id || stat.subId || stat.sub_id || randomUUID().replace(/-/g, '').slice(0, 16)
  ).trim();

  const totalRaw = firstPositiveNumber(
    fieldValue(c, ['totalGB', 'total', 'trafficLimit', 'limit']),
    fieldValue(stat, ['totalGB', 'total', 'trafficLimit', 'limit'])
  );
  const expiryRaw = firstPositiveNumber(
    fieldValue(c, ['expiryTime', 'expiry_time', 'expire', 'expireTime']),
    fieldValue(stat, ['expiryTime', 'expiry_time', 'expire', 'expireTime'])
  );
  const limitIpRaw = firstNonEmpty(
    fieldValue(c, ['limitIp', 'limit_ip', 'ipLimit']),
    fieldValue(stat, ['limitIp', 'limit_ip', 'ipLimit']),
    1
  );
  const enabledRaw = firstNonEmpty(
    fieldValue(c, ['enable', 'enabled']),
    fieldValue(stat, ['enable', 'enabled']),
    true
  );

  const resetRaw = fieldValue(c, ['reset', 'resetTraffic', 'reset_traffic'], 0);
  const resetNumber = Number(resetRaw || 0);

  const uploadBytes = clampByteNumber(fieldValue(stat, ['up', 'upload', 'uplink', 'uploadBytes', 'uplinkBytes'], 0));
  const downloadBytes = clampByteNumber(fieldValue(stat, ['down', 'download', 'downlink', 'downloadBytes', 'downlinkBytes'], 0));
  const totalGB = normalizeRemoteTrafficLimitBytes(totalRaw);
  const expiryTime = normalizeRemoteEpochMillis(expiryRaw);

  return {
    uuid,
    email,
    limitIp: Math.max(0, Number(limitIpRaw ?? 1)),
    expiryTime,
    flow: c.flow || stat.flow || '',
    enable: !(enabledRaw === false || Number(enabledRaw) === 0),
    subId,
    tgId: c.tgId || c.tg_id || stat.tgId || stat.tg_id || '',
    reset: Number.isFinite(resetNumber) && resetNumber > 0 ? Math.ceil(resetNumber) : 0,
    comment: String(c.comment || c.remark || c.description || stat.comment || stat.remark || '').trim(),
    totalGB,
    uploadBytes,
    downloadBytes,
    usedBytes: clampByteNumber(uploadBytes + downloadBytes),
    originalSub: buildNativeSubUrl(node, subId),
    originalJson: buildNativeJsonUrl(node, subId)
  };
}

function extract3xuiClientRowsFromResponse(data) {
  const root = data?.obj ?? data?.data ?? data?.result ?? data;
  if (Array.isArray(root)) return root;
  if (!root || typeof root !== 'object') return [];
  for (const key of ['items', 'rows', 'records', 'clients', 'data', 'list', 'content']) {
    if (Array.isArray(root[key])) return root[key];
  }
  return [];
}

function arrayFromMixed(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'string') {
    const parsed = safeParseJsonField(value, null);
    if (Array.isArray(parsed)) return parsed;
    return value.split(/[,;\s]+/).map(v => v.trim()).filter(Boolean);
  }
  return [value];
}

function extractLinkedInboundValues(row = {}) {
  const base = row.client && typeof row.client === 'object' ? row.client : row;
  const direct = [
    row.inboundIds, row.inbound_ids, row.inboundIDs, row.inboundId, row.inbound_id, row.inboundID,
    base.inboundIds, base.inbound_ids, base.inboundId, base.inbound_id
  ];
  const tagLike = [
    row.inboundTags, row.inbound_tags, row.inboundTag, row.inbound_tag,
    row.inbounds, row.inbound, row.inboundRemark, row.inbound_remark, row.inboundName, row.inbound_name,
    base.inboundTags, base.inbound_tags, base.inbounds, base.inbound
  ];
  const ids = [];
  const tags = [];
  for (const source of direct) {
    for (const item of arrayFromMixed(source)) {
      if (item && typeof item === 'object') {
        const id = item.id ?? item.ID ?? item.inboundId ?? item.inbound_id;
        if (id !== undefined && id !== null && id !== '') ids.push(Number(id));
        const tag = item.tag || item.remark || item.name || item.label;
        if (tag) tags.push(String(tag).trim());
      } else if (String(item || '').trim()) {
        const n = Number(item);
        if (Number.isFinite(n)) ids.push(n);
        else tags.push(String(item).trim());
      }
    }
  }
  for (const source of tagLike) {
    for (const item of arrayFromMixed(source)) {
      if (item && typeof item === 'object') {
        const id = item.id ?? item.ID ?? item.inboundId ?? item.inbound_id;
        if (id !== undefined && id !== null && id !== '') ids.push(Number(id));
        const tag = item.tag || item.remark || item.name || item.label || item.port;
        if (tag) tags.push(String(tag).trim());
      } else if (String(item || '').trim()) {
        const n = Number(item);
        if (Number.isFinite(n)) ids.push(n);
        tags.push(String(item).trim());
      }
    }
  }
  return {
    inboundIds: [...new Set(ids.filter(Number.isFinite))],
    inboundTags: [...new Set(tags.filter(Boolean))]
  };
}

function normalize3xuiV3ClientRow(row = {}) {
  const base = row.client && typeof row.client === 'object' ? row.client : row;
  const linked = extractLinkedInboundValues(row);
  // In 3x-ui v3 the global Clients API returns two different identifiers:
  //   id   = numeric database record id
  //   uuid = VLESS/VMess client credential written to settings.clients[].id
  // Inbound rows still use `id` for the UUID. Prefer the explicit uuid field
  // and keep the numeric database id separately, otherwise the aggregator can
  // compare an integer (for example 94) with a UUID and create false conflicts.
  const rawId = base.id ?? base.ID ?? '';
  const explicitUuid = base.uuid || base.UUID || base.clientId || base.client_id || '';
  const credentialId = String(explicitUuid || '').trim()
    || (typeof rawId === 'string' && rawId.trim() ? rawId.trim() : '');
  return {
    ...base,
    recordId: Number.isFinite(Number(rawId)) ? Number(rawId) : (base.recordId || null),
    inboundIds: linked.inboundIds,
    inboundTags: linked.inboundTags,
    id: credentialId,
    uuid: credentialId,
    email: base.email || base.login || base.Email,
    subId: base.subId || base.sub_id || base.SubID,
    totalGB: base.totalGB ?? base.total ?? base.TotalGB,
    expiryTime: base.expiryTime ?? base.expiry_time ?? base.ExpiryTime,
    limitIp: base.limitIp ?? base.limit_ip ?? base.LimitIP,
    enable: base.enable ?? base.enabled ?? base.Enable,
    comment: base.comment || base.remark || base.Comment || '',
    flow: base.flow || base.Flow || '',
    reset: base.reset ?? base.Reset ?? 0,
    tgId: base.tgId || base.tg_id || base.TgID || '',
    password: base.password || base.pass || '',
    auth: base.auth || '',
    security: base.security || '',
    group: base.group || base.groupName || '',
    reverse: base.reverse ?? null,
    adTag: base.adTag || '',
    privateKey: base.privateKey || '',
    publicKey: base.publicKey || '',
    allowedIPs: base.allowedIPs || [],
    preSharedKey: base.preSharedKey || '',
    keepAlive: base.keepAlive ?? 0,
    secret: base.secret || ''
  };
}

function rowMatchesInbound(row, inboundId, node = null) {
  if (!inboundId) return true;
  const linked = extractLinkedInboundValues(row);
  if (linked.inboundIds.map(Number).includes(Number(inboundId))) return true;
  if (!linked.inboundIds.length && !linked.inboundTags.length) return false;
  const inbound = node ? getCachedInbound(node) : null;
  const possibleTags = new Set([
    String(inbound?.tag || '').trim(),
    String(inbound?.remark || '').trim(),
    String(inbound?.port ? `in-${inbound.port}-tcp` : '').trim(),
    String(inbound?.port ? `in-${inbound.port}-raw` : '').trim(),
    String(inbound?.port ? inbound.port : '').trim()
  ].filter(Boolean).map(v => v.toLowerCase()));
  return linked.inboundTags.some(tag => possibleTags.has(String(tag || '').trim().toLowerCase()));
}

async function getClientsFromNew3xuiApi(node) {
  const inboundId = Number(node.inbound_id || 0);

  // The current /list/paged endpoint intentionally returns slim rows without
  // uuid/password/auth/flow/security. Prefer the full /list response so import
  // and reconciliation retain the actual protocol credentials.
  try {
    const data = await apiGet(node, '/panel/api/clients/list');
    const rows = extract3xuiClientRowsFromResponse(data);
    if (rows.length) {
      return rows
        .filter(row => rowMatchesInbound(row, inboundId, node))
        .map(normalize3xuiV3ClientRow);
    }
  } catch (_) {
    // Older/forked builds may expose only a paged endpoint.
  }

  const collected = [];
  for (const basePath of ['/panel/api/clients/list/paged', '/panel/api/clients/paged']) {
    try {
      for (let page = 1; page <= 100; page += 1) {
        const qs = new URLSearchParams({ page: String(page), pageSize: '200', sort: 'createdAt', order: 'desc' });
        const data = await apiGet(node, `${basePath}?${qs.toString()}`);
        const rows = extract3xuiClientRowsFromResponse(data);
        collected.push(...rows);
        const root = data?.obj ?? data?.data ?? data?.result ?? data;
        const total = Number(root?.filtered ?? root?.total ?? root?.totalCount ?? root?.count ?? 0);
        if (!rows.length || rows.length < 200 || (total > 0 && collected.length >= total)) break;
      }
      if (collected.length) break;
    } catch (_) {
      collected.length = 0;
    }
  }

  // Slim paged rows need a per-email read to recover credentials. Limit
  // concurrency by processing sequentially; this path is only a fallback.
  const fullRows = [];
  for (const row of collected.filter(row => rowMatchesInbound(row, inboundId, node))) {
    const email = String(row?.email || row?.client?.email || '').trim();
    if (!email) continue;
    try {
      const data = await apiGet(node, `/panel/api/clients/get/${encodeURIComponent(email)}`);
      const root = data?.obj ?? data?.data ?? data?.result ?? data;
      fullRows.push(root);
    } catch (_) {
      fullRows.push(row);
    }
  }
  return fullRows.map(normalize3xuiV3ClientRow);
}

async function importClientsFromNode(node) {
  if (isRemnawaveNode(node)) {
    const users = await listRemnawaveUsers(node, FETCH_TIMEOUT_MS);
    return users.map(remnawaveRemoteToImportRecord).filter(c => c.uuid && c.email);
  }
  if (isH1CloudNode(node)) {
    const clients = await h1CloudGetClients(node, FETCH_TIMEOUT_MS);
    return clients.map(c => h1CloudRemoteToImportRecord(node, c)).filter(c => c.uuid && c.email);
  }
  const inbound = await getInbound(node);
  const settings = safeParseJsonField(inbound.settings, {});
  let clients = [];

  // На новой 3x-ui v3.2.x клиенты живут в разделе Clients и только
  // привязываются к inbound через inboundIds. Поэтому для API Token сначала
  // читаем новый Clients API. Старый способ через inbound.settings.clients
  // оставляем fallback для v2/старых панелей.
  if (is3xuiV3Mode(node)) {
    try { clients = await getClientsFromNew3xuiApi(node); }
    catch (_) { clients = []; }
  }

  if (!clients.length) {
    clients = Array.isArray(settings.clients) ? settings.clients : [];
  }

  if (!clients.length && !is3xuiV3Mode(node)) {
    try { clients = await getClientsFromNew3xuiApi(node); }
    catch (_) { clients = []; }
  }

  return clients
    .map(c => buildRemoteClientRecord(node, inbound, c))
    .filter(c => c.uuid && c.email);
}

function makeUniqueLogin(baseLogin, existingId = 0) {
  const base = String(baseLogin || 'imported').trim() || 'imported';
  let login = base;
  let i = 2;

  while (true) {
    const existing = db.prepare('SELECT id FROM clients WHERE LOWER(login) = LOWER(?)').get(login);

    if (!existing || Number(existing.id) === Number(existingId)) {
      return login;
    }

    login = `${base}_${i}`;
    i++;
  }
}

function getKnownLocalLoginValues() {
  const values = [];
  for (const row of db.prepare("SELECT login FROM clients WHERE login IS NOT NULL AND login != ''").all()) {
    values.push(row.login);
  }
  for (const row of db.prepare("SELECT remote_email FROM client_nodes WHERE remote_email IS NOT NULL AND remote_email != ''").all()) {
    values.push(row.remote_email);
  }
  return values;
}

function getNextAutoLogin(extraLogins = []) {
  const values = [...getKnownLocalLoginValues(), ...(Array.isArray(extraLogins) ? extraLogins : [])];
  let maxNumber = 0;

  for (const value of values) {
    const match = String(value || '').trim().match(/^user(\d+)$/i);
    if (match) maxNumber = Math.max(maxNumber, Number(match[1]));
  }

  return `user${String(maxNumber + 1).padStart(3, '0')}`;
}

function listRemoteClientsFromInbound(inbound) {
  const settings = safeParseJsonField(inbound?.settings, {});
  return Array.isArray(settings.clients) ? settings.clients : [];
}

async function collectRemoteLoginsForNodes(nodeIds) {
  const ids = uniqueList((nodeIds || []).map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0));
  const emails = [];
  const records = [];

  for (const nodeId of ids) {
    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
    if (!node) throw new Error(`Узел ${nodeId} не найден`);

    try {
      const remoteClients = await importClientsFromNode(node);
      for (const remote of remoteClients) {
        const email = getRemoteClientEmail(remote);
        if (!email) continue;
        emails.push(email);
        records.push({ node, remote, email });
      }
    } catch (err) {
      throw new Error(`Не удалось проверить клиентов на узле ${getNodePublicName(node)}: ${err.message || err}`);
    }
  }

  return { emails, records };
}

function findCaseInsensitiveClientOwner(login, exceptClientId = 0) {
  const clean = String(login || '').trim();
  if (!clean) return null;
  return db.prepare('SELECT id, login FROM clients WHERE LOWER(login) = LOWER(?) AND id != ?')
    .get(clean, Number(exceptClientId || 0)) || null;
}

function getRemoteClientDiffs(remote, expected = {}) {
  const diffs = [];
  const expectedUuid = String(expected.uuid || '').trim();
  const expectedEmail = String(expected.email || expected.login || '').trim();
  const expectedLimitIp = expected.limitIp ?? expected.limit_ip;
  const expectedTotalGb = expected.trafficGb ?? expected.traffic_gb;
  const expectedExpiry = expected.expiryTime ?? expected.expiry_time;

  if (expectedUuid && remote?.id && !sameText(remote.id, expectedUuid)) diffs.push('UUID отличается');
  if (expectedEmail && getRemoteClientEmail(remote) && !isSameLogin(getRemoteClientEmail(remote), expectedEmail)) diffs.push('логин отличается');

  if (expectedLimitIp !== undefined && expectedLimitIp !== null && remote?.limitIp !== undefined && Number(remote.limitIp) !== Number(expectedLimitIp)) {
    diffs.push('IP-лимит отличается');
  }

  if (expectedTotalGb !== undefined && expectedTotalGb !== null && remote?.totalGB !== undefined) {
    const remoteGb = trafficGbFromRemoteValue(remote.totalGB);
    if (Number(remoteGb) !== Number(expectedTotalGb)) diffs.push('ГБ отличаются');
  }

  if (expectedExpiry !== undefined && expectedExpiry !== null && remote?.expiryTime !== undefined) {
    const left = normalizeRemoteEpochMillis(remote.expiryTime || 0);
    const right = normalizeRemoteEpochMillis(expectedExpiry || 0);
    if (left !== right) diffs.push('дата окончания отличается');
  }

  return diffs;
}

function makeRemoteClientConflictError(node, login, remote, expected = {}) {
  const remoteEmail = getRemoteClientEmail(remote) || String(login || '').trim() || 'клиент';
  const diffs = getRemoteClientDiffs(remote, expected);
  const diffText = diffs.length ? ` Отличия: ${diffs.join(', ')}.` : '';
  const actionHint = isRemnawaveNode(node)
    ? 'Импортируй этого пользователя из Remnawave, чтобы сохранить его существующий VLESS UUID.'
    : 'Проверь клиента в оригинальной удалённой панели.';
  return new Error(`На узле ${getNodePublicName(node)} уже есть клиент ${remoteEmail}. Агрегатор сравнивает логины без учёта регистра, поэтому ${remoteEmail} и ${login} считаются одним клиентом.${diffText} Создание или перезапись пропущены. ${actionHint}`);
}

function isSameRemoteClient(remote, expectedUuid, expectedEmail) {
  if (!remote) return false;
  const remoteUuid = String(remote?.id || '').trim();
  if (expectedUuid && remoteUuid && sameText(remoteUuid, expectedUuid)) return true;
  if (!expectedUuid && expectedEmail && isSameLogin(getRemoteClientEmail(remote), expectedEmail)) return true;
  return false;
}

function toTotalGbBytes(gb) {
  const n = Math.max(0, Number(gb || 0));
  return n > 0 ? Math.floor(n * 1024 * 1024 * 1024) : 0;
}

function fromTotalGbBytes(bytes) {
  const n = Math.max(0, Number(bytes || 0));
  return n > 0 ? Math.round(n / 1024 / 1024 / 1024) : 0;
}

function fieldValue(obj, names, fallback = undefined) {
  if (!obj || typeof obj !== 'object') return fallback;

  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(obj, name)) continue;
    const value = obj[name];
    if (value === null || value === undefined || value === '') continue;
    return value;
  }

  const lowerMap = new Map(Object.keys(obj).map(key => [String(key).toLowerCase(), key]));
  for (const name of names) {
    const key = lowerMap.get(String(name).toLowerCase());
    if (!key) continue;
    const value = obj[key];
    if (value === null || value === undefined || value === '') continue;
    return value;
  }

  return fallback;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    return value;
  }
  return undefined;
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return value;
  }
  return firstNonEmpty(...values);
}

function nullablePositiveInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function normalizeRemoteTrafficLimitBytes(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;

  // 3x-ui usually stores totalGB in bytes. If a fork/export returns plain GB,
  // small values are treated as GB to avoid losing limits like 50.
  if (n > 1024 * 1024) return Math.floor(n);
  return toTotalGbBytes(n);
}

function trafficGbFromRemoteValue(value) {
  return fromTotalGbBytes(normalizeRemoteTrafficLimitBytes(value));
}

function normalizeRemoteEpochMillis(value) {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  return normalizeEpochMillis(value);
}

function daysLeftFromExpiry(expiryTimeMs) {
  const expiry = normalizeRemoteEpochMillis(expiryTimeMs);
  if (!expiry) return 0;
  const diff = expiry - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function durationDaysFromRemoteClient(rc, existingClient = null) {
  const expiry = normalizeRemoteEpochMillis(rc?.expiryTime || 0);
  if (!expiry) return 0;

  const left = daysLeftFromExpiry(expiry);
  const resetDays = Math.max(0, Number(rc?.reset || 0));
  const existingDays = Math.max(0, Number(existingClient?.duration_days || 0));

  // 3x-ui reliably stores the final expiry date. Some forks also keep reset days.
  // If the client already existed in the aggregator, keep the larger known term so
  // the UI can show "left/issued" instead of overwriting it with only days left.
  return Math.ceil(Math.max(left, resetDays, existingDays));
}

function expiryAtMidnightAfterDays(days, baseMs = Date.now()) {
  const n = Math.max(0, Number(days || 0));
  if (!Number.isFinite(n) || n <= 0) return 0;

  const base = normalizeEpochMillis(baseMs) || Date.now();
  const d = new Date(base);
  d.setDate(d.getDate() + Math.ceil(n));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}


function normalizeEpochMillis(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 10000000000 ? Math.floor(n * 1000) : Math.floor(n);
}

function toEpochSeconds(value) {
  const ms = normalizeEpochMillis(value);
  return ms > 0 ? Math.floor(ms / 1000) : 0;
}

function clampByteNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function numericField(obj, names, fallback = 0) {
  if (!obj || typeof obj !== 'object') return fallback;

  for (const name of names) {
    const value = fieldValue(obj, [name], undefined);
    if (value === null || value === undefined || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }

  return fallback;
}

function normalizeObjectArray(value) {
  const parsed = typeof value === 'string' ? safeParseJsonField(value, []) : value;
  if (Array.isArray(parsed)) return parsed.filter(v => v && typeof v === 'object');
  if (parsed && typeof parsed === 'object') return Object.values(parsed).filter(v => v && typeof v === 'object');
  return [];
}

function sameText(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function normalizeLoginKey(value) {
  return String(value || '').trim().toLowerCase();
}

function isSameLogin(a, b) {
  const left = normalizeLoginKey(a);
  const right = normalizeLoginKey(b);
  return Boolean(left && right && left === right);
}

function getRemoteClientEmail(remote) {
  return String(remote?.email || remote?.login || remote?.name || '').trim();
}

function findClientStat(inbound, uuid, email) {
  const stats = [
    ...normalizeObjectArray(inbound?.clientStats),
    ...normalizeObjectArray(inbound?.client_stats),
    ...normalizeObjectArray(inbound?.stats),
    ...normalizeObjectArray(inbound?.clientTraffics)
  ];

  const cleanUuid = String(uuid || '').trim();
  const cleanEmail = String(email || '').trim();

  return stats.find(s => cleanEmail && sameText(s.email, cleanEmail)) ||
         stats.find(s => cleanUuid && (sameText(s.uuid, cleanUuid) || sameText(s.clientId, cleanUuid) || sameText(s.id, cleanUuid))) ||
         null;
}

function extractTrafficInfoFromInbound(inbound, uuid, email) {
  const settings = safeParseJsonField(inbound?.settings, {});
  const clientCfg = findRemoteClient(settings, uuid, email) || {};
  const stat = findClientStat(inbound, uuid, email) || {};

  const uploadBytes = clampByteNumber(numericField(stat, ['up', 'upload', 'uplink', 'uploadBytes', 'uplinkBytes'], 0));
  const downloadBytes = clampByteNumber(numericField(stat, ['down', 'download', 'downlink', 'downloadBytes', 'downlinkBytes'], 0));
  const totalBytes = normalizeRemoteTrafficLimitBytes(firstPositiveNumber(
    fieldValue(clientCfg, ['totalGB', 'total', 'trafficLimit', 'limit']),
    fieldValue(stat, ['total', 'totalGB', 'trafficLimit', 'limit'])
  ));
  const expiryTimeMs = normalizeRemoteEpochMillis(firstPositiveNumber(
    fieldValue(clientCfg, ['expiryTime', 'expiry_time', 'expire', 'expireTime']),
    fieldValue(stat, ['expiryTime', 'expiry_time', 'expire', 'expireTime'])
  ));

  const enabledValue = stat.enable ?? stat.enabled ?? clientCfg.enable ?? clientCfg.enabled;
  const enabled = enabledValue === undefined ? true : !(enabledValue === false || Number(enabledValue) === 0);

  return {
    uploadBytes,
    downloadBytes,
    usedBytes: clampByteNumber(uploadBytes + downloadBytes),
    totalBytes,
    expiryTimeMs,
    enabled
  };
}

function extractTrafficInfoFromClientTraffic(stat) {
  const uploadBytes = clampByteNumber(numericField(stat, ['up', 'upload', 'uplink', 'uploadBytes', 'uplinkBytes'], 0));
  const downloadBytes = clampByteNumber(numericField(stat, ['down', 'download', 'downlink', 'downloadBytes', 'downlinkBytes'], 0));
  const totalBytes = normalizeRemoteTrafficLimitBytes(firstPositiveNumber(
    fieldValue(stat, ['total', 'totalGB', 'trafficLimit', 'limit']),
    0
  ));
  const expiryTimeMs = normalizeRemoteEpochMillis(firstPositiveNumber(
    fieldValue(stat, ['expiryTime', 'expiry_time', 'expire', 'expireTime']),
    0
  ));
  const enabledValue = stat?.enable ?? stat?.enabled;
  const enabled = enabledValue === undefined ? true : !(enabledValue === false || Number(enabledValue) === 0);

  return {
    uploadBytes,
    downloadBytes,
    usedBytes: clampByteNumber(uploadBytes + downloadBytes),
    totalBytes,
    expiryTimeMs,
    enabled
  };
}

function mergeTrafficInfo(primary, fallback) {
  const a = primary || {};
  const b = fallback || {};
  const uploadBytes = clampByteNumber(a.uploadBytes ?? b.uploadBytes ?? 0);
  const downloadBytes = clampByteNumber(a.downloadBytes ?? b.downloadBytes ?? 0);
  const totalBytes = clampByteNumber(a.totalBytes || b.totalBytes || 0);
  const expiryTimeMs = normalizeEpochMillis(a.expiryTimeMs || b.expiryTimeMs || 0);
  const enabled = a.enabled !== undefined ? a.enabled : (b.enabled !== undefined ? b.enabled : true);

  return {
    uploadBytes,
    downloadBytes,
    usedBytes: clampByteNumber(uploadBytes + downloadBytes),
    totalBytes,
    expiryTimeMs,
    enabled
  };
}

function getTrafficCandidateObjects(payload) {
  const source = payload?.obj ?? payload?.data ?? payload?.result ?? payload;
  const candidates = [
    ...normalizeObjectArray(source),
    ...normalizeObjectArray(source?.clientStats),
    ...normalizeObjectArray(source?.client_stats),
    ...normalizeObjectArray(source?.clientTraffics),
    ...normalizeObjectArray(source?.traffics),
    ...normalizeObjectArray(source?.stats),
    ...normalizeObjectArray(source?.clients)
  ];
  if (!candidates.length && source && typeof source === 'object') candidates.push(source);
  return candidates;
}

function pickClientTrafficObject(payload, email, uuid = '') {
  const wanted = String(email || '').trim().toLowerCase();
  const wantedUuid = String(uuid || '').trim().toLowerCase();
  const candidates = getTrafficCandidateObjects(payload);

  if (!wanted && !wantedUuid) return candidates[0] || null;

  return candidates.find(item => wanted && String(fieldValue(item, ['email', 'login', 'name', 'remark'], '')).trim().toLowerCase() === wanted) ||
    candidates.find(item => wantedUuid && String(fieldValue(item, ['id', 'uuid', 'clientId', 'client_id'], '')).trim().toLowerCase() === wantedUuid) ||
    candidates[0] ||
    null;
}

async function getClientTrafficFromApi(node, email, timeoutMs = SUBSCRIPTION_STATS_TIMEOUT_MS, uuid = '') {
  if (isH1CloudNode(node) || isRemnawaveNode(node)) return null;
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail && !uuid) return null;

  const encoded = encodeURIComponent(cleanEmail);
  const paths = cleanEmail ? [
    `/panel/api/clients/traffic/${encoded}`,
    `/panel/api/inbounds/getClientTraffics/${encoded}`,
    `/panel/api/inbounds/getClientTraffics/${cleanEmail}`
  ] : [];
  let lastError = null;

  for (const apiPath of uniqueList(paths)) {
    try {
      const data = await apiGet(node, apiPath, timeoutMs);
      const stat = pickClientTrafficObject(data, cleanEmail, uuid);
      if (!stat) return null;
      return extractTrafficInfoFromClientTraffic(stat);
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function getInboundClientTrafficsFromApi(node, timeoutMs = SUBSCRIPTION_STATS_TIMEOUT_MS) {
  if (isH1CloudNode(node) || isRemnawaveNode(node)) return [];
  const paths = [
    `/panel/api/inbounds/getClientTrafficsById/${encodeURIComponent(node.inbound_id)}`,
    `/panel/api/inbounds/getClientTrafficsById/${node.inbound_id}`
  ];
  let lastError = null;

  for (const apiPath of uniqueList(paths)) {
    try {
      const data = await apiGet(node, apiPath, timeoutMs);
      return getTrafficCandidateObjects(data);
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) throw lastError;
  return [];
}

function pickTrafficFromList(list, email, uuid = '') {
  const cleanEmail = String(email || '').trim();
  const cleanUuid = String(uuid || '').trim();
  return pickClientTrafficObject({ obj: Array.isArray(list) ? list : [] }, cleanEmail, cleanUuid);
}

function getClientNodeLimitGb(row) {
  // Источник истины для отображения лимита в подписке — локальная привязка
  // client_nodes.traffic_gb. 0 или пусто означает безлимит именно на этом узле.
  const value = row?.client_node_traffic_gb ?? row?.traffic_gb ?? 0;
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function getClientNodeLimitBytes(clientRow, row, remoteTotalBytes = 0) {
  // Не подтягиваем remoteTotalBytes для безлимитных узлов: иначе старый/общий
  // лимит из 3x-ui может случайно появиться возле всех регионов.
  const nodeGb = getClientNodeLimitGb(row);
  return nodeGb > 0 ? toTotalGbBytes(nodeGb) : 0;
}

function getClientNodeExpiryMs(clientRow, remoteExpiryMs = 0) {
  // Дата подписки в агрегаторе должна быть главным источником для Happ/подписок.
  // При обновлении из выбранного 3x-ui она копируется в clients.expiry_time;
  // remoteExpiryMs используем только как fallback, если локальной даты нет.
  const local = normalizeEpochMillis(clientRow?.expiry_time || 0);
  if (local > 0) return local;
  return normalizeEpochMillis(remoteExpiryMs);
}

function formatCompactNumber(value, digits = 1) {
  const n = Math.max(0, Number(value || 0));
  const maximumFractionDigits = n >= 10 ? 0 : digits;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(n);
}

function formatTrafficShort(bytes) {
  const n = clampByteNumber(bytes);
  const gb = n / 1024 / 1024 / 1024;
  if (gb >= 1) return `${formatCompactNumber(gb)} ГБ`;
  const mb = n / 1024 / 1024;
  return `${formatCompactNumber(mb, 0)} МБ`;
}

function formatTrafficPair(usedBytes, totalBytes) {
  const usedGb = clampByteNumber(usedBytes) / 1024 / 1024 / 1024;
  const totalGb = clampByteNumber(totalBytes) / 1024 / 1024 / 1024;
  return `${formatCompactNumber(usedGb)}/${formatCompactNumber(totalGb)} ГБ`;
}

function getDaysLeftText(expiryTimeMs) {
  const expiry = normalizeEpochMillis(expiryTimeMs);
  if (!expiry) return '∞ дн.';

  const diff = expiry - Date.now();
  if (diff <= 0) return '0 дн.';

  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  return `${days} дн.`;
}

function shouldShowSubscriptionLimits() {
  return getSetting('subscription_show_limits', '1') !== '0';
}

function shouldSendSubscriptionUserInfo() {
  return getSetting('subscription_userinfo_header', '1') !== '0';
}

function shouldRefreshSubscriptionUsage() {
  return getSetting('subscription_live_usage', '1') !== '0';
}

function getSubscriptionUpdateIntervalHours() {
  const n = Number(getSetting('subscription_update_interval_hours', '1'));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(168, Math.max(1, Math.floor(n)));
}

function getHappProviderId() {
  // Paid Happ app-control features are intentionally disabled.
  return '';
}

function isHappAppControlsEnabled() {
  // Do not send paid Happ application-control parameters at all. Free subscription
  // metadata and optional routing profile are handled separately.
  return false;
}

function isHappAppControlsCheckboxEnabled() {
  return false;
}

function isHappSettingEnabled(key, fallback = '1') {
  return getSetting(key, fallback) !== '0';
}

function getHappNoLimitMode() {
  const mode = String(getSetting('happ_no_limit_mode', 'off') || 'off').trim().toLowerCase();
  return ['off', 'all', 'xhttp'].includes(mode) ? mode : 'off';
}

function getHappBehaviorOptions() {
  return {
    autoUpdate: isHappSettingEnabled('happ_subscription_auto_update_enabled', '1'),
    updateOnOpen: isHappSettingEnabled('happ_update_on_open_enabled', '0'),
    pingOnOpen: isHappSettingEnabled('happ_ping_on_open_enabled', '0'),
    subscriptionsCollapse: isHappSettingEnabled('happ_subscriptions_collapse_enabled', '1'),
    expandNow: isHappSettingEnabled('happ_expand_now_enabled', '0'),
    checkUrlViaProxy: isHappSettingEnabled('happ_check_url_via_proxy_enabled', '0'),
    sniffing: isHappSettingEnabled('happ_sniffing_enabled', '0'),
    forceApplyOnUpdate: isHappSettingEnabled('happ_force_apply_on_update_enabled', '0')
  };
}

function getHappAppControlHeaders() {
  // Paid Happ app-control headers are fully excluded.
  return {};
}

function applyHappAppControlHeaders(res) {
  // No paid Happ app-control headers are ever sent.
}

function getHappSubscriptionProfileHeaderMap(subscriptionName, subscriptionUpdateIntervalHours) {
  const behavior = getHappBehaviorOptions();
  const clientAutoUpdate = getSetting('subscription_client_auto_update_enabled', '1') !== '0';
  const displayTitle = getSubscriptionDisplayTitle(subscriptionName);
  const base = {
    'profile-title': `base64:${Buffer.from(String(displayTitle || ''), 'utf8').toString('base64')}`,
    'subscription-title': `base64:${Buffer.from(String(displayTitle || ''), 'utf8').toString('base64')}`,
    'subscription-revision': String(getSubscriptionRevision()),
    'profile-update-interval': String(subscriptionUpdateIntervalHours),
    'subscription-update-interval': String(subscriptionUpdateIntervalHours),
    'subscription-auto-update-enable': clientAutoUpdate ? '1' : '0'
  };

  return base;
}

// Happ Desktop can render both announce and sub-info as separate cards.
function shouldEmitHappSubInfoBlock() {
  // Если включен announce fallback, тот же текст уже отправляется через
  // обычный announce. Если одновременно
  // отправлять sub-info-text, Happ Desktop может показать два одинаковых блока.
  return isHappInfoBlockEnabled() && !isHappInfoAnnounceFallbackEnabled();
}

function shouldClearHappSubInfoBlock(happInfoText = '') {
  // Happ сохраняет ранее полученный sub-info-text локально. Если текущая
  // подписка больше не должна показывать sub-info, нужно явно отправить
  // пустое значение; иначе старый блок может остаться рядом с announce.
  return !String(happInfoText || '').trim() || !shouldEmitHappSubInfoBlock();
}

function applyHappSubscriptionProfileHeaders(
  res,
  subscriptionName,
  subscriptionUpdateIntervalHours,
  clientRow = null,
  subscriptionUserInfo = '',
  options = {}
) {
  const headers = getHappSubscriptionProfileHeaderMap(subscriptionName, subscriptionUpdateIntervalHours);
  const support = getEffectiveSubscriptionSupportMeta(clientRow);
  const happInfoText = buildHappInfoText(clientRow, subscriptionUserInfo);
  const buttonText = getHappInfoButtonText();
  const buttonLink = getHappInfoButtonLink();
  const includeTextBlocks = options.includeTextBlocks !== false;

  for (const [key, value] of Object.entries(headers)) {
    setSafeAsciiHeader(res, key, String(value));
  }
  applyHappRoutingHeader(res, subscriptionName);

  if (includeTextBlocks) {
    const announceText = buildHappAnnounceText(support, happInfoText);
    if (announceText) {
      setSafeBase64TextHeader(res, 'announce', announceText);
    }

    if (happInfoText && shouldEmitHappSubInfoBlock()) {
      setSafeBase64TextHeader(res, 'sub-info-text', happInfoText);
      setSafeAsciiHeader(res, 'sub-info-color', getHappInfoColor());

      if (buttonText && buttonLink) {
        setSafeBase64TextHeader(res, 'sub-info-button-text', buttonText);
        setSafeAsciiHeader(res, 'sub-info-button-link', buttonLink);
      }
    } else if (shouldClearHappSubInfoBlock(happInfoText)) {
      setEmptyHappMetaHeader(res, 'sub-info-text');
      setEmptyHappMetaHeader(res, 'sub-info-color');
      setEmptyHappMetaHeader(res, 'sub-info-button-text');
      setEmptyHappMetaHeader(res, 'sub-info-button-link');
    }
  }

  if (support.url) {
    setSafeAsciiHeader(res, 'profile-web-page-url', support.url);
    setSafeAsciiHeader(res, 'support-url', support.url);
  }
}

function buildHappAppControlBodyLines() {
  // Paid Happ app-control directives are fully removed.
  // Keep only harmless free comments such as support-url for clients that read
  // metadata from subscription body.
  const lines = [];
  const support = getSubscriptionSupportMeta();
  if (support.url) lines.push(`#support-url: ${support.url}`);
  return lines;
}

function buildNodeLimitRemark(baseName, info) {
  if (!shouldShowSubscriptionLimits()) return baseName;

  const parts = [];
  const totalBytes = clampByteNumber(info?.totalBytes || 0);
  const usedBytes = clampByteNumber(info?.usedBytes || 0);
  const expiryMs = normalizeEpochMillis(info?.expiryTimeMs || 0);

  // По умолчанию не показываем ∞/∞ дн., чтобы названия были короче:
  //   Финляндия / Резервный
  //   Германия / Gemini · 7/50 ГБ
  //   Чехия / Основной · 29 дн.
  // В настройках можно вернуть старое отображение безлимита.
  if (totalBytes > 0) {
    parts.push(formatTrafficPair(usedBytes, totalBytes));
  } else if (shouldShowEmptySubscriptionLimits()) {
    parts.push('∞');
  }

  if (expiryMs > 0) {
    parts.push(getDaysLeftText(expiryMs));
  } else if (shouldShowEmptySubscriptionLimits()) {
    parts.push('∞ дн.');
  }

  return parts.length ? `${baseName} · ${parts.join(' · ')}` : baseName;
}

async function getSubscriptionNodeInfo(row, clientRow, cachedInbound = null) {
  let inbound = cachedInbound || null;
  let source = inbound ? 'cache' : 'local';
  let liveTrafficInfo = null;

  if (shouldRefreshSubscriptionUsage() && String(row?.last_status || '') !== 'offline') {
    // Не блокируем обновление подписки лишним запросом inbound, если inbound уже есть в кэше.
    // Для построения ссылки достаточно cachedInbound, а расход трафика берём отдельным быстрым API.
    if (!inbound) {
      try {
        inbound = await getInbound(row, SUBSCRIPTION_STATS_TIMEOUT_MS);
        source = 'live';
      } catch (err) {
        console.error(`Subscription usage refresh failed for node ${row?.node_id || row?.id || 'unknown'}:`, err.message);
      }
    }

    try {
      liveTrafficInfo = await getClientTrafficFromApi(
        row,
        row?.remote_email || clientRow?.login,
        SUBSCRIPTION_STATS_TIMEOUT_MS
      );
      if (liveTrafficInfo) source = 'live-traffic';
    } catch (err) {
      console.error(`Client traffic refresh failed for node ${row?.node_id || row?.id || 'unknown'}:`, err.message);
    }
  }

  if (!inbound) {
    inbound = cachedInbound || getCachedInbound(row);
    source = inbound ? 'cache' : 'local';
  }

  const inboundInfo = extractTrafficInfoFromInbound(
    inbound,
    row?.remote_uuid || clientRow?.uuid,
    row?.remote_email || clientRow?.login
  );
  const remoteInfo = mergeTrafficInfo(liveTrafficInfo, inboundInfo);

  const totalBytes = getClientNodeLimitBytes(clientRow, row, remoteInfo.totalBytes);
  const expiryTimeMs = getClientNodeExpiryMs(clientRow, remoteInfo.expiryTimeMs);
  const uploadBytes = clampByteNumber(remoteInfo.uploadBytes);
  const downloadBytes = clampByteNumber(remoteInfo.downloadBytes);
  const usedBytes = clampByteNumber(uploadBytes + downloadBytes);

  if (row?.client_node_id) {
    updateClientNodeUsage(row.client_node_id, { uploadBytes, downloadBytes, usedBytes });
  }

  return {
    inbound,
    source,
    uploadBytes,
    downloadBytes,
    usedBytes,
    totalBytes,
    expiryTimeMs,
    enabled: remoteInfo.enabled !== false
  };
}

function buildSubscriptionUserInfo(entries, clientRow) {
  if (!shouldSendSubscriptionUserInfo()) return '';

  let uploadBytes = 0;
  let downloadBytes = 0;
  let totalBytes = 0;
  const expiries = [];

  for (const entry of entries || []) {
    const info = entry?.subscriptionInfo || {};
    const entryTotal = clampByteNumber(info.totalBytes || 0);

    if (entryTotal > 0) {
      totalBytes += entryTotal;
      uploadBytes += clampByteNumber(info.uploadBytes || 0);
      downloadBytes += clampByteNumber(info.downloadBytes || 0);
    }

    const entryExpiry = normalizeEpochMillis(info.expiryTimeMs || 0);
    if (entryExpiry > 0) expiries.push(entryExpiry);
  }

  const clientExpiry = normalizeEpochMillis(clientRow?.expiry_time || 0);
  if (clientExpiry > 0) expiries.push(clientExpiry);

  const expireSeconds = expiries.length ? toEpochSeconds(Math.min(...expiries)) : 0;
  const parts = [`upload=${clampByteNumber(uploadBytes)}`, `download=${clampByteNumber(downloadBytes)}`];

  if (totalBytes > 0) parts.push(`total=${clampByteNumber(totalBytes)}`);
  if (expireSeconds > 0) parts.push(`expire=${expireSeconds}`);

  return parts.join('; ');
}

function setSubscriptionUserInfoHeaders(res, userInfoText) {
  if (userInfoText) {
    res.setHeader('Subscription-Userinfo', userInfoText);
    res.setHeader('subscription-userinfo', userInfoText);
  }

  // Важно: эти заголовки Happ меняют поведение приложения. Если настройка
  // "Передавать настройки Happ через подписку" выключена, не отправляем их
  // вообще. Иначе Happ продолжает менять локальные параметры даже по обычной
  // /json или /sub ссылке.
  if (!isHappAppControlsEnabled()) return;

  const intervalHours = getSubscriptionUpdateIntervalHours();
  res.setHeader('Profile-Update-Interval', String(intervalHours));
  res.setHeader('profile-update-interval', String(intervalHours));
  res.setHeader('Subscription-Update-Interval', String(intervalHours));
}


function findRemoteClient(settings, uuid, email) {
  const clients = Array.isArray(settings?.clients) ? settings.clients : [];
  uuid = String(uuid || '').trim();
  email = String(email || '').trim();
  return clients.find(c => uuid && sameText(c.id, uuid)) ||
         clients.find(c => email && sameText(c.email, email)) || null;
}

function upsertClientNodeMap(clientRow, node, rc, trafficGb) {
  const subUrl = isRemnawaveNode(node)
    ? normalizeRemnawaveSubscriptionUrl(node, rc.originalSub || rc.subscriptionUrl || '')
    : buildNativeSubUrl(node, rc.subId || clientRow.sub_slug);
  const remoteUuid = isRemnawaveNode(node)
    ? String(rc.remoteUserUuid || rc.userUuid || rc.uuid || '').trim()
    : String(rc.uuid || clientRow.uuid || '').trim();
  const limitIp = nullablePositiveInteger(rc.limitIp);
  const uploadBytes = clampByteNumber(rc.uploadBytes || 0);
  const downloadBytes = clampByteNumber(rc.downloadBytes || 0);
  const usedBytes = clampByteNumber(rc.usedBytes || uploadBytes + downloadBytes);
  const old = db.prepare('SELECT * FROM client_nodes WHERE client_id = ? AND node_id = ?').get(clientRow.id, node.id);

  if (!old) {
    const info = db.prepare('INSERT INTO client_nodes (client_id,node_id,remote_email,remote_uuid,remote_sub_url,traffic_gb,limit_ip,upload_bytes,download_bytes,used_bytes,enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        clientRow.id,
        node.id,
        rc.email || clientRow.login,
        remoteUuid || clientRow.uuid,
        subUrl,
        Math.max(0, Number(trafficGb || 0)),
        limitIp,
        uploadBytes,
        downloadBytes,
        usedBytes,
        rc.enable !== false ? 1 : 0
      );
    return { row: db.prepare('SELECT * FROM client_nodes WHERE id = ?').get(info.lastInsertRowid), created: true };
  }

  db.prepare('UPDATE client_nodes SET remote_email = ?, remote_uuid = ?, remote_sub_url = ?, traffic_gb = ?, limit_ip = ?, upload_bytes = ?, download_bytes = ?, used_bytes = ?, enabled = ? WHERE id = ?')
    .run(
      rc.email || clientRow.login,
      remoteUuid || clientRow.uuid,
      subUrl,
      Math.max(0, Number(trafficGb || 0)),
      limitIp,
      uploadBytes,
      downloadBytes,
      usedBytes,
      rc.enable !== false ? 1 : 0,
      old.id
    );

  return { row: db.prepare('SELECT * FROM client_nodes WHERE id = ?').get(old.id), created: false };
}

function remoteClientFromAggregatorState(rc, clientRow) {
  return {
    ...rc,
    uuid: rc.uuid || clientRow.uuid,
    email: rc.email || clientRow.login,
    flow: clientRow.flow || rc.flow || '',
    limitIp: Math.max(0, Number(clientRow.limit_ip ?? rc.limitIp ?? 1)),
    totalGB: toTotalGbBytes(Number(clientRow.traffic_gb || 0)),
    expiryTime: Math.max(0, Number(clientRow.expiry_time || 0)),
    enable: isClientEffectivelyEnabled(clientRow),
    subId: clientRow.sub_slug || rc.subId,
    reset: Math.max(0, Number(clientRow.duration_days || 0)),
    comment: String(clientRow.comment || rc.comment || '').trim()
  };
}

function buildClientPayloadForImport(node, inbound, rc, clientRow, oldRemote) {
  const settings = safeParseJsonField(inbound.settings, {});
  const effectiveRc = remoteClientFromAggregatorState(rc, clientRow);
  const trafficGb = Math.max(0, Number(clientRow.traffic_gb || 0));
  return {
    id: Number(node.inbound_id),
    settings: JSON.stringify({ clients: [{
      id: effectiveRc.uuid || clientRow.uuid,
      email: effectiveRc.email || clientRow.login,
      flow: effectiveRc.flow || oldRemote?.flow || settings.clients?.[0]?.flow || '',
      limitIp: effectiveRc.limitIp,
      totalGB: toTotalGbBytes(trafficGb),
      expiryTime: effectiveRc.expiryTime,
      enable: effectiveRc.enable,
      tgId: oldRemote?.tgId || rc.tgId || '',
      subId: effectiveRc.subId || oldRemote?.subId || clientRow.sub_slug,
      reset: effectiveRc.reset,
      comment: effectiveRc.comment
    }] })
  };
}

async function ensureImportedClientOnNode(node, clientRow, rc) {
  if (isRemnawaveNode(node)) {
    return ensureRemnawaveUserOnNode(node, clientRow, {
      uuid: clientRow.uuid,
      email: clientRow.login,
      traffic_gb: clientRow.traffic_gb,
      limit_ip: clientRow.limit_ip,
      expiry_time: clientRow.expiry_time,
      duration_days: clientRow.duration_days,
      enabled: clientRow.enabled !== 0,
      comment: clientRow.comment || '',
      node_enabled: true
    });
  }
  if (isH1CloudNode(node)) {
    return ensureH1CloudClientOnNode(node, clientRow, {
      uuid: clientRow.uuid,
      email: clientRow.login,
      subId: clientRow.sub_slug,
      traffic_gb: clientRow.traffic_gb,
      limit_ip: clientRow.limit_ip,
      expiry_time: clientRow.expiry_time,
      duration_days: clientRow.duration_days,
      enabled: clientRow.enabled !== 0,
      comment: clientRow.comment || '',
      node_enabled: true
    });
  }
  if (isH1Cloud3xuiNode(node)) {
    return ensureH1Cloud3xuiClientOnNode(node, clientRow, {
      uuid: rc.uuid || clientRow.uuid,
      email: rc.email || clientRow.login,
      subId: rc.subId || clientRow.sub_slug,
      traffic_gb: clientRow.traffic_gb,
      limit_ip: clientRow.limit_ip,
      expiry_time: clientRow.expiry_time,
      duration_days: clientRow.duration_days,
      enabled: clientRow.enabled !== 0,
      comment: clientRow.comment || '',
      node_enabled: true
    });
  }
  const inbound = await getInbound(node);
  const settings = safeParseJsonField(inbound.settings, {});
  const oldRemote = findRemoteClient(settings, rc.uuid || clientRow.uuid, rc.email || clientRow.login);
  const expectedUuid = String(rc.uuid || clientRow.uuid || '').trim();
  const expectedEmail = String(rc.email || clientRow.login || '').trim();
  const trafficGb = Math.max(0, Number(clientRow.traffic_gb || 0));
  const effectiveRc = remoteClientFromAggregatorState(rc, clientRow);

  if (oldRemote && expectedUuid && oldRemote.id && !sameText(oldRemote.id, expectedUuid) && isSameLogin(getRemoteClientEmail(oldRemote), expectedEmail)) {
    throw makeRemoteClientConflictError(node, expectedEmail, oldRemote, {
      uuid: expectedUuid,
      email: expectedEmail,
      trafficGb,
      limitIp: rc.limitIp,
      expiryTime: rc.expiryTime
    });
  }

  const payload = buildClientPayloadForImport(node, inbound, rc, clientRow, oldRemote);

  if (!oldRemote) {
    try {
      await addClient(node, payload);
      const map = upsertClientNodeMap(clientRow, node, effectiveRc, trafficGb);
      return { mapCreated: map.created, remoteCreated: true, remoteUpdated: false };
    } catch (err) {
      if (err?.code !== 'DUPLICATE_EMAIL') throw err;
      const freshInbound = await getInbound(node);
      const freshSettings = safeParseJsonField(freshInbound.settings, {});
      const fresh = findRemoteClient(freshSettings, expectedUuid, expectedEmail);
      if (!fresh) throw err;
      if (fresh.id && expectedUuid && !sameText(fresh.id, expectedUuid)) {
        throw makeRemoteClientConflictError(node, expectedEmail, fresh, {
          uuid: expectedUuid,
          email: expectedEmail,
          trafficGb,
          limitIp: rc.limitIp,
          expiryTime: rc.expiryTime
        });
      }
      await updateClient(node, fresh.id || expectedUuid, payload);
      const map = upsertClientNodeMap(clientRow, node, effectiveRc, trafficGb);
      return { mapCreated: map.created, remoteCreated: false, remoteUpdated: true };
    }
  }

  try {
    await updateClient(node, oldRemote.id || expectedUuid, payload);
    const map = upsertClientNodeMap(clientRow, node, effectiveRc, trafficGb);
    return { mapCreated: map.created, remoteCreated: false, remoteUpdated: true };
  } catch (e) {
    const freshInbound = await getInbound(node);
    const freshSettings = safeParseJsonField(freshInbound.settings, {});
    const fresh = findRemoteClient(freshSettings, expectedUuid, expectedEmail);
    if (!fresh) {
      await addClient(node, payload);
      const map = upsertClientNodeMap(clientRow, node, effectiveRc, trafficGb);
      return { mapCreated: map.created, remoteCreated: true, remoteUpdated: false };
    }
    if (fresh.id && expectedUuid && !sameText(fresh.id, expectedUuid)) {
      throw makeRemoteClientConflictError(node, expectedEmail, fresh, {
        uuid: expectedUuid,
        email: expectedEmail,
        trafficGb,
        limitIp: rc.limitIp,
        expiryTime: rc.expiryTime
      });
    }
    throw e;
  }
}

function findLocalClientByRemote(rc) {
  const uuid = String(rc?.uuid || '').trim();
  const subId = String(rc?.subId || '').trim();
  const email = String(rc?.email || '').trim();

  if (uuid) {
    const byUuid = db.prepare('SELECT * FROM clients WHERE uuid = ?').get(uuid);
    if (byUuid) return byUuid;
  }

  if (subId) {
    const bySub = db.prepare('SELECT * FROM clients WHERE sub_slug = ?').get(subId);
    if (bySub) return bySub;
  }

  if (email) {
    const byLogin = db.prepare('SELECT * FROM clients WHERE LOWER(login) = LOWER(?)').get(email);
    if (byLogin) return byLogin;
  }

  return null;
}

function chooseSubSlugForRemote(rc, existingClientId = 0) {
  const requested = String(rc?.subId || '').trim() || randomUUID().replace(/-/g, '').slice(0, 16);
  const owner = db.prepare('SELECT id FROM clients WHERE sub_slug = ?').get(requested);
  if (!owner || Number(owner.id) === Number(existingClientId)) return requested;
  return `${requested}-${randomUUID().replace(/-/g, '').slice(0, 6)}`;
}

function upsertLocalClientFromRemote(rc, sourceNode = null) {
  const remoteTrafficGb = trafficGbFromRemoteValue(rc.totalGB);
  const remoteDurationDays = durationDaysFromRemoteClient(rc, null);
  const remoteLogin = String(rc.email || '').trim() || 'imported';
  const remoteComment = String(rc.comment || '').trim();
  let clientRow = findLocalClientByRemote(rc);

  if (!clientRow) {
    const subSlug = chooseSubSlugForRemote(rc, 0);
    const info = db.prepare(`
      INSERT INTO clients (login, display_name, uuid, sub_slug, duration_days, traffic_gb, limit_ip, expiry_time, enabled, comment, flow)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      makeUniqueLogin(remoteLogin),
      remoteLogin,
      rc.uuid,
      subSlug,
      remoteDurationDays,
      remoteTrafficGb,
      Math.max(0, Number(rc.limitIp ?? 1)),
      normalizeRemoteEpochMillis(rc.expiryTime || 0),
      rc.enable !== false ? 1 : 0,
      remoteComment,
      String(rc.flow || '').trim()
    );
    clientRow = db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid);
    const map = sourceNode ? upsertClientNodeMap(clientRow, sourceNode, rc, remoteTrafficGb) : null;
    return { clientRow, created: true, updated: false, mapCreated: Boolean(map?.created) };
  }

  // Existing clients are owned by the aggregator. Import/sync from a source node
  // must not re-extend expired users or overwrite limits/dates with old 3x-ui data.
  const subSlug = chooseSubSlugForRemote(rc, clientRow.id);
  const newLogin = makeUniqueLogin(remoteLogin, clientRow.id);
  db.prepare(`
    UPDATE clients
    SET login = ?, display_name = ?, uuid = ?, sub_slug = ?, duration_days = ?, traffic_gb = ?, limit_ip = ?, expiry_time = ?, enabled = ?, comment = ?, flow = ?
    WHERE id = ?
  `).run(
    newLogin || clientRow.login,
    clientRow.display_name || remoteLogin,
    rc.uuid || clientRow.uuid,
    subSlug,
    Math.max(0, Number(clientRow.duration_days || 0)),
    Math.max(0, Number(clientRow.traffic_gb || 0)),
    Math.max(0, Number(clientRow.limit_ip ?? 1)),
    Math.max(0, Number(clientRow.expiry_time || 0)),
    Number(clientRow.enabled) !== 0 ? 1 : 0,
    clientRow.comment || remoteComment || '',
    String(clientRow.flow || rc.flow || '').trim(),
    clientRow.id
  );

  clientRow = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientRow.id);
  const effectiveRc = remoteClientFromAggregatorState(rc, clientRow);
  const map = sourceNode ? upsertClientNodeMap(clientRow, sourceNode, effectiveRc, Number(clientRow.traffic_gb || 0)) : null;
  return { clientRow, created: false, updated: true, mapCreated: Boolean(map?.created) };
}

function normalizePostedNodeIds(value) {
  const list = Array.isArray(value) ? value : (value === undefined || value === null || value === '' ? [] : [value]);
  return uniqueList(list.map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0));
}

function getEnabledNodesByIds(nodeIds, excludeIds = []) {
  const ids = normalizePostedNodeIds(nodeIds);
  const excluded = new Set(normalizePostedNodeIds(excludeIds));
  if (!ids.length) return [];
  const wanted = new Set(ids);
  return db.prepare(`SELECT * FROM nodes WHERE enabled = 1 ORDER BY ${nodeOrderSql()}`).all()
    .filter(node => isClientManagedNode(node) && wanted.has(Number(node.id)) && !excluded.has(Number(node.id)));
}

async function preflightLongOperationNodes(nodes, operation = null, errors = [], label = 'Проверяю узлы') {
  const healthy = [];
  for (let i = 0; i < nodes.length; i += 1) {
    if (operation?.isCancelled()) break;
    const node = nodes[i];
    operation?.setDetail(`${label}: ${getNodePublicName(node)} (${i + 1}/${nodes.length})`);
    try {
      const probe = await checkNode(node, {
        timeoutMs: Math.min(Number(NODE_HEALTHCHECK_TIMEOUT_MS || NODE_API_TIMEOUT_MS), 5000),
        lightweight: true
      });
      if (!probe.ok) {
        errors.push(`${getNodePublicName(node)}: узел пропущен до начала синхронизации — ${probe.error || 'не отвечает'}`);
        continue;
      }
      healthy.push(node);
    } catch (err) {
      errors.push(`${getNodePublicName(node)}: узел пропущен до начала синхронизации — ${err.message || err}`);
    }
  }
  return healthy;
}

async function refreshLocalClientsFromSourceNode(sourceNode, operation = null) {
  operation?.setDetail(`Читаю клиентов из ${getNodePublicName(sourceNode)}`);
  const remoteClients = await importClientsFromNode(sourceNode);
  let imported = 0, updated = 0, mappingsCreated = 0, failed = 0, completed = 0;
  let cancelled = false;
  const errors = [];
  operation?.setProgress(0, remoteClients.length, `Импортирую клиентов из ${getNodePublicName(sourceNode)}`);

  for (const rc of remoteClients) {
    if (operation?.isCancelled()) { cancelled = true; break; }
    try {
      const result = upsertLocalClientFromRemote(rc, sourceNode);
      if (result.created) imported++;
      if (result.updated) updated++;
      if (result.mapCreated) mappingsCreated++;
    } catch (e) {
      failed++;
      const msg = `${rc.email || rc.uuid || 'client'}: ${e.message || e}`;
      errors.push(msg);
      console.error('Не удалось обновить локального клиента из узла:', msg);
    }
    completed++;
    operation?.setProgress(completed, remoteClients.length, `Импорт: ${rc.email || rc.uuid || 'клиент'}`);
  }

  return { imported, updated, mappingsCreated, failed, cancelled, completed, errors: errors.slice(0, 10), totalSourceClients: remoteClients.length };
}

function buildRemoteClientLookup(remoteClients = []) {
  const byUuid = new Map();
  const byEmail = new Map();
  const bySubId = new Map();
  const add = (map, value, row) => {
    const key = String(value || '').trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, row);
  };

  for (const row of Array.isArray(remoteClients) ? remoteClients : []) {
    add(byUuid, row?.uuid || row?.id, row);
    add(byEmail, getRemoteClientEmail(row), row);
    add(bySubId, row?.subId || row?.sub_id, row);
  }
  return { byUuid, byEmail, bySubId };
}

function findRemoteClientForLocalClient(lookup, client) {
  const uuid = String(client?.uuid || '').trim().toLowerCase();
  const email = String(client?.login || '').trim().toLowerCase();
  const subId = String(client?.sub_slug || '').trim().toLowerCase();
  if (uuid && lookup?.byUuid?.has(uuid)) return { row: lookup.byUuid.get(uuid), matchedBy: 'uuid' };
  if (email && lookup?.byEmail?.has(email)) return { row: lookup.byEmail.get(email), matchedBy: 'email' };
  if (subId && lookup?.bySubId?.has(subId)) return { row: lookup.bySubId.get(subId), matchedBy: 'subId' };
  return { row: null, matchedBy: '' };
}

function hasUnsafeRemoteClientIdentityConflict(client, remote, matchedBy = '') {
  if (!client || !remote) return false;
  const localUuid = String(client.uuid || '').trim();
  const remoteUuid = String(remote.uuid || remote.id || '').trim();
  if (!localUuid || !remoteUuid || sameText(localUuid, remoteUuid)) return false;
  // A UUID match is authoritative. Email/subId matches with another UUID must
  // never be silently attached because that could replace somebody else's
  // credentials on the remote panel.
  return matchedBy === 'email' || matchedBy === 'subId';
}

async function createExistingClientsOnNode(targetNode, operation = null, options = {}) {
  const requestedIds = normalizePostedNodeIds(options.clientIds || []);
  const clients = requestedIds.length
    ? db.prepare(`SELECT * FROM clients WHERE id IN (${requestedIds.map(() => '?').join(',')}) ORDER BY id ASC`).all(...requestedIds)
    : db.prepare('SELECT * FROM clients ORDER BY id ASC').all();

  const preflightErrors = [];
  operation?.setDetail(`Проверяю узел ${getNodePublicName(targetNode)}`);
  const healthy = await preflightLongOperationNodes([targetNode], operation, preflightErrors, 'Проверка узла');
  if (operation?.isCancelled()) {
    return { totalClients: clients.length, completed: 0, skippedExisting: 0, skippedAfterFailure: 0, remoteCreated: 0, remoteUpdated: 0, mappingsCreated: 0, conflicts: 0, failed: preflightErrors.length, cancelled: true, errors: preflightErrors };
  }
  if (!healthy.length) throw new Error(preflightErrors[0] || `${getNodePublicName(targetNode)} не отвечает.`);

  operation?.setDetail(`Читаю существующих клиентов с ${getNodePublicName(targetNode)}`);
  const remoteClients = await importClientsFromNode(targetNode);
  const remoteLookup = buildRemoteClientLookup(remoteClients);

  let remoteCreated = 0;
  let remoteUpdated = 0;
  let mappingsCreated = 0;
  let skippedExisting = 0;
  let skippedAfterFailure = 0;
  let conflicts = 0;
  let failed = preflightErrors.length;
  let completed = 0;
  let cancelled = false;
  let consecutiveTransportFailures = 0;
  const errors = [...preflightErrors];

  operation?.setProgress(0, clients.length, `Добавляю только отсутствующих клиентов на ${getNodePublicName(targetNode)}`);

  for (const client of clients) {
    if (operation?.isCancelled()) { cancelled = true; break; }
    try {
      const match = findRemoteClientForLocalClient(remoteLookup, client);
      if (match.row) {
        if (hasUnsafeRemoteClientIdentityConflict(client, match.row, match.matchedBy)) {
          conflicts++;
          throw new Error(`на узле уже есть ${client.login} с другим UUID; клиент пропущен без изменений`);
        }

        if (isRemnawaveNode(targetNode)) {
          const existingMap = db.prepare('SELECT * FROM client_nodes WHERE client_id = ? AND node_id = ?').get(client.id, targetNode.id);
          const result = await ensureAggregatorClientOnNode(targetNode, client, {
            map: existingMap || undefined,
            uuid: client.uuid,
            email: match.row.email || client.login,
            traffic_gb: client.traffic_gb,
            limit_ip: client.limit_ip,
            expiry_time: client.expiry_time,
            duration_days: client.duration_days,
            enabled: client.enabled !== 0,
            comment: client.comment || '',
            node_enabled: true,
            skip_existing: true
          });
          if (result.mapCreated) mappingsCreated++;
          if (result.remoteUpdated) remoteUpdated++;
        } else {
          const mapResult = upsertClientNodeMap(
            client,
            targetNode,
            match.row,
            trafficGbFromRemoteValue(match.row.totalGB)
          );
          if (mapResult.created) mappingsCreated++;
        }

        skippedExisting++;
        consecutiveTransportFailures = 0;
      } else {
        const result = await ensureAggregatorClientOnNode(targetNode, client, {
          uuid: client.uuid,
          email: client.login,
          subId: client.sub_slug,
          traffic_gb: client.traffic_gb,
          limit_ip: client.limit_ip,
          expiry_time: client.expiry_time,
          duration_days: client.duration_days,
          enabled: client.enabled !== 0,
          comment: client.comment || '',
          node_enabled: true,
          skip_existing: true
        });
        if (result.mapCreated) mappingsCreated++;
        if (result.remoteCreated || result.remoteAttached) remoteCreated++;
        if (result.skippedExisting) skippedExisting++;
        // A concurrent request may have created the client after the initial
        // snapshot. Count that as an already-existing race, not a requested
        // bulk update.
        if (result.remoteUpdated) {
          remoteUpdated++;
        }
        consecutiveTransportFailures = 0;

        const normalized = {
          uuid: client.uuid,
          id: client.uuid,
          email: client.login,
          subId: client.sub_slug,
          totalGB: toTotalGbBytes(client.traffic_gb),
          limitIp: client.limit_ip,
          expiryTime: client.expiry_time,
          enable: client.enabled !== 0,
          comment: client.comment || ''
        };
        const keyUuid = String(client.uuid || '').trim().toLowerCase();
        const keyEmail = String(client.login || '').trim().toLowerCase();
        const keySubId = String(client.sub_slug || '').trim().toLowerCase();
        if (keyUuid) remoteLookup.byUuid.set(keyUuid, normalized);
        if (keyEmail) remoteLookup.byEmail.set(keyEmail, normalized);
        if (keySubId) remoteLookup.bySubId.set(keySubId, normalized);
      }
    } catch (e) {
      failed++;
      const msg = `${client.login || client.display_name || client.id}: ${e.message || e}`;
      errors.push(msg);
      console.error('Не удалось создать отсутствующего клиента на узле:', msg);
      if (isNodeFastFailError(e)) consecutiveTransportFailures++;
      else consecutiveTransportFailures = 0;
    }
    completed++;
    operation?.setProgress(completed, clients.length, `${getNodePublicName(targetNode)}: ${client.login || client.id}`);

    if (consecutiveTransportFailures >= 2) {
      skippedAfterFailure = Math.max(0, clients.length - completed);
      errors.push(`${getNodePublicName(targetNode)}: после двух сетевых ошибок подряд оставшиеся ${skippedAfterFailure} клиентов не запускались.`);
      operation?.setDetail(`${getNodePublicName(targetNode)} исключён из операции после повторных сетевых ошибок`);
      break;
    }
  }

  return {
    totalClients: clients.length,
    remoteClientsBefore: remoteClients.length,
    completed,
    skippedExisting,
    skippedAfterFailure,
    remoteCreated,
    remoteUpdated,
    mappingsCreated,
    conflicts,
    failed,
    cancelled,
    errors: errors.slice(0, 12)
  };
}

async function syncClientsFromSourceNode(sourceNode, options = {}) {
  const operation = options.operation || null;
  const requestedTargets = getEnabledNodesByIds(options.targetNodeIds || [], [sourceNode.id]);
  if (!requestedTargets.length) throw new Error('Для синхронизации выбери хотя бы один целевой узел, отличный от узла-источника.');

  const errors = [];
  operation?.setDetail(`Проверяю ${requestedTargets.length} целевых узлов`);
  const targetNodes = await preflightLongOperationNodes(requestedTargets, operation, errors, 'Проверка перед импортом');
  if (operation?.isCancelled()) {
    return { imported: 0, updated: 0, mappingsCreated: 0, remoteCreated: 0, remoteUpdated: 0, skipped: 0, failed: errors.length, errors, totalSourceClients: 0, completed: 0, cancelled: true, targetNodes: targetNodes.length };
  }
  if (!targetNodes.length) {
    throw new Error(`Ни один выбранный узел не прошёл проверку. ${errors.slice(0, 3).join(' | ')}`);
  }

  operation?.setDetail(`Читаю клиентов из ${getNodePublicName(sourceNode)}`);
  const remoteClients = await importClientsFromNode(sourceNode);
  let imported = 0, updated = 0, mappingsCreated = 0, remoteCreated = 0, remoteUpdated = 0, skipped = 0, failed = errors.length;
  let completed = 0, cancelled = false;
  const targetFailureCounts = new Map();
  const skippedTargetIds = new Set();
  const totalSteps = remoteClients.length * (1 + targetNodes.length);
  operation?.setProgress(0, totalSteps, `Источник: ${getNodePublicName(sourceNode)}; целей: ${targetNodes.length}`);

  for (const rc of remoteClients) {
    if (operation?.isCancelled()) { cancelled = true; break; }
    let clientRow;
    try {
      const localResult = upsertLocalClientFromRemote(rc, sourceNode);
      clientRow = localResult.clientRow;
      if (localResult.created) imported++;
      if (localResult.updated) updated++;
      if (localResult.mapCreated) mappingsCreated++;
    } catch (e) {
      failed++;
      const msg = `${rc.email || rc.uuid || 'client'}: ${e.message || e}`;
      errors.push(msg);
      console.error('Не удалось импортировать клиента из узла: ' + msg);
      completed += 1 + targetNodes.length;
      operation?.setProgress(completed, totalSteps, `Ошибка локального импорта: ${rc.email || rc.uuid || 'клиент'}`);
      continue;
    }
    completed++;
    operation?.setProgress(completed, totalSteps, `Импортирован локально: ${rc.email || rc.uuid || 'клиент'}`);

    for (const node of targetNodes) {
      if (operation?.isCancelled()) { cancelled = true; break; }
      if (skippedTargetIds.has(Number(node.id))) {
        skipped++;
        completed++;
        operation?.setProgress(completed, totalSteps, `${getNodePublicName(node)} пропущен: ранее потерял связь`);
        continue;
      }
      try {
        const r = await ensureImportedClientOnNode(node, clientRow, rc);
        if (r.mapCreated) mappingsCreated++;
        if (r.remoteCreated) remoteCreated++;
        if (r.remoteUpdated) remoteUpdated++;
        targetFailureCounts.set(Number(node.id), 0);
      } catch (e) {
        failed++;
        const msg = `${getNodePublicName(node)}: ${rc.email || rc.uuid || 'клиент'}: ${e.message || e}`;
        errors.push(msg);
        console.error('Не удалось синхронизировать клиента:', msg);
        if (isNodeFastFailError(e)) {
          const count = Number(targetFailureCounts.get(Number(node.id)) || 0) + 1;
          targetFailureCounts.set(Number(node.id), count);
          if (count >= 2) {
            skippedTargetIds.add(Number(node.id));
            errors.push(`${getNodePublicName(node)}: узел исключён из текущей операции после двух сетевых ошибок подряд.`);
          }
        } else {
          targetFailureCounts.set(Number(node.id), 0);
        }
      }
      completed++;
      operation?.setProgress(completed, totalSteps, `${getNodePublicName(node)}: ${rc.email || rc.uuid || 'клиент'}`);
    }
    if (cancelled) break;
  }

  return {
    imported,
    updated,
    mappingsCreated,
    remoteCreated,
    remoteUpdated,
    skipped,
    failed,
    completed,
    cancelled,
    targetNodes: targetNodes.length,
    errors: errors.slice(0, 12),
    totalSourceClients: remoteClients.length
  };
}


async function getClientConfigFromNode(node, clientUuid, clientEmail) {
  const inbound = await getInbound(node);
  const settings = safeParseJsonField(inbound.settings, {});
  const clients = settings.clients || [];

  const clientCfg =
    clients.find(c => sameText(c.id, clientUuid)) ||
    clients.find(c => sameText(c.email, clientEmail));

  return { inbound, clientCfg };
}

function pickClientFlow(settings, uuid, fallback = '') {
  const clients = Array.isArray(settings?.clients) ? settings.clients : [];
  return clients.find(c => c.id === uuid)?.flow || fallback || clients[0]?.flow || '';
}

function findCurrentRemoteClient(settings, map, client, opts = {}) {
  const clients = Array.isArray(settings?.clients) ? settings.clients : [];
  const candidates = [
    map?.remote_uuid,
    client?.uuid,
    opts?.uuid,
    map?.remote_email,
    client?.login,
    opts?.email
  ].map(v => String(v || '').trim()).filter(Boolean);

  for (const value of candidates) {
    const byId = clients.find(c => String(c?.id || '').trim() === value);
    if (byId) return byId;
  }

  for (const value of candidates) {
    const byEmail = clients.find(c => sameText(c?.email, value));
    if (byEmail) return byEmail;
  }

  return null;
}

async function findCurrentRemoteClientForNode(node, settings, map, client, opts = {}) {
  if (is3xuiV3Mode(node)) {
    try {
      const rows = await getClientsFromNew3xuiApi(node);
      const fakeSettings = { clients: rows };
      const found = findCurrentRemoteClient(fakeSettings, map, client, opts);
      if (found) return found;
      // On provider-managed H1Cloud 3x-ui, an inbound-only entry is an orphan,
      // not a valid global client. Do not silently treat it as current because
      // the next v3 update will fail with `record not found`.
      if (isH1Cloud3xuiNode(node)) return null;
    } catch (err) {
      if (isH1Cloud3xuiNode(node)) throw err;
      // Fallback to cached/inbound settings below for ordinary/legacy panels.
    }
  }
  return findCurrentRemoteClient(settings, map, client, opts);
}


function findInboundClientMatches(settings, identifiers = {}) {
  const clients = Array.isArray(settings?.clients) ? settings.clients : [];
  const ids = new Set([
    identifiers.uuid,
    identifiers.remoteUuid,
    identifiers.clientUuid
  ].map(value => String(value || '').trim()).filter(Boolean));
  const emails = new Set([
    identifiers.email,
    identifiers.remoteEmail,
    identifiers.login
  ].map(normalizeLoginKey).filter(Boolean));

  return clients.filter(row => {
    const id = String(row?.id || row?.uuid || '').trim();
    const email = normalizeLoginKey(getRemoteClientEmail(row));
    return (id && ids.has(id)) || (email && emails.has(email));
  });
}

function makeH1Cloud3xuiOrphanError(node, email, matches = []) {
  const count = Math.max(1, Number(matches.length || 0));
  const duplicateText = count > 1 ? ` Найдено совпадающих записей в inbound: ${count}.` : '';
  return new Error(
    `${getNodePublicName(node)}: клиент ${email} присутствует в settings.clients inbound, ` +
    `но отсутствует в глобальном разделе «Клиенты» 3x-ui (record not found).${duplicateText} ` +
    `Это повреждённая/осиротевшая запись, обычно созданная старым fallback API. ` +
    `Удалите все дубли ${email} из оригинальной панели H1Cloud 3x-ui и повторите добавление. ` +
    `Агрегатор больше не будет дописывать клиента через legacy inbound API.`
  );
}

async function getH1Cloud3xuiClientState(node, inbound, identifiers = {}) {
  const settings = safeParseJsonField(inbound?.settings, {});
  const email = String(identifiers.email || identifiers.remoteEmail || identifiers.login || '').trim();
  if (!email) throw new Error('H1Cloud 3x-ui: не указан логин клиента.');

  const inboundMatches = findInboundClientMatches(settings, identifiers);
  if (inboundMatches.length > 1) throw makeH1Cloud3xuiOrphanError(node, email, inboundMatches);

  // During a rename the local login may already be new while the provider still
  // stores the previous remote email. Look up both without creating a duplicate.
  const lookupEmails = uniqueList([
    identifiers.email,
    identifiers.remoteEmail,
    identifiers.login
  ].map(value => String(value || '').trim()).filter(Boolean));
  let globalClient = null;
  for (const lookupEmail of lookupEmails) {
    globalClient = await findClientViaNewApi(node, lookupEmail);
    if (globalClient) break;
  }

  if (!globalClient && inboundMatches.length) throw makeH1Cloud3xuiOrphanError(node, email, inboundMatches);

  if (globalClient && inboundMatches.length) {
    const inboundUuid = String(inboundMatches[0]?.id || inboundMatches[0]?.uuid || '').trim();
    const globalUuid = String(globalClient?.id || '').trim();
    if (inboundUuid && globalUuid && !sameText(inboundUuid, globalUuid)) {
      throw new Error(
        `${getNodePublicName(node)}: у клиента ${email} UUID в inbound (${inboundUuid}) ` +
        `не совпадает с UUID глобального клиента (${globalUuid}). Удалите конфликтующую запись в оригинальной 3x-ui панели.`
      );
    }
  }

  const attached = Boolean(globalClient && (
    isClientLinkedToInbound(globalClient, node) ||
    inboundMatches.some(row => sameText(row?.id || row?.uuid, globalClient?.id) || isSameLogin(getRemoteClientEmail(row), globalClient?.email || email))
  ));

  return { settings, globalClient, inboundMatches, attached };
}

function h1Cloud3xuiApiClientFromRemote(remote = {}) {
  return {
    id: String(remote.id || remote.uuid || '').trim(),
    email: String(remote.email || '').trim(),
    enable: remote.enable === undefined ? true : Boolean(remote.enable),
    limitIp: Math.max(0, Number(remote.limitIp ?? 0)),
    totalGB: clampByteNumber(remote.totalGB ?? 0),
    expiryTime: normalizeRemoteEpochMillis(remote.expiryTime ?? 0),
    reset: Math.max(0, Number(remote.reset || 0)),
    subId: String(remote.subId || '').trim(),
    password: String(remote.password || '').trim(),
    auth: String(remote.auth || '').trim(),
    security: String(remote.security || '').trim(),
    tgId: remote.tgId === undefined || remote.tgId === null || remote.tgId === '' ? 0 : remote.tgId,
    group: String(remote.group || '').trim(),
    comment: String(remote.comment || '').trim(),
    flow: String(remote.flow || '').trim()
  };
}

function h1Cloud3xuiClientValueEquals(key, left, right) {
  if (['limitIp', 'totalGB', 'expiryTime', 'reset'].includes(key)) return Number(left || 0) === Number(right || 0);
  if (key === 'enable') return Boolean(left) === Boolean(right);
  return String(left ?? '').trim() === String(right ?? '').trim();
}

function buildH1Cloud3xuiProtectedClientUpdate(node, remote, client, opts = {}) {
  if (!opts.h1cloud_allow_client_update) return { changed: false, fields: [], payload: null };

  const current = h1Cloud3xuiApiClientFromRemote(remote);
  const next = { ...current };
  const candidateFields = [];
  const explicitMask = Array.isArray(opts.h1cloud_update_fields)
    ? new Set(opts.h1cloud_update_fields.map(value => String(value || '').trim()).filter(Boolean))
    : null;
  const fieldAllowed = key => !explicitMask || explicitMask.has(key);

  // Only explicitly requested client-level fields may be changed. Inbound
  // transport, SNI, XHTTP/Reality, External Proxy and flow are never written.
  if (fieldAllowed('email') && Object.prototype.hasOwnProperty.call(opts, 'email')) {
    const email = String(opts.email || client?.login || current.email || '').trim();
    if (email) { next.email = email; candidateFields.push('email'); }
  }
  if (fieldAllowed('limit_ip') && Object.prototype.hasOwnProperty.call(opts, 'limit_ip')) {
    next.limitIp = Math.max(0, Number(opts.limit_ip || 0));
    candidateFields.push('limitIp');
  }
  if (fieldAllowed('traffic_gb') && Object.prototype.hasOwnProperty.call(opts, 'traffic_gb')) {
    next.totalGB = toTotalGbBytes(getRemoteTrafficGbForNode(node, opts.traffic_gb));
    candidateFields.push('totalGB');
  }
  if (fieldAllowed('expiry_time') && Object.prototype.hasOwnProperty.call(opts, 'expiry_time')) {
    next.expiryTime = getRemoteExpiryForNode(node, opts.expiry_time);
    candidateFields.push('expiryTime');
  }
  if ((fieldAllowed('enabled') || fieldAllowed('node_enabled')) && (Object.prototype.hasOwnProperty.call(opts, 'enabled') || Object.prototype.hasOwnProperty.call(opts, 'node_enabled'))) {
    const globalEnabled = Object.prototype.hasOwnProperty.call(opts, 'enabled') ? Boolean(opts.enabled) : client?.enabled !== 0;
    const nodeEnabled = Object.prototype.hasOwnProperty.call(opts, 'node_enabled') ? Boolean(opts.node_enabled) : true;
    const expiry = Object.prototype.hasOwnProperty.call(opts, 'expiry_time') ? Number(opts.expiry_time || 0) : Number(client?.expiry_time || 0);
    next.enable = globalEnabled && nodeEnabled && !isClientExpiredAt(expiry);
    candidateFields.push('enable');
  }
  if (fieldAllowed('comment') && Object.prototype.hasOwnProperty.call(opts, 'comment')) {
    next.comment = String(opts.comment || '').trim();
    candidateFields.push('comment');
  }

  const fields = uniqueList(candidateFields).filter(key => !h1Cloud3xuiClientValueEquals(key, current[key], next[key]));
  return { changed: fields.length > 0, fields, payload: next };
}

async function updateH1Cloud3xuiProtectedClient(node, lookupEmail, payload) {
  const email = String(lookupEmail || payload?.email || '').trim();
  if (!email) throw new Error('H1Cloud 3x-ui: не найден текущий email клиента для обновления.');
  if (!payload?.id) throw new Error('H1Cloud 3x-ui: не найден UUID клиента для безопасного обновления.');
  return apiPost(node, `/panel/api/clients/update/${encodeURIComponent(email)}`, payload, false);
}

async function ensureH1Cloud3xuiClientOnNode(node, client, opts = {}) {
  let map = opts.map || db.prepare('SELECT * FROM client_nodes WHERE client_id = ? AND node_id = ?').get(client.id, node.id);
  const inbound = await getInbound(node);
  const email = String(opts.email || client.login || map?.remote_email || '').trim();
  if (!email) throw new Error('У клиента нет email/login');

  const expectedUuid = String(map?.remote_uuid || opts.uuid || client.uuid || '').trim();
  let state = await getH1Cloud3xuiClientState(node, inbound, {
    email,
    remoteEmail: map?.remote_email,
    uuid: expectedUuid,
    remoteUuid: map?.remote_uuid,
    login: client.login
  });
  const existedAndAttachedBefore = Boolean(state.globalClient && state.attached);

  if (state.globalClient?.id && expectedUuid && !sameText(state.globalClient.id, expectedUuid)) {
    throw makeRemoteClientConflictError(node, email, state.globalClient, { uuid: expectedUuid, email });
  }

  const trafficGb = Math.max(0, Number(opts.traffic_gb ?? getClientNodeEffectiveTrafficGb(map, client, 0)));
  const limitIp = Math.max(0, Number(opts.limit_ip ?? getClientNodeEffectiveLimitIp(map, client, state.globalClient?.limitIp ?? 1)));
  const expiryTime = Math.max(0, Number(opts.expiry_time ?? client.expiry_time ?? 0));
  const durationDays = Math.max(0, Number(opts.duration_days ?? client.duration_days ?? 0));
  const nodeEnabled = opts.node_enabled !== undefined ? Boolean(opts.node_enabled) : (map ? map.enabled !== 0 : true);
  const globalEnabled = opts.enabled !== undefined ? Boolean(opts.enabled) : client.enabled !== 0;
  const effectiveEnabled = globalEnabled && nodeEnabled && !isClientExpiredAt(expiryTime);
  const remoteUuid = String(state.globalClient?.id || expectedUuid || randomUUID()).trim();
  const subId = String(state.globalClient?.subId || opts.subId || client.sub_slug || randomAlphaNum(16)).trim();
  const comment = String(opts.comment ?? client.comment ?? state.globalClient?.comment ?? '').trim();

  // Copy flow only from the provider-managed inbound/global client. Do not infer
  // it from local nodes and do not write it back during later updates.
  const providerFlow = String(state.globalClient?.flow || pickClientFlow(state.settings, remoteUuid, '') || '').trim();

  const remoteTrafficGb = getRemoteTrafficGbForNode(node, trafficGb);
  const remoteExpiryTime = getRemoteExpiryForNode(node, expiryTime);
  const remoteReset = getRemoteResetForNode(node, durationDays, trafficGb, state.globalClient?.reset || 0);
  const createPayload = {
    id: Number(node.inbound_id),
    settings: JSON.stringify({
      clients: [{
        id: remoteUuid,
        email,
        flow: providerFlow,
        limitIp,
        totalGB: toTotalGbBytes(remoteTrafficGb),
        expiryTime: remoteExpiryTime,
        enable: effectiveEnabled,
        tgId: 0,
        subId,
        reset: remoteReset,
        comment
      }]
    })
  };

  let remoteCreated = false;
  let remoteUpdated = false;
  let remoteAttached = false;
  let updatedFields = [];
  if (!state.globalClient) {
    await addClientViaNewApi(node, createPayload);
    remoteCreated = true;
    state = await getH1Cloud3xuiClientState(node, await getInbound(node), { email, uuid: remoteUuid, login: email });
    if (!state.globalClient) {
      throw new Error(`${getNodePublicName(node)}: 3x-ui приняла команду создания, но клиент ${email} не появился в глобальном разделе «Клиенты».`);
    }
  } else {
    const protectedUpdate = buildH1Cloud3xuiProtectedClientUpdate(node, state.globalClient, client, opts);
    if (protectedUpdate.changed) {
      const lookupEmail = String(state.globalClient.email || map?.remote_email || email).trim();
      await updateH1Cloud3xuiProtectedClient(node, lookupEmail, protectedUpdate.payload);
      remoteUpdated = true;
      updatedFields = protectedUpdate.fields;
      state.globalClient = { ...state.globalClient, ...protectedUpdate.payload, uuid: protectedUpdate.payload.id };
    }
  }

  if (!state.attached) {
    const attachEmail = String(state.globalClient?.email || email).trim();
    await attachClientViaNewApi(node, attachEmail, [Number(node.inbound_id)]);
    remoteAttached = true;
    state = await getH1Cloud3xuiClientState(node, await getInbound(node), {
      email: attachEmail,
      remoteEmail: attachEmail,
      uuid: state.globalClient?.id || remoteUuid,
      login: attachEmail
    });
    if (!state.attached) {
      throw new Error(`${getNodePublicName(node)}: клиент ${attachEmail} создан, но 3x-ui не подтвердила его привязку к inbound ${node.inbound_id}.`);
    }
  }

  const finalRemote = state.globalClient || {};
  const finalUuid = String(finalRemote.id || remoteUuid).trim();
  const finalEmail = String(finalRemote.email || email).trim();
  const finalSubId = String(finalRemote.subId || subId).trim();
  const remoteSubUrl = buildH1Cloud3xuiClientSubUrl(node, finalSubId);
  const usage = readUsageForClientNode(node, client, map || {}, inbound);

  if (!map) {
    const info = db.prepare('INSERT INTO client_nodes (client_id,node_id,remote_email,remote_uuid,remote_sub_url,traffic_gb,limit_ip,upload_bytes,download_bytes,used_bytes,enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(client.id, node.id, finalEmail, finalUuid, remoteSubUrl, trafficGb, limitIp, usage.uploadBytes, usage.downloadBytes, usage.usedBytes, nodeEnabled ? 1 : 0);
    map = db.prepare('SELECT * FROM client_nodes WHERE id = ?').get(info.lastInsertRowid);
    return { mapCreated: true, remoteCreated, remoteUpdated, remoteAttached, skippedExisting: existedAndAttachedBefore, updatedFields };
  }

  db.prepare(`
    UPDATE client_nodes
    SET remote_email = ?, remote_uuid = ?, remote_sub_url = ?, traffic_gb = ?, limit_ip = ?, upload_bytes = ?, download_bytes = ?, used_bytes = ?, enabled = ?
    WHERE id = ?
  `).run(
    finalEmail, finalUuid, remoteSubUrl, trafficGb, limitIp,
    usage.uploadBytes, usage.downloadBytes, usage.usedBytes,
    nodeEnabled ? 1 : 0, map.id
  );
  return { mapCreated: false, remoteCreated, remoteUpdated, remoteAttached, skippedExisting: existedAndAttachedBefore, updatedFields };
}

function updateLocalClientNodeState(node, map, values = {}) {
  const subId = values.subId || values.clientSubSlug || '';
  const remoteSubUrl = subId ? buildNativeSubUrl(node, subId) : (map.remote_sub_url || '');

  db.prepare(`
    UPDATE client_nodes
    SET remote_email = ?, remote_uuid = ?, remote_sub_url = ?, traffic_gb = ?, limit_ip = ?, upload_bytes = ?, download_bytes = ?, used_bytes = ?, enabled = ?
    WHERE id = ?
  `).run(
    values.email || map.remote_email || '',
    values.remoteUuid || map.remote_uuid || '',
    remoteSubUrl,
    Math.max(0, Number(values.trafficGb || 0)),
    values.limitIp === undefined ? map.limit_ip : nullablePositiveInteger(values.limitIp),
    clampByteNumber(values.uploadBytes ?? map.upload_bytes ?? 0),
    clampByteNumber(values.downloadBytes ?? map.download_bytes ?? 0),
    clampByteNumber(values.usedBytes ?? map.used_bytes ?? 0),
    values.nodeEnabled ? 1 : 0,
    map.id
  );
}

async function updateClientOnNode(node, map, client, opts = {}) {
  if (isRemnawaveNode(node)) return updateRemnawaveUserOnNode(node, map, client, opts);
  if (isH1CloudNode(node)) return updateH1CloudClientOnNode(node, map, client, opts);
  if (isH1Cloud3xuiNode(node)) return ensureH1Cloud3xuiClientOnNode(node, client, { ...opts, map, h1cloud_allow_client_update: true });
  const durationDays = Math.max(0, Number(opts.duration_days ?? client.duration_days ?? 0));
  const trafficGb = Math.max(0, Number(opts.traffic_gb ?? map.traffic_gb ?? client.traffic_gb ?? 0));
  const email = String(opts.email || client.login || map.remote_email || '').trim();
  const globalEnabled = opts.enabled !== undefined ? Boolean(opts.enabled) : (client.enabled !== 0);
  const nodeEnabled = opts.node_enabled !== undefined ? Boolean(opts.node_enabled) : (map.enabled !== 0);
  const effectiveExpiry = opts.expiry_time ?? client.expiry_time;
  const effectiveEnabled = globalEnabled && nodeEnabled && !isClientExpiredAt(effectiveExpiry);
  const fallbackSubId = opts.subId || client.sub_slug || randomUUID().replace(/-/g, '').slice(0, 16);
  const fallbackRemoteUuid = String(map.remote_uuid || client.uuid || opts.uuid || '').trim();

  // Не меняем локальную связь до подтверждения удалённой панели. Раньше при
  // timeout/ошибке 3x-ui агрегатор уже отмечал узел выключенным или менял его
  // лимит, из-за чего подписка расходилась с фактическим состоянием сервера.

  const inbound = await getInbound(node);
  const settings = safeParseJsonField(inbound.settings, {});
  const current = await findCurrentRemoteClientForNode(node, settings, map, client, opts) || {};
  if (current && current.id && fallbackRemoteUuid && !sameText(current.id, fallbackRemoteUuid) && isSameLogin(getRemoteClientEmail(current), email)) {
    throw makeRemoteClientConflictError(node, email, current, {
      uuid: fallbackRemoteUuid,
      email,
      trafficGb,
      limitIp: opts.limit_ip ?? map.limit_ip ?? client.limit_ip,
      expiryTime: opts.expiry_time ?? client.expiry_time
    });
  }
  const remoteUuid = String(current.id || fallbackRemoteUuid || client.uuid || '').trim();
  if (!remoteUuid) throw new Error('Не найден UUID клиента на узле');

  const limitIp = Math.max(0, Number(opts.limit_ip ?? map.limit_ip ?? client.limit_ip ?? current.limitIp ?? 1));
  const expiryTime = Math.max(0, Number(opts.expiry_time ?? client.expiry_time ?? current.expiryTime ?? 0));
  const subId = opts.subId || current.subId || fallbackSubId;
  const comment = String(opts.comment ?? client.comment ?? current.comment ?? '').trim();

  const payload = {
    id: Number(node.inbound_id),
    settings: JSON.stringify({
      clients: [{
        id: remoteUuid,
        email,
        flow: current.flow || pickClientFlow(settings, remoteUuid, client.flow || getDefaultClientFlowForInbound(inbound)),
        limitIp,
        totalGB: toTotalGbBytes(trafficGb),
        expiryTime,
        enable: effectiveEnabled,
        tgId: current.tgId || '',
        subId,
        reset: durationDays > 0 && trafficGb > 0 ? durationDays : 0,
        comment
      }]
    })
  };

  await updateClient(node, remoteUuid, payload);

  updateLocalClientNodeState(node, map, {
    email,
    remoteUuid,
    subId,
    clientSubSlug: client.sub_slug,
    trafficGb,
    limitIp,
    nodeEnabled
  });

  return { ok: true, nodeId: node.id };
}

async function updateClientEverywhere(client, opts = {}) {
  const mappings = db.prepare('SELECT * FROM client_nodes WHERE client_id = ?').all(client.id);
  for (const map of mappings) {
    try {
      const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(map.node_id);
      if (!node) continue;
      await updateClientOnNode(node, map, client, opts);
    } catch (err) {
      console.error('Update remote client failed:', err.message);
    }
  }
}

function getClientNodeEffectiveLimitIp(map, client, fallback = 1) {
  if (map && map.limit_ip !== null && map.limit_ip !== undefined && map.limit_ip !== '') {
    return Math.max(0, Number(map.limit_ip || 0));
  }
  return Math.max(0, Number(client?.limit_ip ?? fallback ?? 1));
}

function getClientNodeEffectiveTrafficGb(map, client, fallback = 0) {
  if (map && map.traffic_gb !== null && map.traffic_gb !== undefined && map.traffic_gb !== '') {
    return Math.max(0, Number(map.traffic_gb || 0));
  }
  return Math.max(0, Number(client?.traffic_gb ?? fallback ?? 0));
}

function readUsageForClientNode(node, client, map, inbound = null) {
  const cachedInbound = inbound || getCachedInbound(node);
  const cachedInfo = cachedInbound
    ? extractTrafficInfoFromInbound(cachedInbound, map?.remote_uuid || client?.uuid, map?.remote_email || client?.login)
    : null;

  const uploadBytes = clampByteNumber(cachedInfo?.uploadBytes ?? map?.upload_bytes ?? 0);
  const downloadBytes = clampByteNumber(cachedInfo?.downloadBytes ?? map?.download_bytes ?? 0);
  const usedBytes = clampByteNumber(cachedInfo?.usedBytes ?? map?.used_bytes ?? uploadBytes + downloadBytes);

  return { uploadBytes, downloadBytes, usedBytes };
}

function updateClientNodeUsage(mapId, usage) {
  if (!mapId) return;
  db.prepare('UPDATE client_nodes SET upload_bytes = ?, download_bytes = ?, used_bytes = ? WHERE id = ?')
    .run(
      clampByteNumber(usage?.uploadBytes || 0),
      clampByteNumber(usage?.downloadBytes || 0),
      clampByteNumber(usage?.usedBytes || 0),
      mapId
    );
}

function recordClientTrafficSnapshot(clientId, nodeId, usage, nowMs = Date.now()) {
  if (!clientId || !nodeId) return;
  db.prepare('INSERT INTO client_traffic_snapshots (client_id, node_id, upload_bytes, download_bytes, used_bytes, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)')
    .run(
      Number(clientId),
      Number(nodeId),
      clampByteNumber(usage?.uploadBytes || 0),
      clampByteNumber(usage?.downloadBytes || 0),
      clampByteNumber(usage?.usedBytes || 0),
      Number(nowMs)
    );
}

function calculateTrafficSpeedFromSnapshots(previous, current) {
  if (!previous || !current) return null;
  const seconds = Math.max(0, (Number(current.created_at_ms || 0) - Number(previous.created_at_ms || 0)) / 1000);
  if (seconds < 3 || seconds > 900) return null;
  const uploadBytes = Math.max(0, clampByteNumber(current.upload_bytes) - clampByteNumber(previous.upload_bytes));
  const downloadBytes = Math.max(0, clampByteNumber(current.download_bytes) - clampByteNumber(previous.download_bytes));
  const totalBytes = Math.max(0, clampByteNumber(current.used_bytes) - clampByteNumber(previous.used_bytes)) || (uploadBytes + downloadBytes);
  return {
    seconds,
    uploadBytes,
    downloadBytes,
    totalBytes,
    uploadMbps: uploadBytes * 8 / seconds / 1000 / 1000,
    downloadMbps: downloadBytes * 8 / seconds / 1000 / 1000,
    totalMbps: totalBytes * 8 / seconds / 1000 / 1000
  };
}

function speedLoadLabel(totalMbps) {
  const n = Number(totalMbps || 0);
  if (n >= 150) return 'очень высокая';
  if (n >= 50) return 'высокая';
  if (n >= 5) return 'активен';
  if (n >= 0.5) return 'низкая';
  return 'нет нагрузки';
}

function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function buildLiveClientTrafficReport(limit = 20, minMbps = 0.1) {
  const maxRows = Math.min(Math.max(Number(limit || 20), 1), 500);
  const threshold = Math.max(0, Number(minMbps || 0));
  const rows = db.prepare(`
    SELECT
      c.id AS client_id,
      c.login,
      c.display_name,
      c.comment,
      c.enabled AS client_enabled,
      n.id AS node_id,
      n.name AS node_name,
      n.node_type,
      n.country_code,
      n.country_name_ru,
      n.country_flag,
      n.label_suffix,
      n.enabled AS node_enabled,
      cn.id AS map_id,
      cn.upload_bytes,
      cn.download_bytes,
      cn.used_bytes
    FROM client_nodes cn
    JOIN clients c ON c.id = cn.client_id
    JOIN nodes n ON n.id = cn.node_id
    WHERE COALESCE(c.enabled, 1) = 1 AND COALESCE(cn.enabled, 1) = 1
    ORDER BY c.id ASC, ${nodeOrderSql('n')}
  `).all();

  const snapshotsStmt = db.prepare(`
    SELECT upload_bytes, download_bytes, used_bytes, created_at_ms
    FROM client_traffic_snapshots
    WHERE client_id = ? AND node_id = ?
    ORDER BY created_at_ms DESC
    LIMIT 2
  `);

  const nodeRows = [];
  const byClient = new Map();

  for (const row of rows) {
    const snaps = snapshotsStmt.all(row.client_id, row.node_id).reverse();
    const speed = snaps.length >= 2 ? calculateTrafficSpeedFromSnapshots(snaps[0], snaps[1]) : null;
    const downloadMbps = speed ? speed.downloadMbps : 0;
    const uploadMbps = speed ? speed.uploadMbps : 0;
    const totalMbps = speed ? speed.totalMbps : 0;
    const recentBytes = speed ? speed.totalBytes : 0;
    const currentUsed = clampByteNumber(row.used_bytes || 0);
    const currentDownload = clampByteNumber(row.download_bytes || 0);
    const currentUpload = clampByteNumber(row.upload_bytes || 0);
    const item = {
      clientId: row.client_id,
      nodeId: row.node_id,
      login: row.login || '',
      displayName: row.display_name || row.login || '',
      comment: row.comment || '',
      clientEnabled: Number(row.client_enabled || 0),
      nodeEnabled: Number(row.node_enabled || 0),
      nodeName: row.node_name || '',
      country_code: row.country_code || '',
      country_name_ru: row.country_name_ru || '',
      country_flag: getNodeFlag(row),
      label_suffix: row.label_suffix || '',
      uploadMbps,
      downloadMbps,
      totalMbps,
      uploadText: formatMbps(uploadMbps),
      downloadText: formatMbps(downloadMbps),
      totalText: formatMbps(totalMbps),
      recentText: formatTrafficBytes(recentBytes),
      currentTotalText: formatTrafficBytes(currentUsed),
      currentDownloadText: formatTrafficBytes(currentDownload),
      currentUploadText: formatTrafficBytes(currentUpload),
      seconds: speed ? speed.seconds : 0,
      loadLabel: speedLoadLabel(totalMbps),
      hasSpeed: !!speed
    };
    nodeRows.push(item);

    const key = String(row.client_id);
    const agg = byClient.get(key) || {
      clientId: row.client_id,
      login: row.login || '',
      displayName: row.display_name || row.login || '',
      comment: row.comment || '',
      uploadMbps: 0,
      downloadMbps: 0,
      totalMbps: 0,
      recentBytes: 0,
      nodes: [],
      currentUsed: 0
    };
    agg.uploadMbps += uploadMbps;
    agg.downloadMbps += downloadMbps;
    agg.totalMbps += totalMbps;
    agg.recentBytes += recentBytes;
    agg.currentUsed += currentUsed;
    if (totalMbps > 0 || downloadMbps > 0 || uploadMbps > 0) agg.nodes.push(item);
    byClient.set(key, agg);
  }

  const clients = Array.from(byClient.values()).map(item => ({
    ...item,
    uploadText: formatMbps(item.uploadMbps),
    downloadText: formatMbps(item.downloadMbps),
    totalText: formatMbps(item.totalMbps),
    recentText: formatTrafficBytes(item.recentBytes),
    currentTotalText: formatTrafficBytes(item.currentUsed),
    loadLabel: speedLoadLabel(item.totalMbps)
  })).filter(item => item.totalMbps >= threshold)
    .sort((a, b) => b.totalMbps - a.totalMbps)
    .slice(0, maxRows);

  const topNodes = nodeRows.filter(item => item.totalMbps >= threshold)
    .sort((a, b) => b.totalMbps - a.totalMbps)
    .slice(0, maxRows);

  return {
    generatedAt: new Date().toISOString(),
    clients,
    topNodes,
    totalActive: clients.length,
    source: 'xray counters delta'
  };
}


function getTopClientUsageReport(limit = 20) {
  const maxRows = Math.min(Math.max(Number(limit || 20), 1), 100);
  const rows = db.prepare(`
    SELECT
      c.id AS client_id,
      c.login,
      c.display_name,
      c.comment,
      c.enabled,
      COALESCE(SUM(cn.upload_bytes), 0) AS upload_bytes,
      COALESCE(SUM(cn.download_bytes), 0) AS download_bytes,
      COALESCE(SUM(cn.used_bytes), 0) AS used_bytes,
      COUNT(cn.id) AS node_count
    FROM clients c
    LEFT JOIN client_nodes cn ON cn.client_id = c.id
    GROUP BY c.id
    ORDER BY used_bytes DESC, download_bytes DESC, c.id ASC
    LIMIT ?
  `).all(maxRows);

  const getNodes = db.prepare(`
    SELECT
      n.id,
      n.name,
      n.country_code,
      n.country_name_ru,
      n.country_flag,
      n.label_suffix,
      cn.upload_bytes,
      cn.download_bytes,
      cn.used_bytes,
      COALESCE((
        SELECT s.upload_bytes
        FROM client_traffic_snapshots s
        WHERE s.client_id = cn.client_id AND s.node_id = cn.node_id
        ORDER BY s.created_at_ms DESC
        LIMIT 1
      ), 0) AS snapshot_upload_bytes,
      COALESCE((
        SELECT s.download_bytes
        FROM client_traffic_snapshots s
        WHERE s.client_id = cn.client_id AND s.node_id = cn.node_id
        ORDER BY s.created_at_ms DESC
        LIMIT 1
      ), 0) AS snapshot_download_bytes,
      COALESCE((
        SELECT s.used_bytes
        FROM client_traffic_snapshots s
        WHERE s.client_id = cn.client_id AND s.node_id = cn.node_id
        ORDER BY s.created_at_ms DESC
        LIMIT 1
      ), 0) AS snapshot_used_bytes
    FROM client_nodes cn
    JOIN nodes n ON n.id = cn.node_id
    WHERE cn.client_id = ?
    ORDER BY cn.used_bytes DESC, cn.download_bytes DESC, ${nodeOrderSql('n')}
  `);

  return rows.map(row => {
    const rawNodeItems = getNodes.all(row.client_id).map(n => {
      const storedUpload = clampByteNumber(n.upload_bytes || 0);
      const storedDownload = clampByteNumber(n.download_bytes || 0);
      const storedUsed = clampByteNumber(n.used_bytes || 0);
      const snapUpload = clampByteNumber(n.snapshot_upload_bytes || 0);
      const snapDownload = clampByteNumber(n.snapshot_download_bytes || 0);
      const snapUsed = clampByteNumber(n.snapshot_used_bytes || 0);

      const uploadBytes = Math.max(storedUpload, snapUpload);
      const downloadBytes = Math.max(storedDownload, snapDownload);
      const usedBytes = Math.max(storedUsed, snapUsed, uploadBytes + downloadBytes);

      return {
        ...n,
        uploadBytes,
        downloadBytes,
        usedBytes,
        title: getNodeDisplayName(n),
        uploadText: formatTrafficBytes(uploadBytes),
        downloadText: formatTrafficBytes(downloadBytes),
        totalText: formatTrafficBytes(usedBytes)
      };
    });

    const nodesUploadBytes = rawNodeItems.reduce((sum, n) => sum + clampByteNumber(n.uploadBytes || 0), 0);
    const nodesDownloadBytes = rawNodeItems.reduce((sum, n) => sum + clampByteNumber(n.downloadBytes || 0), 0);
    const nodesUsedBytes = rawNodeItems.reduce((sum, n) => sum + clampByteNumber(n.usedBytes || 0), 0);

    const storedUploadBytes = clampByteNumber(row.upload_bytes || 0);
    const storedDownloadBytes = clampByteNumber(row.download_bytes || 0);
    const storedUsedBytes = clampByteNumber(row.used_bytes || 0);

    const uploadBytes = Math.max(storedUploadBytes, nodesUploadBytes);
    const downloadBytes = Math.max(storedDownloadBytes, nodesDownloadBytes);
    const usedBytes = Math.max(storedUsedBytes, nodesUsedBytes, uploadBytes + downloadBytes);

    const sortedNodes = rawNodeItems
      .sort((a, b) => b.usedBytes - a.usedBytes || b.downloadBytes - a.downloadBytes || a.id - b.id);

    const visibleNodes = sortedNodes.filter(n => clampByteNumber(n.usedBytes || 0) > 0);
    const visibleUsedBytes = visibleNodes.reduce((sum, n) => sum + clampByteNumber(n.usedBytes || 0), 0);
    const missingUsedBytes = Math.max(0, usedBytes - visibleUsedBytes);

    let displayNodes = visibleNodes;
    // If the aggregate total exists but 3x-ui/API did not return a per-node
    // split, do not show misleading 0 MB chips. Show a separate diagnostic chip
    // instead. When the client is mapped to one node only, attribute the total to
    // that node because there is no ambiguity.
    if (missingUsedBytes > 1024 * 1024) {
      if (!visibleNodes.length && sortedNodes.length === 1) {
        const only = sortedNodes[0];
        displayNodes = [{
          ...only,
          uploadBytes,
          downloadBytes,
          usedBytes,
          uploadText: formatTrafficBytes(uploadBytes),
          downloadText: formatTrafficBytes(downloadBytes),
          totalText: formatTrafficBytes(usedBytes)
        }];
      } else {
        displayNodes = [
          ...visibleNodes,
          {
            id: 0,
            name: 'Нераспределено по узлам',
            country_code: '',
            country_name_ru: 'Нераспределено по узлам',
            country_flag: '',
            label_suffix: '',
            uploadBytes: 0,
            downloadBytes: 0,
            usedBytes: missingUsedBytes,
            title: 'Нераспределено по узлам',
            uploadText: formatTrafficBytes(0),
            downloadText: formatTrafficBytes(0),
            totalText: formatTrafficBytes(missingUsedBytes),
            diagnostic: true
          }
        ];
      }
    }

    return {
      clientId: row.client_id,
      login: row.login || '',
      displayName: row.display_name || row.login || '',
      comment: row.comment || '',
      enabled: Number(row.enabled || 0),
      uploadBytes,
      downloadBytes,
      usedBytes,
      uploadText: formatTrafficBytes(uploadBytes),
      downloadText: formatTrafficBytes(downloadBytes),
      totalText: formatTrafficBytes(usedBytes),
      nodeCount: sortedNodes.length || Number(row.node_count || 0),
      nodes: displayNodes.slice(0, 12)
    };
  });
}

async function ensureAggregatorClientOnNode(node, client, opts = {}) {
  if (isRemnawaveNode(node)) return ensureRemnawaveUserOnNode(node, client, opts);
  if (isH1CloudNode(node)) return ensureH1CloudClientOnNode(node, client, opts);
  if (isH1Cloud3xuiNode(node)) return ensureH1Cloud3xuiClientOnNode(node, client, opts);
  let map = db.prepare('SELECT * FROM client_nodes WHERE client_id = ? AND node_id = ?').get(client.id, node.id);
  const inbound = await getInbound(node);
  const settings = safeParseJsonField(inbound.settings, {});
  let current = await findCurrentRemoteClientForNode(node, settings, map || {}, client, opts) || null;

  const email = String(opts.email || client.login || map?.remote_email || current?.email || '').trim();
  if (!email) throw new Error('У клиента нет email/login');

  const expectedUuid = String(map?.remote_uuid || opts.uuid || client.uuid || '').trim();
  let remoteAttached = false;
  if (!current && is3xuiV3Mode(node)) {
    let globalClient = null;
    try {
      globalClient = await findClientViaNewApi(node, email);
    } catch (err) {
      if (isNodeFastFailError(err)) throw err;
      if (!isMissingApiEndpointError(err) && !isRemoteEntityMissingError(err)) throw err;
    }
    if (globalClient) {
      const globalUuid = String(globalClient.id || globalClient.uuid || '').trim();
      if (globalUuid && expectedUuid && !sameText(globalUuid, expectedUuid)) {
        throw makeRemoteClientConflictError(node, email, globalClient, { uuid: expectedUuid, email });
      }
      const attachEmail = String(globalClient.email || email).trim();
      await attachClientViaNewApi(node, attachEmail, [Number(node.inbound_id)]);
      current = { ...globalClient, id: globalUuid || expectedUuid, uuid: globalUuid || expectedUuid, email: attachEmail };
      remoteAttached = true;
    }
  }
  if (current && current.id && expectedUuid && !sameText(current.id, expectedUuid) && isSameLogin(getRemoteClientEmail(current), email)) {
    throw makeRemoteClientConflictError(node, email, current, {
      uuid: expectedUuid,
      email,
      trafficGb: opts.traffic_gb ?? getClientNodeEffectiveTrafficGb(map, client, 0),
      limitIp: opts.limit_ip ?? getClientNodeEffectiveLimitIp(map, client, current?.limitIp ?? 1),
      expiryTime: opts.expiry_time ?? client.expiry_time
    });
  }

  const remoteUuid = String(current?.id || map?.remote_uuid || client.uuid || opts.uuid || randomUUID()).trim();
  const subId = String(opts.subId || current?.subId || client.sub_slug || randomUUID().replace(/-/g, '').slice(0, 16)).trim();
  const trafficGb = Math.max(0, Number(opts.traffic_gb ?? getClientNodeEffectiveTrafficGb(map, client, 0)));
  const limitIp = Math.max(0, Number(opts.limit_ip ?? getClientNodeEffectiveLimitIp(map, client, current?.limitIp ?? 1)));
  const expiryTime = Math.max(0, Number(opts.expiry_time ?? client.expiry_time ?? current?.expiryTime ?? 0));
  const durationDays = Math.max(0, Number(opts.duration_days ?? client.duration_days ?? current?.reset ?? 0));
  const nodeEnabled = opts.node_enabled !== undefined ? Boolean(opts.node_enabled) : (map ? map.enabled !== 0 : true);
  const effectiveEnabled = (opts.enabled !== undefined ? Boolean(opts.enabled) : client.enabled !== 0) && nodeEnabled;
  const comment = String(opts.comment ?? client.comment ?? current?.comment ?? '').trim();
  const flow = current?.flow || client.flow || pickClientFlow(settings, remoteUuid, getDefaultClientFlowForInbound(inbound));

  if (current && opts.skip_existing === true) {
    const mapResult = upsertClientNodeMap(client, node, {
      ...current,
      uuid: current.id || current.uuid || remoteUuid,
      email: getRemoteClientEmail(current) || email,
      subId: current.subId || subId,
      enable: current.enable !== false
    }, trafficGbFromRemoteValue(current.totalGB));
    return { mapCreated: mapResult.created, remoteCreated: false, remoteUpdated: false, remoteAttached, skippedExisting: true };
  }

  const payload = {
    id: Number(node.inbound_id),
    settings: JSON.stringify({
      clients: [{
        id: remoteUuid,
        email,
        flow,
        limitIp,
        totalGB: toTotalGbBytes(trafficGb),
        expiryTime,
        enable: effectiveEnabled,
        tgId: current?.tgId || '',
        subId,
        reset: durationDays > 0 && trafficGb > 0 ? durationDays : Number(current?.reset || 0),
        comment
      }]
    })
  };

  let remoteCreated = false;
  let remoteUpdated = false;

  if (current) {
    await updateClient(node, current.id || remoteUuid, payload);
    remoteUpdated = true;
  } else {
    try {
      await addClient(node, payload);
      remoteCreated = true;
    } catch (err) {
      const freshInbound = await getInbound(node);
      const freshSettings = safeParseJsonField(freshInbound.settings, {});
      const fresh = findCurrentRemoteClient(freshSettings, map || {}, client, { ...opts, uuid: remoteUuid, email });
      if (!fresh) throw err;
      if (fresh.id && remoteUuid && !sameText(fresh.id, remoteUuid) && isSameLogin(getRemoteClientEmail(fresh), email)) {
        throw makeRemoteClientConflictError(node, email, fresh, {
          uuid: remoteUuid,
          email,
          trafficGb,
          limitIp,
          expiryTime
        });
      }
      if (opts.skip_existing === true) {
        const mapResult = upsertClientNodeMap(client, node, {
          ...fresh,
          uuid: fresh.id || fresh.uuid || remoteUuid,
          email: getRemoteClientEmail(fresh) || email,
          subId: fresh.subId || subId,
          enable: fresh.enable !== false
        }, trafficGbFromRemoteValue(fresh.totalGB));
        return { mapCreated: mapResult.created, remoteCreated: false, remoteUpdated: false, remoteAttached, skippedExisting: true };
      }
      await updateClient(node, fresh.id || remoteUuid, payload);
      remoteUpdated = true;
    }
  }

  const usage = readUsageForClientNode(node, client, map || {}, inbound);

  if (!map) {
    const info = db.prepare('INSERT INTO client_nodes (client_id,node_id,remote_email,remote_uuid,remote_sub_url,traffic_gb,limit_ip,upload_bytes,download_bytes,used_bytes,enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        client.id,
        node.id,
        email,
        remoteUuid,
        buildNativeSubUrl(node, subId),
        trafficGb,
        limitIp,
        usage.uploadBytes,
        usage.downloadBytes,
        usage.usedBytes,
        nodeEnabled ? 1 : 0
      );
    map = db.prepare('SELECT * FROM client_nodes WHERE id = ?').get(info.lastInsertRowid);
    return { mapCreated: true, remoteCreated, remoteUpdated, remoteAttached };
  }

  updateLocalClientNodeState(node, map, {
    email,
    remoteUuid,
    subId,
    clientSubSlug: client.sub_slug,
    trafficGb,
    limitIp,
    uploadBytes: usage.uploadBytes,
    downloadBytes: usage.downloadBytes,
    usedBytes: usage.usedBytes,
    nodeEnabled
  });

  return { mapCreated: false, remoteCreated, remoteUpdated, remoteAttached };
}

async function syncAggregatorClientsToNode(targetNode, options = {}) {
  const operation = options.operation || null;
  const clients = db.prepare('SELECT * FROM clients ORDER BY id ASC').all();
  let remoteCreated = 0, remoteUpdated = 0, mappingsCreated = 0, failed = 0, completed = 0, skipped = 0;
  let cancelled = false;
  let consecutiveTransportFailures = 0;
  const errors = [];
  const total = Math.max(0, Number(options.totalSteps || clients.length));
  const offset = Math.max(0, Number(options.progressOffset || 0));

  for (const client of clients) {
    if (operation?.isCancelled()) { cancelled = true; break; }
    try {
      const result = await ensureAggregatorClientOnNode(targetNode, client);
      if (result.mapCreated) mappingsCreated++;
      if (result.remoteCreated) remoteCreated++;
      if (result.remoteUpdated) remoteUpdated++;
      consecutiveTransportFailures = 0;
    } catch (err) {
      failed++;
      const msg = `${client.login || client.id}: ${err.message || err}`;
      errors.push(msg);
      console.error('Не удалось создать/обновить клиента на узле:', msg);
      if (isNodeFastFailError(err)) consecutiveTransportFailures++;
      else consecutiveTransportFailures = 0;
    }
    completed++;
    operation?.setProgress(offset + completed, total, `${getNodePublicName(targetNode)}: ${client.login || client.id}`);
    if (consecutiveTransportFailures >= 2) {
      skipped = Math.max(0, clients.length - completed);
      errors.push(`${getNodePublicName(targetNode)}: после двух сетевых ошибок подряд оставшиеся ${skipped} клиентов пропущены.`);
      operation?.setDetail(`${getNodePublicName(targetNode)} отключён от текущей операции после повторных сетевых ошибок`);
      break;
    }
  }

  return { totalClients: clients.length, completed, skipped, remoteCreated, remoteUpdated, mappingsCreated, failed, cancelled, errors: errors.slice(0, 12) };
}

async function syncAggregatorClientsToSelectedNodes(nodeIds, operation = null) {
  const requestedNodes = getEnabledNodesByIds(nodeIds);
  if (!requestedNodes.length) throw new Error('Выбери хотя бы один узел для синхронизации.');

  const errors = [];
  operation?.setDetail(`Проверяю ${requestedNodes.length} выбранных узлов`);
  const nodes = await preflightLongOperationNodes(requestedNodes, operation, errors, 'Проверка перед синхронизацией');
  if (operation?.isCancelled()) {
    return { nodes: nodes.length, totalClients: 0, completed: 0, remoteCreated: 0, remoteUpdated: 0, mappingsCreated: 0, failed: errors.length, cancelled: true, errors };
  }
  if (!nodes.length) throw new Error(`Ни один выбранный узел не прошёл проверку. ${errors.slice(0, 3).join(' | ')}`);

  const clientCount = Number(db.prepare('SELECT COUNT(*) AS n FROM clients').get()?.n || 0);
  const totalSteps = clientCount * nodes.length;
  let totalClients = clientCount, completed = 0, skipped = 0, remoteCreated = 0, remoteUpdated = 0, mappingsCreated = 0, failed = errors.length;
  let cancelled = false;
  operation?.setProgress(0, totalSteps, `Узлов: ${nodes.length}; клиентов: ${clientCount}`);

  for (const node of nodes) {
    if (operation?.isCancelled()) { cancelled = true; break; }
    const result = await syncAggregatorClientsToNode(node, {
      operation,
      progressOffset: completed + skipped,
      totalSteps
    });
    completed += result.completed || 0;
    skipped += result.skipped || 0;
    operation?.setProgress(completed + skipped, totalSteps, `${getNodePublicName(node)}: завершено или пропущено`);
    remoteCreated += result.remoteCreated || 0;
    remoteUpdated += result.remoteUpdated || 0;
    mappingsCreated += result.mappingsCreated || 0;
    failed += result.failed || 0;
    for (const error of result.errors || []) errors.push(`${getNodePublicName(node)}: ${error}`);
    if (result.cancelled) { cancelled = true; break; }
  }

  return { nodes: nodes.length, totalClients, completed, skipped, remoteCreated, remoteUpdated, mappingsCreated, failed, cancelled, errors: errors.slice(0, 12) };
}

// Kept for internal/backward compatibility. UI routes now require an explicit
// node selection so an import can never silently rewrite every active server.
async function syncAggregatorClientsToAllNodes(operation = null) {
  const ids = db.prepare('SELECT id FROM nodes WHERE enabled = 1').all().map(row => row.id);
  return syncAggregatorClientsToSelectedNodes(ids, operation);
}

async function applyNodeLimitsToSelectedClients(node, clientIds, values = {}, operation = null) {
  const ids = uniqueList((Array.isArray(clientIds) ? clientIds : [clientIds])
    .map(Number)
    .filter(id => Number.isInteger(id) && id > 0));
  if (!ids.length) throw new Error('Сначала выберите хотя бы одного клиента.');

  const getClientById = db.prepare('SELECT * FROM clients WHERE id = ?');
  const clients = ids.map(id => getClientById.get(id)).filter(Boolean);
  const missingClients = Math.max(0, ids.length - clients.length);
  if (!clients.length) throw new Error('Выбранные клиенты больше не найдены в Aggregator.');

  const hasTraffic = values.traffic_gb !== undefined && values.traffic_gb !== null && String(values.traffic_gb).trim() !== '';
  const hasLimitIp = values.limit_ip !== undefined && values.limit_ip !== null && String(values.limit_ip).trim() !== '';

  const preflightErrors = [];
  const healthy = await preflightLongOperationNodes([node], operation, preflightErrors, 'Проверка узла');
  if (!healthy.length) throw new Error(preflightErrors[0] || `${getNodePublicName(node)} не отвечает.`);

  let remoteCreated = 0, remoteUpdated = 0, mappingsCreated = 0, failed = 0, completed = 0, skipped = 0;
  let cancelled = false;
  let consecutiveTransportFailures = 0;
  const errors = [];
  operation?.setProgress(0, clients.length, `Применяю выбранных клиентов к ${getNodePublicName(node)}`);

  for (const client of clients) {
    if (operation?.isCancelled()) { cancelled = true; break; }
    const map = db.prepare('SELECT * FROM client_nodes WHERE client_id = ? AND node_id = ?').get(client.id, node.id);
    const nextTrafficGb = hasTraffic
      ? Math.max(0, Number(values.traffic_gb || 0))
      : getClientNodeEffectiveTrafficGb(map, client, 0);
    const nextLimitIp = hasLimitIp
      ? Math.max(0, Number(values.limit_ip || 0))
      : getClientNodeEffectiveLimitIp(map, client, 1);

    try {
      const result = await ensureAggregatorClientOnNode(node, client, {
        traffic_gb: nextTrafficGb,
        limit_ip: nextLimitIp
      });
      if (result.mapCreated) mappingsCreated++;
      if (result.remoteCreated) remoteCreated++;
      if (result.remoteUpdated) remoteUpdated++;
      consecutiveTransportFailures = 0;
    } catch (err) {
      failed++;
      const msg = `${client.login || client.id}: ${err.message || err}`;
      errors.push(msg);
      console.error('Не удалось применить настройки к выбранному клиенту:', msg);
      if (isNodeFastFailError(err)) consecutiveTransportFailures++;
      else consecutiveTransportFailures = 0;
    }
    completed++;
    operation?.setProgress(completed, clients.length, `${getNodePublicName(node)}: ${client.login || client.id}`);
    if (consecutiveTransportFailures >= 2) {
      skipped = Math.max(0, clients.length - completed);
      errors.push(`${getNodePublicName(node)}: после двух сетевых ошибок подряд оставшиеся ${skipped} выбранных клиентов пропущены.`);
      operation?.setProgress(completed + skipped, clients.length, `${getNodePublicName(node)}: оставшиеся выбранные клиенты пропущены из-за недоступности узла`);
      break;
    }
  }

  return {
    requested: ids.length,
    totalClients: clients.length,
    missingClients,
    completed,
    skipped,
    remoteCreated,
    remoteUpdated,
    mappingsCreated,
    failed,
    cancelled,
    errors: errors.slice(0, 12)
  };
}

// Backward-compatible helper for older internal callers. The UI no longer
// launches a silent all-client operation: it always posts explicit client IDs.
async function applyNodeLimitsToAllClients(node, values = {}, operation = null) {
  const ids = db.prepare('SELECT id FROM clients ORDER BY id ASC').all().map(row => row.id);
  return applyNodeLimitsToSelectedClients(node, ids, values, operation);
}

function formatTrafficBytes(bytes, digits = 1) {
  const n = clampByteNumber(bytes);
  const tb = n / 1024 / 1024 / 1024 / 1024;
  if (tb >= 1) return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: tb >= 10 ? 1 : 2 }).format(tb)} ТБ`;
  const gb = n / 1024 / 1024 / 1024;
  if (gb >= 1) return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: gb >= 10 ? 0 : digits }).format(gb)} ГБ`;
  const mb = n / 1024 / 1024;
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(mb)} МБ`;
}

function formatMbps(value) {
  const n = Math.max(0, Number(value || 0));
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: n >= 100 ? 0 : 1 }).format(n)} Мбит/с`;
}

function getCurrentTrafficTotals() {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(upload_bytes), 0) AS upload_bytes,
      COALESCE(SUM(download_bytes), 0) AS download_bytes,
      COALESCE(SUM(used_bytes), 0) AS used_bytes
    FROM client_nodes
  `).get() || {};
  const uploadBytes = clampByteNumber(row.upload_bytes || 0);
  const downloadBytes = clampByteNumber(row.download_bytes || 0);
  return { uploadBytes, downloadBytes, usedBytes: clampByteNumber(row.used_bytes || uploadBytes + downloadBytes) };
}

function getCurrentNodeTrafficTotals() {
  return db.prepare(`
    SELECT
      n.id AS node_id,
      n.name,
      n.country_code,
      n.country_name_ru,
      n.country_flag,
      n.label_suffix,
      n.enabled,
      COALESCE(SUM(cn.upload_bytes), 0) AS upload_bytes,
      COALESCE(SUM(cn.download_bytes), 0) AS download_bytes,
      COALESCE(SUM(cn.used_bytes), 0) AS used_bytes
    FROM nodes n
    LEFT JOIN client_nodes cn ON cn.node_id = n.id
    GROUP BY n.id
    ORDER BY ${nodeOrderSql('n')}
  `).all().map(row => {
    const uploadBytes = clampByteNumber(row.upload_bytes || 0);
    const downloadBytes = clampByteNumber(row.download_bytes || 0);
    return {
      nodeId: Number(row.node_id),
      name: row.name,
      country_code: row.country_code || '',
      country_name_ru: row.country_name_ru || '',
      country_flag: getNodeFlag(row),
      label_suffix: row.label_suffix || '',
      enabled: Number(row.enabled || 0),
      uploadBytes,
      downloadBytes,
      usedBytes: clampByteNumber(row.used_bytes || uploadBytes + downloadBytes)
    };
  });
}

function recordTrafficSnapshot(force = false, sourceKind = 'passive') {
  const nowMs = Date.now();
  const safeSourceKind = String(sourceKind || 'passive').trim() || 'passive';
  const totals = getCurrentTrafficTotals();
  const nodeTotals = getCurrentNodeTrafficTotals();
  const last = db.prepare('SELECT * FROM traffic_snapshots ORDER BY created_at_ms DESC LIMIT 1').get();
  const changed = !last ||
    clampByteNumber(last.upload_bytes) !== totals.uploadBytes ||
    clampByteNumber(last.download_bytes) !== totals.downloadBytes ||
    clampByteNumber(last.used_bytes) !== totals.usedBytes;
  const shouldInsert = force || changed || !last || nowMs - Number(last.created_at_ms || 0) > 15 * 60 * 1000;
  if (shouldInsert) {
    db.prepare('INSERT INTO traffic_snapshots (upload_bytes, download_bytes, used_bytes, created_at_ms, source_kind) VALUES (?, ?, ?, ?, ?)')
      .run(totals.uploadBytes, totals.downloadBytes, totals.usedBytes, nowMs, safeSourceKind);
    const insertNodeSnapshot = db.prepare('INSERT INTO node_traffic_snapshots (node_id, upload_bytes, download_bytes, used_bytes, created_at_ms, source_kind) VALUES (?, ?, ?, ?, ?, ?)');
    for (const node of nodeTotals) {
      insertNodeSnapshot.run(node.nodeId, node.uploadBytes, node.downloadBytes, node.usedBytes, nowMs, safeSourceKind);
    }
  }
  try {
    db.prepare('DELETE FROM traffic_snapshots WHERE created_at_ms < ?').run(nowMs - 370 * 24 * 60 * 60 * 1000);
    db.prepare('DELETE FROM node_traffic_snapshots WHERE created_at_ms < ?').run(nowMs - 370 * 24 * 60 * 60 * 1000);
    db.prepare('DELETE FROM client_traffic_snapshots WHERE created_at_ms < ?').run(nowMs - 30 * 24 * 60 * 60 * 1000);
  } catch (_) {}
  return { totals, nodeTotals, inserted: shouldInsert };
}

async function refreshAllClientUsageFromNodes() {
  const nodes = db.prepare(`SELECT * FROM nodes ORDER BY ${nodeOrderSql()}`).all();
  const errors = [];
  for (const node of nodes) {
    const rows = db.prepare(`
      SELECT cn.*, c.uuid AS client_uuid, c.login AS client_login
      FROM client_nodes cn
      JOIN clients c ON c.id = cn.client_id
      WHERE cn.node_id = ?
      ORDER BY cn.id ASC
    `).all(node.id);
    if (!rows.length) continue;

    if (isRemnawaveNode(node)) {
      try {
        const users = await listRemnawaveUsers(node, 15000);
        const byUuid = new Map(users.map(user => [String(user?.uuid || '').toLowerCase(), user]).filter(([key]) => key));
        const byVless = new Map(users.map(user => [String(user?.vlessUuid || '').toLowerCase(), user]).filter(([key]) => key));
        const byUsername = new Map(users.map(user => [String(user?.username || '').toLowerCase(), user]).filter(([key]) => key));
        const update = db.prepare('UPDATE client_nodes SET remote_email = ?, remote_uuid = ?, remote_sub_url = ?, upload_bytes = 0, download_bytes = ?, used_bytes = ? WHERE id = ?');
        for (const row of rows) {
          const user = byUuid.get(String(row.remote_uuid || '').toLowerCase())
            || byVless.get(String(row.client_uuid || '').toLowerCase())
            || byUsername.get(String(row.remote_email || row.client_login || '').toLowerCase());
          if (!user) continue;
          const usedBytes = clampByteNumber(user?.userTraffic?.usedTrafficBytes || 0);
          update.run(
            String(user?.username || row.remote_email || row.client_login || ''),
            String(user?.uuid || row.remote_uuid || ''),
            normalizeRemnawaveSubscriptionUrl(node, user?.subscriptionUrl || row.remote_sub_url || ''),
            usedBytes,
            usedBytes,
            row.id
          );
          recordClientTrafficSnapshot(row.client_id, node.id, { uploadBytes: 0, downloadBytes: usedBytes, usedBytes });
        }
      } catch (err) {
        errors.push(`${getNodePublicName(node)}: ${err.message || err}`);
      }
      continue;
    }

    if (isH1CloudNode(node)) continue;

    let inbound = null;
    let trafficList = [];

    try {
      inbound = await getInbound(node, 15000);
    } catch (err) {
      errors.push(`${getNodePublicName(node)}: ${err.message || err}`);
      inbound = getCachedInbound(node);
    }

    try {
      trafficList = await getInboundClientTrafficsFromApi(node, 15000);
    } catch (err) {
      // Не считаем это фатальной ошибкой: у старых 3x-ui данные часто уже есть в inbound.clientStats.
      if (!inbound) errors.push(`${getNodePublicName(node)} traffic: ${err.message || err}`);
      trafficList = [];
    }

    if (!inbound && !trafficList.length) continue;
    const nowMs = Date.now();
    for (const row of rows) {
      const inboundUsage = inbound ? readUsageForClientNode(
        { id: node.id, inbound_id: node.inbound_id },
        { uuid: row.client_uuid, login: row.client_login },
        row,
        inbound
      ) : null;

      let apiUsage = null;
      const statFromList = pickTrafficFromList(trafficList, row.remote_email || row.client_login, row.remote_uuid || row.client_uuid);
      if (statFromList) {
        apiUsage = extractTrafficInfoFromClientTraffic(statFromList);
      } else {
        try {
          apiUsage = await getClientTrafficFromApi(node, row.remote_email || row.client_login, 15000, row.remote_uuid || row.client_uuid);
        } catch (_) {
          apiUsage = null;
        }
      }

      const usage = mergeTrafficInfo(apiUsage, inboundUsage || row);
      updateClientNodeUsage(row.id, usage);
      recordClientTrafficSnapshot(row.client_id, node.id, usage, nowMs);
    }
  }
  return { errors: errors.slice(0, 8), totals: getCurrentTrafficTotals() };
}

function getTrafficPeriodStart(period, nowMs = Date.now()) {
  const p = String(period || 'this_month');
  if (p === 'day') return nowMs - 24 * 60 * 60 * 1000;
  if (p === 'week') return nowMs - 7 * 24 * 60 * 60 * 1000;
  if (p === 'month') return nowMs - 30 * 24 * 60 * 60 * 1000;
  if (p === 'all') return 0;
  const d = new Date(nowMs);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function summarizeTrafficRows(list) {
  let upload = 0;
  let download = 0;
  let used = 0;
  let maxUploadMbps = 0;
  let maxDownloadMbps = 0;
  let maxTotalMbps = 0;
  let previous = null;
  let speedSamples = 0;
  for (const row of list) {
    if (!previous) { previous = row; continue; }
    const seconds = Math.max(0, (Number(row.created_at_ms || 0) - Number(previous.created_at_ms || 0)) / 1000);
    const du = Math.max(0, clampByteNumber(row.upload_bytes) - clampByteNumber(previous.upload_bytes));
    const dd = Math.max(0, clampByteNumber(row.download_bytes) - clampByteNumber(previous.download_bytes));
    const dt = Math.max(0, clampByteNumber(row.used_bytes) - clampByteNumber(previous.used_bytes));
    upload += du;
    download += dd;
    used += dt || du + dd;
    // Speed is estimated from deltas between snapshots. Older builds marked many
    // useful snapshots as passive/legacy, so do not require source_kind='refresh'.
    // Ignore very short/very long gaps to avoid noisy spikes and daily-average values.
    const speedEligible = seconds >= 5 && seconds <= 3600 && (du > 0 || dd > 0 || dt > 0);
    if (speedEligible) {
      maxUploadMbps = Math.max(maxUploadMbps, du * 8 / seconds / 1000 / 1000);
      maxDownloadMbps = Math.max(maxDownloadMbps, dd * 8 / seconds / 1000 / 1000);
      maxTotalMbps = Math.max(maxTotalMbps, (dt || du + dd) * 8 / seconds / 1000 / 1000);
      speedSamples += 1;
    }
    previous = row;
  }
  return { upload, download, used, maxUploadMbps, maxDownloadMbps, maxTotalMbps, speedSamples };
}

function buildTrafficReport(period = 'this_month', metric = 'download') {
  const allowedPeriods = new Set(['day', 'week', 'month', 'this_month', 'all']);
  const allowedMetrics = new Set(['download', 'upload', 'total']);
  const safePeriod = allowedPeriods.has(String(period)) ? String(period) : 'this_month';
  const safeMetric = allowedMetrics.has(String(metric)) ? String(metric) : 'download';
  const nowMs = Date.now();
  const startMs = getTrafficPeriodStart(safePeriod, nowMs);
  const before = startMs > 0
    ? db.prepare('SELECT * FROM traffic_snapshots WHERE created_at_ms <= ? ORDER BY created_at_ms DESC LIMIT 1').get(startMs)
    : null;
  const after = startMs > 0
    ? db.prepare('SELECT * FROM traffic_snapshots WHERE created_at_ms > ? ORDER BY created_at_ms ASC').all(startMs)
    : db.prepare('SELECT * FROM traffic_snapshots ORDER BY created_at_ms ASC').all();
  const rows = before ? [before, ...after] : after;
  const allRows = db.prepare('SELECT * FROM traffic_snapshots ORDER BY created_at_ms ASC').all();

  const periodSummary = summarizeTrafficRows(rows);
  const allSummary = summarizeTrafficRows(allRows);
  const currentTotals = getCurrentTrafficTotals();
  const metricMap = {
    download: { label: 'Скачано клиентами', value: periodSummary.download, text: formatTrafficBytes(periodSummary.download), unit: 'traffic' },
    upload: { label: 'Загружено клиентами', value: periodSummary.upload, text: formatTrafficBytes(periodSummary.upload), unit: 'traffic' },
    total: { label: 'Всего вход+выход', value: periodSummary.used, text: formatTrafficBytes(periodSummary.used), unit: 'traffic' }
  };
  const periodLabels = {
    day: 'за 24 часа',
    week: 'за 7 дней',
    month: 'за 30 дней',
    this_month: 'в этом месяце',
    all: 'за всё время наблюдений'
  };
  return {
    period: safePeriod,
    metric: safeMetric,
    periodLabel: periodLabels[safePeriod],
    startMs,
    firstSnapshotAt: rows.length ? Number(rows[0].created_at_ms || 0) : 0,
    latestSnapshotAt: rows.length ? Number(rows[rows.length - 1].created_at_ms || 0) : 0,
    hasBaseline: startMs === 0 || Boolean(before),
    selected: metricMap[safeMetric],
    downloadText: formatTrafficBytes(periodSummary.download),
    uploadText: formatTrafficBytes(periodSummary.upload),
    totalText: formatTrafficBytes(periodSummary.used),
    maxDownloadText: formatMbps(periodSummary.maxDownloadMbps),
    maxUploadText: formatMbps(periodSummary.maxUploadMbps),
    maxTotalText: formatMbps(periodSummary.maxTotalMbps),
    allTimeMaxDownloadText: formatMbps(allSummary.maxDownloadMbps),
    allTimeMaxUploadText: formatMbps(allSummary.maxUploadMbps),
    allTimeMaxTotalText: formatMbps(allSummary.maxTotalMbps),
    currentDownloadText: formatTrafficBytes(currentTotals.downloadBytes),
    currentUploadText: formatTrafficBytes(currentTotals.uploadBytes),
    currentTotalText: formatTrafficBytes(currentTotals.usedBytes),
    snapshotCount: rows.length,
    allSnapshotCount: allRows.length,
    speedSamples: periodSummary.speedSamples,
    allTimeSpeedSamples: allSummary.speedSamples
  };
}

function buildNodeTrafficReport(period = 'this_month', metric = 'total') {
  const allowedPeriods = new Set(['day', 'week', 'month', 'this_month', 'all']);
  const allowedMetrics = new Set(['download', 'upload', 'total']);
  const safePeriod = allowedPeriods.has(String(period)) ? String(period) : 'this_month';
  const safeMetric = allowedMetrics.has(String(metric)) ? String(metric) : 'total';
  const startMs = getTrafficPeriodStart(safePeriod, Date.now());
  const nodes = db.prepare(`
    SELECT id, name, country_code, country_name_ru, country_flag, label_suffix, enabled
    FROM nodes
    ORDER BY ${nodeOrderSql()}
  `).all();
  const rows = [];
  const getCurrentForNode = db.prepare(`
    SELECT
      COALESCE(SUM(upload_bytes), 0) AS upload_bytes,
      COALESCE(SUM(download_bytes), 0) AS download_bytes,
      COALESCE(SUM(used_bytes), 0) AS used_bytes
    FROM client_nodes
    WHERE node_id = ?
  `);
  const getBefore = db.prepare('SELECT * FROM node_traffic_snapshots WHERE node_id = ? AND created_at_ms <= ? ORDER BY created_at_ms DESC LIMIT 1');
  const getAfter = db.prepare('SELECT * FROM node_traffic_snapshots WHERE node_id = ? AND created_at_ms > ? ORDER BY created_at_ms ASC');
  const getAll = db.prepare('SELECT * FROM node_traffic_snapshots WHERE node_id = ? ORDER BY created_at_ms ASC');

  function nodeSortValue(summary) {
    if (safeMetric === 'download') return summary.download;
    if (safeMetric === 'upload') return summary.upload;
    return summary.used;
  }

  for (const node of nodes) {
    const before = startMs > 0 ? getBefore.get(node.id, startMs) : null;
    const after = startMs > 0 ? getAfter.all(node.id, startMs) : getAll.all(node.id);
    const snapshots = before ? [before, ...after] : after;
    const summary = summarizeTrafficRows(snapshots);
    const current = getCurrentForNode.get(node.id) || {};
    const currentUpload = clampByteNumber(current.upload_bytes || 0);
    const currentDownload = clampByteNumber(current.download_bytes || 0);
    const currentUsed = clampByteNumber(current.used_bytes || currentUpload + currentDownload);
    const sortValue = nodeSortValue(summary);
    rows.push({
      nodeId: node.id,
      name: node.name,
      country_code: node.country_code || '',
      country_name_ru: node.country_name_ru || '',
      country_flag: getNodeFlag(node),
      label_suffix: node.label_suffix || '',
      enabled: Number(node.enabled || 0),
      download: summary.download,
      upload: summary.upload,
      total: summary.used,
      maxDownloadMbps: summary.maxDownloadMbps,
      maxUploadMbps: summary.maxUploadMbps,
      maxTotalMbps: summary.maxTotalMbps,
      currentUsed,
      currentDownload,
      currentUpload,
      speedSamples: summary.speedSamples,
      selectedText: safeMetric === 'download' ? formatTrafficBytes(summary.download)
        : safeMetric === 'upload' ? formatTrafficBytes(summary.upload)
        : formatTrafficBytes(summary.used),
      downloadText: formatTrafficBytes(summary.download),
      uploadText: formatTrafficBytes(summary.upload),
      totalText: formatTrafficBytes(summary.used),
      maxTotalText: formatMbps(summary.maxTotalMbps),
      currentTotalText: formatTrafficBytes(currentUsed),
      sortValue
    });
  }
  rows.sort((a, b) => (Number(b.sortValue || 0) - Number(a.sortValue || 0)) || (Number(a.enabled || 0) - Number(b.enabled || 0)) || (a.nodeId - b.nodeId));
  return {
    period: safePeriod,
    metric: safeMetric,
    rows,
    hasData: rows.length > 0
  };
}

function getDashboardLimitRows() {
  const rows = db.prepare(`
    SELECT
      c.id AS client_id,
      c.login,
      c.display_name,
      c.comment,
      c.expiry_time,
      cn.id AS map_id,
      cn.remote_email,
      cn.remote_uuid,
      cn.traffic_gb,
      cn.upload_bytes,
      cn.download_bytes,
      cn.used_bytes,
      n.id AS node_id,
      n.inbound_id,
      n.name,
      n.country_code,
      n.country_name_ru,
      n.country_flag,
      n.label_suffix
    FROM client_nodes cn
    JOIN clients c ON c.id = cn.client_id
    JOIN nodes n ON n.id = cn.node_id
    WHERE cn.enabled = 1 AND cn.traffic_gb > 0
    ORDER BY c.expiry_time ASC, c.login ASC
  `).all();

  for (const row of rows) {
    const node = { id: row.node_id, inbound_id: row.inbound_id };
    const client = { uuid: row.remote_uuid, login: row.remote_email };
    const usage = readUsageForClientNode(node, client, row);
    row.upload_bytes = usage.uploadBytes;
    row.download_bytes = usage.downloadBytes;
    row.used_bytes = usage.usedBytes;
    row.limit_bytes = toTotalGbBytes(row.traffic_gb || 0);
    row.remaining_bytes = Math.max(0, row.limit_bytes - row.used_bytes);
    updateClientNodeUsage(row.map_id, usage);
  }

  return rows;
}

async function fetchOnlineEmailsFromNode(node) {
  if (isRemnawaveNode(node) || isH1CloudNode(node)) return [];
  let data;
  try {
    data = await apiPost(node, '/panel/api/clients/onlines', {}, false);
  } catch (err0) {
    try {
      data = await apiPost(node, '/panel/api/inbounds/onlines', {}, true);
    } catch (err1) {
      try {
        data = await apiPost(node, '/panel/api/inbounds/onlines', {}, false);
      } catch (err2) {
        data = await apiGet(node, '/panel/api/inbounds/onlines');
      }
    }
  }

  const source = data?.obj ?? data?.data ?? data?.result ?? data;
  const values = [];

  function collect(value) {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) return value.forEach(collect);
    if (typeof value === 'object') {
      const email = value.email || value.login || value.name || value.user || value.client;
      if (email) values.push(String(email).trim());
      else Object.values(value).forEach(collect);
      return;
    }
    const text = String(value).trim();
    if (text) values.push(text);
  }

  collect(source);
  return uniqueList(values.map(v => v.trim()).filter(Boolean));
}

function formatRuDateTime(value, fallback = '—') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return raw;
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function markClientSeenOnline(clientId, when = new Date()) {
  const id = Number(clientId || 0);
  if (!id) return '';
  const stamp = when instanceof Date ? when.toISOString() : String(when || '').trim();
  if (!stamp) return '';
  try {
    db.prepare('UPDATE clients SET last_online_at = ? WHERE id = ?').run(stamp, id);
  } catch (_) {}
  return stamp;
}

function clientMatchesRealtimeLogin(candidate, client, mappings = []) {
  const value = String(candidate || '').trim();
  if (!value) return false;
  if (sameText(value, client?.login) || sameText(value, client?.display_name)) return true;
  return Array.isArray(mappings) && mappings.some(map => sameText(value, map?.remote_email));
}

async function getClientRealtimeConnectivity(client, mappings = []) {
  const rows = Array.isArray(mappings) ? mappings : [];
  const activeRows = rows.filter(row => row && row.real_node_id && Number(row.enabled) !== 0 && Number(row.node_enabled) !== 0)
    .filter(row => String(row.last_status || '').toLowerCase() !== 'offline');
  const errors = [];
  for (const row of activeRows) {
    try {
      const emails = await fetchOnlineEmailsFromNode(row);
      const connected = emails.some(email => clientMatchesRealtimeLogin(email, client, rows));
      if (connected) {
        const stamp = markClientSeenOnline(client.id);
        return { connected: true, connectedNodeId: row.node_id || row.real_node_id || 0, lastOnlineAt: stamp || client.last_online_at || '' };
      }
    } catch (err) {
      errors.push(`${getNodePublicName(row)}: ${String(err?.message || err || 'ошибка')}`);
    }
  }
  return { connected: false, connectedNodeId: 0, lastOnlineAt: String(client?.last_online_at || '').trim(), errors };
}

async function getOnlineClientsForDashboard() {
  const nodes = db.prepare(`SELECT * FROM nodes WHERE enabled = 1 ORDER BY ${nodeOrderSql()}`).all();
  const items = new Map();
  const errors = [];

  const nodeResults = await runWithConcurrency(nodes, 4, async node => {
    const emails = await fetchOnlineEmailsFromNode(node);
    return { node, emails };
  });

  for (let resultIndex = 0; resultIndex < nodeResults.length; resultIndex += 1) {
    const result = nodeResults[resultIndex];
    if (result?.status === 'rejected') {
      const node = nodes[resultIndex];
      errors.push(`${getNodePublicName(node)}: ${result.reason?.message || result.reason}`);
      continue;
    }
    const node = result.value.node;
    const emails = Array.isArray(result.value.emails) ? result.value.emails : [];

    for (const email of emails) {
      const client = db.prepare(`
        SELECT c.*
        FROM clients c
        LEFT JOIN client_nodes cn ON cn.client_id = c.id
        WHERE LOWER(c.login) = LOWER(?) OR LOWER(c.display_name) = LOWER(?) OR LOWER(cn.remote_email) = LOWER(?)
        ORDER BY c.id ASC
        LIMIT 1
      `).get(email, email, email);

      if (!client) continue;
      markClientSeenOnline(client.id);
      const key = String(client.id);
      const old = items.get(key) || { ...client, nodes: [] };
      const transport = getInboundTransportInfo(getCachedInbound(node));
      old.nodes.push({
        id: node.id,
        name: getNodeDisplayName(node),
        publicName: getNodePublicName(node),
        nodeType: String(node.node_type || '3xui'),
        countryCode: String(node.country_code || getCountryCodeByName(node.country_name_ru || node.name) || '').toLowerCase(),
        countryNameRu: node.country_name_ru || node.name || '',
        labelSuffix: node.label_suffix || '',
        flag: getNodeFlag(node),
        transportLabel: transport.label
      });
      items.set(key, old);
    }
  }

  return { clients: Array.from(items.values()), errors: errors.slice(0, 8) };
}

function isRemoteClientAlreadyAbsentError(err) {
  const text = String(err?.message || err || '').toLowerCase();
  return /(?:not[ -]?found|does not exist|already (?:deleted|absent)|no such client|client .* absent|record .* not found|404|клиент .* не найден|не найден.*клиент|不存在)/i.test(text);
}

function deleteLocalClientMapping(mapping) {
  if (!mapping?.id) return;
  db.prepare('DELETE FROM client_nodes WHERE id = ?').run(mapping.id);
}

async function probeNodeForClientDeletion(node, options = {}) {
  if (!node) return { ok: false, skipped: true, reason: 'missing' };
  if (Number(node.enabled) === 0 && options.allowDisabled !== true) {
    return { ok: false, skipped: true, reason: 'disabled' };
  }
  const probe = await checkNode(node, { timeoutMs: Math.min(CLIENT_DELETE_TIMEOUT_MS, 5000), lightweight: true });
  if (!probe.ok) return { ok: false, skipped: true, reason: 'offline', error: probe.error || '' };
  return { ok: true, skipped: false, reason: 'online' };
}

async function removeClientFromNode(client, node, map = null, options = {}) {
  const mapping = map || db.prepare('SELECT * FROM client_nodes WHERE client_id = ? AND node_id = ?').get(client.id, node?.id);
  if (!mapping) return { removed: false, reason: 'not_assigned' };

  const allowOfflineLocalCleanup = options.allowOfflineLocalCleanup === true;
  const probe = options.probe || await probeNodeForClientDeletion(node);
  if (!probe.ok) {
    if (allowOfflineLocalCleanup) {
      deleteLocalClientMapping(mapping);
      return { removed: true, reason: probe.reason === 'missing' ? 'orphan_cleaned' : 'offline_skipped' };
    }
    throw new Error(probe.error || (probe.reason === 'disabled' ? 'узел отключён' : 'узел недоступен'));
  }

  let remoteResult = null;
  try {
    remoteResult = await deleteClientFromSpecificNode(node, mapping.remote_uuid, mapping.remote_email || client.login, CLIENT_DELETE_TIMEOUT_MS);
  } catch (err) {
    if (!isRemoteClientAlreadyAbsentError(err)) throw err;
  }
  deleteLocalClientMapping(mapping);
  return { removed: true, reason: 'removed', warning: String(remoteResult?.cleanupWarning || '').trim() };
}

async function removeSelectedClientsFromNode(node, clientIds, operation = null) {
  const ids = normalizePostedNodeIds(clientIds);
  if (!ids.length) throw new Error('Сначала выберите хотя бы одного клиента');

  operation?.setDetail(`Проверяю узел ${getNodePublicName(node)}`);
  const probe = await probeNodeForClientDeletion(node, { allowDisabled: true });
  if (!probe.ok) {
    const reason = probe.error || (probe.reason === 'disabled' ? 'узел отключён' : 'узел недоступен');
    throw new Error(`${getNodePublicName(node)}: ${reason}. Локальные связи не изменены, чтобы не разойтись с удалённой панелью.`);
  }

  let removed = 0;
  let notAssigned = 0;
  let missingClients = 0;
  let failed = 0;
  let completed = 0;
  let skippedAfterFailure = 0;
  let cancelled = false;
  let consecutiveTransportFailures = 0;
  const errors = [];
  const warnings = [];
  operation?.setProgress(0, ids.length, `Удаляю выбранных клиентов из ${getNodePublicName(node)}`);

  for (const id of ids) {
    if (operation?.isCancelled()) { cancelled = true; break; }
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    if (!client) {
      missingClients++;
      completed++;
      operation?.setProgress(completed, ids.length, `Клиент #${id} уже отсутствует в агрегаторе`);
      continue;
    }
    const map = db.prepare('SELECT * FROM client_nodes WHERE client_id = ? AND node_id = ?').get(client.id, node.id);
    if (!map) {
      notAssigned++;
      completed++;
      operation?.setProgress(completed, ids.length, `${client.login || id}: не назначен этому узлу`);
      continue;
    }

    try {
      const result = await removeClientFromNode(client, node, map, { probe, allowOfflineLocalCleanup: false });
      if (result.removed) removed++;
      else notAssigned++;
      if (result.warning) warnings.push(`${client.login || client.id}: ${result.warning}`);
      consecutiveTransportFailures = 0;
    } catch (err) {
      failed++;
      const msg = `${client.login || `клиент #${client.id}`}: ${String(err?.message || err || 'неизвестная ошибка')}`;
      errors.push(msg);
      if (isNodeFastFailError(err)) consecutiveTransportFailures++;
      else consecutiveTransportFailures = 0;
    }

    completed++;
    operation?.setProgress(completed, ids.length, `${getNodePublicName(node)}: ${client.login || client.id}`);
    if (consecutiveTransportFailures >= 2) {
      skippedAfterFailure = Math.max(0, ids.length - completed);
      errors.push(`${getNodePublicName(node)}: после двух сетевых ошибок подряд оставшиеся ${skippedAfterFailure} клиентов не удалялись; их локальные связи сохранены.`);
      operation?.setDetail('Удаление остановлено из-за потери связи с узлом');
      break;
    }
  }

  return {
    requested: ids.length,
    completed,
    removed,
    notAssigned,
    missingClients,
    skippedAfterFailure,
    failed,
    cancelled,
    errors: [...errors, ...warnings.map(text => `Предупреждение очистки: ${text}`)].slice(0, 12)
  };
}

async function runWithConcurrency(items, limit, worker) {
  const list = Array.from(items || []);
  const results = new Array(list.length);
  let cursor = 0;
  const count = Math.max(1, Math.min(Number(limit || 1), list.length || 1));
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= list.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await worker(list[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: count }, () => runner()));
  return results;
}

function newClientDeletionStats() {
  return { remoteDeleted: 0, remoteAbsent: 0, offlineSkipped: 0, disabledSkipped: 0, orphanCleaned: 0 };
}

function mergeClientDeletionStats(target, source) {
  const out = target || newClientDeletionStats();
  for (const key of Object.keys(out)) out[key] += Math.max(0, Number(source?.[key] || 0));
  return out;
}

function clientDeletionStatsSuffix(stats) {
  if (!stats) return '';
  const parts = [];
  if (stats.offlineSkipped) parts.push(`недоступных узлов пропущено: ${stats.offlineSkipped}`);
  if (stats.disabledSkipped) parts.push(`отключённых узлов пропущено: ${stats.disabledSkipped}`);
  if (stats.orphanCleaned) parts.push(`старых связей удалённых узлов очищено: ${stats.orphanCleaned}`);
  if (stats.remoteAbsent) parts.push(`клиент уже отсутствовал на узлах: ${stats.remoteAbsent}`);
  return parts.length ? `. ${parts.join(', ')}` : '';
}

async function deleteClientEverywhere(client, deleteMode, options = {}) {
  const mappings = db.prepare('SELECT * FROM client_nodes WHERE client_id = ? ORDER BY id ASC').all(client.id);
  let targets = [];
  if (deleteMode === 'all') targets = mappings;
  if (deleteMode === 'secondary') targets = mappings.slice(1);

  const failures = [];
  const stats = newClientDeletionStats();
  const results = await runWithConcurrency(targets, 4, async map => {
    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(map.node_id);
    if (!node) {
      deleteLocalClientMapping(map);
      return { kind: 'orphan_cleaned' };
    }

    const probeCache = options.probeCache instanceof Map ? options.probeCache : null;
    let probePromise = probeCache ? probeCache.get(Number(node.id)) : null;
    if (!probePromise) {
      probePromise = probeNodeForClientDeletion(node);
      if (probeCache) probeCache.set(Number(node.id), probePromise);
    }
    const probe = await probePromise;
    if (!probe.ok) {
      // По запросу пользователя недоступный или отключённый узел не должен
      // блокировать локальное удаление. Его связь очищается, а удаление на
      // удалённом сервере сознательно пропускается.
      deleteLocalClientMapping(map);
      return { kind: probe.reason === 'disabled' ? 'disabled_skipped' : 'offline_skipped' };
    }

    try {
      await deleteClient(node, map.remote_uuid, map.remote_email || client.login, CLIENT_DELETE_TIMEOUT_MS);
      deleteLocalClientMapping(map);
      return { kind: 'remote_deleted' };
    } catch (err) {
      if (isRemoteClientAlreadyAbsentError(err)) {
        deleteLocalClientMapping(map);
        return { kind: 'remote_absent' };
      }
      const nodeName = getNodePublicName(node) || node.name || `узел #${node.id}`;
      throw new Error(`${nodeName}: ${String(err?.message || err || 'ошибка удаления')}`);
    }
  });

  results.forEach(result => {
    if (result?.status === 'rejected') failures.push(String(result.reason?.message || result.reason || 'ошибка удаления'));
    const kind = result?.value?.kind;
    if (kind === 'remote_deleted') stats.remoteDeleted += 1;
    if (kind === 'remote_absent') stats.remoteAbsent += 1;
    if (kind === 'offline_skipped') stats.offlineSkipped += 1;
    if (kind === 'disabled_skipped') stats.disabledSkipped += 1;
    if (kind === 'orphan_cleaned') stats.orphanCleaned += 1;
  });

  if (failures.length) {
    const err = new Error(`Не удалось удалить клиента на ${failures.length} доступных узлах: ${failures.slice(0, 3).join(' | ')}`);
    err.deleteStats = stats;
    throw err;
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM client_nodes WHERE client_id = ?').run(client.id);
    db.prepare('DELETE FROM clients WHERE id = ?').run(client.id);
  });
  tx();
  return stats;
}

app.get('/', requireAuth, (req, res) => res.redirect('/dashboard'));

app.get('/mobile-login', requireAllowedAdminIp, (req, res) => {
  const accessKey = getCurrentPanelAccessKey();
  if (accessKey && req.session?.panelAccessGranted === true) setPanelRememberCookie(res, accessKey);
  if (req.session?.userId) return res.redirect('/dashboard');
  return res.redirect('/login');
});

app.get('/login', requireAllowedAdminIp, (req, res) => {
  if (req.session?.userId) return res.redirect('/dashboard');
  render(res, 'login', { error: req.query.message || null });
});

app.post('/login', requireAllowedAdminIp, (req, res) => {
  const username = String(req.body.username || '');
  const failure = getLoginFailure(req, username);

  if (failure.lockedUntil && Date.now() < failure.lockedUntil) {
    const minutes = Math.ceil((failure.lockedUntil - Date.now()) / 60000);
    return render(res, 'login', { error: `Слишком много попыток входа. Повтори через ${minutes} мин.` });
  }

  const user = db.prepare('SELECT * FROM app_users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(req.body.password || '', user.password_hash)) {
    const count = Number(failure.count || 0) + 1;
    const lockedUntil = count >= LOGIN_MAX_ATTEMPTS ? Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000 : 0;
    loginFailures.set(failure.key, { count, lockedUntil });
    return render(res, 'login', { error: 'Неверный логин или пароль' });
  }

  loginFailures.delete(failure.key);
  const panelAccessWasGranted = req.session?.panelAccessGranted === true;
  req.session.regenerate((err) => {
    if (err) return render(res, 'login', { error: 'Не удалось создать сессию' });
    req.session.userId = user.id;
    req.session.panelAccessGranted = panelAccessWasGranted;
    req.session.loginIp = getClientIp(req);
    req.session.lastActivity = Date.now();
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    if (panelAccessWasGranted) setPanelRememberCookie(res, getCurrentPanelAccessKey());
    res.redirect('/dashboard');
  });
});
app.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect(buildLoginRedirectPath()));
});


function appendMessageToBackUrl(back, message, errorText = '', fallback = '/clients') {
  const raw = String(back || '').trim();
  const safeBack = raw.startsWith('/clients') || raw.startsWith('/dashboard') || raw.startsWith('/settings') || raw.startsWith('/vpn') ? raw : fallback;
  const url = new URL(safeBack, 'http://local');
  if (message) url.searchParams.set('message', String(message || ''));
  else url.searchParams.delete('message');
  if (errorText) url.searchParams.set('error', String(errorText));
  else url.searchParams.delete('error');
  return url.pathname + url.search;
}


function vpnBack(tab, type, message) {
  const safeTab = ['hosts', 'services', 'clients', 'jobs'].includes(String(tab || '')) ? String(tab) : 'hosts';
  const key = type === 'error' ? 'error' : 'message';
  return `/vpn?tab=${encodeURIComponent(safeTab)}&${key}=${encodeURIComponent(String(message || ''))}`;
}

app.get('/vpn', requireAuth, (req, res) => {
  const data = vpnManager.listPageData(req.query);
  let aggregatorPublicHost = '';
  try { aggregatorPublicHost = new URL(getPanelPublicUrl()).hostname || ''; } catch (_) {}
  render(res, 'vpn', {
    ...data,
    aggregatorPublicHost,
    message: req.query.message || '',
    error: req.query.error || ''
  });
});

app.post('/vpn/hosts', requireAuth, (req, res) => {
  try {
    const host = vpnManager.createHost(req.body || {});
    res.redirect(vpnBack('hosts', 'message', `VPS «${host.name}» добавлен. Выполните проверку SSH.`));
  } catch (err) {
    res.redirect(vpnBack('hosts', 'error', err.message || err));
  }
});

app.post('/vpn/hosts/:id/test', requireAuth, async (req, res) => {
  try {
    await vpnManager.testHost(req.params.id);
    res.redirect(vpnBack('hosts', 'message', 'SSH-подключение работает, fingerprint сервера сохранён.'));
  } catch (err) {
    res.redirect(vpnBack('hosts', 'error', `SSH: ${err.message || err}`));
  }
});

app.post('/vpn/hosts/:id/delete', requireAuth, (req, res) => {
  try {
    vpnManager.deleteHost(req.params.id);
    res.redirect(vpnBack('hosts', 'message', 'VPS удалён из агрегатора.'));
  } catch (err) {
    res.redirect(vpnBack('hosts', 'error', err.message || err));
  }
});

app.post('/vpn/services', requireAuth, (req, res) => {
  try {
    const service = vpnManager.createService(req.body || {});
    res.redirect(vpnBack('services', 'message', `Сервис «${service.name}» создан. Теперь нажмите «Установить».`));
  } catch (err) {
    res.redirect(vpnBack('services', 'error', err.message || err));
  }
});

app.post('/vpn/services/:id/install', requireAuth, async (req, res) => {
  const service = vpnManager.getService(req.params.id);
  if (!service) return res.redirect(vpnBack('services', 'error', 'Сервис не найден'));
  const job = db.prepare(`INSERT INTO vpn_jobs (host_id, service_id, job_type, status, progress, message, started_at) VALUES (?, ?, 'install', 'running', 10, ?, ?)`)
    .run(service.host_id, service.id, `Установка ${service.name}`, new Date().toISOString());
  try {
    await vpnManager.installService(service.id);
    db.prepare(`UPDATE vpn_jobs SET status = 'done', progress = 100, message = ?, finished_at = ? WHERE id = ?`)
      .run(`Сервис ${service.name} установлен`, new Date().toISOString(), job.lastInsertRowid);
    res.redirect(vpnBack('services', 'message', `${service.name}: установка завершена.`));
  } catch (err) {
    db.prepare(`UPDATE vpn_jobs SET status = 'error', progress = 100, message = ?, log_text = ?, finished_at = ? WHERE id = ?`)
      .run(`Ошибка установки ${service.name}`, String(err.message || err).slice(0, 10000), new Date().toISOString(), job.lastInsertRowid);
    res.redirect(vpnBack('services', 'error', `${service.name}: ${err.message || err}`));
  }
});

app.post('/vpn/services/:id/check', requireAuth, async (req, res) => {
  try {
    await vpnManager.checkService(req.params.id);
    res.redirect(vpnBack('services', 'message', 'Сервис доступен и отвечает.'));
  } catch (err) {
    res.redirect(vpnBack('services', 'error', `Проверка сервиса: ${err.message || err}`));
  }
});

app.post('/vpn/services/:id/domain-check', requireAuth, async (req, res) => {
  try {
    const result = await vpnManager.checkServiceDomain(req.params.id);
    const text = result.matched
      ? `Домен ${result.endpoint} совпадает с IP выбранного VPS.`
      : `Домен ${result.endpoint} не совпадает с IP выбранного VPS.`;
    res.redirect(vpnBack('services', result.matched ? 'message' : 'error', text));
  } catch (err) {
    res.redirect(vpnBack('services', 'error', `Проверка домена: ${err.message || err}`));
  }
});

app.post('/vpn/services/:id/edit', requireAuth, async (req, res) => {
  try {
    await vpnManager.updateService(req.params.id, req.body || {});
    res.redirect(vpnBack('services', 'message', 'Общие параметры сервиса сохранены, клиентские конфигурации обновлены в агрегаторе.'));
  } catch (err) {
    res.redirect(vpnBack('services', 'error', err.message || err));
  }
});

app.post('/vpn/services/:id/migrate', requireAuth, async (req, res) => {
  const service = vpnManager.getService(req.params.id);
  if (!service) return res.redirect(vpnBack('services', 'error', 'Сервис не найден'));
  const job = db.prepare(`INSERT INTO vpn_jobs (host_id, service_id, job_type, status, progress, message, started_at) VALUES (?, ?, 'migrate', 'running', 10, ?, ?)`)
    .run(Number(req.body.target_host_id || 0), service.id, `Перенос ${service.name}`, new Date().toISOString());
  try {
    await vpnManager.migrateService(service.id, req.body.target_host_id, req.body || {});
    db.prepare(`UPDATE vpn_jobs SET status = 'done', progress = 100, message = ?, finished_at = ? WHERE id = ?`)
      .run(`Сервис ${service.name} перенесён, клиенты восстановлены из агрегатора`, new Date().toISOString(), job.lastInsertRowid);
    res.redirect(vpnBack('services', 'message', `${service.name}: перенос завершён, клиенты импортированы на новый VPS.`));
  } catch (err) {
    db.prepare(`UPDATE vpn_jobs SET status = 'error', progress = 100, message = ?, log_text = ?, finished_at = ? WHERE id = ?`)
      .run(`Ошибка переноса ${service.name}`, String(err.message || err).slice(0, 10000), new Date().toISOString(), job.lastInsertRowid);
    res.redirect(vpnBack('services', 'error', `${service.name}: ${err.message || err}`));
  }
});

app.post('/vpn/services/:id/delete', requireAuth, async (req, res) => {
  try {
    await vpnManager.deleteService(req.params.id);
    res.redirect(vpnBack('services', 'message', 'Сервис удалён из агрегатора. Файлы на VPS не удалялись.'));
  } catch (err) {
    res.redirect(vpnBack('services', 'error', err.message || err));
  }
});

app.post('/vpn/services/:id/clients', requireAuth, async (req, res) => {
  const fallback = '/clients?type=wireguard';
  try {
    const created = await vpnManager.createClient(req.params.id, req.body || {});
    const type = created.protocol === 'outline' ? 'outline' : created.protocol === 'wireguard' ? 'wireguard' : 'amneziawg';
    const back = req.body.back || `/clients?type=${type}`;
    res.redirect(appendMessageToBackUrl(back, 'VPN-клиент создан, конфигурация сохранена в агрегаторе.', '', fallback));
  } catch (err) {
    const back = req.body.back || fallback;
    res.redirect(appendMessageToBackUrl(back, '', err.message || err, fallback));
  }
});

app.get('/vpn/clients/:id/config', requireAuth, (req, res) => {
  try {
    const client = vpnManager.getClient(req.params.id);
    if (!client) return res.status(404).send('VPN client not found');
    const config = vpnManager.revealClientConfig(client.id);
    const ext = client.protocol === 'outline' ? 'txt' : 'conf';
    const safeName = String(client.name || `vpn-client-${client.id}`).replace(/[^a-z0-9а-яё._-]+/giu, '-').replace(/^-|-$/g, '') || `vpn-client-${client.id}`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    setAttachmentDispositionHeader(res, `${safeName}.${ext}`, 'vpn-client');
    res.setHeader('Cache-Control', 'no-store');
    res.send(config);
  } catch (err) {
    res.status(500).send(String(err.message || err));
  }
});

app.get('/vpn/clients/:id/qr', requireAuth, async (req, res) => {
  try {
    const text = vpnManager.revealClientConfig(req.params.id);
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, width: 420, errorCorrectionLevel: 'M' });
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(svg);
  } catch (err) {
    res.status(500).send(String(err.message || err));
  }
});

app.post('/vpn/clients/:id/toggle', requireAuth, async (req, res) => {
  const back = req.body.back || '/clients?type=wireguard';
  try {
    const client = vpnManager.getClient(req.params.id);
    if (!client) throw new Error('VPN-клиент не найден');
    await vpnManager.setClientEnabled(client.id, client.enabled === 0);
    res.redirect(appendMessageToBackUrl(back, client.enabled === 0 ? 'VPN-клиент включён.' : 'VPN-клиент отключён.', '', '/clients?type=wireguard'));
  } catch (err) {
    res.redirect(appendMessageToBackUrl(back, '', err.message || err, '/clients?type=wireguard'));
  }
});

app.post('/vpn/clients/:id/extend', requireAuth, async (req, res) => {
  const back = req.body.back || '/clients?type=wireguard';
  try {
    const client = vpnManager.getClient(req.params.id);
    if (!client) throw new Error('VPN-клиент не найден');
    const raw = Number.parseInt(String(req.body.days ?? '30'), 10);
    if (!Number.isFinite(raw)) throw new Error('Укажите количество дней');
    const days = raw === 0 ? 0 : Math.min(3650, Math.max(30, raw));
    const expiry = days === 0 ? 0 : Math.max(Date.now(), Number(client.expires_at || 0)) + days * 86400000;
    db.prepare('UPDATE vpn_clients SET expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(expiry, client.id);
    if (client.enabled === 0 && client.disabled_reason === 'expired') {
      await vpnManager.setClientEnabled(client.id, true);
    }
    res.redirect(appendMessageToBackUrl(back, days === 0 ? 'Для клиента установлен бессрочный доступ.' : `Доступ продлён на ${days} дней.`, '', '/clients?type=wireguard'));
  } catch (err) {
    res.redirect(appendMessageToBackUrl(back, '', err.message || err, '/clients?type=wireguard'));
  }
});

app.post('/vpn/clients/:id/rename', requireAuth, async (req, res) => {
  const back = req.body.back || '/clients?type=wireguard';
  try {
    await vpnManager.renameClient(req.params.id, req.body.name);
    res.redirect(appendMessageToBackUrl(back, 'Имя VPN-клиента изменено.', '', '/clients?type=wireguard'));
  } catch (err) {
    res.redirect(appendMessageToBackUrl(back, '', err.message || err, '/clients?type=wireguard'));
  }
});

app.post('/vpn/clients/:id/delete', requireAuth, async (req, res) => {
  const back = req.body.back || '/clients?type=wireguard';
  try {
    await vpnManager.deleteClient(req.params.id);
    res.redirect(appendMessageToBackUrl(back, 'VPN-клиент удалён с сервера и из агрегатора.', '', '/clients?type=wireguard'));
  } catch (err) {
    res.redirect(appendMessageToBackUrl(back, '', err.message || err, '/clients?type=wireguard'));
  }
});

let vpnExpirySweepRunning = false;
async function enforceVpnClientExpirations() {
  if (vpnExpirySweepRunning) return;
  vpnExpirySweepRunning = true;
  try {
    const expired = db.prepare(`SELECT id FROM vpn_clients WHERE enabled = 1 AND expires_at > 0 AND expires_at <= ? ORDER BY id LIMIT 50`).all(Date.now());
    for (const row of expired) {
      try { await vpnManager.setClientEnabled(row.id, false, 'expired'); }
      catch (err) { console.error(`VPN expiry disable failed for client ${row.id}:`, err.message || err); }
    }
  } finally {
    vpnExpirySweepRunning = false;
  }
}

app.post('/dashboard/traffic-refresh', requireAuth, async (req, res) => {
  const period = String(req.body.traffic_period || 'this_month');
  const metric = String(req.body.traffic_metric || 'download');
  try {
    const result = await refreshAllClientUsageFromNodes();
    recordTrafficSnapshot(true, 'refresh');
    const qs = new URLSearchParams({ traffic_period: period, traffic_metric: metric, message: 'Снимок трафика обновлён из 3x-ui.' });
    if (result.errors && result.errors.length) qs.set('error', result.errors.join(' | '));
    res.redirect('/dashboard?' + qs.toString());
  } catch (err) {
    const qs = new URLSearchParams({ traffic_period: period, traffic_metric: metric, error: String(err.message || err) });
    res.redirect('/dashboard?' + qs.toString());
  }
});



function buildClientDiscrepancyReport(limit = 200) {
  const maxRows = Math.min(Math.max(Number(limit || 200), 1), 500);
  const rows = db.prepare(`
    SELECT
      c.id AS client_id,
      c.login,
      c.display_name,
      c.comment,
      c.uuid,
      c.expiry_time,
      c.traffic_gb,
      c.enabled AS client_enabled,
      n.id AS node_id,
      n.name AS node_name,
      n.node_type,
      n.country_code,
      n.country_name_ru,
      n.country_flag,
      n.label_suffix,
      n.enabled AS node_enabled,
      n.inbound_id,
      cn.id AS map_id,
      cn.remote_email,
      cn.remote_uuid,
      cn.enabled AS map_enabled,
      cn.traffic_gb AS node_traffic_gb
    FROM clients c
    JOIN nodes n ON n.enabled = 1
    LEFT JOIN client_nodes cn ON cn.client_id = c.id AND cn.node_id = n.id
    WHERE c.enabled = 1
      AND (cn.id IS NULL OR cn.enabled = 0 OR LOWER(COALESCE(cn.remote_uuid, '')) != LOWER(COALESCE(c.uuid, '')))
    ORDER BY c.id DESC, ${nodeOrderSql('n')}
    LIMIT ?
  `).all(maxRows);

  return rows.map(row => {
    let status = 'ok';
    let message = 'OK';
    if (!row.map_id) {
      status = 'missing';
      message = 'клиент отсутствует на узле';
    } else if (Number(row.map_enabled) === 0) {
      status = 'disabled';
      message = 'клиент отключён на этом узле';
    } else if (String(row.remote_uuid || '').toLowerCase() !== String(row.uuid || '').toLowerCase()) {
      status = 'uuid_mismatch';
      message = 'UUID отличается от агрегатора';
    }
    return {
      ...row,
      status,
      message,
      nodeTitle: getNodeDisplayName(row),
      clientTitle: row.display_name || row.login
    };
  });
}

function buildSuspiciousTrafficReport(limit = 30) {
  const thresholdGb = parseGbThreshold(getSetting('telegram_suspicious_daily_gb', '100'), 100);
  const thresholdBytes = thresholdGb * 1024 * 1024 * 1024;
  const rows = getTopClientUsageReport(limit).map(row => ({
    ...row,
    suspicious: thresholdBytes > 0 && row.usedBytes >= thresholdBytes,
    thresholdText: `${thresholdGb} ГБ`
  }));
  return { thresholdGb, thresholdText: `${thresholdGb} ГБ`, rows };
}

async function buildIosSafetyReport() {
  const originalRules = buildRoutingRules();
  const safeRules = buildIosSafeRoutingRules();
  const activeRules = getEffectiveJsonRoutingRules();
  const routingBytes = Buffer.byteLength(JSON.stringify(activeRules), 'utf8');
  const originalBytes = Buffer.byteLength(JSON.stringify(originalRules), 'utf8');
  const domains = activeRules.reduce((sum, r) => sum + (Array.isArray(r.domain) ? r.domain.length : 0), 0);
  const ips = activeRules.reduce((sum, r) => sum + (Array.isArray(r.ip) ? r.ip.length : 0), 0);
  const strippedDomains = originalRules.reduce((sum, r) => sum + (Array.isArray(r.domain) ? r.domain.length : 0), 0) - safeRules.reduce((sum, r) => sum + (Array.isArray(r.domain) ? r.domain.length : 0), 0);
  const strippedIps = originalRules.reduce((sum, r) => sum + (Array.isArray(r.ip) ? r.ip.length : 0), 0) - safeRules.reduce((sum, r) => sum + (Array.isArray(r.ip) ? r.ip.length : 0), 0);
  let sampleJsonBytes = 0;
  let sampleClient = null;
  let sampleNodes = 0;

  const client = db.prepare('SELECT * FROM clients WHERE enabled = 1 ORDER BY id DESC LIMIT 1').get();
  if (client) {
    try {
      const entries = await buildSubscriptionEntries(client, true);
      sampleNodes = entries.length;
      const subscriptionName = getSetting('subscription_name', DEFAULT_SUBSCRIPTION_NAME);
      const jsonPayload = entries
        .filter(e => String(e.line || '').startsWith('vless://'))
        .map((entry, index) => buildHappJsonConfigFromLine(client, entry.line, subscriptionName, index, isRoutingEnabledForNode(entry.nodeId)));
      sampleJsonBytes = Buffer.byteLength(JSON.stringify(jsonPayload), 'utf8');
      sampleClient = { id: client.id, login: client.login, subSlug: client.sub_slug };
    } catch (err) {
      sampleClient = { id: client.id, login: client.login, subSlug: client.sub_slug, error: String(err.message || err) };
    }
  }

  const riskReasons = [];
  if (!isIosSafeRoutingEnabled()) riskReasons.push('iOS-safe режим отключён');
  if (activeRules.length > 350) riskReasons.push('много routing-правил');
  if (domains + ips > 800) riskReasons.push('очень много domain/ip элементов');
  if (routingBytes > 250 * 1024) riskReasons.push('крупный routing-блок');
  if (sampleJsonBytes > 900 * 1024) riskReasons.push('крупная JSON-подписка');

  return {
    enabled: isIosSafeRoutingEnabled(),
    routingRulesCount: activeRules.length,
    originalRoutingRulesCount: originalRules.length,
    domainItems: domains,
    ipItems: ips,
    strippedDomains: Math.max(0, strippedDomains),
    strippedIps: Math.max(0, strippedIps),
    routingBytes,
    originalRoutingBytes: originalBytes,
    routingSizeText: formatTrafficBytes(routingBytes),
    originalRoutingSizeText: formatTrafficBytes(originalBytes),
    sampleJsonBytes,
    sampleJsonSizeText: formatTrafficBytes(sampleJsonBytes),
    sampleClient,
    sampleNodes,
    risk: riskReasons.length ? 'warning' : 'ok',
    riskText: riskReasons.length ? riskReasons.join(', ') : 'OK для iOS-safe JSON + geosite/geoip',
    recommendations: riskReasons.length
      ? ['iOS-safe режим сохраняет geosite:/geoip: и чистит только несовместимые/пустые поля JSON.', 'RAW в подписках и JSON нормализуется в TCP для совместимости iOS.', 'Если iOS всё ещё не импортирует профиль, проверь /json/<subId>?format=single.']
      : ['iOS-safe routing включён.', 'geosite:/geoip: сохраняются в JSON-подписке для полноценной маршрутизации RU/direct.', 'RAW транспорт отдаётся iOS как TCP.']
  };
}

function buildHealthOverview() {
  const nodes = db.prepare(`SELECT * FROM nodes ORDER BY ${nodeOrderSql()}`).all();
  const clientsCount = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
  const offlineNodes = nodes.filter(n => String(n.last_status || '').toLowerCase() === 'offline');
  const unknownNodes = nodes.filter(n => !n.last_status || String(n.last_status).toLowerCase() === 'unknown');
  const redirectStatus = (() => {
    try { return getRedirectStatus(); } catch (err) { return { ok: false, message: String(err.message || err) }; }
  })();
  const missingMaps = db.prepare(`
    SELECT COUNT(*) AS c
    FROM clients c
    JOIN nodes n ON n.enabled = 1
    LEFT JOIN client_nodes cn ON cn.client_id = c.id AND cn.node_id = n.id
    WHERE c.enabled = 1 AND cn.id IS NULL
  `).get().c;
  const checks = [
    { name: 'База данных', ok: true, message: 'доступна' },
    { name: 'Узлы', ok: nodes.length > 0 && offlineNodes.length === 0, message: `${nodes.length} всего, offline: ${offlineNodes.length}, unknown: ${unknownNodes.length}` },
    { name: 'Клиенты', ok: clientsCount > 0, message: `${clientsCount} клиентов` },
    { name: 'Связи клиентов с узлами', ok: Number(missingMaps || 0) === 0, message: missingMaps ? `отсутствующих связей: ${missingMaps}` : 'расхождений по отсутствующим связям не найдено' },
    { name: 'Helper перенаправления', ok: redirectStatus.ok !== false, message: redirectStatus.message || redirectStatus.state || 'статус прочитан' }
  ];
  return {
    ok: checks.every(c => c.ok),
    checks,
    nodes,
    offlineNodes,
    unknownNodes,
    clientsCount,
    missingMaps
  };
}


app.get('/dashboard/panel-check.json', requireAuth, async (req, res) => {
  const started = Date.now();
  const result = { ok: true, generatedAt: new Date().toISOString(), checks: [] };
  function add(name, ok, message, details = {}) {
    if (!ok) result.ok = false;
    result.checks.push({ name, ok: !!ok, message: String(message || ''), details });
  }
  try {
    const nodes = db.prepare(`SELECT * FROM nodes ORDER BY ${nodeOrderSql()}`).all();
    add('Узлы', nodes.length > 0, nodes.length ? `Добавлено узлов: ${nodes.length}` : 'Узлы не добавлены');
    for (const node of nodes) {
      const nodeCheckStarted = Date.now();
      try {
        const probe = await checkNode(node);
        add(`Узел: ${getNodeDisplayName(node)}`, !!probe.ok, probe.ok ? 'OK' : (probe.error || 'ошибка проверки'), { nodeId: node.id, ms: Date.now() - nodeCheckStarted });
      } catch (err) {
        add(`Узел: ${getNodeDisplayName(node)}`, false, err.message || err, { nodeId: node.id, ms: Date.now() - nodeCheckStarted });
      }
    }
    const routing = getRoutingConfig();
    add('Маршрутизация', true, routing.enabled ? `Включена, режим: ${routing.mode || 'proxy-selected'}` : 'Выключена');
    const redirectStatus = getRedirectStatus();
    add('Перенаправление/helper', redirectStatus.ok !== false, redirectStatus.message || redirectStatus.state || 'статус прочитан', { updatedAt: redirectStatus.updatedAt || redirectStatus.lastUpdate || '' });
    const clientsCount = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
    add('Клиенты', true, `Клиентов в агрегаторе: ${clientsCount}`);
    result.durationMs = Date.now() - started;
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err), checks: result.checks });
  }
});


app.get('/dashboard/traffic-series.json', requireAuth, (req, res) => {
  // stage87 — суточные дельты скачанного трафика для графика на дашборде.
  try {
    const days = Math.min(90, Math.max(7, Number(req.query.days || 30) || 30));
    const dayMs = 24 * 60 * 60 * 1000;
    const start = new Date(Date.now() - (days - 1) * dayMs);
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    function trafficDayKey(ms) {
      const d = new Date(Number(ms) || 0);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${mm}-${dd}`;
    }
    const before = db.prepare('SELECT * FROM traffic_snapshots WHERE created_at_ms <= ? ORDER BY created_at_ms DESC LIMIT 1').get(startMs);
    const after = db.prepare('SELECT * FROM traffic_snapshots WHERE created_at_ms > ? ORDER BY created_at_ms ASC').all(startMs);
    const rows = before ? [before, ...after] : after;
    const buckets = new Map();
    for (let i = 0; i < days; i += 1) buckets.set(trafficDayKey(startMs + i * dayMs), 0);
    let prevRow = null;
    for (const row of rows) {
      if (prevRow) {
        const delta = Math.max(0, clampByteNumber(row.download_bytes) - clampByteNumber(prevRow.download_bytes));
        const key = trafficDayKey(row.created_at_ms);
        if (delta > 0 && buckets.has(key)) buckets.set(key, buckets.get(key) + delta);
      }
      prevRow = row;
    }
    let totalBytes = 0;
    const series = [];
    for (const [d, bytes] of buckets.entries()) {
      totalBytes += bytes;
      series.push({ d, gb: Math.round(bytes / 1073741824 * 100) / 100 });
    }
    res.json({ ok: true, days, series, totalText: formatTrafficBytes(totalBytes) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get('/dashboard/live-client-traffic.json', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 500);
    const minMbps = Math.max(0, Number(req.query.min_mbps || 0.1));
    const refresh = String(req.query.refresh || '1') !== '0';
    let refreshResult = { errors: [] };
    if (refresh) {
      refreshResult = await refreshAllClientUsageFromNodes();
      recordTrafficSnapshot(true, 'live');
    }
    const report = buildLiveClientTrafficReport(limit, minMbps);
    res.json({ ok: true, ...report, errors: refreshResult.errors || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get('/dashboard/live-client-traffic-probe.json', requireAuth, async (req, res) => {
  const startedAt = Date.now();
  try {
    const allowedSeconds = new Set([5, 10, 15]);
    const requestedSeconds = Number(req.query.seconds || req.query.duration || 5);
    const seconds = allowedSeconds.has(requestedSeconds) ? requestedSeconds : 5;
    const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 100);
    const minMbps = Math.max(0, Number(req.query.min_mbps || 0.05));

    const before = await refreshAllClientUsageFromNodes();
    recordTrafficSnapshot(true, 'live_probe_start');

    await sleepMs(seconds * 1000);

    const after = await refreshAllClientUsageFromNodes();
    recordTrafficSnapshot(true, 'live_probe_end');

    const report = buildLiveClientTrafficReport(limit, minMbps);
    const errors = [...(before.errors || []), ...(after.errors || [])].slice(0, 12);
    res.json({
      ok: true,
      ...report,
      durationSeconds: seconds,
      elapsedMs: Date.now() - startedAt,
      errors,
      mode: 'duration_probe'
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err), elapsedMs: Date.now() - startedAt });
  }
});


app.get('/dashboard/online-clients.json', requireAuth, async (req, res) => {
  try {
    const result = await getOnlineClientsForDashboard();
    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      clients: result.clients || [],
      errors: result.errors || []
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err), clients: [], errors: [] });
  }
});


app.get('/diagnostics', requireAuth, async (req, res) => {
  try {
    const health = buildHealthOverview();
    const discrepancies = buildClientDiscrepancyReport(200);
    const suspicious = buildSuspiciousTrafficReport(30);
    const ios = await buildIosSafetyReport();
    const updateStatus = await getProjectUpdateStatus(req.query.check_update === '1');
    const diagnosticNodes = db.prepare(`SELECT * FROM nodes ORDER BY ${nodeOrderSql()}`).all().map(enrichNodeWithCachedTransport);
    const nodeProbeResult = req.query.probe_node_id ? await buildNodeConnectivityProbe(req.query.probe_node_id) : null;
    render(res, 'diagnostics', {
      health,
      discrepancies,
      suspicious,
      ios,
      updateStatus,
      diagnosticNodes,
      nodeProbeResult,
      selectedProbeNodeId: Number(req.query.probe_node_id || 0) || 0,
      telegramNotificationsEnabled: getSetting('telegram_notifications_enabled', '0') === '1',
      telegramChatId: getSetting('telegram_chat_id', ''),
      message: req.query.message || '',
      error: req.query.error || ''
    });
  } catch (err) {
    console.error('Diagnostics page failed:', err);
    res.status(500).send(`Ошибка диагностики: ${htmlEscape(String(err.message || err))}`);
  }
});

app.get('/dashboard', requireAuth, async (req, res) => {
  const stats = {
    nodes: db.prepare('SELECT COUNT(*) AS c FROM nodes').get().c,
    clients: db.prepare('SELECT COUNT(*) AS c FROM clients').get().c,
    online: db.prepare("SELECT COUNT(*) AS c FROM nodes WHERE last_status = 'online'").get().c,
    offline: db.prepare("SELECT COUNT(*) AS c FROM nodes WHERE last_status = 'offline'").get().c,
  };

  const now = Date.now();
  const week = now + 7 * 24 * 60 * 60 * 1000;
  const expiringClients = db.prepare(`
    SELECT * FROM clients
    WHERE enabled = 1 AND expiry_time > 0 AND expiry_time <= ?
    ORDER BY expiry_time ASC
    LIMIT 50
  `).all(week);

  const showOnlineClients = req.query.online === '1';
  const onlineResult = showOnlineClients
    ? await getOnlineClientsForDashboard()
    : { clients: [], errors: [] };

  const limitedClients = getDashboardLimitRows();
  const pulseNodes = db.prepare(`SELECT id, name, node_type, country_code, country_name_ru, country_flag, label_suffix, enabled, last_status FROM nodes ORDER BY ${nodeOrderSql()}`).all();
  recordTrafficSnapshot(false, 'passive');
  const trafficReport = buildTrafficReport(req.query.traffic_period, req.query.traffic_metric);
  const nodeTrafficReport = buildNodeTrafficReport(req.query.traffic_period, req.query.traffic_metric);
  const liveClientTrafficReport = buildLiveClientTrafficReport(10, 0.1);
  const topClientUsageRows = getTopClientUsageReport(20);

  render(res, 'dashboard', {
    stats,
    pulseNodes,
    trafficReport,
    nodeTrafficReport,
    liveClientTrafficReport,
    topClientUsageRows,
    expiringClients,
    limitedClients,
    showOnlineClients,
    onlinePage: Math.max(1, Number(req.query.online_page || 1) || 1),
    onlinePerPage: String(req.query.online_per_page || '') === '9999' ? 9999 : 10,
    onlineClients: onlineResult.clients,
    onlineErrors: onlineResult.errors,
    now,
    baseUrl: getPublicSubBaseUrl(),
    message: req.query.message || '',
    error: req.query.error || ''
  });
});
app.get('/routing/geodata-index', requireAuth, async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    const catalog = await buildGeodataCatalogFromSources(force);
    res.setHeader('Cache-Control', 'no-store');
    res.json(catalog);
  } catch (err) {
    const fallback = getFallbackGeodataCatalog();
    res.status(200).json({
      ...fallback,
      source: 'fallback-error',
      error: String(err.message || err)
    });
  }
});

app.get('/routing', requireAuth, (req, res) => {
  const cfg = getRoutingConfig();
  render(res, 'routing', {
    routingPresets: ROUTING_PRESETS,
    selectedPresets: cfg.presets,
    customDomainsText: (cfg.customDomains || []).join('\n'),
    customIpsText: (cfg.customIps || []).join('\n'),
    routingMode: cfg.mode || 'proxy-selected',
    exceptDomainsText: (cfg.exceptDomains || []).join('\n'),
    exceptIpsText: (cfg.exceptIps || []).join('\n'),
    adBlockEnabled: cfg.adBlockEnabled === true,
    adBlockDomainsText: (cfg.adBlockDomains || []).join('\n'),
    adBlockIpsText: (cfg.adBlockIps || []).join('\n'),
    geodataUrlsText: (cfg.geodataUrls || []).join('\n'),
    geodataSource: cfg.geodataSource || 'loyalsoldier',
    geositeUrl: cfg.geositeUrl || '',
    geoipUrl: cfg.geoipUrl || '',
    happRoutingProfileEnabled: cfg.happRoutingProfileEnabled !== false,
    happRoutingForceUpdate: cfg.happRoutingForceUpdate !== false,
    happRoutingJsonExample: `${getPublicSubBaseUrl()}/happ-routing-json/<slug>`,
    dnsPreset: cfg.dnsPreset || 'cloudflare',
    dnsCustomText: cfg.dnsCustom || '',
    routingEnabled: cfg.enabled !== false,
    routingAllNodes: cfg.allNodes !== false,
    routingExcludedNodeIds: cfg.excludedNodeIds || [],
    nodes: db.prepare(`SELECT * FROM nodes WHERE enabled = 1 AND node_type != ? ORDER BY ${nodeOrderSql()}`).all(NODE_TYPE_H1CLOUD).filter(isClientManagedNode).map(enrichNodeWithCachedTransport),
    proxyDomains: getRoutingProxyDomains(),
    proxyIps: getRoutingProxyIps(),
    directDomains: getRoutingDirectDomains(),
    directIps: getRoutingDirectIps(),
    blockDomains: getRoutingBlockDomains(),
    blockIps: getRoutingBlockIps(),
    jsonUrlExample: `${getPublicSubBaseUrl()}/json/<slug>`,
    message: req.query.message || '',
    error: req.query.error || ''
  });
});

app.post('/routing', requireAuth, (req, res) => {
  try {
    // Готовые сервисы удалены из панели. Маршрутизация строится только из
    // явно введённых domain/geosite и ip/geoip правил.
    const presets = [];
    const parsedDomains = parseRoutingLines(req.body.custom_domains || '', 'domain');
    const parsedIps = parseRoutingLines(req.body.custom_ips || '', 'ip');
    const parsedExceptDomains = parseRoutingLines(req.body.except_domains || '', 'domain');
    const parsedExceptIps = parseRoutingLines(req.body.except_ips || '', 'ip');
    const parsedAdBlockDomains = parseRoutingLines(req.body.adblock_domains || '', 'domain');
    const parsedAdBlockIps = parseRoutingLines(req.body.adblock_ips || '', 'ip');
    const geodataSourceRaw = String(req.body.geodata_source || 'loyalsoldier').trim().toLowerCase();
    const geodataSource = ['official', 'loyalsoldier', 'custom'].includes(geodataSourceRaw) ? geodataSourceRaw : 'loyalsoldier';
    const geositeUrl = String(req.body.geosite_url || '').trim();
    const geoipUrl = String(req.body.geoip_url || '').trim();
    const effectiveGeositeUrl = geodataSource === 'loyalsoldier' ? LOYALSOLDIER_GEOSITE_URL : (geodataSource === 'custom' ? geositeUrl : '');
    const effectiveGeoipUrl = geodataSource === 'loyalsoldier' ? LOYALSOLDIER_GEOIP_URL : (geodataSource === 'custom' ? geoipUrl : '');
    const geodataUrls = uniqueList([effectiveGeositeUrl, effectiveGeoipUrl, ...parsePlainLines(req.body.geodata_urls || '')].filter(v => /^https?:\/\//i.test(v))); 
    const dnsPreset = String(req.body.dns_preset || 'cloudflare').trim();
    const dnsCustom = parsePlainLines(req.body.dns_custom || '').join('\n');
    let excludedNodeIds = req.body.routing_excluded_node_ids || [];
    if (!Array.isArray(excludedNodeIds)) excludedNodeIds = excludedNodeIds ? [excludedNodeIds] : [];
    excludedNodeIds = uniqueList(excludedNodeIds.map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0));
    const routableNodeIds = new Set(db.prepare('SELECT id FROM nodes WHERE enabled = 1 AND node_type != ?').all(NODE_TYPE_H1CLOUD).filter(isClientManagedNode).map(row => Number(row.id)));
    excludedNodeIds = excludedNodeIds.filter(id => routableNodeIds.has(Number(id)));
    const allNodes = req.body.routing_all_nodes === '1';
    const errors = [...parsedDomains.errors, ...parsedIps.errors, ...parsedExceptDomains.errors, ...parsedExceptIps.errors, ...parsedAdBlockDomains.errors, ...parsedAdBlockIps.errors];
    if (errors.length) throw new Error(errors.join(' | '));
    const cfg = {
      enabled: req.body.routing_enabled === '1',
      presets,
      customDomains: parsedDomains.values,
      customIps: parsedIps.values,
      mode: req.body.routing_mode === 'proxy-except' ? 'proxy-except' : 'proxy-selected',
      exceptDomains: parsedExceptDomains.values,
      exceptIps: parsedExceptIps.values,
      adBlockEnabled: req.body.adblock_enabled === '1',
      adBlockDomains: parsedAdBlockDomains.values,
      adBlockIps: parsedAdBlockIps.values,
      geodataUrls,
      geodataSource,
      geositeUrl: /^https?:\/\//i.test(effectiveGeositeUrl) ? effectiveGeositeUrl : '',
      geoipUrl: /^https?:\/\//i.test(effectiveGeoipUrl) ? effectiveGeoipUrl : '',
      dnsPreset,
      dnsCustom,
      allNodes,
      excludedNodeIds: allNodes ? [] : excludedNodeIds,
      happRoutingProfileEnabled: req.body.happ_routing_profile_enabled === '1',
      happRoutingExplicit: true,
      happRoutingForceUpdate: req.body.happ_routing_force_update === '1',
      happAutoRoutingEnabled: req.body.happ_routing_profile_enabled === '1',
      defaultsVersion: 6
    };
    setSetting('routing_config', JSON.stringify(cfg));
    bumpSubscriptionRevision();
    res.redirect('/routing?message=' + encodeURIComponent('Маршрутизация сохранена. Старые JSON-ссылки применят новые правила при следующем обновлении клиента.'));
  } catch (err) {
    res.redirect('/routing?error=' + encodeURIComponent(String(err.message || err)));
  }
});


function getGitValue(args, fallback = '') {
  try {
    return String(execFileSync('git', args, { cwd: APP_DIR_HINT, timeout: 8000, encoding: 'utf8' }) || '').trim();
  } catch (_) {
    return fallback;
  }
}

function getUpdateRepoSlug() {
  const raw = String(getSetting('update_repo_url', process.env.UPDATE_REPO_URL || process.env.GITHUB_REPOSITORY_URL || 'https://github.com/dagmagnat/3xui-Aggregator')).trim();
  const match = raw.match(/github\.com[:/]([^/]+)\/([^/.#?]+)(?:\.git)?/i);
  return match ? `${match[1]}/${match[2]}` : 'dagmagnat/3xui-Aggregator';
}


function readLocalVersion() {
  try { return String(fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8')).trim(); } catch (_) { return process.env.APP_VERSION || '0.1.0'; }
}
function compareVersions(a, b) {
  const pa = String(a || '0').split(/[^0-9]+/).filter(Boolean).map(Number);
  const pb = String(b || '0').split(/[^0-9]+/).filter(Boolean).map(Number);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function getProjectUpdateStatus(checkRemote = false) {
  const current = getGitValue(['rev-parse', '--short', 'HEAD'], process.env.BUILD_COMMIT ? String(process.env.BUILD_COMMIT).slice(0, 12) : 'unknown');
  const branch = getGitValue(['rev-parse', '--abbrev-ref', 'HEAD'], process.env.UPDATE_BRANCH || 'main');
  const repo = getUpdateRepoSlug();
  const currentVersion = readLocalVersion();
  let remote = '';
  let remoteVersion = '';
  let notes = [];
  let archiveUrl = `https://github.com/${repo}/archive/refs/heads/${branch}.zip`;
  let hasUpdate = false;
  let error = '';
  if (checkRemote) {
    try {
      const rawUrl = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/update.json?ts=${Date.now()}`;
      const response = await fetchWithTimeout(rawUrl, {
        headers: { 'User-Agent': '3xui-aggregator-update-check', 'Accept': 'application/json', 'Cache-Control': 'no-cache' }
      }, 12000);
      if (response.ok) {
        const data = await response.json();
        remoteVersion = String(data.version || data.build || '').trim();
        archiveUrl = String(data.archive_url || archiveUrl).trim();
        notes = Array.isArray(data.notes) ? data.notes.map(String).slice(0, 10) : [];
        hasUpdate = remoteVersion ? compareVersions(currentVersion, remoteVersion) < 0 : false;
      } else {
        const apiUrl = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}?ts=${Date.now()}`;
        const apiResponse = await fetchWithTimeout(apiUrl, {
          headers: { 'User-Agent': '3xui-aggregator-update-check', 'Accept': 'application/vnd.github+json', 'Cache-Control': 'no-cache' }
        }, 12000);
        if (!apiResponse.ok) throw new Error(`GitHub API ${apiResponse.status}`);
        const data = await apiResponse.json();
        remote = String(data?.sha || '').slice(0, 12);
        hasUpdate = Boolean(remote && current !== 'unknown' && !String(remote).startsWith(String(current).slice(0, 7)));
      }
    } catch (err) {
      error = String(err.message || err);
    }
  }
  return { current, currentVersion, branch, repo, remote, remoteVersion, archiveUrl, notes, hasUpdate, error };
}

function getProjectUpdateRuntimeStatus() {
  const status = readJsonFileSafe(PROJECT_UPDATE_STATUS_FILE, null);
  if (!status || typeof status !== 'object') {
    return { status: 'idle', message: 'Обновление не запущено' };
  }
  return status;
}

function normalizeArchiveUrlForUpdate(value, fallback = '') {
  const raw = String(value || '').trim();
  if (/^https:\/\/github\.com\/[^\s]+\.zip(?:[?#].*)?$/i.test(raw)) return raw;
  if (/^https:\/\/codeload\.github\.com\/[^\s]+\/zip\/[^\s]+$/i.test(raw)) return raw;
  return String(fallback || '').trim();
}

function isUpdateRunningStatus(status) {
  const state = String(status?.status || '').toLowerCase();
  return ['queued', 'running', 'downloading', 'installing'].includes(state);
}



app.get('/redirects', requireAuth, (req, res) => {
  updateRedirectRulesFromStatus();
  const nodes = db.prepare(`SELECT * FROM nodes ORDER BY ${nodeOrderSql()}`).all().map(node => {
    const cachedInbound = getCachedInbound(node);
    return {
      ...node,
      redirect_target_host: getNodeTargetHost(node),
      redirect_target_port: getRedirectTargetPort(node, cachedInbound),
      redirect_has_inbound_cache: cachedInbound ? 1 : 0,
      transport_label: cachedInbound ? getInboundTransportInfo(cachedInbound).label : 'не загружено'
    };
  });
  const rules = getRedirectRules(true);
  const status = getRedirectStatus();
  const hostIps = getDetectedHostIps();
  render(res, 'redirects', {
    pageTitle: 'Перенаправление',
    nodes,
    rules,
    status,
    hostIps,
    checkReport: getRedirectCheckReport(),
    message: req.query.message || '',
    error: req.query.error || ''
  });
});


app.post('/redirects/helper/refresh.json', requireAuth, (req, res) => {
  try {
    // Кнопка ручного обновления должна не просто перезагружать страницу,
    // а повторно выгрузить желаемые правила для host-helper и прочитать свежий статус.
    // Сам iptables применяет host-helper; этот endpoint синхронизирует UI с его status-файлом.
    let desired = { rules: [] };
    try { desired = exportRedirectRulesForHelper(); } catch (_) {}
    updateRedirectRulesFromStatus();
    const status = getRedirectStatus();
    return res.json({ ok: true, generatedAt: new Date().toISOString(), rulesCount: Array.isArray(desired.rules) ? desired.rules.length : 0, status });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});


app.post('/redirects/check', requireAuth, async (req, res) => {
  try {
    const bindIp = String(req.body.bind_ip || '').trim();
    let nodeIds = req.body.node_ids || [];
    if (!Array.isArray(nodeIds)) nodeIds = [nodeIds];
    nodeIds = nodeIds.map(v => Number(v)).filter(Number.isFinite);
    if (!nodeIds.length) {
      const activeRows = db.prepare('SELECT DISTINCT node_id, bind_ip FROM redirect_rules WHERE enabled = 1 ORDER BY id ASC').all();
      nodeIds = activeRows.map(r => Number(r.node_id)).filter(Number.isFinite);
      if (!bindIp) bindIp = String(activeRows.find(r => r && r.bind_ip)?.bind_ip || '');
    }
    if (!nodeIds.length) throw new Error('Выбери хотя бы один узел для проверки.');
    const results = await buildRedirectProbeResults(nodeIds, bindIp);
    saveRedirectCheckReport(results);
    const okCount = results.filter(r => r.ok).length;
    const failCount = results.length - okCount;
    return res.redirect('/redirects?message=' + encodeURIComponent(`Проверка завершена: OK ${okCount}, ошибок ${failCount}. Подробности ниже.`));
  } catch (err) {
    return res.redirect('/redirects?error=' + encodeURIComponent(err.message || String(err)));
  }
});


app.get('/redirects/check/refresh.json', requireAuth, async (req, res) => {
  try {
    // Always re-check the current active redirect rules first. The old behavior reused
    // the previous report and therefore mobile could keep showing only the two nodes
    // that were checked earlier, even after new rules were added.
    let rows = db.prepare('SELECT DISTINCT node_id, bind_ip FROM redirect_rules WHERE enabled = 1 ORDER BY id ASC').all();
    let nodeIds = rows.map(r => Number(r.node_id)).filter(Number.isFinite);
    let bindIp = String(rows.find(r => r && r.bind_ip)?.bind_ip || '');
    if (!nodeIds.length) {
      rows = db.prepare(`SELECT id AS node_id, '' AS bind_ip FROM nodes WHERE enabled = 1 ORDER BY ${nodeOrderSql()}`).all();
      nodeIds = rows.map(r => Number(r.node_id)).filter(Number.isFinite);
      bindIp = '';
    }
    nodeIds = [...new Set(nodeIds)];
    if (!nodeIds.length) return res.status(400).json({ ok: false, error: 'Нет узлов для повторной проверки.' });
    const results = await buildRedirectProbeResults(nodeIds, bindIp);
    saveRedirectCheckReport(results);
    const okCount = results.filter(r => r.ok).length;
    return res.json({ ok: true, generatedAt: new Date().toISOString(), okCount, failCount: results.length - okCount, results });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.post('/redirects/apply', requireAuth, async (req, res) => {
  try {
    const bindMode = String(req.body.bind_ip_mode || 'detected');
    const customBindIp = String(req.body.bind_ip_custom || '').trim();
    const bindIp = bindMode === 'custom' && customBindIp ? customBindIp : String(req.body.bind_ip || '').trim();
    const bindLabel = String(req.body.bind_label || '').trim().slice(0, 80);
    if (!isValidIpv4(bindIp)) throw new Error('Укажи корректный IPv4 для входной точки перенаправления. Можно выбрать IP панели или ввести свой IP редирект-сервера.');

    let nodeIds = req.body.node_ids || [];
    if (!Array.isArray(nodeIds)) nodeIds = [nodeIds];
    nodeIds = nodeIds.map(v => Number(v)).filter(Number.isFinite);
    if (!nodeIds.length) throw new Error('Выбери хотя бы один узел для перенаправления.');

    const selectedProtocol = normalizeRedirectProtocol(req.body.protocol || 'tcp');
    const selectedProtocols = selectedProtocol === 'both' ? ['tcp', 'udp'] : [selectedProtocol];
    const rewriteEnabled = req.body.rewrite_enabled === '1' ? 1 : 0;
    const placeholders = nodeIds.map(() => '?').join(',');
    const nodes = db.prepare(`SELECT * FROM nodes WHERE id IN (${placeholders})`).all(...nodeIds);
    if (!nodes.length) throw new Error('Выбранные узлы не найдены.');
    const nodeById = new Map(nodes.map(n => [Number(n.id), n]));
    const orderedNodes = nodeIds.map(id => nodeById.get(Number(id))).filter(Boolean);

    const upsert = db.prepare(`
      INSERT INTO redirect_rules (bind_ip, bind_label, node_id, target_host, target_port, protocol, rewrite_enabled, enabled, last_status, last_error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'pending', '', CURRENT_TIMESTAMP)
      ON CONFLICT(bind_ip, node_id, target_port, protocol) DO UPDATE SET
        target_host = excluded.target_host,
        bind_label = excluded.bind_label,
        rewrite_enabled = excluded.rewrite_enabled,
        enabled = 1,
        last_status = 'pending',
        last_error = '',
        updated_at = CURRENT_TIMESTAMP
    `);

    const skipped = [];
    let applied = 0;
    for (const node of orderedNodes) {
      let inbound = getCachedInbound(node);
      try {
        inbound = await getInboundFast(node);
      } catch (err) {
        console.error('Redirect inbound refresh failed:', getNodePublicName(node), err.message);
      }
      const targetHost = getNodeTargetHost(node);
      const targetPort = getRedirectTargetPort(node, inbound);
      if (!targetHost) {
        skipped.push(`${getNodePublicName(node)}: не найден IP/host панели узла`);
        continue;
      }
      if (!targetPort) {
        skipped.push(`${getNodePublicName(node)}: не удалось получить порт inbound из 3x-ui или кэша. Открой узел/загрузи inbound и повтори.`);
        continue;
      }
      try {
        assertRedirectListenPortAllowed(bindIp, targetPort, selectedProtocol, Number(node.id));
      } catch (portErr) {
        skipped.push(`${getNodePublicName(node)}: ${portErr.message || portErr}`);
        continue;
      }
      const probe = await tcpProbe(targetHost, targetPort, 2500);
      const initialStatus = probe.ok ? 'pending' : 'warning';
      const initialError = probe.ok ? '' : `Проверка цели: ${probe.message}`;
      // Keep only the protocol(s) selected in the form for this exact bind/node/port.
      // Previously an old TCP+UDP row could remain and make the mobile UI look as if
      // only BOTH rules were active. Now TCP, UDP and TCP+UDP are represented explicitly.
      const keepPlaceholders = selectedProtocols.map(() => '?').join(',');
      db.prepare(`DELETE FROM redirect_rules WHERE bind_ip = ? AND node_id = ? AND target_port = ? AND protocol NOT IN (${keepPlaceholders})`)
        .run(bindIp, Number(node.id), targetPort, ...selectedProtocols);
      for (const proto of selectedProtocols) {
        upsert.run(bindIp, bindLabel, Number(node.id), targetHost, targetPort, proto, rewriteEnabled);
        db.prepare('UPDATE redirect_rules SET last_status = ?, last_error = ? WHERE bind_ip = ? AND node_id = ? AND target_port = ? AND protocol = ?')
          .run(initialStatus, initialError, bindIp, Number(node.id), targetPort, proto);
        applied += 1;
      }
      if (!probe.ok) skipped.push(`${getNodePublicName(node)}: цель ${targetHost}:${targetPort} сейчас недоступна (${probe.message}), правило сохранено, но работать не будет до восстановления доступа`);
    }

    if (!applied) throw new Error('Не удалось создать ни одного правила. Проверь доступность узлов и кэш inbound. ' + skipped.join('; '));
    exportRedirectRulesForHelper();
    let msg = `Правила сохранены: ${applied}. Helper применит их автоматически, если service запущен в режиме loop.`;
    if (skipped.length) msg += ` Пропущено: ${skipped.join('; ')}`;
    return res.redirect('/redirects?message=' + encodeURIComponent(msg));
  } catch (err) {
    return res.redirect('/redirects?error=' + encodeURIComponent(err.message || String(err)));
  }
});

app.post('/redirects/:id/toggle', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT enabled FROM redirect_rules WHERE id = ?').get(id);
  if (row) {
    db.prepare("UPDATE redirect_rules SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END, last_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    exportRedirectRulesForHelper();
  }
  res.redirect('/redirects?message=' + encodeURIComponent('Статус правила изменён.'));
});

app.post('/redirects/:id/delete', requireAuth, (req, res) => {
  db.prepare('DELETE FROM redirect_rules WHERE id = ?').run(Number(req.params.id));
  exportRedirectRulesForHelper();
  res.redirect('/redirects?message=' + encodeURIComponent('Правило удалено.'));
});

app.post('/redirects/delete-all', requireAuth, (req, res) => {
  db.prepare('DELETE FROM redirect_rules').run();
  exportRedirectRulesForHelper();
  res.redirect('/redirects?message=' + encodeURIComponent('Все правила перенаправления удалены.'));
});

app.post('/redirects/export', requireAuth, (req, res) => {
  const desired = exportRedirectRulesForHelper();
  res.json({ ok: true, rules: desired.rules.length, file: REDIRECT_RULES_FILE });
});


app.get('/settings/project-update/status.json', requireAuth, async (req, res) => {
  try {
    const checkRemote = String(req.query.check || '') === '1';
    const updateStatus = await getProjectUpdateStatus(checkRemote);
    const runtimeStatus = getProjectUpdateRuntimeStatus();
    res.json({ ok: true, updateStatus, runtimeStatus });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.post('/settings/project-update/start.json', requireAuth, express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const currentRuntime = getProjectUpdateRuntimeStatus();
    if (isUpdateRunningStatus(currentRuntime)) {
      return res.status(409).json({ ok: false, error: 'Обновление уже выполняется', runtimeStatus: currentRuntime });
    }

    const updateStatus = await getProjectUpdateStatus(true);
    const archiveUrl = normalizeArchiveUrlForUpdate(req.body?.archive_url || updateStatus.archiveUrl, updateStatus.archiveUrl);
    if (!archiveUrl) throw new Error('Не найдена ссылка на архив обновления. Проверь update.json или URL репозитория.');

    const request = {
      id: randomUUID(),
      status: 'requested',
      archiveUrl,
      repo: updateStatus.repo,
      branch: updateStatus.branch,
      currentVersion: updateStatus.currentVersion,
      remoteVersion: updateStatus.remoteVersion,
      requestedAt: new Date().toISOString()
    };
    writeJsonFileSafe(PROJECT_UPDATE_REQUEST_FILE, request);
    writeJsonFileSafe(PROJECT_UPDATE_STATUS_FILE, {
      id: request.id,
      status: 'queued',
      message: 'Запрос на обновление передан host-updater. Если статус не меняется, обнови проект через SSH: agg update.',
      archiveUrl,
      requestedAt: request.requestedAt,
      updatedAt: new Date().toISOString()
    });
    res.json({ ok: true, request, runtimeStatus: getProjectUpdateRuntimeStatus() });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get('/settings', requireAuth, async (req, res) => {
  const subscriptionName = getSetting('subscription_name', DEFAULT_SUBSCRIPTION_NAME);
  const currentUser = db.prepare('SELECT username FROM app_users WHERE id = ?').get(req.session.userId);
  const projectUpdateStatus = await getProjectUpdateStatus(req.query.check_update === '1');
  const routingCfg = getRoutingConfig();

  render(res, 'settings', {
    subscriptionName,
    subscriptionRevision: getSubscriptionRevision(),
    subscriptionDisplayTitle: getSubscriptionDisplayTitle(subscriptionName),
    adminUsername: currentUser?.username || '',
    adminAllowedIps: getSetting('admin_allowed_ips', ''),
    adminIdleTimeoutMinutes: getAdminIdleTimeoutMinutes(),
    adminBindSessionToIp: isAdminSessionIpBindEnabled(),
    showSubLinks: getSetting('show_sub_links', '1') !== '0',
    showJsonLinks: getSetting('show_json_links', '1') !== '0',
    showHappLinks: getSetting('show_happ_links', '0') !== '0',
    showSubscriptionLimits: getSetting('subscription_show_limits', '1') !== '0',
    sendSubscriptionUserInfo: getSetting('subscription_userinfo_header', '1') !== '0',
    refreshSubscriptionUsage: getSetting('subscription_live_usage', '1') !== '0',
    subscriptionUpdateIntervalHours: getSubscriptionUpdateIntervalHours(),
    subscriptionClientAutoUpdateEnabled: getSetting('subscription_client_auto_update_enabled', '1') !== '0',
    subscriptionSupportNote: getSubscriptionSupportNote(),
    subscriptionSupportUrl: getSubscriptionSupportUrl(),
    subscriptionShowEmptyLimits: shouldShowEmptySubscriptionLimits(),
    subscriptionHappInfoEnabled: isHappInfoBlockEnabled(),
    subscriptionHappInfoTemplate: getHappInfoTemplate(),
    subscriptionHappInfoColor: getHappInfoColor(),
    subscriptionHappInfoButtonText: getHappInfoButtonText(),
    subscriptionHappInfoButtonLink: getHappInfoButtonLink(),
    subscriptionHappInfoAnnounceFallbackEnabled: isHappInfoAnnounceFallbackEnabled(),
    subscriptionHappServerDescriptionEnabled: isHappServerDescriptionEnabled(),
    subscriptionHappServerDescriptionTemplate: getHappServerDescriptionTemplate(),
    jsonMuxEnabled: isJsonMuxEnabled(),
    jsonSniffingEnabled: isJsonSniffingEnabled(),
    happAppControlsEnabled: isHappAppControlsCheckboxEnabled(),
    happAppControlsEffective: isHappAppControlsEnabled(),
    telegramNotificationsEnabled: getSetting('telegram_notifications_enabled', '0') === '1',
    telegramBotToken: getSetting('telegram_bot_token', ''),
    telegramChatId: getSetting('telegram_chat_id', ''),
    telegramNotifyOfflineNodes: getSetting('telegram_notify_offline_nodes', '1') !== '0',
    telegramNotifySuspiciousClients: getSetting('telegram_notify_suspicious_clients', '1') !== '0',
    telegramSuspiciousDailyGb: parseGbThreshold(getSetting('telegram_suspicious_daily_gb', '100'), 100),
    telegramBackupLocked: getSetting('telegram_backup_locked', '1') !== '0',
    telegramBackupEnabled: getSetting('telegram_backup_enabled', '0') === '1',
    telegramBackupChatId: getSetting('telegram_backup_chat_id', ''),
    panelPublicUrl: getPanelPublicUrl(),
    panelLoginUrl: `${getPanelPublicUrl()}/login${getCurrentPanelAccessKey() ? `?key=${encodeURIComponent(getCurrentPanelAccessKey())}` : ''}`,
    panelMobileLoginUrl: `${getPanelPublicUrl()}/mobile-login${getCurrentPanelAccessKey() ? `?key=${encodeURIComponent(getCurrentPanelAccessKey())}` : ''}`,
    panelAccessKey: getCurrentPanelAccessKey(),
    subUrlMode: getSubscriptionUrlMode(),
    subPublicUrl: getSetting('sub_public_url', process.env.SUB_PUBLIC_URL || BASE_URL),
    publicSubBaseUrl: getPublicSubBaseUrl(),
    publicJsonExample: `${getPublicSubBaseUrl()}/json/<slug>`,
    publicSubExample: `${getPublicSubBaseUrl()}/sub/<slug>`,
    publicHappExample: `${getPublicSubBaseUrl()}/happ/<slug>`,
    backupFileExample: buildBackupFileName(req, 'json'),
    updateRepoUrl: getSetting('update_repo_url', 'https://github.com/dagmagnat/3xui-Aggregator'),
    runtimePort: PORT,
    runtimeBindIp: INSTALL_BIND_IP,
    runtimeTrustProxy: TRUST_PROXY,
    runtimeSessionSecure: SESSION_SECURE,
    runtimeNodeEnv: process.env.NODE_ENV || '',
    appDirHint: APP_DIR_HINT,
    backupDirHint: BACKUP_DIR_HINT,
    currentIp: getClientIp(req),
    panelInterfaceTheme: getPanelInterfaceTheme(),
    clientsViewMode: getClientsViewMode(),
    panelMobileNavMode: getPanelMobileNavMode(),
    panelMobileUiScale: getPanelMobileUiScale(),
    panelMobileClientCompact: getPanelMobileClientCompact(),
    nodesPageSize: getNodesPageSize(),
    sniProfiles: getSniProfiles(),
    message: req.query.message || '',
    error: req.query.error || '',
    projectUpdateStatus,
    routingPresets: ROUTING_PRESETS,
    selectedPresets: routingCfg.presets || [],
    customDomainsText: (routingCfg.customDomains || []).join('\n'),
    customIpsText: (routingCfg.customIps || []).join('\n'),
    routingMode: routingCfg.mode || 'proxy-selected',
    exceptDomainsText: (routingCfg.exceptDomains || []).join('\n'),
    exceptIpsText: (routingCfg.exceptIps || []).join('\n'),
    adBlockEnabled: routingCfg.adBlockEnabled === true,
    adBlockDomainsText: (routingCfg.adBlockDomains || []).join('\n'),
    adBlockIpsText: (routingCfg.adBlockIps || []).join('\n'),
    geodataUrlsText: (routingCfg.geodataUrls || []).join('\n'),
    geodataSource: routingCfg.geodataSource || 'loyalsoldier',
    geositeUrl: routingCfg.geositeUrl || '',
    geoipUrl: routingCfg.geoipUrl || '',
    happRoutingProfileEnabled: routingCfg.happRoutingProfileEnabled !== false,
    happRoutingForceUpdate: routingCfg.happRoutingForceUpdate !== false,
    dnsPreset: routingCfg.dnsPreset || 'cloudflare',
    dnsCustomText: routingCfg.dnsCustom || '',
    routingEnabled: routingCfg.enabled !== false
  });
});


app.get('/more', requireAuth, async (req, res) => {
  const projectUpdateStatus = await getProjectUpdateStatus(false).catch(() => null);
  render(res, 'more', {
    message: req.query.message || '',
    error: req.query.error || '',
    projectUpdateStatus,
    panelMobileNavMode: getPanelMobileNavMode(),
    panelMobileUiScale: getPanelMobileUiScale(),
    panelMobileClientCompact: getPanelMobileClientCompact(),
    panelInterfaceTheme: getPanelInterfaceTheme()
  });
});



app.post('/settings/panel-ui', requireAuth, (req, res) => {
  try {
    const panelInterfaceTheme = ['classic', 'mobile_lite'].includes(String(req.body.panel_interface_theme || 'mobile_lite'))
      ? String(req.body.panel_interface_theme || 'mobile_lite')
      : 'mobile_lite';
    const panelMobileNavMode = ['bottom', 'side'].includes(String(req.body.panel_mobile_nav_mode || 'bottom'))
      ? String(req.body.panel_mobile_nav_mode || 'bottom')
      : 'bottom';
    const panelMobileUiScale = ['compact', 'normal', 'large'].includes(String(req.body.panel_mobile_ui_scale || 'compact'))
      ? String(req.body.panel_mobile_ui_scale || 'compact')
      : 'compact';
    const clientsViewMode = ['modern', 'classic'].includes(String(req.body.clients_view_mode || 'modern'))
      ? String(req.body.clients_view_mode || 'modern')
      : 'modern';
    setSetting('panel_interface_theme', panelInterfaceTheme);
    setSetting('clients_view_mode', clientsViewMode);
    setSetting('panel_mobile_nav_mode', panelMobileNavMode);
    setSetting('panel_mobile_ui_scale', panelMobileUiScale);
    setSetting('panel_mobile_client_compact', req.body.panel_mobile_client_compact === '1' ? '1' : '0');
    const nodesPageSize = [10, 12, 15].includes(Number(req.body.nodes_page_size)) ? Number(req.body.nodes_page_size) : 10;
    setSetting('nodes_page_size', String(nodesPageSize));
    res.redirect('/settings?message=' + encodeURIComponent('Настройки панели сохранены.'));
  } catch (err) {
    res.redirect('/settings?error=' + encodeURIComponent(String(err.message || err)));
  }
});


app.post('/settings/sni-profiles', requireAuth, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const sni = normalizeSniValue(req.body.sni || '');
    const comment = String(req.body.comment || '').trim();
    if (!name) throw new Error('Укажи название SNI-профиля.');
    if (!sni) throw new Error('Укажи SNI.');
    db.prepare(`
      INSERT INTO sni_profiles (name, sni, comment, is_builtin, updated_at)
      VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
      ON CONFLICT(sni) DO UPDATE SET
        name = excluded.name,
        comment = excluded.comment,
        updated_at = CURRENT_TIMESTAMP
    `).run(name, sni, comment);
    let msg = 'SNI-профиль сохранён.';
    if (req.body.check_now === '1') {
      try {
        const check = await checkSniHost(sni);
        db.prepare('UPDATE sni_profiles SET last_status = ?, last_check_json = ?, updated_at = CURRENT_TIMESTAMP WHERE sni = ?')
          .run('ok', JSON.stringify(check), sni);
        msg += ` Проверка OK: ${check.latencyMs} мс, сертификат до ${check.validTo || '—'}.`;
      } catch (err) {
        db.prepare('UPDATE sni_profiles SET last_status = ?, last_check_json = ?, updated_at = CURRENT_TIMESTAMP WHERE sni = ?')
          .run('error', JSON.stringify({ ok: false, error: err.message || String(err) }), sni);
        msg += ` Проверка не прошла: ${err.message || err}.`;
      }
    }
    res.redirect('/settings?message=' + encodeURIComponent(msg));
  } catch (err) {
    res.redirect('/settings?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/settings/sni-profiles/:id/delete', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const profile = db.prepare('SELECT * FROM sni_profiles WHERE id = ?').get(id);
    if (!profile) throw new Error('SNI-профиль не найден.');
    if (Number(profile.is_builtin) === 1) throw new Error('Встроенный SNI-профиль нельзя удалить, но можно не использовать.');
    db.prepare("UPDATE nodes SET sni_mode = 'inbound', sni_profile_id = NULL WHERE sni_profile_id = ?").run(id);
    db.prepare('DELETE FROM sni_profiles WHERE id = ?').run(id);
    res.redirect('/settings?message=' + encodeURIComponent('SNI-профиль удалён.'));
  } catch (err) {
    res.redirect('/settings?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/sni-profiles/check.json', requireAuth, bodyParser.json({ limit: '64kb' }), async (req, res) => {
  try {
    const sni = normalizeSniValue(req.body.sni || '');
    const result = await checkSniHost(sni);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

app.post('/settings/subscription-revision/bump', requireAuth, (req, res) => {
  try {
    bumpSubscriptionRevision();
    res.redirect('/settings?message=' + encodeURIComponent('Ревизия подписок обновлена. Старые ссылки будут перенаправляться на новую rev.'));
  } catch (err) {
    res.redirect('/settings?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/settings/happ-control', requireAuth, (req, res) => {
  try {
    const beforeSnapshot = JSON.stringify({
      showHappLinks: getSetting('show_happ_links', '0'),
      userinfo: getSetting('subscription_userinfo_header', '1'),
      liveUsage: getSetting('subscription_live_usage', '1'),
      interval: getSetting('subscription_update_interval_hours', '1'),
      autoUpdate: getSetting('subscription_client_auto_update_enabled', '1'),
      supportNote: getSetting('subscription_support_note', ''),
      supportUrl: getSetting('subscription_support_url', ''),
      happInfoEnabled: getSetting('subscription_happ_info_enabled', '1'),
      happInfoTemplate: getSetting('subscription_happ_info_template', ''),
      happInfoColor: getSetting('subscription_happ_info_color', 'blue'),
      happInfoButtonText: getSetting('subscription_happ_info_button_text', 'Поддержка'),
      happInfoButtonLink: getSetting('subscription_happ_info_button_link', ''),
      happInfoAnnounceFallbackEnabled: getSetting('subscription_happ_info_announce_fallback_enabled', '1'),
      serverDescriptionEnabled: getSetting('subscription_happ_server_description_enabled', '1'),
      serverDescriptionTemplate: getSetting('subscription_happ_server_description_template', ''),
      jsonMux: getSetting('json_mux_enabled', '0'),
      jsonSniffing: getSetting('json_sniffing_enabled', '0')
    });

    const rawSubscriptionUpdateIntervalHours = Number(req.body.subscription_update_interval_hours || 1);
    if (!Number.isFinite(rawSubscriptionUpdateIntervalHours)) throw new Error('Интервал автообновления должен быть числом от 1 до 168 часов');
    const subscriptionUpdateIntervalHours = Math.min(168, Math.max(1, Math.floor(rawSubscriptionUpdateIntervalHours)));

    setSetting('show_happ_links', req.body.show_happ_links === '1' ? '1' : '0');
    setSetting('subscription_userinfo_header', req.body.subscription_userinfo_header === '1' ? '1' : '0');
    setSetting('subscription_live_usage', req.body.subscription_live_usage === '1' ? '1' : '0');
    setSetting('subscription_client_auto_update_enabled', req.body.subscription_client_auto_update_enabled === '1' ? '1' : '0');
    setSetting('subscription_update_interval_hours', String(subscriptionUpdateIntervalHours));
    setSetting('subscription_support_note', String(req.body.subscription_support_note || '').trim());
    setSetting('subscription_support_url', String(req.body.subscription_support_url || '').trim());

    setSetting('subscription_happ_info_enabled', req.body.subscription_happ_info_enabled === '1' ? '1' : '0');
    setSetting('subscription_happ_info_template', String(req.body.subscription_happ_info_template || '').trim());
    setSetting('subscription_happ_info_color', ['blue', 'green', 'red'].includes(String(req.body.subscription_happ_info_color || 'blue')) ? String(req.body.subscription_happ_info_color || 'blue') : 'blue');
    setSetting('subscription_happ_info_button_text', String(req.body.subscription_happ_info_button_text || '').trim().slice(0, 25));
    setSetting('subscription_happ_info_button_link', String(req.body.subscription_happ_info_button_link || '').trim());
    setSetting('subscription_happ_info_announce_fallback_enabled', req.body.subscription_happ_info_announce_fallback_enabled === '1' ? '1' : '0');
    setSetting('subscription_happ_server_description_enabled', req.body.subscription_happ_server_description_enabled === '1' ? '1' : '0');
    setSetting('subscription_happ_server_description_template', String(req.body.subscription_happ_server_description_template || '').trim());

    setSetting('json_mux_enabled', req.body.json_mux_enabled === '1' ? '1' : '0');
    setSetting('json_sniffing_enabled', req.body.json_sniffing_enabled === '1' ? '1' : '0');

    // Paid Happ application controls remain hard-disabled in the free build.
    setSetting('happ_provider_id', '');
    setSetting('happ_app_controls_enabled', '0');
    setSetting('happ_ping_tcp', '0');
    setSetting('happ_ping_result_icon', '0');
    setSetting('happ_fragmentation_enabled', '0');
    setSetting('happ_noises_enabled', '0');
    setSetting('happ_mux_enabled', '0');
    setSetting('happ_update_on_open_enabled', '0');
    setSetting('happ_ping_on_open_enabled', '0');
    setSetting('happ_force_apply_on_update_enabled', '0');
    setSetting('happ_no_limit_mode', 'off');

    const afterSnapshot = JSON.stringify({
      showHappLinks: getSetting('show_happ_links', '0'),
      userinfo: getSetting('subscription_userinfo_header', '1'),
      liveUsage: getSetting('subscription_live_usage', '1'),
      interval: getSetting('subscription_update_interval_hours', '1'),
      autoUpdate: getSetting('subscription_client_auto_update_enabled', '1'),
      supportNote: getSetting('subscription_support_note', ''),
      supportUrl: getSetting('subscription_support_url', ''),
      happInfoEnabled: getSetting('subscription_happ_info_enabled', '1'),
      happInfoTemplate: getSetting('subscription_happ_info_template', ''),
      happInfoColor: getSetting('subscription_happ_info_color', 'blue'),
      happInfoButtonText: getSetting('subscription_happ_info_button_text', 'Поддержка'),
      happInfoButtonLink: getSetting('subscription_happ_info_button_link', ''),
      happInfoAnnounceFallbackEnabled: getSetting('subscription_happ_info_announce_fallback_enabled', '1'),
      serverDescriptionEnabled: getSetting('subscription_happ_server_description_enabled', '1'),
      serverDescriptionTemplate: getSetting('subscription_happ_server_description_template', ''),
      jsonMux: getSetting('json_mux_enabled', '0'),
      jsonSniffing: getSetting('json_sniffing_enabled', '0')
    });
    if (beforeSnapshot !== afterSnapshot) bumpSubscriptionRevision();

    res.redirect('/settings?message=' + encodeURIComponent('Happ Control App сохранён. Подписки применят изменения при следующем обновлении.'));
  } catch (err) {
    res.redirect('/settings?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/settings', requireAuth, (req, res) => {
  try {
    const subscriptionName = String(req.body.subscription_name || '').trim();
    if (!subscriptionName) throw new Error('Нужно указать название подписки');

    const oldSubscriptionMeta = {
      name: getSetting('subscription_name', DEFAULT_SUBSCRIPTION_NAME),
      note: getSetting('subscription_support_note', ''),
      url: getSetting('subscription_support_url', '')
    };

    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run('subscription_name', subscriptionName);

    const adminAllowedIps = String(req.body.admin_allowed_ips || '')
      .split(/[\s,;]+/)
      .map(v => v.trim())
      .filter(Boolean)
      .join('\n');

    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run('admin_allowed_ips', adminAllowedIps);

    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run('show_sub_links', req.body.show_sub_links === '1' ? '1' : '0');

    db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run('show_json_links', req.body.show_json_links === '1' ? '1' : '0');

    setSetting('update_repo_url', String(req.body.update_repo_url || 'https://github.com/dagmagnat/3xui-Aggregator').trim() || 'https://github.com/dagmagnat/3xui-Aggregator');

    if (Object.prototype.hasOwnProperty.call(req.body, 'panel_interface_theme')) {
      const panelInterfaceTheme = ['classic', 'mobile_lite'].includes(String(req.body.panel_interface_theme || 'classic')) ? String(req.body.panel_interface_theme || 'classic') : 'classic';
      setSetting('panel_interface_theme', panelInterfaceTheme);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'panel_mobile_client_compact')) {
      setSetting('panel_mobile_client_compact', req.body.panel_mobile_client_compact === '1' ? '1' : '0');
    }

    const panelPublicUrl = normalizePublicUrl(req.body.panel_public_url || '', process.env.PANEL_PUBLIC_URL || BASE_URL);
    const subPublicUrl = normalizePublicUrl(req.body.sub_public_url || '', process.env.SUB_PUBLIC_URL || panelPublicUrl || BASE_URL);
    const subUrlMode = ['custom', 'panel', 'panel_without_port'].includes(String(req.body.sub_url_mode || 'custom'))
      ? String(req.body.sub_url_mode || 'custom')
      : 'custom';
    const panelAccessKey = String(req.body.panel_access_key || '').trim();
    if (panelAccessKey && panelAccessKey.length < 8) throw new Error('Secret-key должен быть минимум 8 символов или пустым для отключения');

    setSetting('panel_public_url', panelPublicUrl);
    setSetting('sub_public_url', subPublicUrl);
    setSetting('sub_url_mode', subUrlMode);
    setSetting('panel_access_key', panelAccessKey);

    setSetting('subscription_show_limits', req.body.subscription_show_limits === '1' ? '1' : '0');
    if (oldSubscriptionMeta.name !== subscriptionName) {
      bumpSubscriptionRevision();
    }
    setSetting('subscription_show_empty_limits', req.body.subscription_show_empty_limits === '1' ? '1' : '0');
    // Keep paid Happ application controls disabled.
    setSetting('happ_provider_id', '');
    setSetting('happ_app_controls_enabled', '0');
    setSetting('happ_ping_tcp', '0');
    setSetting('happ_ping_result_icon', '0');
    setSetting('happ_fragmentation_enabled', '0');
    setSetting('happ_noises_enabled', '0');
    setSetting('happ_mux_enabled', '0');
    setSetting('happ_subscription_auto_update_enabled', '1');
    setSetting('happ_update_on_open_enabled', '0');
    setSetting('happ_ping_on_open_enabled', '0');
    setSetting('happ_subscriptions_collapse_enabled', '1');
    setSetting('happ_expand_now_enabled', '0');
    setSetting('happ_check_url_via_proxy_enabled', '0');
    setSetting('happ_sniffing_enabled', '0');
    setSetting('happ_force_apply_on_update_enabled', '0');
    setSetting('happ_no_limit_mode', 'off');

    const currentPassword = String(req.body.current_password || '');
    const newUsername = String(req.body.admin_username || '').trim();
    const newPassword = String(req.body.new_password || '');
    const newPassword2 = String(req.body.new_password_confirm || '');
    const user = db.prepare('SELECT * FROM app_users WHERE id = ?').get(req.session.userId);
    const usernameChanged = Boolean(user && newUsername && newUsername !== user.username);
    const wantsAccountChange = Boolean(usernameChanged || newPassword || currentPassword || newPassword2);

    if (wantsAccountChange) {
      if (!user) throw new Error('Администратор не найден');
      if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
        throw new Error('Текущий пароль указан неверно');
      }

      const finalUsername = newUsername || user.username;
      const owner = db.prepare('SELECT id FROM app_users WHERE username = ? AND id != ?').get(finalUsername, user.id);
      if (owner) throw new Error('Такой логин администратора уже существует');

      let finalHash = user.password_hash;
      if (newPassword) {
        if (newPassword.length < 8) throw new Error('Новый пароль должен быть минимум 8 символов');
        if (newPassword !== newPassword2) throw new Error('Новый пароль и повтор не совпадают');
        finalHash = bcrypt.hashSync(newPassword, 12);
      }

      db.prepare('UPDATE app_users SET username = ?, password_hash = ? WHERE id = ?')
        .run(finalUsername, finalHash, user.id);
    }

    res.redirect('/settings?message=' + encodeURIComponent('Настройки сохранены'));
  } catch (err) {
    res.redirect('/settings?error=' + encodeURIComponent(String(err.message || err)));
  }

});



app.post('/settings/security', requireAuth, (req, res) => {
  try {
    const idle = Math.min(1440, Math.max(5, Math.floor(Number(req.body.admin_idle_timeout_minutes || 20))));
    setSetting('admin_idle_timeout_minutes', String(idle));
    setSetting('admin_bind_session_to_ip', req.body.admin_bind_session_to_ip === '1' ? '1' : '0');
    req.session.lastActivity = Date.now();
    req.session.loginIp = getClientIp(req);
    res.redirect('/settings?message=' + encodeURIComponent('Настройки безопасности сохранены'));
  } catch (err) {
    res.redirect('/settings?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/settings/telegram', requireAuth, (req, res) => {
  try {
    setSetting('telegram_notifications_enabled', req.body.telegram_notifications_enabled === '1' ? '1' : '0');
    setSetting('telegram_bot_token', String(req.body.telegram_bot_token || '').trim());
    setSetting('telegram_chat_id', String(req.body.telegram_chat_id || '').trim());
    setSetting('telegram_notify_offline_nodes', req.body.telegram_notify_offline_nodes === '1' ? '1' : '0');
    setSetting('telegram_notify_suspicious_clients', req.body.telegram_notify_suspicious_clients === '1' ? '1' : '0');
    setSetting('telegram_suspicious_daily_gb', String(parseGbThreshold(req.body.telegram_suspicious_daily_gb, 100)));
    const back = String(req.query.return || req.body.return_to || '').trim() === 'telegram-bot' ? '/telegram-bot' : '/settings';
    res.redirect(back + '?message=' + encodeURIComponent('Telegram-настройки сохранены'));
  } catch (err) {
    const back = String(req.query.return || req.body.return_to || '').trim() === 'telegram-bot' ? '/telegram-bot' : '/settings';
    res.redirect(back + '?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/settings/telegram-test', requireAuth, async (req, res) => {
  const back = String(req.query.return || req.body.return_to || '').trim() === 'telegram-bot' ? '/telegram-bot' : '/settings';
  try {
    await sendTelegramNotification('✅ 3xui-Aggregator: тестовое уведомление Telegram работает.');
    res.redirect(back + '?message=' + encodeURIComponent('Тестовое Telegram-уведомление отправлено'));
  } catch (err) {
    res.redirect(back + '?error=' + encodeURIComponent('Telegram ошибка: ' + String(err.message || err)));
  }
});

function exportBackupPayload(req = null) {
  const tables = ['app_users', 'app_settings', 'nodes', 'clients', 'client_nodes', 'node_inbound_cache', 'sni_profiles', 'telegram_users', 'telegram_orders', 'telegram_tickets', 'telegram_ticket_messages', 'telegram_announcements', 'vpn_hosts', 'vpn_services', 'vpn_clients', 'vpn_jobs'];
  const data = {};
  for (const table of tables) data[table] = db.prepare(`SELECT * FROM ${table}`).all();
  return {
    app: '3xui-aggregator',
    version: 2,
    created_at: new Date().toISOString(),
    panel_host: req ? getRequestPanelHost(req) : '',
    panel_identity: req ? getBackupPanelIdentity(req) : safeFileSegment(BASE_URL, 'panel'),
    data
  };
}

function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
}

function ensureAdminUserExists() {
  const row = db.prepare('SELECT id FROM app_users LIMIT 1').get();
  if (row) return;
  const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  db.prepare('INSERT INTO app_users (username, password_hash) VALUES (?, ?)').run(ADMIN_USERNAME, passwordHash);
}

function restoreBackupPayload(payload) {
  if (!payload || payload.app !== '3xui-aggregator' || !payload.data) throw new Error('Неверный файл резервной копии');
  const deleteTables = ['vpn_jobs', 'vpn_clients', 'vpn_services', 'vpn_hosts', 'telegram_ticket_messages', 'telegram_tickets', 'telegram_orders', 'telegram_announcements', 'telegram_users', 'sni_profiles', 'node_inbound_cache', 'client_nodes', 'clients', 'nodes', 'app_settings', 'app_users'];
  const restoreTables = ['app_users', 'app_settings', 'nodes', 'clients', 'client_nodes', 'node_inbound_cache', 'sni_profiles', 'telegram_users', 'telegram_orders', 'telegram_tickets', 'telegram_ticket_messages', 'telegram_announcements', 'vpn_hosts', 'vpn_services', 'vpn_clients', 'vpn_jobs'];
  const columnCache = new Map();
  const tx = db.transaction(() => {
    for (const table of deleteTables) db.prepare(`DELETE FROM ${table}`).run();
    for (const table of restoreTables) {
      const rows = Array.isArray(payload.data[table]) ? payload.data[table] : [];
      if (!rows.length) continue;
      const allowed = new Set(columnCache.get(table) || tableColumns(table));
      columnCache.set(table, Array.from(allowed));

      for (const row of rows) {
        const clean = {};
        for (const [key, value] of Object.entries(row || {})) {
          if (allowed.has(key)) clean[key] = value;
        }
        const keys = Object.keys(clean);
        if (!keys.length) continue;
        const cols = keys.map(k => `"${k}"`).join(', ');
        const placeholders = keys.map(k => `@${k}`).join(', ');
        db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`).run(clean);
      }
    }
  });
  tx();

  // Старые backup-файлы не знают о новых настройках panel/sub URL и secret-key.
  // После восстановления добавляем недостающие значения из текущего .env, не
  // перезаписывая клиентов, узлы и уже существующие настройки backup-файла.
  ensureAdminUserExists();
  ensureMissingAppSettings();
  backfillSchemaDefaults();
  seedDefaultSniProfiles();
}

app.get('/backup/download', requireAuth, (req, res) => {
  const payload = exportBackupPayload(req);
  const fileName = buildBackupFileName(req, 'json');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  setAttachmentDispositionHeader(res, fileName, 'backup');
  res.send(JSON.stringify(payload, null, 2));
});

app.get('/backup/telegram-download', (req, res) => {
  try {
    if (!isValidTelegramBackupDownload(req)) return res.status(403).send('Backup link expired or invalid');
    const payload = exportBackupPayload(req);
    const fileName = buildBackupFileName(req, 'json');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    setAttachmentDispositionHeader(res, fileName, 'backup');
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.status(500).send(String(err.message || err));
  }
});

app.post('/backup/restore', requireAuth, bodyParser.text({ type: '*/*', limit: '50mb' }), (req, res) => {
  try {
    const text = String(req.body || '').trim();
    if (!text) throw new Error('Файл резервной копии пустой');
    restoreBackupPayload(JSON.parse(text));
    req.session.destroy(() => res.redirect(buildLoginRedirectPath('Резервная копия восстановлена. Войди заново.')));
  } catch (err) {
    res.status(400).send(String(err.message || err));
  }
});

app.post('/nodes/reorder', requireAuth, bodyParser.json({ limit: '2mb' }), (req, res) => {
  try {
    const order = Array.isArray(req.body.order) ? req.body.order.map(v => Number(v)).filter(Number.isFinite) : [];
    if (!order.length) return res.status(400).json({ ok: false, error: 'Пустой порядок узлов' });
    const known = new Set(db.prepare('SELECT id FROM nodes').all().map(r => Number(r.id)));
    const unique = [...new Set(order)].filter(id => known.has(id));
    if (unique.length !== order.length) return res.status(400).json({ ok: false, error: 'В списке есть неизвестные узлы' });
    const tx = db.transaction((ids) => {
      const update = db.prepare('UPDATE nodes SET sort_order = ? WHERE id = ?');
      ids.forEach((id, index) => update.run(index + 1, id));
    });
    tx(unique);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get('/nodes/:id/remnawave-resources.json', requireAuth, async (req, res) => {
  try {
    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(Number(req.params.id));
    if (!node) return res.status(404).json({ ok: false, error: 'Узел не найден' });
    if (!isRemnawaveNode(node)) return res.status(400).json({ ok: false, error: 'Это не Remnawave-узел' });

    const result = { ok: true, nodes: [], hosts: [], squads: [], errors: [] };
    const requests = [
      ['nodes', '/api/nodes', ['nodes','items','rows']],
      ['hosts', '/api/hosts', ['hosts','items','rows']],
      ['squads', '/api/internal-squads', ['internalSquads','squads','items','rows']]
    ];
    for (const [kind, endpoint, keys] of requests) {
      try {
        const data = await remnawaveApiGet(node, endpoint, Math.min(FETCH_TIMEOUT_MS, 10000));
        const list = extractRemnawaveCollection(data, keys);
        result[kind] = list.map(item => ({
          uuid: remnawaveResourceUuid(item),
          label: kind === 'nodes' ? remnawaveNodeResourceLabel(item) : (kind === 'hosts' ? remnawaveHostResourceLabel(item) : remnawaveSquadResourceLabel(item))
        })).filter(item => item.uuid);
      } catch (err) {
        result.errors.push(`${kind}: ${String(err?.message || err)}`);
      }
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.post('/nodes/:id/clone-remnawave', requireAuth, (req, res) => {
  try {
    const nodeId = Number(req.params.id);
    const source = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
    if (!source) throw new Error('Узел не найден');
    if (!isRemnawaveNode(source)) throw new Error('Клонировать этим способом можно только Remnawave-узел');

    const columns = db.prepare('PRAGMA table_info(nodes)').all().map(row => String(row.name || '')).filter(name => name && name !== 'id');
    const quoted = columns.map(name => `"${name.replace(/"/g, '""')}"`).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map(name => source[name]);
    const info = db.prepare(`INSERT INTO nodes (${quoted}) VALUES (${placeholders})`).run(...values);
    const newId = Number(info.lastInsertRowid);
    const maxOrder = Number(db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM nodes').get()?.m || 0);
    const baseSuffix = String(source.label_suffix || '').trim();
    db.prepare(`
      UPDATE nodes
      SET label_suffix = ?, remnawave_node_uuid = '', remnawave_host_uuid = '', remnawave_link_filter = '', enabled = 0,
          last_status = 'unknown', last_error = '', sort_order = ?
      WHERE id = ?
    `).run(baseSuffix ? `${baseSuffix} copy` : 'Remnawave copy', maxOrder + 1, newId);
    res.redirect(`/nodes/${newId}/edit?message=${encodeURIComponent('Создана безопасная копия подключения Remnawave. Выбери другую физическую ноду и Host, затем включи её.')}`);
  } catch (err) {
    res.redirect('/nodes?tab=list&error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.get('/nodes', requireAuth, (req, res) => {
  const nodes = db.prepare(`SELECT * FROM nodes ORDER BY ${nodeOrderSql()}`).all().map(enrichNodeWithCachedTransport);
  const requestedTab = String(req.query.tab || 'list').trim().toLowerCase();

  render(res, 'nodes', {
    nodes,
    countries: getSortedCountriesRu(),
    nodePageSize: getNodesPageSize(),
    sniProfiles: getSniProfiles(),
    nodeActiveTab: ['list', 'add', 'help'].includes(requestedTab) ? requestedTab : 'list',
    message: req.query.message || '',
    error: req.query.error || ''
  });
});

app.post('/nodes', requireAuth, async (req, res) => {
  try {
    const {
      node_type,
      panel_url,
      panel_path,
      sub_base_url,
      h1cloud_3xui_sub_base_url,
      username,
      password,
      api_auth_mode,
      api_token,
      inbound_id,
      country_code,
      label_suffix,
      custom_country_name_ru,
      custom_country_flag,
      sni_mode,
      sni_profile_id,
      sni_override,
      h1cloud_link_mode,
      remnawave_caddy_token,
      remnawave_internal_squad_uuid,
      remnawave_node_uuid,
      remnawave_host_uuid,
      remnawave_link_mode,
      remnawave_link_filter,
      remnawave_remark_mode
    } = req.body;

    const normalizedNodeType = normalizeNodeTypeValue(node_type || NODE_TYPE_3XUI);
    if ([NODE_TYPE_H1CLOUD, NODE_TYPE_H1CLOUD_3XUI].includes(normalizedNodeType)) {
      throw new Error('Добавление H1Cloud отдельным методом удалено. Добавь эту панель как обычную 3x-ui.');
    }
    const isH1ApiType = normalizedNodeType === NODE_TYPE_H1CLOUD;
    const isH1PanelType = normalizedNodeType === NODE_TYPE_H1CLOUD_3XUI;
    const isRemnawaveType = normalizedNodeType === NODE_TYPE_REMNAWAVE;
    const isTokenOnlyType = isH1ApiType || isRemnawaveType;

    if (!String(panel_url || '').trim()) {
      if (isH1ApiType) throw new Error('Укажи H1Cloud API Base URL.');
      if (isRemnawaveType) throw new Error('Укажи URL панели Remnawave, например https://rw.nl.amored.ru.');
      throw new Error('Укажи URL панели 3x-ui.');
    }

    const apiMode = isTokenOnlyType
      ? 'token'
      : (String(api_auth_mode || 'token').trim() === 'password' ? 'password' : 'token');

    if (!isTokenOnlyType && apiMode === 'password' && (!String(username || '').trim() || !String(password || '').trim())) {
      throw new Error('Для старого метода API нужно указать логин и пароль панели.');
    }
    if (apiMode === 'token' && !String(api_token || '').trim()) {
      if (isH1ApiType) throw new Error('Для H1Cloud нужно вставить API token из команды vpn api token.');
      if (isRemnawaveType) throw new Error('Для Remnawave нужно создать API Token в панели и вставить его сюда.');
      throw new Error('Для 3x-ui нужно вставить API Token удалённой панели.');
    }
    if (!isH1ApiType && !isRemnawaveType && (!Number(inbound_id) || Number(inbound_id) < 1)) {
      throw new Error('Для 3x-ui нужно указать Inbound ID.');
    }
    if (isRemnawaveType) {
      const squadUuid = String(remnawave_internal_squad_uuid || '').trim();
      const nodeUuid = String(remnawave_node_uuid || '').trim();
      const hostUuid = String(remnawave_host_uuid || '').trim();
      if (!squadUuid) throw new Error('Для Remnawave укажи Internal Squad UUID. Этот squad определяет, какие Hosts попадут в подписку клиента.');
      if (!isUuidText(squadUuid)) throw new Error('Internal Squad UUID Remnawave имеет неверный формат.');
      if (nodeUuid && !isUuidText(nodeUuid)) throw new Error('Remnawave Node UUID имеет неверный формат.');
      if (hostUuid && !isUuidText(hostUuid)) throw new Error('Remnawave Host UUID имеет неверный формат.');
    }

    const country = buildCountryFromForm(country_code, custom_country_name_ru, custom_country_flag);
    if (!country) throw new Error('Страна не найдена');

    const normalizedSniMode = (isH1ApiType || isH1PanelType || isRemnawaveType)
      ? 'inbound'
      : (['inbound', 'profile', 'manual'].includes(String(sni_mode || 'inbound')) ? String(sni_mode || 'inbound') : 'inbound');
    const normalizedSniProfileId = normalizedSniMode === 'profile' ? Number(sni_profile_id || 0) || null : null;
    const normalizedSniOverride = normalizedSniMode === 'manual' ? normalizeSniValue(sni_override || '') : '';
    const normalizedH1CloudLinkTypes = isH1ApiType
      ? normalizeH1CloudLinkTypesFromForm(req.body, h1cloud_link_mode)
      : [H1CLOUD_LINK_TYPE_REALITY];
    const normalizedH1CloudLinkMode = h1CloudLegacyModeFromTypes(normalizedH1CloudLinkTypes);
    const serializedH1CloudLinkTypes = serializeH1CloudLinkTypes(normalizedH1CloudLinkTypes);
    const normalizedH1CloudFingerprint = isH1ApiType ? normalizeH1CloudFingerprintFromForm(req.body) : '';
    const h1cloud3xuiSharedTraffic = 0;
    const h1cloud3xuiLocalExpiry = isH1PanelType && req.body.h1cloud_3xui_local_expiry === '1' ? 1 : 0;
    const h1cloud3xuiSubPort = isH1PanelType ? normalizeH1Cloud3xuiSubPort(req.body.h1cloud_3xui_sub_port || 25555) : 25555;
    const h1cloud3xuiJsonUrlTemplate = isH1PanelType
      ? normalizeH1Cloud3xuiJsonUrlTemplate(req.body.h1cloud_3xui_json_url_template || '', { panel_url, sub_base_url: h1cloud_3xui_sub_base_url })
      : '';
    const normalizedRemnawaveLinkMode = isRemnawaveType ? normalizeRemnawaveLinkMode(remnawave_link_mode) : 'first';
    const normalizedRemnawaveLinkFilter = isRemnawaveType ? normalizeRemnawaveLinkFilter(remnawave_link_filter) : '';
    const normalizedRemnawaveRemarkMode = isRemnawaveType ? normalizeRemnawaveRemarkMode(remnawave_remark_mode) : 'aggregator';

    const storedPanelUrl = isRemnawaveType
      ? normalizeRemnawaveBaseUrl(panel_url)
      : String(panel_url || '').trim();
    const storedPanelPath = (isH1ApiType || isRemnawaveType) ? '' : String(panel_path || '').trim();
    const storedSubBaseUrl = isRemnawaveType
      ? ''
      : (isH1ApiType
          ? normalizeH1CloudSubBaseUrl({ panel_url, panel_path: '', sub_base_url })
          : (isH1PanelType
              ? normalizeH1Cloud3xuiSubBaseUrl({ panel_url, sub_base_url: h1cloud_3xui_sub_base_url, h1cloud_3xui_sub_port: h1cloud3xuiSubPort })
              : ''));

    const info = db.prepare(`
      INSERT INTO nodes (
        name,
        node_type,
        panel_url,
        panel_path,
        sub_base_url,
        h1cloud_link_mode,
        h1cloud_link_types,
        h1cloud_fingerprint,
        username,
        password_enc,
        api_auth_mode,
        api_token_enc,
        remnawave_caddy_token_enc,
        remnawave_internal_squad_uuid,
        remnawave_node_uuid,
        remnawave_host_uuid,
        remnawave_link_mode,
        remnawave_link_filter,
        remnawave_remark_mode,
        inbound_id,
        country_code,
        country_name_ru,
        country_flag,
        label_suffix,
        sni_mode,
        sni_profile_id,
        sni_override,
        h1cloud_3xui_shared_traffic,
        h1cloud_3xui_local_expiry,
        h1cloud_3xui_sub_port,
        h1cloud_3xui_json_url_template,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      country.name_ru,
      normalizedNodeType,
      storedPanelUrl,
      storedPanelPath,
      storedSubBaseUrl,
      normalizedH1CloudLinkMode,
      serializedH1CloudLinkTypes,
      normalizedH1CloudFingerprint,
      apiMode === 'password' ? String(username || '').trim() : '',
      encrypt(apiMode === 'password' ? String(password || '').trim() : '', APP_SECRET),
      apiMode,
      apiMode === 'token' ? encrypt(String(api_token || '').trim(), APP_SECRET) : '',
      isRemnawaveType && String(remnawave_caddy_token || '').trim() ? encrypt(String(remnawave_caddy_token).trim(), APP_SECRET) : '',
      isRemnawaveType ? String(remnawave_internal_squad_uuid || '').trim() : '',
      isRemnawaveType ? String(remnawave_node_uuid || '').trim() : '',
      isRemnawaveType ? String(remnawave_host_uuid || '').trim() : '',
      normalizedRemnawaveLinkMode,
      normalizedRemnawaveLinkFilter,
      normalizedRemnawaveRemarkMode,
      (isH1ApiType || isRemnawaveType) ? 0 : Number(inbound_id),
      country.code,
      country.name_ru,
      country.flag,
      String(label_suffix || '').trim(),
      normalizedSniMode,
      normalizedSniProfileId,
      normalizedSniOverride,
      h1cloud3xuiSharedTraffic,
      h1cloud3xuiLocalExpiry,
      h1cloud3xuiSubPort,
      h1cloud3xuiJsonUrlTemplate,
      Number(db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM nodes').get().n || 1)
    );

    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(info.lastInsertRowid);
    let sniApplyMessage = '';
    let sniApplyError = '';
    const selectedSniForRemote = getSniFromModeValues(normalizedSniMode, normalizedSniProfileId, normalizedSniOverride);
    if (normalizedNodeType === NODE_TYPE_3XUI && selectedSniForRemote) {
      try {
        const applied = await applyNodeSelectedSniToRemoteInbound(node, selectedSniForRemote);
        if (applied && applied.ok) sniApplyMessage = `. SNI/Target применены в 3x-ui: ${applied.sni} → ${applied.target}`;
      } catch (err) {
        sniApplyError = 'SNI/Target не удалось применить в 3x-ui: ' + String(err.message || err);
      }
    }

    const check = await checkNode(node);
    const importClientsFromNewNode = req.body.import_clients_from_node === '1';
    const createExistingClients = req.body.create_existing_clients_on_node === '1' || req.body.add_clients_from_aggregator === '1';
    const remnawaveInfo = isRemnawaveType && check.ok
      ? ` · Remnawave API${Number.isFinite(Number(check.providerInfo?.usersTotal)) ? ` · пользователей: ${Number(check.providerInfo.usersTotal)}` : ''}`
      : '';
    let message = (check.ok
      ? `Узел добавлен и проверен${check.panelVersion ? ` · 3x-ui ${check.panelVersion}` : ''}${remnawaveInfo}`
      : 'Узел добавлен, но проверка не прошла') + sniApplyMessage;
    let errorText = [check.ok ? '' : String(check.error || 'узел офлайн'), sniApplyError].filter(Boolean).join(' | ');

    if (isRemnawaveType) {
      message += '. Подключение Remnawave сохранено. Пользователи выбранного Internal Squad могут создаваться из Aggregator, а VLESS-хосты Remnawave будут добавляться в общую SUB/JSON подписку.';
    }

    if (importClientsFromNewNode) {
      const result = await refreshLocalClientsFromSourceNode(node);
      message += '. Импорт из нового узла в агрегатор: найдено ' + result.totalSourceClients + ', новых ' + result.imported + ', обновлено ' + result.updated + ', связей ' + result.mappingsCreated + ', ошибок ' + result.failed;
      if (result.errors && result.errors.length) errorText = [errorText, ...result.errors].filter(Boolean).join(' | ');
    }

    if (createExistingClients) {
      const result = await createExistingClientsOnNode(node);
      message += '. Добавление отсутствующих клиентов в новый узел: всего ' + result.totalClients + ', создано ' + result.remoteCreated + ', уже существовало ' + result.skippedExisting + ', связей ' + result.mappingsCreated + ', конфликтов ' + result.conflicts + ', ошибок ' + result.failed;
      if (result.errors && result.errors.length) errorText = [errorText, ...result.errors].filter(Boolean).join(' | ');
    }

    const qs = new URLSearchParams({ message });
    if (errorText) qs.set('error', errorText);
    qs.set('tab', 'list');
    res.redirect('/nodes?' + qs.toString());
  } catch (err) {
    res.redirect('/nodes?tab=add&error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/nodes/:id/check', requireAuth, async (req, res) => {
  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(Number(req.params.id));

  if (!node) {
    return res.redirect('/nodes?tab=list&error=' + encodeURIComponent('Узел не найден'));
  }

  const result = await checkNode(node, { timeoutMs: NODE_HEALTHCHECK_TIMEOUT_MS });
  if (result.ok) {
    const successMessage = isRemnawaveNode(node)
      ? `Remnawave API отвечает${Number.isFinite(Number(result.providerInfo?.usersTotal)) ? ` · пользователей: ${Number(result.providerInfo.usersTotal)}` : ''}`
      : 'Узел отвечает.';
    return res.redirect('/nodes?tab=list&message=' + encodeURIComponent(successMessage));
  }
  const msg = `Узел офлайн: ${result.error}`;
  res.redirect('/nodes?tab=list&error=' + encodeURIComponent(msg));
});

app.post('/nodes/:id/sync-clients', requireAuth, async (req, res) => {
  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(Number(req.params.id));
  if (!node) return res.redirect('/nodes?tab=list&error=' + encodeURIComponent('Узел не найден'));

  try {
    const result = await refreshLocalClientsFromSourceNode(node);
    const message = 'Импорт клиентов из узла завершён: найдено ' + result.totalSourceClients + ', новых ' + result.imported + ', обновлено ' + result.updated + ', связей ' + result.mappingsCreated + ', ошибок ' + result.failed;
    const qs = new URLSearchParams({ message });
    if (result.errors && result.errors.length) qs.set('error', result.errors.join(' | '));
    qs.set('tab', 'list');
    res.redirect('/nodes?' + qs.toString());
  } catch (err) {
    res.redirect('/nodes?tab=list&error=' + encodeURIComponent('Импорт клиентов из узла не удался: ' + String(err.message || err)));
  }
});

app.post('/nodes/:id/create-missing-clients', requireAuth, async (req, res) => {
  try {
    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(Number(req.params.id));
    if (!node) throw new Error('Узел не найден');
    const nodeName = getNodePublicName(node);
    await finishLongPost(req, res, '/nodes',
      operation => createExistingClientsOnNode(node, operation),
      result => `Добавление отсутствующих клиентов на узел ${nodeName} завершено. Всего в агрегаторе: ${result.totalClients}, проверено: ${result.completed || 0}, создано: ${result.remoteCreated}, уже существовало и пропущено: ${result.skippedExisting}, новых связей: ${result.mappingsCreated}, конфликтов UUID: ${result.conflicts}, не запускалось после потери связи: ${result.skippedAfterFailure || 0}, ошибок: ${result.failed}`,
      { label: `Добавление отсутствующих клиентов: ${nodeName}` }
    );
  } catch (err) {
    res.redirect('/nodes?error=' + encodeURIComponent(String(err.message || err)));
  }
});


app.post('/nodes/:id/toggle', requireAuth, (req, res) => {
  try {
    const nodeId = Number(req.params.id);
    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);

    if (!node) {
      return res.redirect('/nodes?tab=list&error=' + encodeURIComponent('Узел не найден'));
    }

    const nextEnabled = Number(node.enabled) === 1 ? 0 : 1;

    db.prepare('UPDATE nodes SET enabled = ? WHERE id = ?').run(nextEnabled, nodeId);

    const msg = isRemnawaveNode(node)
      ? (nextEnabled ? 'Remnawave включён и снова будет попадать в SUB/JSON клиентов.' : 'Remnawave отключён и исключён из SUB/JSON клиентов.')
      : (nextEnabled ? 'Узел включён и снова будет попадать в SUB/JSON' : 'Узел отключён и не будет попадать в SUB/JSON');

    res.redirect('/nodes?tab=list&message=' + encodeURIComponent(msg));
  } catch (err) {
    res.redirect('/nodes?tab=list&error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.get('/nodes/:id/edit', requireAuth, async (req, res) => {
  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(Number(req.params.id));

  if (!node) {
    return res.redirect('/nodes?tab=list&error=' + encodeURIComponent('Узел не найден'));
  }

  let inboundPreview = null;
  let loadError = '';
  try {
    if (is3xuiFamilyNode(node)) {
      const inbound = req.query.load_inbound === '1' ? await getInboundForNodeHealthCheck(node) : getCachedInbound(node);
      inboundPreview = extractInboundEditorValues(inbound);
    }
  } catch (err) {
    const enriched = (isH1CloudNode(node) || isRemnawaveNode(node)) ? err : enrich3xuiError(node, err);
    loadError = String(enriched?.message || enriched || err);
  }

  render(res, 'node_edit', {
    node,
    inboundPreview,
    countries: getSortedCountriesRu(),
    nodePageSize: getNodesPageSize(),
    sniProfiles: getSniProfiles(),
    message: req.query.message || '',
    error: req.query.error || loadError || ''
  });
});

app.post('/nodes/:id/edit', requireAuth, async (req, res) => {
  try {
    const nodeId = Number(req.params.id);
    const existingNode = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
    if (!existingNode) return res.redirect('/nodes?tab=list&error=' + encodeURIComponent('Узел не найден'));

    const {
      node_type,
      panel_url,
      panel_path,
      sub_base_url,
      h1cloud_3xui_sub_base_url,
      username,
      password,
      api_auth_mode,
      api_token,
      inbound_id,
      country_code,
      label_suffix,
      custom_country_name_ru,
      custom_country_flag,
      sni_mode,
      sni_profile_id,
      sni_override,
      h1cloud_link_mode,
      remnawave_caddy_token,
      remnawave_internal_squad_uuid,
      remnawave_node_uuid,
      remnawave_host_uuid,
      remnawave_link_mode,
      remnawave_link_filter,
      remnawave_remark_mode
    } = req.body;

    const normalizedNodeType = normalizeNodeTypeValue(node_type || existingNode.node_type || NODE_TYPE_3XUI);
    const previousNodeType = normalizeNodeTypeValue(existingNode.node_type || NODE_TYPE_3XUI);
    if ([NODE_TYPE_H1CLOUD, NODE_TYPE_H1CLOUD_3XUI].includes(normalizedNodeType) && normalizedNodeType !== previousNodeType) {
      throw new Error('Создание или перевод узла в H1Cloud-тип больше не поддерживается. Используй обычный тип 3x-ui.');
    }
    const isH1ApiType = normalizedNodeType === NODE_TYPE_H1CLOUD;
    const isH1PanelType = normalizedNodeType === NODE_TYPE_H1CLOUD_3XUI;
    const isRemnawaveType = normalizedNodeType === NODE_TYPE_REMNAWAVE;
    const isTokenOnlyType = isH1ApiType || isRemnawaveType;
    const nodeTypeChanged = normalizedNodeType !== previousNodeType;

    if (!String(panel_url || '').trim()) {
      if (isH1ApiType) throw new Error('Укажи H1Cloud API Base URL.');
      if (isRemnawaveType) throw new Error('Укажи URL панели Remnawave.');
      throw new Error('Укажи URL панели 3x-ui.');
    }

    const previousApiMode = [NODE_TYPE_H1CLOUD, NODE_TYPE_REMNAWAVE].includes(previousNodeType)
      ? 'token'
      : (String(existingNode.api_auth_mode || 'token').trim() === 'password' ? 'password' : 'token');
    const apiMode = isTokenOnlyType
      ? 'token'
      : (String(api_auth_mode || existingNode.api_auth_mode || 'token').trim() === 'password' ? 'password' : 'token');
    const credentialsContextChanged = nodeTypeChanged || apiMode !== previousApiMode;

    if (!isTokenOnlyType && apiMode === 'password') {
      if (!String(username || '').trim()) throw new Error('Для старого метода API нужно указать логин панели.');
      const existingPassword = credentialsContextChanged ? '' : String(existingNode.password_enc || '').trim();
      if (!String(password || '').trim() && !existingPassword) {
        throw new Error(credentialsContextChanged ? 'Способ подключения изменён. Введи пароль панели 3x-ui.' : 'Для старого метода API нужно указать пароль панели.');
      }
    }

    if (apiMode === 'token') {
      const existingToken = credentialsContextChanged ? '' : String(existingNode.api_token_enc || '').trim();
      if (!String(api_token || '').trim() && !existingToken) {
        if (isH1ApiType) throw new Error('Вставь H1Cloud API token из команды vpn api token.');
        if (isRemnawaveType) throw new Error('Вставь API Token панели Remnawave.');
        throw new Error('Вставь API Token удалённой панели 3x-ui.');
      }
    }

    if (!isH1ApiType && !isRemnawaveType && (!Number(inbound_id) || Number(inbound_id) < 1)) {
      throw new Error('Для 3x-ui нужно указать Inbound ID.');
    }
    if (isRemnawaveType) {
      const squadUuid = String(remnawave_internal_squad_uuid || '').trim();
      const nodeUuid = String(remnawave_node_uuid || '').trim();
      const hostUuid = String(remnawave_host_uuid || '').trim();
      if (!squadUuid) throw new Error('Для Remnawave укажи Internal Squad UUID.');
      if (!isUuidText(squadUuid)) throw new Error('Internal Squad UUID Remnawave имеет неверный формат.');
      if (nodeUuid && !isUuidText(nodeUuid)) throw new Error('Remnawave Node UUID имеет неверный формат.');
      if (hostUuid && !isUuidText(hostUuid)) throw new Error('Remnawave Host UUID имеет неверный формат.');
    }

    const country = buildCountryFromForm(country_code, custom_country_name_ru, custom_country_flag);
    if (!country) throw new Error('Страна не найдена');
    const normalizedSniMode = (isH1ApiType || isH1PanelType || isRemnawaveType)
      ? 'inbound'
      : (['inbound', 'profile', 'manual'].includes(String(sni_mode || 'inbound')) ? String(sni_mode || 'inbound') : 'inbound');
    const normalizedSniProfileId = normalizedSniMode === 'profile' ? Number(sni_profile_id || 0) || null : null;
    const normalizedSniOverride = normalizedSniMode === 'manual' ? normalizeSniValue(sni_override || '') : '';
    const normalizedH1CloudLinkTypes = isH1ApiType
      ? normalizeH1CloudLinkTypesFromForm(req.body, h1cloud_link_mode || existingNode.h1cloud_link_mode)
      : [H1CLOUD_LINK_TYPE_REALITY];
    const normalizedH1CloudLinkMode = h1CloudLegacyModeFromTypes(normalizedH1CloudLinkTypes);
    const serializedH1CloudLinkTypes = serializeH1CloudLinkTypes(normalizedH1CloudLinkTypes);
    const normalizedH1CloudFingerprint = isH1ApiType ? normalizeH1CloudFingerprintFromForm(req.body) : '';
    const h1cloud3xuiSharedTraffic = 0;
    const h1cloud3xuiLocalExpiry = isH1PanelType && req.body.h1cloud_3xui_local_expiry === '1' ? 1 : 0;
    const h1cloud3xuiSubPort = isH1PanelType
      ? normalizeH1Cloud3xuiSubPort(req.body.h1cloud_3xui_sub_port || existingNode.h1cloud_3xui_sub_port || 25555)
      : 25555;
    const h1cloud3xuiJsonUrlTemplate = isH1PanelType
      ? normalizeH1Cloud3xuiJsonUrlTemplate(req.body.h1cloud_3xui_json_url_template || '', { panel_url, sub_base_url: h1cloud_3xui_sub_base_url })
      : '';
    const normalizedRemnawaveLinkMode = isRemnawaveType ? normalizeRemnawaveLinkMode(remnawave_link_mode || existingNode.remnawave_link_mode) : 'first';
    const normalizedRemnawaveLinkFilter = isRemnawaveType ? normalizeRemnawaveLinkFilter(remnawave_link_filter) : '';
    const normalizedRemnawaveRemarkMode = isRemnawaveType ? normalizeRemnawaveRemarkMode(remnawave_remark_mode || existingNode.remnawave_remark_mode) : 'aggregator';

    const updatedPasswordEnc = apiMode === 'password'
      ? (String(password || '').trim() ? encrypt(String(password).trim(), APP_SECRET) : (credentialsContextChanged ? '' : existingNode.password_enc))
      : encrypt('', APP_SECRET);
    const updatedApiTokenEnc = apiMode === 'token'
      ? (String(api_token || '').trim() ? encrypt(String(api_token).trim(), APP_SECRET) : (credentialsContextChanged ? '' : (existingNode.api_token_enc || '')))
      : '';
    const updatedRemnawaveCaddyTokenEnc = isRemnawaveType
      ? (String(remnawave_caddy_token || '').trim()
          ? encrypt(String(remnawave_caddy_token).trim(), APP_SECRET)
          : (nodeTypeChanged ? '' : String(existingNode.remnawave_caddy_token_enc || '')))
      : '';

    const storedPanelUrl = isRemnawaveType ? normalizeRemnawaveBaseUrl(panel_url) : String(panel_url || '').trim();
    const storedPanelPath = (isH1ApiType || isRemnawaveType) ? '' : String(panel_path || '').trim();
    const storedSubBaseUrl = isRemnawaveType
      ? ''
      : (isH1ApiType
          ? normalizeH1CloudSubBaseUrl({ panel_url, panel_path: '', sub_base_url })
          : (isH1PanelType
              ? normalizeH1Cloud3xuiSubBaseUrl({ panel_url, sub_base_url: h1cloud_3xui_sub_base_url, h1cloud_3xui_sub_port: h1cloud3xuiSubPort })
              : ''));

    db.prepare(`
      UPDATE nodes
      SET
        name = ?,
        node_type = ?,
        panel_url = ?,
        panel_path = ?,
        sub_base_url = ?,
        h1cloud_link_mode = ?,
        h1cloud_link_types = ?,
        h1cloud_fingerprint = ?,
        username = ?,
        password_enc = ?,
        api_auth_mode = ?,
        api_token_enc = ?,
        remnawave_caddy_token_enc = ?,
        remnawave_internal_squad_uuid = ?,
        remnawave_node_uuid = ?,
        remnawave_host_uuid = ?,
        remnawave_link_mode = ?,
        remnawave_link_filter = ?,
        remnawave_remark_mode = ?,
        inbound_id = ?,
        country_code = ?,
        country_name_ru = ?,
        country_flag = ?,
        label_suffix = ?,
        sni_mode = ?,
        sni_profile_id = ?,
        sni_override = ?,
        h1cloud_3xui_shared_traffic = ?,
        h1cloud_3xui_local_expiry = ?,
        h1cloud_3xui_sub_port = ?,
        h1cloud_3xui_json_url_template = ?
      WHERE id = ?
    `).run(
      country.name_ru,
      normalizedNodeType,
      storedPanelUrl,
      storedPanelPath,
      storedSubBaseUrl,
      normalizedH1CloudLinkMode,
      serializedH1CloudLinkTypes,
      normalizedH1CloudFingerprint,
      apiMode === 'password' ? String(username || '').trim() : '',
      updatedPasswordEnc,
      apiMode,
      updatedApiTokenEnc,
      updatedRemnawaveCaddyTokenEnc,
      isRemnawaveType ? String(remnawave_internal_squad_uuid || '').trim() : '',
      isRemnawaveType ? String(remnawave_node_uuid || '').trim() : '',
      isRemnawaveType ? String(remnawave_host_uuid || '').trim() : '',
      normalizedRemnawaveLinkMode,
      normalizedRemnawaveLinkFilter,
      normalizedRemnawaveRemarkMode,
      (isH1ApiType || isRemnawaveType) ? 0 : Number(inbound_id),
      country.code,
      country.name_ru,
      country.flag,
      String(label_suffix || '').trim(),
      normalizedSniMode,
      normalizedSniProfileId,
      normalizedSniOverride,
      h1cloud3xuiSharedTraffic,
      h1cloud3xuiLocalExpiry,
      h1cloud3xuiSubPort,
      h1cloud3xuiJsonUrlTemplate,
      nodeId
    );

    for (const key of remnawaveHostDescriptorCache.keys()) {
      if (String(key).startsWith(`${nodeId}:`)) remnawaveHostDescriptorCache.delete(key);
    }
    const updatedNode = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
    let inboundPortWarning = '';
    if (normalizedNodeType === NODE_TYPE_3XUI && req.body.apply_inbound_settings === '1') {
      const beforeInbound = getCachedInbound(existingNode);
      const oldInboundPort = normalizePortNumber(beforeInbound?.port || 0);
      const newInboundPort = normalizePortNumber(req.body.inbound_port || oldInboundPort);
      if (oldInboundPort && newInboundPort && oldInboundPort !== newInboundPort) {
        const activeRedirect = db.prepare('SELECT id FROM redirect_rules WHERE enabled = 1 AND node_id = ? AND target_port = ? LIMIT 1').get(nodeId, oldInboundPort);
        if (activeRedirect) inboundPortWarning = ` У этого узла есть активное перенаправление на старый порт ${oldInboundPort}. Обнови правило на ${newInboundPort}.`;
      }
      const inboundForm = { ...req.body };
      const forcedSni = getNodeSniOverride(updatedNode);
      if (forcedSni) {
        inboundForm.inbound_sni = forcedSni;
        inboundForm.inbound_target = `${forcedSni}:443`;
      }
      await updateInboundBasicSettings(updatedNode, inboundForm);
    }

    const check = await checkNode(updatedNode);
    const checkSuffix = check.ok
      ? (isRemnawaveType ? ` Remnawave API отвечает${Number.isFinite(Number(check.providerInfo?.usersTotal)) ? `, пользователей: ${Number(check.providerInfo.usersTotal)}.` : '.'}` : '')
      : ` Проверка не прошла: ${check.error || 'узел офлайн'}.`;
    const editMsg = (normalizedNodeType === NODE_TYPE_3XUI && req.body.apply_inbound_settings === '1'
      ? 'Узел и параметры inbound обновлены.'
      : 'Узел обновлён.') + checkSuffix + inboundPortWarning;
    res.redirect('/nodes?tab=list&message=' + encodeURIComponent(editMsg));
  } catch (err) {
    res.redirect('/nodes/' + req.params.id + '/edit?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/nodes/:id/h1cloud-transport', requireAuth, async (req, res) => {
  const nodeId = Number(req.params.id);
  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
  if (!node) return res.redirect('/nodes?tab=list&error=' + encodeURIComponent('Узел не найден'));
  if (!isH1CloudNode(node)) return res.redirect(`/nodes/${nodeId}/edit?error=` + encodeURIComponent('Эта настройка доступна только для H1Cloud-узла.'));

  try {
    const config = normalizeH1CloudTransportForm(req.body, node);
    db.prepare(`
      UPDATE nodes SET
        h1cloud_xhttp_backend_path = ?,
        h1cloud_xhttp_method = ?,
        h1cloud_xhttp_alpn = ?,
        h1cloud_cdn_host = ?,
        h1cloud_cdn_sni = ?,
        h1cloud_cdn_port = ?,
        h1cloud_cdn_tag = ?,
        h1cloud_cdn_public_path = ?,
        h1cloud_reality_port = ?,
        h1cloud_reality_public_port = ?,
        h1cloud_reality_sni = ?,
        h1cloud_reality_dest = ?
      WHERE id = ?
    `).run(
      config.backendPath,
      config.method,
      config.alpn,
      config.cdnHost,
      config.cdnSni,
      config.cdnPort,
      config.cdnTag,
      config.cdnPublicPath,
      config.realityPort,
      config.realityPublicPort,
      config.realitySni,
      config.realityDest,
      nodeId
    );

    const updatedNode = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
    const action = String(req.body.action || 'save').trim();
    let message = 'Параметры H1Cloud сохранены в агрегаторе.';

    if (action === 'apply_xhttp_cdn') {
      await h1CloudConfigureXhttpCdn(updatedNode, config);
      message = 'XHTTP и XHTTP CDN применены через H1Cloud API. Сервер запросил безопасный перезапуск Xray.';
    } else if (action === 'apply_reality') {
      if (!config.realityPort) throw new Error('Для Reality укажи выделенный TCP-порт Xray.');
      const result = await h1CloudConfigureReality(updatedNode, config, true);
      message = result?.unsupported
        ? `Параметры Reality сохранены. Установленная версия H1Cloud пока не даёт менять Reality через API. Выполни в консоли: ${result.command}`
        : 'Параметры Reality применены через H1Cloud API.';
    } else if (action === 'reality_off') {
      const result = await h1CloudConfigureReality(updatedNode, config, false);
      message = result?.unsupported
        ? `Настройка сохранена. Для отключения Reality выполни в консоли H1Cloud: ${result.command}`
        : 'Reality отключён через H1Cloud API.';
    } else if (action === 'check') {
      const status = await h1CloudGetStatus(updatedNode, 12000);
      const transport = String(status?.transport || status?.config?.transport || 'не указан');
      message = `H1Cloud отвечает. Текущий transport: ${transport}.`;
    }

    res.redirect(`/nodes/${nodeId}/edit?message=` + encodeURIComponent(message));
  } catch (err) {
    res.redirect(`/nodes/${nodeId}/edit?error=` + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/nodes/:id/delete', requireAuth, (req, res) => {
  db.prepare('DELETE FROM nodes WHERE id = ?').run(Number(req.params.id));
  res.redirect('/nodes?tab=list&message=' + encodeURIComponent('Узел удалён'));
});

app.get('/clients', requireAuth, (req, res) => {
  try {
  const clientType = ['xray', 'wireguard', 'amneziawg', 'outline'].includes(String(req.query.type || '')) ? String(req.query.type) : 'xray';
  const q = String(req.query.q || '').trim();
  const qNorm = normalizeSearchText(q);
  const allClients = db.prepare(`
        SELECT c.*,
          (
            SELECT cn.remote_sub_url
            FROM client_nodes cn
            WHERE cn.client_id = c.id
              AND cn.remote_sub_url LIKE 'http%'
            ORDER BY cn.id ASC
            LIMIT 1
          ) AS source_sub_url,
          EXISTS (
            SELECT 1
            FROM client_nodes hcn
            JOIN nodes hn ON hn.id = hcn.node_id
            WHERE hcn.client_id = c.id
              AND hn.node_type = '${NODE_TYPE_H1CLOUD}'
              AND hn.enabled = 1
              AND hcn.enabled = 1
          ) AS has_h1cloud_sub
        FROM clients c
        ORDER BY c.id DESC
      `).all();
  // Reality/Xray clients are intentionally rendered as one local directory.
  // Search, node filtering and sorting are performed in the browser without a
  // page reload so the input never loses focus while the administrator types.
  const clients = clientType !== 'xray' ? [] : allClients;

  for (const client of clients) {
    client.node_limits = db.prepare(`
      SELECT
        n.id AS node_id,
        n.country_code,
        n.country_name_ru,
        n.country_flag,
        n.name,
        n.node_type,
        n.h1cloud_link_mode,
        n.h1cloud_link_types,
        n.h1cloud_fingerprint,
        n.label_suffix,
        n.inbound_id,
        cn.id AS client_node_id,
        cn.remote_email,
        cn.remote_uuid,
        cn.traffic_gb,
        cn.limit_ip,
        cn.upload_bytes,
        cn.download_bytes,
        cn.used_bytes,
        CASE WHEN cn.id IS NULL THEN 0 ELSE cn.enabled END AS enabled
      FROM nodes n
      LEFT JOIN client_nodes cn ON cn.node_id = n.id AND cn.client_id = ?
      WHERE n.enabled = 1
      ORDER BY ${nodeOrderSql('n')}
    `).all(client.id);

    for (const row of client.node_limits) {
      if (!row.client_node_id) continue;
      const usage = readUsageForClientNode({ id: row.node_id, inbound_id: row.inbound_id }, client, row);
      row.upload_bytes = usage.uploadBytes;
      row.download_bytes = usage.downloadBytes;
      row.used_bytes = usage.usedBytes;
      row.limit_bytes = toTotalGbBytes(row.traffic_gb || 0);
      row.remaining_bytes = Math.max(0, row.limit_bytes - row.used_bytes);
      updateClientNodeUsage(row.client_node_id, usage);
      if (isRemnawaveNode(row)) {
        row.transport_label = 'Remnawave · VLESS / XHTTP / TLS';
        row.transport_network = 'remnawave';
        continue;
      }
      if (isH1CloudNode(row)) {
        row.transport_label = `${getH1CloudLinkTypesLabel(row.h1cloud_link_types, row.h1cloud_link_mode)} · ${getH1CloudFingerprintLabel(row.h1cloud_fingerprint)}`;
        row.transport_network = 'h1cloud';
        continue;
      }
      const cachedInbound = getCachedInbound({ id: row.node_id, inbound_id: row.inbound_id });
      const transport = getInboundTransportInfo(cachedInbound);
      row.transport_label = cachedInbound ? transport.label : 'не загружено';
      row.transport_network = transport.network;
    }
  }

  const nodes = clientType === 'xray'
    ? db.prepare(`SELECT * FROM nodes WHERE enabled = 1 ORDER BY ${nodeOrderSql()}`).all().filter(isClientManagedNode)
    : [];
  const vpnData = vpnManager.listPageData({ tab: 'clients' });
  const vpnProtocolMatch = client => clientType === 'wireguard'
    ? client.protocol === 'wireguard'
    : clientType === 'amneziawg'
      ? String(client.protocol || '').startsWith('amneziawg')
      : clientType === 'outline'
        ? client.protocol === 'outline'
        : false;
  const vpnClientsAll = vpnData.clients || [];
  const vpnClients = clientType === 'xray' ? [] : vpnClientsAll.filter(vpnProtocolMatch).filter(client => {
    if (!qNorm) return true;
    return [client.name, client.service_name, client.protocol, client.host_name, client.address, client.remote_id]
      .some(value => normalizeSearchText(value).includes(qNorm));
  });
  const vpnServices = (vpnData.services || []).filter(service => service.install_status === 'installed').filter(service => {
    if (clientType === 'wireguard') return service.protocol === 'wireguard';
    if (clientType === 'amneziawg') return String(service.protocol || '').startsWith('amneziawg');
    if (clientType === 'outline') return service.protocol === 'outline';
    return false;
  });
  const vpnCounts = {
    wireguard: vpnClientsAll.filter(client => client.protocol === 'wireguard').length,
    amneziawg: vpnClientsAll.filter(client => String(client.protocol || '').startsWith('amneziawg')).length,
    outline: vpnClientsAll.filter(client => client.protocol === 'outline').length
  };

  recordTrafficSnapshot(false, 'passive');

  render(res, 'clients', {
    clients,
    nodes,
    clientType,
    xrayCount: allClients.length,
    vpnClients,
    vpnServices,
    vpnCounts,
    vpnAggregatorClients: vpnData.aggregatorClients || [],
    vpnProtocolLabels: vpnData.protocolLabels || {},
    message: req.query.message || '',
    error: req.query.error || '',
    baseUrl: getPublicSubBaseUrl(),
    q,
    nextLogin: getNextAutoLogin(),
    showSubLinks: getSetting('show_sub_links', '1') !== '0',
    showJsonLinks: getSetting('show_json_links', '1') !== '0',
    showHappLinks: getSetting('show_happ_links', '0') !== '0'
  });
  } catch (err) {
    console.error('Clients page failed:', err);
    res.status(500).send(`Ошибка открытия списка клиентов: ${htmlEscape(String(err.message || err))}<br><br>Проверь логи командой:<br><code>docker logs --tail=100 3xui-aggregator</code>`);
  }
});

app.post('/clients', requireAuth, async (req, res) => {
  try {
    const { login, limit_ip, duration_days, traffic_gb, comment } = req.body;
    let nodeIds = req.body.node_ids || [];

    if (!Array.isArray(nodeIds)) nodeIds = [nodeIds];
    nodeIds = uniqueList(nodeIds.map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0));
    if (!nodeIds.length) throw new Error('Нужно выбрать хотя бы один узел');

    const requestedLogin = String(login || '').trim();
    const remoteScan = await collectRemoteLoginsForNodes(nodeIds);
    const cleanLogin = requestedLogin || getNextAutoLogin(remoteScan.emails);
    const cleanDisplayName = cleanLogin;
    const cleanComment = String(comment || "").trim();

    const localOwner = findCaseInsensitiveClientOwner(cleanLogin, 0);
    if (localOwner) {
      throw new Error(`Логин ${cleanLogin} уже есть в агрегаторе как ${localOwner.login}. Регистр букв не учитывается.`);
    }

    // Для 3x-ui и Remnawave совпадение логина до создания локальной записи
    // означает риск UUID-конфликта. Существующего пользователя Remnawave нужно
    // сначала импортировать, чтобы Aggregator сохранил его VLESS UUID. Только
    // H1Cloud можно безопасно усыновить по имени через его API.
    const remoteConflicts = remoteScan.records.filter(item =>
      isSameLogin(item.email, cleanLogin) && !isH1CloudNode(item.node)
    );
    if (remoteConflicts.length) {
      const first = remoteConflicts[0];
      throw makeRemoteClientConflictError(first.node, cleanLogin, first.remote, { email: cleanLogin });
    }

    const cleanLimitIp = Math.max(0, Number(limit_ip ?? 1));
    const cleanDurationDays = Math.max(0, Number(duration_days || 0));
    const cleanTrafficGb = Math.max(0, Number(traffic_gb || 0));
    const totalGbBytes = toTotalGbBytes(cleanTrafficGb);

    const expiryTime = cleanDurationDays > 0
      ? expiryAtMidnightAfterDays(cleanDurationDays)
      : 0;

    const uuid = randomUUID();
    const sharedSubId = randomUUID().replace(/-/g, '').slice(0, 16);
    const subSlug = sharedSubId;

    const clientInfo = db.prepare(`
      INSERT INTO clients (login, display_name, uuid, sub_slug, duration_days, traffic_gb, limit_ip, expiry_time, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(cleanLogin, cleanDisplayName, uuid, subSlug, cleanDurationDays, cleanTrafficGb, cleanLimitIp, expiryTime, cleanComment);

    const clientId = clientInfo.lastInsertRowid;

    const createdClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);

    for (const nodeIdRaw of nodeIds) {
      const nodeId = Number(nodeIdRaw);
      const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);

      if (!node) throw new Error(`Узел ${nodeId} не найден`);

      const nodeTrafficRaw = req.body[`node_traffic_gb_${node.id}`];
      const nodeTrafficGb = String(nodeTrafficRaw || '').trim() === '' ? cleanTrafficGb : Math.max(0, Number(nodeTrafficRaw || 0));

      await ensureAggregatorClientOnNode(node, createdClient, {
        uuid,
        email: cleanLogin,
        subId: sharedSubId,
        traffic_gb: nodeTrafficGb,
        limit_ip: cleanLimitIp,
        expiry_time: expiryTime,
        duration_days: cleanDurationDays,
        enabled: true,
        comment: cleanComment,
        node_enabled: true
      });
    }

    res.redirect('/clients?message=' + encodeURIComponent('Клиент создан на выбранных узлах'));
  } catch (err) {
    res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/clients/import', requireAuth, async (req, res) => {
  try {
    const sourceNodeId = Number(req.body.node_id);
    const sourceNode = db.prepare('SELECT * FROM nodes WHERE id = ?').get(sourceNodeId);
    if (!sourceNode) throw new Error('Узел-источник не найден');

    const importMode = String(req.body.import_mode || 'local').trim().toLowerCase();
    const targetNodeIds = normalizePostedNodeIds(req.body.target_node_ids).filter(id => id !== sourceNodeId);
    if (importMode === 'selected' && !targetNodeIds.length) {
      throw new Error('Выбран режим синхронизации, но не отмечен ни один целевой узел. Узел-источник не перезаписывается.');
    }

    await finishLongPost(req, res, '/clients',
      operation => importMode === 'selected'
        ? syncClientsFromSourceNode(sourceNode, { targetNodeIds, operation })
        : refreshLocalClientsFromSourceNode(sourceNode, operation),
      result => importMode === 'selected'
        ? `Импорт завершён. Источник: ${result.totalSourceClients}, обработано шагов: ${result.completed || 0}, целей: ${result.targetNodes || 0}, новых: ${result.imported}, обновлено локально: ${result.updated}, создано на узлах: ${result.remoteCreated}, обновлено на узлах: ${result.remoteUpdated}, пропущено: ${result.skipped || 0}, связей: ${result.mappingsCreated}, ошибок: ${result.failed}`
        : `Локальный импорт завершён. Источник: ${result.totalSourceClients}, обработано: ${result.completed || 0}, новых: ${result.imported}, обновлено: ${result.updated}, связей: ${result.mappingsCreated}, ошибок: ${result.failed}`,
      { label: importMode === 'selected' ? 'Импорт и выбранная синхронизация' : 'Локальный импорт клиентов' }
    );
  } catch (err) {
    res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/clients/sync-nodes', requireAuth, async (req, res) => {
  try {
    const nodeIds = normalizePostedNodeIds(req.body.node_ids);
    if (!nodeIds.length) throw new Error('Выбери узлы, которые действительно нужно синхронизировать. Автоматический выбор всех узлов отключён.');
    await finishLongPost(req, res, '/clients',
      operation => syncAggregatorClientsToSelectedNodes(nodeIds, operation),
      result => `Синхронизация выбранных узлов завершена. Узлов: ${result.nodes}, клиентов: ${result.totalClients}, обработано: ${result.completed || 0}, пропущено: ${result.skipped || 0}, создано: ${result.remoteCreated}, обновлено: ${result.remoteUpdated}, связей: ${result.mappingsCreated}, ошибок: ${result.failed}`,
      { label: 'Синхронизация выбранных узлов' }
    );
  } catch (err) {
    res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/clients/create-missing-on-node', requireAuth, async (req, res) => {
  try {
    const nodeId = Number(req.body.node_id || 0);
    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
    if (!node) throw new Error('Выбранный узел не найден');
    const nodeName = getNodePublicName(node);
    await finishLongPost(req, res, `/clients?node_id=${encodeURIComponent(nodeId)}`,
      operation => createExistingClientsOnNode(node, operation),
      result => `Добавление отсутствующих клиентов на ${nodeName} завершено. Всего: ${result.totalClients}, проверено: ${result.completed || 0}, создано: ${result.remoteCreated}, уже существовало и пропущено: ${result.skippedExisting}, новых связей: ${result.mappingsCreated}, конфликтов UUID: ${result.conflicts}, не запускалось после потери связи: ${result.skippedAfterFailure || 0}, ошибок: ${result.failed}`,
      { label: `Добавление отсутствующих клиентов: ${nodeName}` }
    );
  } catch (err) {
    res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/clients/apply-to-node', requireAuth, async (req, res) => {
  try {
    let ids = req.body.client_ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids = uniqueList(ids.map(Number).filter(id => Number.isInteger(id) && id > 0));
    if (!ids.length) throw new Error('Сначала выберите хотя бы одного клиента. Массовое применение ко всем без явного выбора отключено.');

    const nodeId = Number(req.body.node_id);
    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
    if (!node) throw new Error('Узел не найден');

    const nodeName = getNodePublicName(node);
    await finishLongPost(req, res, '/clients',
      operation => applyNodeLimitsToSelectedClients(node, ids, { traffic_gb: req.body.traffic_gb, limit_ip: req.body.limit_ip }, operation),
      result => `Выбранные клиенты применены к узлу ${nodeName}. Запрошено: ${result.requested}, найдено: ${result.totalClients}, обработано: ${result.completed || 0}, пропущено: ${result.skipped || 0}, создано: ${result.remoteCreated}, обновлено: ${result.remoteUpdated}, новых связей: ${result.mappingsCreated}, уже отсутствовали локально: ${result.missingClients || 0}, ошибок: ${result.failed}`,
      { label: `Применение выбранных клиентов: ${nodeName}` }
    );
  } catch (err) {
    res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});


app.post('/clients/refresh-subscriptions', requireAuth, async (req, res) => {
  try {
    const sourceNodeId = Number(req.body.node_id);
    const sourceNode = db.prepare('SELECT * FROM nodes WHERE id = ?').get(sourceNodeId);

    if (!sourceNode) throw new Error('Узел не найден');

    await finishLongPost(req, res, '/clients',
      operation => refreshLocalClientsFromSourceNode(sourceNode, operation),
      result => `Обновление из узла завершено. Источник: ${result.totalSourceClients}, обработано: ${result.completed || 0}, новых: ${result.imported}, обновлено: ${result.updated}, связей: ${result.mappingsCreated}, ошибок: ${result.failed}`,
      { label: `Обновление из ${getNodePublicName(sourceNode)}` }
    );
  } catch (err) {
    res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/clients/delete-all', requireAuth, async (req, res) => {
  try {
    if (String(req.body.delete_all_confirmation || '').trim().toUpperCase() !== 'YES') {
      throw new Error('Удаление всех клиентов отменено: требуется подтверждение YES');
    }
    const deleteMode = String(req.body.delete_mode || 'aggregator');
    const clients = db.prepare('SELECT * FROM clients ORDER BY id ASC').all();
    const probeCache = new Map();
    const failures = [];
    let deleted = 0;
    const deletionStats = newClientDeletionStats();
    const results = await runWithConcurrency(clients, deleteMode === 'aggregator' ? 10 : 3, async client => {
      const stats = await deleteClientEverywhere(client, deleteMode, { probeCache });
      return { login: client.login || `клиент #${client.id}`, stats };
    });
    results.forEach(result => {
      if (result?.status === 'fulfilled') {
        deleted += 1;
        mergeClientDeletionStats(deletionStats, result.value?.stats);
      } else failures.push(String(result?.reason?.message || result?.reason || 'ошибка удаления'));
    });

    const qs = new URLSearchParams({ message: `Удалено клиентов: ${deleted}${clientDeletionStatsSuffix(deletionStats)}` });
    if (failures.length) qs.set('error', `Не удалено клиентов: ${failures.length}. ${failures.slice(0, 4).join(' | ')}`);
    res.redirect('/clients?' + qs.toString());
  } catch (err) {
    res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/clients/bulk-remove-node', requireAuth, async (req, res) => {
  try {
    let ids = req.body.client_ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids = uniqueList(ids.map(Number).filter(id => Number.isInteger(id) && id > 0));
    if (!ids.length) throw new Error('Сначала выберите хотя бы одного клиента');

    if (String(req.body.bulk_confirmation || '').trim().toUpperCase() !== 'CONFIRMED') {
      throw new Error('Удаление из узла отменено: подтверждение не получено');
    }

    const nodeId = Number(req.body.bulk_node_id || 0);
    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
    if (!node) throw new Error('Выбранный узел не найден');

    const filterNodeId = Number(req.body.bulk_filter_node_id || 0);
    if (filterNodeId && filterNodeId !== nodeId) {
      throw new Error('Фильтр узла изменился перед отправкой. Повторно выберите узел и клиентов.');
    }

    const nodeTitle = getNodePublicName(node) || node.name || `узел #${node.id}`;
    await finishLongPost(req, res, `/clients?node_id=${encodeURIComponent(nodeId)}`,
      operation => removeSelectedClientsFromNode(node, ids, operation),
      result => `Удаление выбранных клиентов из узла ${nodeTitle} завершено. Запрошено: ${result.requested}, обработано: ${result.completed || 0}, удалено с выбранного узла и из локальных связей: ${result.removed}, не были назначены: ${result.notAssigned}, уже отсутствовали локально: ${result.missingClients}, не запускалось после потери связи: ${result.skippedAfterFailure || 0}, ошибок: ${result.failed}`,
      { label: `Удаление клиентов из узла: ${nodeTitle}` }
    );
  } catch (err) {
    res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/clients/bulk-delete', requireAuth, async (req, res) => {
  try {
    let ids = req.body.client_ids || [];
    const deleteMode = String(req.body.delete_mode || 'aggregator');

    if (!Array.isArray(ids)) ids = [ids];
    ids = uniqueList(ids.map(Number).filter(id => Number.isInteger(id) && id > 0));
    if (!ids.length) throw new Error('Сначала выберите хотя бы одного клиента');

    let deleted = 0;
    let missing = 0;
    const failures = [];
    const deletionStats = newClientDeletionStats();
    const probeCache = new Map();
    const concurrency = deleteMode === 'aggregator' ? 10 : 3;
    const results = await runWithConcurrency(ids, concurrency, async id => {
      const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
      if (!client) return { kind: 'missing' };
      try {
        const stats = await deleteClientEverywhere(client, deleteMode, { probeCache });
        return { kind: 'deleted', login: client.login, stats };
      } catch (err) {
        throw new Error(`${client.login || `клиент #${client.id}`}: ${String(err?.message || err || 'неизвестная ошибка')}`);
      }
    });

    results.forEach(result => {
      if (result?.status === 'rejected') failures.push(String(result.reason?.message || result.reason || 'неизвестная ошибка'));
      else if (result?.value?.kind === 'deleted') {
        deleted += 1;
        mergeClientDeletionStats(deletionStats, result.value.stats);
      }
      else if (result?.value?.kind === 'missing') missing += 1;
    });

    const qs = new URLSearchParams({ message: `Удалено клиентов: ${deleted}${missing ? `. Уже отсутствовали: ${missing}` : ''}${clientDeletionStatsSuffix(deletionStats)}` });
    if (failures.length) {
      qs.set('error', `Не удалено клиентов: ${failures.length}. Ошибка возникла на доступных узлах: ${failures.slice(0, 4).join(' | ')}`);
    }
    res.redirect('/clients?' + qs.toString());
  } catch (err) {
    res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/clients/:id/sync', requireAuth, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    let nodeIds = req.body.node_ids || [];

    if (!Array.isArray(nodeIds)) nodeIds = [nodeIds];
    nodeIds = uniqueList(nodeIds.map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0));
    if (!nodeIds.length) throw new Error('Нужно выбрать хотя бы один узел');

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client) throw new Error('Клиент не найден');

    const mappings = db.prepare(`
      SELECT cn.*
      FROM client_nodes cn
      JOIN nodes n ON n.id = cn.node_id
      WHERE cn.client_id = ?
      ORDER BY ${nodeOrderSql('n')}, cn.id ASC
    `).all(clientId);

    if (!mappings.length) throw new Error('У клиента нет исходного узла');

    const sourceMap = mappings[0];
    const clientEmail = sourceMap.remote_email || client.login;
    const subId = client.sub_slug || randomUUID().replace(/-/g, '').slice(0, 16);

    for (const nodeIdRaw of nodeIds) {
      const nodeId = Number(nodeIdRaw);

      const alreadyExists = db.prepare(`
        SELECT id FROM client_nodes
        WHERE client_id = ? AND node_id = ?
      `).get(clientId, nodeId);

      if (alreadyExists) continue;

      const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
      if (!node) continue;

      await ensureAggregatorClientOnNode(node, client, {
        uuid: client.uuid,
        email: clientEmail,
        subId,
        limit_ip: client.limit_ip,
        duration_days: client.duration_days,
        traffic_gb: client.traffic_gb,
        expiry_time: client.expiry_time,
        enabled: client.enabled !== 0,
        node_enabled: true,
        comment: client.comment || ''
      });
    }

    res.redirect(`/clients/${clientId}`);
  } catch (err) {
    res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});


app.get('/clients/:id/summary.json', requireAuth, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Клиент не найден' });

    const nowMs = Date.now();
    const expiryMs = normalizeEpochMillis(client.expiry_time || 0);
    let daysLeft = null;
    if (expiryMs > 0) daysLeft = Math.max(0, Math.ceil((expiryMs - nowMs) / 86400000));
    const enabled = client.enabled !== 0;
    let statusKey = 'online';
    let statusLabel = 'Включён';
    let statusText = 'Клиент активен и может подключаться.';
    if (!enabled) {
      statusKey = 'offline';
      statusLabel = 'Отключён';
      statusText = 'Клиент отключён и не может подключаться.';
    } else if (daysLeft === 0) {
      statusKey = 'expired';
      statusLabel = 'Срок истёк';
      statusText = 'Срок доступа закончился. Продли доступ или отключи клиента на узлах.';
    } else if (daysLeft !== null && daysLeft <= 7) {
      statusKey = 'warning';
      statusLabel = 'Скоро закончится';
      statusText = `Срок доступа скоро закончится: осталось ${daysLeft} дн.`;
    }

    const mappings = db.prepare(`
      SELECT
        cn.*,
        cn.id AS client_node_id,
        n.id AS real_node_id,
        n.enabled AS node_enabled,
        n.name,
        n.node_type,
        n.country_code,
        n.country_name_ru,
        n.country_flag,
        n.label_suffix,
        n.inbound_id,
        n.last_status
      FROM client_nodes cn
      LEFT JOIN nodes n ON n.id = cn.node_id
      WHERE cn.client_id = ?
      ORDER BY ${nodeOrderSql('n')}, cn.id ASC
    `).all(client.id);
    const nodes = mappings
      .filter(row => row.client_node_id && row.real_node_id && Number(row.enabled) !== 0 && Number(row.node_enabled) !== 0)
      .filter(row => String(row.last_status || '').toLowerCase() !== 'offline')
      .map(row => {
        const displayName = String(getNodeDisplayName(row) || '').trim();
        const baseName = String(row.country_name_ru || row.name || '').trim();
        const suffix = String(row.label_suffix || '').trim().replace(/^\/+\s*/, '').trim();
        let cleanName = displayName && displayName !== 'Узел' ? displayName : baseName;
        cleanName = String(cleanName || '').replace(/^🌐\s*/u, '').trim();
        if (!cleanName || cleanName === 'Узел') return null;
        if (suffix && !cleanName.includes(suffix)) cleanName = /^\d+$/.test(suffix) ? `${cleanName}-${suffix}` : `${cleanName} / ${suffix}`;
        return {
          id: row.node_id,
          name: cleanName,
          title: cleanName,
          nodeType: String(row.node_type || '3xui'),
          countryCode: String(row.country_code || getCountryCodeByName(row.country_name_ru || row.name) || '').toLowerCase(),
          countryName: row.country_name_ru || '',
          countryFlag: getNodeFlag(row),
          inboundId: row.inbound_id || '',
          enabled: Number(row.enabled) !== 0,
          limitIp: row.limit_ip ?? null,
          trafficGb: row.traffic_gb || 0
        };
      })
      .filter(Boolean);

    const title = String(client.display_name || client.login || '').trim();
    const login = String(client.login || '').trim();
    const comment = String(client.comment || '').trim();
    const secondary = comment && comment !== title && comment !== login ? comment : (title !== login ? login : '');
    const realtime = await getClientRealtimeConnectivity(client, mappings);
    const showSubLinksInPanel = getSetting('show_sub_links', '1') !== '0';
    const showJsonLinksInPanel = getSetting('show_json_links', '1') !== '0';
    const showHappLinksInPanel = getSetting('show_happ_links', '0') !== '0';
    const usedBytes = mappings.reduce((sum, row) => sum + Math.max(0, Number(row.used_bytes || 0)), 0);

    res.json({
      ok: true,
      client: {
        id: client.id,
        title,
        login,
        uuid: client.uuid || '',
        comment: secondary || comment || '',
        createdAt: client.created_at || '',
        createdText: client.created_at ? new Date(client.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
        lastOnlineAt: realtime.lastOnlineAt || '',
        lastOnlineText: formatRuDateTime(realtime.lastOnlineAt, 'Нет данных'),
        connectedNow: realtime.connected === true,
        connectedText: realtime.connected === true ? 'Да' : 'Нет',
        statusKey,
        statusLabel,
        statusText,
        expiryText: expiryMs > 0 ? new Date(expiryMs).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '∞',
        daysLeft: daysLeft === null ? '∞' : daysLeft,
        durationDays: client.duration_days || 0,
        trafficGb: client.traffic_gb || 0,
        trafficUsedBytes: usedBytes,
        trafficUsedText: formatTrafficBytes(usedBytes),
        limitIp: client.limit_ip ?? 0,
        nodeCount: nodes.length,
        nodes: nodes.slice(0, 12),
        links: {
          editor: `/clients?q=${encodeURIComponent(login)}&edit=${client.id}`,
          search: `/clients?q=${encodeURIComponent(login)}`,
          open: `/open/${client.sub_slug}`,
          json: showJsonLinksInPanel ? buildPublicJsonUrl(client.sub_slug) : '',
          sub: showSubLinksInPanel ? buildPublicSubUrl(client.sub_slug) : '',
          happ: showHappLinksInPanel ? buildPublicHappUrl(client.sub_slug) : ''
        }
      }
    });
  } catch (err) {
    console.error('Client summary error:', err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get('/clients/:id', requireAuth, async (req, res) => {
  try {
    const client = db.prepare('SELECT id, login FROM clients WHERE id = ?').get(Number(req.params.id));
    if (!client) return res.status(404).send('Client not found');
    return res.redirect('/clients?' + new URLSearchParams({ q: String(client.login || ''), edit: String(client.id) }).toString());
  } catch (err) {
    console.error('Client detail redirect error:', err);
    return res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/clients/:id/edit', requireAuth, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client) throw new Error('Клиент не найден');

    const login = String(req.body.login || '').trim() || client.login;
    const displayName = String(req.body.display_name || login).trim() || login;
    const limitIp = Math.max(0, Number(req.body.limit_ip ?? client.limit_ip ?? 1));
    const rawDurationDays = String(req.body.duration_days ?? '').trim();
    const durationWasChanged = rawDurationDays !== '';
    const durationDays = durationWasChanged
      ? Math.max(0, Number(rawDurationDays || 0))
      : Math.max(0, Number(client.duration_days || 0));
    const trafficGb = Math.max(0, Number(req.body.traffic_gb || 0));
    const comment = String(req.body.comment || "").trim();
    const expiryTime = durationWasChanged
      ? (durationDays > 0 ? expiryAtMidnightAfterDays(durationDays) : 0)
      : Math.max(0, Number(client.expiry_time || 0));

    const h1BaseChangedFields = [];
    if (!sameText(login, client.login)) h1BaseChangedFields.push('email');
    if (Number(limitIp) !== Number(client.limit_ip ?? 1)) h1BaseChangedFields.push('limit_ip');
    if (durationWasChanged && (Number(durationDays) !== Number(client.duration_days || 0) || Number(expiryTime) !== Number(client.expiry_time || 0))) {
      h1BaseChangedFields.push('expiry_time');
    }
    if (String(comment || '').trim() !== String(client.comment || '').trim()) h1BaseChangedFields.push('comment');

    const loginOwner = findCaseInsensitiveClientOwner(login, clientId);
    if (loginOwner) throw new Error(`Такой логин уже существует: ${loginOwner.login}. Регистр букв не учитывается.`);

    db.prepare(`
      UPDATE clients
      SET login = ?, display_name = ?, limit_ip = ?, duration_days = ?, traffic_gb = ?, expiry_time = ?, comment = ?
      WHERE id = ?
    `).run(login, displayName, limitIp, durationDays, trafficGb, expiryTime, comment, clientId);

    const updatedClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    const nodesForEdit = db.prepare(`SELECT * FROM nodes WHERE enabled = 1 ORDER BY ${nodeOrderSql()}`).all().filter(isClientManagedNode);
    const nodeErrors = [];

    for (const node of nodesForEdit) {
      const raw = req.body[`node_traffic_gb_${node.id}`];
      const nodeTrafficGb = String(raw || '').trim() === '' ? trafficGb : Math.max(0, Number(raw || 0));
      const nodeEnabled = req.body[`node_enabled_${node.id}`] === '1';
      const map = db.prepare('SELECT * FROM client_nodes WHERE client_id = ? AND node_id = ?').get(clientId, node.id);

      try {
        if (map) {
          const h1UpdateFields = [...h1BaseChangedFields];
          if (Number(nodeTrafficGb) !== Number(getClientNodeEffectiveTrafficGb(map, client, client.traffic_gb || 0))) h1UpdateFields.push('traffic_gb');
          if (Boolean(nodeEnabled) !== Boolean(map.enabled !== 0)) h1UpdateFields.push('node_enabled');

          await updateClientOnNode(node, map, updatedClient, {
            email: login,
            limit_ip: limitIp,
            duration_days: durationDays,
            traffic_gb: nodeTrafficGb,
            expiry_time: expiryTime,
            comment,
            node_enabled: nodeEnabled,
            h1cloud_update_fields: uniqueList(h1UpdateFields)
          });
          continue;
        }

        if (!nodeEnabled) continue;

        await ensureAggregatorClientOnNode(node, updatedClient, {
          uuid: updatedClient.uuid,
          email: login,
          subId: updatedClient.sub_slug || randomUUID().replace(/-/g, '').slice(0, 16),
          limit_ip: limitIp,
          duration_days: durationDays,
          traffic_gb: nodeTrafficGb,
          expiry_time: expiryTime,
          comment,
          node_enabled: true,
          enabled: updatedClient.enabled !== 0
        });
      } catch (err) {
        const nodeTitle = getNodePublicName(node);
        const errText = `${nodeTitle}: ${err.message || err}`;
        nodeErrors.push(errText);
        console.error('Update client node failed:', errText);
      }
    }

    const message = nodeErrors.length
      ? 'Клиент обновлён локально. Часть узлов не приняла изменения.'
      : 'Клиент обновлён';
    const errorText = nodeErrors.length ? nodeErrors.slice(0, 3).join(' | ') : '';
    const back = String(req.body.back || '/clients');
    if (back.startsWith('/clients')) {
      return res.redirect(appendMessageToBackUrl(back, message, errorText, '/clients'));
    }
    const qs = new URLSearchParams({ message });
    if (errorText) qs.set('error', errorText);
    res.redirect('/clients/' + clientId + '?' + qs.toString());
  } catch (err) {
    const back = String(req.body.back || '/clients');
    if (back.startsWith('/clients')) {
      return res.redirect(appendMessageToBackUrl(back, '', String(err.message || err), '/clients'));
    }
    res.redirect('/clients/' + req.params.id + '?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/clients/:id/extend', requireAuth, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const days = Math.max(1, Number(req.body.days || 30));
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client) throw new Error('Клиент не найден');

    const base = client.expiry_time && client.expiry_time > Date.now() ? client.expiry_time : Date.now();
    const expiryTime = expiryAtMidnightAfterDays(days, base);
    const durationDays = Math.max(0, Number(client.duration_days || days));

    db.prepare('UPDATE clients SET expiry_time = ?, duration_days = ? WHERE id = ?').run(expiryTime, durationDays, clientId);

    const updatedClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    await updateClientEverywhere(updatedClient, { expiry_time: expiryTime, duration_days: durationDays });

    const back = String(req.body.back || '/dashboard');
    if (back.startsWith('/clients')) {
      return res.redirect(appendMessageToBackUrl(back, 'Клиент продлён', '', '/clients'));
    }
    if (back.includes(`/clients/${clientId}`)) {
      return res.redirect(`/clients/${clientId}?message=${encodeURIComponent('Клиент продлён')}`);
    }
    res.redirect('/dashboard?message=' + encodeURIComponent('Клиент продлён'));
  } catch (err) {
    const back = String(req.body.back || '/dashboard');
    if (back.startsWith('/clients')) {
      return res.redirect(appendMessageToBackUrl(back, '', String(err.message || err), '/clients'));
    }
    res.redirect('/dashboard?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/clients/:id/toggle', requireAuth, async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client) throw new Error('Клиент не найден');

    const enabled = client.enabled === 1 ? 0 : 1;
    db.prepare('UPDATE clients SET enabled = ? WHERE id = ?').run(enabled, clientId);

    const updatedClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    await updateClientEverywhere(updatedClient, { enabled: Boolean(enabled) });

    const msg = enabled ? 'Клиент включён' : 'Клиент отключён';
    const back = String(req.body.back || '');
    if (back.startsWith('/clients')) return res.redirect(appendMessageToBackUrl(back, msg, '', '/clients'));
    if (back.includes(`/clients/${clientId}`)) {
      return res.redirect(`/clients/${clientId}?message=${encodeURIComponent(msg)}`);
    }
    res.redirect(`/clients?message=${encodeURIComponent(msg)}`);
  } catch (err) {
    res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/clients/:id/delete', requireAuth, async (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(req.params.id));

    if (!client) {
      return res.redirect('/clients?error=' + encodeURIComponent('Клиент не найден'));
    }

    const deleteMode = String(req.body.delete_mode || 'all');

    const deletionStats = await deleteClientEverywhere(client, deleteMode);

    res.redirect('/clients?message=' + encodeURIComponent(`Клиент удалён${clientDeletionStatsSuffix(deletionStats)}`));
  } catch (err) {
    res.redirect('/clients?error=' + encodeURIComponent(String(err.message || err)));
  }
});


function buildOfficialHappTextBody(subscriptionName, subscriptionUpdateIntervalHours, subscriptionUserInfo, lines, clientRow = null) {
  const support = getEffectiveSubscriptionSupportMeta(clientRow);
  const happInfoText = buildHappInfoText(clientRow, subscriptionUserInfo);
  const announceText = buildHappAnnounceText(support, happInfoText);
  const buttonText = getHappInfoButtonText();
  const buttonLink = getHappInfoButtonLink();

  const routingLink = buildHappRoutingLink(subscriptionName);
  const profileLines = [
    ...(routingLink ? [routingLink, `#routing: ${routingLink}`] : []),
    ...Object.entries(getHappSubscriptionProfileHeaderMap(subscriptionName, subscriptionUpdateIntervalHours)).map(([key, value]) => `#${key}: ${value}`),
    `#subscription-update-interval: ${subscriptionUpdateIntervalHours}`,
    ...(subscriptionUserInfo ? [`#subscription-userinfo: ${subscriptionUserInfo}`] : []),
    ...(support.url ? [`#support-url: ${support.url}`, `#profile-web-page-url: ${support.url}`] : []),
    ...(announceText ? [`#announce: base64:${Buffer.from(announceText, 'utf8').toString('base64')}`] : []),
    ...(happInfoText && shouldEmitHappSubInfoBlock() ? [
      `#sub-info-text: base64:${Buffer.from(happInfoText, 'utf8').toString('base64')}`,
      `#sub-info-color: ${getHappInfoColor()}`,
      ...(buttonText && buttonLink ? [
        `#sub-info-button-text: base64:${Buffer.from(buttonText, 'utf8').toString('base64')}`,
        `#sub-info-button-link: ${buttonLink}`
      ] : [])
    ] : shouldClearHappSubInfoBlock(happInfoText) ? [
      '#sub-info-text:',
      '#sub-info-color:',
      '#sub-info-button-text:',
      '#sub-info-button-link:'
    ] : [])
  ];

  const controlLines = isHappAppControlsEnabled()
    ? [...profileLines, ...buildHappAppControlBodyLines()]
    : profileLines;

  return [
    ...controlLines,
    ...lines
  ].join('\n');
}

app.get('/happ/:slug', async (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE sub_slug = ? AND enabled = 1').get(req.params.slug);

  if (!client) {
    return res.status(404).send('Subscription not found');
  }

  if (maybeRedirectToCurrentSubscriptionRevision(req, res)) return;

  await enforceExpiredClientRemoteState(client);

  const entries = await buildSubscriptionEntries(client, true);
  const lines = entries.map(e => e.line);
  const subscriptionName = getSetting('subscription_name', DEFAULT_SUBSCRIPTION_NAME);
  const subscriptionUserInfo = buildSubscriptionUserInfo(entries, client);
  const subscriptionUpdateIntervalHours = getSubscriptionUpdateIntervalHours();

  setSubscriptionNoCacheHeaders(res, subscriptionName, 'txt');
  setSubscriptionUserInfoHeaders(res, subscriptionUserInfo);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  // /happ already embeds Happ profile metadata in the text body.
  // Do not duplicate announce/sub-info in HTTP headers: Happ Desktop may show
  // both sources as separate blocks.
  applyHappSubscriptionProfileHeaders(res, subscriptionName, subscriptionUpdateIntervalHours, client, subscriptionUserInfo, { includeTextBlocks: false });
  applyHappAppControlHeaders(res);

  res.send(buildOfficialHappTextBody(subscriptionName, subscriptionUpdateIntervalHours, subscriptionUserInfo, lines, client));
});

app.get('/sub/:slug', async (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE sub_slug = ? AND enabled = 1').get(req.params.slug);

  if (!client) {
    return res.status(404).send('Subscription not found');
  }

  if (maybeRedirectToCurrentSubscriptionRevision(req, res)) return;

  await enforceExpiredClientRemoteState(client);

  const entries = await buildSubscriptionEntries(client, true);
  const lines = entries.map(e => e.line);
  const subscriptionName = getSetting('subscription_name', DEFAULT_SUBSCRIPTION_NAME);
  const subscriptionUserInfo = buildSubscriptionUserInfo(entries, client);

  const subscriptionUpdateIntervalHours = getSubscriptionUpdateIntervalHours();

  setSubscriptionNoCacheHeaders(res, subscriptionName, 'txt');
  setSubscriptionUserInfoHeaders(res, subscriptionUserInfo);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  // /sub also embeds Happ profile metadata in the text body.
  // Do not duplicate announce/sub-info in HTTP headers: Happ Desktop may show
  // both sources as separate blocks.
  applyHappSubscriptionProfileHeaders(res, subscriptionName, subscriptionUpdateIntervalHours, client, subscriptionUserInfo, { includeTextBlocks: false });
  applyHappAppControlHeaders(res);

  res.send(buildOfficialHappTextBody(subscriptionName, subscriptionUpdateIntervalHours, subscriptionUserInfo, lines, client));
});


app.get('/sub-plain/:slug', async (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE sub_slug = ? AND enabled = 1').get(req.params.slug);

  if (!client) {
    return res.status(404).send('Subscription not found');
  }

  if (maybeRedirectToCurrentSubscriptionRevision(req, res)) return;

  await enforceExpiredClientRemoteState(client);

  const entries = await buildSubscriptionEntries(client, true);
  const lines = entries
    .map(entry => String(entry?.line || '').trim())
    .filter(line => /^(?:vless|vmess|trojan|ss|socks|hysteria2?|hy2|tuic|wireguard):\/\//i.test(line));
  const subscriptionName = getSetting('subscription_name', DEFAULT_SUBSCRIPTION_NAME);
  const subscriptionUserInfo = buildSubscriptionUserInfo(entries, client);

  setSubscriptionNoCacheHeaders(res, subscriptionName, 'txt');
  setSubscriptionUserInfoHeaders(res, subscriptionUserInfo);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(lines.join('\n'));
});



function getHappFragmentationConfig() {
  return {
    enabled: isHappSettingEnabled('happ_fragmentation_enabled', '0'),
    packets: 'tlshello',
    length: '50-100',
    interval: '10-20',
    maxSplit: '100-200'
  };
}

function getHappNoisesConfig() {
  return {
    enabled: isHappSettingEnabled('happ_noises_enabled', '0'),
    type: 'rand',
    packet: '10-20',
    delay: '10-16',
    applyTo: 'ip'
  };
}

function isJsonMuxEnabled() {
  return getSetting('json_mux_enabled', '0') === '1';
}

function isJsonSniffingEnabled() {
  return getSetting('json_sniffing_enabled', '0') === '1';
}

function getJsonMuxConfig() {
  return {
    enabled: true,
    concurrency: 100,
    xudpConcurrency: 200,
    xudpProxyUDP443: 'skip'
  };
}

function getHappMuxConfig() {
  const enabled = isHappSettingEnabled('happ_mux_enabled', '0');
  return {
    enabled,
    concurrency: enabled ? 100 : -1,
    xudpConcurrency: enabled ? 200 : 8,
    xudpProxyUDP443: enabled ? 'skip' : ''
  };
}

function getHappJsonControls() {
  if (!isHappAppControlsEnabled()) {
    return { enabled: false };
  }

  return {
    enabled: true,
    pingType: isHappSettingEnabled('happ_ping_tcp', '1') ? 'tcp' : 'url',
    pingResult: isHappSettingEnabled('happ_ping_result_icon', '1') ? 'icon' : 'latency',
    subscriptionUpdateIntervalHours: getSubscriptionUpdateIntervalHours(),
    subscriptionClientAutoUpdateEnabled: getSetting('subscription_client_auto_update_enabled', '1') !== '0',
    autoUpdate: getHappBehaviorOptions().autoUpdate,
    updateOnLaunch: getHappBehaviorOptions().updateOnOpen,
    connectOnLaunch: false,
    forceApplyOnUpdate: getHappBehaviorOptions().forceApplyOnUpdate,
    pingOnOpen: getHappBehaviorOptions().pingOnOpen,
    subscriptionsCollapse: getHappBehaviorOptions().subscriptionsCollapse,
    expandNow: getHappBehaviorOptions().expandNow,
    fragmentation: getHappFragmentationConfig(),
    noises: getHappNoisesConfig(),
    mux: getHappMuxConfig(),
    noLimitMode: getHappNoLimitMode()
  };
}

function applyHappOutboundControls(outbound) {
  if (!outbound) return outbound;

  // This controls the generated Xray JSON itself and is independent from Happ
  // Keep disabled by default because MUX often breaks
  // VLESS/REALITY and newer transports on some clients.
  if (isJsonMuxEnabled()) {
    outbound.mux = getJsonMuxConfig();
  } else {
    delete outbound.mux;
  }
  outbound.streamSettings = outbound.streamSettings || {};

  return outbound;
}

function parseVlessLineToOutbound(line, index = 0, options = {}) {
  const url = new URL(line);
  const q = url.searchParams;
  const tag = index === 0 ? 'proxy' : `proxy-${index + 1}`;
  const network = q.get('type') || 'tcp';
  const security = String(q.get('security') || 'none').trim().toLowerCase();
  const flow = q.get('flow') || '';
  const fp = q.get('fp') || 'chrome';
  const pbk = q.get('pbk') || '';
  const sni = q.get('sni') || '';
  const sid = q.get('sid') || '';
  const spx = q.get('spx') || '/';

  const user = {
    id: decodeURIComponent(url.username || ''),
    encryption: q.get('encryption') || 'none',
    level: 8,
    security: 'auto'
  };

  const normalizedNetwork = normalizeInboundNetwork(network || 'raw');
  // Vision is valid only for VLESS TCP+REALITY. H1Cloud XHTTP links must not
  // inherit it when converted to an Xray JSON outbound.
  if (flow && normalizedNetwork === 'raw' && security === 'reality') user.flow = flow;

  const streamSettings = {
    network: toXrayInboundNetwork(normalizedNetwork),
    security: security || 'none'
  };

  if (normalizedNetwork === 'xhttp') {
    const xhttpSettings = {
      host: q.get('host') || '',
      mode: q.get('mode') || 'auto',
      path: q.get('path') || '/'
    };

    // The official H1Cloud XHTTP links carry the transport tuning in the
    // URL-encoded `extra` JSON object. Preserve it in Xray's native location.
    const extra = parseH1CloudXhttpExtra(q.get('extra'), {
      disablePaddingObfs: options.preserveXhttpExtra === true ? false : true,
      normalizeSessionAliases: options.preserveXhttpExtra === true ? false : true
    });
    if (extra) xhttpSettings.extra = extra;

    // Also support links that publish these fields outside of `extra`.
    // Xray v26.6.22 / 3x-ui v3.4.0 added sessionID table/length controls.
    for (const key of ['sessionIDPlacement', 'sessionIDKey', 'sessionIDTable', 'sessionIDLength']) {
      const value = q.get(key);
      if (value !== null && value !== '') xhttpSettings[key] = /^-?\d+$/.test(value) && key === 'sessionIDLength' ? Number(value) : value;
    }
    for (const [key, type] of [
      ['scMaxConcurrentPosts', 'number'],
      ['scMaxEachPostBytes', 'range'],
      ['scMinPostsIntervalMs', 'range'],
      ['scMaxBufferedPosts', 'number'],
      ['scStreamUpServerSecs', 'range'],
      ['xPaddingBytes', 'range'],
      ['uplinkChunkSize', 'range']
    ]) {
      const value = q.get(key);
      if (!value) continue;
      if (type === 'number' && /^-?\d+$/.test(value)) xhttpSettings[key] = Number(value);
      else xhttpSettings[key] = value;
    }

    streamSettings.xhttpSettings = xhttpSettings;
    const dialerProxy = q.get('dialerProxy') || '';
    if (dialerProxy) streamSettings.sockopt = { dialerProxy };
  } else if (normalizedNetwork === 'ws') {
    streamSettings.wsSettings = {
      path: q.get('path') || '/',
      host: q.get('host') || '',
      headers: q.get('host') ? { Host: q.get('host') } : {}
    };
  } else if (normalizedNetwork === 'grpc') {
    streamSettings.grpcSettings = { serviceName: q.get('serviceName') || '', multiMode: q.get('mode') === 'multi' };
  } else if (normalizedNetwork === 'httpupgrade') {
    streamSettings.httpupgradeSettings = { path: q.get('path') || '/', host: q.get('host') || '' };
  } else if (normalizedNetwork === 'kcp') {
    streamSettings.kcpSettings = { header: { type: q.get('headerType') || 'none' } };
    if (q.get('seed')) streamSettings.kcpSettings.seed = q.get('seed');
  } else {
    streamSettings.tcpSettings = { header: { type: q.get('headerType') || 'none' } };
  }

  const outbound = {
    tag,
    protocol: 'vless',
    settings: {
      vnext: [{
        address: url.hostname,
        port: Number(url.port || 443),
        users: [user]
      }]
    },
    streamSettings
  };

  applyHappOutboundControls(outbound);

  const remark = getRemarkFromVlessLine(line);
  if (remark) outbound.remarks = remark;

  if (security === 'reality') {
    outbound.streamSettings.realitySettings = {
      show: false,
      fingerprint: fp,
      publicKey: pbk,
      serverName: sni,
      shortId: sid,
      spiderX: spx || '/',
      allowInsecure: false
    };
  } else if (security === 'tls') {
    const alpn = String(q.get('alpn') || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    outbound.streamSettings.tlsSettings = {
      serverName: sni || q.get('host') || url.hostname,
      fingerprint: fp,
      ...(alpn.length ? { alpn } : {}),
      allowInsecure: false
    };
  }

  return outbound;
}

function getRemarkFromVlessLine(line) {
  try {
    const raw = String(line || '');
    const idx = raw.indexOf('#');
    if (idx >= 0) {
      const fragment = raw.slice(idx + 1);
      const title = fragment.split('?serverDescription=')[0].split('&serverDescription=')[0];
      return decodeURIComponent(title).trim();
    }
  } catch (_) {}
  return '';
}



function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}


const LOYALSOLDIER_GEOSITE_URL = 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat';
const LOYALSOLDIER_GEOIP_URL = 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat';
const ROUTING_GEODATA_SOURCES = new Set(['official', 'loyalsoldier', 'custom']);


function loadIplistDomains(serviceName) {
  try {
    const ipListPath = path.join(DATA_DIR, 'ip-list.json');
    if (!fs.existsSync(ipListPath)) return [];

    const data = JSON.parse(fs.readFileSync(ipListPath, 'utf8'));
    const entry = data[serviceName];
    if (!entry || !Array.isArray(entry.domains)) return [];

    return entry.domains
      .map(domain => String(domain || '').trim().toLowerCase())
      .filter(domain => domain && !domain.endsWith('.ru'))
      .map(domain => `domain:${domain}`);
  } catch (error) {
    console.warn('Unable to load ip-list domains:', error.message);
    return [];
  }
}


function getRoutingGeodataSource() {
  const cfg = getRoutingConfig();
  const raw = String(cfg.geodataSource || 'loyalsoldier').trim().toLowerCase();
  return ROUTING_GEODATA_SOURCES.has(raw) ? raw : 'loyalsoldier';
}

function getRoutingGeositeUrl() {
  const cfg = getRoutingConfig();
  const source = getRoutingGeodataSource();
  if (source === 'official') return '';
  if (source === 'loyalsoldier') return LOYALSOLDIER_GEOSITE_URL;
  return String(cfg.geositeUrl || '').trim();
}

function getRoutingGeoipUrl() {
  const cfg = getRoutingConfig();
  const source = getRoutingGeodataSource();
  if (source === 'official') return '';
  if (source === 'loyalsoldier') return LOYALSOLDIER_GEOIP_URL;
  return String(cfg.geoipUrl || '').trim();
}

function isHappAutoRoutingEnabled() {
  const cfg = getRoutingConfig();
  return cfg.happRoutingProfileEnabled !== false;
}

function getHappRoutingLastUpdated() {
  const cfg = getRoutingConfig();
  if (cfg.happRoutingForceUpdate === false) return '';
  const revision = getSubscriptionRevision();
  const stampMs = revision > 1000000000000 ? revision : Date.now();
  return String(Math.floor(stampMs / 1000));
}

function getHappRoutingDnsPresetFields() {
  const cfg = getRoutingConfig();
  const preset = String(cfg.dnsPreset || 'cloudflare');
  if (preset === 'google' || preset === 'doh_google') {
    return {
      RemoteDNSType: 'DoH', RemoteDNSDomain: 'https://dns.google/dns-query', RemoteDNSIP: '8.8.8.8',
      DomesticDNSType: 'DoH', DomesticDNSDomain: 'https://dns.google/dns-query', DomesticDNSIP: '8.8.8.8',
      DnsHosts: { 'dns.google': '8.8.8.8' }
    };
  }
  if (preset === 'cloudflare' || preset === 'doh_cloudflare') {
    return {
      RemoteDNSType: 'DoH', RemoteDNSDomain: 'https://cloudflare-dns.com/dns-query', RemoteDNSIP: '1.1.1.1',
      DomesticDNSType: 'DoH', DomesticDNSDomain: 'https://cloudflare-dns.com/dns-query', DomesticDNSIP: '1.1.1.1',
      DnsHosts: { 'cloudflare-dns.com': '1.1.1.1' }
    };
  }
  return {
    RemoteDNSType: 'DoH', RemoteDNSDomain: 'https://cloudflare-dns.com/dns-query', RemoteDNSIP: '1.1.1.1',
    DomesticDNSType: 'DoH', DomesticDNSDomain: 'https://dns.google/dns-query', DomesticDNSIP: '8.8.8.8',
    DnsHosts: { 'cloudflare-dns.com': '1.1.1.1', 'dns.google': '8.8.8.8' }
  };
}

const HAPP_ROUTING_PRIVATE_IPS = uniqueList([
  'geoip:private',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  '224.0.0.0/4',
  '255.255.255.255/32'
]);

function buildHappRoutingProfile(subscriptionName = '') {
  const cfg = getRoutingConfig();
  const routingEnabled = cfg.enabled !== false;
  const directSites = routingEnabled && cfg.mode === 'proxy-except' ? getRoutingDirectDomains() : [];
  const directIp = routingEnabled && cfg.mode === 'proxy-except' ? uniqueList([...getRoutingDirectIps(), ...HAPP_ROUTING_PRIVATE_IPS]) : HAPP_ROUTING_PRIVATE_IPS;
  const proxySites = routingEnabled ? getRoutingProxyDomains() : [];
  const proxyIp = routingEnabled ? getRoutingProxyIps() : [];
  const blockSites = routingEnabled ? getRoutingBlockDomains() : [];
  const blockIp = routingEnabled ? getRoutingBlockIps() : [];
  const dns = getHappRoutingDnsPresetFields();
  const profileName = String(subscriptionName || getSetting('subscription_name', DEFAULT_SUBSCRIPTION_NAME) || DEFAULT_SUBSCRIPTION_NAME).slice(0, 25);
  return {
    Name: profileName || 'Aero',
    GlobalProxy: cfg.mode === 'proxy-except' ? 'true' : 'false',
    RouteOrder: 'block-proxy-direct',
    ...dns,
    ...(getRoutingGeoipUrl() ? { Geoipurl: getRoutingGeoipUrl() } : {}),
    ...(getRoutingGeositeUrl() ? { Geositeurl: getRoutingGeositeUrl() } : {}),
    LastUpdated: getHappRoutingLastUpdated(),
    DirectSites: uniqueList(directSites),
    DirectIp: uniqueList(directIp),
    ProxySites: uniqueList(proxySites),
    ProxyIp: uniqueList(proxyIp),
    BlockSites: uniqueList(blockSites),
    BlockIp: uniqueList(blockIp),
    DomainStrategy: 'IPIfNonMatch',
    FakeDNS: 'false',
    UseChunkFiles: true
  };
}

function base64Std(text) {
  return Buffer.from(String(text || ''), 'utf8').toString('base64');
}

function buildHappRoutingLink(subscriptionName = '') {
  if (!isHappAutoRoutingEnabled()) return '';
  const profile = buildHappRoutingProfile(subscriptionName);
  return `happ://routing/onadd/${base64Std(JSON.stringify(profile))}`;
}

function applyHappRoutingHeader(res, subscriptionName = '') {
  const link = buildHappRoutingLink(subscriptionName);
  if (!link) return;
  setSafeAsciiHeader(res, 'routing', link);
}

const ROUTING_PROXY_DOMAINS = uniqueList([
  'geosite:youtube',
  'geosite:meta',
  'geosite:facebook',
  'geosite:instagram',
  'geosite:whatsapp',
  'geosite:openai',
  'geosite:telegram',
  'domain:fbcdn.net',
  'domain:fbsbx.com',
  'domain:messenger.com',
  'domain:m.me',
  'domain:instagram.com',
  'domain:cdninstagram.com',
  'domain:whatsapp.com',
  'domain:whatsapp.net',
  'domain:wa.me'
]);

const ROUTING_PROXY_IPS = uniqueList([
  // These are the only checked service GeoIP tags available in the target
  // /usr/local/x-ui/bin/geoip.dat. Do not add geoip:youtube/instagram/whatsapp/openai/chatgpt
  // unless they exist on the server, otherwise routing may become unreliable.
  'geoip:telegram',
  'geoip:facebook'
]);

const ROUTING_PRESETS = [
  { key: 'youtube', icon: '▶️', label: 'YouTube', domains: ['geosite:youtube', 'domain:youtube.com', 'domain:youtu.be', 'domain:googlevideo.com', 'domain:ytimg.com'], ips: [] },
  { key: 'meta', icon: '♾️', label: 'Meta', domains: ['geosite:meta', 'domain:meta.com', 'domain:fbcdn.net', 'domain:fbsbx.com'], ips: [] },
  { key: 'facebook', icon: '🔵', label: 'Facebook', domains: ['geosite:facebook', 'domain:facebook.com', 'domain:fb.com', 'domain:fbcdn.net', 'domain:fbsbx.com', 'domain:messenger.com', 'domain:m.me'], ips: ['geoip:facebook'] },
  { key: 'instagram', icon: '📸', label: 'Instagram', domains: ['geosite:instagram', 'domain:instagram.com', 'domain:cdninstagram.com'], ips: [] },
  { key: 'whatsapp', icon: '💬', label: 'WhatsApp', domains: ['geosite:whatsapp', 'domain:whatsapp.com', 'domain:whatsapp.net', 'domain:wa.me'], ips: [] },
  { key: 'openai', icon: '🧠', label: 'OpenAI / ChatGPT', domains: ['geosite:openai', 'domain:openai.com', 'domain:chatgpt.com', 'domain:oaiusercontent.com'], ips: [] },
  { key: 'telegram', icon: '✈️', label: 'Telegram', domains: ['geosite:telegram', 'domain:telegram.org', 'domain:t.me', 'domain:tdesktop.com', 'domain:telegra.ph'], ips: ['geoip:telegram'] },
  {
    key: 'mailru',
    icon: '📨',
    label: 'Mail.ru / My.ru / VK Group',
    domains: ['geosite:mailru', 'geosite:mailru-group', 'domain:my.ru', 'domain:my.com', 'domain:mail.ru', 'domain:imgsmail.ru', 'domain:vk.com', 'domain:vk.ru'],
    ips: []
  }
];


const GEOSITE_CATALOG_FALLBACK = uniqueList([
  'ads', 'ads-all', 'category-ads-all', 'category-ads', 'category-ai-!cn', 'category-ai-chat-!cn',
  'category-bank-cn', 'category-bank-ir', 'category-browser-!cn', 'category-communication',
  'category-companies@ads', 'category-dev', 'category-ecommerce', 'category-education-cn',
  'category-entertainment', 'category-forums', 'category-games', 'category-games@cn',
  'category-httpdns-cn', 'category-media', 'category-media-cn', 'category-news',
  'category-payment-cn', 'category-public-tracker', 'category-scholar-!cn', 'category-search-engines',
  'category-social-media-!cn', 'category-social-media-cn', 'category-speedtest', 'category-streaming',
  'category-tech-cn', 'category-travel-cn', 'category-vpnservices', 'geolocation-!cn', 'geolocation-cn',
  'category-ru', 'ru', 'private', 'cn', 'tld-cn', 'gfw', 'greatfire', 'china-list', 'apple-cn', 'google-cn',
  'win-spy', 'win-update', 'win-extra', 'apple', 'icloud', 'itunes', 'google', 'youtube', 'googlefcm',
  'android', 'api', 'facebook', 'instagram', 'whatsapp', 'meta', 'twitter', 'x', 'telegram', 'discord', 'slack',
  'zoom', 'skype', 'teams', 'microsoft', 'office365', 'windows', 'github', 'gitlab', 'docker', 'npmjs',
  'cloudflare', 'cloudfront', 'fastly', 'akamai', 'netflix', 'spotify', 'tiktok', 'twitch', 'hulu',
  'openai', 'anthropic', 'perplexity', 'reddit', 'linkedin', 'pinterest', 'snapchat', 'viber', 'line',
  'signal', 'vk', 'ok', 'mailru', 'mailru-group', 'yandex', 'rutube', 'ozon', 'wildberries', 'sber',
  'tinkoff', 'steam', 'epicgames', 'ea', 'blizzard', 'nintendo', 'sony', 'xbox', 'oracle', 'amazon', 'aws',
  'paypal', 'visa', 'mastercard', 'stripe', 'booking', 'airbnb', 'uber', 'wikipedia', 'duckduckgo', 'yahoo'
]);

const GEOIP_ISO_ALPHA2_CODES = [
  'ad','ae','af','ag','ai','al','am','ao','aq','ar','as','at','au','aw','ax','az','ba','bb','bd','be','bf','bg','bh','bi','bj','bl','bm','bn','bo','bq','br','bs','bt','bv','bw','by','bz','ca','cc','cd','cf','cg','ch','ci','ck','cl','cm','cn','co','cr','cu','cv','cw','cx','cy','cz','de','dj','dk','dm','do','dz','ec','ee','eg','eh','er','es','et','fi','fj','fk','fm','fo','fr','ga','gb','gd','ge','gf','gg','gh','gi','gl','gm','gn','gp','gq','gr','gs','gt','gu','gw','gy','hk','hm','hn','hr','ht','hu','id','ie','il','im','in','io','iq','ir','is','it','je','jm','jo','jp','ke','kg','kh','ki','km','kn','kp','kr','kw','ky','kz','la','lb','lc','li','lk','lr','ls','lt','lu','lv','ly','ma','mc','md','me','mf','mg','mh','mk','ml','mm','mn','mo','mp','mq','mr','ms','mt','mu','mv','mw','mx','my','mz','na','nc','ne','nf','ng','ni','nl','no','np','nr','nu','nz','om','pa','pe','pf','pg','ph','pk','pl','pm','pn','pr','ps','pt','pw','py','qa','re','ro','rs','ru','rw','sa','sb','sc','sd','se','sg','sh','si','sj','sk','sl','sm','sn','so','sr','ss','st','sv','sx','sy','sz','tc','td','tf','tg','th','tj','tk','tl','tm','tn','to','tr','tt','tv','tw','tz','ua','ug','um','us','uy','uz','va','vc','ve','vg','vi','vn','vu','wf','ws','ye','yt','za','zm','zw'
];

const GEOIP_CATALOG_FALLBACK = uniqueList([
  'private', 'cloudflare', 'cloudfront', 'facebook', 'meta', 'instagram', 'whatsapp', 'mailru', 'vk', 'yandex', 'fastly', 'google', 'youtube', 'netflix', 'telegram', 'twitter', 'tor',
  ...GEOIP_ISO_ALPHA2_CODES
]);

let geodataCatalogCache = { ts: 0, value: null };

function normalizeGeodataTag(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  // Keep common geosite attributes such as steam@cn / category-games@cn.
  if (!/^[a-z0-9_!@.-]+$/.test(text)) return '';
  return text;
}

function getFallbackGeodataCatalog() {
  return {
    source: 'fallback',
    updatedAt: new Date().toISOString(),
    geosite: GEOSITE_CATALOG_FALLBACK.map(tag => ({ tag, value: `geosite:${tag}`, source: 'fallback' })),
    geoip: GEOIP_CATALOG_FALLBACK.map(tag => ({ tag, value: `geoip:${tag}`, source: 'fallback' })),
    notes: [
      'geosite-файлы .dat бинарные, поэтому справочник строится из исходных списков domain-list-community и известных добавок Loyalsoldier.',
      'Если GitHub недоступен с сервера, будет показан встроенный fallback-список.'
    ]
  };
}

async function fetchGithubDirectoryNames(owner, repo, dir, ref = 'master') {
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${dir.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`;
  const response = await fetchWithTimeout(apiUrl, {
    headers: {
      'User-Agent': '3xui-aggregator-geodata-index',
      'Accept': 'application/vnd.github+json',
      'Cache-Control': 'no-cache'
    }
  }, 12000);
  if (!response.ok) throw new Error(`${owner}/${repo}/${dir}: GitHub API ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(`${owner}/${repo}/${dir}: unexpected GitHub response`);
  return data
    .filter(item => item && item.type === 'file' && item.name)
    .map(item => String(item.name).replace(/\.txt$/i, ''))
    .filter(name => !/\.(md|json|go|yml|yaml)$/i.test(name))
    .map(normalizeGeodataTag)
    .filter(Boolean);
}

async function buildGeodataCatalogFromSources(force = false) {
  const now = Date.now();
  if (!force && geodataCatalogCache.value && now - geodataCatalogCache.ts < 6 * 60 * 60 * 1000) {
    return { ...geodataCatalogCache.value, cached: true };
  }

  const fallback = getFallbackGeodataCatalog();
  const notes = [...fallback.notes];
  let geositeTags = fallback.geosite.map(item => item.tag);

  try {
    const domainListNames = await fetchGithubDirectoryNames('v2fly', 'domain-list-community', 'data', 'master');
    geositeTags = uniqueList([...geositeTags, ...domainListNames]);
    notes.push(`Загружено ${domainListNames.length} geosite-разделов из v2fly/domain-list-community.`);
  } catch (err) {
    notes.push(`Не удалось обновить v2fly/domain-list-community: ${String(err.message || err)}`);
  }

  try {
    // Loyalsoldier добавляет свои категории поверх domain-list-community. Репозиторий может менять структуру,
    // поэтому сбой здесь не критичен: основной справочник уже взят из v2fly + fallback.
    const loyalNames = await fetchGithubDirectoryNames('Loyalsoldier', 'domain-list-custom', 'data', 'master');
    geositeTags = uniqueList([...geositeTags, ...loyalNames]);
    notes.push(`Загружено ${loyalNames.length} дополнительных geosite-разделов из Loyalsoldier/domain-list-custom.`);
  } catch (err) {
    notes.push(`Loyalsoldier/domain-list-custom недоступен или имеет другую структуру: ${String(err.message || err)}`);
  }

  const value = {
    source: 'github+fallback',
    updatedAt: new Date().toISOString(),
    geosite: uniqueList(geositeTags).sort((a, b) => a.localeCompare(b)).map(tag => ({ tag, value: `geosite:${tag}`, source: 'github/fallback' })),
    geoip: GEOIP_CATALOG_FALLBACK.sort((a, b) => a.localeCompare(b)).map(tag => ({ tag, value: `geoip:${tag}`, source: 'loyalsoldier/fallback' })),
    notes
  };
  geodataCatalogCache = { ts: now, value };
  return value;
}

const ROUTING_DEFAULT_CUSTOM_DOMAINS = [
  'domain:fbcdn.net',
  'domain:fbsbx.com',
  'domain:messenger.com',
  'domain:m.me',
  'domain:instagram.com',
  'domain:cdninstagram.com',
  'domain:whatsapp.com',
  'domain:whatsapp.net',
  'domain:wa.me'
];

const ROUTING_DEFAULT_DIRECT_DOMAINS = uniqueList([
  'geosite:category-ru',
  'geosite:private'
]);

const ROUTING_DEFAULT_DIRECT_IPS = uniqueList([
  'geoip:ru',
  'geoip:private'
]);

const ROUTING_LEGACY_ADBLOCK_DOMAINS = uniqueList([
  'geosite:category-ads-all'
]);

// Advertising blocking remains available as an optional feature, but it is no
// longer enabled automatically. Broad ad lists can contain telemetry/CDN
// endpoints used by mobile applications and may break messages or media.
const ROUTING_DEFAULT_ADBLOCK_DOMAINS = uniqueList([]);

const ROUTING_DEFAULT_ADBLOCK_IPS = uniqueList([]);

function getDefaultRoutingConfig() {
  return {
    // Routing is disabled until the owner turns it on. Once enabled, the
    // default policy matches the common RU scenario: RU domains/IPs are direct
    // and everything else goes through VPN. Ad blocking is opt-in.
    presets: [],
    customDomains: [],
    customIps: [],
    mode: 'proxy-except',
    exceptDomains: ROUTING_DEFAULT_DIRECT_DOMAINS,
    exceptIps: ROUTING_DEFAULT_DIRECT_IPS,
    adBlockEnabled: false,
    adBlockDomains: ROUTING_DEFAULT_ADBLOCK_DOMAINS,
    adBlockIps: ROUTING_DEFAULT_ADBLOCK_IPS,
    geodataUrls: [LOYALSOLDIER_GEOSITE_URL, LOYALSOLDIER_GEOIP_URL],
    geodataSource: 'loyalsoldier',
    geositeUrl: LOYALSOLDIER_GEOSITE_URL,
    geoipUrl: LOYALSOLDIER_GEOIP_URL,
    dnsPreset: 'cloudflare',
    dnsCustom: '',
    allNodes: true,
    excludedNodeIds: [],
    enabled: false,
    // Optional free Happ routing profile. Disabled by default so we do not change
    // app behaviour unless the owner intentionally enables it.
    happRoutingProfileEnabled: false,
    happRoutingForceUpdate: true,
    happAutoRoutingEnabled: false,
    defaultsVersion: 6
  };
}

function sameStringSet(a, b) {
  const left = uniqueList(Array.isArray(a) ? a.map(String) : []).sort();
  const right = uniqueList(Array.isArray(b) ? b.map(String) : []).sort();
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

function isLegacyRoutingDefaultConfig(parsed) {
  if (!parsed || parsed.defaultsVersion) return false;
  return parsed.enabled !== false
    && (parsed.mode || 'proxy-selected') === 'proxy-selected'
    && sameStringSet(parsed.presets, ROUTING_PRESETS.map(p => p.key))
    && sameStringSet(parsed.customDomains, ROUTING_DEFAULT_CUSTOM_DOMAINS)
    && (!Array.isArray(parsed.customIps) || parsed.customIps.length === 0)
    && (!Array.isArray(parsed.exceptDomains) || parsed.exceptDomains.length === 0)
    && (!Array.isArray(parsed.exceptIps) || parsed.exceptIps.length === 0)
    && !parsed.geositeUrl
    && !parsed.geoipUrl;
}

function getRoutingConfig() {
  const raw = getSetting('routing_config', '');
  if (!raw) return getDefaultRoutingConfig();
  try {
    const parsed = JSON.parse(raw);
    const fallback = getDefaultRoutingConfig();
    if (isLegacyRoutingDefaultConfig(parsed)) return fallback;
    const parsedDefaultsVersion = Math.max(0, Number(parsed.defaultsVersion || 0) || 0);
    const legacyDefaultAdBlock = parsedDefaultsVersion < 6
      && sameStringSet(parsed.adBlockDomains, ROUTING_LEGACY_ADBLOCK_DOMAINS)
      && (!Array.isArray(parsed.adBlockIps) || parsed.adBlockIps.length === 0);
    const normalized = {
      enabled: parsed.enabled === true,
      presets: [],
      customDomains: Array.isArray(parsed.customDomains) ? parsed.customDomains : fallback.customDomains,
      customIps: Array.isArray(parsed.customIps) ? parsed.customIps : fallback.customIps,
      mode: ['proxy-selected', 'proxy-except'].includes(parsed.mode) ? parsed.mode : (parsed.proxyExcept ? 'proxy-except' : fallback.mode),
      exceptDomains: Array.isArray(parsed.exceptDomains) ? parsed.exceptDomains : fallback.exceptDomains,
      exceptIps: Array.isArray(parsed.exceptIps) ? parsed.exceptIps : fallback.exceptIps,
      adBlockEnabled: legacyDefaultAdBlock ? false : parsed.adBlockEnabled === true,
      adBlockDomains: legacyDefaultAdBlock ? [] : (Array.isArray(parsed.adBlockDomains) ? parsed.adBlockDomains : fallback.adBlockDomains),
      adBlockIps: Array.isArray(parsed.adBlockIps) ? parsed.adBlockIps : fallback.adBlockIps,
      geodataUrls: uniqueList([...(Array.isArray(parsed.geodataUrls) ? parsed.geodataUrls : []), fallback.geositeUrl, fallback.geoipUrl].filter(Boolean)),
      geodataSource: ROUTING_GEODATA_SOURCES.has(String(parsed.geodataSource || '').trim().toLowerCase()) ? String(parsed.geodataSource).trim().toLowerCase() : fallback.geodataSource,
      geositeUrl: (typeof parsed.geositeUrl === 'string' && parsed.geositeUrl.trim()) ? parsed.geositeUrl : (Array.isArray(parsed.geodataUrls) ? (parsed.geodataUrls.find(v => /geosite/i.test(v)) || fallback.geositeUrl) : fallback.geositeUrl),
      geoipUrl: (typeof parsed.geoipUrl === 'string' && parsed.geoipUrl.trim()) ? parsed.geoipUrl : (Array.isArray(parsed.geodataUrls) ? (parsed.geodataUrls.find(v => /geoip/i.test(v)) || fallback.geoipUrl) : fallback.geoipUrl),
      dnsPreset: typeof parsed.dnsPreset === 'string' ? parsed.dnsPreset : fallback.dnsPreset,
      dnsCustom: typeof parsed.dnsCustom === 'string' ? parsed.dnsCustom : fallback.dnsCustom,
      allNodes: parsed.allNodes !== false,
      excludedNodeIds: Array.isArray(parsed.excludedNodeIds) ? parsed.excludedNodeIds.map(Number).filter(Boolean) : fallback.excludedNodeIds,
      happRoutingProfileEnabled: parsed.happRoutingProfileEnabled === true && parsed.happRoutingExplicit === true,
      happRoutingExplicit: parsed.happRoutingExplicit === true,
      happRoutingForceUpdate: parsed.happRoutingForceUpdate !== false,
      happAutoRoutingEnabled: parsed.happRoutingProfileEnabled === true && parsed.happRoutingExplicit === true,
      defaultsVersion: 6
    };
    if (parsedDefaultsVersion < 6 || legacyDefaultAdBlock) {
      setSetting('routing_config', JSON.stringify(normalized));
      if (legacyDefaultAdBlock) bumpSubscriptionRevision();
    }
    return normalized;
  } catch (_) {
    return getDefaultRoutingConfig();
  }
}

function normalizeRoutingLine(value, kind) {
  let line = String(value || '').trim().toLowerCase();
  if (!line) return '';
  line = line.replace(/\s+/g, '');
  if (kind === 'domain') {
    if (line === 'ru' || line === 'category-ru') return 'geosite:category-ru';
    if (/^(geosite|domain|regexp|keyword|full):.+/.test(line)) return line;
    if (/^ext:geosite_[a-z0-9_-]+\.dat:[a-z0-9_@.-]+$/.test(line)) return line;
    if (/^[a-z0-9*_.-]+\.[a-z0-9_.-]+$/.test(line)) return `domain:${line.replace(/^\*\./, '')}`;
    return null;
  }
  if (kind === 'ip') {
    const prefixedAddress = line.match(/^(?:ip|geoip):(.+)$/);
    if (prefixedAddress) {
      const candidate = prefixedAddress[1];
      const looksLikeIpv4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(candidate);
      const looksLikeIpv6 = /^[0-9a-f:]+(\/\d{1,3})?$/i.test(candidate) && candidate.includes(':');
      if (looksLikeIpv4 || looksLikeIpv6) line = candidate;
    }
    if (line === 'ru' || line === 'ip-ru' || line === 'geoip:ip-ru') return 'geoip:ru';
    if (/^geoip:[a-z0-9_-]+$/.test(line)) return line;
    if (/^ext:geoip_[a-z0-9_-]+\.dat:[a-z0-9_@.-]+$/.test(line)) return line;
    if (/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(line)) return line;
    if (/^[0-9a-f:]+(\/\d{1,3})?$/i.test(line) && line.includes(':')) return line;
    return null;
  }
  return null;
}

function parsePlainLines(text) {
  return uniqueList(String(text || '').split(/[\n,;]+/).map(v => v.trim()).filter(Boolean));
}

function parseRoutingLines(text, kind) {
  const errors = [];
  const values = [];
  String(text || '').split(/[\n,;]+/).map(v => v.trim()).filter(Boolean).forEach((raw, index) => {
    const normalized = normalizeRoutingLine(raw, kind);
    if (!normalized) {
      errors.push(`Строка ${index + 1}: "${raw}" не подходит для ${kind === 'domain' ? 'domain/geosite' : 'ip/geoip'}. Используй geosite:tag, domain:example.com, regexp:..., geoip:tag, ext:geosite_alias.dat:tag, ext:geoip_alias.dat:tag или CIDR. Для отдельного IP можно указать 157.240.225.60/32 или ip:157.240.225.60/32.`);
    } else {
      values.push(normalized);
    }
  });
  return { values: uniqueList(values), errors };
}

function getRoutingDirectDomains() {
  const cfg = getRoutingConfig();
  if (cfg.enabled === false || cfg.mode !== 'proxy-except') return [];
  return uniqueList(cfg.exceptDomains || []);
}

function getRoutingDirectIps() {
  const cfg = getRoutingConfig();
  if (cfg.enabled === false || cfg.mode !== 'proxy-except') return [];
  return uniqueList(cfg.exceptIps || []);
}

function getRoutingBlockDomains() {
  const cfg = getRoutingConfig();
  if (cfg.enabled === false || cfg.adBlockEnabled === false) return [];
  return uniqueList(cfg.adBlockDomains || []);
}

function getRoutingBlockIps() {
  const cfg = getRoutingConfig();
  if (cfg.enabled === false || cfg.adBlockEnabled === false) return [];
  return uniqueList(cfg.adBlockIps || []);
}

function getRoutingProxyDomains() {
  const cfg = getRoutingConfig();
  if (cfg.enabled === false) return [];
  return uniqueList(cfg.customDomains || []);
}

function getRoutingProxyIps() {
  const cfg = getRoutingConfig();
  if (cfg.enabled === false) return [];
  return uniqueList(cfg.customIps || []);
}

const ROUTING_DIRECT_DOMAINS = uniqueList([
  'geosite:private',
  'geosite:category-ru',
  'geosite:apple',
  'geosite:apple-pki',
  'geosite:huawei',
  'geosite:xiaomi',
  'geosite:category-android-app-download',
  'geosite:f-droid',
  'domain:ozon.ru',
  'domain:wildberries.ru',
  'domain:wb.ru',
  'domain:yandex.ru',
  'domain:ya.ru',
  'domain:vk.com',
  'domain:gosuslugi.ru',
  'domain:sber.ru',
  'domain:tbank.ru',
  'domain:alfabank.ru',
  'domain:vtb.ru',
  'domain:mail.ru'
]);


function buildDnsServerEntry(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^https:\/\//i.test(text) || /^tls:\/\//i.test(text)) return text;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(text)) return { address: text, port: 53, skipFallback: false };
  if (/^[0-9a-f:]+$/i.test(text) && text.includes(':')) return { address: text, port: 53, skipFallback: false };
  return text;
}

function getJsonDnsServers() {
  const cfg = getRoutingConfig();
  const preset = String(cfg.dnsPreset || 'cloudflare');
  const presets = {
    'cloudflare-google': ['1.1.1.1', '8.8.8.8'],
    cloudflare: ['1.1.1.1', '1.0.0.1'],
    google: ['8.8.8.8', '8.8.4.4'],
    quad9: ['9.9.9.9', '149.112.112.112'],
    yandex: ['77.88.8.8', '77.88.8.1'],
    doh_cloudflare: ['https://cloudflare-dns.com/dns-query'],
    doh_google: ['https://dns.google/dns-query'],
    manual: []
  };
  const base = presets[preset] || presets.cloudflare;
  const custom = parsePlainLines(cfg.dnsCustom || '');
  const servers = uniqueList([...base, ...custom]).map(buildDnsServerEntry).filter(Boolean);
  return servers.length ? servers : presets.cloudflare.map(buildDnsServerEntry);
}

function relabelNativeJsonConfig(config, remark) {
  const copy = JSON.parse(JSON.stringify(config || {}));
  const title = String(remark || '').trim();
  if (title) {
    copy.remarks = title;
    copy.name = title;
    copy.ps = title;
    copy.title = title;
  }
  return copy;
}

function buildHappJsonConfigFromLine(client, line, subscriptionName, index = 0, routingEnabledForThisConfig = true, options = {}) {
  const remark = getRemarkFromVlessLine(line) || `Server ${index + 1}`;
  const config = buildHappJsonConfig(client, [line], remark, routingEnabledForThisConfig, options);
  // HAPP and other JSON-array importers use these fields as the visible
  // subscription/server title. Keep them equal to the node remark so every
  // country/region from the node settings is shown as a separate region.
  config.remarks = remark;
  config.name = remark;
  config.ps = remark;
  config.title = remark;
  const serverDescription = buildHappServerDescriptionFromLine(line);
  if (serverDescription) {
    config.meta = {
      ...(config.meta || {}),
      serverDescription
    };
  }
  return config;
}



function isIosSafeRoutingEnabled() {
  return getSetting('ios_safe_routing_enabled', '1') !== '0';
}

function isIosSafeDomainRule(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  // iOS-safe режим не должен ломать маршрутизацию: geosite нужен для
  // правил вроде geosite:category-ru / geosite:ru / geosite:private.
  // Чистим только явно неизвестные/пустые значения, но сохраняем штатные
  // Xray-маркеры domain/full/keyword/regexp/geosite.
  return /^(geosite|domain|full|keyword|regexp):/.test(text) || /^ext:geosite_[a-z0-9_-]+\.dat:[a-z0-9_@.-]+$/.test(text);
}

function isIosSafeIpRule(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  // geoip тоже нужен для сценария "RU напрямую, остальное через VPN".
  // Поэтому iOS-safe режим сохраняет geoip:ru / geoip:private и обычные CIDR.
  if (/^geoip:[a-z0-9_-]+$/.test(text)) return true;
  if (/^ext:geoip_[a-z0-9_-]+\.dat:[a-z0-9_@.-]+$/.test(text)) return true;
  if (/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(text)) return true;
  return /^[0-9a-f:]+(\/\d{1,3})?$/i.test(text) && text.includes(':');
}

function buildIosSafeRoutingRules() {
  const base = buildRoutingRules();
  const safeRules = [];
  for (const rule of base) {
    const next = { ...rule };
    if (Array.isArray(next.domain)) next.domain = uniqueList(next.domain.filter(isIosSafeDomainRule));
    if (Array.isArray(next.ip)) next.ip = uniqueList(next.ip.filter(isIosSafeIpRule));

    const hasDomain = Array.isArray(next.domain) && next.domain.length > 0;
    const hasIp = Array.isArray(next.ip) && next.ip.length > 0;
    const hasNetwork = !!next.network;

    if (Array.isArray(rule.domain) && !hasDomain) delete next.domain;
    if (Array.isArray(rule.ip) && !hasIp) delete next.ip;

    // Keep the final network fallback rule. Drop empty domain/ip-only rules.
    if (hasDomain || hasIp || hasNetwork) safeRules.push(next);
  }
  return safeRules.length ? safeRules : [{ type: 'field', network: 'tcp,udp', outboundTag: 'direct' }];
}

function getEffectiveJsonRoutingRules() {
  return isIosSafeRoutingEnabled() ? buildIosSafeRoutingRules() : buildRoutingRules();
}

function normalizeXrayJsonForIos(config) {
  if (!isIosSafeRoutingEnabled() || !config || typeof config !== 'object') return config;

  // RAW is a 3x-ui UI name. Xray/iOS JSON expects tcp.
  for (const outbound of Array.isArray(config.outbounds) ? config.outbounds : []) {
    const stream = outbound && outbound.streamSettings;
    if (!stream) continue;
    if (String(stream.network || '').toLowerCase() === 'raw') {
      stream.network = 'tcp';
      if (stream.rawSettings && !stream.tcpSettings) stream.tcpSettings = stream.rawSettings;
      delete stream.rawSettings;
    }
    if (stream.realitySettings && stream.realitySettings.serverName === undefined && stream.realitySettings.serverNames?.[0]) {
      stream.realitySettings.serverName = stream.realitySettings.serverNames[0];
    }
  }

  if (config.routing) {
    // Важно: для geoip:ru по доменам нужен IPIfNonMatch.
    // AsIs ломает сценарий, когда domain не совпал, а geoip должен отправить
    // российский IP напрямую. Это поведение было в рабочих старых сборках.
    config.routing.domainStrategy = config.routing.domainStrategy || 'IPIfNonMatch';
    if (config.routing.domainStrategy === 'AsIs') config.routing.domainStrategy = 'IPIfNonMatch';
    config.routing.domainMatcher = 'hybrid';
    config.routing.rules = getEffectiveJsonRoutingRules();
  }
  config.iosSafe = true;
  return config;
}

function buildRoutingRules() {
  const cfg = getRoutingConfig();
  if (cfg.enabled === false) {
    return [{ type: 'field', network: 'tcp,udp', outboundTag: 'direct' }];
  }

  if (cfg.mode === 'proxy-except') {
    const rules = [];
    const blockDomains = getRoutingBlockDomains();
    const blockIps = getRoutingBlockIps();
    if (blockDomains.length) rules.push({ type: 'field', domain: blockDomains, outboundTag: 'block' });
    if (blockIps.length) rules.push({ type: 'field', ip: blockIps, outboundTag: 'block' });
    // Priority matters. In the "everything via proxy except..." mode the selected
    // services/custom lists are forced to proxy BEFORE broad RU/direct rules.
    // This allows cases like Mail.ru/My.ru via VPN while geosite:category-ru/geoip:ru
    // still go direct.
    const forceProxyDomains = getRoutingProxyDomains();
    const forceProxyIps = getRoutingProxyIps();
    const directDomains = getRoutingDirectDomains();
    const directIps = getRoutingDirectIps();
    if (forceProxyDomains.length) rules.push({ type: 'field', domain: forceProxyDomains, outboundTag: 'proxy' });
    if (forceProxyIps.length) rules.push({ type: 'field', ip: forceProxyIps, outboundTag: 'proxy' });
    if (directDomains.length) rules.push({ type: 'field', domain: directDomains, outboundTag: 'direct' });
    if (directIps.length) rules.push({ type: 'field', ip: directIps, outboundTag: 'direct' });
    rules.push({ type: 'field', network: 'tcp,udp', outboundTag: 'proxy' });
    return rules;
  }

  const rules = [];
  const blockDomains = getRoutingBlockDomains();
  const blockIps = getRoutingBlockIps();
  if (blockDomains.length) rules.push({ type: 'field', domain: blockDomains, outboundTag: 'block' });
  if (blockIps.length) rules.push({ type: 'field', ip: blockIps, outboundTag: 'block' });
  const proxyDomains = getRoutingProxyDomains();
  const proxyIps = getRoutingProxyIps();
  if (proxyDomains.length) rules.push({ type: 'field', domain: proxyDomains, outboundTag: 'proxy' });
  if (proxyIps.length) rules.push({ type: 'field', ip: proxyIps, outboundTag: 'proxy' });
  rules.push({ type: 'field', network: 'tcp,udp', outboundTag: 'direct' });
  return rules;
}

function isRoutingEnabledForNode(nodeId) {
  const node = db.prepare('SELECT node_type FROM nodes WHERE id = ?').get(Number(nodeId));
  if (node && [NODE_TYPE_H1CLOUD, NODE_TYPE_REMNAWAVE].includes(getNodeType(node))) return false;
  const cfg = getRoutingConfig();
  if (cfg.enabled === false) return false;
  if (cfg.allNodes === false && (cfg.excludedNodeIds || []).map(Number).includes(Number(nodeId))) return false;
  return true;
}

function buildXrayFragmentOutbound() {
  return {
    tag: 'fragment',
    protocol: 'freedom',
    settings: {
      fragment: {
        packets: 'tlshello',
        length: '50-100',
        interval: '10-20',
        maxSplit: '100-200'
      },
      noises: [{
        type: 'rand',
        packet: '10-20',
        delay: '10-16',
        applyTo: 'ipv4'
      }]
    },
    streamSettings: {
      network: 'raw',
      security: '',
      sockopt: {
        TcpNoDelay: true,
        mark: 255
      }
    }
  };
}

function configUsesFragmentOutbound(outbounds) {
  return Array.isArray(outbounds) && outbounds.some(outbound => outbound?.streamSettings?.sockopt?.dialerProxy === 'fragment');
}

function buildHappJsonConfig(client, lines, subscriptionName, routingEnabledForThisConfig = true, options = {}) {
  const proxyOutbounds = lines
    .filter(line => String(line).startsWith('vless://'))
    .map((line, index) => parseVlessLineToOutbound(line, index, options));

  if (!proxyOutbounds.length) {
    proxyOutbounds.push({
      tag: 'proxy',
      protocol: 'freedom',
      settings: { domainStrategy: 'UseIP' }
    });
  }

  const routingActive = routingEnabledForThisConfig && getRoutingConfig().enabled !== false;
  const jsonSniffingEnabled = isJsonSniffingEnabled() || routingActive;
  const extraOutbounds = configUsesFragmentOutbound(proxyOutbounds) ? [buildXrayFragmentOutbound()] : [];

  const config = {
    dns: {
      queryStrategy: 'UseIPv4',
      servers: getJsonDnsServers(),
      tag: 'dns_out'
    },
    inbounds: [
      {
        tag: 'socks',
        port: 10808,
        protocol: 'socks',
        settings: {
          auth: 'noauth',
          udp: true,
          userLevel: 8
        },
        sniffing: {
          enabled: jsonSniffingEnabled,
          destOverride: jsonSniffingEnabled ? ['http', 'tls'] : []
        }
      },
      {
        tag: 'http',
        port: 10809,
        protocol: 'http',
        settings: {
          userLevel: 8
        },
        sniffing: {
          enabled: jsonSniffingEnabled,
          destOverride: jsonSniffingEnabled ? ['http', 'tls'] : []
        }
      }
    ],
    log: {
      loglevel: 'warning'
    },
    outbounds: [
      ...proxyOutbounds,
      ...extraOutbounds,
      {
        tag: 'direct',
        protocol: 'freedom',
        settings: {
          domainStrategy: 'UseIP'
        }
      },
      {
        tag: 'block',
        protocol: 'blackhole',
        settings: {
          response: { type: 'http' }
        }
      }
    ],
    policy: {
      levels: {
        '0': {
          statsUserDownlink: true,
          statsUserUplink: true
        },
        '8': {
          connIdle: 300,
          downlinkOnly: 1,
          handshake: 4,
          uplinkOnly: 1
        }
      },
      system: {
        statsInboundDownlink: true,
        statsInboundUplink: true,
        statsOutboundDownlink: true,
        statsOutboundUplink: true
      }
    },
    remarks: subscriptionName || DEFAULT_SUBSCRIPTION_NAME,
    ...(() => {
      const support = getSubscriptionSupportMeta();
      return {
        ...(support.note ? {
          description: support.note,
          notice: support.note,
          message: support.note,
          announcement: support.note,
          profileDescription: support.note,
          subscriptionDescription: support.note
        } : {}),
        ...(support.url ? { supportUrl: support.url, webPageUrl: support.url, url: support.url } : {})
      };
    })(),
    ...(routingActive ? {
      routing: {
        domainStrategy: 'IPIfNonMatch',
        domainMatcher: 'hybrid',
        rules: getEffectiveJsonRoutingRules()
      }
    } : {}),
    stats: {},
    geodata: {
      geositeUrl: getRoutingGeositeUrl(),
      geoipUrl: getRoutingGeoipUrl(),
      source: getRoutingGeodataSource(),
      happRoutingProfile: isHappAutoRoutingEnabled() ? buildHappRoutingProfile(subscriptionName) : null
    },
    // Блок subscription отдаётся всегда: он нужен клиентам для автообновления
    // даже когда расширенные Happ-режимы выключены.
    subscription: {
      title: subscriptionName || DEFAULT_SUBSCRIPTION_NAME,
      ...(() => {
        const support = getSubscriptionSupportMeta();
        return {
          ...(support.note ? { description: support.note, notice: support.note, message: support.note } : {}),
          ...(support.url ? { supportUrl: support.url, webPageUrl: support.url, url: support.url } : {})
        };
      })(),
      updateIntervalHours: getSubscriptionUpdateIntervalHours(),
      autoUpdate: getSetting('subscription_client_auto_update_enabled', '1') !== '0',
      geositeUrl: getRoutingGeositeUrl(),
      geoipUrl: getRoutingGeoipUrl(),
      generatedAt: new Date().toISOString(),
      ...(isHappAppControlsEnabled() ? {
        updateOnLaunch: getHappBehaviorOptions().updateOnOpen,
        pingOnOpen: getHappBehaviorOptions().pingOnOpen,
        subscriptionsCollapse: getHappBehaviorOptions().subscriptionsCollapse,
        expandNow: getHappBehaviorOptions().expandNow
      } : {})
    },
    ...(isHappAppControlsEnabled() ? {
      happ: {
        ...getHappJsonControls(),
        preferredMode: 'proxy'
      }
    } : {})
  };
  return normalizeXrayJsonForIos(config);
}

app.get('/happ-routing/:slug', async (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE sub_slug = ? AND enabled = 1').get(req.params.slug);
  if (!client) return res.status(404).send('Subscription not found');
  const subscriptionName = getSetting('subscription_name', DEFAULT_SUBSCRIPTION_NAME);
  const link = buildHappRoutingLink(subscriptionName);
  if (!link) return res.status(404).send('Happ routing profile is disabled');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(link);
});

app.get('/happ-routing-json/:slug', async (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE sub_slug = ? AND enabled = 1').get(req.params.slug);
  if (!client) return res.status(404).json({ error: 'Subscription not found' });
  const subscriptionName = getSetting('subscription_name', DEFAULT_SUBSCRIPTION_NAME);
  res.json(buildHappRoutingProfile(subscriptionName));
});

app.get('/json/:slug', async (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE sub_slug = ? AND enabled = 1').get(req.params.slug);

  if (!client) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  if (maybeRedirectToCurrentSubscriptionRevision(req, res)) return;

  await enforceExpiredClientRemoteState(client);

  if (isBrowserSubscriptionRequest(req)) {
    const hasH1CloudSub = clientHasActiveH1CloudSubscription(client.id);
    const showSubLinksInPanel = getSetting('show_sub_links', '1') !== '0';
    return render(res, 'open_sub', {
      client,
      subUrl: buildPublicSubUrl(client.sub_slug),
      plainSubUrl: buildPublicPlainSubUrl(client.sub_slug),
      jsonUrl: buildPublicJsonUrl(client.sub_slug),
      jsonRawUrl: addQueryParam(buildPublicJsonUrl(client.sub_slug), 'raw', '1'),
      happUrl: buildPublicHappUrl(client.sub_slug),
      baseUrl: getPublicSubBaseUrl(),
      hasH1CloudSub,
      showSubLinks: showSubLinksInPanel,
      showJsonLinks: getSetting('show_json_links', '1') !== '0',
      showHappLinks: getSetting('show_happ_links', '0') !== '0',
      supportNote: getSubscriptionSupportNote(),
      supportUrl: getSubscriptionSupportUrl()
    });
  }

  const entries = await buildSubscriptionEntries(client, true);
  const lines = entries.map(e => e.line);
  const subscriptionName = getSetting('subscription_name', DEFAULT_SUBSCRIPTION_NAME);
  const subscriptionUserInfo = buildSubscriptionUserInfo(entries, client);
  const subscriptionUpdateIntervalHours = getSubscriptionUpdateIntervalHours();
  const base64Title = Buffer.from(subscriptionName).toString('base64');

  setSubscriptionNoCacheHeaders(res, subscriptionName, 'json');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  setSubscriptionUserInfoHeaders(res, subscriptionUserInfo);
  applyHappSubscriptionProfileHeaders(res, subscriptionName, subscriptionUpdateIntervalHours, client, subscriptionUserInfo);
  applyHappAppControlHeaders(res);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const vlessLines = lines.filter(line => String(line).startsWith('vless://'));

  if (vlessLines.length >= 1) {
    const requestedNodeRaw = String(req.query.node || '').trim();
    const singleMode = requestedNodeRaw || ['single', 'object'].includes(String(req.query.format || '').toLowerCase());

    // Default JSON subscription must be a JSON array: HAPP treats an array as
    // several configs/regions, while a single object is imported as only one
    // visible server. This was the reason only the last/random region appeared.
    if (!singleMode) {
      const vlessEntries = entries.filter(e => String(e.line).startsWith('vless://'));
      const resultConfigs = [];
      const nativeJsonCache = new Map();
      for (let index = 0; index < vlessEntries.length; index += 1) {
        const entry = vlessEntries[index];
        const remark = getRemarkFromVlessLine(entry.line) || entry.nodeName || `Server ${index + 1}`;
        if (entry.nodeType === NODE_TYPE_H1CLOUD_3XUI && entry.providerJsonUrl) {
          try {
            let nativeConfigs = nativeJsonCache.get(entry.providerJsonUrl);
            if (!nativeConfigs) {
              const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(Number(entry.nodeId));
              nativeConfigs = node ? await fetchH1Cloud3xuiNativeJsonConfigs(node, entry.providerSubId || client.sub_slug) : [];
              nativeJsonCache.set(entry.providerJsonUrl, nativeConfigs);
            }
            if (nativeConfigs.length) {
              // A provider JSON endpoint may return several configs for one
              // client. Merge them into the same Happ JSON array unchanged.
              nativeConfigs.forEach((cfg, cfgIndex) => resultConfigs.push(relabelNativeJsonConfig(cfg, nativeConfigs.length > 1 ? `${remark} ${cfgIndex + 1}` : remark)));
              continue;
            }
          } catch (err) {
            console.error(`H1Cloud native JSON unavailable (${entry.nodeId}):`, err.message || err);
          }
        }
        resultConfigs.push(buildHappJsonConfigFromLine(
          client,
          entry.line,
          subscriptionName,
          index,
          isRoutingEnabledForNode(entry.nodeId),
          { preserveXhttpExtra: [NODE_TYPE_H1CLOUD_3XUI, NODE_TYPE_REMNAWAVE].includes(entry.nodeType) }
        ));
      }
      return res.json(resultConfigs);
    }

    // Compatibility endpoint for clients that require a single Xray object:
    // /json/:slug?node=2 or /json/:slug?format=single
    const requestedNode = Number.parseInt(requestedNodeRaw || '1', 10);
    const selectedIndex = Number.isFinite(requestedNode)
      ? Math.min(Math.max(requestedNode - 1, 0), vlessLines.length - 1)
      : 0;
    const selectedEntry = entries.filter(e => String(e.line).startsWith('vless://'))[selectedIndex];
    return res.json(buildHappJsonConfigFromLine(client, selectedEntry.line, subscriptionName, selectedIndex, isRoutingEnabledForNode(selectedEntry.nodeId), { preserveXhttpExtra: [NODE_TYPE_H1CLOUD_3XUI, NODE_TYPE_REMNAWAVE].includes(selectedEntry.nodeType) }));
  }

  return res.json({
    name: subscriptionName,
    remarks: subscriptionName,
    error: 'No active VLESS nodes in subscription',
    subscriptions: []
  });
});

app.get('/qr', async (req, res) => {
  try {
    const text = String(req.query.text || '').trim();
    if (!text) return res.status(400).send('Missing text');

    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M'
    });

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.send(svg);
  } catch (err) {
    res.status(500).send(String(err.message || err));
  }
});

app.get('/open/:slug', async (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE sub_slug = ? AND enabled = 1').get(req.params.slug);
  if (!client) return res.status(404).send('Subscription not found');

  const hasH1CloudSub = clientHasActiveH1CloudSubscription(client.id);
  const showSubLinksInPanel = getSetting('show_sub_links', '1') !== '0';

  render(res, 'open_sub', {
    client,
    subUrl: buildPublicSubUrl(client.sub_slug),
    plainSubUrl: buildPublicPlainSubUrl(client.sub_slug),
    jsonUrl: buildPublicJsonUrl(client.sub_slug),
    jsonRawUrl: addQueryParam(buildPublicJsonUrl(client.sub_slug), 'raw', '1'),
    happUrl: buildPublicHappUrl(client.sub_slug),
    baseUrl: getPublicSubBaseUrl(),
    hasH1CloudSub,
    showSubLinks: showSubLinksInPanel,
    showJsonLinks: getSetting('show_json_links', '1') !== '0',
    showHappLinks: getSetting('show_happ_links', '0') !== '0'
  });
});

app.get('/healthz', async (req, res) => {
  res.json({
    ok: true,
    service: '3xui-aggregator',
    now: new Date().toISOString()
  });
});

app.get('/debug/inbound/:nodeId', requireAuth, async (req, res) => {
  try {
    const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(Number(req.params.nodeId));

    if (!node) {
      return res.status(404).json({ error: 'node not found' });
    }

    const inbound = await getInbound(node);
    res.json(inbound);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});



// ---------------- Telegram Manager Bot ----------------
let telegramManagerBot = null;
let telegramManagerToken = '';
let telegramManagerProxyUrl = '';
let telegramManagerStarted = false;

function parseTelegramAdminIds() {
  return String(getSetting('telegram_manager_admin_ids', '') || '')
    .split(/[,\s]+/)
    .map(v => v.trim())
    .filter(Boolean);
}

function isTelegramManagerAdmin(telegramId) {
  return parseTelegramAdminIds().includes(String(telegramId));
}

function getTelegramProxyUrl() {
  const key = 'telegram_manager_proxy_url';
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  const savedValue = row ? String(decodeSettingValue(key, row.value, '') || '').trim() : '';
  if (savedValue) return savedValue;

  // Если поле уже есть в настройках и оно пустое — это явное "без прокси".
  // Не подхватываем TELEGRAM_PROXY_URL из .env, иначе кнопка проверки может
  // продолжать использовать старый/битый прокси после очистки поля в панели.
  if (row) return '';

  return String(process.env.TELEGRAM_PROXY_URL || '').trim();
}

function normalizeTelegramProxyUrl(value) {
  return String(value || '').trim();
}

function redactProxyUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch (_) {
    return raw.replace(/:\/\/([^:@/]+):([^@/]+)@/, '://$1:***@');
  }
}

function buildTelegramProxyAgent(proxyUrl = getTelegramProxyUrl()) {
  const raw = normalizeTelegramProxyUrl(proxyUrl);
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    throw new Error('Неверный Telegram Proxy URL. Пример: socks5://127.0.0.1:1080 или http://user:pass@1.2.3.4:3128');
  }

  const protocol = parsed.protocol.replace(':', '').toLowerCase();
  if (protocol === 'http' || protocol === 'https') return new HttpsProxyAgent(raw);
  if (['socks', 'socks4', 'socks4a', 'socks5', 'socks5h'].includes(protocol)) return new SocksProxyAgent(raw);

  throw new Error('Telegram Proxy поддерживает только http://, https://, socks4://, socks5:// или socks5h://');
}

function parseTelegramPlans() {
  const raw = String(getSetting('telegram_manager_plans_json', '[]') || '[]').trim();
  try {
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr)) return [];
    return arr.map((p, i) => ({
      key: String(p.key || `plan${i + 1}`).trim(),
      title: String(p.title || p.name || `Тариф ${i + 1}`).trim(),
      days: Math.max(0, Number(p.days || p.duration_days || 0)),
      price: Math.max(0, Number(p.price || p.price_rub || 0))
    })).filter(p => p.key && p.title);
  } catch (_) {
    return [];
  }
}

function telegramBaseIpLimit() {
  const n = Number(getSetting('telegram_manager_base_ip_limit', '2'));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2;
}

function telegramExtraIpPrice() {
  const n = Number(getSetting('telegram_manager_extra_ip_price_rub', '80'));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 80;
}

function telegramExpiryNoticeDays() {
  const n = Number(getSetting('telegram_manager_expiry_notice_days', '2'));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2;
}

function ruPlural(n, one, few, many) {
  const value = Math.abs(Number(n) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatDeviceLimit(n) {
  const value = Math.max(0, Number(n) || 0);
  return `${value} ${ruPlural(value, 'устройство', 'устройства', 'устройств')}`;
}

function areSubFormatLinksEnabled() {
  return getSetting('show_sub_links', '1') !== '0';
}

function telegramCopyButton(text, value, fallbackUrl = '') {
  const button = { text: String(text || '📋 Скопировать') };
  const copyText = String(value || '').trim();
  if (copyText) {
    // Bot API supports copy_text for inline buttons. The library forwards this
    // field as-is; older Telegram clients still see the plain text link in the message.
    button.copy_text = { text: copyText };
  } else if (fallbackUrl) {
    button.url = fallbackUrl;
  }
  return button;
}

function telegramAccessKeyboard(client) {
  const happUrl = buildPublicHappUrl(client.sub_slug);
  const inline = [
    [telegramCopyButton('📲 Подключить', happUrl, happUrl)]
  ];

  if (areSubFormatLinksEnabled()) {
    inline.push([
      { text: '📋 SUB', url: buildPublicSubUrl(client.sub_slug) },
      { text: '📋 JSON', url: buildPublicJsonUrl(client.sub_slug) }
    ]);
  }

  inline.push([{ text: '📡 Прокси для Telegram', callback_data: 'tg_mtproto' }]);

  return { inline_keyboard: inline };
}

function telegramReplyKeyboard(isAdmin) {
  if (isAdmin) {
    return {
      keyboard: [
        ['📊 Дашборд', '👥 Клиенты'],
        ['🔗 Привязать', '📤 Выдать доступ'],
        ['🆕 Заявки', '💬 Поддержка'],
        ['📢 Объявление', '💾 Бэкап'],
        ['🔑 Мой доступ', '📡 Прокси для Telegram'],
        ['ℹ️ Помощь']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    };
  }

  return {
    keyboard: [
      ['🌐 Подключить VPN'],
      ['🔑 Мой доступ', '💬 Поддержка'],
      ['📡 Прокси для Telegram'],
      ['📢 Статус сервиса', 'ℹ️ Инструкция']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function telegramClientDisplay(userRow) {
  const username = userRow?.username ? `@${userRow.username}` : '';
  const name = [userRow?.first_name, userRow?.last_name].filter(Boolean).join(' ').trim();
  return username || name || String(userRow?.telegram_id || 'пользователь');
}


function telegramUserDisplayShort(userRow) {
  const display = telegramClientDisplay(userRow);
  const id = String(userRow?.telegram_id || '').trim();
  const linked = userRow?.client_login || userRow?.login || '';
  const base = display === id ? `TG ${id}` : `${display} · ${id}`;
  return linked ? `${base} → ${linked}` : base;
}

function telegramUserFullInfo(userRow) {
  const clientPart = userRow?.client_id
    ? `Клиент: #${userRow.client_id} ${userRow.client_login || userRow.client_display_name || ''}`.trim()
    : 'Клиент: не привязан';
  return [
    `Пользователь: ${telegramClientDisplay(userRow)}`,
    `Telegram ID: ${userRow.telegram_id}`,
    clientPart,
    `Последний раз: ${userRow.last_seen_at || '-'}`
  ].join('\n');
}

function getTelegramBotUsers(limit = 15) {
  return db.prepare(`
    SELECT u.*, c.login AS client_login, c.display_name AS client_display_name
    FROM telegram_users u
    LEFT JOIN clients c ON c.id = u.client_id
    ORDER BY u.last_seen_at DESC
    LIMIT ?
  `).all(Number(limit) || 15);
}

function getTelegramUserWithClient(telegramId) {
  return db.prepare(`
    SELECT u.*, c.login AS client_login, c.display_name AS client_display_name
    FROM telegram_users u
    LEFT JOIN clients c ON c.id = u.client_id
    WHERE u.telegram_id = ?
  `).get(String(telegramId || '')) || null;
}

function telegramUsersInlineKeyboard(users, mode = 'bind') {
  const rows = [];
  for (const u of users.slice(0, 12)) {
    const tgId = String(u.telegram_id || '');
    const text = (mode === 'send')
      ? `📤 ${telegramUserDisplayShort(u)}`
      : `🔗 ${telegramUserDisplayShort(u)}`;
    rows.push([{ text: text.slice(0, 60), callback_data: `${mode === 'send' ? 'tg_access_user' : 'tg_bind_user'}:${tgId}` }]);
  }
  rows.push([{ text: '📋 Клиенты панели', callback_data: 'tg_clients_page:0' }]);
  return { inline_keyboard: rows };
}

async function telegramShowAdminUsers(chatId, mode = 'bind') {
  const users = getTelegramBotUsers(15);
  if (!users.length) {
    return telegramManagerBot.sendMessage(chatId, [
      mode === 'send' ? '📤 Выдать доступ' : '🔗 Привязать Telegram к клиенту',
      '',
      'Пока ни один клиент не запускал бота.',
      'Как только клиент нажмёт /start или любую кнопку, бот увидит его Telegram ID и покажет его здесь.',
      '',
      'Ручной вариант остаётся доступен: /bind TELEGRAM_ID CLIENT_ID_OR_LOGIN'
    ].join('\n'), { reply_markup: telegramReplyKeyboard(true) });
  }

  const title = mode === 'send' ? '📤 Выдать доступ пользователю' : '🔗 Привязать пользователя к клиенту';
  const body = users.map((u, idx) => `${idx + 1}. ${telegramUserFullInfo(u)}`).join('\n\n');
  return telegramManagerBot.sendMessage(chatId, [
    title,
    '',
    'Бот видит Telegram ID каждого пользователя, который хотя бы один раз открыл бота.',
    'Нажмите кнопку пользователя ниже — дальше выберите клиента из панели.',
    '',
    body
  ].join('\n'), { reply_markup: telegramUsersInlineKeyboard(users, mode), disable_web_page_preview: true });
}

function getClientPickerRows(page = 0, telegramId = '') {
  const safePage = Math.max(0, Number(page) || 0);
  const limit = 10;
  const offset = safePage * limit;
  const clients = db.prepare('SELECT id, login, display_name, enabled FROM clients ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
  const rows = clients.map(c => ([{
    text: `${c.enabled ? '🟢' : '🔴'} #${c.id} ${c.login}${c.display_name ? ' · ' + c.display_name : ''}`.slice(0, 60),
    callback_data: telegramId ? `tg_bind_client:${telegramId}:${c.id}` : `tg_client_info:${c.id}`
  }]));
  const nav = [];
  if (safePage > 0) nav.push({ text: '⬅️ Назад', callback_data: telegramId ? `tg_bind_page:${telegramId}:${safePage - 1}` : `tg_clients_page:${safePage - 1}` });
  if (offset + limit < total) nav.push({ text: '➡️ Далее', callback_data: telegramId ? `tg_bind_page:${telegramId}:${safePage + 1}` : `tg_clients_page:${safePage + 1}` });
  if (nav.length) rows.push(nav);
  return { clients, total, replyMarkup: { inline_keyboard: rows } };
}

async function telegramShowClientPicker(chatId, telegramId, page = 0) {
  const targetUser = getTelegramUserWithClient(telegramId);
  const { clients, total, replyMarkup } = getClientPickerRows(page, telegramId);
  if (!clients.length) {
    return telegramManagerBot.sendMessage(chatId, 'Клиентов в панели пока нет.', { reply_markup: telegramReplyKeyboard(true) });
  }
  return telegramManagerBot.sendMessage(chatId, [
    '🔗 Выбор клиента для привязки',
    '',
    targetUser ? telegramUserFullInfo(targetUser) : `Telegram ID: ${telegramId}`,
    '',
    `Клиентов в панели: ${total}`,
    'Нажмите клиента — бот привяжет Telegram ID и отправит доступ.'
  ].join('\n'), { reply_markup: replyMarkup, disable_web_page_preview: true });
}

async function telegramShowPanelClients(chatId, page = 0) {
  const { clients, total, replyMarkup } = getClientPickerRows(page, '');
  const body = clients.length
    ? clients.map(c => `#${c.id} ${c.enabled ? '🟢' : '🔴'} ${c.login}${c.display_name ? ' · ' + c.display_name : ''}`).join('\n')
    : 'Клиентов пока нет.';
  return telegramManagerBot.sendMessage(chatId, [
    '👥 Клиенты панели',
    '',
    body,
    '',
    `Всего: ${total}`,
    '',
    'Для привязки нажмите «🔗 Привязать» и выберите пользователя Telegram.'
  ].join('\n'), { reply_markup: replyMarkup });
}

async function telegramBindUserToClientAndSend(chatId, telegramId, clientId, queryId = '') {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(clientId));
  if (!client) throw new Error('Клиент не найден');
  bindTelegramUserToClient(telegramId, client);
  let sent = false;
  let sendError = '';
  try {
    await telegramSendAccessToUser(telegramId, client);
    sent = true;
  } catch (err) {
    sendError = String(err.message || err);
  }
  if (queryId) {
    try { await telegramManagerBot.answerCallbackQuery(queryId, { text: sent ? 'Привязано и отправлено' : 'Привязано, но отправка не удалась', show_alert: !sent }); } catch (_) {}
  }
  return telegramManagerBot.sendMessage(chatId, [
    `✅ Telegram ID ${telegramId} привязан к клиенту #${client.id} ${client.login}.`,
    sent ? 'Доступ отправлен пользователю в бот.' : `Отправить доступ не удалось: ${sendError}`,
    '',
    'Важно: пользователь должен открыть бота и не блокировать его.'
  ].join('\n'), { reply_markup: telegramReplyKeyboard(true) });
}

function touchTelegramUser(msg) {
  const from = msg.from || msg;
  const telegramId = String(from.id);
  const role = isTelegramManagerAdmin(telegramId) ? 'admin' : 'user';
  db.prepare(`
    INSERT INTO telegram_users (telegram_id, username, first_name, last_name, role, last_seen_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      role = excluded.role,
      last_seen_at = CURRENT_TIMESTAMP
  `).run(
    telegramId,
    String(from.username || ''),
    String(from.first_name || ''),
    String(from.last_name || ''),
    role
  );
  return db.prepare('SELECT * FROM telegram_users WHERE telegram_id = ?').get(telegramId);
}

function setTelegramUserState(telegramId, state = '', data = {}) {
  db.prepare('UPDATE telegram_users SET state = ?, state_data = ?, last_seen_at = CURRENT_TIMESTAMP WHERE telegram_id = ?')
    .run(String(state || ''), JSON.stringify(data || {}), String(telegramId));
}

function getTelegramUser(telegramId) {
  return db.prepare('SELECT * FROM telegram_users WHERE telegram_id = ?').get(String(telegramId));
}

function parseTelegramStateData(row) {
  try { return JSON.parse(row?.state_data || '{}') || {}; } catch (_) { return {}; }
}

function getClientForTelegramUser(telegramId) {
  const user = getTelegramUser(telegramId);
  if (!user?.client_id) return null;
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(user.client_id)) || null;
}

function formatClientAccess(client) {
  const now = Date.now();
  const expiry = Number(client.expiry_time || 0);
  const hasExpiry = Number.isFinite(expiry) && expiry > 0;
  const active = client.enabled !== 0 && (!hasExpiry || expiry > now);
  const leftDays = !hasExpiry ? '∞' : Math.max(0, Math.ceil((expiry - now) / 86400000));
  const expiryText = !hasExpiry ? '∞' : new Date(expiry).toLocaleString('ru-RU');
  const jsonUrl = buildPublicJsonUrl(client.sub_slug);
  const subUrl = buildPublicSubUrl(client.sub_slug);
  const happUrl = buildPublicHappUrl(client.sub_slug);
  const lines = [
    '🔑 Ваш VPN-доступ',
    '',
    `Статус: ${active ? '🟢 Активен' : '🔴 Неактивен / истёк'}`,
    `Имя: ${client.display_name || client.login}`,
    `Логин: ${client.login}`,
    `Осталось: ${leftDays} дн.`,
    `Дата окончания: ${expiryText}`,
    `Количество устройств: ${formatDeviceLimit(client.limit_ip || 0)}`,
    '',
    'Ваша HAPP-ссылка для приложения Happ:',
    happUrl,
    '',
    'Как подключить: нажмите «📲 Подключить», чтобы скопировать HAPP-ссылку, затем добавьте её в приложение Happ.',
    'Если кнопка копирования не поддерживается вашим Telegram — скопируйте ссылку из сообщения вручную.',
    'Если Telegram работает нестабильно — нажмите «📡 Прокси для Telegram».',
  ];

  if (areSubFormatLinksEnabled()) {
    lines.push(
      '',
      'Дополнительные форматы:',
      `SUB: ${subUrl}`,
      `JSON: ${jsonUrl}`
    );
  }

  return lines.join('\n');
}

function telegramAdminDashboardText() {
  const users = db.prepare('SELECT COUNT(*) AS c FROM telegram_users').get().c;
  const ordersNew = db.prepare("SELECT COUNT(*) AS c FROM telegram_orders WHERE status = 'new'").get().c;
  const ticketsOpen = db.prepare("SELECT COUNT(*) AS c FROM telegram_tickets WHERE status = 'open'").get().c;
  const clients = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
  const activeClients = db.prepare('SELECT COUNT(*) AS c FROM clients WHERE enabled = 1').get().c;
  const nodes = db.prepare('SELECT COUNT(*) AS c FROM nodes').get().c;
  const onlineNodes = db.prepare("SELECT COUNT(*) AS c FROM nodes WHERE last_status = 'online'").get().c;

  return [
    '👑 Админ-панель',
    '',
    `Пользователей в боте: ${users}`,
    `Клиентов в панели: ${clients}`,
    `Активных клиентов: ${activeClients}`,
    `Узлов: ${nodes}`,
    `Узлов online: ${onlineNodes}`,
    `Новых заявок: ${ordersNew}`,
    `Открытых обращений: ${ticketsOpen}`,
    '',
    'Основное управление теперь доступно кнопками:',
    '🔗 Привязать — выбрать Telegram-пользователя и клиента из списка',
    '📤 Выдать доступ — повторно отправить доступ привязанному клиенту',
    '🆕 Заявки — закрыть, удалить или привязать заявку кнопками',
    '💬 Поддержка — ответить или закрыть обращение кнопками',
    '📢 Объявление — ввести текст рассылки следующим сообщением',
    '',
    'Ручные команды тоже работают: /bind, /sendaccess, /orders, /reply, /announce.'
  ].join('\n');
}

async function telegramSendToAdmins(text, extra = {}) {
  if (!telegramManagerBot) return;
  for (const adminId of parseTelegramAdminIds()) {
    try { await telegramManagerBot.sendMessage(adminId, text, extra); } catch (err) { console.warn('telegram admin send failed:', err.message || err); }
  }
}

async function telegramShowPlans(chatId) {
  const plans = parseTelegramPlans();
  if (!plans.length) {
    return telegramManagerBot.sendMessage(chatId, 'Тарифы пока не настроены. Напишите в поддержку.', { reply_markup: telegramReplyKeyboard(false) });
  }

  const rows = plans.map(p => [{ text: `${p.title} · ${p.price} ₽`, callback_data: `tg_buy_plan:${p.key}` }]);
  const text = ['💎 Тарифы', '', ...plans.map(p => `• ${p.title}: ${p.price} ₽${p.days ? ` / ${p.days} дн.` : ''}`), '', 'Выберите тариф:'].join('\n');
  return telegramManagerBot.sendMessage(chatId, text, { reply_markup: { inline_keyboard: rows } });
}

async function telegramShowMyAccess(chatId, user) {
  const client = getClientForTelegramUser(user.telegram_id);
  if (!client) {
    return telegramManagerBot.sendMessage(chatId, 'У вас пока нет привязанной подписки. Нажмите «🌐 Подключить VPN» или напишите в поддержку.', { reply_markup: telegramReplyKeyboard(false) });
  }

  return telegramManagerBot.sendMessage(chatId, formatClientAccess(client), { reply_markup: telegramAccessKeyboard(client), disable_web_page_preview: true });
}

function bindTelegramUserToClient(telegramId, client) {
  const id = String(telegramId || '').trim();
  if (!id) throw new Error('Telegram ID не указан');
  if (!client?.id) throw new Error('Клиент не найден');

  const exists = db.prepare('SELECT telegram_id FROM telegram_users WHERE telegram_id = ?').get(id);
  if (exists) {
    db.prepare('UPDATE telegram_users SET client_id = ?, last_seen_at = CURRENT_TIMESTAMP WHERE telegram_id = ?').run(client.id, id);
  } else {
    db.prepare('INSERT INTO telegram_users (telegram_id, client_id, last_seen_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(id, client.id);
  }
  db.prepare("UPDATE telegram_orders SET status = 'done', updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ? AND status = 'new'").run(id);
}

async function telegramSendAccessToUser(telegramId, client = null, intro = '✅ Ваш VPN-доступ активирован.') {
  if (!telegramManagerBot) throw new Error('Telegram-бот не запущен');
  const id = String(telegramId || '').trim();
  const targetClient = client || getClientForTelegramUser(id);
  if (!targetClient) throw new Error('У пользователя нет привязанного клиента');

  const text = [
    intro,
    '',
    formatClientAccess(targetClient)
  ].filter(Boolean).join('\n');

  await telegramManagerBot.sendMessage(id, text, { reply_markup: telegramAccessKeyboard(targetClient), disable_web_page_preview: true });
}

async function telegramSendMtproto(chatId, isAdmin = false) {
  const body = String(getSetting('telegram_manager_mtproto_text', '') || '').trim();
  const text = body || '📡 Telegram-прокси пока не настроен. Напишите в поддержку.';
  return telegramManagerBot.sendMessage(chatId, text, { reply_markup: telegramReplyKeyboard(isAdmin), disable_web_page_preview: true });
}

function findClientByIdOrLogin(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const byId = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(raw));
    if (byId) return byId;
  }
  return db.prepare('SELECT * FROM clients WHERE LOWER(login) = LOWER(?) OR LOWER(display_name) = LOWER(?)').get(raw, raw) || null;
}

function formatTelegramOrderLine(order) {
  const userLabel = order.username || order.first_name || order.last_name
    ? `${telegramClientDisplay(order)} · TG ${order.telegram_id}`
    : `TG ${order.telegram_id}`;
  return [
    `#${order.id} · ${order.status} · ${userLabel}`,
    `${order.plan_title || 'Тариф не указан'}, устройств: ${formatDeviceLimit(order.ip_limit)}, ${order.price_rub} ₽`,
    order.client_id ? `Уже привязан к клиенту #${order.client_id}` : 'Клиент ещё не привязан',
    `Создано: ${order.created_at || '-'}`
  ].join('\n');
}

function telegramOrdersInlineKeyboard(orders) {
  const rows = [];
  for (const order of orders.slice(0, 10)) {
    rows.push([{ text: `🔗 Привязать заявку #${order.id}`, callback_data: `tg_order_bind:${order.id}` }]);
    rows.push([
      { text: `✅ Закрыть #${order.id}`, callback_data: `tg_order_done:${order.id}` },
      { text: `🚫 Отменить #${order.id}`, callback_data: `tg_order_cancel:${order.id}` },
      { text: `🗑 Удалить #${order.id}`, callback_data: `tg_order_delete:${order.id}` }
    ]);
  }
  return rows.length ? { inline_keyboard: rows } : undefined;
}

async function telegramSendOrdersList(chatId) {
  const rows = db.prepare(`
    SELECT o.*, u.username, u.first_name, u.last_name, u.client_id
    FROM telegram_orders o
    LEFT JOIN telegram_users u ON u.telegram_id = o.telegram_id
    ORDER BY o.id DESC
    LIMIT 15
  `).all();
  const body = rows.length ? rows.map(formatTelegramOrderLine).join('\n\n') : 'Новых заявок нет.';
  const extra = rows.length ? { reply_markup: telegramOrdersInlineKeyboard(rows) } : { reply_markup: telegramReplyKeyboard(true) };
  return telegramManagerBot.sendMessage(chatId, [
    '🆕 Заявки',
    '',
    body,
    '',
    'Нажмите «🔗 Привязать заявку», затем выберите клиента. Telegram ID уже взят из заявки.'
  ].join('\n'), extra);
}

function deleteTelegramOrder(id) {
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) throw new Error('Неверный ID заявки');
  const info = db.prepare('DELETE FROM telegram_orders WHERE id = ?').run(orderId);
  if (!info.changes) throw new Error('Заявка не найдена');
  return orderId;
}

function updateTelegramOrderStatus(id, status) {
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) throw new Error('Неверный ID заявки');
  const normalized = String(status || '').trim();
  if (!['new', 'done', 'cancelled'].includes(normalized)) throw new Error('Неверный статус заявки');
  const info = db.prepare('UPDATE telegram_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(normalized, orderId);
  if (!info.changes) throw new Error('Заявка не найдена');
  return orderId;
}

async function telegramSendBackupLink(chatId) {
  const url = buildTelegramBackupDownloadUrl();
  return telegramManagerBot.sendMessage(chatId, [
    '💾 Бэкап панели',
    '',
    'Ссылка действует 10 минут и не требует отдельного входа в панель:',
    url,
    '',
    'Обычная ссылка для авторизованной панели:',
    `${getPanelPublicUrl()}/backup/download`
  ].join('\n'), { reply_markup: telegramReplyKeyboard(true), disable_web_page_preview: true });
}

async function telegramHandleCommand(msg, user, text) {
  const chatId = msg.chat.id;
  const isAdmin = isTelegramManagerAdmin(user.telegram_id);

  if (text.startsWith('/start')) {
    const welcome = getSetting('telegram_manager_welcome_text', 'Добро пожаловать!');
    return telegramManagerBot.sendMessage(chatId, welcome, { reply_markup: telegramReplyKeyboard(isAdmin) });
  }

  if (text.startsWith('/bind') && isAdmin) {
    const parts = text.split(/\s+/);
    if (parts.length < 3) return telegramManagerBot.sendMessage(chatId, 'Формат: /bind TELEGRAM_ID CLIENT_ID_OR_LOGIN');
    const telegramId = String(parts[1]).trim();
    const client = findClientByIdOrLogin(parts.slice(2).join(' '));
    if (!client) return telegramManagerBot.sendMessage(chatId, 'Клиент не найден в агрегаторе.');
    bindTelegramUserToClient(telegramId, client);
    try {
      await telegramSendAccessToUser(telegramId, client);
      return telegramManagerBot.sendMessage(chatId, `Готово. Telegram ID ${telegramId} привязан к клиенту ${client.login}, доступ отправлен в бот.`);
    } catch (err) {
      return telegramManagerBot.sendMessage(chatId, `Клиент привязан, но отправить доступ не удалось: ${err.message || err}. Проверьте, что пользователь запускал бота и не заблокировал его.`);
    }
  }

  if (text.startsWith('/sendaccess') && isAdmin) {
    const parts = text.split(/\s+/);
    if (parts.length < 2) return telegramManagerBot.sendMessage(chatId, 'Формат: /sendaccess TELEGRAM_ID [CLIENT_ID_OR_LOGIN]');
    const telegramId = String(parts[1]).trim();
    let client = null;
    if (parts.length >= 3) {
      client = findClientByIdOrLogin(parts.slice(2).join(' '));
      if (!client) return telegramManagerBot.sendMessage(chatId, 'Клиент не найден в агрегаторе.');
      bindTelegramUserToClient(telegramId, client);
    } else {
      client = getClientForTelegramUser(telegramId);
      if (!client) return telegramManagerBot.sendMessage(chatId, 'У этого Telegram ID нет привязанного клиента. Используйте /sendaccess TELEGRAM_ID CLIENT_ID_OR_LOGIN.');
    }
    try {
      await telegramSendAccessToUser(telegramId, client);
      return telegramManagerBot.sendMessage(chatId, `Доступ отправлен Telegram ID ${telegramId}.`);
    } catch (err) {
      return telegramManagerBot.sendMessage(chatId, `Не удалось отправить доступ: ${err.message || err}. Пользователь должен хотя бы один раз открыть бота и не блокировать его.`);
    }
  }

  if (text === '/orders' && isAdmin) {
    return telegramSendOrdersList(chatId);
  }

  if (text.startsWith('/delorder') && isAdmin) {
    const id = Number(text.split(/\s+/)[1]);
    try {
      deleteTelegramOrder(id);
      return telegramManagerBot.sendMessage(chatId, `Заявка #${id} удалена.`, { reply_markup: telegramReplyKeyboard(true) });
    } catch (err) {
      return telegramManagerBot.sendMessage(chatId, err.message || String(err));
    }
  }

  if (text.startsWith('/orderdone') && isAdmin) {
    const id = Number(text.split(/\s+/)[1]);
    try {
      updateTelegramOrderStatus(id, 'done');
      return telegramManagerBot.sendMessage(chatId, `Заявка #${id} закрыта как обработанная.`, { reply_markup: telegramReplyKeyboard(true) });
    } catch (err) {
      return telegramManagerBot.sendMessage(chatId, err.message || String(err));
    }
  }

  if (text.startsWith('/ordercancel') && isAdmin) {
    const id = Number(text.split(/\s+/)[1]);
    try {
      updateTelegramOrderStatus(id, 'cancelled');
      return telegramManagerBot.sendMessage(chatId, `Заявка #${id} отменена.`, { reply_markup: telegramReplyKeyboard(true) });
    } catch (err) {
      return telegramManagerBot.sendMessage(chatId, err.message || String(err));
    }
  }

  if (text.startsWith('/reply') && isAdmin) {
    const m = text.match(/^\/reply\s+(\d+)\s+([\s\S]+)/);
    if (!m) return telegramManagerBot.sendMessage(chatId, 'Формат: /reply TICKET_ID текст ответа');
    const ticket = db.prepare('SELECT * FROM telegram_tickets WHERE id = ?').get(Number(m[1]));
    if (!ticket) return telegramManagerBot.sendMessage(chatId, 'Обращение не найдено.');
    db.prepare('INSERT INTO telegram_ticket_messages (ticket_id, telegram_id, from_admin, message_text) VALUES (?, ?, 1, ?)').run(ticket.id, String(chatId), m[2]);
    db.prepare('UPDATE telegram_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(ticket.id);
    await telegramManagerBot.sendMessage(ticket.telegram_id, `💬 Ответ поддержки:\n\n${m[2]}`, { reply_markup: telegramReplyKeyboard(false) });
    return telegramManagerBot.sendMessage(chatId, 'Ответ отправлен.');
  }

  if (text.startsWith('/close') && isAdmin) {
    const id = Number(text.split(/\s+/)[1]);
    if (!id) return telegramManagerBot.sendMessage(chatId, 'Формат: /close TICKET_ID');
    const ticket = db.prepare('SELECT * FROM telegram_tickets WHERE id = ?').get(id);
    if (!ticket) return telegramManagerBot.sendMessage(chatId, 'Обращение не найдено.');
    db.prepare("UPDATE telegram_tickets SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    try { await telegramManagerBot.sendMessage(ticket.telegram_id, '✅ Обращение закрыто.'); } catch (_) {}
    return telegramManagerBot.sendMessage(chatId, 'Обращение закрыто.');
  }

  if (text.startsWith('/announce') && isAdmin) {
    const body = text.replace(/^\/announce\s*/i, '').trim();
    if (!body) return telegramManagerBot.sendMessage(chatId, 'Формат: /announce текст объявления');
    const users = db.prepare('SELECT telegram_id FROM telegram_users').all();
    let sent = 0;
    for (const row of users) {
      try { await telegramManagerBot.sendMessage(row.telegram_id, `📢 Объявление\n\n${body}`); sent++; } catch (_) {}
    }
    db.prepare('INSERT INTO telegram_announcements (text, sent_count) VALUES (?, ?)').run(body, sent);
    setSetting('telegram_manager_status_text', body);
    return telegramManagerBot.sendMessage(chatId, `Рассылка завершена. Отправлено: ${sent}`);
  }

  if (text.startsWith('/help')) {
    const help = isAdmin
      ? telegramAdminDashboardText()
      : 'Нажмите «🌐 Подключить VPN», чтобы оставить заявку, «🔑 Мой доступ», чтобы посмотреть подписку, «📡 Прокси для Telegram» для резервной связи или «💬 Поддержка», чтобы написать администратору.';
    return telegramManagerBot.sendMessage(chatId, help, { reply_markup: telegramReplyKeyboard(isAdmin) });
  }
}

async function telegramHandleSupportText(msg, user, text) {
  let ticket = db.prepare("SELECT * FROM telegram_tickets WHERE telegram_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1").get(user.telegram_id);
  if (!ticket) {
    const info = db.prepare('INSERT INTO telegram_tickets (telegram_id) VALUES (?)').run(user.telegram_id);
    ticket = db.prepare('SELECT * FROM telegram_tickets WHERE id = ?').get(info.lastInsertRowid);
  }

  db.prepare('INSERT INTO telegram_ticket_messages (ticket_id, telegram_id, from_admin, message_text) VALUES (?, ?, 0, ?)').run(ticket.id, user.telegram_id, text);
  db.prepare('UPDATE telegram_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(ticket.id);
  setTelegramUserState(user.telegram_id, '', {});

  await telegramManagerBot.sendMessage(msg.chat.id, '✅ Сообщение отправлено в поддержку. Мы скоро ответим.', { reply_markup: telegramReplyKeyboard(false) });
  await telegramSendToAdmins([
    `💬 Обращение #${ticket.id}`,
    '',
    `От: ${telegramClientDisplay(user)}`,
    `Telegram ID: ${user.telegram_id}`,
    '',
    text,
    '',
    'Откройте «💬 Поддержка», чтобы ответить кнопкой.',
    `Ручной ответ: /reply ${ticket.id} текст`,
    `Закрыть: /close ${ticket.id}`
  ].join('\n'));
}


async function telegramHandleAdminReplyText(msg, user, text) {
  const stateData = parseTelegramStateData(user);
  const ticketId = Number(stateData.ticketId || 0);
  const ticket = db.prepare('SELECT * FROM telegram_tickets WHERE id = ?').get(ticketId);
  if (!ticket) {
    setTelegramUserState(user.telegram_id, '', {});
    return telegramManagerBot.sendMessage(msg.chat.id, 'Обращение не найдено. Режим ответа сброшен.', { reply_markup: telegramReplyKeyboard(true) });
  }
  db.prepare('INSERT INTO telegram_ticket_messages (ticket_id, telegram_id, from_admin, message_text) VALUES (?, ?, 1, ?)').run(ticket.id, String(msg.chat.id), text);
  db.prepare('UPDATE telegram_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(ticket.id);
  setTelegramUserState(user.telegram_id, '', {});
  await telegramManagerBot.sendMessage(ticket.telegram_id, `💬 Ответ поддержки:\n\n${text}`, { reply_markup: telegramReplyKeyboard(false) });
  return telegramManagerBot.sendMessage(msg.chat.id, `✅ Ответ по обращению #${ticket.id} отправлен.`, { reply_markup: telegramReplyKeyboard(true) });
}

async function telegramHandleAdminAnnouncementText(msg, user, text) {
  const body = String(text || '').trim();
  if (!body) return telegramManagerBot.sendMessage(msg.chat.id, 'Текст объявления пустой. Отправьте текст или нажмите другую кнопку меню.', { reply_markup: telegramReplyKeyboard(true) });
  const users = db.prepare('SELECT telegram_id FROM telegram_users').all();
  let sent = 0;
  for (const row of users) {
    try { await telegramManagerBot.sendMessage(row.telegram_id, `📢 Объявление\n\n${body}`); sent++; } catch (_) {}
  }
  db.prepare('INSERT INTO telegram_announcements (text, sent_count) VALUES (?, ?)').run(body, sent);
  setSetting('telegram_manager_status_text', body);
  setTelegramUserState(user.telegram_id, '', {});
  return telegramManagerBot.sendMessage(msg.chat.id, `✅ Рассылка завершена. Отправлено: ${sent}`, { reply_markup: telegramReplyKeyboard(true) });
}

function telegramSupportInlineKeyboard(tickets) {
  const rows = [];
  for (const t of tickets.slice(0, 10)) {
    rows.push([
      { text: `✍️ Ответить #${t.id}`, callback_data: `tg_ticket_reply:${t.id}` },
      { text: `✅ Закрыть #${t.id}`, callback_data: `tg_ticket_close:${t.id}` }
    ]);
  }
  return rows.length ? { inline_keyboard: rows } : telegramReplyKeyboard(true);
}

async function telegramShowSupportTickets(chatId) {
  const rows = db.prepare(`
    SELECT t.*, u.username, u.first_name, u.last_name, u.client_id
    FROM telegram_tickets t
    LEFT JOIN telegram_users u ON u.telegram_id = t.telegram_id
    WHERE t.status = 'open'
    ORDER BY t.id DESC
    LIMIT 15
  `).all();
  const body = rows.length
    ? rows.map(t => `#${t.id} · ${telegramClientDisplay(t)} · TG ${t.telegram_id}\nОбновлено: ${t.updated_at}`).join('\n\n')
    : 'Открытых обращений нет.';
  return telegramManagerBot.sendMessage(chatId, [
    '💬 Поддержка',
    '',
    body,
    '',
    rows.length ? 'Нажмите «Ответить», затем отправьте текст одним сообщением.' : ''
  ].filter(Boolean).join('\n'), { reply_markup: telegramSupportInlineKeyboard(rows) });
}

function registerTelegramManagerHandlers(botInstance) {
  botInstance.on('message', async msg => {
    try {
      if (!msg.text) return;
      const user = touchTelegramUser(msg);
      const chatId = msg.chat.id;
      const text = String(msg.text || '').trim();
      const isAdmin = isTelegramManagerAdmin(user.telegram_id);

      if (text.startsWith('/')) return telegramHandleCommand(msg, user, text);

      if (isAdmin && user.state === 'admin_reply_ticket') return telegramHandleAdminReplyText(msg, user, text);
      if (isAdmin && user.state === 'admin_announce') return telegramHandleAdminAnnouncementText(msg, user, text);
      if (user.state === 'support') return telegramHandleSupportText(msg, user, text);

      if (text === '🌐 Подключить VPN') return telegramShowPlans(chatId);
      if (text === '🔑 Мой доступ') return telegramShowMyAccess(chatId, user);
      if (text === '📡 Прокси для Telegram') return telegramSendMtproto(chatId, isAdmin);
      if (text === '💬 Поддержка' && !isAdmin) {
        setTelegramUserState(user.telegram_id, 'support', {});
        return botInstance.sendMessage(chatId, 'Опишите вашу проблему одним сообщением. Я передам её администратору.', { reply_markup: telegramReplyKeyboard(isAdmin) });
      }
      if (text === '📢 Статус сервиса') return botInstance.sendMessage(chatId, `📢 Статус сервиса\n\n${getSetting('telegram_manager_status_text', 'Сервис работает.')}`, { reply_markup: telegramReplyKeyboard(isAdmin) });
      if (text === 'ℹ️ Инструкция') return botInstance.sendMessage(chatId, getSetting('telegram_manager_instruction_text', ''), { reply_markup: telegramReplyKeyboard(isAdmin) });

      if (isAdmin) {
        if (text === '📊 Дашборд') return botInstance.sendMessage(chatId, telegramAdminDashboardText(), { reply_markup: telegramReplyKeyboard(true) });
        if (text === '👥 Клиенты' || text === '🔗 Привязать') return telegramShowAdminUsers(chatId, 'bind');
        if (text === '📤 Выдать доступ') return telegramShowAdminUsers(chatId, 'send');
        if (text === '🆕 Заявки') return telegramSendOrdersList(chatId);
        if (text === '💬 Поддержка') return telegramShowSupportTickets(chatId);
        if (text === '📢 Объявление') {
          setTelegramUserState(user.telegram_id, 'admin_announce', {});
          return botInstance.sendMessage(chatId, '📢 Отправьте текст объявления следующим сообщением. Бот разошлёт его всем пользователям.', { reply_markup: telegramReplyKeyboard(true) });
        }
        if (text === '💾 Бэкап') return telegramSendBackupLink(chatId);
      }

      return botInstance.sendMessage(chatId, 'Выберите действие в меню.', { reply_markup: telegramReplyKeyboard(isAdmin) });
    } catch (err) {
      console.error('telegram manager message failed:', err);
      try { await telegramManagerBot.sendMessage(msg.chat.id, 'Ошибка обработки сообщения. Администратор уже может посмотреть логи сервера.'); } catch (_) {}
    }
  });

  botInstance.on('callback_query', async query => {
    try {
      const user = touchTelegramUser(query.from);
      const data = String(query.data || '');
      const chatId = query.message.chat.id;
      const isAdmin = isTelegramManagerAdmin(user.telegram_id);

      if (data === 'tg_mtproto') {
        await telegramSendMtproto(chatId, isAdmin);
        return botInstance.answerCallbackQuery(query.id);
      }

      if (data === 'tg_state_clear') {
        setTelegramUserState(user.telegram_id, '', {});
        await botInstance.answerCallbackQuery(query.id, { text: 'Отменено' });
        return botInstance.sendMessage(chatId, 'Действие отменено.', { reply_markup: telegramReplyKeyboard(isAdmin) });
      }

      if (data.startsWith('tg_bind_user:') && isAdmin) {
        const telegramId = data.split(':')[1];
        await botInstance.answerCallbackQuery(query.id);
        return telegramShowClientPicker(chatId, telegramId, 0);
      }

      if (data.startsWith('tg_access_user:') && isAdmin) {
        const telegramId = data.split(':')[1];
        const client = getClientForTelegramUser(telegramId);
        if (!client) return botInstance.answerCallbackQuery(query.id, { text: 'У пользователя нет привязанного клиента', show_alert: true });
        try {
          await telegramSendAccessToUser(telegramId, client);
          await botInstance.answerCallbackQuery(query.id, { text: 'Доступ отправлен' });
          return botInstance.sendMessage(chatId, `✅ Доступ отправлен Telegram ID ${telegramId}.`, { reply_markup: telegramReplyKeyboard(true) });
        } catch (err) {
          return botInstance.answerCallbackQuery(query.id, { text: err.message || 'Ошибка отправки', show_alert: true });
        }
      }

      if (data.startsWith('tg_bind_page:') && isAdmin) {
        const parts = data.split(':');
        await botInstance.answerCallbackQuery(query.id);
        return telegramShowClientPicker(chatId, parts[1], Number(parts[2] || 0));
      }

      if (data.startsWith('tg_bind_client:') && isAdmin) {
        const parts = data.split(':');
        return telegramBindUserToClientAndSend(chatId, parts[1], Number(parts[2]), query.id);
      }

      if (data.startsWith('tg_clients_page:') && isAdmin) {
        const page = Number(data.split(':')[1] || 0);
        await botInstance.answerCallbackQuery(query.id);
        return telegramShowPanelClients(chatId, page);
      }

      if (data.startsWith('tg_client_info:') && isAdmin) {
        const clientId = Number(data.split(':')[1]);
        const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
        if (!client) return botInstance.answerCallbackQuery(query.id, { text: 'Клиент не найден', show_alert: true });
        await botInstance.answerCallbackQuery(query.id);
        return botInstance.sendMessage(chatId, formatClientAccess(client), { reply_markup: telegramAccessKeyboard(client), disable_web_page_preview: true });
      }

      if (data.startsWith('tg_order_bind:') && isAdmin) {
        const orderId = Number(data.split(':')[1]);
        const order = db.prepare('SELECT * FROM telegram_orders WHERE id = ?').get(orderId);
        if (!order) return botInstance.answerCallbackQuery(query.id, { text: 'Заявка не найдена', show_alert: true });
        await botInstance.answerCallbackQuery(query.id);
        await botInstance.sendMessage(chatId, `🔗 Привязка заявки #${order.id}\nTelegram ID: ${order.telegram_id}\nТариф: ${order.plan_title || '-'}\nУстройств: ${formatDeviceLimit(order.ip_limit)}\n\nВыберите клиента:`);
        return telegramShowClientPicker(chatId, order.telegram_id, 0);
      }

      if (data.startsWith('tg_order_cancel:') && isAdmin) {
        const id = Number(data.split(':')[1]);
        try {
          updateTelegramOrderStatus(id, 'cancelled');
          await botInstance.answerCallbackQuery(query.id, { text: `Заявка #${id} отменена` });
          return telegramSendOrdersList(chatId);
        } catch (err) {
          return botInstance.answerCallbackQuery(query.id, { text: err.message || 'Ошибка изменения заявки', show_alert: true });
        }
      }

      if (data.startsWith('tg_ticket_reply:') && isAdmin) {
        const id = Number(data.split(':')[1]);
        const ticket = db.prepare('SELECT * FROM telegram_tickets WHERE id = ?').get(id);
        if (!ticket) return botInstance.answerCallbackQuery(query.id, { text: 'Обращение не найдено', show_alert: true });
        setTelegramUserState(user.telegram_id, 'admin_reply_ticket', { ticketId: id });
        await botInstance.answerCallbackQuery(query.id, { text: `Ответ на #${id}` });
        return botInstance.sendMessage(chatId, `✍️ Напишите ответ для обращения #${id} следующим сообщением.`, {
          reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'tg_state_clear' }]] }
        });
      }

      if (data.startsWith('tg_ticket_close:') && isAdmin) {
        const id = Number(data.split(':')[1]);
        const ticket = db.prepare('SELECT * FROM telegram_tickets WHERE id = ?').get(id);
        if (!ticket) return botInstance.answerCallbackQuery(query.id, { text: 'Обращение не найдено', show_alert: true });
        db.prepare("UPDATE telegram_tickets SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
        try { await telegramManagerBot.sendMessage(ticket.telegram_id, '✅ Обращение закрыто.'); } catch (_) {}
        await botInstance.answerCallbackQuery(query.id, { text: `Обращение #${id} закрыто` });
        return telegramShowSupportTickets(chatId);
      }

      if (data.startsWith('tg_order_delete:') && isAdmin) {
        const id = Number(data.split(':')[1]);
        try {
          deleteTelegramOrder(id);
          await botInstance.answerCallbackQuery(query.id, { text: `Заявка #${id} удалена` });
          return telegramSendOrdersList(chatId);
        } catch (err) {
          return botInstance.answerCallbackQuery(query.id, { text: err.message || 'Ошибка удаления', show_alert: true });
        }
      }

      if (data.startsWith('tg_order_done:') && isAdmin) {
        const id = Number(data.split(':')[1]);
        try {
          updateTelegramOrderStatus(id, 'done');
          await botInstance.answerCallbackQuery(query.id, { text: `Заявка #${id} закрыта` });
          return telegramSendOrdersList(chatId);
        } catch (err) {
          return botInstance.answerCallbackQuery(query.id, { text: err.message || 'Ошибка изменения заявки', show_alert: true });
        }
      }

      if (data.startsWith('tg_buy_plan:')) {
        const planKey = data.split(':')[1];
        const plan = parseTelegramPlans().find(p => p.key === planKey);
        if (!plan) return botInstance.answerCallbackQuery(query.id, { text: 'Тариф не найден', show_alert: true });
        setTelegramUserState(user.telegram_id, 'buy_ip', { planKey });
        const base = telegramBaseIpLimit();
        const rows = [[base, base + 1], [base + 2, base + 3], [base + 4].filter(Boolean)]
          .filter(r => r.length)
          .map(r => r.map(ip => ({ text: formatDeviceLimit(ip), callback_data: `tg_buy_ip:${ip}` })));
        await botInstance.sendMessage(chatId, `Вы выбрали: ${plan.title}\nБазово включено: ${formatDeviceLimit(base)}\nДополнительное устройство: ${telegramExtraIpPrice()} ₽\n\nВыберите количество устройств:`, { reply_markup: { inline_keyboard: rows } });
        return botInstance.answerCallbackQuery(query.id);
      }

      if (data.startsWith('tg_buy_ip:')) {
        const ipLimit = Math.max(1, Number(data.split(':')[1] || telegramBaseIpLimit()));
        const state = parseTelegramStateData(user);
        const plan = parseTelegramPlans().find(p => p.key === state.planKey);
        if (!plan) return botInstance.answerCallbackQuery(query.id, { text: 'Тариф не найден', show_alert: true });
        const extra = Math.max(0, ipLimit - telegramBaseIpLimit()) * telegramExtraIpPrice();
        const price = Math.round(plan.price + extra);
        const info = db.prepare(`
          INSERT INTO telegram_orders (telegram_id, plan_key, plan_title, duration_days, price_rub, ip_limit, status)
          VALUES (?, ?, ?, ?, ?, ?, 'new')
        `).run(user.telegram_id, plan.key, plan.title, plan.days, price, ipLimit);
        setTelegramUserState(user.telegram_id, '', {});
        await botInstance.sendMessage(chatId, `✅ Заявка создана.\n\nТариф: ${plan.title}\nКоличество устройств: ${formatDeviceLimit(ipLimit)}\nСтоимость: ${price} ₽\n\nПосле оплаты администратор выдаст доступ прямо здесь, в этом боте. Даже если у вас закрыты личные сообщения, не блокируйте бота — ссылка подписки придёт сюда.\n\nДля постоянной связи нажмите «📡 Прокси для Telegram».`, { reply_markup: telegramReplyKeyboard(false) });
        await telegramSendToAdmins([
          `🆕 Новая заявка #${info.lastInsertRowid}`,
          '',
          `Пользователь: ${telegramClientDisplay(user)}`,
          `Telegram ID: ${user.telegram_id}`,
          `Тариф: ${plan.title}`,
          `Количество устройств: ${formatDeviceLimit(ipLimit)}`,
          `Цена: ${price} ₽`,
          '',
          `После оплаты привяжите и сразу отправьте доступ командой:`,
          `/bind ${user.telegram_id} CLIENT_ID_OR_LOGIN`,
          '',
          'Если личные сообщения пользователя закрыты, не пишите в личку: бот сам отправит доступ сюда.'
        ].join('\n'));
        return botInstance.answerCallbackQuery(query.id, { text: 'Заявка создана' });
      }
    } catch (err) {
      console.error('telegram manager callback failed:', err);
      try { await telegramManagerBot.answerCallbackQuery(query.id, { text: 'Ошибка', show_alert: true }); } catch (_) {}
    }
  });
}


let telegramExpiryNoticeTimer = null;

function stopTelegramExpiryNoticeTimer() {
  if (telegramExpiryNoticeTimer) clearInterval(telegramExpiryNoticeTimer);
  telegramExpiryNoticeTimer = null;
}

function startTelegramExpiryNoticeTimer() {
  stopTelegramExpiryNoticeTimer();
  setTimeout(() => telegramCheckExpiryNotices().catch(err => console.warn('telegram expiry notices failed:', err.message || err)), 15000);
  telegramExpiryNoticeTimer = setInterval(() => {
    telegramCheckExpiryNotices().catch(err => console.warn('telegram expiry notices failed:', err.message || err));
  }, 6 * 60 * 60 * 1000);
}

async function telegramCheckExpiryNotices() {
  if (!telegramManagerBot || !telegramManagerStarted) return;
  const days = telegramExpiryNoticeDays();
  const now = Date.now();
  const thresholdMs = days * 86400000;
  const today = new Date(now).toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT u.telegram_id, u.last_expiry_notice_key, c.*
    FROM telegram_users u
    JOIN clients c ON c.id = u.client_id
    WHERE c.enabled = 1 AND c.expiry_time > 0
  `).all();

  for (const row of rows) {
    const leftMs = Number(row.expiry_time || 0) - now;
    if (leftMs <= 0 || leftMs > thresholdMs) continue;
    const leftDays = Math.max(1, Math.ceil(leftMs / 86400000));
    const key = `${row.id}:${leftDays}:${today}`;
    if (row.last_expiry_notice_key === key) continue;
    try {
      await telegramManagerBot.sendMessage(row.telegram_id, [
        '⏳ Напоминание о продлении',
        '',
        `Ваш VPN-доступ заканчивается через ${leftDays} ${ruPlural(leftDays, 'день', 'дня', 'дней')}.`,
        `Логин: ${row.login}`,
        `Количество устройств: ${formatDeviceLimit(row.limit_ip || 0)}`,
        '',
        'Чтобы продлить доступ, напишите в поддержку или оставьте новую заявку через «🌐 Подключить VPN».',
        'Для постоянной связи используйте «📡 Прокси для Telegram».'
      ].join('\n'), { reply_markup: telegramReplyKeyboard(false) });
      db.prepare('UPDATE telegram_users SET last_expiry_notice_key = ? WHERE telegram_id = ?').run(key, row.telegram_id);
    } catch (err) {
      console.warn('telegram expiry notice send failed:', row.telegram_id, err.message || err);
    }
  }
}

function startTelegramManagerBot() {
  const enabled = getSetting('telegram_manager_enabled', '0') === '1';
  const token = String(getSetting('telegram_manager_bot_token', '') || '').trim();
  const proxyUrl = getTelegramProxyUrl();

  if (!enabled || !token) {
    stopTelegramManagerBot();
    return;
  }

  if (telegramManagerBot && telegramManagerStarted && telegramManagerToken === token && telegramManagerProxyUrl === proxyUrl) return;
  stopTelegramManagerBot();

  try {
    const proxyAgent = buildTelegramProxyAgent(proxyUrl);
    const botOptions = {
      polling: { params: { timeout: 20 } },
      request: { timeout: 15000 }
    };
    if (proxyAgent) botOptions.request.agent = proxyAgent;

    telegramManagerToken = token;
    telegramManagerProxyUrl = proxyUrl;
    telegramManagerBot = new TelegramBot(token, botOptions);
    telegramManagerStarted = true;
    registerTelegramManagerHandlers(telegramManagerBot);
    telegramManagerBot.setMyCommands([
      { command: 'start', description: 'Открыть меню' },
      { command: 'help', description: 'Помощь' },
      { command: 'bind', description: 'Админ: привязать и выдать доступ' },
      { command: 'sendaccess', description: 'Админ: отправить доступ' },
      { command: 'reply', description: 'Админ: ответить в поддержку' },
      { command: 'announce', description: 'Админ: объявление' }
    ]).catch(() => {});
    startTelegramExpiryNoticeTimer();
    console.log(`Telegram manager bot started${proxyUrl ? ' via proxy ' + redactProxyUrl(proxyUrl) : ''}`);
  } catch (err) {
    console.error('Telegram manager bot failed to start:', err);
  }
}

function stopTelegramManagerBot() {
  stopTelegramExpiryNoticeTimer();
  if (!telegramManagerBot) return;
  try { telegramManagerBot.stopPolling(); } catch (_) {}
  telegramManagerBot = null;
  telegramManagerToken = '';
  telegramManagerProxyUrl = '';
  telegramManagerStarted = false;
}

async function testTelegramManagerBot(options = {}) {
  const token = String(options.token ?? getSetting('telegram_manager_bot_token', '') ?? '').trim();
  if (!token) throw new Error('BOT_TOKEN не указан');

  const proxyUrl = Object.prototype.hasOwnProperty.call(options, 'proxyUrl')
    ? normalizeTelegramProxyUrl(options.proxyUrl)
    : getTelegramProxyUrl();
  const proxyAgent = buildTelegramProxyAgent(proxyUrl);
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`;
  const response = await fetch(url, {
    ...(proxyAgent ? { agent: proxyAgent } : {}),
    timeout: 10000
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.description || `Telegram HTTP ${response.status}`);
  return data.result;
}

app.get('/telegram-bot', requireAuth, (req, res) => {
  const users = db.prepare('SELECT * FROM telegram_users ORDER BY last_seen_at DESC LIMIT 30').all();
  const orders = db.prepare('SELECT * FROM telegram_orders ORDER BY id DESC LIMIT 30').all();
  const tickets = db.prepare('SELECT * FROM telegram_tickets ORDER BY id DESC LIMIT 30').all();
  const clients = db.prepare('SELECT id, login, display_name, enabled FROM clients ORDER BY id DESC LIMIT 200').all();
  render(res, 'telegram_bot', {
    telegramBotEnabled: getSetting('telegram_manager_enabled', '0') === '1',
    telegramBotToken: getSetting('telegram_manager_bot_token', ''),
    telegramProxyUrl: getTelegramProxyUrl(),
    telegramAdminIds: getSetting('telegram_manager_admin_ids', ''),
    telegramSupportUsername: getSetting('telegram_manager_support_username', ''),
    telegramWelcomeText: getSetting('telegram_manager_welcome_text', ''),
    telegramStatusText: getSetting('telegram_manager_status_text', ''),
    telegramInstructionText: getSetting('telegram_manager_instruction_text', ''),
    telegramMtprotoText: getSetting('telegram_manager_mtproto_text', ''),
    telegramPlansJson: getSetting('telegram_manager_plans_json', '[]'),
    telegramBaseIpLimit: getSetting('telegram_manager_base_ip_limit', '2'),
    telegramExtraIpPriceRub: getSetting('telegram_manager_extra_ip_price_rub', '80'),
    telegramExpiryNoticeDays: getSetting('telegram_manager_expiry_notice_days', '2'),
    telegramNotificationsEnabled: getSetting('telegram_notifications_enabled', '0') === '1',
    telegramNotifyOfflineNodes: getSetting('telegram_notify_offline_nodes', '1') === '1',
    telegramNotifySuspiciousClients: getSetting('telegram_notify_suspicious_clients', '1') === '1',
    telegramNotifyBotToken: getSetting('telegram_bot_token', ''),
    telegramNotifyChatId: getSetting('telegram_chat_id', ''),
    telegramSuspiciousDailyGb: getSetting('telegram_suspicious_daily_gb', '100'),
    botRuntimeStatus: telegramManagerStarted ? 'running' : 'stopped',
    users,
    orders,
    tickets,
    clients,
    message: req.query.message || '',
    error: req.query.error || ''
  });
});

app.post('/telegram-bot/settings', requireAuth, (req, res) => {
  try {
    setSetting('telegram_manager_enabled', req.body.telegram_manager_enabled === '1' ? '1' : '0');
    setSetting('telegram_manager_bot_token', String(req.body.telegram_manager_bot_token || '').trim());
    setSetting('telegram_manager_proxy_url', normalizeTelegramProxyUrl(req.body.telegram_manager_proxy_url));
    setSetting('telegram_manager_admin_ids', String(req.body.telegram_manager_admin_ids || '').trim());
    setSetting('telegram_manager_support_username', String(req.body.telegram_manager_support_username || '').trim());
    setSetting('telegram_manager_welcome_text', String(req.body.telegram_manager_welcome_text || '').trim());
    setSetting('telegram_manager_status_text', String(req.body.telegram_manager_status_text || '').trim());
    setSetting('telegram_manager_instruction_text', String(req.body.telegram_manager_instruction_text || '').trim());
    setSetting('telegram_manager_mtproto_text', String(req.body.telegram_manager_mtproto_text || '').trim());
    setSetting('telegram_manager_base_ip_limit', String(Math.max(0, Number(req.body.telegram_manager_base_ip_limit || 2))));
    setSetting('telegram_manager_extra_ip_price_rub', String(Math.max(0, Number(req.body.telegram_manager_extra_ip_price_rub || 80))));
    setSetting('telegram_manager_expiry_notice_days', String(Math.max(1, Number(req.body.telegram_manager_expiry_notice_days || 2))));
    const plansRaw = String(req.body.telegram_manager_plans_json || '[]').trim();
    const parsed = JSON.parse(plansRaw || '[]');
    if (!Array.isArray(parsed)) throw new Error('Тарифы должны быть JSON-массивом');
    setSetting('telegram_manager_plans_json', JSON.stringify(parsed, null, 2));
    startTelegramManagerBot();
    res.redirect('/telegram-bot?message=' + encodeURIComponent('Настройки Telegram-бота сохранены'));
  } catch (err) {
    res.redirect('/telegram-bot?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/telegram-bot/test', requireAuth, async (req, res) => {
  try {
    const token = String(req.body.telegram_manager_bot_token || getSetting('telegram_manager_bot_token', '') || '').trim();
    const proxyUrl = normalizeTelegramProxyUrl(req.body.telegram_manager_proxy_url);
    const me = await testTelegramManagerBot({ token, proxyUrl });
    res.redirect('/telegram-bot?message=' + encodeURIComponent(`Telegram API работает: @${me.username || me.first_name || me.id}`));
  } catch (err) {
    res.redirect('/telegram-bot?error=' + encodeURIComponent('Telegram ошибка: ' + String(err.message || err)));
  }
});

app.post('/telegram-bot/bind', requireAuth, async (req, res) => {
  try {
    const telegramId = String(req.body.telegram_id || '').trim();
    const clientId = Number(req.body.client_id || 0);
    if (!telegramId) throw new Error('Укажите Telegram ID');
    if (!clientId) throw new Error('Выберите клиента');
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client) throw new Error('Клиент не найден');
    bindTelegramUserToClient(telegramId, client);
    let message = 'Telegram ID привязан к клиенту';
    if (telegramManagerBot) {
      try {
        await telegramSendAccessToUser(telegramId, client);
        message += ', доступ отправлен пользователю в бот';
      } catch (sendErr) {
        message += `. Но отправить доступ не удалось: ${sendErr.message || sendErr}`;
      }
    } else {
      message += '. Бот не запущен, поэтому доступ не отправлен автоматически';
    }
    res.redirect('/telegram-bot?message=' + encodeURIComponent(message));
  } catch (err) {
    res.redirect('/telegram-bot?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/telegram-bot/orders/:id/delete', requireAuth, (req, res) => {
  try {
    deleteTelegramOrder(req.params.id);
    res.redirect('/telegram-bot?message=' + encodeURIComponent(`Заявка #${req.params.id} удалена`));
  } catch (err) {
    res.redirect('/telegram-bot?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/telegram-bot/orders/:id/status', requireAuth, (req, res) => {
  try {
    const status = String(req.body.status || '').trim();
    updateTelegramOrderStatus(req.params.id, status);
    res.redirect('/telegram-bot?message=' + encodeURIComponent(`Статус заявки #${req.params.id} изменён`));
  } catch (err) {
    res.redirect('/telegram-bot?error=' + encodeURIComponent(String(err.message || err)));
  }
});

app.post('/telegram-bot/announcement', requireAuth, async (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) throw new Error('Введите текст объявления');
    const users = db.prepare('SELECT telegram_id FROM telegram_users').all();
    let sent = 0;
    if (telegramManagerBot) {
      for (const row of users) {
        try { await telegramManagerBot.sendMessage(row.telegram_id, `📢 Объявление\n\n${text}`); sent++; } catch (_) {}
      }
    }
    db.prepare('INSERT INTO telegram_announcements (text, sent_count) VALUES (?, ?)').run(text, sent);
    setSetting('telegram_manager_status_text', text);
    res.redirect('/telegram-bot?message=' + encodeURIComponent(`Объявление создано. Отправлено: ${sent}`));
  } catch (err) {
    res.redirect('/telegram-bot?error=' + encodeURIComponent(String(err.message || err)));
  }
});

async function reconcileStage75H1Cloud3xuiQuotas() {
  // Disabled in Stage86. Provider-managed H1Cloud clients must never be
  // rewritten automatically at process startup. Explicit client edits use the
  // protected client-only updater instead.
  setSetting('stage75_h1cloud_quota_reconciled', '1');
  return { skipped: true, reason: 'H1Cloud protected read-only mode' };
}

app.use((err, req, res, next) => {
  console.error('Unhandled request error:', err);
  if (res.headersSent) return next(err);
  res.status(500).send(formatServerErrorPage('Внутренняя ошибка сервера', err));
});

app.listen(PORT, () => {
  console.log(`3xui-aggregator started on :${PORT}`);
  startTelegramManagerBot();
  setTimeout(() => { enforceVpnClientExpirations().catch(err => console.error('VPN expiry sweep failed:', err)); }, 15000);
  setInterval(() => { enforceVpnClientExpirations().catch(err => console.error('VPN expiry sweep failed:', err)); }, 60000).unref();
});
