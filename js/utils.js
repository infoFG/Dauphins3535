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
