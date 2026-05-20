# PHIBEK brand assets

Drop the real logo files here (replacing the SVG placeholder when ready):

| File | Used by | Notes |
|---|---|---|
| `phibek-mark.webp` | `AppHeader` and landing brand mark | Official PHIBEK mark on transparent/dark-ready raster. |
| `phibek-mark.svg` (placeholder) | legacy fallback mark | 64×64 viewBox, gold eye-and-sun on transparent. Kept only for reference. |
| `phibek-logo-light.png` | future light-mode header | Full lockup `PHIBEK · ŵinn` on light background. |
| `phibek-logo-dark.png` | future dark-mode header | Full lockup on dark background (matches the supplied dark-mode reference). |
| `phibek-logo-glow.png` | login splash / auth pages | The embossed gold-on-grey hero artwork. |
| `favicon.ico` / `favicon-32x32.png` | overrides `static/favicons/*` | Square mark only. |

CI palette (kept in [src/scss/_variables.scss](../../../src/scss/_variables.scss)):

- Phibek Navy `#0F1C3F` — `$phibek-navy`
- Oracle Gold `#C9952A` — `$phibek-oracle-gold` (= primary)
- Foresight Gold `#E8B84B` — `$phibek-foresight-gold` (= theme accent)
- Wisdom Cream `#F5F3EE` — `$phibek-wisdom-cream` (= body color)

Exposed as CSS custom properties: `--phibek-navy`, `--phibek-oracle-gold`,
`--phibek-foresight-gold`, `--phibek-wisdom-cream`, `--color-brand-primary`.
