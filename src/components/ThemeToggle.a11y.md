# ThemeToggle — Accessibility Test Checklist

Quick QA pass for the header theme switch. Run on iOS Safari, Android
Chrome, and a desktop browser with a screen reader.

## Keyboard
- [ ] Tab focuses the toggle from the page and shows a 2px focus ring.
- [ ] Enter activates the toggle (theme flips).
- [ ] Space activates the toggle (theme flips).
- [ ] Repeated activation flips back and forth without losing focus.
- [ ] No focus trap — Shift+Tab returns focus to the previous control.

## Screen reader (VoiceOver / NVDA / TalkBack)
- [ ] Announced as "switch", state "on" in light mode and "off" in dark.
- [ ] aria-label reads "Switch to light mode" / "Switch to dark mode".
- [ ] Icons are not announced (aria-hidden on Sun + Moon).

## Touch / mobile
- [ ] Bounding box ≥ 44×44 CSS px (button is `w-11 h-11`).
- [ ] No accidental double-toggle on tap.
- [ ] Works with Reduced Motion enabled (icon swap is instant; no scale).

## Persistence
- [ ] Selected theme survives a hard refresh (localStorage `vitalis.theme`).
- [ ] Selected theme is consistent across `/`, `/reset-password`, `/r/:token`.
- [ ] No flash of wrong theme on cold load (inline boot script in `index.html`).