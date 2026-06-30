import { initMenu, initLanguage, initLightbox, initScrollReveal, initDayPlanners, initWasteCalendar } from './js/ui.js';
import { initEventsCarousel, initBusinessGallery, reRenderEvents, initCommunityCarousel } from './js/api.js';
import { initEnhancedCarousels, loadStaticCarouselImages, loadSectionBackground } from './js/carousel.js';
import { fetchFAQData } from './js/gsheets.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize core UI
  initMenu();
  initLanguage();
  initLightbox();

  // 2 & 3. Load dynamic data and static assets
  let faqData = {};
  try {
    await initEventsCarousel();
    await initBusinessGallery();

    // Fetch FAQ Hours — try Google Sheets first, fall back to JSON
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

    // 3. Load static assets - removed leading slashes for better portability
    await loadStaticCarouselImages('apropos-carousel-track', 'assets/Apropos');
    await loadStaticCarouselImages('installations-carousel-track', 'assets/Installations');
    await loadStaticCarouselImages('quartier-park-carousel-track', 'assets/Quartier');
    await loadSectionBackground('valeurs');
    await loadSectionBackground('condoweb');
    await loadSectionBackground('faq-admin');
    await loadSectionBackground('faq-pool', 'assets/Installations');
    await loadSectionBackground('faq-waste');
    await loadSectionBackground('galerie-commerciale', 'assets/Commereciale');
    await loadSectionBackground('communaute', 'assets/Commereciale');
  } catch (error) {
    console.error("Asset loading failed:", error);
  }
  // 4. Initialize carousel engine & animations
  initEnhancedCarousels();
  initScrollReveal();
  initDayPlanners(faqData);
  initWasteCalendar();
  initCommunityCarousel();

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
