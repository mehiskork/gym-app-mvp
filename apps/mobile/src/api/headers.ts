import { deviceCredentialStore } from '../auth/deviceCredentialStore';

type HeaderMap = Record<string, string>;

function hasHeader(headers: HeaderMap, headerName: string): boolean {
  const target = headerName.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}


export async function buildHeaders(extra: HeaderMap = {}): Promise<HeaderMap> {
  const headers: HeaderMap = { ...extra };
  const deviceToken = await deviceCredentialStore.getDeviceToken();

  if (deviceToken && !hasHeader(headers, 'authorization')) {
    headers.Authorization = `Bearer ${deviceToken}`;
  }

  return headers;
}
