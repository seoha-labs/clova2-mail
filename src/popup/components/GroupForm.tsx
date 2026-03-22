import { useState, useCallback } from 'react';
import type { Recipient, RecipientGroup } from '../../shared/types';

interface GroupFormProps {
  readonly recipients: readonly Recipient[];
  readonly existingGroups: readonly RecipientGroup[];
  readonly editingGroup: RecipientGroup | null;
  readonly onSave: (group: RecipientGroup) => void;
  readonly onCancel: () => void;
}

export function GroupForm({ recipients, existingGroups, editingGroup, onSave, onCancel }: GroupFormProps) {
  const [name, setName] = useState(editingGroup?.name ?? '');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(editingGroup?.recipientIds ?? []),
  );
  const [error, setError] = useState('');

  const toggleRecipient = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    setError('');
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('그룹명을 입력하세요.');
      return;
    }

    const isDuplicate = existingGroups.some(
      (g) => g.name.toLowerCase() === trimmedName.toLowerCase() && g.id !== editingGroup?.id,
    );
    if (isDuplicate) {
      setError('이미 존재하는 그룹명입니다.');
      return;
    }

    if (selectedIds.size === 0) {
      setError('최소 1명의 멤버를 선택하세요.');
      return;
    }

    onSave({
      id: editingGroup?.id ?? `grp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: trimmedName,
      recipientIds: [...selectedIds],
    });
  }, [name, selectedIds, existingGroups, editingGroup, onSave]);

  return (
    <div className="space-y-2 p-3 bg-teal-50 rounded-md border border-teal-200">
      <p className="text-xs font-semibold text-teal-800">
        {editingGroup ? '그룹 수정' : '새 그룹 만들기'}
      </p>

      <input
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError('');
        }}
        placeholder="그룹명 (예: 개발팀)"
        aria-label="그룹명"
        maxLength={50}
        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-transparent"
      />

      <div className="space-y-1 max-h-32 overflow-y-auto">
        <p className="text-[11px] text-gray-500">멤버 선택:</p>
        {recipients.length === 0 && (
          <p className="text-[11px] text-gray-400">등록된 수신자가 없습니다.</p>
        )}
        {recipients.map((r) => (
          <label
            key={r.id}
            className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-teal-100 cursor-pointer text-xs"
          >
            <input
              type="checkbox"
              checked={selectedIds.has(r.id)}
              onChange={() => toggleRecipient(r.id)}
              className="accent-teal-600"
            />
            <span className="font-medium">{r.name}</span>
            <span className="text-gray-400">{r.email}</span>
          </label>
        ))}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
        >
          취소
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1 text-xs bg-teal-600 text-white rounded-md hover:bg-teal-700"
        >
          {editingGroup ? '수정 완료' : '그룹 생성'}
        </button>
      </div>
    </div>
  );
}
