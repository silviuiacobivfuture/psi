# Positioning and the early plan

From the first brainstorm (11 November 2026). Parts marked *superseded* were replaced later; they stay here for history.

## Audience

| Segment | Situation | Needs from the site | Entry point |
| --- | --- | --- | --- |
| Parents of young children | Suspected autism, speech delay, sensory issues | Is this normal? Who evaluates? What next? How much? | Evaluation booking |
| Parents of school-age children and teens | ADHD, behaviour, anxiety, screen overuse | Clear programmes, school-friendly schedules, progress reports | Programme page → evaluation |
| Adults | Anxiety, depression, burnout; interested in TMS or neurofeedback | Discretion, evidence, who the therapist is, online option | Therapist profile → booking |
| Neuro-rehab families | Post-stroke, oncology support | Multidisciplinary plan, coordination with doctors | Phone or callback |
| Referrers | Paediatricians, neurologists, schools, school counsellors | Referral form, one-page service summary | Referral page |
| Practitioners (later) | Room rental or a practice platform | Rooms, platform access | Partner page |

**Jobs to be done:** get a clear answer on what's wrong; know the plan and cost before committing; see the child or myself improving; feel safe and not judged.

**Positioning statement (draft):** For families and adults in south-east Romania who need more than talk therapy, Psizone is the neuro-psychology centre that maps the brain, builds one plan across specialists, and shows you the progress, unlike single-method practices that can only tell you how sessions went.

**Brand idea:** "See the change" / "Vezi schimbarea." Calm instead of mystical, measured instead of miraculous, one team instead of a menu of methods.

## Name options considered

Keep and refine **Psizone** (chosen: one spelling, always). Renames considered and not taken: Sinapsa, Plastica / Plastic Minds, Nod, Ritm.

## First visual direction (*superseded* by organic futurism)

Deep teal #173643, signal teal #147A74, ochre #D7AA59, mist #EEF7F6, paper #FAFAF7, ink #1E2A2F; humanist sans plus soft serif; three logo directions (wordmark with a calming brainwave line, a two-node monogram, rising progress arcs).

## First platform sketch (to be refined in the platform plan)

- One Payload 3 + Next.js app serving the site, the staff admin and a client portal; Postgres (EU); S3-compatible media storage; Lexical editor with drafts, versions and live preview; localisation `ro` (default) and `en`; email plus SMS reminders via the Payload jobs queue; Stripe (RON) or Netopia with invoices to SmartBill or Oblio for ANAF e-Factura; official plugins SEO, Form Builder, Redirects, Nested Docs, Search, and Multi-Tenant for the brands.
- Booking built natively, because the constraint is rooms and devices (one TMS room, two neurofeedback rooms), not only therapist calendars.
- Collections sketched: Users (admin, coordinator, practitioner, editor), Clients, Beneficiaries, Practitioners, Services, Conditions, Programmes, Rooms, Availability, Appointments, Payments, Referrals, Testimonials, Events, Pages, Posts, Media. Globals: header, footer, site settings, booking rules.
- Privacy: health data is GDPR special-category data; intake limited to logistics; no clinical notes in the CMS for the MVP; field- and document-level access; audit log; EU-only hosting; DPAs with processors.

## First roadmap (to be refined)

1. Decide and brand (name, Hemi-Sync split, identity, photo shoot)
2. MVP site on Payload (content rewrite, redirects, SEO, ro/en, intake forms)
3. Booking (rooms and availability, payments and e-Factura, SMS reminders, client portal)
4. Platform (progress reports, practitioner tools, multi-tenant, room rental)
