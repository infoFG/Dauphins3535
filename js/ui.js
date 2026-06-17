import { formatBusinessHours, escapeHtml } from './utils.js';

/* ========== SIDEBAR MENU ========== */
export function initMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggle = document.getElementById('menuToggle');

  if (!sidebar || !toggle) return;

  const closeMenu = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    toggle.textContent = '☰';
  };

  const openMenu = () => {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    toggle.textContent = '✕';
  };

  toggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeMenu() : openMenu();
  });

  overlay.addEventListener('click', closeMenu);

  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (href.startsWith('#')) {
        e.preventDefault();
        const targetId = href.substring(1);
        const target = document.getElementById(targetId);
        closeMenu();
        if (target) {
          setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 350);
        }
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

/* ========== LANGUAGE MANAGEMENT ========== */
export function initLanguage() {
  const btnEn = document.getElementById('lang-en');
  const btnFr = document.getElementById('lang-fr');

  if (!btnEn || !btnFr) return;
  
  const updateDOM = (lang) => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      // Accessing global translations from translations.js
      if (window.translations && window.translations[lang] && window.translations[lang][key]) {
        el.innerHTML = window.translations[lang][key];
      }
    });
    btnFr.classList.toggle('active', lang === 'fr');
    btnEn.classList.toggle('active', lang === 'en');
    document.documentElement.lang = lang;
    localStorage.setItem('preferred-lang', lang);
  };

  btnEn.addEventListener('click', () => updateDOM('en'));
  btnFr.addEventListener('click', () => updateDOM('fr'));
  updateDOM(localStorage.getItem('preferred-lang') || 'fr');
}

/* ========== LIGHTBOX ========== */
export function initLightbox() {
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const closeBtn = document.getElementById('lightboxClose');
  
  if (!lightbox || !lightboxImg) return;

  document.addEventListener('click', (e) => {
    let trigger = e.target.closest('.lightbox-trigger');
    if (trigger) {
      const interactive = e.target.closest('a, button');
      if (interactive && trigger.contains(interactive) && trigger !== interactive) return;

      const track = trigger.closest('.carousel-track');
      if (track) {
        if (track.classList.contains('dragging')) return;
        if (track.mouseDownX !== undefined) {
          const deltaX = Math.abs(e.clientX - track.mouseDownX);
          const deltaY = Math.abs(e.clientY - track.mouseDownY);
          if (deltaX > 30 || deltaY > 30) return; 
        }
      }
      
      e.preventDefault();
      let source = "";
      let caption = "";

      if (trigger.tagName === 'IMG') {
        source = trigger.src;
        caption = trigger.getAttribute('alt') || trigger.getAttribute('aria-label') || "";
      } else {
        const img = trigger.querySelector('img');
        if (img) {
          source = img.src;
          caption = trigger.getAttribute('aria-label') || img.getAttribute('alt') || "";
        }
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
    if (e.target !== lightboxImg) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
  });
}

/* ========== SCROLL REVEAL ========== */
export function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.content-box, .carousel-container').forEach(el => {
    observer.observe(el);
  });
}

/* Helper to parse "08:00 AM - 06:00 PM" into { open: 8, close: 18 } */
function parseTimeRange(rangeStr) {
  if (!rangeStr || rangeStr.toLowerCase() === 'closed') return null;
  const parts = rangeStr.split(' - ');
  if (parts.length !== 2) return null;

  const parse = (timeStr) => {
    const [time, period] = timeStr.split(' ');
    let [h, m] = time.split(':').map(Number);
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h + (m / 60);
  };
  return { open: parse(parts[0]), close: parse(parts[1]) };
}

/* Helper for Day Planner Axis */
function generateTimeAxisHtml(start, end) {
  let html = '<div class="time-axis">';
  let grid = '';
  const step = (end - start) / 4;
  for (let i = 0; i <= 4; i++) {
    const h = start + (step * i);
    const top = (i / 4) * 100;
    html += `<div class="time-axis-label" style="top: ${top}%">${Math.round(h)}h</div>`;
    if (i < 4) grid += `<div class="grid-line" style="top: ${top}%"></div>`;
  }
  return { axis: html + '</div>', grid };
}

