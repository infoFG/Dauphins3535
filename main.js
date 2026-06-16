/**
 * Logic for Les Dauphins-sur-le Parc
 */

document.addEventListener('DOMContentLoaded', async () => {
  initMenu();
  await initEventsCarousel();
  initLanguage();
  await initBusinessGallery();
  initLightbox();

  // Load static carousels after dynamic ones, before initializing enhanced carousels
  await loadStaticCarouselImages('apropos-carousel-track', '/assets/Apropos');
  await loadStaticCarouselImages('installations-carousel-track', '/assets/Installations');
  await loadStaticCarouselImages('quartier-park-carousel-track', '/assets/Quartier');

  // Load backgrounds for sections without carousels
  await loadSectionBackground('valeurs');
  await loadSectionBackground('condoweb');

  // Initialize the carousel logic
  initEnhancedCarousels();

  // Now that carousels are initialized, force a pips update
  document.querySelectorAll('.carousel-pips').forEach(pipsContainer => {
    const track = pipsContainer.closest('.carousel-container')?.querySelector('.carousel-track');
    if (track && track.updatePips) track.updatePips();
  });
  initScrollReveal();
});

/* ========== LANGUAGE MANAGEMENT ========== */
function initLanguage() {
  const btnEn = document.getElementById('lang-en');
  const btnFr = document.getElementById('lang-fr');

  if (!btnEn || !btnFr) return;
  
  const updateDOM = (lang) => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[lang] && translations[lang][key]) {
        el.innerHTML = translations[lang][key];
      }
    });
    
    // Update Active Buttons
    btnFr.classList.toggle('active', lang === 'fr');
    btnEn.classList.toggle('active', lang === 'en');
    
    // Update Page Metadata
    document.documentElement.lang = lang;
    localStorage.setItem('preferred-lang', lang);
  };

  btnEn.addEventListener('click', () => updateDOM('en'));
  btnFr.addEventListener('click', () => updateDOM('fr'));

  // Load preference
  const savedLang = localStorage.getItem('preferred-lang') || 'fr';
  updateDOM(savedLang);
}

/* ========== SIDEBAR MENU ========== */
function initMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggle = document.getElementById('menuToggle');

  if (!sidebar || !toggle) return;

  function closeMenu() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    toggle.textContent = '☰';
  }

  function openMenu() {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    toggle.textContent = '✕';
  }

  toggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeMenu() : openMenu();
  });

  overlay.addEventListener('click', closeMenu);

  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = a.getAttribute('href').substring(1);
      const target = document.getElementById(targetId);
      closeMenu();
      if (target) {
        setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 350);
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

/* ========== EVENTS CAROUSEL (Scraping + Caching) ========== */
async function initEventsCarousel() { // Renamed track ID for clarity
  const track = document.getElementById('events-carousel-track');
  if (!track) return;

  const CACHE_KEY = 'dauphins_events_data';
  const CACHE_TIME_KEY = 'dauphins_events_timestamp';
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const TARGET_URL = 'https://montreal.ca/lieux/theatre-de-verdure';
  // Switching to corsproxy.io because api.allorigins.win is returning a 522 timeout
  const PROXY_URL = 'https://corsproxy.io/?';

  async function fetchAndParse() {
    try {
      const response = await fetch(`${PROXY_URL}${encodeURIComponent(TARGET_URL)}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const html = await response.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const eventElements = doc.querySelectorAll('.l-card-event');
      const events = Array.from(eventElements).slice(0, 10).map(el => {
        const titleEl = el.querySelector('.l-card-event__title, h3');
        const dateEl = el.querySelector('.l-card-event__date, .date');
        const imgEl = el.querySelector('img');
        const linkEl = el.querySelector('a');

        const rawImg = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src');
        const rawLink = linkEl?.getAttribute('href');

        return {
          title: titleEl?.textContent.trim() || 'Événement',
          date: dateEl?.textContent.trim() || '',
          image: rawImg ? (rawImg.startsWith('http') ? rawImg : `https://montreal.ca${rawImg}`) : '',
          link: rawLink ? (rawLink.startsWith('http') ? rawLink : `https://montreal.ca${rawLink}`) : TARGET_URL
        };
      });

      if (events.length > 0) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(events));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        render(events);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
    return null;
  }

  function render(events) {
    if (!events || events.length === 0) {
      track.innerHTML = '<p class="loading-msg">Aucun événement trouvé pour le moment.</p>';
      return;
    }
    delete track.dataset.cloned; // Ensure clone flag is properly reset for re-initialization

    track.innerHTML = events.map(event => `
      <a href="${event.link}" target="_blank" class="carousel-card">
        ${event.image ? `<img src="${event.image}" alt="${event.title}" loading="lazy" class="lightbox-trigger">` : '<div style="height:140px; background:var(--bleu-pale);"></div>'}
        <div class="card-content">
          <div class="card-date">${event.date}</div>
          <h4 class="card-title">${event.title}</h4>
        </div>
      </a>
    `).join('');
  }

  // Check cache
  const cachedData = localStorage.getItem(CACHE_KEY);
  const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
  const now = Date.now();

  if (cachedData && cachedTime && (now - parseInt(cachedTime) < ONE_WEEK)) {
    render(JSON.parse(cachedData));
  } else {
    const events = await fetchAndParse();
    render(events || (cachedData ? JSON.parse(cachedData) : null));
  }
}

