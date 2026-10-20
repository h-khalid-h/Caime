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
  work: 'activité',
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
  Example: 'Exemple',
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
  'It lands in the inbox, first if they’ve waited longest.':
    'Elle arrive dans la boîte de réception, en tête si elle attend depuis le plus longtemps.',
  'Lina writes to Nile Dental from the app she uses for everyone else. The team sees one conversation, its state and who has it; Lina sees the organization, never which person.':
    'Lina écrit à Nile Dental depuis l’application qu’elle utilise pour tous les autres. L’équipe voit une conversation, son état et qui la prend en charge ; Lina voit l’organisation, jamais la personne qui répond.',
  'Can I book a cleaning on Thursday?': 'Je peux réserver un détartrage jeudi ?',
  'new · nobody has it · 2 min': 'nouvelle · non attribuée · 2 min',
  'The agent answers': 'L’agent répond',
  'From what you wrote down, and it says so.': 'D’après ce que vous avez écrit, et il le dit.',
  'The organization’s AI agent answers only from its knowledge (up to {n} characters you gave it), is marked as an AI, and hands over to a person the moment it isn’t sure. With bookable hours set, it offers the open slots and books the one the customer picks; with orders on, it writes down what they ask for from the menu. The team confirms each, reads the sentence of its knowledge every answer rests on, and says what it may do and when it answers.':
    'L’agent IA de l’organisation ne répond qu’à partir de ses connaissances (jusqu’à {n} caractères que vous lui avez donnés), est marqué comme une IA, et passe la main à une personne dès qu’il n’est pas sûr. Si des heures réservables sont définies, il propose les créneaux libres et réserve celui que le client choisit ; si les commandes sont ouvertes, il note ce qu’il demande sur la carte. L’équipe confirme chacun, lit la phrase de ses connaissances sur laquelle repose chaque réponse, et décide de ce qu’il peut faire et du moment où il répond.',
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
  '{n} conversations a day': '{n} conversations par jour',
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
  'What makes Caime Caime is never counted: connections, relationships, what needs you, what you’re waiting for, search and sync are in every plan. Plans differ only in what costs money to run, and in what organizations buy.':
    'L’essentiel de Caime n’est jamais décompté : contacts, relations, ce qui a besoin de vous, ce que vous attendez, recherche et synchronisation sont dans chaque forfait. Les forfaits ne diffèrent que par ce qui a un coût de fonctionnement, et par ce que les organisations achètent.',
  'For people': 'Pour les particuliers',
  Personal: 'Personal',
  files: 'fichiers',
  automations: 'automatisations',
  'everything else': 'tout le reste',
  'connections, attention, memory, spaces, calls, private conversations':
    'contacts, attention, mémoire, espaces, appels, conversations privées',
  'how your relationships are going, from your own messages, for you only':
    'comment vont vos relations, d’après vos propres messages, pour vous uniquement',
  team: 'équipe',
  'how fast the team answers, who is waiting, what is open, what was booked, ordered and paid':
    'la rapidité de réponse de l’équipe, qui attend, ce qui est ouvert, ce qui a été réservé, commandé et payé',
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
  OAuth: 'OAuth',
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
  Call: 'Appel',
  Answered: 'Décroché',
  'from {caller}': 'de {caller}',
  'the same name': 'le même nom',
  'one name is part of the other': 'un nom fait partie de l’autre',
  'the same nickname': 'le même surnom',
  'you know both from {org}': 'vous les connaissez via {org}',
  '{name} may have two accounts': '{name} a peut-être deux comptes',
  '{merge} and {keep} may be the same person': '{merge} et {keep} sont peut-être la même personne',
  'Both have {reasons}. Merged, they show as one in People; both accounts and conversations stay, and you can separate them again.':
    'Les deux ont {reasons}. Une fois fusionnés, ils apparaissent comme une seule personne dans Personnes ; les deux comptes et conversations restent, et vous pouvez les séparer à nouveau.',
  '{title} call': 'Appel {title}',
  Joined: 'A rejoint',
  'Turned down': 'Refusé',
  'from {starter}': 'de {starter}',
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
  'Cai can’t help with this one.': 'Cai ne peut pas vous aider sur ce point.',
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
  'That account': 'Ce compte',
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
  'Insights come with Business: how fast {name}’s team answers, how many customers write, what they book, order and pay, and what’s still open.':
    'Les statistiques sont incluses dans Business : la rapidité de réponse de l’équipe de {name}, combien de clients écrivent, ce qu’ils réservent, commandent et paient, et ce qui reste ouvert.',
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
  'That job': 'Cette tâche',
  'That context': 'Ce contexte',
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
  'Where you live, Caime is for people {age} and older.':
    'Là où vous vivez, Caime est réservé aux personnes de {age} ans et plus.',
  'Your plan starts as soon as you pay. In the EU you may withdraw within 14 days by writing to {email}, and you pay only for the days it was on. Terms: {terms}':
    'Votre formule démarre dès le paiement. Dans l’UE, vous pouvez vous rétracter dans les 14 jours en écrivant à {email}, et vous ne payez alors que les jours où elle était active. Conditions : {terms}',
  'You need to be at least {age} to use Caime.':
    'Il faut avoir au moins {age} ans pour utiliser Caime.',
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
  'You’ve saved {max} things, the most there’s room for. Remove some to save more.':
    'Vous avez enregistré {max} éléments, le maximum possible. Retirez-en pour en enregistrer d’autres.',
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
  'That request': 'Cette demande',
  'That connection': 'Ce contact',
  'That merged connection': 'Ce contact fusionné',
  'A private group holds up to {max} people: each message is sealed for every device in it.':
    'Un groupe privé accueille jusqu’à {max} personnes : chaque message est scellé pour chaque appareil qui s’y trouve.',
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
  'An album holds {max} photos.': 'Un album contient {max} photos.',
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
  '{max} messages are pinned already, including {n} you deleted for yourself. Unpin one first.': {
    one: '{max} messages sont déjà épinglés, dont un que vous avez supprimé pour vous. Désépinglez-en un d’abord.',
    other:
      '{max} messages sont déjà épinglés, dont {n} que vous avez supprimés pour vous. Désépinglez-en un d’abord.',
  },
  '{max} messages are pinned already. Unpin one first.':
    '{max} messages sont déjà épinglés. Désépinglez-en un d’abord.',
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
  'Private conversations open on up to {max} devices: remove one in Settings first.':
    'Les conversations privées s’ouvrent sur {max} appareils au plus : retirez-en un dans les Réglages d’abord.',
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
  'Calls are for groups of up to {max} people.': 'Les appels sont limités à {max} personnes.',
  'You can join once you’ve joined the conversation.':
    'Vous pourrez le rejoindre une fois dans la conversation.',
  'This call is full.': 'Cet appel est complet.',
  'You can’t join this call.': 'Vous ne pouvez pas rejoindre cet appel.',
  'That handle': 'Cet identifiant',
  'Connect first to bring a chat over.': 'Entrez d’abord en contact pour importer une discussion.',
  'Only an app’s token does this.': 'Seul le jeton d’une application fait cela.',
  'An app has up to {perApp} kinds of card. Remove one to make another.':
    'Une application a jusqu’à {perApp} types de carte. Retirez-en un pour en créer un autre.',
  'That isn’t one of an app’s cards.': 'Ce n’est pas l’une des cartes d’une application.',
  'An app changes only its own cards.': 'Une application ne modifie que ses propres cartes.',
  'Choose a time zone from the list.': 'Choisissez un fuseau horaire dans la liste.',
  'Choose an image you uploaded.': 'Choisissez une image que vous avez téléversée.',
  'Apps are made by people over 18.':
    'Les applications sont créées par des personnes de plus de 18 ans.',
  'You have {max} apps. Remove one first.': 'Vous avez {max} applications. Retirez-en une d’abord.',
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
  'You have {max} tokens. Revoke one you don’t use first.':
    'Vous avez {max} jetons. Révoquez-en d’abord un que vous n’utilisez pas.',
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
  'Send a sticker from the button beside an empty message box. The Caishy Friends pack is free.':
    'Envoyez un sticker avec le bouton à côté de la zone de message, quand elle est vide. Le pack Les amis de Caishy est gratuit.',
  'Press and hold a message, or point at it on a computer, to react, reply or save it.':
    'Appuyez longuement sur un message, ou survolez-le sur ordinateur, pour réagir, répondre ou l’enregistrer.',
  'Your picture at the top opens you and your settings.':
    'Votre photo, en haut, ouvre votre profil et vos réglages.',
  'Yay, you found me! I’m Momo. When nothing needs you, I’m the one cheering.':
    'Youpi, me voilà ! C’est Momo. Quand rien n’a besoin de vous, c’est la fête.',
  'When Attention says nothing needs you, that’s Caime working. Enjoy it!':
    'Quand Attention dit que rien n’a besoin de vous, c’est Caime qui travaille. Profitez-en !',
  'Mark something done in Actions, and whoever was waiting hears it.':
    'Marquez quelque chose comme fait dans Actions, et qui l’attendait en est informé.',
  'Quiet hours keep your evenings yours: Settings, then Notifications.':
    'Les heures de silence vous rendent vos soirées : Réglages, puis Notifications.',
  'I’m Panda. I stay by your side while you wait for someone.':
    'C’est Panda. Je reste à vos côtés pendant que vous attendez quelqu’un.',
  'Ask someone for something, and it waits under “Waiting for” in Actions until they answer.':
    'Demandez quelque chose à quelqu’un : cela reste sous « En attente de » dans Actions jusqu’à sa réponse.',
  'When a wait goes quiet for three days, Attention asks whether it’s still open.':
    'Quand une attente reste sans nouvelles trois jours, Attention demande si elle est toujours d’actualité.',
  'How you know someone can offer a follow-up when a question goes unanswered.':
    'La façon dont vous connaissez quelqu’un peut proposer une relance quand une question reste sans réponse.',
  'Hello, I’m Lumi! I love making new things: groups, topics and spaces.':
    'Bonjour, c’est Lumi ! J’adore créer : des groupes, des sujets et des espaces.',
  'A space gathers the people, conversations and plans of one project.':
    'Un espace rassemble les personnes, les conversations et les plans d’un même projet.',
  'A topic keeps one conversation about one thing, without starting over.':
    'Un sujet garde une conversation sur une seule chose, sans tout recommencer.',
  'The + in Chats starts a conversation, a group or a space.':
    'Le + dans Discussions lance une conversation, un groupe ou un espace.',
  'Hi! I’m Pico, and I’m curious about everything.': 'Salut ! C’est Pico, et tout m’intéresse.',
  'Search understands sentences, like “what did Alex ask me last week”.':
    'La recherche comprend les phrases, comme « qu’est-ce qu’Alex m’a demandé la semaine dernière ».',
  'Search for someone’s name to find your conversations, files and promises with them.':
    'Cherchez le nom de quelqu’un pour retrouver vos conversations, fichiers et promesses avec cette personne.',
  'Find people by their @handle in People.':
    'Trouvez des personnes par leur @identifiant dans Personnes.',
  'I’m Niko. First steps are my favourite thing!':
    'C’est Niko. Les premiers pas, c’est ce que je préfère !',
  'Connect with someone from People: their @handle, a link or a QR code.':
    'Connectez-vous à quelqu’un depuis Personnes : son @identifiant, un lien ou un code QR.',
  'Tell Caime how you know someone. Only you see it, and it decides what reaches you when.':
    'Dites à Caime comment vous connaissez quelqu’un. Personne d’autre ne le voit, et cela décide de ce qui vous parvient, et quand.',
  'Say hi first. Most good conversations start that way.':
    'Dites bonjour en premier. La plupart des bonnes conversations commencent ainsi.',
  'I’m Zuzu. I remember what was decided, so you don’t have to.':
    'C’est Zuzu. Je me souviens de ce qui a été décidé, pour que vous n’ayez pas à le faire.',
  'What was decided and what’s still open in a conversation are in its details.':
    'Ce qui a été décidé et ce qui reste ouvert dans une conversation se trouvent dans ses détails.',
  'Save a message to find it again in Saved.':
    'Enregistrez un message pour le retrouver dans Enregistrés.',
  'A person’s page remembers what’s open between the two of you.':
    'La page d’une personne se souvient de ce qui reste ouvert entre vous deux.',
  'Hi, I’m Caishy! Ask me anything about Caime, or just say hi.':
    'Coucou, c’est Caishy ! Posez-moi n’importe quelle question sur Caime, ou dites simplement bonjour.',
  'I welcome people to Caime and keep the Caishy Friends stickers. Ask me how anything here works.':
    'J’accueille chacun dans Caime et je garde les stickers Caishy Friends. Demandez-moi comment marche tout ce qui est ici.',
  'Aww, any time!': 'Oh, avec plaisir !',
  'I cheer you on when you’re all caught up. Ask me what needs you, or what’s coming up.':
    'Je vous encourage quand vous êtes à jour. Demandez-moi ce qui a besoin de vous, ou ce qui arrive.',
  'Yay! Happy to help!': 'Youpi ! Avec grand plaisir !',
  'I keep an eye on what you’re waiting for from others. Ask me what you’re waiting on.':
    'Je garde un œil sur ce que vous attendez des autres. Demandez-moi ce que vous attendez.',
  'Always here for you.': 'Toujours là pour vous.',
  'I help you make things together: groups, topics and spaces. Ask me which one fits.':
    'Je vous aide à créer ensemble : groupes, sujets et espaces. Demandez-moi lequel convient.',
  'My pleasure! Go make something lovely.': 'Avec plaisir ! Allez créer quelque chose de beau.',
  'I know how to find things: messages, files, promises and people. Ask me how to search for something.':
    'Je sais trouver les choses : messages, fichiers, promesses et personnes. Demandez-moi comment chercher quelque chose.',
  'Any time! What else are you curious about?':
    'Quand vous voulez ! Qu’est-ce qui vous intrigue d’autre ?',
  'I help with first steps: connecting with people, invites and saying hi first. Ask me where to begin.':
    'J’aide pour les premiers pas : se connecter aux gens, les invitations, dire bonjour en premier. Demandez-moi par où commencer.',
  'You’ve got this!': 'Vous allez y arriver !',
  'I remember what was decided and what you said you’d do. Ask me what you promised.':
    'Je me souviens de ce qui a été décidé et de ce que vous avez dit que vous feriez. Demandez-moi ce que vous avez promis.',
  'Glad I could help.': 'Un plaisir d’avoir pu aider.',
  'And peace be upon you!': 'Wa alaykoum salam !',
  'Hi {name}!': 'Bonjour {name} !',
  'Any time!': 'Quand vous voulez !',
  'Hi {name}, I’m Cai. Ask me what you’re waiting on, what’s asked of you, what you said you’d do or what’s coming up.':
    'Bonjour {name}, c’est Cai. Demandez-moi ce que vous attendez, ce qu’on vous demande, ce que vous avez promis ou ce qui arrive.',
  'With AI assist on, you can ask me anything else too.':
    'Avec l’assistance IA activée, vous pouvez aussi me demander tout le reste.',
  'Turn on AI assist in Settings, and you can ask me anything else too.':
    'Activez l’assistance IA dans Réglages, et vous pourrez aussi me demander tout le reste.',
  'I can answer that with AI assist on: Settings, then AI assist.':
    'Je peux répondre à cela avec l’assistance IA activée : Réglages, puis Assistance IA.',
  'That one’s beyond me.': 'Ça me dépasse.',
  'I can always tell you what you’re waiting on, what’s asked of you, what you said you’d do and what’s coming up this week. Just ask, in your own words.':
    'Je peux toujours vous dire ce que vous attendez, ce qu’on vous demande, ce que vous avez promis et ce qui arrive cette semaine. Demandez simplement, avec vos mots.',
  'You’re not waiting on anyone right now.': 'Vous n’attendez personne pour l’instant.',
  'Nobody is waiting on you right now.': 'Personne ne vous attend pour l’instant.',
  'Nothing you said you’d do is open.': 'Rien de ce que vous avez promis n’est en suspens.',
  'Coming up this week:': 'Cette semaine :',
  'Nothing is coming up this week.': 'Rien de prévu cette semaine.',
  '{name} reads words and stickers.': 'Avec {name}, des mots et des stickers seulement.',
  '{name} talks in one conversation.': '{name} n’a qu’une conversation.',
  'And {n} more in Actions.': {
    one: 'Et une de plus dans Actions.',
    other: 'Et {n} de plus dans Actions.',
  },
  'You’re waiting on {n} things:': {
    one: 'Vous attendez une chose :',
    other: 'Vous attendez {n} choses :',
  },
  '{n} things are asked of you:': {
    one: 'Une chose vous est demandée :',
    other: '{n} choses vous sont demandées :',
  },
  'You said you’d do {n} things:': {
    one: 'Vous avez promis une chose :',
    other: 'Vous avez promis {n} choses :',
  },
  '{name} hasn’t answered about “{title}” yet. Shall I send this?':
    '{name} n’a pas encore répondu pour « {title} ». J’envoie ceci ?',
  'That follow-up': 'Cette relance',
  'That wait': 'Cette attente',
  'That’s no longer open.': 'Ce n’est plus ouvert.',
  'Today:': 'Aujourd’hui :',
  'Nothing is planned for today.': 'Rien de prévu aujourd’hui.',
  'Ask me about any of it.': 'Posez-moi vos questions sur tout cela.',
  'Here’s your week with your people.': 'Voici votre semaine avec vos proches.',
  'Last week you talked with {n} people.': {
    one: 'La semaine dernière, vous avez parlé avec une personne.',
    other: 'La semaine dernière, vous avez parlé avec {n} personnes.',
  },
  'You did {n} things you said you would.': {
    one: 'Vous avez fait une chose que vous aviez promise.',
    other: 'Vous avez fait {n} choses que vous aviez promises.',
  },
  'Gone quiet:': 'Plus de nouvelles :',
  '• {name}: nothing for {n} weeks': {
    one: '• {name} : rien depuis une semaine',
    other: '• {name} : rien depuis {n} semaines',
  },
  'You’ve waited longest on {name}: {title}.':
    'Ce que vous attendez depuis le plus longtemps, de {name} : {title}.',
  '{n} meetings and appointments this week.': {
    one: 'Un rendez-vous cette semaine.',
    other: '{n} rendez-vous cette semaine.',
  },
  'A quiet week: nothing to tell you.': 'Une semaine calme : rien à vous dire.',
  '{n} people have gone quiet.': {
    one: 'Plus de nouvelles d’une personne.',
    other: 'Plus de nouvelles de {n} personnes.',
  },
  '{n} things are asked of you.': {
    one: 'Une chose vous est demandée.',
    other: '{n} choses vous sont demandées.',
  },
  'You’re waiting on {n} things.': {
    one: 'Vous attendez une chose.',
    other: 'Vous attendez {n} choses.',
  },
  'You said you’d do {n} things.': {
    one: 'Vous avez promis une chose.',
    other: 'Vous avez promis {n} choses.',
  },
  'Say why, so the developer can change it and ask again.':
    'Dites pourquoi, pour que le développeur puisse modifier et redemander.',
  'Only an organization’s owner or admins publish apps under it.':
    'Seuls le propriétaire ou les admins d’une organisation publient des applications sous son nom.',
  'Connect must send people to the app’s own address: one it returns to, or its website.':
    'Connecter doit envoyer les gens à l’adresse de l’application elle-même : une où elle revient, ou son site web.',
  'Who does it is for the team to say.': 'Qui s’en charge, c’est à l’équipe de le dire.',
  'This card has been paid already.': 'Cette carte a déjà été payée.',
  'The listing changed since it was looked at: look at it again.':
    'La fiche a changé depuis son examen : examinez-la à nouveau.',
  'Yours to do: {name}': 'À vous de faire : {name}',
  '{org} named you for this booking.': '{org} vous a désigné pour cette réservation.',
  About: 'À propos',
  '{name} is listed in Discover': '{name} est dans Découvrir',
  '{name} wasn’t listed': '{name} n’a pas été répertorié',
  'Anyone on Caime can find and connect it now.':
    'Tout le monde sur Caime peut maintenant le trouver et le connecter.',
  'A text message carries no payload.': 'Un message texte ne porte pas de charge utile.',
  'That isn’t from the mail provider.': 'Ceci ne vient pas du fournisseur de messagerie.',
  'That isn’t a mail.': 'Ce n’est pas un e-mail.',
  'Built by {site}': 'Faite par {site}',
  Categories: 'Catégories',
  Marketplace: 'Marketplace',
  marketplace: 'marketplace',
  '{category} apps for {site}': 'Apps pour {site} : {category}',
  'Apps for {site}: the marketplace': 'Apps pour {site} : la marketplace',
  'Apps that work with {site}: its own, the automation platforms, and apps developers listed after {site} looked at each one. Each asks you before it does anything, and you can end it any time.':
    'Des apps qui fonctionnent avec {site} : les siennes, les plateformes d’automatisation, et des apps que leurs développeurs ont listées après que {site} a regardé chacune. Chacune vous demande avant de faire quoi que ce soit, et vous pouvez y mettre fin à tout moment.',
  'More apps': 'Plus d’apps',
  '{category} apps': 'Apps : {category}',
  'Apps that work with {site}.': 'Des apps qui fonctionnent avec {site}.',
  'Nothing here yet.': 'Rien ici pour l’instant.',
  'List your app': 'Lister votre app',
  how: 'comment',
  'Register it under Settings → Developer, fill in its listing and ask. {site} looks at every one against the bar on {developers}, once, and again whenever what it shows changes.':
    'Enregistrez-la dans Réglages → Développeur, remplissez sa fiche et demandez. {site} regarde chacune selon les règles de {developers}, une fois, puis à chaque changement de ce qu’elle affiche.',
  'the developers’ page': 'la page des développeurs',
  order: 'ordre',
  'By how many people connected it, then the newest. Nothing is paid for: no placement, no ratings.':
    'Selon le nombre de personnes qui l’ont connectée, puis les plus récentes. Rien ne s’achète : ni placement, ni notes.',
  by: 'par',
  reviewed: 'vérification',
  'Reviewed by {site}': 'Vérifiée par {site}',
  category: 'catégorie',
  'gives Caime': 'apporte à Caime',
  connected: 'connectée',
  'where it goes': 'où il va',
  help: 'aide',
  '{site}’s help': 'L’aide de {site}',
  '{site}’s privacy policy': 'La politique de confidentialité de {site}',
  '{name} for {site} · Marketplace': '{name} pour {site} · Marketplace',
  'Turn it on in {site}': 'L’activer dans {site}',
  'Connect in {site}': 'Connecter dans {site}',
  'More {category} apps': 'Plus d’apps : {category}',
  'The bar for the marketplace': 'Les règles de la marketplace',
  'Each one is asked for because the app uses it today, never for a feature to come. Reading everything is looked at closer.':
    'Chacune est demandée parce que l’app s’en sert aujourd’hui, jamais pour une fonction à venir. Tout lire est examiné de plus près.',
  connect: 'connecter',
  'Caime follows Connect to the end, as a person would, before it lists the app.':
    'Caime suit Connecter jusqu’au bout, comme le ferait une personne, avant de lister l’app.',
  'help and privacy': 'aide et confidentialité',
  'A support address and a privacy policy that open, both on the listing. One that stops working takes the app out.':
    'Une adresse d’aide et une politique de confidentialité qui s’ouvrent, toutes deux sur la fiche. Si l’une cesse de fonctionner, l’app est retirée.',
  never: 'jamais',
  'Exporting or backing up conversations wholesale, deleting in bulk, copying Caime’s own app, taking payments through Caime, training a model on what it reads, or one account shared by several people.':
    'Exporter ou sauvegarder les conversations en bloc, supprimer en masse, copier l’app de Caime, encaisser des paiements via Caime, entraîner un modèle sur ce qu’elle lit, ou un compte partagé entre plusieurs personnes.',
  'a model': 'un modèle',
  'An app that puts people’s words through a model says which, what it keeps, for how long and where. The listing shows it as Caime shows its own processors.':
    'Une app qui fait passer les mots des gens par un modèle dit lequel, ce qu’elle conserve, combien de temps et où. La fiche l’affiche comme Caime affiche ses propres sous-traitants.',
  age: 'âge',
  'the listing': 'la fiche',
  'A tagline, a category, how it’s paid for, its languages, up to {n} screenshots at 8:5, where to get help and its privacy policy.':
    'Une accroche, une catégorie, comment elle est payée, ses langues, jusqu’à {n} captures d’écran au format 8:5, où trouver de l’aide et sa politique de confidentialité.',
  changes: 'changements',
  'A change to what the listing shows asks again. An app left broken is taken out, with a note to its developer.':
    'Un changement de ce qu’affiche la fiche redemande une vérification. Une app laissée en panne est retirée, avec une note pour son développeur.',
  'the order': 'l’ordre',
  'By how many people connected it, then the newest. No paid placement, no ratings.':
    'Selon le nombre de personnes qui l’ont connectée, puis les plus récentes. Pas de placement payant, pas de notes.',
  'The marketplace': 'La marketplace',
  'Only a listed app can be taken out.': 'Seule une app listée peut être retirée.',
  'Check every point of the bar before listing it.':
    'Vérifiez chaque point des règles avant de la lister.',
  '{name} was taken out of Discover': '{name} a été retirée de Découvrir',
  'That screenshot': 'Cette capture d’écran',
  'A listing needs a tagline, a category, how it’s paid for, where to get help, a privacy policy and where Connect goes.':
    'Une fiche a besoin d’une accroche, d’une catégorie, de comment elle est payée, d’où trouver de l’aide, d’une politique de confidentialité et d’où mène Connecter.',
  'Starting now: {title}': 'Commence maintenant : {title}',
  'It’s time to join.': 'C’est l’heure de rejoindre la réunion.',
  'A guest can’t do this.': 'Un invité ne peut pas faire cela.',
  'Only a meeting takes guests.': 'Seule une réunion accueille des invités.',
  'A meeting takes guests once it’s agreed.':
    'Une réunion accueille des invités une fois convenue.',
  'Only a meeting held on Caime, at a time, takes guests.':
    'Seule une réunion tenue sur Caime, à une heure précise, accueille des invités.',
  'That meeting is over.': 'Cette réunion est terminée.',
  'A meeting holds eight people at most.': 'Une réunion réunit huit personnes au plus.',
  'That isn’t an email address.': 'Ce n’est pas une adresse e-mail.',
  'Guests join meetings agreed in a chat or a group.':
    'Les invités rejoignent des réunions convenues dans une discussion ou un groupe.',
  'Guests are invited by people 18 or over.':
    'Les invités sont invités par des personnes de 18 ans ou plus.',
  'That’s your own address.': 'C’est votre propre adresse.',
  'Guests aren’t available in this conversation.':
    'Les invités ne sont pas disponibles dans cette conversation.',
  'They can’t join a conversation with guests.':
    'Impossible de les ajouter à une conversation avec des invités.',
  'That invitation': 'Cette invitation',
  'This invitation is for your Caime account: sign in.':
    'Cette invitation est pour votre compte Caime : connectez-vous.',
  'Someone else is signed in here. Open the link in another browser, or sign out first.':
    'Quelqu’un d’autre est connecté ici. Ouvrez le lien dans un autre navigateur, ou déconnectez-vous d’abord.',
  '{name} is coming: {title}': '{name} vient : {title}',
  '{name} can’t come: {title}': '{name} ne peut pas venir : {title}',
  '{name} might come: {title}': '{name} viendra peut-être : {title}',
  // Passkeys (R36).
  'That took too long. Try your passkey again.':
    'Cela a pris trop de temps. Réessayez votre clé d’accès.',
  'That passkey doesn’t open a Caime account.': 'Cette clé d’accès n’ouvre aucun compte Caime.',
  'This account has as many passkeys as it can keep. Remove one first.':
    'Ce compte a autant de clés d’accès qu’il peut en garder. Supprimez-en une d’abord.',
  'That passkey couldn’t be checked, so it wasn’t added. Try again.':
    'Cette clé d’accès n’a pas pu être vérifiée, elle n’a donc pas été ajoutée. Réessayez.',
  'That passkey is already on an account.': 'Cette clé d’accès est déjà sur un compte.',
  'That passkey': 'Cette clé d’accès',
  // Stock that runs out (R60).
  '{name}: only {n} left.': {
    one: '{name} : plus qu’un en stock.',
    other: '{name} : plus que {n} en stock.',
  },
  '{name} is sold out.': 'Plus de {name} en stock.',
  // Options on an item (R60).
  'Choose from “{option}” for {name}.': 'Choisissez dans « {option} » pour {name}.',
  // A split's share paid with Pay (R62).
  'You don’t owe a share of this split.': 'Vous ne devez aucune part de ce partage.',
  'Your share of this split is settled.': 'Votre part de ce partage est réglée.',
  'A Pay card for your share is waiting already.': 'Une carte Payer pour votre part attend déjà.',
  // A paid Pay card's receipt (R62, R65).
  'That receipt': 'Ce reçu',
  // A meeting that repeats (R58).
  'A meeting repeats only in a chat or a group.':
    'Une réunion ne se répète que dans une discussion ou un groupe.',
  'A meeting can’t stop repeating before it starts.':
    'La réunion ne peut pas cesser de se répéter avant de commencer.',
  'Until is for a meeting that repeats.': '« Jusqu’à » ne vaut que pour une réunion qui se répète.',
  'That meeting doesn’t repeat.': 'Cette réunion ne se répète pas.',
  'That one is over. Stop it from the next one.':
    'Celle-ci est terminée. Arrêtez la répétition depuis la suivante.',
  '{name}: stopped repeating': 'Répétition arrêtée : {name}',
  'What {name} knows': 'Ce que sait {name}',
  'A morning brief in its chat at the hour you choose, worked out by the rules at no cost.':
    'Un point du matin dans sa conversation, à l’heure choisie, établi par les règles sans frais.',
  'A look at your week: who you talked with, who went quiet, what you’ve waited on longest.':
    'Un regard sur votre semaine : avec qui vous avez parlé, qui s’est tu, ce que vous attendez depuis le plus longtemps.',
  'A wait you hand it comes back as a follow-up ready to send; nothing goes until you tap Send.':
    'Une attente que vous lui confiez revient en relance prête à envoyer ; rien ne part sans votre toucher sur Envoyer.',
  'Ask Cai in Search answers from your own messages and shows the ones it rests on.':
    'Demander à Cai, dans la recherche, répond à partir de vos propres messages et montre ceux sur lesquels il s’appuie.',
  'What it learned from your choices is listed in Settings, and forgotten when you say.':
    'Ce qu’il a appris de vos choix est listé dans les Réglages, et oublié quand vous le dites.',
  '{when} couldn’t be booked': '{when} n’a pas pu être réservé',
  'That time was taken. The times after it go on.':
    'Ce créneau était pris. Les suivants continuent.',
  'It stopped repeating': 'La répétition s’est arrêtée',
  'It can’t be booked any more. Book again to go on.':
    'Ce n’est plus réservable. Réservez à nouveau pour continuer.',
  'An appointment repeats only in a chat or with an organization.':
    'Un rendez-vous ne se répète que dans une discussion ou avec une organisation.',
  'An appointment can’t stop repeating before it starts.':
    'Un rendez-vous ne peut pas cesser de se répéter avant de commencer.',
  // An organization's AI agent says who it is, and passes a conversation on (R87).
  'Hi {name}, I’m {agent}, the AI assistant for {org}.':
    'Bonjour {name}, ici {agent}, l’assistant IA qui répond pour {org}.',
  'Hello, I’m {agent}, the AI assistant for {org}.':
    'Bonjour, ici {agent}, l’assistant IA qui répond pour {org}.',
  'I’ve passed this to the team at {org}. Someone will answer here.':
    'J’ai transmis votre demande à l’équipe de {org}. Quelqu’un vous répondra ici.',
  // The organizations someone runs, in the weekly digest (R87).
  'At {org}:': 'Chez {org} :',
  '• {n} new conversations this week': {
    one: '• Une nouvelle conversation cette semaine',
    other: '• {n} nouvelles conversations cette semaine',
  },
  '• {n} customers waiting on the team': {
    one: '• Une personne attend une réponse de l’équipe',
    other: '• {n} personnes attendent une réponse de l’équipe',
  },
  '• {n} bookings in the week ahead': {
    one: '• Une réservation dans la semaine à venir',
    other: '• {n} réservations dans la semaine à venir',
  },
  '• {n} orders still open': {
    one: '• Une commande encore ouverte',
    other: '• {n} commandes encore ouvertes',
  },
  'That connection was started by someone else.':
    'Cette connexion a été commencée par quelqu’un d’autre.',
  'Turn on Files for this account first.': 'Activez d’abord Fichiers pour ce compte.',
  'That account needs connecting again.': 'Ce compte doit être connecté à nouveau.',
  'Google’s files are picked in Google’s own window.':
    'Les fichiers Google se choisissent dans la fenêtre de Google.',
  'That page isn’t one of these.': 'Cette page n’en fait pas partie.',
  'That kind of Google file can’t be attached. Pick a document or a file.':
    'Ce type de fichier Google ne peut pas être joint. Choisissez un document ou un fichier.',
  'Pick a file, not a folder.': 'Choisissez un fichier, pas un dossier.',
  'That isn’t offered for this account here.': 'Ce n’est pas proposé pour ce compte ici.',
  'That picker': 'Ce sélecteur',
  'Pick a file': 'Choisir un fichier',
  'That email belongs to someone else on Caime.':
    'Cette adresse e-mail appartient à quelqu’un d’autre sur Caime.',
  'That number belongs to someone else on Caime.':
    'Ce numéro appartient à quelqu’un d’autre sur Caime.',
  'Phone numbers can’t be proven here yet. Try again later.':
    'Les numéros de téléphone ne peuvent pas encore être prouvés ici. Réessayez plus tard.',
  'Write the number with its country code, like +20 101 234 5678.':
    'Écrivez le numéro avec l’indicatif du pays, comme +20 101 234 5678.',
  'That’s already yours.': 'C’est déjà à vous.',
  'That’s as many as one person can add. Remove one first.':
    'C’est le maximum pour une personne. Retirez-en un d’abord.',
  'That address': 'Cette adresse',
  'That code isn’t right. Check it and try again.':
    'Ce code n’est pas le bon. Vérifiez-le et réessayez.',
  'Caime can’t send email here yet.': 'Caime ne peut pas encore envoyer d’e-mails ici.',
  'That’s a Caime address. Find them by their handle.':
    'C’est une adresse Caime. Trouvez la personne par son identifiant.',
  'Writing to an address by email is for people over 18.':
    'Écrire à une adresse par e-mail est réservé aux plus de 18 ans.',
  'That kind of place isn’t offered here.': 'Ce type de lieu n’est pas proposé ici.',
  'Only an organization’s items are done at its places.':
    'Seuls les articles d’une organisation se font dans ses lieux.',
  'Choose one of your places that customers may see.':
    'Choisissez un de vos lieux que les clients peuvent voir.',
  'This is a notice by mail, from an address nobody answers. Nothing is sent from here.':
    'C’est un avis par e-mail, d’une adresse à laquelle personne ne répond. Rien n’est envoyé d’ici.',
  'That mail': 'Cet e-mail',
  'Someone reached by email is written to by email.':
    'À une personne jointe par e-mail, on écrit par e-mail.',
  'You are here': 'Vous êtes ici',
  'Make your own page on {site}': 'Créez votre page sur {site}',
  'More from {name}': 'Aussi chez {name}',
  'You order from {name} in a conversation. Joining {site} is free.':
    'Vous commandez auprès de {name} dans une conversation. Rejoindre {site} est gratuit.',
  'You pick a time with {name} in a conversation. Joining {site} is free.':
    'Vous choisissez un moment avec {name} dans une conversation. Rejoindre {site} est gratuit.',
  'Asked, not agreed yet.': 'Demandé, pas encore convenu.',
  'Join in Caime: {url}': 'Rejoindre dans Caime : {url}',
  'Open in Caime: {url}': 'Dans Caime : {url}',
  'Caime keeps this up to date. Change it in Caime.':
    'Caime le tient à jour. Modifiez-le dans Caime.',
  // Booking before an account (R97 (1), block C).
  'Pick a time below. No account needed; {name} confirms in a conversation.':
    'Choisissez un horaire ci-dessous. Aucun compte requis ; {name} confirme dans une conversation.',
  'That address has a {site} account.': 'Cette adresse a un compte {site}.',
  'Sign in to book': 'Connectez-vous pour réserver',
  'Booking without an account isn’t available here yet. Join {site} to book.':
    'Réserver sans compte n’est pas encore possible ici. Rejoignez {site} pour réserver.',
  'That can’t be booked from here.': 'Cela ne peut pas être réservé d’ici.',
  'That time was just taken. Pick another.':
    'Cet horaire vient d’être pris. Choisissez-en un autre.',
  'That took too long. Pick a time again.':
    'Cela a pris trop de temps. Choisissez à nouveau un horaire.',
  'That code has run out. Pick a time again to get a new one.':
    'Ce code a expiré. Choisissez à nouveau un horaire pour en recevoir un nouveau.',
  'Too many tries for now. Try again in an hour.':
    'Trop d’essais pour le moment. Réessayez dans une heure.',
  'Booking without an account is for people 18 or over. Under 18, join {site} with your age.':
    'Réserver sans compte est réservé aux 18 ans et plus. Avant 18 ans, rejoignez {site} en indiquant votre âge.',
  '{item}, {when}. {name} confirms in your conversation.':
    '{item}, {when}. {name} confirme dans votre conversation.',
  'To follow it, join {site} free with {email}: your booking will be there.':
    'Pour la suivre, rejoignez {site} gratuitement avec {email} : votre réservation y sera.',
  'Join {site}': 'Rejoindre {site}',
  'Check your email': 'Vérifiez votre e-mail',
  'A six-digit code went to {email}. Type it to book {item}, {when}.':
    'Un code à six chiffres a été envoyé à {email}. Saisissez-le pour réserver {item}, {when}.',
  'Pick another time': 'Choisir un autre horaire',
  'No free times this week.': 'Aucun horaire libre cette semaine.',
  Earlier: 'Plus tôt',
  Later: 'Plus tard',
  'Book a time': 'Réserver un horaire',
  'A code goes to your email; the time is yours once you type it here. Nothing is kept before that.':
    'Un code arrive dans votre e-mail ; l’horaire est à vous dès que vous le saisissez ici. Rien n’est conservé avant.',
  // A provisional person's history claimed only with the address's code (H1).
  'Messages are waiting for this address on Caime, and this Caime can’t send the code that proves it’s yours yet. Use another address, or try again later.':
    'Des messages attendent cette adresse sur Caime, et ce Caime ne peut pas encore envoyer le code qui prouve qu’elle est à vous. Utilisez une autre adresse, ou réessayez plus tard.',
  'Messages are waiting for this address on Caime. We sent it a six-digit code: type it here to bring them into your account.':
    'Des messages attendent cette adresse sur Caime. Nous lui avons envoyé un code à six chiffres : saisissez-le ici pour les retrouver dans votre compte.',
  'That page': 'Cette page',
  'Your earlier booking here is still waiting for an answer. Join {site} with the same address to follow it.':
    'Votre réservation précédente ici attend encore une réponse. Rejoignez {site} avec la même adresse pour la suivre.',
  'They’ve left that call.': 'Cette personne a quitté l’appel.',
  '{n} invites are open: take one back first.':
    '{n} invitations sont ouvertes : retirez-en une d’abord.',
  '{name} joined {org}’s team': '{name} a rejoint l’équipe de {org}',
  'a team invitation': 'une invitation dans une équipe',
  'The address it was sent to, alone': 'Seule l’adresse à laquelle elle a été envoyée',
  'Whoever has this link': 'Quiconque a ce lien',
  'Sign up or sign in, then join: its conversations with customers are in your Business inbox, no app to install.':
    'Inscrivez-vous ou connectez-vous, puis rejoignez-la : ses conversations avec les clients sont dans votre boîte Entreprise, sans application à installer.',
  'Say who it’s for: their name.': 'Indiquez pour qui c’est : son nom.',
  'This invite isn’t open': 'Cette invitation n’est pas ouverte',
  'This invite isn’t open any more.': 'Cette invitation n’est plus ouverte.',
  'It may have run out, or been taken back. Ask whoever sent it for a new one.':
    'Elle a peut-être expiré ou été retirée. Demandez-en une nouvelle à la personne qui l’a envoyée.',
  'Join links aren’t available here.': 'Les liens pour rejoindre ne sont pas disponibles ici.',
  '{n} links are open: take one back first.': '{n} liens sont ouverts : retirez-en un d’abord.',
  'That link': 'Ce lien',
  'It’s full: {n} people are in it.': 'C’est complet : {n} personnes y sont.',
  'They can’t join while a link to it is open.':
    'Aucun ajout possible tant qu’un lien pour rejoindre est ouvert.',
  'Join links are made by people 18 or over.':
    'Les liens pour rejoindre sont créés par des personnes de 18 ans ou plus.',
  'Join links are for people 18 or over: ask someone in it to add you.':
    'Les liens pour rejoindre sont réservés aux personnes de 18 ans ou plus : demandez à quelqu’un qui en fait partie de vous ajouter.',
  'This link can’t add you to it.': 'Ce lien ne peut pas vous y ajouter.',
  'an invitation to a space': 'une invitation dans un espace',
  'an invitation to a group': 'une invitation dans un groupe',
  'Sign up or sign in, then join: you read what was said there before you came, and its people see your name.':
    'Inscrivez-vous ou connectez-vous, puis rejoignez : vous lisez ce qui s’y est dit avant votre arrivée, et ses membres voient votre nom.',
  'You can join {org}’s team': 'Vous pouvez rejoindre l’équipe de {org}',
  'Your address at {domain} lets you in.': 'Votre adresse à {domain} vous le permet.',
  'Confirm your address first: it’s what lets you join.':
    'Confirmez d’abord votre adresse : c’est elle qui permet de rejoindre l’équipe.',
  'No address of yours lets you join this team.':
    'Aucune de vos adresses ne permet de rejoindre cette équipe.',
  'This way to keep the meeting has run out. Open your link again, and keep it from there.':
    'Ce moyen de garder la réunion a expiré. Rouvrez votre lien et gardez-la depuis là.',
  'Only a meeting’s guest keeps it this way.':
    'Seul l’invité d’une réunion la garde de cette façon.',
  'Keeping a meeting is for people over 18.': 'Garder une réunion est réservé aux plus de 18 ans.',
  'Messages are waiting for this address on Caime. Keep the meeting with another address.':
    'Des messages attendent cette adresse sur Caime. Gardez la réunion avec une autre adresse.',
  'A WhatsApp group comes over into a group of its own.':
    'Un groupe WhatsApp s’importe dans un groupe à part entière.',
  'Only its owner and admins bring a chat over.':
    'Seuls son propriétaire et ses administrateurs importent une discussion.',
  'Every message names one of the names.': 'Chaque message renvoie à l’un des noms.',
  'Everyone a name is taken as is someone in this group.':
    'Chaque nom attribué l’est à quelqu’un de ce groupe.',
  'This group has a topic called “{title}” already. Name this one otherwise.':
    'Ce groupe a déjà un sujet nommé « {title} ». Donnez un autre nom à celui-ci.',
  '{name} asks to join “{place}”': '{name} demande à rejoindre « {place} »',
  'Let them in, or not, from its people.': 'Acceptez ou non depuis la liste de ses membres.',
  'That ask': 'Cette demande',
  'Sign up or sign in, then ask: its owner or an admin lets each person in. Once in, you read what was said there before you came.':
    'Inscrivez-vous ou connectez-vous, puis demandez : son propriétaire ou un administrateur accepte chaque personne. Une fois dedans, vous lisez ce qui s’y est dit avant votre arrivée.',
  'Asks to join are answered by people 18 or over.':
    'Les demandes sont traitées par des personnes de 18 ans ou plus.',
  'This link can’t add them to it.': 'Ce lien ne peut pas ajouter cette personne.',
  'You’re in “{place}”': 'Vous êtes dans « {place} »',
  'Your ask to join was accepted.': 'Votre demande a été acceptée.',
  'Sign in to message {name}': 'Connectez-vous pour écrire à {name}',
  'Writing without an account isn’t available here yet. Join {site} to message {name}.':
    'Écrire sans compte n’est pas encore possible ici. Rejoignez {site} pour écrire à {name}.',
  'That can’t be sent from here.': 'Cela ne peut pas être envoyé d’ici.',
  'Write your message, up to {n} characters.': 'Écrivez votre message, {n} caractères au plus.',
  'That took too long. Write your message again.':
    'Cela a pris trop de temps. Écrivez à nouveau votre message.',
  'That code has run out. Send your message again for a new one.':
    'Ce code a expiré. Envoyez à nouveau votre message pour en recevoir un nouveau.',
  'Your message is with {name}.': 'Votre message a été transmis à {name}.',
  'Their answer comes to {email} by email. Reply to it to write to them again.':
    'La réponse arrivera à {email} par e-mail ; il suffit d’y répondre pour écrire à nouveau.',
  'To read their answer, join {site} free with {email}: your conversation will be there.':
    'Pour lire la réponse, rejoignez {site} gratuitement avec {email} : votre conversation y sera.',
  'A six-digit code went to {email}. Type it to send your message to {name}.':
    'Un code à six chiffres a été envoyé à {email}. Saisissez-le pour envoyer votre message à {name}.',
  'Change what I wrote': 'Modifier mon message',
  'A code goes to your email; your message goes once you type it here. {name} answers by email: no account needed.':
    'Un code arrive dans votre e-mail ; votre message part dès que vous le saisissez ici. {name} répond par e-mail : aucun compte nécessaire.',
  'A code goes to your email; your message goes once you type it here. Join {site} with that address to read the answer.':
    'Un code arrive dans votre e-mail ; votre message part dès que vous le saisissez ici. Rejoignez {site} avec cette adresse pour lire la réponse.',
  'Under 18, a link connects you with someone you know through someone. Ask {name} to connect through a person you both know.':
    'Avant 18 ans, un lien ne vous relie qu’à quelqu’un que vous connaissez par une autre personne. Demandez à {name} de passer par une personne que vous connaissez tous les deux.',
  'That address can’t be written to by email from here. If they’re on Caime, find them there.':
    'On ne peut pas écrire à cette adresse par e-mail d’ici. Si la personne est sur Caime, trouvez-la là-bas.',
  'This organization is suspended, so nothing is written here for now.':
    'Cette organisation est suspendue : rien ne s’écrit ici pour le moment.',
  'This organization is suspended, so nothing is posted for now.':
    'Cette organisation est suspendue : rien n’est publié pour le moment.',
  'This report isn’t about an organization.': 'Ce signalement ne concerne pas une organisation.',
  'Join it, or not, from Attention.': 'Rejoignez-le, ou non, depuis Attention.',
  'That invitation isn’t open any more.': 'Cette invitation n’est plus ouverte.',
  'That’s {n} message requests today. Try again tomorrow, or connect with them first.':
    'Cela fait {n} demandes de message aujourd’hui. Réessayez demain, ou entrez d’abord en contact.',
  'This account is suspended. You can appeal, and download your data.':
    'Ce compte est suspendu. Vous pouvez faire appel et télécharger vos données.',
  'That took too long, or the account isn’t suspended any more. Sign in again.':
    'C’était trop long, ou le compte n’est plus suspendu. Connectez-vous à nouveau.',
  'Too many reports from here just now. Try again in an hour.':
    'Trop de signalements depuis ici à l’instant. Réessayez dans une heure.',
  'Give your name and an email address we can write to (not needed for a child’s safety).':
    'Indiquez votre nom et une adresse e-mail où vous écrire (inutile pour la sécurité d’un enfant).',
  'Say what’s wrong in a few words.': 'Dites ce qui ne va pas en quelques mots.',
  'Tick the box to say what you wrote is accurate.':
    'Cochez la case pour confirmer que ce que vous avez écrit est exact.',
  'Thanks. Someone at Caime reads every report; if you left your email, we’ll write to you there when it’s decided.':
    'Merci. Chez Caime, quelqu’un lit chaque signalement ; si vous avez laissé votre e-mail, nous vous y écrirons une fois la décision prise.',
  'What you saw': 'Ce que vous avez vu',
  'I believe what I wrote here is accurate and complete.':
    'Je crois que ce que j’ai écrit ici est exact et complet.',
  'Send the report': 'Envoyer le signalement',
  'Your name and email are needed, unless it’s about a child’s safety. Caime writes to you when it has decided.':
    'Votre nom et votre e-mail sont nécessaires, sauf s’il s’agit de la sécurité d’un enfant. Caime vous écrit une fois sa décision prise.',
  'Report this page': 'Signaler cette page',
  'That appeal': 'Ce recours',
  'That appeal was decided already.': 'Ce recours a déjà été tranché.',
  'Age checks aren’t available here.': 'La vérification de l’âge n’est pas disponible ici.',
  'Before this, Caime asks you to check your age once. It takes a minute.':
    'Avant cela, Caime vous demande de vérifier votre âge une fois. Cela prend une minute.',
  'That’s as many age checks as a day allows. Try again tomorrow.':
    'C’est le nombre de vérifications d’âge qu’une journée permet. Réessayez demain.',
  '{monthly}, or {yearly}': '{monthly}, ou {yearly}',
  '{free}, always': '{free}, toujours',
  'Accounts are connected by people over 18.': 'Les comptes se connectent à partir de 18 ans.',
  'A private reply is written in a chat between two people.':
    'Une réponse privée s’écrit dans une conversation à deux.',
  'That message can’t be answered privately here.':
    'Ce message ne peut pas recevoir de réponse privée ici.',
  'That video couldn’t be read, so it wasn’t sent. Try another.':
    'Cette vidéo n’a pas pu être lue, elle n’a donc pas été envoyée. Essayez-en une autre.',
  'That recording couldn’t be read, so it wasn’t sent. Try another.':
    'Cet enregistrement n’a pas pu être lu, il n’a donc pas été envoyé. Essayez-en un autre.',
  Memory: 'Mémoire',
  'That action': 'Cette action',
  'Choose how you know them from the list.': 'Choisissez d’où vous vous connaissez dans la liste.',
  'You’re on {plan} already.': 'Vous avez déjà le forfait {plan}.',
  'It’s on {plan} already.': 'Elle a déjà le forfait {plan}.',
  'You run {count} on the {plan} plan already. Move one to {next}, or close one, to start another.':
    'Vous gérez déjà {count} avec le forfait {plan}. Passez-en une à {next} ou fermez-en une pour en créer une autre.',
  'an owner': 'un propriétaire',
  'runs up to {count} on the {plan} plan at once; those on {next} don’t count.':
    'gère jusqu’à {count} avec le forfait {plan} à la fois ; celles sur {next} ne comptent pas.',
  'We’re open again {when}.': 'Nous rouvrons {when}.',
  'We’re open again on {date}.': 'Nous rouvrons le {date}.',
  'That customer': 'Ce client',
  'That field isn’t one of the organization’s.':
    'Ce champ n’est pas l’un de ceux de l’organisation.',
  '{question} can’t be kept in that field.': '{question} ne peut pas être gardé dans ce champ.',
  'That form isn’t one of the organization’s.':
    'Ce formulaire n’est pas l’un de ceux de l’organisation.',
  'That form': 'Ce formulaire',
  'Only the customer it was sent to fills it in.':
    'Seul le client à qui il a été envoyé le remplit.',
  'That form was answered already.': 'Ce formulaire a déjà reçu une réponse.',
  'Forms are sent by an organization to its customers.':
    'Les formulaires sont envoyés par une organisation à ses clients.',
  'Someone reached by mail can’t fill in a form yet.':
    'Une personne jointe par courriel ne peut pas encore remplir de formulaire.',
  'Only adults give out links to their files.':
    'Seuls les adultes donnent des liens vers leurs fichiers.',
  'Slide {number}': 'Diapositive {number}',
  Spreadsheet: 'Classeur',
  Presentation: 'Présentation',
  Table: 'Tableau',
  'Plain text': 'Texte brut',
  Audio: 'Audio',
  'This file can’t be shown as a page. Download it to open it.':
    'Ce fichier ne peut pas s’afficher en page. Téléchargez-le pour l’ouvrir.',
  'The page stops here: the rest is in the file.':
    'La page s’arrête ici : la suite est dans le fichier.',
  'What the file holds, as words and tables: its look, pictures and charts are in the file itself.':
    'Ce que contient le fichier, en mots et en tableaux : sa mise en page, ses images et ses graphiques sont dans le fichier lui-même.',
  '{name} shared a file with you on {site}.': '{name} a partagé un fichier avec vous sur {site}.',
  'a shared file': 'un fichier partagé',
  'Shared by {name}': 'Partagé par {name}',
  file: 'fichier',
  'Whoever has this link and is signed in to {site}':
    'Quiconque a ce lien et est connecté à {site}',
  'Sign in to open this file': 'Connectez-vous pour ouvrir ce fichier',
  'Only someone signed in to {site} opens this link.':
    'Seule une personne connectée à {site} ouvre ce lien.',
  'Only someone signed in to {site} opens this link. Sign in in this browser, then open the link again.':
    'Seule une personne connectée à {site} ouvre ce lien. Connectez-vous dans ce navigateur, puis ouvrez de nouveau le lien.',
  'Sign up': 'S’inscrire',
  'This link isn’t open': 'Ce lien n’est pas ouvert',
  'This link isn’t open any more.': 'Ce lien n’est plus ouvert.',
  'This app proves itself with PKCE alone: it has no secret to replace.':
    'Cette application s’authentifie avec PKCE seul : elle n’a pas de secret à remplacer.',
  '{name} needs connecting again': '{name} doit être connecté à nouveau',
  'Caime can’t use it for you until you connect it again in Settings · Apps.':
    'Caime ne peut plus l’utiliser pour vous tant que vous ne l’avez pas connecté à nouveau dans Réglages · Applications.',
  'This organization keeps its conversations from its members’ own apps.':
    'Cette organisation garde ses conversations à l’écart des applications personnelles de ses membres.',
  'That cursor isn’t one this feed gave you: ask once without it.':
    'Ce curseur ne vient pas de ce flux : demandez une fois sans lui.',
  'The feed began again since that cursor: ask once without it.':
    'Le flux a recommencé depuis ce curseur : demandez une fois sans lui.',
  '{agentName} drafted an answer for you to check': '{agentName} a rédigé une réponse à vérifier',
  'That draft was sent, let go or replaced already.':
    'Ce brouillon a déjà été envoyé, écarté ou remplacé.',
  'The conversation moved on since that draft: answer it yourself.':
    'La conversation a avancé depuis ce brouillon : répondez vous-même.',
  'The AI agent is paused or gone: answer it yourself.':
    'L’agent IA est en pause ou a été retiré : répondez vous-même.',
  'That question': 'Cette question',
  'That draft': 'Ce brouillon',
  'Nothing from a private conversation is kept on the server.':
    'Rien d’une conversation privée n’est conservé sur le serveur.',
  '{plan} includes more.': '{plan} en inclut davantage.',
  'You’ve used the AI assist your plan includes for now. There’s more {when}.{more}':
    'Vous avez utilisé pour le moment l’assistance IA que votre forfait inclut. De nouveau disponible {when}.{more}',
  'up to {n} answers a day, on our most capable model':
    'jusqu’à {n} réponses par jour, avec notre modèle le plus performant',
  'up to {n} answers a day, on a fast model':
    'jusqu’à {n} réponses par jour, avec un modèle rapide',
  'for everyday use, once you turn it on': 'pour l’usage de tous les jours, une fois activée',
  'more each day, and follow-ups found by our most capable model':
    'davantage chaque jour, et des suivis trouvés par notre modèle le plus performant',
  // M16 G11: Cai about one person.
  'I don’t know who “{name}” is among your people.':
    'Je ne sais pas qui est « {name} » parmi vos contacts.',
  'You’re waiting on {who} for {n} things:': {
    one: 'Vous attendez une chose de {who} :',
    other: 'Vous attendez {n} choses de {who} :',
  },
  'You’re not waiting on {who} for anything.': 'Vous n’attendez rien de {who}.',
  'From {who}, {n} things are asked of you:': {
    one: 'De la part de {who}, une chose vous est demandée :',
    other: 'De la part de {who}, {n} choses vous sont demandées :',
  },
  'Nothing is asked of you by {who}.': 'Rien ne vous est demandé de la part de {who}.',
  'You said you’d do {n} things for {who}:': {
    one: 'Vous avez promis une chose à {who} :',
    other: 'Vous avez promis {n} choses à {who} :',
  },
  'Nothing you said you’d do for {who} is open.':
    'Rien de ce que vous avez promis à {who} n’est en suspens.',
  'Coming up with {who}:': 'À venir avec {who} :',
  'Nothing is planned with {who} in the next two months.':
    'Rien de prévu avec {who} dans les deux prochains mois.',
  'What you and {who} decided:': 'Ce que vous avez décidé avec {who} :',
  'Nothing you and {who} decided is kept yet.': 'Aucune décision avec {who} n’est encore gardée.',
  'Payments from {who}:': 'Paiements de {who} :',
  'No card asks {who} to pay you.': 'Aucune carte ne demande à {who} de vous payer.',
  'Or ask about one of your people, by name or as you know them: what you’re waiting for from them, what they asked of you, what you agreed and whether they paid.':
    'Ou posez une question sur l’une de vos connaissances, par son nom ou par votre lien : ce que vous attendez, ce qui vous est demandé, ce qui a été convenu et les paiements.',
  'You can follow up {when}: once a day, twice at most, until they answer.':
    'Vous pourrez relancer {when} : une fois par jour, deux fois au plus, jusqu’à sa réponse.',
  'Ways to pay {name}:': 'Pour payer {name} :',
  '{name} is paying you this.': '{name} vous paie ce montant.',
  '{name} asks you to pay this.': '{name} vous demande de payer ce montant.',
  'Answer it from your calendar: your answer reaches {name} on Caime.':
    'Répondez depuis votre agenda : votre réponse parvient à {name} sur Caime.',
  'Voice note, {duration}': 'Note vocale, {duration}',
  'A place': 'Un lieu',
  'New time': 'Nouvel horaire',
  'Accepted: {title}': 'Accepté : {title}',
  'Declined: {title}': 'Refusé : {title}',
  'Only a meeting or an appointment takes another time.':
    'Seul un rendez-vous ou une réunion peut prendre un autre horaire.',
  'Each time of a series keeps its own: cancel this one and send another.':
    'Chaque occurrence d’une série garde son horaire : annulez celle-ci et envoyez-en une autre.',
  'It’s their calendar’s meeting: only they can move it.':
    'Elle vient de l’agenda de l’autre personne : elle seule peut la déplacer.',
  'It has its own space now: suggest another time there.':
    'Elle a maintenant son propre espace : proposez un autre horaire là-bas.',
  'They booked without an account: cancel it, and they can book another time from your page.':
    'Cette réservation a été faite sans compte : annulez-la, et un autre horaire pourra être réservé depuis votre page.',
  'A booking lasts as long as what was booked: choose its time alone.':
    'Une réservation dure ce que dure ce qui a été réservé : choisissez seulement son horaire.',
  'With {names}': 'Avec {names}',
  'Choose one of your places that anyone may see.':
    'Choisissez un de vos lieux que tout le monde peut voir.',
  'Waiting on {name}: {title}': 'En attente de {name} : {title}',
  '{name} asked you.': '{name} vous l’a demandé.',
  'One of your actions.': 'Une de vos actions.',
  'You’re waiting on {name}.': 'Vous attendez {name}.',
  Action: 'Action',
  '{name} isn’t on Caime yet: a call reaches them once they join with their address.':
    '{name} n’est pas encore sur Caime : un appel l’atteindra une fois son compte créé avec son adresse.',
  'Free for people. Organizations pay for their team.':
    'Gratuit pour les particuliers. Les organisations paient pour leur équipe.',
  'You’re not in that call.': 'Vous n’êtes pas dans cet appel.',
  'Cai can’t take notes on this Caime yet.':
    'Cai ne peut pas encore prendre de notes sur ce Caime.',
  'Cai doesn’t take notes in a private conversation: nothing said there reaches Caime.':
    'Cai ne prend pas de notes dans une conversation privée : rien de ce qui s’y dit n’atteint Caime.',
  'Only someone on Caime can ask Cai to take notes.':
    'Seule une personne sur Caime peut demander à Cai de prendre des notes.',
  'This device isn’t taking notes in that call.':
    'Cet appareil ne prend pas de notes dans cet appel.',
  'That line': 'Cette ligne',
  'Attach a recording.': 'Joignez un enregistrement.',
  'That isn’t a recording Caime reads.': 'Ce n’est pas un enregistrement que Caime lit.',
};
