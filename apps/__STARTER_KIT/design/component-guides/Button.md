Pill-shaped actions in three variants: `primary` (accent fill), `glass` (frosted, bordered with `line-control`), `ghost` (text only).

One primary per view, for the thing the page is for (usually "Programează evaluarea"). Verb first, sentence case, Romanian first. `arrow` adds a trailing arrow that nudges on hover; use it for navigation, not for submit.

- Provide: `children`, `variant`, `size` (`sm` | `md` | `lg`), `arrow`, `href` to render a link.
- Focus: 2px solid `focus` ring, 2px offset.
- Don't: put two primaries side by side, or use `ghost` on the ambient field (too little contrast with moving colour behind it).
