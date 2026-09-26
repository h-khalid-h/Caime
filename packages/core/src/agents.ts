/**
 * AI agents (PRD §74–75): an organization's support agent answers its customers from what the
 * organization told it, as its own named member of the team. It is an AI and always says so,
 * never passes for a person, and hands a conversation to the team when it can't answer, when
 * the customer asks for a person, or when it isn't its to answer.
 */

/** What the agent does with a customer's message. */
export const AGENT_ACTIONS = ['answer', 'hand_over', 'resolve'] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

export const AGENT_ACTION_LABELS: Record<AgentAction, string> = {
  answer: 'Answers',
  hand_over: 'Hands it to your team',
  resolve: 'Closes the conversation',
};

/** How long its name can be, and how much the organization can tell it. */
export const AGENT_NAME_MAX = 40;
export const AGENT_KNOWLEDGE_MAX = 8000;

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
  `${orgName.trim()} Assistant`.slice(0, AGENT_NAME_MAX);
