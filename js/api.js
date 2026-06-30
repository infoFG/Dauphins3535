import { escapeHtml, formatBusinessHours, isCurrentlyOpen, getDayLabels } from './utils.js';

const EVENTS_CACHE_KEY = 'dauphins_events_cache';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // Refresh from API weekly
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

function formatTimeForDisplay(raw) {
  if (!raw || !raw.trim()) return '';
  const t = raw.trim();
  const parsed = new Date('2000-01-01 ' + t);
  if (isNaN(parsed.getTime())) return t;
  const lang = document.documentElement.lang || 'fr';
  if (lang === 'fr') {
    return parsed.getHours().toString().padStart(2, '0') + 'h' + parsed.getMinutes().toString().padStart(2, '0');
  }
  return parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

const TIMES_CACHE_KEY = 'dauphins_event_times';

function loadTimeCache() {
  try { return JSON.parse(localStorage.getItem(TIMES_CACHE_KEY) || '{}'); }
  catch { return {}; }
}

function saveTimeCache(cache) {
  try { localStorage.setItem(TIMES_CACHE_KEY, JSON.stringify(cache)); }
  catch { /* storage full */ }
}

async function fetchEventTime(url) {
  if (!url || url === '#') return '';
  const cache = loadTimeCache();
  if (cache[url] !== undefined) return cache[url];

  try {
    const resp = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!resp.ok) return '';
    const html = await resp.text();
    // Try JSON-LD startDate first
    let match = html.match(/"startDate"\s*:\s*"([^"]+)"/);
    if (!match) match = html.match(/datetime="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
    if (match) {
      const dt = new Date(match[1]);
      if (!isNaN(dt.getTime())) {
        const h = dt.getHours().toString().padStart(2, '0');
        const m = dt.getMinutes().toString().padStart(2, '0');
        const result = h + ':' + m; // Store as HH:MM, format at display time
        cache[url] = result;
        saveTimeCache(cache);
        return result;
      }
    }
    cache[url] = ''; // Cache negative result too
    saveTimeCache(cache);
    return '';
  } catch { return ''; }
}

export { fetchEventTime };

// ---- Thumbnail helpers exported for events-list ----
export { getThumbCache };

async function fetchEventThumbnail(url) {
  if (!url || !url.includes('montreal.ca/evenements/')) return '';
  const cache = getThumbCache();
  if (cache[url]) return cache[url];
  try {
    const resp = await fetch(CORS_PROXY + encodeURIComponent(url));
    const html = await resp.text();
    const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (match && match[1]) {
      const thumbUrl = match[1].replace(/w_\d+,h_\d+/g, 'w_400,c_fill');
      setThumbCache(url, thumbUrl);
      return thumbUrl;
    }
  } catch { /* keep fallback */ }
  return '';
}

export { fetchEventThumbnail };

function loadCachedEvents() {
  try {
    const raw = localStorage.getItem(EVENTS_CACHE_KEY);
    if (!raw) return [];
    const cached = JSON.parse(raw);
    // Clean past events, keep future ones
    const now = new Date(); now.setHours(0,0,0,0);
    const future = (cached.events || []).filter(e => new Date(e.date + 'T00:00:00') >= now);
    return future;
  } catch (e) { return []; }
}

function saveCachedEvents(events) {
  try {
    localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      events: events
    }));
  } catch (e) { /* storage full */ }
}

