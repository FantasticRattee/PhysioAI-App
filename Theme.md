# PhysioAI — Theme & Design Tokens

Single reference for the app's visual theme (colors, fonts, sizes, radii, shadows).
**Aesthetic:** warm clinical — cream canvas · sage/deep-green brand · soft warm ink.

> **Sources of truth (edit these, not this doc):**
> - **Web (Therapist):** [`App/Therapist/shared/assets/theme.css`](Therapist/shared/assets/theme.css) — CSS variables on `:root`.
> - **Mobile (Patient, React Native):** [`App/Patient/src/core/theme.js`](Patient/src/core/theme.js) — exported `colors` token object.
> - UI-Mock + `Design - UI/PhysioAI - 2.html` mirror the same palette.
> ⚠️ Web and Mobile are **not perfectly in sync** — see [§ Web vs Mobile discrepancy](#-web-vs-mobile-discrepancy).

---

## Brand palette (canonical)

| Token | Hex | Use |
|---|---|---|
| Sage | `#7BA88F` | brand/primary on **web**; accent on mobile |
| Deep green | `#2F5D50` | brand/primary on **mobile**; logo box; deep accent on web |
| Cream (bg) | `#F5F1E8` | app background |
| White (surface) | `#FFFFFF` | cards |
| Warm ink | `#2A2823` (web) / `#1F2937` (mobile) | primary text |

---

## Fonts

| Role | Family | Weights | Where |
|---|---|---|---|
| **Wordmark** ("Physio**AI**") | **Gabarito** | 700 | web only (`@import` in theme.css); `.wordmark` |
| **UI / Latin** | **Inter Tight** | 400 / 500 / 600 / 700 | web (`--sans`) |
| **Thai** | **IBM Plex Sans Thai** | 400 / 500 / 600 / 700 | web (`--thai`, auto via `:lang(th)`) |
| **Numbers / mono** | **JetBrains Mono** | 400 / 500 / 600 | web (`--mono`) |
| **Mobile (Patient)** | *system default* (SF Pro iOS · Roboto Android) | inline `fontWeight` | RN — **no custom font loaded** |

**Web Google Fonts links:**
```
@import url('https://fonts.googleapis.com/css2?family=Gabarito:wght@700&display=swap');   /* in theme.css */
https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap   /* <link> in each HTML <head> */
```

**Font stacks (web `:root`):**
```
--sans: "Inter Tight", "IBM Plex Sans Thai", system-ui, -apple-system, sans-serif;
--thai: "IBM Plex Sans Thai", "Inter Tight", system-ui, sans-serif;
--mono: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
```

**Type scale (mobile, inline `fontSize`):** 10.5 · 11 · 12 · 12.5 · 13 · 14 · 15 · 16 · 17 · 18 · 20 · 22 · 24 · 28 · 30 · 120 (score ring). Most common = **13** and **15**.

---

## Web theme — `theme.css` `:root` variables

**Background / surface**
| Var | Value |
|---|---|
| `--bg` | `#F5F1E8` (cream) |
| `--surface` | `#FFFFFF` |
| `--surface2` | `#EDE7D9` |
| `--surface3` | `#DDD5C2` |
| `--line` | `rgba(60,48,30,0.10)` |
| `--line-strong` | `rgba(60,48,30,0.18)` |

**Ink (text)**
| Var | Value |
|---|---|
| `--ink` | `#2A2823` |
| `--ink2` | `#6B655A` |
| `--ink3` | `#8A8275` |

**Brand / functional**
| Var | Value | Meaning |
|---|---|---|
| `--brand` | `#7BA88F` | primary (sage) |
| `--brand-deep` | `#2F5D50` | deep green |
| `--brand-soft` | `rgba(123,168,143,0.16)` | tint |
| `--good` | `#7BA88F` | success |
| `--good-soft` | `rgba(123,168,143,0.16)` | |
| `--warn` | `#C8955A` | warning (amber) |
| `--warn-soft` | `rgba(200,149,90,0.14)` | |
| `--bad` | `#B86C5A` | error (terracotta) |
| `--bad-soft` | `rgba(184,108,90,0.14)` | |
| `--audio` | `#9B7A62` | Audio-Only mode accent |
| `--visual` | `#B86C5A` | Visual-Only mode accent |

**Radii**
| Var | Value |
|---|---|
| `--r-sm` / `--r-md` / `--r-lg` / `--r-xl` | `8px` / `12px` / `18px` / `24px` |
| `--r-pill` | `999px` |

**Shadows**
| Var | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` |
| `--shadow-md` | `0 8px 24px rgba(0,0,0,0.08)` |
| `--shadow-lg` | `0 20px 60px rgba(0,0,0,0.18)` |

---

## Mobile theme — `theme.js` (`colors`)

```
bg #F5F1E8 · surface #FFFFFF · surface2 #FAF7F0 · surface3 #EFE9DD · line #E5DFD3
ink #1F2937 · ink2 #6B7280 · ink3 #9CA3AF · inverse #FBFAF5
brand #2F5D50 · brandSoft #E3ECE7 · accent #7BA88F
good #2F5D50 · warn #9C7344 · bad #8C4F40
```

**Score → tone** (`scoreTone`): `≥75` → **good** · `≥50` → **warn** · `<50` → **bad** · `null` → **none**.
**Tone → color** (`toneColor`): good `#2F5D50` · warn `#9C7344` · bad `#8C4F40` · none `#9CA3AF`.

**Skeleton overlay colors** (`skeletonColors`, `[stroke, accent]` per tone):
| Tone | Stroke | Accent |
|---|---|---|
| good | `#2F5D50` | `#7BA88F` |
| warn | `#9C7344` | `#C8955A` |
| bad | `#8C4F40` | `#B86C5A` |
| none | `#8A8275` | `#8A8275` |

---

## ⚠️ Web vs Mobile discrepancy

The two platforms drifted and are **not identical** (handoff Pending #11 — needs a human "canonical" call before resyncing). Differences:

| | Web (`theme.css`) | Mobile (`theme.js`) |
|---|---|---|
| **Primary** (`brand`) | **sage** `#7BA88F` | **deep green** `#2F5D50` ← inverted |
| **Accent** | deep green `#2F5D50` | sage `#7BA88F` |
| Primary text ink | warm `#2A2823` | cool gray `#1F2937` |
| `warn` | `#C8955A` | `#9C7344` |
| `bad` | `#B86C5A` | `#8C4F40` |
| `surface2` | `#EDE7D9` | `#FAF7F0` |

If you resync: decide ONE canonical brand-vs-accent direction first, then align ink + functional colors. (The two `good/warn/bad` sets *do* both appear together in the skeleton-overlay palette, so keep that pairing in mind.)

---

## Where to change things
- **Web colors/radii/shadows/fonts** → `App/Therapist/shared/assets/theme.css` (`:root`). After editing, hard-reload (**⌘⇧R**) — `http.server` sends no cache headers so browsers hold the old CSS/modules.
- **Mobile colors / tones** → `App/Patient/src/core/theme.js` (`colors`, `scoreTone`, `toneColor`, `skeletonColors`).
- **Wordmark/logo assets** → `Logo/` + `App/*/shared/assets/` (favicon, logo-mark, logo-reversed, badges).
