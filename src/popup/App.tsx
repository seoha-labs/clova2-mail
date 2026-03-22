import { useGmailAuth } from './hooks/useAuth';
import { AuthSection } from './components/AuthSection';
import { RecipientList } from './components/RecipientList';
import { TemplateEditor } from './components/TemplateEditor';

export function App() {
  const { state: gmail, connect, disconnect } = useGmailAuth();

  // Gmail 상태 로딩 중
  if (gmail.loading) {
    return (
      <div className="w-[380px] min-h-[500px] bg-white flex items-center justify-center">
        <p className="text-sm text-gray-400">로딩 중...</p>
      </div>
    );
  }

  // Gmail 미연결 → 연결 게이트 화면
  if (!gmail.connected) {
    return (
      <div className="w-[380px] min-h-[500px] bg-white flex flex-col">
        <div className="bg-teal-600 px-4 py-3">
          <h1 className="text-white text-lg font-semibold">clova2Mail</h1>
          <p className="text-teal-200 text-xs">ClovaNote 회의록 요약/원문 이메일 발송</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-6">
          <div className="text-center space-y-2">
            <div className="text-4xl">✉️</div>
            <h2 className="text-base font-semibold text-gray-800">Gmail 연결이 필요합니다</h2>
            <p className="text-xs text-gray-500">
              회의록 요약 이메일을 발송하려면<br />Gmail 계정을 먼저 연결해 주세요.
            </p>
          </div>
          <button
            onClick={connect}
            className="w-full py-2.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#EA4335" strokeWidth="2" />
              <path d="M22 6l-10 7L2 6" stroke="#EA4335" strokeWidth="2" />
            </svg>
            Gmail 계정 연결
          </button>
        </div>
      </div>
    );
  }

  // Gmail 연결됨 → 메인 설정 화면
  return (
    <div className="w-[380px] min-h-[500px] bg-white text-gray-900">
      <div className="bg-teal-600 px-4 py-3">
        <h1 className="text-white text-lg font-semibold">clova2Mail</h1>
        <p className="text-teal-200 text-xs">ClovaNote 회의록 요약/원문 이메일 발송</p>
        {/* 연결된 Gmail 이메일 표시 */}
        {gmail.email && (
          <p className="text-teal-300 text-xs mt-1 opacity-80">
            📧 {gmail.email}
            <button
              onClick={disconnect}
              className="ml-2 underline text-teal-300 hover:text-white text-xs"
            >
              연결 해제
            </button>
          </p>
        )}
      </div>
      <div className="divide-y divide-gray-200">
        <AuthSection />
        <RecipientList />
        <TemplateEditor />
      </div>
    </div>
  );
}
