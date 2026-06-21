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

  function animate(currentTime) {
    if (el.isAnimationCanceled) {
      el.classList.remove('is-animating');
      return;
    }
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
    el.scrollLeft = start + change * ease;
    if (progress < 1) {
      el.scrollRequestID = requestAnimationFrame(animate);
    } else {
      el.classList.remove('is-animating');
      if (teleportTarget !== null) el.scrollLeft = teleportTarget;
      el.scrollRequestID = null;
      if (onFinish) onFinish();
    }
  }
  el.scrollRequestID = requestAnimationFrame(animate);
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
    if (nextIdx === items.length - 1) teleportTo = items[1].offsetLeft - (track.offsetWidth - items[1].offsetWidth) / 2;
    else if (nextIdx === 0) teleportTo = items[items.length - 2].offsetLeft - (track.offsetWidth - items[items.length - 2].offsetWidth) / 2;
  } else {
    if (nextIdx < 0) nextIdx = 0;
    if (nextIdx >= items.length) nextIdx = items.length - 1;
  }

  const targetItem = items[nextIdx];
  if (targetItem) {
    const targetScroll = targetItem.offsetLeft - (track.offsetWidth - targetItem.offsetWidth) / 2;
    smoothScrollTo(track, targetScroll, duration, teleportTo);
  }
}

export function initEnhancedCarousels() {
  document.querySelectorAll('.carousel-container').forEach((container, index) => {
    const track = container.querySelector('.carousel-track');
    if (!track || container.dataset.listenersAttached === "true") return;

    const prevBtn = container.querySelector('.carousel-btn.prev');
    const nextBtn = container.querySelector('.carousel-btn.next');
    const pipsContainer = container.querySelector('.carousel-pips');

    // Clones pour l'infini
    if (track.children.length > 1 && !track.dataset.cloned) {
      const first = track.children[0].cloneNode(true);
      const last = track.children[track.children.length - 1].cloneNode(true);
      track.appendChild(first);
      track.insertBefore(last, track.children[0]);
      const initial = track.children[1];
      track.scrollLeft = initial.offsetLeft - (track.offsetWidth - initial.offsetWidth) / 2;
      track.dataset.cloned = "true";
    }

    track.querySelectorAll('img').forEach(img => {
      img.setAttribute('draggable', 'false');
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

    if (prevBtn) prevBtn.onclick = () => navigate(track, -1, 1000);
    if (nextBtn) nextBtn.onclick = () => navigate(track, 1, 1000);

    // Dragging logic
    let isDown = false, startX, scrollLeft, activePointerId = null;

    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
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

    const stopDragging = () => {
      if (!isDown) return;
      isDown = false;
      if (activePointerId !== null && track.hasPointerCapture(activePointerId)) {
        track.releasePointerCapture(activePointerId);
      }
      activePointerId = null;
      track.classList.remove('dragging');
      
      const items = track.children;
      if (items.length === 0) return;
      const scrollCenter = track.scrollLeft + track.offsetWidth / 2;
      let closestIdx = 0, minDistance = Infinity;
      for (let i = 0; i < items.length; i++) {
        const dist = Math.abs((items[i].offsetLeft + items[i].offsetWidth / 2) - scrollCenter);
        if (dist < minDistance) { minDistance = dist; closestIdx = i; }
      }

      const targetScroll = items[closestIdx].offsetLeft - (track.offsetWidth - items[closestIdx].offsetWidth) / 2;
      let teleport = null;
      if (track.dataset.cloned === "true") {
        if (closestIdx === 0) teleport = items[items.length - 2].offsetLeft - (track.offsetWidth - items[items.length - 2].offsetWidth) / 2;
        else if (closestIdx === items.length - 1) teleport = items[1].offsetLeft - (track.offsetWidth - items[1].offsetWidth) / 2;
      }

      smoothScrollTo(track, targetScroll, 750, teleport, () => {
        track.style.scrollSnapType = '';
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