// Service credentials stay in a Worker secret; no client can write prediction records.
let access = null;
const encode64 = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const utf64 = value => encode64(new TextEncoder().encode(JSON.stringify(value)));
async function token(env) {
  if (access && access.until > Date.now() && access.secret === env.FIREBASE_SERVICE_ACCOUNT) return access.token;
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw Object.assign(new Error('예측 서버의 Firebase 서비스 계정 설정이 필요해요.'), { status: 503 });
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  if (account.project_id !== env.FIREBASE_PROJECT_ID) throw new Error('Service account project mismatch');
  const now = Math.floor(Date.now() / 1000);
  const body = utf64({ alg: 'RS256', typ: 'JWT' }) + '.' + utf64({ iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const der = Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body));
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: body + '.' + encode64(signature) }) });
  if (!response.ok) throw new Error('Firebase service authentication failed');
  const data = await response.json();
  access = { token: data.access_token, until: Date.now() + (data.expires_in - 120) * 1000, secret: env.FIREBASE_SERVICE_ACCOUNT };
  return access.token;
}
export function decode(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  return Object.fromEntries(Object.entries(v.mapValue?.fields || {}).map(([k, value]) => [k, decode(value)]));
}
function encode(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, value]) => [k, encode(value)])) } };
}
function unpack(doc) { return doc ? { name: doc.name, updateTime: doc.updateTime, data: decode({ mapValue: { fields: doc.fields || {} } }) } : null; }
export function createDatabase(env) {
  const base = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  async function request(path, body) {
    const response = await fetch('https://firestore.googleapis.com/v1/' + base + path, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + await token(env), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status === 404 && !body) return null;
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw Object.assign(new Error('Firestore request failed'), { code: response.status, reason: detail.error?.status });
    }
    return response.json();
  }
  return {
    get: async path => unpack(await request('/' + path)),
    async query(collection, field, op, value) {
      const data = await request(':runQuery', { structuredQuery: { from: [{ collectionId: collection }],
        ...(field ? { where: { fieldFilter: { field: { fieldPath: field }, op, value: encode(value) } } } : {}) } });
      return data.filter(row => row.document).map(row => unpack(row.document));
    },
    async answers(id) {
      const data = await request('/drop_predictions/' + id + ':runQuery', { structuredQuery: { from: [{ collectionId: 'answers' }] } });
      return data.filter(row => row.document).map(row => unpack(row.document));
    },
    write(path, data, previous, fields) {
      return { update: { name: base + '/' + path, fields: encode(data).mapValue.fields },
        ...(fields ? { updateMask: { fieldPaths: fields } } : {}),
        currentDocument: previous ? { updateTime: previous.updateTime } : { exists: false } };
    },
    verify: previous => ({ verify: previous.name, currentDocument: { updateTime: previous.updateTime } }),
    commit: writes => request(':commit', { writes })
  };
}
export async function retryConflict(work) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try { return await work(); } catch (error) {
      if (!([409, 412].includes(error.code) || ['ABORTED', 'FAILED_PRECONDITION', 'ALREADY_EXISTS'].includes(error.reason)) || attempt === 5) throw error;
    }
  }
}
