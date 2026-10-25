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

/** A question's own words, which a reading of it leaves out of what it searches for. */
const QUESTION_WORDS = new Set(['where', 'when', 'who', 'which', 'how', 'is', 'are', 'was', 'did']);

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
  if (system.includes('one of the Caime Friends')) {
    // A Caime Friend (R71): in its own name, about what it was asked.
    calls.push('friend');
    const name = /You are (\S+), one of the Caime Friends/.exec(system)?.[1] ?? 'A friend';
    const asked = [...content.matchAll(/\] Person: (.*)$/gm)].at(-1)?.[1]?.trim() ?? '';
    return reply(`${name} here! About “${asked}”, let’s see.`);
  }
  if (system.includes('You are Cai, the assistant inside Caime')) {
    // Cai (R67): it says what it was asked and how many open things it was told of. Asked to
    // keep what was said before ("save it as a task", M16 G13), it keeps the person's words
    // before the ask, their first sentence the title.
    calls.push('cai');
    const said = [...content.matchAll(/\] Person: (.*)$/gm)].map((m) => m[1].trim());
    const asked = said.at(-1) ?? '';
    if (/\b(?:save|keep)\b.*\b(?:it|this|that)\b/i.test(asked) && said.length > 1) {
      const before = said.at(-2);
      const title = before.split(/[.!?]/)[0].slice(0, 80);
      return reply(
        JSON.stringify({
          reply: '',
          keep: { title, details: before, when: null, remind: false },
          act: null,
        }),
      );
    }
    const open = (between(content, '<context>', '</context>').match(/^• /gm) ?? []).length;
    return reply(
      JSON.stringify({
        reply: `About “${asked}”: here’s an idea. (${open} open things in mind.)`,
        keep: null,
        act: null,
      }),
    );
  }
  if (system.includes('question about a conversation')) {
    // A question about the conversation (R67): it names the question and what it read.
    calls.push('ask');
    const question = between(content, '<question>', '</question>');
    const lines = linesOf(content);
    const last = lines[lines.length - 1];
    return reply(
      `About “${question}”: ${lines.length} messages, the latest from ${last?.speaker ?? 'nobody'}.`,
    );
  }
  if (system.includes('You write the notes of a call')) {
    // A call's notes (M16 F7e): how many lines, its first speaker's step from the first line.
    calls.push('notes-summary');
    const lines = linesOf(content);
    const first = lines[0];
    return reply(
      JSON.stringify({
        summary: `A call of ${lines.length} lines, opened by ${first?.speaker ?? 'nobody'}.`,
        topics: [{ title: 'What was said', line: 1, points: lines.slice(0, 2).map((l) => l.text) }],
        decisions: [],
        nextSteps: first
          ? [{ who: first.speaker, what: 'Follow up on the call', due: null, line: 1 }]
          : [],
      }),
    );
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
        JSON.stringify({
          action,
          message,
          bookAt: null,
          bookFor: null,
          bookItem: null,
          orderLines: null,
          orderWay: null,
          sources: [],
          reason: null,
          ...extra,
        }),
      );
    const handOver = (reason) =>
      say('hand_over', `I’ve passed this to the team at ${org}. Someone will answer here.`, {
        reason,
      });
    if (/person|human|someone/i.test(asked)) return handOver('person');
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
    // The passage of what it knows ("[n] text", a sentence each, M16 G6a) that shares the most
    // words with the question, cited by its number.
    const words = (text) => text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
    const wanted = new Set(words(asked));
    const best = knowledge
      .split('\n')
      .map((line) => /^\[(\d+)\] (.*)$/.exec(line.trim()))
      .filter(Boolean)
      .map(([, n, sentence]) => ({
        n: Number(n),
        sentence,
        shared: words(sentence).filter((w) => wanted.has(w)).length,
      }))
      .sort((a, b) => b.shared - a.shared)[0];
    if (!best?.shared) return handOver('unknown');
    // Its introduction is Caime's, written by the rules (R87): the model only answers.
    return say('answer', best.sentence, { sources: [best.n] });
  }
  if (system.includes('question about a call')) {
    // A question typed to Cai about a call (M17 I13f): its first line, cited.
    calls.push('notes-ask');
    const question = between(content, '<question>', '</question>');
    const [first] = linesOf(content);
    return reply(
      JSON.stringify(
        first
          ? { answer: `About “${question}”: ${first.speaker} said “${first.text}”.`, sources: [1] }
          : { answer: 'Nothing was said about that.', sources: [] },
      ),
    );
  }
  if (system.includes('what search found in their own messages')) {
    // "Ask Cai" in Search (R66): the first passage found, cited.
    calls.push('search-answer');
    const [first] = between(content, '<found>', '</found>')
      .split('\n')
      .map((l) => /^\[(\d+)\] .*?: (.*)$/.exec(l))
      .filter(Boolean);
    return reply(
      JSON.stringify(
        first
          ? { answer: `It says: ${first[2]}`, sources: [Number(first[1])] }
          : { answer: 'I didn’t find that in your messages.', sources: [] },
      ),
    );
  }
  if (system.includes('search someone typed')) {
    calls.push('search');
    const typed = between(content, '<search>', '</search>');
    // "anything Alex promised me" → what Alex owes; otherwise a message search for the words, a
    // question's own words ("where is the…") left out, as a reader would.
    const who = /\b([A-Z][a-z]+)\b/.exec(typed)?.[1] ?? null;
    const promised = /promis|owe|waiting/i.test(typed);
    const words = typed
      .replace(/^(what|anything|everything)\s+/i, '')
      .replace(/[?]/g, '')
      .split(/\s+/)
      .filter((w) => !QUESTION_WORDS.has(w.toLowerCase()))
      .join(' ');
    return reply(
      JSON.stringify({
        scope: promised ? 'waiting' : 'messages',
        text: promised ? '' : words,
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
  // The provider probe's cheapest reads (R78): the model list, and a speech model by name.
  if (req.method === 'GET' && req.url?.startsWith('/v1/models')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ data: [{ id: 'stub', type: 'model' }], has_more: false }));
  }
  if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error' } }));
  }
  res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_stub' });
  res.end(JSON.stringify(answer(JSON.parse(raw))));
}).listen(port, '127.0.0.1');
