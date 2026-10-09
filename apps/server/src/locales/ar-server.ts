/**
 * What only the server says, in Arabic (R54): the public site's pages, a notification's words, a
 * refusal's message, keyed by their English. The server's own catalog, merged with the app's
 * (`@caime/core/locales/ar`) at start and never downloaded by the app, so a page, a push or a
 * refusal costs no device anything. `node scripts/i18n-keys.mjs missing ar server` lists what it
 * lacks; `apps/server/test/server-i18n.test.ts` fails CI for it.
 */
import type { Catalog } from '@caime/core/i18n';

export const arServer: Catalog = {
  'Caime is messaging that knows who each person is to you: your family, your work, your customers, each in its place, with what needs you first. Free for people; organizations verify who they are.':
    'Caime تطبيق مراسلة يعرف من يكون كل شخص بالنسبة لك: عائلتك وعملك وعملاؤك، كلٌّ في مكانه، وما يحتاجك يأتي أولًا. مجاني للأفراد، والمؤسسات توثّق هويتها.',
  Home: 'الرئيسية',
  'For organizations': 'للمؤسسات',
  'for organizations': 'للمؤسسات',
  Pricing: 'الأسعار',
  pricing: 'الأسعار',
  'security and privacy': 'الأمان والخصوصية',
  Developers: 'المطوّرون',
  developers: 'المطوّرون',
  about: 'عن Caime',
  Help: 'المساعدة',
  Example: 'مثال',
  'Who someone is to you comes first.': 'أولًا: من يكون الشخص بالنسبة لك.',
  'A connection is two people and how they know each other, said by each side, private to each. Everything else in Caime hangs off it.':
    'التواصل في Caime شخصان وكيف يعرف كلٌّ منهما الآخر، كما يصفه كل طرف، وخاصًّا به وحده. وكل ما سواه في Caime يتفرّع منه.',
  'colleague · DATA C · work': 'زميلة · DATA C · العمل',
  'brother · family': 'أخ · العائلة',
  'Messages that know their context.': 'رسائل تعرف سياقها.',
  'One-to-one, groups, topics under a connection, spaces for a family, a team or a club. Ordered, delivered once, and yours offline.':
    'محادثات ثنائية وجماعية، وموضوعات داخل كل تواصل، ومساحات لعائلة أو فريق أو نادٍ. مرتّبة، تصل مرة واحدة فقط، ومتاحة لك دون اتصال.',
  'Did the contract arrive?': 'هل وصل العقد؟',
  'Yes, signing it Friday.': 'نعم، سأوقّعه الجمعة.',
  'read · 2 min': 'قُرئت · منذ دقيقتين',
  'What needs you, not everything.': 'ما يحتاجك، لا كل شيء.',
  'The inbox sorts by what needs you, what’s important, what’s waiting on someone else and what’s quiet, and says why. Your rules by relationship win.':
    'يرتّب صندوق الوارد ما يحتاجك، وما هو مهم، وما ينتظر غيرك، وما هو هادئ، ويذكر السبب. والكلمة الأخيرة لقواعدك حسب العلاقة.',
  'Sarah asked about the contract': 'سألت سارة عن العقد',
  'Omar · the deck · since Tuesday': 'عمر · العرض التقديمي · منذ الثلاثاء',
  '3 need you': '3 تحتاجك',
  'Nothing said is lost.': 'لا يضيع شيء مما قيل.',
  'Commitments, dates, amounts, questions and decisions are found in the conversation and offered back as actions. They become facts only when you say so.':
    'الالتزامات والمواعيد والمبالغ والأسئلة والقرارات تُلتقط من المحادثة وتُعرض عليك إجراءاتٍ جاهزة. ولا تصير حقائق إلا حين تقرر أنت ذلك.',
  Suggested: 'مقترح',
  'Remind me: send the deck · Monday': 'ذكّرني: إرسال العرض · الاثنين',
  'Waiting on Sarah: contract': 'في انتظار سارة: العقد',
  'based on “I’ll send the deck on Monday.”': 'بناءً على «سأرسل العرض يوم الاثنين.»',
  'A business that proves it’s the business.': 'مؤسسة تُثبت أنها هي حقًّا.',
  'An organization verifies its domain with one DNS record. Its team answers customers as the organization, in one inbox, with apps and an AI agent that always say what they are.':
    'توثّق المؤسسة نطاقها بسجل DNS واحد. ويرد فريقها على العملاء باسمها، من صندوق وارد واحد، مع تطبيقات ووكيل ذكاء اصطناعي يُفصحان دائمًا عن طبيعتهما.',
  'verified · niledental.example': 'موثّقة · niledental.example',
  'Lina · new patient forms': 'لينا · استمارات مريض جديد',
  'Each side of your life sees what you chose.': 'كل جانب من حياتك يرى ما اخترته.',
  'Profile fields by sphere, read receipts only both ways, requests before strangers reach you, and end-to-end encryption when a conversation should be private.':
    'حقول ملفك حسب الدائرة، وإشعارات قراءة متبادلة لا غير، وطلب قبل أن يصلك أي غريب، وتشفير من طرف إلى طرف حين ينبغي أن تبقى المحادثة خاصة.',
  'work sees': 'العمل يرى',
  'name · headline · organization': 'الاسم · العنوان المهني · المؤسسة',
  'family sees': 'العائلة ترى',
  'everything, and where you are when you share it': 'كل شيء، ومكانك حين تشاركه',
  'a stranger sees': 'الغريب يرى',
  'your name and handle, and may ask': 'اسمك ومعرّفك، وله أن يطلب',
  '{n} GB': '{n} غيغابايت',
  'price shown in the app': 'السعر يظهر في التطبيق',
  '{price} a month': '{price} شهريًا',
  '{price} a year': '{price} سنويًا',
  ', or ': '، أو ',
  'It lands in the inbox, first if they’ve waited longest.':
    'تصل إلى صندوق الوارد، وتتصدّره إن طال انتظارها أكثر من غيرها.',
  'Lina writes to Nile Dental from the app she uses for everyone else. The team sees one conversation, its state and who has it; Lina sees the organization, never which person.':
    'تكتب لينا إلى Nile Dental من التطبيق نفسه الذي تستخدمه مع كل من حولها. يرى الفريق محادثة واحدة وحالتها ومن يتولاها؛ وترى لينا المؤسسة، لا الشخص الذي يرد.',
  'Can I book a cleaning on Thursday?': 'هل يمكنني حجز تنظيف يوم الخميس؟',
  'new · nobody has it · 2 min': 'جديدة · لا أحد يتولاها · منذ دقيقتين',
  'The agent answers': 'الوكيل يرد',
  'From what you wrote down, and it says so.': 'مما كتبته أنت، ويقول ذلك.',
  'The organization’s AI agent answers only from its knowledge (up to {n} characters you gave it), is marked as an AI, and hands over to a person the moment it isn’t sure. With bookable hours set, it offers the open slots and books the one the customer picks, for the team to confirm.':
    'لا يجيب وكيل الذكاء الاصطناعي للمؤسسة إلا من المعرفة التي زوّدته بها (حتى {n} حرف)، ويظهر بوضوح أنه ذكاء اصطناعي، ويحيل المحادثة إلى شخص متى لم يكن متأكدًا. وإن حدّدت ساعات الحجز، يعرض المواعيد المتاحة ويحجز ما يختاره العميل، ليؤكده الفريق.',
  'I can offer Thursday 10:00 or 10:30. Which suits you?':
    'المتاح يوم الخميس: 10:00 أو 10:30. أيهما يناسبك؟',
  'Cleaning · Thursday 10:00 · requested': 'تنظيف · الخميس 10:00 · أُرسل الطلب',
  'Nile Dental · AI agent · automated': 'Nile Dental · وكيل ذكاء اصطناعي · آلي',
  'The team answers': 'الفريق يرد',
  'Whoever answers has it; the customer hears from the organization.':
    'من يرد يتولى المحادثة، والعميل يتلقى الرد من المؤسسة.',
  'Answering takes the conversation. Assign it, escalate it to an owner or admin with a note, or resolve it; it comes back the moment the customer writes again.':
    'من يرد يتولى المحادثة. أسندها إلى غيرك، أو صعّدها إلى مالك أو مشرف مع ملاحظة، أو حُلّها؛ وتعود مفتوحة متى كتب العميل من جديد.',
  '10:00 is yours. See you Thursday.': 'موعدك الساعة 10:00. نراك يوم الخميس.',
  'Your tools hear it': 'أدواتك على علم بها',
  'A helpdesk, a CRM or your own bot, in the same conversation.':
    'مكتب دعم، أو نظام إدارة عملاء، أو بوت من صنعك، في المحادثة نفسها.',
  'An app’s bot replies as the organization, marked automated, and never counts as the team’s answer. Its webhook hears each message and each change of state.':
    'يرد بوت التطبيق باسم المؤسسة، مع علامة «آلي»، ولا يُحسب ردًّا من الفريق أبدًا. ويتلقى الويب هوك الخاص به كل رسالة وكل تغيّر في حالة المحادثة.',
  'resolved · by person': 'محلولة · بواسطة شخص',
  'Booking · confirmed · by customer': 'حجز · مؤكد · بواسطة العميل',
  'A colleague sees the professional you.': 'الزميل يرى الجانب المهني منك.',
  'Name, headline, organization, the hours you answer in. Your birthday, your family and your location stay out of it unless you say otherwise.':
    'الاسم، والعنوان المهني، والمؤسسة، وساعات ردّك. أما عيد ميلادك وعائلتك ومكانك فتبقى خارج ذلك ما لم تقل غير ذلك.',
  sees: 'يرى',
  'Noor Haddad · Dentist · Nile Dental': 'نور حداد · طب الأسنان · Nile Dental',
  'doesn’t see': 'لا يرى',
  'birthday · family · where you are': 'عيد الميلاد · العائلة · مكانك',
  'Family sees more, because you said so.': 'العائلة ترى أكثر، لأنك قلت ذلك.',
  'What each sphere sees is a setting you own, field by field. Sharing your location live is one tap, for as long as you chose, and ends on its own.':
    'ما تراه كل دائرة إعداد تملكه أنت، حقلًا حقلًا. ومشاركة موقعك مباشرةً لمسة واحدة، للمدة التي اخترتها، وتنتهي من تلقاء نفسها.',
  'everything you chose, and where you are while you share it':
    'كل ما اخترته، ومكانك ما دمت تشاركه',
  until: 'حتى',
  'the hour you picked': 'الساعة التي اخترتها',
  'A stranger': 'غريب',
  'A stranger may ask. Nothing more.': 'للغريب أن يطلب. لا أكثر.',
  'Someone who isn’t connected to you sees your name and handle, if you let yourself be found. Their first message arrives as a request: one message until you answer.':
    'من لا تواصل بينك وبينه يرى اسمك ومعرّفك، إن سمحت بأن يجدك الناس. وتصل رسالته الأولى في صورة طلب: رسالة واحدة حتى ترد.',
  'Hi Noor, found you!': 'مرحبًا نور، وجدتك!',
  'one message until you answer · decline and they never know':
    'رسالة واحدة حتى ترد · ارفض ولن يعلم بذلك أبدًا',
  'A customer sees the organization, never its people.': 'العميل يرى المؤسسة، لا أشخاصها أبدًا.',
  'In a business conversation the team’s names and ids are masked everywhere: messages, read receipts, suggestions, exports. Anything filed for the customer names the organization.':
    'في محادثة الأعمال تُحجب أسماء الفريق ومعرّفاتهم في كل مكان: الرسائل، وإشعارات القراءة، والاقتراحات، وملفات التصدير. وكل ما يُسجَّل للعميل يحمل اسم المؤسسة.',
  'verified · answered in an hour': 'موثّقة · تجيب خلال ساعة',
  '{n} actions a day': '{n} إجراء في اليوم',
  '{n} conversations a day': '{n} محادثة في اليوم',
  '{n} answers a day': '{n} إجابة في اليوم',
  'Your family, your work and your customers don’t belong in one list. Say who each person is to you, once. From then on Caime knows what needs you first, who may reach you when, what was decided and what’s owed, and what each side of your life sees of you.':
    'عائلتك وعملك وعملاؤك لا مكان لهم في قائمة واحدة. قل من يكون كل شخص بالنسبة لك، مرة واحدة فقط. ومن بعدها يعرف Caime ما يحتاجك أولًا، ومن له أن يصل إليك ومتى، وما تقرر وما هو مستحق، وما يراه منك كل جانب من حياتك.',
  'Start free': 'ابدأ مجانًا',
  Specification: 'المواصفات',
  'primary object': 'الكيان الأساسي',
  'The connection between two people, not the chat.': 'التواصل بين شخصين، لا مجرد الدردشة.',
  'to connect': 'للتواصل',
  'Connect in three taps. Say how you know someone; the conversation, its notifications and its cards fit the relationship.':
    'تواصل بثلاث لمسات. قل كيف تعرف الشخص؛ فتتلاءم المحادثة وإشعاراتها وبطاقاتها مع العلاقة.',
  attention: 'الانتباه',
  '“3 need you”, never “47 unread”. The inbox puts what matters first and says why.':
    '«3 تحتاجك»، لا «47 غير مقروءة» أبدًا. يضع صندوق الوارد ما يهم أولًا ويقول السبب.',
  memory: 'الذاكرة',
  'Commitments, dates, amounts and decisions are found in the conversation and offered as actions. You decide; nothing is written for you.':
    'الالتزامات والمواعيد والمبالغ والقرارات تُلتقط من المحادثة وتُعرض عليك إجراءاتٍ. القرار لك؛ ولا يُكتب شيء نيابةً عنك.',
  organizations: 'المؤسسات',
  'A business proves its domain with one DNS record; its team answers as the organization, in one inbox, and customers book from its open slots.':
    'توثّق المؤسسة نطاقها بسجل DNS واحد؛ ويرد فريقها باسمها من صندوق وارد واحد، ويحجز العملاء من مواعيدها المتاحة.',
  'Each side of your life sees what you chose. End-to-end encrypted when you say so, with a recovery key only you hold.':
    'كل جانب من حياتك يرى ما اخترته. وتشفير من طرف إلى طرف حين تشاء، بمفتاح استعادة لا يحمله غيرك.',
  money: 'المال',
  'Never held or moved by Caime. A split records who owes whom; nothing else.':
    'لا يحتفظ به Caime ولا يحرّكه أبدًا. بطاقة التقسيم تسجّل من يدين لمن، لا أكثر.',
  'Free for people, always. Organizations start free and can buy Business.':
    'مجاني للأفراد، دائمًا. وتبدأ المؤسسات مجانًا ويمكنها الاشتراك في Business.',
  'runs on': 'يعمل على',
  'Web, iOS and Android, from one account.': 'الويب وiOS وAndroid، من حساب واحد.',
  'Layers · pick one': 'الطبقات · اختر واحدة',
  '{site} for organizations: answer as the organization, and prove it’s you':
    '{site} للمؤسسات: ردّ باسم مؤسستك، وأثبت هويتها',
  'A clinic, a shop, a school or a nonprofit verifies its domain with one DNS record and answers customers as the organization, in one inbox, with an AI agent and apps that always say what they are. Free for a team of three.':
    'عيادة أو متجر أو مدرسة أو جمعية توثّق نطاقها بسجل DNS واحد وترد على العملاء باسمها، من صندوق وارد واحد، مع وكيل ذكاء اصطناعي وتطبيقات تُفصح دائمًا عن طبيعتها. مجاني لفريق من ثلاثة أشخاص.',
  'Answer as the organization, and prove it’s you.': 'ردّ باسم مؤسستك، وأثبت هويتها.',
  'A clinic, a shop, a school, a nonprofit or a public service gets a profile people can trust once it verifies its domain, and one inbox where its team answers customers as the organization. Customers write from the app they already use for everyone else in their life.':
    'تحصل العيادة أو المتجر أو المدرسة أو الجمعية أو الخدمة العامة على صفحة يثق بها الناس ما إن توثّق نطاقها، وعلى صندوق وارد واحد يرد فيه فريقها على العملاء باسمها. ويكتب العملاء من التطبيق الذي يستخدمونه أصلًا مع كل من في حياتهم.',
  verification: 'التوثيق',
  'One TXT record on your domain. Verified shows on your page and beside your team; it is checked, never bought, and yours again if you ever close and come back.':
    'سجل TXT واحد على نطاقك. تظهر علامة «موثّقة» على صفحتك وبجانب أعضاء فريقك؛ تُنال بالتحقق ولا تُشترى، وتعود إليك إن أغلقت يومًا ثم عدت.',
  'the inbox': 'صندوق الوارد',
  'Every customer conversation in one place, sorted by who has waited longest, in six views: {views}.':
    'كل محادثات العملاء في مكان واحد، مرتّبة حسب الأطول انتظارًا، في ست طرق عرض: {views}.',
  'the team': 'الفريق',
  'Owners, admins and members. A customer sees the organization, never which person answered. A seat that ends takes nothing with it.':
    'مالكون ومشرفون وأعضاء. يرى العميل المؤسسة، لا الشخص الذي أجاب أبدًا. والمقعد الذي ينتهي لا يأخذ معه شيئًا.',
  'writing first': 'المبادرة بالكتابة',
  'Your team may write to someone first. It arrives as a request: one message until they answer, and their answer opens the conversation.':
    'يمكن لفريقك أن يبادر بالكتابة إلى شخص. وتصل الرسالة في صورة طلب: رسالة واحدة حتى يرد، ورده يفتح المحادثة.',
  'the ai agent': 'وكيل الذكاء الاصطناعي',
  'Answers from what you wrote down (up to {n} characters), is marked as an AI, and hands over to a person the moment it isn’t sure. It never speaks for the team.':
    'لا يجيب إلا مما كتبته له (حتى {n} حرف)، ويظهر بوضوح أنه ذكاء اصطناعي، ويحيل المحادثة إلى شخص متى لم يكن متأكدًا. ولا يتحدث باسم الفريق أبدًا.',
  'Set bookable hours once. Customers pick from the open slots, your AI agent offers the next few and books the one they choose, and every booking is an appointment your team confirms.':
    'حدّد ساعات الحجز مرة واحدة. يختار العملاء من المواعيد المتاحة، ويعرض وكيل الذكاء الاصطناعي أقربها ويحجز ما يختارونه، وكل حجز موعد يؤكده فريقك.',
  apps: 'التطبيقات',
  'A helpdesk, a CRM or your own bot: a token that reaches only your conversations, a signed webhook, and cards of your own design.':
    'مكتب دعم، أو نظام إدارة عملاء، أو بوت من صنعك: رمز وصول لا يبلغ إلا محادثاتك، وويب هوك موقَّع، وبطاقات من تصميمك.',
  updates: 'التحديثات',
  'Post to everyone who follows you. Nobody sees who follows, and nothing about following reaches anyone’s inbox.':
    'انشر لكل من يتابعك. لا أحد يرى من يتابع، ولا شيء عن المتابعة يصل إلى صندوق وارد أحد.',
  spaces: 'المساحات',
  'Spaces for the team, a project or a branch, started from the organization’s page, with your team already there to pick from.':
    'مساحات للفريق أو لمشروع أو لفرع، تبدأها من صفحة المؤسسة، وأعضاء فريقك جاهزون لتختار منهم.',
  calls: 'المكالمات',
  'Voice and video, one to one and in groups of up to {n}, in the browser.':
    'صوت وفيديو، ثنائية وفي مجموعات حتى {n} أشخاص، في المتصفح.',
  insights: 'الرؤى',
  'How fast the team answers, how many customers write and what is still open. On Business.':
    'سرعة إجابة الفريق، وعدد العملاء الذين يكتبون، وما لا يزال مفتوحًا. في خطة Business.',
  'Free for a team of {team}, with {apps}. Business for the rest: {pricing}.':
    'مجاني لفريق من {team}، مع {apps}. وخطة Business لما يزيد على ذلك: {pricing}.',
  'one app': 'تطبيق واحد',
  'A customer’s day · pick a step': 'يوم عميل · اختر خطوة',
  'For developers': 'للمطوّرين',
  '{site} pricing: free for people, organizations pay for their team':
    'أسعار {site}: مجاني للأفراد، والمؤسسات تدفع لفريقها',
  'What makes Caime Caime is never counted. People use it free; Pro adds AI, storage, automations and insights. Organizations start free for a team of three and buy Business for the rest.':
    'جوهر Caime لا يُحسب عليك أبدًا. يستخدمه الأفراد مجانًا، وتضيف Pro الذكاء الاصطناعي والتخزين والأتمتة والرؤى. وتبدأ المؤسسات مجانًا لفريق من ثلاثة أشخاص، وتشترك في Business لما يزيد على ذلك.',
  'What makes Caime Caime is never counted: connections, relationships, what needs you, what you’re waiting for, search and sync are in every plan. Plans differ only in what costs money to run, and in what organizations buy.':
    'جوهر Caime لا يُحسب عليك أبدًا: من تتواصل معهم، وعلاقاتك، وما يحتاجك، وما تنتظره، والبحث والمزامنة، كلها في كل خطة. ولا تختلف الخطط إلا فيما يكلّف تشغيله مالًا، وفيما تشتريه المؤسسات.',
  'For people': 'للأفراد',
  Personal: 'شخصي',
  ', always': '، دائمًا',
  '{n} actions a day, once you turn it on': '{n} إجراء في اليوم، متى شغّلته',
  files: 'الملفات',
  automations: 'الأتمتة',
  'everything else': 'كل ما عدا ذلك',
  'connections, attention, memory, spaces, calls, private conversations':
    'التواصل، والانتباه، والذاكرة، والمساحات، والمكالمات، والمحادثات الخاصة',
  Pro: 'Pro',
  'how your relationships are going, from your own messages, for you only':
    'كيف تسير علاقاتك، من رسائلك أنت، لك وحدك',
  team: 'الفريق',
  'how fast the team answers, who is waiting, what is open':
    'سرعة إجابة الفريق، ومن ينتظر، وما هو مفتوح',
  Enterprise: 'Enterprise',
  'Talk to us': 'تحدث إلينا',
  included: 'مشمولة',
  'The rules': 'القواعد',
  'never counted': 'لا يُحسب عليك أبدًا',
  'A conversation a customer starts. Anyone who writes to you. Your connections, however many.':
    'محادثة يبدؤها عميل. أي شخص يكتب إليك. من تتواصل معهم، مهما كثروا.',
  'a lower plan': 'خطة أدنى',
  'takes nothing away: nobody is removed from a team and no app stops. It only stops new additions until they fit.':
    'لا تسلبك شيئًا: لا يُزال أحد من الفريق ولا يتوقف أي تطبيق. كل ما في الأمر أنها توقف الإضافات الجديدة حتى يعود العدد ضمن حدودها.',
  paying: 'الدفع',
  'Through Stripe, by card. Cancel whenever you like: it stays on until the end of what you paid for, and nothing you use today goes away after.':
    'عبر Stripe، بالبطاقة. ألغِ متى شئت: يبقى الاشتراك حتى نهاية ما دفعت مقابله، ولا يزول بعدها شيء مما تستخدمه اليوم.',
  'a seat': 'المقعد',
  'on a Business or Enterprise team includes everything Pro does.':
    'في فريق Business أو Enterprise يشمل كل ما في Pro.',
  '{site} security and privacy: each side of your life sees what you chose':
    'الأمان والخصوصية في {site}: كل جانب من حياتك يرى ما اخترته',
  'How you describe people is only ever yours. Profile by sphere, read receipts both ways only, requests before strangers, end-to-end encryption with a recovery key you hold, and a server that keeps envelopes, not words.':
    'وصفك للناس يبقى لك وحدك. ملف شخصي حسب الدائرة، وإشعارات قراءة متبادلة لا غير، وطلب قبل أن يصلك أي غريب، وتشفير من طرف إلى طرف بمفتاح استعادة تحمله أنت، وخادم يحفظ المظاريف لا الكلمات.',
  'Privacy in Caime isn’t a setting you find later. How you describe someone is only ever yours, what each sphere of your life sees of you is decided by you, field by field, and a conversation that should be private is encrypted so that not even Caime can read it.':
    'الخصوصية في Caime ليست إعدادًا تجده لاحقًا. وصفك لأي شخص يبقى لك وحدك، وما تراه منك كل دائرة من حياتك تقرره أنت، حقلًا حقلًا، والمحادثة التي ينبغي أن تكون خاصة مشفّرة بحيث لا يستطيع حتى Caime قراءتها.',
  'Who sees what · pick a side': 'من يرى ماذا · اختر جانبًا',
  'your labels': 'أوصافك',
  'How you describe the people you know (family, work, a client) is yours. The person you describe sees it only if you both turn on sharing; nobody else ever does.':
    'وصفك لمن تعرفهم (عائلة، عمل، عميل) لك وحدك. لا يراه الشخص الموصوف إلا إن فعّلتما المشاركة كلاكما، ولا يراه أحد غيره أبدًا.',
  'read receipts': 'إشعارات القراءة',
  'Only both ways: you see theirs when they see yours.':
    'متبادلة لا غير: ترى إشعار قراءة الطرف الآخر حين يرى إشعارك.',
  strangers: 'الغرباء',
  'A message from someone you don’t know arrives as a request: one message until you answer. Declined, they never know.':
    'رسالة من لا تعرفه تصل في صورة طلب: رسالة واحدة حتى ترد. وإن رفضت، لا يعلم بذلك أبدًا.',
  'under 18': 'دون 18 عامًا',
  'No public page, no money cards, no messages from organizations they didn’t write to first, and adults are told when a conversation includes a minor.':
    'لا صفحة عامة، ولا بطاقات مالية، ولا رسائل من مؤسسات لم يكتبوا إليها أولًا، ويُخبَر البالغون حين تضم المحادثة قاصرًا.',
  'private conversations': 'المحادثات الخاصة',
  'End to end encrypted: a fresh AES-256-GCM key for every message, wrapped for each device allowed to read it with P-256 ECDH and HKDF, and the whole envelope signed by the device that sent it. The server keeps envelopes, never words. Up to {people} people, {devices} devices each.':
    'مشفّرة من طرف إلى طرف: مفتاح AES-256-GCM جديد لكل رسالة، مغلَّف لكل جهاز مسموح له بقراءتها عبر P-256 ECDH وHKDF، والمظروف كله موقَّع من الجهاز الذي أرسله. يحفظ الخادم المظاريف، لا الكلمات أبدًا. حتى {people} شخصًا، و{devices} جهازًا لكل منهم.',
  'your devices': 'أجهزتك',
  'A new device reads nothing until you say it’s yours on one you already have. Your security code is your first device’s, so it stays the same as you add devices and changes only when you start over.':
    'لا يقرأ الجهاز الجديد شيئًا حتى تؤكد من أحد أجهزتك الحالية أنه لك. ورمز أمانك هو رمز جهازك الأول، فيبقى ثابتًا مهما أضفت من أجهزة، ولا يتغير إلا حين تبدأ من جديد.',
  'A recovery key you hold, shown once, brings your private conversations back when every device is gone. Caime keeps nothing of it.':
    'مفتاح استعادة تحمله أنت، يُعرض مرة واحدة، يعيد محادثاتك الخاصة حين تفقد كل أجهزتك. ولا يحتفظ Caime بشيء منه.',
  'what isn’t hidden': 'ما ليس مخفيًا',
  'Who is in a conversation, when messages are sent and how long they are, and reactions. The app says so.':
    'من في المحادثة، ومتى تُرسل الرسائل وما طولها، والتفاعلات. والتطبيق يوضّح ذلك.',
  'blocks and reports': 'الحظر والبلاغات',
  'A block stops every write, both ways. Reports are read by a person and acted on; every action is in the audit log.':
    'الحظر يوقف كل كتابة، في الاتجاهين. والبلاغات يقرؤها شخص ويتصرف بشأنها؛ وكل إجراء مسجَّل في سجل التدقيق.',
  'your data': 'بياناتك',
  'Download all of it, or delete your account, from Settings. Ended sign-ins are kept {signIns} days, security records {records}, a handle you let go of {handles} from everyone.':
    'نزّلها كلها، أو احذف حسابك، من الإعدادات. تُحفظ جلسات الدخول المنتهية {signIns} يومًا، وسجلات الأمان {records}، ويبقى المعرّف الذي تتخلى عنه محجوزًا عن الجميع {handles}.',
  'a year': 'سنة',
  'the server': 'الخادم',
  'A content security policy on every page, no third-party scripts, no ads, no tracking across sites, and a backup checked after every dump.':
    'سياسة أمان محتوى على كل صفحة، ولا نصوص برمجية من طرف ثالث، ولا إعلانات، ولا تتبع عبر المواقع، ونسخة احتياطية تُفحص بعد كل تفريغ.',
  AI: 'الذكاء الاصطناعي',
  'Off until an adult turns it on, never on a private conversation, and everything it infers is a suggestion you accept or don’t.':
    'معطّل حتى يفعّله شخص بالغ، ولا يعمل على محادثة خاصة أبدًا، وكل ما يستنتجه اقتراح لك أن تقبله أو ترفضه.',
  'Read the privacy policy': 'اقرأ سياسة الخصوصية',
  'Report a concern': 'أبلغ عن مشكلة',
  '{site} for developers: an API that reaches only what it was given':
    '{site} للمطوّرين: واجهة برمجية لا تبلغ إلا ما أُعطيت',
  'Apps for organizations with scoped tokens, signed webhooks, bots and cards of their own; personal tokens and OAuth for apps that act for a person; a typed SDK. Every write is idempotent.':
    'تطبيقات للمؤسسات برموز وصول محدودة النطاق، وويب هوك موقَّع، وبوتات وبطاقات من صنعها؛ ورموز شخصية وOAuth للتطبيقات التي تعمل نيابةً عن شخص؛ وحزمة SDK بأنواع محددة. وكل عملية كتابة آمنة عند تكرارها.',
  'An API that reaches only what it was given.': 'واجهة برمجية لا تبلغ إلا ما أُعطيت.',
  'Organizations connect a helpdesk, a CRM or a bot of their own. People let an app act for them, with the permissions they chose. Every token reaches a fixed set of routes, every webhook is signed, and nothing an app does is passed off as a person.':
    'تربط المؤسسات مكتب دعم أو نظام إدارة عملاء أو بوتًا من صنعها. ويسمح الأفراد لتطبيق بالعمل نيابةً عنهم، بالصلاحيات التي اختاروها. كل رمز وصول يبلغ مجموعة ثابتة من المسارات، وكل ويب هوك موقَّع، ولا يُقدَّم ما يفعله تطبيق على أنه فعل شخص أبدًا.',
  'Added on the organization’s page. Each has its own bot on the team, a token shown once, and a webhook signed with a secret shown once. Replace either and the old one stops at once.':
    'تُضاف من صفحة المؤسسة. لكل منها بوت خاص في الفريق، ورمز وصول يُعرض مرة واحدة، وويب هوك موقَّع بسر يُعرض مرة واحدة. وإن استبدلت أيًّا منهما توقّف القديم فورًا.',
  permissions: 'الصلاحيات',
  '{scopes}: given one by one. A route the token can’t use answers 403.':
    '{scopes}: تُمنح كلٌّ منها على حدة. والمسار الذي لا يحق للرمز استخدامه يرد بـ 403.',
  webhooks: 'الويب هوك',
  '{events}. Signed, https only, no private addresses, one deadline for the whole exchange.':
    '{events}. موقَّعة، عبر https فقط، لا عناوين خاصة، ومهلة واحدة للتبادل كله.',
  'your own cards': 'بطاقاتك الخاصة',
  'Define a kind of card with fields and states. Your bot sends it, the team and the customer move it, and you hear when they do.':
    'عرّف نوع بطاقة بحقوله وحالاته. يرسلها بوتك، ويحرّكها الفريق والعميل، ويصلك إشعار حين يفعلون.',
  idempotent: 'التكرار الآمن',
  'Every write carries a {clientId}. Sending it again returns the first result, never a second message.':
    'كل كتابة تحمل {clientId}. وإرسالها مرة أخرى يعيد النتيجة الأولى، لا رسالة ثانية أبدًا.',
  rate: 'المعدل',
  '{n} requests a minute per token.': '{n} طلب في الدقيقة لكل رمز وصول.',
  'the sdk': 'حزمة SDK',
  '{sdk}: a typed client for every route an app reaches, and the webhook check. Built from the repository until it is on npm.':
    '{sdk}: عميل بأنواع محددة لكل مسار يبلغه تطبيق، والتحقق من الويب هوك. يُبنى من المستودع حتى يُنشر على npm.',
  'personal tokens': 'الرموز الشخصية',
  'A person makes a token for their own scripts ({scopes}). It never reaches the account itself.':
    'يصنع الشخص رمز وصول لنصوصه البرمجية ({scopes}). ولا يبلغ الحساب نفسه أبدًا.',
  OAuth: 'OAuth',
  'Third-party apps ask people for consent (OAuth 2.0; errors as RFC 6749 and 7009 say), hold only what they were given, and can be revoked any time from Settings.':
    'تطلب تطبيقات الطرف الثالث موافقة الأفراد (OAuth 2.0؛ والأخطاء وفق RFC 6749 و7009)، ولا تحمل إلا ما أُعطيت، ويمكن إلغاؤها في أي وقت من الإعدادات.',
  'the guide': 'الدليل',
  'In the app: Settings → Developer, and beside each app on the organization’s page.':
    'في التطبيق: الإعدادات ← المطوّر، وبجانب كل تطبيق في صفحة المؤسسة.',
  'About {site}': 'عن {site}',
  '{site} is made by {maker}: a communication product, and only that. It never holds or moves money, runs no third-party code and has no feed. The primary object is the connection between two people, not the chat.':
    '{site} من صنع {maker}: منتج تواصل، ولا شيء غير ذلك. لا يحتفظ بالمال ولا يحرّكه أبدًا، ولا يشغّل كودًا من طرف ثالث، ولا موجز أخبار فيه. الكيان الأساسي هو التواصل بين شخصين، لا مجرد الدردشة.',
  'Made for the people in your life, not for a feed.': 'صُنع لمن في حياتك، لا لموجز أخبار.',
  '{site} is made by {maker}. It is a communication product, and only that: it never holds or moves money, runs no third-party code, and has no feed. The primary object is the connection between two people, not the chat.':
    '{site} من صنع {maker}. هو منتج تواصل، ولا شيء غير ذلك: لا يحتفظ بالمال ولا يحرّكه أبدًا، ولا يشغّل كودًا من طرف ثالث، ولا موجز أخبار فيه. الكيان الأساسي هو التواصل بين شخصين، لا مجرد الدردشة.',
  'made by': 'من صنع',
  'what it is': 'ما هو',
  'Messaging for people, and for the organizations they deal with, on the web, iOS and Android, from one account.':
    'مراسلة للأفراد، وللمؤسسات التي يتعاملون معها، على الويب وiOS وAndroid، من حساب واحد.',
  'what it isn’t': 'ما ليس عليه',
  'A super-app. No wallet, no marketplace, no feed, no scripts from anyone else.':
    'ليس تطبيقًا لكل شيء. لا محفظة، ولا سوق، ولا موجز أخبار، ولا نصوص برمجية من أحد غيرنا.',
  'the characters': 'الشخصيات',
  'Caishy and friends (Momo, Panda, Lumi, Pico, Niko and Zuzu) appear where there is something to celebrate or nothing yet to show, never beside your invoice.':
    'يظهر كايشي وأصدقاؤه (مومو وباندا ولومي وبيكو ونيكو وزوزو) حين يكون هناك ما يُحتفى به أو حين لا يوجد ما يُعرض بعد، ولا يظهرون أبدًا بجانب فاتورتك.',
  'how it’s built': 'كيف بُني',
  'One codebase for the server, the web and the phones. Every change is tested end to end against the real server before it ships, and only what passed goes live.':
    'قاعدة كود واحدة للخادم والويب والهواتف. يُختبر كل تغيير من طرف إلى طرف على الخادم الحقيقي قبل إطلاقه، ولا يصل إلى المستخدمين إلا ما نجح.',
  'your say': 'رأيك',
  'Questions, ideas and concerns go to {mail}.': 'الأسئلة والأفكار والمخاوف تُرسل إلى {mail}.',
  'Web, iOS and Android.': 'الويب وiOS وAndroid.',
  '{name} is on {site}.': '{name} على {site}.',
  'a person on {site}': 'شخص على {site}',
  headline: 'العنوان المهني',
  with: 'مع',
  'Message {name} on {site}': 'راسل {name} على {site}',
  'Verified · {domain}': 'موثّقة · {domain}',
  'Since {year}': 'منذ {year}',
  'an organization on {site}': 'مؤسسة على {site}',
  '{domain}, proved with a DNS record': '{domain}، مُثبَت بسجل DNS',
  'Not yet': 'ليس بعد',
  '{name} invited you': 'دعاك {name}',
  'Join {name} on {site}{context}: sign up in half a minute and you’re connected.':
    'انضم إلى {name} على {site}{context}: سجّل في نصف دقيقة وتكونان على تواصل.',
  'an invitation': 'دعوة',
  from: 'من',
  'to join': 'للانضمام',
  'Sign up in half a minute and you’re connected with {name}, no app to install.':
    'سجّل في نصف دقيقة وتكون على تواصل مع {name}، دون تثبيت أي تطبيق.',
  'Join {name} on {site}': 'انضم إلى {name} على {site}',
  'Not here': 'ليس هنا',
  'Nobody by that handle.': 'لا أحد بهذا المعرّف.',
  'not here': 'ليس هنا',
  'Nobody by that handle': 'لا أحد بهذا المعرّف',
  'It may have changed, or been let go of.': 'ربما تغيّر، أو جرى التخلّي عنه.',
  'Open {site}': 'افتح {site}',
  '{name} opened your invite link': 'فتح {name} رابط دعوتك',
  'You decide who connects with you: accept to connect.':
    'أنت من يقرر من يتواصل معك: اقبل ليبدأ التواصل.',
  '{agentName} handed a conversation to the team': 'سلّم {agentName} محادثة إلى الفريق',
  'A customer': 'عميل',
  'from {caller}': 'من {caller}',
  'from {starter}': 'من {starter}',
  automated: 'آلي',
  'Message request': 'طلب مراسلة',
  Group: 'مجموعة',
  'New message': 'رسالة جديدة',
  '{n} new messages in {groupTitle}': {
    zero: 'لا رسائل جديدة في {groupTitle}',
    one: 'رسالة جديدة واحدة في {groupTitle}',
    two: 'رسالتان جديدتان في {groupTitle}',
    few: '{n} رسائل جديدة في {groupTitle}',
    many: '{n} رسالة جديدة في {groupTitle}',
    other: '{n} رسالة جديدة في {groupTitle}',
  },
  '{senderName} sent {n} messages{context}': {
    zero: 'لم يرسل {senderName} رسائل{context}',
    one: 'أرسل {senderName} رسالة واحدة{context}',
    two: 'أرسل {senderName} رسالتين{context}',
    few: 'أرسل {senderName} {n} رسائل{context}',
    many: 'أرسل {senderName} {n} رسالة{context}',
    other: 'أرسل {senderName} {n} رسالة{context}',
  },
  'Your report was reviewed': 'تمت مراجعة بلاغك',
  'Thanks for reporting it: Caime looked and acted.':
    'شكرًا على الإبلاغ: نظر Caime في الأمر واتخذ إجراءً.',
  'Thanks for reporting it: Caime looked, and didn’t act on it this time.':
    'شكرًا على الإبلاغ: نظر Caime في الأمر ولم يتخذ إجراءً هذه المرة.',
  '{name} asked you': 'طلب منك {name}',
  '{name} finished your request': 'أنهى {name} طلبك',
  '{name} accepted your request': 'قبل {name} طلبك',
  '{name} declined your request': 'رفض {name} طلبك',
  '{name} reopened your request': 'أعاد {name} فتح طلبك',
  '{name} cancelled your request': 'ألغى {name} طلبك',
  '{name} gave you a conversation': 'أسند إليك {name} محادثة',
  '{name} escalated a conversation': 'صعّد {name} محادثة',
  '{name} is calling': '{name} يتصل',
  '{name} joined through your invite': 'انضم {name} عبر دعوتك',
  'You’re connected. Say hi.': 'أنتما متواصلان الآن. ألقِ التحية.',
  'Say hi when you’re ready.': 'ألقِ التحية متى شئت.',
  '{name} wants to connect with you': 'يريد {name} التواصل معك',
  '{name} finished {title}': 'أنهى {name} {title}',
  '{name} finished the list': 'أنهى {name} القائمة',
  'Everything on it is ticked.': 'كل ما فيها مُنجز.',
  '{name} settled up': 'سُدِّدت حصة {name}',
  '{amount} of {title}.': '{amount} من {title}.',
  'the split': 'التقسيم',
  'Their share of {title}.': 'الحصة من {title}.',
  '{name} added {n} photos to {album}': {
    zero: 'لم يضف {name} صورًا إلى {album}',
    one: 'أضاف {name} صورة إلى {album}',
    two: 'أضاف {name} صورتين إلى {album}',
    few: 'أضاف {name} {n} صور إلى {album}',
    many: 'أضاف {name} {n} صورة إلى {album}',
    other: 'أضاف {name} {n} صورة إلى {album}',
  },
  '{name} is calling {where}': '{name} يتصل {where}',
  'No reply from {name} yet': 'لا رد من {name} بعد',
  'Follow up on “{text}”?': 'متابعة بشأن «{text}»؟',
  'Follow up?': 'متابعة؟',
  Reminder: 'تذكير',
  Call: 'مكالمة',
  Answered: 'تم الرد',
  '{title} call': 'مكالمة {title}',
  Joined: 'انضممت',
  'Turned down': 'تم الرفض',
  'the same name': 'الاسم نفسه',
  'one name is part of the other': 'أحد الاسمين جزء من الآخر',
  'the same nickname': 'الاسم المستعار نفسه',
  'you know both from {org}': 'تعرف كليهما من {org}',
  '{name} may have two accounts': 'قد يكون لدى {name} حسابان',
  '{merge} and {keep} may be the same person': 'قد يكون {merge} و{keep} الشخص نفسه',
  'Both have {reasons}. Merged, they show as one in People; both accounts and conversations stay, and you can separate them again.':
    'لكليهما {reasons}. بعد الدمج يظهران كشخص واحد في الأشخاص؛ ويبقى الحسابان والمحادثات، ويمكنك فصلهما من جديد.',
  ', and ': '، و',
  '“{topic}” keeps coming up here. A separate topic keeps it together.':
    'يتكرر ذكر «{topic}» هنا. موضوع مستقل يجمع ما يخصه في مكان واحد.',
  'Colleague · {org}': 'زميل · {org}',
  'You and {other} are both on {org}’s team, and {org} is verified.':
    'أنت و{other} في فريق {org}، و{org} موثّقة.',
  'You and {other} are both on {org}’s team in Caime.': 'أنت و{other} في فريق {org} على Caime.',
  'You and {other} are both in {space}, a {kind} space.':
    'أنت و{other} في {space}، وهي مساحة {kind}.',
  them: 'هذا الشخص',
  '{name} described how you know each other as {label}{where}.':
    'وصف {name} صلتكما بأنها {label}{where}.',
  'You both use @{domain} email addresses.': 'تستخدمان كلاكما عناوين بريد @{domain}.',
  '{speaker} wrote {quote}': 'كتب {speaker} {quote}',
  '{n} messages this week.': {
    zero: 'لا رسائل هذا الأسبوع.',
    one: 'رسالة واحدة هذا الأسبوع.',
    two: 'رسالتان هذا الأسبوع.',
    few: '{n} رسائل هذا الأسبوع.',
    many: '{n} رسالة هذا الأسبوع.',
    other: '{n} رسالة هذا الأسبوع.',
  },
  'Quiet this week.': 'لا جديد هذا الأسبوع.',
  '{n} open for you.': {
    zero: 'لا شيء مفتوح لك.',
    one: 'أمر واحد مفتوح لك.',
    two: 'أمران مفتوحان لك.',
    few: '{n} أمور مفتوحة لك.',
    many: '{n} أمرًا مفتوحًا لك.',
    other: '{n} أمر مفتوح لك.',
  },
  'Waiting on {n}.': 'في انتظار {n}.',
  'Last decision: {title}.': 'آخر قرار: {title}.',
  'Next date: {date}.': 'الموعد القادم: {date}.',
  'Cai can’t help with this one.': 'لا يستطيع Cai المساعدة في هذا.',
  'AI assist is busy. Try again in a moment.': 'مساعد الذكاء الاصطناعي مشغول. حاول مجددًا بعد قليل.',
  'AI assist didn’t work this time. Try again.':
    'لم يعمل مساعد الذكاء الاصطناعي هذه المرة. حاول مجددًا.',

  'Webhooks go to https addresses.': 'لا تُرسل الويب هوك إلا إلى عناوين https.',
  'That address is on a private network.': 'ذلك العنوان على شبكة خاصة.',
  '{plan} can’t be bought right now.': 'لا يمكن شراء {plan} الآن.',
  '{lead}: Stripe said “{message}”.': '{lead}: قال Stripe «{message}».',
  '{plan} is part of this plan already.': '{plan} جزء من هذه الخطة بالفعل.',
  '{plan} is on already: change it from Manage billing.':
    '{plan} مفعّلة بالفعل: غيّرها من إدارة الفوترة.',
  'There’s nothing paid for here yet.': 'لا شيء مدفوع هنا بعد.',
  'You can’t message this person.': 'لا يمكنك مراسلة هذا الشخص.',
  'You blocked {orgName}. Unblock it to write to it again.':
    'حظرت {orgName}. ألغِ الحظر لتكتب إليها مجددًا.',
  'This device isn’t set up for private conversations: sign in again to write here.':
    'هذا الجهاز غير مهيأ للمحادثات الخاصة: سجّل الدخول مجددًا لتكتب هنا.',
  'Someone’s devices changed since this was sealed.': 'تغيّرت أجهزة أحدهم منذ ختم هذه الرسالة.',
  'Sign in to continue.': 'سجّل الدخول للمتابعة.',
  'You can’t do that here.': 'لا يمكنك فعل ذلك هنا.',
  That: 'ذلك',
  '{what} wasn’t found.': 'لم يُعثر على {what}.',
  'Too many requests. Try again in a moment.': 'طلبات كثيرة جدًا. حاول مجددًا بعد قليل.',
  'Caime can’t send email here yet. Use a recovery code instead, or ask whoever runs it.':
    'لا يستطيع Caime إرسال بريد إلكتروني هنا بعد. استخدم رمز استعادة بدلًا من ذلك، أو اسأل من يديره.',
  'It belongs to {name}, which closed. If you’re {name}, verify {domain} to take it back.':
    'يعود إلى {name}، وقد أُغلقت. إن كنت تمثّل {name}، فوثّق {domain} لاستعادته.',
  'That invite': 'تلك الدعوة',
  'That’s your own invite.': 'هذه دعوتك أنت.',
  'You can’t connect with this person.': 'لا يمكنك التواصل مع هذا الشخص.',
  'An organization’s own cards are for conversations with it.':
    'بطاقات المؤسسة الخاصة لا تُستخدم إلا في المحادثات معها.',
  'Only the organization sends its cards.': 'المؤسسة وحدها ترسل بطاقاتها.',
  'This app needs the “kits” permission for that.': 'يحتاج هذا التطبيق إلى إذن «kits» لذلك.',
  'Say which app’s card, and which of its cards.': 'حدّد بطاقة أي تطبيق، وأي بطاقة من بطاقاته.',
  'An app sends only its own cards.': 'لا يرسل التطبيق إلا بطاقاته.',
  'That card isn’t available here.': 'تلك البطاقة غير متاحة هنا.',
  '{name} cards aren’t available in this conversation.': 'بطاقات {name} غير متاحة في هذه المحادثة.',
  'That person': 'ذلك الشخص',
  '{name} only takes messages from people they know. Send a connection request instead.':
    'رسائل {name} مقصورة على المعارف. أرسل طلب تواصل بدلًا من ذلك.',
  'That clientId was already used.': 'استُخدم clientId هذا من قبل.',
  'That conversation': 'تلك المحادثة',
  'Only admins can post here.': 'المشرفون وحدهم ينشرون هنا.',
  'Only a person, on their own device, writes in a private conversation.':
    'لا يكتب في المحادثة الخاصة إلا شخص حقيقي، من جهازه الخاص.',
  'Messages in a private conversation are text, sealed on your device.':
    'الرسائل في المحادثة الخاصة نصية فقط، وتُختم على جهازك.',

  'Only private conversations take sealed messages.':
    'المحادثات الخاصة وحدها تقبل الرسائل المختومة.',
  'This organization closed, so nothing more is written here. Find it again to start a new conversation.':
    'أُغلقت هذه المؤسسة، فلا يُكتب هنا شيء بعد الآن. ابحث عنها مجددًا لبدء محادثة جديدة.',
  'You can send more once they accept your message request.':
    'يمكنك إرسال المزيد حين يُقبل طلب المراسلة.',
  'You can only reply to a message in this conversation.':
    'لا يمكنك الرد إلا على رسالة في هذه المحادثة.',
  'One of the attachments isn’t available.': 'أحد المرفقات غير متاح.',
  'Sharing a location is for people over 18.': 'مشاركة الموقع لمن تجاوزوا 18 عامًا.',
  '{name} cards are for one-to-one conversations.': 'بطاقات {name} للمحادثات الثنائية.',
  '{name} cards aren’t for conversations with an organization.':
    'بطاقات {name} ليست للمحادثات مع مؤسسة.',
  'There’s nobody here to split it with.': 'لا أحد هنا لتتقاسمه معه.',
  'Live location is for people you know, not organizations.':
    'الموقع المباشر لمن تعرفهم، لا للمؤسسات.',
  'That organization': 'تلك المؤسسة',
  'You’ve used today’s {aiPerDay} AI assists.{ready}{more}':
    'استنفدت مساعدات الذكاء الاصطناعي لهذا اليوم ({aiPerDay}).{ready}{more}',
  'The next one is ready {when}.': ' تتوفر التالية {when}.',
  '{plan} includes {n} a day.': ' تتضمن {plan} {n} يوميًا.',
  '{plan} includes {bytes}.': ' تتضمن {plan} {bytes}.',
  'That’s more than the {allowed} of files your plan includes ({used} used).{more}':
    'هذا يتجاوز مساحة الملفات في خطتك ({allowed}، استُخدم منها {used}).{more}',
  '{plan} has room for {n}.': ' تتسع {plan} لـ {n}.',
  '{name}’s {plan} plan has room for {room} people on the team.{more}':
    'تتسع خطة {plan} لدى {name} لـ {room} من أعضاء الفريق.{more}',
  '{plan} includes {n}.': ' تتضمن {plan} {n}.',
  '{org}’s {plan} plan includes {apps}.{more}': 'تتضمن خطة {plan} لدى {org} {apps}.{more}',
  'The next can start {when}.': ' يمكن بدء التالية {when}.',
  '{name} has started today’s {startsPerDay} new conversations.{ready}{more}':
    'بلغت {name} حدّ اليوم من المحادثات الجديدة ({startsPerDay}).{ready}{more}',
  'Insights come with Business: how fast {name}’s team answers, how many customers write, and what’s still open.':
    'الرؤى تأتي مع Business: سرعة رد فريق {name}، وعدد العملاء الذين يكتبون، وما لا يزال مفتوحًا.',
  'Relationship insights come with {pro}: who you write with most, who’s gone quiet, how fast you answer and are answered, and when you write.':
    'رؤى العلاقات تأتي مع {pro}: من تراسل أكثر، ومن انقطع عن الكتابة، وسرعة ردك والرد عليك، ومتى تكتب.',
  '{plan} keeps {n}.': ' تحتفظ {plan} بـ {n}.',
  '{plan} keeps {most} automations. Remove one to add another.{more}':
    'تتسع {plan} لـ {most} من قواعد الأتمتة. أزل واحدة لتضيف أخرى.{more}',
  'That space': 'تلك المساحة',
  'That recording is too long to transcribe.': 'ذلك التسجيل أطول من أن يُفرَّغ.',
  'Invalid request.': 'طلب غير صالح.',
  'Your account': 'حسابك',
  'That password isn’t right.': 'كلمة المرور تلك غير صحيحة.',
  'A message is linked with its conversation.': 'تُربط الرسالة بمحادثتها.',
  'That message': 'تلك الرسالة',
  'That context': 'ذلك السياق',
  'That task': 'تلك المهمة',
  'You can’t assign this person.': 'لا يمكنك إسناد هذا الشخص.',
  'You can ask people you’re connected with.': 'يمكنك الطلب فقط ممن بينك وبينهم تواصل.',
  'A request goes to someone else.': 'يُوجَّه الطلب إلى شخص غيرك.',
  'Requests between a customer and an organization aren’t available yet.':
    'الطلبات بين عميل ومؤسسة غير متاحة بعد.',
  'Only the person who asked can change this.': 'لا يغيّر هذا إلا من طلبه.',
  'Only the person asked can accept or decline.': 'لا يقبل أو يرفض إلا من وُجِّه إليه الطلب.',
  'Only the person who asked can cancel.': 'لا يلغيه إلا من طلبه.',
  'Only the person who created this can delete it.': 'لا يحذفه إلا من أنشأه.',
  'That decision': 'ذلك القرار',
  'Only whoever recorded it, or the group’s admins, change a decision.':
    'لا يغيّر القرار إلا من سجّله، أو مشرفو المجموعة.',
  '{plan} is paid for through Stripe: cancel it there (at once, or at the end of what’s paid), and the plan follows.':
    '{plan} مدفوعة عبر Stripe: ألغِها هناك (فورًا، أو عند انتهاء ما دُفع)، وتتبعها الخطة.',
  'That report': 'ذلك البلاغ',
  'This report isn’t about a message.': 'هذا البلاغ ليس عن رسالة.',
  'Lines about the conversation stay.': 'السطور عن المحادثة تبقى.',
  'This report isn’t about an update.': 'هذا البلاغ ليس عن تحديث.',
  'This report isn’t about a person.': 'هذا البلاغ ليس عن شخص.',
  'Another instance is backing up right now.': 'نسخة أخرى من الخادم تجري نسخًا احتياطيًا الآن.',
  'That handle isn’t reserved or held: whoever wants it can take it themselves.':
    'ذلك المعرّف ليس محجوزًا ولا معلَّقًا: يمكن لمن يريده أن يأخذه بنفسه.',
  'Someone else has that handle.': 'ذلك المعرّف لشخص آخر.',
  'Only a closed organization is deleted.': 'لا تُحذف إلا مؤسسة مغلقة.',
  'Only the organization’s owner and admins can.': 'لا يستطيع ذلك إلا مالك المؤسسة ومشرفوها.',
  'AI isn’t available on this Caime server.': 'الذكاء الاصطناعي غير متاح على خادم Caime هذا.',
  'That organization’s AI agent': 'وكيل الذكاء الاصطناعي لتلك المؤسسة',
  'It didn’t answer this time. Try again.': 'لم يجب هذه المرة. حاول مجددًا.',
  'AI assist isn’t set up on this server.': 'مساعد الذكاء الاصطناعي غير مهيأ على هذا الخادم.',
  'AI assist is for adults for now.': 'مساعد الذكاء الاصطناعي للبالغين حاليًا.',
  'Turn on AI assist in Settings to use it.': 'فعّل مساعد الذكاء الاصطناعي من الإعدادات لاستخدامه.',
  'This conversation is private, so AI assist can’t read it.':
    'هذه المحادثة خاصة، فلا يستطيع مساعد الذكاء الاصطناعي قراءتها.',
  'That app': 'ذلك التطبيق',
  'This route is for an app’s token.': 'هذا المسار مخصص لرموز التطبيقات.',
  'A failed delivery of this app by that id': 'عملية تسليم فاشلة لهذا التطبيق بذلك المعرّف',
  'A webhook address for that app': 'عنوان ويب هوك لذلك التطبيق',
  'You need to be at least {MINIMUM_AGE} to use Caime.':
    'يجب أن يكون عمرك {MINIMUM_AGE} عامًا على الأقل لاستخدام Caime.',
  'That email already has an account. Sign in instead?':
    'لهذا البريد الإلكتروني حساب بالفعل. هل تريد تسجيل الدخول بدلًا من ذلك؟',
  'That email or handle and password don’t match.':
    'البريد الإلكتروني أو المعرّف وكلمة المرور غير متطابقين.',
  'That session': 'تلك الجلسة',
  'Your current password isn’t right.': 'كلمة مرورك الحالية غير صحيحة.',
  'Your password isn’t right.': 'كلمة مرورك غير صحيحة.',
  'This address is confirmed.': 'هذا العنوان مؤكَّد.',
  'That code isn’t right. Check the email again.':
    'ذلك الرمز غير صحيح. راجع البريد الإلكتروني مجددًا.',
  'That code has run out. Send a new one.': 'انتهت صلاحية ذلك الرمز. أرسل رمزًا جديدًا.',
  'Too many tries with that code. Send a new one.':
    'محاولات كثيرة جدًا بذلك الرمز. أرسل رمزًا جديدًا.',
  'That link has been used or has run out. Ask for a new one.':
    'ذلك الرابط استُخدم أو انتهت صلاحيته. اطلب رابطًا جديدًا.',
  'That recovery code doesn’t match this account.': 'رمز الاستعادة ذلك لا يطابق هذا الحساب.',
  'That automation': 'تلك الأتمتة',
  'A private conversation keeps to itself: nothing in it is saved elsewhere.':
    'ما في المحادثة الخاصة يبقى فيها: لا يُحفظ شيء منها في مكان آخر.',
  'Accept the message request to save anything from it.': 'اقبل طلب المراسلة لتحفظ شيئًا منه.',
  'A line about the conversation isn’t saved.': 'السطر عن المحادثة لا يُحفظ.',
  'That file': 'ذلك الملف',
  'You’ve saved {SAVED_MAX} things, the most there’s room for. Remove some to save more.':
    'بلغت الحد الأقصى للمحفوظات ({SAVED_MAX}). أزل بعضها لتحفظ المزيد.',
  'That saved item': 'ذلك العنصر المحفوظ',
  'An automation saves to {collection}. Change it or remove it first.':
    'هناك قاعدة أتمتة تحفظ في {collection}. عدّلها أو أزلها أولًا.',
  'Plans are bought by someone 18 or over.': 'لا يشتري الخطط إلا من بلغ 18 عامًا فأكثر.',
  'Only the organization’s owner and admins can change what it pays.':
    'لا يغيّر ما تدفعه المؤسسة إلا مالكها ومشرفوها.',
  'That isn’t from Stripe.': 'هذا ليس من Stripe.',
  'That isn’t an event.': 'هذا ليس حدثًا.',
  'You’re on its team. Leave the team instead.': 'أنت في فريقها. غادر الفريق بدلًا من ذلك.',
  'You’re on its team: its conversations are in its inbox.':
    'أنت في فريقها: محادثاتها في صندوق واردها.',
  'Under 18, you can message organizations that have verified who they are. {name} hasn’t yet.':
    'لأنك دون 18 عامًا، يمكنك مراسلة المؤسسات الموثّقة فقط، و{name} لم توثَّق بعد.',
  'You blocked {name}. Unblock it to write to it again.':
    'حظرت {name}. ألغِ الحظر لتكتب إليها مجددًا.',
  'A person on the team writes first; an app answers customers.':
    'شخص من الفريق يكتب أولًا؛ أما التطبيق فيرد على العملاء.',
  'Nobody by that handle can hear from {name}.': 'لا أحد بهذا المعرّف يمكن لـ {name} مراسلته.',
  'They’re on the team: write to them directly.': 'هذا الشخص في الفريق: اكتب إليه مباشرة.',
  'Verify {name}’s domain first: only a verified organization writes to someone first.':
    'وثّق نطاق {name} أولًا: لا تبادر بالكتابة إلا المؤسسة الموثّقة.',
  '{name} only takes messages from people they know.': 'رسائل {name} مقصورة على المعارف.',
  'They aren’t on the team.': 'هذا الشخص ليس في الفريق.',
  'That’s the AI agent: give it to a person.': 'هذا وكيل الذكاء الاصطناعي: أسندها إلى شخص.',
  'That’s an app’s bot: give it to a person.': 'هذا بوت تطبيق: أسندها إلى شخص.',
  'It’s already resolved.': 'محلولة بالفعل.',
  'It’s open already.': 'مفتوحة بالفعل.',
  'Reopen it first.': 'أعد فتحها أولًا.',
  'Ask for up to a year, from one instant to a later one.': 'اطلب حتى سنة، من لحظة إلى لحظة لاحقة.',
  'That calendar': 'ذلك التقويم',
  'That call': 'تلك المكالمة',
  'That call has ended.': 'انتهت تلك المكالمة.',
  'Calls are for conversations between two people.': 'المكالمات للمحادثات بين شخصين.',
  'There’s nobody to call here.': 'لا أحد هنا للاتصال به.',
  'You can call once your message request is accepted.': 'يمكنك الاتصال حين يُقبل طلب المراسلة.',
  'You can’t call this person.': 'لا يمكنك الاتصال بهذا الشخص.',
  '{name} is on another call.': '{name} في مكالمة أخرى.',
  'Only the person called can answer.': 'لا يرد على المكالمة إلا من اتُّصل به.',
  'Only the person called can decline.': 'لا يرفض المكالمة إلا من اتُّصل به.',
  'This device isn’t in that call.': 'هذا الجهاز ليس في تلك المكالمة.',
  'That’s you.': 'هذا أنت.',
  'You’re already connected.': 'أنتما على تواصل بالفعل.',
  'Your request is waiting for them.': 'طلبك بانتظار الرد.',
  '{name} isn’t accepting requests from people they don’t know yet.':
    'لا تُقبل طلبات التواصل مع {name} من غير المعارف حاليًا.',
  'You can send another request later.': 'يمكنك إرسال طلب آخر لاحقًا.',
  'Choose one of your identities.': 'اختر إحدى هوياتك.',
  'That request': 'ذلك الطلب',
  'That connection': 'ذلك التواصل',
  'That merged connection': 'ذلك التواصل المدمج',
  'A private group holds up to {PRIVATE_GROUP_MAX} people: each message is sealed for every device in it.':
    'تتسع المجموعة الخاصة لـ {PRIVATE_GROUP_MAX} شخصًا على الأكثر: كل رسالة تُختم لكل جهاز فيها.',
  'A topic’s people are its group’s: add, remove or make admins there.':
    'أعضاء الموضوع هم أعضاء مجموعته: أضف أو أزل أو عيّن مشرفين هناك.',
  'Topics are for conversations between people.': 'الموضوعات للمحادثات بين الأشخاص.',
  'Connect first to start topics.': 'تواصل أولًا لتبدأ موضوعات.',
  'A private conversation keeps to itself: start a topic from your main one.':
    'ما في المحادثة الخاصة يبقى فيها: ابدأ الموضوع من محادثتكما الرئيسية.',
  'Topics branch off a one-to-one, a group, or a space’s General.':
    'الموضوعات تتفرع من محادثة ثنائية أو مجموعة أو المحادثة العامة لمساحة.',
  'Connect first to start a private conversation.': 'تواصل أولًا لتبدأ محادثة خاصة.',
  'You can add people you’re connected with.': 'يمكنك إضافة من أنت على تواصل معهم.',
  'Drafts in a private conversation stay on your device.':
    'المسودات في محادثة خاصة تبقى على جهازك.',
  'Only admins can change this.': 'المشرفون وحدهم يغيّرون هذا.',
  'A topic’s messages disappear as its group’s do: change it there.':
    'رسائل الموضوع تختفي كما تختفي رسائل مجموعته: غيّر ذلك هناك.',
  'Only someone who may change that context links it here.':
    'لا يربط ذلك السياق هنا إلا من يحق له تغييره.',
  'The general conversation takes the person’s name.': 'المحادثة العامة تأخذ اسم الشخص.',
  'General takes the space’s name. Rename the space instead.':
    'المحادثة العامة تأخذ اسم المساحة. أعد تسمية المساحة بدلًا من ذلك.',
  'There’s no request to answer here.': 'لا طلب هنا للرد عليه.',
  'Start a group to add people.': 'ابدأ مجموعة لتضيف أشخاصًا.',
  'Its team is the organization’s: add people to the team instead.':
    'فريقها هو فريق المؤسسة: أضف الأشخاص إلى الفريق بدلًا من ذلك.',
  'Only admins can add people.': 'المشرفون وحدهم يضيفون أشخاصًا.',
  'Add people to the space instead.': 'أضف الأشخاص إلى المساحة بدلًا من ذلك.',
  'Add them to the space first.': 'أضف هذا الشخص إلى المساحة أولًا.',
  'You can archive this conversation instead.': 'يمكنك أرشفة هذه المحادثة بدلًا من ذلك.',
  'Leave the group to leave its topics. You can archive this one.':
    'غادر المجموعة لتغادر موضوعاتها. يمكنك أرشفة هذا الموضوع.',
  'Leave the space to leave its General conversation.': 'غادر المساحة لتغادر محادثتها العامة.',
  'Remove them from the space instead.': 'أزل هذا الشخص من المساحة بدلًا من ذلك.',
  'That person in this conversation': 'ذلك الشخص في هذه المحادثة',
  'Admins remove members; the owner removes admins.':
    'المشرفون يزيلون الأعضاء؛ والمالك يزيل المشرفين.',
  'Only admins can remove people.': 'المشرفون وحدهم يزيلون أشخاصًا.',
  'Only a group has admins.': 'المجموعة وحدها لها مشرفون.',
  'Make them an admin of the space instead.': 'عيّن هذا الشخص مشرفًا على المساحة بدلًا من ذلك.',
  'Only the owner makes admins.': 'المالك وحده يعيّن المشرفين.',
  'You can only edit your own messages.': 'لا يمكنك أن تعدّل إلا رسائلك.',
  'That message was deleted.': 'حُذفت تلك الرسالة.',
  'Only text messages can be edited.': 'الرسائل النصية وحدها قابلة للتعديل.',
  'That isn’t a card that can change.': 'تلك ليست بطاقة قابلة للتغيير.',
  'An app moves only its own cards.': 'لا يحرّك التطبيق إلا بطاقاته.',
  'You can’t make that change to this card.': 'لا يمكنك إجراء ذلك التغيير على هذه البطاقة.',
  'Someone just changed this card.': 'غيّر أحدهم هذه البطاقة للتو.',
  'That isn’t a live location.': 'هذا ليس موقعًا مباشرًا.',
  'Only whoever is sharing it can change it.': 'من يشاركه وحده يغيّره.',
  'This live location has ended.': 'انتهى هذا الموقع المباشر.',
  'That isn’t a checklist.': 'هذه ليست قائمة تحقق.',
  'That isn’t a split.': 'هذا ليس تقسيمًا.',
  'That album': 'ذلك الألبوم',
  'This album is closed.': 'هذا الألبوم مغلق.',
  'Add photos you’ve uploaded.': 'أضف صورًا رفعتها.',
  'Albums take photos and videos.': 'الألبومات تقبل الصور ومقاطع الفيديو.',
  'An album holds {ALBUM_MAX} photos.': 'يتسع الألبوم لـ {ALBUM_MAX} صورة.',
  'That photo': 'تلك الصورة',
  'Only whoever added it, or made the album, can take it out.':
    'لا يزيلها إلا من أضافها، أو من أنشأ الألبوم.',
  'Lines about the conversation stay. You can delete it for yourself.':
    'السطور عن المحادثة تبقى. يمكنك حذفه لنفسك.',
  'You can delete your own messages.': 'يمكنك حذف رسائلك أنت.',
  'Pinned messages are for conversations between people.': 'الرسائل المثبّتة للمحادثات بين الأشخاص.',
  'Only the group’s owner and admins pin messages.': 'مالك المجموعة ومشرفوها وحدهم يثبّتون الرسائل.',
  'Messages are pinned once the message request is answered.':
    'تُثبّت الرسائل بعد الرد على طلب المراسلة.',
  'Lines about the conversation aren’t pinned.': 'السطور عن المحادثة لا تُثبّت.',
  '{PINNED_MAX} messages are pinned already, including {n} you deleted for yourself. Unpin one first.':
    {
      zero: 'ثُبّتت {PINNED_MAX} رسائل بالفعل. ألغِ تثبيت إحداها أولًا.',
      one: 'ثُبّتت {PINNED_MAX} رسائل بالفعل، منها واحدة حذفتها لنفسك. ألغِ تثبيت إحداها أولًا.',
      two: 'ثُبّتت {PINNED_MAX} رسائل بالفعل، منها اثنتان حذفتهما لنفسك. ألغِ تثبيت إحداها أولًا.',
      few: 'ثُبّتت {PINNED_MAX} رسائل بالفعل، منها {n} حذفتها لنفسك. ألغِ تثبيت إحداها أولًا.',
      many: 'ثُبّتت {PINNED_MAX} رسائل بالفعل، منها {n} حذفتها لنفسك. ألغِ تثبيت إحداها أولًا.',
      other: 'ثُبّتت {PINNED_MAX} رسائل بالفعل، منها {n} حذفتها لنفسك. ألغِ تثبيت إحداها أولًا.',
    },
  '{PINNED_MAX} messages are pinned already. Unpin one first.':
    'ثُبّتت {PINNED_MAX} رسائل بالفعل. ألغِ تثبيت إحداها أولًا.',
  'That poll': 'ذلك الاستطلاع',
  'That option isn’t in the poll.': 'ذلك الخيار ليس في الاستطلاع.',
  'Choose one option.': 'اختر خيارًا واحدًا.',
  'Messages in a private conversation stay in it.': 'رسائل المحادثة الخاصة تبقى فيها.',
  'Cards, polls and live locations stay where they were shared.':
    'البطاقات والاستطلاعات والمواقع المباشرة تبقى حيث نُشرت.',
  'Nothing is forwarded into a private conversation.': 'لا يُعاد توجيه شيء إلى محادثة خاصة.',
  'Only a device signed in to Caime reads private conversations.':
    'لا يقرأ المحادثات الخاصة إلا جهاز مسجّل الدخول إلى Caime.',
  'This device can’t pick up where it left off: it registers afresh.':
    'لا يستطيع هذا الجهاز المتابعة من حيث توقف: يُسجَّل من جديد.',
  'That device': 'ذلك الجهاز',
  'Private conversations open on up to {MAX_DEVICES} devices: remove one in Settings first.':
    'تُفتح المحادثات الخاصة على عدد محدود من الأجهزة ({MAX_DEVICES}): أزل جهازًا من الإعدادات أولًا.',
  'That device is registered already.': 'ذلك الجهاز مسجّل بالفعل.',
  'Approve it from a device that reads your private conversations already: this one doesn’t yet.':
    'وافق عليه من جهاز يقرأ محادثاتك الخاصة بالفعل: هذا الجهاز لا يقرأها بعد.',
  'That key was used already.': 'استُخدم ذلك المفتاح من قبل.',
  'A recovery key for your account': 'مفتاح استعادة لحسابك',
  'Only private conversations are sealed.': 'المحادثات الخاصة وحدها مختومة.',
  'That photo couldn’t be read, so it wasn’t sent. Try another.':
    'تعذّرت قراءة تلك الصورة، فلم تُرسل. جرّب صورة أخرى.',

  'That file is over 100 MB.': 'ذلك الملف أكبر من 100 ميغابايت.',
  'That upload': 'ذلك الرفع',
  'This upload is already complete.': 'اكتمل هذا الرفع بالفعل.',
  'Resume from the server’s offset.': 'استأنف من موضع الخادم.',
  'More bytes than declared.': 'عدد البايتات أكبر مما أُعلن.',
  'That thumbnail': 'تلك الصورة المصغّرة',
  'That logo': 'ذلك الشعار',
  'That avatar': 'تلك الصورة الشخصية',
  'There’s a call on here already: join it.': 'ثمة مكالمة جارية هنا بالفعل: انضم إليها.',
  'Group calls are for group conversations.': 'المكالمات الجماعية لمحادثات المجموعات.',
  'You can call once you’ve joined the conversation.': 'يمكنك الاتصال بعد الانضمام إلى المحادثة.',
  'Calls are for groups of up to {GROUP_CALL_MAX} people.':
    'المكالمات لمجموعات من {GROUP_CALL_MAX} أشخاص على الأكثر.',
  'You can join once you’ve joined the conversation.': 'يمكنك الانضمام بعد الانضمام إلى المحادثة.',
  'This call is full.': 'هذه المكالمة ممتلئة.',
  'You can’t join this call.': 'لا يمكنك الانضمام إلى هذه المكالمة.',
  'That handle': 'ذلك المعرّف',
  'Connect first to bring a chat over.': 'تواصل أولًا لتنقل محادثة إلى هنا.',
  'Only an app’s token does this.': 'رمز تطبيق وحده يفعل هذا.',
  'An app has up to {perApp} kinds of card. Remove one to make another.':
    'يتسع التطبيق لـ {perApp} من أنواع البطاقات على الأكثر. أزل نوعًا لتنشئ آخر.',
  'That kit': 'تلك البطاقة',
  'That isn’t one of an app’s cards.': 'تلك ليست من بطاقات تطبيق.',
  'An app changes only its own cards.': 'لا يغيّر التطبيق إلا بطاقاته.',
  'Choose a time zone from the list.': 'اختر منطقة زمنية من القائمة.',
  'Choose an image you uploaded.': 'اختر صورة رفعتها.',
  'You can have up to 10 identities.': 'يمكنك إنشاء 10 هويات على الأكثر.',
  'That identity': 'تلك الهوية',
  'Make another identity your default first.': 'اجعل هوية أخرى هويتك الافتراضية أولًا.',
  'Apps are made by people over 18.': 'التطبيقات يصنعها من تجاوزوا 18 عامًا.',
  'You have {MAX_APPS} apps. Remove one first.':
    'بلغت الحد الأقصى للتطبيقات ({MAX_APPS}). أزل واحدًا أولًا.',
  'That app isn’t registered with Caime.': 'ذلك التطبيق غير مسجّل لدى Caime.',
  'That app didn’t register this return address.': 'لم يسجّل ذلك التطبيق عنوان العودة هذا.',
  'The app didn’t say what it wants to do.': 'لم يقل التطبيق ما يريد فعله.',
  '“{unknown}” isn’t something an app can ask for.': '«{unknown}» ليس مما يمكن لتطبيق طلبه.',
  'This export is too large to make here. Write to Caime and it will be made for you.':
    'هذا التصدير أكبر من أن يُجهَّز هنا. راسل Caime وسنجهّزه لك.',
  'Only the owner sets how long conversations are kept.':
    'المالك وحده يحدد مدة الاحتفاظ بالمحادثات.',
  'You’re in it already.': 'أنت فيها بالفعل.',
  'Teams are for people over 18.': 'الفرق لمن تجاوزوا 18 عامًا.',
  'That person on the team': 'ذلك الشخص في الفريق',
  'That’s an app’s bot: remove the app instead.': 'هذا بوت تطبيق: أزل التطبيق بدلًا من ذلك.',
  'Admins remove the team; the owner removes admins.':
    'المشرفون يزيلون أعضاء الفريق؛ والمالك يزيل المشرفين.',
  'Only the organization’s owner and admins remove people.':
    'مالك المؤسسة ومشرفوها وحدهم يزيلون أشخاصًا.',
  'That’s an app’s bot: change the app instead.': 'هذا بوت تطبيق: غيّر التطبيق بدلًا من ذلك.',
  'Enter a domain like datac.com.': 'أدخل نطاقًا مثل datac.com.',
  'Another organization has verified this domain.': 'وثّقت مؤسسة أخرى هذا النطاق.',
  'Add your domain first.': 'أضف نطاقك أولًا.',
  'We couldn’t find the record yet. DNS changes can take a few minutes, sometimes an hour.':
    'لم نجد السجل بعد. قد تستغرق تغييرات DNS بضع دقائق، وأحيانًا ساعة.',
  'Only the organization’s owner closes it.': 'مالك المؤسسة وحده يغلقها.',
  'This organization was never verified at a domain, so there’s no way to prove it’s yours.':
    'لم توثّق هذه المؤسسة أي نطاق قط، فلا سبيل لإثبات أنها لك.',
  'Start taking it back first.': 'ابدأ استعادتها أولًا.',
  'That rule': 'تلك القاعدة',
  'There’s a rule for them already: change that one.': 'هناك قاعدة لهذا الشخص بالفعل: عدّلها هي.',
  'Unknown sphere.': 'دائرة غير معروفة.',
  '“{role}” isn’t a {sphere} role. Use a custom role instead.':
    '«{role}» ليس دورًا في دائرة {sphere}. استخدم دورًا مخصصًا بدلًا من ذلك.',
  'Choose a role or write your own, not both.': 'اختر دورًا أو اكتب دورك، لا الاثنين معًا.',
  'That relationship': 'تلك العلاقة',
  'Connect with this person first.': 'تواصل مع هذا الشخص أولًا.',
  'Restore this relationship before changing it.': 'استعد هذه العلاقة قبل تغييرها.',
  'This relationship is {status}.': 'حالة هذه العلاقة: {status}.',
  'This kind of relationship doesn’t end. Archive it instead.':
    'هذا النوع من العلاقات لا ينتهي. أرشفه بدلًا من ذلك.',
  'Only an active relationship can be the main one.': 'العلاقة النشطة وحدها يمكن أن تكون الرئيسية.',
  'Merge relationships with the same person.': 'لا تُدمج إلا العلاقات مع الشخص نفسه.',
  'You can’t block yourself.': 'لا يمكنك حظر نفسك.',
  'Choose what you’re reporting.': 'اختر ما تبلّغ عنه.',
  'You can add people on the organization’s team, or people you’re connected with.':
    'يمكنك إضافة أعضاء فريق المؤسسة، أو من أنت على تواصل معهم.',
  'Only the organization’s owner and admins start its spaces.':
    'مالك المؤسسة ومشرفوها وحدهم يبدؤون مساحاتها.',
  'Only the space’s owner and admins can.': 'مالك المساحة ومشرفوها وحدهم يستطيعون.',
  'Only the space’s owner and admins add people.': 'مالك المساحة ومشرفوها وحدهم يضيفون أشخاصًا.',
  'That person in this space': 'ذلك الشخص في هذه المساحة',
  'Admins can remove members; the owner removes admins.':
    'المشرفون يزيلون الأعضاء؛ والمالك يزيل المشرفين.',
  'Only the space’s owner and admins remove people.': 'مالك المساحة ومشرفوها وحدهم يزيلون أشخاصًا.',
  'Only the space’s owner makes people admins.': 'مالك المساحة وحده يعيّن المشرفين.',
  'That suggestion': 'ذلك الاقتراح',
  'This step can’t be taken back here.': 'لا يمكن التراجع عن هذه الخطوة هنا.',
  'That step was changed since: it stays.': 'تغيّرت تلك الخطوة منذ ذلك الحين: تبقى.',
  'Keep one of the two.': 'احتفظ بواحد من الاثنين.',
  'You aren’t connected with both of them any more.': 'لم تعد على تواصل مع كليهما.',
  'One of them is blocked: it can’t be merged.': 'أحدهما محظور: لا يمكن الدمج.',
  'This suggestion is missing its person.': 'لا يحدد هذا الاقتراح الشخص المعني.',
  'This suggestion is missing its conversation.': 'لا يحدد هذا الاقتراح المحادثة المعنية.',
  'Accepting a {kind} suggestion isn’t supported yet.': 'قبول اقتراح من نوع {kind} غير مدعوم بعد.',
  'Access tokens are for people over 18.': 'رموز الوصول لمن تجاوزوا 18 عامًا.',
  'You have {MAX_TOKENS} tokens. Revoke one you don’t use first.':
    'بلغت الحد الأقصى للرموز ({MAX_TOKENS}). ألغِ أولًا رمزًا لا تستخدمه.',
  'That token': 'ذلك الرمز',
  'Only the organization’s owner and admins post its updates.':
    'مالك المؤسسة ومشرفوها وحدهم ينشرون تحديثاتها.',
  'That update is being posted already.': 'يجري نشر ذلك التحديث بالفعل.',
  'That update': 'ذلك التحديث',
  'You’ve blocked it. Unblock it to follow its updates.': 'حظرتها. ألغِ الحظر لتتابع تحديثاتها.',
  'This account is suspended. If you think that’s wrong, write to whoever runs Caime.':
    'هذا الحساب موقوف. إن رأيت ذلك خطأ، فاكتب إلى من يدير Caime.',
  'Missing X-Caime-Client header.': 'ترويسة X-Caime-Client ناقصة.',
  'Someone else is signed in here now.': 'شخص آخر مسجّل الدخول هنا الآن.',
  'An app’s token can’t do this.': 'لا يستطيع رمز تطبيق فعل هذا.',
  'This app needs the “{scope}” permission for that.': 'يحتاج هذا التطبيق إلى إذن «{scope}» لذلك.',
  'A token can’t do this: sign in to Caime.': 'لا يمكن فعل هذا برمز وصول: سجّل الدخول إلى Caime.',
  'This token needs the “{scope}” permission for that.': 'يحتاج هذا الرمز إلى إذن «{scope}» لذلك.',

  // Bookings (R58)
  'Coming up: {title}': 'قريبًا: {title}',
  '{n} promises open': {
    zero: 'لا وعود مفتوحة',
    one: 'وعد واحد مفتوح',
    two: 'وعدان مفتوحان',
    few: '{n} وعود مفتوحة',
    many: '{n} وعدًا مفتوحًا',
    other: '{n} وعد مفتوح',
  },
  '{n} questions unanswered': {
    zero: 'لا أسئلة بلا جواب',
    one: 'سؤال واحد بلا جواب',
    two: 'سؤالان بلا جواب',
    few: '{n} أسئلة بلا جواب',
    many: '{n} سؤالًا بلا جواب',
    other: '{n} سؤال بلا جواب',
  },
  'That card': 'تلك البطاقة',
  'That isn’t something you can book here.': 'هذا ليس مما يمكنك حجزه هنا.',
  'Paid bookings are for people over 18.': 'الحجوزات المدفوعة لمن تجاوزوا 18 عامًا.',
  'Up to {n} in one booking.': 'حتى {n} في الحجز الواحد.',
  'They don’t do that one.': 'هذه الخدمة غير متاحة لديهم.',
  'That time has just been taken. Pick another.': 'حُجز هذا الوقت للتو. اختر وقتًا آخر.',
  'Your own bookings are yours to do.': 'حجوزاتك تقدّمها أنت بنفسك.',
  'An organization’s items are public or for its customers.': 'عناصر المؤسسة إما عامة أو لعملائها.',
  'Only people on the team can be providers.': 'لا يقدّم الخدمة إلا أعضاء الفريق.',
  'per day': 'في اليوم',
  'Only the team says who does a booking.': 'الفريق وحده يحدد من يقدّم الخدمة في الحجز.',
  'That isn’t a booking from the catalog.': 'هذا ليس حجزًا من القائمة.',

  // Orders from the catalog (R60)
  'Orders aren’t taken here.': 'لا تُستقبل الطلبات هنا.',
  'That isn’t something you can order here.': 'هذا ليس مما يمكنك طلبه هنا.',
  'Up to {n} of that in one order.': 'حتى {n} من هذا في الطلب الواحد.',
  'They don’t offer that way.': 'طريقة الاستلام هذه غير متاحة لديهم.',
  offers: 'يقدّم',
  collections: 'المجموعات',
  'Ways to be paid are for people over 18.': 'طرق الدفع لك متاحة لمن تجاوزوا 18 عامًا.',
  'In a group, ask to be paid; say you’re paying where it’s two of you.':
    'في المجموعة، اطلب أن يُدفع لك؛ أما في محادثة بين اثنين فقل إنك تدفع.',
  'pays by': 'الدفع عبر',
  '{name}, for {org}': '{name}، باسم {org}',
  'That isn’t a Pay card.': 'هذه ليست بطاقة دفع.',
  'This card isn’t paid by card.': 'هذه البطاقة لا تُدفع بالبطاقة المصرفية.',
  'Only whoever pays it pays by card, while it isn’t paid.':
    'الدفع بالبطاقة متاح لمن عليه الدفع فقط، ما دامت لم تُدفع بعد.',
  '{name} doesn’t take cards here any more.': 'لم تعد {name} تقبل الدفع بالبطاقة هنا.',
  'This card has no amount to pay by card.': 'لا يوجد في هذه البطاقة مبلغ يمكن دفعه بالبطاقة.',
  'Payment to {name}': 'دفعة إلى {name}',
  'Only the organization’s owner connects where its money goes.':
    'مالك المؤسسة وحده يحدد أين تذهب أموالها.',
  'Paying by card here': 'الدفع بالبطاقة هنا',
  'Payments are set by someone 18 or over.': 'يضبط المدفوعاتِ من بلغ 18 عامًا أو أكثر.',
  'Stripe can’t be asked right now': 'تعذّر التواصل مع Stripe الآن',
  'Only a person pays by card.': 'الدفع بالبطاقة لشخص فقط، لا لتطبيق.',
  'Paying by card can’t start right now': 'تعذّر بدء الدفع بالبطاقة الآن',
  'Send a sticker from the button beside an empty message box. The Caishy Friends pack is free.':
    'أرسل ملصقًا من الزر بجوار مربع الرسالة حين يكون فارغًا. حزمة أصدقاء كايشي مجانية.',
  'Press and hold a message, or point at it on a computer, to react, reply or save it.':
    'اضغط مطولًا على رسالة، أو مرّر المؤشر فوقها على الحاسوب، لتتفاعل معها أو تردّ عليها أو تحفظها.',
  'Your picture at the top opens you and your settings.': 'صورتك في الأعلى تفتح صفحتك وإعداداتك.',
  'Yay, you found me! I’m Momo. When nothing needs you, I’m the one cheering.':
    'رائع، وجدتني! أنا Momo. حين لا شيء يحتاج إليك، يحين وقت الاحتفال.',
  'When Attention says nothing needs you, that’s Caime working. Enjoy it!':
    'حين يقول «الاهتمام» إن لا شيء يحتاج إليك، فهذا Caime يؤدي عمله. استمتع بذلك!',
  'Mark something done in Actions, and whoever was waiting hears it.':
    'علّم أمرًا على أنه تمّ في «الإجراءات»، فيعلم به من كان ينتظره.',
  'Quiet hours keep your evenings yours: Settings, then Notifications.':
    'ساعات الهدوء تُبقي أمسياتك لك: الإعدادات، ثم الإشعارات.',
  'I’m Panda. I stay by your side while you wait for someone.':
    'أنا Panda. أبقى بجانبك وأنت تنتظر أحدًا.',
  'Ask someone for something, and it waits under “Waiting for” in Actions until they answer.':
    'اطلب شيئًا من أحد، فيبقى تحت «بانتظار» في «الإجراءات» حتى يأتي الرد.',
  'When a wait goes quiet for three days, Attention asks whether it’s still open.':
    'حين يمرّ على انتظارٍ ثلاثة أيام بلا جديد، يسأل «الاهتمام» إن كان لا يزال قائمًا.',
  'How you know someone can offer a follow-up when a question goes unanswered.':
    'طريقة معرفتك بشخص ما قد تقترح متابعة حين يبقى سؤال بلا رد.',
  'Hello, I’m Lumi! I love making new things: groups, topics and spaces.':
    'مرحبًا، أنا Lumi! أحب صنع أشياء جديدة: المجموعات والموضوعات والمساحات.',
  'A space gathers the people, conversations and plans of one project.':
    'تجمع المساحة أشخاص مشروع واحد ومحادثاته وخططه.',
  'A topic keeps one conversation about one thing, without starting over.':
    'يُبقي الموضوع محادثةً واحدة حول شيء واحد، دون البدء من جديد.',
  'The + in Chats starts a conversation, a group or a space.':
    'زر + في «الدردشات» يبدأ محادثة أو مجموعة أو مساحة.',
  'Hi! I’m Pico, and I’m curious about everything.': 'مرحبًا! أنا Pico، وكل شيء يثير فضولي.',
  'Search understands sentences, like “what did Alex ask me last week”.':
    'يفهم البحث الجمل، مثل «ماذا طلب مني أليكس الأسبوع الماضي».',
  'Search for someone’s name to find your conversations, files and promises with them.':
    'ابحث عن اسم شخص لتجد محادثاتكما وملفاتكما ووعودكما.',
  'Find people by their @handle in People.': 'اعثر على الأشخاص عبر @المعرّف في «الأشخاص».',
  'I’m Niko. First steps are my favourite thing!': 'أنا Niko. الخطوات الأولى أحبّ شيء إليّ!',
  'Connect with someone from People: their @handle, a link or a QR code.':
    'تواصل مع أحد من «الأشخاص»: عبر المعرّف أو رابط أو رمز QR.',
  'Tell Caime how you know someone. Only you see it, and it decides what reaches you when.':
    'أخبر Caime كيف تعرف كل شخص. لا يرى ذلك أحد سواك، وبه يتحدد ما يصلك ومتى.',
  'Say hi first. Most good conversations start that way.':
    'ابدأ بالتحية. معظم المحادثات الجيدة تبدأ هكذا.',
  'I’m Zuzu. I remember what was decided, so you don’t have to.':
    'أنا Zuzu. أتذكّر ما تقرّر، فلا داعي لأن تتذكّره أنت.',
  'What was decided and what’s still open in a conversation are in its details.':
    'ما تقرّر وما لا يزال مفتوحًا في محادثة تجده في تفاصيلها.',
  'Save a message to find it again in Saved.': 'احفظ رسالة لتجدها مجددًا في «المحفوظات».',
  'A person’s page remembers what’s open between the two of you.':
    'صفحة كل شخص تتذكّر ما هو مفتوح بينكما.',
  'Hi, I’m Caishy! Ask me anything about Caime, or just say hi.':
    'مرحبًا، أنا Caishy! اسألني أي شيء عن Caime، أو قل مرحبًا فقط.',
  'I welcome people to Caime and keep the Caishy Friends stickers. Ask me how anything here works.':
    'أرحّب بالجميع في Caime وأعتني بملصقات Caishy Friends. اسألني كيف يعمل أي شيء هنا.',
  'Aww, any time!': 'بكل سرور، في أي وقت!',
  'I cheer you on when you’re all caught up. Ask me what needs you, or what’s coming up.':
    'أحتفل معك حين لا يبقى شيء بانتظارك. اسألني ما الذي يحتاج إليك، أو ما القادم.',
  'Yay! Happy to help!': 'رائع! يسعدني أن أساعد!',
  'I keep an eye on what you’re waiting for from others. Ask me what you’re waiting on.':
    'أتابع ما تنتظره من الآخرين. اسألني ماذا تنتظر.',
  'Always here for you.': 'أنا هنا دائمًا من أجلك.',
  'I help you make things together: groups, topics and spaces. Ask me which one fits.':
    'أساعدك على صنع الأشياء مع الآخرين: المجموعات والموضوعات والمساحات. اسألني أيّها يناسب.',
  'My pleasure! Go make something lovely.': 'بكل سرور! هيا، اصنع شيئًا جميلًا.',
  'I know how to find things: messages, files, promises and people. Ask me how to search for something.':
    'أعرف كيف أجد الأشياء: الرسائل والملفات والوعود والأشخاص. اسألني كيف تبحث عن شيء.',
  'Any time! What else are you curious about?': 'في أي وقت! ما الذي يثير فضولك أيضًا؟',
  'I help with first steps: connecting with people, invites and saying hi first. Ask me where to begin.':
    'أساعد في الخطوات الأولى: التواصل مع الناس، والدعوات، والمبادرة بالتحية. اسألني من أين تبدأ.',
  'You’ve got this!': 'الأمر بين يديك!',
  'I remember what was decided and what you said you’d do. Ask me what you promised.':
    'أتذكّر ما تقرّر وما قلت إنك ستفعله. اسألني بماذا وعدت.',
  'Glad I could help.': 'يسعدني أنني ساعدت.',
  'And peace be upon you!': 'وعليكم السلام!',
  'Hi {name}!': 'مرحبًا {name}!',
  'Any time!': 'في أي وقت!',
  'Hi {name}, I’m Cai. Ask me what you’re waiting on, what’s asked of you, what you said you’d do or what’s coming up.':
    'مرحبًا {name}، أنا Cai. اسألني عمّا تنتظره، وما يُطلب منك، وما وعدت به، أو ما هو قادم.',
  'With AI assist on, you can ask me anything else too.':
    'ومع تشغيل مساعدة الذكاء الاصطناعي، يمكنك أن تسألني عن أي شيء آخر أيضًا.',
  'Turn on AI assist in Settings, and you can ask me anything else too.':
    'شغّل مساعدة الذكاء الاصطناعي من الإعدادات، وسيمكنك سؤالي عن أي شيء آخر أيضًا.',
  'I can answer that with AI assist on: Settings, then AI assist.':
    'أستطيع الإجابة عن ذلك مع تشغيل مساعدة الذكاء الاصطناعي: الإعدادات، ثم مساعدة الذكاء الاصطناعي.',
  'That one’s beyond me.': 'هذا يفوق ما أستطيعه.',
  'I can always tell you what you’re waiting on, what’s asked of you, what you said you’d do and what’s coming up this week. Just ask, in your own words.':
    'يمكنني دائمًا أن أخبرك بما تنتظره، وما يُطلب منك، وما وعدت به، وما هو قادم هذا الأسبوع. اسأل فقط، بكلماتك.',
  'You’re not waiting on anyone right now.': 'لا تنتظر أحدًا الآن.',
  'Nobody is waiting on you right now.': 'لا أحد ينتظرك الآن.',
  'Nothing you said you’d do is open.': 'لا شيء مما وعدت به مفتوح.',
  'Coming up this week:': 'قادم هذا الأسبوع:',
  'Nothing is coming up this week.': 'لا شيء قادم هذا الأسبوع.',
  '{name} reads words and stickers.': 'مع {name}، الكلمات والملصقات فقط.',
  '{name} talks in one conversation.': 'لـ{name} محادثة واحدة فقط.',
  'And {n} more in Actions.': {
    zero: 'ولا أمر آخر في «الإجراءات».',
    one: 'وأمر آخر في «الإجراءات».',
    two: 'وأمران آخران في «الإجراءات».',
    few: 'و{n} أمور أخرى في «الإجراءات».',
    many: 'و{n} أمرًا آخر في «الإجراءات».',
    other: 'و{n} أمر آخر في «الإجراءات».',
  },
  'You’re waiting on {n} things:': {
    zero: 'لا تنتظر أي أمر:',
    one: 'تنتظر أمرًا واحدًا:',
    two: 'تنتظر أمرين:',
    few: 'تنتظر {n} أمور:',
    many: 'تنتظر {n} أمرًا:',
    other: 'تنتظر {n} أمر:',
  },
  '{n} things are asked of you:': {
    zero: 'لا شيء مطلوب منك:',
    one: 'أمر واحد مطلوب منك:',
    two: 'أمران مطلوبان منك:',
    few: '{n} أمور مطلوبة منك:',
    many: '{n} أمرًا مطلوبًا منك:',
    other: '{n} أمر مطلوب منك:',
  },
  'You said you’d do {n} things:': {
    zero: 'لم تعد بشيء:',
    one: 'وعدت بأمر واحد:',
    two: 'وعدت بأمرين:',
    few: 'وعدت بـ{n} أمور:',
    many: 'وعدت بـ{n} أمرًا:',
    other: 'وعدت بـ{n} أمر:',
  },
  '{name} hasn’t answered about “{title}” yet. Shall I send this?':
    'لا ردّ من {name} بخصوص «{title}» بعد. هل أرسل هذه؟',
  'That follow-up': 'تلك المتابعة',
  'That wait': 'ذلك الانتظار',
  'That’s no longer open.': 'لم يعد ذلك مفتوحًا.',
  'Today:': 'اليوم:',
  'Nothing is planned for today.': 'لا شيء مخطط لليوم.',
  'Ask me about any of it.': 'اسألني عن أي منها.',
  '{n} things are asked of you.': {
    zero: 'لا شيء مطلوب منك.',
    one: 'أمر واحد مطلوب منك.',
    two: 'أمران مطلوبان منك.',
    few: '{n} أمور مطلوبة منك.',
    many: '{n} أمرًا مطلوبًا منك.',
    other: '{n} أمر مطلوب منك.',
  },
  'You’re waiting on {n} things.': {
    zero: 'لا تنتظر أي أمر.',
    one: 'تنتظر أمرًا واحدًا.',
    two: 'تنتظر أمرين.',
    few: 'تنتظر {n} أمور.',
    many: 'تنتظر {n} أمرًا.',
    other: 'تنتظر {n} أمر.',
  },
  'You said you’d do {n} things.': {
    zero: 'لم تعد بشيء.',
    one: 'وعدت بأمر واحد.',
    two: 'وعدت بأمرين.',
    few: 'وعدت بـ{n} أمور.',
    many: 'وعدت بـ{n} أمرًا.',
    other: 'وعدت بـ{n} أمر.',
  },
  'Say why, so the developer can change it and ask again.':
    'اذكر السبب، ليتمكن المطوّر من التعديل والطلب مجددًا.',
  'Only an organization’s owner or admins publish apps under it.':
    'لا ينشر التطبيقات باسم المنظمة إلا مالكها أو مشرفوها.',
  'Connect must send people to the app’s own address: one it returns to, or its website.':
    'يجب أن يرسل «اتصال» الأشخاص إلى عنوان التطبيق نفسه: عنوان يعود إليه، أو موقعه.',
  'A listing needs a tagline, a category and where Connect goes.':
    'يحتاج الإدراج إلى سطر تعريفي وفئة ووجهة لزر «اتصال».',
  'Who does it is for the team to say.': 'من يقوم بذلك أمر يقرره الفريق.',
  'This card has been paid already.': 'دُفعت هذه البطاقة بالفعل.',
  'The listing changed since it was looked at: look at it again.':
    'تغيّر الإدراج منذ النظر فيه: انظر فيه مجددًا.',
  'Yours to do: {name}': 'عليك القيام به: {name}',
  '{org} named you for this booking.': 'عيّنتك {org} لهذا الحجز.',
  About: 'عن Caime',
};
