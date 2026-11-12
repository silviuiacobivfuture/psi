import { buildHub, type HubSide } from "./hub-build";
import type { RichPage } from "./types";

/**
 * DRAFT — clinical review pending (written 2026-11-12 by an AI from psizone.ro/psihologia-sportiva,
 * read the same day, and the repo's brand docs). Nothing here is approved copy.
 *
 * Sources: the old page's list of who it is for, goals, techniques and motorsport work; the hub
 * note in content/hubs.ts (racing drivers and athletes in taekwondo, tennis, karate, gymnastics and
 * swimming, from the owners' story, content/story.ts). Durations and frequency are not stated
 * anywhere, so none is given. The old page's partnership with CNSS teams is not repeated here.
 */

const SPORT_RO: HubSide = {
	seoTitle: "Psihologie sportivă în Galați",
	seoDescription:
		"Psihologie sportivă la Psizone, Galați: emoțiile dinaintea competiției, concentrare, presiune, pregătire mentală pentru sportivi, piloți și părinți.",
	lead: "Tracul dinaintea competiției, concentrarea care se pierde, presiunea după o greșeală: lucrăm cu sportivi, piloți, părinți și antrenori la partea mentală a performanței.",
	parts: [
		{
			h2: "Ce este psihologia sportivă și când ajută?",
			paras: [
				"E ziua concursului. Ai făcut antrenamentele, știi ce ai de făcut, iar acum mâinile transpiră și mintea o ia razna. Sau copilul tău joacă excelent la antrenament și îngheață la meci. Asta nu înseamnă că „nu are caracter”. Înseamnă că partea mentală se antrenează, ca orice altceva.",
				"Psihologia sportivă este ramura psihologiei care ajută sportivii să-și dezvolte abilitățile mentale de care depinde performanța: concentrarea, motivația, reglarea emoțiilor, gestionarea stresului și revenirea după eșec sau accidentare. Nu înlocuiește antrenorul și nu face nimic în locul sportivului. Lucrează pe ce se întâmplă în mintea lui, în minutele care contează.",
				"Am lucrat cu piloți de automobilism și cu sportivi de taekwondo, tenis, karate, gimnastică și înot, și cu părinții lor.",
			],
		},
		{
			h2: "Cum arată o întâlnire de psihologie sportivă, pas cu pas?",
			paras: [
				"Începem cu o discuție despre sport, despre ce vrei și despre ce te blochează. Apoi, în linii mari:",
			],
			list: [
				"Povestești un moment concret în care nu ți-a ieșit: ce s-a întâmplat, ce ai gândit, ce a făcut corpul.",
				"Stabilim obiective mentale clare, de exemplu cum vrei să arate minutele dinaintea startului.",
				"Alegem împreună tehnicile și le exersăm în întâlniri: respirație, atenție, vizualizare, vorbirea cu tine însuți.",
				"Le încerci la antrenament, apoi într-o competiție mai puțin importantă.",
				"Revenim la ce a funcționat și la ce nu, și ajustăm.",
			],
		},
		{
			h2: "Cum urmărim progresul în psihologia sportivă?",
			paras: [
				"Folosim teste standardizate, de exemplu de viteză de reacție, de control emoțional și de profil motivațional, ca să avem un punct de pornire și un reper pentru reevaluare. Unde se potrivește, lucrăm și cu simulatoare de performanță: simulator de pilotaj, gaming cognitiv, eye tracking, și EEG în sarcini de concentrare.",
				"Dar cel mai important rămâne ce vezi tu la antrenament și în competiție: cum arată minutele dinaintea probei, cât de repede te aduni după o greșeală, cum îți vorbești. Obiectivele sunt formulate în aceste cuvinte. Nu promitem rezultate sportive: locul pe podium depinde de multe lucruri care nu țin de psiholog.",
			],
		},
		{
			h2: "Pentru cine este psihologia sportivă?",
			paras: [
				"Pentru sportivi de orice nivel și din orice ramură, și pentru cei din jurul lor. Pentru piloți, adăugăm automobilismului ce îi este specific: viteza, spațiul îngust, costul unei greșeli. Lucrăm la pregătirea mentală înainte de competiții, la gestionarea presiunii, la anticiparea traseului și la reacția la imprevizibil, cu simulator și EEG. Pentru tinerii piloți există un program separat.",
			],
			list: [
				"Sportivi juniori și seniori, în sporturi precum fotbal, atletism, arte marțiale, tenis, gimnastică sau înot.",
				"Tineri piloți, din karting, din competiții auto sau de pe simulatoare.",
				"Copii și adolescenți care fac sport și se simt copleșiți de așteptări.",
				"Părinți și antrenori care vor să înțeleagă cum pot susține fără să adauge presiune.",
			],
		},
		{
			h2: "Ce metode folosim în psihologia sportivă?",
			paras: [
				"Nu aplicăm un pachet identic. Alegem din ce se potrivește sportivului și sportului lui:",
			],
			list: [
				"Terapia cognitiv-comportamentală, în psihoterapie, pentru gândurile care sabotează („o să greșesc”) și pentru restructurarea lor.",
				"Antrenamentul atenției și al controlului mental.",
				"Vizualizarea și scenariile de performanță: cum arată startul, cum reacționezi la imprevizibil.",
				"Tehnici de respirație și de reglare emoțională dinaintea concursurilor.",
				"Neurofeedback, un antrenament în care urmărești pe ecran activitatea creierului și exersezi calmul și atenția.",
				"EQ-SYNC, un program de relaxare ghidată prin sunet. Nu este un tratament medical.",
				"Teste standardizate și simulatoare de performanță, pentru măsurare și exercițiu.",
			],
		},
		{
			h2: "Pentru cine nu este potrivită psihologia sportivă?",
			paras: [
				"Nu înlocuiește medicul sportiv, kinetoterapeutul sau antrenorul. Accidentările, durerea sau oboseala care nu trece sunt pentru medic. Nu discutăm medicație sau suplimente.",
				"Dacă în spatele tracului se află o suferință mai mare, de exemplu anxietate puternică, tristețe care nu trece sau epuizare, lucrăm la ea în psihoterapie, nu ca „pregătire pentru performanță”. Nu este un serviciu de urgență. Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112. Dacă potrivirea e bună se stabilește la evaluare, nu înainte.",
			],
		},
		{
			h2: "Cât durează și cât de des ne vedem?",
			paras: [
				"Nu publicăm o durată standard sau un număr de întâlniri, pentru că depind de sportiv, de sport și de calendarul competițiilor. Le stabilim în planul personalizat, după evaluarea inițială, și le ajustăm pe parcurs.",
			],
		},
		{
			h2: "Unde are loc pregătirea mentală în Galați?",
			paras: [
				"În centrul nostru din Galați. Adresa și telefoanele sunt pe pagina de contact. Dacă ai o competiție în perioada următoare, spune-ne data când te programezi.",
			],
		},
	],
	faq: [
		[
			"Copilul meu tremură înainte de meci. E normal?",
			"Emoțiile dinaintea unei competiții sunt frecvente. Merită o discuție când îl împiedică să joace sau îl face să nu mai vrea să meargă. Poți începe cu o evaluare, fără presiune.",
		],
		[
			"Pot veni ca părinte, fără copil?",
			"Da. Părinții și antrenorii fac parte din publicul nostru: povestim ce vedeți voi și cum puteți susține fără să adăugați presiune.",
		],
		[
			"Trebuie să fiu sportiv de performanță?",
			"Nu. Lucrăm cu sportivi de orice nivel, pentru că tracul nu alege după clasament.",
		],
		[
			"Ce rezultate pot aștepta?",
			"Nu promitem rezultate sportive. Lucrăm la ce ține de partea mentală și o urmărim cu obiective pe care le vezi: cum arată startul, cât de repede te aduni după o greșeală.",
		],
		[
			"Ce este neurofeedback-ul în sport?",
			"Un antrenament în care vezi pe ecran activitatea creierului tău și exersezi calmul și atenția. Este una dintre metodele pe care le putem include, după evaluare.",
		],
		[
			"Lucrați și cu piloți de automobilism?",
			"Da. Am lucrat cu piloți și lucrăm cu simulator și EEG la pregătirea mentală. Programul pentru tinerii piloți are pagina lui.",
		],
	],
	nextStep:
		"Dacă vrei să începi, programează o evaluare și spune-ne ce sport faci și când este următoarea competiție.",
};

