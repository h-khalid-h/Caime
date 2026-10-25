/**
 * Cai looks at a photo (M17 I14b): a picture sent to Cai is shown to its model as the preview
 * rendition, before the conversation's words, and answered as any message is; three at most, a
 * picture alone (no video or file), and never a friend's. Without AI assist, or under 18, Cai
 * says why instead of staying silent; a photo it can't open is said so too.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CAI_ID, SYSTEM_ACCOUNTS, uuidv4 } from '@caime/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const requests: any[] = [];
const replies: string[] = [];
let stub: Server;
let t: TestApp;
let hassan: Client;
let mona: Client;
const MOMO = SYSTEM_ACCOUNTS.find((a) => a.handle === 'momo')!.id;

const caiSays = (reply: string, keep: unknown = null) =>
  JSON.stringify({ reply, keep, act: null, sources: [] });
const open = async (c: Client, userId: string) =>
  (await c.post('/v1/conversations', { kind: 'direct', userId })).conversation.id as string;
const messages = async (c: Client, conversationId: string) =>
  (await c.get(`/v1/conversations/${conversationId}/messages`)).messages as any[];
async function answered(c: Client, conversationId: string) {
  await t.ctx.flush();
  t.clock.advance(1000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
  return messages(c, conversationId);
}

async function upload(c: Client, data: Buffer, name: string, mime: string) {
  const boundary = `----caime${uuidv4()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/files',
    payload,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${c.token}`,
    },
  });
  if (res.statusCode !== 201) throw new Error(`${res.statusCode} ${res.body}`);
  return res.json().file as { id: string };
}
const photo = async (c: Client, background = '#7a3ff2') =>
  upload(
    c,
    await sharp({ create: { width: 1600, height: 1200, channels: 3, background } })
      .jpeg()
      .toBuffer(),
    'receipt.jpg',
    'image/jpeg',
  );
const sendPhotos = (c: Client, conversationId: string, fileIds: string[], body?: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'media',
    fileIds,
    ...(body ? { body } : {}),
  });

/** The image blocks of a request to the model, and its words. */
function seen(request: any) {
  const content = request.messages[0].content;
  if (typeof content === 'string') return { images: [] as any[], words: content };
  return {
    images: content.filter((b: any) => b.type === 'image'),
    words: content.find((b: any) => b.type === 'text').text as string,
  };
}

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests.push(raw ? JSON.parse(raw) : null);
    const text = replies.shift();
    res.writeHead(text ? 200 : 500, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        text
          ? {
              id: 'msg_stub',
              type: 'message',
              role: 'assistant',
              model: 'claude-stub',
              content: [{ type: 'text', text }],
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: 1800, output_tokens: 40 },
            }
          : { type: 'error', error: { type: 'api_error', message: 'no reply queued' } },
      ),
    );
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const { port } = stub.address() as AddressInfo;
  t = await createTestApp({
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
  });
  t.clock.set('2026-10-20T10:00:00Z');
  hassan = await signup(t, { displayName: 'Hassan Khalid', timeZone: 'Africa/Cairo' });
  mona = await signup(t, { displayName: 'Mona Fawzy', locale: 'ar-EG', timeZone: 'Africa/Cairo' });
  await hassan.patch('/v1/me', { aiEnabled: true });
});
afterAll(async () => {
  await t.close();
  await new Promise((done) => stub.close(done));
});

