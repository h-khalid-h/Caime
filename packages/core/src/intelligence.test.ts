import { describe, expect, it } from 'vitest';
import {
  analyzeMessage,
  detectEmergingTopic,
  extractAmounts,
  suggestFromAnalysis,
} from './intelligence';

const opts = {
  now: new Date('2026-09-23T14:00:00Z'),
  timeZone: 'America/New_York',
  locale: 'en-US',
};
const cairo = { now: new Date('2026-09-25T11:30:00Z'), timeZone: 'Africa/Cairo', locale: 'ar-EG' };
const sarah = { senderIsMe: false, senderName: 'Sarah' };
const me = { senderIsMe: true, senderName: 'You' };

describe('the PRD examples', () => {
  it('"I\'ll send the proposal tomorrow." from me → reminder (PRD §23)', () => {
    const a = analyzeMessage("I'll send the proposal tomorrow.", opts);
    expect(a.isCommitment).toBe(true);
    expect(a.commitment).toMatchObject({ title: 'Send proposal', object: 'Proposal' });
    const [s] = suggestFromAnalysis(a, me);
    expect(s).toMatchObject({ kind: 'reminder', title: 'Send proposal', dueText: 'tomorrow' });
    expect(s!.dueAt?.startsWith('2026-09-24')).toBe(true);
  });

  it('"I\'ll send you the contract tomorrow." from Sarah → Waiting for Sarah — Contract (PRD §29)', () => {
    const a = analyzeMessage("I'll send you the contract tomorrow.", opts);
    const [s] = suggestFromAnalysis(a, sarah);
    expect(s).toMatchObject({ kind: 'waiting', title: 'Contract', dueText: 'tomorrow' });
    expect(s!.rationale).toContain('Sarah wrote');
  });

  it('"Can you send me the document tomorrow?" → a task for me (PRD P1)', () => {
    const a = analyzeMessage('Can you send me the document tomorrow?', opts);
    expect(a).toMatchObject({ isQuestion: true, isRequest: true, mode: 'request' });
    const [s] = suggestFromAnalysis(a, sarah);
    expect(s).toMatchObject({ kind: 'task', title: 'Send document', dueText: 'tomorrow' });
  });

  it('the same request sent by me → I am waiting', () => {
    const a = analyzeMessage('Could you send me the contract by Friday?', opts);
    const [s] = suggestFromAnalysis(a, me);
    expect(s).toMatchObject({ kind: 'waiting', title: 'Contract', dueText: 'by Friday' });
  });

  it('waiting on something that isn’t handed over keeps what they’ll do with it', () => {
    // "Caterer" alone would read as waiting on the caterer.
    const theirs = suggestFromAnalysis(analyzeMessage('I’ll confirm the caterer.', opts), sarah);
    expect(theirs[0]).toMatchObject({ kind: 'waiting', title: 'Confirm caterer', vague: false });
    const mine = suggestFromAnalysis(analyzeMessage('Could you book the venue?', opts), me);
    expect(mine[0]).toMatchObject({ kind: 'waiting', title: 'Book venue' });
    // Handed-over things are still named by the thing.
    const sent = suggestFromAnalysis(analyzeMessage('I’ll share the slides tonight.', opts), sarah);
    expect(sent[0]).toMatchObject({ kind: 'waiting', title: 'Slides' });
  });

  it('"Approved the final design." → a decision (PRD §30)', () => {
    const a = analyzeMessage('Approved the final design.', opts);
    expect(a.mode).toBe('decide');
    expect(a.decision?.title).toBe('Approved the final design');
  });
});

describe('decisions', () => {
  it.each([
    ['We decided to go with vendor B.', 'Go with vendor B'],
    ["Ok let's go with option 2", 'Go with option 2'],
    ['We agreed on the October launch.', 'Agreed on the October launch'],
    ['اتفقنا على السعر', 'اتفقنا على السعر'],
  ])('%s', (text, title) => {
    expect(analyzeMessage(text, opts).decision?.title).toBe(title);
  });
});

describe('what is not a commitment or a request', () => {
  it.each([
    "I won't be able to send it",
    "I'll be there at 5",
    'I will not make it',
    'Thanks, that was great.',
  ])('%s', (text) => {
    const a = analyzeMessage(text, opts);
    expect(a.isCommitment).toBe(false);
    expect(a.isRequest).toBe(false);
  });

  it('a plain question is not a request', () => {
    const a = analyzeMessage('What time is the meeting?', opts);
    expect(a).toMatchObject({ isQuestion: true, isRequest: false, mode: 'ask' });
  });
});

