import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ModalState, Recipient, ProgressInfo } from '../../shared/types';
import type { SummarizeResponse, SendEmailResponse } from '../../shared/messages';
import { renderSafeHtml, sanitizeHtml, injectEmailStyles } from '../sanitizer';
import { getRecipients } from '../../shared/storage';

interface ModalProps {
  readonly transcript: string | null;
  readonly meetingTitle: string;
  readonly attendees: readonly string[];
  readonly onClose: () => void;
}

export function Modal({ transcript, meetingTitle, attendees, onClose }: ModalProps) {
  const [state, setState] = useState<ModalState>(transcript ? 'RAW_DATA_PREVIEW' : 'EXTRACT_FAILED');
  const [recipients, setRecipients] = useState<readonly Recipient[]>([]);
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [manualText, setManualText] = useState('');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    getRecipients().then(setRecipients);
  }, []);

  // Focus management: save previous focus and restore on close
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    // Focus the container on mount
    containerRef.current?.focus();
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [state, isEditing]);

  const requestSummary = useCallback(
    (text: string) => {
      setState('LOADING');
      setError('');
      chrome.runtime.sendMessage(
        {
          type: 'EXTRACT_AND_SUMMARIZE',
          payload: { transcript: text, meetingTitle, attendees: [...attendees] },
        },
        (response: SummarizeResponse) => {
          if (chrome.runtime.lastError) {
            setError(chrome.runtime.lastError.message ?? '백그라운드 서비스와 통신에 실패했습니다.');
            setState('ERROR');
            return;
          }
          if (response?.payload?.success) {
            const safeHtml = renderSafeHtml(response.payload.htmlBody);
            setSubject(response.payload.subject);
            setHtmlBody(safeHtml);
            setState('PREVIEW');
          } else {
            const errMessage = response?.payload && 'message' in response.payload ? response.payload.message : '요약 생성에 실패했습니다.';
            setError(errMessage as string);
            setState('ERROR');
          }
        },
      );
    },
    [meetingTitle, attendees],
  );

  const handleCopy = useCallback(() => {
    if (!transcript) return;
    const rawContent = `회의명: ${meetingTitle}\n참석자: ${attendees.join(', ')}\n\n[회의 원문]\n${transcript}`;
    navigator.clipboard.writeText(rawContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [transcript, meetingTitle, attendees]);

  useEffect(() => {
    // 자동 시작을 방지. RAW_DATA_PREVIEW 에서 명시적으로 버튼을 눌러야 시작.
    if (transcript && state === 'LOADING' && !htmlBody) {
      // 메뉴얼하게 텍스트만 전송할 때 사용하는 기존 플로우나 예외 방어용으로 남겨둠
      // requestSummary(transcript);
    }
  }, [transcript, state, htmlBody]);

  const handleSend = useCallback(() => {
    if (recipients.length === 0) {
      setError('수신자가 설정되지 않았습니다. 확장 프로그램 설정에서 수신자를 추가하세요.');
      setState('ERROR');
      return;
    }

    setState('SENDING');
    const styledHtml = injectEmailStyles(htmlBody);
    chrome.runtime.sendMessage(
      {
        type: 'SEND_EMAIL',
        payload: {
          to: recipients.map((r) => r.email),
          subject,
          htmlBody: styledHtml,
        },
      },
      (response: SendEmailResponse) => {
        if (chrome.runtime.lastError) {
          setError(chrome.runtime.lastError.message ?? '백그라운드 서비스와 통신에 실패했습니다.');
          setState('ERROR');
          return;
        }
        if (response?.payload?.success) {
          setState('SENT');
          setTimeout(onClose, 2000);
        } else {
          setError(response?.payload?.error ?? '이메일 발송에 실패했습니다.');
          setState('ERROR');
        }
      },
    );
  }, [recipients, subject, htmlBody, onClose]);

  const handleManualSubmit = useCallback(() => {
    if (manualText.trim().length < 50) {
      setError('텍스트가 너무 짧습니다. 50자 이상 입력해 주세요.');
      return;
    }
    requestSummary(manualText);
  }, [manualText, requestSummary]);

  return (
    <div className="c2m-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={containerRef}
        className="c2m-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="c2m-dialog-title"
        tabIndex={-1}
      >
        <div className="c2m-header">
          <h2 id="c2m-dialog-title">clova2Mail</h2>
          <button className="c2m-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="c2m-body">
          {state === 'RAW_DATA_PREVIEW' && (
            <div className="c2m-raw-data-view">
              <div className="c2m-subject" style={{ marginBottom: '8px', paddingBottom: '4px' }}>
                {meetingTitle}
              </div>
              <div className="c2m-recipients">
                <strong>참석자: </strong>
                {attendees.map((a, i) => (
                  <span key={i} className="c2m-recipient-tag">{a}</span>
                ))}
              </div>

              <div className="c2m-raw-data-wrapper">
                <div className="c2m-raw-data-header">
                  <span className="c2m-raw-data-title">대화 원문 데이터</span>
                  <button 
                    className={`c2m-copy-btn ${copied ? 'c2m-copied' : ''}`}
                    onClick={handleCopy}
                  >
                    {copied ? '✓ 복사되었습니다!' : '📋 클립보드 복사'}
                  </button>
                </div>
                <div className="c2m-raw-text">
                  {transcript}
                </div>
              </div>
            </div>
          )}

          {state === 'LOADING' && (
            <div className="c2m-loading" role="status" aria-live="polite">
              <div className="c2m-spinner" aria-label="로딩 중" />
              <p>AI가 회의록을 요약하고 있습니다...</p>
              {progress && (
                <div className="c2m-progress">
                  <p>
                    {progress.current}/{progress.total} 구간 처리 중
                  </p>
                  <div
                    className="c2m-progress-bar"
                    role="progressbar"
                    aria-valuenow={progress.current}
                    aria-valuemin={0}
                    aria-valuemax={progress.total}
                    aria-label={`${progress.current}/${progress.total} 구간 처리 중`}
                  >
                    <div
                      className="c2m-progress-fill"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {state === 'EXTRACT_FAILED' && (
            <div className="c2m-manual-input">
              <p>
                Transcript를 자동으로 추출하지 못했습니다. ClovaNote UI가 변경되었을 수 있습니다.
                <br />
                아래에 회의 원문을 직접 붙여넣어 주세요:
              </p>
              <textarea
                ref={textareaRef}
                className="c2m-textarea"
                placeholder="회의 원문 텍스트를 여기에 붙여넣으세요..."
                aria-label="회의 원문 텍스트"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
              />
            </div>
          )}

          {state === 'PREVIEW' && (
            <>
              <div className="c2m-recipients">
                <strong>To: </strong>
                {recipients.map((r) => (
                  <span key={r.id} className="c2m-recipient-tag">
                    {r.name || r.email}
                  </span>
                ))}
                {recipients.length === 0 && <span style={{ color: '#dc2626' }}>수신자 없음</span>}
              </div>

              {isEditing ? (
                <input
                  className="c2m-subject-input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="메일 제목"
                  aria-label="메일 제목"
                />
              ) : (
                <div className="c2m-subject">{subject}</div>
              )}

              <div
                className={`c2m-preview ${isEditing ? 'c2m-editable' : ''}`}
                contentEditable={isEditing}
                suppressContentEditableWarning={isEditing}
                role={isEditing ? 'textbox' : undefined}
                aria-multiline={isEditing ? true : undefined}
                aria-label={isEditing ? '이메일 본문 편집' : undefined}
                onBlur={(e) => {
                  if (isEditing) {
                    setHtmlBody(sanitizeHtml(e.currentTarget.innerHTML));
                  }
                }}
                dangerouslySetInnerHTML={{ __html: htmlBody }}
              />
            </>
          )}

          {state === 'SENDING' && (
            <div className="c2m-loading" role="status" aria-live="polite">
              <div className="c2m-spinner" aria-label="발송 중" />
              <p>이메일을 발송하고 있습니다...</p>
            </div>
          )}

          {state === 'SENT' && (
            <div className="c2m-loading" style={{ color: '#059669' }}>
              <p style={{ fontSize: '24px' }}>✓</p>
              <p>이메일이 성공적으로 발송되었습니다!</p>
            </div>
          )}

          {state === 'ERROR' && (
            <div className="c2m-error" role="alert">
              <p style={{ fontSize: '20px' }}>⚠</p>
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className="c2m-footer">
          {state === 'RAW_DATA_PREVIEW' && (
            <>
              <button className="c2m-btn c2m-btn-secondary" onClick={onClose}>
                취소
              </button>
              <button
                className="c2m-btn c2m-btn-primary"
                onClick={() => {
                  if (transcript) requestSummary(transcript);
                }}
              >
                템플릿에 요약
              </button>
            </>
          )}

          {state === 'EXTRACT_FAILED' && (
            <>
              <button className="c2m-btn c2m-btn-secondary" onClick={onClose}>
                취소
              </button>
              <button
                className="c2m-btn c2m-btn-primary"
                onClick={handleManualSubmit}
                disabled={manualText.trim().length < 50}
              >
                요약 생성
              </button>
            </>
          )}

          {state === 'PREVIEW' && (
            <>
              <button className="c2m-btn c2m-btn-secondary" onClick={onClose}>
                취소
              </button>
              {isEditing ? (
                <button
                  className="c2m-btn c2m-btn-primary"
                  onClick={() => setIsEditing(false)}
                >
                  확인
                </button>
              ) : (
                <>
                  <button
                    className="c2m-btn c2m-btn-secondary"
                    onClick={() => setIsEditing(true)}
                  >
                    수정
                  </button>
                  {showSendConfirm ? (
                    <>
                      <span className="c2m-confirm-text">발송하시겠습니까?</span>
                      <button
                        className="c2m-btn c2m-btn-primary"
                        onClick={() => { setShowSendConfirm(false); handleSend(); }}
                      >
                        확인
                      </button>
                      <button
                        className="c2m-btn c2m-btn-secondary"
                        onClick={() => setShowSendConfirm(false)}
                      >
                        아니오
                      </button>
                    </>
                  ) : (
                    <button className="c2m-btn c2m-btn-primary" onClick={() => setShowSendConfirm(true)}>
                      이메일 발송
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {state === 'ERROR' && (
            <>
              <button className="c2m-btn c2m-btn-secondary" onClick={onClose}>
                닫기
              </button>
              <button
                className="c2m-btn c2m-btn-primary"
                onClick={() => {
                  if (transcript) {
                    requestSummary(transcript);
                  } else {
                    setState('EXTRACT_FAILED');
                  }
                }}
              >
                재시도
              </button>
            </>
          )}

          {(state === 'LOADING' || state === 'SENDING') && (
            <button className="c2m-btn c2m-btn-secondary" onClick={onClose}>
              취소
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
