# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Kitchgoo
**System:** "The Pass" — v4 (2026-07-08)
**Category:** Restaurant/Food Service

The visual language of a working kitchen: the pass rail where printed chits
hang, porcelain tile, bistro pine, a line of brass. Solid surfaces, hairline
borders, mono numerals. No glassmorphism, no blur, no purple.

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary (bistro pine) | `#1E5E4A` | `--primary` |
| Primary hover | `#174B3B` | `--primary-hover` |
| Brass (the rail — decorative only) | `#B77E23` | `--brass` |
| Canvas (porcelain tile) | `#F1F3EF` | `--canvas` |
| Card | `#FFFFFF` | `--card-bg` |
| Ink | `#1C2420` | `--text-primary` |
| Hairline border | `#E2E6E0` | `--border` |

Semantic colors (success `#16A34A`, warning `#F59E0B`, danger `#EF4444`,
info `#3B82F6`) are reserved for state. Primary pine is deliberately dark so
it never reads as a success chip.

Dark mode (`[data-theme="dark"]`) is **cast iron**: canvas `#111613`,
cards `#1A211C`, primary lightened to `#4A9C7D`, brass `#D19A3D`.

### Typography

- **Brand/Display:** Young Serif — brand name, page titles, login only. Never for body or data.
- **UI/Body:** Hanken Grotesk 400–800.
- **Data/Numerals:** Spline Sans Mono — all stat values, prices, timers, table headers, section eyebrows. Numbers are chits: always mono, always `tabular-nums`.

```css
@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Spline+Sans+Mono:wght@400;500;600;700&family=Young+Serif&display=swap');
```

### The Signature: the rail

- A 3px pine→brass gradient line runs across the very top of every screen (`.app-container::before`).
- Stat cards carry a 28px brass "clip" on their top edge (`.stat-card::before`) — a chit clipped to the rail.
- Active nav items (sidebar and mobile bottom bar) show a 3px pine rail marker.

Use the rail motif for "active/pinned/live"; do not scatter it decoratively.

### Surfaces & Depth

- Solid white cards, 1px hairline borders, one soft shadow (`--shadow-card`).
- **No backdrop-filter/blur anywhere** — it is slow on the low-end Android tablets restaurants actually use.
- Radii: 6–16px (`--r-sm` … `--r-2xl`). Buttons use `--r-md`, not pills.
- Hovers change color/border/shadow — never `translateY`/`scale` that shifts layout.

### Responsive

- Breakpoints: 1100px (grids 4→2), 768px (mobile: drawer sidebar + bottom tab bar), 576px (search/user chip collapse).
- Mobile gets a fixed bottom tab bar (Dashboard / POS / Kitchen / Reports / More) with `env(safe-area-inset-bottom)`; `.page-body` reserves 84px clearance.
- Use `100dvh` alongside `100vh` for full-height shells.

---

## Component Specs

All components live in `src/index.css` under their v3 class names
(`.card`, `.stat-card`, `.btn-*`, `.badge-*`, `.input-field`, `.modal`,
`.nav-item`, `.bottom-nav-item`, …). Reuse those classes; do not restyle inline.

---

## Anti-Patterns (Do NOT Use)

- ❌ Glassmorphism, backdrop-filter, translucent surfaces
- ❌ Purple/violet anywhere (retired v3 palette)
- ❌ Gradient-filled buttons — primary actions are solid pine
- ❌ Emojis as icons — use Lucide SVGs
- ❌ Missing `cursor: pointer` on clickable elements
- ❌ Layout-shifting hovers (scale/translate)
- ❌ Text contrast below 4.5:1
- ❌ Instant state changes — transitions 150–300ms
- ❌ Invisible focus states — `:focus-visible` shows a pine outline globally

---

## Pre-Delivery Checklist

- [ ] Numbers set in Spline Sans Mono with `tabular-nums`
- [ ] Young Serif only at brand moments (titles/brand), never in data or body
- [ ] All icons from Lucide
- [ ] Hover states with smooth transitions (150–300ms)
- [ ] Light + dark (`data-theme="dark"`) both verified
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected (global guard exists)
- [ ] Responsive: 375px, 768px, 1024px, 1440px — bottom nav appears ≤768px
- [ ] No content hidden behind the bottom nav (84px clearance)
- [ ] No horizontal scroll on mobile
