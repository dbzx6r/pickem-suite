export type MentionParticipant = { id: string; displayName: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function mentionedParticipantIds(
  text: string,
  participants: MentionParticipant[],
): string[] {
  return participants
    .filter((participant) => {
      const name = participant.displayName.trim();
      if (!name) return false;
      return new RegExp(
        `(^|\\s)@${escapeRegExp(name)}(?=$|[\\s.,!?;:])`,
        'i',
      ).test(text);
    })
    .map((participant) => participant.id);
}

export function activeMentionQuery(text: string, caret: number) {
  const beforeCaret = text.slice(0, caret);
  const match = beforeCaret.match(/(^|\s)@([^@\n]*)$/);
  if (!match) return null;
  const query = match[2];
  return {
    query,
    start: caret - query.length - 1,
    end: caret,
  };
}

export function insertMention(
  text: string,
  caret: number,
  displayName: string,
): { text: string; caret: number } {
  const active = activeMentionQuery(text, caret);
  if (!active) return { text, caret };
  const replacement = `@${displayName}${/^\s/.test(text.slice(active.end)) ? '' : ' '}`;
  const nextText = text.slice(0, active.start) + replacement + text.slice(active.end);
  return { text: nextText, caret: active.start + replacement.length };
}
