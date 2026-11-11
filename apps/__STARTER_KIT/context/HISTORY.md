# Decision history

Newest last. Why things are the way they are, including what was tried and dropped.

| When (2026-11-11) | Decision or event | Why / what was dropped |
| --- | --- | --- |
| 03:40 | Project starts: rebuild psizone.ro and build an own platform on Payload CMS | The current WordPress site is a patchwork of plugins and two businesses in one |
| 03:45 | First brainstorm: audit, positioning "See the change", Payload sketch, 4-phase roadmap | See `research/positioning-and-early-plan.md` |
| 03:45 | Old circular emblem described as unreadable at small sizes and spiritual-looking | The owner has no original file of it; to be supplied later |
| 03:50 | Six-step plan agreed: map site, content strategy, design language, platform plan, design artefacts, Claude Code plan | |
| 04:25 | Site mapped through the WordPress API: 119 pages and posts classified | Classification was by titles, headings and word counts (later judged not thorough enough, see 06:15) |
| 04:40 | Content strategy: 10 hubs, 20-article backlog, AI knowledge base, SEO, editorial workflow | |
| 04:42 | Design direction chosen by the owner: **organic futurism**, dark-first with light, keep the name Psizone | Rejected options: quiet luxury clinic, neuro noir, editorial soft |
| 04:46 | Owner clarifies: **three brands** (Psizone, EQ-SYNC, Hemi-Sync) | Token names made brand-neutral from here on |
| 05:00 | Draft ψ (psi) logo rejected: "that's not my logo", "that's a trident" | Replaced by a plain gradient orb placeholder until real logos arrive |
| 05:02 | Owner works with Claude Code; handoff is plain files in a repo | |
| 05:05 | Data export script for WordPress written (lossless copy of pages, posts, products, media) | The old site is not rebuilt; it is emptied into the new platform |
| 05:44 | Owner: design language for **all three sites and a blog**, one component library, different themes and feelings | |
| 05:50 | Design system rebuilt as **Psizone Platform**: 8 themes, 18 components, brand books for Psizone, EQ-SYNC, Hemi-Sync, Blog; Fraunces shared across the family | EQ-SYNC and Hemi-Sync palettes and fonts taken from their live sites |
| 05:58 | Brand themes overview spreadsheet | |
| 06:15 | Owner: the content review must be thorough, every page of all three sites | Decision: a rule-based audit run by Claude Code with a strict checker, instead of judging by titles |
| 06:40 | Platform kit delivered: exporters, crawler, audit rulebook, checker, context, design system as code | |
| 07:10 | Research, history, resources, palette table and early plan added to the kit | |

## Open decisions

- Real logo files for all three brands
- One shared blog vs one blog per brand
- Current address of the centre
- Show prices on the sites, or ranges
- Hosting and who builds (assumed: the owner with Claude Code, EU hosting)
