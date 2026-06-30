/* ========== BACKGROUND LOADERS ========== */
async function setSectionBackgroundFromApropos(section) {
  if (!section) return;
  try {
    const response = await fetch('assets/Apropos/images.json');
    const images = await response.json();
    const randomImage = images[Math.floor(Math.random() * images.length)];
    section.style.setProperty('--section-bg', `url("../assets/Apropos/${randomImage}")`);
  } catch (e) { console.warn('Fallback bg error:', e); }
}

export async function loadStaticCarouselImages(trackId, folderPath) {
  const track = document.getElementById(trackId);
  if (!track) return;
  const section = track.closest('.section');

  try {
    const response = await fetch(`${folderPath}/images.json`).catch(() => null);
    if (response && response.ok) {
      const imageList = await response.json();
      if (section && imageList.length > 0) {
        section.style.setProperty('--section-bg', `url("../${folderPath}/${imageList[0]}")`);
      }
      track.innerHTML = imageList.map(img => `
        <img src="${folderPath}/${img}" alt="${img.split('.')[0]}" aria-label="${img.split('.')[0]}" loading="lazy" class="lightbox-trigger" draggable="false">
      `).join('');
    } else {
      if (section) await setSectionBackgroundFromApropos(section);
      track.innerHTML = '<p class="loading-msg">Images non configurées.</p>';
    }
  } catch (e) { console.error(e); }
}

export async function loadSectionBackground(sectionId, folderPath = 'assets/Apropos') {
  const section = document.getElementById(sectionId);
  if (!section) return;
  if (folderPath === 'assets/Apropos') {
    await setSectionBackgroundFromApropos(section);
    return;
  }
  try {
    const response = await fetch(`${folderPath}/images.json`);
    const images = await response.json();
    if (images.length > 0) {
      const randomImage = images[Math.floor(Math.random() * images.length)];
      section.style.setProperty('--section-bg', `url("../${folderPath}/${randomImage}")`);
    }
  } catch (e) { await setSectionBackgroundFromApropos(section); }
}

/* ========== CAROUSEL ENGINE ========== */
function smoothScrollTo(el, target, duration, teleportTarget = null, onFinish = null) {
  if (el.scrollRequestID) cancelAnimationFrame(el.scrollRequestID);
  const start = el.scrollLeft;
  const change = target - start;
  const startTime = performance.now();
  el.isAnimationCanceled = false;
  el.classList.add('is-animating');
  el.style.scrollSnapType = 'none';

  function animate(currentTime) {
    if (el.isAnimationCanceled) {
      el.classList.remove('is-animating');
      el.style.scrollSnapType = '';
      return;
    }
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Cubic ease-out: smooth deceleration, no overshoot
    const ease = 1 - Math.pow(1 - progress, 3);
    el.scrollLeft = start + change * ease;
    if (progress < 1) {
      el.scrollRequestID = requestAnimationFrame(animate);
    } else {
      el.classList.remove('is-animating');
      // Blend to exact snap position, then re-enable native snap
      const finalPos = teleportTarget !== null ? teleportTarget : target;
      el.scrollLeft = Math.round(finalPos);
      requestAnimationFrame(() => {
        el.style.scrollSnapType = '';
        el.scrollRequestID = null;
        if (onFinish) onFinish();
      });
    }
  }
  el.scrollRequestID = requestAnimationFrame(animate);
}

// Get the snap-aligned scroll position for an item based on its CSS scroll-snap-align
function getSnapPosition(track, item) {
  const align = getComputedStyle(item).scrollSnapAlign;
  if (align === 'start' || align.startsWith('start')) {
    return item.offsetLeft;
  }
  // Default: center alignment — round to prevent sub-pixel snap jitter
  return Math.round(item.offsetLeft - (track.offsetWidth - item.offsetWidth) / 2);
}

function navigate(track, direction, duration = 1000) {
  if (track.classList.contains('is-animating')) return;
  const items = Array.from(track.children);
  if (items.length === 0) return;
  const scrollCenter = track.scrollLeft + track.offsetWidth / 2;
  const isInfinite = track.dataset.cloned === "true";
  
  let currentIdx = 0;
  let minDistance = Infinity;
  for (let i = 0; i < items.length; i++) {
    const itemCenter = items[i].offsetLeft + items[i].offsetWidth / 2;
    const dist = Math.abs(itemCenter - scrollCenter);
    if (dist < minDistance) { minDistance = dist; currentIdx = i; }
  }

  let nextIdx = currentIdx + direction;
  let teleportTo = null;

  if (isInfinite) {
    if (nextIdx === items.length - 1) teleportTo = getSnapPosition(track, items[1]);
    else if (nextIdx === 0) teleportTo = getSnapPosition(track, items[items.length - 2]);
  } else {
    // Simple loop: wrap around at ends
    if (nextIdx < 0) nextIdx = items.length - 1;
    if (nextIdx >= items.length) nextIdx = 0;
  }

  // For non-infinite: detect end-stall and force loop back
  const maxScroll = track.scrollWidth - track.offsetWidth;
  const atEnd = !isInfinite && direction > 0 && track.scrollLeft >= maxScroll - 20;
  const atStart = !isInfinite && direction < 0 && track.scrollLeft <= 20;
  const loopWrap = atEnd || atStart;

  if (atEnd) nextIdx = 0;
  if (atStart) nextIdx = items.length - 1;

  const animDuration = loopWrap ? 1500 : duration;

  const targetItem = items[nextIdx];
  if (targetItem) {
    smoothScrollTo(track, getSnapPosition(track, targetItem), animDuration, teleportTo);
  }
}