async function refreshEventsFromAPI(cached) {
  // Build map of cached events by link for merging
  const cachedByLink = {};
  cached.forEach(e => { if (e.link) cachedByLink[e.link] = e; });

  const needsRefresh = !cached.length || Date.now() - (JSON.parse(localStorage.getItem(EVENTS_CACHE_KEY) || '{}').timestamp || 0) > CACHE_TTL;
  
  if (!needsRefresh) return cached;

  try {
    const [staticEvents, dynamicEvents] = await Promise.all([
      fetchStaticEvents(),
      fetchMontrealEvents()
    ]);

    // Merge: keep cached thumbnails, add new events
    const fresh = [...(staticEvents || []), ...(dynamicEvents || [])];
    const merged = fresh.map(e => {
      // If we already have this event cached, preserve its image/thumbnail
      if (e.link && cachedByLink[e.link]) {
        return { ...e, image: cachedByLink[e.link].image || e.image };
      }
      return e;
    });

    // Also keep any cached events not in the fresh list (community events from sheets)
    const freshLinks = new Set(fresh.map(e => e.link));
    const uncached = Object.values(cachedByLink).filter(e => !freshLinks.has(e.link));

    return [...merged, ...uncached];
  } catch (e) { return cached; }
}

export async function initEventsCarousel() {
  const track = document.getElementById('events-carousel-track');
  if (!track) return;

  const lang = document.documentElement.lang || 'fr';

  const render = (events) => {
    if (!events || events.length === 0) {
      const emptyMsg = window.translations?.[lang]?.events_empty || 'Aucun événement trouvé pour le moment.';
      track.innerHTML = `<p class="loading-msg">${emptyMsg}</p>`;
      return null;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Deduplicate, filter past, sort chronologically
    const seen = new Set();
    const allUpcoming = events
      .filter(e => new Date(e.date + 'T00:00:00') >= now)
      .filter(e => {
        const key = (e.link || '').trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(a.date + 'T00:00:00') - new Date(b.date + 'T00:00:00'));

    // Show next 7 days first, then fill up to 12 with later events
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const withinWeek = allUpcoming.filter(e => new Date(e.date + 'T00:00:00') <= nextWeek);
    const later = allUpcoming.filter(e => new Date(e.date + 'T00:00:00') > nextWeek);
    const upcoming = [...withinWeek, ...later].slice(0, 12);

    if (upcoming.length === 0) {
      const emptyMsg = window.translations?.[lang]?.events_empty || 'Aucun événement trouvé pour le moment.';
      track.innerHTML = `<p class="loading-msg">${emptyMsg}</p>`;
      return null;
    }

    const loadingMsg = window.translations?.[lang]?.carousel_loading || 'Chargement…';

    track.innerHTML = upcoming.map(event => {
      const title = lang === 'en' && event.title_en ? event.title_en : event.title;
      const location = lang === 'en' && event.location_en ? event.location_en : event.location;
      const source = lang === 'en' && event.source_en ? event.source_en : event.source;
      const dateStr = new Date(event.date + 'T00:00:00').toLocaleDateString(
        lang === 'en' ? 'en-CA' : 'fr-CA',
        { weekday: 'long', month: 'long', day: 'numeric' }
      );
      const timeStr = event.time ? ` — ${formatTimeForDisplay(event.time)}` : '';
      const primary = getPrimaryImage(event);

      return `
      <a href="${escapeHtml(event.link)}" target="_blank" rel="noopener" class="carousel-card" draggable="false">
        <img src="${escapeHtml(primary)}" alt="${escapeHtml(title)}" loading="lazy">
        <div class="card-content">
          <div class="card-date">${dateStr}${timeStr}</div>
          <h4 class="card-title">${escapeHtml(title)}</h4>
          <div class="card-location">📍 ${escapeHtml(location)}</div>
          <div class="card-source">${escapeHtml(source)}</div>
        </div>
      </a>`;
    }).join('');
    return upcoming;
  };

  // Smart cache: clean past events, merge fresh data preserving thumbnails
  let cachedEvents = loadCachedEvents();
  const events = await refreshEventsFromAPI(cachedEvents);
  saveCachedEvents(events);

  // Always fetch community events (separate cache)
  const communityEvents = await fetchCommunityEvents();
  window._communityEvents = communityEvents;

  const displayed = render(events);
  if (displayed) {
    // Store for language-switch re-renders
    track._events = displayed;
    fetchDynamicThumbnails(displayed);
  }
}

export function reRenderEvents() {
  const track = document.getElementById('events-carousel-track');
  if (track && track._events) {
    // Re-render with current language but don't re-fetch thumbnails
    const lang = document.documentElement.lang || 'fr';
    track.innerHTML = track._events.map(event => {
      const title = lang === 'en' && event.title_en ? event.title_en : event.title;
      const location = lang === 'en' && event.location_en ? event.location_en : event.location;
      const source = lang === 'en' && event.source_en ? event.source_en : event.source;
      const dateStr = new Date(event.date + 'T00:00:00').toLocaleDateString(
        lang === 'en' ? 'en-CA' : 'fr-CA',
        { weekday: 'long', month: 'long', day: 'numeric' }
      );
      const timeStr = event.time ? ` — ${formatTimeForDisplay(event.time)}` : '';
      const primary = getPrimaryImage(event);
      return `
      <a href="${escapeHtml(event.link)}" target="_blank" rel="noopener" class="carousel-card" draggable="false">
        <img src="${escapeHtml(primary)}" alt="${escapeHtml(title)}" loading="lazy">
        <div class="card-content">
          <div class="card-date">${dateStr}${timeStr}</div>
          <h4 class="card-title">${escapeHtml(title)}</h4>
          <div class="card-location">📍 ${escapeHtml(location)}</div>
          <div class="card-source">${escapeHtml(source)}</div>
        </div>
      </a>`;
    }).join('');
  }
}

// ---- Image strategy: try remote thumbnails, fallback to local ----

const FALLBACK_THEATRE = [
  'assets/Quartier/quartier-theatre.webp',
  'assets/Quartier/quartier-plateau.webp',
  'assets/Quartier/quartier-user-3.webp'
];
const FALLBACK_PARC = [
  'assets/Quartier/quartier-parc.webp',
  'assets/Quartier/quartier-parc-lafontaine.webp',
  'assets/Quartier/quartier-user-1.webp'
];
const FALLBACK_GENERAL = [
  'assets/Quartier/quartier-plateau.webp',
  'assets/Quartier/quartier-user-2.webp',
  'assets/Quartier/quartier-user-4.webp'
];

export function getPrimaryImage(event) {
  // 1. Explicit image (community events, static events)
  if (event.image) return event.image;
  // 2. Check persistent thumbnail cache (og:image scraped from event page)
  if (event.link) {
    const thumbCache = getThumbCache();
    if (thumbCache[event.link]) return thumbCache[event.link];
  }
  // 3. Deterministic local fallback based on event link
  return getFallbackLocal(event);
}

function getFallbackLocal(event) {
  const loc = (event.location || '').toLowerCase();
  let pool = FALLBACK_GENERAL;
  if (loc.includes('verdure') || loc.includes('théâtre') || loc.includes('theatre')) {
    pool = FALLBACK_THEATRE;
  } else if (loc.includes('parc') || loc.includes('fontaine') || loc.includes('park')) {
    pool = FALLBACK_PARC;
  }
  // Deterministic: hash the link so same event always gets same image
  const key = event.link || event.title || '';
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash) + key.charCodeAt(i);
  const idx = Math.abs(hash) % pool.length;
  return pool[idx] || '';
}

// ---- Thumbnail cache (persistent, not tied to event cache TTL) ----
const THUMB_CACHE_KEY = 'dauphins_thumb_cache';

function getThumbCache() {
  try {
    const raw = localStorage.getItem(THUMB_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function setThumbCache(link, imageUrl) {
  try {
    const cache = getThumbCache();
    cache[link] = imageUrl;
    // Keep cache under ~1000 entries
    const keys = Object.keys(cache);
    if (keys.length > 1000) {
      const oldest = keys.slice(0, keys.length - 900);
      oldest.forEach(k => delete cache[k]);
    }
    localStorage.setItem(THUMB_CACHE_KEY, JSON.stringify(cache));
  } catch (e) { /* storage full */ }
}

// After render, batch-fetch thumbnails for displayed events that lack them
async function fetchDynamicThumbnails(events) {
  const track = document.getElementById('events-carousel-track');
  if (!track) return;

  const thumbCache = getThumbCache();
  const cards = track.querySelectorAll('.carousel-card');
  const toFetch = [];

  cards.forEach((card, i) => {
    const event = events[i];
    if (!event || event.image) return;
    if (!event.link || !event.link.includes('montreal.ca/evenements/')) return;

    // Check persistent thumbnail cache
    if (thumbCache[event.link]) {
      applyThumbToCard(card, thumbCache[event.link]);
      return;
    }

    const img = card.querySelector('img');
    if (img && img.complete && img.naturalWidth > 0) return; // local fallback loaded fine
    toFetch.push({ card, event });
  });

  // Fetch in batches of 3 to avoid overwhelming the proxy
  for (let i = 0; i < toFetch.length; i += 3) {
    const batch = toFetch.slice(i, i + 3);
    await Promise.allSettled(batch.map(async ({ card, event }) => {
      try {
        const proxyUrl = CORS_PROXY + encodeURIComponent(event.link);
        const response = await fetch(proxyUrl);
        const html = await response.text();
        const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
        if (match && match[1]) {
          const thumbUrl = match[1].replace(/w_\d+,h_\d+/g, 'w_400,c_fill');
          setThumbCache(event.link, thumbUrl);
          applyThumbToCard(card, thumbUrl);
        }
      } catch (e) { /* keep local fallback */ }
    }));
  }
}

function applyThumbToCard(card, url) {
  const img = card.querySelector('img');
  if (img) {
    img.src = url;
  }
}

async function fetchCommunityEvents() {
  const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTns1Hpe-TBIjKUM7yjP_wI4cm75iy3R6Plfo7YR7r7TCA6H154T61O_B2sTV3Wj8V8Vf6ToslfSfKR/pub?gid=447995773&single=true&output=csv';
  try {
    const response = await fetch(SHEET_CSV);
    if (!response.ok) return [];
    const csvText = await response.text();
    
    // Parse CSV with proper quote handling (supports embedded newlines)
    const rows = [];
    let row = [], cell = '', inQuotes = false;
    for (let i = 0; i < csvText.length; i++) {
      const ch = csvText[i];
      if (inQuotes) {
        if (ch === '"') {
          if (csvText[i + 1] === '"') { cell += '"'; i++; }
          else inQuotes = false;
        } else cell += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { row.push(cell.trim()); cell = ''; }
        else if (ch === '\n' || (ch === '\r' && csvText[i + 1] === '\n')) {
          row.push(cell.trim());
          if (row.length > 0 && row.some(c => c !== '')) rows.push(row);
          row = []; cell = '';
          if (ch === '\r') i++;
        } else cell += ch;
      }
    }
    row.push(cell.trim());
    if (row.length > 0 && row.some(c => c !== '')) rows.push(row);

    if (rows.length < 2) return [];
    const headers = rows[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
    const dateIdx = headers.indexOf('event_date');
    const titleIdx = headers.indexOf('event_name');
    const timeIdx = headers.indexOf('start_time');
    const endTimeIdx = headers.indexOf('end_time');
    const imageIdx = headers.indexOf('image');
    const approvedIdx = headers.indexOf('approved');
    const urlIdx = headers.indexOf('event_url');
    const locIdx = headers.indexOf('event_location');
    const descIdx = headers.indexOf('event_description');

    return rows.slice(1).map(vals => {
      const approved = (vals[approvedIdx] || '').toUpperCase();
      if (approved !== 'TRUE' && approved !== 'YES') return null;

      const dateStr = vals[dateIdx] || '';
      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) return null;

      const timeVal = vals[timeIdx] || '';
      const endVal = vals[endTimeIdx] || '';
      const displayTime = timeVal ? formatDisplayTime(timeVal, endVal) : '';
      const rawImg = vals[imageIdx] || '';
      const eventUrl = vals[urlIdx] || '';
      const eventLoc = vals[locIdx] || '';

      let imgUrl = '';
      if (rawImg) {
        const driveMatch = rawImg.match(/[?&]id=([a-zA-Z0-9_-]+)/) || rawImg.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch) imgUrl = `https://lh3.googleusercontent.com/d/${driveMatch[1]}=w400`;
        else imgUrl = rawImg;
      }

      return {
        title: vals[titleIdx] || 'Événement communautaire',
        title_en: vals[titleIdx] || 'Community Event',
        date: parsed.toISOString().split('T')[0],
        time: displayTime,
        location: eventLoc || 'Immeuble',
        location_en: eventLoc || 'Building',
        source: 'Communauté',
        source_en: 'Community',
        link: eventUrl || '#',
        description: (vals[descIdx] || '').substring(0, 200),
        image: imgUrl
      };
    }).filter(Boolean);
  } catch (e) { console.warn('Community events fetch failed:', e); return []; }
}

function formatDisplayTime(start, end) {
  const s = formatTimeForDisplay(start);
  const e = formatTimeForDisplay(end);
  if (s && e) return s + '–' + e;
  return s || e;
}

async function fetchStaticEvents() {
  try {
    const response = await fetch('assets/Events/events.json');
    if (!response.ok) return [];
    return await response.json();
  } catch (e) { return []; }
}

async function fetchMontrealEvents() {
  const DATASET_API = 'https://donnees.montreal.ca/api/3/action/package_show?id=evenements-publics';
  try {
    const metaResponse = await fetch(DATASET_API);
    if (!metaResponse.ok) return [];
    const metaData = await metaResponse.json();
    
    const csvResource = metaData.result.resources.find(r => r.format.toUpperCase() === 'CSV');
    if (!csvResource?.url) return [];

    const csvResponse = await fetch(csvResource.url);
    if (!csvResponse.ok) return [];
    const csvText = await csvResponse.text();

    // Parse CSV
    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    const records = lines.slice(1).filter(line => line.trim()).map(line => {
      const values = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && (i === 0 || line[i - 1] !== '\\')) inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else current += char;
      }
      values.push(current.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = values[i] || ''; });
      return obj;
    });

    // Filter: Plateau-Mont-Royal borough (code PMR or name match)
    return records
      .filter(r => {
        const arr = (r.arrondissement || '').toLowerCase();
        return arr === 'le plateau-mont-royal' || arr === 'pmr';
      })
      .map(r => ({
        title: r.titre || 'Événement',
        title_en: r.titre || 'Event',
        date: r.date_debut || '',
        time: '',
        location: r.emplacement || 'Plateau-Mont-Royal',
        location_en: r.emplacement || 'Plateau-Mont-Royal',
        source: r.emplacement || '',
        source_en: r.emplacement || '',
        link: r.url_fiche || '#',
        description: (r.description || '').replace(/<[^>]*>/g, '').substring(0, 200),
        image: ''
      }));
  } catch (e) { console.warn('Montreal events fetch failed:', e); return []; }
}

