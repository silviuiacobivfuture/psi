import { EMERGENCY } from "./emergency";
import type { RichPage } from "./types";

/** Sources: see methods-neuro.ts. */
export const EQ_SYNC: RichPage = {
	seoTitle: {
		ro: "EQ-SYNC la Psizone Galați: sunet pentru calm",
		en: "EQ-SYNC at Psizone, Galați: sound for calm",
	},
	seoDescription: {
		ro: "EQ-SYNC este un program de relaxare ghidată prin sunet, dezvoltat la Psizone. Căști, 20–40 de minute, fără efort activ. Cum decurge, pentru cine nu este.",
		en: "EQ-SYNC is a sound-guided relaxation programme developed at Psizone. Headphones, 20 to 40 minutes, no active effort. How it goes and who it is not for.",
	},
	lead: {
		ro: "EQ-SYNC este metoda proprie, brevetată, a echipei Psizone: relaxare ghidată prin sunet, cu căști, în care stai liniștit și asculți. O ședință durează între 20 și 40 de minute. Este un program de bunăstare, nu un dispozitiv medical.",
		en: "EQ-SYNC is the Psizone team's own patented method: sound-guided relaxation, with headphones, in which you rest and listen. A session lasts between 20 and 40 minutes. It is a wellness programme, not a medical device.",
	},
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: { ro: "Ce este EQ-SYNC, pe înțeles?", en: "What is EQ-SYNC, in plain words?" },
			paras: [
				{
					ro: "EQ-SYNC folosește sunete special pregătite, redate prin căști. Se bazează pe bătăi binaurale: într-o ureche auzi o frecvență, în cealaltă o frecvență puțin diferită, iar creierul percepe diferența dintre ele ca pe un ritm. De exemplu, 200 Hz într-o ureche și 208 Hz în cealaltă dau un ritm perceput de 8 Hz.",
					en: "EQ-SYNC uses specially prepared sounds played through headphones. It is based on binaural beats: in one ear you hear one frequency, in the other a slightly different one, and the brain perceives the difference between them as a rhythm. For example, 200 Hz in one ear and 208 Hz in the other give a perceived rhythm of 8 Hz.",
				},
				{
					ro: "La Psizone îl folosim într-un spațiu senzorial amenajat, ca să ajute la relaxare și la reglarea stării. Nu cere niciun efort: stai și asculți. Îl putem integra în ședințe de neurofeedback, de TMS sau de terapie ocupațională.",
					en: "At Psizone we use it in a sensory space set up for it, to support relaxation and the regulation of your state. It asks for no effort: you rest and listen. We can build it into neurofeedback, TMS or occupational therapy sessions.",
				},
				{
					ro: "EQ-SYNC are și un site al lui, eq-sync.ro, unde îl poți afla în detaliu.",
					en: "EQ-SYNC also has a site of its own, eq-sync.ro, where you can learn about it in detail.",
				},
			],
		},
		{
			kind: "session",
			id: "cum-decurge",
			h2: { ro: "Cum decurge o ședință EQ-SYNC?", en: "How does an EQ-SYNC session go?" },
			paras: [
				{
					ro: "Căștile sunt obligatorii, pentru că efectul sonor se bazează pe diferența dintre cele două urechi. Ședința este simplă:",
					en: "Headphones are essential, because the sound effect rests on the difference between the two ears. The session is simple:",
				},
			],
			ordered: true,
			list: [
				{
					ro: "Vorbim scurt despre cum ești în ziua respectivă și ce urmărim.",
					en: "We talk briefly about how you are that day and what we are aiming for.",
				},
				{
					ro: "Te așezi într-un spațiu liniștit și îți punem căștile. Dacă planul o cere, se adaugă și stimulare vibroacustică.",
					en: "You settle in a quiet space and we put the headphones on you. If the plan calls for it, vibroacoustic stimulation is added.",
				},
				{
					ro: "Asculți între 20 și 40 de minute. Nu ai nimic de făcut și nu trebuie să te concentrezi.",
					en: "You listen for 20 to 40 minutes. There is nothing to do and no need to concentrate.",
				},
				{
					ro: "La final îți dăm timp să revii și îți notăm cum te simți.",
					en: "At the end we give you time to come round and note how you feel.",
				},
			],
		},
		{
			kind: "measured",
			id: "ce-masoara",
			h2: {
				ro: "Ce se urmărește și cum arătăm progresul?",
				en: "What do we follow, and how do we show progress?",
			},
			paras: [
				{
					ro: "EQ-SYNC este un program de bunăstare, deci nu promitem un efect și nu îl prezentăm ca pe un tratament. Urmărim ce spui tu: somnul, starea de la sfârșitul zilei, cât de liniștit te simți înainte și după ședință.",
					en: "EQ-SYNC is a wellness programme, so we promise no effect and do not present it as a treatment. We follow what you tell us: sleep, how you feel at the end of the day, how calm you feel before and after a session.",
				},
				{
					ro: "Când este parte dintr-un plan cu neurofeedback sau cu alte metode, progresul se judecă în ansamblul planului, pe baza hărții și a reevaluărilor de acolo.",
					en: "When it is part of a plan with neurofeedback or other methods, progress is judged across the whole plan, from the map and the re-evaluations there.",
				},
			],
		},
		{
			kind: "for",
			id: "pentru-cine",
			h2: { ro: "Pentru cine este EQ-SYNC?", en: "Who is EQ-SYNC for?" },
			paras: [
				{
					ro: "Îl oferim copiilor, adolescenților și adulților care au nevoie de o metodă blândă de relaxare și de reglare a stării. Îl folosim, de exemplu, ca însoțitor al planurilor pentru stres și epuizare, pentru somn, pentru sportivii care vor să se refacă după efort sau pentru copiii cu nevoi senzoriale, alături de alte metode.",
					en: "We offer it to children, teenagers and adults who need a gentle method of relaxation and of regulating their state. We use it, for example, as a companion to plans for stress and exhaustion, for sleep, for athletes who want to recover after effort, or for children with sensory needs, alongside other methods.",
				},
			],
		},
		{
			kind: "not-for",
			id: "pentru-cine-nu",
			h2: { ro: "Pentru cine nu este EQ-SYNC?", en: "Who is EQ-SYNC not for?" },
			paras: [
				{
					ro: "Persoanele cu epilepsie sau cu tulburări convulsive nu ascultă audio binaural fără acordul medicului lor. Dacă ai un astfel de diagnostic, spune-ne înainte de prima ședință.",
					en: "People with epilepsy or seizure disorders do not listen to binaural audio without their doctor's agreement. If you have such a diagnosis, tell us before the first session.",
				},
				{
					ro: "EQ-SYNC nu este un dispozitiv medical și nu înlocuiește tratamentul medical sau psihoterapia. Nu este pentru situații de urgență sau de criză.",
					en: "EQ-SYNC is not a medical device and does not replace medical treatment or psychotherapy. It is not for emergencies or crises.",
				},
				EMERGENCY,
			],
		},
		{
			kind: "duration",
			id: "durata",
			h2: {
				ro: "Cât durează și cât de des se face?",
				en: "How long does it take, and how often is it done?",
			},
			paras: [
				{
					ro: "O ședință durează între 20 și 40 de minute. Câte ședințe și în ce ritm se stabilește în plan, după discuția cu tine. Nu avem o cifră fixă.",
					en: "A session lasts between 20 and 40 minutes. How many sessions and at what pace is set in the plan, after the conversation with you. We do not have a fixed figure.",
				},
			],
		},
		{
			kind: "more",
			id: "cum-il-folosim",
			h2: {
				ro: "Cum îl folosim, concret, în planurile noastre?",
				en: "How do we use it, concretely, in our plans?",
			},
			paras: [
				{
					ro: "EQ-SYNC se așază rar singur. De obicei vine alături de altceva: înainte de o ședință de psihoterapie, ca să te ajute să intri mai liniștit în discuție, sau după neurofeedback, ca un moment de refacere. La copiii cu nevoi senzoriale îl combinăm cu terapia senzorială.",
					en: "EQ-SYNC rarely stands alone. It usually comes alongside something else: before a psychotherapy session, to help you enter the conversation more calmly, or after neurofeedback, as a moment of recovery. With children who have sensory needs we combine it with sensory therapy.",
				},
				{
					ro: "Seara, când lumea se liniștește, este momentul pentru care a fost gândit programul: ritm, respirație, somn. Aici descriem doar ce facem în cabinet. Pentru partea de acasă și pentru detalii despre program, ne găsești pe eq-sync.ro.",
					en: "Evening, when the world quiets down, is the moment the programme was designed for: rhythm, breath, sleep. Here we describe only what we do in the practice. For the at-home side and for details of the programme, you will find us on eq-sync.ro.",
				},
				{
					ro: "Dacă îl încerci și nu ți se potrivește, nu insistăm. O metodă blândă nu trebuie să fie și o obligație.",
					en: "If you try it and it does not suit you, we do not insist. A gentle method should not become an obligation.",
				},
				{
					ro: "Spune-ne cum dormi, cât de obosit ești la sfârșitul zilei și ce te ajută de obicei să te liniștești. Cu aceste lucruri alegem împreună dacă și când are sens să-l adăugăm planului tău.",
					en: "Tell us how you sleep, how tired you are at the end of the day and what usually helps you settle. With these things we decide together whether and when it makes sense to add it to your plan.",
				},
			],
		},
		{
			kind: "more",
			id: "cum-ascult",
			h2: { ro: "Cum ascult ca să mă simt bine?", en: "How should I listen to feel comfortable?" },
			paras: [
				{
					ro: "Alege un moment în care nu ești grăbit. Stai într-o poziție comodă, cu ochii deschiși sau închiși, cum îți place. Nu trebuie să rămâi treaz cu forța: dacă adormi, nu e o greșeală, e semn că ai avut nevoie de odihnă.",
					en: "Choose a moment when you are not in a hurry. Sit in a comfortable position, with your eyes open or closed, as you like. You do not have to force yourself to stay awake: if you doze off, it is not a mistake, it is a sign that you needed rest.",
				},
				{
					ro: "Volumul rămâne scăzut, la un nivel plăcut. Dacă un sunet te deranjează, ridici o mână și îl schimbăm sau oprim. Ședința este pentru tine, nu pentru program.",
					en: "The volume stays low, at a pleasant level. If a sound bothers you, you raise a hand and we change or stop it. The session is for you, not for the schedule.",
				},
				{
					ro: "Copiii pot asculta cu un părinte în apropiere. Adolescenții aleg adesea să stea singuri, cu căștile, iar noi suntem în camera de alături.",
					en: "Children can listen with a parent nearby. Teenagers often choose to be alone with the headphones, and we are in the next room.",
				},
				{
					ro: "După ședință, bea un pahar cu apă și dă-ți câteva minute înainte să te întorci la ritmul zilei. Merită să observi cum te simți în ora care urmează, pentru că aceasta este informația cea mai utilă pentru plan.",
					en: "After the session, drink a glass of water and give yourself a few minutes before returning to the pace of the day. It is worth noticing how you feel in the hour that follows, because that is the most useful information for the plan.",
				},
			],
		},
		{
			kind: "where",
			id: "unde-o-folosim",
			h2: { ro: "Unde folosim EQ-SYNC la Psizone?", en: "Where do we use EQ-SYNC at Psizone?" },
			paras: [
				{
					ro: "Apare în planurile care combină mai multe metode, de exemplu alături de neurofeedback, TMS, terapie senzorială sau psihoterapie. Pe paginile de temă nu îl prezentăm ca metodă clinică de sine stătătoare. Este un program al nostru, pe care îl poți descoperi și pe eq-sync.ro.",
					en: "It appears in plans that combine several methods, for example alongside neurofeedback, TMS, sensory therapy or psychotherapy. On the topic pages we do not present it as a stand-alone clinical method. It is a programme of ours, which you can also discover on eq-sync.ro.",
				},
			],
		},
	],
	faq: [
		{
			q: { ro: "Trebuie să port căști?", en: "Do I have to wear headphones?" },
			a: {
				ro: "Da. Efectul se bazează pe frecvențe diferite în cele două urechi, iar fără căști nu funcționează.",
				en: "Yes. The effect rests on different frequencies in the two ears, and without headphones it does not work.",
			},
		},
		{
			q: { ro: "Este un tratament medical?", en: "Is it a medical treatment?" },
			a: {
				ro: "Nu. Este un program de bunăstare și nu un dispozitiv medical. Nu înlocuiește consultul medical sau psihoterapia.",
				en: "No. It is a wellness programme and not a medical device. It does not replace a medical consultation or psychotherapy.",
			},
		},
		{
			q: {
				ro: "Pot folosi EQ-SYNC dacă am epilepsie?",
				en: "Can I use EQ-SYNC if I have epilepsy?",
			},
			a: {
				ro: "Nu fără acordul medicului tău. Spune-ne diagnosticul înainte de prima ședință.",
				en: "Not without your doctor's agreement. Tell us the diagnosis before the first session.",
			},
		},
		{
			q: {
				ro: "Trebuie să fac ceva în timpul ședinței?",
				en: "Do I have to do anything during the session?",
			},
			a: {
				ro: "Nu. Stai relaxat și asculți. Nu cere participare activă.",
				en: "No. You rest and listen. It does not ask for active participation.",
			},
		},
		{
			q: { ro: "Cât durează o ședință?", en: "How long is a session?" },
			a: {
				ro: "Între 20 și 40 de minute, într-un spațiu senzorial amenajat.",
				en: "Between 20 and 40 minutes, in a sensory space set up for it.",
			},
		},
		{
			q: { ro: "Unde aflu mai multe despre EQ-SYNC?", en: "Where can I learn more about EQ-SYNC?" },
			a: {
				ro: "Pe site-ul lui, eq-sync.ro, sau întrebând ghidul de pe această pagină. Dacă ești deja în plan la noi, poți întreba și psihologul la prima ședință.",
				en: "On its own site, eq-sync.ro, or by asking the guide on this page. If you are already in a plan with us, you can also ask your psychologist at the first session.",
			},
		},
	],
	links: [
		{
			label: { ro: "EQ-SYNC, pe eq-sync.ro", en: "EQ-SYNC, on eq-sync.ro" },
			href: "https://eq-sync.ro/",
		},
		{ label: { ro: "Neurofeedback", en: "Neurofeedback" }, href: "/metode/neurofeedback" },
		{ label: { ro: "TMS", en: "TMS" }, href: "/metode/tms" },
		{
			label: { ro: "Integrare neurosenzorială", en: "Neurosensory integration" },
			href: "/metode/integrare-neurosenzoriala",
		},
		{ label: { ro: "Psihoterapie", en: "Psychotherapy" }, href: "/metode/psihoterapie" },
	],
	nextStep: {
		ro: "Vrei să afli dacă EQ-SYNC se potrivește planului tău? Întreabă ghidul.",
		en: "Want to know whether EQ-SYNC fits your plan? Ask the guide.",
	},
};
