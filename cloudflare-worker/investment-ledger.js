import { WorkerEntrypoint } from 'cloudflare:workers';
import { createDatabase } from './prediction-firestore.js';
import { verifyToken } from './tekken-auth.js';
import { readAccount, readRanking, executeOrder, ACCOUNTS } from './investment-trades.js';
import { previewWelcomeGrant, grantWelcomeTokens } from './investment-grants.js';
const fail = (message, status, code) => { throw Object.assign(new Error(message), { status, code }); };

// Only a Cloudflare Service binding can call these methods; no public HTTP route
// exposes the Firebase service account already installed on the settlement Worker.
export class InvestmentLedger extends WorkerEntrypoint {
  async ready(probe = false) {
    if (!this.env.FIREBASE_SERVICE_ACCOUNT) return false;
    if (probe) await createDatabase(this.env).get(ACCOUNTS + '/readiness-probe');
    return true;
  }
  async request(token, operation, input, quote) {
    try {
      const claims = await verifyToken(token, this.env);
      if (!claims) fail('로그인을 다시 확인해 주세요.', 401, 'login-required');
      const db = createDatabase(this.env);
      let data;
      if (operation === 'account') data = await readAccount(db, claims.sub, quote);
      else if (operation === 'ranking') data = await readRanking(db, claims.sub, quote);
      else if (operation === 'order') data = await executeOrder(db, claims.sub, input, quote);
      else if (operation === 'grant-preview') data = await previewWelcomeGrant(db, claims, quote);
      else if (operation === 'grant') data = await grantWelcomeTokens(db, claims, input, quote);
      else fail('요청을 찾을 수 없어요.', 404);
      return { ok: true, data };
    } catch (error) {
      console.error('Investment ledger:', error.status ? error.code : 'storage-unavailable');
      return { ok: false, error: error.status ? error.message : '투자 기록 서버에 연결하지 못했어요. 같은 주문으로 다시 확인해 주세요.',
        status: error.status || 503, code: error.status ? error.code : 'storage-unavailable' };
    }
  }
}
