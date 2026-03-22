import { describe, it, expect } from 'vitest';
import type { Recipient, RecipientGroup } from '../../src/shared/types';
import { resolveSelectedEmails as resolveEmails } from '../../src/shared/recipientUtils';

const alice: Recipient = { id: '1', email: 'alice@test.com', name: 'Alice' };
const bob: Recipient = { id: '2', email: 'bob@test.com', name: 'Bob' };
const charlie: Recipient = { id: '3', email: 'charlie@test.com', name: 'Charlie' };
const dave: Recipient = { id: '4', email: 'dave@test.com', name: 'Dave' };

const allRecipients: readonly Recipient[] = [alice, bob, charlie, dave];

const devTeam: RecipientGroup = { id: 'g1', name: '개발팀', recipientIds: ['1', '2', '3'] };
const planTeam: RecipientGroup = { id: 'g2', name: '기획팀', recipientIds: ['2', '4'] };

describe('Recipient group resolution', () => {
  it('resolves emails from a single group', () => {
    const result = resolveEmails(new Set(['g1']), new Set(), [devTeam, planTeam], allRecipients);

    expect(result).toHaveLength(3);
    expect(result).toContain('alice@test.com');
    expect(result).toContain('bob@test.com');
    expect(result).toContain('charlie@test.com');
  });

  it('deduplicates emails across multiple groups', () => {
    // Bob is in both devTeam and planTeam
    const result = resolveEmails(new Set(['g1', 'g2']), new Set(), [devTeam, planTeam], allRecipients);

    expect(result).toHaveLength(4);
    const bobCount = result.filter((e) => e === 'bob@test.com').length;
    expect(bobCount).toBe(1);
  });

  it('deduplicates between group and individual selection', () => {
    // Alice selected via group AND individually
    const result = resolveEmails(new Set(['g1']), new Set(['1']), [devTeam], allRecipients);

    expect(result).toHaveLength(3);
    const aliceCount = result.filter((e) => e === 'alice@test.com').length;
    expect(aliceCount).toBe(1);
  });

  it('resolves individual selections without groups', () => {
    const result = resolveEmails(new Set(), new Set(['1', '4']), [], allRecipients);

    expect(result).toHaveLength(2);
    expect(result).toContain('alice@test.com');
    expect(result).toContain('dave@test.com');
  });

  it('returns empty array when nothing is selected', () => {
    const result = resolveEmails(new Set(), new Set(), [devTeam, planTeam], allRecipients);

    expect(result).toHaveLength(0);
  });

  it('ignores group members that no longer exist in recipients', () => {
    const orphanGroup: RecipientGroup = { id: 'g3', name: 'Orphan', recipientIds: ['1', '999'] };
    const result = resolveEmails(new Set(['g3']), new Set(), [orphanGroup], allRecipients);

    expect(result).toHaveLength(1);
    expect(result).toContain('alice@test.com');
  });

  it('ignores non-existent group ids', () => {
    const result = resolveEmails(new Set(['nonexistent']), new Set(), [devTeam], allRecipients);

    expect(result).toHaveLength(0);
  });

  it('handles empty groups', () => {
    const emptyGroup: RecipientGroup = { id: 'g4', name: 'Empty', recipientIds: [] };
    const result = resolveEmails(new Set(['g4']), new Set(), [emptyGroup], allRecipients);

    expect(result).toHaveLength(0);
  });

  it('handles a recipient in many groups without duplication', () => {
    // Bob is in 3 different groups
    const teamA: RecipientGroup = { id: 'a', name: 'A', recipientIds: ['2'] };
    const teamB: RecipientGroup = { id: 'b', name: 'B', recipientIds: ['2'] };
    const teamC: RecipientGroup = { id: 'c', name: 'C', recipientIds: ['2'] };

    const result = resolveEmails(
      new Set(['a', 'b', 'c']),
      new Set(['2']),
      [teamA, teamB, teamC],
      allRecipients,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toBe('bob@test.com');
  });
});

describe('Orphan cleanup on recipient removal', () => {
  it('removes deleted recipient id from group recipientIds', () => {
    const group: RecipientGroup = { id: 'g1', name: 'Team', recipientIds: ['1', '2', '3'] };
    const removedId = '2';

    const cleaned = {
      ...group,
      recipientIds: group.recipientIds.filter((rid) => rid !== removedId),
    };

    expect(cleaned.recipientIds).toEqual(['1', '3']);
    expect(cleaned.recipientIds).not.toContain('2');
  });
});

describe('Group name validation', () => {
  it('detects duplicate group names', () => {
    const existing: readonly RecipientGroup[] = [devTeam, planTeam];
    const newName = '개발팀';

    const isDuplicate = existing.some((g) => g.name === newName);
    expect(isDuplicate).toBe(true);
  });

  it('allows unique group names', () => {
    const existing: readonly RecipientGroup[] = [devTeam, planTeam];
    const newName = '디자인팀';

    const isDuplicate = existing.some((g) => g.name === newName);
    expect(isDuplicate).toBe(false);
  });

  it('allows same name when editing the same group', () => {
    const existing: readonly RecipientGroup[] = [devTeam, planTeam];
    const editingId = devTeam.id;
    const name = '개발팀';

    const isDuplicate = existing.some((g) => g.name === name && g.id !== editingId);
    expect(isDuplicate).toBe(false);
  });
});
