/* ========== Google Sheets Data Fetcher (Registry-Based) ==========
 * Parses the row-oriented key-value format used in the published sheets.
 *
 * Sheet format (all sheets use the same layout):
 *   Column A = key/label, Column B = value 1, Column C = value 2, ...
 *
 *   Section "Info":
 *     name, Café Lafontaine,
 *     description_fr, "...",
 *     description_en, "...",
 *
 *   Section "Hours":         (business)     (pool)
 *     ,Open,Close             ,Open,Close,Cleaning Start,Cleaning End
 *     monday,8:00 AM,6:00 PM  monday,6:00 AM,10:00 PM,9:30 AM,12:00 PM
 *     ...
 *
 *   Section "Websites":
 *     website,,    facebook,,    instagram,,    twitter,,    linkedin,,
 *     image, (Drive URL or blank)
 *
 *   Section "Holidays":
 *     date,name_fr,name_en
 *     2026-07-01,Fête du Canada,Canada Day
 *
 * No API key required — all sheets must be published to the web as CSV.
 */

// ── CONFIGURATION ───────────────────────────────────────────
const REGISTRY_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTEqhVGaYrnP3sDL8JlMchTeE2a7L8RsZjLm_PjLSbL_TJxz8s3Jd8YPuoFe6yK2nxXn9hkZuKlU-dK/pub?gid=0&single=true&output=csv';
// ────────────────────────────────────────────────────────────

import { getLocalDateStr } from './utils.js';

const DAY_KEYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

/* ---------- Drive Image URL Resolver ---------- */
// Converts raw Drive URLs to lh3.googleusercontent.com for embedding.
// Already-converted lh3 URLs pass through unchanged.
// Local filenames (no http) pass through for assets/Businesses/ prefix.
function resolveImageUrl(img) {
  if (!img || !img.startsWith('http')) return img; // local filename
  // Already an lh3 URL? Return as-is
  if (img.includes('googleusercontent.com')) return img;
  // Raw Drive URL → convert to lh3
  const match = img.match(/\/d\/([^/]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}=w400`;
  return img; // other absolute URL
}

/* ---------- CSV Parser (returns 2D array) ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(cell.trim());
        rows.push(row);
        row = []; cell = '';
        if (ch === '\r') i++;
      } else cell += ch;
    }
  }
  row.push(cell.trim());
  rows.push(row);
  return rows;
}

function isEmptyRow(row) {
  return row.every(c => c === '');
}

function col(row, idx) {
  return (row[idx] || '').trim();
}

/* ---------- Cache ---------- */
const CACHE_PREFIX = 'dauphins_v2_';
const CACHE_TTL = 30 * 1000; // 30 seconds — fast updates from Sheets

async function fetchCSV(url, cacheKey) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey));
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  } catch {}

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  const text = await resp.text();
  const data = parseCSV(text);

  try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data })); } catch {}
  return data;
}

/* ---------- URL Normalization ---------- */
function normalizeUrl(url) {
  if (!url) return '';
  // Fix pubhtml → pub, ensure &output=csv
  let fixed = url.replace('/pubhtml?', '/pub?');
  if (fixed.includes('?') && !fixed.includes('output=csv')) {
    fixed += '&output=csv';
  }
  return fixed;
}

/* ---------- Registry ---------- */
let _registryCache = null;

async function loadRegistry() {
  if (_registryCache) return _registryCache;

  const rows = await fetchCSV(REGISTRY_CSV_URL, CACHE_PREFIX + 'registry');
  const registry = { businesses: [], office: null, pool: null };

  // Actual format: col 0 = Name, col 1 = Is Active, col 2 = Info URL
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (isEmptyRow(row)) continue;
    const name = col(row, 0);
    const active = col(row, 1);
    const url = normalizeUrl(col(row, 2));
    if (!url || active.toUpperCase() !== 'TRUE') continue;

    const lower = name.toLowerCase();
    if (lower === 'office') {
      registry.office = { key: 'office', name: 'Administration', url };
    } else if (lower === 'pool') {
      registry.pool = { key: 'pool', name: 'Piscine & Gym', url };
    } else {
      registry.businesses.push({ key: lower.replace(/\s+/g, '_'), name, url });
    }
  }

  _registryCache = registry;
  return registry;
}

/* ---------- Row-Oriented Parser ---------- */

function parseSheet(rows) {
  const result = {
    info: {},
    hours: {},
    closures: {},
    websites: {},
    image: '',
    holidays: []
  };

  let section = null;
  let hoursHasCleaning = false;
  let holidayHeaders = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isEmptyRow(row)) { section = null; continue; }

    const a = col(row, 0).toLowerCase();

    // Detect section headers
    if (a === 'info') { section = 'info'; continue; }
    if (a === 'hours') {
      section = 'hours';
      // Next row is the sub-header (Open, Close, ...)
      if (i + 1 < rows.length) {
        const sub = rows[i + 1];
        hoursHasCleaning = col(sub, 3) !== '' || col(sub, 4) !== '';
        i++; // skip sub-header
      }
      continue;
    }
    if (a === 'websites') { section = 'websites'; continue; }
    if (a === 'holidays') {
      section = 'holidays';
      // Next row is the sub-header (date, name_fr, name_en)
      if (i + 1 < rows.length && col(rows[i + 1], 0).toLowerCase() === 'date') {
        holidayHeaders = rows[i + 1].map(c => c.trim().toLowerCase());
        i++;
      }
      continue;
    }

    // Parse based on current section
    if (section === 'info') {
      result.info[a] = col(row, 1);
    }
    else if (section === 'hours') {
      if (DAY_KEYS.includes(a)) {
        result.hours[a] = col(row, 1) + (col(row, 2) ? ' - ' + col(row, 2) : '');
        if (hoursHasCleaning && col(row, 3) && col(row, 4)) {
          result.closures[a] = col(row, 3) + ' - ' + col(row, 4);
        }
      }
    }
    else if (section === 'websites') {
      if (a === 'image') {
        result.image = col(row, 1);
      } else {
        result.websites[a] = col(row, 1);
      }
    }
    else if (section === 'holidays') {
      // date in col 0, name_fr in col 1, name_en in col 2
      if (a && /^(\d{4}|--)-/.test(a)) {
        result.holidays.push({
          date: a,
          name_fr: col(row, 1),
          name_en: col(row, 2)
        });
      }
    }
  }

  return result;
}

/* ---------- Convert parsed sheet to business object ---------- */

function sheetToBusiness(parsed, meta) {
  const hours = {};
  DAY_KEYS.forEach(d => { hours[d] = parsed.hours[d] || 'Closed'; });

  let images = [];
  if (parsed.image) {
    // Google Drive URL → use lh3.googleusercontent.com for hotlinking
    const driveMatch = parsed.image.match(/\/d\/([^/]+)/);
    if (driveMatch) {
      images.push(`https://lh3.googleusercontent.com/d/${driveMatch[1]}=w400`);
    } else if (parsed.image.startsWith('http')) {
      images.push(parsed.image);
    } else {
      images.push(parsed.image); // local filename
    }
  }

  return {
    name: parsed.info.name || meta.name || '',
    description: parsed.info.description_fr || parsed.info.description_en || '',
    description_fr: parsed.info.description_fr || '',
    description_en: parsed.info.description_en || '',
    business_hours: hours,
    images,
    website: parsed.websites.website || null,
    social_media: {
      facebook: parsed.websites.facebook || null,
      instagram: parsed.websites.instagram || null,
      twitter: parsed.websites.twitter || null,
      linkedin: parsed.websites.linkedin || null
    },
    _holidays: parsed.holidays
  };
}

