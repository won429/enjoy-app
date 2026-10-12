(function (root) {
    'use strict';
    const COLORS = ['red', 'yellow', 'green', 'blue'];
    const RESET_LIMIT = 2;
    const isWild = card => ['wild', 'wild4', 'wild9'].includes(card?.value);
    const cardPoints = card => isWild(card) ? 50 : /^\d$/.test(card.value) ? Number(card.value) : 20;
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
        COLORS.forEach(color => ['reset', 'paint'].forEach(value => add(color, value)));
        for (let copy = 0; copy < 4; copy++) add('wild', 'wild9');
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
        if (card.value === 'reset' && (state.resetCount || 0) >= RESET_LIMIT) return false;
        if (state.drawnCardId && state.drawnCardId !== card.id) return false;
        const top = state.discard[state.discard.length - 1];
        return card.color === 'wild' || card.color === state.color || card.value === top.value;
    }
    function finish(state, uid) {
        if (state.hands[uid].length) return;
        state.winnerUid = uid;
        state.roundPoints = Object.entries(state.hands).reduce((total, [player, cards]) => total + (player === uid ? 0 : cards.reduce((sum, card) =>
            sum + cardPoints(card), 0)), 0);
        state.unoPendingUid = null;
        state.provisionalWinnerUid = null;
    }
    function orderStart(players, round = 1, random = Math.random) {
        if (players.length < 2 || players.length > 10 || new Set(players).size !== players.length) fail('우노는 2~10명이 함께할 수 있어요.');
        const numbers = shuffle(Array.from({ length: 10 }, (_, i) => i), random).slice(0, players.length);
        return { phase: 'order', round, players: players.slice(), hands: Object.fromEntries(players.map(uid => [uid, []])),
            deck: [], discard: [], turnUid: players[0], winnerUid: null, orderComplete: false,
            orderCards: numbers.map((number, i) => ({ id: 'order-' + i, color: COLORS[i % 4], value: String(number), uid: null })) };
    }
    function orderPick(input, uid, cardId) {
        if (input.phase !== 'order' || input.orderComplete || !input.players.includes(uid)) fail('지금은 순서 카드를 고를 수 없어요.');
        if (input.orderCards.some(card => card.uid === uid)) fail('이미 순서 카드를 골랐어요.');
        const card = input.orderCards.find(card => card.id === cardId);
        if (!card || card.uid) fail('다른 사람이 고른 카드예요. 남은 카드를 골라주세요.');
        const state = JSON.parse(JSON.stringify(input));
        state.orderCards.find(card => card.id === cardId).uid = uid;
        state.orderComplete = state.orderCards.every(card => card.uid);
        if (state.orderComplete) state.players = state.orderCards.slice().sort((a, b) => Number(b.value) - Number(a.value)).map(card => card.uid);
        state.turnUid = state.orderComplete ? state.players[0] : state.players.find(player => !state.orderCards.some(card => card.uid === player));
        state.message = { type: 'order-pick', uid, cardId };
        return state;
    }
    function orderDeal(input, random = Math.random) {
        if (input.phase !== 'order' || !input.orderComplete) fail('모두 순서 카드를 골라주세요.');
        return { ...start(input.players, input.round, random, true), orderCards: input.orderCards };
    }
    function start(players, round = 1, random = Math.random, ordered = false) {
        if (players.length < 2 || players.length > 10 || new Set(players).size !== players.length) fail('우노는 2~10명이 함께할 수 있어요.');
        const state = { players: players.slice(), hands: {}, deck: shuffle(deck(), random), discard: [], direction: 1,
            color: null, turnUid: null, drawnCardId: null, unoPendingUid: null, challenge: null,
            openingColorUid: null, provisionalWinnerUid: null, winnerUid: null, roundPoints: 0, resetCount: 0 };
        players.forEach(uid => { state.hands[uid] = []; });
        for (let i = 0; i < 7; i++) players.forEach(uid => take(state, uid, 1, random));
        // The host deals the first round; subsequent rounds rotate the dealer.
        const dealer = players[(round - 1) % players.length];
        state.turnUid = ordered ? players[0] : nextUid(state, dealer);
        let top = state.deck.pop();
        // A numbered opener preserves the chosen first player and descending order.
        while (['wild4', 'wild9', 'reset', 'paint'].includes(top.value) || ordered && !/^\d$/.test(top.value)) {
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
    function reset(state, random) {
        state.resetCount = (state.resetCount || 0) + 1;
        // After the second reset, retire every reset card before redealing.
        // Preserve the identities and painted colors of all remaining cards.
        const cards = [...state.deck, ...state.discard, ...Object.values(state.hands).flat()];
        state.deck = shuffle(cards.filter(card => state.resetCount < RESET_LIMIT || card.value !== 'reset'), random);
        state.hands = Object.fromEntries(state.players.map(player => [player, []]));
        state.discard = [];
        state.direction = 1;
        state.turnUid = state.players[0];
        state.drawnCardId = state.unoPendingUid = state.challenge = state.openingColorUid = state.provisionalWinnerUid = state.winnerUid = null;
        state.roundPoints = 0;
        for (let i = 0; i < 7; i++) state.players.forEach(player => take(state, player, 1, random));
        // Select a numbered opener without repeatedly shuffling action cards.
        const index = state.deck.findLastIndex(card => /^\d$/.test(card.value));
        if (index < 0) fail('다시 시작할 숫자 카드가 없어요.');
        const [top] = state.deck.splice(index, 1);
        state.discard.push(top);
        state.color = top.color;
    }
    function move(input, uid, action, random = Math.random) {
        if (input.phase === 'order') {
            if (action.type !== 'order-pick') fail('먼저 순서 카드를 골라주세요.');
            return orderPick(input, uid, action.cardId);
        }
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
        if (card?.value === 'reset' && (state.resetCount || 0) >= RESET_LIMIT) fail('리셋은 게임당 2회까지만 사용할 수 있어요.');
        if (!canPlay(state, uid, card)) fail('같은 색, 숫자 또는 기호의 카드를 내주세요.');
        if (isWild(card) && !COLORS.includes(action.color)) fail('다음 색을 골라주세요.');
        const illegal = card.value === 'wild4' && hand.some(item => item.id !== card.id && item.color === state.color);
        hand.splice(index, 1);
        state.discard.push(card);
        state.color = isWild(card) ? action.color : card.color;
        state.drawnCardId = null;
        state.unoPendingUid = hand.length === 1 && !action.uno ? uid : null;
        if (card.value === 'reset') {
            reset(state, random);
            state.message = { type: 'play', uid, value: card.value, color: card.color, uno: false };
            return state;
        }
        let steps = 1;
        if (card.value === 'reverse') { state.direction *= -1; if (state.players.length === 2) steps = 2; }
        if (card.value === 'skip') steps = 2;
        const target = nextUid(state, uid);
        if (card.value === 'draw2') { take(state, target, 2, random); steps = 2; }
        if (card.value === 'wild9') { take(state, target, 9, random); steps = 2; }
        if (card.value === 'paint') state.hands[target].forEach(item => {
            const choices = COLORS.filter(color => color !== item.color);
            item.color = choices[Math.floor(random() * choices.length)];
        });
        state.turnUid = nextUid(state, uid, steps);
        if (card.value === 'wild4') {
            state.challenge = { actorUid: uid, targetUid: target, illegal };
            if (!hand.length) state.provisionalWinnerUid = uid;
        } else finish(state, uid);
        state.message = { type: 'play', uid, value: card.value, color: state.color, uno: hand.length === 1 && !!action.uno,
            ...(['paint', 'wild9'].includes(card.value) ? { target } : {}) };
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
            notice: ['playing', 'choosing'].includes(input.status) ? '멤버가 나가서 이번 판이 종료되었어요. 다시 시작할 수 있어요.' : '' };
    }
    // Bots inspect their own hand and public information only.
    function botAction(state, uid, random = Math.random) {
        if (state.phase === 'order') {
            if (state.orderComplete || !state.players.includes(uid) || state.orderCards.some(card => card.uid === uid)) return null;
            // Choose a position without inspecting the hidden numbers.
            const available = state.orderCards.filter(card => !card.uid);
            return { type: 'order-pick', cardId: available[Math.floor(random() * available.length)].id };
        }
        if (state.winnerUid || state.turnUid !== uid) return null;
        const hand = state.hands[uid] || [];
        const counts = Object.fromEntries(COLORS.map(color => [color, hand.filter(card => card.color === color).length]));
        const color = COLORS.reduce((best, candidate) => counts[candidate] > counts[best] ? candidate : best, COLORS[0]);
        if (state.openingColorUid) return { type: 'color', color };
        if (state.challenge) return { type: 'accept4' };
        if (state.unoPendingUid === uid) return { type: 'uno' };
        if (state.unoPendingUid) return { type: 'catch' };
        const nextCount = state.hands[nextUid(state, uid)]?.length || 0;
        const priority = card => (card.color === 'wild' ? -20 : counts[card.color] * 3) +
            (['skip', 'reverse', 'draw2', 'wild9', 'paint'].includes(card.value) ? (nextCount <= 2 ? 15 : 2) :
                card.value === 'reset' ? (hand.length > 7 ? 8 : -30) : Number(card.value) || 0);
        const playable = hand.filter(card => canPlay(state, uid, card) &&
            (card.value !== 'wild4' || !hand.some(item => item.id !== card.id && item.color === state.color)));
        playable.sort((left, right) => priority(right) - priority(left));
        if (playable.length) return { type: 'play', cardId: playable[0].id, color, uno: true };
        return { type: state.drawnCardId ? 'pass' : 'draw' };
    }
    const api = { COLORS, isWild, cardPoints, deck, shuffle, nextUid, canPlay, start, move, orderStart, orderPick, orderDeal, botAction, createRoom, joinRoom, leaveRoom };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.EnjoyUno = api;
})(typeof window === 'undefined' ? globalThis : window);