describe('imperatives and modes', () => {
  it('an imperative with a date is a request', () => {
    const [s] = suggestFromAnalysis(analyzeMessage('Send me the file by Friday.', opts), sarah);
    expect(s).toMatchObject({ kind: 'task', title: 'Send file' });
  });

  it('a verb and only a number is a label, not something to do', () => {
    expect(analyzeMessage('Update 55', opts).isRequest).toBe(false);
    expect(suggestFromAnalysis(analyzeMessage('Update 55', opts), me)).toEqual([]);
    const [deck] = suggestFromAnalysis(analyzeMessage('Update the deck by Friday', opts), sarah);
    expect(deck).toMatchObject({ kind: 'task', title: 'Update deck' });
    expect(analyzeMessage('Send 2 copies to Sarah', opts).isRequest).toBe(true);
  });

  it('get back to you → waiting for a reply', () => {
    const [s] = suggestFromAnalysis(analyzeMessage("I'll get back to you on Monday", opts), sarah);
    expect(s).toMatchObject({ kind: 'waiting', title: 'Reply' });
  });

  it('confirmations, plans, links, payments and tracking', () => {
    expect(analyzeMessage('Sounds good', opts).mode).toBe('confirm');
    expect(analyzeMessage("Let's meet Tuesday at 10", opts).mode).toBe('plan');
    expect(analyzeMessage('Here is the doc https://example.com/doc.', opts).links[0]?.host).toBe(
      'example.com',
    );
    const pay = analyzeMessage('Invoice #4821 for $1,200.50 is due Oct 15', opts);
    expect(pay.mode).toBe('pay');
    expect(pay.refs).toContain('#4821');
    expect(pay.amounts[0]).toMatchObject({ value: 1200.5, currency: 'USD' });
    const track = analyzeMessage(
      'Your parcel is out for delivery, tracking 1Z999AA10123456784',
      opts,
    );
    expect(track.mode).toBe('track');
    expect(track.refs).toContain('1Z999AA10123456784');
  });
});

describe('amounts', () => {
  it.each([
    ['EGP 5,000', 5000, 'EGP'],
    ['5k EGP', 5000, 'EGP'],
    ['€1.200,50', 1200.5, 'EUR'],
    ['250 جنيه', 250, 'EGP'],
    ['£20', 20, 'GBP'],
    ['100 dollars', 100, 'USD'],
  ])('%s', (text, value, currency) => {
    expect(extractAmounts(text)[0]).toMatchObject({ value, currency });
  });
});

describe('Arabic', () => {
  it('Egyptian commitment → waiting with the object', () => {
    const a = analyzeMessage('هبعتلك العقد بكرة', cairo);
    const [s] = suggestFromAnalysis(a, sarah);
    expect(s).toMatchObject({ kind: 'waiting', title: 'العقد', dueText: 'بكرة' });
  });

  it('polite request that is also a question', () => {
    const a = analyzeMessage('ممكن تبعتلي الملف النهارده؟', cairo);
    expect(a.isQuestion).toBe(true);
    expect(a.isRequest).toBe(true);
    expect(suggestFromAnalysis(a, sarah)[0]).toMatchObject({ kind: 'task', dueText: 'النهارده' });
  });

  it('question words without a question mark', () => {
    expect(analyzeMessage('امتى الاجتماع', cairo).isQuestion).toBe(true);
  });
});

describe('topics', () => {
  it('detects a topic that keeps coming up', () => {
    const recent = [
      'Project Alpha kickoff moved',
      'status of Project Alpha?',
      'lunch?',
      'Project Alpha budget is approved',
    ].map((t) => analyzeMessage(t, opts));
    expect(detectEmergingTopic(recent)).toBe('Project Alpha');
    expect(detectEmergingTopic(recent.slice(0, 2))).toBeNull();
  });
});

describe('suggestions from vague commitments', () => {
  it('names the person when they only point at the thing, and flags it for merging', () => {
    const a = analyzeMessage('Sure — I’ll send it Thursday.', opts);
    const [s] = suggestFromAnalysis(a, { senderIsMe: false, senderName: 'Sarah' });
    expect(s).toMatchObject({ kind: 'waiting', title: 'Sarah will send it', vague: true });
    expect(s?.dueText).toBe('Thursday');
    const named = suggestFromAnalysis(analyzeMessage("I'll send the proposal tomorrow.", opts), {
      senderIsMe: false,
      senderName: 'Sarah',
    });
    expect(named[0]).toMatchObject({ kind: 'waiting', vague: false });
    expect(named[0]?.title.toLowerCase()).toContain('proposal');
  });
});
