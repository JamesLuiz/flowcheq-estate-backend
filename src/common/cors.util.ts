const DEFAULT_ORIGINS = [
  'https://estate.flowcheq.com',
  'https://www.estate.flowcheq.com',
  'http://localhost:8080',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
];

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/$/, '');
}

/** Collect allowed origins from env + safe defaults (deduped). */
export function getCorsOrigins(): string[] {
  const fromEnv = [process.env.CLIENT_ORIGIN, process.env.FRONTEND_URL, process.env.CORS_ORIGINS]
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => value.split(',').map((part) => normalizeOrigin(part)))
    .filter(Boolean);

  return [...new Set([...fromEnv, ...DEFAULT_ORIGINS])];
}

/** Allow exact list matches and any HTTPS origin on *.flowcheq.com. */
export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  const normalized = normalizeOrigin(origin);
  if (getCorsOrigins().includes(normalized)) {
    return true;
  }

  try {
    const { protocol, hostname } = new URL(normalized);
    if (protocol === 'https:' && (hostname === 'flowcheq.com' || hostname.endsWith('.flowcheq.com'))) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

/** Express / Nest enableCors origin callback (reflects request origin when allowed). */
export function corsOriginCallback(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (isAllowedCorsOrigin(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`CORS blocked origin: ${origin ?? '(none)'}`));
}
