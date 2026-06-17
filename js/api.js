import { escapeHtml, formatBusinessHours } from './utils.js';

export async function initEventsCarousel() {
  const track = document.getElementById('events-carousel-track');
  if (!track) return;

  const CACHE_KEY = 'dauphins_events_data';
  const CACHE_TIME_KEY = 'dauphins_events_timestamp';
  // Persistent metadata URL for the Public Events dataset
  const DATASET_METADATA_API = 'https://donnees.montreal.ca/api/3/action/package_show?id=evenements-publics';

  // Helper to parse CSV lines correctly handling quoted values
  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).filter(line => line.trim()).map(line => {
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
      headers.forEach((header, i) => { obj[header] = values[i] || ''; });
      return obj;
    });
  };

  const fetchAndParse = async () => {
    const lang = document.documentElement.lang || 'fr';
    try {
      // Step 1: Discover the current CSV Resource URL dynamically
      const metaResponse = await fetch(DATASET_METADATA_API);
      if (!metaResponse.ok) throw new Error('Could not fetch dataset metadata');
      const metaData = await metaResponse.json();
      
      const csvResource = metaData.result.resources.find(r => r.format.toUpperCase() === 'CSV');
      if (!csvResource || !csvResource.url) throw new Error('CSV Resource URL not found');

      // Step 2: Fetch the actual CSV data using the discovered URL
      const response = await fetch(csvResource.url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const csvText = await response.text();
      const records = parseCSV(csvText);
      
      const targetKeywords = ["verdure", "calixa"]; // Using keywords as per Step 2 of the test
      
      return records
        .filter(record => record.emplacement && targetKeywords.some(k => record.emplacement.toLowerCase().includes(k)))
        .map(record => ({
          title: record.titre || 'Événement',
          location: record.emplacement || '',
          date: new Date(record.date_debut).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-CA' : 'fr-CA', { month: 'long', day: 'numeric', year: 'numeric' }),
          image: record.url_image || '',
          link: record.url_fiche || '#'
        }));
    } catch (e) { console.error(e); return null; }
  };

  const render = (events) => {
    const lang = document.documentElement.lang || 'fr';
    if (!events || events.length === 0) {
      const emptyMsg = window.translations?.[lang]?.carousel_empty || 'Aucun événement trouvé pour le moment.';
      track.innerHTML = `<p class="loading-msg">${emptyMsg}</p>`;
      return;
    }
    
    track.innerHTML = events.map(event => `
      <a href="${escapeHtml(event.link)}" target="_blank" class="carousel-card">
        ${event.image ? `<img src="${escapeHtml(event.image)}" alt="${escapeHtml(event.title)}" loading="lazy">` : '<div style="height:140px; background:var(--bleu-pale);"></div>'}
        <div class="card-content">
          <div class="card-date">${escapeHtml(event.date)}</div>
          <h4 class="card-title">${escapeHtml(event.title)}</h4>
          ${event.location ? `<div class="card-location">${escapeHtml(event.location)}</div>` : ''}
        </div>
      </a>`).join('');
  };

  // Events API fetch on hold for now.
  // Rendering the empty state defined in translations.
  render(null);
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
