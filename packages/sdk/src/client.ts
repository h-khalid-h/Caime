import type {
  AppKitView,
  AppMeView,
  BusinessInboxView,
  BusinessThreadView,
  ConversationView,
  MessagesPage,
  MessageView,
  OrgUpdatesView,
  OrgUpdateView,
  WebhookDeliveryView,
} from '@caime/core/api';
import type { BusinessView } from '@caime/core/business';
import type { CustomKitShape } from '@caime/core/custom-kits';

/** What the server answered when it refused: its status, its code and its message. */
export class CaimeError extends Error {
  readonly status: number;
  readonly code: string;
  /** Seconds to wait, when the server said so (429). */
  readonly retryAfter: number | null;
  constructor(status: number, code: string, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = 'CaimeError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export interface CaimeOptions {
  /** The app's token (`cai_…`), or a personal token (`cap_…`) or an OAuth access token (`cao_…`). */
  token: string;
  /** Where Caime is: `https://caime.datac.com` by default. `/v1` is added here. */
  baseUrl?: string;
  /** Another `fetch` (a test's, or one with a proxy); the global one by default. */
  fetch?: typeof fetch;
  /** Names your app in Caime's logs. */
  userAgent?: string;
}

export const DEFAULT_BASE_URL = 'https://caime.datac.com';

/** One of the app's own kinds of card, as `PUT /v1/kits/:key` takes it. */
export interface KitDefinition extends CustomKitShape {
  name: string;
  description: string;
  icon?: string;
}

type Query = Record<string, string | number | undefined>;

/**
 * Caime's API for an organization's app. Each method is one route, with the permission it needs
 * in its comment (docs/API.md has the table). A refusal throws a CaimeError; a network failure
 * throws what `fetch` threw.
 */
export class Caime {
  private readonly token: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(opts: CaimeOptions) {
    if (!opts.token) throw new Error('A token is needed.');
    this.token = opts.token;
    this.base = `${(opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')}/v1`;
    this.fetchImpl = opts.fetch ?? fetch;
    this.userAgent = opts.userAgent ?? 'caime-sdk/0.1';
  }

  // --- Who the token is -----------------------------------------------------------------------

  /** Every token: the app, its organization's id (what the other methods take) and its permissions. */
  async me(): Promise<AppMeView['app']> {
    const { app } = await this.call<AppMeView>('GET', '/apps/me');
    return app;
  }

  // --- Deliveries -----------------------------------------------------------------------------

  /**
   * Any token: the app's webhook deliveries, newest first, or with `after` the ones since that
   * delivery, oldest first (walk forward from the last id handled). `status: 'failed'` lists
   * what gave up after its six tries.
   */
  deliveries(
    page: { status?: 'pending' | 'delivered' | 'failed'; after?: string; limit?: number } = {},
  ): Promise<{ deliveries: WebhookDeliveryView[] }> {
    return this.call('GET', '/apps/me/deliveries', undefined, page);
  }

  /** Any token: a failed delivery queued afresh, with the whole schedule again. */
  async retryDelivery(deliveryId: string): Promise<WebhookDeliveryView> {
    const { delivery } = await this.call<{ delivery: WebhookDeliveryView }>(
      'POST',
      `/apps/me/deliveries/${enc(deliveryId)}/retry`,
    );
    return delivery;
  }

  // --- Files ----------------------------------------------------------------------------------

  /**
   * `messages:read`: a file a message carries (`message.files[].id`), as the response whose body
   * is its bytes (`content-type` and `content-length` set). The same files the team sees in that
   * conversation, nothing else.
   */
  file(fileId: string): Promise<Response> {
    return this.raw(`/files/${enc(fileId)}`);
  }

  /** `messages:read`: a file's thumbnail (WebP), where there is one (404 otherwise). */
  thumbnail(fileId: string): Promise<Response> {
    return this.raw(`/files/${enc(fileId)}/thumb`);
  }

  // --- The inbox and its conversations ---------------------------------------------------------

  /** `inbox:read`: the organization's inbox, by view. */
  inbox(orgId: string, view: BusinessView): Promise<BusinessInboxView> {
    return this.call('GET', `/orgs/${enc(orgId)}/inbox`, undefined, { view });
  }

  /** `messages:read`: one conversation, with its thread (state, who has it). */
  async conversation(conversationId: string): Promise<ConversationView> {
    const { conversation } = await this.call<{ conversation: ConversationView }>(
      'GET',
      `/conversations/${enc(conversationId)}`,
    );
    return conversation;
  }

  /** `messages:read`: its messages, oldest first, a page at a time. */
  messages(
    conversationId: string,
    page: { before?: number; after?: number; limit?: number } = {},
  ): Promise<MessagesPage> {
    return this.call('GET', `/conversations/${enc(conversationId)}/messages`, undefined, page);
  }

  /**
   * `messages:write`: reply as the app's bot. Send the same `clientId` again and the first
   * message comes back, never a second; one is made up when none is given.
   */
  async send(
    conversationId: string,
    body: string,
    opts: { clientId?: string } = {},
  ): Promise<MessageView> {
    const { message } = await this.call<{ message: MessageView }>(
      'POST',
      `/conversations/${enc(conversationId)}/messages`,
      { clientId: opts.clientId ?? crypto.randomUUID(), body },
    );
    return message;
  }

  /** `kits` and `messages:write`: send one of the app's own kinds of card. */
  async sendCard(
    conversationId: string,
    key: string,
    fields: Record<string, unknown>,
    opts: { clientId?: string } = {},
  ): Promise<MessageView> {
    const { message } = await this.call<{ message: MessageView }>(
      'POST',
      `/conversations/${enc(conversationId)}/messages`,
      {
        clientId: opts.clientId ?? crypto.randomUUID(),
        kind: 'kit',
        payload: { kit: 'custom', key, fields },
      },
    );
    return message;
  }

