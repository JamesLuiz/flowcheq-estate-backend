/** Allowed browser origins for REST + Socket.IO (reads env at process start). */
export function getCorsOrigins(): string[] {
  const fromEnv = [process.env.CLIENT_ORIGIN, process.env.FRONTEND_URL]
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => value.split(',').map((part) => part.trim()))
    .filter(Boolean);

  const defaults = [
    'https://estate.flowcheq.com',
    'http://localhost:8080',
    'http://localhost:5173',
  ];

  return [...new Set([...fromEnv, ...defaults])];
}
