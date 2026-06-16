/**
 * Logic for Les Dauphins-sur-le Parc
 */

document.addEventListener('DOMContentLoaded', () => {
  initMenu();
  initEventsCarousel();
  initLanguage();
  initBusinessGallery();
  initEnhancedCarousels();
  initLightbox();
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
async function initEventsCarousel() {
  const track = document.getElementById('carousel-track');
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
        return events;
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
    track.dataset.cloned = ""; // Reset clone flag to allow re-initialization of the loop

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
  initEnhancedCarousels(); // Standardize: init after render attempt
}

async function initBusinessGallery() {
  const galleryTrack = document.getElementById('business-gallery-track');
  if (!galleryTrack) return;

  try {
    const registryResponse = await fetch('assets/Businesses/Registery.json');
    const registry = await registryResponse.json();
    const businessFiles = registry?.Businesses || [];

    const businessData = await Promise.all(businessFiles.map(async (filename) => {
      const response = await fetch(`assets/Businesses/${filename}`);
      return response.ok ? response.json() : null;
    }));

    const cards = businessData.filter(Boolean).flatMap((business) => {
      return (business.images || []).map((image, index) => {
        const imageUrl = `assets/Businesses/${image}`;

        return `
          <div class="business-carousel-card">
            <img src="${imageUrl}" alt="${escapeHtml(business.name)}" loading="lazy" draggable="false" class="lightbox-trigger" />
          </div>
        `;
      });
    });

    if (cards.length === 0) {
      galleryTrack.innerHTML = '<p class="loading-msg">Aucune image disponible pour la galerie commerciale.</p>';
    } else {
      galleryTrack.innerHTML = cards.join('');
      initEnhancedCarousels();
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

/* ========== ENHANCED CAROUSEL (Drag, Arrows, Pips) ========== */
function initEnhancedCarousels() {
  const containers = document.querySelectorAll('.carousel-container');
  
  containers.forEach((container, index) => {
    const track = container.querySelector('.carousel-track');
    const prevBtn = container.querySelector('.carousel-btn.prev');
    const nextBtn = container.querySelector('.carousel-btn.next');
    const pipsContainer = container.querySelector('.carousel-pips');
    
    if (!track) return;

    // 0. Setup Infinite Loop (Clone first and last elements) — skip for business gallery
    if (track.id !== 'business-gallery-track' && track.children.length > 1 && !track.dataset.cloned) {
      const firstClone = track.children[0].cloneNode(true);
      const lastClone = track.children[track.children.length - 1].cloneNode(true);
      track.appendChild(firstClone);
      track.insertBefore(lastClone, track.children[0]);
      // Set initial scroll to the first "real" item
      track.scrollLeft = track.children[1].offsetLeft - (track.offsetWidth - track.children[1].offsetWidth) / 2;
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

    // Stagger the initial start by 2 seconds per carousel
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
    let activePointerId = null;

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      isDown = true;
      isInteracting = true;
      activePointerId = e.pointerId;
      track.setPointerCapture(activePointerId);
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
      track.mouseDownX = e.pageX;
      track.mouseDownY = e.pageY;
    };

    const onPointerMove = (e) => {
      if (!isDown || e.pointerId !== activePointerId) return;
      e.preventDefault();
      const x = e.clientX - track.getBoundingClientRect().left;
      const walk = x - startX;
      track.scrollLeft = scrollLeft - walk;
    };

    const stopDragging = () => {
      if (!isDown) return;
      isDown = false;
      isInteracting = false;
      if (activePointerId !== null) {
        track.releasePointerCapture(activePointerId);
        activePointerId = null;
      }
      track.classList.remove('dragging'); // Remove immediately so lightbox can open
      
      // Start the snap animation before restoring browser scroll snapping.
      const items = track.children;
      const scrollCenter = track.scrollLeft + track.offsetWidth / 2;
      
      let closestIdx = 0;
      let minDistance = Infinity;
      Array.from(items).forEach((item, idx) => {
        const itemCenter = item.offsetLeft + item.offsetWidth / 2;
        const dist = Math.abs(itemCenter - scrollCenter);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });

      const targetScroll = items[closestIdx].offsetLeft - (track.offsetWidth - items[closestIdx].offsetWidth) / 2;
      let teleportTarget = null;

      if (closestIdx === 0) {
        teleportTarget = items[items.length - 2].offsetLeft - (track.offsetWidth - items[items.length - 2].offsetWidth) / 2;
      } else if (closestIdx === items.length - 1) {
        teleportTarget = items[1].offsetLeft - (track.offsetWidth - items[1].offsetWidth) / 2;
      }

      smoothScrollTo(track, targetScroll, 750, teleportTarget, () => {
        track.style.scrollSnapType = '';
        isInteracting = false;
        resetAutoPlay();
      });
    };

    track.addEventListener('pointerdown', onPointerDown);
    track.addEventListener('pointermove', onPointerMove);
    track.addEventListener('pointerup', stopDragging);
    track.addEventListener('pointercancel', stopDragging);

    // 3. Pips (Pagination)
    if (pipsContainer) {
      const updatePips = () => {
        const items = track.querySelectorAll('img, .carousel-card');
        if (items.length === 0) return;
        
        pipsContainer.innerHTML = '';
        items.forEach((_, i) => {
          const pip = document.createElement('div');
          pip.className = 'pip';
          // Simple logic: check which item is most visible
          const rect = track.getBoundingClientRect();
          const itemRect = items[i].getBoundingClientRect();
          if (Math.abs(itemRect.left - rect.left) < rect.width / 2) {
            pip.classList.add('active');
          }
          pip.onclick = () => {
            track.isAnimationCanceled = true;
            items[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            resetAutoPlay();
          };
          pipsContainer.appendChild(pip);
        });
      };

      track.addEventListener('scroll', updatePips);
      // Initial pips load
      setTimeout(updatePips, 500);
    }
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
  const scrollCenter = track.scrollLeft + track.offsetWidth / 2;
  
  // Find current center index
  let currentIdx = 0;
  let minDistance = Infinity;
  items.forEach((item, idx) => {
    const itemCenter = item.offsetLeft + item.offsetWidth / 2;
    const dist = Math.abs(itemCenter - scrollCenter);
    if (dist < minDistance) {
      minDistance = dist;
      currentIdx = idx;
    }
  });

  // If we are currently sitting on a clone, jump to the real item instantly before animating
  if (currentIdx === 0 && direction < 0) {
    // Jump from the start-clone to the real last item
    const realLastItem = items[items.length - 2];
    track.scrollLeft = realLastItem.offsetLeft - (track.offsetWidth - realLastItem.offsetWidth) / 2;
    currentIdx = items.length - 2;
  } else if (currentIdx === items.length - 1 && direction > 0) {
    // Jump from the end-clone to the real first item
    const realFirstItem = items[1];
    track.scrollLeft = realFirstItem.offsetLeft - (track.offsetWidth - realFirstItem.offsetWidth) / 2;
    currentIdx = 1;
  }

  let nextIdx = currentIdx + direction;
  let teleportTo = null;

  // Identify if the move lands on a buffer clone
  if (nextIdx === items.length - 1) { // Moving forward into the end-clone
    teleportTo = items[1].offsetLeft - (track.offsetWidth - items[1].offsetWidth) / 2;
  } else if (nextIdx === 0) { // Moving backward into the start-clone
    teleportTo = items[items.length - 2].offsetLeft - (track.offsetWidth - items[items.length - 2].offsetWidth) / 2;
  }

  const targetItem = items[nextIdx];
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
  const closeBtn = document.getElementById('lightboxClose');
  
  if (!lightbox || !lightboxImg) return;

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('lightbox-trigger')) {
      // Threshold check: prevent opening if the user was actually dragging the carousel
      const track = e.target.closest('.carousel-track');
      if (track) {
        // If the track is currently in dragging state, don't open lightbox
        if (track.classList.contains('dragging')) return;
        
        // For carousels with old mouseDown tracking, check delta movement
        if (track.mouseDownX !== undefined) {
          const deltaX = Math.abs(e.pageX - track.mouseDownX);
          const deltaY = Math.abs(e.pageY - track.mouseDownY);
          if (deltaX > 10 || deltaY > 10) return;
        }
      }

      lightboxImg.src = e.target.src;
      lightbox.classList.add('open');
    }
  });

  const closeLightbox = () => lightbox.classList.remove('open');

  if (closeBtn) closeBtn.onclick = closeLightbox;

  lightbox.addEventListener('click', (e) => {
    if (e.target !== lightboxImg) {
      closeLightbox();
    }
  });
}