  // --- Threads ---------------------------------------------------------------------------------

  /** `threads:write`: give the conversation to someone on the team, or to nobody. */
  async assign(conversationId: string, userId: string | null): Promise<BusinessThreadView> {
    return this.thread('POST', `/business/${enc(conversationId)}/assign`, { userId });
  }

  /** `threads:write` */
  resolve(conversationId: string): Promise<BusinessThreadView> {
    return this.thread('POST', `/business/${enc(conversationId)}/resolve`);
  }

  /** `threads:write` */
  reopen(conversationId: string): Promise<BusinessThreadView> {
    return this.thread('POST', `/business/${enc(conversationId)}/reopen`);
  }

  /** `threads:write`: tell the owner and admins it needs one of them, with a note if you like. */
  escalate(conversationId: string, note?: string): Promise<BusinessThreadView> {
    return this.thread('POST', `/business/${enc(conversationId)}/escalate`, note ? { note } : {});
  }

  /** `threads:write` */
  stopEscalating(conversationId: string): Promise<BusinessThreadView> {
    return this.thread('DELETE', `/business/${enc(conversationId)}/escalation`);
  }

  // --- The organization's updates ---------------------------------------------------------------

  /** `updates`: the organization's updates, newest first. */
  updates(orgId: string, page: { before?: string; limit?: number } = {}): Promise<OrgUpdatesView> {
    return this.call('GET', `/orgs/${enc(orgId)}/updates`, undefined, page);
  }

  /** `updates`: post one to everyone who follows the organization; it reads as the organization's. */
  async postUpdate(orgId: string, body: string, opts: { clientId?: string } = {}) {
    const { update } = await this.call<{ update: OrgUpdateView }>(
      'POST',
      `/orgs/${enc(orgId)}/updates`,
      { clientId: opts.clientId ?? crypto.randomUUID(), body },
    );
    return update;
  }

  /** `updates`: change what one says; followers' notifications of it change with it. */
  async editUpdate(orgId: string, updateId: string, body: string): Promise<OrgUpdateView> {
    const { update } = await this.call<{ update: OrgUpdateView }>(
      'PATCH',
      `/orgs/${enc(orgId)}/updates/${enc(updateId)}`,
      { body },
    );
    return update;
  }

  /** `updates`: take one back. */
  async removeUpdate(orgId: string, updateId: string): Promise<void> {
    await this.call('DELETE', `/orgs/${enc(orgId)}/updates/${enc(updateId)}`);
  }

  // --- The app's own kinds of card ---------------------------------------------------------------

  /** `kits`: the kinds of card the app has made. */
  async kits(): Promise<AppKitView[]> {
    const { kits } = await this.call<{ kits: AppKitView[] }>('GET', '/kits');
    return kits;
  }

  /** `kits`: make a kind of card, or replace it whole. */
  async putKit(key: string, definition: KitDefinition): Promise<AppKitView> {
    const { kit } = await this.call<{ kit: AppKitView }>('PUT', `/kits/${enc(key)}`, definition);
    return kit;
  }

  /** `kits`: remove a kind of card; cards already sent keep it. */
  async removeKit(key: string): Promise<void> {
    await this.call('DELETE', `/kits/${enc(key)}`);
  }

  /** `kits`: move one of the app's cards on, as its moves allow. */
  async moveCard(messageId: string, to: string): Promise<MessageView> {
    const { message } = await this.call<{ message: MessageView }>(
      'POST',
      `/messages/${enc(messageId)}/kit`,
      { to },
    );
    return message;
  }

  /** `kits`: change what one of the app's cards says (`null` removes a field that isn't required). */
  async changeCard(messageId: string, fields: Record<string, unknown>): Promise<MessageView> {
    const { message } = await this.call<{ message: MessageView }>(
      'PATCH',
      `/messages/${enc(messageId)}/kit`,
      { fields },
    );
    return message;
  }

  // --- Under the hood ---------------------------------------------------------------------------

  private async thread(method: string, path: string, body?: unknown) {
    const { thread } = await this.call<{ thread: BusinessThreadView }>(method, path, body);
    return thread;
  }

  /** One request whose answer is bytes, not JSON (a file); a refusal is still a CaimeError. */
  private async raw(path: string): Promise<Response> {
    const res = await this.fetchImpl(new URL(this.base + path), {
      method: 'GET',
      headers: { authorization: `Bearer ${this.token}`, 'user-agent': this.userAgent },
    });
    if (!res.ok) {
      let code = `http_${res.status}`;
      let message = `Caime answered ${res.status}.`;
      try {
        const err = ((await res.json()) as { error?: { code?: string; message?: string } }).error;
        code = err?.code ?? code;
        message = err?.message ?? message;
      } catch {
        // Not JSON: the status says enough.
      }
      throw new CaimeError(res.status, code, message);
    }
    return res;
  }

  /** One request: the token, JSON in and out, and the server's refusal as a CaimeError. */
  async call<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(query ?? {}))
      if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
      accept: 'application/json',
      'user-agent': this.userAgent,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
      const retry = Number(res.headers.get('retry-after'));
      throw new CaimeError(
        res.status,
        err?.code ?? `http_${res.status}`,
        err?.message ?? `Caime answered ${res.status}.`,
        Number.isFinite(retry) && retry > 0 ? retry : null,
      );
    }
    return json as T;
  }
}

const enc = (s: string) => encodeURIComponent(s);
