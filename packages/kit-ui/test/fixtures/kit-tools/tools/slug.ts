import { defineTool, fail } from '@kotilo/kit-core';

interface Opts {
  sep: string;
}

// letters NFD can't split into base + mark
const FOLD: Record<string, string> = { ı: 'i', ß: 'ss', æ: 'ae', ø: 'o', œ: 'oe', đ: 'd', ł: 'l' };

export default defineTool<Opts>({
  id: 'slug',
  category: 'text',
  name: { en: 'Slug', tr: 'Slug üret' },
  description: { en: 'Turn text into a URL-friendly slug', tr: 'Metni URL dostu slug yapar' },
  keywords: ['slug', 'url', 'permalink', 'kebab'],
  options: [{ key: 'sep', type: 'segmented', values: ['-', '_'], default: '-' }],
  messages: {
    en: { 'tool.slug.opt.sep': 'Separator', 'error.slug.empty': 'Nothing to turn into a slug' },
    tr: { 'tool.slug.opt.sep': 'Ayraç', 'error.slug.empty': 'Slug yapılacak metin yok' },
  },
  examples: [
    { input: 'İstanbul Şehir Hatları', output: 'istanbul-sehir-hatlari' },
    { input: 'Crème Brûlée & Straße', output: 'creme-brulee-strasse' },
  ],
  run(input, opts) {
    const words = input
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[ıßæøœđł]/g, (c) => FOLD[c] ?? c)
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    if (!words.length) fail('error.slug.empty');
    return { output: words.join(opts.sep) };
  },
});
