export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatBusinessHours(hoursObj) {
  const order = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const labels = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
  return order.map(day => {
    const val = hoursObj[day];
    if (!val) return '';
    return `<div class="bh-row"><span class="bh-day">${labels[day]}</span><span class="bh-time">${escapeHtml(val)}</span></div>`;
  }).join('');
}
