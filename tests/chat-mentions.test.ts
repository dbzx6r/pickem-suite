import test from 'node:test';
import assert from 'node:assert/strict';
import { activeMentionQuery, insertMention, mentionedParticipantIds } from '../src/lib/chat-mentions';

const participants = [
  { id: 'taylor', displayName: 'Taylor Example' },
  { id: 'avery', displayName: 'Avery' },
  { id: 'ave', displayName: 'Ave' },
];

test('mentions match complete display names without substring false positives', () => {
  assert.deepEqual(mentionedParticipantIds('Hey @Taylor Example, check this', participants), ['taylor']);
  assert.deepEqual(mentionedParticipantIds('Not @AveryVoorhees', participants), []);
  assert.deepEqual(mentionedParticipantIds('@avery hello', participants), ['avery']);
});

test('active mention query works after whitespace and allows spaces in names', () => {
  assert.deepEqual(activeMentionQuery('Hello @Taylor Ex', 16), { query: 'Taylor Ex', start: 6, end: 16 });
  assert.equal(activeMentionQuery('email@test', 10), null);
});

test('mention autocomplete inserts the canonical display name', () => {
  assert.deepEqual(insertMention('Hello @Tayl later', 11, 'Taylor Example'), {
    text: 'Hello @Taylor Example later',
    caret: 21,
  });
});
