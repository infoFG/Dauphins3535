export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const DAY_KEYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

export function getDayLabels(lang = 'fr') {
  const t = (key) => window.translations?.[lang]?.[key] || window.translations?.fr?.[key] || key;
  return DAY_KEYS.map(k => t(`day_${k}`));
}

export function formatBusinessHours(hoursObj, lang = 'fr') {
  const labels = getDayLabels(lang);
  return DAY_KEYS.map((day, i) => {
    const val = hoursObj[day];
    if (!val) return '';
    const display = Array.isArray(val) ? val.join(' & ') : val;
    return `<div class="bh-row"><span class="bh-day">${labels[i]}</span><span class="bh-time">${escapeHtml(display)}</span></div>`;
  }).join('');
}

export function isCurrentlyOpen(businessHours, closures) {
  const now = new Date();
  const dayIdx = now.getDay(); // 0=Sun, 1=Mon, ...
  const dayKey = DAY_KEYS[dayIdx === 0 ? 6 : dayIdx - 1]; // Convert to monday..sunday
  const todayHours = businessHours[dayKey];
  if (!todayHours || todayHours.toLowerCase() === 'closed') return 'closed';

  // Parse "08:00 AM - 06:00 PM"
  const parts = todayHours.split('-').map(s => s.trim());
  if (parts.length !== 2) return 'closed';

  const parseTime = (str) => {
    const match = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ap = match[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + m; // minutes since midnight
  };

  const openMin = parseTime(parts[0]);
  const closeMin = parseTime(parts[1]);
  if (openMin === null || closeMin === null) return 'closed';

  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Check if within regular hours
  if (nowMin < openMin || nowMin >= closeMin) return 'closed';

  // Check if within a closure period
  if (closures && closures[dayKey]) {
    const closureParts = closures[dayKey].split('-').map(s => s.trim());
    if (closureParts.length === 2) {
      const closeStart = parseTime(closureParts[0]);
      const closeEnd = parseTime(closureParts[1]);
      if (closeStart !== null && closeEnd !== null) {
        if (nowMin >= closeStart && nowMin < closeEnd) return 'closed';
      }
    }
  }

  // Closing within 60 minutes?
  if (closeMin - nowMin <= 60) return 'closing-soon';

  return 'open';
}
