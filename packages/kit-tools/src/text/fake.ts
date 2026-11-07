import { defineTool, type RunContext } from '@kotilo/kit-core';
import { toHex } from '../_lib/bytes.js';

const KINDS = ['lorem', 'name', 'email', 'address', 'phone', 'iban', 'company', 'id'] as const;
type Kind = (typeof KINDS)[number];
type FakeLocale = 'tr' | 'en';
type Opts = { kind: Kind; count: number; locale: FakeLocale };

/**
 * Uniform integers from `ctx.random` without modulo bias (rejection sampling).
 * Bytes are pulled in chunks and consumed in order, so one seed always yields one sequence.
 */
export class Rng {
  private buf: Uint8Array = new Uint8Array(0);
  private pos = 0;
  constructor(private readonly source: (n: number) => Uint8Array) {}

  byte(): number {
    if (this.pos >= this.buf.length) {
      this.buf = this.source(256);
      this.pos = 0;
    }
    return this.buf[this.pos++]!;
  }

  /** Uniform integer in [0, n), n ≤ 2^32. */
  int(n: number): number {
    if (n <= 1) return 0;
    let k = 1;
    while (256 ** k < n) k++;
    const space = 256 ** k;
    const limit = space - (space % n);
    for (;;) {
      let v = 0;
      for (let i = 0; i < k; i++) v = v * 256 + this.byte();
      if (v < limit) return v % n;
    }
  }

  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  pick<T>(list: readonly T[]): T {
    return list[this.int(list.length)]!;
  }

  digits(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += String(this.int(10));
    return s;
  }
}

// ---------- data ----------

const TR_FIRST = [
  'Ahmet', 'Mehmet', 'Mustafa', 'İsmail', 'İbrahim', 'Hüseyin', 'Çağrı', 'Gökhan', 'Oğuz', 'Barış',
  'Ümit', 'Şükrü', 'Ilgaz', 'Özgür', 'Doğan', 'Tolga', 'Emre', 'Burak', 'Kerem', 'Yiğit',
  'Ayşe', 'Fatma', 'Gülşen', 'Şebnem', 'Ilgın', 'Işıl', 'Özlem', 'Çiğdem', 'Gözde', 'Büşra',
  'Damla', 'Elif', 'Zeynep', 'İrem', 'Sevgi', 'Nurşen', 'Dilek', 'Ebru', 'Müge', 'Ece',
];
const TR_LAST = [
  'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir',
  'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek',
  'Polat', 'Erdoğan', 'Güneş', 'Akgün', 'Uçar', 'Işık', 'Ilıcak', 'Gündüz', 'Bozkurt', 'Ünal',
];
/** [city, plate code, districts] — plate code is the first two postcode digits. */
const TR_CITIES: readonly [string, string, readonly string[]][] = [
  ['İstanbul', '34', ['Kadıköy', 'Beşiktaş', 'Üsküdar', 'Şişli', 'Bakırköy', 'Ataşehir']],
  ['Ankara', '06', ['Çankaya', 'Keçiören', 'Yenimahalle', 'Etimesgut']],
  ['İzmir', '35', ['Karşıyaka', 'Bornova', 'Konak', 'Buca', 'Çiğli']],
  ['Bursa', '16', ['Nilüfer', 'Osmangazi', 'Yıldırım']],
  ['Antalya', '07', ['Muratpaşa', 'Konyaaltı', 'Kepez']],
  ['Eskişehir', '26', ['Odunpazarı', 'Tepebaşı']],
  ['Muğla', '48', ['Bodrum', 'Fethiye', 'Marmaris']],
  ['Iğdır', '76', ['Merkez', 'Tuzluca']],
  ['Şanlıurfa', '63', ['Haliliye', 'Eyyübiye']],
  ['Çanakkale', '17', ['Merkez', 'Gelibolu', 'Ayvacık']],
];
const TR_NEIGHBOURHOODS = [
  'Bahçelievler', 'Cumhuriyet', 'Atatürk', 'Yeşilyurt', 'Güzelyalı', 'Fatih', 'Çamlık', 'Gülbahçe',
  'İnönü', 'Kocatepe', 'Şirinevler', 'Ilıca', 'Mimar Sinan', 'Barbaros',
];
const TR_STREETS = [
  'Gül', 'Lale', 'Menekşe', 'Çınar', 'Ihlamur', 'Papatya', 'Söğüt', 'Şehit Ömer', 'Okul', 'Değirmen',
  'İstiklal', 'Gazi', 'Kardeşler', 'Bağlar', 'Zümrüt', 'Doğa',
];
const TR_STREET_KINDS = ['Sokak', 'Sokak', 'Caddesi', 'Bulvarı'];
const TR_COMPANY_WORDS = ['Yazılım', 'Bilişim', 'Teknoloji', 'Gıda', 'İnşaat', 'Lojistik', 'Danışmanlık', 'Tekstil', 'Enerji', 'Tasarım'];
const TR_COMPANY_SUFFIX = ['A.Ş.', 'Ltd. Şti.', 'San. ve Tic. A.Ş.', 'Ltd. Şti.'];
const TR_MOBILE = ['501', '505', '506', '507', '530', '532', '533', '535', '536', '537', '541', '542', '543', '544', '545', '551', '552', '553', '555', '559'];
/** Bank codes only shape the IBAN; account numbers are random. */
const TR_BANKS = ['00010', '00012', '00015', '00032', '00046', '00059', '00062', '00064', '00067', '00111', '00134', '00205'];

