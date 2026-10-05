/**
 * What only the server says, in French (R55): the public site's pages, a notification's words, a
 * refusal's message, keyed by their English. The server's own catalog, merged with the app's
 * (`@caime/core/locales/fr`) at start and never downloaded by the app, so a page, a push or a
 * refusal costs no device anything. `node scripts/i18n-keys.mjs missing fr server` lists what it
 * lacks; `apps/server/test/server-i18n.test.ts` fails CI for it.
 */
import type { Catalog } from '@caime/core/i18n';

export const frServer: Catalog = {
  '{name} is on {site}.': '{name} est sur {site}.',
  'a person on {site}': 'une personne sur {site}',
  headline: 'titre',
  with: 'chez',
  'Message {name} on {site}': 'Écrire à {name} sur {site}',
  'Verified · {domain}': 'Vérifiée · {domain}',
  'Since {year}': 'Depuis {year}',
  'an organization on {site}': 'une organisation sur {site}',
  '{domain}, proved with a DNS record': '{domain}, prouvé par un enregistrement DNS',
  'Not yet': 'Pas encore',
  '{name} invited you': '{name} vous invite',
  'Join {name} on {site}{context}: sign up in half a minute and you’re connected.':
    'Rejoignez {name} sur {site}{context} : inscrivez-vous en une demi-minute et vous êtes en contact.',
  'an invitation': 'une invitation',
  from: 'de',
  about: 'sujet',
  'to join': 'pour rejoindre',
  'Sign up in half a minute and you’re connected with {name}, no app to install.':
    'Inscrivez-vous en une demi-minute et vous êtes en contact avec {name}, sans application à installer.',
  'Join {name} on {site}': 'Rejoindre {name} sur {site}',
  'Not here': 'Pas ici',
  'Nobody by that handle.': 'Personne avec cet identifiant.',
  'not here': 'pas ici',
  'Nobody by that handle': 'Personne avec cet identifiant',
  'It may have changed, or been let go of.': 'Il a peut-être changé ou été libéré.',
  'Open {site}': 'Ouvrir {site}',
  'Caime is messaging that knows who each person is to you: your family, your work, your customers, each in its place, with what needs you first. Free for people; organizations verify who they are.':
    'Caime est une messagerie qui sait qui est chaque personne pour vous : votre famille, votre travail, vos clients, chacun à sa place, avec ce qui a besoin de vous en premier. Gratuit pour les particuliers ; les organisations vérifient leur identité.',
  Home: 'Accueil',
  'For organizations': 'Pour les organisations',
  'for organizations': 'pour les organisations',
  Pricing: 'Tarifs',
  pricing: 'tarifs',
  'security and privacy': 'sécurité et confidentialité',
  Developers: 'Développeurs',
  developers: 'développeurs',
  About: 'À propos',
  Help: 'Aide',
  Example: 'Exemple',
  Connection: 'Contact',
  'Who someone is to you comes first.': 'D’abord, qui est chaque personne pour vous.',
  'A connection is two people and how they know each other, said by each side, private to each. Everything else in Caime hangs off it.':
    'Un contact, c’est deux personnes et la façon dont elles se connaissent, décrite par chacune et visible d’elle seule. Tout le reste de Caime en découle.',
  'colleague · DATA C · work': 'collègue · DATA C · travail',
  'brother · family': 'frère · famille',
  'Messages that know their context.': 'Des messages qui connaissent leur contexte.',
  'One-to-one, groups, topics under a connection, spaces for a family, a team or a club. Ordered, delivered once, and yours offline.':
    'En tête-à-tête, en groupe, en sujets au sein d’un contact, dans des espaces pour une famille, une équipe ou un club. Dans l’ordre, remis une seule fois, et disponibles hors ligne.',
  'Did the contract arrive?': 'Le contrat est arrivé ?',
  'Yes, signing it Friday.': 'Oui, je le signe vendredi.',
  'read · 2 min': 'lu · 2 min',
  'What needs you, not everything.': 'Ce qui a besoin de vous, pas tout le reste.',
  'The inbox sorts by what needs you, what’s important, what’s waiting on someone else and what’s quiet, and says why. Your rules by relationship win.':
    'La boîte de réception trie selon ce qui a besoin de vous, ce qui est important, ce qui attend quelqu’un d’autre et ce qui est discret, en disant pourquoi. Vos règles par relation l’emportent.',
  'Sarah asked about the contract': 'Sarah a demandé des nouvelles du contrat',
  'Omar · the deck · since Tuesday': 'Omar · la présentation · depuis mardi',
  '3 need you': '3 ont besoin de vous',
  'Nothing said is lost.': 'Rien de ce qui est dit n’est perdu.',
  'Commitments, dates, amounts, questions and decisions are found in the conversation and offered back as actions. They become facts only when you say so.':
    'Engagements, dates, montants, questions et décisions sont repérés dans la conversation et proposés comme actions. Ils ne deviennent des faits que si vous le dites.',
  Suggested: 'Proposé',
  'Remind me: send the deck · Monday': 'Me rappeler : envoyer la présentation · lundi',
  'Waiting on Sarah: contract': 'En attente de Sarah : contrat',
  'based on “I’ll send the deck on Monday.”': 'd’après « J’envoie la présentation lundi. »',
  'A business that proves it’s the business.': 'Une entreprise qui prouve qu’elle est bien elle.',
  'An organization verifies its domain with one DNS record. Its team answers customers as the organization, in one inbox, with apps and an AI agent that always say what they are.':
    'Une organisation vérifie son domaine avec un enregistrement DNS. Son équipe répond aux clients au nom de l’organisation, dans une seule boîte de réception, avec des applications et un agent IA qui disent toujours ce qu’ils sont.',
  'verified · niledental.example': 'vérifiée · niledental.example',
  'Lina · new patient forms': 'Lina · formulaires nouveau patient',
  'Each side of your life sees what you chose.':
    'Chaque facette de votre vie voit ce que vous avez choisi.',
  'Profile fields by sphere, read receipts only both ways, requests before strangers reach you, and end-to-end encryption when a conversation should be private.':
    'Champs de profil par cercle, accusés de lecture uniquement réciproques, une demande avant qu’un inconnu ne vous joigne, et chiffrement de bout en bout quand une conversation doit rester privée.',
  'work sees': 'le travail voit',
  'name · headline · organization': 'nom · titre · organisation',
  'family sees': 'la famille voit',
  'everything, and where you are when you share it': 'tout, et où vous êtes quand vous le partagez',
  'a stranger sees': 'un inconnu voit',
  'your name and handle, and may ask': 'votre nom et identifiant, et peut demander',
  '{n} GB': '{n} Go',
  'price shown in the app': 'prix affiché dans l’application',
  '{price} a month': '{price} par mois',
  '{price} a year': '{price} par an',
  ', or ': ', ou ',
  'It lands in the inbox, first if they’ve waited longest.':
    'Elle arrive dans la boîte de réception, en tête si elle attend depuis le plus longtemps.',
  'Lina writes to Nile Dental from the app she uses for everyone else. The team sees one conversation, its state and who has it; Lina sees the organization, never which person.':
    'Lina écrit à Nile Dental depuis l’application qu’elle utilise pour tous les autres. L’équipe voit une conversation, son état et qui la prend en charge ; Lina voit l’organisation, jamais la personne qui répond.',
  'Can I book a cleaning on Thursday?': 'Je peux réserver un détartrage jeudi ?',
  'new · nobody has it · 2 min': 'nouvelle · non attribuée · 2 min',
  'The agent answers': 'L’agent répond',
  'From what you wrote down, and it says so.': 'D’après ce que vous avez écrit, et il le dit.',
  'The organization’s AI agent answers only from its knowledge (up to {n} characters you gave it), is marked as an AI, and hands over to a person the moment it isn’t sure. With bookable hours set, it offers the open slots and books the one the customer picks, for the team to confirm.':
    'L’agent IA de l’organisation ne répond qu’à partir de ses connaissances (jusqu’à {n} caractères que vous lui avez donnés), est marqué comme une IA, et passe la main à une personne dès qu’il n’est pas sûr. Si des heures réservables sont définies, il propose les créneaux libres et réserve celui que le client choisit, que l’équipe confirme ensuite.',
  'I can offer Thursday 10:00 or 10:30. Which suits you?':
    'Je peux proposer jeudi 10 h ou 10 h 30. Lequel vous convient ?',
  'Cleaning · Thursday 10:00 · requested': 'Détartrage · jeudi 10 h · demandé',
  'Nile Dental · AI agent · automated': 'Nile Dental · agent IA · automatique',
  'The team answers': 'L’équipe répond',
  'Whoever answers has it; the customer hears from the organization.':
    'Qui répond la prend en charge ; le client reçoit la réponse de l’organisation.',
  'Answering takes the conversation. Assign it, escalate it to an owner or admin with a note, or resolve it; it comes back the moment the customer writes again.':
    'Répondre, c’est prendre la conversation. Attribuez-la, faites-la remonter au propriétaire ou à un admin avec une note, ou résolvez-la ; elle revient dès que le client écrit à nouveau.',
  '10:00 is yours. See you Thursday.': '10 h, c’est réservé pour vous. À jeudi.',
  'Your tools hear it': 'Vos outils sont au courant',
  'A helpdesk, a CRM or your own bot, in the same conversation.':
    'Un helpdesk, un CRM ou votre propre bot, dans la même conversation.',
  'An app’s bot replies as the organization, marked automated, and never counts as the team’s answer. Its webhook hears each message and each change of state.':
    'Le bot d’une application répond au nom de l’organisation, marqué automatique, et ne compte jamais comme la réponse de l’équipe. Son webhook reçoit chaque message et chaque changement d’état.',
  'resolved · by person': 'résolue · par une personne',
  'Booking · confirmed · by customer': 'Réservation · confirmée · par le client',
  'A colleague sees the professional you.': 'Un collègue voit votre côté professionnel.',
  'Name, headline, organization, the hours you answer in. Your birthday, your family and your location stay out of it unless you say otherwise.':
    'Nom, titre, organisation, les heures où vous répondez. Votre anniversaire, votre famille et votre position restent à l’écart sauf si vous en décidez autrement.',
  sees: 'voit',
  'Noor Haddad · Dentist · Nile Dental': 'Noor Haddad · Dentiste · Nile Dental',
  'doesn’t see': 'ne voit pas',
  'birthday · family · where you are': 'anniversaire · famille · où vous êtes',
  'Family sees more, because you said so.': 'La famille voit plus, parce que vous l’avez dit.',
  'What each sphere sees is a setting you own, field by field. Sharing your location live is one tap, for as long as you chose, and ends on its own.':
    'Ce que chaque cercle voit est un réglage qui vous appartient, champ par champ. Partager votre position en direct se fait d’un geste, pour la durée choisie, et s’arrête tout seul.',
  'everything you chose, and where you are while you share it':
    'tout ce que vous avez choisi, et où vous êtes pendant que vous le partagez',
  until: 'jusqu’à',
  'the hour you picked': 'l’heure que vous avez choisie',
  'A stranger': 'Un inconnu',
  'A stranger may ask. Nothing more.': 'Un inconnu peut demander. Rien de plus.',
  'Someone who isn’t connected to you sees your name and handle, if you let yourself be found. Their first message arrives as a request: one message until you answer.':
    'Quelqu’un qui n’est pas en contact avec vous voit votre nom et identifiant, si vous vous laissez trouver. Son premier message arrive comme une demande : un message jusqu’à votre réponse.',
  'Hi Noor, found you!': 'Salut Noor, te voilà !',
  'one message until you answer · decline and they never know':
    'un message jusqu’à votre réponse · refusez et la personne ne le saura jamais',
  'A customer sees the organization, never its people.':
    'Un client voit l’organisation, jamais ses membres.',
  'In a business conversation the team’s names and ids are masked everywhere: messages, read receipts, suggestions, exports. Anything filed for the customer names the organization.':
    'Dans une conversation professionnelle, les noms et identifiants de l’équipe sont masqués partout : messages, accusés de lecture, suggestions, exports. Tout ce qui est consigné pour le client nomme l’organisation.',
  'verified · answered in an hour': 'vérifiée · répond en une heure',
  '{n} actions a day': '{n} actions par jour',
  '{n} conversations a day': '{n} conversations par jour',
  '{n} answers a day': '{n} réponses par jour',
  'Your family, your work and your customers don’t belong in one list. Say who each person is to you, once. From then on Caime knows what needs you first, who may reach you when, what was decided and what’s owed, and what each side of your life sees of you.':
    'Votre famille, votre travail et vos clients n’ont pas leur place dans une seule liste. Dites une fois qui est chaque personne pour vous. Dès lors, Caime sait ce qui a besoin de vous en premier, qui peut vous joindre et quand, ce qui a été décidé et ce qui est dû, et ce que chaque côté de votre vie voit de vous.',
  'Start free': 'Commencer gratuitement',
  Specification: 'Fiche technique',
  'primary object': 'objet principal',
  'The connection between two people, not the chat.':
    'Le lien entre deux personnes, pas la discussion.',
  'to connect': 'entrer en contact',
  'Connect in three taps. Say how you know someone; the conversation, its notifications and its cards fit the relationship.':
    'Entrez en contact en trois gestes. Dites d’où vous connaissez quelqu’un ; la conversation, ses notifications et ses cartes s’adaptent à la relation.',
  attention: 'attention',
  '“3 need you”, never “47 unread”. The inbox puts what matters first and says why.':
    '« 3 ont besoin de vous », jamais « 47 non lus ». La boîte de réception met ce qui compte en premier et dit pourquoi.',
  memory: 'mémoire',
  'Commitments, dates, amounts and decisions are found in the conversation and offered as actions. You decide; nothing is written for you.':
    'Engagements, dates, montants et décisions sont repérés dans la conversation et proposés comme actions. Vous décidez ; rien n’est écrit à votre place.',
  organizations: 'organisations',
  'A business proves its domain with one DNS record; its team answers as the organization, in one inbox, and customers book from its open slots.':
    'Une entreprise prouve son domaine avec un enregistrement DNS ; son équipe répond au nom de l’organisation, dans une seule boîte de réception, et les clients réservent parmi ses créneaux libres.',
  'Each side of your life sees what you chose. End-to-end encrypted when you say so, with a recovery key only you hold.':
    'Chaque côté de votre vie voit ce que vous avez choisi. Chiffré de bout en bout quand vous le dites, avec une clé de récupération que personne d’autre que vous ne détient.',
  money: 'argent',
  'Never held or moved by Caime. A split records who owes whom; nothing else.':
    'Jamais détenu ni déplacé par Caime. Un partage des frais note qui doit combien à qui, rien de plus.',
  'Free for people, always. Organizations start free and can buy Business.':
    'Gratuit pour les particuliers, toujours. Les organisations démarrent gratuitement et peuvent passer à Business.',
  'runs on': 'fonctionne sur',
  'Web, iOS and Android, from one account.': 'Web, iOS et Android, depuis un seul compte.',
  'Layers · pick one': 'Niveaux · choisissez-en un',
  '{site} for organizations: answer as the organization, and prove it’s you':
    '{site} pour les organisations : répondez au nom de l’organisation, et prouvez que c’est vous',
  'A clinic, a shop, a school or a nonprofit verifies its domain with one DNS record and answers customers as the organization, in one inbox, with an AI agent and apps that always say what they are. Free for a team of three.':
    'Une clinique, une boutique, une école ou une association vérifie son domaine avec un enregistrement DNS et répond aux clients au nom de l’organisation, dans une seule boîte de réception, avec un agent IA et des applications qui disent toujours ce qu’ils sont. Gratuit pour une équipe de trois.',
  'Answer as the organization, and prove it’s you.':
    'Répondez au nom de l’organisation, et prouvez que c’est vous.',
  'A clinic, a shop, a school, a nonprofit or a public service gets a profile people can trust once it verifies its domain, and one inbox where its team answers customers as the organization. Customers write from the app they already use for everyone else in their life.':
    'Une clinique, une boutique, une école, une association ou un service public obtient un profil digne de confiance une fois son domaine vérifié, et une seule boîte de réception où son équipe répond aux clients au nom de l’organisation. Les clients écrivent depuis l’application qu’ils utilisent déjà pour tous les autres dans leur vie.',
  verification: 'vérification',
  'One TXT record on your domain. Verified shows on your page and beside your team; it is checked, never bought, and yours again if you ever close and come back.':
    'Un enregistrement TXT sur votre domaine. La mention « Vérifiée » apparaît sur votre page et à côté de votre équipe ; elle se vérifie, ne s’achète jamais, et vous revient si vous fermez puis revenez.',
  'the inbox': 'la boîte de réception',
  'Every customer conversation in one place, sorted by who has waited longest, in six views: {views}.':
    'Chaque conversation client au même endroit, triée selon qui attend depuis le plus longtemps, en six vues : {views}.',
  'the team': 'l’équipe',
  'Owners, admins and members. A customer sees the organization, never which person answered. A seat that ends takes nothing with it.':
    'Propriétaires, admins et membres. Un client voit l’organisation, jamais quelle personne a répondu. Un accès qui prend fin n’emporte rien avec lui.',
  'writing first': 'écrire en premier',
  'Your team may write to someone first. It arrives as a request: one message until they answer, and their answer opens the conversation.':
    'Votre équipe peut écrire en premier à quelqu’un. Le message arrive comme une demande : un seul message jusqu’à la réponse, et cette réponse ouvre la conversation.',
  'the ai agent': 'l’agent IA',
  'Answers from what you wrote down (up to {n} characters), is marked as an AI, and hands over to a person the moment it isn’t sure. It never speaks for the team.':
    'Répond d’après ce que vous avez écrit (jusqu’à {n} caractères), est marqué comme une IA, et passe la main à une personne dès qu’il n’est pas sûr. Il ne parle jamais au nom de l’équipe.',
  'Set bookable hours once. Customers pick from the open slots, your AI agent offers the next few and books the one they choose, and every booking is an appointment your team confirms.':
    'Définissez une fois vos heures réservables. Les clients choisissent parmi les créneaux libres, votre agent IA propose les prochains et réserve celui qu’ils choisissent, et chaque réservation est un rendez-vous que votre équipe confirme.',
  apps: 'applications',
  'A helpdesk, a CRM or your own bot: a token that reaches only your conversations, a signed webhook, and cards of your own design.':
    'Un helpdesk, un CRM ou votre propre bot : un jeton qui n’atteint que vos conversations, un webhook signé, et des cartes conçues par vous.',
  updates: 'actualités',
  'Post to everyone who follows you. Nobody sees who follows, and nothing about following reaches anyone’s inbox.':
    'Publiez pour toutes les personnes qui vous suivent. Personne ne voit qui suit, et rien de ces abonnements n’arrive dans une boîte de réception.',
  spaces: 'espaces',
  'Spaces for the team, a project or a branch, started from the organization’s page, with your team already there to pick from.':
    'Des espaces pour l’équipe, un projet ou une agence, créés depuis la page de l’organisation, où il suffit de choisir parmi votre équipe.',
  calls: 'appels',
  'Voice and video, one to one and in groups of up to {n}, in the browser.':
    'Voix et vidéo, en tête-à-tête et en groupe jusqu’à {n}, dans le navigateur.',
  insights: 'statistiques',
  'How fast the team answers, how many customers write and what is still open. On Business.':
    'La rapidité de réponse de l’équipe, combien de clients écrivent et ce qui reste ouvert. Inclus dans Business.',
  'Free for a team of {team}, with {apps}. Business for the rest: {pricing}.':
    'Gratuit pour une équipe de {team}, avec {apps}. Business pour le reste : {pricing}.',
  'one app': 'une application',
  'A customer’s day · pick a step': 'La journée d’un client · choisissez une étape',
  'For developers': 'Pour les développeurs',
  '{site} pricing: free for people, organizations pay for their team':
    'Tarifs de {site} : gratuit pour les particuliers, les organisations paient pour leur équipe',
  'What makes Caime Caime is never counted. People use it free; Pro adds AI, storage, automations and insights. Organizations start free for a team of three and buy Business for the rest.':
    'L’essentiel de Caime n’est jamais décompté. Les particuliers l’utilisent gratuitement ; Pro ajoute l’IA, le stockage, les automatisations et les aperçus de vos relations. Les organisations démarrent gratuitement pour une équipe de trois et passent à Business au-delà.',
  'Free for people. Organizations pay for their team.':
    'Gratuit pour les particuliers. Les organisations paient pour leur équipe.',
  'What makes Caime Caime is never counted: connections, relationships, what needs you, what you’re waiting for, search and sync are in every plan. Plans differ only in what costs money to run, and in what organizations buy.':
    'L’essentiel de Caime n’est jamais décompté : contacts, relations, ce qui a besoin de vous, ce que vous attendez, recherche et synchronisation sont dans chaque forfait. Les forfaits ne diffèrent que par ce qui a un coût de fonctionnement, et par ce que les organisations achètent.',
  'For people': 'Pour les particuliers',
  Personal: 'Personal',
  ', always': ', toujours',
  'ai assist': 'assistance ia',
  '{n} actions a day, once you turn it on': '{n} actions par jour, une fois activée',
  files: 'fichiers',
  automations: 'automatisations',
  'everything else': 'tout le reste',
  'connections, attention, memory, spaces, calls, private conversations':
    'contacts, attention, mémoire, espaces, appels, conversations privées',
  Pro: 'Pro',
  'how your relationships are going, from your own messages, for you only':
    'comment vont vos relations, d’après vos propres messages, pour vous uniquement',
  team: 'équipe',
  'ai agent': 'agent ia',
  'how fast the team answers, who is waiting, what is open':
    'la rapidité de réponse de l’équipe, qui attend, ce qui est ouvert',
  Enterprise: 'Enterprise',
  'Talk to us': 'Contactez-nous',
  included: 'inclus',
  'The rules': 'Les règles',
  'never counted': 'jamais décompté',
  'A conversation a customer starts. Anyone who writes to you. Your connections, however many.':
    'Une conversation ouverte par un client. Toute personne qui vous écrit. Vos contacts, quel qu’en soit le nombre.',
  'a lower plan': 'un forfait inférieur',
  'takes nothing away: nobody is removed from a team and no app stops. It only stops new additions until they fit.':
    'ne retire rien : personne n’est retiré d’une équipe et aucune application ne s’arrête. Seuls les nouveaux ajouts sont bloqués tant que vous dépassez les limites.',
  paying: 'paiement',
  'Through Stripe, by card. Cancel whenever you like: it stays on until the end of what you paid for, and nothing you use today goes away after.':
    'Via Stripe, par carte. Annulez quand vous voulez : cela reste actif jusqu’à la fin de la période payée, et rien de ce que vous utilisez aujourd’hui ne disparaît ensuite.',
  'a seat': 'un accès',
  'on a Business or Enterprise team includes everything Pro does.':
    'dans une équipe Business ou Enterprise inclut tout ce que Pro offre.',
  '{site} security and privacy: each side of your life sees what you chose':
    'Sécurité et confidentialité de {site} : chaque côté de votre vie voit ce que vous avez choisi',
  'How you describe people is only ever yours. Profile by sphere, read receipts both ways only, requests before strangers, end-to-end encryption with a recovery key you hold, and a server that keeps envelopes, not words.':
    'La façon dont vous décrivez les gens n’appartient qu’à vous. Profil par cercle, accusés de lecture uniquement réciproques, une demande avant tout inconnu, chiffrement de bout en bout avec une clé de récupération que vous détenez, et un serveur qui garde des enveloppes, pas des mots.',
  'Privacy in Caime isn’t a setting you find later. How you describe someone is only ever yours, what each sphere of your life sees of you is decided by you, field by field, and a conversation that should be private is encrypted so that not even Caime can read it.':
    'La confidentialité dans Caime n’est pas un réglage que l’on découvre plus tard. La façon dont vous décrivez quelqu’un n’appartient qu’à vous, ce que chaque cercle de votre vie voit de vous est décidé par vous, champ par champ, et une conversation qui doit être privée est chiffrée de sorte que même Caime ne puisse pas la lire.',
  'Who sees what · pick a side': 'Qui voit quoi · choisissez un point de vue',
  'your labels': 'vos étiquettes',
  'How you describe the people you know (family, work, a client) is yours. The person you describe sees it only if you both turn on sharing; nobody else ever does.':
    'La façon dont vous décrivez les gens que vous connaissez (famille, travail, un client) est à vous. La personne décrite ne la voit que si le partage est activé des deux côtés ; personne d’autre ne la voit, jamais.',
  'read receipts': 'accusés de lecture',
  'Only both ways: you see theirs when they see yours.':
    'Uniquement réciproques : vous voyez ceux de l’autre personne quand elle voit les vôtres.',
  strangers: 'inconnus',
  'A message from someone you don’t know arrives as a request: one message until you answer. Declined, they never know.':
    'Un message de quelqu’un que vous ne connaissez pas arrive comme une demande : un message jusqu’à votre réponse. Si vous refusez, la personne ne le saura jamais.',
  'under 18': 'moins de 18 ans',
  'No public page, no money cards, no messages from organizations they didn’t write to first, and adults are told when a conversation includes a minor.':
    'Pas de page publique, pas de cartes liées à l’argent, pas de messages d’organisations auxquelles ils n’ont pas écrit en premier, et les adultes sont prévenus quand une conversation inclut un mineur.',
  'private conversations': 'conversations privées',
  'End to end encrypted: a fresh AES-256-GCM key for every message, wrapped for each device allowed to read it with P-256 ECDH and HKDF, and the whole envelope signed by the device that sent it. The server keeps envelopes, never words. Up to {people} people, {devices} devices each.':
    'Chiffrées de bout en bout : une nouvelle clé AES-256-GCM pour chaque message, enveloppée pour chaque appareil autorisé à le lire avec P-256 ECDH et HKDF, et l’enveloppe entière signée par l’appareil qui l’a envoyée. Le serveur garde des enveloppes, jamais des mots. Jusqu’à {people} personnes, {devices} appareils chacune.',
  'your devices': 'vos appareils',
  'A new device reads nothing until you say it’s yours on one you already have. Your security code is your first device’s, so it stays the same as you add devices and changes only when you start over.':
    'Un nouvel appareil ne lit rien tant que vous ne dites pas qu’il est à vous depuis un appareil que vous avez déjà. Votre code de sécurité est celui de votre premier appareil, il reste donc le même quand vous en ajoutez et ne change que si vous recommencez à zéro.',
  recovery: 'récupération',
  'A recovery key you hold, shown once, brings your private conversations back when every device is gone. Caime keeps nothing of it.':
    'Une clé de récupération que vous détenez, affichée une seule fois, restaure vos conversations privées quand vous n’avez plus aucun appareil. Caime n’en garde rien.',
  'what isn’t hidden': 'ce qui n’est pas caché',
  'Who is in a conversation, when messages are sent and how long they are, and reactions. The app says so.':
    'Qui est dans une conversation, quand les messages sont envoyés et leur longueur, et les réactions. L’application le dit.',
  'blocks and reports': 'blocages et signalements',
  'A block stops every write, both ways. Reports are read by a person and acted on; every action is in the audit log.':
    'Un blocage arrête toute écriture, dans les deux sens. Les signalements sont lus par une personne et suivis d’effet ; chaque action est dans le journal d’audit.',
  'your data': 'vos données',
  'Download all of it, or delete your account, from Settings. Ended sign-ins are kept {signIns} days, security records {records}, a handle you let go of {handles} from everyone.':
    'Téléchargez-les toutes, ou supprimez votre compte, depuis les Réglages. Les connexions terminées sont conservées {signIns} jours, les enregistrements de sécurité {records}, un identifiant libéré reste bloqué pour tous pendant {handles}.',
  'a year': 'un an',
  'the server': 'le serveur',
  'A content security policy on every page, no third-party scripts, no ads, no tracking across sites, and a backup checked after every dump.':
    'Une politique de sécurité du contenu sur chaque page, aucun script tiers, aucune publicité, aucun suivi entre sites, et chaque sauvegarde vérifiée dès sa création.',
  ai: 'ia',
  'Off until an adult turns it on, never on a private conversation, and everything it infers is a suggestion you accept or don’t.':
    'Désactivée tant qu’un adulte ne l’active pas, jamais sur une conversation privée, et tout ce qu’elle déduit est une suggestion que vous acceptez ou non.',
  'Read the privacy policy': 'Lire la politique de confidentialité',
  'Report a concern': 'Signaler un problème',
  '{site} for developers: an API that reaches only what it was given':
    '{site} pour les développeurs : une API qui n’atteint que ce qu’on lui a donné',
  'Apps for organizations with scoped tokens, signed webhooks, bots and cards of their own; personal tokens and OAuth for apps that act for a person; a typed SDK. Every write is idempotent.':
    'Des applications pour les organisations avec des jetons à portée limitée, des webhooks signés, des bots et des cartes qui leur sont propres ; des jetons personnels et OAuth pour les applications qui agissent pour une personne ; un SDK typé. Chaque écriture est idempotente.',
  'An API that reaches only what it was given.': 'Une API qui n’atteint que ce qu’on lui a donné.',
  'Organizations connect a helpdesk, a CRM or a bot of their own. People let an app act for them, with the permissions they chose. Every token reaches a fixed set of routes, every webhook is signed, and nothing an app does is passed off as a person.':
    'Les organisations connectent un helpdesk, un CRM ou leur propre bot. Les personnes laissent une application agir pour elles, avec les permissions choisies. Chaque jeton atteint un ensemble fixe de routes, chaque webhook est signé, et rien de ce qu’une application fait n’est présenté comme venant d’une personne.',
  'Added on the organization’s page. Each has its own bot on the team, a token shown once, and a webhook signed with a secret shown once. Replace either and the old one stops at once.':
    'Ajoutées sur la page de l’organisation. Chacune a son propre bot dans l’équipe, un jeton affiché une fois, et un webhook signé avec un secret affiché une fois. Remplacez l’un ou l’autre et l’ancien s’arrête immédiatement.',
  permissions: 'permissions',
  '{scopes}: given one by one. A route the token can’t use answers 403.':
    '{scopes} : accordées une à une. Une route que le jeton ne peut pas utiliser répond 403.',
  webhooks: 'webhooks',
  '{events}. Signed, https only, no private addresses, one deadline for the whole exchange.':
    '{events}. Signés, https seulement, aucune adresse privée, un seul délai pour tout l’échange.',
  'your own cards': 'vos propres cartes',
  'Define a kind of card with fields and states. Your bot sends it, the team and the customer move it, and you hear when they do.':
    'Définissez un type de carte avec des champs et des états. Votre bot l’envoie, l’équipe et le client la font avancer, et chaque mouvement vous est signalé.',
  idempotent: 'idempotent',
  'Every write carries a {clientId}. Sending it again returns the first result, never a second message.':
    'Chaque écriture porte un {clientId}. La renvoyer rend le premier résultat, jamais un second message.',
  rate: 'débit',
  '{n} requests a minute per token.': '{n} requêtes par minute et par jeton.',
  'the sdk': 'le sdk',
  '{sdk}: a typed client for every route an app reaches, and the webhook check. Built from the repository until it is on npm.':
    '{sdk} : un client typé pour chaque route qu’une application atteint, et la vérification des webhooks. À compiler depuis le dépôt en attendant sa publication sur npm.',
  'personal tokens': 'jetons personnels',
  'A person makes a token for their own scripts ({scopes}). It never reaches the account itself.':
    'Une personne crée un jeton pour ses propres scripts ({scopes}). Il n’atteint jamais le compte lui-même.',
  oauth: 'oauth',
  'Third-party apps ask people for consent (OAuth 2.0; errors as RFC 6749 and 7009 say), hold only what they were given, and can be revoked any time from Settings.':
    'Les applications tierces demandent le consentement des personnes (OAuth 2.0 ; erreurs selon les RFC 6749 et 7009), ne détiennent que ce qu’on leur a donné, et peuvent être révoquées à tout moment depuis les Réglages.',
  'the guide': 'le guide',
  'In the app: Settings → Developer, and beside each app on the organization’s page.':
    'Dans l’application : Réglages → Développeur, et à côté de chaque application sur la page de l’organisation.',
  'About {site}': 'À propos de {site}',
  '{site} is made by {maker}: a communication product, and only that. It never holds or moves money, runs no third-party code and has no feed. The primary object is the connection between two people, not the chat.':
    '{site} est conçu par {maker} : un produit de communication, et rien d’autre. Il ne détient ni ne déplace jamais d’argent, n’exécute aucun code tiers et n’a pas de fil d’actualité. L’objet principal est le lien entre deux personnes, pas la discussion.',
  'Made for the people in your life, not for a feed.':
    'Fait pour les gens de votre vie, pas pour un fil d’actualité.',
  '{site} is made by {maker}. It is a communication product, and only that: it never holds or moves money, runs no third-party code, and has no feed. The primary object is the connection between two people, not the chat.':
    '{site} est conçu par {maker}. C’est un produit de communication, et rien d’autre : il ne détient ni ne déplace jamais d’argent, n’exécute aucun code tiers, et n’a pas de fil d’actualité. L’objet principal est le lien entre deux personnes, pas la discussion.',
  'made by': 'conçu par',
  'what it is': 'ce que c’est',
  'Messaging for people, and for the organizations they deal with, on the web, iOS and Android, from one account.':
    'Une messagerie pour les gens, et pour les organisations avec lesquelles ils traitent, sur le web, iOS et Android, depuis un seul compte.',
  'what it isn’t': 'ce que ce n’est pas',
  'A super-app. No wallet, no marketplace, no feed, no scripts from anyone else.':
    'Une super-application. Pas de portefeuille, pas de place de marché, pas de fil d’actualité, aucun script de tiers.',
  'the characters': 'les personnages',
  'Caishy and friends (Momo, Panda, Lumi, Pico, Niko and Zuzu) appear where there is something to celebrate or nothing yet to show, never beside your invoice.':
    'Caishy et ses amis (Momo, Panda, Lumi, Pico, Niko et Zuzu) apparaissent là où il y a quelque chose à fêter ou rien encore à montrer, jamais à côté de votre facture.',
  'how it’s built': 'comment c’est fait',
  'One codebase for the server, the web and the phones. Every change is tested end to end against the real server before it ships, and only what passed goes live.':
    'Une seule base de code pour le serveur, le web et les téléphones. Chaque changement est testé de bout en bout sur le vrai serveur avant d’être livré, et seul ce qui passe les tests est mis en ligne.',
  'your say': 'votre avis',
  'Questions, ideas and concerns go to {mail}.':
    'Questions, idées et préoccupations : écrivez à {mail}.',
  'Web, iOS and Android.': 'Web, iOS et Android.',
  '{agentName} handed a conversation to the team':
    '{agentName} a transmis une conversation à l’équipe',
  'A customer': 'Un client',
  Call: 'Appel',
  Answered: 'Décroché',
  'Missed video call': 'Appel vidéo manqué',
  'Missed voice call': 'Appel vocal manqué',
  'from {caller}': 'de {caller}',
  'the same name': 'le même nom',
  'one name is part of the other': 'un nom fait partie de l’autre',
  'the same nickname': 'le même surnom',
  'you know both from {org}': 'vous les connaissez via {org}',
  '{name} may have two accounts': '{name} a peut-être deux comptes',
  '{merge} and {keep} may be the same person': '{merge} et {keep} sont peut-être la même personne',
  'Both have {reasons}. Merged, they show as one in People; both accounts and conversations stay, and you can separate them again.':
    'Les deux ont {reasons}. Une fois fusionnés, ils apparaissent comme une seule personne dans Personnes ; les deux comptes et conversations restent, et vous pouvez les séparer à nouveau.',
  ', and ': ', et ',
  '{title} call': 'Appel {title}',
  Joined: 'A rejoint',
  'Turned down': 'Refusé',
  'Missed group video call': 'Appel vidéo de groupe manqué',
  'Missed group voice call': 'Appel vocal de groupe manqué',
  'from {starter}': 'de {starter}',
  'in {title}': 'dans {title}',
  '{name} opened your invite link': '{name} a ouvert votre lien d’invitation',
  'You decide who connects with you: accept to connect.':
    'Vous décidez qui entre en contact avec vous : acceptez pour entrer en contact.',
  automated: 'automatique',
  'Message request': 'Demande de message',
  Group: 'Groupe',
  'New message': 'Nouveau message',
  '{n} new messages in {groupTitle}': {
    one: '{n} nouveau message dans {groupTitle}',
    other: '{n} nouveaux messages dans {groupTitle}',
  },
  '{senderName} sent {n} messages{context}': {
    one: '{senderName} a envoyé {n} message{context}',
    other: '{senderName} a envoyé {n} messages{context}',
  },
  '“{topic}” keeps coming up here. A separate topic keeps it together.':
    '« {topic} » revient souvent ici. Un sujet à part permettrait de tout regrouper.',
  'Your report was reviewed': 'Votre signalement a été examiné',
  'Thanks for reporting it: Caime looked and acted.':
    'Merci de votre signalement : Caime l’a examiné et a pris des mesures.',
  'Thanks for reporting it: Caime looked, and didn’t act on it this time.':
    'Merci de votre signalement : Caime l’a examiné, sans prendre de mesure cette fois.',
  'Colleague · {org}': 'Collègue · {org}',
  'You and {other} are both on {org}’s team, and {org} is verified.':
    'Vous faites partie, avec {other}, de l’équipe de {org}, et {org} est vérifiée.',
  'You and {other} are both on {org}’s team in Caime.':
    'Vous faites partie, avec {other}, de l’équipe de {org} sur Caime.',
  'You and {other} are both in {space}, a {kind} space.':
    'Vous êtes, avec {other}, dans {space}, un espace {kind}.',
  them: 'cette personne',
  '{name} described how you know each other as {label}{where}.':
    '{name} a décrit votre relation ainsi : {label}{where}.',
  'You both use @{domain} email addresses.': 'Vos deux adresses e-mail sont en @{domain}.',
  '{name} asked you': '{name} vous fait une demande',
  '{name} finished your request': '{name} a terminé votre demande',
  '{name} accepted your request': '{name} a accepté votre demande',
  '{name} declined your request': '{name} a refusé votre demande',
  '{name} reopened your request': '{name} a rouvert votre demande',
  '{name} cancelled your request': '{name} a annulé votre demande',
  '{speaker} wrote {quote}': '{speaker} a écrit {quote}',
  '{name} gave you a conversation': '{name} vous a attribué une conversation',
  '{name} escalated a conversation': '{name} a fait remonter une conversation',
  '{name} is calling': '{name} appelle',
  '{name} joined through your invite': '{name} a rejoint Caime via votre invitation',
  'You’re connected. Say hi.': 'Vous êtes en contact. Dites bonjour.',
  'Say hi when you’re ready.': 'Dites bonjour quand vous voulez.',
  '{name} wants to connect with you': '{name} veut entrer en contact avec vous',
  '{name} finished {title}': '{name} a terminé {title}',
  '{name} finished the list': '{name} a terminé la liste',
  'Everything on it is ticked.': 'Tout y est coché.',
  '{name} settled up': '{name} a réglé sa part',
  '{amount} of {title}.': '{amount} de {title}.',
  'the split': 'le partage des frais',
  'Their share of {title}.': 'Sa part de {title}.',
  '{name} added {n} photos to {album}': {
    one: '{name} a ajouté {n} photo à {album}',
    other: '{name} a ajouté {n} photos à {album}',
  },
  '{name} is calling {where}': '{name} appelle {where}',
  '{n} messages this week.': {
    one: '{n} message cette semaine.',
    other: '{n} messages cette semaine.',
  },
  'Quiet this week.': 'Calme cette semaine.',
  '{n} open for you.': {
    one: '{n} en cours pour vous.',
    other: '{n} en cours pour vous.',
  },
  'Waiting on {n}.': 'En attente de {n}.',
  'Last decision: {title}.': 'Dernière décision : {title}.',
  'Next date: {date}.': 'Prochaine date : {date}.',
  'No reply from {name} yet': 'Pas encore de réponse de {name}',
  'Follow up on “{text}”?': 'Relancer « {text} » ?',
  'Follow up?': 'Relancer ?',
  Reminder: 'Rappel',
  'Caime can’t help with this one.': 'Caime ne peut pas vous aider sur ce point.',
  'AI assist is busy. Try again in a moment.':
    'L’assistance IA est occupée. Réessayez dans un instant.',
  'AI assist didn’t work this time. Try again.':
    'L’assistance IA n’a pas fonctionné cette fois. Réessayez.',

  'Webhooks go to https addresses.': 'Les webhooks n’acceptent que des adresses https.',
  'That address is on a private network.': 'Cette adresse est sur un réseau privé.',
  '{plan} can’t be bought right now.': '{plan} ne peut pas être acheté pour le moment.',
  '{lead}: Stripe said “{message}”.': '{lead} : Stripe a répondu « {message} ».',
  '{plan} is part of this plan already.': '{plan} fait déjà partie de ce forfait.',
  '{plan} is on already: change it from Manage billing.':
    '{plan} est déjà actif : modifiez-le depuis Gérer la facturation.',
  'There’s nothing paid for here yet.': 'Rien n’est encore payé ici.',
  'You can’t message this person.': 'Vous ne pouvez pas écrire à cette personne.',
  'You blocked {orgName}. Unblock it to write to it again.':
    'Vous avez bloqué {orgName}. Débloquez-la pour lui écrire à nouveau.',
  'This device isn’t set up for private conversations: sign in again to write here.':
    'Cet appareil n’est pas configuré pour les conversations privées : reconnectez-vous pour écrire ici.',
  'Someone’s devices changed since this was sealed.':
    'Les appareils d’un participant ont changé depuis que ce message a été scellé.',
  'Sign in to continue.': 'Connectez-vous pour continuer.',
  'You can’t do that here.': 'Vous ne pouvez pas faire cela ici.',
  That: 'Cet élément',
  '{what} wasn’t found.': '{what} est introuvable.',
  'Too many requests. Try again in a moment.': 'Trop de requêtes. Réessayez dans un instant.',
  'Caime can’t send email here yet. Use a recovery code instead, or ask whoever runs it.':
    'Caime ne peut pas encore envoyer d’e-mail ici. Utilisez plutôt un code de récupération, ou contactez qui gère ce service.',
  'It belongs to {name}, which closed. If you’re {name}, verify {domain} to take it back.':
    'Il appartient à {name}, qui a fermé. Si vous êtes {name}, vérifiez {domain} pour le reprendre.',
  'That invite': 'Cette invitation',
  'That’s your own invite.': 'C’est votre propre invitation.',
  'You can’t connect with this person.':
    'Vous ne pouvez pas entrer en contact avec cette personne.',
  'An organization’s own cards are for conversations with it.':
    'Les cartes propres à une organisation sont réservées aux conversations avec elle.',
  'Only the organization sends its cards.': 'Seule l’organisation envoie ses cartes.',
  'This app needs the “kits” permission for that.':
    'Cette application a besoin de la permission « kits » pour cela.',
  'Say which app’s card, and which of its cards.':
    'Indiquez l’application et laquelle de ses cartes.',
  'An app sends only its own cards.': 'Une application n’envoie que ses propres cartes.',
  'That card isn’t available here.': 'Cette carte n’est pas disponible ici.',
  '{name} cards aren’t available in this conversation.':
    'Les cartes {name} ne sont pas disponibles dans cette conversation.',
  'That person': 'Cette personne',
  '{name} only takes messages from people they know. Send a connection request instead.':
    '{name} n’accepte de messages que de personnes connues. Envoyez plutôt une demande de contact.',
  'That clientId was already used.': 'Ce clientId a déjà été utilisé.',
  'That conversation': 'Cette conversation',
  'Only admins can post here.': 'Seuls les admins peuvent publier ici.',
  'Only a person, on their own device, writes in a private conversation.':
    'Dans une conversation privée, seule une personne peut écrire, depuis son propre appareil.',
  'Messages in a private conversation are text, sealed on your device.':
    'Les messages d’une conversation privée sont du texte scellé sur votre appareil.',

  'Only private conversations take sealed messages.':
    'Seules les conversations privées acceptent des messages scellés.',
  'This organization closed, so nothing more is written here. Find it again to start a new conversation.':
    'Cette organisation a fermé : plus rien ne s’écrit ici. Retrouvez-la pour démarrer une nouvelle conversation.',
  'You can send more once they accept your message request.':
    'Vous pourrez en envoyer davantage une fois votre demande de message acceptée.',
  'You can only reply to a message in this conversation.':
    'Vous ne pouvez répondre qu’à un message de cette conversation.',
  'One of the attachments isn’t available.': 'L’une des pièces jointes n’est pas disponible.',
  'Sharing a location is for people over 18.':
    'Le partage de position est réservé aux plus de 18 ans.',
  '{name} cards are for one-to-one conversations.':
    'Les cartes {name} sont réservées aux conversations à deux.',
  '{name} cards aren’t for conversations with an organization.':
    'Les cartes {name} ne s’utilisent pas dans les conversations avec une organisation.',
  'There’s nobody here to split it with.': 'Il n’y a personne ici avec qui le partager.',
  'Live location is for people you know, not organizations.':
    'La position en direct se partage avec les personnes que vous connaissez, pas avec les organisations.',
  'That organization': 'Cette organisation',
  'You’ve used today’s {aiPerDay} AI assists.{ready}{more}':
    'Vous avez utilisé les {aiPerDay} assistances IA du jour.{ready}{more}',
  'The next one is ready {when}.': ' La prochaine sera prête {when}.',
  '{plan} includes {n} a day.': ' {plan} en inclut {n} par jour.',
  '{plan} includes {bytes}.': ' {plan} inclut {bytes}.',
  'That’s more than the {allowed} of files your plan includes ({used} used).{more}':
    'C’est plus que les {allowed} de fichiers inclus dans votre forfait ({used} utilisés).{more}',
  '{plan} has room for {n}.': ' {plan} en accueille {n}.',
  '{name}’s {plan} plan has room for {room} people on the team.{more}':
    'Le forfait {plan} de {name} accueille {room} personnes dans l’équipe.{more}',
  '{plan} includes {n}.': ' {plan} en inclut {n}.',
  '{org}’s {plan} plan includes {apps}.{more}': 'Le forfait {plan} de {org} inclut {apps}.{more}',
  'The next can start {when}.': ' La prochaine pourra démarrer {when}.',
  '{name} has started today’s {startsPerDay} new conversations.{ready}{more}':
    '{name} a démarré les {startsPerDay} nouvelles conversations du jour.{ready}{more}',
  'Insights come with Business: how fast {name}’s team answers, how many customers write, and what’s still open.':
    'Les statistiques sont incluses dans Business : la rapidité de réponse de l’équipe de {name}, combien de clients écrivent, et ce qui reste ouvert.',
  'Relationship insights come with {pro}: who you write with most, who’s gone quiet, how fast you answer and are answered, and when you write.':
    'Les aperçus de vos relations sont inclus dans {pro} : avec qui vous écrivez le plus, qui ne donne plus de nouvelles, à quelle vitesse vous répondez et on vous répond, et quand vous écrivez.',
  '{plan} keeps {n}.': ' {plan} en permet {n}.',
  '{plan} keeps {most} automations. Remove one to add another.{more}':
    '{plan} permet {most} automatisations. Retirez-en une pour en ajouter une autre.{more}',
  'That space': 'Cet espace',
  'That recording is too long to transcribe.':
    'Cet enregistrement est trop long pour être transcrit.',
  'Invalid request.': 'Requête invalide.',
  'Your account': 'Votre compte',
  'That password isn’t right.': 'Ce mot de passe n’est pas le bon.',
  'A message is linked with its conversation.': 'Un message est lié à sa conversation.',
  'That message': 'Ce message',
  'That context': 'Ce contexte',
  'That task': 'Cette tâche',
  'You can’t assign this person.': 'Vous ne pouvez pas assigner cette personne.',
  'You can ask people you’re connected with.':
    'Vous pouvez demander aux personnes avec qui vous êtes en contact.',
  'A request goes to someone else.': 'Une demande s’adresse à quelqu’un d’autre.',
  'Requests between a customer and an organization aren’t available yet.':
    'Les demandes entre un client et une organisation ne sont pas encore disponibles.',
  'Only the person who asked can change this.':
    'Seule la personne qui a demandé peut changer cela.',
  'Only the person asked can accept or decline.':
    'Seule la personne sollicitée peut accepter ou refuser.',
  'Only the person who asked can cancel.': 'Seule la personne qui a demandé peut annuler.',
  'Only the person who created this can delete it.':
    'Seule la personne qui a créé ceci peut le supprimer.',
  'That decision': 'Cette décision',
  'Only whoever recorded it, or the group’s admins, change a decision.':
    'Seuls la personne qui l’a notée ou les admins du groupe peuvent modifier une décision.',
  '{plan} is paid for through Stripe: cancel it there (at once, or at the end of what’s paid), and the plan follows.':
    '{plan} est payé via Stripe : annulez-le sur Stripe (immédiatement, ou à la fin de la période payée), et le forfait suivra.',
  'That report': 'Ce signalement',
  'This report isn’t about a message.': 'Ce signalement ne concerne pas un message.',
  'Lines about the conversation stay.': 'Les lignes d’information sur la conversation restent.',
  'This report isn’t about an update.': 'Ce signalement ne concerne pas une actualité.',
  'This report isn’t about a person.': 'Ce signalement ne concerne pas une personne.',
  'Another instance is backing up right now.':
    'Une autre instance effectue une sauvegarde en ce moment.',
  'That handle isn’t reserved or held: whoever wants it can take it themselves.':
    'Cet identifiant n’est ni réservé ni bloqué : n’importe qui peut le prendre directement.',
  'Someone else has that handle.': 'Quelqu’un d’autre a cet identifiant.',
  'Only a closed organization is deleted.': 'Seule une organisation fermée peut être supprimée.',
  'Only the organization’s owner and admins can.':
    'Seuls le propriétaire et les admins de l’organisation le peuvent.',
  'AI isn’t available on this Caime server.': 'L’IA n’est pas disponible sur ce serveur Caime.',
  'That organization’s AI agent': 'L’agent IA de cette organisation',
  'It didn’t answer this time. Try again.': 'Il n’a pas répondu cette fois. Réessayez.',
  'AI assist isn’t set up on this server.': 'L’assistance IA n’est pas configurée sur ce serveur.',
  'AI assist is for adults for now.': 'L’assistance IA est réservée aux adultes pour le moment.',
  'Turn on AI assist in Settings to use it.':
    'Activez l’assistance IA dans les Réglages pour l’utiliser.',
  'This conversation is private, so AI assist can’t read it.':
    'Cette conversation est privée : l’assistance IA ne peut pas la lire.',
  'That app': 'Cette application',
  'This route is for an app’s token.': 'Cette route est réservée au jeton d’une application.',
  'A failed delivery of this app by that id':
    'Un envoi échoué de cette application avec cet identifiant',
  'A webhook address for that app': 'Une adresse de webhook pour cette application',
  'You need to be at least {MINIMUM_AGE} to use Caime.':
    'Il faut avoir au moins {MINIMUM_AGE} ans pour utiliser Caime.',
  'That email already has an account. Sign in instead?':
    'Un compte existe déjà avec cet e-mail. Se connecter plutôt ?',
  'That email or handle and password don’t match.':
    'L’e-mail ou l’identifiant ne correspond pas au mot de passe.',
  'That session': 'Cette session',
  'Your current password isn’t right.': 'Votre mot de passe actuel n’est pas le bon.',
  'Your password isn’t right.': 'Votre mot de passe n’est pas le bon.',
  'This address is confirmed.': 'Cette adresse est confirmée.',
  'That code isn’t right. Check the email again.':
    'Ce code n’est pas le bon. Vérifiez à nouveau l’e-mail.',
  'That code has run out. Send a new one.': 'Ce code a expiré. Envoyez-en un nouveau.',
  'Too many tries with that code. Send a new one.':
    'Trop d’essais avec ce code. Envoyez-en un nouveau.',
  'That link has been used or has run out. Ask for a new one.':
    'Ce lien a été utilisé ou a expiré. Demandez-en un nouveau.',
  'That recovery code doesn’t match this account.':
    'Ce code de récupération ne correspond pas à ce compte.',
  'That automation': 'Cette automatisation',
  'A private conversation keeps to itself: nothing in it is saved elsewhere.':
    'Une conversation privée reste à part : rien n’en est enregistré ailleurs.',
  'Accept the message request to save anything from it.':
    'Acceptez la demande de message pour en enregistrer quoi que ce soit.',
  'A line about the conversation isn’t saved.':
    'Une ligne d’information sur la conversation ne s’enregistre pas.',
  'That file': 'Ce fichier',
  'You’ve saved {SAVED_MAX} things, the most there’s room for. Remove some to save more.':
    'Vous avez enregistré {SAVED_MAX} éléments, le maximum possible. Retirez-en pour en enregistrer d’autres.',
  'That saved item': 'Cet élément enregistré',
  'An automation saves to {collection}. Change it or remove it first.':
    'Une automatisation enregistre dans {collection}. Modifiez-la ou retirez-la d’abord.',
  'Plans are bought by someone 18 or over.': 'Les forfaits s’achètent à partir de 18 ans.',
  'Only the organization’s owner and admins can change what it pays.':
    'Seuls le propriétaire et les admins de l’organisation peuvent changer ce qu’elle paie.',
  'That isn’t from Stripe.': 'Cela ne vient pas de Stripe.',
  'That isn’t an event.': 'Ce n’est pas un événement.',
  'You’re on its team. Leave the team instead.':
    'Vous êtes dans son équipe. Quittez plutôt l’équipe.',
  'You’re on its team: its conversations are in its inbox.':
    'Vous êtes dans son équipe : ses conversations sont dans sa boîte de réception.',
  'Under 18, you can message organizations that have verified who they are. {name} hasn’t yet.':
    'Avant 18 ans, vous pouvez écrire aux organisations dont l’identité est vérifiée. {name} ne l’a pas encore fait.',
  'You blocked {name}. Unblock it to write to it again.':
    'Vous avez bloqué {name}. Débloquez-la pour lui écrire à nouveau.',
  'A person on the team writes first; an app answers customers.':
    'Une personne de l’équipe écrit en premier ; une application répond aux clients.',
  'Nobody by that handle can hear from {name}.':
    'Personne ne peut recevoir de message de {name} avec cet identifiant.',
  'They’re on the team: write to them directly.':
    'Cette personne est dans l’équipe : écrivez-lui directement.',
  'Verify {name}’s domain first: only a verified organization writes to someone first.':
    'Vérifiez d’abord le domaine de {name} : seule une organisation vérifiée peut écrire en premier.',
  '{name} only takes messages from people they know.':
    '{name} n’accepte de messages que de personnes connues.',
  'They aren’t on the team.': 'Cette personne n’est pas dans l’équipe.',
  'That’s the AI agent: give it to a person.': 'C’est l’agent IA : attribuez-la à une personne.',
  'That’s an app’s bot: give it to a person.':
    'C’est le bot d’une application : attribuez-la à une personne.',
  'It’s already resolved.': 'Elle est déjà résolue.',
  'It’s open already.': 'Elle est déjà ouverte.',
  'Reopen it first.': 'Rouvrez-la d’abord.',
  'Ask for up to a year, from one instant to a later one.':
    'Demandez une période d’un an au plus, avec une fin postérieure au début.',
  'That calendar': 'Ce calendrier',
  'That call': 'Cet appel',
  'That call has ended.': 'Cet appel est terminé.',
  'Calls are for conversations between two people.':
    'Les appels sont réservés aux conversations à deux.',
  'There’s nobody to call here.': 'Il n’y a personne à appeler ici.',
  'You can call once your message request is accepted.':
    'Vous pourrez appeler une fois votre demande de message acceptée.',
  'You can’t call this person.': 'Vous ne pouvez pas appeler cette personne.',
  '{name} is on another call.': '{name} est dans un autre appel.',
  'Only the person called can answer.': 'Seule la personne appelée peut répondre.',
  'Only the person called can decline.': 'Seule la personne appelée peut refuser.',
  'This device isn’t in that call.': 'Cet appareil n’est pas dans cet appel.',
  'That’s you.': 'C’est vous.',
  'You’re already connected.': 'Vous êtes déjà en contact.',
  'Your request is waiting for them.': 'Votre demande attend une réponse.',
  '{name} isn’t accepting requests from people they don’t know yet.':
    '{name} n’accepte pas encore de demandes de personnes inconnues.',
  'You can send another request later.': 'Vous pourrez envoyer une autre demande plus tard.',
  'Choose one of your identities.': 'Choisissez l’une de vos identités.',
  'That request': 'Cette demande',
  'That connection': 'Ce contact',
  'That merged connection': 'Ce contact fusionné',
  'A private group holds up to {PRIVATE_GROUP_MAX} people: each message is sealed for every device in it.':
    'Un groupe privé accueille jusqu’à {PRIVATE_GROUP_MAX} personnes : chaque message est scellé pour chaque appareil qui s’y trouve.',
  'A topic’s people are its group’s: add, remove or make admins there.':
    'Les membres d’un sujet sont ceux de son groupe : ajoutez, retirez ou nommez des admins depuis le groupe.',
  'Topics are for conversations between people.':
    'Les sujets sont réservés aux conversations entre personnes.',
  'Connect first to start topics.': 'Entrez d’abord en contact pour ouvrir des sujets.',
  'A private conversation keeps to itself: start a topic from your main one.':
    'Une conversation privée reste à part : ouvrez un sujet depuis votre conversation principale.',
  'Topics branch off a one-to-one, a group, or a space’s General.':
    'Les sujets s’ouvrent depuis une conversation à deux, un groupe ou la conversation Général d’un espace.',
  'Connect first to start a private conversation.':
    'Entrez d’abord en contact pour démarrer une conversation privée.',
  'You can add people you’re connected with.':
    'Vous pouvez ajouter les personnes avec qui vous êtes en contact.',
  'Drafts in a private conversation stay on your device.':
    'Les brouillons d’une conversation privée restent sur votre appareil.',
  'Only admins can change this.': 'Seuls les admins peuvent changer cela.',
  'A topic’s messages disappear as its group’s do: change it there.':
    'Les messages d’un sujet disparaissent comme ceux de son groupe : modifiez ce réglage dans le groupe.',
  'Only someone who may change that context links it here.':
    'Seule une personne autorisée à modifier ce contexte peut le lier ici.',
  'The general conversation takes the person’s name.':
    'La conversation générale porte le nom de la personne.',
  'General takes the space’s name. Rename the space instead.':
    'Général porte le nom de l’espace. Renommez plutôt l’espace.',
  'There’s no request to answer here.': 'Il n’y a pas de demande à laquelle répondre ici.',
  'Start a group to add people.': 'Créez un groupe pour ajouter des personnes.',
  'Its team is the organization’s: add people to the team instead.':
    'Son équipe est celle de l’organisation : ajoutez plutôt les personnes à l’équipe.',
  'Only admins can add people.': 'Seuls les admins peuvent ajouter des personnes.',
  'Add people to the space instead.': 'Ajoutez plutôt les personnes à l’espace.',
  'Add them to the space first.': 'Ajoutez d’abord cette personne à l’espace.',
  'You can archive this conversation instead.': 'Vous pouvez plutôt archiver cette conversation.',
  'Leave the group to leave its topics. You can archive this one.':
    'Quittez le groupe pour quitter ses sujets. Vous pouvez archiver celui-ci.',
  'Leave the space to leave its General conversation.':
    'Quittez l’espace pour quitter sa conversation Général.',
  'Remove them from the space instead.': 'Retirez plutôt cette personne de l’espace.',
  'That person in this conversation': 'Cette personne dans cette conversation',
  'Admins remove members; the owner removes admins.':
    'Les admins retirent les membres ; le propriétaire retire les admins.',
  'Only admins can remove people.': 'Seuls les admins peuvent retirer des personnes.',
  'Only a group has admins.': 'Seul un groupe a des admins.',
  'Make them an admin of the space instead.': 'Nommez plutôt cette personne admin de l’espace.',
  'Only the owner makes admins.': 'Seul le propriétaire nomme les admins.',
  'You can only edit your own messages.': 'Vous ne pouvez modifier que vos propres messages.',
  'That message was deleted.': 'Ce message a été supprimé.',
  'Only text messages can be edited.': 'Seuls les messages texte peuvent être modifiés.',
  'That isn’t a card that can change.': 'Cette carte ne peut pas changer d’état.',
  'An app moves only its own cards.': 'Une application ne déplace que ses propres cartes.',
  'You can’t make that change to this card.':
    'Vous ne pouvez pas apporter ce changement à cette carte.',
  'Someone just changed this card.': 'Quelqu’un vient de modifier cette carte.',
  'That isn’t a live location.': 'Ce n’est pas une position en direct.',
  'Only whoever is sharing it can change it.': 'Seule la personne qui la partage peut la modifier.',
  'This live location has ended.': 'Cette position en direct est terminée.',
  'That isn’t a checklist.': 'Ce n’est pas une checklist.',
  'That isn’t a split.': 'Ce n’est pas un partage des frais.',
  'That album': 'Cet album',
  'This album is closed.': 'Cet album est fermé.',
  'Add photos you’ve uploaded.': 'Ajoutez des photos que vous avez téléversées.',
  'Albums take photos and videos.': 'Les albums acceptent des photos et des vidéos.',
  'An album holds {ALBUM_MAX} photos.': 'Un album contient {ALBUM_MAX} photos.',
  'That photo': 'Cette photo',
  'Only whoever added it, or made the album, can take it out.':
    'Seule la personne qui l’a ajoutée, ou qui a créé l’album, peut la retirer.',
  'Lines about the conversation stay. You can delete it for yourself.':
    'Les lignes d’information sur la conversation restent. Vous pouvez la supprimer de votre côté.',
  'You can delete your own messages.': 'Vous pouvez supprimer vos propres messages.',
  'Pinned messages are for conversations between people.':
    'Les messages épinglés sont réservés aux conversations entre personnes.',
  'Only the group’s owner and admins pin messages.':
    'Seuls le propriétaire et les admins du groupe épinglent des messages.',
  'Messages are pinned once the message request is answered.':
    'Les messages s’épinglent une fois la demande de message traitée.',
  'Lines about the conversation aren’t pinned.':
    'Les lignes d’information sur la conversation ne s’épinglent pas.',
  '{PINNED_MAX} messages are pinned already, including {n} you deleted for yourself. Unpin one first.':
    {
      one: '{PINNED_MAX} messages sont déjà épinglés, dont un que vous avez supprimé pour vous. Désépinglez-en un d’abord.',
      other:
        '{PINNED_MAX} messages sont déjà épinglés, dont {n} que vous avez supprimés pour vous. Désépinglez-en un d’abord.',
    },
  '{PINNED_MAX} messages are pinned already. Unpin one first.':
    '{PINNED_MAX} messages sont déjà épinglés. Désépinglez-en un d’abord.',
  'That poll': 'Ce sondage',
  'That option isn’t in the poll.': 'Cette option n’est pas dans le sondage.',
  'Choose one option.': 'Choisissez une option.',
  'Messages in a private conversation stay in it.':
    'Les messages d’une conversation privée y restent.',
  'Cards, polls and live locations stay where they were shared.':
    'Les cartes, sondages et positions en direct restent là où ils ont été partagés.',
  'Nothing is forwarded into a private conversation.':
    'Rien ne se transfère dans une conversation privée.',
  'Only a device signed in to Caime reads private conversations.':
    'Seul un appareil connecté à Caime lit les conversations privées.',
  'This device can’t pick up where it left off: it registers afresh.':
    'Cet appareil ne peut pas reprendre là où il s’était arrêté : il s’enregistre à nouveau.',
  'That device': 'Cet appareil',
  'Private conversations open on up to {MAX_DEVICES} devices: remove one in Settings first.':
    'Les conversations privées s’ouvrent sur {MAX_DEVICES} appareils au plus : retirez-en un dans les Réglages d’abord.',
  'That device is registered already.': 'Cet appareil est déjà enregistré.',
  'Approve it from a device that reads your private conversations already: this one doesn’t yet.':
    'Approuvez-le depuis un appareil qui lit déjà vos conversations privées : celui-ci ne le fait pas encore.',
  'That key was used already.': 'Cette clé a déjà été utilisée.',
  'A recovery key for your account': 'Une clé de récupération pour votre compte',
  'Only private conversations are sealed.': 'Seules les conversations privées sont scellées.',
  'That photo couldn’t be read, so it wasn’t sent. Try another.':
    'Cette photo n’a pas pu être lue, elle n’a donc pas été envoyée. Essayez-en une autre.',

  'That file is over 100 MB.': 'Ce fichier dépasse 100 Mo.',
  'That upload': 'Ce téléversement',
  'This upload is already complete.': 'Ce téléversement est déjà terminé.',
  'Resume from the server’s offset.': 'Reprenez à partir de la position indiquée par le serveur.',
  'More bytes than declared.': 'Plus d’octets que ce qui a été annoncé.',
  'That thumbnail': 'Cette miniature',
  'That logo': 'Ce logo',
  'That avatar': 'Cette photo de profil',
  'There’s a call on here already: join it.': 'Un appel est déjà en cours ici : rejoignez-le.',
  'Group calls are for group conversations.':
    'Les appels de groupe sont réservés aux conversations de groupe.',
  'You can call once you’ve joined the conversation.':
    'Vous pourrez appeler une fois dans la conversation.',
  'Calls are for groups of up to {GROUP_CALL_MAX} people.':
    'Les appels sont limités à {GROUP_CALL_MAX} personnes.',
  'You can join once you’ve joined the conversation.':
    'Vous pourrez le rejoindre une fois dans la conversation.',
  'This call is full.': 'Cet appel est complet.',
  'You can’t join this call.': 'Vous ne pouvez pas rejoindre cet appel.',
  'That handle': 'Cet identifiant',
  'Connect first to bring a chat over.': 'Entrez d’abord en contact pour importer une discussion.',
  'Only an app’s token does this.': 'Seul le jeton d’une application fait cela.',
  'An app has up to {perApp} kinds of card. Remove one to make another.':
    'Une application a jusqu’à {perApp} types de carte. Retirez-en un pour en créer un autre.',
  'That kit': 'Ce kit',
  'That isn’t one of an app’s cards.': 'Ce n’est pas l’une des cartes d’une application.',
  'An app changes only its own cards.': 'Une application ne modifie que ses propres cartes.',
  'Choose a time zone from the list.': 'Choisissez un fuseau horaire dans la liste.',
  'Choose an image you uploaded.': 'Choisissez une image que vous avez téléversée.',
  'You can have up to 10 identities.': 'Vous pouvez avoir jusqu’à 10 identités.',
  'That identity': 'Cette identité',
  'Make another identity your default first.': 'Définissez d’abord une autre identité par défaut.',
  'Apps are made by people over 18.':
    'Les applications sont créées par des personnes de plus de 18 ans.',
  'You have {MAX_APPS} apps. Remove one first.':
    'Vous avez {MAX_APPS} applications. Retirez-en une d’abord.',
  'That app isn’t registered with Caime.':
    'Cette application n’est pas enregistrée auprès de Caime.',
  'That app didn’t register this return address.':
    'Cette application n’a pas enregistré cette adresse de retour.',
  'The app didn’t say what it wants to do.': 'L’application n’a pas dit ce qu’elle veut faire.',
  '“{unknown}” isn’t something an app can ask for.':
    '« {unknown} » n’est pas quelque chose qu’une application peut demander.',
  'This export is too large to make here. Write to Caime and it will be made for you.':
    'Cet export est trop volumineux pour être préparé ici. Écrivez à Caime et il sera préparé pour vous.',
  'Only the owner sets how long conversations are kept.':
    'Seul le propriétaire définit la durée de conservation des conversations.',
  'You’re in it already.': 'Vous y êtes déjà.',
  'Teams are for people over 18.': 'Les équipes sont réservées aux plus de 18 ans.',
  'That person on the team': 'Cette personne dans l’équipe',
  'That’s an app’s bot: remove the app instead.':
    'C’est le bot d’une application : retirez plutôt l’application.',
  'Admins remove the team; the owner removes admins.':
    'Les admins retirent les membres de l’équipe ; le propriétaire retire les admins.',
  'Only the organization’s owner and admins remove people.':
    'Seuls le propriétaire et les admins de l’organisation retirent des personnes.',
  'That’s an app’s bot: change the app instead.':
    'C’est le bot d’une application : modifiez plutôt l’application.',
  'Enter a domain like datac.com.': 'Saisissez un domaine comme datac.com.',
  'Another organization has verified this domain.': 'Une autre organisation a vérifié ce domaine.',
  'Add your domain first.': 'Ajoutez d’abord votre domaine.',
  'We couldn’t find the record yet. DNS changes can take a few minutes, sometimes an hour.':
    'L’enregistrement est encore introuvable. Les changements DNS peuvent prendre quelques minutes, parfois une heure.',
  'Only the organization’s owner closes it.': 'Seul le propriétaire de l’organisation la ferme.',
  'This organization was never verified at a domain, so there’s no way to prove it’s yours.':
    'Cette organisation n’a jamais vérifié de domaine : il n’y a aucun moyen de prouver qu’elle est à vous.',
  'Start taking it back first.': 'Lancez d’abord la reprise.',
  'That rule': 'Cette règle',
  'There’s a rule for them already: change that one.':
    'Il y a déjà une règle pour cette personne : modifiez celle-là.',
  'Unknown sphere.': 'Cercle inconnu.',
  '“{role}” isn’t a {sphere} role. Use a custom role instead.':
    '« {role} » n’est pas un rôle du cercle {sphere}. Utilisez plutôt un rôle personnalisé.',
  'Choose a role or write your own, not both.':
    'Choisissez un rôle ou écrivez le vôtre, pas les deux.',
  'That relationship': 'Cette relation',
  'Connect with this person first.': 'Entrez d’abord en contact avec cette personne.',
  'Restore this relationship before changing it.': 'Restaurez cette relation avant de la modifier.',
  'This relationship is {status}.': 'Cette relation est {status}.',
  'This kind of relationship doesn’t end. Archive it instead.':
    'Ce type de relation ne prend pas fin. Archivez-la plutôt.',
  'Only an active relationship can be the main one.':
    'Seule une relation active peut être la principale.',
  'Merge relationships with the same person.':
    'Ne fusionnez que des relations avec la même personne.',
  'You can’t block yourself.': 'Vous ne pouvez pas vous bloquer vous-même.',
  'Choose what you’re reporting.': 'Choisissez ce que vous signalez.',
  'You can add people on the organization’s team, or people you’re connected with.':
    'Vous pouvez ajouter les membres de l’équipe de l’organisation, ou les personnes avec qui vous êtes en contact.',
  'Only the organization’s owner and admins start its spaces.':
    'Seuls le propriétaire et les admins de l’organisation créent ses espaces.',
  'Only the space’s owner and admins can.':
    'Seuls le propriétaire et les admins de l’espace le peuvent.',
  'Only the space’s owner and admins add people.':
    'Seuls le propriétaire et les admins de l’espace ajoutent des personnes.',
  'That person in this space': 'Cette personne dans cet espace',
  'Admins can remove members; the owner removes admins.':
    'Les admins peuvent retirer des membres ; le propriétaire retire les admins.',
  'Only the space’s owner and admins remove people.':
    'Seuls le propriétaire et les admins de l’espace retirent des personnes.',
  'Only the space’s owner makes people admins.':
    'Seul le propriétaire de l’espace nomme des admins.',
  'That suggestion': 'Cette suggestion',
  'This step can’t be taken back here.': 'Cette étape ne peut pas être annulée ici.',
  'That step was changed since: it stays.':
    'Cette étape a été modifiée depuis : elle est conservée.',
  'Keep one of the two.': 'Gardez l’un des deux.',
  'You aren’t connected with both of them any more.': 'Vous n’êtes plus en contact avec les deux.',
  'One of them is blocked: it can’t be merged.':
    'L’un des deux est bloqué : la fusion est impossible.',
  'This suggestion is missing its person.': 'Il manque la personne à cette suggestion.',
  'This suggestion is missing its conversation.': 'Il manque la conversation à cette suggestion.',
  'Accepting a {kind} suggestion isn’t supported yet.':
    'Accepter une suggestion de type {kind} n’est pas encore pris en charge.',
  'Access tokens are for people over 18.': 'Les jetons d’accès sont réservés aux plus de 18 ans.',
  'You have {MAX_TOKENS} tokens. Revoke one you don’t use first.':
    'Vous avez {MAX_TOKENS} jetons. Révoquez-en d’abord un que vous n’utilisez pas.',
  'That token': 'Ce jeton',
  'Only the organization’s owner and admins post its updates.':
    'Seuls le propriétaire et les admins de l’organisation publient ses actualités.',
  'That update is being posted already.': 'Cette actualité est déjà en cours de publication.',
  'That update': 'Cette actualité',
  'You’ve blocked it. Unblock it to follow its updates.':
    'Vous l’avez bloquée. Débloquez-la pour suivre ses actualités.',
  'This account is suspended. If you think that’s wrong, write to whoever runs Caime.':
    'Ce compte est suspendu. Si vous pensez que c’est une erreur, écrivez à l’équipe qui gère Caime.',
  'Missing X-Caime-Client header.': 'En-tête X-Caime-Client manquant.',
  'Someone else is signed in here now.': 'Quelqu’un d’autre est connecté ici maintenant.',
  'An app’s token can’t do this.': 'Le jeton d’une application ne peut pas faire cela.',
  'This app needs the “{scope}” permission for that.':
    'Cette application a besoin de la permission « {scope} » pour cela.',
  'A token can’t do this: sign in to Caime.':
    'Un jeton ne peut pas faire cela : connectez-vous à Caime.',
  'This token needs the “{scope}” permission for that.':
    'Ce jeton a besoin de la permission « {scope} » pour cela.',
  '{n} apps': { one: '{n} application', other: '{n} applications' },

  // Bookings (R58)
  'Coming up: {title}': 'À venir : {title}',
  '{n} promises open': { one: '{n} promesse ouverte', other: '{n} promesses ouvertes' },
  '{n} questions unanswered': {
    one: '{n} question sans réponse',
    other: '{n} questions sans réponse',
  },
  'That card': 'Cette carte',
  'That isn’t something you can book here.': 'Cet élément ne peut pas être réservé ici.',
  'Paid bookings are for people over 18.':
    'Les réservations payantes sont réservées aux plus de 18 ans.',
  'Up to {n} in one booking.': 'Jusqu’à {n} par réservation.',
  'They don’t do that one.': 'Cette personne ne s’en charge pas.',
  'That time has just been taken. Pick another.':
    'Ce créneau vient d’être pris. Choisissez-en un autre.',
  'Your own bookings are yours to do.': 'Vos propres réservations, c’est à vous de les assurer.',
  'An organization’s items are public or for its customers.':
    'Les éléments d’une organisation sont publics ou réservés à ses clients.',
  'Only people on the team can be providers.':
    'Seules les personnes de l’équipe peuvent s’en charger.',
  'per day': 'par jour',
  'Only the team says who does a booking.':
    'Seule l’équipe décide qui se charge d’une réservation.',
  'That isn’t a booking from the catalog.': 'Ce n’est pas une réservation du catalogue.',

  // Orders from the catalog (R60)
  'Orders aren’t taken here.': 'Les commandes ne sont pas acceptées ici.',
  'That isn’t something you can order here.': 'Cet élément ne peut pas être commandé ici.',
  'Up to {n} of that in one order.': 'Jusqu’à {n} par commande.',
  'They don’t offer that way.': 'Ce mode de livraison ou de retrait n’est pas proposé.',
  offers: 'propose',
  collections: 'collections',
  'Ways to be paid are for people over 18.':
    'Les moyens de paiement sont réservés aux plus de 18 ans.',
  'In a group, ask to be paid; say you’re paying where it’s two of you.':
    'Dans un groupe, demandez un paiement ; à deux, indiquez que vous payez.',
  'pays by': 'moyens de paiement',
  '{name}, for {org}': '{name}, pour {org}',
  'That isn’t a Pay card.': 'Ce n’est pas une carte Payer.',
  'This card isn’t paid by card.': 'Cette carte ne se règle pas par carte bancaire.',
  'Only whoever pays it pays by card, while it isn’t paid.':
    'Seul celui qui la règle peut payer par carte, tant qu’elle n’est pas payée.',
  '{name} doesn’t take cards here any more.': '{name} n’accepte plus les cartes ici.',
  'This card has no amount to pay by card.': 'Cette carte n’a pas de montant à régler par carte.',
  'Payment to {name}': 'Paiement à {name}',
  'Only the organization’s owner connects where its money goes.':
    'Seul le propriétaire de l’organisation choisit où va son argent.',
  'Paying by card here': 'Le paiement par carte ici',
  'Payments are set by someone 18 or over.':
    'Les paiements sont configurés par une personne de 18 ans ou plus.',
  'Stripe can’t be asked right now': 'Stripe ne répond pas pour le moment',
  'Only a person pays by card.': 'Seule une personne peut payer par carte.',
  'Paying by card can’t start right now':
    'Le paiement par carte ne peut pas démarrer pour le moment',
  Waiting: 'En attente',
};
