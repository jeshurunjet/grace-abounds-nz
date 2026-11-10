/** Error returned by the API: { error: { code, message, fieldErrors?, requestId } }. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

/**
 * Calls the API through the same-origin gateway (/api/v1/*). Throws ApiError
 * with the server's message so forms can show it and keep the user's input.
 */
export async function api<T>(
  path: string,
  init: RequestInit & { version?: number } = {},
): Promise<{ data: T; version?: number }> {
  const { version, ...options } = init;
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type'))
    headers.set('content-type', 'application/json');
  if (version != null) headers.set('if-match', `"${version}"`);
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK',
      'Couldn’t reach the server. Check your connection and try again.',
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? 'Something went wrong. Please try again.',
      body?.error?.fieldErrors,
    );
  return body;
}
