---
name: Classroom
description: A breathable, Apple-like virtual classroom interface.
colors:
  primary: "#4f46e5"
  primary-dark: "#6366f1"
  neutral-bg: "#f5f5f7"
  neutral-bg-dark: "#0a0a0c"
  surface: "#ffffff"
  surface-dark: "#16161a"
  border: "#e5e5e7"
  border-dark: "#24242b"
  text-primary: "#1d1d1f"
  text-primary-dark: "#fafafa"
  text-secondary: "#86868b"
  text-secondary-dark: "#9ca3af"
typography:
  display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Classroom

## 1. Overview

**Creative North Star: "The Apple Education Sandbox"**

This visual system is modeled after modern Apple productivity and educational experiences (like Apple Classroom, Playgrounds, and Schoolwork). It prioritizes clean visual hierarchy, generous spacing (breathability), high legibility, and refined, responsive interactive states. 

The aesthetic is characterized by a bright, clean default light mode with high-contrast slate-indigo accents and soft ambient depth, and a highly polished, deep slate-charcoal dark mode. 

**Key Characteristics:**
- **Slick Breathable Spacing**: Spacious 16px/24px/32px spacing grids that give content room to breathe.
- **Smooth Apple Rounded Edges**: Consistent 12px and 16px corner radii on cards and buttons.
- **Pastel & Ink Color Strategy**: Tinted surfaces with deep violet/blue anchors and high-contrast text.
- **Tactile State Transitions**: Natural, spring-like interactive feedback (scale down slightly on active press).

## 2. Colors

The color palette is built around an elegant violet/indigo primary brand tone, crisp primary surfaces, and secondary neutral grays.

### Primary
- **System Indigo** (`#4f46e5` / `#6366f1`): Used for primary buttons, active states, active tab highlights, and focus rings.

### Neutral
- **Off-white Background** (`#f5f5f7`): Page background in light mode to match Apple hardware design.
- **Deep Black Background** (`#0a0a0c`): Page background in dark mode.
- **Card Surface** (`#ffffff`): Light mode container surface.
- **Dark Surface** (`#16161a`): Dark mode container surface.
- **Light Border** (`#e5e5e7`): Clean, thin separators and borders in light mode.
- **Dark Border** (`#24242b`): Clean, thin separators and borders in dark mode.

### Named Rules
**The 10% Color Rule.** Saturated primary accent colors are used on <=10% of any given screen. Visual clarity is driven by spacing and typographic size hierarchy rather than color fills.

**The Contrast First Rule.** Text and icons must maintain a contrast ratio >= 4.5:1 against their container background at all times.

## 3. Typography

**Display Font:** System UI Sans (with Apple / Blink fallbacks)
**Body Font:** System UI Sans (with Apple / Blink fallbacks)

### Hierarchy
- **Display** (Bold, `clamp(2rem, 5vw, 3rem)`, `1.15`): Used for main page headers.
- **Headline** (Semi-Bold, `1.5rem` / `24px`, `1.25`): Used for container titles and dashboard cards.
- **Title** (Semi-Bold, `1.125rem` / `18px`, `1.3`): Used for section titles.
- **Body** (Regular, `15px`, `1.5`, max length 70ch): General dashboard descriptions, metadata, and user cards.
- **Label** (Medium, `12px` / `13px`, tracking `0.02em`): Used for badge labels, table headers, and tiny buttons.

## 4. Elevation

The system uses depth structurally to separate content groups. We use a flat-by-default container model where cards are outlined, and acquire subtle ambient shadows only on hover or active interaction to suggest clickability.

### Shadow Vocabulary
- **Ambient Low** (`box-shadow: 0 1px 3px rgba(0,0,0,0.05)`): Static outline cards.
- **Interactive Rise** (`box-shadow: 0 8px 20px rgba(0,0,0,0.06)`): Hover state of clickable cards.

### Named Rules
**The Ghost Card Rule.** Do not pair borders greater than 1px with drop shadows exceeding 8px blur. Pick either a clean thin border (at rest) or a soft ambient shadow (on hover/state), never both at high contrast.

## 5. Components

### Buttons
- **Shape**: Clean rounded corners (`12px` radius).
- **Primary**: Indigo fill with white text.
- **Secondary**: Light background fill with border.
- **States**: Smooth transition (`duration-200` ease-out). On active tap, scale down by 2% (`active:scale-[0.98]`).

### Cards / Containers
- **Corner Style**: Rounded corners (`16px` radius).
- **Border**: Thin border (`1px solid var(--border)`).
- **Spacing**: Internal padding (`24px`).

### Inputs / Fields
- **Style**: Soft gray/black background with `1px` border, rounded (`12px`).
- **Focus**: Transition ring border (`ring-2 ring-primary/50`).

### Navigation
- **Header Navigation**: Clean top navbar with blurred backdrop (`backdrop-blur-md bg-background/80`).
- **Active Navigation**: Simple text weight bolding and an underline pill indicator rather than highlighted boxes.

## 6. Do's and Don'ts

### Do:
- **Do** use `active:scale-[0.98]` on all primary buttons and cards to create tangible physical feedback on tap.
- **Do** allow content to breathe by keeping margin/padding gaps at `24px` or `32px` on desktop layouts.
- **Do** use `TimeDisplay` to render localized class times to prevent hydration errors.

### Don't:
- **Don't** use neon gradient text or multi-color diagonal stripes.
- **Don't** use emojis as functional icons; use vector-based SVG icons.
- **Don't** use side-stripe borders as card accents.
- **Don't** mix hardcoded CSS hex codes; always map to theme custom properties.
