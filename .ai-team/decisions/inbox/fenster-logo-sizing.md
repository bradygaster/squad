# Decision: Sidebar Logo Sizing

**Author:** Fenster (Core Dev)  
**Date:** 2025-01-27  
**Status:** Implemented

## Context

The 500×500px `squad-logo.png` was rendering at ~248px tall in the sidebar header because `.sidebar-logo-img` used `max-width:100%; height:auto` — it filled the full sidebar width minus padding.

## Decision

Changed `.sidebar-logo-img` from `max-width:100%; height:auto` to `height:40px; width:auto`.

- **40px height** sits well within the sidebar-header's vertical space (padding: 20px top + 12px bottom) and matches typical docs site header logos (36–48px range).
- **width:auto** preserves the logo's aspect ratio — the 500×500 square image will render at 40×40px.
- No markup changes were needed; the flex layout in `.sidebar-header` already handles alignment.

## Alternatives Considered

- `max-width:48px` — would also work but constraining height is more conventional for header logos since vertical space is the scarce dimension.
- Adding a `width` + `height` attribute on the `<img>` tag — avoided to keep sizing in CSS where it belongs.
