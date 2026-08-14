const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('deployx_token');
}

export function setToken(token: string) {
  localStorage.setItem('deployx_token', token);
}

export function clearToken() {
  localStorage.removeItem('deployx_token');
  localStorage.removeItem('deployx_user');
}

export function getUser(): { id: string; email: string; name: string; role: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('deployx_user');
  return raw ? JSON.parse(raw) : null;
}

export function setUser(user: { id: string; email: string; name: string; role: string }) {
  localStorage.setItem('deployx_user', JSON.stringify(user));
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/api/v1${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? 'Request failed');
  }
  return res.json();
}