export function initEnhancedCarousels() {
  document.querySelectorAll('.carousel-container').forEach((container, index) => {
    const track = container.querySelector('.carousel-track');
    if (!track || container.dataset.listenersAttached === "true") return;

    const prevBtn = container.querySelector('.carousel-btn.prev');
    const nextBtn = container.querySelector('.carousel-btn.next');
    const pipsContainer = container.querySelector('.carousel-pips');

    // Clones pour l'infini (skip if track has data-no-clone attribute)
    if (track.children.length > 1 && !track.dataset.cloned && !track.hasAttribute('data-no-clone')) {
      const first = track.children[0].cloneNode(true);
      const last = track.children[track.children.length - 1].cloneNode(true);
      track.appendChild(first);
      track.insertBefore(last, track.children[0]);
      track.scrollLeft = getSnapPosition(track, track.children[1]);
      track.dataset.cloned = "true";
    }

    track.querySelectorAll('img, a').forEach(el => {
      el.setAttribute('draggable', 'false');
    });

    // Autoplay logic
    const startAutoPlay = () => {
      if (track.scrollWidth <= track.offsetWidth) return;
      container.autoPlayTimer = setInterval(() => navigate(track, 1, 4000), 8000);
    };
    const stopAutoPlay = () => clearInterval(container.autoPlayTimer);
    
    container.autoPlayTimeout = setTimeout(startAutoPlay, index * 2000);
    track.addEventListener('mouseenter', stopAutoPlay);
    track.addEventListener('mouseleave', startAutoPlay);

    if (prevBtn) prevBtn.onclick = () => { stopAutoPlay(); navigate(track, -1, 1000); startAutoPlay(); };
    if (nextBtn) nextBtn.onclick = () => { stopAutoPlay(); navigate(track, 1, 1000); startAutoPlay(); };

    // Dragging logic
    let isDown = false, startX, scrollLeft, activePointerId = null;

    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Let button/link taps pass through on all devices
      if (e.target.closest('button, a, .cal-add-btn')) return;
      // On touch: let the browser handle native scrolling
      if (e.pointerType === 'touch') {
        isDown = true;
        stopAutoPlay();
        track.isAnimationCanceled = true;
        return;
      }
      // Mouse: prevent link drag behavior
      if (e.target.closest('a')) {
        e.preventDefault();
      }
      isDown = true;
      activePointerId = e.pointerId;
      stopAutoPlay();
      track.isAnimationCanceled = true;
      startX = e.clientX - track.getBoundingClientRect().left;
      scrollLeft = track.scrollLeft;
      track.mouseDownX = e.clientX;
      track.mouseDownY = e.clientY;
    });

    track.addEventListener('pointermove', (e) => {
      if (!isDown || e.pointerId !== activePointerId) return;
      const dx = Math.abs(e.clientX - track.mouseDownX);
      const dy = Math.abs(e.clientY - track.mouseDownY);
      
      // On touch: let native scroll handle it, don't override
      if (e.pointerType === 'touch') {
        if (dx > 10 && !track.classList.contains('dragging')) {
          track.classList.add('dragging');
        }
        return; // native scroll-snap handles the rest
      }
      
      // Mouse: custom drag with animation
      if (!track.classList.contains('dragging') && dx > 10) {
        track.classList.add('dragging');
        track.setPointerCapture(activePointerId);
        track.style.scrollSnapType = 'none';
      }
      if (track.classList.contains('dragging')) {
        e.preventDefault();
        const x = e.clientX - track.getBoundingClientRect().left;
        track.scrollLeft = scrollLeft - (x - startX);
      }
    });

    const stopDragging = (e) => {
      if (!isDown) return;
      isDown = false;
      if (activePointerId !== null && track.hasPointerCapture(activePointerId)) {
        track.releasePointerCapture(activePointerId);
      }
      activePointerId = null;
      track.classList.remove('dragging');
      
      const items = track.children;
      if (items.length === 0) return;

      // Touch: let native scroll-snap handle momentum + centering
      const isTouch = e && (e.pointerType === 'touch' || e.type === 'touchend');
      if (isTouch) {
        startAutoPlay();
        const isInfinite = track.dataset.cloned === 'true';
        if (isInfinite) {
          // Let native snap do its thing, then fix clone boundary if needed
          track.style.scrollSnapType = ''; // ensure snap is active
          const checkBoundary = () => {
            track.removeEventListener('scrollend', checkBoundary);
            const items = track.children;
            if (items.length < 3) return;
            const maxScroll = track.scrollWidth - track.offsetWidth;
            // Only intervene if stuck on a clone
            if (track.scrollLeft <= 5) {
              track.style.scrollSnapType = 'none';
              track.scrollLeft = getSnapPosition(track, items[items.length - 2]);
              requestAnimationFrame(() => {
                requestAnimationFrame(() => { track.style.scrollSnapType = ''; });
              });
            } else if (track.scrollLeft >= maxScroll - 5) {
              track.style.scrollSnapType = 'none';
              track.scrollLeft = getSnapPosition(track, items[1]);
              requestAnimationFrame(() => {
                requestAnimationFrame(() => { track.style.scrollSnapType = ''; });
              });
            }
          };
          track.addEventListener('scrollend', checkBoundary, { once: true });
          // Fallback timeout
          setTimeout(() => {
            track.removeEventListener('scrollend', checkBoundary);
            checkBoundary();
          }, 800);
        }
        return;
      }

      // Mouse: custom snap animation

      const isInfinite = track.dataset.cloned === "true";
      const maxScroll = track.scrollWidth - track.offsetWidth;
      let teleport = null;
      let targetScroll;

      if (isInfinite && track.scrollLeft <= 10) {
        // Near start — animate to 0 then jump to real last item
        const realLast = items[items.length - 2];
        targetScroll = 0;
        teleport = getSnapPosition(track, realLast);
      } else if (isInfinite && track.scrollLeft >= maxScroll - 10) {
        // Near end — animate to max then jump to real first item
        const realFirst = items[1];
        targetScroll = maxScroll;
        teleport = getSnapPosition(track, realFirst);
      } else {
        // Normal snap to closest
        const scrollCenter = track.scrollLeft + track.offsetWidth / 2;
        let closestIdx = 0, minDistance = Infinity;
        for (let i = 0; i < items.length; i++) {
          const dist = Math.abs((items[i].offsetLeft + items[i].offsetWidth / 2) - scrollCenter);
          if (dist < minDistance) { minDistance = dist; closestIdx = i; }
        }
        targetScroll = getSnapPosition(track, items[closestIdx]);
        if (isInfinite) {
          if (closestIdx === 0) teleport = getSnapPosition(track, items[items.length - 2]);
          else if (closestIdx === items.length - 1) teleport = getSnapPosition(track, items[1]);
        }
      }

      smoothScrollTo(track, targetScroll, 500, teleport, () => {
        startAutoPlay();
      });
    };

    track.addEventListener('pointerup', stopDragging);
    track.addEventListener('pointercancel', stopDragging);

    // Pips logic
    if (pipsContainer) {
      const updatePips = () => {
        const items = Array.from(track.children).filter(el => el.nodeName !== 'P');
        if (items.length === 0) return;
        pipsContainer.innerHTML = '';
        
        const realCount = track.dataset.cloned === "true" ? items.length - 2 : items.length;
        const scrollCenter = track.scrollLeft + track.offsetWidth / 2;
        let activeIdx = 0, minD = Infinity;

        for (let j = 0; j < items.length; j++) {
          const d = Math.abs((items[j].offsetLeft + items[j].offsetWidth / 2) - scrollCenter);
          if (d < minD) {
            minD = d;
            if (track.dataset.cloned === "true") {
              if (j === 0) activeIdx = realCount - 1;
              else if (j === items.length - 1) activeIdx = 0;
              else activeIdx = j - 1;
            } else activeIdx = j;
          }
        }

        for (let i = 0; i < realCount; i++) {
          const pip = document.createElement('button');
          pip.className = i === activeIdx ? 'pip active' : 'pip';
          pip.onclick = () => {
            stopAutoPlay();
            const target = items[track.dataset.cloned === "true" ? i + 1 : i];
            const s = target.offsetLeft - (track.offsetWidth - target.offsetWidth) / 2;
            smoothScrollTo(track, s, 750, null, startAutoPlay);
          };
          pipsContainer.appendChild(pip);
        }
      };
      track.updatePips = updatePips;
      track.addEventListener('scroll', updatePips);
      setTimeout(updatePips, 500);
    }
    container.dataset.listenersAttached = "true";
  });
}