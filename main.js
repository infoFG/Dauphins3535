import { initMenu, initLanguage, initLightbox, initScrollReveal } from './js/ui.js';
import { initEventsCarousel, initBusinessGallery } from './js/api.js';
import { initEnhancedCarousels, loadStaticCarouselImages, loadSectionBackground } from './js/carousel.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize core UI
  initMenu();
  initLanguage();
  initLightbox();

  // 2. Load dynamic data
  await initEventsCarousel();
  await initBusinessGallery();

  // We use individual try/catch or await them all to ensure one failure doesn't block the UI reveal
  try {
    await initEventsCarousel();
    await initBusinessGallery();

    // 3. Load static assets - removed leading slashes for better portability
    await loadStaticCarouselImages('apropos-carousel-track', 'assets/Apropos');
    await loadStaticCarouselImages('installations-carousel-track', 'assets/Installations');
    await loadStaticCarouselImages('quartier-park-carousel-track', 'assets/Quartier');
    await loadSectionBackground('valeurs');
    await loadSectionBackground('condoweb');
  } catch (error) {
    console.error("Asset loading failed:", error);
  }
  // 4. Initialize carousel engine & animations
  initEnhancedCarousels();
  initScrollReveal();

  document.querySelectorAll('.carousel-pips').forEach(pipsContainer => {
    const track = pipsContainer.closest('.carousel-container')?.querySelector('.carousel-track');
    if (track && track.updatePips) track.updatePips();
  });
});
