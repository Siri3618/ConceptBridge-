const configuredApiOrigin = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

export const apiUrl = (path: string) => `${configuredApiOrigin}/api${path}`;

export const api = async (path: string, init: RequestInit = {}) => fetch(apiUrl(path), {
  ...init,
  credentials: 'include',
  headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
});

export async function readApiJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}
