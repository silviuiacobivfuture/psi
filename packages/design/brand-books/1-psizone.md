# Psizone

The neuro-psychology centre in Galați: evaluation, ABA, speech therapy, sensory integration, psychotherapy, QEEG, neurofeedback and TMS for children, teens and adults. The identity is **organic futurism in gold and white** (owner, 2026-11-11): calm, luminous and human, with technology felt rather than shown. Gold is the light, white the ground, turquoise the second voice. The promise is **"Vezi schimbarea."** (See the change): we map, we treat, we show you the progress.

Themes: `psizone-light` ("Gold", primary) and `psizone-dark` ("Night"). Design in Gold first: warm white ground, gold and turquoise light; Night is the same palette on warm black.

## Who it speaks to

A worried parent first, a tired adult second, a referring doctor third. They arrive anxious and need to feel, within one screen, that this place is competent, kind and clear about the next step.

## Voice

- Warm, direct, plain. "Spune-ne ce te îngrijorează." Use "noi" for the team.
- Short on the landing site (a headline, one sentence, one action); depth lives in hubs, articles and the AI guide.
- Show the process and the measurement, not the machine: "Facem o hartă cerebrală, apoi îți arătăm ce s-a schimbat."
- The AI is "ghidul Psizone", never "chatbot" or "AI".
- Words to avoid: revoluționar, miraculos, vindecare garantată, cele mai avansate.

Real lines:
- Hero: "Vezi schimbarea." / "Evaluăm, intervenim și îți arătăm progresul."
- Ask bar: "Întreabă-ne orice despre copilul tău…"
- Primary action: "Programează evaluarea"
- Reassurance: "Prima discuție e despre voi, nu despre diagnostic."

## Colour

- Ground `bg` warm beige (`#F4EEE2`; owner 2026-11-11: day mode must not scream) with deeper beige washes (`surface-2`); solid cards on cream `surface-1` (`#FAF6EE`). Night: warm black.
- **Gold is the brand.** `accent` is a gold pill with dark ink text (`on-accent`), for the one primary action. `glow-1` is the deep, text-safe gold: the only glow used as text (one word of a headline, links), never blurred into the background in Gold, where it turns khaki; the light in Gold comes from the luminous golds (`glow-3` champagne, the `accent`) and turquoise.
- **Turquoise is the second voice:** `glow-2` for the guide (its tint `ai-soft`, its orb) and the focus ring.
- Rotate gold, turquoise, champagne across hub cards (1, 2, 3).
- **Flat** (owner, 2026-11-11): Psizone wears the flat finish (`data-finish="flat"`): no gradients, glare, glows, blur or grain; solid surfaces, hairline borders, solid circles. The gold is a deep antique gold (`#A97B24`), never yellow. **AI input is the one element that glows (owner, 2026-11-12):** the compass capsule and the pages' own ask boxes carry a slow turning ring and a soft breathing halo in turquoise (`glow-2`), champagne (`glow-3`) and the accent, still under reduced motion; nothing else glows.
- Every text and control pair is checked against WCAG AA in both themes (the contrast table is regenerated from `tokens.json`).

## Type

Fraunces for display and headlines, light weights (300–420), SOFT 100. Manrope for everything else. Mono only for numbers and measurements (QEEG bands, session times).

## Ambient

Three soft aurora orbs drifting on 22–30 s loops behind the hero and the AI guide. It should feel like breathing, not like a screensaver.

## Imagery

- Real rooms in daylight, real (consenting) people: hands, play materials, the EEG cap on a calm child, a parent's face listening.
- Grade photos slightly warm with lifted blacks so they sit inside the palette.
- Data as art: QEEG maps and the `ProgressSignal` line in brand hues.
- Never: stock brains, galaxies, glowing neurons, children crying, clinical corridors.

## Signature components

`AmbientField`, `AskBar` + `GuideMessage` (the AI guide), `HubCard` (condition hubs), `ProgressSignal` (the promise made visible), `PractitionerCard`, `NavBar`.

## Do and don't

| Do | Don't |
| --- | --- |
| One idea per screen, lots of space | Paragraphs on the landing site |
| Lead with the child's or adult's outcome | Lead with the equipment |
| Name the specialist and the method | Promise cures or timelines |
| Show prices or ranges | Hide everything behind "sunați-ne" |
| Keep Hemi-Sync and EQ-SYNC in their own themes | Mix their imagery into clinical pages |
