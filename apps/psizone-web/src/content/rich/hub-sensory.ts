import type { RichPage } from "./types";

/**
 * DRAFT — written by an AI from the old psizone.ro pages /integrare-neurosenzoriala/ and
 * /stimulare-polisenzoriala/ (read 2026-11-12), the owners' story (content/story.ts) and the
 * repo's brand docs; clinical review pending. Kept: the definition, the list of difficulties and of
 * who the programmes suit, the evaluation, the equipment list, the Snoezelen room, the team roles
 * (psychologists, psychopedagogues, occupational therapists), the signs listed by Sensory
 * Integration International. Left out on purpose: the Hemi-Sync and EQ-SYNC passages, the
 * hemisphere theory of autism, "autizare", the claim that screens cause autism, outcome claims.
 */
export const SENSORY_HUB: RichPage = {
	seoTitle: {
		ro: "Integrare senzorială pentru copii, în Galați",
		en: "Sensory integration for children in Galați",
	},
	seoDescription: {
		ro: "Integrare senzorială la copii în Galați: când sunetele, atingerile sau mișcarea devin prea mult, cum evaluăm și ce se întâmplă în sala senzorială.",
		en: "Sensory integration for children in Galați: when sounds, touch or movement become too much, how we assess, and what happens in the sensory room.",
	},
	lead: {
		ro: "Dacă strigătul uscătorului de mâini îl face pe copilul tău să-și acopere urechile sau, dimpotrivă, nu pare să simtă nimic, poate fi vorba despre cum își procesează creierul simțurile. Te ajutăm să înțelegi.",
		en: "If a hand dryer makes your child cover their ears, or, on the contrary, they seem to feel nothing at all, it may be about how their brain processes the senses. We help you understand.",
	},
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: { ro: "Ce este integrarea senzorială?", en: "What is sensory integration?" },
			paras: [
				{
					ro: "Creierul primește tot timpul informații prin simțuri: văz, auz, atingere, miros, gust, dar și poziția corpului (propriocepția) și echilibrul (sistemul vestibular). Integrarea senzorială este procesul prin care sistemul nervos le ordonează și le folosește ca să răspundă potrivit: să stai pe scaun, să prinzi o minge, să suporți zgomotul din clasă.",
					en: "The brain receives information all the time through the senses: sight, hearing, touch, smell, taste, but also body position (proprioception) and balance (the vestibular system). Sensory integration is how the nervous system sorts it and uses it to respond appropriately: to sit on a chair, to catch a ball, to put up with the noise in the classroom.",
				},
				{
					ro: "Când procesul merge greu, copilul poate reacționa prea puternic sau prea slab la ce simte. Nu e nesupunere și nu e capriciu. Corpul lui primește semnalele altfel.",
					en: "When the process goes poorly, a child may react too strongly or too weakly to what they feel. It is not disobedience and not a whim. Their body receives the signals differently.",
				},
			],
		},
		{
			kind: "for",
			id: "semne",
			h2: {
				ro: "Cum știu dacă e vorba despre procesarea senzorială?",
				en: "How do I know whether it is about sensory processing?",
			},
			paras: [
				{
					ro: "Sensory Integration International descrie, printre semnele posibile ale unei dificultăți de integrare senzorială la copii, acestea. Unele se întâlnesc la mulți copii; contează când sunt mai multe și apar constant:",
					en: "Sensory Integration International lists the following among the possible signs of a sensory integration difficulty in children. Some appear in many children; what matters is when there are several and they appear consistently:",
				},
			],
			list: [
				{
					ro: "hipersensibilitate la atingeri, mișcări, imagini sau sunete;",
					en: "oversensitivity to touch, movement, sights or sounds;",
				},
				{
					ro: "reacții slabe sau absente la atingere, mișcare, stimuli vizuali sau sunete;",
					en: "weak or missing responses to touch, movement, visual stimuli or sounds;",
				},
				{
					ro: "dificultăți de învățare sau rezultate școlare slabe;",
					en: "learning difficulties or poor school performance;",
				},
				{
					ro: "distragere ușoară și control limitat al atenției;",
					en: "easily distracted, limited control of attention;",
				},
				{
					ro: "dificultăți sociale sau emoționale;",
					en: "social or emotional difficulties;",
				},
				{
					ro: "greutate în a învăța mișcări noi;",
					en: "difficulty learning new movements;",
				},
				{
					ro: "întârzieri în exprimare, în vorbire sau în abilitățile motorii.",
					en: "delays in expression, speech or motor skills.",
				},
			],
			photo: {
				src: "/images/old-site/sensory-fibre-optics.webp",
				width: 1000,
				height: 1340,
				alt: {
					ro: "Mâna unui copil atinge fibrele optice luminate în culori diferite, într-unul dintre materialele senzoriale folosite la Psizone.",
					en: "A child's hand touches optical fibres lit in different colours, one of the sensory materials used at Psizone.",
				},
			},
		},
		{
			kind: "for",
			id: "cui-se-adreseaza",
			h2: { ro: "Cui i se potrivește?", en: "Who is it suited to?" },
			paras: [
				{
					ro: "Programele de integrare senzorială sunt utile în special pentru copiii cu întârziere în dezvoltarea globală, cu tulburare de spectru autist, cu ADHD sau dificultăți de autoreglare emoțională, cu tulburări de procesare senzorială și pentru cei cu probleme de învățare sau de limbaj. Pot apărea și dificultăți de echilibru, de coordonare și de motricitate fină.",
					en: "Sensory integration programmes are especially useful for children with global developmental delay, autism spectrum disorder, ADHD or difficulties with emotional self-regulation, sensory processing disorders, and for those with learning or language problems. Difficulties with balance, coordination and fine motor skills can also appear.",
				},
			],
		},
		{
			kind: "measured",
			id: "evaluare",
			h2: { ro: "Cum evaluăm?", en: "How do we assess?" },
			paras: [
				{
					ro: "Programul începe cu o evaluare neurosenzorială și, unde ajută, cu o hartă cerebrală QEEG. Programele sunt personalizate și intră într-un plan multidisciplinar, la care lucrează împreună psihologi, psihopedagogi și terapeuți ocupaționali cu formare specifică.",
					en: "The programme begins with a neurosensory evaluation and, where it helps, a QEEG brain map. Programmes are personalised and sit inside a multidisciplinary plan, with psychologists, psychopedagogues and occupational therapists with specific training working together.",
				},
			],
		},
		{
			kind: "where",
			id: "sala",
			h2: { ro: "Cum arată sala senzorială?", en: "What does the sensory room look like?" },
			paras: [
				{
					ro: "În cabinetul nostru am amenajat prima sală de integrare senzorială și polisenzorială din Galați. Folosim plăci vibratoare, perne instabile, trasee motorii, hamace senzoriale, tuburi luminoase, mingi de echilibru și o cameră de stimulare polisenzorială de tip Snoezelen, cu lumini, culori și proiecții.",
					en: "In our practice we fitted out Galați's first sensory and multisensory integration room. We use vibrating plates, unstable cushions, motor tracks, sensory hammocks, light tubes, balance balls and a Snoezelen-type multisensory stimulation room, with lights, colours and projections.",
				},
				{
					ro: "Am contribuit și la amenajarea sălilor de integrare neurosenzorială din două școli din oraș: „Paul Popescu Neveanu” și „Emil Gârleanu”.",
					en: "We also helped fit out the neurosensory integration rooms of two schools in the city: “Paul Popescu Neveanu” and “Emil Gârleanu”.",
				},
			],
			photo: {
				src: "/images/old-site/sensory-immersive-room.webp",
				width: 1600,
				height: 1200,
				alt: {
					ro: "Cameră de stimulare polisenzorială: pe pereți se proiectează un apus pe mare, iar în fața lor un copil stă cu brațele ridicate.",
					en: "A multisensory stimulation room: a sunset over the sea is projected on the walls, and in front of it someone stands with their arms raised.",
				},
			},
		},
		{
			kind: "session",
			id: "sedinta",
			h2: { ro: "Cum arată o ședință?", en: "What does a session look like?" },
			paras: [
				{
					ro: "Ședința e un joc cu reguli, nu o lecție: trasee de mers, de cățărat sau de echilibru, materiale cu texturi diferite, mișcări care dau corpului informații clare. Terapeutul urmărește cum răspunde copilul și ajustează intensitatea, iar copilul alege, atunci când poate, ce vrea să încerce.",
					en: "A session is a game with rules, not a lesson: paths for walking, climbing or balancing, materials with different textures, movements that give the body clear information. The therapist watches how the child responds and adjusts the intensity, and the child chooses, when they can, what to try.",
				},
				{
					ro: "Integrarea senzorială se completează, după caz, cu neurofeedback, cu terapie ABA și logopedie, cu activități motrice adaptate și cu joc dirijat. Durata și frecvența se stabilesc după evaluare.",
					en: "Sensory integration is complemented, as the case may be, with neurofeedback, ABA therapy and speech therapy, adapted motor activities and guided play. Duration and frequency are set after the evaluation.",
				},
			],
		},
		{
			kind: "for",
			id: "acasa",
			h2: { ro: "Ce poți observa și încerca acasă?", en: "What can you notice and try at home?" },
			paras: [
				{
					ro: "Notează când apar reacțiile: la ce zgomot, în ce loc, la ce oră, după ce fel de zi. Ajută și să ai un loc liniștit unde copilul se poate retrage, să-l anunți înainte de schimbări și să-i oferi pauze de mișcare. Un jurnal de câteva zile îl ajută pe terapeut mai mult decât orice chestionar.",
					en: "Write down when the reactions appear: at which noise, in which place, at what time, after what kind of day. It also helps to have a quiet place where your child can retreat, to warn them before changes and to offer movement breaks. A few days of notes help the therapist more than any questionnaire.",
				},
			],
		},
		{
			kind: "for",
			id: "aglomerat",
			h2: {
				ro: "Ce faci când copilul se prăbușește într-un loc aglomerat?",
				en: "What do you do when your child falls apart in a crowded place?",
			},
			paras: [
				{
					ro: "Un supermarket cu lumini puternice, o zi de naștere cu muzică tare: pentru un copil cu procesare senzorială sensibilă, e prea mult deodată. Nu e răsfăț. Mută-l întâi într-un loc mai liniștit, coboară vocea, ține-l aproape dacă îl liniștește atingerea fermă și abia apoi vorbește. Mai târziu, când s-a calmat, puteți vorbi despre ce a fost greu.",
					en: "A supermarket with bright lights, a birthday party with loud music: for a child with sensitive sensory processing it is too much at once. It is not spoiling. First move them somewhere quieter, lower your voice, hold them close if firm touch calms them, and only then speak. Later, when they have settled, you can talk about what was hard.",
				},
				{
					ro: "Poți să-i spui: „Era prea mult zgomot. Corpul tău a spus «destul». Data viitoare ieșim mai devreme.” Un terapeut îți poate arăta și cum să-l pregătești dinainte, ca să nu ajungă la limită.",
					en: "You can say: “There was too much noise. Your body said ‘enough’. Next time we will leave earlier.” A therapist can also show you how to prepare them beforehand, so they do not reach the limit.",
				},
			],
		},
		{
			kind: "not-for",
			id: "limite",
			h2: { ro: "Ce nu este integrarea senzorială?", en: "What sensory integration is not" },
			paras: [
				{
					ro: "Nu este un tratament pentru autism sau ADHD și nu înlocuiește consultul medical, terapia psihologică sau cea logopedică: e o parte dintr-un plan. Nu e potrivită ca singură intervenție dacă motivul real al dificultăților este altul, de aceea evaluarea vine întâi. Nu promitem rezultate sau termene.",
					en: "It is not a treatment for autism or ADHD and does not replace a medical consultation, psychological therapy or speech therapy: it is one part of a plan. It is not suitable as the only intervention if the real reason for the difficulties is something else, which is why the evaluation comes first. We promise no results or timelines.",
				},
			],
		},
	],
	faq: [
		{
			q: {
				ro: "Ce este o tulburare de procesare senzorială?",
				en: "What is a sensory processing disorder?",
			},
			a: {
				ro: "Este o dificultate a creierului de a primi, organiza și folosi potrivit informațiile de la simțuri în activitățile obișnuite. Poate însemna reacții prea intense sau prea slabe la sunete, atingeri, lumini sau mișcare.",
				en: "It is a difficulty of the brain in taking in, organising and using sensory information appropriately in everyday activities. It can mean reactions that are too intense or too weak to sounds, touch, light or movement.",
			},
		},
		{
			q: {
				ro: "Copilul meu trebuie să aibă un diagnostic ca să vină?",
				en: "Does my child need a diagnosis to come?",
			},
			a: {
				ro: "Nu. Poți veni când observi că simțurile îi pun probleme în viața de zi cu zi. Evaluarea arată dacă integrarea senzorială e direcția potrivită.",
				en: "No. You can come when you notice that the senses cause problems in daily life. The evaluation shows whether sensory integration is the right direction.",
			},
		},
		{
			q: {
				ro: "Cine lucrează cu copiii în sala senzorială?",
				en: "Who works with the children in the sensory room?",
			},
			a: {
				ro: "Intervențiile sunt coordonate de psihologi, psihopedagogi și terapeuți ocupaționali cu formare specifică, într-un plan multidisciplinar.",
				en: "Interventions are coordinated by psychologists, psychopedagogues and occupational therapists with specific training, in a multidisciplinary plan.",
			},
		},
		{
			q: {
				ro: "Ce echipamente folosiți?",
				en: "What equipment do you use?",
			},
			a: {
				ro: "Plăci vibratoare, perne instabile, trasee motorii, hamace senzoriale, tuburi luminoase, mingi de echilibru și o cameră de stimulare polisenzorială de tip Snoezelen.",
				en: "Vibrating plates, unstable cushions, motor tracks, sensory hammocks, light tubes, balance balls and a Snoezelen-type multisensory stimulation room.",
			},
		},
		{
			q: {
				ro: "Integrarea senzorială înlocuiește alte terapii?",
				en: "Does sensory integration replace other therapies?",
			},
			a: {
				ro: "Nu. Se completează cu terapie psihologică, ABA, logopedie, neurofeedback sau activități motrice adaptate, după nevoile copilului.",
				en: "No. It is combined with psychological therapy, ABA, speech therapy, neurofeedback or adapted motor activities, according to the child's needs.",
			},
		},
		{
			q: {
				ro: "Cât durează un program?",
				en: "How long does a programme last?",
			},
			a: {
				ro: "Depinde de copil și de obiective. Durata și frecvența se stabilesc după evaluare și se revizuiesc împreună cu tine.",
				en: "It depends on the child and the goals. Duration and frequency are set after the evaluation and reviewed together with you.",
			},
		},
		{
			q: {
				ro: "Poate fi doar un copil sensibil, nu o problemă?",
				en: "Could it just be a sensitive child, not a problem?",
			},
			a: {
				ro: "Poate. Sensibilitatea devine o temă pentru evaluare când apare constant, în mai multe locuri și îi încurcă somnul, mâncatul, joaca sau școala.",
				en: "Possibly. Sensitivity becomes a matter for evaluation when it is constant, shows in several places and interferes with sleep, eating, play or school.",
			},
		},
	],
	links: [
		{ label: { ro: "Autism și TSA", en: "Autism and ASD" }, href: "/copii/autism" },
		{ label: { ro: "ADHD", en: "ADHD" }, href: "/copii/adhd" },
		{
			label: {
				ro: "Metoda: integrare neurosenzorială",
				en: "The method: neurosensory integration",
			},
			href: "/metode/integrare-neurosenzoriala",
		},
	],
	nextStep: {
		ro: "Următorul pas: programează o evaluare și spune-ne ce ai observat la copilul tău.",
		en: "Next step: book an evaluation and tell us what you have noticed in your child.",
	},
};
