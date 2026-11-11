import type { Locale } from "../i18n";

/**
 * PSIZONE's story, as the owners wrote it (Romanian, verbatim, 2026-11-11). The English is a
 * translation for review. Content, not interface copy: it moves to the CMS with the rest.
 */
type Localised = Record<Locale, string>;

export interface StoryChapter {
	id: string;
	eyebrow: Localised;
	title: Localised;
	text: Localised;
	marks: ReadonlyArray<Localised>;
}

export const STORY_CHAPTERS: ReadonlyArray<StoryChapter> = [
	{
		id: "inceput",
		eyebrow: { ro: "Începutul", en: "The beginning" },
		title: { ro: "Douăsprezece ore de terapie pe zi.", en: "Twelve hours of therapy a day." },
		text: {
			ro: "Ani la rând, zilele noastre au avut câte 12 ore de terapie. Eram doar noi doi, Daniela și Adrian Turcu, psihologi și psihoterapeuți, și tot nu reușeam să ajungem la toți cei care ne căutau.",
			en: "For years, our days held twelve hours of therapy each. It was just the two of us, Daniela and Adrian Turcu, psychologists and psychotherapists, and we still could not reach everyone who came looking for us.",
		},
		marks: [{ ro: "Daniela și Adrian Turcu", en: "Daniela and Adrian Turcu" }],
	},
	{
		id: "psizone",
		eyebrow: { ro: "PSIZONE", en: "PSIZONE" },
		title: { ro: "O echipă care duce mai departe.", en: "A team to carry it further." },
		text: {
			ro: "Așa s-a născut PSIZONE: o echipă care să ducă mai departe ce făceam noi, întâi pentru copii, apoi pentru adulți și seniori.",
			en: "That is how PSIZONE was born: a team to carry on what we were doing, first for children, then for adults and seniors.",
		},
		marks: [
			{ ro: "Copii", en: "Children" },
			{ ro: "Adulți", en: "Adults" },
			{ ro: "Seniori", en: "Seniors" },
		],
	},
	{
		id: "invatare",
		eyebrow: { ro: "Peste 20 de ani", en: "Over 20 years" },
		title: {
			ro: "Când nu știam destul, am mers să învățăm.",
			en: "When we didn't know enough, we went to learn.",
		},
		text: {
			ro: "În peste 20 de ani de activitate, de fiecare dată când un caz ne arăta că nu știm destul, am mers să învățăm. Așa au venit formările și specializările, apoi metodele combinate, ca să îi vedem pe copii progresând mai repede, și neurotehnologiile.",
			en: "In over twenty years of work, every time a case showed us we didn't know enough, we went to learn. That is how the trainings and specialisations came, then the combined methods, to see children progress faster, and the neurotechnologies.",
		},
		marks: [
			{ ro: "Formări și specializări", en: "Trainings and specialisations" },
			{ ro: "Metode combinate", en: "Combined methods" },
			{ ro: "Neurotehnologii", en: "Neurotechnologies" },
		],
	},
	{
		id: "metode",
		eyebrow: { ro: "Metode proprii", en: "Our own methods" },
		title: { ro: "CRIIN și EQ-Sync.", en: "CRIIN and EQ-Sync." },
		text: {
			ro: "Din experiența și cercetările noastre s-au născut două metode proprii, brevetate: CRIIN și EQ-Sync.",
			en: "From our experience and research, two methods of our own were born, both patented: CRIIN and EQ-Sync.",
		},
		marks: [
			{ ro: "CRIIN", en: "CRIIN" },
			{ ro: "EQ-Sync", en: "EQ-Sync" },
		],
	},
	{
		id: "galati",
		eyebrow: { ro: "Galați", en: "Galați" },
		title: { ro: "Drumuri deschise în oraș.", en: "Paths opened in the city." },
		text: {
			ro: "Am înființat primul centru terapeutic din oraș și, în cabinetul nostru, prima sală de integrare senzorială și polisenzorială. Apoi am contribuit la amenajarea sălilor de integrare neurosenzorială de la școlile „Paul Popescu Neveanu” și „Emil Gârleanu”.",
			en: "We founded the city's first therapy centre and, in our practice, its first sensory and multisensory integration room. Then we helped fit out the neurosensory integration rooms at the „Paul Popescu Neveanu” and „Emil Gârleanu” schools.",
		},
		marks: [
			{ ro: "Primul centru terapeutic din Galați", en: "Galați's first therapy centre" },
			{ ro: "Prima sală de integrare senzorială", en: "The first sensory integration room" },
			{ ro: "Școala „Paul Popescu Neveanu”", en: "„Paul Popescu Neveanu” school" },
			{ ro: "Școala „Emil Gârleanu”", en: "„Emil Gârleanu” school" },
		],
	},
	{
		id: "acasa",
		eyebrow: { ro: "Acasă", en: "At home" },
		title: {
			ro: "Cea mai grea lecție a venit de acasă.",
			en: "The hardest lesson came from home.",
		},
		text: {
			ro: "Nico, băiatul nostru, a fost dintotdeauna un copil extraordinar de isteț, dar nu avea răbdare să ducă o sarcină până la capăt. Am început să aplicăm cu el programe de gestionare emoțională și comportamentală și am învățat în același timp din ambele roluri, de părinte și de psiholog.",
			en: "Nico, our son, was always an extraordinarily bright child, but he had no patience to see a task through. We began working with him on emotional and behavioural regulation, learning from both roles at once, as parents and as psychologists.",
		},
		marks: [{ ro: "Părinte și psiholog", en: "Parent and psychologist" }],
	},
	{
		id: "pista",
		eyebrow: { ro: "Pe pistă", en: "On the track" },
		title: { ro: "La 13 ani, automobilism.", en: "At 13, motor racing." },
		text: {
			ro: "La 13 ani, Nico ne-a spus că vrea să facă automobilism. A condus din prima zi, doar cu experiența simulatorului de acasă, și curând a ajuns în competițiile naționale. De data aceasta nu s-a mai plictisit.",
			en: "At thirteen, Nico told us he wanted to race cars. He drove from the first day, with only the home simulator behind him, and soon reached the national championships. This time he did not get bored.",
		},
		marks: [{ ro: "Competiții naționale", en: "National championships" }],
	},
	{
		id: "sport",
		eyebrow: { ro: "Psihologie sportivă", en: "Sport psychology" },
		title: { ro: "Cealaltă față a performanței.", en: "The other side of performance." },
		text: {
			ro: "Copiii-piloți aveau trac înaintea curselor. Ne-am specializat în psihologie sportivă și am lucrat cu Nico, apoi cu toată echipa lui, dar și cu campioni la taekwondo, tenis, karate, gimnastică și înot.",
			en: "The young drivers had stage fright before races. We specialised in sport psychology and worked with Nico, then with his whole team, and with champions in taekwondo, tennis, karate, gymnastics and swimming.",
		},
		marks: [
			{ ro: "Taekwondo", en: "Taekwondo" },
			{ ro: "Tenis", en: "Tennis" },
			{ ro: "Karate", en: "Karate" },
			{ ro: "Gimnastică", en: "Gymnastics" },
			{ ro: "Înot", en: "Swimming" },
		],
	},
	{
		id: "hockenheim",
		eyebrow: { ro: "Hockenheimring", en: "Hockenheimring" },
		title: {
			ro: "1000 de kilometri, fără nicio greșeală.",
			en: "1000 kilometres, without a single mistake.",
		},
		text: {
			ro: "Colegii lui Nico au făcut progrese extraordinare, iar el a devenit campion național. Anul acesta a ajuns la prima lui cursă internațională de anduranță: 1000 de kilometri la Hockenheimring, în Germania. A condus calm, concentrat și fără nicio greșeală.",
			en: "Nico's teammates made extraordinary progress, and he became national champion. This year he reached his first international endurance race: 1000 kilometres at the Hockenheimring, in Germany. He drove calm, focused and without a single mistake.",
		},
		marks: [
			{ ro: "Campion național", en: "National champion" },
			{ ro: "Prima cursă internațională de anduranță", en: "First international endurance race" },
		],
	},
	{
		id: "race-me-up",
		eyebrow: { ro: "Race Me Up", en: "Race Me Up" },
		title: {
			ro: "Echilibrul emoțional e temelia performanței.",
			en: "Emotional balance is the foundation of performance.",
		},
		text: {
			ro: "Ce făcuserăm pentru Nico, ca părinți și ca specialiști, puteam face și pentru alți copii și pentru părinții lor. Programul pornește de la pasiunea copiilor pentru mașini și viteză și îi duce până la performanță.",
			en: "What we had done for Nico, as parents and as specialists, we could do for other children and their parents. The programme starts from children's passion for cars and speed and takes them all the way to performance.",
		},
		marks: [{ ro: "Race Me Up", en: "Race Me Up" }],
	},
	{
		id: "astazi",
		eyebrow: { ro: "Astăzi", en: "Today" },
		title: { ro: "O echipă care lucrează ca o familie.", en: "A team that works like a family." },
		text: {
			ro: "Am fost și noi părinții care căutau cum să-și ajute copilul. Știm cât de mult contează să ai pe cineva alături, pas cu pas.",
			en: "We too were the parents searching for how to help their child. We know how much it matters to have someone beside you, step by step.",
		},
		marks: [],
	},
];

