import type { RichPage } from "./types";

/**
 * DRAFT — written by an AI from the old psizone.ro home page card "Logopedie și autonomie"
 * ("Obiectivele sunt stabilite individual, în funcție de evaluare și de nevoile copilului") and the
 * concept page (two speech-therapy rooms), read 2026-11-12. That is ALL the old site says about
 * speech therapy: no evaluation steps, no methods, no named speech therapist. Everything else here
 * is general, non-diagnostic information, kept cautious on purpose; what the owners must still
 * supply (who does the evaluation, tools, ages, how often) is said plainly as "stabilim la
 * evaluare". Clinical review pending.
 */
export const SPEECH: RichPage = {
	seoTitle: {
		ro: "Logopedie pentru copii în Galați: evaluare",
		en: "Speech therapy for children in Galați",
	},
	seoDescription: {
		ro: "Logopedie pentru copii în Galați: când să te îngrijoreze că cel mic nu vorbește, ce urmărim la evaluare și cum se stabilesc obiectivele terapiei.",
		en: "Speech therapy for children in Galați: when to worry that your little one is not talking, what we look at in an evaluation and how therapy goals are set.",
	},
	lead: {
		ro: "Copilul tău nu vorbește încă, vorbește greu sau nu-l înțelege nimeni în afară de tine? Începem cu o evaluare, iar obiectivele terapiei le stabilim după ea, pe nevoile lui.",
		en: "Your child is not talking yet, talks with difficulty or is understood by nobody but you? We start with an evaluation, and set therapy goals after it, on their needs.",
	},
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: { ro: "Ce este logopedia?", en: "What is speech therapy?" },
			paras: [
				{
					ro: "Logopedia ajută copiii să înțeleagă și să folosească limbajul: să pronunțe sunetele, să construiască propoziții, să povestească, să citească și să scrie atunci când e cazul. Vorbirea e doar o parte. La fel de importante sunt înțelegerea a ceea ce se spune, dorința de a comunica și felul în care copilul interacționează.",
					en: "Speech therapy helps children understand and use language: to pronounce sounds, build sentences, tell a story and, when it applies, to read and write. Speaking is only part of it. Just as important are understanding what is said, wanting to communicate and the way a child interacts.",
				},
				{
					ro: "La Psizone avem două cabinete de logopedie. Obiectivele sunt stabilite individual, în funcție de evaluare și de nevoile copilului, iar terapia face parte, când e cazul, din planul unic al copilului, alături de alte intervenții.",
					en: "At Psizone we have two speech therapy rooms. Goals are set individually, according to the evaluation and the child's needs, and therapy is, when relevant, part of the child's single plan alongside other interventions.",
				},
			],
		},
		{
			kind: "for",
			id: "cand-sa-te-ingrijoreze",
			h2: {
				ro: "Când să te îngrijoreze că cel mic nu vorbește?",
				en: "When should you worry that your little one is not talking?",
			},
			paras: [
				{
					ro: "Copiii se dezvoltă în ritmuri diferite. Mulți spun primele cuvinte în jurul vârstei de un an și încep să le lege două câte două în jurul a doi ani, dar nu e un test, iar un decalaj mic nu înseamnă o problemă. Merită o discuție cu un specialist dacă:",
					en: "Children develop at different paces. Many say their first words around the age of one and start joining two together around two, but this is not a test, and a small gap does not mean a problem. It is worth talking to a specialist if:",
				},
			],
			list: [
				{
					ro: "nu răspunde când e strigat pe nume sau nu pare să înțeleagă ce i se spune;",
					en: "they do not respond when called by name or do not seem to understand what is said to them;",
				},
				{
					ro: "nu arată cu degetul, nu face gesturi și nu încearcă să-ți atragă atenția;",
					en: "they do not point, do not gesture and do not try to get your attention;",
				},
				{
					ro: "a avut cuvinte și le-a pierdut;",
					en: "they had words and lost them;",
				},
				{
					ro: "vorbește, dar sunetele sunt atât de schimbate încât nu-l înțelege nimeni în afară de familie, la o vârstă la care colegii lui sunt înțeleși;",
					en: "they talk, but the sounds are so altered that nobody but the family understands them, at an age when their peers are understood;",
				},
				{
					ro: "se blochează, repetă sunete sau cuvinte și se supără din cauza asta;",
					en: "they get stuck, repeat sounds or words and become upset about it;",
				},
				{
					ro: "îți faci griji pentru auzul lui, de exemplu după multe otite.",
					en: "you are worried about their hearing, for example after many ear infections.",
				},
			],
		},
		{
			kind: "measured",
			id: "evaluare",
			h2: { ro: "Cum decurge evaluarea?", en: "How does the evaluation go?" },
			paras: [
				{
					ro: "Pornim de la o discuție cu tine: cum a decurs dezvoltarea, ce vezi acasă, ce te îngrijorează. Urmează observarea copilului în joc, pentru că jocul arată cum înțelege, cum comunică și ce încearcă să spună. Instrumentele concrete le alege specialistul după vârsta și nevoile copilului.",
					en: "We start from a conversation with you: how development has gone, what you see at home, what worries you. Next we watch the child at play, because play shows how they understand, how they communicate and what they try to say. The specialist chooses the specific instruments for the child's age and needs.",
				},
				{
					ro: "Dacă e cazul, te sfătuim să faci și un control de auz sau un consult medical înainte de a începe terapia: limbajul întârzie uneori din motive pe care logopedul nu le poate trata. La final primești explicații clare și obiective de lucru.",
					en: "If necessary, we advise you to have a hearing check or a medical consultation before therapy begins: language sometimes lags for reasons a speech therapist cannot treat. At the end you receive clear explanations and working goals.",
				},
			],
		},
		{
			kind: "more",
			id: "terapie",
			h2: { ro: "Cum stabilim obiectivele terapiei?", en: "How do we set therapy goals?" },
			paras: [
				{
					ro: "Obiectivele pornesc de la ce poate copilul acum și de la ce are nevoie ca să participe mai bine în viața de zi cu zi: să-și ceară ce vrea, să se facă înțeles la grădiniță, să pronunțe corect, să înțeleagă instrucțiuni. Le formulăm simplu, ca să le poți urmări și tu.",
					en: "Goals start from what the child can do now and what they need to take part better in daily life: asking for what they want, making themselves understood at nursery, pronouncing correctly, following instructions. We word them simply, so you can follow them too.",
				},
				{
					ro: "Pentru un copil cu autism sau cu dificultăți senzoriale, logopedia se leagă de restul planului: comunicarea, autonomia și reglarea emoțiilor se lucrează împreună. Pentru un copil care are doar o dificultate de pronunție, planul poate fi mai scurt și mai concentrat.",
					en: "For a child with autism or sensory difficulties, speech therapy is tied to the rest of the plan: communication, independence and emotional regulation are worked on together. For a child with only a pronunciation difficulty, the plan can be shorter and more focused.",
				},
			],
		},
		{
			kind: "session",
			id: "sedinta",
			h2: { ro: "Cum arată o ședință?", en: "What does a session look like?" },
			paras: [
				{
					ro: "Pentru un copil mic, ședința e joc: cărți, jucării, cântece, imagini, exerciții de suflat sau de mișcare a limbii, făcute ca joc. Pentru unul mai mare, exercițiile sunt mai structurate. Specialistul îți arată ce poți exersa acasă, în rutina zilei, câteva minute, fără să transformi casa într-o sală de clasă.",
					en: "For a small child a session is play: books, toys, songs, pictures, blowing or tongue-movement exercises, done as games. For an older child the exercises are more structured. The specialist shows you what you can practise at home, in the daily routine, for a few minutes, without turning the house into a classroom.",
				},
				{
					ro: "Durata și frecvența ședințelor se stabilesc după evaluare. Reevaluăm periodic și îți spunem ce s-a schimbat.",
					en: "The length and frequency of sessions are set after the evaluation. We reassess regularly and tell you what has changed.",
				},
			],
		},
		{
			kind: "for",
			id: "acasa",
			h2: { ro: "Ce poți face acasă, de azi?", en: "What can you do at home, starting today?" },
			paras: [
				{
					ro: "Vorbește cu el despre ce faceți, în propoziții scurte: „Îți pun pantofii. Unul, doi.” Citiți împreună, chiar dacă el doar răsfoiește. Dă-i timp să răspundă înainte să completezi tu. Dacă greșește un sunet, repetă cuvântul corect, fără să-l corectezi apăsat. Limitează ecranele cât stai cu el, ca să existe loc pentru conversație.",
					en: "Talk to them about what you are doing, in short sentences: “I am putting on your shoes. One, two.” Read together, even if they only flip the pages. Give them time to answer before you fill in. If they get a sound wrong, repeat the word correctly without correcting heavily. Limit screens while you are with them, to leave room for conversation.",
				},
			],
		},
		{
			kind: "more",
			id: "cine-ajuta",
			h2: { ro: "Cine mai contează în poveste?", en: "Who else matters in the story?" },
			paras: [
				{
					ro: "Limbajul se dezvoltă în viața de zi cu zi, nu doar în cabinet. De aceea contează și grădinița sau școala, bunicii care îl îngrijesc și medicul de familie sau pediatrul. Când ești de acord, putem discuta cu ei ce observă și ce merită încercat, ca toți cei din jurul copilului să-i vorbească într-un fel asemănător.",
					en: "Language grows in everyday life, not only in the practice room. That is why the nursery or school matters, along with the grandparents who care for them and the family doctor or paediatrician. When you agree, we can discuss with them what they see and what is worth trying, so everyone around the child talks to them in a similar way.",
				},
			],
		},
		{
			kind: "not-for",
			id: "limite",
			h2: {
				ro: "Ce nu face logopedia și ce nu promitem?",
				en: "What speech therapy does not do, and what we do not promise",
			},
			paras: [
				{
					ro: "Logopedia nu înlocuiește un control medical când există un motiv de îngrijorare pentru auz, dezvoltare sau neurologic, și nu e un înlocuitor pentru ședințele cu el acasă. Nu promitem că un copil va vorbi până la o anumită vârstă și nu comparăm copiii între ei. Promitem o evaluare atentă, obiective clare și o reevaluare cinstită.",
					en: "Speech therapy does not replace a medical check when there is a reason to worry about hearing, development or neurology, and it is no substitute for time spent talking with them at home. We do not promise that a child will speak by a given age, and we do not compare children with each other. We promise a careful evaluation, clear goals and an honest re-evaluation.",
				},
			],
		},
	],
	faq: [
		{
			q: {
				ro: "La ce vârstă ar trebui să mă duc la logoped?",
				en: "At what age should I see a speech therapist?",
			},
			a: {
				ro: "Poți cere o evaluare oricând te îngrijorează comunicarea copilului, chiar foarte devreme. Nu trebuie să aștepți „să crească”: dacă totul e în regulă, afli asta, iar dacă nu, câștigi timp.",
				en: "You can ask for an evaluation whenever your child's communication worries you, even very early. You do not have to wait for them to “grow out of it”: if everything is fine you find that out, and if not, you save time.",
			},
		},
		{
			q: {
				ro: "Este nevoie de un diagnostic sau de o trimitere?",
				en: "Do I need a diagnosis or a referral?",
			},
			a: {
				ro: "Poți contacta centrul și atunci când ai doar îngrijorări. Dacă evaluarea arată că e nevoie de un consult medical, te îndrumăm.",
				en: "You can contact the centre when you only have worries. If the evaluation shows that a medical consultation is needed, we point you towards one.",
			},
		},
		{
			q: {
				ro: "Ce se întâmplă la prima ședință?",
				en: "What happens at the first session?",
			},
			a: {
				ro: "Vorbim cu tine despre dezvoltarea copilului, apoi îl observăm în joc. La final primești explicații și obiective de lucru, pe înțeles.",
				en: "We talk to you about your child's development, then watch them at play. At the end you receive explanations and working goals, in plain words.",
			},
		},
		{
			q: {
				ro: "Cum aleg între logopedie și alte terapii?",
				en: "How do I choose between speech therapy and other therapies?",
			},
			a: {
				ro: "Nu trebuie să alegi tu. După evaluare construim un singur plan, cu specialiștii potriviți. Pentru unii copii e doar logopedie, pentru alții e împreună cu ABA, integrare senzorială sau terapie psihologică.",
				en: "You do not have to choose. After the evaluation we build one plan, with the right specialists. For some children it is speech therapy alone, for others it goes together with ABA, sensory integration or psychological therapy.",
			},
		},
		{
			q: {
				ro: "Cât durează terapia?",
				en: "How long does therapy take?",
			},
			a: {
				ro: "Depinde de copil și de obiectivele din evaluare. Nu dăm termene la telefon; după evaluare îți spunem ce estimăm și revizuim împreună pe parcurs.",
				en: "It depends on the child and the goals from the evaluation. We do not give timelines over the phone; after the evaluation we tell you what we estimate and review it together along the way.",
			},
		},
		{
			q: {
				ro: "Pot lucra și eu acasă cu copilul?",
				en: "Can I work with my child at home too?",
			},
			a: {
				ro: "Da, și e important. Specialistul îți arată exerciții scurte care se potrivesc în rutina zilei, ca progresul să nu rămână doar în cabinet.",
				en: "Yes, and it matters. The specialist shows you short exercises that fit into the daily routine, so progress does not stay only in the practice room.",
			},
		},
	],
	links: [
		{ label: { ro: "Autism și TSA", en: "Autism and ASD" }, href: "/copii/autism" },
		{
			label: { ro: "Integrare senzorială", en: "Sensory integration" },
			href: "/copii/integrare-senzoriala",
		},
		{
			label: { ro: "Metoda: logopedie", en: "The method: speech therapy" },
			href: "/metode/logopedie",
		},
	],
	nextStep: {
		ro: "Următorul pas: programează o evaluare și spune-ne ce ai observat la felul în care vorbește copilul tău.",
		en: "Next step: book an evaluation and tell us what you have noticed in how your child talks.",
	},
};
