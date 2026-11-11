The floating glass navigation pill: logo left, 4–6 links centred, at most two actions right (a ghost or glass secondary and the primary booking button).

It floats `space-4` from the top edge over the ambient field and stays sticky. On small screens links collapse into a menu (to be built in the site, not in this preview).

- Provide: `links` (`[{label, href, current}]`), `actions` (React nodes), `homeHref`.
- Don't: add a third action or a search field; search lives in `AskBar`.
