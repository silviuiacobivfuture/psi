import type { RichPage } from "./types";

// Sources and review status: see methods-therapies.ts.

const EMERGENCY = {
	ro: "Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
	en: "If you or someone close to you is in immediate danger, call 112.",
} as const;

export const SENSORY: RichPage = {
	seoTitle: {
		ro: "Integrare neurosenzorială în Galați: ce este",
		en: "Neurosensory integration in Galați: what it is",
	},
	seoDescription: {
		ro: "Integrare neurosenzorială la Psizone, Galați: sala senzorială, ce se lucrează, pentru ce copii și când nu este de ajuns. Program personalizat, în echipă.",
		en: "Neurosensory integration at Psizone in Galați: the sensory room, what we work on, which children it suits and when it is not enough. Personalised, in a team.",
	},
	lead: {
		ro: "Integrarea neurosenzorială ajută creierul să facă ordine în ce primește prin simțuri. La noi se face într-o sală amenajată pentru asta, într-un plan stabilit în echipă.",
		en: "Neurosensory integration helps the brain make order of what it receives through the senses. With us it takes place in a room fitted out for the purpose, in a plan set by a team.",
	},
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: {
				ro: "Ce este integrarea neurosenzorială, pe înțelesul tuturor?",
				en: "What is neurosensory integration, in plain words?",
			},
			paras: [
				{
					ro: "Corpul primește tot timpul informații: ce vedem, ce auzim, ce atingem, cum ne mișcăm, cum ne ținem echilibrul. Integrarea neurosenzorială este felul în care sistemul nervos le primește, le ordonează și le folosește. Când acest proces merge greu, copilul poate reacționa prea puternic sau prea slab la zgomot, atingere sau mișcare.",
					en: "The body is always receiving information: what we see, hear and touch, how we move, how we keep balance. Neurosensory integration is the way the nervous system receives it, orders it and uses it. When this process runs with difficulty, a child can react too strongly or too weakly to noise, touch or movement.",
				},
				{
					ro: "Pot apărea dificultăți de atenție, agitație sau, dimpotrivă, lipsa de reacție, întârzieri de limbaj, comportamente repetitive sau de evitare, probleme de echilibru, coordonare și motricitate fină. Nu spunem că toate au această cauză. Spunem că merită privite și sub acest unghi.",
					en: "Difficulties can appear with attention, restlessness or, on the contrary, a lack of response, language delays, repetitive or avoidant behaviours, and problems with balance, coordination and fine motor skills. We are not saying all of these have this cause. We are saying they are worth looking at from this angle too.",
				},
				{
					ro: "În cabinetul nostru am amenajat prima sală de integrare senzorială și polisenzorială din Galați. Programele sunt personalizate și fac parte dintr-un plan multidisciplinar, coordonat de psihologi, psihopedagogi și terapeuți ocupaționali cu formare specifică.",
					en: "In our practice we fitted out Galați's first sensory and multisensory integration room. The programmes are personalised and part of a multidisciplinary plan, coordinated by psychologists, psychopedagogues and occupational therapists with specific training.",
				},
			],
		},
		{
			kind: "session",
			id: "cum-decurge",
			h2: {
				ro: "Cum începe și ce se lucrează în sala senzorială?",
				en: "How does it begin, and what is worked on in the sensory room?",
			},
			paras: [
				{
					ro: "Începem cu o evaluare, nu cu echipamentele. Centrul face evaluări neurosenzoriale și, unde ajută, QEEG, adică o hartă a activității electrice a creierului. Pașii exacți ai unei evaluări depind de copil, dar ne uităm la cum procesează simțurile, cum se autoreglează și cum participă la activitățile zilei.",
					en: "We begin with an evaluation, not with the equipment. The centre carries out neurosensory evaluations and, where it helps, QEEG, a map of the brain's electrical activity. The exact steps of an evaluation depend on the child, but we look at how they process the senses, how they regulate themselves and how they take part in the day's activities.",
				},
				{
					ro: "După evaluare se stabilește un program personalizat. În sală se folosesc, după nevoie, plăci vibratoare, perne instabile, trasee motorii, hamace senzoriale, tuburi luminoase și mingi de echilibru. Nu descriem o ședință-tip, pentru că nu există una: alegerea activităților pornește de la ce a arătat evaluarea.",
					en: "After the evaluation a personalised programme is set. In the room, as needed, we use vibrating plates, unstable cushions, motor circuits, sensory hammocks, light tubes and balance balls. We do not describe a typical session, because there is not one: the choice of activities starts from what the evaluation showed.",
				},
			],
			list: [
				{
					ro: "Discuția cu părinții și analiza documentelor existente.",
					en: "A conversation with the parents and a review of existing documents.",
				},
				{
					ro: "Evaluarea neurosenzorială a copilului, uneori și QEEG.",
					en: "The child's neurosensory evaluation, sometimes with QEEG.",
				},
				{
					ro: "Un program personalizat, în planul echipei.",
					en: "A personalised programme, within the team's plan.",
				},
				{
					ro: "Revenirea la obiective și reevaluarea.",
					en: "A return to the goals, and re-evaluation.",
				},
			],
			ordered: true,
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
					ro: "Evaluarea de la început este reperul. Obiectivele se formulează în comportamente pe care le poți observa: cum reacționează copilul la zgomot sau la atingere, cât de bine se autoreglează, cum participă la activități. La reevaluare comparăm cu punctul de plecare și îți arătăm ce s-a schimbat.",
					en: "The starting evaluation is the reference. Goals are phrased in behaviours you can observe: how the child reacts to noise or touch, how well they regulate themselves, how they take part in activities. At re-evaluation we compare with the starting point and show you what has changed.",
				},
				{
					ro: "Dacă am folosit QEEG, harta de la început poate fi comparată cu una ulterioară, ca parte din imaginea de ansamblu, nu ca singură dovadă. Contează la fel de mult ce observi tu acasă: dacă dimineața cu îmbrăcatul, spălatul pe dinți sau drumul spre școală se desfășoară altfel decât înainte.",
					en: "If we used QEEG, the map from the start can be compared with a later one, as part of the overall picture rather than as the only proof. What you notice at home matters just as much: whether the morning routine of dressing, brushing teeth or going to school unfolds differently from before.",
				},
			],
		},
		{
			kind: "for",
			id: "pentru-cine",
			h2: { ro: "Pentru ce copii poate fi potrivită?", en: "Which children might it suit?" },
			paras: [
				{
					ro: "Programele sunt pentru copii cu întârziere în dezvoltarea globală, cu tulburare de spectru autist, cu ADHD sau dificultăți de autoreglare emoțională, cu tulburări de procesare senzorială, precum și pentru copii cu probleme de învățare sau tulburări de limbaj. Dacă recunoști în copilul tău o parte din ce am descris, evaluarea te ajută să afli dacă integrarea senzorială are loc în planul lui.",
					en: "The programmes are for children with global developmental delay, with autism spectrum disorder, with ADHD or difficulties with emotional self-regulation, with sensory processing disorders, and for children with learning problems or language disorders. If you recognise part of what we have described in your child, an evaluation helps you find out whether sensory integration has a place in their plan.",
				},
				{
					ro: "Nu căutăm un copil „cu probleme senzoriale” ca etichetă. Căutăm să înțelegem de ce o zi obișnuită, cu zgomotul ei, cu hainele, cu mâncarea și cu mulțimea, îl costă pe copil mai mult decât pe alții. De multe ori, odată ce familia înțelege asta, și casa devine mai ușor de organizat.",
					en: "We are not looking for a “child with sensory problems” as a label. We are trying to understand why an ordinary day, with its noise, clothes, food and crowds, costs this child more than it costs others. Often, once the family understands that, the home becomes easier to organise too.",
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
					ro: "Integrarea neurosenzorială nu înlocuiește evaluarea medicală, terapia logopedică, intervenția psihologică sau educațională. Nu este un tratament pentru urgențe și nu se oferă fără evaluare. Un copil poate avea nevoie și de alte terapii, iar sala senzorială singură nu ajunge.",
					en: "Neurosensory integration does not replace medical assessment, speech therapy, or psychological or educational intervention. It is not a treatment for emergencies and it is not offered without an evaluation. A child may also need other therapies, and the sensory room alone is not enough.",
				},
				{
					ro: "Dacă după evaluare nu pare potrivită acum pentru copilul tău, îți spunem și propunem altceva. Întrebările despre medicație rămân la medic.",
					en: "If after the evaluation it does not seem right for your child now, we will say so and suggest something else. Questions about medication stay with the doctor.",
				},
				EMERGENCY,
			],
		},
		{
			kind: "duration",
			id: "cat-dureaza",
			h2: { ro: "Cât durează și cât de des?", en: "How long does it take, and how often?" },
			paras: [
				{
					ro: "Durata unei ședințe, frecvența și durata programului se stabilesc după evaluarea inițială, în funcție de nevoile copilului. Nu avem o cifră generală pe care să o putem susține, deci nu îți dăm una. Ți le spunem la evaluare, înainte să te hotărăști.",
					en: "The length of a session, its frequency and the length of the programme are set after the initial evaluation, according to the child's needs. We have no general figure we can stand behind, so we do not give you one.",
				},
			],
		},
		{
			kind: "where",
			id: "unde",
			h2: { ro: "Unde se desfășoară?", en: "Where does it take place?" },
			paras: [
				{
					ro: "În centrul nostru din Galați, în sala de integrare polisenzorială și neurosenzorială. Se leagă de restul planului: logopedie, ABA, psihoterapie sau neurofeedback, dacă evaluarea arată că ajută. Pe pagina despre integrarea senzorială la copii găsești mai multe despre semnele la care să fii atent.",
					en: "In our centre in Galați, in the polysensory and neurosensory integration room. It connects to the rest of the plan: speech therapy, ABA, psychotherapy or neurofeedback, if the evaluation shows it helps. On the page about sensory integration in children you will find more about the signs to look out for.",
				},
			],
		},
	],
	faq: [
		{
			q: {
				ro: "Cum știu dacă al meu are probleme senzoriale?",
				en: "How do I know whether my child has sensory difficulties?",
			},
			a: {
				ro: "Nu poți ști doar de pe o pagină, nici noi. Semnele pot fi reacții puternice la zgomot sau atingere, evitare, agitație sau dificultăți de echilibru. Evaluarea arată dacă este vorba despre asta.",
				en: "You cannot know from a page, and neither can we. Signs can be strong reactions to noise or touch, avoidance, restlessness or balance difficulties. An evaluation shows whether that is what is going on.",
			},
		},
		{
			q: { ro: "Cine lucrează cu copiii în sală?", en: "Who works with the children in the room?" },
			a: {
				ro: "Programele sunt coordonate de psihologi, psihopedagogi și terapeuți ocupaționali cu formare specifică, într-un plan multidisciplinar.",
				en: "The programmes are coordinated by psychologists, psychopedagogues and occupational therapists with specific training, in a multidisciplinary plan.",
			},
		},
		{
			q: { ro: "Este doar pentru copiii cu autism?", en: "Is it only for children with autism?" },
			a: {
				ro: "Nu. Se adresează și copiilor cu ADHD, cu întârziere în dezvoltare, cu dificultăți de autoreglare sau de procesare senzorială, cu probleme de învățare sau de limbaj.",
				en: "No. It is also for children with ADHD, developmental delay, difficulties with self-regulation or sensory processing, and learning or language problems.",
			},
		},
		{
			q: { ro: "Este nevoie de QEEG?", en: "Is QEEG needed?" },
			a: {
				ro: "Nu mereu. Centrul face evaluări neurosenzoriale și, unde ajută, QEEG. Hotărâm la evaluare ce are sens pentru copilul tău.",
				en: "Not always. The centre carries out neurosensory evaluations and, where it helps, QEEG. We decide at the evaluation what makes sense for your child.",
			},
		},
		{
			q: { ro: "Pot sta cu copilul în sală?", en: "Can I stay in the room with my child?" },
			a: {
				ro: "Părintele este implicat în plan. Cum și cât stai în ședințe stabilim la început, în funcție de copil.",
				en: "The parent is involved in the plan. How and how much you stay in sessions we decide at the start, depending on the child.",
			},
		},
		{
			q: { ro: "Cât durează până se vede o schimbare?", en: "How long until a change shows?" },
			a: {
				ro: "Nu promitem termene. La reevaluare comparăm cu evaluarea de la început și îți arătăm ce s-a schimbat.",
				en: "We do not promise timelines. At re-evaluation we compare with the starting evaluation and show you what has changed.",
			},
		},
		{
			q: {
				ro: "Ce fac acasă până la evaluare?",
				en: "What should I do at home before the evaluation?",
			},
			a: {
				ro: "Notează când apar reacțiile care te îngrijorează: la ce zgomot, în ce loc, la ce oră. Aceste observații ajută mult la evaluare și nu cer nimic altceva de la tine.",
				en: "Make a note of when the reactions that worry you appear: at what noise, in what place, at what time. These observations help a great deal at the evaluation and ask nothing else of you.",
			},
		},
	],
	links: [
		{
			label: { ro: "Integrare senzorială la copii", en: "Sensory integration in children" },
			href: "/copii/integrare-senzoriala",
		},
		{ label: { ro: "Evaluare și QEEG", en: "Evaluation and QEEG" }, href: "/metode/evaluare-qeeg" },
		{ label: { ro: "ABA", en: "ABA" }, href: "/metode/aba" },
		{ label: { ro: "Logopedie", en: "Speech therapy" }, href: "/metode/logopedie" },
		{ label: { ro: "ADHD la copii", en: "ADHD in children" }, href: "/copii/adhd" },
	],
	nextStep: {
		ro: "Dacă recunoști în copilul tău o parte din ce am descris, programează o evaluare și vedem împreună dacă sala senzorială are loc în planul lui.",
		en: "If you recognise part of what we have described in your child, book an evaluation and we will see together whether the sensory room has a place in their plan.",
	},
	procedure: { type: "TherapeuticProcedure" },
};
