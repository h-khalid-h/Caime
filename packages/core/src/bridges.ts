/**
 * Bridges (R79, layer 1): the automation platforms, each the door to the thousands of apps on
 * it. Pure, and apart from `app-directory.ts`, which the startup chunk carries: only the bridge's
 * sheet and the server read these words.
 */
import type { PersonalScope } from './access';
import { msg } from './i18n';

/**
 * One connects in Caime, never on the platform's page: a personal token made for it in one
 * tap, named after it, scoped to what the recipe needs (`PERSON_ROUTES`), shown once with the
 * platform's own page to paste it on. The row is on while that token lives. What each can do is
 * the same (`BRIDGE_USES`: the person's routes, polled or called); what differs is where the
 * token goes on the platform (`how`: the generic web-request step every one of them has, since
 * a header is all Caime asks for) and the page to open. A name is the platform's own, never
 * translated.
 */
export const BRIDGES = [
  {
    id: 'zapier',
    name: 'Zapier',
    tagline: msg('Connect Caime to the apps on Zapier'),
    website: 'https://zapier.com',
    /** Where the person goes with the token: the editor, where a Zap is made. */
    page: 'https://zapier.com/app/zaps',
    how: msg(
      'In a Zap, add Webhooks by Zapier: Retrieve Poll to hear from Caime, Custom Request to act in it, each with a header “Authorization: Bearer” and the token.',
    ),
  },
  {
    id: 'make',
    name: 'Make',
    tagline: msg('Connect Caime to the apps on Make'),
    website: 'https://www.make.com',
    page: 'https://www.make.com/en/login',
    how: msg(
      'In a scenario, add HTTP: Make a request, with a header “Authorization: Bearer” and the token.',
    ),
  },
  {
    id: 'n8n',
    name: 'n8n',
    tagline: msg('Connect Caime to the apps on n8n, hosted or your own'),
    website: 'https://n8n.io',
    page: 'https://app.n8n.cloud',
    how: msg(
      'In a workflow, add an HTTP Request node with a Header Auth credential: name “Authorization”, value “Bearer” and the token.',
    ),
  },
  {
    id: 'pipedream',
    name: 'Pipedream',
    tagline: msg('Connect Caime to the apps on Pipedream'),
    website: 'https://pipedream.com',
    page: 'https://pipedream.com/workflows',
    how: msg(
      'In a workflow, add an HTTP Request step, or code, with a header “Authorization: Bearer” and the token.',
    ),
  },
  {
    id: 'ifttt',
    name: 'IFTTT',
    tagline: msg('Connect Caime to the apps on IFTTT'),
    website: 'https://ifttt.com',
    page: 'https://ifttt.com/create',
    how: msg(
      'In an applet, add Webhooks: Make a web request, with “Authorization: Bearer” and the token under Additional headers.',
    ),
  },
] as const satisfies readonly {
  id: string;
  name: string;
  tagline: string;
  website: string;
  page: string;
  how: string;
}[];
export type BridgeId = (typeof BRIDGES)[number]['id'];
export type Bridge = (typeof BRIDGES)[number];

export const isBridge = (id: string): id is BridgeId => BRIDGES.some((b) => b.id === id);
export const bridgeOf = (id: string): Bridge | null => BRIDGES.find((b) => b.id === id) ?? null;

/** What every bridge can do with Caime, said once (keys: show them through `tr`). */
export const BRIDGE_DESCRIPTION = msg(
  'Caime gives {name} a token of its own, so a recipe there can hear from Caime and act in it, as you and within what you allow. The token is shown once; stop it here any time.',
);
export const BRIDGE_USES = {
  triggers: msg(
    'Hear from Caime: a message arrives, something needs you, an action is due or waiting (polled from your inbox and actions).',
  ),
  actions: msg('Act in Caime: send a message as you, add an action, finish one, search.'),
} as const;

/** What a bridge may do unless the person ticks more: reading, never writing, by default. */
export const BRIDGE_DEFAULT_SCOPES: readonly PersonalScope[] = [
  'profile:read',
  'messages:read',
  'actions:read',
];
