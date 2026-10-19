/**
 * The gauges a periodic task fills (the last backup, the audit chain's check, the providers'
 * probes, the vault's last pass, connected accounts' health) read back from the database before a scrape, so an instance that runs no workers
 * answers with the same numbers as the one that did (review 2026-10-17 §4: a web-only instance
 * said the last backup was at time zero, and `CaimeBackupOld` fired for nothing).
 */
import type { AppContext } from '../context';
import { AUDIT_SETTING } from './audit';
import { lastBackup } from './backup';
import {
  ACCOUNTS_SETTING,
  accountsState,
  auditState,
  type ProviderHealth,
  providerState,
  vaultState,
} from './metrics';
import { PROVIDERS_SETTING } from './provider-health';
import { readSettings } from './settings';
import { VAULT_SETTING, type VaultState } from './vault-reseal';

type Audit = typeof auditState;

export async function syncGauges(ctx: AppContext): Promise<void> {
  await lastBackup(ctx);
  vaultState.external = ctx.config.vaultKeys !== null;
  const kept = await readSettings<unknown>(ctx.db, [
    AUDIT_SETTING,
    PROVIDERS_SETTING,
    VAULT_SETTING,
    ACCOUNTS_SETTING,
  ]);
  const accounts = kept.get(ACCOUNTS_SETTING) as typeof accountsState | undefined;
  if (accounts && typeof accounts.at === 'number' && accounts.at > accountsState.at)
    Object.assign(accountsState, { at: accounts.at, counts: accounts.counts ?? [] });
  const vault = kept.get(VAULT_SETTING) as VaultState | undefined;
  if (vault && typeof vault.at === 'number' && vault.at > vaultState.at)
    Object.assign(vaultState, {
      sealing: vault.sealing,
      older: vault.older,
      unopenable: vault.unopenable,
      databaseKey: vault.databaseKey,
      at: vault.at,
    });
  const audit = kept.get(AUDIT_SETTING) as Partial<Audit> | undefined;
  if (audit && typeof audit.checkedAt === 'number' && audit.checkedAt > auditState.checkedAt) {
    auditState.checkedAt = audit.checkedAt;
    auditState.ok = audit.ok !== false;
    auditState.headSeq = typeof audit.headSeq === 'number' ? audit.headSeq : 0;
  }
  const providers = kept.get(PROVIDERS_SETTING) as Record<string, ProviderHealth> | undefined;
  if (providers)
    for (const [id, s] of Object.entries(providers)) {
      const mine = providerState.get(id);
      if (!mine || s.checkedAt > mine.checkedAt) providerState.set(id, s);
    }
}
