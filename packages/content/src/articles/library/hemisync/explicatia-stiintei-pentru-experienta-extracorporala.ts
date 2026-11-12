import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "explicatia-stiintei-pentru-experienta-extracorporala",
	brand: "hemisync",
	topic: "explorarea-constiintei",
	backlogNo: null,
	status: "draft",
	kind: "editorial",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Ce spune știința despre experiențele extracorporale",
		en: "What science says about out-of-body experiences",
	},
	standfirst: {
		ro: "Laboratoarele au reușit să provoace, scurt și controlat, senzația de a fi în afara corpului: prin stimularea unei zone a creierului la o pacientă și prin iluzii în realitate virtuală la voluntari. Ele arată ce construiește creierul când își plasează „eul”. Nu arată dacă ceva „iese” cu adevărat din corp.",
		en: "Laboratories have managed to produce, briefly and under control, the sensation of being outside the body: by stimulating a brain area in a patient and by virtual-reality illusions in volunteers. They show what the brain builds when it places the “self”. They do not show whether anything truly “leaves” the body.",
	},
	cover: {
		src: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Bucegi_-_fog.jpg/1280px-Bucegi_-_fog.jpg",
		alt: {
			ro: "O creastă stâncoasă din Bucegi, cu ceața coborând peste ea și zăpadă rămasă în văi.",
			en: "A rocky ridge in the Bucegi mountains, with fog descending over it and snow left in the gullies.",
		},
		width: 1280,
		height: 852,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Dacă ai trăit o experiență extracorporală, știi că nu seamănă cu un vis. Dacă ești sceptic, știi că niciun om nu poate verifica de pe un pat ce se întâmplă în afara lui. Ambele poziții sunt oneste, iar știința le poate spune câte ceva amândurora. Pe scurt: cercetătorii au putut provoca senzația în laborator și au identificat zone ale creierului implicate în ea. Ce nu pot spune este dacă experiența reprezintă mai mult decât ce construiește creierul.",
				en: "If you have had an out-of-body experience, you know it is nothing like a dream. If you are a sceptic, you know no one can check from a bed what happens outside it. Both positions are honest, and science has something to say to each. In short: researchers have been able to provoke the sensation in the laboratory and have identified brain areas involved in it. What they cannot say is whether the experience is more than what the brain builds.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai jos punem lucrările de laborator alături de relatările la persoana întâi, cu aceeași seriozitate, și spunem la fiecare ce demonstrează și unde se oprește. Toate sursele citate le-am deschis.",
				en: "Below we set the laboratory work beside first-person accounts, with the same seriousness, and say for each what it demonstrates and where it stops. We opened every source cited.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce este, de fapt, o experiență extracorporală?",
				en: "What exactly is an out-of-body experience?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cercetătorii o definesc după felul în care e trăită: senzația subiectivă de a fi localizat în afara propriului corp. Într-un articol din revista Nature, Olaf Blanke și colegii lui o descriu ca pe o senzație ciudată, de obicei scurtă, în care conștiința pare să se desprindă de corp și să ia o poziție de privire de la distanță.",
				en: "Researchers define it by how it is lived: the subjective experience of being located outside one’s own body. In a paper in Nature, Olaf Blanke and colleagues describe it as a curious, usually brief sensation in which consciousness seems to detach from the body and take up a remote viewing position.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cine o povestește? Oameni sănătoși, de multe ori aproape de somn sau în momente de relaxare profundă. Revista de sinteză din 2024 pe care o discutăm mai jos notează că experiențele spontane sunt raportate de persoane sănătoase mai ales în stări de vigilență redusă, în apropierea somnului sau în timpul lui. Apar și în context clinic, de pildă la pacienți cu epilepsie. Contextul contează, pentru că ne spune unde să căutăm.",
				en: "Who reports it? Healthy people, often near sleep or in moments of deep relaxation. The 2024 review discussed below notes that spontaneous experiences are reported by healthy individuals mostly in states of reduced vigilance, near or during sleep. They also occur in a clinical context, for instance in patients with epilepsy. Context matters, because it tells us where to look.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Relatările seamănă între ele: ești întins, dar privești patul de sus; camera e aceeași, doar unghiul s-a schimbat; poate te simți ușor, poate te sperii. Un studiu din 1999 despre paralizia în somn, semnat de Cheyne și colegii lui, a grupat experiențele de la marginea somnului în trei familii și a pus plutirea, zborul și ieșirea din corp într-una singură, legată de conflicte între semnalele de poziție și de mișcare ale corpului. Ce spun oamenii e deci coerent, chiar dacă explicația rămâne în discuție.",
				en: "The accounts resemble each other: you lie there, yet look down at the bed; the room is the same, only the angle has changed; perhaps you feel light, perhaps you are frightened. A 1999 study of sleep paralysis by Cheyne and colleagues grouped the experiences at the edge of sleep into three families and placed floating, flying and leaving the body in a single one, tied to conflicts between the body’s signals of position and movement. What people say is therefore coherent, even if the explanation remains under discussion.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce a arătat stimularea creierului în 2002?",
				en: "What did brain stimulation show in 2002?",
			},
		},
		{
			type: "p",
			text: {
				ro: "În 2002, echipa lui Blanke a evaluat o pacientă care urma să fie operată pentru epilepsie. Pentru a găsi zona bolnavă, medicii stimulează electric, cu electrozi, suprafața creierului. Când au stimulat girusul angular drept, pacienta a avut în mod repetat senzația de a fi în afara corpului. La același loc au apărut iluzii în brațe și picioare și senzația de deplasare a întregului corp.",
				en: "In 2002, Blanke’s team evaluated a patient who was due for epilepsy surgery. To find the diseased area, doctors stimulate the surface of the brain electrically, with electrodes. When they stimulated the right angular gyrus, the patient repeatedly had the sensation of being outside her body. At the same site there were illusions in her arms and legs and a sense of whole-body displacement.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Autorii au tras o concluzie prudentă: experiențele extracorporale ar putea reflecta o eșuare a creierului în a integra informațiile complexe ale pielii și mușchilor cu cele ale echilibrului. Cu alte cuvinte, „eul” e un fel de cusătură făcută din semnale diferite; când cusătura se desface, locul de unde te privești se poate muta.",
				en: "The authors drew a cautious conclusion: out-of-body experiences may reflect a failure of the brain to integrate complex skin-and-muscle information with that of balance. In other words, the “self” is a kind of seam sewn from different signals; when the seam comes undone, the place from which you view yourself can move.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Limita e la fel de importantă: un singur caz, la o persoană cu epilepsie. Nu putem spune că toate experiențele extracorporale ale tuturor oamenilor pornesc din acel punct, și lucrarea nu o spune.",
				en: "The limit matters just as much: a single case, in a person with epilepsy. We cannot say that all out-of-body experiences of all people start from that point, and the paper does not say so.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce spun studiile pe voluntari sănătoși despre joncțiunea temporo-parietală?",
				en: "What do studies on healthy volunteers say about the temporoparietal junction?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Joncțiunea temporo-parietală (TPJ) este zona în care lobul temporal se întâlnește cu cel parietal, undeva în dreptul urechii. Într-un studiu din 2005, Blanke și colegii au cerut unor voluntari sănătoși să-și imagineze corpul din poziția și perspectiva descrise de cei cu experiențe spontane. Zona s-a activat între 330 și 400 de milisecunde după stimul, iar când a fost perturbată cu stimulare magnetică transcraniană, imaginarea corpului propriu a devenit mai greoaie. Imaginarea unor obiecte nu a fost afectată.",
				en: "The temporoparietal junction (TPJ) is where the temporal lobe meets the parietal lobe, roughly level with the ear. In a 2005 study, Blanke and colleagues asked healthy volunteers to imagine their body in the position and perspective described by people with spontaneous experiences. The area activated between 330 and 400 milliseconds after the stimulus, and when it was disturbed with transcranial magnetic stimulation, imagining one’s own body became harder. Imagining objects was not affected.",
			},
		},
		{
			type: "p",
			text: {
				ro: "În același studiu, o pacientă cu experiențe extracorporale pornite din TPJ a arătat o activare parțială a focarului crizelor atunci când își imagina corpul în acele poziții. Un an după, o altă echipă a descris cum stimularea TPJ stâng a produs la un pacient senzația că cineva stă lângă el, în umbră, și îi imită postura. Toate acestea susțin ideea că TPJ ajută la așezarea corpului în spațiu. Nu spun că ar fi „zona experienței extracorporale” și atât.",
				en: "In the same study, a patient with out-of-body experiences arising from the TPJ showed partial activation of her seizure focus when she imagined her body in those positions. A year later another team described how stimulating the left TPJ produced in a patient the sense that someone stood beside him, in shadow, mirroring his posture. All this supports the idea that the TPJ helps to place the body in space. It does not say that it is “the out-of-body area”, and that is all.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Pot fi provocate iluzii de corp la oameni sănătoși?",
				en: "Can body illusions be provoked in healthy people?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Da, fără electrozi. În 2007, două echipe au publicat în Science experimente asemănătoare ca idee. La Henrik Ehrsson, participanții purtau ochelari care le arătau imaginea unei camere plasate în spatele lor, deci se vedeau pe ei înșiși din exterior; cu atingeri sincronizate pe corp, mulți au spus că se simt localizați în afara corpului, privindu-l de acolo.",
				en: "Yes, without electrodes. In 2007, two teams published experiments in Science that were similar in idea. In Henrik Ehrsson’s, participants wore goggles that showed the view of a camera placed behind them, so they saw themselves from outside; with synchronised touches on the body, many said they felt located outside their body, looking at it from there.",
			},
		},
		{
			type: "p",
			text: {
				ro: "La Bigna Lenggenhager și colegii, în realitate virtuală, un corp virtual vedea fața în fața participantului. În condiții de conflict între ce vedeau și ce simțeau, participanții au simțit că acel corp virtual este al lor și s-au situat pe ei înșiși într-un punct din afara limitelor corpului. Concluzia ambelor lucrări: sentimentul de a fi „în” corp depinde de perspectiva vizuală și de semnale multisenzoriale corelate.",
				en: "In Bigna Lenggenhager and colleagues’ virtual-reality study, a virtual body was seen in front of the participant. Under conflict between what they saw and what they felt, participants felt that the virtual body was their own and located themselves at a point outside their bodily borders. The conclusion of both papers: the sense of being “in” the body depends on visual perspective and on correlated multisensory signals.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aceste iluzii sunt scurte, controlate și produse de un exercițiu. Sunt rudele de laborator ale unei experiențe spontane, dar nu sunt aceeași experiență. Cei care le-au trăit nu spun „am plecat din cameră”, ci „am simțit că sunt acolo”. Distincția e fină și onestă.",
				en: "These illusions are short, controlled and produced by a procedure. They are laboratory cousins of a spontaneous experience, but not the same experience. Those who went through them do not say “I left the room”, but “I felt I was there”. The distinction is fine and honest.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce spune lucrarea de sinteză din 2024 despre experiențele de la marginea somnului?",
				en: "What does the 2024 review say about experiences at the edge of sleep?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru cine a trăit experiența în pat, seara, aceasta este lucrarea cea mai apropiată. Campillo-Ferrer și colegii, între care Olaf Blanke, au publicat în 2024, în Neuroscience and Biobehavioral Reviews, o sinteză teoretică despre experiențele extracorporale legate de somn. Ei formulează o ipoteză: păstrarea conștienței în trecerea de la veghe la somnul REM (perioadele REM de la adormire) ar putea facilita experiențele extracorporale din somn.",
				en: "For anyone who lived the experience in bed, in the evening, this is the nearest paper. Campillo-Ferrer and colleagues, among them Olaf Blanke, published in 2024, in Neuroscience and Biobehavioral Reviews, a theoretical review of sleep-related out-of-body experiences. They put forward a hypothesis: maintaining consciousness during the passage from waking into REM sleep (sleep-onset REM periods) may facilitate sleep-related out-of-body experiences.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pe baza ei propun un model conceptual care deosebește aceste experiențe de visul lucid (când îți dai seama că visezi) și de paralizia în somn (când te trezești incapabil să te miști). Mai propun o punte spre experiențele extracorporale din timpul zilei, folosind ideea că creierul face predicții despre corp și le corectează.",
				en: "On that basis they propose a conceptual model that distinguishes these experiences from lucid dreaming (realising you are dreaming) and from sleep paralysis (waking unable to move). They also propose a bridge to out-of-body experiences in the daytime, using the idea that the brain makes predictions about the body and corrects them.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aici limita este clară, iar autorii nu o ascund: este o sinteză teoretică și un model, nu un experiment care a dovedit ipoteza. Despre neurofiziologia experiențelor spontane, spun ei, se știe încă puțin.",
				en: "Here the limit is clear, and the authors do not hide it: it is a theoretical review and a model, not an experiment that proved the hypothesis. About the neurophysiology of spontaneous experiences, they say, little is known.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un mic ghid pentru cine citește studii: întreabă câți participanți au fost, dacă situația seamănă cu experiența de zi cu zi, dacă rezultatul a fost repetat de alții și ce spun autorii înșiși despre limite. În lucrările de mai sus, autorii spun deschis ce au și ce nu au arătat; asta e un semn bun, nu unul de slăbiciune.",
				en: "A small guide for anyone reading studies: ask how many participants there were, whether the situation resembles everyday experience, whether others repeated the result and what the authors themselves say about limits. In the papers above, the authors say openly what they have and have not shown; that is a good sign, not a weak one.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce o astfel de experiență poate părea atât de reală?",
				en: "Why can such an experience feel so real?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru că, în ceea ce construiește creierul, nu există „copie” și „original”. Creierul nu are acces direct la lume; are semnale și predicții. Când ceea ce vezi, simți și echilibrezi se potrivește, ești liniștit în corpul tău. Când nu se potrivește, un model nou, la fel de coerent, poate umple golul, și experiența poartă toate marcajele realului: claritate, culoare, pondere emoțională.",
				en: "Because, in what the brain builds, there is no “copy” and “original”. The brain has no direct access to the world; it has signals and predictions. When what you see, feel and balance matches, you are quietly at home in your body. When it does not match, a new model, just as coherent, can fill the gap, and the experience carries all the marks of the real: clarity, colour, emotional weight.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Asta nu înseamnă „e doar imaginație”. Un lucru construit de creier e o experiență reală pentru cel care o trăiește, la fel cum durerea unui membru fantomă e reală. Întrebarea științifică se mută: nu „a fost real?”, ci „ce a făcut creierul ca s-o producă?”",
				en: "That does not mean “it is just imagination”. Something built by the brain is a real experience for the person who lives it, just as the pain of a phantom limb is real. The scientific question shifts: not “was it real?”, but “what did the brain do to produce it?”",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce rămâne deschis?",
				en: "What remains open?",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Ce se întâmplă, pas cu pas, în creier la o experiență spontană din timpul somnului. Lucrarea din 2024 spune că se știe încă puțin.",
					en: "What happens, step by step, in the brain in a spontaneous experience during sleep. The 2024 paper says that little is known.",
				},
				{
					ro: "Cât din ceea ce se vede la o pacientă cu epilepsie se aplică la oameni sănătoși.",
					en: "How much of what is seen in a patient with epilepsy applies to healthy people.",
				},
				{
					ro: "Cât de apropiate sunt iluziile din laborator de experiențele spontane, pe care oamenii le descriu ca fiind mai vii.",
					en: "How close the laboratory illusions are to spontaneous experiences, which people describe as more vivid.",
				},
				{
					ro: "Dacă modelul trecerii prin somnul REM, propus în 2024, rezistă la teste directe.",
					en: "Whether the REM-transition model proposed in 2024 holds up under direct tests.",
				},
				{
					ro: "Ce schimbă experiența în viața celui care o trăiește, o întrebare care ține mai mult de psihologie decât de neuroștiință.",
					en: "What the experience changes in the life of the person who has it, a question closer to psychology than to neuroscience.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Nimic din lista aceasta nu cere să alegi tabăra. Poți ține laolaltă o curiozitate respectuoasă față de ceea ce povestesc oamenii și o exigență față de ceea ce s-a demonstrat.",
				en: "Nothing in this list asks you to pick a side. You can hold together a respectful curiosity about what people report and a demand for what has been demonstrated.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Unde se așază Hemi-Sync® în tot acest tablou?",
				en: "Where does Hemi-Sync® sit in all this?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Întrebările frecvente de pe site-ul Hemi-Sync® spun că o experiență extracorporală nu poate fi garantată și că depinde de factori ca convingerile personale și barierele de teamă. Exercițiile Hemi-Sync® sunt, în limba casei, instrumente de explorare a atenției, nu tratament și nu dispozitiv medical. Ele nu dovedesc nimic despre ce se află în afara corpului; oferă un cadru liniștit în care unii ascultători își observă propriile stări.",
				en: "The Hemi-Sync® site’s frequently asked questions say that an out-of-body experience cannot be guaranteed and depends on factors such as personal beliefs and barriers of fear. Hemi-Sync® exercises are, in the house’s own language, tools for exploring attention, not a treatment and not a medical device. They prove nothing about what lies outside the body; they offer a quiet setting in which some listeners observe their own states.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă ai epilepsie sau crize, vorbește mai întâi cu medicul tău despre audio binaural. Iar dacă vrei să mergi mai departe pe firul acesta, citește „Ce este experiența extracorporală”, unde definim termenii și povestim, fără pretenții, cum o descriu oamenii.",
				en: "If you have epilepsy or seizures, talk to your doctor first about binaural audio. And if you want to follow this thread further, read “What is an out-of-body experience”, where we define the terms and tell, without pretension, how people describe it.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Blanke et al., 2002, Nature: Stimulating illusory own-body perceptions (PubMed)",
				en: "Blanke et al., 2002, Nature: Stimulating illusory own-body perceptions (PubMed)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/12239558/",
		},
		{
			label: {
				ro: "Blanke et al., 2005, Journal of Neuroscience: joncțiunea temporo-parietală și imaginarea corpului (PMC)",
				en: "Blanke et al., 2005, Journal of Neuroscience: the temporoparietal junction and own-body imagery (PMC)",
			},
			href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6725328/",
		},
		{
			label: {
				ro: "Ehrsson, 2007, Science: The experimental induction of out-of-body experiences (PubMed)",
				en: "Ehrsson, 2007, Science: The experimental induction of out-of-body experiences (PubMed)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/17717177/",
		},
		{
			label: {
				ro: "Lenggenhager et al., 2007, Science: Video ergo sum (PubMed)",
				en: "Lenggenhager et al., 2007, Science: Video ergo sum (PubMed)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/17717189/",
		},
		{
			label: {
				ro: "Campillo-Ferrer et al., 2024: experiențele extracorporale, visul lucid și paralizia în somn (PubMed)",
				en: "Campillo-Ferrer et al., 2024: out-of-body experiences, lucid dreaming and sleep paralysis (PubMed)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/38880408/",
		},
		{
			label: {
				ro: "Arzy et al., 2006, Nature: Induction of an illusory shadow person (PubMed)",
				en: "Arzy et al., 2006, Nature: Induction of an illusory shadow person (PubMed)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/16988702/",
		},
		{
			label: {
				ro: "Hemi-Sync®: pagina oficială și întrebările frecvente (experiența extracorporală nu se garantează)",
				en: "Hemi-Sync®: the official site and its FAQ (an out-of-body experience cannot be guaranteed)",
			},
			href: "https://www.hemi-sync.com",
		},
	],
	provenance: [
		"https://pubmed.ncbi.nlm.nih.gov/12239558/ (Blanke 2002, abstract: repeated induction in one patient by right angular gyrus stimulation; limb illusions; vestibular responses; failure to integrate)",
		"https://pmc.ncbi.nlm.nih.gov/articles/PMC6725328/ (Blanke 2005, abstract: TPJ activation 330-400 ms, TMS impairment for own-body imagery, patient with OBEs from the TPJ)",
		"https://pubmed.ncbi.nlm.nih.gov/17717177/ and https://pubmed.ncbi.nlm.nih.gov/17717189/ (Ehrsson and Lenggenhager 2007, abstracts)",
		"https://pubmed.ncbi.nlm.nih.gov/38880408/ (Campillo-Ferrer 2024, abstract: sleep-onset REM hypothesis, conceptual model, predictive coding; theoretical review)",
		"https://pubmed.ncbi.nlm.nih.gov/16988702/ (Arzy 2006, abstract: left TPJ shadow person)",
		"https://www.hemi-sync.com (FAQ: an OBE cannot be guaranteed, depends on personal beliefs and fear barriers)",
		"Cover image: Tiia Monto (Kulmalukko), “Bucegi - fog”, Wikimedia Commons, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Bucegi_-_fog.jpg",
		"docs/brands/writing-voice.md and packages/design/brand-books/3-hemi-sync.md (voice, experience not fact, epilepsy line)",
	],
	seo: {
		title: {
			ro: "Experiență extracorporală: explicația științifică, pe scurt",
			en: "Out of body experience science explanation: what is proven",
		},
		description: {
			ro: "Ce arată studiile despre senzația de a fi în afara corpului: joncțiunea temporo-parietală, iluziile în realitate virtuală, somnul REM și ce rămâne deschis.",
			en: "What studies show about the sense of being outside the body: the temporoparietal junction, virtual-reality illusions, REM sleep, and what remains open.",
		},
		keywords: {
			ro: [
				"experiență extracorporală explicație științifică",
				"experiența extracorporală neuroștiință",
				"joncțiunea temporo-parietală",
				"iluzii de corp",
				"Olaf Blanke",
				"experiențe extracorporale în somn",
			],
			en: [
				"out of body experience science explanation",
				"out of body experience neuroscience",
				"temporoparietal junction",
				"body illusions",
				"Olaf Blanke",
				"sleep-related out of body experiences",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Poate știința explica experiențele extracorporale?",
				en: "Can science explain out-of-body experiences?",
			},
			a: {
				ro: "Parțial. Laboratoarele au provocat senzația de a fi în afara corpului prin stimularea creierului la o pacientă cu epilepsie și prin iluzii în realitate virtuală la voluntari, și au identificat zone implicate, mai ales joncțiunea temporo-parietală. Ele explică ce construiește creierul. Nu pot spune dacă experiența înseamnă mai mult decât atât.",
				en: "In part. Laboratories have provoked the sensation of being outside the body by brain stimulation in a patient with epilepsy and by virtual-reality illusions in volunteers, and have identified areas involved, above all the temporoparietal junction. They explain what the brain builds. They cannot say whether the experience means more than that.",
			},
		},
		{
			q: {
				ro: "Ce este joncțiunea temporo-parietală?",
				en: "What is the temporoparietal junction?",
			},
			a: {
				ro: "Este zona în care lobul temporal se întâlnește cu cel parietal, în dreptul urechii. Studiile lui Blanke și ale colegilor lui arată că participă la imaginarea propriului corp într-o anumită perspectivă și că stimularea ei poate produce senzații de corp străine. Rolul ei nu se reduce la experiențele extracorporale.",
				en: "It is the area where the temporal lobe meets the parietal lobe, level with the ear. Studies by Blanke and colleagues show that it takes part in imagining one’s own body from a certain perspective and that stimulating it can produce unusual body sensations. Its role is not limited to out-of-body experiences.",
			},
		},
		{
			q: {
				ro: "Sunt iluziile din realitatea virtuală la fel cu o experiență extracorporală?",
				en: "Are virtual-reality illusions the same as an out-of-body experience?",
			},
			a: {
				ro: "Nu. Sunt scurte, controlate și provocate de un dispozitiv, iar participanții spun mai degrabă că se simt localizați într-un alt loc decât că au plecat din cameră. Ele arată însă că sentimentul de a fi în corp depinde de perspectiva vizuală și de semnale multisenzoriale corelate, ceea ce e în sine un rezultat important.",
				en: "No. They are short, controlled and produced by a device, and participants say they feel located in another place rather than that they left the room. But they show that the sense of being in the body depends on visual perspective and on correlated multisensory signals, which is an important result in itself.",
			},
		},
		{
			q: {
				ro: "Ce spune cercetarea despre experiențele extracorporale din somn?",
				en: "What does research say about out-of-body experiences in sleep?",
			},
			a: {
				ro: "O sinteză din 2024, semnată de Campillo-Ferrer, Blanke și colegii lor, propune ipoteza că păstrarea conștienței la trecerea de la veghe la somnul REM poate facilita aceste experiențe. Este o sinteză teoretică și un model conceptual, nu o dovadă experimentală; autorii spun că se știe încă puțin despre neurofiziologia lor.",
				en: "A 2024 review by Campillo-Ferrer, Blanke and colleagues puts forward the hypothesis that maintaining consciousness in the passage from waking to REM sleep may facilitate these experiences. It is a theoretical review and a conceptual model, not experimental proof; the authors say little is known about their neurophysiology.",
			},
		},
		{
			q: {
				ro: "Înseamnă explicația științifică faptul că experiența nu e reală?",
				en: "Does a scientific explanation mean the experience is not real?",
			},
			a: {
				ro: "Nu. Ce construiește creierul este o experiență reală pentru cel care o trăiește, la fel ca durerea unui membru fantomă. Știința nu spune „n-ai trăit asta”, ci încearcă să afle ce face creierul când o produce. Dacă mai este ceva dincolo de asta, rămâne o întrebare deschisă, pe care laboratoarele de azi nu o pot testa.",
				en: "No. What the brain builds is a real experience for the person who lives it, like the pain of a phantom limb. Science does not say “you did not live this”; it tries to find out what the brain does when it produces it. Whether there is anything beyond that remains an open question, one today’s laboratories cannot test.",
			},
		},
	],
	related: [
		"ce-este-experienta-extracorporala",
		"experienta-aproape-de-moarte-ce-descriu-oamenii",
		"istoria-cercetarii-constiintei",
		"paralizia-in-somn-si-senzatia-de-iesire-din-corp",
	],
};
