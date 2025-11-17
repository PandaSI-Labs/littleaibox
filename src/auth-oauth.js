import { API_BASE_URL } from './api-config.js';

export const OAUTH_PROVIDERS = {
    google: {
        id: 'google',
        callbackPath: '/auth/google/callback'
    },
    github: {
        id: 'github',
        callbackPath: '/auth/github/callback'
    }
};

const AUTH_ENDPOINT_BASE = '/auth';

function buildAuthUrl(path) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE_URL}${normalizedPath}`;
}

async function postAuthJson(path, payload) {
    const response = await fetch(buildAuthUrl(`${AUTH_ENDPOINT_BASE}${path}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
    });

    let data = null;
    try {
        data = await response.json();
    } catch (_) {
        data = null;
    }

    if (!response.ok) {
        const message = (data && typeof data.error === 'string') ? data.error : '';
        const error = new Error(message);
        error.details = data;
        throw error;
    }
    return data || {};
}

export function isSupportedOAuthProvider(provider) {
    if (!provider) return false;
    return Boolean(OAUTH_PROVIDERS[String(provider).toLowerCase()]);
}

export function getOAuthCallbackPath(provider) {
    const config = OAUTH_PROVIDERS[String(provider || '').toLowerCase()];
    return config?.callbackPath || null;
}

export function matchOAuthCallbackPath(pathname = '') {
    if (!pathname) return null;
    const normalized = pathname.replace(/\/+$/, '');
    for (const [provider, config] of Object.entries(OAUTH_PROVIDERS)) {
        if (config.callbackPath.replace(/\/+$/, '') === normalized) {
            return provider;
        }
    }
    return null;
}

export function parseOAuthCallbackParams(search = '') {
    const params = new URLSearchParams(search || '');
    return {
        code: params.get('code') || '',
        state: params.get('state') || '',
        error: params.get('error') || '',
        errorDescription: params.get('error_description') || ''
    };
}

export async function requestOAuthRedirect(provider) {
    return postAuthJson('/oauth-url', { provider });
}

export async function completeOAuthLogin(provider, { code, state }) {
    return postAuthJson('/oauth/callback', { provider, code, state });
}
