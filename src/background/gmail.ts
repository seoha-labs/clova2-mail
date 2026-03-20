import { GMAIL_SEND_URL, USERINFO_URL } from '../shared/constants';

function utf8ToBase64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binString);
}

function utf8ToBase64Url(str: string): string {
  return utf8ToBase64(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function createMimeMessage(
  to: readonly string[],
  subject: string,
  htmlBody: string,
): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const plainBody = htmlToPlainText(htmlBody);
  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(subject)}?=`;

  return [
    `To: ${to.join(', ')}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    utf8ToBase64(plainBody),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    utf8ToBase64(htmlBody),
    '',
    `--${boundary}--`,
  ].join('\r\n');
}

export async function getGmailToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Auth failed'));
        return;
      }
      // @types/chrome@0.1.38+에서 result는 GetAuthTokenResult 객체
      const token = typeof result === 'string' ? result : result?.token;
      if (!token) {
        reject(new Error('No token returned'));
        return;
      }
      resolve(token);
    });
  });
}

export async function fetchGmailEmail(token: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.email as string) ?? null;
  } catch {
    return null;
  }
}

export async function checkGmailStatus(): Promise<{ connected: boolean; email?: string }> {
  try {
    const token = await getGmailToken(false);
    const email = await fetchGmailEmail(token);
    return { connected: true, email: email ?? undefined };
  } catch {
    return { connected: false };
  }
}

export async function connectGmail(): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    const token = await getGmailToken(true);
    const email = await fetchGmailEmail(token);
    return { success: true, email: email ?? undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function disconnectGmail(): Promise<void> {
  try {
    const token = await getGmailToken(false);
    chrome.identity.removeCachedAuthToken({ token });
  } catch {
    // already disconnected
  }
}

export async function sendViaGmail(
  to: readonly string[],
  subject: string,
  htmlBody: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const token = await getGmailToken(false);
    const message = createMimeMessage(to, subject, htmlBody);
    const encoded = utf8ToBase64Url(message);

    const response = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error?.message ?? `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
