import { escapeHtml, formatBusinessHours } from './utils.js';

const EVENTS_CACHE_KEY = 'dauphins_events_cache';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

function getCachedEvents() {
  try {
    const raw = localStorage.getItem(EVENTS_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      localStorage.removeItem(EVENTS_CACHE_KEY);
      return null;
    }
    return cached.events;
  } catch (e) { return null; }
}

function setCachedEvents(events) {
  try {
    localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      events: events
    }));
  } catch (e) { /* storage full, ignore */ }
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
      .filter(e => new Date(e.date) >= now)
      .filter(e => {
        const key = (e.link || '').trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Show next 7 days first, then fill up to 12 with later events
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const withinWeek = allUpcoming.filter(e => new Date(e.date) <= nextWeek);
    const later = allUpcoming.filter(e => new Date(e.date) > nextWeek);
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
      const timeStr = event.time ? ` — ${event.time}` : '';
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

  // Check cache first (7-day TTL)
  let events = getCachedEvents();

  if (!events) {
    // Cache miss or expired — fetch fresh data
    try {
      const [staticEvents, dynamicEvents] = await Promise.all([
        fetchStaticEvents(),
        fetchMontrealEvents()
      ]);
      events = [...(staticEvents || []), ...(dynamicEvents || [])];
      setCachedEvents(events);
    } catch (e) {
      console.warn('Could not load events:', e);
      events = null;
    }
  }

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
      const timeStr = event.time ? ` — ${event.time}` : '';
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
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

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

function getPrimaryImage(event) {
  // Use Cloudinary URL if explicitly set in events.json
  if (event.image) return event.image;
  // Default: local fallback
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
  if (pool.length > 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return '';
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
        image: ''
      }));
  } catch (e) { console.warn('Montreal events fetch failed:', e); return []; }
}

export async function initBusinessGallery() {
  const galleryTrack = document.getElementById('business-gallery-track');
  if (!galleryTrack) return;
  const lang = document.documentElement.lang || 'fr';

  try {
    const registryResponse = await fetch('assets/Businesses/Registery.json');
    if (!registryResponse.ok) {
      console.warn('Business registry not found.');
      galleryTrack.innerHTML = '<p class="loading-msg">Galerie temporairement indisponible.</p>';
      return;
    }
    const registry = await registryResponse.json();
    const businessFiles = registry?.Businesses || [];

    const businessData = await Promise.all(businessFiles.map(async (filename) => {
      const response = await fetch(`assets/Businesses/${filename}`);
      if (!response.ok) return null;
      const data = await response.json();
      return { ...data, folder: filename.replace('.json', '') };
    }));

    const firstValidBusiness = businessData.find(b => b && b.images && b.images.length > 0);
    if (firstValidBusiness) {
      const section = galleryTrack.closest('.section');
      if (section) {
        // We use ../ here because relative paths in CSS variables used in a stylesheet 
        // are resolved relative to the stylesheet's location (/css/styles.css)
        section.style.setProperty('--section-bg', `url("../assets/Businesses/${firstValidBusiness.images[0]}")`);
      }
    }

    const cards = businessData.filter(Boolean).flatMap((business) => {
      return (business.images || []).map((image) => {
        const imageUrl = `assets/Businesses/${image}`;
        const fallbackImageUrl = `assets/Businesses/${business.folder}/${image}`;
        const hoursHtml = business.business_hours ? formatBusinessHours(business.business_hours, lang) : '';
        
        const ensureProtocol = (url) => (url && !url.startsWith('http')) ? `https://${url}` : url;

        let linksHtml = '';
        if (business.website) {
          const siteUrl = ensureProtocol(business.website);
          linksHtml += `<a href="${escapeHtml(siteUrl)}" target="_blank" rel="noopener"><span class="icon">🌐</span> Site web</a>`;
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
              const socialUrl = ensureProtocol(url);
              linksHtml += `<a href="${escapeHtml(socialUrl)}" target="_blank" rel="noopener"><span class="icon">${platforms[key].icon}</span> ${platforms[key].label}</a>`;
            }
          });
        }

        return `
          <div class="business-carousel-card lightbox-trigger" aria-label="${escapeHtml(business.name)}">
            <div class="business-header">
              <div class="business-name">${escapeHtml(business.name)}</div>
              <div class="business-desc">${escapeHtml(business.description || '')}</div>
            </div>
            <img src="${imageUrl}" alt="${escapeHtml(business.name)}" loading="lazy" draggable="false" class="lightbox-trigger" onerror="if (this.src !== '${fallbackImageUrl}') this.src='${fallbackImageUrl}'" />
            <div class="business-overlay">
              <div class="business-hours">${hoursHtml}</div>
              <div class="business-links">
                ${linksHtml}
              </div>
            </div>
          </div>
        `;
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
