(function (root) {
    'use strict';
    const COLORS = ['red', 'yellow', 'green', 'blue'];
    function fail(message) { throw new Error(message); }
    function shuffle(cards, random = Math.random) {
        const result = cards.slice();
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
    function deck() {
        const cards = [];
        const add = (color, value) => cards.push({ id: 'c' + cards.length, color, value });
        COLORS.forEach(color => {
            add(color, '0');
            for (let copy = 0; copy < 2; copy++) {
                for (let number = 1; number <= 9; number++) add(color, String(number));
                ['skip', 'reverse', 'draw2'].forEach(value => add(color, value));
            }
        });
        for (let copy = 0; copy < 4; copy++) ['wild', 'wild4'].forEach(value => add('wild', value));
        return cards;
    }
    const nextUid = (state, uid, steps = 1) => {
        const count = state.players.length;
        const index = state.players.indexOf(uid);
        return state.players[((index + state.direction * steps) % count + count) % count];
    };
    function take(state, uid, count, random) {
        const received = [];
        for (let i = 0; i < count; i++) {
            if (!state.deck.length && state.discard.length > 1) {
                const top = state.discard.pop();
                state.deck = shuffle(state.discard, random);
                state.discard = [top];
            }
            if (!state.deck.length) break;
            const card = state.deck.pop();
            state.hands[uid].push(card);
            received.push(card);
        }
        return received;
    }
    function canPlay(state, uid, card) {
        if (!card || state.turnUid !== uid || state.challenge || state.openingColorUid || state.winnerUid) return false;
        if (state.drawnCardId && state.drawnCardId !== card.id) return false;
        const top = state.discard[state.discard.length - 1];
        return card.color === 'wild' || card.color === state.color || card.value === top.value;
    }
    function finish(state, uid) {
        if (state.hands[uid].length) return;
        state.winnerUid = uid;
        state.roundPoints = Object.entries(state.hands).reduce((total, [player, cards]) => total + (player === uid ? 0 : cards.reduce((sum, card) =>
            sum + (card.color === 'wild' ? 50 : /^\d$/.test(card.value) ? Number(card.value) : 20), 0)), 0);
        state.unoPendingUid = null;
        state.provisionalWinnerUid = null;
    }
    function start(players, round = 1, random = Math.random) {
        if (players.length < 2 || players.length > 10 || new Set(players).size !== players.length) fail('우노는 2~10명이 함께할 수 있어요.');
        const state = { players: players.slice(), hands: {}, deck: shuffle(deck(), random), discard: [], direction: 1,
            color: null, turnUid: null, drawnCardId: null, unoPendingUid: null, challenge: null,
            openingColorUid: null, provisionalWinnerUid: null, winnerUid: null, roundPoints: 0 };
        players.forEach(uid => { state.hands[uid] = []; });
        for (let i = 0; i < 7; i++) players.forEach(uid => take(state, uid, 1, random));
        // The host deals the first round; subsequent rounds rotate the dealer.
        const dealer = players[(round - 1) % players.length];
        state.turnUid = nextUid(state, dealer);
        let top = state.deck.pop();
        while (top.value === 'wild4') {
            state.deck = shuffle([...state.deck, top], random);
            top = state.deck.pop();
        }
        state.discard.push(top);
        state.color = top.color;
        if (top.value === 'wild') state.openingColorUid = state.turnUid;
        if (top.value === 'skip') state.turnUid = nextUid(state, state.turnUid);
        if (top.value === 'reverse') { state.direction = -1; state.turnUid = dealer; }
        if (top.value === 'draw2') {
            take(state, state.turnUid, 2, random);
            state.turnUid = nextUid(state, state.turnUid);
        }
        return state;
    }
    function move(input, uid, action, random = Math.random) {
        const state = JSON.parse(JSON.stringify(input));
        if (!state.players.includes(uid)) fail('이 방에 참가한 멤버만 게임을 진행할 수 있어요.');
        if (state.winnerUid) fail('이번 판이 끝났어요.');
        const hand = state.hands[uid];
        if (action.type === 'uno') {
            if (state.unoPendingUid !== uid || hand.length !== 1) fail('카드가 한 장 남았을 때 우노를 외쳐주세요.');
            state.unoPendingUid = null;
            state.message = { type: 'uno', uid };
            return state;
        }
        if (action.type === 'catch') {
            const target = state.unoPendingUid;
            if (!target || target === uid || state.hands[target].length !== 1) fail('지금 지적할 수 있는 멤버가 없어요.');
            take(state, target, 2, random);
            state.unoPendingUid = null;
            state.message = { type: 'catch', uid, target };
            return state;
        }
        if (state.turnUid !== uid) fail('지금은 친구의 차례예요.');
        if (state.openingColorUid) {
            if (action.type !== 'color' || !COLORS.includes(action.color)) fail('시작할 색을 골라주세요.');
            state.color = action.color;
            state.openingColorUid = null;
            state.message = { type: 'color', uid, color: action.color };
            return state;
        }
        if (state.challenge) {
            if (!['accept4', 'challenge4'].includes(action.type)) fail('+4를 받거나 도전해주세요.');
            const pending = state.challenge;
            const succeeded = action.type === 'challenge4' && pending.illegal;
            const count = succeeded ? 4 : action.type === 'challenge4' ? 6 : 4;
            take(state, succeeded ? pending.actorUid : uid, count, random);
            state.challenge = null;
            state.drawnCardId = null;
            state.unoPendingUid = null;
            if (succeeded) state.provisionalWinnerUid = null;
            else {
                state.turnUid = nextUid(state, uid);
                if (state.provisionalWinnerUid) finish(state, state.provisionalWinnerUid);
            }
            state.message = { type: action.type, uid, target: pending.actorUid, succeeded, count };
            return state;
        }
        if (action.type === 'draw') {
            if (state.drawnCardId) fail('이미 카드를 뽑았어요. 뽑은 카드를 내거나 차례를 넘겨주세요.');
            state.unoPendingUid = null;
            const received = take(state, uid, 1, random);
            const card = received[0];
            if (card && canPlay(state, uid, card)) state.drawnCardId = card.id;
            else state.turnUid = nextUid(state, uid);
            state.message = { type: 'draw', uid };
            return state;
        }
        if (action.type === 'pass') {
            if (!state.drawnCardId) fail('카드를 한 장 뽑은 후 차례를 넘길 수 있어요.');
            state.drawnCardId = null;
            state.unoPendingUid = null;
            state.turnUid = nextUid(state, uid);
            state.message = { type: 'pass', uid };
            return state;
        }
        if (action.type !== 'play') fail('게임 동작을 확인해주세요.');
        const index = hand.findIndex(card => card.id === action.cardId);
        const card = hand[index];
        if (!canPlay(state, uid, card)) fail('같은 색, 숫자 또는 기호의 카드를 내주세요.');
        if (card.color === 'wild' && !COLORS.includes(action.color)) fail('다음 색을 골라주세요.');
        const illegal = card.value === 'wild4' && hand.some(item => item.color === state.color);
        hand.splice(index, 1);
        state.discard.push(card);
        state.color = card.color === 'wild' ? action.color : card.color;
        state.drawnCardId = null;
        state.unoPendingUid = hand.length === 1 && !action.uno ? uid : null;
        let steps = 1;
        if (card.value === 'reverse') { state.direction *= -1; if (state.players.length === 2) steps = 2; }
        if (card.value === 'skip') steps = 2;
        const target = nextUid(state, uid);
        if (card.value === 'draw2') { take(state, target, 2, random); steps = 2; }
        state.turnUid = nextUid(state, uid, steps);
        if (card.value === 'wild4') {
            state.challenge = { actorUid: uid, targetUid: target, illegal };
            if (!hand.length) state.provisionalWinnerUid = uid;
        } else finish(state, uid);
        state.message = { type: 'play', uid, value: card.value, color: state.color, uno: hand.length === 1 && !!action.uno };
        return state;
    }
    function createRoom(player, now) {
        return { version: 1, game: 'uno', hostUid: player.uid, players: [player], playerIds: [player.uid],
            status: 'waiting', round: 0, revision: 0, createdAt: now, updatedAt: now };
    }
    function joinRoom(input, player, now) {
        if (input.playerIds.includes(player.uid)) return input;
        if (input.status !== 'waiting') fail('이미 시작하거나 종료된 방이에요.');
        if (input.players.length >= 10) fail('방이 가득 찼어요. 최대 10명까지 참가할 수 있어요.');
        return { ...input, players: [...input.players, player], playerIds: [...input.playerIds, player.uid], updatedAt: now, revision: input.revision + 1 };
    }
    function leaveRoom(input, uid, now) {
        if (!input.playerIds.includes(uid)) return input;
        const players = input.players.filter(player => player.uid !== uid);
        return { ...input, players, playerIds: players.map(player => player.uid), hostUid: input.hostUid === uid ? (players[0]?.uid || '') : input.hostUid,
            status: players.length ? 'waiting' : 'closed', updatedAt: now, revision: input.revision + 1,
            notice: input.status === 'playing' ? '멤버가 나가서 이번 판이 종료되었어요. 다시 시작할 수 있어요.' : '' };
    }
    const api = { COLORS, deck, shuffle, nextUid, canPlay, start, move, createRoom, joinRoom, leaveRoom };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.EnjoyUno = api;
})(typeof window === 'undefined' ? globalThis : window);
