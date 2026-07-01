import { initMenu, initLanguage, initLightbox, initScrollReveal, initDayPlanners, initWasteCalendar } from './js/ui.js';
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

  // 3. Load all data in parallel — biggest speedup (was sequential before)
  let faqData = {};
  try {
    await Promise.all([
      initEventsCarousel(),
      initBusinessGallery(),
      // FAQ data: sheets first, fall back to JSON
      (async () => {
        try {
          const sheetsData = await fetchFAQData();
          if (sheetsData.admin || sheetsData.pool) {
            faqData = {
              admin: sheetsData.admin || (await fetch('assets/FAQ/OfficeHours.json').then(r => r.json()).catch(() => null)),
              pool: sheetsData.pool || (await fetch('assets/FAQ/PoolHours.json').then(r => r.json()).catch(() => null))
            };
          }
        } catch {
          const [adminRes, poolRes] = await Promise.all([
            fetch('assets/FAQ/OfficeHours.json').then(r => r.json()).catch(() => null),
            fetch('assets/FAQ/PoolHours.json').then(r => r.json()).catch(() => null)
          ]);
          faqData = { admin: adminRes, pool: poolRes };
        }
      })(),
      // Static carousel images (visible above the fold)
      loadStaticCarouselImages('apropos-carousel-track', 'assets/Apropos'),
      loadStaticCarouselImages('installations-carousel-track', 'assets/Installations'),
      loadStaticCarouselImages('quartier-park-carousel-track', 'assets/Quartier'),
    ]);
  } catch (error) {
    console.error("Asset loading failed:", error);
  }

  // 4. Re-init carousels for newly populated dynamic tracks (events, businesses)
  initEnhancedCarousels();
  initDayPlanners(faqData);
  initWasteCalendar();
  initCommunityCarousel();

  // 5. Decorative section backgrounds — fire-and-forget, don't block the page
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
    // Re-fetch FAQ data from sheets for fresh holiday names in current language
    try {
      const sheetsData = await fetchFAQData();
      if (sheetsData.admin || sheetsData.pool) {
        faqData.admin = sheetsData.admin || faqData.admin;
        faqData.pool = sheetsData.pool || faqData.pool;
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
  if (window.location.hash) {
    const targetId = window.location.hash.substring(1);
    const target = document.getElementById(targetId);
    if (target) {
      // Delay to let dynamic content settle
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);
    }
  }
});
