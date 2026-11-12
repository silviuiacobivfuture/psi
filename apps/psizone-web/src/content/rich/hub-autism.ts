import type { RichPage } from "./types";

/**
 * DRAFT — written by an AI from the old psizone.ro pages /autism/, /integrare-neurosenzoriala/,
 * /plan-personalizat-de-interventie/ and the parenting-workshop post (read 2026-11-12) and the
 * repo's brand docs; clinical review pending. Kept from the old site: who the services are for,
 * the four steps of the first evaluation, the list of interventions, the QEEG/neurofeedback
 * caveat, the periodic review, the parents' role, "duration and fees are set after the
 * evaluation", the parenting workshop's objectives. Left out on purpose: the hemisphere theory
 * and "autizare" from the polysensory post, outcome lists, unattributed quotes.
 */
export const AUTISM: RichPage = {
	seoTitle: {
		ro: "Autism la copii: evaluare și terapie în Galați",
		en: "Autism in children: evaluation and therapy in Galați",
	},
	seoDescription: {
		ro: "Evaluare și plan individual pentru copii cu autism (TSA) în Galați: ce observăm, cum evaluăm, ce terapii folosim și cum te implicăm pe tine, părintele.",
		en: "Evaluation and an individual plan for children with autism (ASD) in Galați: what we look at, how we assess, which therapies we use and how you take part.",
	},
	lead: {
		ro: "Dacă ceva din felul în care se joacă, vorbește sau reacționează copilul tău te face să te întrebi, ai dreptate să întrebi. Începem cu o evaluare și cu un plan făcut pe măsura lui.",
		en: "If something in how your child plays, talks or reacts makes you wonder, you are right to ask. We start with an evaluation and a plan made to fit them.",
	},
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: { ro: "Ce înseamnă autism (TSA)?", en: "What does autism (ASD) mean?" },
			paras: [
				{
					ro: "Probabil te întrebi dacă e vina ta. Nu e. Tulburarea de spectru autist (TSA) este o diferență în felul în care creierul procesează comunicarea, relațiile și lumea simțurilor. „Spectru” înseamnă că arată foarte diferit de la un copil la altul: unii vorbesc fluent și au nevoie de sprijin în relațiile cu ceilalți, alții au nevoie de sprijin și pentru limbaj, autonomie sau reglarea emoțiilor.",
					en: "You may be wondering whether it is your fault. It is not. Autism spectrum disorder (ASD) is a difference in how the brain handles communication, relationships and the world of the senses. “Spectrum” means it looks very different from one child to another: some speak fluently and need support with friendships, others also need help with language, daily independence or managing emotions.",
				},
				{
					ro: "La Psizone lucrăm cu copii care au diagnostic de TSA, cu cei aflați în proces de evaluare și cu cei pentru care familia observă dificultăți de comunicare, interacțiune, autonomie, comportament sau procesare senzorială. Nu e nevoie de un diagnostic ca să ne suni.",
					en: "At Psizone we work with children who have an ASD diagnosis, with those going through an assessment, and with children whose families notice difficulties with communication, interaction, independence, behaviour or sensory processing. You do not need a diagnosis to call us.",
				},
			],
		},
		{
			kind: "for",
			id: "semne",
			h2: {
				ro: "Ce semne îi fac pe părinți să ceară o evaluare?",
				en: "Which signs lead parents to ask for an evaluation?",
			},
			paras: [
				{
					ro: "Niciunul dintre semnele de mai jos nu înseamnă, singur, autism. Un copil poate avea câteva și să se dezvolte firesc. Merită o discuție când sunt mai multe, se țin și te neliniștesc:",
					en: "None of the signs below means autism on its own. A child can show a few and still be developing typically. It is worth a conversation when there are several, they persist and they worry you:",
				},
			],
			list: [
				{
					ro: "limbaj care întârzie, dispare sau e folosit mai puțin pentru a comunica;",
					en: "language that is late, fades or is used less to communicate;",
				},
				{
					ro: "răspunde rar la nume, privește puțin în ochi, arată rar ce îl interesează;",
					en: "rarely responds to their name, makes little eye contact, rarely shows you what interests them;",
				},
				{
					ro: "joacă repetitivă (aliniază, învârte, repetă aceeași secvență) sau puțin joc imaginativ;",
					en: "repetitive play (lining up, spinning, repeating the same sequence) or little pretend play;",
				},
				{
					ro: "nevoie mare de rutină, supărare puternică la schimbări mici;",
					en: "a strong need for routine, deep distress at small changes;",
				},
				{
					ro: "reacții neobișnuite la sunete, atingeri, lumini, gusturi sau mișcare;",
					en: "unusual reactions to sounds, touch, light, tastes or movement;",
				},
				{
					ro: "dificultăți de autonomie sau de reglare a emoțiilor, mai mari decât la copiii de aceeași vârstă.",
					en: "difficulty with independence or emotional regulation beyond what is usual for the age.",
				},
			],
		},
		{
			kind: "measured",
			id: "evaluare",
			h2: {
				ro: "Cum arată evaluarea inițială?",
				en: "What does the first evaluation look like?",
			},
			paras: [
				{
					ro: "Evaluarea vine înaintea oricărei recomandări. Nu există un program identic pentru toți copiii, așa că întâi aflăm cine e copilul tău. Patru pași:",
					en: "The evaluation comes before any recommendation. There is no identical programme for every child, so we first find out who your child is. Four steps:",
				},
			],
			list: [
				{
					ro: "Discuția cu părinții: clarificăm istoricul, ce vă preocupă și ce e prioritar pentru voi.",
					en: "A conversation with the parents: we clarify the history, what worries you and what matters most to you.",
				},
				{
					ro: "Documentele existente: ținem cont de evaluările și recomandările pe care le aveți deja.",
					en: "Existing documents: we take into account the assessments and recommendations you already have.",
				},
				{
					ro: "Evaluarea copilului: observație și instrumente alese după vârstă și nevoi. Unde ajută, adăugăm o hartă cerebrală QEEG.",
					en: "Assessing the child: observation and instruments chosen for their age and needs. Where it helps, we add a QEEG brain map.",
				},
				{
					ro: "Recomandări și obiective: îți explicăm direcțiile de intervenție și pașii următori, pe înțeles.",
					en: "Recommendations and goals: we explain the directions for intervention and the next steps in plain words.",
				},
			],
			photo: {
				src: "/images/old-site/qeeg-room-cap.webp",
				width: 557,
				height: 388,
				alt: {
					ro: "Cabinetul de mapping cerebral de la Psizone: un copil poartă casca QEEG în fața unui specialist, un alt copil stă cu căști lângă un ursuleț de pluș, iar în colț se văd hărți cerebrale.",
					en: "The brain-mapping room at Psizone: one child wears a QEEG cap in front of a specialist, another sits with headphones beside a teddy bear, and brain maps are shown in the corner.",
				},
			},
		},
		{
			kind: "more",
			id: "interventie",
			h2: {
				ro: "Ce fel de intervenție poate urma?",
				en: "What kind of intervention can follow?",
			},
			paras: [
				{
					ro: "Programul se construiește în jurul obiectivelor copilului, nu al metodelor. Echipa și specialistul responsabil se stabilesc după evaluare, în funcție de profilul lui. Din ce avem la dispoziție, un plan poate include:",
					en: "The programme is built around the child's goals, not around methods. The team and the lead specialist are set after the evaluation, according to the child's profile. From what we have available, a plan can include:",
				},
			],
			list: [
				{
					ro: "intervenție psihologică și dezvoltarea abilităților, inclusiv terapie ABA, într-unul din cele două cabinete dedicate;",
					en: "psychological intervention and skills development, including ABA therapy, in one of our two dedicated rooms;",
				},
				{
					ro: "dezvoltarea comunicării și logopedie;",
					en: "developing communication, and speech therapy;",
				},
				{
					ro: "autonomie personală și reglare emoțională;",
					en: "personal independence and emotional regulation;",
				},
				{
					ro: "integrare senzorială, în sala amenajată pentru asta;",
					en: "sensory integration, in the room fitted out for it;",
				},
				{
					ro: "kinetoterapie, atunci când nevoile motrice o cer;",
					en: "physical therapy, when motor needs call for it;",
				},
				{
					ro: "consiliere și ghidare pentru părinți.",
					en: "counselling and guidance for parents.",
				},
			],
		},
		{
			kind: "more",
			id: "qeeg-neurofeedback",
			h2: {
				ro: "Unde se potrivesc QEEG și neurofeedbackul?",
				en: "Where do QEEG and neurofeedback fit?",
			},
			paras: [
				{
					ro: "QEEG și neurofeedbackul pot fi recomandate ca metode complementare, în anumite situații, după evaluarea individuală. Nu înlocuiesc intervențiile psihologice, educaționale sau logopedice și nu înlocuiesc recomandările medicale. Dacă nu ajută în cazul copilului tău, nu le propunem.",
					en: "QEEG and neurofeedback can be recommended as complementary methods, in some situations, after the individual evaluation. They do not replace psychological, educational or speech interventions, nor medical advice. If they would not help your child, we do not suggest them.",
				},
			],
		},
		{
			kind: "session",
			id: "sedinta",
			h2: {
				ro: "Cum arată, în linii mari, o ședință?",
				en: "What does a session look like, in broad strokes?",
			},
			paras: [
				{
					ro: "Depinde de copil, dar ideea e aceeași: un obiectiv clar, activități adaptate vârstei și joc, într-un cadru previzibil. Specialistul alege ce exersăm, iar la final îți arată ce ai putea încerca acasă, în viața de zi cu zi, ca abilitățile să nu rămână doar în cabinet.",
					en: "It depends on the child, but the idea is the same: a clear goal, activities suited to the age, and play, in a predictable setting. The specialist chooses what we practise, and at the end shows you what you could try at home, in everyday life, so the skills do not stay in the practice room.",
				},
				{
					ro: "Obiectivele sunt prioritizate după profilul copilului, nevoile familiei și felul în care participă în viața de zi cu zi. Le discutăm periodic și le schimbăm dacă strategia nu merge. Durata, frecvența și costul se stabilesc după evaluarea inițială.",
					en: "Goals are prioritised by the child's profile, the family's needs and how they take part in daily life. We review them regularly and change them if a strategy is not working. Duration, frequency and cost are set after the first evaluation.",
				},
			],
		},
		{
			kind: "for",
			id: "parinti",
			h2: { ro: "Cum te implici tu, părintele?", en: "How are you involved as a parent?" },
			paras: [
				{
					ro: "Mult, și nu din obligație: copilul exersează cel mai mult cu tine. Primești explicații și recomandări ca să susții abilitățile în contexte cotidiene. Poți să-ți spui: „Nu trebuie să fiu terapeut, trebuie să știu ce încerc și de ce.”",
					en: "A lot, and not out of duty: your child practises most with you. You get explanations and recommendations so you can support skills in everyday settings. You can tell yourself: “I do not have to be the therapist, I have to know what I am trying and why.”",
				},
				{
					ro: "Am organizat și un workshop de parenting pentru părinții copiilor cu tulburări pervazive de dezvoltare: relația părinte-copil, tehnici cognitiv-comportamentale în educație, gestionarea comportamentelor dificile, comunicare funcțională și reguli în familie, prin prezentări, exerciții practice, studii de caz și discuții în grup. Întreabă-ne dacă se reia.",
					en: "We have also run a parenting workshop for parents of children with pervasive developmental disorders: the parent-child relationship, cognitive-behavioural techniques in everyday parenting, handling difficult behaviour, functional communication and family rules, through presentations, practical exercises, case studies and group discussion. Ask us whether it is running again.",
				},
			],
		},
		{
			kind: "not-for",
			id: "limite",
			h2: {
				ro: "Ce nu face și ce nu promite evaluarea noastră?",
				en: "What does our evaluation not do, and not promise?",
			},
			paras: [
				{
					ro: "Evaluarea psihologică nu înlocuiește consultul medical. Un diagnostic medical de TSA îl pune un medic specialist, iar când e cazul te îndrumăm spre el. Nu promitem vindecare sau un termen: autismul nu e o boală de „vindecat”, iar progresul diferă de la un copil la altul. Promitem un plan clar, măsurat periodic.",
					en: "A psychological evaluation does not replace a medical consultation. A medical diagnosis of ASD is made by a specialist doctor, and when needed we point you towards one. We do not promise a cure or a timeline: autism is not an illness to be “cured”, and progress differs from child to child. We promise a clear plan, reviewed at regular intervals.",
				},
				{
					ro: "Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
					en: "If you or someone close to you is in immediate danger, call 112.",
				},
			],
		},
	],
	faq: [
		{
			q: {
				ro: "Am nevoie de un diagnostic înainte de prima programare?",
				en: "Do I need a diagnosis before the first appointment?",
			},
			a: {
				ro: "Nu. Ne poți contacta și când ai doar întrebări despre dezvoltarea copilului. Tipul de evaluare și pașii potriviți îi clarificăm în prima discuție.",
				en: "No. You can contact us when you only have questions about your child's development. We clarify the type of evaluation and the right steps in the first conversation.",
			},
		},
		{
			q: {
				ro: "Programul e același pentru toți copiii?",
				en: "Is the programme the same for every child?",
			},
			a: {
				ro: "Nu. Obiectivele și intervențiile se stabilesc individual, după evaluare, și se pot ajusta pe parcurs.",
				en: "No. Goals and interventions are set individually after the evaluation, and can be adjusted along the way.",
			},
		},
		{
			q: { ro: "Cât durează intervenția?", en: "How long does the intervention last?" },
			a: {
				ro: "Depinde de profilul copilului, de obiective și de felul în care răspunde. O estimare responsabilă se poate face abia după evaluare, de aceea nu dăm termene la telefon.",
				en: "It depends on the child's profile, the goals and how they respond. A responsible estimate is only possible after the evaluation, which is why we do not quote timelines over the phone.",
			},
		},
		{
			q: { ro: "Sunt implicați și părinții?", en: "Are parents involved too?" },
			a: {
				ro: "Da. Colaborarea cu familia ajută strategiile să funcționeze și progresul să se vadă în viața de zi cu zi. Primești explicații și recomandări concrete.",
				en: "Yes. Working with the family helps strategies work and progress show in everyday life. You get explanations and concrete recommendations.",
			},
		},
		{
			q: {
				ro: "Neurofeedbackul înlocuiește terapia?",
				en: "Does neurofeedback replace therapy?",
			},
			a: {
				ro: "Nu. Poate fi recomandat doar ca metodă complementară și nu înlocuiește intervențiile psihologice, educaționale, logopedice sau recomandările medicale.",
				en: "No. It can only be recommended as a complementary method, and it does not replace psychological, educational or speech interventions, or medical advice.",
			},
		},
		{
			q: {
				ro: "Cine lucrează cu copilul meu?",
				en: "Who will work with my child?",
			},
			a: {
				ro: "Echipa se stabilește după evaluare, în funcție de profilul copilului, iar specialistul responsabil ți-l spunem atunci. Formările și rolurile specialiștilor sunt pe pagina echipei.",
				en: "The team is set after the evaluation, according to your child's profile, and we tell you who the lead specialist is at that point. Specialists' training and roles are on the team page.",
			},
		},
		{
			q: {
				ro: "Cât costă?",
				en: "How much does it cost?",
			},
			a: {
				ro: "Costul depinde de nevoile copilului și de serviciile din plan, deci îl stabilim după evaluarea inițială. Pentru informații actuale despre tarife și disponibilitate, sună-ne sau scrie-ne.",
				en: "The cost depends on the child's needs and the services in the plan, so we set it after the first evaluation. For up-to-date information on fees and availability, call or write to us.",
			},
		},
	],
	links: [
		{
			label: { ro: "Integrare senzorială", en: "Sensory integration" },
			href: "/copii/integrare-senzoriala",
		},
		{ label: { ro: "Logopedie", en: "Speech therapy" }, href: "/copii/logopedie" },
		{ label: { ro: "Echipa Psizone", en: "The Psizone team" }, href: "/echipa" },
		{
			label: { ro: "Prima vizită, pas cu pas", en: "The first visit, step by step" },
			href: "/prima-vizita",
		},
	],
	nextStep: {
		ro: "Următorul pas: programează o evaluare. Prima discuție e despre voi, nu despre diagnostic.",
		en: "Next step: book an evaluation. The first conversation is about you, not about a diagnosis.",
	},
};
