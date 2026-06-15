import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Recipient, RecipientGroup } from '../../shared/types';
import { resolveSelectedEmails } from '../../shared/recipientUtils';
import type { SelectionState } from './recipientDefaults';
import { defaultToSelection, emptySelection, recipientIdsForEmails } from './recipientDefaults';

export interface RecipientSelection {
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly bcc: readonly string[];
}

interface RecipientSelectorProps {
  readonly recipients: readonly Recipient[];
  readonly groups: readonly RecipientGroup[];
  readonly onSelectionChange: (selection: RecipientSelection) => void;
  /**
   * When provided (re-send), seeds To/CC/BCC from these emails instead of the
   * default (To = everyone, CC/BCC = empty).
   */
  readonly initialSelection?: RecipientSelection;
}

interface RecipientFieldProps {
  readonly label: string;
  readonly recipients: readonly Recipient[];
  readonly groups: readonly RecipientGroup[];
  readonly initialGroupIds: ReadonlySet<string>;
  readonly initialRecipientIds: ReadonlySet<string>;
  readonly onChange: (emails: readonly string[]) => void;
}

function RecipientField({
  label,
  recipients,
  groups,
  initialGroupIds,
  initialRecipientIds,
  onChange,
}: RecipientFieldProps) {
  const [selectedGroupIds, setSelectedGroupIds] =
    useState<ReadonlySet<string>>(initialGroupIds);
  const [selectedRecipientIds, setSelectedRecipientIds] =
    useState<ReadonlySet<string>>(initialRecipientIds);

  const resolvedEmails = useMemo(
    () => resolveSelectedEmails(selectedGroupIds, selectedRecipientIds, groups, recipients),
    [selectedGroupIds, selectedRecipientIds, recipients, groups],
  );

  useEffect(() => {
    onChange(resolvedEmails);
  }, [resolvedEmails, onChange]);

  const toggleGroup = useCallback((gid: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  }, []);

  const toggleRecipient = useCallback((rid: string) => {
    setSelectedRecipientIds((prev) => {
      const next = new Set(prev);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
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
            <strong>
              {label} 수신자: {resolvedEmails.length}명
            </strong>
            <span className="c2m-selected-names">{resolvedNames.join(', ')}</span>
          </>
        ) : (
          <span className="c2m-no-selection">{label} 대상 없음</span>
        )}
      </div>
    </div>
  );
}

export function RecipientSelector({
  recipients,
  groups,
  onSelectionChange,
  initialSelection,
}: RecipientSelectorProps) {
  const [to, setTo] = useState<readonly string[]>([]);
  const [cc, setCc] = useState<readonly string[]>([]);
  const [bcc, setBcc] = useState<readonly string[]>([]);
  const [ccOpen, setCcOpen] = useState((initialSelection?.cc.length ?? 0) > 0);
  const [bccOpen, setBccOpen] = useState((initialSelection?.bcc.length ?? 0) > 0);

  // To defaults to everyone; on re-send, seed each field from the staged emails.
  const toInit = useMemo<SelectionState>(
    () =>
      initialSelection
        ? { groupIds: new Set<string>(), recipientIds: recipientIdsForEmails(initialSelection.to, recipients) }
        : defaultToSelection(groups, recipients),
    [initialSelection, groups, recipients],
  );
  const ccInit = useMemo<SelectionState>(
    () =>
      initialSelection
        ? { groupIds: new Set<string>(), recipientIds: recipientIdsForEmails(initialSelection.cc, recipients) }
        : emptySelection(),
    [initialSelection, recipients],
  );
  const bccInit = useMemo<SelectionState>(
    () =>
      initialSelection
        ? { groupIds: new Set<string>(), recipientIds: recipientIdsForEmails(initialSelection.bcc, recipients) }
        : emptySelection(),
    [initialSelection, recipients],
  );

  useEffect(() => {
    onSelectionChange({ to, cc, bcc });
  }, [to, cc, bcc, onSelectionChange]);

  const handleTo = useCallback((emails: readonly string[]) => setTo(emails), []);
  const handleCc = useCallback((emails: readonly string[]) => setCc(emails), []);
  const handleBcc = useCallback((emails: readonly string[]) => setBcc(emails), []);

  return (
    <div className="c2m-recipient-fields">
      <RecipientField
        label="받는 사람"
        recipients={recipients}
        groups={groups}
        initialGroupIds={toInit.groupIds}
        initialRecipientIds={toInit.recipientIds}
        onChange={handleTo}
      />

      <div className="c2m-collapsible">
        <button
          className="c2m-collapsible-toggle"
          onClick={() => setCcOpen((v) => !v)}
          aria-expanded={ccOpen}
        >
          {ccOpen ? '▾' : '▸'} 참조(CC) {cc.length > 0 ? `(${cc.length}명)` : ''}
        </button>
        {ccOpen && (
          <RecipientField
            label="참조(CC)"
            recipients={recipients}
            groups={groups}
            initialGroupIds={ccInit.groupIds}
            initialRecipientIds={ccInit.recipientIds}
            onChange={handleCc}
          />
        )}
      </div>

      <div className="c2m-collapsible">
        <button
          className="c2m-collapsible-toggle"
          onClick={() => setBccOpen((v) => !v)}
          aria-expanded={bccOpen}
        >
          {bccOpen ? '▾' : '▸'} 숨은참조(BCC) {bcc.length > 0 ? `(${bcc.length}명)` : ''}
        </button>
        {bccOpen && (
          <RecipientField
            label="숨은참조(BCC)"
            recipients={recipients}
            groups={groups}
            initialGroupIds={bccInit.groupIds}
            initialRecipientIds={bccInit.recipientIds}
            onChange={handleBcc}
          />
        )}
      </div>
    </div>
  );
}
