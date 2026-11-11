# Psizone content strategy

The existing ~15,000 words of clinical content become one structured source in Payload, published as fewer, stronger pages plus a blog and an AI guide. Nothing is deleted until it has a new home.

## Content model

Content is written once as structured entries, reviewed once by a clinician, then rendered wherever needed: the landing site (least text), hubs, the blog, FAQ blocks, the AI guide and search, social/video, and the client portal. Inputs: the archived WordPress text, clinicians (review and new entries), and the AI guide's unanswered questions. Payload collections: Hubs (conditions), Methods, Articles, KnowledgeEntries, FAQs, Programmes and prices, Practitioners.

## Topic clusters (10 hubs replace ~45 thin or overlapping pages)

| Hub (new URL) | Audience | Existing pages that feed it | Spoke articles |
| --- | --- | --- | --- |
| `/copii/autism` | Parents | Autism, Stimulare polisenzorială (part), Workshop Parenting TPD | First signs by age; what an autism evaluation involves; ABA explained; a week in an ABA programme |
| `/copii/adhd` | Parents, teens | ADD-ADHD, Evaluare și intervenție în ADHD | ADHD or just energetic?; ADHD in girls; school strategies; neurofeedback for attention: the evidence |
| `/copii/integrare-senzoriala` | Parents | Integrare neurosenzorială, Stimulare polisenzorială | Sensory overload signs; sensory activities at home |
| `/copii/logopedie` | Parents | Homepage card only (new content needed) | When to worry about late talking; how a speech evaluation works |
| `/adolescenti` | Parents, teens | Intervenția la adolescenți, Adicția de ecrane, BrainBoost pages, teen workshop | Screen time guide; school anxiety; talking to a teen who won't talk |
| `/adulti/anxietate-depresie` | Adults | Terapie individuală, Anxietate și atac de panică | Panic attacks; burnout vs depression; first therapy session |
| `/adulti/cuplu-familie` | Adults | Terapia de familie și cuplu, Psihoterapie de familie și cuplu (post) | Signs couples therapy could help; family therapy with a child in treatment |
| `/adulti/post-avc` | Families | Intervenția post-AVC | Mood changes after a stroke; supporting a parent after a stroke |
| `/adulti/psiho-oncologie` | Patients, families | Intervenția psiho-oncologică, Grup de suport oncologic | Coping with a diagnosis; caring for the carer |
| `/programe/sport` | Athletes, parents | Psihologia sportivă, Sportul de îndemânare auto | Pre-competition nerves; the mental side of motorsport |

Method pages are a second door: Evaluare și QEEG, Neurofeedback (absorbs 6 old pages), TMS, EQ-SYNC, ABA, Logopedie, Psihoterapie (CBT, hipnoză, online, group). Each method links to the hubs where it is used, and each hub lists its methods.

## Article backlog (wave 1 = 1–10)

1 Primele semne de autism, pe vârste · 2 Ce se întâmplă la o evaluare pentru autism · 3 Terapia ABA pe înțeles · 4 ADHD sau doar energie? · 5 Neurofeedback pentru atenție: ce spun studiile · 6 Timpul pe ecrane: ghid pentru părinți · 7 Semnele unei suprastimulări senzoriale · 8 Când să te îngrijoreze că cel mic nu vorbește · 9 Ce este o hartă cerebrală QEEG · 10 Atacul de panică: ce e și ce ajută · 11 Prima ședință de terapie · 12 Burnout sau depresie? · 13 TMS pe înțeles · 14 Anxietatea școlară la adolescenți · 15 Semne că terapia de cuplu v-ar ajuta · 16 Schimbările emoționale după un AVC · 17 Cum faci față unui diagnostic de cancer · 18 Hipnoza clinică: mituri și realitate · 19 Creierul stâng vs. drept: un mit popular · 20 Emoțiile înainte de competiție.

Target queries are working guesses: validate with Search Console data and a keyword tool. Each hub gets an FAQ block (5–8 questions, FAQPage markup); each method a 60–90 s explainer; each article a carousel and a short clip.

## AI knowledge base

- `KnowledgeEntries` collection: one entry per question or concept, 80–250 words, with audience, hub, method, locale, clinical reviewer and review date.
- Hubs, methods, FAQs, programmes, prices and practitioners are indexed too. On publish, a Payload hook chunks, embeds and writes to pgvector (same Postgres); unpublish removes.
- The archived WordPress text seeds the first 150–200 entries.
- The guide answers in Romanian or English, cites the page it used, recommends a hub, programme or evaluation, and hands off to booking with context. It also powers site search.
- Guardrails: no diagnosis or individual treatment advice, no medication talk; crisis language triggers a fixed message with 112 and the clinic phone; only reviewed, published entries are retrievable; drafts and Hemi-Sync content in separate indexes; no identity stored without sign-in and consent; chat health details treated as special-category data; weekly unanswered-questions report feeds the backlog.

## SEO foundations

- 301 for every old URL (Payload Redirects plugin), tested on staging against Search Console's top pages.
- One name, address and phone everywhere (site, Google Business Profile, la-psiholog.ro, romedic.ro).
- Structured data from Payload fields: MedicalClinic, Person (practitioners), MedicalWebPage with lastReviewed/reviewedBy, FAQPage, Event, BreadcrumbList.
- Named author and clinical reviewer with review date on every article; an editorial policy page.
- "Galați" in hub titles; no thin city-swap pages. Romanian primary, English with hreflang via Payload localisation.
- Performance budgets: LCP < 2.5 s mobile, reduced-motion respected, AI guide loaded after interaction.

## Editorial workflow

Draft → clinical review (practitioner approves or comments; approver and date stored) → publish (only approved; re-indexes the AI) → re-review after 12 months (scheduled job flags overdue pages). Claim rules: describe process and measurement, never promise cures, timelines or unsourced percentages; testimonials only with written consent and no outcome claims; every method page states who it is not suitable for; no AI-generated text ships unreviewed; never AI for crisis or safety copy. Cadence: two articles a month, monthly knowledge-base batch, quarterly review of the top 20 pages.

## Hemi-Sync content on psizone.ro

Moves to hemi-sync.ro (same platform, own tenant, shared SSO, payments and events): 19 workshop and wellness pages, 26 audio pages (become a gated AudioTracks collection; confirm Monroe licensing), Mărturii workshop quotes, the shop and the online course. Past-event pages merge into one archive per workshop type. Psizone keeps one discreet footer link.
