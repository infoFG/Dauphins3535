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