describe('a photo to Cai (M17 I14b)', () => {
  it('shows the model the preview before the words, and answers as any message', async () => {
    const cai = await open(hassan, CAI_ID);
    const file = await photo(hassan);
    replies.push(caiSays('The receipt’s total is 120 EGP, paid by card on 18 October.'));
    const before = requests.length;
    await sendPhotos(hassan, cai, [file.id], 'What’s the total on this?');
    const said = (await answered(hassan, cai)).at(-1);
    expect(said.senderId).toBe(CAI_ID);
    expect(said.body).toBe('The receipt’s total is 120 EGP, paid by card on 18 October.');
    expect(requests.length).toBe(before + 1);
    const { images, words } = seen(requests.at(-1));
    // The preview rendition (a WebP no wider than 1280), never the 1600-px original.
    expect(images).toHaveLength(1);
    expect(images[0].source.media_type).toBe('image/webp');
    const shown = await sharp(Buffer.from(images[0].source.data, 'base64')).metadata();
    expect(shown.format).toBe('webp');
    expect(shown.width).toBeLessThanOrEqual(1280);
    // The caption is the line's words; the rules never read it as an ask of their own.
    expect(words).toContain('What’s the total on this?');
    expect(requests.at(-1).system[0].text).toContain('came with photos');
    const run = await t.ctx.db
      .selectFrom('ai_runs')
      .select(['feature', 'outcome', 'input_tokens'])
      .where('user_id', '=', hassan.user.id)
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(run).toMatchObject({ feature: 'cai', outcome: 'ok', input_tokens: 1800 });
  });

  it('looks at three at most, and at pictures alone', async () => {
    const cai = await open(hassan, CAI_ID);
    const four = await Promise.all(
      ['#111111', '#222222', '#333333', '#444444'].map((c) => photo(hassan, c)),
    );
    await expect(
      sendPhotos(
        hassan,
        cai,
        four.map((f) => f.id),
      ),
    ).rejects.toThrow(/Cai looks at 3 photos at a time/);
    const pdf = await upload(hassan, Buffer.from('%PDF-1.4\n%%EOF\n'), 'a.pdf', 'application/pdf');
    await expect(
      hassan.post(`/v1/conversations/${cai}/messages`, {
        clientId: uuidv4(),
        kind: 'file',
        fileIds: [pdf.id],
      }),
    ).rejects.toThrow(/Cai reads words, photos, stickers and voice notes/);
    await expect(sendPhotos(hassan, cai, [four[0]!.id, pdf.id])).rejects.toThrow(
      /Cai looks at photos, not videos or files/,
    );
    replies.push(caiSays('Three plain squares: dark grey, darker and darkest.'));
    await sendPhotos(
      hassan,
      cai,
      four.slice(0, 3).map((f) => f.id),
    );
    const said = (await answered(hassan, cai)).at(-1);
    expect(said.body).toBe('Three plain squares: dark grey, darker and darkest.');
    expect(seen(requests.at(-1)).images).toHaveLength(3);
  });

  it('keeps what a photo’s caption asks to keep, as the model reads it', async () => {
    const cai = await open(hassan, CAI_ID);
    const file = await photo(hassan);
    replies.push(
      caiSays('', {
        title: 'Pay the electricity bill',
        details: '340 EGP',
        when: null,
        remind: false,
      }),
    );
    await sendPhotos(hassan, cai, [file.id], 'save this as a task');
    const said = (await answered(hassan, cai)).at(-1);
    expect(said.body).toBe('Saved to your actions: “Pay the electricity bill”');
    expect(seen(requests.at(-1)).images).toHaveLength(1);
  });

  it('says why when it can’t look: no assist, a friend, a model that fails', async () => {
    const cai = await open(mona, CAI_ID);
    const before = requests.length;
    await sendPhotos(mona, cai, [(await photo(mona)).id], 'شوف دي');
    const said = (await answered(mona, cai)).at(-1);
    expect(said.senderId).toBe(CAI_ID);
    expect(said.body).toBe(
      'أقدر أبص على الصور لو مساعدة الذكاء الاصطناعي شغالة: الإعدادات، وبعدين مساعدة الذكاء الاصطناعي.',
    );
    expect(requests.length).toBe(before);

    const momo = await open(hassan, MOMO);
    await expect(sendPhotos(hassan, momo, [(await photo(hassan)).id])).rejects.toThrow(
      /reads words, stickers and voice notes/,
    );

    const mine = await open(hassan, CAI_ID);
    await sendPhotos(hassan, mine, [(await photo(hassan)).id]);
    const failed = (await answered(hassan, mine)).at(-1);
    expect(failed.senderId).toBe(CAI_ID);
    expect(failed.body.length).toBeGreaterThan(0);
  });
});
