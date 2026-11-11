A frosted panel (`surface-glass` + `blur-glass` backdrop blur + `shadow-glass`) for content that floats over the ambient field.

Use glass only over something worth seeing through (the ambient field, a photo). On a plain background use `solid` (`surface-1`). Radius `radius-lg`, padding `space-5`.

- Provide: `children`, optional `solid`, `as` (element).
- Don't: nest glass in glass, or put long tables on glass.
