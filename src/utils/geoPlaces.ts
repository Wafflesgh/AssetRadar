/**
 * geoPlaces.ts — Where a conflict headline is about: a small table of place names (English and
 * Indonesian spellings) with a point on the map, used to put a dot on the world globe for
 * geopolitical alerts. Keyword match only; a headline naming none of these places gets no dot.
 */

export interface GeoPlace {
  id: string;
  name: string;
  lon: number;
  lat: number;
}

// More specific places first, so "Gaza" wins over "Israel" when only one dot is wanted
const PLACES: Array<GeoPlace & { re: RegExp }> = [
  { id: 'gaza', name: 'Gaza', lon: 34.4, lat: 31.4, re: /\bgaza\b|\brafah\b|\bhamas\b/i },
  { id: 'lebanon', name: 'Lebanon', lon: 35.5, lat: 33.9, re: /\bleban|\blibanon\b|\bhezbollah\b|\bbeirut\b/i },
  { id: 'yemen', name: 'Yemen', lon: 44.2, lat: 15.4, re: /\byemen\b|\byaman\b|\bhouthi/i },
  { id: 'redsea', name: 'Red Sea', lon: 38.5, lat: 20, re: /\bred sea\b|\blaut merah\b/i },
  { id: 'hormuz', name: 'Strait of Hormuz', lon: 56.5, lat: 26.6, re: /\bhormuz\b/i },
  { id: 'iran', name: 'Iran', lon: 51.4, lat: 35.7, re: /\biran\b|\btehran\b|\bteheran\b/i },
  { id: 'israel', name: 'Israel', lon: 35.2, lat: 31.8, re: /\bisrael\b|\btel aviv\b|\bjerusalem\b|\byerusalem\b/i },
  { id: 'syria', name: 'Syria', lon: 36.3, lat: 33.5, re: /\bsyria\b|\bsuriah\b|\bdamascus\b|\bdamaskus\b/i },
  { id: 'iraq', name: 'Iraq', lon: 44.4, lat: 33.3, re: /\biraq\b|\birak\b|\bbaghdad\b/i },
  { id: 'ukraine', name: 'Ukraine', lon: 30.5, lat: 50.4, re: /\bukrain|\bkyiv\b|\bkiev\b|\bkharkiv\b|\bodesa\b|\bodessa\b/i },
  { id: 'russia', name: 'Russia', lon: 37.6, lat: 55.8, re: /\brussia\b|\brusia\b|\bmoscow\b|\bmoskow\b|\bkremlin\b/i },
  { id: 'taiwan', name: 'Taiwan', lon: 121, lat: 23.7, re: /\btaiwan\b|\btaipei\b/i },
  { id: 'scs', name: 'South China Sea', lon: 114, lat: 12, re: /\bsouth china sea\b|\blaut china selatan\b|\bnatuna\b/i },
  { id: 'nkorea', name: 'North Korea', lon: 125.8, lat: 39, re: /\bnorth korea\b|\bkorea utara\b|\bpyongyang\b/i },
  { id: 'kashmir', name: 'Kashmir', lon: 75, lat: 34, re: /\bkashmir\b/i },
  { id: 'pakistan', name: 'Pakistan', lon: 73, lat: 33.7, re: /\bpakistan\b|\bislamabad\b/i },
  { id: 'india', name: 'India', lon: 77.2, lat: 28.6, re: /\bindia\b|\bnew delhi\b/i },
  { id: 'afghanistan', name: 'Afghanistan', lon: 69.2, lat: 34.5, re: /\bafghanistan\b|\bkabul\b|\btaliban\b/i },
  { id: 'sudan', name: 'Sudan', lon: 32.5, lat: 15.6, re: /\bsudan\b|\bkhartoum\b/i },
  { id: 'venezuela', name: 'Venezuela', lon: -66.9, lat: 10.5, re: /\bvenezuela\b|\bcaracas\b/i },
  { id: 'saudi', name: 'Saudi Arabia', lon: 46.7, lat: 24.7, re: /\bsaudi\b|\briyadh\b/i },
  { id: 'china', name: 'China', lon: 116.4, lat: 39.9, re: /\bchina\b|\btiongkok\b|\bbeijing\b/i },
];

/** Places named in a headline, most specific first (at most `max`). */
export function locateHeadline(title: string, max = 2): GeoPlace[] {
  return PLACES.filter((p) => p.re.test(title))
    .slice(0, max)
    .map(({ re: _re, ...place }) => place);
}
