/**
 * Who processes data for Caime (R54): one list the privacy page, an organization's Data card
 * and the data processing agreement all read, so none of them can drift from the others. Each
 * entry says what the company does for Caime and what of a person's data reaches it; whether
 * it's in use is the server's to say from its configuration (`SubProcessor.when`).
 */

export type ProcessorCondition =
  /** Always, by how Caime is built. */
  | 'always'
  /** Only where the server is configured for it (a key set, a relay turned on). */
  | 'configured'
  /** Only when a person, or an organization, turns the feature on and uses it. */
  | 'used';

export interface SubProcessor {
  id: string;
  /** The company, as it names itself. */
  name: string;
  /** What it does for Caime. */
  does: string;
  /** What of a person's data reaches it, and when. */
  receives: string;
  when: ProcessorCondition;
}

/** The hosting provider is named by the operator (HOSTING_PROVIDER); this is its entry's shape. */
export const HOSTING: Omit<SubProcessor, 'name'> = {
  id: 'hosting',
  does: 'Runs Caime’s servers, database and file storage.',
  receives: 'Everything Caime keeps, encrypted on disk and in transit; nothing is read by it.',
  when: 'always',
};

/** The network in front of the servers, named by the operator (EDGE_PROVIDER), where there is one. */
export const EDGE: Omit<SubProcessor, 'name'> = {
  id: 'edge',
  does: 'Carries every request between your device and Caime’s servers: its network sits in front of them.',
  receives:
    'Your network address and what passes between your device and Caime, which it decrypts at its edge and sends on to Caime’s servers encrypted again (a private conversation’s messages stay sealed); it keeps only what it needs to protect the service.',
  when: 'configured',
};

export const SUB_PROCESSORS: readonly SubProcessor[] = [
  {
    id: 'stripe',
    name: 'Stripe Payments Europe, Ltd.',
    does: 'Processes payments for paid plans.',
    receives:
      'Your name and email address (for an organization, its name and its owner’s email), your plan, and what you paid; your card details reach Stripe alone, never Caime. When you pay an organization by card on its own Stripe account, Stripe processes it for that organization: Caime sends the amount and the card’s note, and Caime takes nothing.',
    when: 'used',
  },
  {
    id: 'anthropic',
    name: 'Anthropic, PBC',
    does: 'Provides the AI behind AI assist, Cai and organizations’ AI agents (Claude).',
    receives:
      'For AI assist, only when you tap it, what that action needs (your draft, a message to translate, a sentence you typed in search, or up to the last 200 messages of the conversation with who sent each and when; for a question you ask Cai in Search, what search found for it in your own messages, decisions and to-dos, up to 12 of each with who and when; for a call’s notes, what you may read of them, each line with who said it and when; never photos, files or voice); for Cai, only with AI assist on and only for what its rules can’t answer, the last 12 messages of your chat with it and a short list of your open items (their titles and the names you see), without your name; for an organization’s agent, what the organization told it and the latest messages of your conversation with it, without your name. Nothing from a private conversation, ever.',
    when: 'used',
  },
  {
    id: 'push-web',
    name: 'Google, Mozilla, Apple or Microsoft (your browser’s push service)',
    does: 'Delivers notifications to your browser when Caime isn’t open.',
    receives: 'A notification encrypted for your browser alone: the push service can’t read it.',
    when: 'used',
  },
  {
    id: 'expo',
    name: 'Expo (650 Industries, Inc.)',
    does: 'Delivers notifications to the phone apps through Apple’s and Google’s push services.',
    receives: 'What a notification says (a name, a preview), and your device’s push address.',
    when: 'configured',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare, Inc.',
    does: 'Relays calls that can’t connect directly between two devices.',
    receives:
      'Both devices’ network addresses, and the call’s media still encrypted end to end: the relay can’t hear it.',
    when: 'configured',
  },
  {
    id: 'speech',
    name: 'The speech-to-text provider the operator sets',
    does: 'Turns voice notes, and what’s said in a call while Cai takes notes, into words.',
    receives:
      'The audio of a voice note whose sender has AI assist on, or of one thing said in a call whose people all said yes to Cai’s notes, and nothing else about anyone. Nothing from a private conversation, ever.',
    when: 'configured',
  },
  {
    id: 'tts',
    name: 'The text-to-speech provider the operator sets',
    does: 'Gives Cai its voice: in a call whose people all asked Cai to join in, and in Cai’s chat to answer someone who spoke to it with AI assist on.',
    receives:
      'The words Cai says aloud, and nothing else: never anyone’s voice, name or words, and nothing from a private conversation.',
    when: 'configured',
  },
  {
    id: 'mail',
    name: 'The email provider the operator sets (SMTP)',
    does: 'Sends Caime’s mail: a confirmation code, a password reset link.',
    receives: 'Your email address and the message, which carries no conversation.',
    when: 'configured',
  },
  {
    id: 'mail-in',
    name: 'The mail provider the operator sets',
    does: 'Receives mail sent to Caime addresses, and sends as mail the replies written on Caime.',
    receives:
      'Those messages as mail carries them: the addresses, the subject, the words and any attachment.',
    when: 'configured',
  },
  {
    id: 'whatsapp',
    name: 'Meta Platforms (WhatsApp Business Platform)',
    does: 'Sends the one-time code that proves a phone number is yours, over WhatsApp.',
    receives:
      'The phone number you add and the code. No message of yours is read, from WhatsApp or anywhere.',
    when: 'configured',
  },
  {
    id: 'age',
    name: 'The age-check provider the operator sets',
    does: 'Checks someone’s age when Caime asks for it, on its own page: an estimate from a selfie, or a document.',
    receives:
      'Only when you check your age: the picture you take on its page (your face, or your document) and a reference that names nothing of you. It tells Caime whether you’re 18 or over, how it checked and how sure it was; the picture never reaches Caime.',
    when: 'configured',
  },
] as const;
