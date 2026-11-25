import { apiFetch, safeJson } from '@/lib/api';
import { CompileToHexError, extractCompileFeedback } from './compileFeedback';

interface CompileHexResponse {
  success?: boolean;
  hex?: string;
  log?: string;
  error?: string;
}

export async function compileToHex(cppCode: string, board = 'Arduino Uno'): Promise<string> {
  if (!cppCode || !cppCode.trim()) {
    throw new Error('Cannot compile empty code.');
  }

  const response = await apiFetch('/api/compile/arduino', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sourceCode: cppCode,
      board,
    }),
  });

  const data = await safeJson<CompileHexResponse>(response);

  if (!response.ok || !data?.success) {
    // Compiler output when there is some; otherwise the service's own error (e.g. it could not start).
    const fallback = data?.log ? 'Compilation failed.' : data?.error || `Compilation failed (${response.status}).`;
    throw new CompileToHexError(extractCompileFeedback(data?.log || data?.error, fallback));
  }

  if (typeof data.hex === 'string' && data.hex.trim().length > 0) {
    return data.hex;
  }

  throw new Error('Compiler response did not include a HEX payload.');
}
