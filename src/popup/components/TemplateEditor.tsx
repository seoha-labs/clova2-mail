import { useCallback } from 'react';

import { getEmailTemplate, setEmailTemplate } from '../../shared/storage';
import { DEFAULT_TEMPLATE } from '../../shared/constants';
import { useStorage } from '../hooks/useStorage';
import { stripHtmlFromTemplate } from '../../content/sanitizer';

export function TemplateEditor() {
  const [template, updateTemplate, loading] = useStorage(getEmailTemplate, setEmailTemplate);

  const handleSubjectChange = useCallback(
    (subject: string) => {
      const current = template ?? DEFAULT_TEMPLATE;
      updateTemplate({ ...current, subject });
    },
    [template, updateTemplate],
  );

  const handleBodyChange = useCallback(
    (body: string) => {
      const current = template ?? DEFAULT_TEMPLATE;
      const cleanBody = stripHtmlFromTemplate(body);
      updateTemplate({ ...current, body: cleanBody });
    },
    [template, updateTemplate],
  );

  const resetTemplate = useCallback(() => {
    updateTemplate(DEFAULT_TEMPLATE);
  }, [updateTemplate]);

  if (loading) return <div className="p-4 text-sm text-gray-500">로딩 중...</div>;

  const current = template ?? DEFAULT_TEMPLATE;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">이메일 템플릿</h2>
        <button
          onClick={resetTemplate}
          className="text-xs text-teal-600 hover:text-teal-800"
        >
          기본값으로 초기화
        </button>
      </div>

      <div className="space-y-2">
        <label htmlFor="template-subject" className="text-xs font-medium text-gray-600">제목</label>
        <input
          id="template-subject"
          type="text"
          value={current.subject}
          onChange={(e) => handleSubjectChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="template-body" className="text-xs font-medium text-gray-600">본문 (Markdown)</label>
        <textarea
          id="template-body"
          value={current.body}
          onChange={(e) => handleBodyChange(e.target.value)}
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
