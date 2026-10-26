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
  'It lands in the inbox, first if they’ve waited longest.':
    'تصل إلى صندوق الوارد، وتتصدّره إن طال انتظارها أكثر من غيرها.',
  'Lina writes to Nile Dental from the app she uses for everyone else. The team sees one conversation, its state and who has it; Lina sees the organization, never which person.':
    'تكتب لينا إلى Nile Dental من التطبيق نفسه الذي تستخدمه مع كل من حولها. يرى الفريق محادثة واحدة وحالتها ومن يتولاها؛ وترى لينا المؤسسة، لا الشخص الذي يرد.',
  'Can I book a cleaning on Thursday?': 'هل يمكنني حجز تنظيف يوم الخميس؟',
  'new · nobody has it · 2 min': 'جديدة · لا أحد يتولاها · منذ دقيقتين',
  'The agent answers': 'الوكيل يرد',
  'From what you wrote down, and it says so.': 'مما كتبته أنت، ويقول ذلك.',
  'The organization’s AI agent answers only from its knowledge (up to {n} characters you gave it), is marked as an AI, and hands over to a person the moment it isn’t sure. With bookable hours set, it offers the open slots and books the one the customer picks; with orders on, it writes down what they ask for from the menu. The team confirms each, reads the sentence of its knowledge every answer rests on, and says what it may do and when it answers.':
    'لا يجيب وكيل الذكاء الاصطناعي للمؤسسة إلا من المعرفة التي زوّدته بها (حتى {n} حرف)، ويظهر بوضوح أنه ذكاء اصطناعي، ويحيل المحادثة إلى شخص متى لم يكن متأكدًا. وإن حدّدت ساعات الحجز، يعرض المواعيد المتاحة ويحجز ما يختاره العميل؛ وإن فعّلت الطلبات، يدوّن ما يطلبه من القائمة. ويؤكد الفريق كلًّا منها، ويقرأ الجملة التي استندت إليها كل إجابة من معرفته، ويحدد ما يُسمح له به ومتى يجيب.',
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
  '{n} conversations a day': '{n} محادثة في اليوم',
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
  files: 'الملفات',
  automations: 'الأتمتة',
  'everything else': 'كل ما عدا ذلك',
  'connections, attention, memory, spaces, calls, private conversations':
    'التواصل، والانتباه، والذاكرة، والمساحات، والمكالمات، والمحادثات الخاصة',
  'how your relationships are going, from your own messages, for you only':
    'كيف تسير علاقاتك، من رسائلك أنت، لك وحدك',
  team: 'الفريق',
  'how fast the team answers, who is waiting, what is open, what was booked, ordered and paid':
    'سرعة إجابة الفريق، ومن ينتظر، وما هو مفتوح، وما حُجز وطُلب ودُفع',
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
  'The Caime Friends (Caishy, Momo, Panda, Lumi, Pico, Niko and Zuzu) appear where there is something to celebrate or nothing yet to show, never beside your invoice.':
    'يظهر أصدقاء Caime (كايشي ومومو وباندا ولومي وبيكو ونيكو وزوزو) حين يكون هناك ما يُحتفى به أو حين لا يوجد ما يُعرض بعد، ولا يظهرون أبدًا بجانب فاتورتك.',
  'how it’s built': 'كيف بُني',
  'One codebase for the server, the web and the phones. Every change is tested end to end against the real server before it ships, and only what passed goes live.':
    'قاعدة كود واحدة للخادم والويب والهواتف. يُختبر كل تغيير من طرف إلى طرف على الخادم الحقيقي قبل إطلاقه، ولا يصل إلى المستخدمين إلا ما نجح.',
  'your say': 'رأيك',
  'Questions, ideas and concerns go to {mail}.': 'الأسئلة والأفكار والمخاوف تُرسل إلى {mail}.',
  'Web, iOS and Android.': 'الويب وiOS وAndroid.',
  '{name} is on {site}.': '{name} على {site}.',
  'a person on {site}': 'شخص على {site}',
  work: 'العمل',
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
  'That account': 'ذلك الحساب',
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
  'Insights come with Business: how fast {name}’s team answers, how many customers write, what they book, order and pay, and what’s still open.':
    'الرؤى تأتي مع Business: سرعة رد فريق {name}، وعدد العملاء الذين يكتبون، وما يحجزونه ويطلبونه ويدفعونه، وما لا يزال مفتوحًا.',
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
  'That job': 'تلك المهمة',
  'That context': 'ذلك السياق',
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
  'Where you live, Caime is for people {age} and older.':
    'في بلد الإقامة، Caime لمن بلغ {age} عامًا فأكثر.',
  'Your plan starts as soon as you pay. In the EU you may withdraw within 14 days by writing to {email}, and you pay only for the days it was on. Terms: {terms}':
    'تبدأ الخطة فور الدفع. في الاتحاد الأوروبي يمكن الانسحاب خلال 14 يومًا بالكتابة إلى {email}، ولا يُدفع إلا عن الأيام التي كانت فيها الخطة مفعّلة. الشروط: {terms}',
  'You need to be at least {age} to use Caime.':
    'يجب أن يكون عمرك {age} عامًا على الأقل لاستخدام Caime.',
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
  'You’ve saved {max} things, the most there’s room for. Remove some to save more.':
    'بلغت الحد الأقصى للمحفوظات ({max}). أزل بعضها لتحفظ المزيد.',
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
  'That request': 'ذلك الطلب',
  'That connection': 'ذلك التواصل',
  'That merged connection': 'ذلك التواصل المدمج',
  'A private group holds up to {max} people: each message is sealed for every device in it.':
    'تتسع المجموعة الخاصة لـ {max} شخصًا على الأكثر: كل رسالة تُختم لكل جهاز فيها.',
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
  'An album holds {max} photos.': 'يتسع الألبوم لـ {max} صورة.',
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
  '{max} messages are pinned already, including {n} you deleted for yourself. Unpin one first.': {
    zero: 'ثُبّتت {max} رسائل بالفعل. ألغِ تثبيت إحداها أولًا.',
    one: 'ثُبّتت {max} رسائل بالفعل، منها واحدة حذفتها لنفسك. ألغِ تثبيت إحداها أولًا.',
    two: 'ثُبّتت {max} رسائل بالفعل، منها اثنتان حذفتهما لنفسك. ألغِ تثبيت إحداها أولًا.',
    few: 'ثُبّتت {max} رسائل بالفعل، منها {n} حذفتها لنفسك. ألغِ تثبيت إحداها أولًا.',
    many: 'ثُبّتت {max} رسائل بالفعل، منها {n} حذفتها لنفسك. ألغِ تثبيت إحداها أولًا.',
    other: 'ثُبّتت {max} رسائل بالفعل، منها {n} حذفتها لنفسك. ألغِ تثبيت إحداها أولًا.',
  },
  '{max} messages are pinned already. Unpin one first.':
    'ثُبّتت {max} رسائل بالفعل. ألغِ تثبيت إحداها أولًا.',
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
  'Private conversations open on up to {max} devices: remove one in Settings first.':
    'تُفتح المحادثات الخاصة على عدد محدود من الأجهزة ({max}): أزل جهازًا من الإعدادات أولًا.',
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
  'Calls are for groups of up to {max} people.': 'المكالمات لمجموعات من {max} أشخاص على الأكثر.',
  'You can join once you’ve joined the conversation.': 'يمكنك الانضمام بعد الانضمام إلى المحادثة.',
  'This call is full.': 'هذه المكالمة ممتلئة.',
  'You can’t join this call.': 'لا يمكنك الانضمام إلى هذه المكالمة.',
  'That handle': 'ذلك المعرّف',
  'Connect first to bring a chat over.': 'تواصل أولًا لتنقل محادثة إلى هنا.',
  'Only an app’s token does this.': 'رمز تطبيق وحده يفعل هذا.',
  'An app has up to {perApp} kinds of card. Remove one to make another.':
    'يتسع التطبيق لـ {perApp} من أنواع البطاقات على الأكثر. أزل نوعًا لتنشئ آخر.',
  'That isn’t one of an app’s cards.': 'تلك ليست من بطاقات تطبيق.',
  'An app changes only its own cards.': 'لا يغيّر التطبيق إلا بطاقاته.',
  'Choose a time zone from the list.': 'اختر منطقة زمنية من القائمة.',
  'Choose an image you uploaded.': 'اختر صورة رفعتها.',
  'Apps are made by people over 18.': 'التطبيقات يصنعها من تجاوزوا 18 عامًا.',
  'You have {max} apps. Remove one first.': 'بلغت الحد الأقصى للتطبيقات ({max}). أزل واحدًا أولًا.',
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
  'You have {max} tokens. Revoke one you don’t use first.':
    'بلغت الحد الأقصى للرموز ({max}). ألغِ أولًا رمزًا لا تستخدمه.',
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
  'Send a sticker from the button beside an empty message box. The Caime Friends pack is free.':
    'أرسل ملصقًا من الزر بجوار مربع الرسالة حين يكون فارغًا. حزمة أصدقاء Caime مجانية.',
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
  'I welcome people to Caime and keep the Caime Friends stickers. Ask me how anything here works.':
    'أرحّب بالجميع في Caime وأعتني بملصقات Caime Friends. اسألني كيف يعمل أي شيء هنا.',
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
  '{name} reads words, stickers and voice notes.':
    'مع {name}، الكلمات والملصقات والرسائل الصوتية فقط.',
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
  'Here’s your week with your people.': 'إليك أسبوعك مع من حولك.',
  'Last week you talked with {n} people.': {
    zero: 'لا أحد تحدثت معه الأسبوع الماضي.',
    one: 'تحدثت الأسبوع الماضي مع شخص واحد.',
    two: 'تحدثت الأسبوع الماضي مع شخصين.',
    few: 'تحدثت الأسبوع الماضي مع {n} أشخاص.',
    many: 'تحدثت الأسبوع الماضي مع {n} شخصًا.',
    other: 'تحدثت الأسبوع الماضي مع {n} شخص.',
  },
  'You did {n} things you said you would.': {
    zero: 'لم يُنجز شيء مما وعدت به.',
    one: 'أنجزت أمرًا واحدًا مما وعدت به.',
    two: 'أنجزت أمرين مما وعدت به.',
    few: 'أنجزت {n} أمور مما وعدت به.',
    many: 'أنجزت {n} أمرًا مما وعدت به.',
    other: 'أنجزت {n} أمر مما وعدت به.',
  },
  'Gone quiet:': 'هدأ الحديث مع:',
  '• {name}: nothing for {n} weeks': {
    zero: '• {name}: لا شيء منذ أيام',
    one: '• {name}: لا شيء منذ أسبوع',
    two: '• {name}: لا شيء منذ أسبوعين',
    few: '• {name}: لا شيء منذ {n} أسابيع',
    many: '• {name}: لا شيء منذ {n} أسبوعًا',
    other: '• {name}: لا شيء منذ {n} أسبوع',
  },
  'You’ve waited longest on {name}: {title}.': 'أطول انتظار لك من {name}: {title}.',
  '{n} meetings and appointments this week.': {
    zero: 'لا مواعيد هذا الأسبوع.',
    one: 'موعد واحد هذا الأسبوع.',
    two: 'موعدان هذا الأسبوع.',
    few: '{n} مواعيد هذا الأسبوع.',
    many: '{n} موعدًا هذا الأسبوع.',
    other: '{n} موعد هذا الأسبوع.',
  },
  'A quiet week: nothing to tell you.': 'أسبوع هادئ: لا جديد أخبرك به.',
  '{n} people have gone quiet.': {
    zero: 'لم يهدأ الحديث مع أحد.',
    one: 'هدأ الحديث مع شخص واحد.',
    two: 'هدأ الحديث مع شخصين.',
    few: 'هدأ الحديث مع {n} أشخاص.',
    many: 'هدأ الحديث مع {n} شخصًا.',
    other: 'هدأ الحديث مع {n} شخص.',
  },
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
  'Who does it is for the team to say.': 'من يقوم بذلك أمر يقرره الفريق.',
  'This card has been paid already.': 'دُفعت هذه البطاقة بالفعل.',
  'The listing changed since it was looked at: look at it again.':
    'تغيّر الإدراج منذ النظر فيه: انظر فيه مجددًا.',
  'Yours to do: {name}': 'عليك القيام به: {name}',
  '{org} named you for this booking.': 'عيّنتك {org} لهذا الحجز.',
  About: 'عن Caime',
  '{name} is listed in Discover': '{name} مدرج الآن في «اكتشف»',
  '{name} wasn’t listed': 'لم يُدرج {name}',
  'Anyone on Caime can find and connect it now.': 'يمكن لأي شخص على Caime إيجاده وربطه الآن.',
  'A text message carries no payload.': 'الرسالة النصية لا تحمل حمولة.',
  'That isn’t from the mail provider.': 'هذا ليس من مزوّد البريد.',
  'That isn’t a mail.': 'هذه ليست رسالة بريد.',
  'Built by {site}': 'من صنع {site}',
  Categories: 'الفئات',
  Marketplace: 'سوق التطبيقات',
  marketplace: 'سوق التطبيقات',
  '{category} apps for {site}': 'تطبيقات {category} لـ{site}',
  'Apps for {site}: the marketplace': 'تطبيقات لـ{site}: سوق التطبيقات',
  'Apps that work with {site}: its own, the automation platforms, and apps developers listed after {site} looked at each one. Each asks you before it does anything, and you can end it any time.':
    'تطبيقات تعمل مع {site}: تطبيقاتها، ومنصات الأتمتة، وتطبيقات أدرجها مطوّروها بعد أن نظرت {site} في كل واحد منها. كلٌّ منها يستأذنك قبل أن يفعل شيئًا، ويمكن إيقافه في أي وقت.',
  'More apps': 'المزيد من التطبيقات',
  '{category} apps': 'تطبيقات {category}',
  'Apps that work with {site}.': 'تطبيقات تعمل مع {site}.',
  'Nothing here yet.': 'لا شيء هنا بعد.',
  'List your app': 'إدراج تطبيقك',
  how: 'الطريقة',
  'Register it under Settings → Developer, fill in its listing and ask. {site} looks at every one against the bar on {developers}, once, and again whenever what it shows changes.':
    'سجّله من الإعدادات ← المطوّر، واملأ إدراجه واطلب نشره. تنظر {site} في كل تطبيق وفق المعايير في {developers}، مرة واحدة، ومرة أخرى كلما تغيّر ما يعرضه.',
  'the developers’ page': 'صفحة المطوّرين',
  order: 'الترتيب',
  'By how many people connected it, then the newest. Nothing is paid for: no placement, no ratings.':
    'بعدد من ربطوه، ثم الأحدث. لا شيء مدفوع: لا مواضع مشتراة ولا تقييمات.',
  by: 'من',
  reviewed: 'المراجعة',
  'Reviewed by {site}': 'راجعته {site}',
  category: 'الفئة',
  'gives Caime': 'يقدّم لـ Caime',
  connected: 'الربط',
  'where it goes': 'إلى أين يذهب',
  help: 'المساعدة',
  '{site}’s help': 'مساعدة {site}',
  '{site}’s privacy policy': 'سياسة خصوصية {site}',
  '{name} for {site} · Marketplace': '{name} لـ{site} · سوق التطبيقات',
  'Turn it on in {site}': 'التشغيل في {site}',
  'Connect in {site}': 'الربط في {site}',
  'More {category} apps': 'المزيد من تطبيقات {category}',
  'The bar for the marketplace': 'معايير سوق التطبيقات',
  'Each one is asked for because the app uses it today, never for a feature to come. Reading everything is looked at closer.':
    'يُطلب كل إذن لأن التطبيق يستخدمه اليوم، لا لميزة قادمة. وقراءة كل شيء تُفحص عن قرب.',
  connect: 'الربط',
  'Caime follows Connect to the end, as a person would, before it lists the app.':
    'تتبع Caime زر «اتصال» حتى نهايته، كما يفعل أي شخص، قبل أن تُدرج التطبيق.',
  'help and privacy': 'المساعدة والخصوصية',
  'A support address and a privacy policy that open, both on the listing. One that stops working takes the app out.':
    'عنوان دعم وسياسة خصوصية يُفتحان، وكلاهما في الإدراج. وإن توقّف أحدهما عن العمل خرج التطبيق.',
  never: 'أبدًا',
  'Exporting or backing up conversations wholesale, deleting in bulk, copying Caime’s own app, taking payments through Caime, training a model on what it reads, or one account shared by several people.':
    'تصدير المحادثات أو نسخها احتياطيًا بالجملة، أو الحذف بالجملة، أو تقليد تطبيق Caime نفسه، أو تلقّي المدفوعات عبر Caime، أو تدريب نموذج على ما يقرؤه، أو حساب واحد يتشاركه عدة أشخاص.',
  'a model': 'نموذج',
  'An app that puts people’s words through a model says which, what it keeps, for how long and where. The listing shows it as Caime shows its own processors.':
    'التطبيق الذي يمرّر كلام الناس عبر نموذج يذكر أيّ نموذج، وما يحتفظ به، وإلى متى، وأين. ويعرض الإدراج ذلك كما تعرض Caime معالجيها.',
  age: 'العمر',
  'the listing': 'الإدراج',
  'A tagline, a category, how it’s paid for, its languages, up to {n} screenshots at 8:5, where to get help and its privacy policy.':
    'سطر تعريفي، وفئة، وطريقة الدفع، ولغاته، وحتى {n} لقطات شاشة بنسبة 8:5، ومكان المساعدة، وسياسة خصوصيته.',
  changes: 'التغييرات',
  'A change to what the listing shows asks again. An app left broken is taken out, with a note to its developer.':
    'أي تغيير فيما يعرضه الإدراج يُعاد طلبه. والتطبيق المتروك معطّلًا يُخرج، مع ملاحظة لمطوّره.',
  'the order': 'الترتيب',
  'By how many people connected it, then the newest. No paid placement, no ratings.':
    'بعدد من ربطوه، ثم الأحدث. لا مواضع مدفوعة ولا تقييمات.',
  'The marketplace': 'سوق التطبيقات',
  'Only a listed app can be taken out.': 'لا يُخرج إلا تطبيق مُدرج.',
  'Check every point of the bar before listing it.': 'يجب التحقق من كل بند في المعايير قبل إدراجه.',
  '{name} was taken out of Discover': 'أُخرج {name} من «اكتشف»',
  'That screenshot': 'لقطة الشاشة تلك',
  'A listing needs a tagline, a category, how it’s paid for, where to get help, a privacy policy and where Connect goes.':
    'يحتاج الإدراج إلى سطر تعريفي وفئة وطريقة الدفع ومكان المساعدة وسياسة خصوصية ووجهة لزر «اتصال».',
  'Starting now: {title}': 'يبدأ الآن: {title}',
  'It’s time to join.': 'حان وقت الانضمام.',
  'A guest can’t do this.': 'لا يمكن للضيف فعل ذلك.',
  'Only a meeting takes guests.': 'الاجتماع وحده يستقبل الضيوف.',
  'A meeting takes guests once it’s agreed.': 'يستقبل الاجتماع الضيوف بعد الاتفاق عليه.',
  'Only a meeting held on Caime, at a time, takes guests.':
    'الاجتماع المنعقد على Caime وفي وقت محدد وحده يستقبل الضيوف.',
  'That meeting is over.': 'انتهى ذلك الاجتماع.',
  'A meeting holds eight people at most.': 'يتسع الاجتماع لثمانية أشخاص على الأكثر.',
  'That isn’t an email address.': 'هذا ليس عنوان بريد إلكتروني.',
  'Guests join meetings agreed in a chat or a group.':
    'ينضم الضيوف إلى اجتماعات متفق عليها في محادثة أو مجموعة.',
  'Guests are invited by people 18 or over.': 'يدعو الضيوفَ أشخاصٌ في الثامنة عشرة أو أكثر.',
  'That’s your own address.': 'هذا عنوانك أنت.',
  'Guests aren’t available in this conversation.': 'دعوة الضيوف غير متاحة في هذه المحادثة.',
  'They can’t join a conversation with guests.': 'لا يمكن الانضمام إلى محادثة فيها ضيوف.',
  'That invitation': 'تلك الدعوة',
  'This invitation is for your Caime account: sign in.':
    'هذه الدعوة لحسابك على Caime، ويلزم تسجيل الدخول.',
  'Someone else is signed in here. Open the link in another browser, or sign out first.':
    'شخص آخر مسجّل الدخول هنا. يمكن فتح الرابط في متصفح آخر، أو تسجيل الخروج أولًا.',
  '{name} is coming: {title}': '{name}: حضور مؤكَّد في {title}',
  '{name} can’t come: {title}': '{name}: اعتذار عن {title}',
  '{name} might come: {title}': '{name}: حضور محتمل في {title}',
  // Passkeys (R36).
  'That took too long. Try your passkey again.':
    'استغرق ذلك وقتًا طويلًا. جرّب مفتاح المرور مرة أخرى.',
  'That passkey doesn’t open a Caime account.': 'لا يفتح مفتاح المرور هذا أي حساب في Caime.',
  'This account has as many passkeys as it can keep. Remove one first.':
    'في هذا الحساب أقصى عدد من مفاتيح المرور. أزل واحدًا أولًا.',
  'That passkey couldn’t be checked, so it wasn’t added. Try again.':
    'تعذّر التحقق من مفتاح المرور، فلم يُضف. حاول مرة أخرى.',
  'That passkey is already on an account.': 'مفتاح المرور هذا مضاف إلى حساب بالفعل.',
  'That passkey': 'مفتاح المرور هذا',
  // Stock that runs out (R60).
  '{name}: only {n} left.': {
    zero: '{name}: لم يبقَ شيء.',
    one: '{name}: بقي واحد فقط.',
    two: '{name}: بقي اثنان فقط.',
    few: '{name}: بقي {n} فقط.',
    many: '{name}: بقي {n} فقط.',
    other: '{name}: بقي {n} فقط.',
  },
  '{name} is sold out.': '{name}: نفدت الكمية.',
  // Options on an item (R60).
  'Choose from “{option}” for {name}.': 'اختر من «{option}» لـ{name}.',
  // A split's share paid with Pay (R62).
  'You don’t owe a share of this split.': 'لا حصة عليك في هذا التقسيم.',
  'Your share of this split is settled.': 'حصتك في هذا التقسيم مسدَّدة.',
  'A Pay card for your share is waiting already.': 'بطاقة دفع لحصتك بانتظار التأكيد بالفعل.',
  // A paid Pay card's receipt (R62, R65).
  'That receipt': 'هذا الإيصال',
  // A meeting that repeats (R58).
  'A meeting repeats only in a chat or a group.': 'لا يتكرر الاجتماع إلا في محادثة أو مجموعة.',
  'A meeting can’t stop repeating before it starts.': 'لا يمكن أن ينتهي تكرار الاجتماع قبل بدايته.',
  'Until is for a meeting that repeats.': '«حتى» لاجتماع يتكرر فقط.',
  'That meeting doesn’t repeat.': 'هذا الاجتماع لا يتكرر.',
  'That one is over. Stop it from the next one.':
    'انتهت هذه المرة، وإيقاف التكرار يكون من المرة التالية.',
  '{name}: stopped repeating': 'أُوقف التكرار: {name}',
  'What {name} knows': 'ما في جعبة {name}',
  'A morning brief in its chat at the hour you choose, worked out by the rules at no cost.':
    'موجز صباحي في محادثته في الساعة التي تختارها، تُعدّه القواعد بلا تكلفة.',
  'A look at your week: who you talked with, who went quiet, what you’ve waited on longest.':
    'نظرة على أسبوعك: من تحدثت معهم، ومن انقطع، وما طال انتظارك له.',
  'A wait you hand it comes back as a follow-up ready to send; nothing goes until you tap Send.':
    'الانتظار الذي تسلّمه له يعود متابعةً جاهزة للإرسال؛ ولا يُرسل شيء حتى تنقر «إرسال».',
  'Ask Cai in Search answers from your own messages and shows the ones it rests on.':
    '«اسأل Cai» في البحث يجيب من رسائلك أنت ويعرض الرسائل التي استند إليها.',
  'What it learned from your choices is listed in Settings, and forgotten when you say.':
    'ما تعلّمه من اختياراتك مدرج في الإعدادات، ويُنسى متى طلبت.',
  '{when} couldn’t be booked': 'تعذّر حجز {when}',
  'That time was taken. The times after it go on.':
    'كان هذا الموعد محجوزًا. المواعيد التالية مستمرة.',
  'It stopped repeating': 'توقّف التكرار',
  'It can’t be booked any more. Book again to go on.':
    'لم يعد الحجز ممكنًا. احجز من جديد للاستمرار.',
  'An appointment repeats only in a chat or with an organization.':
    'لا يتكرر الموعد إلا في محادثة ثنائية أو مع مؤسسة.',
  'An appointment can’t stop repeating before it starts.':
    'لا يمكن أن ينتهي تكرار الموعد قبل بدايته.',
  // An organization's AI agent says who it is, and passes a conversation on (R87).
  'Hi {name}, I’m {agent}, the AI assistant for {org}.':
    'مرحبًا {name}، أنا {agent}، مساعد الذكاء الاصطناعي لدى {org}.',
  'Hello, I’m {agent}, the AI assistant for {org}.':
    'مرحبًا، أنا {agent}، مساعد الذكاء الاصطناعي لدى {org}.',
  'I’ve passed this to the team at {org}. Someone will answer here.':
    'حوّلت محادثتك إلى فريق {org}، وسيرد عليك أحدهم هنا.',
  // The organizations someone runs, in the weekly digest (R87).
  'At {org}:': 'في {org}:',
  '• {n} new conversations this week': {
    zero: '• لا محادثات جديدة هذا الأسبوع',
    one: '• محادثة جديدة واحدة هذا الأسبوع',
    two: '• محادثتان جديدتان هذا الأسبوع',
    few: '• {n} محادثات جديدة هذا الأسبوع',
    many: '• {n} محادثة جديدة هذا الأسبوع',
    other: '• {n} محادثة جديدة هذا الأسبوع',
  },
  '• {n} customers waiting on the team': {
    zero: '• لا أحد ينتظر الفريق',
    one: '• عميل واحد ينتظر الفريق',
    two: '• عميلان ينتظران الفريق',
    few: '• {n} عملاء ينتظرون الفريق',
    many: '• {n} عميل ينتظرون الفريق',
    other: '• {n} عميل ينتظرون الفريق',
  },
  '• {n} bookings in the week ahead': {
    zero: '• لا حجوزات في الأسبوع القادم',
    one: '• حجز واحد في الأسبوع القادم',
    two: '• حجزان في الأسبوع القادم',
    few: '• {n} حجوزات في الأسبوع القادم',
    many: '• {n} حجز في الأسبوع القادم',
    other: '• {n} حجز في الأسبوع القادم',
  },
  '• {n} orders still open': {
    zero: '• لا طلبات مفتوحة',
    one: '• طلب واحد ما زال مفتوحًا',
    two: '• طلبان ما زالا مفتوحين',
    few: '• {n} طلبات ما زالت مفتوحة',
    many: '• {n} طلب ما زال مفتوحًا',
    other: '• {n} طلب ما زال مفتوحًا',
  },
  'That connection was started by someone else.': 'بدأ شخص آخر هذا الربط.',
  'Turn on Files for this account first.': 'فعّل الملفات لهذا الحساب أولًا.',
  'That account needs connecting again.': 'يحتاج ذلك الحساب إلى ربط من جديد.',
  'Google’s files are picked in Google’s own window.': 'تُختار ملفات Google في نافذة Google نفسها.',
  'That page isn’t one of these.': 'تلك الصفحة ليست منها.',
  'That kind of Google file can’t be attached. Pick a document or a file.':
    'لا يمكن إرفاق هذا النوع من ملفات Google. اختر مستندًا أو ملفًا.',
  'Pick a file, not a folder.': 'اختر ملفًا لا مجلدًا.',
  'That isn’t offered for this account here.': 'هذا غير متاح لهذا الحساب هنا.',
  'That picker': 'أداة الاختيار تلك',
  'Pick a file': 'اختر ملفًا',
  'That email belongs to someone else on Caime.': 'هذا البريد لشخص آخر على Caime.',
  'That number belongs to someone else on Caime.': 'هذا الرقم لشخص آخر على Caime.',
  'Phone numbers can’t be proven here yet. Try again later.':
    'لا يمكن إثبات أرقام الهواتف هنا بعد. حاول لاحقًا.',
  'Write the number with its country code, like +20 101 234 5678.':
    'اكتب الرقم مع رمز الدولة، مثل ‎+20 101 234 5678.',
  'That’s already yours.': 'هذا لك بالفعل.',
  'That’s as many as one person can add. Remove one first.':
    'هذا أقصى ما يضيفه شخص واحد. أزل واحدًا أولًا.',
  'That address': 'ذلك العنوان',
  'That code isn’t right. Check it and try again.': 'هذا الرمز غير صحيح. تحقّق منه وحاول من جديد.',
  'Caime can’t send email here yet.': 'لا يرسل Caime بريدًا إلكترونيًا هنا بعد.',
  'That’s a Caime address. Find them by their handle.':
    'هذا عنوان على Caime. ابحث عن صاحبه باسم المستخدم.',
  'Writing to an address by email is for people over 18.':
    'المراسلة بالبريد الإلكتروني لمن تجاوز 18 عامًا.',
  'That kind of place isn’t offered here.': 'هذا النوع من الأماكن غير متاح هنا.',
  'Only an organization’s items are done at its places.': 'عناصر المؤسسة وحدها تُقدَّم في أماكنها.',
  'Choose one of your places that customers may see.': 'اختر أحد أماكنك التي يراها العملاء.',
  'This is a notice by mail, from an address nobody answers. Nothing is sent from here.':
    'هذه نشرة بالبريد من عنوان لا يُرد عليه. لا يُرسل شيء من هنا.',
  'That mail': 'ذلك البريد',
  'Someone reached by email is written to by email.':
    'من يُتواصل معه بالبريد تُكتب له رسالة بالبريد.',
  'You are here': 'موقعك في الصفحة',
  'Make your own page on {site}': 'صفحة خاصة بك على {site}',
  'More from {name}': 'المزيد من {name}',
  'You order from {name} in a conversation. Joining {site} is free.':
    'الطلب من {name} في محادثة، والانضمام إلى {site} مجاني.',
  'You pick a time with {name} in a conversation. Joining {site} is free.':
    'اختيار الموعد مع {name} في محادثة، والانضمام إلى {site} مجاني.',
  'Asked, not agreed yet.': 'مطلوب، ولم يُتفق عليه بعد.',
  'Join in Caime: {url}': 'الانضمام في Caime: {url}',
  'Open in Caime: {url}': 'في Caime: {url}',
  'Caime keeps this up to date. Change it in Caime.':
    'يُبقي Caime هذا الموعد محدَّثًا، وتغييره يكون في Caime.',
  // Booking before an account (R97 (1), block C).
  'Pick a time below. No account needed; {name} confirms in a conversation.':
    'اختر وقتًا أدناه. لا حاجة إلى حساب؛ {name} تؤكد في محادثة.',
  'That address has a {site} account.': 'لهذا العنوان حساب على {site}.',
  'Sign in to book': 'سجّل الدخول للحجز',
  'Booking without an account isn’t available here yet. Join {site} to book.':
    'الحجز بلا حساب غير متاح هنا بعد. انضم إلى {site} للحجز.',
  'That can’t be booked from here.': 'لا يمكن حجز هذا من هنا.',
  'That time was just taken. Pick another.': 'حُجز هذا الوقت للتو. اختر وقتًا آخر.',
  'That took too long. Pick a time again.': 'طال الوقت أكثر من اللازم. اختر وقتًا من جديد.',
  'That code has run out. Pick a time again to get a new one.':
    'انتهت صلاحية هذا الرمز. اختر وقتًا من جديد للحصول على رمز جديد.',
  'Too many tries for now. Try again in an hour.':
    'محاولات كثيرة في الوقت الحالي. حاول مرة أخرى بعد ساعة.',
  'Booking without an account is for people 18 or over. Under 18, join {site} with your age.':
    'الحجز بلا حساب لمن بلغ 18 عامًا فأكثر. دون 18، انضم إلى {site} مع ذكر عمرك.',
  '{item}, {when}. {name} confirms in your conversation.':
    '{item}، {when}. {name} تؤكد في محادثتك.',
  'To follow it, join {site} free with {email}: your booking will be there.':
    'لمتابعته، انضم إلى {site} مجانًا بالعنوان {email}: ستجد حجزك هناك.',
  'Join {site}': 'انضم إلى {site}',
  'Check your email': 'تحقق من بريدك',
  'A six-digit code went to {email}. Type it to book {item}, {when}.':
    'أُرسل رمز من ستة أرقام إلى {email}. اكتبه لحجز {item}، {when}.',
  'Pick another time': 'اختر وقتًا آخر',
  'No free times this week.': 'لا أوقات متاحة هذا الأسبوع.',
  Earlier: 'أبكر',
  Later: 'لاحقًا',
  'Book a time': 'احجز وقتًا',
  'A code goes to your email; the time is yours once you type it here. Nothing is kept before that.':
    'يصلك رمز على بريدك؛ ويصبح الوقت لك حين تكتبه هنا. لا يُحفظ شيء قبل ذلك.',
  // A provisional person's history claimed only with the address's code (H1).
  'Messages are waiting for this address on Caime, and this Caime can’t send the code that proves it’s yours yet. Use another address, or try again later.':
    'لهذا العنوان رسائل بانتظاره على Caime، ولا يستطيع Caime هذا بعدُ إرسال الرمز الذي يثبت أنه لك. استخدم عنوانًا آخر، أو حاول لاحقًا.',
  'Messages are waiting for this address on Caime. We sent it a six-digit code: type it here to bring them into your account.':
    'لهذا العنوان رسائل بانتظاره على Caime. أرسلنا إليه رمزًا من ستة أرقام: اكتبه هنا لتُضاف الرسائل إلى حسابك.',
  'That page': 'تلك الصفحة',
  'Your earlier booking here is still waiting for an answer. Join {site} with the same address to follow it.':
    'حجزك السابق هنا لا يزال بانتظار الرد. انضم إلى {site} بالعنوان نفسه لتتابعه.',
  'They’ve left that call.': 'انتهت المكالمة لهذا الجهاز.',
  '{n} invites are open: take one back first.': '{n} دعوة مفتوحة: يلزم سحب واحدة أولًا.',
  '{name} joined {org}’s team': 'انضمام {name} إلى فريق {org}',
  'a team invitation': 'دعوة إلى فريق',
  'The address it was sent to, alone': 'العنوان الذي أُرسلت إليه وحده',
  'Whoever has this link': 'كل من لديه هذا الرابط',
  'Sign up or sign in, then join: its conversations with customers are in your Business inbox, no app to install.':
    'إنشاء حساب أو تسجيل الدخول، ثم الانضمام: محادثاتها مع العملاء في صندوق الأعمال، دون تثبيت أي تطبيق.',
  'Say who it’s for: their name.': 'يلزم اسم الضيف.',
  'This invite isn’t open': 'هذه الدعوة ليست مفتوحة',
  'This invite isn’t open any more.': 'هذه الدعوة لم تعد مفتوحة.',
  'It may have run out, or been taken back. Ask whoever sent it for a new one.':
    'ربما انتهت مدتها أو سُحبت. يمكن طلب دعوة جديدة ممن أرسلها.',
  'Join links aren’t available here.': 'روابط الانضمام غير متاحة هنا.',
  '{n} links are open: take one back first.': 'عدد الروابط المفتوحة {n}: يلزم سحب أحدها أولًا.',
  'That link': 'ذلك الرابط',
  'It’s full: {n} people are in it.': 'اكتمل العدد: الحد {n}.',
  'They can’t join while a link to it is open.': 'لا يمكن الانضمام ما دام رابط إليها مفتوحًا.',
  'Join links are made by people 18 or over.': 'إنشاء روابط الانضمام لمن بلغ 18 عامًا.',
  'Join links are for people 18 or over: ask someone in it to add you.':
    'روابط الانضمام لمن بلغ 18 عامًا: يمكن أن يضيفك أحد أعضائها.',
  'This link can’t add you to it.': 'لا يمكن لهذا الرابط أن يضيفك إليها.',
  'an invitation to a space': 'دعوة إلى مساحة',
  'an invitation to a group': 'دعوة إلى مجموعة',
  'Sign up or sign in, then join: you read what was said there before you came, and its people see your name.':
    'التسجيل أو الدخول، ثم الانضمام: ما قيل فيها قبل وصولك يظهر لك، واسمك يظهر لمن فيها.',
  'You can join {org}’s team': 'الانضمام إلى فريق {org} متاح لك',
  'Your address at {domain} lets you in.': 'عنوانك في {domain} يتيح لك ذلك.',
  'Confirm your address first: it’s what lets you join.':
    'يلزم تأكيد عنوانك أولًا: هو ما يتيح الانضمام.',
  'No address of yours lets you join this team.': 'لا عنوان لك يتيح الانضمام إلى هذا الفريق.',
  'This way to keep the meeting has run out. Open your link again, and keep it from there.':
    'انتهت مهلة هذه الطريقة للاحتفاظ بالاجتماع. افتح رابطك من جديد واحتفظ به من هناك.',
  'Only a meeting’s guest keeps it this way.': 'هذه الطريقة لضيوف الاجتماعات فقط.',
  'Keeping a meeting is for people over 18.': 'الاحتفاظ باجتماع لمن تجاوزوا 18 عامًا.',
  'Messages are waiting for this address on Caime. Keep the meeting with another address.':
    'لهذا العنوان رسائل بانتظاره على Caime. الاحتفاظ بالاجتماع ممكن بعنوان آخر.',
  'A WhatsApp group comes over into a group of its own.': 'تُنقل مجموعة واتساب إلى مجموعة مستقلة.',
  'Only its owner and admins bring a chat over.': 'نقل المحادثات لمالكها ومشرفيها فقط.',
  'Every message names one of the names.': 'كل رسالة تحمل أحد الأسماء.',
  'Everyone a name is taken as is someone in this group.': 'كل اسم يُنسب إلى شخص في هذه المجموعة.',
  'This group has a topic called “{title}” already. Name this one otherwise.':
    'في هذه المجموعة موضوع باسم “{title}” من قبل. يلزم اسم آخر لهذا الموضوع.',
  '{name} asks to join “{place}”': 'طلب انضمام من {name} إلى «{place}»',
  'Let them in, or not, from its people.': 'القبول أو الرفض من قائمة الأشخاص.',
  'That ask': 'ذلك الطلب',
  'Sign up or sign in, then ask: its owner or an admin lets each person in. Once in, you read what was said there before you came.':
    'إنشاء حساب أو تسجيل الدخول، ثم الطلب: يقبل المالك أو أحد المشرفين كل شخص. وبعد الانضمام تُقرأ الرسائل السابقة كلها.',
  'Asks to join are answered by people 18 or over.': 'الرد على طلبات الانضمام لمن تجاوزوا 18 عامًا.',
  'This link can’t add them to it.': 'لا يمكن لهذا الرابط إضافة هذا الشخص.',
  'You’re in “{place}”': 'تم الانضمام إلى «{place}»',
  'Your ask to join was accepted.': 'تم قبول طلب الانضمام.',
  'Sign in to message {name}': 'سجّل الدخول لمراسلة {name}',
  'Writing without an account isn’t available here yet. Join {site} to message {name}.':
    'المراسلة بلا حساب غير متاحة هنا بعد. انضم إلى {site} لمراسلة {name}.',
  'That can’t be sent from here.': 'لا يمكن إرسال هذا من هنا.',
  'Write your message, up to {n} characters.': 'اكتب رسالتك، بحدّ أقصى {n} حرف.',
  'That took too long. Write your message again.': 'طال الوقت أكثر من اللازم. اكتب رسالتك من جديد.',
  'That code has run out. Send your message again for a new one.':
    'انتهت صلاحية هذا الرمز. أرسل رسالتك من جديد للحصول على رمز جديد.',
  'Your message is with {name}.': 'وصلت رسالتك إلى {name}.',
  'Their answer comes to {email} by email. Reply to it to write to them again.':
    'يصلك الردّ على {email} بالبريد الإلكتروني، والردّ عليه يصل إلى المحادثة نفسها.',
  'To read their answer, join {site} free with {email}: your conversation will be there.':
    'لقراءة الردّ، انضم إلى {site} مجانًا بالعنوان {email}: المحادثة في انتظارك هناك.',
  'A six-digit code went to {email}. Type it to send your message to {name}.':
    'أُرسل رمز من ستة أرقام إلى {email}. اكتبه لإرسال رسالتك إلى {name}.',
  'Change what I wrote': 'تعديل ما كتبتُه',
  'A code goes to your email; your message goes once you type it here. {name} answers by email: no account needed.':
    'يصلك رمز على بريدك؛ وتُرسَل رسالتك حين تكتبه هنا. يأتي ردّ {name} بالبريد الإلكتروني، بلا حاجة إلى حساب.',
  'A code goes to your email; your message goes once you type it here. Join {site} with that address to read the answer.':
    'يصلك رمز على بريدك؛ وتُرسَل رسالتك حين تكتبه هنا. انضم إلى {site} بهذا العنوان لقراءة الردّ.',
  'Under 18, a link connects you with someone you know through someone. Ask {name} to connect through a person you both know.':
    'دون 18 عامًا، يصلك الرابط بمن تعرفه عن طريق شخص آخر فقط. اطلب من {name} أن يتواصل معك عن طريق شخص تعرفانه كلاكما.',
  'That address can’t be written to by email from here. If they’re on Caime, find them there.':
    'لا يمكن مراسلة هذا العنوان بالبريد الإلكتروني من هنا. إن كان صاحبه على Caime فابحث عنه هناك.',
  'This organization is suspended, so nothing is written here for now.':
    'هذه المؤسسة معلّقة، فلا كتابة هنا في الوقت الحالي.',
  'This organization is suspended, so nothing is posted for now.':
    'هذه المؤسسة معلّقة، فلا نشر في الوقت الحالي.',
  'This report isn’t about an organization.': 'هذا البلاغ لا يخص مؤسسة.',
  'Join it, or not, from Attention.': 'انضمّ إليها أو لا، من «الاهتمام».',
  'That invitation isn’t open any more.': 'هذه الدعوة لم تعد قائمة.',
  'That’s {n} message requests today. Try again tomorrow, or connect with them first.':
    'بلغت طلبات المراسلة اليوم حدّها ({n}). حاول غدًا، أو تواصل أولًا.',
  'This account is suspended. You can appeal, and download your data.':
    'هذا الحساب موقوف. يمكن الاعتراض وتنزيل البيانات.',
  'That took too long, or the account isn’t suspended any more. Sign in again.':
    'استغرق ذلك وقتًا طويلًا، أو لم يعد الحساب موقوفًا. سجّل الدخول من جديد.',
  'Too many reports from here just now. Try again in an hour.':
    'بلاغات كثيرة من هنا للتو. حاول مجددًا بعد ساعة.',
  'Give your name and an email address we can write to (not needed for a child’s safety).':
    'اكتب الاسم وعنوان بريد إلكتروني للمراسلة (لا حاجة لهما في بلاغ عن سلامة طفل).',
  'Say what’s wrong in a few words.': 'اذكر المشكلة ببضع كلمات.',
  'Tick the box to say what you wrote is accurate.': 'ضع علامة في المربع لتأكيد دقة ما كُتب.',
  'Thanks. Someone at Caime reads every report; if you left your email, we’ll write to you there when it’s decided.':
    'شكرًا. في Caime من يقرأ كل بلاغ؛ وإن تُرك بريد إلكتروني فسيصل إليه الرد حين يُتخذ القرار.',
  'What you saw': 'ما شوهد',
  'I believe what I wrote here is accurate and complete.': 'أعتقد أن ما كتبته هنا دقيق وكامل.',
  'Send the report': 'إرسال البلاغ',
  'Your name and email are needed, unless it’s about a child’s safety. Caime writes to you when it has decided.':
    'الاسم والبريد الإلكتروني مطلوبان، إلا في بلاغ عن سلامة طفل. ويصل رد Caime حين يُتخذ القرار.',
  'Report this page': 'الإبلاغ عن هذه الصفحة',
  'That appeal': 'ذلك الاعتراض',
  'That appeal was decided already.': 'اتُّخذ قرار في ذلك الاعتراض بالفعل.',
  'Age checks aren’t available here.': 'التحقق من العمر غير متاح هنا.',
  'Before this, Caime asks you to check your age once. It takes a minute.':
    'قبل ذلك، يطلب Caime التحقق من العمر مرة واحدة. يستغرق ذلك دقيقة.',
  'That’s as many age checks as a day allows. Try again tomorrow.':
    'هذا أقصى عدد لعمليات التحقق من العمر في اليوم. حاول مجددًا غدًا.',
  '{monthly}, or {yearly}': '{monthly}، أو {yearly}',
  '{free}, always': '{free}، دائمًا',
  'Accounts are connected by people over 18.': 'ربط الحسابات لمن تجاوز 18 عامًا.',
  'A private reply is written in a chat between two people.':
    'يُكتب الرد الخاص في محادثة بين شخصين.',
  'That message can’t be answered privately here.': 'لا يمكن الرد على هذه الرسالة بشكل خاص هنا.',
  'That video couldn’t be read, so it wasn’t sent. Try another.':
    'تعذّرت قراءة هذا الفيديو، لذا لم يُرسل. جرّب فيديو آخر.',
  'That recording couldn’t be read, so it wasn’t sent. Try another.':
    'تعذّرت قراءة هذا التسجيل، لذا لم يُرسل. جرّب تسجيلًا آخر.',
  Memory: 'الذاكرة',
  'That action': 'ذلك الإجراء',
  'Choose how you know them from the list.': 'اختر كيف تعرفهم من القائمة.',
  'You’re on {plan} already.': 'أنت على خطة {plan} بالفعل.',
  'It’s on {plan} already.': 'إنها على خطة {plan} بالفعل.',
  'You run {count} on the {plan} plan already. Move one to {next}, or close one, to start another.':
    'لديك {count} على خطة {plan} بالفعل. انقل واحدة إلى {next} أو أغلق واحدة لتبدأ أخرى.',
  'an owner': 'المالك',
  'runs up to {count} on the {plan} plan at once; those on {next} don’t count.':
    'يدير حتى {count} على خطة {plan} في الوقت نفسه، ولا تُحسب التي على {next}.',
  'We’re open again {when}.': 'نعود {when}.',
  'We’re open again on {date}.': 'نعود يوم {date}.',
  'That customer': 'ذلك العميل',
  'That field isn’t one of the organization’s.': 'هذا الحقل ليس من حقول المؤسسة.',
  '{question} can’t be kept in that field.': 'لا يمكن حفظ «{question}» في ذلك الحقل.',
  'That form isn’t one of the organization’s.': 'هذا النموذج ليس من نماذج المؤسسة.',
  'That form': 'ذلك النموذج',
  'Only the customer it was sent to fills it in.': 'لا يملؤه إلا العميل الذي أُرسل إليه.',
  'That form was answered already.': 'تمت الإجابة عن هذا النموذج من قبل.',
  'Forms are sent by an organization to its customers.': 'ترسل المؤسسة النماذج إلى عملائها.',
  'Someone reached by mail can’t fill in a form yet.': 'لا يمكن تعبئة نموذج بعد لمن يُراسَل بالبريد.',
  'Only adults give out links to their files.': 'روابط الملفات للبالغين وحدهم.',
  'Slide {number}': 'الشريحة {number}',
  Spreadsheet: 'جدول بيانات',
  Presentation: 'عرض تقديمي',
  Table: 'جدول',
  'Plain text': 'نص',
  Audio: 'صوت',
  'This file can’t be shown as a page. Download it to open it.':
    'لا يمكن عرض هذا الملف كصفحة، ويُفتح بعد تنزيله.',
  'The page stops here: the rest is in the file.': 'تتوقف الصفحة هنا: البقية في الملف.',
  'What the file holds, as words and tables: its look, pictures and charts are in the file itself.':
    'ما في الملف من كلمات وجداول: تنسيقه وصوره ومخططاته في الملف نفسه.',
  '{name} shared a file with you on {site}.': 'ملف من {name} على {site}.',
  'a shared file': 'ملف مشترَك',
  'Shared by {name}': 'مشاركة من {name}',
  file: 'الملف',
  'Whoever has this link and is signed in to {site}': 'من لديه هذا الرابط وسجّل الدخول إلى {site}',
  'Sign in to open this file': 'تسجيل الدخول لفتح هذا الملف',
  'Only someone signed in to {site} opens this link.':
    'لا يفتح هذا الرابط إلا من سجّل الدخول إلى {site}.',
  'Only someone signed in to {site} opens this link. Sign in in this browser, then open the link again.':
    'لا يفتح هذا الرابط إلا من سجّل الدخول إلى {site}. بعد تسجيل الدخول في هذا المتصفح، يُفتح الرابط من جديد.',
  'Sign up': 'التسجيل',
  'This link isn’t open': 'هذا الرابط غير متاح',
  'This link isn’t open any more.': 'لم يعد هذا الرابط متاحًا.',
  'This app proves itself with PKCE alone: it has no secret to replace.':
    'يثبت هذا التطبيق نفسه بـ PKCE وحده: ليس له سر لاستبداله.',
  '{name} needs connecting again': 'يحتاج {name} إلى ربط من جديد',
  'Caime can’t use it for you until you connect it again in Settings · Apps.':
    'لا يستطيع Caime استخدامه من أجلك حتى تربطه من جديد في الإعدادات · التطبيقات.',
  'This organization keeps its conversations from its members’ own apps.':
    'تُبقي هذه المؤسسة محادثاتها بعيدًا عن التطبيقات الخاصة بأعضائها.',
  'That cursor isn’t one this feed gave you: ask once without it.':
    'هذا المؤشر لم يمنحك إياه هذا الموجز: اطلب مرة دونه.',
  'The feed began again since that cursor: ask once without it.':
    'بدأ الموجز من جديد منذ ذلك المؤشر: اطلب مرة دونه.',
  '{agentName} drafted an answer for you to check': 'كتب {agentName} مسودة إجابة بانتظار المراجعة',
  'That draft was sent, let go or replaced already.':
    'أُرسلت هذه المسودة أو استُبعدت أو حلّت محلها أخرى.',
  'The conversation moved on since that draft: answer it yourself.':
    'تقدّمت المحادثة منذ هذه المسودة: أجب بنفسك.',
  'The AI agent is paused or gone: answer it yourself.':
    'وكيل الذكاء الاصطناعي متوقف أو أُزيل: أجب بنفسك.',
  'That question': 'هذا السؤال',
  'That draft': 'هذه المسودة',
  'Nothing from a private conversation is kept on the server.':
    'لا يُحفظ على الخادم شيء من محادثة خاصة.',
  '{plan} includes more.': 'تتضمن {plan} المزيد.',
  'You’ve used the AI assist your plan includes for now. There’s more {when}.{more}':
    'استنفدت مساعدة الذكاء الاصطناعي التي تتضمنها خطتك حاليًا. يتوفر المزيد {when}.{more}',
  'up to {n} answers a day, on our most capable model': 'حتى {n} إجابة في اليوم، بأقدر نماذجنا',
  'up to {n} answers a day, on a fast model': 'حتى {n} إجابة في اليوم، بنموذج سريع',
  'for everyday use, once you turn it on': 'للاستخدام اليومي، متى شغّلته',
  'more each day, and follow-ups found by our most capable model':
    'أكثر كل يوم، ومتابعات يجدها أقدر نماذجنا',
  // M16 G11: Cai about one person.
  'I don’t know who “{name}” is among your people.': 'لا أعرف من «{name}» بين من تعرفهم.',
  'You’re waiting on {who} for {n} things:': {
    zero: 'لا تنتظر من {who} أي أمر:',
    one: 'تنتظر من {who} أمرًا واحدًا:',
    two: 'تنتظر من {who} أمرين:',
    few: 'تنتظر من {who} {n} أمور:',
    many: 'تنتظر من {who} {n} أمرًا:',
    other: 'تنتظر من {who} {n} أمر:',
  },
  'You’re not waiting on {who} for anything.': 'لا تنتظر من {who} أي شيء.',
  'From {who}, {n} things are asked of you:': {
    zero: 'لا شيء مطلوب منك من {who}:',
    one: 'من {who}، أمر واحد مطلوب منك:',
    two: 'من {who}، أمران مطلوبان منك:',
    few: 'من {who}، {n} أمور مطلوبة منك:',
    many: 'من {who}، {n} أمرًا مطلوبًا منك:',
    other: 'من {who}، {n} أمر مطلوب منك:',
  },
  'Nothing is asked of you by {who}.': 'لا شيء مطلوب منك من {who}.',
  'You said you’d do {n} things for {who}:': {
    zero: 'لم تعد {who} بشيء:',
    one: 'وعدت {who} بأمر واحد:',
    two: 'وعدت {who} بأمرين:',
    few: 'وعدت {who} بـ{n} أمور:',
    many: 'وعدت {who} بـ{n} أمرًا:',
    other: 'وعدت {who} بـ{n} أمر:',
  },
  'Nothing you said you’d do for {who} is open.': 'لا شيء مما وعدت به {who} مفتوح.',
  'Coming up with {who}:': 'القادم مع {who}:',
  'Nothing is planned with {who} in the next two months.':
    'لا شيء مخطط مع {who} في الشهرين القادمين.',
  'What you and {who} decided:': 'ما تقرّر بينك وبين {who}:',
  'Nothing you and {who} decided is kept yet.': 'لا قرار محفوظ بينك وبين {who} بعد.',
  'Payments from {who}:': 'المدفوعات من {who}:',
  'No card asks {who} to pay you.': 'لا بطاقة تطلب من {who} الدفع لك.',
  'Or ask about one of your people, by name or as you know them: what you’re waiting for from them, what they asked of you, what you agreed and whether they paid.':
    'أو اسأل عن أحد من تعرفهم، بالاسم أو بالصلة: ما تنتظره، وما هو مطلوب منك، وما اتُّفق عليه، والمدفوعات.',
  'You can follow up {when}: once a day, twice at most, until they answer.':
    'يمكنك المتابعة {when}: مرة في اليوم، ومرتين على الأكثر، إلى أن يصل رد.',
  'Ways to pay {name}:': 'طرق الدفع إلى {name}:',
  '{name} is paying you this.': 'دفعة من {name} إليك.',
  '{name} asks you to pay this.': 'طلب دفع من {name}.',
  'Answer it from your calendar: your answer reaches {name} on Caime.':
    'أجب من تقويمك: يصل ردّك إلى {name} على Caime.',
  'Voice note, {duration}': 'رسالة صوتية، {duration}',
  'A place': 'مكان',
  'New time': 'موعد جديد',
  'Accepted: {title}': 'قبول: {title}',
  'Declined: {title}': 'اعتذار: {title}',
  'Only a meeting or an appointment takes another time.': 'لا يأخذ وقتًا آخر إلا اجتماع أو موعد.',
  'Each time of a series keeps its own: cancel this one and send another.':
    'لكل مرة من السلسلة وقتها: ألغِ هذه وأرسل غيرها.',
  'It’s their calendar’s meeting: only they can move it.':
    'الاجتماع من تقويم الطرف الآخر: لا يغيّر وقته سواه.',
  'It has its own space now: suggest another time there.':
    'للاجتماع مساحته الآن: اقترح وقتًا آخر فيها.',
  'They booked without an account: cancel it, and they can book another time from your page.':
    'تمّ الحجز دون حساب: ألغِه، ويمكن حجز وقت آخر من صفحتك.',
  'A booking lasts as long as what was booked: choose its time alone.':
    'مدة الحجز هي مدة ما حُجز: اختر وقته فقط.',
  'With {names}': 'مع {names}',
  'Choose one of your places that anyone may see.': 'اختر أحد أماكنك التي يمكن لأي أحد رؤيتها.',
  'Waiting on {name}: {title}': 'في انتظار {name}: {title}',
  '{name} asked you.': 'طلبٌ من {name}.',
  'One of your actions.': 'أحد إجراءاتك.',
  'You’re waiting on {name}.': 'في انتظار {name}.',
  Action: 'إجراء',
  'Free for people. Organizations pay for their team.': 'مجاني للأفراد. والمؤسسات تدفع لفريقها.',
  'You’re not in that call.': 'لست في تلك المكالمة.',
  'Cai can’t take notes on this Caime yet.': 'لا يستطيع Cai تدوين الملاحظات على Caime هذا بعد.',
  'Cai doesn’t take notes in a private conversation: nothing said there reaches Caime.':
    'لا يدوّن Cai الملاحظات في محادثة خاصة: لا يصل شيء مما يُقال فيها إلى Caime.',
  'Only someone on Caime can ask Cai to take notes.':
    'طلب التدوين من Cai لمن لديه حساب على Caime فقط.',
  'This device isn’t taking notes in that call.': 'هذا الجهاز لا يدوّن الملاحظات في تلك المكالمة.',
  'That line': 'ذلك السطر',
  'Attach a recording.': 'التسجيل مطلوب.',
  'That isn’t a recording Caime reads.': 'هذا ليس تسجيلًا يقرؤه Caime.',
  'Cai can’t take notes in this conversation.': 'لا يمكن لـCai تدوين الملاحظات في هذه المحادثة.',
  'Cai takes notes only in a meeting held on Caime.':
    'يدوّن Cai الملاحظات في الاجتماعات على Caime فقط.',
  'Cai takes notes in the call, once everyone in it says yes.':
    'يدوّن Cai الملاحظات في المكالمة، حين يوافق كل من فيها.',
  '{speaker} said {quote}': 'قيل في المكالمة {quote}: {speaker}',
  '{name} isn’t on Caime yet. A meeting held on Caime mails {name} a link to its call.':
    'لا حساب لـ {name} على Caime بعد. موعد على Caime يصل {name} بالبريد مع رابط لمكالمته.',
  '{name} hasn’t opened the link Caime mailed yet. When {name} joins from it, the call rings here.':
    'لم يُفتح بعد الرابط الذي أرسله Caime إلى {name}. عند انضمام {name} منه، ترنّ المكالمة هنا.',
  'It’s a call on Caime. At its time, join it from your own link: {link}':
    'إنها مكالمة على Caime. في موعدها، الانضمام إليها من رابطك الخاص: {link}',
  'I’ll remind you: “{title}”': 'سأذكّرك: «{title}»',
  'Saved to your actions: “{title}”': 'تم الحفظ في إجراءاتك: «{title}»',
  'What should I keep? Write it after “Remind me to” or “Add an action:”, and I’ll save it.':
    'ماذا أحفظ؟ اكتبه بعد «ذكّرني أن» أو «أضف مهمة:»، وسأحفظه.',
  'Let’s look for “{query}” in your conversations.': 'لنبحث عن «{query}» في محادثاتك.',
  'Which one do you mean: {names}?': 'من المقصود: {names}؟',
  'You and {name} have no chat yet. Once you’ve written to {name}, you can call from it.':
    'لا محادثة بينك وبين {name} بعد. بعد أول رسالة إلى {name}، تصبح المكالمة منها ممكنة.',
  'Ready when you are: a video call with {name}.': 'جاهزة متى شئت: مكالمة فيديو مع {name}.',
  'Ready when you are: a call with {name}.': 'جاهزة متى شئت: مكالمة مع {name}.',
  'What should I tell {name}?': 'ماذا أقول لـ{name}؟',
  'Here’s a message for {name}. Shall I send it?': 'هذه رسالة إلى {name}. أرسلها؟',
  'When should the meeting with {name} be? A day and a time, like “tomorrow at 3”.':
    'متى يكون الاجتماع مع {name}؟ يوم وساعة، مثل «غدًا الساعة 3».',
  'Here’s a meeting about “{title}” for you and {name}: {when}, on Caime. Shall I send it?':
    'هذا اجتماع عن «{title}» بينك وبين {name}: {when}، على Caime. أرسله؟',
  'Here’s a meeting for you and {name}: {when}, on Caime. Shall I send it?':
    'هذا اجتماع بينك وبين {name}: {when}، على Caime. أرسله؟',
  'That one starts on your device.': 'هذا يبدأ من جهازك.',
  'Open your chat with {name} first.': 'يلزم فتح المحادثة مع {name} أولًا.',
  'That isn’t your chat with {name}.': 'هذه ليست المحادثة مع {name}.',
  'Your notes from the call with {name} are ready.': 'ملاحظات مكالمتك مع {name} جاهزة.',
  'Your notes from the call are ready.': 'ملاحظات المكالمة جاهزة.',
  '{agentName} booked a time for the team to confirm': 'حجز {agentName} موعدًا بانتظار تأكيد الفريق',
  '{agentName} took an order for the team to confirm': 'سجّل {agentName} طلبًا بانتظار تأكيد الفريق',
  'I couldn’t book that time. Someone from {org} will answer you here.':
    'تعذّر حجز هذا الموعد، وسيرد عليك أحد من فريق {org} هنا.',
  'I couldn’t take that order. Someone from {org} will answer you here.':
    'تعذّر تسجيل هذا الطلب، وسيرد عليك أحد من فريق {org} هنا.',
  'That time isn’t open any more: answer it yourself.': 'لم يعد هذا الموعد متاحًا: أجب بنفسك.',
  'That order can’t be taken as it stands now: answer it yourself.':
    'لا يمكن تسجيل هذا الطلب كما هو الآن: أجب بنفسك.',
  '{name} said it would be done by now': 'حلّ موعد {name} لإنجاز هذا',
  '{name} wrote “{words}”': 'رسالة {name}: «{words}»',
  'You wrote “{words}”': 'رسالتك: «{words}»',
  '{name} sent something here': 'وصل شيء من {name} هنا',
  'You sent something here': 'أرسلت شيئًا هنا',
  'That action was closed already.': 'هذا الإجراء مُغلق بالفعل.',
  '{name} sent something. Is it done?': 'وصل شيء من {name}. هل أُنجز؟',
  'Still waiting on {name}': 'لا يزال بانتظار {name}',
  '{name} said “{title}” would be done by now. Shall I send this?':
    'حلّ موعد {name} لإنجاز «{title}». هل أرسل هذه؟',
  'Still waiting on {name} for “{title}”. Shall I send this?':
    'ما زال «{title}» بانتظار {name}. هل أرسل هذه؟',
  'This device isn’t recording that call.': 'هذا الجهاز لا يسجّل تلك المكالمة.',
  'This call’s recording can’t hold any more parts.': 'لا يتّسع تسجيل هذه المكالمة لأجزاء أخرى.',
  'That piece of the recording is too large.': 'هذه القطعة من التسجيل كبيرة جدًا.',
  'That recording': 'ذلك التسجيل',
  'That part of the recording has ended.': 'انتهى هذا الجزء من التسجيل.',
  'Cai isn’t recording that call any more.': 'لم يعد Cai يسجّل تلك المكالمة.',
  'That part of the recording is as long as it can be.': 'بلغ هذا الجزء من التسجيل أقصى طول له.',
  'Only whoever asked Cai to record this call may keep its recording.':
    'لا يحتفظ بتسجيل هذه المكالمة إلا من طلب من Cai تسجيلها.',
  'The recording can be kept once the call is over and it’s ready to play.':
    'يمكن الاحتفاظ بالتسجيل بعد انتهاء المكالمة وجاهزيته للتشغيل.',
  'This organization keeps its conversations for a set time, so the recording can’t be kept past its day.':
    'تحتفظ هذه المؤسسة بمحادثاتها لمدة محددة، لذا لا يمكن الاحتفاظ بالتسجيل بعد يومه.',
  'Cai is already being asked to record this call.': 'يُطلب من Cai تسجيل هذه المكالمة بالفعل.',
  'Cai is already being asked to take notes in this call.':
    'يُطلب من Cai تدوين ملاحظات هذه المكالمة بالفعل.',
  'The recording can be shared once the call is over and it’s ready to play.':
    'يمكن مشاركة التسجيل بعد انتهاء المكالمة وحين يصبح جاهزًا للتشغيل.',
  'A recording isn’t shared into a private conversation.': 'لا يُشارك تسجيل في محادثة خاصة.',
  'A recording isn’t shared into a customer conversation.': 'لا يُشارك تسجيل في محادثة عميل.',
  'A call’s recording is shared from its notes by someone who was in it.':
    'تسجيل المكالمة يشاركه من كان فيها، من ملاحظاتها.',
  'I’ve written that to you.': 'كتبتُ لك ذلك.',
  'Saved to your actions.': 'حُفظ في إجراءاتك.',
  'Say what to keep after “remind me to”.': 'قل ما تريد حفظه بعد «ذكّرني أن».',
  'I’ve prepared that in our chat, for you to send.': 'أعددتُ ذلك في محادثتنا، لترسله أنت.',
  'I’ve prepared that in our chat.': 'أعددتُ ذلك في محادثتنا.',
  'I can’t answer that here yet.': 'لا أستطيع الإجابة عن ذلك هنا بعد.',
  'Nothing has been said yet for me to answer from.': 'لم يُقل شيء بعد لأجيب منه.',
  'Hi, I’m Cai, Caime’s AI assistant. Say my name and I’ll answer from the call; whatever I say goes in the notes.':
    'مرحبًا، أنا كاي، مساعد كايم بالذكاء الاصطناعي. قل اسمي وسأجيب مما قيل في المكالمة؛ وكل ما أقوله يُدوَّن في الملاحظات.',
  'Only the device recording the call plays Cai’s voice.':
    'الجهاز الذي يسجّل المكالمة وحده يشغّل صوت كاي.',
  'That sound': 'ذلك الصوت',
  'Cai can’t join in on this Caime yet.': 'لا يستطيع كاي المشاركة على هذا الكايم بعد.',
  'Cai is already being asked to join this call.': 'كاي مطلوب بالفعل للمشاركة في هذه المكالمة.',
  'What should I keep? Say it after “Remind me to” or “Add an action:”.':
    'ماذا أحفظ؟ قله بعد «ذكّرني أن» أو «أضف إجراءً:».',
  'You asked in a call: “{words}”': 'طلبك في مكالمة: «{words}»',
  'That picture of the screen is too large.': 'صورة الشاشة هذه كبيرة جدًا.',
  'That isn’t a picture Caime reads.': 'هذه ليست صورة يقرؤها Caime.',
  'Only a shown screen has frames.': 'اللقطات للشاشة المعروضة وحدها.',
  'Your screen showed {quote}': 'ظهر على شاشتك {quote}',
  '{name}’s screen showed {quote}': 'ظهر على شاشة {name} {quote}',
  'I can’t see a screen right now.': 'لا أرى شاشة الآن.',
  'Only the device recording the call shows Cai the screen.':
    'الجهاز الذي يسجّل المكالمة وحده يُري Cai الشاشة.',
  'Asked of you: {text}': 'مطلوب منك: {text}',
  'Promised: {text}': 'وعد: {text}',
  'Decided: {text}': 'تقرر: {text}',
  'Coming up: {text}': 'قادم: {text}',
  'Nothing new since you last looked.': 'لا جديد منذ آخر مرة اطلعت فيها.',
  'You missed {messages} in {conversations}.': 'فاتك {messages} في {conversations}.',
  'In short: {summary}': 'باختصار: {summary}',
  'Busy in your calendar': 'وقت محجوز في تقويمك',
  '{when} is free, until {until}.': '{when} متاح، حتى {until}.',
  '{when} is taken: {what}.': '{when} محجوز: {what}.',
  'Nothing else is free that day.': 'لا وقت متاحًا غيره في ذلك اليوم.',
  'The next free time that day: {next}.': 'أقرب وقت متاح في ذلك اليوم: {next}.',
  '{day} isn’t one of your working days.': '{day} ليس من أيام عملك.',
  'Busy: {items}.': 'ما يشغل وقتك: {items}.',
  'Nothing is planned.': 'لا شيء مخطط له.',
  '{day}: you’re free all day, {hours}.': '{day}: يومك كله متاح، {hours}.',
  '{day}: nothing is free in your day, {hours}.': '{day}: لا وقت متاحًا في يومك، {hours}.',
  '{day}: you’re free {times}.': '{day}: الأوقات المتاحة {times}.',
  'Asked, not yet agreed: {items}.': 'مطلوبة ولم يُتفق عليها بعد: {items}.',
  'You have {what} then; {time} is free that day.':
    'عندك {what} في هذا الوقت؛ و{time} متاح في ذلك اليوم.',
  'You have {what} then, and nothing else is free that day.':
    'عندك {what} في هذا الوقت، ولا وقت متاحًا غيره في ذلك اليوم.',
  'I can’t find that among your meetings and appointments in the next two weeks.':
    'لا أجد ذلك بين اجتماعاتك ومواعيدك في الأسبوعين القادمين.',
  'Which one do you mean?': 'أيّها المقصود؟',
  'When should “{title}” move to? A day or a time, like “tomorrow at 3”.':
    'إلى متى يُنقل «{title}»؟ يوم أو ساعة، مثل «غدًا الساعة 3».',
  '“{title}” is at that time already.': '«{title}» في هذا الوقت أصلًا.',
  'Shall I suggest {when} for “{title}”, in place of {from}? {name} will be asked to agree.':
    'أقترح {when} لـ«{title}» بدلًا من {from}؟ ستُطلب موافقة {name}.',
  'Shall I suggest {when} for “{title}”, in place of {from}? Everyone in it will be asked to agree.':
    'أقترح {when} لـ«{title}» بدلًا من {from}؟ ستُطلب موافقة الجميع فيه.',
  'I can’t hear voice notes here yet. Write it to me, and I’ll answer.':
    'لا أسمع الرسائل الصوتية هنا بعد. اكتبها لي، وسأجيب.',
  'I hear voice notes with AI assist on: Settings, then AI assist. Or write it to me.':
    'أسمع الرسائل الصوتية مع تشغيل مساعدة الذكاء الاصطناعي: الإعدادات، ثم مساعدة الذكاء الاصطناعي. أو اكتبها لي.',
  'That’s today’s AI assist used, so I couldn’t hear that one. Write it to me, and I’ll answer.':
    'انتهت مساعدة الذكاء الاصطناعي لليوم، فلم أسمع هذه. اكتبها لي، وسأجيب.',
  'That one’s longer than I can hear. Send a shorter one, or write it to me.':
    'هذه أطول مما أستطيع سماعه. أرسل أقصر منها، أو اكتبها لي.',
  'Write it to me, and I’ll answer.': 'اكتبها لي، وسأجيب.',
  'I couldn’t make that one out. Try again, or write it to me.':
    'لم أتبيّن هذه. جرّب مرة أخرى، أو اكتبها لي.',
  '• {n} customers waiting for a reply, the longest since {when}': {
    zero: '• لا أحد ينتظر ردًا ({when})',
    one: '• عميل واحد ينتظر ردًا منذ {when}',
    two: '• عميلان ينتظران ردًا، أقدمهما منذ {when}',
    few: '• {n} عملاء ينتظرون ردًا، أقدمهم منذ {when}',
    many: '• {n} عميلًا ينتظرون ردًا، أقدمهم منذ {when}',
    other: '• {n} عميل ينتظرون ردًا، أقدمهم منذ {when}',
  },
  '• The AI agent answered all {n}; nobody on the team has yet': {
    zero: '• لا ردود من وكيل الذكاء الاصطناعي بعد',
    one: '• ردّ وكيل الذكاء الاصطناعي على المحادثة، ولا رد من الفريق بعد',
    two: '• ردّ وكيل الذكاء الاصطناعي على المحادثتين، ولا رد من الفريق بعد',
    few: '• ردّ وكيل الذكاء الاصطناعي على المحادثات الـ{n} كلها، ولا رد من الفريق بعد',
    many: '• ردّ وكيل الذكاء الاصطناعي على المحادثات الـ{n} كلها، ولا رد من الفريق بعد',
    other: '• ردّ وكيل الذكاء الاصطناعي على المحادثات الـ{n} كلها، ولا رد من الفريق بعد',
  },
  '• The AI agent answered {n} of them; nobody on the team has yet': {
    zero: '• لم يرد وكيل الذكاء الاصطناعي في أي محادثة بعد',
    one: '• ردّ وكيل الذكاء الاصطناعي في محادثة واحدة، ولا رد من الفريق بعد',
    two: '• ردّ وكيل الذكاء الاصطناعي في محادثتين، ولا رد من الفريق بعد',
    few: '• ردّ وكيل الذكاء الاصطناعي في {n} محادثات، ولا رد من الفريق بعد',
    many: '• ردّ وكيل الذكاء الاصطناعي في {n} محادثة، ولا رد من الفريق بعد',
    other: '• ردّ وكيل الذكاء الاصطناعي في {n} محادثة، ولا رد من الفريق بعد',
  },
  '• {n} answers the AI agent wrote are waiting for you to send': {
    zero: '• لا ردود كتبها وكيل الذكاء الاصطناعي بانتظار إرسالك',
    one: '• رد واحد كتبه وكيل الذكاء الاصطناعي بانتظار إرسالك',
    two: '• ردّان كتبهما وكيل الذكاء الاصطناعي بانتظار إرسالك',
    few: '• {n} ردود كتبها وكيل الذكاء الاصطناعي بانتظار إرسالك',
    many: '• {n} ردًا كتبها وكيل الذكاء الاصطناعي بانتظار إرسالك',
    other: '• {n} رد كتبها وكيل الذكاء الاصطناعي بانتظار إرسالك',
  },
  '• {n} questions the AI agent couldn’t answer: teach it in its setup': {
    zero: '• لا أسئلة لم يُجب عنها وكيل الذكاء الاصطناعي',
    one: '• سؤال واحد لم يُجب عنه وكيل الذكاء الاصطناعي: علّمه من إعداداته',
    two: '• سؤالان لم يُجب عنهما وكيل الذكاء الاصطناعي: علّمه من إعداداته',
    few: '• {n} أسئلة لم يُجب عنها وكيل الذكاء الاصطناعي: علّمه من إعداداته',
    many: '• {n} سؤالًا لم يُجب عنها وكيل الذكاء الاصطناعي: علّمه من إعداداته',
    other: '• {n} سؤال لم يُجب عنها وكيل الذكاء الاصطناعي: علّمه من إعداداته',
  },
  '• {n} bookings today, the first at {time}': {
    zero: '• لا حجوزات اليوم ({time})',
    one: '• حجز واحد اليوم، في {time}',
    two: '• حجزان اليوم، أولهما في {time}',
    few: '• {n} حجوزات اليوم، أولها في {time}',
    many: '• {n} حجزًا اليوم، أولها في {time}',
    other: '• {n} حجز اليوم، أولها في {time}',
  },
  'Something needs the team at {n} more of your organizations: ask me about one by name.': {
    zero: 'لا شيء ينتظر الفريق في منظماتك الأخرى.',
    one: 'وفي منظمة أخرى من منظماتك شيء ينتظر الفريق: اسألني عنها باسمها.',
    two: 'وفي منظمتين أخريين من منظماتك ما ينتظر الفريق: اسألني عن أي منهما باسمها.',
    few: 'وفي {n} منظمات أخرى من منظماتك ما ينتظر الفريق: اسألني عن أي منها باسمها.',
    many: 'وفي {n} منظمة أخرى من منظماتك ما ينتظر الفريق: اسألني عن أي منها باسمها.',
    other: 'وفي {n} منظمة أخرى من منظماتك ما ينتظر الفريق: اسألني عن أي منها باسمها.',
  },
  'And {n} more organizations you run: ask me about one by name.': {
    zero: 'ولا منظمات أخرى لك.',
    one: 'ولك منظمة أخرى: اسألني عنها باسمها.',
    two: 'ولك منظمتان أخريان: اسألني عن أي منهما باسمها.',
    few: 'ولك {n} منظمات أخرى: اسألني عن أي منها باسمها.',
    many: 'ولك {n} منظمة أخرى: اسألني عن أي منها باسمها.',
    other: 'ولك {n} منظمة أخرى: اسألني عن أي منها باسمها.',
  },
  'At {org} today:': 'في {org} اليوم:',
  'Nothing needs the team at {org} today.': 'لا شيء ينتظر الفريق في {org} اليوم.',
  'Its inbox: {link}': 'صندوق رسائلها: {link}',
  'I can tell you this every morning: Settings, then Cai, then the morning brief.':
    'أستطيع أن أخبرك بهذا كل صباح: الإعدادات، ثم Cai، ثم الموجز الصباحي.',
  'And ask how one of your organizations is doing: who’s waiting for a reply, what the AI agent left for you and today’s bookings.':
    'واسألني عن حال إحدى منظماتك: من ينتظر ردًا، وما تركه لك وكيل الذكاء الاصطناعي، وحجوزات اليوم.',
  '{name} isn’t answering: two checks in a row failed.': '{name} لا يستجيب: فشل فحصان متتاليان.',
  '{name} answers again.': '{name} يستجيب من جديد.',
  'No backup has been made yet.': 'لم تُصنع أي نسخة احتياطية بعد.',
  'The last backup is older than a day.': 'آخر نسخة احتياطية أقدم من يوم.',
  'The last backup wasn’t copied off the server.': 'آخر نسخة احتياطية لم تُنسخ خارج الخادم.',
  'Backups are made and copied again.': 'النسخ الاحتياطية تُصنع وتُنسخ من جديد.',
  'The audit log’s chain failed its check: the operator’s token reads it.':
    'فشلت سلسلة سجل التدقيق في فحصها: يقرؤها رمز المشغّل.',
  'The audit log’s chain checks out again.': 'سلسلة سجل التدقيق سليمة من جديد.',
  'Every job that failed for good has been dealt with.': 'عولجت كل المهام التي فشلت نهائيًا.',
  'No report about a child’s safety is waiting.': 'لا بلاغ عن سلامة طفل ينتظر.',
  'Caime itself:': 'حال Caime:',
  '• AI in the last day: {amount}': '• الذكاء الاصطناعي في آخر يوم: {amount}',
  '• Running {version}': '• الإصدار العامل: {version}',
  '• Backups are off on this server': '• النسخ الاحتياطية متوقفة على هذا الخادم',
  '• Last backup {when}': '• آخر نسخة احتياطية: {when}',
  '• Nobody joined in the last day': '• لم ينضم أحد في آخر يوم',
  '{n} jobs failed for good: the operator’s token retries them.': {
    zero: 'لا مهام فشلت نهائيًا.',
    one: 'مهمة واحدة فشلت نهائيًا: يعيدها رمز المشغّل.',
    two: 'مهمتان فشلتا نهائيًا: يعيدهما رمز المشغّل.',
    few: '{n} مهام فشلت نهائيًا: يعيدها رمز المشغّل.',
    many: '{n} مهمة فشلت نهائيًا: يعيدها رمز المشغّل.',
    other: '{n} مهمة فشلت نهائيًا: يعيدها رمز المشغّل.',
  },
  '{n} reports about a child’s safety are waiting.': {
    zero: 'لا بلاغات عن سلامة أطفال تنتظر.',
    one: 'بلاغ عن سلامة طفل ينتظر.',
    two: 'بلاغان عن سلامة أطفال ينتظران.',
    few: '{n} بلاغات عن سلامة أطفال تنتظر.',
    many: '{n} بلاغًا عن سلامة أطفال تنتظر.',
    other: '{n} بلاغ عن سلامة أطفال تنتظر.',
  },
  '• All {n} providers answer': {
    zero: '• لا مزوّدين',
    one: '• المزوّد الوحيد يستجيب',
    two: '• المزوّدان يستجيبان',
    few: '• المزوّدون الـ{n} كلهم يستجيبون',
    many: '• المزوّدون الـ{n} كلهم يستجيبون',
    other: '• المزوّدون الـ{n} كلهم يستجيبون',
  },
  '• {n} checks haven’t run lately, so they aren’t known': {
    zero: '• كل الفحوص جرت مؤخرًا',
    one: '• فحص واحد لم يجرِ مؤخرًا، فحاله غير معروفة',
    two: '• فحصان لم يجريا مؤخرًا، فحالهما غير معروفة',
    few: '• {n} فحوص لم تجرِ مؤخرًا، فحالها غير معروفة',
    many: '• {n} فحصًا لم تجرِ مؤخرًا، فحالها غير معروفة',
    other: '• {n} فحص لم تجرِ مؤخرًا، فحالها غير معروفة',
  },
  '• {n} reports waiting': {
    zero: '• لا بلاغات تنتظر',
    one: '• بلاغ واحد ينتظر',
    two: '• بلاغان ينتظران',
    few: '• {n} بلاغات تنتظر',
    many: '• {n} بلاغًا تنتظر',
    other: '• {n} بلاغ تنتظر',
  },
  '• {n} appeals waiting': {
    zero: '• لا طعون تنتظر',
    one: '• طعن واحد ينتظر',
    two: '• طعنان ينتظران',
    few: '• {n} طعون تنتظر',
    many: '• {n} طعنًا تنتظر',
    other: '• {n} طعن تنتظر',
  },
  '• {n} people joined in the last day': {
    zero: '• لم ينضم أحد في آخر يوم',
    one: '• انضم شخص واحد في آخر يوم',
    two: '• انضم شخصان في آخر يوم',
    few: '• انضم {n} أشخاص في آخر يوم',
    many: '• انضم {n} شخصًا في آخر يوم',
    other: '• انضم {n} شخص في آخر يوم',
  },
  'Cai reads words, photos, stickers and voice notes.':
    'مع Cai، الكلمات والصور والملصقات والرسائل الصوتية فقط.',
  'Cai looks at photos, not videos or files.': 'ينظر Cai في الصور، لا في الفيديوهات أو الملفات.',
  'I couldn’t open that photo. Send it again?': 'تعذّر عليّ فتح هذه الصورة. هل ترسلها مرة أخرى؟',
  'I can look at photos with AI assist on: Settings, then AI assist.':
    'أستطيع النظر في الصور مع تشغيل مساعدة الذكاء الاصطناعي: الإعدادات، ثم مساعدة الذكاء الاصطناعي.',
  'I can’t look at photos on this Caime yet.': 'لا أستطيع النظر في الصور على Caime هذا بعد.',
  '{name} has waited {time} for a reply from {org}, and nobody has taken it yet.':
    'مضى {time} على رسالة {name} إلى {org} دون رد، ولم يتولَّها أحد بعد.',
  'Their conversation: {link}': 'المحادثة: {link}',
  'Only the customer calls in a conversation with an organization.':
    'في المحادثة مع مؤسسة، الاتصال من جهة العميل وحده.',
  '{orgName} has closed.': 'أُغلقت {orgName}.',
  '{orgName} can’t be reached on Caime right now.': 'لا يمكن الوصول إلى {orgName} على Caime الآن.',
  '{orgName} doesn’t take calls on Caime.': 'لا تستقبل {orgName} مكالمات على Caime.',
  'Cai doesn’t take notes in a conversation with an organization yet.':
    'لا يدوّن Cai الملاحظات في محادثة مع مؤسسة بعد.',
  '{name} is calling {orgName}': 'مكالمة من {name} إلى {orgName}',
};
