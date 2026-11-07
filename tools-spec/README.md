# tools-spec

Araç başına kabul tabloları. `packages/kit-tools/test/spec.test.ts` hepsini okur.

```jsonc
{
  "tool": "<id>",
  "cases": [{
    "name": "açıklama",
    "input": "…",
    "opts": {},                                           // isteğe bağlı
    "ctx": { "now": "ISO", "tz": "UTC", "locale": "en" }, // isteğe bağlı; varsayılan: 2026-01-01T00:00:00Z, UTC, en
    "expect": {
      "output": "tam eşleşme",                            // veya
      "contains": ["alt metin", "…"],                     // veya
      "rows": [["satır", "…"]],                           // table çıktı: bu satırlar sırayla bulunur
      "error": "error.<tool>.<neden>",                    // ToolError kodu
      "meta": { "key": "value" }                          // kısmi eşleşme
    }
  }]
}
```

`detect-fixtures.json`: `{ "input", "top" }` — `top` en yüksek skorlu aracın id'si, `null` = hiçbir araç.
