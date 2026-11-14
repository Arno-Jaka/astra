/** Four illustrative field-science experiments, one per mission theme.
 *
 * No experiment here is a real instrument or a measured result: the values are
 * deterministic simulations seeded by the science site so a site always reports
 * the same reading. They are labelled as illustrative in the UI.
 */

export const SCIENCE_KINDS = ['rad', 'libs', 'isotope', 'moxie'] as const
export type ScienceKind = (typeof SCIENCE_KINDS)[number]

export type ScienceMeta = {
  /** Full experiment name. */
  label: string
  /** Compact marker label. */
  short: string
  /** Mission theme from the challenge brief. */
  category: string
  /** Marker/ring colour. */
  color: string
  /** Illustrative on-site work time (simulated seconds). */
  durationS: number
  /** One-line description for the detour prompt and panel. */
  blurb: string
}

export const SCIENCE_META: Record<ScienceKind, ScienceMeta> = {
  rad: {
    label: 'RAD surface-dose tracker',
    short: 'RAD',
    category: 'Meteorology, dust & radiation',
    color: '#a78bfa',
    durationS: 8,
    blurb: 'Log galactic cosmic rays and solar particles to update the EVA dose budget.',
  },
  libs: {
    label: 'LIBS laser composition',
    short: 'LIBS',
    category: 'Geology & planetary history',
    color: '#fbbf24',
    durationS: 7,
    blurb: 'Vaporise a rock spot and read its elemental spectrum from a few metres away.',
  },
  isotope: {
    label: 'Isotope-ratio sampler',
    short: 'δ13C',
    category: 'Astrobiology & the search for life',
    color: '#34d399',
    durationS: 10,
    blurb: 'Sample trace methane and CO₂ to test for a biogenic isotope signature.',
  },
  moxie: {
    label: 'MOXIE-style O₂ reactor',
    short: 'MOXIE',
    category: 'In-situ resource utilisation',
    color: '#60a5fa',
    durationS: 12,
    blurb: 'Split atmospheric CO₂ and measure oxygen yield, purity and conversion.',
  },
}

export type ScienceResultRow = {
  metric: string
  value: number
  unit: string
}

export type ScienceResult = {
  /** Short headline shown in the completion toast. */
  headline: string
  /** One-sentence interpretation, explicitly illustrative. */
  summary: string
  rows: ScienceResultRow[]
}

