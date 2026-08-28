# Text to Poster Design System

## 1. Product read

Text to Poster is an editorial poster studio for people who need a striking visual before they have the time or skill to design one. The interface should feel like a print room: warm, tactile, direct, and intentionally composed.

## 2. Visual direction

- Mood: editorial studio, not generic AI SaaS.
- Composition: asymmetric 12-column layouts, quiet margins, paper-like surfaces, strong image-led result cards.
- Motion: short opacity and transform transitions only; respect `prefers-reduced-motion`.
- Depth: borders and tonal shifts first; shadows are reserved for the active result card.

## 3. Tokens

```css
:root {
  --paper: #f5f0e8;
  --paper-deep: #e9e1d4;
  --ink: #1d1a17;
  --ink-muted: #625b52;
  --line: #d4c9ba;
  --accent: #e24a32;
  --accent-dark: #ad3020;
  --success: #2f6d50;
  --danger: #ad3929;
  --focus: #174f80;
  --container-max: 82rem;
  --container-gutter: 1.5rem;
  --studio-media-max-height: 30rem;
  --radius-card: 1.25rem;
  --radius-control: 0.75rem;
  --space-unit: 0.25rem;
}
```

## 4. Type scale

- Display: self-hosted Geist, `clamp(2.5rem, 6.5vw, 6rem)`, tight leading.
- Section heading: self-hosted Geist, `clamp(2rem, 4vw, 4rem)`.
- Body: self-hosted Geist, `1rem`, `1.6` leading.
- Label: self-hosted Geist, `0.75rem`, uppercase, `0.12em` tracking.
- Mono metadata: self-hosted Geist, `0.75rem`, tabular figures.

## 5. Reusable patterns

- `SiteHeader`: fixed `Generators`, `Examples`, `Pricing`, and `About` links,
  a logged-in account menu, a guest-only `Free to start` sign-in dialog
  trigger, accessible mobile navigation, and a minimal wordmark-only mode for
  sign-in and payment confirmation flows.
- `PosterStudio`: prompt field, style chips, ratio controls, resolution controls, generate action.
- `ResultCard`: fixed aspect ratio, image, status, watermark/download treatment.
- `GenerationProgressCard`: result grid with centered one-line generation state, in-place result reveal, and hover/focus download affordance.
- `SectionKicker`: small uppercase label with an accent rule.
- `LegalPage`: consistent narrow reading column and last-updated metadata.
- `SiteFooter`: copyright with separate site and friendly-link groups.

## 6. Accessibility

- All controls use native buttons, links, labels, and fieldsets.
- Focus rings use `--focus`; color is never the only status signal.
- Result loading and failure states use live regions.
- Images include descriptive alt text derived from the submitted prompt.
- Minimum target size is 44px; contrast must meet WCAG AA.

## 7. Responsive behavior

- Mobile: one-column studio and result list at 375px.
- Tablet: two-column result grid at 768px.
- Desktop: four-column result grid and asymmetric studio layout at 1280px.
- Full-height surfaces use `min-height: 100dvh`, never `100vh`.
