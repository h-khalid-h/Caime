/**
 * @caime/sdk (R39): a typed client for the routes an organization's app may call, and the
 * checks for the webhooks it hears, so an app is written against types rather than a document.
 * The client runs wherever `fetch` is; the webhook helpers use Node's crypto. Nothing here
 * widens what a token may do: the server decides that, and this only names it.
 */

export type {
  AppKitView,
  BusinessInboxView,
  BusinessThreadView,
  ConversationView,
  MessagesPage,
  MessageView,
  OrgUpdatesView,
  OrgUpdateView,
} from '@caime/core/api';
export type { BusinessView } from '@caime/core/business';
export type { CustomKitShape } from '@caime/core/custom-kits';
export { Caime, CaimeError, type CaimeOptions } from './client';
export {
  type BusinessMessageWebhook,
  type BusinessThreadWebhook,
  type CaimeWebhook,
  type KitMovedWebhook,
  type KitPostedWebhook,
  type PingWebhook,
  parseWebhook,
  signWebhook,
  verifyWebhookSignature,
  WebhookError,
} from './webhooks';
