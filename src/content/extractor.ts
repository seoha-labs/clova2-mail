import type { ExtractedData } from '../shared/types';

const CLOVANOTE_API_BASE = 'https://api-v2.clovanote.naver.com';

// ClovaNote가 자체적으로 API 요청할 때 사용하는 note-* 헤더를 여기 저장
const capturedHeaders: Record<string, string> = {};

const NOTE_HEADER_KEYS = [
  'note-client-type',
  'note-client-version',
  'note-device-id',
  'note-session-id',
];

/**
 * window.fetch를 감싸서 ClovaNote API 요청의 note-* 헤더를 캡처합니다.
 * Content script 최초 로드 시 한 번만 호출합니다.
 */
export function installFetchInterceptor(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // ClovaNote API 요청에서만 헤더 캡처
    if (url.includes('api-v2.clovanote.naver.com') && init?.headers) {
      const headers = init.headers as Record<string, string>;
      for (const key of NOTE_HEADER_KEYS) {
        if (headers[key]) {
          capturedHeaders[key] = headers[key];
        }
      }
    }

    return originalFetch(input, init);
  };
}

interface NoteIds {
  workspaceId: string;
  noteId: string;
}

/**
 * 현재 페이지 URL에서 workspaceId, noteId를 파싱합니다.
 * 예: https://clovanote.naver.com/w/{workspaceId}/note-detail/{noteId}
 */
function parseNoteIdsFromUrl(url: string): NoteIds | null {
  const match = url.match(/\/w\/([^/?#]+)\/note(?:s|-detail)\/([^/?#]+)/);
  if (!match) return null;
  return {
    workspaceId: match[1],
    noteId: match[2],
  };
}

/**
 * note-request-id를 생성합니다.
 * 패턴: {timestamp}_{deviceId앞4자}_{random hex 8자}
 */
function generateRequestId(): string {
  const deviceId = capturedHeaders['note-device-id'] ?? '';
  const timestamp = Date.now();
  const devicePrefix = deviceId.replace(/-/g, '').slice(0, 4) || 'c2ml';
  const randomHex = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  return `${timestamp}_${devicePrefix}_${randomHex}`;
}

/**
 * localStorage에서 deviceId, sessionId를 읽어옵니다.
 * 실제 ClovaNote 저장 구조:
 *   deviceId  → JSON.parse(localStorage['b:c']).deviceId
 *   sessionId → JSON.parse(localStorage['w:c'])[workspaceId].sessionId
 */
function readFromLocalStorage(workspaceId: string): { deviceId: string; sessionId: string } {
  let deviceId = '';
  let sessionId = '';
  try {
    const bc = localStorage.getItem('b:c');
    if (bc) deviceId = JSON.parse(bc)?.deviceId ?? '';
  } catch { /* ignore */ }
  try {
    const wc = localStorage.getItem('w:c');
    if (wc) sessionId = JSON.parse(wc)?.[workspaceId]?.sessionId ?? '';
  } catch { /* ignore */ }
  return { deviceId, sessionId };
}

/**
 * ClovaNote API를 직접 호출해 원문 텍스트(.txt)를 가져옵니다.
 * 인터셉터 캡처 헤더를 우선 사용하고, 없으면 localStorage에서 읽습니다.
 */
async function fetchScriptFile(workspaceId: string, noteId: string): Promise<string> {
  const url =
    `${CLOVANOTE_API_BASE}/v2/w/${workspaceId}/notes/${noteId}/script-file` +
    `?timestamp=true&attendee=true&highlight=true&fileType=txt&noteId=${noteId}`;

  // 인터셉터가 캡처한 값 우선, 없으면 localStorage에서 직접 읽기
  const ls = readFromLocalStorage(workspaceId);
  const deviceId = capturedHeaders['note-device-id'] || ls.deviceId;
  const sessionId = capturedHeaders['note-session-id'] || ls.sessionId;

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'accept': 'application/json, text/plain, */*',
      ...capturedHeaders,
      'note-client-type': capturedHeaders['note-client-type'] || 'WEB',
      'note-client-version': capturedHeaders['note-client-version'] || '25.11.2',
      'note-device-id': deviceId,
      'note-request-id': generateRequestId(),
      'note-session-id': sessionId,
    },
  });

  if (!response.ok) {
    throw new Error(`ClovaNote API 오류: ${response.status} ${response.statusText}`);
  }

  return response.text();
}


/**
 * 다운로드된 텍스트에서 제목을 추출합니다.
 */
function extractTitleFromText(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim().length > 0);
  return firstLine?.trim() || '회의록';
}

/**
 * 다운로드된 텍스트에서 참석자를 추출합니다.
 */
function extractAttendeesFromText(text: string): string[] {
  const lines = text.split('\n');
  for (const line of lines) {
    if (/^(참석자|attendees?)\s*[:：]/i.test(line)) {
      const value = line.replace(/^(참석자|attendees?)\s*[:：]/i, '').trim();
      return value
        .split(/[,，、]/)
        .map((a) => a.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * 버튼 클릭 시 현재 URL을 기반으로 ClovaNote API를 호출해 원문을 추출합니다.
 */
export async function extractTranscript(): Promise<ExtractedData | null> {
  const ids = parseNoteIdsFromUrl(location.href);
  if (!ids) {
    console.warn('[clova2Mail] 노트 ID를 URL에서 파싱할 수 없습니다:', location.href);
    return null;
  }

  const text = await fetchScriptFile(ids.workspaceId, ids.noteId);

  return {
    title: extractTitleFromText(text),
    transcript: text,
    attendees: extractAttendeesFromText(text),
    date: new Date().toISOString().split('T')[0],
  };
}

export { parseNoteIdsFromUrl };