async function initBusinessGallery() {
  const galleryTrack = document.getElementById('business-gallery-track');
  if (!galleryTrack) return;

  try {
    const registryResponse = await fetch('/assets/Businesses/Registery.json');
    const registry = await registryResponse.json();
    const businessFiles = registry?.Businesses || [];

    const businessData = await Promise.all(businessFiles.map(async (filename) => {
      const response = await fetch(`/assets/Businesses/${filename}`);
      if (!response.ok) return null;
      const data = await response.json();
      return { ...data, folder: filename.replace('.json', '') };
    }));

    const firstValidBusiness = businessData.find(b => b && b.images && b.images.length > 0);
    if (firstValidBusiness) {
      const section = galleryTrack.closest('.section');
      if (section) {
        section.style.setProperty('--section-bg', `url('/assets/Businesses/${firstValidBusiness.images[0]}')`);
      }
    }

    const cards = businessData.filter(Boolean).flatMap((business) => {
      return (business.images || []).map((image) => {
        const imageUrl = `/assets/Businesses/${image}`;
        const fallbackImageUrl = `/assets/Businesses/${business.folder}/${image}`;
        const hoursHtml = business.business_hours ? formatBusinessHours(business.business_hours) : '';
        
        const ensureProtocol = (url) => (url && !url.startsWith('http')) ? `https://${url}` : url;

        // Generate social media links
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
      galleryTrack.innerHTML = '<p class="loading-msg">Aucune image disponible pour la galerie commerciale.</p>';
    } else {
      galleryTrack.innerHTML = cards.join('');
    }
  } catch (error) {
    console.error('Erreur de chargement de la galerie commerciale:', error);
    galleryTrack.innerHTML = '<p class="loading-msg">Impossible de charger la galerie commerciale.</p>';
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function setSectionBackgroundFromApropos(section) {
  if (!section) return;
  try {
    const aproposResponse = await fetch('/assets/Apropos/images.json');
    if (!aproposResponse.ok) return;
    const aproposImages = await aproposResponse.json();
    if (!Array.isArray(aproposImages) || aproposImages.length === 0) return;
    const randomImage = aproposImages[Math.floor(Math.random() * aproposImages.length)];
    section.style.setProperty('--section-bg', `url('/assets/Apropos/${randomImage}')`);
  } catch (error) {
    console.warn('Could not load fallback Apropos background:', error);
  }
}

/**
 * Dynamically loads images for a static carousel from a specified folder.
 * Assumes a 'images.json' file exists in the folder with an array of image filenames.
 * @param {string} trackId The ID of the carousel-track element.
 * @param {string} folderPath The path to the folder containing images.json and images.
 */
async function loadStaticCarouselImages(trackId, folderPath) {
  const track = document.getElementById(trackId);
  if (!track) return;

  try {
    const response = await fetch(`${folderPath}/images.json`).catch(() => null);
    
    if (response && response.ok) {
      const imageList = await response.json();
      
      // Update the section background to use the first image from the folder
      const section = track.closest('.section');
      if (section && imageList.length > 0) {
        section.style.setProperty('--section-bg', `url('${folderPath}/${imageList[0]}')`);
      }

      track.innerHTML = imageList.map(imageName => `
        <img src="${folderPath}/${imageName}" alt="${imageName.split('.')[0]}" aria-label="${imageName.split('.')[0]}" loading="lazy" class="lightbox-trigger" draggable="false">
      `).join('');
    } else {
      // Fallback: If JSON is missing, show a message or hide the container
      console.warn(`No images.json found in ${folderPath}. Please create one to list folder contents.`);
      if (section) await setSectionBackgroundFromApropos(section);
      track.innerHTML = '<p class="loading-msg">Images non configurées.</p>';
    }
  } catch (error) {
    console.error(`Error loading images for ${trackId}:`, error);
    track.innerHTML = '<p class="loading-msg">Impossible de charger les images.</p>';
  }
}

/**
 * Loads a background image for a section from a folder's images.json
 * @param {string} sectionId The ID of the section element.
 * @param {string} folderPath The path to the folder containing images.json.
 */
async function loadSectionBackground(sectionId, folderPath = '/assets/Apropos') {
  const section = document.getElementById(sectionId);
  if (!section) return;

  // If the requested path is the fallback Apropos folder, just select a random Apropos image.
  if (folderPath === '/assets/Apropos') {
    await setSectionBackgroundFromApropos(section);
    return;
  }

  try {
    const response = await fetch(`${folderPath}/images.json`);
    if (response.ok) {
      const imageList = await response.json();
      if (Array.isArray(imageList) && imageList.length > 0) {
        section.style.setProperty('--section-bg', `url('${folderPath}/${imageList[0]}')`);
        return;
      }
    }
  } catch (error) {
    console.warn(`Could not load background for section ${sectionId} from ${folderPath}`);
  }

  await setSectionBackgroundFromApropos(section);
}

function formatBusinessHours(hoursObj) {
  // Expecting an object like { monday: "08:00 - 18:00", ... }
  const order = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const labels = {
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat',
    sunday: 'Sun'
  };
  return order.map(day => {
    const val = hoursObj[day];
    if (!val) return '';
    return `<div class="bh-row"><span class="bh-day">${labels[day]}</span><span class="bh-time">${escapeHtml(val)}</span></div>`;
  }).join('');
}

/* ========== ENHANCED CAROUSEL (Drag, Arrows, Pips) ========== */
function initEnhancedCarousels(targetContainer = null) {
  const containers = targetContainer ? [targetContainer] : document.querySelectorAll('.carousel-container');
  
  containers.forEach((container, index) => {
    const track = container.querySelector('.carousel-track');
    
    // Skip if already initialized
    if (container.dataset.listenersAttached === "true") return;

    const prevBtn = container.querySelector('.carousel-btn.prev');
    const nextBtn = container.querySelector('.carousel-btn.next');
    const pipsContainer = container.querySelector('.carousel-pips');
    
    if (!track) return;

    // 0. Setup Infinite Loop (Clone first and last elements)
    if (track.children.length > 1 && !track.dataset.cloned) {
      const firstClone = track.children[0].cloneNode(true);
      const lastClone = track.children[track.children.length - 1].cloneNode(true);
      track.appendChild(firstClone);
      track.insertBefore(lastClone, track.children[0]);
      // Set initial scroll to the first "real" item
      const initialItem = track.children[1];
      track.scrollLeft = initialItem.offsetLeft - (track.offsetWidth - initialItem.offsetWidth) / 2;
      track.dataset.cloned = "true";
    }

    // 0. Hard-disable native browser image dragging to fix "file drop" behavior
    track.querySelectorAll('img').forEach(img => {
      img.setAttribute('draggable', 'false');
      img.addEventListener('dragstart', (e) => e.preventDefault());
    });

    // Auto Play Logic
    if (container.autoPlayTimeout) clearTimeout(container.autoPlayTimeout);
    if (container.autoPlayTimer) clearInterval(container.autoPlayTimer);
    
    const startAutoPlay = () => {
      // Only auto-play if there is content to scroll
      if (track.scrollWidth <= track.offsetWidth) return;
      
      container.autoPlayTimer = setInterval(() => {
        navigate(track, 1, 4000); // 4s for ambient autoplay
      }, 8000); // 12 second interval for longer pauses
    };

    const stopAutoPlay = () => {
      clearTimeout(container.autoPlayTimeout);
      clearInterval(container.autoPlayTimer);
    };
    let isInteracting = false;
    const resetAutoPlay = () => {
      stopAutoPlay();
      if (!isInteracting) startAutoPlay();
    };

    // Stagger the initial start by 1 second per carousel
    container.autoPlayTimeout = setTimeout(startAutoPlay, index * 2000);

    track.addEventListener('mouseenter', stopAutoPlay);
    track.addEventListener('mouseleave', () => {
      if (!isInteracting) startAutoPlay();
    });

    // 1. Navigation Arrows
    if (prevBtn) prevBtn.onclick = () => { 
      navigate(track, -1, 1000); // 1s for responsive manual clicks
      resetAutoPlay(); 
    };
    if (nextBtn) nextBtn.onclick = () => { 
      navigate(track, 1, 1000); // 1s for responsive manual clicks
      resetAutoPlay(); 
    };

    // 2. Drag to Scroll
    let isDown = false;
    let startX;
    let startY;
    let scrollLeft;
    let activePointerId = null; // Pointer ID for multi-touch support

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      
      isDown = true;
      isInteracting = true;
      activePointerId = e.pointerId;
      stopAutoPlay();
      track.isAnimationCanceled = true;
      if (track.scrollRequestID) {
        cancelAnimationFrame(track.scrollRequestID);
        track.scrollRequestID = null;
      }
      track.classList.remove('is-animating');
      track.classList.add('dragging');
      track.style.scrollSnapType = 'none';
      startX = e.clientX - track.getBoundingClientRect().left;
      startY = e.clientY - track.getBoundingClientRect().top;
      scrollLeft = track.scrollLeft;
      track.mouseDownX = e.clientX;
      track.mouseDownY = e.clientY;
    };

    const onPointerMove = (e) => {
      if (!isDown || e.pointerId !== activePointerId) return;
      
      const dx = Math.abs(e.clientX - track.mouseDownX);
      const dy = Math.abs(e.clientY - track.mouseDownY);

      // Only transition to "dragging" state if the pointer has moved enough
      // This prevents capturing simple clicks as drags
      if (!track.classList.contains('dragging')) {
        if (dx > 10 || dy > 10) {
          track.classList.add('dragging');
          track.setPointerCapture(activePointerId);
          track.style.scrollSnapType = 'none';
        } else {
          return; // Still a potential click, don't move the track yet
        }
      }

      e.preventDefault(); // Stop browser scrolling/drag-drop now that we are dragging
      const x = e.clientX - track.getBoundingClientRect().left;
      const walk = x - startX;
      track.scrollLeft = scrollLeft - walk;
    };

    const stopDragging = () => {
      if (!isDown) return;
      isDown = false;
      isInteracting = false;
      if (activePointerId !== null && track.hasPointerCapture(activePointerId)) {
        track.releasePointerCapture(activePointerId);
      }
      activePointerId = null;
      track.classList.remove('dragging'); // Remove immediately so lightbox can open
      
      // Start the snap animation before restoring browser scroll snapping.
      const items = track.children;
      if (items.length === 0) return;

      const scrollCenter = track.scrollLeft + track.offsetWidth / 2;
      
      let closestIdx = 0;
      let minDistance = Infinity;
      for (let i = 0; i < items.length; i++) {
        const itemCenter = items[i].offsetLeft + items[i].offsetWidth / 2;
        const dist = Math.abs(itemCenter - scrollCenter);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = i;
        }
      }

      const targetScroll = items[closestIdx].offsetLeft - (track.offsetWidth - items[closestIdx].offsetWidth) / 2;
      let teleportTarget = null;

      // Only teleport if the carousel is in infinite mode
      if (track.dataset.cloned === "true") {
        if (closestIdx === 0) {
          teleportTarget = items[items.length - 2].offsetLeft - (track.offsetWidth - items[items.length - 2].offsetWidth) / 2;
        } else if (closestIdx === items.length - 1) {
          teleportTarget = items[1].offsetLeft - (track.offsetWidth - items[1].offsetWidth) / 2;
        }
      }

      smoothScrollTo(track, targetScroll, 750, teleportTarget, () => {
        track.style.scrollSnapType = '';
        isInteracting = false;
        resetAutoPlay();
      });
    };

    // Attach pointer event listeners only once
    if (!container.dataset.listenersAttached) {
      track.addEventListener('pointerdown', onPointerDown);
      track.addEventListener('pointermove', onPointerMove);
      track.addEventListener('pointerup', stopDragging);
      track.addEventListener('pointercancel', stopDragging);
    }

    // 3. Pips (Pagination)
    if (pipsContainer) {
      const updatePips = () => {
        const items = Array.from(track.children).filter(el => !el.classList.contains('loading-msg') && el.nodeName !== 'P'); // Filter out potential error messages
        if (items.length === 0) return;
        
        pipsContainer.innerHTML = '';
        items.forEach((_, i) => {
          const pip = document.createElement('button'); // Use button for accessibility
          pip.className = 'pip';
          
          // Find the currently centered real item for active pip
          const scrollCenter = track.scrollLeft + track.offsetWidth / 2;
          let activeRealItemIndex = -1;
          let minDistance = Infinity;

          // Iterate over all items (including clones) to find the one closest to center
          for (let j = 0; j < items.length; j++) {
            const item = items[j];
            const itemCenter = item.offsetLeft + item.offsetWidth / 2;
            const dist = Math.abs(itemCenter - scrollCenter);
            if (dist < minDistance) {
              minDistance = dist;
              // Determine the real index for the active pip
              if (track.dataset.cloned === "true") {
                const realItemsCount = items.length - 2; // Exclude clones
                if (j === 0) activeRealItemIndex = realItemsCount - 1; // First clone maps to last real item
                else if (j === items.length - 1) activeRealItemIndex = 0; // Last clone maps to first real item
                else activeRealItemIndex = j - 1; // Real items are shifted by 1 due to prepended clone
              } else {
                activeRealItemIndex = j; // No clones, direct mapping
              }
            }
          }

          if (i === activeRealItemIndex) {
            pip.classList.add('active');
          }

          pip.onclick = () => {
            let targetItemIndexInAllItems = i;
            if (track.dataset.cloned === "true") {
              // For infinite carousels, target the real item (index i+1 because of prepended clone)
              targetItemIndexInAllItems = i + 1; 
            }
            const targetItem = items[targetItemIndexInAllItems];
            if (targetItem) {
              const targetScroll = targetItem.offsetLeft - (track.offsetWidth - targetItem.offsetWidth) / 2;
              // Use smoothScrollTo for consistency, and let it handle teleporting if it lands on a clone
              smoothScrollTo(track, targetScroll, 750, null, resetAutoPlay);
            }
          };
          pipsContainer.appendChild(pip);
        });
      };
      track.updatePips = updatePips; // Expose updatePips for external calls

      track.addEventListener('scroll', updatePips);
      // Initial pips load
      setTimeout(updatePips, 500);
    }
    container.dataset.listenersAttached = "true";
  });
}

/**
 * Custom scroll function to control animation duration
 * @param {HTMLElement} el The element to scroll
 * @param {number} target The target scrollLeft position
 * @param {number} duration Animation duration in ms
 * @param {number|null} teleportTarget Position to jump to after finish
 */
function smoothScrollTo(el, target, duration, teleportTarget = null, onFinish = null) {
  if (el.scrollRequestID) cancelAnimationFrame(el.scrollRequestID);

  const start = el.scrollLeft;
  const change = target - start;
  const startTime = performance.now();
  el.isAnimationCanceled = false;
  el.classList.add('is-animating');

  function animate(currentTime) {
    if (el.isAnimationCanceled) {
      el.classList.remove('is-animating');
      el.scrollRequestID = null;
      return;
    }
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // easeInOutQuad: soft start and soft finish
    const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
    
    el.scrollLeft = start + change * ease;
    if (progress < 1) {
      el.scrollRequestID = requestAnimationFrame(animate);
    } else {
      el.classList.remove('is-animating');
      if (teleportTarget !== null) el.scrollLeft = teleportTarget;
      el.scrollRequestID = null;
      if (typeof onFinish === 'function') onFinish();
    }
  }
  el.scrollRequestID = requestAnimationFrame(animate);
}

/**
 * Handles infinite carousel navigation logic
 * @param {HTMLElement} track The scroll container
 * @param {number} direction -1 for prev, 1 for next
 * @param {number} duration Animation duration in ms
 */
function navigate(track, direction, duration = 4000) {
  // Guard: Don't start a new movement if we are already animating
  if (track.classList.contains('is-animating')) return;

  const items = Array.from(track.children);
  if (items.length === 0) return;

  const scrollCenter = track.scrollLeft + track.offsetWidth / 2;
  const isInfinite = track.dataset.cloned === "true";
  
  // Find current center index
  let currentIdx = 0;
  let minDistance = Infinity;
  for (let i = 0; i < items.length; i++) {
    const itemCenter = items[i].offsetLeft + items[i].offsetWidth / 2;
    const dist = Math.abs(itemCenter - scrollCenter);
    if (dist < minDistance) {
      minDistance = dist;
      currentIdx = i;
    }
  }

  let nextIdx = currentIdx + direction;
  let teleportTo = null;

  if (isInfinite) {
    // If sitting on a clone, jump to real item instantly before animating
    if (currentIdx === 0 && direction < 0) {
      const realLastItem = items[items.length - 2];
      track.scrollLeft = realLastItem.offsetLeft - (track.offsetWidth - realLastItem.offsetWidth) / 2;
      currentIdx = items.length - 2;
      nextIdx = currentIdx + direction;
    } else if (currentIdx === items.length - 1 && direction > 0) {
      const realFirstItem = items[1];
      track.scrollLeft = realFirstItem.offsetLeft - (track.offsetWidth - realFirstItem.offsetWidth) / 2;
      currentIdx = 1;
      nextIdx = currentIdx + direction;
    }

    if (nextIdx === items.length - 1) {
      teleportTo = items[1].offsetLeft - (track.offsetWidth - items[1].offsetWidth) / 2;
    } else if (nextIdx === 0) {
      teleportTo = items[items.length - 2].offsetLeft - (track.offsetWidth - items[items.length - 2].offsetWidth) / 2;
    }
  } else {
    // Boundary clamping for non-infinite carousels (Business Gallery)
    if (nextIdx < 0) nextIdx = 0;
    if (nextIdx >= items.length) nextIdx = items.length - 1;
  }

  const targetItem = items[nextIdx];
  if (!targetItem) return;

  const targetScroll = targetItem.offsetLeft - (track.offsetWidth - targetItem.offsetWidth) / 2;
  smoothScrollTo(track, targetScroll, duration, teleportTo);
}

/* ========== SCROLL REVEAL (Sliding into place) ========== */
function initScrollReveal() {
  const observerOptions = {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        // Once revealed, we can stop observing this element
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Target both content boxes and carousels
  document.querySelectorAll('.content-box, .carousel-container').forEach(el => {
    observer.observe(el);
  });
}

/* ========== LIGHTBOX ========== */
function initLightbox() {
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const closeBtn = document.getElementById('lightboxClose');
  
  if (!lightbox || !lightboxImg) return;

  document.addEventListener('click', async (e) => { // Make async to await image loading
    // Get the primary trigger element
    let trigger = e.target.closest('.lightbox-trigger');
    if (trigger) {
      // If clicking a link/button inside a trigger card, let the link work instead of opening lightbox
      const interactive = e.target.closest('a, button');
      if (interactive) {
        // If the link is inside the trigger (like business links in a card), prioritize the link.
        // If the trigger is inside the link (like event image in a link), prioritize the lightbox.
        if (trigger.contains(interactive) && trigger !== interactive) return;
      }

      // Dragging check: prevent opening if the user was actually dragging the carousel
      const track = trigger.closest('.carousel-track');
      if (track) {
        // If the track is currently in dragging state, don't open lightbox
        if (track.classList.contains('dragging')) return;

        // Use coordinate delta to distinguish click from drag
        if (track.mouseDownX !== undefined && track.mouseDownY !== undefined) {
          const deltaX = Math.abs(e.clientX - track.mouseDownX);
          const deltaY = Math.abs(e.clientY - track.mouseDownY);
          // Relaxed threshold to be more forgiving for accidental movements during click (especially on touch)
          if (deltaX > 30 || deltaY > 30) return; 
        }
      }
      // Prevent the anchor link from firing (especially important for business gallery href="#")
      e.preventDefault();
      
      let source = "";
      let caption = "";

      if (trigger.tagName === 'IMG') {
        source = trigger.src;
        caption = trigger.getAttribute('alt') || trigger.getAttribute('aria-label') || "";
      } else {
        // For cards/divs acting as triggers
        const img = trigger.querySelector('img');
        if (img) {
          source = img.src;
          caption = trigger.getAttribute('aria-label') || img.getAttribute('alt') || "";
        }
        // Fallback for business cards
        const nameEl = trigger.querySelector('.business-name');
        if (!caption && nameEl) caption = nameEl.textContent;
      }

      if (source) {
        lightboxImg.src = source;
        if (lightboxCaption) lightboxCaption.textContent = caption;
        lightbox.classList.add('open');
      }
    }
  });

  const closeLightbox = () => lightbox.classList.remove('open');

  if (closeBtn) closeBtn.onclick = closeLightbox;

  lightbox.addEventListener('click', (e) => {
    if (e.target !== lightboxImg) {
      closeLightbox();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
  });
}