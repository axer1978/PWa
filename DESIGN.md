# Design system

Confirmed by the owner on 2026-10-20. Write this file before any component, and change it before
changing the UI.

## Direction: Cinematic

One direction, never blended. The app is a dark theatre: near-black, a single warm light source,
large type, very little on screen at once. The player is the main use case: a dark room, one hand,
often a phone held low. Everything else (landing, pricing, legal, account) uses the same room, with
the house lights slightly up.

Principles:

1. **One light source.** Amber is the only colour. It marks what you can act on and where you are.
   Nothing else glows.
2. **Quiet frame, loud subject.** Chrome is minimal; the current title, choice or countdown fills
   the frame.
3. **Thumb zone first.** In the player, every control sits in the bottom 45% of the viewport.
   Nothing important needs a reach to the top.
4. **Projector motion.** Things fade in and out like a cut, they don't bounce. Motion is slow,
   linear-ish and rare. With `prefers-reduced-motion`, it disappears.
5. **Discretion.** Pre-gate pages (landing, pricing, legal, login, unavailable) are SFW, neutral and
   brand-light. Email subjects and sender names are neutral too.

## Tokens

All tokens are CSS custom properties in `src/lib/styles/tokens.css`. Components use tokens only,
never raw values. `tests/unit/design-tokens.test.ts` re-checks the contrast ratios below in CI.

### Colour: one dominant + one accent

| Token              | Value     | Role                                                                   |
| ------------------ | --------- | ---------------------------------------------------------------------- |
| `--color-dominant` | `#0B0B0D` | **Dominant.** Page background (near-black, slightly cool)              |
| `--color-accent`   | `#E8B04B` | **Accent.** Primary actions, focus, active state, the countdown leader |

Everything else is a tint of the dominant (neutral greys) or a shade of the accent. No other hues
exist. Errors use the accent plus an icon and explicit wording, never red.

| Token                    | Value     | Use                                                   | On bg            | On raised        |
| ------------------------ | --------- | ----------------------------------------------------- | ---------------- | ---------------- |
| `--color-surface`        | `#141418` | Cards, panels                                         | n/a              | n/a              |
| `--color-surface-raised` | `#1C1C21` | Inputs, pressed rows, sheets                          | n/a              | n/a              |
| `--color-fg`             | `#EDEDF0` | Primary text                                          | 16.8:1           | 14.5:1           |
| `--color-fg-muted`       | `#A3A3AD` | Secondary text                                        | 7.9:1            | 6.8:1            |
| `--color-fg-subtle`      | `#8A8A94` | Captions, metadata (still AA)                         | 5.8:1            | 5.0:1            |
| `--color-border-strong`  | `#6E6E78` | Input and control outlines (≥ 3:1, WCAG 1.4.11)       | 3.9:1            | 3.4:1            |
| `--color-border`         | `#2E2E35` | Decorative dividers only, never a control's only edge | 1.5:1            | n/a              |
| `--color-accent-hover`   | `#F0C46E` | Accent hover                                          | 12.0:1           | 10.4:1           |
| `--color-accent-pressed` | `#C99536` | Accent active/pressed                                 | 7.3:1            | 6.3:1            |
| `--color-on-accent`      | `#0B0B0D` | Text on accent fills                                  | 10.1:1 on accent | 7.3:1 on pressed |

**Dim mode** (player only, user-toggled) drops the house lights further:

| Token          | Value     | On `#000` |
| -------------- | --------- | --------- |
| `--dim-bg`     | `#000000` | n/a       |
| `--dim-fg`     | `#8C8C94` | 6.3:1     |
| `--dim-accent` | `#A8803A` | 5.8:1     |

Dim mode still meets AA. It's a brightness reduction, not a readability trade-off.

### Typography: two families

| Token            | Stack                                                                                             | Use                                 |
| ---------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `--font-display` | `"Instrument Serif", "Iowan Old Style", Georgia, serif`                                           | Titles at ≥ 32px only (title cards) |
| `--font-ui`      | `"Instrument Sans Variable", "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif` | Everything else                     |

Both are SIL OFL, self-hosted from `@fontsource` packages (woff2, `font-display: swap`, CSP
`font-src 'self'`). Instrument Serif: Regular 400 + Italic. Instrument Sans: variable weight
400–700. Load only Latin subsets.

Type scale (px / line-height), mobile first:

| Token        | Size / LH | Family  | Use                             |
| ------------ | --------- | ------- | ------------------------------- |
| `--text-xs`  | 13 / 16   | UI      | Legal small print, captions     |
| `--text-sm`  | 15 / 24   | UI      | Secondary text                  |
| `--text-md`  | 17 / 24   | UI      | Body, buttons                   |
| `--text-lg`  | 20 / 32   | UI      | Lead paragraphs, choice labels  |
| `--text-xl`  | 32 / 40   | Display | Section titles                  |
| `--text-2xl` | 48 / 48   | Display | Page titles, player node title  |
| `--text-3xl` | 64 / 64   | Display | Landing hero, countdown numeral |