export async function initBusinessGallery() {
  const galleryTrack = document.getElementById('business-gallery-track');
  if (!galleryTrack) return;
  const container = galleryTrack.closest('.carousel-container');
  if (container) {
    delete container.dataset.listenersAttached;
    clearTimeout(container.autoPlayTimeout);
    clearInterval(container.autoPlayTimer);
  }
  const lang = document.documentElement.lang || 'fr';
  const dayKeys = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

  // Helper: check holiday for a specific date
  function isDateHoliday(holidays, dateStr) {
    if (!holidays || !holidays.length) return null;
    const nameField = lang === 'fr' ? 'name_fr' : 'name_en';
    for (const h of holidays) {
      let match = false;
      if (h.date && h.date.startsWith('--')) {
        const [_, mm, dd] = h.date.split('-');
        const d = new Date(dateStr);
        match = (parseInt(mm) === d.getMonth() + 1 && parseInt(dd) === d.getDate());
      } else if (h.date) match = h.date === dateStr;
      if (match) return h[nameField] || h.name_fr || h.name_en || '';
    }
    return null;
  }

  // Build week dates
  const now = new Date();
  const todayIdx = (now.getDay() + 6) % 7;
  const monday = new Date(now); monday.setDate(now.getDate() - todayIdx);
  const weekDates = dayKeys.map((_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return d.toISOString().split('T')[0];
  });
  const todayStr = now.toISOString().split('T')[0];

  try {
    // Try Google Sheets first, fall back to JSON
    let businessData = [];
    try {
      const { fetchBusinesses } = await import('./gsheets.js');
      businessData = await fetchBusinesses();
    } catch {
      const registryResponse = await fetch('assets/Businesses/Registery.json');
      if (registryResponse.ok) {
        const registry = await registryResponse.json();
        const files = registry?.Businesses || [];
        const results = await Promise.all(files.map(async f => {
          const res = await fetch(`assets/Businesses/${f}`);
          if (!res.ok) return null;
          return res.json();
        }));
        businessData = results.filter(Boolean);
      }
    }

    if (!businessData.length) {
      galleryTrack.innerHTML = '<p class="loading-msg">Galerie temporairement indisponible.</p>';
      return;
    }

    const firstWithImage = businessData.find(b => b && b.images && b.images.length > 0);
    if (firstWithImage) {
      const section = galleryTrack.closest('.section');
      if (section) {
        section.style.setProperty('--section-bg', `url("../assets/Businesses/${firstWithImage.images[0]}")`);
      }
    }

    const cards = businessData.flatMap((business) => {
      const bizHolidays = business._holidays || [];
      return (business.images || []).map((image) => {
        const imageUrl = image.startsWith('http') ? image : `assets/Businesses/${image}`;

        // Build hours list with holiday annotations
        const hoursHtml = business.business_hours ? dayKeys.map((d, i) => {
          const v = business.business_hours[d];
          if (!v) return '';
          const dayHoliday = isDateHoliday(bizHolidays, weekDates[i]);
          const display = dayHoliday
            ? (lang === 'fr' ? 'Fermé — ' : 'Closed — ') + dayHoliday
            : v;
          const cls = (dayHoliday ? 'biz-holiday' : '') + (i === todayIdx ? ' bh-today' : '');
          return `<div class="bh-row${cls ? ' ' + cls : ''}"><span class="bh-day">${(getDayLabels(lang)[i] || '').substring(0,3)}</span><span> ${display}</span></div>`;
        }).filter(Boolean).join('') : '';

        // Status with holiday check
        const todayHoliday = isDateHoliday(bizHolidays, todayStr);
        let status, statusText;
        if (todayHoliday) {
          status = 'closed';
          statusText = todayHoliday;
        } else {
          status = business.business_hours ? isCurrentlyOpen(business.business_hours) : '';
          statusText = status ? (window.translations?.[lang]?.['status_' + status] || status) : '';
        }
        const statusBadge = status ? `<p class="status-badge status-${status}">${statusText}</p>` : '';

        const ensureProtocol = (url) => (url && !url.startsWith('http')) ? `https://${url}` : url;

        let linksHtml = '';
        if (business.website) {
          linksHtml += `<a href="${escapeHtml(ensureProtocol(business.website))}" target="_blank" rel="noopener"><span class="icon">🌐</span> ${lang === 'fr' ? 'Site web' : 'Website'}</a>`;
        }
        if (business.social_media) {
          const platforms = {
            facebook: { icon: '📘', label: 'Facebook' },
            instagram: { icon: '📸', label: 'Instagram' },
            twitter: { icon: '🐦', label: 'Twitter' },
            linkedin: { icon: '💼', label: 'LinkedIn' }
          };
          Object.entries(business.social_media).forEach(([key, url]) => {
            if (url && platforms[key] && typeof url === 'string') {
              linksHtml += `<a href="${escapeHtml(ensureProtocol(url))}" target="_blank" rel="noopener"><span class="icon">${platforms[key].icon}</span> ${platforms[key].label}</a>`;
            }
          });
        }

        return `
          <div class="business-carousel-card lightbox-trigger" aria-label="${escapeHtml(business.name)}">
            <div class="business-header">
              <div class="business-name">${escapeHtml(business.name)}</div>
              <div class="business-desc">${escapeHtml(business.description_fr || business.description || '')}</div>
              ${statusBadge}
            </div>
            <img src="${imageUrl}" alt="${escapeHtml(business.name)}" loading="lazy" draggable="false" class="lightbox-trigger" />
            <div class="business-overlay">
              <div class="business-hours">${hoursHtml}</div>
              <div class="business-links">${linksHtml}</div>
            </div>
          </div>`;
      });
    });

    if (cards.length === 0) {
      galleryTrack.innerHTML = '<p class="loading-msg">Aucune image disponible.</p>';
    } else {
      galleryTrack.innerHTML = cards.join('');
    }
  } catch (error) {
    console.error('Erreur galerie:', error);
  }
}