const EN_FIRST = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth',
  'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Daniel', 'Karen',
  'Matthew', 'Emily', 'Anthony', 'Olivia', 'Mark', 'Grace', 'Steven', 'Chloe', 'Paul', 'Hannah',
];
const EN_LAST = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor',
  'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis',
  'Walker', 'Hall', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson',
];
/** [city, state, zip prefix, area code] */
const EN_CITIES: readonly [string, string, string, string][] = [
  ['Springfield', 'IL', '627', '217'],
  ['Portland', 'OR', '972', '503'],
  ['Austin', 'TX', '787', '512'],
  ['Denver', 'CO', '802', '303'],
  ['Madison', 'WI', '537', '608'],
  ['Columbus', 'OH', '432', '614'],
  ['Raleigh', 'NC', '276', '919'],
  ['Sacramento', 'CA', '958', '916'],
  ['Boston', 'MA', '021', '617'],
  ['Phoenix', 'AZ', '850', '602'],
];
const EN_STREETS = ['Maple', 'Oak', 'Pine', 'Cedar', 'Elm', 'Washington', 'Lake', 'Hill', 'Park', 'Main', 'Sunset', 'River', 'Highland', 'Church', 'Mill'];
const EN_STREET_KINDS = ['St', 'Ave', 'Rd', 'Blvd', 'Ln', 'Dr'];
const EN_COMPANY_WORDS = ['Labs', 'Systems', 'Software', 'Analytics', 'Logistics', 'Foods', 'Energy', 'Design', 'Networks', 'Consulting'];
const EN_COMPANY_SUFFIX = ['Inc.', 'LLC', 'Ltd.', 'Co.', 'Group'];
const GB_BANKS = ['NWBK', 'BARC', 'MIDL', 'LOYD', 'HBUK', 'MONZ'];

const DOMAINS: Record<FakeLocale, readonly string[]> = {
  tr: ['example.com', 'example.org', 'ornek.com.tr'],
  en: ['example.com', 'example.org', 'example.net'],
};

const LOREM_WORDS = (
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore ' +
  'magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo ' +
  'consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint ' +
  'occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'
).split(' ');
const LOREM_START = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

// ---------- helpers ----------

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** "İsmail Çağrı" → "ismail cagri": tr-TR lowercase first (İ→i, I→ı), then fold to ASCII. */
export function asciiFold(s: string, locale: FakeLocale): string {
  return s
    .toLocaleLowerCase(locale === 'tr' ? 'tr-TR' : 'en-US')
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c]!)
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
}

