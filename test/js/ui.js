import { formatBusinessHours, escapeHtml, getDayLabels, isCurrentlyOpen, getLocalDateStr } from './utils.js';

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
    document.dispatchEvent(new CustomEvent('languagechanged', { detail: { lang } }));
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
function parseTimeRanges(value) {
  if (!value) return null;
  // Accept both a single string and an array of strings
  const rangeStrings = Array.isArray(value) ? value : [value];
  const ranges = rangeStrings.map(rangeStr => {
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
  }).filter(Boolean);
  return ranges.length > 0 ? ranges : null;
}

/* Helper for Day Planner Axis */
function generateTimeAxisHtml(start, end) {
  let html = '<div class="time-axis">';
  const step = (end - start) / 4;
  for (let i = 0; i <= 4; i++) {
    const h = start + (step * i);
    const top = (i / 4) * 100;
    // Skip the very top (0%) grid line and label — grid at 6/12/18/24 only
    if (i > 0) {
      html += `<div class="time-axis-label" style="top: ${top}%">${Math.round(h)}h</div>`;
      if (i < 4) html += `<div class="grid-line" style="top: ${top}%"></div>`;
    }
  }
  return { axis: html + '</div>' };
}

/* Check if a specific date is a holiday */
function isDateHoliday(holidays, dateStr, scope) {
  if (!holidays || !holidays.length) return null;
  const lang = document.documentElement.lang || 'fr';
  const nameField = lang === 'fr' ? 'name_fr' : 'name_en';

  for (const h of holidays) {
    let match = false;
    if (h.date && h.date.startsWith('--')) {
      const [_, mm, dd] = h.date.split('-');
      const d = new Date(dateStr);
      match = (parseInt(mm) === d.getMonth() + 1 && parseInt(dd) === d.getDate());
    } else if (h.date) {
      match = h.date === dateStr;
    }

    if (match) {
      const affectsKey = 'affects_' + (scope === 'admin' ? 'office' : scope);
      const applies = h[affectsKey] === undefined || (h[affectsKey] && h[affectsKey].toLowerCase() !== 'false');
      if (applies) return h[nameField] || h.name_fr || h.name_en || '';
    }
  }
  return null;
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

  const labels = getDayLabels(lang);

  planners.forEach(planner => {
    const type = planner.dataset.config;
    const config = configs[type];
    const data = faqData[type];
    const hoursData = data?.business_hours;
    const closuresData = data?.closures;
    if (!config || !hoursData) return;

    // Check if today is a holiday for this scope
    const holidays = data._holidays || [];
    const todayStr = getLocalDateStr();

    // Get the Monday of current week
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // Monday=0
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek);

    // Build date strings for each day this week
    const weekDates = dayKeys.map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return getLocalDateStr(d);
    });

    // Check today's holiday for status badge
    const todayHolidayName = isDateHoliday(holidays, todayStr, type);

    // Update the text info list on the left to match JSON data
    const infoBox = planner.closest('.content-box')?.querySelector('.faq-info');
    if (infoBox) {
      let noteHtml = '';
      const noteKey = `cleaning_note_${lang}`;
      console.log('initDayPlanners POOL:', type, 'noteKey:', noteKey, 'data keys:', data ? Object.keys(data).filter(k => k.includes('cleaning') || k.includes('desc')) : 'null', 'noteValue:', JSON.stringify(data?.[noteKey]));
      if (data?.[noteKey]) {
        noteHtml = `<p class="cleaning-note">${escapeHtml(data[noteKey])}</p>`;
      }

      // Holiday note above hours list
      let holidayNote = '';
      if (todayHolidayName) {
        holidayNote = `<p class="holiday-note">${lang === 'fr' ? 'Fermé aujourd\'hui — ' : 'Closed today — '}${escapeHtml(todayHolidayName)}</p>`;
      }

      // Build hours list with holiday annotations for this week
      const hoursListHtml = dayKeys.map((d, i) => {
        const val = hoursData[d];
        if (!val) return '';
        const dayHoliday = isDateHoliday(holidays, weekDates[i], type);
        const display = dayHoliday
          ? `${lang === 'fr' ? 'Fermé' : 'Closed'} — ${escapeHtml(dayHoliday)}`
          : val;
        const cls = (dayHoliday ? 'bh-holiday' : '') + (i === currentDay ? ' bh-today' : '');
        return `<div class="bh-row${cls ? ' ' + cls : ''}"><span class="bh-day">${labels[i]}</span><span class="bh-time">${escapeHtml(display)}</span></div>`;
      }).join('');

      infoBox.innerHTML = `${holidayNote}<div class="hours-list">${hoursListHtml}</div>${noteHtml}`;

      // Status: holiday overrides normal open/closed
      let status, statusText;
      if (todayHolidayName) {
        status = 'closed';
        statusText = todayHolidayName;
      } else {
        status = isCurrentlyOpen(hoursData, closuresData);
        const statusKey = 'status_' + status;
        statusText = window.translations?.[lang]?.[statusKey] || status;
      }
      infoBox.innerHTML += `<p class="status-badge status-${status}">${statusText}</p>`;
    }

    const { axis } = generateTimeAxisHtml(config.start, config.end);
    const range = config.end - config.start;

    const columnsHtml = labels.map((label, idx) => {
      const isToday = idx === currentDay;
      const dayDate = weekDates[idx];
      const dayHolidayName = isDateHoliday(holidays, dayDate, type);

      const ranges = parseTimeRanges(hoursData[dayKeys[idx]]);
      const closures = closuresData ? parseTimeRanges(closuresData[dayKeys[idx]]) : null;
      const nowPos = ((currentTime - config.start) / range) * 100;
      
      let barHtml = '';
      if (!dayHolidayName) {
        if (ranges) {
          barHtml = ranges.map(r => {
            const barTop = Math.max(0, ((r.open - config.start) / range) * 100);
            const barBottom = Math.min(100, ((r.close - config.start) / range) * 100);
            const barHeight = barBottom - barTop;
            if (barHeight > 0) {
              return `<div class="time-bar" style="top:${barTop}%; height:${barHeight}%"></div>`;
            }
            return '';
          }).join('');
        }
        if (closures) {
          barHtml += closures.map(c => {
            const barTop = Math.max(0, ((c.open - config.start) / range) * 100);
            const barBottom = Math.min(100, ((c.close - config.start) / range) * 100);
            const barHeight = barBottom - barTop;
            if (barHeight > 0) {
              return `<div class="time-bar closure" style="top:${barTop}%; height:${barHeight}%"></div>`;
            }
            return '';
          }).join('');
        }
      }

      return `
        <div class="planner-column${isToday ? ' is-today' : ''}${dayHolidayName ? ' is-holiday' : ''}">
          <div class="time-track">
            ${barHtml}
            ${dayHolidayName ? `<div class="holiday-banner">${escapeHtml(dayHolidayName)}</div>` : ''}
            ${isToday && !dayHolidayName && nowPos >= 0 && nowPos <= 100 ? `<div class="now-indicator" style="top:${nowPos}%"></div>` : ''}
          </div>
          <div class="day-label">${label.substring(0, 3)}</div>
        </div>`;
    }).join('');

    planner.innerHTML = axis + `<div class="columns-container">${columnsHtml}</div>`;

    // Add cleaning legend if closures exist
    if (closuresData && Object.values(closuresData).some(v => v)) {
      const legendKey = `planner_legend_cleaning`;
      const legendText = window.translations?.[lang]?.[legendKey] || '■ Cleaning time';
      const existingLegend = planner.parentElement.querySelector('.planner-legend');
      if (!existingLegend) {
        const legend = document.createElement('div');
        legend.className = 'planner-legend';
        legend.textContent = legendText;
        planner.parentElement.appendChild(legend);
      }
    }
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
  
  // Collection rules: Tue=Garbage+Recycling, Fri=Organic+Green, 2nd&4th Mon=Bulky
  const getIcons = (dayNum, dayOfWeek) => {
    const items = [];
    if (dayOfWeek === 2) {
      items.push({ emoji: '🗑️', label: t('icon_garbage') });
      items.push({ emoji: '♻️', label: t('icon_recycling') });
    }
    if (dayOfWeek === 5) {
      items.push({ emoji: '🌿', label: t('icon_organic') });
    }
    if (dayOfWeek === 1) {
      const weekOfMonth = Math.ceil(dayNum / 7);
      if (weekOfMonth === 2 || weekOfMonth === 4) {
        items.push({ emoji: '🛋️', label: t('icon_bulky') });
      }
    }
    return items.map(i => `<span class="calendar-icon" title="${escapeHtml(i.label)}">${i.emoji}</span>`).join('');
  };

  const dayNames = Array.from({length: 7}, (_, i) => t(`calendar_day_${i}`));
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