// ---- Community Events Carousel (separate from main events) ----
export function initCommunityCarousel() {
  const track = document.getElementById('community-carousel-track');
  const section = document.getElementById('communaute');
  if (!track || !section) return;

  const events = window._communityEvents || [];
  if (events.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  const lang = document.documentElement.lang || 'fr';
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const upcoming = events
    .filter(e => new Date(e.date + 'T00:00:00') >= now)
    .sort((a, b) => new Date(a.date + 'T00:00:00') - new Date(b.date + 'T00:00:00'));

  // Show all upcoming community events (no 12-item cap)

  if (upcoming.length === 0) {
    section.style.display = 'none';
    return;
  }

  track.innerHTML = upcoming.map(event => {
    const title = lang === 'en' && event.title_en ? event.title_en : event.title;
    const dateStr = new Date(event.date + 'T00:00:00').toLocaleDateString(
      lang === 'en' ? 'en-CA' : 'fr-CA',
      { weekday: 'long', month: 'long', day: 'numeric' }
    );
    const img = event.image || getFallbackLocal(event);
    const fallback = img !== getFallbackLocal(event) ? ` onerror="this.src='${escapeHtml(getFallbackLocal(event))}';this.onerror=null"` : '';
    const hasLink = event.link && event.link !== '#';

    // Store full event data for detail modal
    const evData = encodeURIComponent(JSON.stringify({
      title: event.title,
      title_en: event.title_en || '',
      date: event.date,
      time: event.time || '',
      location: event.location || '',
      location_en: event.location_en || '',
      description: event.description || '',
      link: event.link || '',
      image: img
    }));

    return `
    <div class="carousel-card" draggable="false" data-ev="${escapeHtml(evData)}" onclick="window._openEventDetail(this)">
      <img src="${escapeHtml(img)}" alt="${escapeHtml(title)}" loading="lazy"${fallback}>
      <div class="card-content">
        <div class="card-date">${dateStr}${event.time ? ` — ${formatTimeForDisplay(event.time)}` : ''}</div>
        <h4 class="card-title">${escapeHtml(title)}</h4>
        <div class="card-location">📍 ${escapeHtml(event.location_en && lang === 'en' ? event.location_en : event.location)}</div>
      </div>
    </div>`;
  }).join('');
}

// Event detail modal
window._openEventDetail = function(card) {
  const raw = card.getAttribute('data-ev');
  if (!raw) return;
  const lang = document.documentElement.lang || 'fr';
  const e = JSON.parse(decodeURIComponent(raw));
  const title = lang === 'en' && e.title_en ? e.title_en : e.title;
  const loc = lang === 'en' && e.location_en ? e.location_en : e.location;
  const dateStr = new Date(e.date + 'T00:00:00').toLocaleDateString(
    lang === 'en' ? 'en-CA' : 'fr-CA',
    { weekday: 'long', month: 'long', day: 'numeric' }
  );

  const existing = document.querySelector('.ev-detail-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'ev-detail-overlay';
  const hasLink = e.link && e.link !== '#';
  const calData = encodeURIComponent(JSON.stringify({ title:e.title, date:e.date, time:e.time, location:e.location, description:e.description }));
  overlay.innerHTML = `
    <div class="ev-detail-card">
      <button class="ev-detail-close">✕</button>
      ${e.image ? `<img src="${escapeHtml(e.image)}" alt="${escapeHtml(title)}" class="ev-detail-img">` : ''}
      <div class="ev-detail-body">
        <div class="card-date">${dateStr}${e.time ? ` — ${escapeHtml(e.time)}` : ''}</div>
        <h2>${escapeHtml(title)}</h2>
        ${loc ? `<div class="card-location" style="margin-bottom:0.75rem;">📍 ${escapeHtml(loc)}</div>` : ''}
        ${e.description ? `<p class="ev-detail-desc">${escapeHtml(e.description)}</p>` : ''}
        <div class="ev-detail-actions">
          ${hasLink ? `<a href="${escapeHtml(e.link)}" target="_blank" rel="noopener" class="cal-add-btn" style="text-decoration:none;display:inline-block;">${lang==='en'?'More info':'Plus d\'info'} →</a>` : ''}
          <button class="cal-add-btn" data-cal="${escapeHtml(calData)}" onclick="window._addToCalendar(this)">📅 ${lang==='en'?'Add to Calendar':'Ajouter au calendrier'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.ev-detail-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
};
window._addToCalendar = function(btn) {
  const lang = document.documentElement.lang || 'fr';
  const raw = btn.getAttribute('data-cal');
  if (!raw) return;
  const data = JSON.parse(decodeURIComponent(raw));

  const existing = document.querySelector('.cal-confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'cal-confirm-overlay';
  overlay.innerHTML = `
    <div class="cal-confirm-box">
      <p>${lang === 'en' ? 'Add to your calendar?' : 'Ajouter à votre calendrier ?'}</p>
      <p class="cal-confirm-title">${escapeHtml(data.title || '')}</p>
      <p class="cal-confirm-sub">${lang === 'en' ? 'Opens in Google Calendar' : 'Ouvre dans Google Calendar'}</p>
      <div class="cal-confirm-actions">
        <button class="cal-confirm-yes">${lang === 'en' ? 'Add' : 'Ajouter'}</button>
        <button class="cal-confirm-no">${lang === 'en' ? 'Cancel' : 'Annuler'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.cal-confirm-no').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('.cal-confirm-yes').onclick = () => {
    close();
    const title = encodeURIComponent(data.title || '');
    const loc = encodeURIComponent(data.location || '');
    const desc = encodeURIComponent(data.description || '');
    const startStr = toCalDate(data.date, data.time, true);
    const endStr = toCalDate(data.date, data.time, false);
    const dates = startStr + '/' + endStr;
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${desc}&location=${loc}`, '_blank');
  };
};

function toCalDate(dateStr, timeStr, isStart) {
  if (!dateStr) return '';
  const d = dateStr.replace(/-/g, '');
  if (!timeStr) return isStart ? d : d;

  let h = 0, m = 0;
  const t = timeStr.trim();
  if (t.includes(':')) {
    const parts = t.split(':');
    h = parseInt(parts[0]);
    m = parseInt(parts[1]);
    if (t.toUpperCase().includes('PM') && h < 12) h += 12;
    if (t.toUpperCase().includes('AM') && h === 12) h = 0;
  } else if (t.includes('h')) {
    const parts = t.split('h');
    h = parseInt(parts[0]);
    m = parseInt(parts[1]) || 0;
  }
  if (!isStart) h += 1; // default 1-hour duration
  const pad = n => String(n).padStart(2, '0');
  return d + 'T' + pad(h) + pad(m) + '00';
}