/** Small deterministic PRNG; every site keeps the same reading across reloads. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round = (value: number, digits = 2) => {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

/** Deterministic, clearly illustrative result for one experiment at one site. */
export function scienceResult(kind: ScienceKind, seed: number): ScienceResult {
  const random = mulberry32(seed ^ 0x9e3779b9)
  const between = (low: number, high: number) => low + random() * (high - low)
  switch (kind) {
    case 'rad': {
      const dose = between(0.42, 0.82)
      const gcr = dose * between(0.62, 0.78)
      const spe = between(0.01, 0.05)
      const monthly = dose * 30
      const budget = (monthly / 600) * 100
      return {
        headline: `${round(dose)} mSv/day surface dose`,
        summary: 'Illustrative screening only; not a measured RAD record or EVA certification.',
        rows: [
          { metric: 'Surface dose rate', value: round(dose, 3), unit: 'mSv/day' },
          { metric: 'Galactic cosmic-ray share', value: round(gcr, 3), unit: 'mSv/day' },
          { metric: 'Solar-particle share', value: round(spe, 3), unit: 'mSv/day' },
          { metric: '30-day cumulative dose', value: round(monthly, 1), unit: 'mSv' },
          { metric: 'Share of 600 mSv planning budget', value: round(budget, 1), unit: '%' },
        ],
      }
    }
    case 'libs': {
      const silica = between(41, 52)
      const iron = between(13, 22)
      const magnesium = between(4, 10)
      const calcium = between(3, 9)
      const water = between(0.4, 3.2)
      return {
        headline: water > 1.6 ? 'Hydrated basaltic regolith' : 'Dry basaltic regolith',
        summary: 'Illustrative elemental spectrum; not a ChemCam/SuperCam measurement.',
        rows: [
          { metric: 'SiO₂', value: round(silica, 1), unit: 'wt%' },
          { metric: 'FeO', value: round(iron, 1), unit: 'wt%' },
          { metric: 'MgO', value: round(magnesium, 1), unit: 'wt%' },
          { metric: 'CaO', value: round(calcium, 1), unit: 'wt%' },
          { metric: 'H₂O (hydrated minerals)', value: round(water, 2), unit: 'wt%' },
        ],
      }
    }
    case 'isotope': {
      const carbon = between(-38, -8)
      const oxygen = between(-6, 16)
      const methane = between(0.35, 1.25)
      const biogenic = carbon < -20 && methane > 0.7
      return {
        headline: biogenic ? 'Possible biogenic isotope signature' : 'Consistent with geological sources',
        summary: biogenic
          ? 'Illustrative interpretation: light carbon plus elevated methane warrants a drilled sample.'
          : 'Illustrative interpretation: the isotope ratios do not require a biological source.',
        rows: [
          { metric: 'δ¹³C (CH₄)', value: round(carbon, 1), unit: '‰ VPDB' },
          { metric: 'δ¹⁸O (CO₂)', value: round(oxygen, 1), unit: '‰ VSMOW' },
          { metric: 'Atmospheric CH₄', value: round(methane, 2), unit: 'ppb' },
          { metric: 'Biogenic-likelihood flag', value: biogenic ? 1 : 0, unit: 'boolean' },
        ],
      }
    }
    case 'moxie': {
      const temperature = between(780, 825)
      const rate = between(4.5, 7.5)
      const purity = between(96.5, 99.5)
      const conversion = between(38, 56)
      return {
        headline: `${round(rate, 1)} g/h O₂ at ${round(purity, 1)}% purity`,
        summary: 'Illustrative reactor run; not a MOXIE flight result or flight-ready design.',
        rows: [
          { metric: 'Reactor temperature', value: round(temperature, 0), unit: '°C' },
          { metric: 'Oxygen production rate', value: round(rate, 1), unit: 'g/h' },
          { metric: 'Oxygen purity', value: round(purity, 1), unit: '%' },
          { metric: 'CO₂ conversion', value: round(conversion, 1), unit: '%' },
          { metric: 'Oxygen produced this run', value: round(rate * (SCIENCE_META.moxie.durationS / 3600), 3), unit: 'g' },
        ],
      }
    }
  }
}

export type ScienceLogEntry = {
  id: string
  siteId: string
  siteName: string
  region: string
  kind: ScienceKind
  lat: number
  lon: number
  /** Wall-clock start (ISO string). */
  startedAt: string
  /** Illustrative on-site duration (simulated seconds). */
  durationS: number
  result: ScienceResult
}

/** Flatten the activity/data log into a downloadable CSV. */
export function scienceCsv(entries: ScienceLogEntry[]): string {
  const escape = (value: string | number) => {
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const header = [
    'started_at', 'site_id', 'site_name', 'region', 'experiment', 'category',
    'latitude', 'longitude', 'metric', 'value', 'unit', 'duration_s', 'summary',
  ]
  const rows: (string | number)[][] = [header]
  for (const entry of entries) {
    const meta = SCIENCE_META[entry.kind]
    for (const metric of entry.result.rows) {
      rows.push([
        entry.startedAt, entry.siteId, entry.siteName, entry.region,
        meta.label, meta.category, entry.lat.toFixed(6), entry.lon.toFixed(6),
        metric.metric, metric.value, metric.unit, entry.durationS, entry.result.summary,
      ])
    }
  }
  return rows.map(row => row.map(escape).join(',')).join('\n')
}
