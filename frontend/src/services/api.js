import { Capacitor } from '@capacitor/core';

function getBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim()) {
    const cleaned = envUrl.trim().replace(/\/+$/, '');
    return cleaned.endsWith('/api') ? cleaned : `${cleaned}/api`;
  }
  // When running inside native Android / iOS Capacitor app, always target the live production cloud backend
  if (Capacitor.isNativePlatform()) {
    return 'https://family-tracker-fidw.onrender.com/api';
  }
  if (import.meta.env.PROD && typeof window !== 'undefined' && (window.location.hostname.includes('vercel.app') || !window.location.hostname.includes('localhost'))) {
    return 'https://family-tracker-fidw.onrender.com/api';
  }
  return '/api';
}

const BASE_URL = getBaseUrl();

function getToken() {
  return localStorage.getItem('ft_token');
}

async function request(method, path, body = null, timeoutMs = 15000) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const config = {
    method,
    headers,
    signal: controller.signal
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, config);
  } catch (netErr) {
    if (netErr.name === 'AbortError') {
      throw new Error('Request timed out. Please check your internet connection.');
    }
    throw new Error('Network error. Unable to reach the server.');
  } finally {
    clearTimeout(timeoutId);
  }

  // Handle unauthorized expired token (excluding auth endpoints so login errors display properly)
  if (response.status === 401) {
    const isAuthRoute = path.startsWith('/auth/login') || path.startsWith('/auth/register');
    if (!isAuthRoute) {
      localStorage.removeItem('ft_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      throw new Error('Session expired. Please log in again.');
    }
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || err.message || 'Request failed');
  }

  if (response.status === 204) return null;
  return response.json();
}

const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
};

export default api;
