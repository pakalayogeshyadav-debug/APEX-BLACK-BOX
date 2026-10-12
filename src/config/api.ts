/**
 * Centralized API & WebSocket Configuration
 * Supports environment-based configuration for Cloud deployments (Vercel, Render)
 * with graceful fallback to local development defaults.
 */

const getEnvVar = (key: string): string | undefined => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.[key]) {
      return (import.meta as any).env[key];
    }
  } catch {
    // ignore
  }
  try {
    if (typeof process !== 'undefined' && process.env?.[key]) {
      return process.env[key];
    }
  } catch {
    // ignore
  }
  return undefined;
};

// Base HTTP URL for the FastAPI backend
// In local development: http://localhost:8000
// In cloud deployment (e.g. Vercel): set VITE_API_BASE_URL to your backend (e.g. https://apex-blackbox.onrender.com)
export const API_BASE_URL = (
  getEnvVar('VITE_API_BASE_URL') ||
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : 'http://localhost:8000')
).replace(/\/+$/, '');

export const API_V1_URL = `${API_BASE_URL}/api/v1`;

/**
 * Derives the correct WebSocket URL (converts http -> ws, https -> wss)
 * or reads explicit VITE_WS_URL environment variable.
 */
export const getWsUrl = (path = '/api/v1/ws/telemetry'): string => {
  const customWsUrl = getEnvVar('VITE_WS_URL');
  if (customWsUrl) {
    const base = customWsUrl.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  const isSecure = API_BASE_URL.startsWith('https:');
  const wsProtocol = isSecure ? 'wss:' : 'ws:';
  const cleanHost = API_BASE_URL.replace(/^https?:\/\//, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${wsProtocol}//${cleanHost}${cleanPath}`;
};
