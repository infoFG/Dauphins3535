# Google Sheets Integration — Setup Guide

## Sheet Format (row-oriented key-value)

All sheets use the same layout — sections separated by blank rows:

```
Info,,              ← section header (col A)
name,Café Lafontaine,
description_fr,"French description",
description_en,"English description",

Hours,,
,Open,Close         ← sub-header (business)  /  ,Open,Close,Clean Start,Clean End (pool)
monday,8:00 AM,6:00 PM
tuesday,8:00 AM,3:00 PM
...

Websites,,
website,,
facebook,https://...
instagram,https://...

Holidays,,
date,name_fr,name_en  ← sub-header
2026-07-01,Fête du Canada,Canada Day
--12-25,Noël,Christmas Day
```

**Pool sheets** add cleaning columns in Hours: `,Open,Close,Cleaning Start,Cleaning End`
**Office sheets** same as business but without description/websites typically.

**Templates** (import into Google Sheets):
- `template-Business.csv`
- `template-OfficeHours.csv`
- `template-PoolHours.csv`
- `template-Registry.csv`

---

## Steps

1. For each business/office/pool, create a Google Sheet → **File → Import** the matching template
2. Fill in the hours, names, links, and holidays
3. **File → Share → Publish to web** → CSV → copy the URL
4. Paste each URL into the Registry sheet's `published_csv_url` column
5. Publish the Registry the same way → paste its URL into `js/gsheets.js`

---

## Holidays

Add rows in the Holidays section below `date,name_fr,name_en`:
- `2026-07-01,Fête du Canada,Canada Day` — specific date
- `--12-25,Noël,Christmas Day` — recurring yearly

Holidays auto-detect: if today matches a date, the holiday name replaces the open/closed status.
