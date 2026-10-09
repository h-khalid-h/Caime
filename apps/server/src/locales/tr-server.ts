/**
 * What only the server says, in Turkish (R59): the public site, notifications, refusals. A
 * string the app shows too lives in core's `locales/tr.ts`.
 */
import type { Catalog } from '@caime/core/i18n';

export const turkishServer: Catalog = {
  '{name} is on {site}.': '{name}, {site} kullanıyor.',
  'a person on {site}': 'bir {site} kullanıcısı',
  headline: 'başlık',
  with: 'kuruluşlar',
  'Message {name} on {site}': '{site} üzerinden {name} ile yazışın',
  'Verified · {domain}': 'Doğrulanmış · {domain}',
  'Since {year}': '{year} yılından beri',
  'an organization on {site}': '{site} üzerinde bir kuruluş',
  '{domain}, proved with a DNS record': '{domain}, bir DNS kaydıyla kanıtlandı',
  'Not yet': 'Henüz değil',
  '{name} invited you': '{name} sizi davet etti',
  'Join {name} on {site}{context}: sign up in half a minute and you’re connected.':
    '{name}{context} sizi {site} üzerinde bekliyor: yarım dakikada kaydolun, bağlantınız hazır olsun.',
  'an invitation': 'bir davet',
  from: 'kimden',
  about: 'konu',
  'to join': 'katılım',
  'Sign up in half a minute and you’re connected with {name}, no app to install.':
    'Yarım dakikada kaydolun, {name} ile bağlantınız kurulsun; uygulama yüklemenize gerek yok.',
  'Join {name} on {site}': '{site} üzerinde {name} ile bağlantı kurun',
  'Not here': 'Burada yok',
  'Nobody by that handle.': 'Bu kullanıcı adıyla kimse yok.',
  'not here': 'burada yok',
  'Nobody by that handle': 'Bu kullanıcı adıyla kimse yok',
  'It may have changed, or been let go of.': 'Değişmiş ya da bırakılmış olabilir.',
  'Open {site}': '{site} uygulamasını açın',
  'Caime is messaging that knows who each person is to you: your family, your work, your customers, each in its place, with what needs you first. Free for people; organizations verify who they are.':
    'Caime, her kişinin sizin için kim olduğunu bilen bir mesajlaşma uygulamasıdır: aileniz, işiniz, müşterileriniz; her biri kendi yerinde ve önce sizi bekleyenler. Kişiler için ücretsiz; kuruluşlar kimliklerini doğrular.',
  Home: 'Ana sayfa',
  'For organizations': 'Kuruluşlar için',
  'for organizations': 'kuruluşlar için',
  Pricing: 'Fiyatlar',
  pricing: 'fiyatlar',
  'security and privacy': 'güvenlik ve gizlilik',
  Developers: 'Geliştiriciler',
  developers: 'geliştiriciler',
  About: 'Hakkında',
  Help: 'Yardım',
  Example: 'Örnek',
  'Who someone is to you comes first.': 'Birinin sizin için kim olduğu her şeyden önce gelir.',
  'A connection is two people and how they know each other, said by each side, private to each. Everything else in Caime hangs off it.':
    'Bağlantı, iki kişi ve birbirlerini nereden tanıdıklarıdır; bunu her taraf kendisi söyler ve her tarafa özel kalır. Caime’deki her şey bağlantıya dayanır.',
  'colleague · DATA C · work': 'iş arkadaşı · DATA C · iş',
  'brother · family': 'erkek kardeş · aile',
  'Messages that know their context.': 'Bağlamını bilen mesajlar.',
  'One-to-one, groups, topics under a connection, spaces for a family, a team or a club. Ordered, delivered once, and yours offline.':
    'Bire bir konuşmalar, gruplar, bir bağlantının altında konular; aile, ekip ya da kulüp için alanlar. Sıralı, yalnızca bir kez teslim edilir ve çevrimdışıyken de elinizin altındadır.',
  'Did the contract arrive?': 'Sözleşme geldi mi?',
  'Yes, signing it Friday.': 'Evet, cuma günü imzalıyorum.',
  'read · 2 min': 'okundu · 2 dk',
  'What needs you, not everything.': 'Her şey değil, sizi bekleyenler.',
  'The inbox sorts by what needs you, what’s important, what’s waiting on someone else and what’s quiet, and says why. Your rules by relationship win.':
    'Gelen kutusu konuşmaları sizi bekleyenler, önemliler, başkasını bekleyenler ve sessizler diye ayırır ve nedenini söyler. İlişkiye göre koyduğunuz kurallar her zaman önce gelir.',
  'Sarah asked about the contract': 'Sarah sözleşmeyi sordu',
  'Omar · the deck · since Tuesday': 'Omar · sunum · salıdan beri',
  '3 need you': '3 kişi sizi bekliyor',
  'Nothing said is lost.': 'Söylenen hiçbir şey kaybolmaz.',
  'Commitments, dates, amounts, questions and decisions are found in the conversation and offered back as actions. They become facts only when you say so.':
    'Verilen sözler, tarihler, tutarlar, sorular ve kararlar konuşmadan çıkarılır ve size eylem olarak önerilir. Ancak siz onayladığınızda kesinleşir.',
  Suggested: 'Öneri',
  'Remind me: send the deck · Monday': 'Hatırlat: sunumu gönder · pazartesi',
  'Waiting on Sarah: contract': 'Sarah’tan bekleniyor: sözleşme',
  'based on “I’ll send the deck on Monday.”': '“Sunumu pazartesi gönderirim” mesajına göre',
  'A business that proves it’s the business.': 'Kim olduğunu kanıtlayan işletme.',
  'An organization verifies its domain with one DNS record. Its team answers customers as the organization, in one inbox, with apps and an AI agent that always say what they are.':
    'Kuruluş, alan adını tek bir DNS kaydıyla doğrular. Ekibi müşterilere tek bir gelen kutusundan, kuruluş adına yanıt verir; uygulamalar ve AI temsilcisi ne olduklarını her zaman belli eder.',
  'verified · niledental.example': 'doğrulanmış · niledental.example',
  'Lina · new patient forms': 'Lina · yeni hasta formları',
  'Each side of your life sees what you chose.': 'Hayatınızın her yanı seçtiklerinizi görür.',
  'Profile fields by sphere, read receipts only both ways, requests before strangers reach you, and end-to-end encryption when a conversation should be private.':
    'Çevreye göre profil alanları, yalnızca karşılıklı okundu bilgisi, yabancılar size ulaşmadan önce istek ve özel kalması gereken konuşmalar için uçtan uca şifreleme.',
  'work sees': 'iş çevreniz görür',
  'name · headline · organization': 'ad · başlık · kuruluş',
  'family sees': 'aileniz görür',
  'everything, and where you are when you share it':
    'her şeyi ve paylaştığınızda nerede olduğunuzu',
  'a stranger sees': 'bir yabancı görür',
  'your name and handle, and may ask': 'adınızı ve kullanıcı adınızı; size istek gönderebilir',
  '{n} GB': '{n} GB',
  'price shown in the app': 'fiyat uygulamada gösterilir',
  '{price} a month': 'ayda {price}',
  '{price} a year': 'yılda {price}',
  ', or ': ' veya ',
  'It lands in the inbox, first if they’ve waited longest.':
    'Gelen kutusuna düşer; en uzun bekleyen en üstte.',
  'Lina writes to Nile Dental from the app she uses for everyone else. The team sees one conversation, its state and who has it; Lina sees the organization, never which person.':
    'Lina, Nile Dental’e herkese yazdığı uygulamadan yazar. Ekip tek bir konuşma, durumunu ve kimin üstlendiğini görür; Lina ise kuruluşu görür, hangi kişinin yanıtladığını asla.',
  'Can I book a cleaning on Thursday?': 'Perşembe için diş temizliği randevusu alabilir miyim?',
  'new · nobody has it · 2 min': 'yeni · kimse üstlenmedi · 2 dk',
  'The agent answers': 'AI temsilcisi yanıtlar',
  'From what you wrote down, and it says so.':
    'Sizin yazdıklarınıza dayanarak; bunu da açıkça söyler.',
  'The organization’s AI agent answers only from its knowledge (up to {n} characters you gave it), is marked as an AI, and hands over to a person the moment it isn’t sure. With bookable hours set, it offers the open slots and books the one the customer picks, for the team to confirm.':
    'Kuruluşun AI temsilcisi yalnızca kendisine verilen bilgilerden (sizin yazdığınız en fazla {n} karakter) yanıt verir, AI olarak işaretlenir ve emin olmadığı anda konuşmayı bir insana devreder. Rezervasyon saatleri ayarlıysa boş saatleri önerir ve müşterinin seçtiği saati, ekip onaylamak üzere ayırır.',
  'I can offer Thursday 10:00 or 10:30. Which suits you?':
    'Perşembe 10:00 ya da 10:30 olabilir. Hangisi size uyar?',
  'Cleaning · Thursday 10:00 · requested': 'Temizlik · Perşembe 10:00 · talep edildi',
  'Nile Dental · AI agent · automated': 'Nile Dental · AI temsilcisi · otomatik',
  'The team answers': 'Ekip yanıtlar',
  'Whoever answers has it; the customer hears from the organization.':
    'Yanıtlayan konuşmayı üstlenir; müşteri yanıtı kuruluştan alır.',
  'Answering takes the conversation. Assign it, escalate it to an owner or admin with a note, or resolve it; it comes back the moment the customer writes again.':
    'Yanıt vermek konuşmayı üstlenmek demektir. Konuşmayı birine atayın, bir notla sahibine ya da bir yöneticiye yükseltin veya çözüldü olarak kapatın; müşteri yeniden yazdığı anda konuşma geri gelir.',
  '10:00 is yours. See you Thursday.': '10:00 sizin. Perşembe görüşmek üzere.',
  'Your tools hear it': 'Araçlarınız da haberdar olur',
  'A helpdesk, a CRM or your own bot, in the same conversation.':
    'Yardım masası, CRM ya da kendi botunuz; hepsi aynı konuşmada.',
  'An app’s bot replies as the organization, marked automated, and never counts as the team’s answer. Its webhook hears each message and each change of state.':
    'Bir uygulamanın botu kuruluş adına, otomatik olarak işaretlenmiş yanıt verir ve hiçbir zaman ekibin yanıtı sayılmaz. Webhook’u her mesajdan ve her durum değişikliğinden haberdar olur.',
  'resolved · by person': 'çözüldü · bir kişi tarafından',
  'Booking · confirmed · by customer': 'Rezervasyon · onaylandı · müşteri tarafından',
  'A colleague sees the professional you.': 'İş arkadaşlarınız profesyonel yüzünüzü görür.',
  'Name, headline, organization, the hours you answer in. Your birthday, your family and your location stay out of it unless you say otherwise.':
    'Adınız, başlığınız, kuruluşunuz ve yanıt verdiğiniz saatler. Doğum gününüz, aileniz ve konumunuz, siz aksini söylemedikçe görünmez.',
  sees: 'görür',
  'Noor Haddad · Dentist · Nile Dental': 'Noor Haddad · Diş hekimi · Nile Dental',
  'doesn’t see': 'görmez',
  'birthday · family · where you are': 'doğum günü · aile · nerede olduğunuz',
  'Family sees more, because you said so.':
    'Aileniz daha fazlasını görür, çünkü siz öyle istediniz.',
  'What each sphere sees is a setting you own, field by field. Sharing your location live is one tap, for as long as you chose, and ends on its own.':
    'Her çevrenin neyi göreceğini alan alan siz ayarlarsınız. Konumunuzu canlı paylaşmak tek dokunuş; seçtiğiniz süre boyunca sürer ve kendiliğinden biter.',
  'everything you chose, and where you are while you share it':
    'seçtiğiniz her şeyi ve paylaşırken nerede olduğunuzu',
  until: 'bitiş',
  'the hour you picked': 'seçtiğiniz saat',
  'A stranger': 'Bir yabancı',
  'A stranger may ask. Nothing more.': 'Bir yabancı yalnızca istekte bulunabilir. Fazlası yok.',
  'Someone who isn’t connected to you sees your name and handle, if you let yourself be found. Their first message arrives as a request: one message until you answer.':
    'Bağlantınız olmayan biri, bulunmanıza izin verdiyseniz adınızı ve kullanıcı adınızı görür. İlk mesajı istek olarak gelir: siz yanıtlayana kadar yalnızca bir mesaj.',
  'Hi Noor, found you!': 'Merhaba Noor, seni buldum!',
  'one message until you answer · decline and they never know':
    'siz yanıtlayana kadar tek mesaj · reddederseniz haberi olmaz',
  'A customer sees the organization, never its people.':
    'Müşteri kuruluşu görür, çalışanlarını asla.',
  'In a business conversation the team’s names and ids are masked everywhere: messages, read receipts, suggestions, exports. Anything filed for the customer names the organization.':
    'İş konuşmalarında ekibin adları ve kimlikleri her yerde gizlenir: mesajlarda, okundu bilgilerinde, önerilerde, dışa aktarımlarda. Müşteri için kaydedilen her şeyde yalnızca kuruluşun adı geçer.',
  'verified · answered in an hour': 'doğrulanmış · bir saat içinde yanıtladı',
  '{n} actions a day': 'günde {n} eylem',
  '{n} conversations a day': 'günde {n} konuşma',
  '{n} answers a day': 'günde {n} yanıt',
  'Your family, your work and your customers don’t belong in one list. Say who each person is to you, once. From then on Caime knows what needs you first, who may reach you when, what was decided and what’s owed, and what each side of your life sees of you.':
    'Aileniz, işiniz ve müşterileriniz aynı listeye sığmaz. Her kişinin sizin için kim olduğunu bir kez söyleyin. Caime o andan itibaren önce neyin sizi beklediğini, kimin size ne zaman ulaşabileceğini, neye karar verildiğini, kimin neyi yapacağını ve hayatınızın her yanının sizden neyi gördüğünü bilir.',
  'Start free': 'Ücretsiz başlayın',
  Specification: 'Teknik özellikler',
  'primary object': 'temel nesne',
  'The connection between two people, not the chat.': 'Sohbet değil, iki kişi arasındaki bağlantı.',
  'to connect': 'bağlantı kurmak',
  'Connect in three taps. Say how you know someone; the conversation, its notifications and its cards fit the relationship.':
    'Üç dokunuşla bağlanın. Birini nereden tanıdığınızı söyleyin; konuşma, bildirimleri ve kartları ilişkiye göre şekillenir.',
  attention: 'dikkat',
  '“3 need you”, never “47 unread”. The inbox puts what matters first and says why.':
    '“3 kişi sizi bekliyor”, asla “47 okunmamış”. Gelen kutusu önemli olanı öne alır ve nedenini söyler.',
  memory: 'hafıza',
  'Commitments, dates, amounts and decisions are found in the conversation and offered as actions. You decide; nothing is written for you.':
    'Verilen sözler, tarihler, tutarlar ve kararlar konuşmadan çıkarılır ve eylem olarak önerilir. Kararı siz verirsiniz; sizin yerinize hiçbir şey yazılmaz.',
  organizations: 'kuruluşlar',
  'A business proves its domain with one DNS record; its team answers as the organization, in one inbox, and customers book from its open slots.':
    'İşletme, alan adını tek bir DNS kaydıyla kanıtlar; ekibi tek bir gelen kutusundan kuruluş adına yanıt verir, müşteriler de boş saatlerden randevu alır.',
  'Each side of your life sees what you chose. End-to-end encrypted when you say so, with a recovery key only you hold.':
    'Hayatınızın her yanı seçtiklerinizi görür. İsterseniz uçtan uca şifreli; kurtarma anahtarı yalnızca sizde.',
  money: 'para',
  'Never held or moved by Caime. A split records who owes whom; nothing else.':
    'Caime parayı asla tutmaz, aktarmaz. Bölüşme kartı yalnızca kimin kime borçlu olduğunu kaydeder; o kadar.',
  'Free for people, always. Organizations start free and can buy Business.':
    'Kişiler için her zaman ücretsiz. Kuruluşlar ücretsiz başlar, isterse Business planını satın alır.',
  'runs on': 'platformlar',
  'Web, iOS and Android, from one account.': 'Tek hesapla web, iOS ve Android.',
  'Layers · pick one': 'Katmanlar · birini seçin',
  '{site} for organizations: answer as the organization, and prove it’s you':
    'Kuruluşlar için {site}: kuruluş adına yanıt verin, kim olduğunuzu kanıtlayın',
  'A clinic, a shop, a school or a nonprofit verifies its domain with one DNS record and answers customers as the organization, in one inbox, with an AI agent and apps that always say what they are. Free for a team of three.':
    'Klinik, mağaza, okul ya da dernek; alan adını tek bir DNS kaydıyla doğrular ve müşterilere tek bir gelen kutusundan kuruluş adına yanıt verir. AI temsilcisi ve uygulamalar ne olduklarını her zaman belli eder. Üç kişilik ekipler için ücretsiz.',
  'Answer as the organization, and prove it’s you.':
    'Kuruluş adına yanıt verin, kim olduğunuzu kanıtlayın.',
  'A clinic, a shop, a school, a nonprofit or a public service gets a profile people can trust once it verifies its domain, and one inbox where its team answers customers as the organization. Customers write from the app they already use for everyone else in their life.':
    'Klinik, mağaza, okul, dernek ya da kamu hizmeti; alan adını doğruladığında insanların güvenebileceği bir profile ve ekibinin müşterilere kuruluş adına yanıt verdiği tek bir gelen kutusuna sahip olur. Müşteriler, hayatlarındaki herkesle zaten yazıştıkları uygulamadan yazar.',
  verification: 'doğrulama',
  'One TXT record on your domain. Verified shows on your page and beside your team; it is checked, never bought, and yours again if you ever close and come back.':
    'Alan adınızda tek bir TXT kaydı. Doğrulanmış rozeti sayfanızda ve ekibinizin yanında görünür; satın alınmaz, kontrol edilerek verilir ve bir gün kapatıp geri dönerseniz yine sizindir.',
  'the inbox': 'gelen kutusu',
  'Every customer conversation in one place, sorted by who has waited longest, in six views: {views}.':
    'Tüm müşteri konuşmaları tek yerde, en uzun bekleyen en üstte, altı görünümde: {views}.',
  'the team': 'ekip',
  'Owners, admins and members. A customer sees the organization, never which person answered. A seat that ends takes nothing with it.':
    'Sahipler, yöneticiler ve üyeler. Müşteri kuruluşu görür, hangi kişinin yanıtladığını asla. Ekipten ayrılan biri hiçbir şeyi yanında götürmez.',
  'writing first': 'ilk mesaj',
  'Your team may write to someone first. It arrives as a request: one message until they answer, and their answer opens the conversation.':
    'Ekibiniz birine ilk mesajı atabilir. Mesaj istek olarak ulaşır: karşı taraf yanıtlayana kadar yalnızca bir mesaj; yanıt verdiğinde konuşma açılır.',
  'the ai agent': 'ai temsilcisi',
  'Answers from what you wrote down (up to {n} characters), is marked as an AI, and hands over to a person the moment it isn’t sure. It never speaks for the team.':
    'Sizin yazdıklarınızdan (en fazla {n} karakter) yanıt verir, AI olarak işaretlenir ve emin olmadığı anda bir insana devreder. Ekip adına asla konuşmaz.',
  'Set bookable hours once. Customers pick from the open slots, your AI agent offers the next few and books the one they choose, and every booking is an appointment your team confirms.':
    'Rezervasyon saatlerini bir kez ayarlayın. Müşteriler boş saatlerden seçer, AI temsilciniz en yakın birkaçını önerir ve seçileni ayırır; her rezervasyon, ekibinizin onayladığı bir randevu olur.',
  apps: 'uygulamalar',
  'A helpdesk, a CRM or your own bot: a token that reaches only your conversations, a signed webhook, and cards of your own design.':
    'Yardım masası, CRM ya da kendi botunuz: yalnızca sizin konuşmalarınıza erişen bir belirteç, imzalı bir webhook ve kendi tasarladığınız kartlar.',
  updates: 'güncellemeler',
  'Post to everyone who follows you. Nobody sees who follows, and nothing about following reaches anyone’s inbox.':
    'Sizi takip eden herkese paylaşın. Kimin takip ettiğini kimse göremez ve takiple ilgili hiçbir şey kimsenin gelen kutusuna düşmez.',
  spaces: 'alanlar',
  'Spaces for the team, a project or a branch, started from the organization’s page, with your team already there to pick from.':
    'Ekip, proje ya da şube için alanlar; kuruluşun sayfasından açılır, ekibiniz de seçilmeye hazır bekler.',
  calls: 'aramalar',
  'Voice and video, one to one and in groups of up to {n}, in the browser.':
    'Tarayıcıda sesli ve görüntülü arama; bire bir ya da en fazla {n} kişilik gruplarla.',
  insights: 'içgörüler',
  'How fast the team answers, how many customers write and what is still open. On Business.':
    'Ekibin ne kadar hızlı yanıt verdiği, kaç müşterinin yazdığı ve neyin hâlâ açık olduğu. Business planında.',
  'Free for a team of {team}, with {apps}. Business for the rest: {pricing}.':
    '{team} kişilik ekiplere {apps} ile ücretsiz. Daha fazlası için Business: {pricing}.',
  'one app': 'bir uygulama',
  'A customer’s day · pick a step': 'Bir müşterinin günü · bir adım seçin',
  'For developers': 'Geliştiriciler için',
  '{site} pricing: free for people, organizations pay for their team':
    '{site} fiyatlandırması: kişiler için ücretsiz, kuruluşlar ekipleri için öder',
  'What makes Caime Caime is never counted. People use it free; Pro adds AI, storage, automations and insights. Organizations start free for a team of three and buy Business for the rest.':
    'Caime’yi Caime yapan hiçbir şey kotaya girmez. Kişiler ücretsiz kullanır; Pro, AI, depolama, otomasyonlar ve içgörüler ekler. Kuruluşlar üç kişilik ekiple ücretsiz başlar, fazlası için Business planını alır.',
  'Free for people. Organizations pay for their team.':
    'Kişiler için ücretsiz. Kuruluşlar ekipleri için öder.',
  'What makes Caime Caime is never counted: connections, relationships, what needs you, what you’re waiting for, search and sync are in every plan. Plans differ only in what costs money to run, and in what organizations buy.':
    'Caime’yi Caime yapan hiçbir şey kotaya girmez: bağlantılar, ilişkiler, sizi bekleyenler, beklediğiniz şeyler, arama ve eşitleme her planda var. Planlar yalnızca çalıştırması para tutan özelliklerde ve kuruluşların satın aldıklarında ayrılır.',
  'For people': 'Kişiler için',
  Personal: 'Kişisel',
  ', always': ', her zaman',
  '{n} actions a day, once you turn it on': 'açtığınızda günde {n} eylem',
  files: 'dosyalar',
  automations: 'otomasyonlar',
  'everything else': 'diğer her şey',
  'connections, attention, memory, spaces, calls, private conversations':
    'bağlantılar, dikkat, hafıza, alanlar, aramalar, özel konuşmalar',
  Pro: 'Pro',
  'how your relationships are going, from your own messages, for you only':
    'ilişkileriniz nasıl gidiyor: kendi mesajlarınızdan, yalnızca size özel',
  team: 'ekip',
  'how fast the team answers, who is waiting, what is open':
    'ekip ne kadar hızlı yanıt veriyor, kim bekliyor, ne açık',
  Enterprise: 'Enterprise',
  'Talk to us': 'Bize ulaşın',
  included: 'dahil',
  'The rules': 'Kurallar',
  'never counted': 'kotaya girmez',
  'A conversation a customer starts. Anyone who writes to you. Your connections, however many.':
    'Müşterinin başlattığı konuşmalar. Size yazan herkes. Bağlantılarınız, kaç tane olursa olsun.',
  'a lower plan': 'daha düşük bir plana geçmek',
  'takes nothing away: nobody is removed from a team and no app stops. It only stops new additions until they fit.':
    'hiçbir şeyi elinizden almaz: kimse ekipten çıkarılmaz, hiçbir uygulama durmaz. Yalnızca sınırın altına inene kadar yeni ekleme yapılamaz.',
  paying: 'ödeme',
  'Through Stripe, by card. Cancel whenever you like: it stays on until the end of what you paid for, and nothing you use today goes away after.':
    'Stripe üzerinden, kartla. İstediğiniz zaman iptal edin: ödediğiniz dönemin sonuna kadar açık kalır, bugün kullandığınız hiçbir şey sonrasında kaybolmaz.',
  'a seat': 'ekip üyeliği',
  'on a Business or Enterprise team includes everything Pro does.':
    'Business ya da Enterprise ekibinde Pro’daki her şeyi içerir.',
  '{site} security and privacy: each side of your life sees what you chose':
    '{site} güvenlik ve gizlilik: hayatınızın her yanı seçtiklerinizi görür',
  'How you describe people is only ever yours. Profile by sphere, read receipts both ways only, requests before strangers, end-to-end encryption with a recovery key you hold, and a server that keeps envelopes, not words.':
    'İnsanları nasıl tanımladığınız yalnızca size aittir. Çevreye göre profil, yalnızca karşılıklı okundu bilgisi, yabancılar için önce istek, kurtarma anahtarı sizde olan uçtan uca şifreleme ve sözcükleri değil yalnızca zarfları saklayan bir sunucu.',
  'Privacy in Caime isn’t a setting you find later. How you describe someone is only ever yours, what each sphere of your life sees of you is decided by you, field by field, and a conversation that should be private is encrypted so that not even Caime can read it.':
    'Caime’de gizlilik sonradan aranıp bulunan bir ayar değildir. Birini nasıl tanımladığınız yalnızca size aittir; hayatınızın her çevresinin sizden neyi göreceğine alan alan siz karar verirsiniz ve özel kalması gereken bir konuşma, Caime’nin bile okuyamayacağı şekilde şifrelenir.',
  'Who sees what · pick a side': 'Kim neyi görür · bir taraf seçin',
  'your labels': 'etiketleriniz',
  'How you describe the people you know (family, work, a client) is yours. The person you describe sees it only if you both turn on sharing; nobody else ever does.':
    'Tanıdıklarınızı nasıl tanımladığınız (aile, iş, müşteri) size aittir. Tanımladığınız kişi bunu yalnızca ikiniz de paylaşımı açarsanız görür; başka hiç kimse görmez.',
  'read receipts': 'okundu bilgisi',
  'Only both ways: you see theirs when they see yours.':
    'Yalnızca karşılıklı: onlar sizinkini görüyorsa siz de onlarınkini görürsünüz.',
  strangers: 'yabancılar',
  'A message from someone you don’t know arrives as a request: one message until you answer. Declined, they never know.':
    'Tanımadığınız birinin mesajı istek olarak gelir: siz yanıtlayana kadar yalnızca bir mesaj. Reddederseniz karşı tarafın haberi olmaz.',
  'under 18': '18 yaş altı',
  'No public page, no money cards, no messages from organizations they didn’t write to first, and adults are told when a conversation includes a minor.':
    'Herkese açık sayfa yok, para kartları yok, kendilerinin önce yazmadığı kuruluşlardan mesaj yok; bir konuşmada reşit olmayan biri varsa yetişkinlere bildirilir.',
  'private conversations': 'özel konuşmalar',
  'End to end encrypted: a fresh AES-256-GCM key for every message, wrapped for each device allowed to read it with P-256 ECDH and HKDF, and the whole envelope signed by the device that sent it. The server keeps envelopes, never words. Up to {people} people, {devices} devices each.':
    'Uçtan uca şifreli: her mesaja yeni bir AES-256-GCM anahtarı; bu anahtar, mesajı okumasına izin verilen her cihaz için P-256 ECDH ve HKDF ile sarmalanır ve zarfın tamamı gönderen cihaz tarafından imzalanır. Sunucu zarfları saklar, sözcükleri asla. En fazla {people} kişi, kişi başına {devices} cihaz.',
  'your devices': 'cihazlarınız',
  'A new device reads nothing until you say it’s yours on one you already have. Your security code is your first device’s, so it stays the same as you add devices and changes only when you start over.':
    'Yeni bir cihaz, zaten kullandığınız bir cihazdan onu onaylayana kadar hiçbir şey okuyamaz. Güvenlik kodunuz ilk cihazınıza aittir; bu yüzden cihaz ekledikçe değişmez, yalnızca sıfırdan başladığınızda değişir.',
  'A recovery key you hold, shown once, brings your private conversations back when every device is gone. Caime keeps nothing of it.':
    'Yalnızca sizde olan ve bir kez gösterilen kurtarma anahtarı, tüm cihazlarınızı kaybettiğinizde özel konuşmalarınızı geri getirir. Caime ondan hiçbir iz saklamaz.',
  'what isn’t hidden': 'gizlenmeyenler',
  'Who is in a conversation, when messages are sent and how long they are, and reactions. The app says so.':
    'Bir konuşmada kimlerin olduğu, mesajların ne zaman gönderildiği ve ne kadar uzun olduğu, bir de tepkiler. Uygulama bunu açıkça belirtir.',
  'blocks and reports': 'engelleme ve şikâyetler',
  'A block stops every write, both ways. Reports are read by a person and acted on; every action is in the audit log.':
    'Engelleme, iki yönde de her türlü yazmayı durdurur. Şikâyetleri bir insan okur ve gereğini yapar; her işlem denetim kaydında yer alır.',
  'your data': 'verileriniz',
  'Download all of it, or delete your account, from Settings. Ended sign-ins are kept {signIns} days, security records {records}, a handle you let go of {handles} from everyone.':
    'Tüm verilerinizi indirebilir ya da hesabınızı Ayarlar’dan silebilirsiniz. Sona eren oturumlar {signIns} gün, güvenlik kayıtları {records} saklanır; bıraktığınız bir kullanıcı adı {handles} boyunca kimseye verilmez.',
  'a year': 'bir yıl',
  'the server': 'sunucu',
  'A content security policy on every page, no third-party scripts, no ads, no tracking across sites, and a backup checked after every dump.':
    'Her sayfada içerik güvenlik politikası; üçüncü taraf betik yok, reklam yok, siteler arası izleme yok; her yedek alındıktan sonra kontrol edilir.',
  AI: 'AI',
  'Off until an adult turns it on, never on a private conversation, and everything it infers is a suggestion you accept or don’t.':
    'Bir yetişkin açana kadar kapalıdır, özel konuşmalarda asla çalışmaz ve çıkardığı her şey, kabul edip etmemek size kalmış bir öneridir.',
  'Read the privacy policy': 'Gizlilik politikasını okuyun',
  'Report a concern': 'Bir sorun bildirin',
  '{site} for developers: an API that reaches only what it was given':
    'Geliştiriciler için {site}: yalnızca kendisine verilene ulaşan bir API',
  'Apps for organizations with scoped tokens, signed webhooks, bots and cards of their own; personal tokens and OAuth for apps that act for a person; a typed SDK. Every write is idempotent.':
    'Kuruluşlar için yetkisi sınırlı belirteçler, imzalı webhook’lar, botlar ve kendi kartlarıyla uygulamalar; bir kişi adına çalışan uygulamalar için kişisel belirteçler ve OAuth; tip güvenli bir SDK. Her yazma işlemi idempotent’tir.',
  'An API that reaches only what it was given.': 'Yalnızca kendisine verilene ulaşan bir API.',
  'Organizations connect a helpdesk, a CRM or a bot of their own. People let an app act for them, with the permissions they chose. Every token reaches a fixed set of routes, every webhook is signed, and nothing an app does is passed off as a person.':
    'Kuruluşlar yardım masalarını, CRM’lerini ya da kendi botlarını bağlar. Kişiler, seçtikleri izinlerle bir uygulamanın kendi adlarına işlem yapmasına izin verir. Her belirteç yalnızca belirli rotalara erişir, her webhook imzalıdır ve bir uygulamanın yaptığı hiçbir şey bir insanın yapmış gibi gösterilmez.',
  'Added on the organization’s page. Each has its own bot on the team, a token shown once, and a webhook signed with a secret shown once. Replace either and the old one stops at once.':
    'Kuruluşun sayfasından eklenir. Her uygulamanın ekipte kendi botu, bir kez gösterilen bir belirteci ve bir kez gösterilen gizli anahtarla imzalanan bir webhook’u olur. Birini yenilediğinizde eskisi hemen geçersiz olur.',
  permissions: 'izinler',
  '{scopes}: given one by one. A route the token can’t use answers 403.':
    '{scopes}: tek tek verilir. Belirtecin kullanamadığı bir rota 403 döndürür.',
  webhooks: 'webhook’lar',
  '{events}. Signed, https only, no private addresses, one deadline for the whole exchange.':
    '{events}. İmzalı, yalnızca https, özel adres yok, tüm iletişim için tek bir zaman aşımı.',
  'your own cards': 'kendi kartlarınız',
  'Define a kind of card with fields and states. Your bot sends it, the team and the customer move it, and you hear when they do.':
    'Alanları ve durumlarıyla bir kart türü tanımlayın. Botunuz gönderir, ekip ve müşteri ilerletir; her adımdan haberiniz olur.',
  idempotent: 'idempotent',
  'Every write carries a {clientId}. Sending it again returns the first result, never a second message.':
    'Her yazma işlemi bir {clientId} taşır. Yeniden gönderildiğinde ilk sonuç döner; asla ikinci bir mesaj oluşmaz.',
  rate: 'hız sınırı',
  '{n} requests a minute per token.': 'Belirteç başına dakikada {n} istek.',
  'the sdk': 'sdk',
  '{sdk}: a typed client for every route an app reaches, and the webhook check. Built from the repository until it is on npm.':
    '{sdk}: bir uygulamanın erişebildiği her rota için tip güvenli bir istemci ve webhook doğrulaması. npm’de yayımlanana kadar depodan derlenir.',
  'personal tokens': 'kişisel belirteçler',
  'A person makes a token for their own scripts ({scopes}). It never reaches the account itself.':
    'Kişi, kendi betikleri için bir belirteç oluşturur ({scopes}). Bu belirteç hesabın kendisine asla erişemez.',
  OAuth: 'OAuth',
  'Third-party apps ask people for consent (OAuth 2.0; errors as RFC 6749 and 7009 say), hold only what they were given, and can be revoked any time from Settings.':
    'Üçüncü taraf uygulamalar kişilerden onay ister (OAuth 2.0; hatalar RFC 6749 ve 7009’a uygun), yalnızca kendilerine verilene erişir ve Ayarlar’dan her an iptal edilebilir.',
  'the guide': 'kılavuz',
  'In the app: Settings → Developer, and beside each app on the organization’s page.':
    'Uygulamada: Ayarlar → Geliştirici; ayrıca kuruluşun sayfasında her uygulamanın yanında.',
  'About {site}': '{site} hakkında',
  '{site} is made by {maker}: a communication product, and only that. It never holds or moves money, runs no third-party code and has no feed. The primary object is the connection between two people, not the chat.':
    '{site}, {maker} tarafından yapılır: yalnızca bir iletişim ürünü, başka bir şey değil. Parayı asla tutmaz ya da aktarmaz, üçüncü taraf kod çalıştırmaz ve akışı yoktur. Temel nesne sohbet değil, iki kişi arasındaki bağlantıdır.',
  'Made for the people in your life, not for a feed.':
    'Bir akış için değil, hayatınızdaki insanlar için yapıldı.',
  '{site} is made by {maker}. It is a communication product, and only that: it never holds or moves money, runs no third-party code, and has no feed. The primary object is the connection between two people, not the chat.':
    '{site}, {maker} tarafından yapılır. Yalnızca bir iletişim ürünüdür, başka bir şey değil: parayı asla tutmaz ya da aktarmaz, üçüncü taraf kod çalıştırmaz ve akışı yoktur. Temel nesne sohbet değil, iki kişi arasındaki bağlantıdır.',
  'made by': 'yapımcı',
  'what it is': 'nedir',
  'Messaging for people, and for the organizations they deal with, on the web, iOS and Android, from one account.':
    'Kişiler ve muhatap oldukları kuruluşlar için mesajlaşma; web, iOS ve Android’de, tek hesapla.',
  'what it isn’t': 'ne değildir',
  'A super-app. No wallet, no marketplace, no feed, no scripts from anyone else.':
    'Bir süper uygulama. Cüzdan yok, pazar yeri yok, akış yok, başkalarının betikleri yok.',
  'the characters': 'karakterler',
  'Caishy and friends (Momo, Panda, Lumi, Pico, Niko and Zuzu) appear where there is something to celebrate or nothing yet to show, never beside your invoice.':
    'Caishy ve arkadaşları (Momo, Panda, Lumi, Pico, Niko ve Zuzu) kutlanacak bir şey olduğunda ya da henüz gösterilecek bir şey olmadığında ortaya çıkar; faturanızın yanında asla.',
  'how it’s built': 'nasıl yapılıyor',
  'One codebase for the server, the web and the phones. Every change is tested end to end against the real server before it ships, and only what passed goes live.':
    'Sunucu, web ve telefonlar için tek kod tabanı. Her değişiklik yayına çıkmadan önce gerçek sunucuya karşı uçtan uca test edilir; yalnızca testi geçen yayına alınır.',
  'your say': 'söz sizde',
  'Questions, ideas and concerns go to {mail}.':
    'Sorularınızı, fikirlerinizi ve endişelerinizi {mail} adresine yazın.',
  'Web, iOS and Android.': 'Web, iOS ve Android.',
  '{agentName} handed a conversation to the team': '{agentName} bir konuşmayı ekibe devretti',
  'A customer': 'Bir müşteri',
  Call: 'Arama',
  Answered: 'Yanıtlandı',
  'Missed video call': 'Cevapsız görüntülü arama',
  'Missed voice call': 'Cevapsız sesli arama',
  'from {caller}': 'Arayan: {caller}',
  'the same name': 'aynı ad',
  'one name is part of the other': 'adlardan biri diğerinin parçası',
  'the same nickname': 'aynı takma ad',
  'you know both from {org}': 'ikisini de {org} üzerinden tanıyorsunuz',
  '{name} may have two accounts': '{name} adlı kişinin iki hesabı olabilir',
  '{merge} and {keep} may be the same person': '{merge} ve {keep} aynı kişi olabilir',
  'Both have {reasons}. Merged, they show as one in People; both accounts and conversations stay, and you can separate them again.':
    'Ortak noktaları: {reasons}. Birleştirirseniz Kişiler’de tek kişi olarak görünürler; iki hesap da konuşmalar da kalır ve onları yeniden ayırabilirsiniz.',
  ', and ': ' ve ',
  '{title} call': '{title} araması',
  Joined: 'Katıldınız',
  'Turned down': 'Reddettiniz',
  'Missed group video call': 'Cevapsız grup görüntülü araması',
  'Missed group voice call': 'Cevapsız grup sesli araması',
  'from {starter}': 'Başlatan: {starter}',
  'in {title}': 'Konuşma: {title}',
  '{name} opened your invite link': '{name} davet bağlantınızı açtı',
  'You decide who connects with you: accept to connect.':
    'Kiminle bağlantı kuracağınıza siz karar verirsiniz: bağlanmak için kabul edin.',
  automated: 'otomatik',
  'Message request': 'Mesaj isteği',
  Group: 'Grup',
  'New message': 'Yeni mesaj',
  '{n} new messages in {groupTitle}': {
    one: '{groupTitle} grubunda {n} yeni mesaj',
    other: '{groupTitle} grubunda {n} yeni mesaj',
  },
  '{senderName} sent {n} messages{context}': {
    one: '{senderName} {n} mesaj gönderdi{context}',
    other: '{senderName} {n} mesaj gönderdi{context}',
  },
  '“{topic}” keeps coming up here. A separate topic keeps it together.':
    '“{topic}” burada sık sık açılıyor. Ayrı bir konu açarsanız hepsi bir arada durur.',
  'Your report was reviewed': 'Şikâyetiniz incelendi',
  'Thanks for reporting it: Caime looked and acted.':
    'Bildirdiğiniz için teşekkürler: Caime inceledi ve gereğini yaptı.',
  'Thanks for reporting it: Caime looked, and didn’t act on it this time.':
    'Bildirdiğiniz için teşekkürler: Caime inceledi; bu kez bir işlem yapmadı.',
  'Colleague · {org}': 'İş arkadaşı · {org}',
  'You and {other} are both on {org}’s team, and {org} is verified.':
    'Siz ve {other}, ikiniz de {org} ekibindesiniz ve {org} doğrulanmış bir kuruluş.',
  'You and {other} are both on {org}’s team in Caime.':
    'Siz ve {other}, Caime’de ikiniz de {org} ekibindesiniz.',
  'You and {other} are both in {space}, a {kind} space.':
    'Siz ve {other}, ikiniz de {kind} türündeki {space} alanındasınız.',
  them: 'bu kişi',
  '{name} described how you know each other as {label}{where}.':
    '{name}, birbirinizi nereden tanıdığınızı “{label}{where}” olarak tanımladı.',
  'You both use @{domain} email addresses.': 'İkiniz de @{domain} e-posta adresi kullanıyorsunuz.',
  '{name} asked you': '{name} sizden bir şey istedi',
  '{name} finished your request': '{name} isteğinizi tamamladı',
  '{name} accepted your request': '{name} isteğinizi kabul etti',
  '{name} declined your request': '{name} isteğinizi reddetti',
  '{name} reopened your request': '{name} isteğinizi yeniden açtı',
  '{name} cancelled your request': '{name} isteğinizi iptal etti',
  '{speaker} wrote {quote}': '{speaker} şunu yazdı: {quote}',
  '{name} gave you a conversation': '{name} bir konuşmayı size atadı',
  '{name} escalated a conversation': '{name} bir konuşmayı yükseltti',
  '{name} is calling': '{name} arıyor',
  '{name} joined through your invite': '{name} davetinizle katıldı',
  'You’re connected. Say hi.': 'Bağlandınız. Bir merhaba deyin.',
  'Say hi when you’re ready.': 'Hazır olduğunuzda merhaba deyin.',
  '{name} wants to connect with you': '{name} sizinle bağlanmak istiyor',
  '{name} finished {title}': '{name} listeyi bitirdi: {title}',
  '{name} finished the list': '{name} listeyi bitirdi',
  'Everything on it is ticked.': 'Listedeki her şey işaretlendi.',
  '{name} settled up': '{name} payını ödedi',
  '{amount} of {title}.': '{title}: {amount}.',
  'the split': 'bölüşme',
  'Their share of {title}.': '{title} için kendi payı.',
  '{name} added {n} photos to {album}': {
    one: '{name}, {album} albümüne {n} fotoğraf ekledi',
    other: '{name}, {album} albümüne {n} fotoğraf ekledi',
  },
  '{name} is calling {where}': '{name} arıyor: {where}',
  '{n} messages this week.': { one: 'Bu hafta {n} mesaj.', other: 'Bu hafta {n} mesaj.' },
  'Quiet this week.': 'Bu hafta sessiz.',
  '{n} open for you.': { one: 'Sizde {n} açık iş var.', other: 'Sizde {n} açık iş var.' },
  'Waiting on {n}.': 'Beklenen: {n}.',
  'Last decision: {title}.': 'Son karar: {title}.',
  'Next date: {date}.': 'Sonraki tarih: {date}.',
  'No reply from {name} yet': '{name} henüz yanıt vermedi',
  'Follow up on “{text}”?': '“{text}” için hatırlatma yapılsın mı?',
  'Follow up?': 'Hatırlatma yapılsın mı?',
  Reminder: 'Hatırlatma',
  'Cai can’t help with this one.': 'Cai bu konuda yardımcı olamıyor.',
  'AI assist is busy. Try again in a moment.': 'AI yardımı meşgul. Birazdan yeniden deneyin.',
  'AI assist didn’t work this time. Try again.': 'AI yardımı bu kez çalışmadı. Yeniden deneyin.',
  'Webhooks go to https addresses.': 'Webhook adresleri https olmalıdır.',
  'That address is on a private network.': 'Bu adres özel bir ağda.',
  '{plan} can’t be bought right now.': '{plan} şu anda satın alınamıyor.',
  '{lead}: Stripe said “{message}”.': '{lead}: Stripe “{message}” dedi.',
  '{plan} is part of this plan already.': '{plan} zaten bu plana dahil.',
  '{plan} is on already: change it from Manage billing.':
    '{plan} zaten açık: Faturalandırmayı yönet bölümünden değiştirin.',
  'There’s nothing paid for here yet.': 'Burada henüz ödenmiş bir şey yok.',
  'You can’t message this person.': 'Bu kişiye mesaj gönderemezsiniz.',
  'You blocked {orgName}. Unblock it to write to it again.':
    '{orgName} engellenmiş durumda. Yeniden yazmak için engeli kaldırın.',
  'This device isn’t set up for private conversations: sign in again to write here.':
    'Bu cihaz özel konuşmalar için ayarlı değil: buraya yazmak için yeniden oturum açın.',
  'Someone’s devices changed since this was sealed.':
    'Bu mühürlendikten sonra birinin cihazları değişti.',
  'Sign in to continue.': 'Devam etmek için oturum açın.',
  'You can’t do that here.': 'Bunu burada yapamazsınız.',
  That: 'Bu',
  '{what} wasn’t found.': '{what} bulunamadı.',
  'Too many requests. Try again in a moment.': 'Çok fazla istek. Birazdan yeniden deneyin.',
  'Caime can’t send email here yet. Use a recovery code instead, or ask whoever runs it.':
    'Caime burada henüz e-posta gönderemiyor. Bunun yerine bir kurtarma kodu kullanın ya da sunucuyu yöneten kişiye başvurun.',
  'It belongs to {name}, which closed. If you’re {name}, verify {domain} to take it back.':
    'Bu kullanıcı adı kapanan {name} kuruluşuna ait. {name} sizseniz, geri almak için {domain} alan adını doğrulayın.',
  'That invite': 'Bu davet',
  'That’s your own invite.': 'Bu sizin kendi davetiniz.',
  'You can’t connect with this person.': 'Bu kişiyle bağlanamazsınız.',
  'An organization’s own cards are for conversations with it.':
    'Bir kuruluşun kendi kartları yalnızca onunla yapılan konuşmalarda kullanılır.',
  'Only the organization sends its cards.': 'Kartlarını yalnızca kuruluş gönderir.',
  'This app needs the “kits” permission for that.':
    'Bu uygulamanın bunun için “kits” iznine ihtiyacı var.',
  'Say which app’s card, and which of its cards.':
    'Hangi uygulamanın hangi kartı olduğunu belirtin.',
  'An app sends only its own cards.': 'Bir uygulama yalnızca kendi kartlarını gönderir.',
  'That card isn’t available here.': 'Bu kart burada kullanılamıyor.',
  '{name} cards aren’t available in this conversation.':
    '{name} kartları bu konuşmada kullanılamıyor.',
  'That person': 'Bu kişi',
  '{name} only takes messages from people they know. Send a connection request instead.':
    '{name} yalnızca tanıdığı kişilerden mesaj alıyor. Bunun yerine bağlantı isteği gönderin.',
  'That clientId was already used.': 'Bu clientId zaten kullanıldı.',
  'That conversation': 'Bu konuşma',
  'Only admins can post here.': 'Burada yalnızca yöneticiler paylaşım yapabilir.',
  'Only a person, on their own device, writes in a private conversation.':
    'Özel konuşmaya yalnızca bir insan, kendi cihazından yazabilir.',
  'Messages in a private conversation are text, sealed on your device.':
    'Özel konuşmadaki mesajlar, cihazınızda mühürlenen metinlerdir.',
  'Only private conversations take sealed messages.':
    'Mühürlü mesajları yalnızca özel konuşmalar alır.',
  'This organization closed, so nothing more is written here. Find it again to start a new conversation.':
    'Bu kuruluş kapandı; artık buraya bir şey yazılamaz. Yeni bir konuşma başlatmak için kuruluşu yeniden bulun.',
  'You can send more once they accept your message request.':
    'Mesaj isteğinizi kabul ettiklerinde daha fazlasını gönderebilirsiniz.',
  'You can only reply to a message in this conversation.':
    'Yalnızca bu konuşmadaki bir mesajı yanıtlayabilirsiniz.',
  'One of the attachments isn’t available.': 'Eklerden biri kullanılamıyor.',
  'Sharing a location is for people over 18.': 'Konum paylaşımı 18 yaş üstü kişiler içindir.',
  '{name} cards are for one-to-one conversations.': '{name} kartları bire bir konuşmalar içindir.',
  '{name} cards aren’t for conversations with an organization.':
    '{name} kartları bir kuruluşla yapılan konuşmalar için değildir.',
  'There’s nobody here to split it with.': 'Burada masrafı bölüşecek kimse yok.',
  'Live location is for people you know, not organizations.':
    'Canlı konum, kuruluşlar için değil, tanıdığınız kişiler içindir.',
  'That organization': 'Bu kuruluş',
  'You’ve used today’s {aiPerDay} AI assists.{ready}{more}':
    'Bugünkü {aiPerDay} AI yardımı hakkınızı kullandınız.{ready}{more}',
  'The next one is ready {when}.': 'Sıradaki hakkınız {when} hazır olur.',
  '{plan} includes {n} a day.': '{plan} planında günde {n} hak var.',
  '{plan} includes {bytes}.': '{plan} planında {bytes} alan var.',
  'That’s more than the {allowed} of files your plan includes ({used} used).{more}':
    'Bu, planınızdaki {allowed} dosya alanını aşıyor ({used} kullanıldı).{more}',
  '{plan} has room for {n}.': '{plan} planında {n} kişilik yer var.',
  '{name}’s {plan} plan has room for {room} people on the team.{more}':
    '{name} kuruluşunun {plan} planında ekipte {room} kişilik yer var.{more}',
  '{plan} includes {n}.': '{plan} planında {n} uygulamaya kadar yer var.',
  '{org}’s {plan} plan includes {apps}.{more}':
    '{org} kuruluşunun {plan} planı {apps} içerir.{more}',
  'The next can start {when}.': 'Bir sonraki konuşma {when} başlatılabilir.',
  '{name} has started today’s {startsPerDay} new conversations.{ready}{more}':
    '{name} bugünkü {startsPerDay} yeni konuşmayı başlattı.{ready}{more}',
  'Insights come with Business: how fast {name}’s team answers, how many customers write, and what’s still open.':
    'İçgörüler Business planıyla gelir: {name} ekibinin ne kadar hızlı yanıt verdiği, kaç müşterinin yazdığı ve neyin hâlâ açık olduğu.',
  'Relationship insights come with {pro}: who you write with most, who’s gone quiet, how fast you answer and are answered, and when you write.':
    'İlişki içgörüleri {pro} ile gelir: en çok kiminle yazıştığınız, kimin sessizleştiği, ne kadar hızlı yanıt verdiğiniz ve yanıt aldığınız, ne zaman yazdığınız.',
  '{plan} keeps {n}.': '{plan} planında {n} otomasyona kadar yer var.',
  '{plan} keeps {most} automations. Remove one to add another.{more}':
    '{plan} planında en fazla {most} otomasyon olabilir. Yenisini eklemek için birini kaldırın.{more}',
  'That space': 'Bu alan',
  'That recording is too long to transcribe.': 'Bu kayıt yazıya dökülemeyecek kadar uzun.',
  'Invalid request.': 'Geçersiz istek.',
  'Your account': 'Hesabınız',
  'That password isn’t right.': 'Bu parola doğru değil.',
  'A message is linked with its conversation.': 'Bir mesaj kendi konuşmasına bağlıdır.',
  'That message': 'Bu mesaj',
  'That context': 'Bu bağlam',
  'That task': 'Bu görev',
  'You can’t assign this person.': 'Bu kişiyi atayamazsınız.',
  'You can ask people you’re connected with.':
    'Yalnızca bağlantınız olan kişilerden bir şey isteyebilirsiniz.',
  'A request goes to someone else.': 'İstek yalnızca başka birine gönderilebilir.',
  'Requests between a customer and an organization aren’t available yet.':
    'Müşteri ile kuruluş arasında istekler henüz kullanılamıyor.',
  'Only the person who asked can change this.': 'Bunu yalnızca isteyen kişi değiştirebilir.',
  'Only the person asked can accept or decline.':
    'Yalnızca kendisinden istenen kişi kabul edebilir veya reddedebilir.',
  'Only the person who asked can cancel.': 'Yalnızca isteyen kişi iptal edebilir.',
  'Only the person who created this can delete it.': 'Bunu yalnızca oluşturan kişi silebilir.',
  'That decision': 'Bu karar',
  'Only whoever recorded it, or the group’s admins, change a decision.':
    'Bir kararı yalnızca onu kaydeden kişi ya da grubun yöneticileri değiştirebilir.',
  '{plan} is paid for through Stripe: cancel it there (at once, or at the end of what’s paid), and the plan follows.':
    '{plan} Stripe üzerinden ödeniyor: aboneliği orada iptal edin (hemen ya da ödenen dönemin sonunda), plan da buna göre değişir.',
  'That report': 'Bu şikâyet',
  'This report isn’t about a message.': 'Bu şikâyet bir mesajla ilgili değil.',
  'Lines about the conversation stay.': 'Konuşmanın bilgi satırları kalır.',
  'This report isn’t about an update.': 'Bu şikâyet bir güncellemeyle ilgili değil.',
  'This report isn’t about a person.': 'Bu şikâyet bir kişiyle ilgili değil.',
  'Another instance is backing up right now.': 'Başka bir sunucu örneği şu anda yedek alıyor.',
  'That handle isn’t reserved or held: whoever wants it can take it themselves.':
    'Bu kullanıcı adı ayrılmış ya da bekletilmiyor: isteyen kendisi alabilir.',
  'Someone else has that handle.': 'Bu kullanıcı adı başka birinde.',
  'Only a closed organization is deleted.': 'Yalnızca kapanmış bir kuruluş silinebilir.',
  'Only the organization’s owner and admins can.':
    'Bunu yalnızca kuruluşun sahibi ve yöneticileri yapabilir.',
  'AI isn’t available on this Caime server.': 'Bu Caime sunucusunda AI kullanılamıyor.',
  'That organization’s AI agent': 'Bu kuruluşun AI temsilcisi',
  'It didn’t answer this time. Try again.': 'Bu kez yanıt vermedi. Yeniden deneyin.',
  'AI assist isn’t set up on this server.': 'Bu sunucuda AI yardımı kurulu değil.',
  'AI assist is for adults for now.': 'AI yardımı şimdilik yetişkinler için.',
  'Turn on AI assist in Settings to use it.': 'Kullanmak için Ayarlar’dan AI yardımını açın.',
  'This conversation is private, so AI assist can’t read it.':
    'Bu konuşma özel; AI yardımı onu okuyamaz.',
  'That app': 'Bu uygulama',
  'This route is for an app’s token.': 'Bu rota uygulama belirteçleri içindir.',
  'A failed delivery of this app by that id': 'Bu uygulamanın bu kimliğe sahip başarısız teslimatı',
  'A webhook address for that app': 'O uygulama için bir webhook adresi',
  'You need to be at least {MINIMUM_AGE} to use Caime.':
    'Caime’yi kullanmak için en az {MINIMUM_AGE} yaşında olmalısınız.',
  'That email already has an account. Sign in instead?':
    'Bu e-postayla zaten bir hesap var. Oturum açmak ister misiniz?',
  'That email or handle and password don’t match.':
    'E-posta veya kullanıcı adı ile parola eşleşmiyor.',
  'That session': 'Bu oturum',
  'Your current password isn’t right.': 'Mevcut parolanız doğru değil.',
  'Your password isn’t right.': 'Parolanız doğru değil.',
  'This address is confirmed.': 'Bu adres doğrulandı.',
  'That code isn’t right. Check the email again.':
    'Bu kod doğru değil. E-postanızı yeniden kontrol edin.',
  'That code has run out. Send a new one.': 'Bu kodun süresi doldu. Yeni bir kod isteyin.',
  'Too many tries with that code. Send a new one.':
    'Bu kodla çok fazla deneme yapıldı. Yeni bir kod isteyin.',
  'That link has been used or has run out. Ask for a new one.':
    'Bu bağlantı kullanılmış ya da süresi dolmuş. Yenisini isteyin.',
  'That recovery code doesn’t match this account.': 'Bu kurtarma kodu bu hesapla eşleşmiyor.',
  'That automation': 'Bu otomasyon',
  'A private conversation keeps to itself: nothing in it is saved elsewhere.':
    'Özel konuşma kendi içinde kalır: içindeki hiçbir şey başka bir yere kaydedilmez.',
  'Accept the message request to save anything from it.':
    'Buradan bir şey kaydetmek için mesaj isteğini kabul edin.',
  'A line about the conversation isn’t saved.': 'Konuşmanın bilgi satırları kaydedilmez.',
  'That file': 'Bu dosya',
  'You’ve saved {SAVED_MAX} things, the most there’s room for. Remove some to save more.':
    '{SAVED_MAX} öge kaydettiniz; sığabilecek en fazla bu. Daha fazlasını kaydetmek için bazılarını kaldırın.',
  'That saved item': 'Bu kaydedilen öge',
  'An automation saves to {collection}. Change it or remove it first.':
    'Bir otomasyon {collection} koleksiyonuna kaydediyor. Önce onu değiştirin ya da kaldırın.',
  'Plans are bought by someone 18 or over.':
    'Planları yalnızca 18 yaş ve üstü kişiler satın alabilir.',
  'Only the organization’s owner and admins can change what it pays.':
    'Kuruluşun planını yalnızca sahibi ve yöneticileri değiştirebilir.',
  'That isn’t from Stripe.': 'Bu Stripe’tan gelmiyor.',
  'That isn’t an event.': 'Bu bir olay değil.',
  'You’re on its team. Leave the team instead.':
    'Bu kuruluşun ekibindesiniz. Bunun yerine ekipten ayrılın.',
  'You’re on its team: its conversations are in its inbox.':
    'Bu kuruluşun ekibindesiniz: konuşmaları kuruluşun gelen kutusunda.',
  'Under 18, you can message organizations that have verified who they are. {name} hasn’t yet.':
    '18 yaşından küçükseniz yalnızca kimliğini doğrulamış kuruluşlara mesaj gönderebilirsiniz. {name} henüz doğrulanmadı.',
  'You blocked {name}. Unblock it to write to it again.':
    '{name} engellenmiş durumda. Yeniden yazmak için engeli kaldırın.',
  'A person on the team writes first; an app answers customers.':
    'İlk mesajı ekipteki bir kişi yazar; uygulamalar müşterilere yalnızca yanıt verir.',
  'Nobody by that handle can hear from {name}.':
    'Bu kullanıcı adına sahip, {name} kuruluşundan mesaj alabilecek kimse yok.',
  'They’re on the team: write to them directly.': 'Bu kişi ekipte: ona doğrudan yazın.',
  'Verify {name}’s domain first: only a verified organization writes to someone first.':
    'Önce {name} kuruluşunun alan adını doğrulayın: birine ilk mesajı yalnızca doğrulanmış kuruluşlar yazabilir.',
  '{name} only takes messages from people they know.':
    '{name} yalnızca tanıdığı kişilerden mesaj alıyor.',
  'They aren’t on the team.': 'Bu kişi ekipte değil.',
  'That’s the AI agent: give it to a person.': 'Bu AI temsilcisi: konuşmayı bir kişiye atayın.',
  'That’s an app’s bot: give it to a person.':
    'Bu bir uygulamanın botu: konuşmayı bir kişiye atayın.',
  'It’s already resolved.': 'Zaten çözüldü.',
  'It’s open already.': 'Zaten açık.',
  'Reopen it first.': 'Önce yeniden açın.',
  'Ask for up to a year, from one instant to a later one.':
    'En fazla bir yıllık bir aralık isteyin: bir başlangıç ve ondan sonraki bir bitiş.',
  'That calendar': 'Bu takvim',
  'That call': 'Bu arama',
  'That call has ended.': 'Bu arama bitti.',
  'Calls are for conversations between two people.':
    'Aramalar iki kişi arasındaki konuşmalar içindir.',
  'There’s nobody to call here.': 'Burada aranacak kimse yok.',
  'You can call once your message request is accepted.':
    'Mesaj isteğiniz kabul edildiğinde arayabilirsiniz.',
  'You can’t call this person.': 'Bu kişiyi arayamazsınız.',
  '{name} is on another call.': '{name} başka bir aramada.',
  'Only the person called can answer.': 'Yalnızca aranan kişi yanıtlayabilir.',
  'Only the person called can decline.': 'Yalnızca aranan kişi reddedebilir.',
  'This device isn’t in that call.': 'Bu cihaz o aramada değil.',
  'That’s you.': 'Bu sizsiniz.',
  'You’re already connected.': 'Zaten bağlısınız.',
  'Your request is waiting for them.': 'İsteğiniz yanıt bekliyor.',
  '{name} isn’t accepting requests from people they don’t know yet.':
    '{name} henüz tanımadığı kişilerden istek kabul etmiyor.',
  'You can send another request later.': 'Daha sonra başka bir istek gönderebilirsiniz.',
  'Choose one of your identities.': 'Kimliklerinizden birini seçin.',
  'That request': 'Bu istek',
  'That connection': 'Bu bağlantı',
  'That merged connection': 'Bu birleştirilmiş bağlantı',
  'A private group holds up to {PRIVATE_GROUP_MAX} people: each message is sealed for every device in it.':
    'Özel bir grupta en fazla {PRIVATE_GROUP_MAX} kişi olabilir: her mesaj gruptaki her cihaz için ayrı ayrı mühürlenir.',
  'A topic’s people are its group’s: add, remove or make admins there.':
    'Bir konunun üyeleri, grubunun üyeleridir: kişi ekleme, çıkarma ve yönetici atama grupta yapılır.',
  'Topics are for conversations between people.': 'Konular kişiler arasındaki konuşmalar içindir.',
  'Connect first to start topics.': 'Konu başlatmak için önce bağlanın.',
  'A private conversation keeps to itself: start a topic from your main one.':
    'Özel konuşma kendi içinde kalır: konuyu ana konuşmanızdan başlatın.',
  'Topics branch off a one-to-one, a group, or a space’s General.':
    'Konular bire bir bir konuşmadan, bir gruptan ya da bir alanın Genel konuşmasından açılır.',
  'Connect first to start a private conversation.':
    'Özel bir konuşma başlatmak için önce bağlanın.',
  'You can add people you’re connected with.': 'Bağlı olduğunuz kişileri ekleyebilirsiniz.',
  'Drafts in a private conversation stay on your device.':
    'Özel bir konuşmadaki taslaklar cihazınızda kalır.',
  'Only admins can change this.': 'Bunu yalnızca yöneticiler değiştirebilir.',
  'A topic’s messages disappear as its group’s do: change it there.':
    'Bir konudaki mesajlar, grubundakiler gibi kaybolur: bunu grupta değiştirin.',
  'Only someone who may change that context links it here.':
    'Bir bağlamı buraya yalnızca o bağlamı değiştirebilen biri bağlayabilir.',
  'The general conversation takes the person’s name.': 'Genel konuşma, kişinin adını taşır.',
  'General takes the space’s name. Rename the space instead.':
    'Genel konuşma, alanın adını taşır. Bunun yerine alanı yeniden adlandırın.',
  'There’s no request to answer here.': 'Burada yanıtlanacak istek yok.',
  'Start a group to add people.': 'Kişi eklemek için bir grup başlatın.',
  'Its team is the organization’s: add people to the team instead.':
    'Ekip kuruluşa aittir: bunun yerine kişileri kuruluşun ekibine ekleyin.',
  'Only admins can add people.': 'Yalnızca yöneticiler kişi ekleyebilir.',
  'Add people to the space instead.': 'Bunun yerine alana kişi ekleyin.',
  'Add them to the space first.': 'Önce onları alana ekleyin.',
  'You can archive this conversation instead.': 'Bunun yerine bu konuşmayı arşivleyebilirsiniz.',
  'Leave the group to leave its topics. You can archive this one.':
    'Konularından ayrılmak için gruptan ayrılın. Bu konuşmayı arşivleyebilirsiniz.',
  'Leave the space to leave its General conversation.':
    'Genel konuşmadan ayrılmak için alandan ayrılın.',
  'Remove them from the space instead.': 'Bunun yerine onları alandan çıkarın.',
  'That person in this conversation': 'Bu konuşmadaki bu kişi',
  'Admins remove members; the owner removes admins.':
    'Üyeleri yöneticiler, yöneticileri ise sahibi çıkarır.',
  'Only admins can remove people.': 'Yalnızca yöneticiler kişi çıkarabilir.',
  'Only a group has admins.': 'Yalnızca grupların yöneticisi olur.',
  'Make them an admin of the space instead.': 'Bunun yerine onları alanın yöneticisi yapın.',
  'Only the owner makes admins.': 'Yöneticileri yalnızca sahibi atar.',
  'You can only edit your own messages.': 'Yalnızca kendi mesajlarınızı düzenleyebilirsiniz.',
  'That message was deleted.': 'Bu mesaj silindi.',
  'Only text messages can be edited.': 'Yalnızca metin mesajları düzenlenebilir.',
  'That isn’t a card that can change.': 'Bu, değiştirilebilen bir kart değil.',
  'An app moves only its own cards.': 'Bir uygulama yalnızca kendi kartlarını ilerletir.',
  'You can’t make that change to this card.': 'Bu karta bu değişikliği yapamazsınız.',
  'Someone just changed this card.': 'Biri bu kartı az önce değiştirdi.',
  'That isn’t a live location.': 'Bu canlı bir konum değil.',
  'Only whoever is sharing it can change it.': 'Yalnızca paylaşan kişi değiştirebilir.',
  'This live location has ended.': 'Bu canlı konum sona erdi.',
  'That isn’t a checklist.': 'Bu bir kontrol listesi değil.',
  'That isn’t a split.': 'Bu bir bölüşme değil.',
  'That album': 'Bu albüm',
  'This album is closed.': 'Bu albüm kapalı.',
  'Add photos you’ve uploaded.': 'Yüklediğiniz fotoğrafları ekleyin.',
  'Albums take photos and videos.': 'Albümlere yalnızca fotoğraf ve video eklenebilir.',
  'An album holds {ALBUM_MAX} photos.': 'Bir albümde en fazla {ALBUM_MAX} fotoğraf olabilir.',
  'That photo': 'Bu fotoğraf',
  'Only whoever added it, or made the album, can take it out.':
    'Yalnızca onu ekleyen ya da albümü oluşturan kişi çıkarabilir.',
  'Lines about the conversation stay. You can delete it for yourself.':
    'Konuşmanın bilgi satırları kalır. Kendiniz için silebilirsiniz.',
  'You can delete your own messages.': 'Yalnızca kendi mesajlarınızı silebilirsiniz.',
  'Pinned messages are for conversations between people.':
    'Sabitlenmiş mesajlar kişiler arasındaki konuşmalar içindir.',
  'Only the group’s owner and admins pin messages.':
    'Mesajları yalnızca grubun sahibi ve yöneticileri sabitler.',
  'Messages are pinned once the message request is answered.':
    'Mesajlar, mesaj isteği yanıtlandıktan sonra sabitlenebilir.',
  'Lines about the conversation aren’t pinned.': 'Konuşmanın bilgi satırları sabitlenmez.',
  '{PINNED_MAX} messages are pinned already, including {n} you deleted for yourself. Unpin one first.':
    {
      one: 'Kendiniz için sildiğiniz {n} mesaj dahil {PINNED_MAX} mesaj zaten sabitli. Önce birinin sabitlemesini kaldırın.',
      other:
        'Kendiniz için sildiğiniz {n} mesaj dahil {PINNED_MAX} mesaj zaten sabitli. Önce birinin sabitlemesini kaldırın.',
    },
  '{PINNED_MAX} messages are pinned already. Unpin one first.':
    '{PINNED_MAX} mesaj zaten sabitli. Önce birinin sabitlemesini kaldırın.',
  'That poll': 'Bu anket',
  'That option isn’t in the poll.': 'Bu seçenek ankette yok.',
  'Choose one option.': 'Bir seçenek seçin.',
  'Messages in a private conversation stay in it.': 'Özel bir konuşmadaki mesajlar içinde kalır.',
  'Cards, polls and live locations stay where they were shared.':
    'Kartlar, anketler ve canlı konumlar paylaşıldıkları yerde kalır.',
  'Nothing is forwarded into a private conversation.': 'Özel bir konuşmaya hiçbir şey iletilmez.',
  'Only a device signed in to Caime reads private conversations.':
    'Özel konuşmaları yalnızca Caime’de oturum açmış bir cihaz okur.',
  'This device can’t pick up where it left off: it registers afresh.':
    'Bu cihaz kaldığı yerden devam edemez: yeniden kaydedilecek.',
  'That device': 'Bu cihaz',
  'Private conversations open on up to {MAX_DEVICES} devices: remove one in Settings first.':
    'Özel konuşmalar en fazla {MAX_DEVICES} cihazda açılır: önce Ayarlar’dan birini kaldırın.',
  'That device is registered already.': 'Bu cihaz zaten kayıtlı.',
  'Approve it from a device that reads your private conversations already: this one doesn’t yet.':
    'Özel konuşmalarınızı zaten okuyabilen bir cihazdan onaylayın: bu cihaz henüz okuyamıyor.',
  'That key was used already.': 'Bu anahtar zaten kullanıldı.',
  'A recovery key for your account': 'Hesabınız için bir kurtarma anahtarı',
  'Only private conversations are sealed.': 'Yalnızca özel konuşmalar mühürlenir.',
  'That photo couldn’t be read, so it wasn’t sent. Try another.':
    'Bu fotoğraf okunamadı, bu yüzden gönderilmedi. Başka bir fotoğraf deneyin.',
  'That file is over 100 MB.': 'Bu dosya 100 MB’tan büyük.',
  'That upload': 'Bu yükleme',
  'This upload is already complete.': 'Bu yükleme zaten tamamlandı.',
  'Resume from the server’s offset.': 'Sunucunun bildirdiği konumdan devam edin.',
  'More bytes than declared.': 'Bildirilenden fazla bayt gönderildi.',
  'That thumbnail': 'Bu küçük resim',
  'That logo': 'Bu logo',
  'That avatar': 'Bu profil resmi',
  'There’s a call on here already: join it.': 'Burada zaten süren bir arama var: katılın.',
  'Group calls are for group conversations.': 'Grup aramaları grup konuşmaları içindir.',
  'You can call once you’ve joined the conversation.': 'Konuşmaya katıldığınızda arayabilirsiniz.',
  'Calls are for groups of up to {GROUP_CALL_MAX} people.':
    'Aramalar en fazla {GROUP_CALL_MAX} kişilik gruplar içindir.',
  'You can join once you’ve joined the conversation.':
    'Konuşmaya katıldığınızda aramaya da katılabilirsiniz.',
  'This call is full.': 'Bu arama dolu.',
  'You can’t join this call.': 'Bu aramaya katılamazsınız.',
  'That handle': 'Bu kullanıcı adı',
  'Connect first to bring a chat over.': 'Bir sohbeti buraya aktarmak için önce bağlanın.',
  'Only an app’s token does this.': 'Bunu yalnızca bir uygulamanın belirteci yapar.',
  'An app has up to {perApp} kinds of card. Remove one to make another.':
    'Bir uygulamanın en fazla {perApp} kart türü olur. Başkasını oluşturmak için birini kaldırın.',
  'That kit': 'Bu kart türü',
  'That isn’t one of an app’s cards.': 'Bu bir uygulamanın kartlarından biri değil.',
  'An app changes only its own cards.': 'Bir uygulama yalnızca kendi kartlarını değiştirir.',
  'Choose a time zone from the list.': 'Listeden bir saat dilimi seçin.',
  'Choose an image you uploaded.': 'Yüklediğiniz bir resmi seçin.',
  'You can have up to 10 identities.': 'En fazla 10 kimliğiniz olabilir.',
  'That identity': 'Bu kimlik',
  'Make another identity your default first.': 'Önce başka bir kimliği varsayılanınız yapın.',
  'Apps are made by people over 18.': 'Uygulamaları yalnızca 18 yaş üstü kişiler oluşturabilir.',
  'You have {MAX_APPS} apps. Remove one first.':
    '{MAX_APPS} uygulamanız var. Önce birini kaldırın.',
  'That app isn’t registered with Caime.': 'Bu uygulama Caime’ye kayıtlı değil.',
  'That app didn’t register this return address.': 'Bu uygulama bu dönüş adresini kaydetmedi.',
  'The app didn’t say what it wants to do.': 'Uygulama ne yapmak istediğini söylemedi.',
  '“{unknown}” isn’t something an app can ask for.':
    '“{unknown}” bir uygulamanın isteyebileceği bir şey değil.',
  'This export is too large to make here. Write to Caime and it will be made for you.':
    'Bu dışa aktarım burada hazırlanamayacak kadar büyük. Caime’ye yazın, sizin için hazırlansın.',
  'Only the owner sets how long conversations are kept.':
    'Konuşmaların ne kadar saklanacağını yalnızca sahibi belirler.',
  'You’re in it already.': 'Zaten içindesiniz.',
  'Teams are for people over 18.': 'Ekipler 18 yaş üstü kişiler içindir.',
  'That person on the team': 'Ekipteki bu kişi',
  'That’s an app’s bot: remove the app instead.':
    'Bu bir uygulamanın botu: bunun yerine uygulamayı kaldırın.',
  'Admins remove the team; the owner removes admins.':
    'Ekip üyelerini yöneticiler, yöneticileri ise sahibi çıkarır.',
  'Only the organization’s owner and admins remove people.':
    'Kişileri yalnızca kuruluşun sahibi ve yöneticileri çıkarır.',
  'That’s an app’s bot: change the app instead.':
    'Bu bir uygulamanın botu: bunun yerine uygulamayı değiştirin.',
  'Enter a domain like datac.com.': 'datac.com gibi bir alan adı girin.',
  'Another organization has verified this domain.': 'Başka bir kuruluş bu alan adını doğruladı.',
  'Add your domain first.': 'Önce alan adınızı ekleyin.',
  'We couldn’t find the record yet. DNS changes can take a few minutes, sometimes an hour.':
    'Kaydı henüz bulamadık. DNS değişiklikleri birkaç dakika, bazen bir saat sürebilir.',
  'Only the organization’s owner closes it.': 'Kuruluşu yalnızca sahibi kapatır.',
  'This organization was never verified at a domain, so there’s no way to prove it’s yours.':
    'Bu kuruluş hiçbir alan adıyla doğrulanmadı; bu yüzden size ait olduğunu kanıtlamanın bir yolu yok.',
  'Start taking it back first.': 'Önce geri alma işlemini başlatın.',
  'That rule': 'Bu kural',
  'There’s a rule for them already: change that one.':
    'Bunun için zaten bir kural var: onu değiştirin.',
  'Unknown sphere.': 'Bilinmeyen çevre.',
  '“{role}” isn’t a {sphere} role. Use a custom role instead.':
    '“{role}” bir {sphere} rolü değil. Bunun yerine özel bir rol kullanın.',
  'Choose a role or write your own, not both.':
    'Bir rol seçin ya da kendinizinkini yazın; ikisi birden değil.',
  'That relationship': 'Bu ilişki',
  'Connect with this person first.': 'Önce bu kişiyle bağlanın.',
  'Restore this relationship before changing it.': 'Değiştirmeden önce bu ilişkiyi geri yükleyin.',
  'This relationship is {status}.': 'Bu ilişkinin durumu: {status}.',
  'This kind of relationship doesn’t end. Archive it instead.':
    'Bu tür bir ilişki sona ermez. Bunun yerine arşivleyin.',
  'Only an active relationship can be the main one.':
    'Yalnızca etkin bir ilişki ana ilişki olabilir.',
  'Merge relationships with the same person.':
    'Yalnızca aynı kişiyle olan ilişkiler birleştirilebilir.',
  'You can’t block yourself.': 'Kendinizi engelleyemezsiniz.',
  'Choose what you’re reporting.': 'Neyi şikâyet ettiğinizi seçin.',
  'You can add people on the organization’s team, or people you’re connected with.':
    'Kuruluşun ekibindeki kişileri ya da bağlı olduğunuz kişileri ekleyebilirsiniz.',
  'Only the organization’s owner and admins start its spaces.':
    'Alanlarını yalnızca kuruluşun sahibi ve yöneticileri başlatır.',
  'Only the space’s owner and admins can.':
    'Bunu yalnızca alanın sahibi ve yöneticileri yapabilir.',
  'Only the space’s owner and admins add people.':
    'Kişileri yalnızca alanın sahibi ve yöneticileri ekler.',
  'That person in this space': 'Bu alanda bu kişi',
  'Admins can remove members; the owner removes admins.':
    'Üyeleri yöneticiler, yöneticileri ise sahibi çıkarabilir.',
  'Only the space’s owner and admins remove people.':
    'Kişileri yalnızca alanın sahibi ve yöneticileri çıkarır.',
  'Only the space’s owner makes people admins.':
    'Kişileri yalnızca alanın sahibi yönetici yapabilir.',
  'That suggestion': 'Bu öneri',
  'This step can’t be taken back here.': 'Bu adım burada geri alınamaz.',
  'That step was changed since: it stays.':
    'Bu adım o zamandan beri değiştirildi: olduğu gibi kalır.',
  'Keep one of the two.': 'İkisinden birini seçin.',
  'You aren’t connected with both of them any more.': 'Artık ikisiyle birden bağlantınız yok.',
  'One of them is blocked: it can’t be merged.': 'Biri engellenmiş: birleştirilemez.',
  'This suggestion is missing its person.': 'Bu önerinin ait olduğu kişi bulunamıyor.',
  'This suggestion is missing its conversation.': 'Bu önerinin ait olduğu konuşma bulunamıyor.',
  'Accepting a {kind} suggestion isn’t supported yet.':
    '{kind} türündeki bir öneriyi kabul etmek henüz desteklenmiyor.',
  'Access tokens are for people over 18.': 'Erişim belirteçleri 18 yaş üstü kişiler içindir.',
  'You have {MAX_TOKENS} tokens. Revoke one you don’t use first.':
    '{MAX_TOKENS} belirteciniz var. Önce kullanmadığınız birini iptal edin.',
  'That token': 'Bu belirteç',
  'Only the organization’s owner and admins post its updates.':
    'Güncellemelerini yalnızca kuruluşun sahibi ve yöneticileri paylaşır.',
  'That update is being posted already.': 'Bu güncelleme zaten paylaşılıyor.',
  'That update': 'Bu güncelleme',
  'You’ve blocked it. Unblock it to follow its updates.':
    'Bu kuruluşu engellediniz. Güncellemelerini takip etmek için engeli kaldırın.',
  'This account is suspended. If you think that’s wrong, write to whoever runs Caime.':
    'Bu hesap askıya alındı. Bunun yanlış olduğunu düşünüyorsanız Caime’yi yöneten kişiye yazın.',
  'Missing X-Caime-Client header.': 'X-Caime-Client başlığı eksik.',
  'Someone else is signed in here now.': 'Bu cihazda şu anda başka biri oturum açmış.',
  'An app’s token can’t do this.': 'Bir uygulamanın belirteci bunu yapamaz.',
  'This app needs the “{scope}” permission for that.':
    'Bu uygulamanın bunun için “{scope}” iznine ihtiyacı var.',
  'A token can’t do this: sign in to Caime.': 'Bir belirteç bunu yapamaz: Caime’de oturum açın.',
  'This token needs the “{scope}” permission for that.':
    'Bu belirtecin bunun için “{scope}” iznine ihtiyacı var.',
  '{n} apps': { one: '{n} uygulama', other: '{n} uygulama' },
  'Coming up: {title}': 'Yaklaşan: {title}',
  '{n} promises open': { one: '{n} açık söz', other: '{n} açık söz' },
  '{n} questions unanswered': { one: '{n} yanıtsız soru', other: '{n} yanıtsız soru' },
  'That card': 'Bu kart',
  'That isn’t something you can book here.':
    'Bu, burada rezervasyon yapabileceğiniz bir şey değil.',
  'Paid bookings are for people over 18.': 'Ücretli rezervasyonlar 18 yaş üstü kişiler içindir.',
  'Up to {n} in one booking.': 'Bir rezervasyonda en fazla {n} adet.',
  'They don’t do that one.': 'Bu hizmeti sunmuyorlar.',
  'That time has just been taken. Pick another.': 'Bu saat az önce doldu. Başka bir saat seçin.',
  'Your own bookings are yours to do.': 'Kendi rezervasyonlarınızı kendiniz yerine getirirsiniz.',
  'An organization’s items are public or for its customers.':
    'Bir kuruluşun ögeleri ya herkese açıktır ya da yalnızca müşterileri içindir.',
  'Only people on the team can be providers.': 'Hizmeti yalnızca ekipteki kişiler verebilir.',
  'per day': 'günlük',
  'Only the team says who does a booking.':
    'Rezervasyonu kimin üstleneceğine yalnızca ekip karar verir.',
  'That isn’t a booking from the catalog.': 'Bu, katalogdan yapılmış bir rezervasyon değil.',
  'Orders aren’t taken here.': 'Burada sipariş alınmıyor.',
  'That isn’t something you can order here.': 'Bu, burada sipariş edebileceğiniz bir şey değil.',
  'Up to {n} of that in one order.': 'Bir siparişte bundan en fazla {n} adet.',
  'They don’t offer that way.': 'Bu teslimat yöntemini sunmuyorlar.',
  offers: 'sunulanlar',
  collections: 'koleksiyonlar',
  'Ways to be paid are for people over 18.': 'Ödeme alma yolları 18 yaş üstü kişiler içindir.',
  'In a group, ask to be paid; say you’re paying where it’s two of you.':
    'Grupta ödeme isteyebilirsiniz; “ödüyorum” demek yalnızca iki kişilik konuşmalarda olur.',
  'pays by': 'ödeme yolları',
  '{name}, for {org}': '{name}, {org} adına',
  'That isn’t a Pay card.': 'Bu bir Öde kartı değil.',
  'This card isn’t paid by card.': 'Bu kart kredi kartıyla ödenmiyor.',
  'Only whoever pays it pays by card, while it isn’t paid.':
    'Kartla ödemeyi yalnızca ödeyecek taraf, kart henüz ödenmemişken yapabilir.',
  '{name} doesn’t take cards here any more.': '{name} artık burada kartla ödeme almıyor.',
  'This card has no amount to pay by card.': 'Bu kartta kartla ödenecek bir tutar yok.',
  'Payment to {name}': '{name} için ödeme',
  'Only the organization’s owner connects where its money goes.':
    'Paranın nereye gideceğini yalnızca kuruluşun sahibi belirler.',
  'Paying by card here': 'Burada kartla ödeme',
  'Payments are set by someone 18 or over.': 'Ödemeleri 18 yaşında veya daha büyük biri ayarlar.',
  'Stripe can’t be asked right now': 'Stripe’a şu anda ulaşılamıyor',
  'Only a person pays by card.': 'Kartla yalnızca bir kişi ödeyebilir.',
  'Paying by card can’t start right now': 'Kartla ödeme şu anda başlatılamıyor',
  Waiting: 'Bekleniyor',
  'Send a sticker from the button beside an empty message box. The Caishy Friends pack is free.':
    'Boş mesaj kutusunun yanındaki düğmeden çıkartma gönderin. Caishy ve Arkadaşları paketi ücretsiz.',
  'Press and hold a message, or point at it on a computer, to react, reply or save it.':
    'Tepki vermek, yanıtlamak ya da kaydetmek için bir mesaja basılı tutun veya bilgisayarda üzerine gelin.',
  'Your picture at the top opens you and your settings.':
    'Üstteki fotoğrafınız sizi ve ayarlarınızı açar.',
  'Yay, you found me! I’m Momo. When nothing needs you, I’m the one cheering.':
    'Yaşasın, beni buldunuz! Ben Momo. Sizi bekleyen bir şey olmadığında kutlamayı ben yaparım.',
  'When Attention says nothing needs you, that’s Caime working. Enjoy it!':
    '“Öncelikli” sizi bekleyen bir şey olmadığını söylüyorsa Caime işini yapıyor demektir. Tadını çıkarın!',
  'Mark something done in Actions, and whoever was waiting hears it.':
    '“Eylemler”de bir şeyi tamamlandı olarak işaretleyin, bekleyen kişi bundan haberdar olur.',
  'Quiet hours keep your evenings yours: Settings, then Notifications.':
    'Sessiz saatler akşamlarınızı size bırakır: Ayarlar, sonra Bildirimler.',
  'I’m Panda. I stay by your side while you wait for someone.':
    'Ben Panda. Birini beklerken yanınızdayım.',
  'Ask someone for something, and it waits under “Waiting for” in Actions until they answer.':
    'Birinden bir şey isteyin; yanıt gelene kadar “Eylemler”de “Beklenenler” altında durur.',
  'When a wait goes quiet for three days, Attention asks whether it’s still open.':
    'Bir bekleme üç gün sessiz kalırsa “Öncelikli” hâlâ açık olup olmadığını sorar.',
  'How you know someone can offer a follow-up when a question goes unanswered.':
    'Birini nereden tanıdığınız, bir soru yanıtsız kaldığında takip önerebilir.',
  'Hello, I’m Lumi! I love making new things: groups, topics and spaces.':
    'Merhaba, ben Lumi! Yeni şeyler yapmayı severim: gruplar, konular ve alanlar.',
  'A space gathers the people, conversations and plans of one project.':
    'Bir alan, tek bir projenin kişilerini, sohbetlerini ve planlarını bir araya getirir.',
  'A topic keeps one conversation about one thing, without starting over.':
    'Bir konu, baştan başlamadan tek bir şey hakkındaki sohbeti bir arada tutar.',
  'The + in Chats starts a conversation, a group or a space.':
    '“Sohbetler”deki + bir sohbet, grup ya da alan başlatır.',
  'Hi! I’m Pico, and I’m curious about everything.': 'Merhaba! Ben Pico, her şeyi merak ederim.',
  'Search understands sentences, like “what did Alex ask me last week”.':
    'Arama cümleleri anlar, örneğin “Alex geçen hafta benden ne istedi”.',
  'Search for someone’s name to find your conversations, files and promises with them.':
    'Biriyle olan sohbetlerinizi, dosyalarınızı ve sözlerinizi bulmak için adını arayın.',
  'Find people by their @handle in People.': '“Kişiler”de insanları @kullanıcı adlarıyla bulun.',
  'I’m Niko. First steps are my favourite thing!': 'Ben Niko. İlk adımlar en sevdiğim şey!',
  'Connect with someone from People: their @handle, a link or a QR code.':
    '“Kişiler”den biriyle bağlantı kurun: @kullanıcı adı, bir bağlantı ya da QR kodu.',
  'Tell Caime how you know someone. Only you see it, and it decides what reaches you when.':
    'Caime’e birini nereden tanıdığınızı söyleyin. Bunu yalnızca siz görürsünüz ve size neyin ne zaman ulaşacağını o belirler.',
  'Say hi first. Most good conversations start that way.':
    'İlk selamı siz verin. İyi sohbetlerin çoğu böyle başlar.',
  'I’m Zuzu. I remember what was decided, so you don’t have to.':
    'Ben Zuzu. Neyin kararlaştırıldığını hatırlarım, sizin hatırlamanıza gerek kalmaz.',
  'What was decided and what’s still open in a conversation are in its details.':
    'Bir sohbette neyin kararlaştırıldığı ve neyin hâlâ açık olduğu ayrıntılarındadır.',
  'Save a message to find it again in Saved.':
    'Bir mesajı kaydedin, “Kaydedilenler”de yeniden bulun.',
  'A person’s page remembers what’s open between the two of you.':
    'Bir kişinin sayfası ikiniz arasında açık olanları hatırlar.',
  'Hi, I’m Caishy! Ask me anything about Caime, or just say hi.':
    'Merhaba, ben Caishy! Bana Caime hakkında her şeyi sorun ya da sadece merhaba deyin.',
  'I welcome people to Caime and keep the Caishy Friends stickers. Ask me how anything here works.':
    'Herkesi Caime’e ben karşılarım ve Caishy Friends çıkartmalarına göz kulak olurum. Buradaki her şeyin nasıl çalıştığını bana sorun.',
  'Aww, any time!': 'Ne demek, her zaman!',
  'I cheer you on when you’re all caught up. Ask me what needs you, or what’s coming up.':
    'Her şeyi hallettiğinizde sizi ben alkışlarım. Bana sizi neyin beklediğini ya da sırada ne olduğunu sorun.',
  'Yay! Happy to help!': 'Yaşasın! Yardım etmek ne güzel!',
  'I keep an eye on what you’re waiting for from others. Ask me what you’re waiting on.':
    'Başkalarından beklediklerinize göz kulak olurum. Bana neyi beklediğinizi sorun.',
  'Always here for you.': 'Her zaman yanınızdayım.',
  'I help you make things together: groups, topics and spaces. Ask me which one fits.':
    'Birlikte bir şeyler kurmanıza yardım ederim: gruplar, konular ve alanlar. Hangisinin uygun olduğunu bana sorun.',
  'My pleasure! Go make something lovely.': 'Rica ederim! Haydi, güzel bir şey yaratın.',
  'I know how to find things: messages, files, promises and people. Ask me how to search for something.':
    'Bir şeyleri bulmayı bilirim: mesajlar, dosyalar, sözler ve kişiler. Bir şeyi nasıl arayacağınızı bana sorun.',
  'Any time! What else are you curious about?':
    'Ne zaman isterseniz! Başka neyi merak ediyorsunuz?',
  'I help with first steps: connecting with people, invites and saying hi first. Ask me where to begin.':
    'İlk adımlarda yardım ederim: insanlarla bağlantı kurmak, davetler ve ilk selamı vermek. Nereden başlayacağınızı bana sorun.',
  'You’ve got this!': 'Başaracaksınız!',
  'I remember what was decided and what you said you’d do. Ask me what you promised.':
    'Neye karar verildiğini ve ne yapacağınızı söylediğinizi hatırlarım. Bana ne söz verdiğinizi sorun.',
  'Glad I could help.': 'Yardımcı olabildiysem ne mutlu.',
  'And peace be upon you!': 'Aleyküm selam!',
  'Hi {name}!': 'Merhaba {name}!',
  'Any time!': 'Her zaman!',
  'Hi {name}, I’m Cai. Ask me what you’re waiting on, what’s asked of you, what you said you’d do or what’s coming up.':
    'Merhaba {name}, ben Cai. Neyi beklediğinizi, sizden ne istendiğini, ne söz verdiğinizi ya da sırada ne olduğunu bana sorun.',
  'With AI assist on, you can ask me anything else too.':
    'AI yardımı açıkken bana başka her şeyi de sorabilirsiniz.',
  'Turn on AI assist in Settings, and you can ask me anything else too.':
    'Ayarlar’dan AI yardımını açın, bana başka her şeyi de sorabilirsiniz.',
  'I can answer that with AI assist on: Settings, then AI assist.':
    'AI yardımı açıkken bunu yanıtlayabilirim: Ayarlar, sonra AI yardımı.',
  'That one’s beyond me.': 'Bu benim sınırlarımı aşıyor.',
  'I can always tell you what you’re waiting on, what’s asked of you, what you said you’d do and what’s coming up this week. Just ask, in your own words.':
    'Neyi beklediğinizi, sizden ne istendiğini, ne söz verdiğinizi ve bu hafta sırada ne olduğunu her zaman söyleyebilirim. Kendi sözlerinizle sormanız yeterli.',
  'You’re not waiting on anyone right now.': 'Şu an kimseyi beklemiyorsunuz.',
  'Nobody is waiting on you right now.': 'Şu an sizi bekleyen kimse yok.',
  'Nothing you said you’d do is open.': 'Yapacağınızı söylediğiniz açık bir şey yok.',
  'Coming up this week:': 'Bu hafta sırada:',
  'Nothing is coming up this week.': 'Bu hafta sırada bir şey yok.',
  '{name} reads words and stickers.': '{name} yalnızca yazı ve çıkartma okur.',
  '{name} talks in one conversation.': '{name} ile tek bir sohbet olur.',
  'And {n} more in Actions.': {
    one: 'Ve “Eylemler”de bir tane daha.',
    other: 'Ve “Eylemler”de {n} tane daha.',
  },
  'You’re waiting on {n} things:': {
    one: 'Beklediğiniz bir şey var:',
    other: 'Beklediğiniz {n} şey var:',
  },
  '{n} things are asked of you:': {
    one: 'Sizden bir şey isteniyor:',
    other: 'Sizden {n} şey isteniyor:',
  },
  'You said you’d do {n} things:': {
    one: 'Yapacağınızı söylediğiniz bir şey var:',
    other: 'Yapacağınızı söylediğiniz {n} şey var:',
  },
  '{name} hasn’t answered about “{title}” yet. Shall I send this?':
    '{name} henüz “{title}” hakkında yanıt vermedi. Bunu göndereyim mi?',
  'That follow-up': 'Bu takip',
  'That wait': 'Bu bekleme',
  'That’s no longer open.': 'Bu artık açık değil.',
  'Today:': 'Bugün:',
  'Nothing is planned for today.': 'Bugün için planlanmış bir şey yok.',
  'Ask me about any of it.': 'Bunlardan herhangi birini bana sorabilirsiniz.',
  '{n} things are asked of you.': {
    one: 'Sizden bir şey isteniyor.',
    other: 'Sizden {n} şey isteniyor.',
  },
  'You’re waiting on {n} things.': {
    one: 'Beklediğiniz bir şey var.',
    other: 'Beklediğiniz {n} şey var.',
  },
  'You said you’d do {n} things.': {
    one: 'Yapacağınızı söylediğiniz bir şey var.',
    other: 'Yapacağınızı söylediğiniz {n} şey var.',
  },
  'Say why, so the developer can change it and ask again.':
    'Nedenini söyle ki geliştirici değiştirip yeniden isteyebilsin.',
  'Only an organization’s owner or admins publish apps under it.':
    'Bir kuruluş adına uygulamaları yalnızca sahibi veya yöneticileri yayımlar.',
  'Connect must send people to the app’s own address: one it returns to, or its website.':
    'Bağla, insanları uygulamanın kendi adresine göndermeli: döndüğü bir adres ya da web sitesi.',
  'A listing needs a tagline, a category and where Connect goes.':
    'Bir listeleme için slogan, kategori ve Bağla’nın gideceği yer gerekir.',
};