function sheetToHours(parsed) {
  const hours = {};
  DAY_KEYS.forEach(d => { hours[d] = parsed.hours[d] || 'Closed'; });
  return hours;
}

/* ---------- Holiday Detection ---------- */
function checkHoliday(holidayRows) {
  if (!holidayRows || !holidayRows.length) return { isHoliday: false, name: '' };
  const today = new Date();
  const todayStr = getLocalDateStr(today);
  const lang = document.documentElement.lang || 'fr';
  const nameField = lang === 'fr' ? 'name_fr' : 'name_en';

  for (const h of holidayRows) {
    let match = false;
    if (h.date && h.date.startsWith('--')) {
      const [_, mm, dd] = h.date.split('-');
      match = (parseInt(mm) === today.getMonth() + 1 && parseInt(dd) === today.getDate());
    } else if (h.date) {
      match = h.date === todayStr;
    }

    if (match) {
      return { isHoliday: true, name: h[nameField] || h.name_fr || h.name_en || '' };
    }
  }
  return { isHoliday: false, name: '' };
}

/* ──────── Public API ──────── */

export async function fetchBusinesses() {
  const registry = await loadRegistry();
  const results = await Promise.all(registry.businesses.map(async (entry) => {
    try {
      const rows = await fetchCSV(entry.url, CACHE_PREFIX + 'biz_' + entry.key);
      if (rows.length === 0) return null;
      const parsed = parseSheet(rows);
      const biz = sheetToBusiness(parsed, entry);
      // Resolve Drive image URLs
      if (biz.images && biz.images.length > 0) {
        biz.images = biz.images.map(resolveImageUrl);
      }
      return biz;
    } catch (e) {
      console.warn(`Business "${entry.name}" failed:`, e.message);
      return null;
    }
  }));
  return results.filter(Boolean);
}

export async function fetchFAQData() {
  const registry = await loadRegistry();

  let officeData = null, officeHolidays = [];
  if (registry.office) {
    try {
      const rows = await fetchCSV(registry.office.url, CACHE_PREFIX + 'office');
      const parsed = parseSheet(rows);
      officeData = { business_hours: sheetToHours(parsed) };
      officeHolidays = parsed.holidays;
    } catch {}
  }

  let poolData = null, poolHolidays = [];
  if (registry.pool) {
    try {
      const rows = await fetchCSV(registry.pool.url, CACHE_PREFIX + 'pool');
      const parsed = parseSheet(rows);
      const hasClosures = Object.keys(parsed.closures).length > 0;
      poolData = {
        business_hours: sheetToHours(parsed),
        closures: hasClosures ? parsed.closures : null,
        cleaning_note_fr: parsed.info.cleaning_note_fr || '',
        cleaning_note_en: parsed.info.cleaning_note_en || ''
      };
      poolHolidays = parsed.holidays;
    } catch {}
  }

  // Attach holidays to each scope — no merging
  if (officeData) officeData._holidays = officeHolidays;
  if (poolData) poolData._holidays = poolHolidays;

  return { admin: officeData, pool: poolData };
}

export function getHolidayStatus(holidays) {
  return checkHoliday(holidays);
}