export function initDayPlanners(faqData = {}) {
  const planners = document.querySelectorAll('.day-planner');
  const now = new Date();
  const currentDay = (now.getDay() + 6) % 7; 
  const currentTime = now.getHours() + now.getMinutes() / 60;
  const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const lang = document.documentElement.lang || 'fr';

  const configs = {
    admin: { start: 6, end: 18 },
    pool: { start: 0, end: 24 }
  };

  const labels = lang === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  planners.forEach(planner => {
    const type = planner.dataset.config;
    const config = configs[type];
    const hoursData = faqData[type]?.business_hours;
    if (!config || !hoursData) return;

    // Update the text info list on the left to match JSON data
    const infoBox = planner.closest('.content-box')?.querySelector('.faq-info');
    if (infoBox) {
      infoBox.innerHTML = `<div class="hours-list">${formatBusinessHours(hoursData, lang)}</div>`;
    }

    const { axis, grid } = generateTimeAxisHtml(config.start, config.end);
    const range = config.end - config.start;

    const columnsHtml = labels.map((label, idx) => {
      const times = parseTimeRange(hoursData[dayKeys[idx]]);
      const isToday = idx === currentDay;
      const nowPos = ((currentTime - config.start) / range) * 100;
      
      let barHtml = ''; 
      if (times) {
        const barTop = Math.max(0, ((times.open - config.start) / range) * 100);
        const barBottom = Math.min(100, ((times.close - config.start) / range) * 100);
        const barHeight = barBottom - barTop;
        if (barHeight > 0) {
          barHtml = `<div class="time-bar" style="top:${barTop}%; height:${barHeight}%"></div>`;
        }
      }

      return `
        <div class="planner-column">
          <div class="time-track">
            ${barHtml}
            ${isToday && nowPos >= 0 && nowPos <= 100 ? `<div class="now-indicator" style="top:${nowPos}%"></div>` : ''}
          </div>
          <div class="day-label">${label}</div>
        </div>`;
    }).join('');

    planner.innerHTML = axis + `<div class="columns-container">${grid + columnsHtml}</div>`;
  });
}

export function initWasteCalendar() {
  const container = document.getElementById('waste-calendar');
  if (!container) return;

  const now = new Date();
  const month = now.getMonth(); // Mois actuel (0-11)
  const year = now.getFullYear();
  const lang = document.documentElement.lang || 'fr';
  const t = (key) => window.translations?.[lang]?.[key] || key;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Simplified rules: Fri=Garbage, Tue=Compost, Wed=Recycling, 1st Wed=Large
  const getIcons = (dayNum, dayOfWeek) => {
    let icons = '';
    if (dayOfWeek === 5) icons += '🗑️'; // Fri
    if (dayOfWeek === 2) icons += '♻️'; // Tue
    if (dayOfWeek === 3) {
      icons += '📦'; // Wed Recycling
      if (dayNum <= 7) icons += '🛋️'; // 1st Wed Large Items
    }
    return icons;
  };

  const dayNames = lang === 'en' ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] : ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const monthName = t(`calendar_month_${month}`);

  let html = `<div class="calendar-header">${monthName} ${year}</div><div class="calendar-grid">`;
  html += dayNames.map(d => `<div class="calendar-day-name">${d}</div>`).join('');

  for(let i=0; i < firstDay; i++) html += `<div class="calendar-day empty"></div>`;

  for(let d=1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const isToday = d === now.getDate();
    const icons = getIcons(d, date.getDay());
    html += `
      <div class="calendar-day ${isToday ? 'is-today' : ''}">
        <div class="day-num">${d}</div>
        <div class="day-icons">${icons}</div>
      </div>`;
  }
  container.innerHTML = html + '</div>';
}