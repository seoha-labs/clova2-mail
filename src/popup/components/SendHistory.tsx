import { useCallback, useEffect, useState } from 'react';

import {
  getSendHistory,
  deleteHistoryEntry,
  clearSendHistory,
  setPendingResend,
} from '../../shared/storage';
import type { SentEmail } from '../../shared/types';

function formatTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function recipientSummary(entry: SentEmail): string {
  const all = [...entry.to, ...entry.cc, ...entry.bcc];
  if (all.length === 0) return '수신자 없음';
  return all.length === 1 ? all[0] : `${all[0]} 외 ${all.length - 1}명`;
}

export function SendHistory() {
  const [history, setHistory] = useState<readonly SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [resentId, setResentId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const h = await getSendHistory();
    setHistory(h);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteHistoryEntry(id);
      await reload();
    },
    [reload],
  );

  const handleClearAll = useCallback(async () => {
    if (!window.confirm('발송 내역을 모두 삭제할까요?')) return;
    await clearSendHistory();
    await reload();
  }, [reload]);

  const handleResend = useCallback(async (entry: SentEmail) => {
    await setPendingResend({
      to: entry.to,
      cc: entry.cc,
      bcc: entry.bcc,
      subject: entry.subject,
      bodyHtml: entry.bodyHtml,
    });
    setResentId(entry.id);
    window.setTimeout(() => setResentId(null), 3000);
  }, []);

  if (loading) return <div className="p-4 text-sm text-gray-500">로딩 중...</div>;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">발송 내역</h2>
        {history.length > 0 && (
          <button onClick={handleClearAll} className="text-xs text-red-500 hover:text-red-700">
            전체 삭제
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <p className="text-xs text-gray-400">발송 내역이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((entry) => (
            <li key={entry.id} className="border border-gray-200 rounded-md p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-400">{formatTime(entry.sentAt)}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    entry.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {entry.success ? '성공' : '실패'}
                </span>
              </div>
              <div className="text-sm font-medium text-gray-800 truncate" title={entry.subject}>
                {entry.subject || '(제목 없음)'}
              </div>
              <div className="text-xs text-gray-500 truncate">{recipientSummary(entry)}</div>
              {!entry.success && entry.error && (
                <div className="text-xs text-red-500 truncate" title={entry.error}>
                  오류: {entry.error}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => setOpenId(openId === entry.id ? null : entry.id)}
                  className="text-xs text-teal-600 hover:text-teal-800"
                >
                  {openId === entry.id ? '본문 닫기' : '본문 보기'}
                </button>
                <button
                  onClick={() => handleResend(entry)}
                  className="text-xs text-teal-600 hover:text-teal-800"
                >
                  {resentId === entry.id ? '✓ 모달에 불러옴' : '다시 보내기'}
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  삭제
                </button>
              </div>

              {openId === entry.id && (
                <div className="mt-1 border-t border-gray-100 pt-2">
                  {entry.truncated && (
                    <p className="text-[10px] text-amber-600 mb-1">
                      ⚠ 본문이 256KB를 초과하여 일부 잘렸습니다.
                    </p>
                  )}
                  <div
                    className="text-xs text-gray-700 max-h-48 overflow-auto border border-gray-100 rounded p-2"
                    dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {resentId && (
        <p className="text-xs text-teal-600">
          ClovaNote 페이지의 발송 모달에 불러왔습니다. 해당 탭에서 확인 후 발송하세요.
        </p>
      )}
    </div>
  );
}
