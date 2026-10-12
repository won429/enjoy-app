function authFail(message,code){throw Object.assign(new Error(message),{code});}
let signingKeys = null, keysUntil = 0;
const encoder = new TextEncoder();
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function allowedOrigin(origin, env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).includes(origin) || /^https:\/\/[a-f0-9]+\.enjoy-app\.pages\.dev$/.test(origin);
}
function decode(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
export async function verifyToken(token, env) {
  try {
    if (typeof token !== 'string' || token.length > 6000) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || !header.kid || claims.aud !== env.FIREBASE_PROJECT_ID ||
        claims.iss !== 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID ||
        typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
        !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
        !Number.isFinite(claims.auth_time) || claims.auth_time > now + 60 || claims.firebase?.sign_in_provider === 'anonymous') return null;
    if (!signingKeys || Date.now() >= keysUntil) {
      const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
      if (!response.ok) return null;
      signingKeys = (await response.json()).keys;
      keysUntil = Date.now() + Math.min(Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1] || 300), 3600) * 1000;
    }
    const jwk = signingKeys.find(key => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), encoder.encode(parts[0] + '.' + parts[1]))) return null;
    return claims;
  } catch (_) { return null; }
}
export async function member(token, claims, env) {
  // One profile read at connection time; game actions never call Firestore.
  const url = 'https://firestore.googleapis.com/v1/projects/' + env.FIREBASE_PROJECT_ID + '/databases/(default)/documents/members/' + encodeURIComponent(claims.sub);
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!response.ok) authFail('멤버 프로필 등록 후 게임에 참가해주세요.', 'not-member');
  const data = await response.json();
  const name = data.fields?.name?.stringValue?.trim();
  if (!name) authFail('멤버 프로필 등록 후 게임에 참가해주세요.', 'not-member');
  let photoURL='';try{const photo=new URL(data.fields?.photoURL?.stringValue||claims.picture||'');if(photo.protocol==='https:'&&!photo.username&&!photo.password&&photo.href.length<=2048)photoURL=photo.href;}catch(_){}
  return { uid: claims.sub, name: name.slice(0, 40), photoURL };
}