/** The whole story, paragraph by paragraph. */
export const STORY_PARAGRAPHS: ReadonlyArray<Localised> = [
	{
		ro: "Ani la rând, zilele noastre au avut câte 12 ore de terapie. Eram doar noi doi, Daniela și Adrian Turcu, psihologi și psihoterapeuți, și tot nu reușeam să ajungem la toți cei care ne căutau. Așa s-a născut PSIZONE: o echipă care să ducă mai departe ce făceam noi, întâi pentru copii, apoi pentru adulți și seniori.",
		en: "For years, our days held twelve hours of therapy each. It was just the two of us, Daniela and Adrian Turcu, psychologists and psychotherapists, and we still could not reach everyone who came looking for us. That is how PSIZONE was born: a team to carry on what we were doing, first for children, then for adults and seniors.",
	},
	{
		ro: "În peste 20 de ani de activitate, de fiecare dată când un caz ne arăta că nu știm destul, am mers să învățăm. Așa au venit formările și specializările, apoi metodele combinate, ca să îi vedem pe copii progresând mai repede, și neurotehnologiile. Din experiența și cercetările noastre s-au născut două metode proprii, brevetate: CRIIN și EQ-Sync.",
		en: "In over twenty years of work, every time a case showed us we didn't know enough, we went to learn. That is how the trainings and specialisations came, then the combined methods, to see children progress faster, and the neurotechnologies. From our experience and research, two methods of our own were born, both patented: CRIIN and EQ-Sync.",
	},
	{
		ro: "Tot așa am deschis drumuri în Galați. Am înființat primul centru terapeutic din oraș și, în cabinetul nostru, prima sală de integrare senzorială și polisenzorială. Apoi am contribuit la amenajarea sălilor de integrare neurosenzorială de la școlile „Paul Popescu Neveanu” și „Emil Gârleanu”.",
		en: "In the same way, we opened paths in Galați. We founded the city's first therapy centre and, in our practice, its first sensory and multisensory integration room. Then we helped fit out the neurosensory integration rooms at the „Paul Popescu Neveanu” and „Emil Gârleanu” schools.",
	},
	{
		ro: "Cea mai grea și mai importantă lecție a venit însă de acasă.",
		en: "The hardest and most important lesson, though, came from home.",
	},
	{
		ro: "Nico, băiatul nostru, a fost dintotdeauna un copil extraordinar de isteț. Reținea ușor tot ce se preda la școală, dar nu avea răbdare să-și facă temele sau să ducă o sarcină până la capăt. Se plictisea des și, de multe ori, în clasă devenea greu de gestionat. La fel era și cu sportul: învăța repede orice sport, ajungea la performanță, apoi renunța.",
		en: "Nico, our son, was always an extraordinarily bright child. He took in everything taught at school with ease, but had no patience for homework or for seeing a task through. He was often bored and, many times, hard to manage in class. Sport was the same: he learned any sport quickly, reached a high level, then gave it up.",
	},
	{
		ro: "Ca părinți, ne-a pus la încercare. Ca specialiști, am știut că nu ajunge să-l iubim și să-l încurajăm. Am început să aplicăm cu el programe de gestionare emoțională și comportamentală și am învățat în același timp din ambele roluri, de părinte și de psiholog. Atunci s-au pus, de fapt, bazele Race Me Up.",
		en: "As parents, he tested us. As specialists, we knew that loving and encouraging him was not enough. We began working with him on emotional and behavioural regulation, learning from both roles at once, as parents and as psychologists. That, in fact, is when the foundations of Race Me Up were laid.",
	},
	{
		ro: "La 13 ani, Nico ne-a spus că vrea să facă automobilism. A condus din prima zi, doar cu experiența simulatorului de acasă, și curând a ajuns în competițiile naționale. De data aceasta nu s-a mai plictisit.",
		en: "At thirteen, Nico told us he wanted to race cars. He drove from the first day, with only the home simulator behind him, and soon reached the national championships. This time he did not get bored.",
	},
	{
		ro: "Dar pe pistă am descoperit cealaltă față a performanței. Copiii-piloți aveau trac înaintea curselor. Unii făceau atacuri de panică, tremurau și nu mai reușeau să aducă în competiție performanța de la antrenament. Nerăbdarea și dezorganizarea îi trădau tocmai când conta mai mult. Iar nici părinții, nici antrenorul nu știau cum să le gestioneze emoțiile.",
		en: "But on the track we discovered the other side of performance. The young drivers had stage fright before races. Some had panic attacks, shook, and could no longer bring their training performance into the race. Impatience and disorganisation betrayed them exactly when it mattered most. And neither the parents nor the coach knew how to handle their emotions.",
	},
	{
		ro: "Ne-am specializat în psihologie sportivă și am lucrat cu Nico, apoi cu toată echipa lui, dar și cu campioni la taekwondo, tenis, karate, gimnastică și înot. Peste tot am văzut același lucru: sub presiunea competiției, dezechilibrul emoțional îi trăgea în jos, iar stresul ajungea la cote alarmante.",
		en: "We specialised in sport psychology and worked with Nico, then with his whole team, and with champions in taekwondo, tennis, karate, gymnastics and swimming. Everywhere we saw the same thing: under the pressure of competition, emotional imbalance dragged them down, and stress reached alarming levels.",
	},
	{
		ro: "Schimbarea s-a văzut întâi pe pistă, iar ceilalți concurenți au observat-o. Colegii lui Nico au făcut progrese extraordinare, iar el a devenit campion național. Anul acesta a ajuns la prima lui cursă internațională de anduranță: 1000 de kilometri la Hockenheimring, în Germania. Pe o vreme în care cei mai mulți piloți au avut incidente, el a condus calm, concentrat și fără nicio greșeală.",
		en: "The change showed first on the track, and the other competitors noticed it. Nico's teammates made extraordinary progress, and he became national champion. This year he reached his first international endurance race: 1000 kilometres at the Hockenheimring, in Germany. In weather that left most drivers with incidents, he drove calm, focused and without a single mistake.",
	},
	{
		ro: "Atunci am înțeles: echilibrul emoțional nu e un bonus al performanței, ci temelia ei. Iar cu cât un copil îl învață mai devreme, cu atât trece mai ușor prin adolescență.",
		en: "That is when we understood: emotional balance is not a bonus of performance, it is its foundation. And the earlier a child learns it, the more easily they pass through adolescence.",
	},
	{
		ro: "Ce făcuserăm pentru Nico, ca părinți și ca specialiști, puteam face și pentru alți copii și pentru părinții lor. Așa a apărut Race Me Up. Programul pornește de la pasiunea copiilor pentru mașini și viteză. Rolul lui este să descopere abilitățile fiecărui copil, de la orice nivel ar porni, și să le ducă până la performanță. Pe drum, copiii învață să-și stăpânească emoțiile și devin mai atenți, mai rapizi și mai răbdători.",
		en: "What we had done for Nico, as parents and as specialists, we could do for other children and their parents. That is how Race Me Up came about. The programme starts from children's passion for cars and speed. Its role is to discover each child's abilities, from whatever level they start, and take them all the way to performance. Along the way, children learn to master their emotions and become more attentive, quicker and more patient.",
	},
	{
		ro: "De mai bine de un an, mulți copii au făcut prin Race Me Up progrese remarcabile. Nu o spunem doar noi: o spun părinții lor, în feedbackul pe care ni-l dau și în mărturiile lor.",
		en: "For more than a year now, many children have made remarkable progress through Race Me Up. It isn't only us who say so: their parents say it, in the feedback they give us and in their testimonials.",
	},
	{
		ro: "Astăzi PSIZONE este o echipă care lucrează ca o familie. Am fost și noi părinții care căutau cum să-și ajute copilul. Știm cât de mult contează să ai pe cineva alături, pas cu pas. Poate de aceea părinții spun că la noi se simt „în siguranță, înțeleși și susținuți” și că „progresele se văd la fiecare pas”. Pentru că fiecare mic progres contează.",
		en: "Today PSIZONE is a team that works like a family. We too were the parents searching for how to help their child. We know how much it matters to have someone beside you, step by step. Perhaps that is why parents say that with us they feel „safe, understood and supported” and that „progress shows at every step”. Because every small step forward matters.",
	},
];

/** The line the story turns on, set apart as a pull quote. */
export const STORY_PULL_QUOTE: Localised = {
	ro: "Echilibrul emoțional nu e un bonus al performanței, ci temelia ei.",
	en: "Emotional balance is not a bonus of performance; it is its foundation.",
};
