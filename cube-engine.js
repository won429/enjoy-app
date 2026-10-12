(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.DropCube = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COLORS = ['red', 'blue', 'orange', 'black'];
  const HINT_LIMIT = 2;
  const fail = message => { throw new Error(message); };
  const copy = value => JSON.parse(JSON.stringify(value));
  function deck() {
    const tiles = [];
    for (let k = 0; k < 2; k++) for (const color of COLORS) for (let n = 1; n <= 13; n++) tiles.push({ id: `${color}-${n}-${k}`, color, n });
    for (let k = 0; k < 2; k++) tiles.push({ id: `joker-${k}`, color: 'joker', n: 0 });
    return tiles;
  }
  function shuffle(items, random = Math.random) { const out = items.slice(); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }
  function meld(tiles) {
    if (!Array.isArray(tiles) || tiles.length < 3 || tiles.length > 13) return null;
    if (new Set(tiles.map(t => t.id)).size !== tiles.length) return null;
    const normal = tiles.filter(t => t.color !== 'joker');
    if (!normal.length || tiles.some(t => !COLORS.includes(t.color) && t.color !== 'joker' || t.color !== 'joker' && (!Number.isInteger(t.n) || t.n < 1 || t.n > 13))) return null;
    if (tiles.length <= 4 && normal.every(t => t.n === normal[0].n) && new Set(normal.map(t => t.color)).size === normal.length) return { kind: 'group', points: normal[0].n * tiles.length };
    if (!normal.every(t => t.color === normal[0].color)) return null;
    const offset = tiles.findIndex(t => t.color !== 'joker'), start = tiles[offset].n - offset;
    if (start < 1 || start + tiles.length - 1 > 13) return null;
    if (tiles.some((t, i) => t.color !== 'joker' && t.n !== start + i)) return null;
    return { kind: 'run', points: tiles.length * (2 * start + tiles.length - 1) / 2 };
  }
  function start(players, random = Math.random) {
    if (!Array.isArray(players) || players.length < 2 || players.length > 4 || new Set(players).size !== players.length) fail('2~4명이 필요해요.');
    const pool = shuffle(deck(), random), hands = {};
    for (const uid of players) hands[uid] = pool.splice(0, 14);
    const order = shuffle(players, random);
    return { players: order, hands, pool, table: [], opened: Object.fromEntries(players.map(p => [p, false])), hintsUsed: Object.fromEntries(players.map(p => [p, 0])), turnUid: order[0], revision: 0, winnerUid: null, blocked: false, passes: 0, turn: 1, lastMove: null };
  }
  function points(tiles) { return tiles.reduce((sum, t) => sum + (t.color === 'joker' ? 30 : t.n), 0); }
  function move(source, uid, action) {
    if (source.winnerUid || source.turnUid !== uid) fail('내 차례에만 진행할 수 있어요.');
    const state = copy(source), hand = state.hands[uid];
    if (action.type === 'hint') {
      const used=state.hintsUsed?.[uid]||0;
      if(used>=HINT_LIMIT)fail('힌트는 한 게임에 2번까지 사용할 수 있어요.');
      state.hintsUsed={...state.hintsUsed,[uid]:used+1};state.revision++;return state;
    }
    if (action.type === 'draw') {
      const tile = state.pool.shift(); if (tile) hand.push(tile);
      state.passes = tile ? 0 : state.passes + 1;
      state.lastMove = { uid, type: 'draw', count: tile ? 1 : 0 };
      if (state.passes >= state.players.length) {
        state.blocked = true;
        state.winnerUid = state.players.slice().sort((a,b) => points(state.hands[a])-points(state.hands[b]))[0];
      }
    } else if (action.type === 'commit') {
      const proposed = action.table;
      if (!Array.isArray(proposed) || proposed.length > 35 || proposed.some(row => !Array.isArray(row) || row.length < 3 || row.length > 13 || row.some(id => typeof id !== 'string'))) fail('모든 묶음을 3장 이상으로 완성해주세요.');
      const original = state.table.flat(), available = new Map([...original, ...hand].map(t => [t.id, t]));
      const ids = proposed.flat();
      if (new Set(ids).size !== ids.length || ids.some(id => !available.has(id))) fail('중복되거나 사용할 수 없는 타일이 있어요.');
      if (original.some(t => !ids.includes(t.id))) fail('테이블에 있던 타일은 모두 테이블에 남아야 해요.');
      const table = proposed.map(row => row.map(id => available.get(id))), sets = table.map(meld);
      if (sets.some(s => !s)) fail('같은 숫자의 서로 다른 색 3~4장, 또는 같은 색의 연속 숫자 3장 이상을 만들어주세요.');
      const played = hand.filter(t => ids.includes(t.id));
      if (!played.length) fail('내 받침대에서 최소 한 장을 내려놓아야 해요.');
      if (!state.opened[uid]) {
        const oldIds = new Set(original.map(t => t.id));
        const opening = [];
        for (let i = 0; i < table.length; i++) {
          if (table[i].some(t => oldIds.has(t.id))) {
            if (!state.table.some(old => old.length === table[i].length && old.every((t,j) => t.id === table[i][j].id))) fail('첫 등록은 내 타일만으로 해야 해요. 기존 묶음은 다음 차례부터 바꿀 수 있어요.');
          } else opening.push(sets[i]);
        }
        if (opening.reduce((sum,s) => sum+s.points,0) < 30) fail('첫 등록은 내 타일로 합계 30점 이상이어야 해요.');
        state.opened[uid] = true;
      }
      state.table = table; state.hands[uid] = hand.filter(t => !ids.includes(t.id)); state.passes = 0;
      state.lastMove = { uid, type: 'commit', count: played.length };
      if (!state.hands[uid].length) state.winnerUid = uid;
    } else fail('게임 동작을 확인해주세요.');
    if (!state.winnerUid) state.turnUid = state.players[(state.players.indexOf(uid) + 1) % state.players.length];
    state.turn++; state.revision++; return state;
  }
  function candidates(hand) {
    const out = [], jokers = hand.filter(t => t.color === 'joker'), seen = new Set();
    const add = row => { const key = row.map(t => t.id).join(','); if (!seen.has(key) && meld(row)) { seen.add(key); out.push(row); } };
    for (let n = 1; n <= 13; n++) {
      const types = COLORS.map(c => hand.find(t => t.n === n && t.color === c)).filter(Boolean);
      for (let mask = 1; mask < 1 << types.length; mask++) {
        const row = types.filter((_,i) => mask & 1 << i);
        for (let j = 0; j <= jokers.length; j++) if (row.length+j >= 3 && row.length+j <= 4) add([...row,...jokers.slice(0,j)]);
      }
    }
    for (const color of COLORS) for (let lo = 1; lo <= 11; lo++) for (let hi = lo+2; hi <= 13; hi++) {
      const row = []; let j = 0;
      for (let n = lo; n <= hi; n++) { const t = hand.find(t => t.color === color && t.n === n); if (t) row.push(t); else if (j < jokers.length) row.push(jokers[j++]); else break; }
      if (row.length === hi-lo+1) add(row);
    }
    return out.sort((a,b) => b.length-a.length || meld(b).points-meld(a).points);
  }
  function botAction(state, uid) {
    if (state.turnUid !== uid || state.winnerUid) return null;
    let rest = state.hands[uid].slice(), table = state.table.map(row => row.slice()), added = [];
    if (!state.opened[uid]) {
      const options = candidates(rest); let best = null, visits = 0;
      function search(at, used, rows, total) {
        if (++visits > 6000) return;
        if (total >= 30) { if (!best || used.size > best.used.size) best = { used: new Set(used), rows: rows.slice() }; return; }
        for (let i = at; i < options.length; i++) if (options[i].every(t => !used.has(t.id))) search(i+1, new Set([...used, ...options[i].map(t => t.id)]), [...rows, options[i]], total+meld(options[i]).points);
      }
      search(0,new Set(),[],0);
      if (best) added = best.rows;
    } else {
      let options = candidates(rest);
      while (options.length) { const row = options[0]; added.push(row); const ids = new Set(row.map(t=>t.id)); rest = rest.filter(t=>!ids.has(t.id)); options = candidates(rest); }
      for (const tile of rest.slice()) for (let i = 0; i < table.length; i++) {
        const back = [...table[i], tile], front = [tile, ...table[i]];
        const next = meld(back) ? back : meld(front) ? front : null;
        if (next) { table[i] = next; rest = rest.filter(t=>t.id!==tile.id); break; }
      }
    }
    const action = { type: 'commit', table: [...table,...added].map(row=>row.map(t=>t.id)) };
    try { move(state,uid,action); return action; } catch (_) { return { type: 'draw' }; }
  }
  function rankings(state) {
    if (!state.winnerUid) return [];
    const winnerPoints = points(state.hands[state.winnerUid]);
    const entries = state.players.map(uid=>({ uid, remaining: state.hands[uid].length, penalty: points(state.hands[uid]), score: uid===state.winnerUid ? 0 : state.blocked ? winnerPoints-points(state.hands[uid]) : -points(state.hands[uid]) }));
    entries.find(e=>e.uid===state.winnerUid).score = -entries.reduce((s,e)=>s+e.score,0);
    return entries.sort((a,b)=>a.uid===state.winnerUid?-1:b.uid===state.winnerUid?1:a.penalty-b.penalty);
  }
  return { COLORS, HINT_LIMIT, deck, shuffle, meld, start, move, points, candidates, botAction, rankings };
});
