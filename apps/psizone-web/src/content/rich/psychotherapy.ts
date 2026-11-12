import type { RichPage } from "./types";

// Sources and review status: see methods-therapies.ts.

const EMERGENCY = {
	ro: "Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
	en: "If you or someone close to you is in immediate danger, call 112.",
} as const;

export const PSIHOTERAPIE: RichPage = {
	seoTitle: {
		ro: "Psihoterapie în Galați: CBT, cuplu, familie, hipnoză",
		en: "Psychotherapy in Galați: CBT, couples, hypnosis",
	},
	seoDescription: {
		ro: "Psihoterapie la Psizone, Galați: terapie cognitiv-comportamentală, individuală, de cuplu și familie, hipnoză clinică. Cum decurge și cui i se potrivește.",
		en: "Psychotherapy at Psizone in Galați: cognitive behavioural, individual, couples and family therapy, clinical hypnosis. How it runs and who it suits.",
	},
	lead: {
		ro: "Psihoterapia este terapie prin dialog. Începe cu o evaluare, are obiective pe care le alegi și tu și se măsoară în timp, nu din impresie.",
		en: "Psychotherapy is talking therapy. It begins with an evaluation, has goals you help choose, and is measured over time rather than by impression.",
	},
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: {
				ro: "Ce este psihoterapia și ce forme are la Psizone?",
				en: "What is psychotherapy, and which forms do we offer?",
			},
			paras: [
				{
					ro: "Psihoterapia este o formă de intervenție psihologică în care lucrezi cu un psiholog, prin conversație și exerciții, la ceva care te doare sau te încurcă: anxietate, tristețe, epuizare, certuri care se repetă, un copil care are nevoie de sprijin. Nu înseamnă sfaturi, ci un proces în care înțelegi ce se întâmplă și încerci altceva.",
					en: "Psychotherapy is a form of psychological intervention in which you work with a psychologist, through conversation and exercises, on something that hurts or gets in your way: anxiety, sadness, exhaustion, arguments that keep coming back, a child who needs support. It does not mean advice, but a process in which you understand what is happening and try something different.",
				},
				{
					ro: "Lucrăm în patru direcții, care se pot și combina:",
					en: "We work in four directions, which can also be combined:",
				},
			],
			list: [
				{
					ro: "Terapie cognitiv-comportamentală (CBT): legătura dintre ce gândești, ce simți și ce faci, cu obiective clare și exerciții între ședințe.",
					en: "Cognitive behavioural therapy (CBT): the link between what you think, what you feel and what you do, with clear goals and exercises between sessions.",
				},
				{
					ro: "Terapie individuală: lucrezi unu-la-unu cu un psiholog, de la o evaluare detaliată la obiective și monitorizarea progresului.",
					en: "Individual therapy: you work one to one with a psychologist, from a detailed evaluation to goals and monitoring of progress.",
				},
				{
					ro: "Terapie de cuplu și de familie: ședințe cu doi sau mai mulți membri, pentru comunicare, conflicte și reconectare.",
					en: "Couples and family therapy: sessions with two or more members, for communication, conflict and reconnection.",
				},
				{
					ro: "Hipnoză clinică: relaxare profundă și concentrare interioară, făcută de psihologi formați în hipnoterapie clinică.",
					en: "Clinical hypnosis: deep relaxation and inward focus, carried out by psychologists trained in clinical hypnotherapy.",
				},
			],
		},
		{
			kind: "session",
			id: "cum-decurge",
			h2: {
				ro: "Cum decurge psihoterapia, pas cu pas?",
				en: "How does psychotherapy go, step by step?",
			},
			paras: [
				{
					ro: "Parcursul este asemănător în toate formele, cu diferențe de ritm și de metodă:",
					en: "The route is similar in all forms, with differences in pace and method:",
				},
			],
			list: [
				{
					ro: "Evaluare inițială: povestești ce se întâmplă și ce ți-ai dori să se schimbe. Psihologul pune întrebări și, unde este cazul, folosește instrumente de evaluare.",
					en: "Initial evaluation: you describe what is going on and what you would like to change. The psychologist asks questions and, where relevant, uses assessment instruments.",
				},
				{
					ro: "Obiective: stabilim împreună ce urmărim, în cuvinte pe care le poți verifica.",
					en: "Goals: together we set what we are aiming for, in words you can check.",
				},
				{
					ro: "Ședințele: aplicăm tehnici validate științific, adaptate ție. În CBT primești și exerciții de făcut între întâlniri.",
					en: "Sessions: we apply scientifically validated techniques, adapted to you. In CBT you also get exercises to do between meetings.",
				},
				{
					ro: "Monitorizare: la intervale pe care le stabilim, revenim la obiective și vedem ce s-a schimbat.",
					en: "Monitoring: at intervals we agree, we return to the goals and see what has changed.",
				},
			],
			ordered: true,
		},
		{
			kind: "more",
			id: "forme",
			h2: {
				ro: "Cum arată concret cuplul, familia și hipnoza?",
				en: "What do couples, family and hypnosis look like in practice?",
			},
			paras: [
				{
					ro: "În terapia de cuplu și de familie, psihologul ajută la comunicare, la reglarea emoțiilor și la schimbare, iar tu primești instrumente practice pentru acasă. Metodele includ terapia sistemică de familie, terapia de cuplu centrată pe emoții, intervenții cognitiv-comportamentale, comunicarea nonviolentă, exerciții de co-reglare emoțională și mindfulness. Temele pot fi conflictele frecvente, distanța, încrederea, parenting-ul, un divorț sau un copil cu nevoi speciale.",
					en: "In couples and family therapy, the psychologist helps with communication, emotional regulation and change, and you receive practical tools for home. Methods include systemic family therapy, emotionally focused couples therapy, cognitive behavioural interventions, nonviolent communication, emotional co-regulation exercises and mindfulness. Topics can include frequent conflict, distance, trust, parenting, a divorce or a child with special needs.",
				},
				{
					ro: "În hipnoza clinică rămâi conștient pe tot parcursul și îți păstrezi controlul. Psihologul te ghidează spre relaxare și concentrare interioară, folosește sugestii, imagini mentale sau metafore, și la final revii treptat și discutați ce s-a întâmplat. Printre metode sunt inducția blândă, hipnoza ericksoniană și vizualizarea ghidată; opțional, poți primi o înregistrare personalizată pentru acasă.",
					en: "In clinical hypnosis you stay conscious throughout and keep control. The psychologist guides you towards relaxation and inward focus, uses suggestions, mental images or metaphors, and at the end you return gradually and discuss what happened. Methods include gentle induction, Ericksonian hypnosis and guided visualisation; optionally, you can receive a personalised recording to listen to at home.",
				},
				{
					ro: "Pentru adolescenți, psihoterapia poate include CBT, sprijin și explorarea identității, mindfulness și autoreglare, cu implicarea ghidată a părinților. Există și ateliere de grup de dezvoltare personală, pe comunicare, leadership și autocunoaștere.",
					en: "For teenagers, psychotherapy can include CBT, supportive work and identity exploration, mindfulness and self-regulation, with guided involvement of the parents. There are also personal development group workshops on communication, leadership and self-knowledge.",
				},
			],
		},
		{
			kind: "measured",
			id: "progres",
			h2: {
				ro: "Ce măsurăm și cum vezi progresul?",
				en: "What do we measure, and how do you see progress?",
			},
			paras: [
				{
					ro: "Măsurăm raportat la ce ți-ai propus. Evaluarea de la început și obiectivele scrise sunt reperul, iar monitorizarea înseamnă să ne uităm periodic la ele. Poți vedea progresul în ce faci diferit, în cât de des apar problemele și în cât de mult te mai încurcă. La nevoie, adăugăm instrumente standardizate, pe care ți le explicăm.",
					en: "We measure against what you set out to do. The starting evaluation and the written goals are the reference, and monitoring means looking at them regularly. You can see progress in what you do differently, in how often the problems appear and in how much they still get in your way. When needed, we add standardised instruments, which we explain to you.",
				},
				{
					ro: "Nu promitem un rezultat sau un termen. Promitem că vei ști, la fiecare etapă, ce urmărim și ce s-a întâmplat.",
					en: "We do not promise a result or a timescale. We promise that at each stage you will know what we are aiming for and what has happened.",
				},
			],
		},
		{
			kind: "for",
			id: "pentru-cine",
			h2: {
				ro: "Pentru cine poate fi potrivită psihoterapia?",
				en: "Who might psychotherapy suit?",
			},
			paras: [
				{
					ro: "Pentru adulți care trăiesc anxietate, depresie, stres cronic, epuizare, tulburări de somn, lipsă de motivație sau senzația că nu mai fac față. Pentru cupluri cu conflicte, distanțare sau dificultăți de comunicare. Pentru familii în care un copil sau un adolescent trece prin ceva dificil. Pentru adolescenți cu anxietate de performanță sau socială, probleme de somn ori de alimentație, dificultăți de comunicare cu părinții sau cu profesorii, sau cu un telefon care ocupă prea mult loc.",
					en: "For adults living with anxiety, depression, chronic stress, burnout, sleep problems, lack of motivation or a sense of no longer coping. For couples with conflict, distance or communication difficulties. For families in which a child or teenager is going through something difficult. For teenagers with performance or social anxiety, sleep or eating problems, difficulty talking with parents or teachers, or a phone that takes up too much room.",
				},
			],
		},
		{
			kind: "not-for",
			id: "pentru-cine-nu",
			h2: {
				ro: "Pentru cine nu este potrivită sau nu este de ajuns?",
				en: "Who is it not for, or not enough for?",
			},
			paras: [
				{
					ro: "Psihoterapia nu înlocuiește îngrijirea medicală sau psihiatrică. Dacă ai nevoie de un diagnostic psihiatric sau de medicație, vorbești cu medicul psihiatru; noi nu dăm sfaturi despre medicamente. Nu este un serviciu pentru urgențe.",
					en: "Psychotherapy does not replace medical or psychiatric care. If you need a psychiatric diagnosis or medication, you speak to a psychiatrist; we do not give advice about medicines. It is not a service for emergencies.",
				},
				{
					ro: "Dacă după evaluare o anumită formă nu pare potrivită pentru tine acum, îți spunem și propunem altceva. Hipnoza clinică nu se oferă în locul unei evaluări: psihologul hotărăște la prima întâlnire dacă se potrivește situației tale.",
					en: "If after the evaluation a particular form does not seem right for you now, we will say so and suggest something else. Clinical hypnosis is not offered in place of an evaluation: the psychologist decides at the first meeting whether it fits your situation.",
				},
				EMERGENCY,
			],
		},
		{
			kind: "duration",
			id: "cat-dureaza",
			h2: {
				ro: "Cât durează o ședință și cât de des?",
				en: "How long is a session, and how often?",
			},
			paras: [
				{
					ro: "Pentru terapia de cuplu și de familie, ședințele durează 60–90 de minute și au loc o dată pe săptămână sau o dată la două săptămâni. Pentru CBT, terapia individuală, adolescenți și hipnoză, durata ședinței, frecvența și numărul total se stabilesc după evaluarea inițială, nu înainte.",
					en: "For couples and family therapy, sessions last 60–90 minutes and take place once a week or once a fortnight. For CBT, individual therapy, teenagers and hypnosis, the length of the session, the frequency and the total number are set after the initial evaluation, not before.",
				},
			],
		},
		{
			kind: "where",
			id: "unde",
			h2: {
				ro: "Unde se desfășoară și cu cine se leagă?",
				en: "Where does it take place, and what does it connect to?",
			},
			paras: [
				{
					ro: "În centrul nostru din Galați, care are două cabinete de psihoterapie și o sală pentru terapia de grup și workshop-uri. Psihoterapia poate fi combinată cu neurofeedback, TMS sau EQ-SYNC, dacă evaluarea arată că ajută.",
					en: "In our centre in Galați, which has two psychotherapy rooms and a room for group therapy and workshops. Psychotherapy can be combined with neurofeedback, TMS or EQ-SYNC if the evaluation shows it helps.",
				},
			],
		},
	],
	faq: [
		{
			q: {
				ro: "Care este diferența dintre CBT și terapia individuală?",
				en: "What is the difference between CBT and individual therapy?",
			},
			a: {
				ro: "Terapia individuală descrie formatul: lucrezi unu-la-unu cu un psiholog. CBT descrie metoda: legătura dintre gânduri, emoții și comportamente. Se pot întâlni: o terapie individuală poate folosi CBT.",
				en: "Individual therapy describes the format: you work one to one with a psychologist. CBT describes the method: the link between thoughts, emotions and behaviour. They can meet: individual therapy can use CBT.",
			},
		},
		{
			q: { ro: "Pot face ședințele online?", en: "Can I have sessions online?" },
			a: {
				ro: "Disponibilitatea ședințelor online o confirmăm la programare, în funcție de forma de terapie și de situația ta.",
				en: "We confirm the availability of online sessions when you book, depending on the form of therapy and your situation.",
			},
		},
		{
			q: { ro: "Există terapie de grup?", en: "Is there group therapy?" },
			a: {
				ro: "Avem o sală pentru terapia de grup și workshop-uri, inclusiv ateliere de dezvoltare personală pentru adolescenți. Formatul și datele concrete ți le dăm la programare.",
				en: "We have a room for group therapy and workshops, including personal development workshops for teenagers. We give you the format and concrete details when you book.",
			},
		},
		{
			q: {
				ro: "Pierd controlul în hipnoza clinică?",
				en: "Do I lose control in clinical hypnosis?",
			},
			a: {
				ro: "Nu. Rămâi conștient pe tot parcursul și îți păstrezi controlul. La final revii treptat în starea de veghe și discutați ce s-a întâmplat.",
				en: "No. You stay conscious throughout and keep control. At the end you return gradually to waking awareness and you discuss what happened.",
			},
		},
		{
			q: {
				ro: "Cât de des vin la terapia de cuplu?",
				en: "How often do we come to couples therapy?",
			},
			a: {
				ro: "Ședințele durează 60–90 de minute și au loc o dată pe săptămână sau o dată la două săptămâni.",
				en: "Sessions last 60–90 minutes and take place once a week or once a fortnight.",
			},
		},
		{
			q: {
				ro: "Pot veni la terapie dacă iau medicație?",
				en: "Can I come to therapy if I take medication?",
			},
			a: {
				ro: "Poți, iar psihoterapia nu schimbă ce ți-a recomandat medicul. Orice întrebare despre medicație o discuți cu medicul psihiatru, nu cu noi.",
				en: "You can, and psychotherapy does not change what your doctor has recommended. Any question about medication you discuss with your psychiatrist, not with us.",
			},
		},
	],
	links: [
		{
			label: { ro: "Anxietate și depresie la adulți", en: "Anxiety and depression in adults" },
			href: "/adulti/anxietate-depresie",
		},
		{ label: { ro: "Cuplu și familie", en: "Couples and family" }, href: "/adulti/cuplu-familie" },
		{ label: { ro: "Adolescenți", en: "Teenagers" }, href: "/adolescenti" },
		{ label: { ro: "Psiho-oncologie", en: "Psycho-oncology" }, href: "/adulti/psiho-oncologie" },
		{ label: { ro: "Psihologie sportivă", en: "Sport psychology" }, href: "/programe/sport" },
		{ label: { ro: "Neurofeedback", en: "Neurofeedback" }, href: "/metode/neurofeedback" },
	],
	nextStep: {
		ro: "Nu trebuie să știi ce formă ți se potrivește. Programează o evaluare și o alegem împreună, după ce te ascultăm.",
		en: "You do not need to know which form suits you. Book an evaluation and we will choose together, after we have listened to you.",
	},
	procedure: { type: "PsychologicalTreatment" },
};
