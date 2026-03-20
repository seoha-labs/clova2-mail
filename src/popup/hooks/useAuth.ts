import { useState, useEffect, useCallback } from 'react';
import type { GetGmailStatusResponse, ConnectGmailResponse } from '../../shared/messages';

interface GmailState {
  readonly connected: boolean;
  readonly email?: string;
  readonly loading: boolean;
}

export function useGmailAuth(): {
  state: GmailState;
  connect: () => void;
  disconnect: () => void;
} {
  const [state, setState] = useState<GmailState>({
    connected: false,
    loading: true,
  });

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: 'GET_GMAIL_STATUS' },
      (response: GetGmailStatusResponse) => {
        setState({
          connected: response?.payload?.connected ?? false,
          email: response?.payload?.email,
          loading: false,
        });
      },
    );
  }, []);

  const connect = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true }));
    chrome.runtime.sendMessage(
      { type: 'CONNECT_GMAIL' },
      (response: ConnectGmailResponse) => {
        if (response?.payload?.success) {
          setState({
            connected: true,
            email: response.payload.email,
            loading: false,
          });
        } else {
          setState((prev) => ({ ...prev, loading: false }));
        }
      },
    );
  }, []);

  const disconnect = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'DISCONNECT_GMAIL' }, () => {
      setState({ connected: false, loading: false });
    });
  }, []);

  return { state, connect, disconnect };
}
