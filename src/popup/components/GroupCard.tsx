import type { RecipientGroup, Recipient } from '../../shared/types';

interface GroupCardProps {
  readonly group: RecipientGroup;
  readonly recipients: readonly Recipient[];
  readonly onEdit: (group: RecipientGroup) => void;
  readonly onDelete: (id: string) => void;
}

export function GroupCard({ group, recipients, onEdit, onDelete }: GroupCardProps) {
  const members = recipients.filter((r) => group.recipientIds.includes(r.id));
  const memberNames = members.map((m) => m.name).join(', ') || '-';

  return (
    <div
      className="py-2 px-3 bg-gray-50 rounded-md cursor-pointer hover:bg-gray-100 transition-colors"
      onClick={() => onEdit(group)}
      role="button"
      tabIndex={0}
      aria-label={`${group.name} 그룹 수정`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit(group);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs">
          <span className="font-semibold text-gray-800">{group.name}</span>
          <span className="text-gray-400 ml-1">({members.length}명)</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`'${group.name}' 그룹을 삭제하시겠습니까?`)) {
              onDelete(group.id);
            }
          }}
          className="text-gray-400 hover:text-red-500 text-sm px-1"
          aria-label={`${group.name} 그룹 삭제`}
        >
          ✕
        </button>
      </div>
      <div className="text-[11px] text-gray-500 mt-0.5 truncate">{memberNames}</div>
    </div>
  );
}
