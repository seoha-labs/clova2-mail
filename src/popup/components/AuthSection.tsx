import { useState, useCallback } from 'react';
import { getOpenAIKey, setOpenAIKey } from '../../shared/storage';
import { useStorage } from '../hooks/useStorage';

export function AuthSection() {
  const [apiKey, updateApiKey, loadingKey] = useStorage(getOpenAIKey, setOpenAIKey);
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'idle' | 'valid' | 'invalid' | 'checking'>('idle');

  const validateKey = useCallback(async (key: string) => {
    if (!key || !key.startsWith('sk-')) {
      setKeyStatus('invalid');
      return;
    }
    setKeyStatus('checking');
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      setKeyStatus(res.ok ? 'valid' : 'invalid');
    } catch {
      setKeyStatus('invalid');
    }
  }, []);

  const handleKeyChange = useCallback(
    (value: string) => {
      updateApiKey(value);
      setKeyStatus('idle');
    },
    [updateApiKey],
  );

  if (loadingKey) return <div className="p-4 text-sm text-gray-500">로딩 중...</div>;

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">OpenAI API 설정</h2>
      <p className="text-[11px] text-gray-500 mb-2">
        회의록 요약을 위해 OpenAI API Key가 필요합니다. 무료 크레딧 또는 결제 등록된 계정의 Key를 사용하세요.
      </p>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-600">API Key</label>
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey ?? ''}
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder="sk-proj-..."
            className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {showKey ? '숨기기' : '보기'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => validateKey(apiKey ?? '')}
            className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            검증
          </button>
          {keyStatus === 'checking' && <span className="text-[10px] text-gray-500">확인 중...</span>}
          {keyStatus === 'valid' && <span className="text-[10px] text-green-600">✓ 유효한 키</span>}
          {keyStatus === 'invalid' && <span className="text-[10px] text-red-600">✗ 유효하지 않거나 잔액이 부족합니다</span>}
        </div>
      </div>
    </div>
  );
}
