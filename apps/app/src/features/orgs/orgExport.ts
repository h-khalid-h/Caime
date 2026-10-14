/**
 * An organization's export saved as a file (R54, DPA §8 and §12): from its data card while it's
 * open, and from Settings · Security for its last owner while its export stays open after it
 * closed. On the web, where a download is a file; the caller says so on a phone.
 */
import type { OrgExportView } from '@caime/core/api';
import { endpoints } from '@/api/endpoints';

export async function saveOrgExport(orgId: string): Promise<OrgExportView> {
  const data = await endpoints.orgExport(orgId);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.organization.handle}-caime-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return data;
}
