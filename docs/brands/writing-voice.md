# Writing voice: one person per brand

Every text a brand publishes (an article, a hub, a method page, an FAQ answer) reads as if **one
person** wrote it. Different writers, same narrator. Read the brand book (`packages/design/brand-books/`)
first; this page turns it into a character you can write as.

## Shared rules (all brands)

- **Answer first.** The first paragraph answers the headline's question. Someone who stops after
  three lines leaves with what they came for.
- **Write natively in both languages.** Romanian is not a translation of English, nor the other way
  round. Each must read as if a native writer wrote it for that reader.
  - Romanian: correct diacritics with comma-below (ș, ț, never ş, ţ); typographic quotes „…”;
    address the reader as *tu*; *noi* for the team.
  - English: British spelling (programme, behaviour, colour); address the reader as *you*.
- **Concrete over abstract.** A real scene ("e 21:40, temele nu sunt gata și el a aruncat caietul")
  beats a generalisation. Examples, small scripts of what to say, what a session actually looks like.
- **Rhythm.** Mix short sentences with longer ones. One idea per paragraph. 2–5 sentences per
  paragraph. No walls of text, no listicle confetti.
- **Never:**
  - promise cures, timelines or outcomes;
  - give a percentage or statistic without a source you actually opened;
  - diagnose the reader or give individual treatment advice;
  - name doses, or advise starting or stopping medication ("discuți asta cu medicul psihiatru" is fine);
  - invent testimonials, practitioners, prices, addresses or phone numbers;
  - use the words revoluționar, miraculos, garantat, cele mai avansate, „hack”, „secretul”;
  - use em-dash chains or filler openers ("În lumea de azi…", "In today's fast-paced world…").
- **Crisis.** Never write crisis or self-harm guidance. Where danger is plausible, use exactly:
  RO „Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.”
  EN "If you or someone close to you is in immediate danger, call 112."
- **End with one next step:** a hub, the guide ("întreabă ghidul"), or booking an evaluation. One, not three.

## Psizone — „Ana”, the senior psychologist at the end of a long day

A clinical psychologist with twenty years in a Galați practice that works with children, teenagers
and adults. She has sat with hundreds of worried parents. She is **warm, direct and plain**. She
says what is known, what is not, and what she would do next. She never talks down, never alarms,
never hides behind jargon: when a technical word is needed she defines it in the same sentence.
She is quietly funny once in a while, never at anyone's expense. She shows the process and the
measurement, not the machine: "Facem o hartă cerebrală, apoi îți arătăm ce s-a schimbat."

Signature moves: names the parent's real fear in the first lines ("Probabil te întrebi dacă e vina
ta. Nu e."); gives a small script ("Poți să-i spui: …"); separates "normal" from "worth a
conversation" with a clear line; says who a method is **not** for.

## EQ-SYNC — the night-time companion

Calm, intimate, a little understated. Short sentences. The vocabulary of evening: liniște, seară,
respirație, somn, ritm. Explains the mechanism in one plain line, then moves on. Uses true concrete
numbers (21 days, 20 minutes, one session a day), **never efficacy claims or percentages**. Says
plainly when headphones are needed. It is a wellness tool, not a medical device: the text says so
where health comes up, and names who should not use binaural audio (epilepsy or seizure disorders
without a doctor's agreement).

## Hemi-Sync — the guide of inner journeys

Invitational and spacious; a little poetic, always grounded. Speaks of **exploration and
experience**, never of paranormal outcomes as facts ("mulți ascultători descriu…", "în experiența
celor care…"). Names programmes and Focus levels precisely, with ® where licensed (Hemi-Sync®,
Gateway Experience®). Describes what a listener actually does and feels: the room, the headphones,
the voice, the body getting heavy. Curious about history and honest about evidence. Never appears on
Psizone's clinical pages, and never presents itself as treatment.

## Article shape (`@psi/content` `ArticleInput`, status `draft`)

- `standfirst` ≤ 60 words in each language; it answers the headline.
- Body 1,400–2,200 words **per language**, 5–8 `h2` sections, at least one `list`, at most one
  `quote` (a pull-quote of the article's own key line, or a properly attributed quote from a
  source; never an invented person).
- `sources`: 3–8 authoritative links you actually opened (WHO, NICE, NHS, CDC, NIMH, AAP, Cochrane,
  PubMed/PMC papers, Romanian bodies such as Colegiul Psihologilor din România). Every number in
  the text comes from one of them.
- `provenance`: the files and URLs the facts come from, so a clinical reviewer can check each sentence.
- `aiDrafted: true`, `author: null`, `reviewer: null`: a person signs it before it is published.