Rules: body text is 17px (iOS won't zoom inputs at ≥ 16px). UI weight is 450 for body and 600 for
buttons and labels. Uppercase is used only for small tracked labels (`letter-spacing: 0.12em`).
Measure is ≤ 64ch.

### Spacing: 8px scale

`--space-1: 8px`, `--space-2: 16px`, `--space-3: 24px`, `--space-4: 32px`, `--space-5: 40px`,
`--space-6: 48px`, `--space-8: 64px`, `--space-10: 80px`, `--space-12: 96px`.

Every margin, padding and gap is one of these. Borders (1–2px) and focus-ring offsets are the only
sub-8 values. The page gutter is `--space-2` at 375px and `--space-3` from 600px.

### Shape, depth, motion

- Radius: `--radius: 2px`, like a film frame. Pills and big rounded cards are not used.
- Depth comes from surface tints and 1px borders, **not shadows**. The only "shadow" is an accent
  glow on the active countdown leader (`0 0 24px` at 35% accent).
- Motion: `--dur-fast: 160ms`, `--dur-base: 320ms`, `--dur-slow: 640ms`;
  `--ease: cubic-bezier(0.2, 0, 0, 1)`. Fades and cross-dissolves only. Under
  `prefers-reduced-motion: reduce`, all durations are 0 and the leader stops sweeping.
- Tap targets: `--tap-min: 48px` everywhere (above the 44px floor). Player choice buttons are
  `--tap-player: 72px` tall, full width.
- Focus: `outline: 2px solid var(--color-accent); outline-offset: 2px` on `:focus-visible`, on every
  focusable element. Never removed.

## Signature element: the countdown leader

A film-leader countdown: two concentric thin rings, a crosshair, a sweeping wedge and a large
Instrument Serif numeral in the middle. It's the one thing the design is remembered by, and it does
real work:

| Where                     | Behaviour                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Timer node** (player)   | The wedge sweeps once per second in accent; the numeral counts the seconds left; the whole leader is the tap target ("tap to …"). |
| **Choice with a timeout** | A small leader in the corner shows the time left before the default path.                                                         |
| **Loading** (any screen)  | Indeterminate: the wedge sweeps continuously with no numeral. This replaces spinners everywhere.                                  |
| **Session start**         | A 3-2-1 leader plays once while the first clip buffers (skipped if the clip is already ready).                                    |

Spec: an SVG with a 1px `--color-border-strong` outer ring and a 1px `--color-fg-subtle` inner ring,
a crosshair at 1px `--color-border`, and the wedge as an accent arc (`stroke-dasharray`) driven by
`AudioContext` time in the player, so it stays in sync with the audio. The numeral is
`--font-display`, `--text-3xl`. The accessible name and live region announce "N seconds left" at
most every 5 seconds, so screen readers aren't flooded. **Reduced motion:** no sweep; a static arc
shows the fraction left and the numeral updates once per second.

## Layout

- Mobile-first at **375px**. Single column. Content max-width 560px, centred from 600px.
- The page frame is a thin top bar (wordmark + one action) and the content. No footer clutter:
  legal links sit in a single quiet row at the end of public pages.
- Player: full viewport height (`100dvh`), safe-area insets respected. The top 55% holds the title,
  state and leader; the bottom 45% holds the controls. Pause and dim live in a bottom row that
  stays put.

## Components and required states

Every component ships with all of these states where they apply: **default, hover, focus-visible,
active/pressed, disabled, loading, empty, error, long content.**

| Component      | Notes                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`       | `primary` (accent fill, on-accent text), `secondary` (strong border, fg text), `quiet` (text only, still 48px). Loading shows an inline mini leader and keeps the width. |
| `ChoiceButton` | Player only: 72px tall, full width, `--text-lg` label, left-aligned index (A/B/C). Long labels wrap to two lines, then truncate with an accessible full label.           |
| `TextField`    | Label always visible above; 48px height; strong border; error text below with an icon, linked via `aria-describedby`.                                                    |
| `Notice`       | Info / error / success, distinguished by icon and wording, all in neutral + accent.                                                                                      |
| `Leader`       | The signature element (above). Sizes: 24px (inline, inside buttons; rings and crosshair hidden), 96px (corner), 240px (timer node).                                      |
| `EmptyState`   | A title in display type, one line of guidance, one action.                                                                                                               |
| `PageShell`    | Top bar + main + legal row. Sets the document title.                                                                                                                     |

## Content and copy

- Placeholder only in this repo: "Demo session N", "Path A / Path B". The owner adds real copy.
- Pre-gate copy is SFW and neutral. Nothing from `sessions/` or `content/` may appear before the
  age gate (checked automatically from Phase 6).
- Errors say what happened and what to do next, in plain words.

## Anti-slop block (never violate)

- Banned fonts: Inter, Roboto, Montserrat, Poppins, Space Grotesk.
- No purple/indigo gradients, no centered three-card grids, no cream+terracotta defaults, no
  0.1-opacity shadows.
- Two font families max. One dominant + one accent colour. 8px spacing scale.
- Every state present: loading, empty, error, long content.
- Visible focus rings, 44px minimum tap targets, AA contrast, `prefers-reduced-motion` respected.
- Mobile-first at 375px. The player is the main use case: dark room, one hand.
