import { initMenu, initLanguage, initLightbox, initScrollReveal, initDayPlanners, initWasteCalendar, userScrolled } from './js/ui.js';
import { initEventsCarousel, initBusinessGallery, reRenderEvents, initCommunityCarousel } from './js/api.js';
import { initEnhancedCarousels, loadStaticCarouselImages, loadSectionBackground } from './js/carousel.js';
import { fetchFAQData } from './js/gsheets.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Core UI — instant, no data dependency
  initMenu();
  initLanguage();
  initLightbox();
  initScrollReveal();

  // 2. Attach carousel listeners to static tracks right away (they already exist in DOM)
  initEnhancedCarousels();

  // 3. Load FAQ data independently — must always complete, even if carousels fail
  let faqData = {};
  const faqPromise = (async () => {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
    try {
      const sheetsData = await Promise.race([fetchFAQData(), timeout]);
      if (sheetsData.admin || sheetsData.pool) {
        faqData = {
          admin: sheetsData.admin || (await fetch('assets/FAQ/OfficeHours.json').then(r => r.json()).catch(() => null)),
          pool: sheetsData.pool || (await fetch('assets/FAQ/PoolHours.json').then(r => r.json()).catch(() => null))
        };
        return;
      }
    } catch { /* timeout or error — fall through to JSON */ }
    const [adminRes, poolRes] = await Promise.all([
      fetch('assets/FAQ/OfficeHours.json').then(r => r.json()).catch(() => null),
      fetch('assets/FAQ/PoolHours.json').then(r => r.json()).catch(() => null)
    ]);
    faqData = { admin: adminRes, pool: poolRes };
  })();

  // 4. Load carousel data in parallel (can fail independently of FAQ)
  try {
    await Promise.all([
      initEventsCarousel(),
      initBusinessGallery(),
      loadStaticCarouselImages('apropos-carousel-track', 'assets/Apropos'),
      loadStaticCarouselImages('installations-carousel-track', 'assets/Installations'),
      loadStaticCarouselImages('quartier-park-carousel-track', 'assets/Quartier'),
    ]);
  } catch (error) {
    console.error("Asset loading failed:", error);
  }

  await faqPromise;

  // 5. Re-init carousels for newly populated dynamic tracks (events, businesses)
  initEnhancedCarousels();
  initDayPlanners(faqData);
  initWasteCalendar();
  initCommunityCarousel();

  // 6. Decorative section backgrounds — fire-and-forget, don't block the page
  Promise.all([
    loadSectionBackground('valeurs'),
    loadSectionBackground('condoweb'),
    loadSectionBackground('faq-admin'),
    loadSectionBackground('faq-pool', 'assets/Installations'),
    loadSectionBackground('faq-waste'),
    loadSectionBackground('galerie-commerciale', 'assets/Commereciale'),
    loadSectionBackground('communaute', 'assets/Commereciale'),
  ]).catch(() => {});

  // Re-render dynamic content when language changes
  document.addEventListener('languagechanged', async () => {
    // Re-fetch FAQ data from sheets for fresh holiday names in current language.
    // Only merge business_hours & holidays — preserve static fields like cleaning_note.
    try {
      const sheetsData = await fetchFAQData();
      if (sheetsData.admin) {
        faqData.admin = { ...faqData.admin, business_hours: sheetsData.admin.business_hours, _holidays: sheetsData.admin._holidays };
      }
      if (sheetsData.pool) {
        faqData.pool = { ...faqData.pool, business_hours: sheetsData.pool.business_hours, _holidays: sheetsData.pool._holidays };
      }
    } catch {}
    initDayPlanners(faqData);
    initWasteCalendar();
    await initBusinessGallery();
    initEnhancedCarousels();
    reRenderEvents();
    initCommunityCarousel();
  });

  document.querySelectorAll('.carousel-pips').forEach(pipsContainer => {
    const track = pipsContainer.closest('.carousel-container')?.querySelector('.carousel-track');
    if (track && track.updatePips) track.updatePips();
  });

  // Handle hash-based navigation from other pages
  if (window.location.hash && !userScrolled) {
    const targetId = window.location.hash.substring(1);
    const target = document.getElementById(targetId);
    if (target) {
      // Delay to let dynamic content settle
      setTimeout(() => {
        if (!userScrolled) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 500);
    }
  }
});
