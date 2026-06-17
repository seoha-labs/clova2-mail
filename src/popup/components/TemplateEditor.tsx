import { useCallback, useEffect, useState } from 'react';

import type { EmailTemplate } from '../../shared/types';
import {
  getEmailTemplates,
  setEmailTemplates,
  getActiveTemplateId,
  setActiveTemplateId,
} from '../../shared/storage';
import { DEFAULT_TEMPLATE } from '../../shared/constants';
import { stripHtmlFromTemplate } from '../../content/sanitizer';

function newId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function TemplateEditor() {
  const [templates, setTemplates] = useState<readonly EmailTemplate[]>([]);
  const [activeId, setActiveId] = useState<string>(DEFAULT_TEMPLATE.id);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_TEMPLATE.id);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    Promise.all([getEmailTemplates(), getActiveTemplateId()]).then(([t, a]) => {
      setTemplates(t);
      setActiveId(a);
      setSelectedId(t.some((x) => x.id === a) ? a : (t[0]?.id ?? DEFAULT_TEMPLATE.id));
      setLoading(false);
    });
  }, []);

  const persist = useCallback((next: readonly EmailTemplate[]) => {
    setTemplates(next);
    setEmailTemplates(next);
  }, []);

  const selected = templates.find((t) => t.id === selectedId) ?? templates[0];

  const updateSelected = useCallback(
    (patch: Partial<Pick<EmailTemplate, 'name' | 'subject' | 'body'>>) => {
      if (!selected) return;
      persist(templates.map((t) => (t.id === selected.id ? { ...t, ...patch } : t)));
    },
    [persist, selected, templates],
  );

  const handleAdd = useCallback(() => {
    const created: EmailTemplate = {
      id: newId(),
      name: `새 템플릿 ${templates.length + 1}`,
      subject: DEFAULT_TEMPLATE.subject,
      body: DEFAULT_TEMPLATE.body,
    };
    persist([...templates, created]);
    setSelectedId(created.id);
    setNotice('');
  }, [persist, templates]);

  const handleDuplicate = useCallback(() => {
    if (!selected) return;
    const copy: EmailTemplate = { ...selected, id: newId(), name: `${selected.name} (복사본)` };
    persist([...templates, copy]);
    setSelectedId(copy.id);
    setNotice('');
  }, [persist, selected, templates]);

  const handleDelete = useCallback(() => {
    if (!selected) return;
    if (templates.length <= 1) {
      setNotice('마지막 템플릿은 삭제할 수 없습니다.');
      return;
    }
    const next = templates.filter((t) => t.id !== selected.id);
    persist(next);
    // Deleting the active one falls back to the first remaining template.
    if (activeId === selected.id) {
      const fallback = next[0].id;
      setActiveId(fallback);
      setActiveTemplateId(fallback);
    }
    setSelectedId(next[0].id);
    setNotice('');
  }, [activeId, persist, selected, templates]);

  const handleSetActive = useCallback(
    (id: string) => {
      setActiveId(id);
      setActiveTemplateId(id);
    },
    [],
  );

  if (loading) return <div className="p-4 text-sm text-gray-500">로딩 중...</div>;
  if (!selected) return <div className="p-4 text-sm text-gray-500">템플릿이 없습니다.</div>;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">이메일 템플릿</h2>
        <button onClick={handleAdd} className="text-xs text-teal-600 hover:text-teal-800">
          + 새 템플릿
        </button>
      </div>

      {notice && <p className="text-xs text-red-600">{notice}</p>}

      <div className="space-y-2">
        <label htmlFor="template-select" className="text-xs font-medium text-gray-600">템플릿 선택</label>
        <div className="flex items-center gap-2">
          <select
            id="template-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.id === activeId ? ' (기본 사용)' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleDuplicate}
            className="text-xs px-2 py-1.5 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            복제
          </button>
          <button
            onClick={handleDelete}
            className="text-xs px-2 py-1.5 text-red-600 border border-gray-300 rounded-md hover:bg-red-50"
          >
            삭제
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="radio"
            name="active-template"
            checked={selected.id === activeId}
            onChange={() => handleSetActive(selected.id)}
          />
          이 템플릿을 기본으로 사용
        </label>
      </div>

      <div className="space-y-2">
        <label htmlFor="template-name" className="text-xs font-medium text-gray-600">템플릿 이름</label>
        <input
          id="template-name"
          type="text"
          value={selected.name}
          onChange={(e) => updateSelected({ name: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="template-subject" className="text-xs font-medium text-gray-600">제목</label>
        <input
          id="template-subject"
          type="text"
          value={selected.subject}
          onChange={(e) => updateSelected({ subject: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="template-body" className="text-xs font-medium text-gray-600">본문 (Markdown)</label>
        <textarea
          id="template-body"
          value={selected.body}
          onChange={(e) => updateSelected({ body: stripHtmlFromTemplate(e.target.value) })}
          rows={10}
          className="w-full px-2 py-1.5 text-xs font-mono border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y"
        />
        <p className="text-xs text-gray-400">
          Markdown 문법을 사용하세요 (## 제목, **굵게**, - 목록). HTML 태그는 자동 제거됩니다.
        </p>
      </div>

      <div className="bg-gray-50 rounded-md p-2">
        <p className="text-xs font-medium text-gray-500 mb-1">사용 가능한 변수:</p>
        <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
          <span><code className="bg-gray-200 px-1 rounded">{'{title}'}</code> 회의 제목</span>
          <span><code className="bg-gray-200 px-1 rounded">{'{date}'}</code> 날짜</span>
          <span><code className="bg-gray-200 px-1 rounded">{'{summary_bullets}'}</code> 회의 요약</span>
          <span><code className="bg-gray-200 px-1 rounded">{'{decisions}'}</code> 결정사항</span>
          <span><code className="bg-gray-200 px-1 rounded">{'{action_items}'}</code> 실행 과제</span>
          <span><code className="bg-gray-200 px-1 rounded">{'{discussions}'}</code> 논의/보류 사항</span>
          <span><code className="bg-gray-200 px-1 rounded">{'{attendees}'}</code> 참석자</span>
        </div>
      </div>
    </div>
  );
}
