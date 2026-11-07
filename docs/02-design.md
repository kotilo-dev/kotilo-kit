# 02 — Tasarım

Mockup (Claude Design canvas, 3 artboard): **Palette 720×480**, **Tam pencere 1280×800 (Base64)**, **Ayarlar › Tema 1280×800**. Her artboard'un Tweaks panelinde `theme` anahtarı 7 temayı gösterir; uygulama görünümü bu mockup'a birebir uyar.

## Token'lar
Tüm Kotilo ürünleriyle ortak ad seti. CSS değişkeni `--kit-<token>`; değerler yalnızca `05-themes.toml`'dan gelir.

| Token | Rol | Mocha örneği |
|---|---|---|
| `crust` | durum çubuğu, en alt katman | #11111b |
| `mantle` | kenar çubuğu, panel zemini, başlık çubuğu | #181825 |
| `base` | pencere zemini | #1e1e2e |
| `s0` (surface0) | seçili satır, kart, kenarlık | #313244 |
| `s1` (surface1) | pencere kenarlığı, kısayol rozeti kenarı | #45475a |
| `overlay` | ikincil ikon, kısayol metni, bölüm başlığı | #6c7086 |
| `subtext` | açıklama metni, pasif menü | #a6adc8 |
| `text` | ana metin | #cdd6f4 |
| `blue` | birincil aksiyon (Kopyala, aktif segment), Kodlama kategorisi | #89b4fa |
| `mauve` | palette'te seçili araç ikonu, Üreteç kategorisi | #cba6f7 |
| `green` | çevrimdışı rozeti, çıktı metni, Metin kategorisi | #a6e3a1 |
| `yellow` | Format kategorisi, uyarı | #f9e2af |
| `peach` | Zaman kategorisi | #fab387 |
| `red` | hata satırı, kapatma noktası | #f38ba8 |
| `teal` | pano algılama şeridi, Web kategorisi | #94e2d5 |

Aksan üstüne metin daima `crust` (ör. mavi buton → `crust` yazı). Kategori renkleri sabit eşleme: Kodlama=blue, Format=yellow, Metin=green, Zaman·Sayı=peach, Üreteç·Kripto=mauve, Web·Ağ=teal, Renk·Görsel=red.

## Tipografi
- UI: Inter 400/500/600 (paketli). Başlık 20/600, menü 13, açıklama 12, bölüm etiketi 10–11/600 letter-spacing 0.06–0.08em büyük harf.
- Kod/giriş/çıktı/kısayol: JetBrains Mono 400/500 (paketli; Fira Code, Cascadia Code, Iosevka seçenek). Varsayılan 13 px, satır 1.6.
- Fontlar uygulamayla gelir; ağdan font yüklenmez.

## Yerleşim

### Palette (720×480, köşe 14, kenarlık `s1`, gölge 0 24 64 rgba(0,0,0,.5))
1. Arama satırı 52 px: büyüteç ikon (`subtext`), input mono 18/500, sağda `esc` rozeti.
2. Pano şeridi 40 px, zemin `mantle`: pano ikonu + "Panoda JWT algılandı" (`teal` 12/500) + içerik önizleme mono 12 `overlay` ellipsis. Pano algılanmadıysa şerit yok.
3. Liste: bölüm başlığı "ÖNERİLEN" / "SON KULLANILAN" (11/600 `overlay`). Satır 52 px: 32 px ikon kutusu (seçili: aksan zemin + `crust` ikon; diğer: `s0` zemin + aksan ikon), ad 14/600 (seçili) veya 14/500, açıklama 12 `subtext`, sağda kısayol (`enter` rozeti seçilide aksan zemin; diğerlerinde `⌘2` mono `overlay`).
4. Alt çubuk 36 px `mantle`: `↵ çalıştır ve panoya yaz · ctrl ↵ tam pencerede aç · tab seçenekler`, sağda yeşil nokta + tema adı.

### Tam pencere (1280×800, köşe 12)
- Başlık çubuğu 44 px `mantle`: trafik ışıkları (macOS; Windows/Linux'ta sistem düğmeleri), logo (mauve kare, 22 px) + "Kotilo Kit" 13/600, ortada 480 px arama kutusu (`ctrl K` rozeti), sağda tema ve ayarlar ikon butonları (32×32, kenarlık `s0`).
- Kenar çubuğu 232 px `mantle`, sağ kenarlık `s0`: kategori başlıkları 10/600 büyük harf `overlay`; araç satırı 7 px dikey padding, 8 px renkli kare (kategori rengi), seçili: `s0` zemin, `text`, 500.
- Ana alan padding 20 24: başlık satırı (h1 20/600, segmented Encode/Decode — aktif `blue` zemin `crust` yazı 600, checkbox'lar `blue` accent, sağda "Pipeline'a ekle" ikincil buton).
- Giriş/Çıktı: 2 sütun grid gap 16, panel kenarlık `s0`, köşe 10, zemin `mantle`; başlık satırı 36 px (etiket 12/600, meta mono 11 `overlay`, butonlar 11 px). Giriş textarea mono 13/1.6 `text`; çıktı mono 13/1.6 `green`, word-break.
- Öneri şeridi 40 px: kalkan ikon `teal`, "Girişin JSON olduğu algılandı:" `subtext`, linkler `blue` 500 ayırıcı "·".
- Durum çubuğu 28 px `crust`, mono 11 `overlay`: çevrimdışı rozeti · tema · font · (sağ) araç/eklenti sayısı · sürüm.

### Ayarlar › Görünüm
- Kenar çubuğu: Genel, Görünüm, Kısayollar, Pano algılama, Eklentiler, Pipeline'lar, Gizlilik, Hakkında.
- Tema kartları 4 sütun grid: üst yarı temanın `base` zemini üstünde `text`/`subtext` çizgileri ve 7 aksan karesi (16 px, köşe 4); alt yarı ad 13/500 + id mono 11 `overlay`; seçili kart kenarlığı 2 px `blue`, diğerleri `s0`. Son kart "+ Özel tema" kesik kenarlık.
- İki ayar kartı: Yazı tipi (mono seçimi, boyut slider 11–18, ligature) ve Pencere (palette opaklığı 60–100, köşe 0–16, kompakt yoğunluk).

## Etkileşim
- Klavye öncelikli: palette'te ↑↓ seçim, `Tab` seçenekler, `Alt+harf` seçenek değiştirme, `Ctrl+Shift+C` çıktıyı kopyala, `Ctrl+L` girişi temizle.
- Çıktı değişiminde 120 ms fade; tema değişiminde 200 ms renk geçişi; başka animasyon yok.
- Hata durumu: çıktı panelinin ilk satırı `red` 12 px ("Geçersiz base64: 17. karakter"), panel kenarlığı `red` %40 opaklık.
- Boş giriş: çıktı panelinde `overlay` 13 px "Bir şey yapıştır ya da yaz" — başka boş durum görseli yok.

## Erişilebilirlik
- Gerçek `<button>`, `<input>`, `<label>`; ikon butonlarda `aria-label`.
- Her temada `text`/`base` ≥ 7:1, `subtext`/`base` ≥ 4.5:1, `overlay`/`base` ≥ 3:1 (11 px etiketler için `overlay` yalnızca büyük harf/600 ağırlıkla; CI testi `pnpm test:contrast`).
- Odak halkası 2 px `blue`, offset 2 px; tüm kabuklarda aynı.
