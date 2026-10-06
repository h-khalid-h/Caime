/**
 * A stand-in for the Anthropic Messages API, for end-to-end runs: the server under test talks to
 * it through ANTHROPIC_BASE_URL. Answers are deterministic, worked out from the prompt, so the
 * tests can assert what a person sees. `GET /requests` says which features called it, and
 * `DELETE /requests` forgets them (a serial group retried starts from nothing).
 */
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 8799);
const calls = [];

const reply = (text) => ({
  id: `msg_stub_${calls.length}`,
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 20 },
});

const between = (s, open, close) => {
  const start = s.indexOf(open);
  const end = s.lastIndexOf(close);
  return start >= 0 && end > start ? s.slice(start + open.length, end).trim() : '';
};

/** "[n] time · name: text" lines of a transcript. */
const linesOf = (content) =>
  between(content, '<conversation>', '</conversation>')
    .split('\n')
    .map((l) => /^\[(\d+)\] .*? · ([^:]+): (.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ n: Number(m[1]), speaker: m[2], text: m[3] }));

/** The system prompt as text: a string, or blocks (a cached prefix is one). */
const systemText = (system) =>
  Array.isArray(system) ? system.map((b) => b.text ?? '').join('\n') : String(system ?? '');

function answer(body) {
  const system = systemText(body.system);
  const content = String(body.messages?.[0]?.content ?? '');
  if (system.includes('Rewrite the message')) {
    calls.push('rewrite');
    const draft = between(content, '<message>', '</message>');
    if (/contract/i.test(draft) && system.includes('more formal'))
      return reply('Could you send me the contract by Friday?');
    return reply(draft.charAt(0).toUpperCase() + draft.slice(1));
  }
  if (system.includes('Translate the text')) {
    calls.push('translate');
    const text = between(content, '<text>', '</text>');
    return reply(text === 'هل وصل العقد؟' ? 'Did the contract arrive?' : text);
  }
  if (system.includes('You are Cai, the assistant inside Caime')) {
    // Cai (R67): it says what it was asked and how many open things it was told of.
    calls.push('cai');
    const asked = [...content.matchAll(/\] Person: (.*)$/gm)].at(-1)?.[1]?.trim() ?? '';
    const open = (between(content, '<context>', '</context>').match(/^• /gm) ?? []).length;
    return reply(`About “${asked}”: here’s an idea. (${open} open things in mind.)`);
  }
  if (system.includes('catch someone up')) {
    calls.push('catch-up');
    const lines = linesOf(content);
    const last = lines[lines.length - 1];
    return reply(
      `Caught up on ${lines.length} messages. The latest is from ${last?.speaker ?? 'nobody'}.`,
    );
  }
  if (system.includes('find the follow-ups')) {
    calls.push('actions');
    const items = linesOf(content)
      .filter((l) => l.speaker !== 'You' && /logo files/i.test(l.text))
      .map((l) => ({
        kind: 'task',
        title: 'Send the final logo files',
        who: null,
        due: /friday/i.test(l.text) ? 'Friday' : null,
        line: l.n,
      }));
    return reply(JSON.stringify({ items }));
  }
  if (system.includes('the AI agent that answers customers of')) {
    calls.push('agent');
    const org = /customers of (.+?) in Caime/.exec(system)?.[1] ?? 'the organization';
    // The knowledge is the last system block (a cached prefix); the rules before it mention the
    // tag by name, so it's read from that block alone.
    const knowledge = between(
      Array.isArray(body.system) ? String(body.system.at(-1)?.text ?? '') : system,
      '<knowledge>',
      '</knowledge>',
    );
    const asked =
      between(content, '<conversation>', '</conversation>')
        .split('\n')
        .filter((l) => /^\[\d+\] Customer: /.test(l))
        .pop()
        ?.replace(/^\[\d+\] Customer: /, '') ?? '';
    const say = (action, message, extra = {}) =>
      reply(
        JSON.stringify({ action, message, bookAt: null, bookFor: null, bookItem: null, ...extra }),
      );
    const handOver = () =>
      say('hand_over', `I’ve passed this to the team at ${org}. Someone will answer here.`);
    if (/person|human|someone/i.test(asked)) return handOver();
    // Bookings (R51): offered from <slots> when asked; booked when the customer picks the first.
    const slots = between(content, '<slots>', '</slots>')
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split(' · '));
    const offeredBefore = /Which suits you\?/.test(
      between(content, '<conversation>', '</conversation>')
        .split('\n')
        .filter((l) => /^\[\d+\] You: /.test(l))
        .pop() ?? '',
    );
    if (slots.length && (/\b(book|appointment|slot)\b/i.test(asked) || offeredBefore)) {
      if (offeredBefore && /first|yes|that one|please/i.test(asked))
        return say('book', `I’ve asked the team to confirm ${slots[0][1]}. You’ll see it here.`, {
          bookAt: slots[0][0],
          bookFor: 'Check-up',
        });
      return say(
        'answer',
        `I can offer ${slots
          .slice(0, 3)
          .map((s) => s[1])
          .join(', or ')}. Which suits you?`,
      );
    }
    if (/thank/i.test(asked)) return say('resolve', 'You’re welcome. Take care!');
    // The sentence of what it knows that shares the most words with the question.
    const words = (text) => text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
    const wanted = new Set(words(asked));
    const best = knowledge
      .split(/(?<=\.)\s+/)
      .map((sentence) => ({ sentence, n: words(sentence).filter((w) => wanted.has(w)).length }))
      .sort((a, b) => b.n - a.n)[0];
    if (!best?.n) return handOver();
    const intro = content.includes('begin by saying') ? `Hi, I’m ${org}’s AI agent. ` : '';
    return say('answer', `${intro}${best.sentence}`);
  }
  if (system.includes('search someone typed')) {
    calls.push('search');
    const typed = between(content, '<search>', '</search>');
    // "anything Alex promised me" → what Alex owes; otherwise a message search for the words.
    const who = /\b([A-Z][a-z]+)\b/.exec(typed)?.[1] ?? null;
    const promised = /promis|owe|waiting/i.test(typed);
    return reply(
      JSON.stringify({
        scope: promised ? 'waiting' : 'messages',
        text: promised ? '' : typed.replace(/^(what|anything|everything)\s+/i, ''),
        person: who,
        sphere: null,
        role: null,
        fileKind: null,
        direction: null,
        interpretation: promised && who ? `What ${who} promised you` : `Messages about “${typed}”`,
      }),
    );
  }
  calls.push('other');
  return reply('OK');
}

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok');
  }
  if (req.method === 'GET' && req.url === '/requests') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ calls }));
  }
  if (req.method === 'DELETE' && req.url === '/requests') {
    calls.length = 0;
    res.writeHead(204);
    return res.end();
  }
  // The speech-to-text stand-in (docs/SPEECH.md): the audio is a voice note recorded against a
  // fake microphone, so the words are fixed; what matters is that the note came and went back.
  if (req.method === 'POST' && req.url?.startsWith('/v1/audio/transcriptions')) {
    let bytes = 0;
    for await (const chunk of req) bytes += chunk.length;
    calls.push('transcribe');
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(
      JSON.stringify({
        text: bytes > 100 ? 'Hi Noor, the contract is signed.' : '',
        language: 'en',
      }),
    );
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error' } }));
  }
  res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_stub' });
  res.end(JSON.stringify(answer(JSON.parse(raw))));
}).listen(port, '127.0.0.1');
