export const CATALOG_VERSION = '2026.08-geonames-1';

const rows = [
  ['ZA', 'South Africa', 'South Africa|Zuid-Afrika|Suid-Afrika'],
  ['NA', 'Namibia', 'Namibia'],
  ['AD', 'Andorra', 'Andorra'],
  ['AL', 'Albania', 'Albania|Albanië|Shqipëria'],
  ['AM', 'Armenia', 'Armenia|Armenië|Հայաստան'],
  ['AT', 'Austria', 'Austria|Oostenrijk|Österreich'],
  ['AZ', 'Azerbaijan', 'Azerbaijan|Azerbeidzjan|Azərbaycan'],
  ['BA', 'Bosnia and Herzegovina', 'Bosnia and Herzegovina|Bosnië en Herzegovina|Bosna i Hercegovina'],
  ['BE', 'Belgium', 'Belgium|België|Belgique|Belgien'],
  ['BG', 'Bulgaria', 'Bulgaria|Bulgarije|България'],
  ['BY', 'Belarus', 'Belarus|Wit-Rusland|Беларусь'],
  ['CH', 'Switzerland', 'Switzerland|Zwitserland|Schweiz|Suisse|Svizzera'],
  ['CY', 'Cyprus', 'Cyprus|Κύπρος|Kıbrıs'],
  ['CZ', 'Czechia', 'Czechia|Czech Republic|Tsjechië|Česko'],
  ['DE', 'Germany', 'Germany|Duitsland|Deutschland'],
  ['DK', 'Denmark', 'Denmark|Denemarken|Danmark'],
  ['EE', 'Estonia', 'Estonia|Estland|Eesti'],
  ['ES', 'Spain', 'Spain|Spanje|España'],
  ['FI', 'Finland', 'Finland|Suomi'],
  ['FR', 'France', 'France|Frankrijk'],
  ['GB', 'United Kingdom', 'United Kingdom|UK|Great Britain|Britain|Verenigd Koninkrijk'],
  ['GE', 'Georgia', 'Georgia|Georgië|საქართველო'],
  ['GR', 'Greece', 'Greece|Griekenland|Ελλάδα'],
  ['HR', 'Croatia', 'Croatia|Kroatië|Hrvatska'],
  ['HU', 'Hungary', 'Hungary|Hongarije|Magyarország'],
  ['IE', 'Ireland', 'Ireland|Ierland|Éire'],
  ['IS', 'Iceland', 'Iceland|IJsland|Ísland'],
  ['IT', 'Italy', 'Italy|Italië|Italia'],
  ['KZ', 'Kazakhstan', 'Kazakhstan|Kazachstan|Қазақстан'],
  ['LI', 'Liechtenstein', 'Liechtenstein'],
  ['LT', 'Lithuania', 'Lithuania|Litouwen|Lietuva'],
  ['LU', 'Luxembourg', 'Luxembourg|Luxemburg|Lëtzebuerg'],
  ['LV', 'Latvia', 'Latvia|Letland|Latvija'],
  ['MC', 'Monaco', 'Monaco'],
  ['MD', 'Moldova', 'Moldova|Moldavië'],
  ['ME', 'Montenegro', 'Montenegro|Crna Gora|Црна Гора'],
  ['MK', 'North Macedonia', 'North Macedonia|Noord-Macedonië|Macedonia|Северна Македонија'],
  ['MT', 'Malta', 'Malta'],
  ['NL', 'Netherlands', 'Netherlands|Nederland|Holland'],
  ['NO', 'Norway', 'Norway|Noorwegen|Norge'],
  ['PL', 'Poland', 'Poland|Polen|Polska'],
  ['PT', 'Portugal', 'Portugal'],
  ['RO', 'Romania', 'Romania|Roemenië|România'],
  ['RS', 'Serbia', 'Serbia|Servië|Srbija|Србија'],
  ['RU', 'Russia', 'Russia|Rusland|Россия'],
  ['SE', 'Sweden', 'Sweden|Zweden|Sverige'],
  ['SI', 'Slovenia', 'Slovenia|Slovenië|Slovenija'],
  ['SK', 'Slovakia', 'Slovakia|Slowakije|Slovensko'],
  ['SM', 'San Marino', 'San Marino'],
  ['TR', 'Türkiye', 'Türkiye|Turkey|Turkije'],
  ['UA', 'Ukraine', 'Ukraine|Oekraïne|Україна'],
  ['VA', 'Vatican City', 'Vatican City|Vatican|Vaticaanstad|Città del Vaticano'],
  ['XK', 'Kosovo', 'Kosovo|Kosova|Косово']
];

const microTargets = { VA: 8, MC: 16, SM: 25, LI: 35, AD: 45, MT: 60, LU: 70 };
const largeCountries = new Set(['DE', 'ES', 'FR', 'GB', 'IT', 'KZ', 'NO', 'PL', 'RO', 'RU', 'SE', 'TR', 'UA']);

export const COUNTRY_SPECS = rows.map(([code, name, aliases]) => ({
  code,
  name,
  aliases: aliases.split('|'),
  targetAnchors: code === 'ZA' || code === 'NA' ? 200 : (microTargets[code] || (largeCountries.has(code) ? 160 : 120)),
  scope: ['AM', 'AZ', 'GE', 'KZ', 'RU', 'TR'].includes(code) ? 'transcontinental-country' : 'whole-country'
}));

export const REQUIRED_COUNTRY_CODES = Object.freeze(COUNTRY_SPECS.map(country => country.code));
