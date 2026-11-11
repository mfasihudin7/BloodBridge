# Raabta Design System Specification

## 1. Visual Philosophy
Raabta is designed as a calm, human, and life-saving utility rather than a noisy social or corporate medical portal.
- **Tone**: Empathetic, trustworthy, urgent when critical, but never panic-inducing.
- **Color Philosophy**:
  - Warm off-white canvas (`#FAF7F5`) to prevent medical sterile glare.
  - Deep blood red (`#8B1A1A`) as the authoritative anchor.
  - Charcoal typography (`#1A1A1A`) for superior legibility.
  - Controlled emergency accents (`#C0392B`) reserved strictly for immediate life-safety actions.
- **Prohibitions**:
  - No decorative gradients, neon glows, glassmorphism blur traps, or tech-gimmick shadows.
  - No stock photography of smiling doctors or fake laboratory beakers.
  - No emoji icons in core UI navigation; clean Lucide-style inline SVGs only.

---

## 2. Token Dictionary

| Token Name | Value | Purpose |
|---|---|---|
| `--primary` | `#8B1A1A` | Main Brand & Core Actions |
| `--primary-hover` | `#721515` | Button Hover State |
| `--primary-light` | `#FFF5F5` | Thought/Notice Backgrounds |
| `--emergency` | `#C0392B` | Urgent Requests & Critical Alerts |
| `--emergency-hover`| `#A93226` | Emergency Button Active |
| `--background` | `#FAF7F5` | Warm Off-White Body |
| `--surface` | `#FFFFFF` | Cards & Elevated Surfaces |
| `--surface-raised` | `#F5F0ED` | Secondary Containers & Inputs |
| `--text` | `#1A1A1A` | High-Contrast Typography |
| `--text-muted` | `#6B6B6B` | Secondary Body & Labels |
| `--text-light` | `#9B9B9B` | Hints & Meta Notes |
| `--border` | `#E5E0DC` | Hairline Structural Dividers |
| `--border-strong` | `#C8C0B8` | Input & Interactive Borders |
| `--radius` | `12px` | Standard Components |
| `--radius-sm` | `8px` | Badges & Inner Elements |
| `--radius-lg` | `16px` | Modal Panels & Major Cards |
| `--radius-full` | `9999px` | Badges & Pills |

---

## 3. Typography & Dual-Script Layout

- **English Typography**: System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`).
- **Urdu Typography**: `Noto Nastaliq Urdu`, fallback to `Jameel Noori Nastaleeq` and `Urdu Typesetting`.
- **Direction Handling**:
  - True `dir="rtl"` applied at document root and language context.
  - Line-height adjusted to `1.8` for Urdu Nastaliq calligraphy to prevent ascender/descender clipping.
  - Symmetric padding and bidirectional icon swapping (e.g., arrow-left vs arrow-right).

---

## 4. Mobile Ergonomics

- **Minimum Touch Target**: 48px × 48px on all buttons, selectors, and tab items.
- **Thumb Zone Optimization**: 3-item fixed bottom navigation (Home, Requests/Activity, Profile).
- **Responsive Breakpoint**: `768px` cleanly demarcates desktop top-navigation from mobile bottom-navigation.

