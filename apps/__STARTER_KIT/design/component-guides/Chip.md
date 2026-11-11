Small pills: interactive filters and suggestions (`selected` / `onClick` makes a toggle button) or static tags with a soft `tone` (`accent`, `ai`, `warm`, `neutral`).

`ai` is reserved for anything the AI guide produced or suggests. `accent` marks methods and topics; `warm` marks human content (stories, team). Each brand theme colours these its own way.

- Provide: `children`; for toggles `selected` + `onClick`; for tags `tone`.
- Don't: use chips as primary actions or for statuses (use `StatusBadge`).
