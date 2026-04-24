export function getSessionId() {
    const raw = localStorage.getItem('sessionId');
    if (!raw || raw === 'null' || raw === 'undefined') return null;
    return raw;
}

export async function validateSessionOrRedirect(options = {}) {
    const { redirectTo = '/' } = options;
    const sessionId = getSessionId();
    if (!sessionId) {
        window.location.href = redirectTo;
        return null;
    }
    try {
        const response = await fetch('/auth/me', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': sessionId
            },
            body: JSON.stringify({})
        });
        const result = await response.json().catch(() => null);
        if (response.ok && result?.success && result?.user) {
            return sessionId;
        }
    } catch (_) { }
    window.location.href = redirectTo;
    return null;
}
