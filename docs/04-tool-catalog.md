# 04 — Araç kataloğu

Öncelik: P1 her gün, P2 haftada bir, P3 niş. `id` dosya ve CLI adıdır. Her araç `packages/kit-tools/src/<category>/<id>.ts`. 1.0 = K0–K2 fazları.

`✓ K0` = yazıldı, testleri yeşil.

## encoding (blue)
| id | Araç | Not | P | Sürüm |
|---|---|---|---|---|
| base64 | Base64 encode/decode | metin ve dosya; URL-safe; satır sarma | P1 | 1.0 ✓ K0 |
| url | URL encode/decode | tam URL / yalnızca bileşen modu | P1 | 1.0 ✓ K0 |
| html-entity | HTML entity encode/decode | | P2 | 1.0 |
| jwt | JWT decode | header/payload/imza; `exp`/`iat` okunur tarih, kalan süre; imza doğrulama (HS256 secret ile, yerel) | P1 | 1.0 ✓ K0 |
| radix | Hex ⇄ metin ⇄ ikili ⇄ ondalık | sayı tabanı dönüştürücü | P2 | 1.0 |
| unicode | Unicode inceleme | kod noktası, kategori, görünmez karakter tespiti, NFC/NFD | P2 | 1.0 |
| punycode | Punycode / IDN | | P3 | 1.1 |
| gzip | Gzip/Deflate/Brotli | sıkıştır/aç, base64 ile | P3 | 1.1 |
| qr | QR kod üret/oku | metin, URL, Wi-Fi; okuma görselden | P2 | 1.1 |

## format (yellow)
| id | Araç | Not | P | Sürüm |
|---|---|---|---|---|
| json | JSON format/minify/doğrula | hata satırı, JSONPath sorgusu, anahtar sıralama | P1 | 1.0 ✓ K0 |
| json-convert | JSON ⇄ YAML ⇄ TOML ⇄ XML | | P1 | 1.0 ✓ K0 |
| json-types | JSON → TypeScript / Kotlin tipi | tip üretici | P2 | 1.0 |
| xml | XML format/doğrula + XPath | | P2 | 1.0 |
| sql | SQL format | lehçe seçimi | P2 | 1.0 |
| csv | CSV ⇄ JSON ⇄ Markdown tablo | ayırıcı algılama | P1 | 1.0 ✓ K0 |
| web-format | HTML/CSS/JS format ve minify | | P2 | 1.1 |
| markdown | Markdown önizleme | layout: preview | P3 | 1.1 |
| graphql | GraphQL format | | P3 | 1.1 |

## text (green)
| id | Araç | Not | P | Sürüm |
|---|---|---|---|---|
| case | Büyük/küçük, camel/snake/kebab/Pascal | `tr-TR` İ/ı duyarlı | P1 | 1.0 ✓ K0 |
| lines | Satır işlemleri | sırala (TR collation), tekilleştir, ters çevir, boş sil, numaralandır | P1 | 1.0 ✓ K0 |
| diff | Metin farkı | satır/karakter, yan yana; layout: table | P1 | 1.0 ✓ K0 |
| regex | Regex test | eşleşme vurgusu, gruplar, replace, açıklama; JS/PCRE | P1 | 1.0 ✓ K0 |
| fake | Lorem ipsum / sahte veri | isim, e-posta, adres, IBAN; TR yerel verisi | P2 | 1.0 |
| escape | Escape/unescape | JSON, SQL, regex, shell | P2 | 1.0 |
| count | Karakter/kelime/satır, bayt | | P2 | 1.0 |
| slug | Slug üret | TR karakter dönüşümü | P3 | 1.1 |

## time (peach)
| id | Araç | Not | P | Sürüm |
|---|---|---|---|---|
| timestamp | Unix timestamp ⇄ tarih | ms/s algılama, saat dilimi, ISO 8601; layout: table | P1 | 1.0 ✓ K0 |
| cron | Cron ifadesi | açıklama + sonraki 5 çalışma | P1 | 1.0 ✓ K0 |
| duration | Süre hesabı | iki tarih arası, iş günü, dilim dönüşümü | P2 | 1.0 |
| units | Sayı tabanı ve birim | bayt KB/MiB, hex/oct/bin | P2 | 1.0 |
| calc | İfade hesap makinesi | `0x1F + 2**10`; sonuç her tabanda | P3 | 1.1 |

## generate (mauve)
| id | Araç | Not | P | Sürüm |
|---|---|---|---|---|
| uuid | UUID v4/v7, ULID, NanoID | toplu üretim | P1 | 1.0 ✓ K0 |
| hash | Hash | MD5, SHA-1/256/512, CRC32; metin ve dosya; HMAC | P1 | 1.0 ✓ K0 |
| password | Parola üret | kural seçimi, entropi | P2 | 1.0 |
| bcrypt | Bcrypt / Argon2 hash ve doğrula | | P3 | 1.1 |
| keypair | RSA/ECDSA anahtar çifti, PEM inceleme | yalnızca yerel | P3 | 1.1 |
| cert | X.509 sertifika inceleme | PEM/DER, zincir, geçerlilik | P2 | 1.1 |
| aes | AES şifrele/çöz | | P3 | 1.1 |

## web (teal)
| id | Araç | Not | P | Sürüm |
|---|---|---|---|---|
| url-parse | URL ayrıştır | şema, host, yol, query tablo; layout: table | P1 | 1.0 ✓ K0 |
| query | Query string ⇄ JSON | | P2 | 1.0 |
| http-ref | HTTP durum kodu ve MIME sözlüğü | arama | P2 | 1.0 |
| useragent | User-Agent ayrıştır | | P3 | 1.1 |
| cidr | IP / CIDR hesaplayıcı | IPv4/IPv6 | P2 | 1.1 |
| chmod | chmod hesaplayıcı | | P3 | 1.1 |

## visual (red)
| id | Araç | Not | P | Sürüm |
|---|---|---|---|---|
| color | Renk dönüştür | HEX/RGB/HSL/OKLCH; WCAG kontrast | P1 | 1.0 ✓ K0 |
| theme-palette | Dev tema paleti | 7 temanın renk kodlarını kopyala | P2 | 1.0 |
| image | Görsel dönüştür ve sıkıştır | PNG/JPG/WebP/SVG; boyutlandır | P2 | 1.2 |
| svg | SVG optimize ve önizle | | P3 | 1.2 |
| code-image | Kod → görsel | snippet görseli, dev temalı | P2 | 1.2 |
| favicon | Favicon/ikon seti | | P3 | 1.2 |

## Özet
1.0: 40 araç (tüm P1 + P2'lerin çoğu). 1.1: +20. 1.2: görsel araçlar. SAP/ABAP kategorisi ayrı spec ile eklenir; bu katalogda yer almaz.

## Araç ekleme kontrol listesi
- [ ] `src/<category>/<id>.ts` `defineTool` ile; `examples` en az 3
- [ ] `detect` yazıldı ve `tools-spec/detect-fixtures.json`'a örnek eklendi
- [ ] `i18n/en.json`, `i18n/tr.json` ad + açıklama + seçenek etiketleri
- [ ] `tools-spec/<id>.json` kabul tablosu; `pnpm test` yeşil
- [ ] TR karakter içeren en az 1 test (metin araçlarında)
- [ ] Bu tabloda satır işaretlendi; README araç listesi `pnpm docs:tools` ile yenilendi
