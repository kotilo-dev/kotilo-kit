# 01 — Gereksinimler

## Ürün
Kotilo Kit: geliştiricinin günde on kez yaptığı küçük dönüşümleri (encode/decode, format, hash, zaman damgası, regex) **tamamen çevrimdışı, tek pencerede, dev temalı** yapan araç kutusu. "base64 decode" için tarayıcı açmanın yerini alır.

Hedef: **pano → sonuç 2 tuş.**

## Platformlar
| Sürüm | Kabuk |
|---|---|
| 1.0 | Masaüstü: Windows, Linux, macOS (Tauri) |
| 1.1 | Kotilo Shell command palette (aynı `kit-core`) |
| 1.2 | Android launcher arama çubuğu (`>` ön eki) |

Bu repo 1.0 kabuğunu ve çekirdeği içerir; Shell ve Launcher entegrasyonu `kit-core`'u npm paketi olarak tüketir.

## Fonksiyonel gereksinimler

### F1 — Palette penceresi
- Global kısayol (varsayılan `Ctrl+Shift+K`, macOS `Cmd+Shift+K`) 720×480 bir palette açar; ikinci basış kapatır, `Esc` kapatır.
- Üstte arama; fuzzy eşleşme araç adı, kategori, `keywords` ve TR/EN etiketlerde.
- Pano algılama açıksa: panodaki içerik `detect` skorlarına göre ilk 3 aracı **Önerilen** altında listeler; en yüksek seçili gelir. Pano boşsa / algılanamazsa bölüm gizlenir.
- **Son kullanılan** 5 araç.
- `Enter`: seçili aracı pano içeriğiyle çalıştır, sonucu panoya yaz, pencereyi kapat, 1,5 s bildirim ("Panoya kopyalandı").
- `Ctrl+Enter`: aracı tam pencerede aç, girişi taşı.
- `Tab`: seçili aracın seçeneklerini satır içinde aç (segmented/toggle).
- Pencere odak kaybında kapanır; son arama metni sıfırlanır.

### F2 — Tam pencere
- Sol: kategori ağacı (Kodlama, Format, Metin, Zaman·Sayı, Üreteç·Kripto, Web·Ağ, Renk·Görsel); üstte arama (`Ctrl+K`).
- Orta: seçili araç — başlık, mod/seçenek çubuğu, **Giriş** ve **Çıktı** panelleri yan yana (dar pencerede alt alta, eşik 960 px).
- Giriş paneli: Yapıştır, Dosya, Temizle; bayt/karakter sayacı; encoding bilgisi.
- Çıktı paneli: Kopyala (birincil), Kaydet, **Araca gönder ›** (çıktıyı başka araca giriş yapar).
- Canlı sonuç: yazdıkça (debounce 80 ms). Hata: çıktı panelinde kırmızı satır, uygulama çökmez.
- Giriş > 1 MB: Worker'da çalışır, ilerleme çubuğu.
- Öneri şeridi: girişin türü algılanırsa ("Girişin JSON olduğu algılandı") ilgili 3 araca link.
- Durum çubuğu: çevrimdışı rozeti, tema adı, font, araç/eklenti sayısı, sürüm.

### F3 — Tema
- 7 yerleşik tema (`docs/05-themes.toml`): Catppuccin Mocha (varsayılan), Gruvbox Dark, Tokyo Night, Everforest Dark, Nord, Rosé Pine Moon, Dracula.
- Ayarlar › Görünüm: tema kartları (önizleme swatch'ları), özel tema (.toml içe aktar), mono font seçimi (JetBrains Mono varsayılan, Fira Code, Cascadia Code, Iosevka paketli), boyut 11–18, ligature, palette opaklığı, köşe yarıçapı, kompakt yoğunluk.
- Sistem açık/koyu izleme: her temanın `light` varyantı varsa kullanılır (Catppuccin Latte, Gruvbox Light, Tokyo Night Day, Everforest Light, Rosé Pine Dawn); yoksa koyu kalır.
- Tema değişimi anında, yeniden başlatma yok.

### F4 — Araçlar
`docs/04-tool-catalog.md`'deki tüm P1 araçlar 1.0'da; P2 çoğunluğu 1.0, kalanı 1.1.

### F5 — Pipeline (1.1)
- Araçlar zincirlenir: `base64 decode → gunzip → JSON format → JSONPath`.
- Zincir TOML olarak `~/.config/kotilo/kit/pipelines/<ad>.toml`; palette'te araç gibi listelenir.

### F6 — Eklentiler (1.1)
- `~/.config/kotilo/kit/tools/*.ts` dizininden `defineTool` modülleri yüklenir (esbuild ile derlenir, sandbox: ağ ve fs yok).
- `kotilo kit add <name>` resmî depodan (`kotilo-dev/kit-tools`) kurar; depo kopyası yerelde, ağ erişimi yalnızca bu komutta ve kullanıcı onayıyla.

### F7 — CLI
- `kotilo kit <tool> [options] < stdin` — aynı çekirdek, stdout'a yazar; CI'da kullanılabilir.
- `kotilo kit list`, `kotilo kit detect < stdin`.

## Fonksiyonel olmayan
- **Gizlilik:** çekirdekte ağ API'si yok (lint kuralıyla engellenir), telemetri yok, pano geçmişi yok.
- **Başlangıç:** palette kısayoldan 150 ms içinde görünür (önceden yüklü, gizli pencere).
- **Boyut:** kurulum ≤ 25 MB (MSI, setup.exe, dmg, deb; `release.yml` denetler); tek binary/AppImage/MSI/dmg; winget, AUR, Homebrew. AppImage, WebKitGTK’yi gömdüğü için (~80 MB) bütçeden muaftır (1.0.1 kararı).
- **Erişilebilirlik:** tüm araçlar klavyeyle; seçenekler `Alt+harf`; her temada metin kontrastı ≥ 4.5:1 (CI'da kontrol).
- **Dil:** EN/TR, sistem dilinden otomatik, ayarlardan değiştirilebilir.
- **Test:** her aracın `run` fonksiyonu için tablo testleri; TR karakter testleri; her tema için kontrast testi.

## Kapsam dışı (1.x)
- Ağ gerektiren araçlar (API istemcisi, DNS, URL kontrolü).
- SAP/ABAP katmanı (ayrı spec; `kit-core` eklenti API'siyle sonradan eklenir).
- Mobil kabuk bu repoda değil.

## Fazlar
| Faz | Kapsam | Bitti sayılır |
|---|---|---|
| K0 | Monorepo, `kit-core` (`defineTool`, registry, detect, i18n), 15 P1 araç + testler, CLI | `pnpm kit base64 decode` çalışıyor; testler yeşil |
| K1 | Tauri kabuğu: gizli pencere, global kısayol, pano okuma/yazma, tray; palette penceresi (mockup birebir) | Kısayol → palette → Enter → pano |
| K2 | Tam pencere: kategori ağacı, araç paneli, öneri şeridi, durum çubuğu; tüm P1 + P2 araçlar | Katalogdaki 1.0 araçları tamam |
| K3 | Tema sistemi: 7 tema, ayar ekranı, font/opaklık/radius, sistem açık/koyu, kontrast CI | Tema anında değişiyor; CI kontrast geçiyor |
| K4 | Paketleme (winget/AUR/Homebrew), README'de otomatik araç listesi, GitHub yayını | 1.0 tag |
| K5 (1.1) | Pipeline, eklenti yükleyici, `kit-tools` deposu | İlk topluluk eklentisi kuruluyor |