const SPORT_EN: HubSide = {
	seoTitle: "Sport psychology in Galați",
	seoDescription:
		"Sport psychology at Psizone in Galați: pre-competition nerves, focus, pressure, mental preparation for athletes, racing drivers and parents.",
	lead: "Nerves before a competition, focus that slips away, pressure after a mistake: we work with athletes, racing drivers, parents and coaches on the mental side of performance.",
	parts: [
		{
			h2: "What is sport psychology and when does it help?",
			paras: [
				"It is competition day. You have trained, you know what to do, and now your hands are sweating and your mind is racing. Or your child plays brilliantly in training and freezes in the match. That does not mean they “lack character”. It means the mental side can be trained, like anything else.",
				"Sport psychology is the branch of psychology that helps athletes build the mental skills performance depends on: focus, motivation, emotional regulation, managing stress and coming back after a failure or an injury. It does not replace the coach and does not do anything in place of the athlete. It works on what happens in their mind during the minutes that count.",
				"We have worked with racing drivers and with athletes in taekwondo, tennis, karate, gymnastics and swimming, and with their parents.",
			],
		},
		{
			h2: "What does a sport psychology meeting look like, step by step?",
			paras: [
				"We begin with a conversation about your sport, what you want and what is holding you back. After that, broadly:",
			],
			list: [
				"You describe a concrete moment when it did not go well: what happened, what you thought, what your body did.",
				"We set clear mental goals, for example what you want the minutes before the start to look like.",
				"We choose the techniques together and practise them in the meetings: breathing, attention, visualisation, how you talk to yourself.",
				"You try them in training, then in a less important competition.",
				"We come back to what worked and what did not, and adjust.",
			],
		},
		{
			h2: "How do we follow progress in sport psychology?",
			paras: [
				"We use standardised tests, for example of reaction speed, emotional control and motivational profile, to have a starting point and a reference for re-evaluation. Where it fits, we also work with performance simulators: a driving simulator, cognitive gaming, eye tracking, and EEG in concentration tasks.",
				"But what matters most is what you see in training and in competition: what the minutes before the event look like, how quickly you collect yourself after a mistake, how you talk to yourself. The goals are put in those words. We do not promise sporting results: a place on the podium depends on many things that are not up to the psychologist.",
			],
		},
		{
			h2: "Who is sport psychology for?",
			paras: [
				"For athletes of any level and in any sport, and for the people around them. For racing drivers we add what is particular to motorsport: speed, a narrow space, the cost of a mistake. We work on mental preparation before competitions, on handling pressure, on anticipating the track and on reacting to the unpredictable, with a simulator and EEG. There is a separate programme for young drivers.",
			],
			list: [
				"Junior and senior athletes, in sports such as football, athletics, martial arts, tennis, gymnastics or swimming.",
				"Young drivers, from karting, car competitions or simulators.",
				"Children and teenagers who play sport and feel overwhelmed by expectations.",
				"Parents and coaches who want to understand how to support without adding pressure.",
			],
		},
		{
			h2: "Which methods do we use in sport psychology?",
			paras: [
				"We do not apply one identical package. We choose what fits the athlete and their sport:",
			],
			list: [
				"Cognitive behavioural therapy, within psychotherapy, for thoughts that sabotage (“I’m going to get it wrong”) and for restructuring them.",
				"Attention and mental control training.",
				"Visualisation and performance scenarios: what the start looks like, how you react to the unexpected.",
				"Breathing and emotional regulation techniques before competitions.",
				"Neurofeedback, a training in which you watch your brain activity on a screen and practise calm and attention.",
				"EQ-SYNC, a guided relaxation programme using sound. It is not a medical treatment.",
				"Standardised tests and performance simulators, for measuring and for practice.",
			],
		},
		{
			h2: "Who is sport psychology not for?",
			paras: [
				"It does not replace the sports doctor, the physiotherapist or the coach. Injuries, pain or tiredness that does not pass are for a doctor. We do not discuss medication or supplements.",
				"If there is a bigger difficulty behind the nerves, for example strong anxiety, sadness that does not lift or exhaustion, we work on it in psychotherapy, not as “performance preparation”. This is not an emergency service. If you or someone close to you is in immediate danger, call 112. Whether it is a good fit is decided at the evaluation, not beforehand.",
			],
		},
		{
			h2: "How long does it last and how often do we meet?",
			paras: [
				"We do not publish a standard length or number of meetings, because they depend on the athlete, the sport and the competition calendar. We set them in the personalised plan after the initial evaluation and adjust as we go.",
			],
		},
		{
			h2: "Where does mental preparation take place in Galați?",
			paras: [
				"At our centre in Galați. The address and phone numbers are on the contact page. If you have a competition coming up, tell us the date when you book.",
			],
		},
	],
	faq: [
		[
			"My child shakes before a match. Is that normal?",
			"Nerves before a competition are common. It is worth a conversation when they stop your child playing or make them not want to go. You can start with an evaluation, with no pressure.",
		],
		[
			"Can I come as a parent, without my child?",
			"Yes. Parents and coaches are part of who we work with: we talk about what you see and how you can support without adding pressure.",
		],
		[
			"Do I have to be an elite athlete?",
			"No. We work with athletes of any level, because nerves do not go by the league table.",
		],
		[
			"What results can I expect?",
			"We do not promise sporting results. We work on the mental side and follow it with goals you can see: what the start looks like, how quickly you collect yourself after a mistake.",
		],
		[
			"What is neurofeedback in sport?",
			"A training in which you see your own brain activity on a screen and practise calm and attention. It is one of the methods we can include, after the evaluation.",
		],
		[
			"Do you work with racing drivers?",
			"Yes. We have worked with drivers, and we use a simulator and EEG in mental preparation. The programme for young drivers has its own page.",
		],
	],
	nextStep:
		"If you would like to begin, book an evaluation and tell us what sport you do and when your next competition is.",
};

export const SPORT: RichPage = buildHub(SPORT_RO, SPORT_EN, [
	["/metode/neurofeedback", "Neurofeedback", "Neurofeedback"],
	["/metode/psihoterapie", "Psihoterapia la Psizone", "Psychotherapy at Psizone"],
	["/metode/eq-sync", "EQ-SYNC, programul de sunet", "EQ-SYNC, the sound programme"],
	["/programe/race-me-up", "Programul Race Me Up", "The Race Me Up programme"],
	["/povestea", "Povestea noastră", "Our story"],
	["/adolescenti", "Adolescenți", "Teenagers"],
]);
