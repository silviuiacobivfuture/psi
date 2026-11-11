One turn in the AI guide conversation: `guide` turns sit on `ai-soft` with the orb avatar and list their sources; `user` turns sit right-aligned on `surface-2`.

Every guide answer that states a fact cites at least one Psizone page in `sources`. Answers end with one next step, usually a link to a hub or to booking.

- Provide: `role` (`guide` | `user`), `children`, `sources` (`[{label, href}]`).
- Don't: show a guide answer without sources, or style user turns in brand colours.
