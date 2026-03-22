import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Recipient, RecipientGroup } from '../../shared/types';
import { resolveSelectedEmails } from '../../shared/recipientUtils';

interface RecipientSelectorProps {
  readonly recipients: readonly Recipient[];
  readonly groups: readonly RecipientGroup[];
  readonly onSelectionChange: (selectedEmails: readonly string[]) => void;
}

export function RecipientSelector({ recipients, groups, onSelectionChange }: RecipientSelectorProps) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<ReadonlySet<string>>(
    () => new Set(groups.map((g) => g.id)),
  );
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<ReadonlySet<string>>(
    () => new Set(recipients.map((r) => r.id)),
  );

  const resolvedEmails = useMemo(
    () => resolveSelectedEmails(selectedGroupIds, selectedRecipientIds, groups, recipients),
    [selectedGroupIds, selectedRecipientIds, recipients, groups],
  );

  useEffect(() => {
    onSelectionChange(resolvedEmails);
  }, [resolvedEmails, onSelectionChange]);

  const toggleGroup = useCallback((gid: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) {
        next.delete(gid);
      } else {
        next.add(gid);
      }
      return next;
    });
  }, []);

  const toggleRecipient = useCallback((rid: string) => {
    setSelectedRecipientIds((prev) => {
      const next = new Set(prev);
      if (next.has(rid)) {
        next.delete(rid);
      } else {
        next.add(rid);
      }
      return next;
    });
  }, []);

  const resolvedNames = useMemo(() => {
    const nameSet = new Set<string>();
    for (const email of resolvedEmails) {
      const r = recipients.find((rec) => rec.email === email);
      if (r) nameSet.add(r.name || r.email);
    }
    return [...nameSet];
  }, [resolvedEmails, recipients]);

  return (
    <div className="c2m-recipient-selector">
      {groups.length > 0 && (
        <div className="c2m-selector-section">
          <span className="c2m-selector-label">그룹:</span>
          <div className="c2m-chip-list">
            {groups.map((g) => {
              const memberCount = g.recipientIds.filter((rid) =>
                recipients.some((r) => r.id === rid),
              ).length;
              const isSelected = selectedGroupIds.has(g.id);
              return (
                <button
                  key={g.id}
                  className={`c2m-chip ${isSelected ? 'c2m-chip--selected' : ''}`}
                  onClick={() => toggleGroup(g.id)}
                  aria-pressed={isSelected}
                >
                  {g.name} ({memberCount}명)
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="c2m-selector-section">
        <span className="c2m-selector-label">개별:</span>
        <div className="c2m-chip-list">
          {recipients.map((r) => {
            const isSelected = selectedRecipientIds.has(r.id);
            return (
              <button
                key={r.id}
                className={`c2m-chip ${isSelected ? 'c2m-chip--selected' : ''}`}
                onClick={() => toggleRecipient(r.id)}
                aria-pressed={isSelected}
              >
                {r.name || r.email}
              </button>
            );
          })}
        </div>
      </div>

      <div className="c2m-selected-summary">
        {resolvedEmails.length > 0 ? (
          <>
            <strong>선택된 수신자: {resolvedEmails.length}명</strong>
            <span className="c2m-selected-names">{resolvedNames.join(', ')}</span>
          </>
        ) : (
          <span className="c2m-no-selection">수신자를 선택하세요</span>
        )}
      </div>
    </div>
  );
}
