/**
 * The public site in Arabic (R54): the strings `lib/site-pages.ts` alone says, keyed by their
 * English. The server's own catalog, merged with the app's (`@caime/core/locales/ar`) for the
 * site's pages, and never downloaded by the app. `node scripts/i18n-keys.mjs missing ar site`
 * lists what it lacks; `apps/server/test/site-i18n.test.ts` fails CI for it.
 */
import type { Catalog } from '@caime/core/i18n';

export const arSite: Catalog = {
  'Caime is messaging that knows who each person is to you: your family, your work, your customers, each in its place, with what needs you first. Free for people; organizations verify who they are.':
    'Caime مراسلة تعرف من يكون كل شخص بالنسبة لك: عائلتك وعملك وعملاؤك، كلٌّ في مكانه، وما يحتاجك أولًا. مجاني للأفراد؛ والمؤسسات تثبت هويتها.',
  Home: 'الرئيسية',
  'For organizations': 'للمؤسسات',
  'for organizations': 'للمؤسسات',
  Pricing: 'الأسعار',
  pricing: 'الأسعار',
  'security and privacy': 'الأمان والخصوصية',
  Developers: 'المطوّرون',
  developers: 'المطوّرون',
  About: 'عن Caime',
  about: 'عن Caime',
  Help: 'المساعدة',
  Example: 'مثال',
  Connection: 'العلاقة',
  'Who someone is to you comes first.': 'من يكون الشخص بالنسبة لك يأتي أولًا.',
  'A connection is two people and how they know each other, said by each side, private to each. Everything else in Caime hangs off it.':
    'العلاقة شخصان وكيف يعرف كلٌّ منهما الآخر، يقولها كل طرف من جهته، وتبقى خاصة به. كل ما عدا ذلك في Caime مبني عليها.',
  'colleague · DATA C · work': 'زميلة · DATA C · العمل',
  'brother · family': 'أخ · العائلة',
  'Messages that know their context.': 'رسائل تعرف سياقها.',
  'One-to-one, groups, topics under a connection, spaces for a family, a team or a club. Ordered, delivered once, and yours offline.':
    'ثنائية، ومجموعات، ومواضيع تحت علاقة، ومساحات لعائلة أو فريق أو نادٍ. مرتّبة، تصل مرة واحدة، ولك دون اتصال.',
  'Did the contract arrive?': 'هل وصل العقد؟',
  'Yes, signing it Friday.': 'نعم، سأوقّعه الجمعة.',
  'read · 2 min': 'قُرئت · منذ دقيقتين',
  'What needs you, not everything.': 'ما يحتاجك، لا كل شيء.',
  'The inbox sorts by what needs you, what’s important, what’s waiting on someone else and what’s quiet, and says why. Your rules by relationship win.':
    'يرتّب صندوق الوارد حسب ما يحتاجك، وما هو مهم، وما ينتظر شخصًا آخر، وما هو هادئ، ويقول السبب. قواعدك حسب العلاقة هي الغالبة.',
  'Sarah asked about the contract': 'سألت سارة عن العقد',
  'Omar · the deck · since Tuesday': 'عمر · العرض التقديمي · منذ الثلاثاء',
  '3 need you': '3 تحتاجك',
  'Nothing said is lost.': 'لا يضيع شيء مما قيل.',
  'Commitments, dates, amounts, questions and decisions are found in the conversation and offered back as actions. They become facts only when you say so.':
    'الالتزامات والمواعيد والمبالغ والأسئلة والقرارات تُلتقط من المحادثة وتُعرض عليك كإجراءات. ولا تصبح حقائق إلا حين تقول أنت ذلك.',
  Suggested: 'مقترح',
  'Remind me: send the deck · Monday': 'ذكّرني: إرسال العرض · الاثنين',
  'Waiting on Sarah: contract': 'في انتظار سارة: العقد',
  'based on “I’ll send the deck on Monday.”': 'بناءً على «سأرسل العرض يوم الاثنين.»',
  'A business that proves it’s the business.': 'مؤسسة تثبت أنها هي المؤسسة.',
  'An organization verifies its domain with one DNS record. Its team answers customers as the organization, in one inbox, with apps and an AI agent that always say what they are.':
    'تثبت المؤسسة نطاقها بسجل DNS واحد. ويجيب فريقها العملاء باسم المؤسسة، في صندوق وارد واحد، مع تطبيقات ووكيل ذكاء اصطناعي يقولان دائمًا ما هما.',
  'verified · niledental.example': 'موثّقة · niledental.example',
  'Lina · new patient forms': 'لينا · استمارات مريض جديد',
  'Each side of your life sees what you chose.': 'كل جانب من حياتك يرى ما اخترته.',
  'Profile fields by sphere, read receipts only both ways, requests before strangers reach you, and end-to-end encryption when a conversation should be private.':
    'حقول الملف حسب الدائرة، وإشعارات القراءة في الاتجاهين فقط، وطلبات قبل أن يصل إليك الغرباء، وتشفير من طرف إلى طرف حين ينبغي أن تكون المحادثة خاصة.',
  'work sees': 'العمل يرى',
  'name · headline · organization': 'الاسم · العنوان المهني · المؤسسة',
  'family sees': 'العائلة ترى',
  'everything, and where you are when you share it': 'كل شيء، ومكانك حين تشاركه',
  'a stranger sees': 'الغريب يرى',
  'your name and handle, and may ask': 'اسمك ومعرّفك، وله أن يطلب',
  '{n} GB': '{n} غيغابايت',
  'price shown in the app': 'السعر معروض في التطبيق',
  '{price} a month': '{price} شهريًا',
  '{price} a year': '{price} سنويًا',
  ', or ': '، أو ',
  'It lands in the inbox, first if they’ve waited longest.':
    'تصل إلى صندوق الوارد، وفي المقدمة إن كان الأطول انتظارًا.',
  'Lina writes to Nile Dental from the app she uses for everyone else. The team sees one conversation, its state and who has it; Lina sees the organization, never which person.':
    'تكتب لينا إلى Nile Dental من التطبيق نفسه الذي تستخدمه مع كل من حولها. يرى الفريق محادثة واحدة وحالتها ومن يتولاها؛ وترى لينا المؤسسة، لا الشخص أبدًا.',
  'Can I book a cleaning on Thursday?': 'هل يمكنني حجز تنظيف يوم الخميس؟',
  'new · nobody has it · 2 min': 'جديدة · لا أحد يتولاها · منذ دقيقتين',
  'The agent answers': 'الوكيل يجيب',
  'From what you wrote down, and it says so.': 'مما كتبته أنت، ويقول ذلك.',
  'The organization’s AI agent answers only from its knowledge (up to {n} characters you gave it), is marked as an AI, and hands over to a person the moment it isn’t sure. With bookable hours set, it offers the open slots and books the one the customer picks, for the team to confirm.':
    'يجيب وكيل الذكاء الاصطناعي للمؤسسة من معرفته وحدها (حتى {n} حرفًا أعطيتها له)، ويُعلَّم بأنه ذكاء اصطناعي، ويسلّم الأمر لشخص لحظة لا يكون متأكدًا. ومع تحديد ساعات الحجز، يعرض المواعيد المتاحة ويحجز ما يختاره العميل، ليؤكده الفريق.',
  'I can offer Thursday 10:00 or 10:30. Which suits you?':
    'أستطيع أن أعرض الخميس 10:00 أو 10:30. أيهما يناسبك؟',
  'Cleaning · Thursday 10:00 · requested': 'تنظيف · الخميس 10:00 · مطلوب',
  'Nile Dental · AI agent · automated': 'Nile Dental · وكيل ذكاء اصطناعي · آلي',
  'The team answers': 'الفريق يجيب',
  'Whoever answers has it; the customer hears from the organization.':
    'من يجيب يتولاها؛ والعميل يسمع من المؤسسة.',
  'Answering takes the conversation. Assign it, escalate it to an owner or admin with a note, or resolve it; it comes back the moment the customer writes again.':
    'الإجابة تعني تولّي المحادثة. أسندها، أو صعّدها إلى مالك أو مشرف مع ملاحظة، أو أغلقها؛ وتعود لحظة يكتب العميل من جديد.',
  '10:00 is yours. See you Thursday.': 'الساعة 10:00 لك. نراك الخميس.',
  'Your tools hear it': 'أدواتك تسمعها',
  'A helpdesk, a CRM or your own bot, in the same conversation.':
    'مكتب دعم، أو نظام إدارة عملاء، أو بوت من صنعك، في المحادثة نفسها.',
  'An app’s bot replies as the organization, marked automated, and never counts as the team’s answer. Its webhook hears each message and each change of state.':
    'يرد بوت التطبيق باسم المؤسسة، معلَّمًا بأنه آلي، ولا يُحسب أبدًا ردًا من الفريق. ويسمع الويب هوك الخاص به كل رسالة وكل تغيّر في الحالة.',
  'resolved · by person': 'مغلقة · بواسطة شخص',
  'Booking · confirmed · by customer': 'حجز · مؤكد · بواسطة العميل',
  'A colleague sees the professional you.': 'الزميل يرى الجانب المهني منك.',
  'Name, headline, organization, the hours you answer in. Your birthday, your family and your location stay out of it unless you say otherwise.':
    'الاسم، والعنوان المهني، والمؤسسة، وساعات ردّك. أما عيد ميلادك وعائلتك ومكانك فتبقى خارج ذلك ما لم تقل غير ذلك.',
  sees: 'يرى',
  'Noor Haddad · Dentist · Nile Dental': 'نور حداد · طبيبة أسنان · Nile Dental',
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
    'من ليس على صلة بك يرى اسمك ومعرّفك، إن سمحت بأن يُعثر عليك. وتصل رسالته الأولى كطلب: رسالة واحدة حتى تجيب.',
  'Hi Noor, found you!': 'مرحبًا نور، وجدتك!',
  'one message until you answer · decline and they never know':
    'رسالة واحدة حتى تجيب · ارفض ولن يعرف أبدًا',
  'A customer sees the organization, never its people.': 'العميل يرى المؤسسة، لا أشخاصها أبدًا.',
  'In a business conversation the team’s names and ids are masked everywhere: messages, read receipts, suggestions, exports. Anything filed for the customer names the organization.':
    'في محادثة الأعمال تُحجب أسماء الفريق ومعرّفاتهم في كل مكان: الرسائل، وإشعارات القراءة، والاقتراحات، والتصديرات. وكل ما يُسجَّل للعميل يسمّي المؤسسة.',
  'verified · answered in an hour': 'موثّقة · تجيب خلال ساعة',
  '{n} actions a day': '{n} إجراء في اليوم',
  '{n} conversations a day': '{n} محادثة في اليوم',
  '{n} answers a day': '{n} إجابة في اليوم',
  'Your family, your work and your customers don’t belong in one list. Say who each person is to you, once. From then on Caime knows what needs you first, who may reach you when, what was decided and what’s owed, and what each side of your life sees of you.':
    'عائلتك وعملك وعملاؤك لا مكان لهم في قائمة واحدة. قل من يكون كل شخص بالنسبة لك، مرة واحدة. ومن ثَمّ يعرف Caime ما يحتاجك أولًا، ومن له أن يصل إليك ومتى، وما تقرر وما هو مستحق، وما يراه منك كل جانب من حياتك.',
  'Start free': 'ابدأ مجانًا',
  Specification: 'المواصفات',
  'primary object': 'الكيان الأساسي',
  'The connection between two people, not the chat.': 'العلاقة بين شخصين، لا الدردشة.',
  'to connect': 'للتواصل',
  'Connect in three taps. Say how you know someone; the conversation, its notifications and its cards fit the relationship.':
    'تواصل بثلاث لمسات. قل كيف تعرف الشخص؛ فتتلاءم المحادثة وإشعاراتها وبطاقاتها مع العلاقة.',
  attention: 'الانتباه',
  '“3 need you”, never “47 unread”. The inbox puts what matters first and says why.':
    '«3 تحتاجك»، لا «47 غير مقروءة» أبدًا. يضع صندوق الوارد ما يهم أولًا ويقول السبب.',
  memory: 'الذاكرة',
  'Commitments, dates, amounts and decisions are found in the conversation and offered as actions. You decide; nothing is written for you.':
    'الالتزامات والمواعيد والمبالغ والقرارات تُلتقط من المحادثة وتُعرض كإجراءات. أنت من يقرر؛ ولا يُكتب شيء نيابةً عنك.',
  organizations: 'المؤسسات',
  'A business proves its domain with one DNS record; its team answers as the organization, in one inbox, and customers book from its open slots.':
    'تثبت المؤسسة نطاقها بسجل DNS واحد؛ ويجيب فريقها باسم المؤسسة، في صندوق وارد واحد، ويحجز العملاء من مواعيدها المتاحة.',
  'Each side of your life sees what you chose. End-to-end encrypted when you say so, with a recovery key only you hold.':
    'كل جانب من حياتك يرى ما اخترته. تشفير من طرف إلى طرف حين تقول ذلك، بمفتاح استعادة لا يحمله غيرك.',
  money: 'المال',
  'Never held or moved by Caime. A split records who owes whom; nothing else.':
    'لا يحتفظ به Caime ولا يحرّكه أبدًا. التقسيم يسجّل من يدين لمن؛ لا أكثر.',
  price: 'السعر',
  'Free for people, always. Organizations start free and can buy Business.':
    'مجاني للأفراد، دائمًا. تبدأ المؤسسات مجانًا ويمكنها شراء Business.',
  'runs on': 'يعمل على',
  'Web, iOS and Android, from one account.': 'الويب وiOS وAndroid، من حساب واحد.',
  'Layers · pick one': 'الطبقات · اختر واحدة',
  '{site} for organizations: answer as the organization, and prove it’s you':
    '{site} للمؤسسات: أجب باسم المؤسسة، وأثبت أنك أنت',
  'A clinic, a shop, a school or a nonprofit verifies its domain with one DNS record and answers customers as the organization, in one inbox, with an AI agent and apps that always say what they are. Free for a team of three.':
    'عيادة أو متجر أو مدرسة أو جمعية تثبت نطاقها بسجل DNS واحد وتجيب العملاء باسم المؤسسة، في صندوق وارد واحد، مع وكيل ذكاء اصطناعي وتطبيقات تقول دائمًا ما هي. مجاني لفريق من ثلاثة.',
  'Answer as the organization, and prove it’s you.': 'أجب باسم المؤسسة، وأثبت أنك أنت.',
  'A clinic, a shop, a school, a nonprofit or a public service gets a profile people can trust once it verifies its domain, and one inbox where its team answers customers as the organization. Customers write from the app they already use for everyone else in their life.':
    'تحصل العيادة أو المتجر أو المدرسة أو الجمعية أو الخدمة العامة على صفحة يثق بها الناس ما إن تثبت نطاقها، وصندوق وارد واحد يجيب فيه فريقها العملاء باسم المؤسسة. ويكتب العملاء من التطبيق الذي يستخدمونه أصلًا مع كل من في حياتهم.',
  verification: 'التوثيق',
  'One TXT record on your domain. Verified shows on your page and beside your team; it is checked, never bought, and yours again if you ever close and come back.':
    'سجل TXT واحد على نطاقك. تظهر علامة «موثّقة» على صفحتك وبجانب فريقك؛ وهي تُتحقق، ولا تُشترى، وتعود لك إن أغلقت يومًا وعدت.',
  'the inbox': 'صندوق الوارد',
  'Every customer conversation in one place, sorted by who has waited longest, in six views: {views}.':
    'كل محادثات العملاء في مكان واحد، مرتّبة حسب الأطول انتظارًا، في ست طرق عرض: {views}.',
  'the team': 'الفريق',
  'Owners, admins and members. A customer sees the organization, never which person answered. A seat that ends takes nothing with it.':
    'مالكون ومشرفون وأعضاء. يرى العميل المؤسسة، لا الشخص الذي أجاب أبدًا. والمقعد الذي ينتهي لا يأخذ معه شيئًا.',
  'writing first': 'المبادرة بالكتابة',
  'Your team may write to someone first. It arrives as a request: one message until they answer, and their answer opens the conversation.':
    'يمكن لفريقك أن يكتب لشخص أولًا. تصل كطلب: رسالة واحدة حتى يجيب، وإجابته تفتح المحادثة.',
  'the ai agent': 'وكيل الذكاء الاصطناعي',
  'Answers from what you wrote down (up to {n} characters), is marked as an AI, and hands over to a person the moment it isn’t sure. It never speaks for the team.':
    'يجيب مما كتبته (حتى {n} حرفًا)، ويُعلَّم بأنه ذكاء اصطناعي، ويسلّم الأمر لشخص لحظة لا يكون متأكدًا. ولا يتحدث باسم الفريق أبدًا.',
  'Set bookable hours once. Customers pick from the open slots, your AI agent offers the next few and books the one they choose, and every booking is an appointment your team confirms.':
    'حدد ساعات الحجز مرة واحدة. يختار العملاء من المواعيد المتاحة، ويعرض وكيلك القادمة منها ويحجز ما يختارونه، وكل حجز موعد يؤكده فريقك.',
  apps: 'التطبيقات',
  'A helpdesk, a CRM or your own bot: a token that reaches only your conversations, a signed webhook, and cards of your own design.':
    'مكتب دعم، أو نظام إدارة عملاء، أو بوت من صنعك: رمز وصول لا يبلغ إلا محادثاتك، وويب هوك موقَّع، وبطاقات من تصميمك.',
  updates: 'التحديثات',
  'Post to everyone who follows you. Nobody sees who follows, and nothing about following reaches anyone’s inbox.':
    'انشر لكل من يتابعك. لا أحد يرى من يتابع، ولا شيء عن المتابعة يصل إلى صندوق وارد أحد.',
  spaces: 'المساحات',
  'Spaces for the team, a project or a branch, started from the organization’s page, with your team already there to pick from.':
    'مساحات للفريق أو لمشروع أو لفرع، تبدأ من صفحة المؤسسة، وفريقك حاضر فيها للاختيار منه.',
  calls: 'المكالمات',
  'Voice and video, one to one and in groups of up to {n}, in the browser.':
    'صوت وفيديو، ثنائية وفي مجموعات حتى {n} أشخاص، في المتصفح.',
  insights: 'الرؤى',
  'How fast the team answers, how many customers write and what is still open. On Business.':
    'سرعة إجابة الفريق، وعدد العملاء الذين يكتبون، وما لا يزال مفتوحًا. في خطة Business.',
  'Free for a team of {team}, with {apps}. Business for the rest: {pricing}.':
    'مجاني لفريق من {team}، مع {apps}. وBusiness لما سوى ذلك: {pricing}.',
  'one app': 'تطبيق واحد',
  '{n} apps': '{n} تطبيقات',
  'A customer’s day · pick a step': 'يوم عميل · اختر خطوة',
  'For developers': 'للمطوّرين',
  '{site} pricing: free for people, organizations pay for their team':
    'أسعار {site}: مجاني للأفراد، والمؤسسات تدفع لفريقها',
  'What makes Caime Caime is never counted. People use it free; Pro adds AI, storage, automations and insights. Organizations start free for a team of three and buy Business for the rest.':
    'ما يجعل Caime هو Caime لا يُحسب أبدًا. يستخدمه الأفراد مجانًا؛ وتضيف Pro الذكاء الاصطناعي والتخزين والأتمتة والرؤى. وتبدأ المؤسسات مجانًا لفريق من ثلاثة وتشتري Business لما سوى ذلك.',
  'Free for people. Organizations pay for their team.': 'مجاني للأفراد. والمؤسسات تدفع لفريقها.',
  'What makes Caime Caime is never counted: connections, relationships, what needs you, what you’re waiting for, search and sync are in every plan. Plans differ only in what costs money to run, and in what organizations buy.':
    'ما يجعل Caime هو Caime لا يُحسب أبدًا: العلاقات، ومن يكون الناس لك، وما يحتاجك، وما تنتظره، والبحث والمزامنة في كل خطة. لا تختلف الخطط إلا فيما يكلّف مالًا لتشغيله، وفيما تشتريه المؤسسات.',
  'For people': 'للأفراد',
  Personal: 'شخصي',
  Free: 'مجاني',
  ', always': '، دائمًا',
  'ai assist': 'مساعد الذكاء الاصطناعي',
  '{n} actions a day, once you turn it on': '{n} إجراء في اليوم، متى شغّلته',
  files: 'الملفات',
  automations: 'الأتمتة',
  'everything else': 'كل ما عدا ذلك',
  'connections, attention, memory, spaces, calls, private conversations':
    'العلاقات، والانتباه، والذاكرة، والمساحات، والمكالمات، والمحادثات الخاصة',
  Pro: 'Pro',
  'how your relationships are going, from your own messages, for you only':
    'كيف تسير علاقاتك، من رسائلك أنت، لك وحدك',
  team: 'الفريق',
  'ai agent': 'وكيل الذكاء الاصطناعي',
  'how fast the team answers, who is waiting, what is open':
    'سرعة إجابة الفريق، ومن ينتظر، وما هو مفتوح',
  Enterprise: 'Enterprise',
  'Talk to us': 'تحدث إلينا',
  included: 'مشمولة',
  'The rules': 'القواعد',
  'never counted': 'لا يُحسب أبدًا',
  'A conversation a customer starts. Anyone who writes to you. Your connections, however many.':
    'محادثة يبدؤها عميل. أي شخص يكتب إليك. علاقاتك، مهما بلغ عددها.',
  'a lower plan': 'خطة أدنى',
  'takes nothing away: nobody is removed from a team and no app stops. It only stops new additions until they fit.':
    'لا تأخذ شيئًا: لا يُزال أحد من فريق ولا يتوقف تطبيق. إنما توقف الإضافات الجديدة حتى تتسع لها.',
  paying: 'الدفع',
  'Through Stripe, by card. Cancel whenever you like: it stays on until the end of what you paid for, and nothing you use today goes away after.':
    'عبر Stripe، بالبطاقة. ألغِ متى شئت: يبقى الاشتراك حتى نهاية ما دفعت مقابله، ولا يزول بعدها شيء مما تستخدمه اليوم.',
  'a seat': 'المقعد',
  'on a Business or Enterprise team includes everything Pro does.':
    'في فريق Business أو Enterprise يشمل كل ما في Pro.',
  '{site} security and privacy: each side of your life sees what you chose':
    'الأمان والخصوصية في {site}: كل جانب من حياتك يرى ما اخترته',
  'How you describe people is only ever yours. Profile by sphere, read receipts both ways only, requests before strangers, end-to-end encryption with a recovery key you hold, and a server that keeps envelopes, not words.':
    'كيف تصف الناس أمر لك وحدك دائمًا. ملف حسب الدائرة، وإشعارات قراءة في الاتجاهين فقط، وطلبات قبل الغرباء، وتشفير من طرف إلى طرف بمفتاح استعادة تحمله أنت، وخادم يحفظ المظاريف لا الكلمات.',
  'Privacy in Caime isn’t a setting you find later. How you describe someone is only ever yours, what each sphere of your life sees of you is decided by you, field by field, and a conversation that should be private is encrypted so that not even Caime can read it.':
    'الخصوصية في Caime ليست إعدادًا تجده لاحقًا. كيف تصف شخصًا أمر لك وحدك دائمًا، وما تراه منك كل دائرة من حياتك تقرره أنت، حقلًا حقلًا، والمحادثة التي ينبغي أن تكون خاصة مشفّرة بحيث لا يستطيع حتى Caime قراءتها.',
  'Who sees what · pick a side': 'من يرى ماذا · اختر جانبًا',
  'your labels': 'أوصافك',
  'How you describe the people you know (family, work, a client) is yours. The person you describe sees it only if you both turn on sharing; nobody else ever does.':
    'كيف تصف من تعرفهم (عائلة، عمل، عميل) أمر لك. ولا يراه الشخص الموصوف إلا إن شغّلتما المشاركة معًا؛ ولا يراه غيره أبدًا.',
  'read receipts': 'إشعارات القراءة',
  'Only both ways: you see theirs when they see yours.':
    'في الاتجاهين فقط: ترى إشعاره حين يرى إشعارك.',
  strangers: 'الغرباء',
  'A message from someone you don’t know arrives as a request: one message until you answer. Declined, they never know.':
    'رسالة من شخص لا تعرفه تصل كطلب: رسالة واحدة حتى تجيب. وإن رفضت، لا يعرف أبدًا.',
  'under 18': 'دون 18',
  'No public page, no money cards, no messages from organizations they didn’t write to first, and adults are told when a conversation includes a minor.':
    'لا صفحة عامة، ولا بطاقات مال، ولا رسائل من مؤسسات لم يكتبوا إليها أولًا، ويُخبَر البالغون حين تضم المحادثة قاصرًا.',
  'private conversations': 'المحادثات الخاصة',
  'End to end encrypted: a fresh AES-256-GCM key for every message, wrapped for each device allowed to read it with P-256 ECDH and HKDF, and the whole envelope signed by the device that sent it. The server keeps envelopes, never words. Up to {people} people, {devices} devices each.':
    'مشفّرة من طرف إلى طرف: مفتاح AES-256-GCM جديد لكل رسالة، مغلَّف لكل جهاز مسموح له بقراءتها عبر P-256 ECDH وHKDF، والمظروف كله موقَّع من الجهاز الذي أرسله. يحفظ الخادم المظاريف، لا الكلمات أبدًا. حتى {people} شخصًا، و{devices} جهازًا لكل منهم.',
  'your devices': 'أجهزتك',
  'A new device reads nothing until you say it’s yours on one you already have. Your security code is your first device’s, so it stays the same as you add devices and changes only when you start over.':
    'لا يقرأ الجهاز الجديد شيئًا حتى تقول إنه لك من جهاز تملكه أصلًا. ورمز أمانك هو رمز جهازك الأول، فيبقى كما هو وأنت تضيف أجهزة ولا يتغير إلا حين تبدأ من جديد.',
  recovery: 'الاستعادة',
  'A recovery key you hold, shown once, brings your private conversations back when every device is gone. Caime keeps nothing of it.':
    'مفتاح استعادة تحمله أنت، يُعرض مرة واحدة، يعيد محادثاتك الخاصة حين تضيع كل أجهزتك. ولا يحتفظ Caime بشيء منه.',
  'what isn’t hidden': 'ما ليس مخفيًا',
  'Who is in a conversation, when messages are sent and how long they are, and reactions. The app says so.':
    'من في المحادثة، ومتى تُرسل الرسائل وكم طولها، والتفاعلات. والتطبيق يقول ذلك.',
  'blocks and reports': 'الحظر والبلاغات',
  'A block stops every write, both ways. Reports are read by a person and acted on; every action is in the audit log.':
    'الحظر يوقف كل كتابة، في الاتجاهين. والبلاغات يقرؤها شخص ويتصرف بشأنها؛ وكل إجراء مسجَّل في سجل التدقيق.',
  'your data': 'بياناتك',
  'Download all of it, or delete your account, from Settings. Ended sign-ins are kept {signIns} days, security records {records}, a handle you let go of {handles} from everyone.':
    'نزّلها كلها، أو احذف حسابك، من الإعدادات. تُحفظ جلسات الدخول المنتهية {signIns} يومًا، وسجلات الأمان {records}، ويُحجز المعرّف الذي تخليت عنه عن الجميع {handles}.',
  'a year': 'سنة',
  'the server': 'الخادم',
  'A content security policy on every page, no third-party scripts, no ads, no tracking across sites, and a backup checked after every dump.':
    'سياسة أمان محتوى على كل صفحة، ولا نصوص برمجية من طرف ثالث، ولا إعلانات، ولا تتبع عبر المواقع، ونسخة احتياطية تُفحص بعد كل تفريغ.',
  ai: 'الذكاء الاصطناعي',
  'Off until an adult turns it on, never on a private conversation, and everything it infers is a suggestion you accept or don’t.':
    'متوقف حتى يشغّله بالغ، ولا يعمل على محادثة خاصة أبدًا، وكل ما يستنتجه اقتراح تقبله أو لا.',
  'Read the privacy policy': 'اقرأ سياسة الخصوصية',
  'Report a concern': 'أبلغ عن مشكلة',
  '{site} for developers: an API that reaches only what it was given':
    '{site} للمطوّرين: واجهة برمجية لا تبلغ إلا ما أُعطيت',
  'Apps for organizations with scoped tokens, signed webhooks, bots and cards of their own; personal tokens and OAuth for apps that act for a person; a typed SDK. Every write is idempotent.':
    'تطبيقات للمؤسسات برموز وصول محدودة النطاق، وويب هوك موقَّع، وبوتات وبطاقات من صنعها؛ ورموز شخصية وOAuth للتطبيقات التي تعمل نيابةً عن شخص؛ وحزمة SDK منمّطة. وكل كتابة متكرّرة بأمان.',
  'An API that reaches only what it was given.': 'واجهة برمجية لا تبلغ إلا ما أُعطيت.',
  'Organizations connect a helpdesk, a CRM or a bot of their own. People let an app act for them, with the permissions they chose. Every token reaches a fixed set of routes, every webhook is signed, and nothing an app does is passed off as a person.':
    'تربط المؤسسات مكتب دعم أو نظام إدارة عملاء أو بوتًا من صنعها. ويسمح الأفراد لتطبيق بالعمل نيابةً عنهم، بالصلاحيات التي اختاروها. كل رمز وصول يبلغ مجموعة ثابتة من المسارات، وكل ويب هوك موقَّع، ولا يُنسب ما يفعله تطبيق إلى شخص أبدًا.',
  'Added on the organization’s page. Each has its own bot on the team, a token shown once, and a webhook signed with a secret shown once. Replace either and the old one stops at once.':
    'تُضاف من صفحة المؤسسة. لكل منها بوت خاص في الفريق، ورمز وصول يُعرض مرة واحدة، وويب هوك موقَّع بسر يُعرض مرة واحدة. استبدل أيًا منهما ويتوقف القديم فورًا.',
  permissions: 'الصلاحيات',
  '{scopes}: given one by one. A route the token can’t use answers 403.':
    '{scopes}: تُمنح واحدة واحدة. والمسار الذي لا يستطيع الرمز استخدامه يجيب بـ403.',
  webhooks: 'الويب هوك',
  '{events}. Signed, https only, no private addresses, one deadline for the whole exchange.':
    '{events}. موقَّعة، عبر https فقط، لا عناوين خاصة، ومهلة واحدة للتبادل كله.',
  'your own cards': 'بطاقاتك الخاصة',
  'Define a kind of card with fields and states. Your bot sends it, the team and the customer move it, and you hear when they do.':
    'عرّف نوع بطاقة بحقول وحالات. يرسلها بوتك، ويحرّكها الفريق والعميل، وتسمع أنت حين يفعلون.',
  idempotent: 'التكرار الآمن',
  'Every write carries a {clientId}. Sending it again returns the first result, never a second message.':
    'كل كتابة تحمل {clientId}. وإرسالها مرة أخرى يعيد النتيجة الأولى، لا رسالة ثانية أبدًا.',
  rate: 'المعدل',
  '{n} requests a minute per token.': '{n} طلب في الدقيقة لكل رمز وصول.',
  'the sdk': 'حزمة SDK',
  '{sdk}: a typed client for every route an app reaches, and the webhook check. Built from the repository until it is on npm.':
    '{sdk}: عميل منمّط لكل مسار يبلغه تطبيق، والتحقق من الويب هوك. يُبنى من المستودع حتى يُنشر على npm.',
  'personal tokens': 'الرموز الشخصية',
  'A person makes a token for their own scripts ({scopes}). It never reaches the account itself.':
    'يصنع الشخص رمز وصول لنصوصه البرمجية ({scopes}). ولا يبلغ الحساب نفسه أبدًا.',
  oauth: 'OAuth',
  'Third-party apps ask people for consent (OAuth 2.0; errors as RFC 6749 and 7009 say), hold only what they were given, and can be revoked any time from Settings.':
    'تطلب تطبيقات الطرف الثالث موافقة الأفراد (OAuth 2.0؛ والأخطاء كما تنص RFC 6749 و7009)، ولا تحمل إلا ما أُعطيت، ويمكن إلغاؤها في أي وقت من الإعدادات.',
  'the guide': 'الدليل',
  'In the app: Settings → Developer, and beside each app on the organization’s page.':
    'في التطبيق: الإعدادات ← المطوّر، وبجانب كل تطبيق في صفحة المؤسسة.',
  'About {site}': 'عن {site}',
  '{site} is made by {maker}: a communication product, and only that. It never holds or moves money, runs no third-party code and has no feed. The primary object is the connection between two people, not the chat.':
    '{site} من صنع {maker}: منتج تواصل، ولا شيء غير ذلك. لا يحتفظ بالمال ولا يحرّكه أبدًا، ولا يشغّل كودًا من طرف ثالث، ولا موجز أخبار فيه. الكيان الأساسي هو العلاقة بين شخصين، لا الدردشة.',
  'Made for the people in your life, not for a feed.': 'صُنع لمن في حياتك، لا لموجز أخبار.',
  '{site} is made by {maker}. It is a communication product, and only that: it never holds or moves money, runs no third-party code, and has no feed. The primary object is the connection between two people, not the chat.':
    '{site} من صنع {maker}. هو منتج تواصل، ولا شيء غير ذلك: لا يحتفظ بالمال ولا يحرّكه أبدًا، ولا يشغّل كودًا من طرف ثالث، ولا موجز أخبار فيه. الكيان الأساسي هو العلاقة بين شخصين، لا الدردشة.',
  'made by': 'من صنع',
  'what it is': 'ما هو',
  'Messaging for people, and for the organizations they deal with, on the web, iOS and Android, from one account.':
    'مراسلة للأفراد، وللمؤسسات التي يتعاملون معها، على الويب وiOS وAndroid، من حساب واحد.',
  'what it isn’t': 'ما ليس هو',
  'A super-app. No wallet, no marketplace, no feed, no scripts from anyone else.':
    'تطبيقًا شاملًا. لا محفظة، ولا سوق، ولا موجز أخبار، ولا نصوص برمجية من أحد غيرنا.',
  'the characters': 'الشخصيات',
  'Caishy and friends (Momo, Panda, Lumi, Pico, Niko and Zuzu) appear where there is something to celebrate or nothing yet to show, never beside your invoice.':
    'يظهر كايشي وأصدقاؤه (مومو وباندا ولومي وبيكو ونيكو وزوزو) حيث يوجد ما يُحتفى به أو لا شيء بعد ليُعرض، ولا يظهرون أبدًا بجانب فاتورتك.',
  'how it’s built': 'كيف بُني',
  'One codebase for the server, the web and the phones. Every change is tested end to end against the real server before it ships, and only what passed goes live.':
    'قاعدة كود واحدة للخادم والويب والهواتف. يُختبر كل تغيير من طرف إلى طرف على الخادم الحقيقي قبل أن يُشحن، ولا يصل إلى الإنتاج إلا ما نجح.',
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
  '{domain}, proved with a DNS record': '{domain}، مثبت بسجل DNS',
  'Not yet': 'ليس بعد',
  '{name} invited you': 'دعاك {name}',
  'Join {name} on {site}{context}: sign up in half a minute and you’re connected.':
    'انضم إلى {name} على {site}{context}: سجّل في نصف دقيقة وتكونان على تواصل.',
  'an invitation': 'دعوة',
  from: 'من',
  'to join': 'للانضمام',
  'Sign up in half a minute and you’re connected with {name}, no app to install.':
    'سجّل في نصف دقيقة وتكون على تواصل مع {name}، دون تطبيق تثبّته.',
  'Join {name} on {site}': 'انضم إلى {name} على {site}',
  'Not here': 'ليس هنا',
  'Nobody by that handle.': 'لا أحد بهذا المعرّف.',
  'not here': 'ليس هنا',
  'Nobody by that handle': 'لا أحد بهذا المعرّف',
  'It may have changed, or been let go of.': 'ربما تغيّر، أو تُخلّي عنه.',
  'Open {site}': 'افتح {site}',
};
