/**
 * The public site in French (R55): the strings `lib/site-pages.ts` and `lib/public-pages.ts`
 * alone say, keyed by their English. The server's own catalog, merged with the app's
 * (`@caime/core/locales/fr`) for the site's pages, and never downloaded by the app.
 * `node scripts/i18n-keys.mjs missing fr site` lists what it lacks; `site-i18n.test.ts` fails
 * CI for it.
 */
import type { Catalog } from '@caime/core/i18n';

export const frSite: Catalog = {
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
  '{name} invited you': '{name} vous a invité',
  'Join {name} on {site}{context}: sign up in half a minute and you’re connected.':
    'Rejoignez {name} sur {site}{context} : inscrivez-vous en une demi-minute et vous êtes en contact.',
  'an invitation': 'une invitation',
  from: 'de',
  about: 'à propos',
  'to join': 'pour rejoindre',
  'Sign up in half a minute and you’re connected with {name}, no app to install.':
    'Inscrivez-vous en une demi-minute et vous êtes en contact avec {name}, sans application à installer.',
  'Join {name} on {site}': 'Rejoindre {name} sur {site}',
  'Not here': 'Pas ici',
  'Nobody by that handle.': 'Personne avec cet identifiant.',
  'not here': 'pas ici',
  'Nobody by that handle': 'Personne avec cet identifiant',
  'It may have changed, or been let go of.': 'Il a peut-être changé, ou été abandonné.',
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
  Connection: 'Lien',
  'Who someone is to you comes first.': 'Qui est quelqu’un pour vous passe en premier.',
  'A connection is two people and how they know each other, said by each side, private to each. Everything else in Caime hangs off it.':
    'Un lien, c’est deux personnes et la façon dont elles se connaissent, dite par chaque côté, privée pour chacun. Tout le reste de Caime en découle.',
  'colleague · DATA C · work': 'collègue · DATA C · travail',
  'brother · family': 'frère · famille',
  'Messages that know their context.': 'Des messages qui connaissent leur contexte.',
  'One-to-one, groups, topics under a connection, spaces for a family, a team or a club. Ordered, delivered once, and yours offline.':
    'En tête-à-tête, en groupe, par sujets sous un lien, dans des espaces pour une famille, une équipe ou un club. Ordonnés, distribués une fois, et à vous hors ligne.',
  'Did the contract arrive?': 'Le contrat est arrivé ?',
  'Yes, signing it Friday.': 'Oui, je le signe vendredi.',
  'read · 2 min': 'lu · 2 min',
  'What needs you, not everything.': 'Ce qui a besoin de vous, pas tout.',
  'The inbox sorts by what needs you, what’s important, what’s waiting on someone else and what’s quiet, and says why. Your rules by relationship win.':
    'La boîte de réception trie selon ce qui a besoin de vous, ce qui est important, ce qui attend quelqu’un d’autre et ce qui est calme, et dit pourquoi. Vos règles par relation l’emportent.',
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
  'A business that proves it’s the business.':
    'Une entreprise qui prouve qu’elle est l’entreprise.',
  'An organization verifies its domain with one DNS record. Its team answers customers as the organization, in one inbox, with apps and an AI agent that always say what they are.':
    'Une organisation vérifie son domaine avec un enregistrement DNS. Son équipe répond aux clients au nom de l’organisation, dans une seule boîte de réception, avec des applications et un agent IA qui disent toujours ce qu’ils sont.',
  'verified · niledental.example': 'vérifiée · niledental.example',
  'Lina · new patient forms': 'Lina · formulaires nouveau patient',
  'Each side of your life sees what you chose.':
    'Chaque côté de votre vie voit ce que vous avez choisi.',
  'Profile fields by sphere, read receipts only both ways, requests before strangers reach you, and end-to-end encryption when a conversation should be private.':
    'Champs de profil par cercle, accusés de lecture seulement dans les deux sens, demandes avant que des inconnus vous joignent, et chiffrement de bout en bout quand une conversation doit être privée.',
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
    'Elle arrive dans la boîte de réception, en premier si l’attente est la plus longue.',
  'Lina writes to Nile Dental from the app she uses for everyone else. The team sees one conversation, its state and who has it; Lina sees the organization, never which person.':
    'Lina écrit à Nile Dental depuis l’application qu’elle utilise pour tous les autres. L’équipe voit une conversation, son état et qui l’a ; Lina voit l’organisation, jamais quelle personne.',
  'Can I book a cleaning on Thursday?': 'Je peux réserver un détartrage jeudi ?',
  'new · nobody has it · 2 min': 'nouveau · personne ne l’a · 2 min',
  'The agent answers': 'L’agent répond',
  'From what you wrote down, and it says so.': 'D’après ce que vous avez écrit, et il le dit.',
  'The organization’s AI agent answers only from its knowledge (up to {n} characters you gave it), is marked as an AI, and hands over to a person the moment it isn’t sure. With bookable hours set, it offers the open slots and books the one the customer picks, for the team to confirm.':
    'L’agent IA de l’organisation ne répond qu’à partir de ses connaissances (jusqu’à {n} caractères que vous lui avez donnés), est marqué comme une IA, et passe la main à une personne dès qu’il n’est pas sûr. Avec des heures réservables, il propose les créneaux libres et réserve celui que le client choisit, pour que l’équipe confirme.',
  'I can offer Thursday 10:00 or 10:30. Which suits you?':
    'Je peux proposer jeudi 10 h ou 10 h 30. Lequel vous convient ?',
  'Cleaning · Thursday 10:00 · requested': 'Détartrage · jeudi 10 h · demandé',
  'Nile Dental · AI agent · automated': 'Nile Dental · agent IA · automatique',
  'The team answers': 'L’équipe répond',
  'Whoever answers has it; the customer hears from the organization.':
    'Qui répond l’a ; le client reçoit une réponse de l’organisation.',
  'Answering takes the conversation. Assign it, escalate it to an owner or admin with a note, or resolve it; it comes back the moment the customer writes again.':
    'Répondre, c’est prendre la conversation. Attribuez-la, signalez-la au propriétaire ou à un admin avec un mot, ou résolvez-la ; elle revient dès que le client écrit à nouveau.',
  '10:00 is yours. See you Thursday.': '10 h est à vous. À jeudi.',
  'Your tools hear it': 'Vos outils l’entendent',
  'A helpdesk, a CRM or your own bot, in the same conversation.':
    'Un helpdesk, un CRM ou votre propre bot, dans la même conversation.',
  'An app’s bot replies as the organization, marked automated, and never counts as the team’s answer. Its webhook hears each message and each change of state.':
    'Le bot d’une application répond au nom de l’organisation, marqué automatique, et ne compte jamais comme la réponse de l’équipe. Son webhook entend chaque message et chaque changement d’état.',
  'resolved · by person': 'résolue · par une personne',
  'Booking · confirmed · by customer': 'Réservation · confirmée · par le client',
  'A colleague sees the professional you.': 'Un collègue voit le vous professionnel.',
  'Name, headline, organization, the hours you answer in. Your birthday, your family and your location stay out of it unless you say otherwise.':
    'Nom, titre, organisation, les heures où vous répondez. Votre anniversaire, votre famille et votre position restent à l’écart sauf si vous en décidez autrement.',
  sees: 'voit',
  'Noor Haddad · Dentist · Nile Dental': 'Noor Haddad · Dentiste · Nile Dental',
  'doesn’t see': 'ne voit pas',
  'birthday · family · where you are': 'anniversaire · famille · où vous êtes',
  'Family sees more, because you said so.': 'La famille voit plus, parce que vous l’avez dit.',
  'What each sphere sees is a setting you own, field by field. Sharing your location live is one tap, for as long as you chose, and ends on its own.':
    'Ce que chaque cercle voit est un réglage qui vous appartient, champ par champ. Partager votre position en direct, c’est un geste, pour la durée choisie, et cela s’arrête tout seul.',
  'everything you chose, and where you are while you share it':
    'tout ce que vous avez choisi, et où vous êtes pendant que vous le partagez',
  until: 'jusqu’à',
  'the hour you picked': 'l’heure que vous avez choisie',
  'A stranger': 'Un inconnu',
  'A stranger may ask. Nothing more.': 'Un inconnu peut demander. Rien de plus.',
  'Someone who isn’t connected to you sees your name and handle, if you let yourself be found. Their first message arrives as a request: one message until you answer.':
    'Quelqu’un qui n’est pas en contact avec vous voit votre nom et identifiant, si vous vous laissez trouver. Son premier message arrive comme une demande : un message jusqu’à votre réponse.',
  'Hi Noor, found you!': 'Salut Noor, je t’ai trouvée !',
  'one message until you answer · decline and they never know':
    'un message jusqu’à votre réponse · refusez et la personne ne le saura jamais',
  'A customer sees the organization, never its people.':
    'Un client voit l’organisation, jamais ses membres.',
  'In a business conversation the team’s names and ids are masked everywhere: messages, read receipts, suggestions, exports. Anything filed for the customer names the organization.':
    'Dans une conversation professionnelle, les noms et identifiants de l’équipe sont masqués partout : messages, accusés de lecture, suggestions, exports. Tout ce qui est consigné pour le client nomme l’organisation.',
  'verified · answered in an hour': 'vérifiée · a répondu en une heure',
  '{n} actions a day': '{n} actions par jour',
  '{n} conversations a day': '{n} conversations par jour',
  '{n} answers a day': '{n} réponses par jour',
  'Your family, your work and your customers don’t belong in one list. Say who each person is to you, once. From then on Caime knows what needs you first, who may reach you when, what was decided and what’s owed, and what each side of your life sees of you.':
    'Votre famille, votre travail et vos clients n’ont pas leur place dans une seule liste. Dites une fois qui est chaque personne pour vous. Dès lors, Caime sait ce qui a besoin de vous en premier, qui peut vous joindre et quand, ce qui a été décidé et ce qui est dû, et ce que chaque côté de votre vie voit de vous.',
  'Start free': 'Commencer gratuitement',
  Specification: 'Spécification',
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
    'Chaque côté de votre vie voit ce que vous avez choisi. Chiffré de bout en bout quand vous le dites, avec une clé de récupération que vous seul détenez.',
  money: 'argent',
  'Never held or moved by Caime. A split records who owes whom; nothing else.':
    'Jamais détenu ni déplacé par Caime. Un partage note qui doit quoi à qui ; rien d’autre.',
  price: 'prix',
  'Free for people, always. Organizations start free and can buy Business.':
    'Gratuit pour les particuliers, toujours. Les organisations commencent gratuitement et peuvent acheter Business.',
  'runs on': 'fonctionne sur',
  'Web, iOS and Android, from one account.': 'Web, iOS et Android, depuis un seul compte.',
  'Layers · pick one': 'Couches · choisissez-en une',
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
    'Un enregistrement TXT sur votre domaine. « Vérifiée » apparaît sur votre page et à côté de votre équipe ; c’est contrôlé, jamais acheté, et de nouveau à vous si vous fermez puis revenez.',
  'the inbox': 'la boîte de réception',
  'Every customer conversation in one place, sorted by who has waited longest, in six views: {views}.':
    'Chaque conversation client au même endroit, triée selon qui attend depuis le plus longtemps, en six vues : {views}.',
  'the team': 'l’équipe',
  'Owners, admins and members. A customer sees the organization, never which person answered. A seat that ends takes nothing with it.':
    'Propriétaires, admins et membres. Un client voit l’organisation, jamais quelle personne a répondu. Un siège qui prend fin n’emporte rien.',
  'writing first': 'écrire en premier',
  'Your team may write to someone first. It arrives as a request: one message until they answer, and their answer opens the conversation.':
    'Votre équipe peut écrire la première à quelqu’un. Cela arrive comme une demande : un message jusqu’à la réponse, et la réponse ouvre la conversation.',
  'the ai agent': 'l’agent IA',
  'Answers from what you wrote down (up to {n} characters), is marked as an AI, and hands over to a person the moment it isn’t sure. It never speaks for the team.':
    'Répond d’après ce que vous avez écrit (jusqu’à {n} caractères), est marqué comme une IA, et passe la main à une personne dès qu’il n’est pas sûr. Il ne parle jamais au nom de l’équipe.',
  'Set bookable hours once. Customers pick from the open slots, your AI agent offers the next few and books the one they choose, and every booking is an appointment your team confirms.':
    'Définissez des heures réservables une fois. Les clients choisissent parmi les créneaux libres, votre agent IA propose les prochains et réserve celui qu’ils choisissent, et chaque réservation est un rendez-vous que votre équipe confirme.',
  apps: 'applications',
  'A helpdesk, a CRM or your own bot: a token that reaches only your conversations, a signed webhook, and cards of your own design.':
    'Un helpdesk, un CRM ou votre propre bot : un jeton qui n’atteint que vos conversations, un webhook signé, et des cartes de votre conception.',
  updates: 'actualités',
  'Post to everyone who follows you. Nobody sees who follows, and nothing about following reaches anyone’s inbox.':
    'Publiez pour tous ceux qui vous suivent. Personne ne voit qui suit, et rien de l’abonnement n’atteint la boîte de réception de quiconque.',
  spaces: 'espaces',
  'Spaces for the team, a project or a branch, started from the organization’s page, with your team already there to pick from.':
    'Des espaces pour l’équipe, un projet ou une agence, créés depuis la page de l’organisation, avec votre équipe déjà là pour choisir.',
  calls: 'appels',
  'Voice and video, one to one and in groups of up to {n}, in the browser.':
    'Voix et vidéo, en tête-à-tête et en groupe jusqu’à {n}, dans le navigateur.',
  insights: 'aperçus',
  'How fast the team answers, how many customers write and what is still open. On Business.':
    'La rapidité de réponse de l’équipe, combien de clients écrivent et ce qui reste ouvert. Avec Business.',
  'Free for a team of {team}, with {apps}. Business for the rest: {pricing}.':
    'Gratuit pour une équipe de {team}, avec {apps}. Business pour le reste : {pricing}.',
  'one app': 'une application',
  '{n} apps': '{n} applications',
  'A customer’s day · pick a step': 'La journée d’un client · choisissez une étape',
  'For developers': 'Pour les développeurs',
  '{site} pricing: free for people, organizations pay for their team':
    'Tarifs de {site} : gratuit pour les particuliers, les organisations paient pour leur équipe',
  'What makes Caime Caime is never counted. People use it free; Pro adds AI, storage, automations and insights. Organizations start free for a team of three and buy Business for the rest.':
    'Ce qui fait de Caime Caime n’est jamais compté. Les particuliers l’utilisent gratuitement ; Pro ajoute l’IA, le stockage, les automatisations et les aperçus. Les organisations commencent gratuitement pour une équipe de trois et achètent Business pour le reste.',
  'Free for people. Organizations pay for their team.':
    'Gratuit pour les particuliers. Les organisations paient pour leur équipe.',
  'What makes Caime Caime is never counted: connections, relationships, what needs you, what you’re waiting for, search and sync are in every plan. Plans differ only in what costs money to run, and in what organizations buy.':
    'Ce qui fait de Caime Caime n’est jamais compté : liens, relations, ce qui a besoin de vous, ce que vous attendez, recherche et synchronisation sont dans chaque forfait. Les forfaits ne diffèrent que par ce qui coûte à faire tourner, et par ce que les organisations achètent.',
  'For people': 'Pour les particuliers',
  Personal: 'Personal',
  Free: 'Gratuit',
  ', always': ', toujours',
  'ai assist': 'assistance ia',
  '{n} actions a day, once you turn it on': '{n} actions par jour, une fois activée',
  files: 'fichiers',
  automations: 'automatisations',
  'everything else': 'tout le reste',
  'connections, attention, memory, spaces, calls, private conversations':
    'liens, attention, mémoire, espaces, appels, conversations privées',
  Pro: 'Pro',
  'how your relationships are going, from your own messages, for you only':
    'comment vont vos relations, d’après vos propres messages, pour vous seul',
  team: 'équipe',
  'ai agent': 'agent ia',
  'how fast the team answers, who is waiting, what is open':
    'la rapidité de réponse de l’équipe, qui attend, ce qui est ouvert',
  Enterprise: 'Enterprise',
  'Talk to us': 'Parlez-nous',
  included: 'inclus',
  'The rules': 'Les règles',
  'never counted': 'jamais compté',
  'A conversation a customer starts. Anyone who writes to you. Your connections, however many.':
    'Une conversation qu’un client ouvre. Quiconque vous écrit. Vos liens, quel qu’en soit le nombre.',
  'a lower plan': 'un forfait inférieur',
  'takes nothing away: nobody is removed from a team and no app stops. It only stops new additions until they fit.':
    'ne retire rien : personne n’est retiré d’une équipe et aucune application ne s’arrête. Il bloque seulement les nouveaux ajouts jusqu’à ce qu’ils rentrent dans les limites.',
  paying: 'payer',
  'Through Stripe, by card. Cancel whenever you like: it stays on until the end of what you paid for, and nothing you use today goes away after.':
    'Via Stripe, par carte. Annulez quand vous voulez : cela reste actif jusqu’à la fin de la période payée, et rien de ce que vous utilisez aujourd’hui ne disparaît ensuite.',
  'a seat': 'un siège',
  'on a Business or Enterprise team includes everything Pro does.':
    'dans une équipe Business ou Enterprise inclut tout ce que Pro offre.',
  '{site} security and privacy: each side of your life sees what you chose':
    'Sécurité et confidentialité de {site} : chaque côté de votre vie voit ce que vous avez choisi',
  'How you describe people is only ever yours. Profile by sphere, read receipts both ways only, requests before strangers, end-to-end encryption with a recovery key you hold, and a server that keeps envelopes, not words.':
    'La façon dont vous décrivez les gens n’appartient qu’à vous. Profil par cercle, accusés de lecture seulement dans les deux sens, demandes avant les inconnus, chiffrement de bout en bout avec une clé de récupération que vous détenez, et un serveur qui garde des enveloppes, pas des mots.',
  'Privacy in Caime isn’t a setting you find later. How you describe someone is only ever yours, what each sphere of your life sees of you is decided by you, field by field, and a conversation that should be private is encrypted so that not even Caime can read it.':
    'La confidentialité dans Caime n’est pas un réglage que l’on découvre plus tard. La façon dont vous décrivez quelqu’un n’appartient qu’à vous, ce que chaque cercle de votre vie voit de vous est décidé par vous, champ par champ, et une conversation qui doit être privée est chiffrée de sorte que même Caime ne peut pas la lire.',
  'Who sees what · pick a side': 'Qui voit quoi · choisissez un côté',
  'your labels': 'vos étiquettes',
  'How you describe the people you know (family, work, a client) is yours. The person you describe sees it only if you both turn on sharing; nobody else ever does.':
    'La façon dont vous décrivez les gens que vous connaissez (famille, travail, un client) est à vous. La personne décrite ne la voit que si vous activez tous deux le partage ; personne d’autre, jamais.',
  'read receipts': 'accusés de lecture',
  'Only both ways: you see theirs when they see yours.':
    'Seulement dans les deux sens : vous voyez les leurs quand ils voient les vôtres.',
  strangers: 'inconnus',
  'A message from someone you don’t know arrives as a request: one message until you answer. Declined, they never know.':
    'Un message de quelqu’un que vous ne connaissez pas arrive comme une demande : un message jusqu’à votre réponse. Refusé, la personne ne le sait jamais.',
  'under 18': 'moins de 18 ans',
  'No public page, no money cards, no messages from organizations they didn’t write to first, and adults are told when a conversation includes a minor.':
    'Pas de page publique, pas de cartes d’argent, pas de messages d’organisations auxquelles ils n’ont pas écrit en premier, et les adultes sont prévenus quand une conversation inclut un mineur.',
  'private conversations': 'conversations privées',
  'End to end encrypted: a fresh AES-256-GCM key for every message, wrapped for each device allowed to read it with P-256 ECDH and HKDF, and the whole envelope signed by the device that sent it. The server keeps envelopes, never words. Up to {people} people, {devices} devices each.':
    'Chiffrées de bout en bout : une clé AES-256-GCM neuve pour chaque message, enveloppée pour chaque appareil autorisé à le lire avec P-256 ECDH et HKDF, et l’enveloppe entière signée par l’appareil qui l’a envoyée. Le serveur garde des enveloppes, jamais des mots. Jusqu’à {people} personnes, {devices} appareils chacune.',
  'your devices': 'vos appareils',
  'A new device reads nothing until you say it’s yours on one you already have. Your security code is your first device’s, so it stays the same as you add devices and changes only when you start over.':
    'Un nouvel appareil ne lit rien tant que vous ne dites pas qu’il est à vous depuis un appareil que vous avez déjà. Votre code de sécurité est celui de votre premier appareil, il reste donc le même quand vous en ajoutez et ne change que si vous recommencez à zéro.',
  recovery: 'récupération',
  'A recovery key you hold, shown once, brings your private conversations back when every device is gone. Caime keeps nothing of it.':
    'Une clé de récupération que vous détenez, affichée une fois, ramène vos conversations privées quand tous les appareils ont disparu. Caime n’en garde rien.',
  'what isn’t hidden': 'ce qui n’est pas caché',
  'Who is in a conversation, when messages are sent and how long they are, and reactions. The app says so.':
    'Qui est dans une conversation, quand les messages sont envoyés et leur longueur, et les réactions. L’application le dit.',
  'blocks and reports': 'blocages et signalements',
  'A block stops every write, both ways. Reports are read by a person and acted on; every action is in the audit log.':
    'Un blocage arrête toute écriture, dans les deux sens. Les signalements sont lus par une personne et suivis d’effet ; chaque action est dans le journal d’audit.',
  'your data': 'vos données',
  'Download all of it, or delete your account, from Settings. Ended sign-ins are kept {signIns} days, security records {records}, a handle you let go of {handles} from everyone.':
    'Téléchargez-les toutes, ou supprimez votre compte, depuis les Réglages. Les connexions terminées sont conservées {signIns} jours, les enregistrements de sécurité {records}, un identifiant abandonné {handles} à l’abri de tous.',
  'a year': 'un an',
  'the server': 'le serveur',
  'A content security policy on every page, no third-party scripts, no ads, no tracking across sites, and a backup checked after every dump.':
    'Une politique de sécurité du contenu sur chaque page, aucun script tiers, aucune publicité, aucun suivi entre sites, et une sauvegarde vérifiée après chaque export.',
  ai: 'ia',
  'Off until an adult turns it on, never on a private conversation, and everything it infers is a suggestion you accept or don’t.':
    'Désactivée tant qu’un adulte ne l’active pas, jamais sur une conversation privée, et tout ce qu’elle déduit est une suggestion que vous acceptez ou non.',
  'Read the privacy policy': 'Lire la politique de confidentialité',
  'Report a concern': 'Signaler un problème',
  '{site} for developers: an API that reaches only what it was given':
    '{site} pour les développeurs : une API qui n’atteint que ce qu’on lui a donné',
  'Apps for organizations with scoped tokens, signed webhooks, bots and cards of their own; personal tokens and OAuth for apps that act for a person; a typed SDK. Every write is idempotent.':
    'Des applications pour les organisations avec des jetons à portée limitée, des webhooks signés, des bots et des cartes de leur conception ; des jetons personnels et OAuth pour les applications qui agissent pour une personne ; un SDK typé. Chaque écriture est idempotente.',
  'An API that reaches only what it was given.': 'Une API qui n’atteint que ce qu’on lui a donné.',
  'Organizations connect a helpdesk, a CRM or a bot of their own. People let an app act for them, with the permissions they chose. Every token reaches a fixed set of routes, every webhook is signed, and nothing an app does is passed off as a person.':
    'Les organisations connectent un helpdesk, un CRM ou un bot de leur conception. Les personnes laissent une application agir pour elles, avec les permissions choisies. Chaque jeton atteint un ensemble fixe de routes, chaque webhook est signé, et rien de ce qu’une application fait n’est présenté comme venant d’une personne.',
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
    'Définissez un type de carte avec des champs et des états. Votre bot l’envoie, l’équipe et le client la font avancer, et vous l’apprenez quand ils le font.',
  idempotent: 'idempotent',
  'Every write carries a {clientId}. Sending it again returns the first result, never a second message.':
    'Chaque écriture porte un {clientId}. Le renvoyer retourne le premier résultat, jamais un second message.',
  rate: 'débit',
  '{n} requests a minute per token.': '{n} requêtes par minute et par jeton.',
  'the sdk': 'le sdk',
  '{sdk}: a typed client for every route an app reaches, and the webhook check. Built from the repository until it is on npm.':
    '{sdk} : un client typé pour chaque route qu’une application atteint, et la vérification des webhooks. Construit depuis le dépôt jusqu’à sa publication sur npm.',
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
    '{site} est fait par {maker} : un produit de communication, et rien d’autre. Il ne détient ni ne déplace jamais d’argent, n’exécute aucun code tiers et n’a pas de fil d’actualité. L’objet principal est le lien entre deux personnes, pas la discussion.',
  'Made for the people in your life, not for a feed.':
    'Fait pour les gens de votre vie, pas pour un fil d’actualité.',
  '{site} is made by {maker}. It is a communication product, and only that: it never holds or moves money, runs no third-party code, and has no feed. The primary object is the connection between two people, not the chat.':
    '{site} est fait par {maker}. C’est un produit de communication, et rien d’autre : il ne détient ni ne déplace jamais d’argent, n’exécute aucun code tiers, et n’a pas de fil d’actualité. L’objet principal est le lien entre deux personnes, pas la discussion.',
  'made by': 'fait par',
  'what it is': 'ce que c’est',
  'Messaging for people, and for the organizations they deal with, on the web, iOS and Android, from one account.':
    'Une messagerie pour les gens, et pour les organisations avec lesquelles ils traitent, sur le web, iOS et Android, depuis un seul compte.',
  'what it isn’t': 'ce que ce n’est pas',
  'A super-app. No wallet, no marketplace, no feed, no scripts from anyone else.':
    'Une super-application. Pas de portefeuille, pas de place de marché, pas de fil d’actualité, pas de scripts de quiconque d’autre.',
  'the characters': 'les personnages',
  'Caishy and friends (Momo, Panda, Lumi, Pico, Niko and Zuzu) appear where there is something to celebrate or nothing yet to show, never beside your invoice.':
    'Caishy et ses amis (Momo, Panda, Lumi, Pico, Niko et Zuzu) apparaissent là où il y a quelque chose à fêter ou rien encore à montrer, jamais à côté de votre facture.',
  'how it’s built': 'comment c’est construit',
  'One codebase for the server, the web and the phones. Every change is tested end to end against the real server before it ships, and only what passed goes live.':
    'Une seule base de code pour le serveur, le web et les téléphones. Chaque changement est testé de bout en bout contre le vrai serveur avant d’être livré, et seul ce qui a réussi est mis en ligne.',
  'your say': 'votre avis',
  'Questions, ideas and concerns go to {mail}.':
    'Questions, idées et préoccupations : écrivez à {mail}.',
  'Web, iOS and Android.': 'Web, iOS et Android.',
};
