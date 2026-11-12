import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "mituri-despre-autism",
	brand: "psizone",
	topic: "autism",
	backlogNo: null,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Mituri despre autism: ce e adevărat și ce nu",
		en: "Autism myths: what is true and what is not",
	},
	standfirst: {
		ro: "Autismul nu e cauzat de educație sau de părinți „reci”, nu e cauzat de vaccinuri, nu înseamnă lipsă de empatie și nu „trece” odată cu vârsta. Nu este nici o scară de la ușor la greu: este un spectru, cu abilități și nevoi diferite de la o persoană la alta. Mai jos, fiecare credință, pe rând.",
		en: "Autism is not caused by upbringing or “cold” parents, is not caused by vaccines, does not mean a lack of empathy and does not simply “pass” with age. Nor is it a ladder from mild to severe: it is a spectrum, with different abilities and needs in each person. Below, each belief in turn.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "La masa de duminică, cineva spune: „Eu am citit că e de la vaccin.” Altcineva: „Stai, că o să vorbească el când o fi gata, și Einstein a vorbit târziu.” Și apoi, mai încet, cu intenție bună: „Poate ai fi trebuit să-l duci mai des la joacă.” Dacă ai trecut printr-o astfel de masă, nu ești singur. Sfaturile contradictorii vin din dragoste, dar pot răni.",
				en: "At Sunday lunch, someone says: “I read it’s from the vaccine.” Someone else: “Wait, he’ll talk when he’s ready, Einstein spoke late too.” And then, more quietly, with good intentions: “Maybe you should have taken him to play more often.” If you have sat through a table like that, you are not alone. Contradictory advice comes from love, but it can hurt.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Luăm mai jos câteva credințe frecvente și răspundem fiecăreia direct, cu ce se știe din sursele pe care le-am deschis: OMS, NHS, CDC, Cochrane și literatura de specialitate. Unde știința nu a spus ultimul cuvânt, spunem asta. Nu e un articol de convins pe nimeni; e unul de folosit la nevoie.",
				en: "Below are some common beliefs, each answered directly with what is known from the sources we opened: WHO, NHS, CDC, Cochrane and the specialist literature. Where science has not said its last word, we say so. This is not an article for winning arguments; it is one to use when you need it.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "E cauzat autismul de felul în care ai crescut copilul?",
				en: "Is autism caused by the way you raised your child?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu. CDC spune că autismul este cauzat de diferențe în creier și că nu are o singură cauză; OMS vorbește despre mai mulți factori, genetici și de mediu, care acționează împreună. Nici una dintre aceste surse nu pune în cauză felul în care părinții își cresc copiii. NHS spune că autismul este prezent de la naștere și că nu este o boală.",
				en: "No. The CDC says autism is caused by differences in the brain and has no single cause; the WHO speaks of several factors, genetic and environmental, acting together. Neither source points to how parents raise their children. The NHS says autism is present from birth and is not an illness.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ideea că părinții „reci” produc autism, așa-numita teorie a „mamei-frigider”, a circulat în secolul trecut. O descriere istorică din 2020, publicată în History of Psychiatry, arată cum psihologul Bruno Bettelheim a legat autismul de mame lipsite de afecțiune și a propus chiar separarea copiilor de mame. Teoria nu are sprijin în ceea ce știm astăzi, iar efectul ei a fost să culpabilizeze familii care aveau nevoie de ajutor. Dacă cineva îți sugerează că ai fi „prea rece” sau „prea moale”, poți spune: „Specialiștii spun altceva, iar eu fac ce pot cu ce știu.”",
				en: "The idea that “cold” parents produce autism, the so-called “refrigerator mother” theory, circulated in the last century. A 2020 historical account in History of Psychiatry shows how the psychologist Bruno Bettelheim tied autism to affectionless mothers and even proposed separating children from them. The theory has no support in what we know today, and its effect was to blame families who needed help. If someone suggests you are “too cold” or “too soft”, you can say: “Specialists say otherwise, and I am doing what I can with what I know.”",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cauzează vaccinurile autism?",
				en: "Do vaccines cause autism?",
			},
		},
		{
			type: "p",
			text: {
				ro: "OMS scrie, pe baza unor cercetări ample, că vaccinul împotriva rujeolei, oreionului și rubeolei (ROR) nu cauzează autism. Studiul care sugera o legătură a fost retras după ce s-a dovedit greșit și fraudulos; The Lancet a publicat retragerea în 2010, la douăsprezece ani după articolul din 1998. OMS adaugă că nici alte vaccinuri din copilărie și nici conservanții sau aditivii lor nu au fost asociați cu un risc mai mare de autism.",
				en: "The WHO writes, on the basis of extensive research, that the measles, mumps and rubella (MMR) vaccine does not cause autism. The study that suggested a link was retracted after it was found wrong and fraudulent; The Lancet published the retraction in 2010, twelve years after the 1998 paper. The WHO adds that other childhood vaccines, and their preservatives and additives, have likewise not been shown to raise autism risk.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Revizuirea Cochrane despre vaccinul ROR, care a căutat studii până în mai 2019, a inclus două studii observaționale pe 1.194.764 de copii pentru autism și nu a găsit niciun risc crescut: raportul de risc a fost 0,93 (interval de încredere 0,85–1,01), cu încredere moderată în dovezi. NHS spune și el că autismul nu este cauzat de vaccinuri. Dacă ai o întrebare despre un vaccin anume, discut-o cu medicul copilului, nu cu un comentariu de pe internet.",
				en: "The Cochrane review of the MMR vaccine, which searched for studies up to May 2019, included two observational studies of 1,194,764 children for autism and found no increased risk: the rate ratio was 0.93 (95% confidence interval 0.85 to 1.01), with moderate certainty of evidence. The NHS also says autism is not caused by vaccines. If you have a question about a specific vaccine, discuss it with your child’s doctor, not with a comment found online.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "„Nu face contact vizual, deci nu simte”: lipsește empatia?",
				en: "“He doesn’t make eye contact, so he doesn’t feel”: is empathy missing?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Contactul vizual redus este un semn pe care NHS îl enumeră printre semnele autismului la copii mici, alături de mai puține expresii ale feței și gesturi. Dar un semn de comunicare nu este o dovadă de lipsă de sentimente. Mulți copii autiști simt foarte puternic, doar că nu o arată, nu o spun sau o arată în alt fel: se retrag, se agită, aduc un obiect, stau aproape.",
				en: "Reduced eye contact is a sign the NHS lists among signs of autism in young children, alongside fewer facial expressions and gestures. But a sign of communication is not proof of absent feeling. Many autistic children feel very strongly, but they do not show it, do not say it, or show it differently: they withdraw, get agitated, bring an object, stay close.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cercetătorii dezbat încă această zonă. Bird și Cook au propus în 2013, în Translational Psychiatry, o ipoteză: dificultățile emoționale observate la unele persoane autiste ar veni din alexitimie, adică dificultatea de a recunoaște și de a descrie propriile emoții, o stare care apare adesea împreună cu autismul, și nu din autismul în sine. Este o ipoteză, nu un fapt stabilit, dar arată cât de nuanțată e imaginea față de ideea simplă că „nu simt”.",
				en: "Researchers still debate this area. Bird and Cook proposed in 2013, in Translational Psychiatry, a hypothesis: the emotional difficulties seen in some autistic people may come from alexithymia, meaning difficulty recognising and describing one’s own emotions, a state that often occurs alongside autism, rather than from autism itself. It is a hypothesis, not a settled fact, but it shows how much more nuanced the picture is than the simple idea that “they don’t feel”.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "„Va crește și va trece”: dispare autismul odată cu vârsta?",
				en: "“He’ll grow out of it”: does autism go away with age?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu. CDC descrie tulburarea de spectru autist ca pe o dizabilitate de dezvoltare care începe înainte de 3 ani și poate dura toată viața. NHS o numește o diferență în felul în care se dezvoltă creierul. Ce se poate schimba este felul în care se vede: OMS notează că nevoile și abilitățile diferă mult și se pot schimba în timp.",
				en: "No. The CDC describes autism spectrum disorder as a developmental disability that begins before age 3 and can last a lifetime. The NHS calls it a difference in how the brain develops. What can change is how it shows: the WHO notes that needs and abilities differ widely and can change over time.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pericolul acestei credințe este timpul pierdut. Un copil care „o să vorbească când o fi gata” poate avea nevoie de sprijin acum. OMS spune că intervențiile psihosociale timpurii bazate pe dovezi pot îmbunătăți comunicarea și abilitățile sociale, iar CDC notează că intervenția la orice vârstă poate ajuta. Dacă te îngrijorează ceva, un consult nu strică niciodată.",
				en: "The danger of this belief is lost time. A child who “will talk when he’s ready” may need support now. The WHO says early evidence-based psychosocial interventions can improve communication and social skills, and the CDC notes that intervention at any age can help. If something worries you, a consultation never does harm.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Pot diete speciale sau suplimente să „vindece” autismul?",
				en: "Can special diets or supplements “cure” autism?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu cunoaștem nicio dietă sau vreun supliment despre care sursele pe care le-am deschis să spună că tratează autismul, și nu promitem asta. CDC enumeră dietele speciale și suplimentele pe bază de plante printre abordările complementare, folosite de multe ori alături de cele obișnuite, și îți recomandă să vorbești cu medicul înainte de a începe. NHS spune că nu există tratament sau leac pentru autism, ci modalități de a-l gestiona și de a obține sprijin. CDC mai spune că nu există medicamente pentru simptomele de bază, doar pentru probleme care îl pot însoți, precum anxietatea sau somnul.",
				en: "We know of no diet or supplement that the sources we opened say treats autism, and we do not promise that. The CDC lists special diets and herbal supplements among complementary approaches, often used alongside conventional ones, and advises you to talk to a doctor before starting. The NHS says there is no treatment or cure for autism, but ways of managing it and getting support. The CDC also says no medicines treat the core symptoms, only problems that may accompany them, such as anxiety or sleep.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă un copil mănâncă foarte puțin sau foarte selectiv, asta merită discutat cu medicul pediatru și, eventual, cu un nutriționist, pentru că poate afecta creșterea. Orice dietă, mai ales una care exclude grupe întregi de alimente, se discută cu un medic înainte, nu după.",
				en: "If a child eats very little or very selectively, that deserves discussion with the paediatrician and perhaps a dietitian, because it can affect growth. Any diet, especially one that excludes whole food groups, is discussed with a doctor before, not after.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Autism și inteligență: sunt toți copiii autiști geniali, sau cu dizabilități?",
				en: "Autism and intelligence: are all autistic children geniuses, or all disabled?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Niciuna dintre variante. OMS spune că funcționarea intelectuală la persoanele autiste merge de la deficit profund până la niveluri superioare. NHS notează că unele persoane au dizabilitate de învățare, iar altele au inteligență medie sau peste medie. Filmele ne-au obișnuit cu „geniul” autist, iar internetul cu opusul. Realitatea este un amestec mare de oameni.",
				en: "Neither. The WHO says intellectual functioning in autistic people ranges from profound impairment to superior levels. The NHS notes that some people have a learning disability, while others have average or above-average intelligence. Films have accustomed us to the autistic “genius”, and the internet to the opposite. Reality is a large mixture of people.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cum se poate spune într-o conversație: „Copilul meu e autist. Ca orice copil, are lucruri la care se pricepe și lucruri la care are nevoie de ajutor. Hai să-l cunoști.”",
				en: "How to say it in conversation: “My child is autistic. Like any child, he has things he is good at and things he needs help with. Come and get to know him.”",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Autismul este un spectru, nu o scară de la „ușor” la „greu”",
				en: "Autism is a spectrum, not a ladder from “mild” to “severe”",
			},
		},
		{
			type: "p",
			text: {
				ro: "„Autism ușor” și „autism sever” sunt etichete care induc în eroare. CDC arată că abilitățile variază mult: unii au conversații avansate, alții sunt non-verbali, unii au nevoie de ajutor zilnic substanțial, alții muncesc și locuiesc cu puțin sprijin sau deloc. Dar o persoană poate fi foarte bună la vorbit și foarte epuizată de zgomot, sau poate să nu vorbească deloc și să înțeleagă totul.",
				en: "“Mild autism” and “severe autism” are misleading labels. The CDC shows that abilities vary widely: some people have advanced conversation skills, others are non-verbal, some need substantial daily help, others work and live with little or no support. But a person can be very good at speaking and exhausted by noise, or not speak at all and understand everything.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Spectrul seamană mai degrabă cu o consolă de mixaj cu mai multe butoane: comunicare, senzorialitate, flexibilitate, atenție, nevoia de ajutor la viața de zi cu zi. Fiecare persoană are alte setări, care se pot schimba în timp și în funcție de zi. De aceea, planul de sprijin se face pe persoană, nu pe etichetă.",
				en: "The spectrum is more like a mixing desk with many dials: communication, sensory processing, flexibility, attention, need for help in daily life. Each person has different settings, which can change over time and from day to day. That is why a support plan is made for the person, not the label.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce le spui rudelor care repetă mituri?",
				en: "What do you say to relatives who repeat myths?",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Vaccin: „Medicii și OMS au studiat asta pe peste un milion de copii și spun că nu există legătură. Dacă vrei, îți arăt sursa.”",
					en: "Vaccines: “Doctors and the WHO have studied this in huge numbers of children and say there is no link. If you like, I’ll show you the source.”",
				},
				{
					ro: "Vina părinților: „Nu e din cauza felului în care l-am crescut. Specialiștii spun că e o diferență în dezvoltarea creierului.”",
					en: "Parental blame: “It isn’t because of how we raised him. Specialists say it is a difference in how the brain develops.”",
				},
				{
					ro: "„Va trece”: „Nu trece, dar îl putem ajuta să se descurce mai bine. Asta facem acum.”",
					en: "“He’ll grow out of it”: “It doesn’t go away, but we can help him manage better. That’s what we’re doing now.”",
				},
				{
					ro: "„Nu simte nimic”: „Simte, dar o arată altfel. Dacă stai lângă el fără să-i ceri să te privească, o să vezi.”",
					en: "“He doesn’t feel anything”: “He does, he just shows it differently. If you sit beside him without asking him to look at you, you’ll see.”",
				},
				{
					ro: "Dietă sau minune: „Mulțumesc că te gândești la el. Orice schimbare o discut întâi cu medicul.”",
					en: "Diet or miracle: “Thank you for thinking of him. Any change I discuss with the doctor first.”",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Mai bine decât o respingere este, uneori, o invitație. Bunicii, mătușile și prietenii vor, în general, să ajute, dar nu știu cum. Spune-le un lucru concret: „Când vii, stai pe jos cu el și lasă-l să aleagă jocul”, sau „Dacă plânge de zgomot, nu e mofturos; hai să mergem într-o cameră mai liniștită.” O rudă care a primit o sarcină mică devine mai ușor un aliat decât una care a primit o lecție.",
				en: "Better than a rebuttal is, sometimes, an invitation. Grandparents, aunts and friends generally want to help but do not know how. Give them one concrete thing: “When you visit, sit on the floor with him and let him choose the game”, or “If he cries at the noise, he isn’t being fussy; let’s go to a quieter room.” A relative who has been given a small task becomes an ally more easily than one who has been given a lesson.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu ai de câștigat o dezbatere la masă. Ai de protejat un copil și un echilibru de familie. O frază calmă, repetată fără ton de ceartă, este de obicei suficientă. Iar unele rude vor avea nevoie de timp.",
				en: "You do not have a debate to win at the table. You have a child to protect and a family balance to keep. One calm sentence, repeated without quarrelling, is usually enough. And some relatives will need time.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un singur pas: dacă simți că ai nevoie de un răspuns pentru copilul tău, nu pentru toată familia, programează evaluarea la Psizone sau întreabă ghidul Psizone ce urmează. Prima discuție este despre voi, nu despre diagnostic.",
				en: "One step: if you feel you need an answer for your own child, not for the whole family, book an evaluation at Psizone or ask the Psizone guide what comes next. The first conversation is about you and your family, not about a diagnosis.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "OMS: Tulburările de spectru autist (fișă informativă)",
				en: "WHO: Autism spectrum disorders (fact sheet)",
			},
			href: "https://www.who.int/news-room/fact-sheets/detail/autism-spectrum-disorders",
		},
		{
			label: { ro: "NHS: Ce este autismul", en: "NHS: What is autism?" },
			href: "https://www.nhs.uk/conditions/autism/what-is-autism/",
		},
		{
			label: {
				ro: "Cochrane: vaccinul ROR la copii (inclusiv autism)",
				en: "Cochrane: Vaccines for measles, mumps and rubella in children (including autism)",
			},
			href: "https://www.cochrane.org/CD004407/BEHAV_vaccines-for-measles-mumps-and-rubella-in-children",
		},
		{
			label: {
				ro: "The Lancet, 2010: retragerea articolului din 1998",
				en: "The Lancet, 2010: retraction of the 1998 paper",
			},
			href: "https://doi.org/10.1016/S0140-6736(10)60175-4",
		},
		{
			label: { ro: "CDC: Despre autism", en: "CDC: About Autism Spectrum Disorder" },
			href: "https://www.cdc.gov/autism/about/index.html",
		},
		{
			label: {
				ro: "CDC: Tratamentul autismului",
				en: "CDC: Treatment of Autism Spectrum Disorder",
			},
			href: "https://www.cdc.gov/autism/treatment/index.html",
		},
		{
			label: {
				ro: "van Rosmalen și colab., History of Psychiatry 2020: „mama-frigider”",
				en: "van Rosmalen et al., History of Psychiatry 2020: the “refrigerator mother”",
			},
			href: "https://doi.org/10.1177/0957154x19898997",
		},
		{
			label: {
				ro: "Bird și Cook, Translational Psychiatry 2013: alexitimia în autism",
				en: "Bird and Cook, Translational Psychiatry 2013: alexithymia in autism",
			},
			href: "https://doi.org/10.1038/tp.2013.61",
		},
	],
	provenance: [
		"https://www.who.int/news-room/fact-sheets/detail/autism-spectrum-disorders: MMR does not cause autism; retracted fraudulent study; other vaccines; multiple factors; intellectual functioning range; needs change over time; early interventions",
		"https://www.cochrane.org/CD004407/BEHAV_vaccines-for-measles-mumps-and-rubella-in-children: 2 observational studies, 1,194,764 children, RR 0.93 (0.85 to 1.01), moderate certainty, search to 2 May 2019",
		"The Lancet 2010;375:445 retraction notice (Europe PMC record of PMID 20137807); original paper PMID 9500320 (1998)",
		"https://www.nhs.uk/conditions/autism/what-is-autism/: not an illness; not caused by vaccines; no cure; intelligence varies",
		"https://www.nhs.uk/conditions/autism/signs/: less eye contact as a sign",
		"https://www.cdc.gov/autism/about/index.html: differences in the brain; no single cause; begins before 3, lasts a lifetime; abilities vary",
		"https://www.cdc.gov/autism/treatment/index.html: diets and supplements as complementary, talk to a doctor; no medicines for core symptoms",
		"https://www.cdc.gov/act-early/about/developmental-monitoring-and-screening.html: intervention at any age can help",
		"History of Psychiatry 2020;31(2):227-231 (Europe PMC record of PMID 31969024); Bird and Cook, Transl Psychiatry 2013;3:e285 (PMID 23880881), presented as a hypothesis",
		"Not used: the CDC vaccine-safety page on autism, whose current text departs from WHO and Cochrane conclusions; a reviewer should decide whether the article needs to address it",
		"docs/brands/writing-voice.md: Ana narrator, claim rules",
	],
	seo: {
		title: {
			ro: "Mituri despre autism: ce e adevărat și ce nu, pe rând",
			en: "Autism myths and facts: what is true and what is not",
		},
		description: {
			ro: "Vaccinuri, părinți „reci”, lipsa empatiei, „trece cu vârsta”, diete, inteligență: răspunsuri directe la mituri frecvente despre autism, cu surse.",
			en: "Vaccines, “cold” parents, empathy, “growing out of it”, diets, intelligence: direct answers to common autism myths, with sources, and what to say to relatives.",
		},
		keywords: {
			ro: [
				"mituri despre autism",
				"autism cauze vaccin",
				"autismul trece cu vârsta",
				"autism și empatie",
				"diete pentru autism",
				"autism spectru nu scară",
			],
			en: [
				"autism myths and facts",
				"do vaccines cause autism",
				"does autism go away",
				"autism and empathy",
				"autism diets",
				"autism spectrum not a scale",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Cauzează vaccinul ROR autism?",
				en: "Does the MMR vaccine cause autism?",
			},
			a: {
				ro: "Nu. OMS scrie că vaccinul ROR nu cauzează autism, iar studiul care sugera o legătură a fost retras. Revizuirea Cochrane, cu două studii observaționale pe 1.194.764 de copii, nu a găsit un risc crescut (raport de risc 0,93, cu încredere moderată în dovezi). Pentru întrebări despre un vaccin anume, discută cu medicul copilului.",
				en: "No. The WHO writes that the MMR vaccine does not cause autism, and the study that suggested a link was retracted. The Cochrane review, with two observational studies of 1,194,764 children, found no increased risk (rate ratio 0.93, moderate certainty of evidence). For questions about a particular vaccine, talk to your child’s doctor.",
			},
		},
		{
			q: {
				ro: "Poate autismul să fie cauzat de părinți?",
				en: "Can autism be caused by parents?",
			},
			a: {
				ro: "Nu. CDC spune că autismul este cauzat de diferențe în creier, fără o singură cauză, iar OMS vorbește despre factori genetici și de mediu care acționează împreună. Teoria „mamei-frigider” a fost o idee a secolului trecut și nu are sprijin astăzi. Nu e vina ta.",
				en: "No. The CDC says autism is caused by differences in the brain, with no single cause, and the WHO speaks of genetic and environmental factors acting together. The “refrigerator mother” theory was an idea of the last century and has no support today. It is not your fault.",
			},
		},
		{
			q: {
				ro: "Un copil autist nu simte empatie?",
				en: "Do autistic children not feel empathy?",
			},
			a: {
				ro: "Nu se poate spune asta. Contactul vizual redus este un semn de comunicare, nu o dovadă de lipsă de sentimente. Mulți copii simt intens, dar o arată altfel. Cercetătorii dezbat încă subiectul; o ipoteză din 2013 leagă dificultățile emoționale de alexitimie, adică dificultatea de a-ți recunoaște propriile emoții, nu de autism în sine.",
				en: "That cannot be said. Reduced eye contact is a sign of communication, not proof of missing feelings. Many children feel intensely but show it differently. Researchers still debate the subject; a 2013 hypothesis links emotional difficulties to alexithymia, difficulty recognising one’s own emotions, rather than to autism itself.",
			},
		},
		{
			q: {
				ro: "Dispare autismul când copilul crește?",
				en: "Does autism go away as a child grows?",
			},
			a: {
				ro: "Nu. CDC îl descrie ca pe o dizabilitate de dezvoltare care începe înainte de 3 ani și poate dura toată viața. Nevoile și abilitățile se pot schimba în timp, iar sprijinul potrivit poate ajuta. A aștepta „să treacă” poate însemna timp pierdut, așa că merită să ceri un consult dacă te îngrijorează ceva.",
				en: "No. The CDC describes it as a developmental disability that begins before age 3 and can last a lifetime. Needs and abilities can change over time, and the right support can help. Waiting for it to “pass” can mean lost time, so it is worth asking for a consultation if something worries you.",
			},
		},
		{
			q: {
				ro: "Ajută dietele fără gluten și fără lactate?",
				en: "Do gluten-free and dairy-free diets help?",
			},
			a: {
				ro: "În sursele pe care le-am deschis nu am găsit afirmația că o dietă tratează autismul. CDC enumeră dietele speciale printre abordările complementare și recomandă discuția cu medicul înainte. O dietă restrictivă fără ghidaj poate afecta creșterea unui copil, mai ales dacă mănâncă deja selectiv.",
				en: "In the sources we opened we did not find a claim that any diet treats autism. The CDC lists special diets among complementary approaches and advises talking to a doctor first. A restrictive diet without guidance can affect a child’s growth, especially if they already eat selectively.",
			},
		},
		{
			q: {
				ro: "Ce înseamnă că autismul este un spectru?",
				en: "What does it mean that autism is a spectrum?",
			},
			a: {
				ro: "Înseamnă că oamenii autiști sunt foarte diferiți între ei. OMS spune că nevoile și abilitățile diferă mult și se pot schimba în timp, iar funcționarea intelectuală merge de la deficit profund la niveluri superioare. Nu e o scară de la „ușor” la „greu”, ci un profil diferit pentru fiecare persoană.",
				en: "It means that autistic people differ greatly from one another. The WHO says needs and abilities differ widely and can change over time, and intellectual functioning ranges from profound impairment to superior levels. It is not a ladder from “mild” to “severe” but a different profile for each person.",
			},
		},
	],
	related: [
		"terapia-aba-pe-intelees",
		"autism-la-fete-semne-mai-greu-de-vazut",
		"autism-nivel-1-2-3-ce-inseamna",
		"primele-semne-de-autism-pe-varste",
	],
};
