# Project context

What has been decided so far, so any session (human or Claude Code) starts from the same place.

## The business

Three related brands, run by the same team in Galați, Romania (Daniela Turcu, administrator; Adrian Turcu, psychologist and Monroe Institute® trainer; plus clinicians):

| Brand | Site | What it is | Current state |
| --- | --- | --- | --- |
| **Psizone** | psizone.ro | Psychology centre: evaluation, ABA, speech therapy, sensory integration, psychotherapy (CBT, family, hypnosis), QEEG brain mapping, neurofeedback, TMS, EQ-SYNC sessions; children, teens, adults, post-stroke, psycho-oncology, sport psychology | Old WordPress (OceanWP + Elementor + WooCommerce + LearnPress), ~119 pages and posts, 244 resold Monroe products, 559 media files. Mixes clinical content with Hemi-Sync wellness content. To be replaced. |
| **EQ-SYNC** | eq-sync.ro | 21-day guided binaural sound programme for mental calm ("Liniște mentală ghidată de sunet"); free programme, shop, account, protocols, blog | Recent custom build (not WordPress). Night navy, cream, gold; Fraunces + IBM Plex Mono. |
| **Hemi-Sync România** | hemi-sync.ro | Monroe Institute® programmes (Gateway Voyage®, SyncCreation®, Lucid Dreaming®), products, free exercises, Focus levels, Clubul Delfinului, articles | Recent custom build. White, ink, violet; Fraunces + Inter; dawn landscape photography. |

## Decisions

- **One platform on Payload CMS** (headless) for all three brands plus a shared blog, with Payload also handling authentication; SSO across every app (sites, back office, control plane, scheduling app, automations).
- **AI-first, light-text sites:** landing/hook pages with little text; depth lives in hubs, the blog and an AI guide that answers only from reviewed content.
- **One design system, eight themes:** the same React components, re-themed per brand (Psizone dark/light, EQ-SYNC night/day, Hemi-Sync dawn/night, Blog paper/night). See `packages/design/` and its `brand-books/`. Fraunces is the shared headline face for the whole family.
- **Psizone identity: organic futurism**, dark mode primary. Promise: "Vezi schimbarea." (See the change).
- **Hemi-Sync content leaves psizone.ro** and lives on hemi-sync.ro; Psizone keeps only a discreet link. The AI guide on Psizone never recommends Hemi-Sync for clinical questions.
- **Nothing is deleted until its facts have a new home** (the audit enforces this).
- **Clinical review gate:** no clinical page publishes without a named psychologist's approval.

## Assumptions to confirm

- The blog is one shared publication for the group, articles tagged by brand (could become one blog per brand).
- Psizone keeps its name; logos for all three brands are still to be supplied (placeholders in the design system).
- Address: psizone.ro launch press said Str. Alexandru Ioan Cuza 72; directories say Gen. Alexandru Cernat. Which is current?
- Prices are shown on the new sites (or ranges).

## More

- Decision log and rejected options: `HISTORY.md`
- All links and sources: `RESOURCES.md`
- Research on the three sites and the market: `research/site-research.md`
- Audience, positioning and the first platform sketch: `research/positioning-and-early-plan.md`

## Planning artefacts (online)

- Content inventory (preliminary, by headings only): https://claude.ai/artifact/RkXLW2SrXeZUUHn3bD9yLA (also `preliminary-inventory-psizone.csv`; the audit replaces it)
- Content strategy: https://claude.ai/artifact/JYv4yCHuC9duf1T4LSuXaU (also `content-strategy.md`)
- Design system: https://claude.ai/artifact/KCDyT243fZZhkYDVYRfFo5
- Brand themes overview: https://claude.ai/artifact/KKtbwS12rj3ngUd32jtnEj
