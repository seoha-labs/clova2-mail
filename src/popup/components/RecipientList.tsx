import { useState, useCallback } from 'react';
import type { Recipient } from '../../shared/types';
import { getRecipients, setRecipients } from '../../shared/storage';
import { useStorage } from '../hooks/useStorage';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RecipientList() {
  const [recipients, updateRecipients, loading] = useStorage(getRecipients, setRecipients);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const addRecipient = useCallback(() => {
    setError('');
    if (!EMAIL_REGEX.test(newEmail)) {
      setError('올바른 이메일 주소를 입력하세요.');
      return;
    }

    const current = recipients ?? [];
    if (current.some((r) => r.email === newEmail)) {
      setError('이미 등록된 이메일입니다.');
      return;
    }

    const newRecipient: Recipient = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      email: newEmail,
      name: newName || newEmail.split('@')[0],
    };

    updateRecipients([...current, newRecipient]);
    setNewEmail('');
    setNewName('');
  }, [recipients, newEmail, newName, updateRecipients]);

  const removeRecipient = useCallback(
    (id: string) => {
      const current = recipients ?? [];
      updateRecipients(current.filter((r) => r.id !== id));
    },
    [recipients, updateRecipients],
  );

  if (loading) return <div className="p-4 text-sm text-gray-500">로딩 중...</div>;

  const list = recipients ?? [];

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">
        수신자 목록 <span className="text-gray-400 font-normal">({list.length}명)</span>
      </h2>

      {list.length > 0 && (
        <div className="space-y-1">
          {list.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded-md"
            >
              <div className="text-xs">
                <span className="font-medium">{r.name}</span>
                <span className="text-gray-500 ml-1">{r.email}</span>
              </div>
              <button
                onClick={() => removeRecipient(r.id)}
                className="text-gray-400 hover:text-red-500 text-sm px-1"
                aria-label={`${r.name} 삭제`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="이름 (선택)"
            aria-label="수신자 이름"
            className="w-24 px-2 py-1.5 text-xs border border-gray-300 rounded-md"
          />
          <input
            type="email"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
            placeholder="email@example.com"
            aria-label="수신자 이메일"
            className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-md"
          />
          <button
            onClick={addRecipient}
            className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded-md hover:bg-teal-700"
          >
            추가
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
