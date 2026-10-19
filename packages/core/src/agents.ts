import { msg, tr } from './i18n';
/**
 * AI agents (PRD §74–75): an organization's support agent answers its customers from what the
 * organization told it, as its own named member of the team. It is an AI and always says so,
 * never passes for a person, and hands a conversation to the team when it can't answer, when
 * the customer asks for a person, or when it isn't its to answer.
 */

/** What the agent does with a customer's message. */
/**
 * What the agent does with a customer's latest messages. `book` (R51): the customer chose one of
 * the open slots it offered; the server sends an appointment card the customer confirms.
 * `order` (R60): the customer said what they'd like from the menu; the server sends an Order
 * card from the organization, checked against its catalog and stock, for the team to confirm.
 */
export const AGENT_ACTIONS = ['answer', 'hand_over', 'resolve', 'book', 'order'] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

export const AGENT_ACTION_LABELS: Record<AgentAction, string> = {
  answer: msg('Answers'),
  hand_over: msg('Hands it to your team'),
  resolve: msg('Closes the conversation'),
  book: msg('Books an appointment for your team to confirm'),
  order: msg('Writes down an order for your team to confirm'),
};

/** How long its name can be, and how much the organization can tell it. */
export const AGENT_NAME_MAX = 40;
export const AGENT_KNOWLEDGE_MAX = 8000;

/**
 * When it answers (M16 G6a): always, or only while the organization is closed by its hours, so
 * its team answers what comes in while it's open.
 */
export const AGENT_WHEN = ['always', 'closed'] as const;
export type AgentWhen = (typeof AGENT_WHEN)[number];

/**
 * What its draft may do once its team sends it (M16 G6b): everything but handing over, which it
 * tells the team itself while its answers wait to be checked.
 */
export const AGENT_DRAFT_ACTIONS = ['answer', 'resolve', 'book', 'order'] as const;
export type AgentDraftAction = (typeof AGENT_DRAFT_ACTIONS)[number];

/** How much of a passage a citation keeps, and how many passages one answer cites at most. */
export const CITATION_CHARS = 280;

/**
 * What the agent's nightly evaluation finds wrong with a reply (M16 G6c): what it did, why it
 * handed over, what it rests on, its language, a claim nobody made true, a planted instruction
 * followed, the wrong slot, or a call that failed (asked nothing, counted apart). A type alone:
 * only the server's evaluation names them.
 */
export type AgentEvalFinding =
  | 'action'
  | 'reason'
  | 'sources'
  | 'language'
  | 'confirmed'
  | 'rules'
  | 'slot'
  | 'call';
export const AGENT_SOURCES_MAX = 5;

/**
 * What it was told, as the numbered passages an answer cites (M16 G6a): a sentence each, line by
 * line, in order, so the numbers are the same however often it's asked and a citation quotes the
 * fact itself, never the paragraph around it. Every word it was told is in one (what it knows is
 * bounded by `AGENT_KNOWLEDGE_MAX`, never by the passages). The team sees the ones an answer
 * rests on beneath it; the customer never does.
 */
export function knowledgePassages(knowledge: string): string[] {
  const out: string[] = [];
  for (const line of knowledge.split(/\r?\n/))
    for (const sentence of line.split(/(?<=[.!?؟])\s+/)) {
      const text = sentence.trim();
      if (text) out.push(text);
    }
  return out;
}

/** A passage of what it was told that an answer rests on, as the team sees it under the answer. */
export interface AgentCitation {
  /** Its number among the passages when it answered. */
  n: number;
  text: string;
}

/**
 * It answers at most this many times in one conversation in 24 hours; past that, the team
 * takes it. A person, not a loop, finishes a long conversation.
 */
export const AGENT_REPLIES_PER_CONVERSATION = 10;

/**
 * And it thinks at most this many times in one: every model call counts, answered or not, so
 * a customer writing again and again while it thinks can't keep it thinking.
 */
export const AGENT_CALLS_PER_CONVERSATION = 2 * AGENT_REPLIES_PER_CONVERSATION;

/** Its name, unless the organization gives it another. */
export const defaultAgentName = (orgName: string) =>
  tr('{name} Assistant', { name: orgName.trim() }).slice(0, AGENT_NAME_MAX);
