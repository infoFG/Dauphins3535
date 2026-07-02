function syncToCalendar() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const calendarId = '8168f0b1875c929ea015c3c1ffa067d559215c6e6b3350518809bbf1905f86ce@group.calendar.google.com';
  const cal = CalendarApp.getCalendarById(calendarId);
  if (!cal) { Logger.log('❌ Calendar not found'); return; }
  Logger.log('✅ Calendar: ' + cal.getName());

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).toLowerCase().trim());
  const approvedIdx = headers.findIndex(h => h.includes('approved'));
  const dateIdx = headers.findIndex(h => h.includes('event date'));
  const titleIdx = headers.findIndex(h => h.includes('event name'));
  const descIdx = headers.findIndex(h => h.includes('event description'));
  const timeIdx = headers.findIndex(h => h.includes('start time'));
  const endIdx = headers.findIndex(h => h.includes('end time'));
  const locIdx = headers.findIndex(h => h.includes('event location'));
  const urlIdx = headers.findIndex(h => h.includes('event url'));

  function parseTime(val) {
    if (!val) return null;
    const s = String(val).trim();
    // Try Excel serial time (e.g. 0.33333)
    const n = parseFloat(s);
    if (!isNaN(n) && n >= 0 && n < 1 && /^[\d.]+$/.test(s)) {
      const totalMin = Math.round(n * 24 * 60);
      return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
    }
    // Regular time string: "HH:MM:SS AM/PM" or "HH:MM"
    const tp = s.match(/(\d+):(\d+)(?::(\d+))?\s*(AM|PM)?/i);
    if (!tp) return null;
    let h = parseInt(tp[1]), min = parseInt(tp[2]);
    if (tp[4]) {
      if (tp[4].toUpperCase() === 'PM' && h < 12) h += 12;
      if (tp[4].toUpperCase() === 'AM' && h === 12) h = 0;
    }
    return { h, m: min };
  }

  let added = 0, skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const approved = String(row[approvedIdx] || '').toUpperCase().trim();
    const title = String(row[titleIdx] || '').trim();

    if (approved !== 'TRUE') continue;

    const dateVal = row[dateIdx];
    let startDate;

    // Excel serial date (number like 46204)
    if (typeof dateVal === 'number' && dateVal >= 365) {
      const d = new Date((dateVal - 25569) * 86400000);
      startDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    } else if (dateVal instanceof Date) {
      startDate = new Date(dateVal);
    } else if (typeof dateVal === 'string' && dateVal.includes('/')) {
      const parts = dateVal.split('/');
      if (parts.length !== 3) continue;
      const y = parseInt(parts[2]), m = parseInt(parts[0]) - 1, d = parseInt(parts[1]);
      startDate = new Date(y, m, d);
    } else {
      startDate = new Date(dateVal);
    }

    if (isNaN(startDate.getTime())) continue;

    const startT = parseTime(row[timeIdx]);
    const endT = parseTime(row[endIdx]);
    if (startT) startDate.setHours(startT.h, startT.m, 0, 0);

    let endDate;
    if (endT) {
      endDate = new Date(startDate);
      endDate.setHours(endT.h, endT.m, 0, 0);
      // If end time is before/equal to start time, assume next day (overnight event)
      if (endDate <= startDate) {
        endDate.setDate(endDate.getDate() + 1);
      }
    } else if (startT) {
      endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 1);
    } else {
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
    }

    const desc = (row[descIdx] || '') + (row[urlIdx] && String(row[urlIdx]).trim() && row[urlIdx] !== '#' ? '\n\n' + row[urlIdx] : '');
    const loc = String(row[locIdx] || '').trim();

    const existing = cal.getEvents(startDate, endDate, { search: title });
    if (existing.length > 0) continue;

    cal.createEvent(title, startDate, endDate, {
      description: desc.substring(0, 8000),
      location: loc
    });
    added++;
  }

  Logger.log('Done: ' + added + ' added, ' + (data.length - 1) + ' rows');
}
