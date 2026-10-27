const KEY_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let cachedKeys = [], expiresAt = 0;
const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));

// Only Google-signed Firebase ID tokens from the existing member project are accepted.
export async function verifyInvestmentAdmin(token, env) {
  try {
    if (!env.FIREBASE_PROJECT_ID || typeof token !== 'string' || token.length > 6000) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
        claims.aud !== env.FIREBASE_PROJECT_ID || claims.iss !== 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID ||
        typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
        !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now ||
        !Number.isFinite(claims.auth_time) || claims.auth_time > now ||
        claims.firebase?.sign_in_provider !== 'google.com') return null;
    if (Date.now() >= expiresAt) {
      const response = await fetch(KEY_URL);
      if (!response.ok) return null;
      const data = await response.json();
      if (!Array.isArray(data.keys)) return null;
      cachedKeys = data.keys;
      expiresAt = Date.now() + Math.min(3600, Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1] || 300)) * 1000;
    }
    const jwk = cachedKeys.find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))) return null;
    return { uid: claims.sub, email: typeof claims.email === 'string' ? claims.email.toLowerCase() : '' };
  } catch (_) { return null; }
}
