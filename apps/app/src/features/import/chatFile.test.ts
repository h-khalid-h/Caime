import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { chatFromZip, isZipFile } from './chatFile';

const CHAT = '[13/03/2024, 09:02:11] Noor Haddad: Morning! Still on for the clinic?';

describe('the .zip an iPhone exports (M16 C3g)', () => {
  it('takes its _chat.txt, whatever else is beside it', async () => {
    const zip = zipSync({
      'IMG-0001.jpg': new Uint8Array(64).fill(7),
      '_chat.txt': strToU8(CHAT),
      'notes.txt': strToU8('not the chat'),
    });
    expect(await chatFromZip(zip)).toBe(CHAT);
  });

  it('takes the one text file of a zip that names it otherwise', async () => {
    expect(await chatFromZip(zipSync({ 'WhatsApp Chat - Noor.txt': strToU8(CHAT) }))).toBe(CHAT);
  });

  it('finds nothing in a zip without text, nor in bytes that are no zip', async () => {
    expect(await chatFromZip(zipSync({ 'IMG-0001.jpg': new Uint8Array(8) }))).toBeNull();
    expect(await chatFromZip(strToU8(CHAT))).toBeNull();
  });

  it('knows a zip by its name or its type', () => {
    expect(isZipFile('WhatsApp Chat - Noor.zip')).toBe(true);
    expect(isZipFile('chat', 'application/zip')).toBe(true);
    expect(isZipFile('WhatsApp Chat with Noor.txt', 'text/plain')).toBe(false);
  });
});
