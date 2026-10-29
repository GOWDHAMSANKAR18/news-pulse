import type { NewsItem, ProviderName, ProviderHealth } from '../../types';

export interface ProviderFetchOptions {
  query?: string;
  category?: string;
  language?: string;
  country?: string;
  limit?: number;
  mode?: 'latest' | 'backfill' | string;
  lookbackMinutes?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  bypassCache?: boolean;
}

export interface NewsProvider {
  readonly name: ProviderName;
  readonly isConfigured: boolean;
  fetchNews(options?: ProviderFetchOptions): Promise<NewsItem[]>;
  getProviderStatus(): ProviderHealth;
  updateMetrics?(metrics: Partial<ProviderHealth>): void;
}

export interface FormattedError {
  message: string;
  isTimeout: boolean;
  isAborted: boolean;
  isNetworkError: boolean;
}

export function formatProviderError(
  providerName: ProviderName,
  err: unknown,
  timedOut = false
): FormattedError {
  if (timedOut) {
    return {
      message: `${providerName} connection timed out without response`,
      isTimeout: true,
      isAborted: true,
      isNetworkError: false,
    };
  }

  if (err instanceof Error) {
    const lowerMsg = err.message.toLowerCase();
    const isAbort = err.name === 'AbortError' || lowerMsg.includes('aborted');

    if (isAbort) {
      if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
        return {
          message: `${providerName} connection timed out without response`,
          isTimeout: true,
          isAborted: true,
          isNetworkError: false,
        };
      }
      return {
        message: `${providerName} request cancelled (client refresh or component unmount)`,
        isTimeout: false,
        isAborted: true,
        isNetworkError: false,
      };
    }

    if (err.name === 'TypeError' && (lowerMsg.includes('fetch') || lowerMsg.includes('network'))) {
      return {
        message: `Network failure connecting to ${providerName} endpoint`,
        isTimeout: false,
        isAborted: false,
        isNetworkError: true,
      };
    }

    return {
      message: `${providerName} error: ${err.message}`,
      isTimeout: false,
      isAborted: false,
      isNetworkError: false,
    };
  }

  return {
    message: `${providerName} encountered unexpected error: ${String(err)}`,
    isTimeout: false,
    isAborted: false,
    isNetworkError: false,
  };
}