/** ISO 13616 check digits: move country + "00" to the end, letters → 10..35, 98 − (n mod 97). */
export function ibanCheckDigits(country: string, bban: string): string {
  const moved = `${bban}${country}00`.toUpperCase();
  let rem = 0;
  for (const c of moved) {
    const v = c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return String(98 - rem).padStart(2, '0');
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

function lorem(rng: Rng, first: boolean): string {
  const sentences: string[] = first ? [LOREM_START] : [];
  const n = rng.range(4, 7);
  while (sentences.length < n) {
    const len = rng.range(6, 14);
    const words: string[] = [];
    for (let i = 0; i < len; i++) words.push(rng.pick(LOREM_WORDS));
    if (len > 8) words[rng.range(3, len - 4)] += ',';
    sentences.push(`${cap(words.join(' '))}.`);
  }
  return sentences.join(' ');
}

function person(rng: Rng, locale: FakeLocale): [string, string] {
  return locale === 'tr' ? [rng.pick(TR_FIRST), rng.pick(TR_LAST)] : [rng.pick(EN_FIRST), rng.pick(EN_LAST)];
}

function email(rng: Rng, locale: FakeLocale): string {
  const [f, l] = person(rng, locale);
  const sep = rng.pick(['.', '.', '_', '']);
  const num = rng.int(3) === 0 ? String(rng.range(1, 99)) : '';
  return `${asciiFold(f, locale)}${sep}${asciiFold(l, locale)}${num}@${rng.pick(DOMAINS[locale])}`;
}

function address(rng: Rng, locale: FakeLocale): string {
  if (locale === 'tr') {
    const [city, plate, districts] = rng.pick(TR_CITIES);
    const district = rng.pick(districts);
    const no = rng.range(1, 180);
    const flat = rng.int(2) === 0 ? `/${rng.range(1, 24)}` : '';
    return `${rng.pick(TR_NEIGHBOURHOODS)} Mahallesi, ${rng.pick(TR_STREETS)} ${rng.pick(TR_STREET_KINDS)} No: ${no}${flat}, ${plate}${rng.digits(3)} ${district}/${city}`;
  }
  const [city, state, zip] = rng.pick(EN_CITIES);
  const unit = rng.int(3) === 0 ? ` Apt ${rng.range(1, 40)}` : '';
  return `${rng.range(10, 9999)} ${rng.pick(EN_STREETS)} ${rng.pick(EN_STREET_KINDS)}${unit}, ${city}, ${state} ${zip}${rng.digits(2)}`;
}

function phone(rng: Rng, locale: FakeLocale): string {
  if (locale === 'tr') return `+90 ${rng.pick(TR_MOBILE)} ${rng.digits(3)} ${rng.digits(2)} ${rng.digits(2)}`;
  // 555-0100…0199 is the range reserved for fictional use
  const [, , , area] = rng.pick(EN_CITIES);
  return `+1 (${area}) 555-01${rng.digits(2)}`;
}

function iban(rng: Rng, locale: FakeLocale): string {
  if (locale === 'tr') {
    const bban = `${rng.pick(TR_BANKS)}0${rng.digits(16)}`;
    return `TR${ibanCheckDigits('TR', bban)}${bban}`;
  }
  const bban = `${rng.pick(GB_BANKS)}${rng.digits(6)}${rng.digits(8)}`;
  return `GB${ibanCheckDigits('GB', bban)}${bban}`;
}

function company(rng: Rng, locale: FakeLocale): string {
  if (locale === 'tr') return `${rng.pick(TR_LAST)} ${rng.pick(TR_COMPANY_WORDS)} ${rng.pick(TR_COMPANY_SUFFIX)}`;
  return `${rng.pick(EN_LAST)} ${rng.pick(EN_COMPANY_WORDS)} ${rng.pick(EN_COMPANY_SUFFIX)}`;
}

function uuidLike(rng: Rng): string {
  const b = Uint8Array.from({ length: 16 }, () => rng.byte());
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function generate(kind: Kind, count: number, locale: FakeLocale, ctx: RunContext): string {
  const rng = new Rng(ctx.random);
  const items: string[] = [];
  for (let i = 0; i < count; i++) {
    switch (kind) {
      case 'lorem':
        items.push(lorem(rng, i === 0));
        break;
      case 'name':
        items.push(person(rng, locale).join(' '));
        break;
      case 'email':
        items.push(email(rng, locale));
        break;
      case 'address':
        items.push(address(rng, locale));
        break;
      case 'phone':
        items.push(phone(rng, locale));
        break;
      case 'iban':
        items.push(iban(rng, locale));
        break;
      case 'company':
        items.push(company(rng, locale));
        break;
      case 'id':
        items.push(uuidLike(rng));
        break;
    }
  }
  return items.join(kind === 'lorem' ? '\n\n' : '\n');
}

export default defineTool<Opts>({
  id: 'fake',
  category: 'text',
  name: { en: 'Fake data', tr: 'Sahte veri' },
  description: {
    en: 'Lorem ipsum, names, emails, addresses, phones, IBANs; TR and EN data',
    tr: 'Lorem ipsum, isim, e-posta, adres, telefon, IBAN; TR ve EN veri',
  },
  keywords: ['lorem', 'ipsum', 'fake', 'faker', 'dummy', 'mock', 'iban', 'name', 'sahte', 'isim', 'adres', 'örnek'],
  options: [
    { key: 'kind', type: 'select', values: KINDS, default: 'lorem', hotkey: 'k' },
    { key: 'count', type: 'number', default: 3, min: 1, max: 1000 },
    { key: 'locale', type: 'select', values: ['tr', 'en'], default: 'en', hotkey: 'l' },
  ],
  run(_input, opts, ctx) {
    const count = Math.max(1, Math.min(1000, Math.floor(opts.count)));
    return { output: generate(opts.kind, count, opts.locale, ctx), meta: { count, kind: opts.kind } };
  },
  examples: [
    { input: '', opts: { kind: 'name', locale: 'tr', count: 3 }, output: 'Şükrü Özkan\nHüseyin Demir\nEce Koç' },
    {
      input: '',
      opts: { kind: 'email', locale: 'tr', count: 3 },
      output: 'sukru.ozkan@example.com\ndilek_akgun89@ornek.com.tr\nmustafa.simsek@example.com',
    },
    { input: '', opts: { kind: 'iban', locale: 'tr', count: 1 }, output: 'TR060020508529634185296741' },
    { input: '', opts: { kind: 'phone', locale: 'en', count: 2 }, output: '+1 (503) 555-0185\n+1 (512) 555-0196' },
  ],
});
