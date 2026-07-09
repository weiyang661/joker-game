const RANKS = ["4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const SEQ_RANKS = RANKS.slice(0, 11);
const RANK_VALUE = Object.fromEntries(RANKS.map((rank, index) => [rank, index + 1]));
const SUITS = ["♠", "♥", "♣", "♦"];
const RED_SUITS = new Set(["♥", "♦"]);

const state = {
  players: [],
  current: 0,
  leader: 0,
  lastPlayer: null,
  currentPlay: null,
  passes: new Set(),
  selected: new Set(),
  trickPoints: 0,
  scores: { king: 0, plain: 0 },
  match: { king: 0, plain: 0 },
  playerMatch: [0, 0, 0, 0, 0],
  lastSettlement: [],
  roundSettled: false,
  openingBigRevealCount: 0,
  finishedOrder: [],
  firstFinisherNext: 0,
  gameOver: false,
  continuingForNextLead: false,
  hasPlayed: false,
  revealPhase: true,
  bigRevealDecisions: new Set(),
  publicBigIds: new Set(),
  pendingSnowChoice: null,
  snowChasingTeam: null,
  tableNotice: "",
  log: []
};

const el = {
  table: document.querySelector("#table"),
  hand: document.querySelector("#hand"),
  selectionInfo: document.querySelector("#selectionInfo"),
  statusBox: document.querySelector("#statusBox"),
  revealBox: document.querySelector("#revealBox"),
  trickPoints: document.querySelector("#trickPoints"),
  kingScore: document.querySelector("#kingScore"),
  plainScore: document.querySelector("#plainScore"),
  matchScore: document.querySelector("#matchScore"),
  tableCenter: document.querySelector("#tableCenter"),
  currentPlay: document.querySelector("#currentPlay"),
  log: document.querySelector("#log"),
  playBtn: document.querySelector("#playBtn"),
  passBtn: document.querySelector("#passBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  newGameBtn: document.querySelector("#newGameBtn"),
  nextRoundBtn: document.querySelector("#nextRoundBtn"),
  autoBtn: document.querySelector("#autoBtn"),
  hostBtn: document.querySelector("#hostBtn"),
  joinBtn: document.querySelector("#joinBtn"),
  readyBtn: document.querySelector("#readyBtn"),
  startOnlineBtn: document.querySelector("#startOnlineBtn"),
  renameBtn: document.querySelector("#renameBtn"),
  nameInput: document.querySelector("#nameInput"),
  roomInput: document.querySelector("#roomInput"),
  seatSelect: document.querySelector("#seatSelect"),
  onlineStatus: document.querySelector("#onlineStatus")
};

const online = {
  connected: false,
  isHost: false,
  socket: null,
  roomId: "",
  clientId: "",
  seat: 0,
  seatClients: {},
  clientSeats: {},
  readySeats: {},
  waitingRoom: false
};

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeDeck() {
  const cards = [];
  for (let pack = 1; pack <= 2; pack += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          id: `${pack}-${suit}-${rank}`,
          rank,
          suit,
          color: RED_SUITS.has(suit) ? "red" : "black",
          value: RANK_VALUE[rank],
          points: rank === "5" ? 5 : (rank === "10" || rank === "K" ? 10 : 0)
        });
      }
    }
    cards.push({ id: `${pack}-SJ`, rank: "小王", suit: "Joker", joker: "small", color: "joker", value: 50, points: 0 });
    cards.push({ id: `${pack}-BJ`, rank: "大王", suit: "Joker", joker: "big", color: "joker", value: 60, points: 0 });
  }
  return cards;
}

function sortHand(hand) {
  hand.sort((a, b) => {
    const av = sortValue(a, hand);
    const bv = sortValue(b, hand);
    return av - bv || a.suit.localeCompare(b.suit);
  });
}

function sortValue(card, hand) {
  if (card.joker) return card.joker === "small" ? 99 : 100;
  if (hasYaoHint(hand)) {
    if (card.rank === "A") return 0;
    if (card.rank === "4") return 0.2;
  }
  return card.value;
}

function hasYaoHint(hand) {
  return hand.some(card => card.rank === "A") && hand.filter(card => card.rank === "4").length >= 2;
}

function playerNameFallback() {
  return (el.nameInput?.value || "").trim() || "你";
}

function cleanPlayerName(name, fallback = "玩家") {
  return String(name || "").trim().slice(0, 10) || fallback;
}

function localSeat() {
  return online.connected ? online.seat : 0;
}

function localPlayer() {
  return state.players[localSeat()] || state.players[0];
}

function isHostRuntime() {
  return !online.connected || online.isHost;
}

function isHumanControlled(seat) {
  if (!online.connected) return seat === 0;
  if (!online.isHost) return seat === localSeat();
  return seat === 0 || Object.prototype.hasOwnProperty.call(online.seatClients, seat);
}

function preservedOnlineNames() {
  const names = {};
  if (state.players[0]) names[0] = state.players[0].name;
  for (const seat of Object.keys(online.seatClients)) {
    if (state.players[seat]) names[seat] = state.players[seat].name;
  }
  return names;
}

function isOnlineHumanSeat(index) {
  if (!online.connected) return index === 0;
  if (index === 0 && online.isHost) return true;
  return Object.prototype.hasOwnProperty.call(online.seatClients, index);
}

function makeLobbyPlayer(index, name) {
  return {
    id: index,
    name: name || (index === 0 ? playerNameFallback() : `人机 ${index}`),
    hand: [],
    team: "plain",
    knownTeam: false,
    score: 0,
    matchScore: state.playerMatch[index] || 0,
    roundDelta: 0,
    bigCardIds: new Set(),
    revealedBigs: new Set(),
    revealAnnouncement: "",
    lastPlay: null,
    finished: false,
    human: isOnlineHumanSeat(index)
  };
}

function setupWaitingRoom(options = {}) {
  if (options.resetMatch) {
    state.playerMatch = [0, 0, 0, 0, 0];
    state.firstFinisherNext = 0;
  }
  const preservedNames = { ...preservedOnlineNames(), ...(options.preserveNames || {}) };
  state.players = Array.from({ length: 5 }, (_, index) => makeLobbyPlayer(index, preservedNames[index]));
  state.current = 0;
  state.leader = 0;
  state.lastPlayer = null;
  state.currentPlay = null;
  state.passes = new Set();
  state.selected = new Set();
  state.trickPoints = 0;
  state.scores = { king: 0, plain: 0 };
  state.finishedOrder = [];
  state.gameOver = true;
  state.continuingForNextLead = false;
  state.hasPlayed = false;
  state.revealPhase = false;
  state.bigRevealDecisions = new Set();
  state.publicBigIds = new Set();
  state.pendingSnowChoice = null;
  state.snowChasingTeam = null;
  state.tableNotice = "等待玩家加入并准备";
  state.lastSettlement = [];
  state.roundSettled = false;
  state.openingBigRevealCount = 0;
  state.revealToken = Symbol("lobby");
  state.log = [];
  addLog("房间已创建，等待玩家准备。");
  render();
}

function humanSeatsInRoom() {
  if (!online.connected) return [0];
  return state.players
    .filter(player => player.human)
    .map(player => player.id)
    .sort((a, b) => a - b);
}

function allJoinedPlayersReady() {
  const seats = humanSeatsInRoom();
  return seats.length > 0 && seats.every(seat => online.readySeats[seat]);
}

function setSeatReady(seat, ready) {
  if (ready) online.readySeats[seat] = true;
  else delete online.readySeats[seat];
  const player = state.players[seat];
  if (player) {
    state.tableNotice = `${player.name} ${ready ? "已准备" : "取消准备"}`;
    addLog(`${player.name} ${ready ? "已准备" : "取消准备"}。`);
  }
  render();
}

function firstOpenSeat(preferredSeat = null) {
  const preferred = Number(preferredSeat);
  if (preferred >= 1 && preferred <= 4 && !online.seatClients[preferred]) return preferred;
  for (let seat = 1; seat <= 4; seat += 1) {
    if (!online.seatClients[seat]) return seat;
  }
  return null;
}

function startGame(options = {}) {
  if (options.resetMatch) {
    state.playerMatch = [0, 0, 0, 0, 0];
    state.firstFinisherNext = 0;
  }
  const preservedNames = { ...preservedOnlineNames(), ...(options.preserveNames || {}) };
  const deck = shuffle(makeDeck());
  state.players = Array.from({ length: 5 }, (_, index) => ({
    id: index,
    name: preservedNames[index] || (index === 0 ? playerNameFallback() : `人机 ${index}`),
    hand: deck.slice(index * 20, index * 20 + 20),
    team: "plain",
    knownTeam: false,
    score: 0,
    matchScore: state.playerMatch[index] || 0,
    roundDelta: 0,
    bigCardIds: new Set(),
    revealedBigs: new Set(),
    revealAnnouncement: "",
    lastPlay: null,
    finished: false,
    human: isOnlineHumanSeat(index)
  }));
  state.players.forEach(player => {
    sortHand(player.hand);
    player.bigCardIds = new Set(player.hand.filter(card => card.joker === "big").map(card => card.id));
    if (player.bigCardIds.size) player.team = "king";
  });
  state.current = state.firstFinisherNext || 0;
  state.leader = state.current;
  state.lastPlayer = null;
  state.currentPlay = null;
  state.passes = new Set();
  state.selected = new Set();
  state.trickPoints = 0;
  state.scores = { king: 0, plain: 0 };
  state.finishedOrder = [];
  state.gameOver = false;
  state.continuingForNextLead = false;
  state.hasPlayed = false;
  state.revealPhase = true;
  state.bigRevealDecisions = new Set();
  state.publicBigIds = new Set();
  state.pendingSnowChoice = null;
  state.snowChasingTeam = null;
  state.tableNotice = "等待持有大王的玩家选择亮王";
  state.lastSettlement = [];
  state.roundSettled = false;
  state.log = [];
  state.players.forEach(player => {
    if (player.revealedBigs.size) player.knownTeam = true;
  });
  state.openingBigRevealCount = 0;
  state.revealToken = Symbol("reveal");
  addLog("新局开始，等待持有大王的玩家选择亮王。");
  render();
  if (!options.deferBots) scheduleBotRevealChoices();
}

function scheduleBotRevealChoices() {
  if (!isHostRuntime()) return;
  const token = Symbol("reveal");
  state.revealToken = token;
  for (const player of state.players) {
    const bigs = player.hand.filter(card => card.joker === "big");
    if (!isHumanControlled(player.id) && bigs.length) {
      setTimeout(() => {
        if (state.revealToken === token && !isHumanControlled(player.id)) {
          decidePlayerBigReveal(player, botRevealCount(bigs.length));
        }
      }, 450 + player.id * 220);
    }
  }
  if (!allBigCards().some(item => item.player.id === localSeat())) {
    addLog("你没有大王，等待其余玩家亮王。");
  }
  if (allBigCards().length === 0) finishRevealPhase();
}

function botRevealCount(bigCount) {
  if (bigCount >= 2) {
    const roll = Math.random();
    if (roll < 0.35) return 0;
    if (roll < 0.7) return 1;
    return 2;
  }
  return Math.random() < 0.55 ? 1 : 0;
}

function allBigCards() {
  return state.players.flatMap(player => player.hand
    .filter(card => card.joker === "big")
    .map(card => ({ player, card })));
}

function decideBigReveal(player, card, reveal) {
  if (!state.revealPhase || state.bigRevealDecisions.has(card.id)) return;
  state.bigRevealDecisions.add(card.id);
  if (reveal) {
    player.revealedBigs.add(card.id);
    state.publicBigIds.add(card.id);
    player.knownTeam = true;
    player.revealAnnouncement = "亮出一张大王";
    state.tableNotice = `${player.name} 亮出一张大王`;
    addLog(`${player.name} 亮出一张大王。`);
  } else {
    if (player.id === 0) addLog("你选择不亮大王。");
  }
  if (isRevealComplete()) finishRevealPhase();
  else render();
}

function decidePlayerBigReveal(player, revealCount) {
  if (!state.revealPhase) return;
  const bigs = player.hand.filter(card => card.joker === "big" && !state.bigRevealDecisions.has(card.id));
  if (!bigs.length) return;
  const showCount = Math.max(0, Math.min(revealCount, bigs.length));
  bigs.forEach((card, index) => {
    state.bigRevealDecisions.add(card.id);
    if (index < showCount) {
      player.revealedBigs.add(card.id);
      state.publicBigIds.add(card.id);
    }
  });
  if (showCount > 0) player.knownTeam = true;
  const message = bigs.length === 2
    ? (showCount === 0 ? "两张大王都不亮" : showCount === 1 ? "亮出一张大王" : "亮出两张大王")
    : (showCount === 1 ? "亮出一张大王" : "选择不亮大王");
  if (showCount > 0) {
    player.revealAnnouncement = showCount === 1 ? "亮出一张大王" : "亮出两张大王";
    state.tableNotice = `${player.name} ${player.revealAnnouncement}`;
    addLog(`${player.name} ${player.revealAnnouncement}。`);
  } else if (player.id === 0) {
    addLog(message);
  }
  if (isRevealComplete()) finishRevealPhase();
  else render();
}

function isRevealComplete() {
  return allBigCards().every(item => state.bigRevealDecisions.has(item.card.id));
}

function finishRevealPhase() {
  state.revealPhase = false;
  state.openingBigRevealCount = bigRevealCount();
  state.tableNotice = `亮王结束：已亮 ${state.openingBigRevealCount} 张，${state.players[state.current].name}先出`;
  addLog(`亮王阶段结束，已亮大王 ${state.openingBigRevealCount} 张。${state.players[state.current].name}先出。`);
  render();
  maybeBotTurn();
}

function bigRevealCount() {
  return state.players.reduce((sum, player) => sum + player.revealedBigs.size, 0);
}

function revealedBigIds() {
  return new Set(state.players.flatMap(player => [...player.revealedBigs]));
}

function countByRank(cards) {
  const map = new Map();
  for (const card of cards) {
    if (!card.joker) map.set(card.rank, (map.get(card.rank) || 0) + 1);
  }
  return map;
}

function classify(cards) {
  if (!cards.length) return { valid: false, reason: "还没有选牌。" };
  const jokers = cards.filter(card => card.joker);
  const normals = cards.filter(card => !card.joker);
  const counts = countByRank(cards);
  const ranks = [...counts.keys()].sort((a, b) => RANK_VALUE[a] - RANK_VALUE[b]);
  const bigs = jokers.filter(card => card.joker === "big");
  const smalls = jokers.filter(card => card.joker === "small");

  if (jokers.length) {
    const jokerPlay = classifyJokers(cards, bigs, smalls);
    if (jokerPlay.valid) return jokerPlay;
    return { valid: false, reason: "王牌目前只支持单王、双小王、大小王组合。" };
  }

  if (counts.get("A") === 1 && (counts.get("4") || 0) >= 2 && counts.size === 2 && cards.length === (counts.get("4") + 1)) {
    const fours = counts.get("4");
    const names = { 2: "小幺", 3: "中幺", 4: "老幺" };
    return bombish(names[fours] || `${"老".repeat(fours - 3)}幺`, 2 * fours, 1000, cards, {
      specialKind: "yao",
      yaoFours: fours,
      specialPower: yaoPower(fours)
    });
  }

  if (cards.length === 1) {
    return { valid: true, type: "single", name: `单张 ${cards[0].rank}`, length: 1, high: cards[0].value, cards };
  }
  if (cards.length === 2 && counts.size === 1) {
    return { valid: true, type: "pair", name: `对子 ${ranks[0]}`, length: 1, high: RANK_VALUE[ranks[0]], cards };
  }
  if (counts.size === 1 && cards.length >= 3) {
    const lane = cards.length;
    return bombish(`${lane}路炸弹 ${ranks[0]}`, lane, RANK_VALUE[ranks[0]], cards);
  }
  if (cards.length >= 3 && ranks.length === cards.length && isContinuous(ranks)) {
    return { valid: true, type: "singleSeq", name: `单顺 ${ranks.join("")}`, length: cards.length, high: RANK_VALUE[ranks.at(-1)], cards };
  }
  if (cards.length >= 6 && cards.length % 2 === 0 && ranks.every(rank => counts.get(rank) === 2) && isContinuous(ranks)) {
    return { valid: true, type: "doubleSeq", name: `双顺 ${ranks.join("")}`, length: ranks.length, high: RANK_VALUE[ranks.at(-1)], cards };
  }
  return { valid: false, reason: "不符合单张、对子、顺子、双顺、炸弹或幺的规则。" };
}

function classifyJokers(cards, bigs, smalls) {
  const revealCount = bigRevealCount();
  const revealed = revealedBigIds();
  if (cards.length >= 3 && cards.length === jokersOnly(cards).length) {
    return bombish(`${cards.length}张王`, 100 + cards.length, 10000 + cards.length, cards, { absolute: true, jokerKing: true, specialKind: "absoluteJoker" });
  }
  if (cards.length === 2 && bigs.length === 2) {
    return bombish("双大王", 100, 10000, cards, { absolute: true, jokerKing: true, specialKind: "absoluteJoker" });
  }
  if (cards.length === 1 && bigs.length === 1) {
    const isRevealed = revealed.has(bigs[0].id);
    return bombish(isRevealed ? "亮大王" : "暗大王", isRevealed ? 6 : 5, isRevealed ? 1002 : 1000, cards, {
      jokerKing: true,
      specialKind: "bigSingle",
      bigRevealed: isRevealed,
      specialPower: isRevealed ? 700 : 590
    });
  }
  if (cards.length === 1 && smalls.length === 1) {
    return bombish("小王", revealCount === 2 ? 4 : 3, revealCount === 2 ? 900 : 1000, cards, {
      jokerKing: true,
      specialKind: "smallSingle",
      specialPower: revealCount === 2 ? 450 : 390
    });
  }
  if (cards.length === 2 && smalls.length === 2) {
    if (revealCount === 2) return bombish("双小王", 8, 999, cards, { jokerKing: true, specialKind: "doubleSmall", specialPower: 880 });
    if (revealCount === 1) return bombish("双小王", 6, 1001, cards, { jokerKing: true, specialKind: "doubleSmall", onlyBeatsHiddenBig: true, specialPower: 610 });
    return bombish("双小王", 6, 1001, cards, { jokerKing: true, specialKind: "doubleSmall", onlyBeatsSingleBig: true, specialPower: 610 });
  }
  if (cards.length === 2 && bigs.length === 1 && smalls.length === 1) {
    const isRevealed = revealed.has(bigs[0].id);
    if (revealCount === 2) return bombish("亮大小王", 99, 9999, cards, { absolute: true, jokerKing: true, specialKind: "absoluteJoker" });
    if (revealCount === 1 && isRevealed) return bombish("亮大王带小王", 9, 1000, cards, {
      jokerKing: true,
      specialKind: "bigSmall",
      specialPower: 900
    });
    return bombish("暗大王带小王", 7, 1000, cards, {
      jokerKing: true,
      specialKind: "bigSmall",
      specialPower: 700
    });
  }
  return { valid: false };
}

function jokersOnly(cards) {
  return cards.filter(card => card.joker);
}

function yaoPower(fours) {
  return 200 * fours + 90;
}

function bombish(name, lane, high, cards, extra = {}) {
  return { valid: true, type: "bomb", name, lane, high, cards, ...extra };
}

function isContinuous(ranks) {
  if (ranks.includes("2")) return false;
  return ranks.every((rank, index) => index === 0 || RANK_VALUE[rank] === RANK_VALUE[ranks[index - 1]] + 1);
}

function canBeat(play, target) {
  if (!play.valid) return { ok: false, reason: play.reason || "牌型无效。" };
  if (!target) return { ok: true };
  if (target.absolute) return { ok: false, reason: "当前牌是最大王牌组合。" };
  if (play.absolute) return { ok: true };
  const specialBeat = canSpecialBeat(play, target);
  if (specialBeat !== null) return specialBeat;

  if (target.jokerKing && play.type !== "bomb") return { ok: false, reason: "王牌只能用更高特殊牌或幺比较。" };

  if (play.type === target.type && play.type !== "bomb") {
    if (play.length !== target.length) return { ok: false, reason: "必须同样节数。" };
    return play.high > target.high ? { ok: true } : { ok: false, reason: "点数不够大。" };
  }

  if (play.type === "doubleSeq" && target.type === "singleSeq") {
    if (play.length !== target.length) return { ok: false, reason: "双顺管单顺也需要同样节数。" };
    return play.high > target.high ? { ok: true } : { ok: false, reason: "双顺末张不够大。" };
  }

  if (play.type === "bomb") {
    if (target.type === "single" || target.type === "pair") return { ok: true };
    if (target.type === "singleSeq" && play.lane >= 3) return { ok: true };
    if (target.type === "doubleSeq" && play.lane >= 4) return { ok: true };
    if (target.type === "bomb") {
      const bombCompare = compareBombLike(play, target);
      if (bombCompare !== null) return bombCompare;
      if (play.lane !== target.lane) return play.lane > target.lane ? { ok: true } : { ok: false, reason: "炸弹路数不够。" };
      return play.high > target.high ? { ok: true } : { ok: false, reason: "同路炸弹不够大。" };
    }
  }

  return { ok: false, reason: "牌型不能这样压。" };
}

function canSpecialBeat(play, target) {
  if (!play.specialKind && !target.specialKind) return null;
  if (play.specialKind && !target.specialKind) {
    return target.type === "bomb" ? compareBombLike(play, target) : null;
  }
  if (play.specialKind === "doubleSmall") {
    if (play.onlyBeatsHiddenBig) {
      return target.specialKind === "bigSingle" && !target.bigRevealed
        ? { ok: true }
        : { ok: false, reason: "此时双小王只能管暗大王，管不了亮大王。" };
    }
    if (play.onlyBeatsSingleBig) {
      return target.specialKind === "bigSingle"
        ? { ok: true }
        : compareBombLike(play, target);
    }
  }
  if (play.specialKind === "bigSmall") {
    if (target.specialKind === "yao" && target.yaoFours >= 5) return { ok: false, reason: "亮大王带小王也管不了老老幺。" };
    if (target.specialKind === "yao" && target.yaoFours >= 4 && play.specialPower < 890) return { ok: false, reason: "暗大王带小王不能管老幺。" };
  }
  return compareBombLike(play, target);
}

function compareBombLike(play, target) {
  if (play.type !== "bomb" || target.type !== "bomb") return null;
  const playPower = bombPower(play);
  const targetPower = bombPower(target);
  if (playPower === null || targetPower === null) return null;
  return playPower > targetPower ? { ok: true } : { ok: false, reason: "特殊牌力不够大。" };
}

function bombPower(play) {
  if (typeof play.specialPower === "number") return play.specialPower;
  if (play.type !== "bomb") return null;
  return play.lane * 100 + play.high;
}

function playCards(player, cards) {
  if (state.pendingSnowChoice) return { ok: false, reason: "等待胜利阵营选择雪或不雪。" };
  const play = classify(cards);
  const beat = canBeat(play, state.currentPlay);
  if (!beat.ok) return beat;
  const playedBigs = cards.filter(card => card.joker === "big");
  if (playedBigs.length) {
    playedBigs.forEach(card => state.publicBigIds.add(card.id));
    player.knownTeam = true;
  }
  state.hasPlayed = true;
  removeCards(player.hand, cards);
  player.lastPlay = play;
  state.currentPlay = play;
  state.lastPlayer = player.id;
  state.passes = new Set();
  state.trickPoints += cards.reduce((sum, card) => sum + card.points, 0);
  state.tableNotice = `${player.name} 出 ${play.name}`;
  addLog(`${player.name} 出 ${play.name} ${formatCards(cards)}。`);
  if (!player.finished && player.hand.length === 0) finishPlayer(player);
  if (state.gameOver && !state.continuingForNextLead) {
    render();
    return { ok: true };
  }
  nextTurn();
  return { ok: true };
}

function finishPlayer(player) {
  player.finished = true;
  state.finishedOrder.push(player.id);
  addLog(`${player.name} 出完手牌。`);
  if (state.finishedOrder.length === 1) {
    state.firstFinisherNext = player.id;
    if (state.continuingForNextLead && state.roundSettled) {
      state.continuingForNextLead = false;
      state.currentPlay = null;
      state.passes = new Set();
      addLog(`${player.name} 头走，下一局由 ${player.name} 先出。`);
      render();
      return;
    }
    addLog(`${player.name} 头跑。`);
    if (state.scores[player.team] >= 90) {
      offerSnowChoiceOrEnd(`${teamName(player.team)}头跑且达到 90 分，已满足胜利条件。`, player.team);
      return;
    }
    addLog(`${teamName(player.team)}未达到 90 分，头跑不触发胜利，继续游戏。`);
    return;
  }
  checkWin();
}

function pass(player) {
  if (state.pendingSnowChoice) return;
  if (!state.currentPlay) return;
  state.passes.add(player.id);
  player.lastPlay = { name: "过", cards: [] };
  state.tableNotice = `${player.name} 过`;
  addLog(`${player.name} 过。`);
  nextTurn();
}

function nextTurn() {
  if (state.pendingSnowChoice) return;
  if (state.gameOver && !state.continuingForNextLead) return;
  const active = state.players.filter(player => !player.finished);
  if (active.length <= 1) {
    endGameByAllOut();
    return;
  }
  if (state.currentPlay && state.lastPlayer !== null) {
    const neededPasses = active.filter(player => player.id !== state.lastPlayer).length;
    const actualPasses = active.filter(player => player.id !== state.lastPlayer && state.passes.has(player.id)).length;
    if (neededPasses > 0 && actualPasses >= neededPasses) {
      awardTrick();
      return;
    }
  }
  do {
    state.current = (state.current + 1) % state.players.length;
  } while (state.players[state.current].finished);
  render();
  maybeBotTurn();
}

function awardTrick() {
  const winner = state.players[state.lastPlayer];
  state.scores[winner.team] += state.trickPoints;
  winner.score += state.trickPoints;
  state.tableNotice = `${winner.name} 收下本墩 ${state.trickPoints} 分`;
  addLog(`${winner.name} 收下本墩 ${state.trickPoints} 分。`);
  state.trickPoints = 0;
  state.currentPlay = null;
  state.passes = new Set();
  state.current = nextLeaderAfterTrick(winner);
  state.leader = state.current;
  checkWin();
  render();
  maybeBotTurn();
}

function nextLeaderAfterTrick(winner) {
  if (!winner.finished) return winner.id;
  if (state.openingBigRevealCount === 2) {
    const teammate = findNextActive(winner.id, player => player.team === winner.team);
    if (teammate !== null) {
      addLog(`${winner.name} 已出完且无人管，按双亮王规则由本阵营下一家 ${state.players[teammate].name} 出牌。`);
      return teammate;
    }
  }
  const next = findNextActive(winner.id);
  addLog(`${winner.name} 已出完且无人管，由下一家 ${state.players[next].name} 出牌。`);
  return next;
}

function findNextActive(fromId, predicate = () => true) {
  for (let step = 1; step <= state.players.length; step += 1) {
    const index = (fromId + step) % state.players.length;
    const player = state.players[index];
    if (!player.finished && predicate(player)) return index;
  }
  for (let step = 1; step <= state.players.length; step += 1) {
    const index = (fromId + step) % state.players.length;
    if (!state.players[index].finished) return index;
  }
  return fromId;
}

function checkWin() {
  if (state.pendingSnowChoice) return;
  if (state.snowChasingTeam && state.scores[opponentTeam(state.snowChasingTeam)] >= 25) {
    endRound(`${teamName(state.snowChasingTeam)}选择雪，但对方已免雪，按无雪获胜。`, state.snowChasingTeam, 1);
    return;
  }
  for (const team of ["king", "plain"]) {
    const rival = team === "king" ? "plain" : "king";
    if (state.scores[team] >= 200) {
      endRound(`${teamName(team)}拿满 200 分，大雪获胜。`, team, 4);
      return;
    }
    if (state.snowChasingTeam && state.snowChasingTeam !== team) continue;
    if (state.scores[team] >= 140) {
      offerSnowChoiceOrEnd(`${teamName(team)}达到 140 分，已满足胜利条件。`, team);
      return;
    }
    const teamPlayers = state.players.filter(player => player.team === team);
    if (teamPlayers.length && teamPlayers.every(player => player.finished) && state.scores[rival] < 140) {
      const bonus = state.scores[rival] === 0 ? 4 : (state.scores[rival] < 25 ? 2 : 1);
      endRound(`${teamName(team)}全部出完，${bonus === 4 ? "大雪" : bonus === 2 ? "小雪" : "获胜"}。`, team, bonus);
      return;
    }
  }
}

function offerSnowChoiceOrEnd(message, winnerTeam) {
  const rival = opponentTeam(winnerTeam);
  if (state.snowChasingTeam) {
    if (state.scores[rival] >= 25) endRound(`${teamName(winnerTeam)}获胜，对方已免雪，按无雪结算。`, winnerTeam, 1);
    return;
  }
  if (state.scores[rival] < 25) {
    const deciders = unfinishedTeamPlayers(winnerTeam);
    if (!deciders.length) {
      endRound(`${message} ${teamName(winnerTeam)}已无人持牌决定雪，按无雪获胜。`, winnerTeam, 1);
      return;
    }
    state.pendingSnowChoice = { winnerTeam, message };
    state.tableNotice = `${message} ${teamName(winnerTeam)}未出完玩家请选择雪或不雪`;
    addLog(`${message} 对方未免雪，${teamName(winnerTeam)}未出完玩家选择雪或不雪。`);
    render();
    return;
  }
  endRound(`${message} 对方已免雪，按无雪获胜。`, winnerTeam, 1);
}

function unfinishedTeamPlayers(team) {
  return state.players.filter(player => player.team === team && !player.finished);
}

function chooseSnowChoice(choice) {
  const pending = state.pendingSnowChoice;
  if (!pending) return;
  const winnerTeam = pending.winnerTeam;
  state.pendingSnowChoice = null;
  if (choice === "noSnow") {
    endRound(`${teamName(winnerTeam)}选择不雪，按无雪获胜。`, winnerTeam, 1);
    render();
    return;
  }
  state.snowChasingTeam = winnerTeam;
  state.tableNotice = `${teamName(winnerTeam)}选择雪，继续游戏`;
  addLog(`${teamName(winnerTeam)}选择雪，继续打到最终结果。`);
  render();
  maybeBotTurn();
}

function opponentTeam(team) {
  return team === "king" ? "plain" : "king";
}

function endRound(message, winnerTeam = null, multiplier = 1) {
  if (state.gameOver) return;
  state.pendingSnowChoice = null;
  state.snowChasingTeam = null;
  state.gameOver = true;
  state.tableNotice = message;
  addLog(message);
  if (winnerTeam) settleRound(winnerTeam, multiplier);
  if (!state.finishedOrder.length) {
    state.continuingForNextLead = true;
    addLog("本局还没有头跑，继续打到有人出完，以确定下一局先手。");
  }
}

function settleRound(winnerTeam, multiplier) {
  if (state.roundSettled) return;
  state.roundSettled = true;
  const revealCount = state.openingBigRevealCount;
  state.lastSettlement = state.players.map(player => {
    const base = settlementBase(player, revealCount);
    const sign = player.team === winnerTeam ? 1 : -1;
    const delta = base * multiplier * sign;
    player.roundDelta = delta;
    player.matchScore = (player.matchScore || 0) + delta;
    state.playerMatch[player.id] = player.matchScore;
    return { playerId: player.id, name: player.name, delta, total: player.matchScore, base };
  });
  const multiplierText = multiplier === 4 ? "大雪 ×4" : multiplier === 2 ? "小雪 ×2" : "无雪";
  state.tableNotice = `${teamName(winnerTeam)}获胜 · ${multiplierText}`;
  addLog(`本局结算：${multiplierText}，${state.lastSettlement.map(item => `${item.name}总分${item.total}（本局${formatSigned(item.delta)}）`).join("，")}。`);
}

function settlementBase(player, revealCount) {
  const bigCount = player.bigCardIds?.size || 0;
  const playerRevealCount = [...(player.revealedBigs || [])].filter(id => player.bigCardIds?.has(id)).length;
  if (revealCount === 0) {
    if (bigCount === 2) return 8;
    return bigCount ? 3 : 2;
  }
  if (revealCount === 1) {
    if (bigCount === 2) return 12;
    if (bigCount === 1 && playerRevealCount === 1) return 6;
    return 3;
  }
  if (bigCount === 2) return 16;
  return bigCount ? 6 : 4;
}

function formatSigned(value) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function endGameByAllOut() {
  const remaining = state.players.find(player => !player.finished);
  if (remaining) {
    state.scores[remaining.team] += state.trickPoints;
    remaining.score += state.trickPoints;
    state.trickPoints = 0;
  }
  if (state.snowChasingTeam && !state.roundSettled) {
    const rivalScore = state.scores[opponentTeam(state.snowChasingTeam)];
    const multiplier = rivalScore === 0 ? 4 : (rivalScore < 25 ? 2 : 1);
    endRound(`${teamName(state.snowChasingTeam)}选择雪后打完，${multiplier === 4 ? "大雪" : multiplier === 2 ? "小雪" : "对方免雪"}。`, state.snowChasingTeam, multiplier);
    return;
  }
  if (state.continuingForNextLead && state.finishedOrder.length) {
    state.continuingForNextLead = false;
  }
  state.gameOver = true;
  state.tableNotice = "本局结束";
  addLog("本局结束。");
  render();
}

function removeCards(hand, cards) {
  const ids = new Set(cards.map(card => card.id));
  for (let i = hand.length - 1; i >= 0; i -= 1) {
    if (ids.has(hand[i].id)) hand.splice(i, 1);
  }
}

function maybeBotTurn() {
  if (!isHostRuntime()) return;
  if (state.revealPhase) return;
  if (state.pendingSnowChoice) {
    const hasHumanWinner = unfinishedTeamPlayers(state.pendingSnowChoice.winnerTeam)
      .some(player => isHumanControlled(player.id));
    if (!hasHumanWinner) setTimeout(() => chooseSnowChoice("snow"), 450);
    return;
  }
  if (state.gameOver && !state.continuingForNextLead) return;
  const player = state.players[state.current];
  if (!player || isHumanControlled(player.id) || player.finished) return;
  setTimeout(() => {
    const move = chooseMove(player);
    if (move.length) playCards(player, move);
    else pass(player);
    render();
  }, 450);
}

function chooseMove(player) {
  const moves = generateMoves(player.hand);
  const legal = moves
    .map(cards => ({ cards, play: classify(cards), beat: canBeat(classify(cards), state.currentPlay) }))
    .filter(item => item.beat.ok)
    .sort((a, b) => moveCost(a.play) - moveCost(b.play) || a.cards.length - b.cards.length);
  if (!state.currentPlay) {
    return legal.find(item => item.play.type !== "bomb")?.cards || legal[0]?.cards || [];
  }
  return legal[0]?.cards || [];
}

function moveCost(play) {
  const typeCost = { single: 10, pair: 20, singleSeq: 30, doubleSeq: 34, bomb: 100 };
  return (typeCost[play.type] || 80) + (play.lane || 0) * 5 + play.high / 100;
}

function generateMoves(hand) {
  const moves = [];
  const byRank = new Map();
  for (const card of hand) {
    if (!card.joker) {
      if (!byRank.has(card.rank)) byRank.set(card.rank, []);
      byRank.get(card.rank).push(card);
    }
  }
  for (const card of hand) moves.push([card]);
  for (const cards of byRank.values()) {
    if (cards.length >= 2) moves.push(cards.slice(0, 2));
    for (let n = 3; n <= cards.length; n += 1) moves.push(cards.slice(0, n));
  }
  for (let len = 3; len <= 5; len += 1) {
    for (let start = 0; start <= SEQ_RANKS.length - len; start += 1) {
      const ranks = SEQ_RANKS.slice(start, start + len);
      if (ranks.every(rank => byRank.has(rank))) moves.push(ranks.map(rank => byRank.get(rank)[0]));
      if (ranks.every(rank => (byRank.get(rank) || []).length >= 2)) moves.push(ranks.flatMap(rank => byRank.get(rank).slice(0, 2)));
    }
  }
  const aces = hand.filter(card => card.rank === "A");
  const fours = hand.filter(card => card.rank === "4");
  if (aces.length && fours.length >= 2) {
    for (let n = 2; n <= fours.length; n += 1) moves.push([aces[0], ...fours.slice(0, n)]);
  }
  const bigs = hand.filter(card => card.joker === "big");
  const smalls = hand.filter(card => card.joker === "small");
  const jokers = hand.filter(card => card.joker);
  if (smalls.length >= 2) moves.push(smalls.slice(0, 2));
  for (const big of bigs) for (const small of smalls) moves.push([big, small]);
  for (const combo of combinations(jokers, 2)) {
    if (combo.filter(card => card.joker === "big").length === 2) moves.push(combo);
  }
  for (let n = 3; n <= Math.min(4, jokers.length); n += 1) {
    moves.push(...combinations(jokers, n));
  }
  return moves;
}

function combinations(items, size, start = 0, prefix = []) {
  if (prefix.length === size) return [prefix];
  const result = [];
  for (let i = start; i <= items.length - (size - prefix.length); i += 1) {
    result.push(...combinations(items, size, i + 1, [...prefix, items[i]]));
  }
  return result;
}

function formatCards(cards) {
  return cards.map(cardLabel).join(" ");
}

function teamName(team) {
  return team === "king" ? "王队" : "平民队";
}

function isBigRevealed(card) {
  return card?.joker === "big" && revealedBigIds().has(card.id);
}

function isBigDecided(card) {
  return card?.joker === "big" && state.bigRevealDecisions.has(card.id);
}

function cardLabel(card) {
  if (card?.joker === "big") {
    if (isBigRevealed(card)) return "亮大王";
    if (!state.revealPhase || isBigDecided(card) || state.hasPlayed) return "暗大王";
    return "大王";
  }
  return card.rank;
}

function cardStateClass(card) {
  if (card?.joker !== "big") return "";
  if (isBigRevealed(card)) return " brightBig";
  if (!state.revealPhase || isBigDecided(card) || state.hasPlayed) return " darkBig";
  return "";
}

function addLog(text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 80);
}

function render() {
  renderTable();
  renderHand();
  renderPanels();
  broadcastSnapshot();
}

function serializeState() {
  return JSON.stringify(state, (key, value) => value instanceof Set ? { __set: [...value] } : value);
}

function loadState(serialized) {
  const next = JSON.parse(serialized, (key, value) => value && value.__set ? new Set(value.__set) : value);
  Object.assign(state, next);
}

function broadcastSnapshot() {
  if (!online.connected || !online.isHost || !online.socket || online.socket.readyState !== WebSocket.OPEN) return;
  for (const [seat, clientId] of Object.entries(online.seatClients)) {
    sendSocket({
      type: "relay",
      to: clientId,
      payload: {
        type: "snapshot",
        state: serializeState(),
        seat: Number(seat),
        roomId: online.roomId,
        waitingRoom: online.waitingRoom,
        readySeats: online.readySeats
      }
    });
  }
  updateOnlineStatus();
}

function sendSocket(message) {
  if (online.socket && online.socket.readyState === WebSocket.OPEN) {
    online.socket.send(JSON.stringify(message));
  }
}

function renderTableCenter() {
  if (online.connected && online.waitingRoom) {
    const readyLine = humanSeatsInRoom()
      .map(seat => `${state.players[seat]?.name || `玩家 ${seat}`}：${online.readySeats[seat] ? "已准备" : "未准备"}`)
      .join("　");
    el.tableCenter.innerHTML = `
      <div class="phasePill">房间准备</div>
      <div class="centerNotice">${state.tableNotice || "等待玩家准备"}</div>
      <div class="centerLine">${readyLine || "等待玩家加入"}</div>
      <div class="centerLine">所有已入房真人准备后，房主才能开始发牌。</div>
    `;
    return;
  }
  const player = state.players[state.current];
  const phase = state.revealPhase
    ? "亮王阶段"
    : state.continuingForNextLead
    ? "寻找下一局先手"
    : state.gameOver
    ? "本局结束"
    : "出牌阶段";
  const current = state.revealPhase || state.gameOver && !state.continuingForNextLead
    ? ""
    : `<div class="centerLine">轮到：<strong>${player?.name || "无"}</strong></div>`;
  const last = state.currentPlay
    ? `<div class="centerPlay">${state.currentPlay.cards.map(tinyCard).join("")}</div><div class="centerLine">${state.currentPlay.name}</div>`
    : `<div class="centerLine">新回合</div>`;
  const settlement = state.roundSettled
    ? `<div class="settlementStrip">${state.lastSettlement.map(item => `<span>${item.name} 总分 ${item.total} 本局 ${formatSigned(item.delta)}</span>`).join("")}</div>`
    : "";
  const snowChoice = state.pendingSnowChoice
    ? `<div class="centerLine"><strong>${teamName(state.pendingSnowChoice.winnerTeam)}</strong> 未出完玩家可选择雪或不雪</div>`
    : "";
  el.tableCenter.innerHTML = `
    <div class="phasePill">${phase}</div>
    <div class="centerNotice">${state.tableNotice || "牌局进行中"}</div>
    ${current}
    <div class="centerLine">本墩分：<strong>${state.trickPoints}</strong></div>
    <div class="centerLine">牌局中剩余大王：<strong>${remainingBigCount()}</strong> 张</div>
    ${last}
    ${snowChoice}
    ${settlement}
  `;
}

function remainingBigCount() {
  return state.players.reduce((sum, player) => sum + player.hand.filter(card => card.joker === "big").length, 0);
}

function revealedBigStatus(player) {
  const revealedIds = [...(player.revealedBigs || [])];
  if (!revealedIds.length) return "";
  const inHand = revealedIds.filter(id => player.hand.some(card => card.id === id)).length;
  const played = revealedIds.length - inHand;
  if (revealedIds.length === 1) return ` · ${inHand ? "亮大王在手" : "亮大王已打出"}`;
  return ` · 在手${inHand} 已出${played}`;
}

function renderTable() {
  const positions = [
    ["50%", "84%"],
    ["14%", "58%"],
    ["24%", "18%"],
    ["76%", "18%"],
    ["86%", "58%"]
  ];
  el.table.innerHTML = state.players.map((player, index) => {
    const isTurn = index === state.current && (!state.gameOver || state.continuingForNextLead);
    const team = online.connected && online.waitingRoom
      ? (player.human ? (online.readySeats[index] ? "已准备" : "未准备") : "人机候补")
      : player.id === localSeat() ? teamName(player.team) : visibleTeam(player);
    const cards = player.lastPlay?.cards?.length ? player.lastPlay.cards.map(tinyCard).join("") : `<div class="meta">${player.lastPlay?.name || "等待"}</div>`;
    const revealHands = shouldRevealHands();
    const handPreview = revealHands && player.hand.length
      ? `<div class="miniCards revealedHand">${player.hand.map(tinyCard).join("")}</div>`
      : player.id === localSeat() ? "" : `<div class="miniCards">${Array.from({ length: Math.min(player.hand.length, 10) }, () => `<span class="backCard"></span>`).join("")}</div>`;
    const revealMark = player.revealAnnouncement ? `<div class="revealMark">${player.revealAnnouncement}${revealedBigStatus(player)}</div>` : "";
    const matchLine = player.roundDelta
      ? `总分 ${player.matchScore || 0} · 本局 ${formatSigned(player.roundDelta)}`
      : `总分 ${player.matchScore || 0}`;
    return `<article class="seat" style="left:${positions[index][0]};top:${positions[index][1]}">
      <div class="scoreTag">${player.score} 分 · ${matchLine}</div>
      <div class="name">${isTurn ? "▶" : ""}${player.name}<span class="badge">${player.hand.length} 张</span></div>
      <div class="meta">${team}${player.finished ? " · 已出完" : ""}</div>
      ${revealMark}
      <div class="playedCards">${cards}</div>${handPreview}
    </article>`;
  }).join("");
  renderTableCenter();
}

function shouldRevealHands() {
  return state.gameOver && !state.continuingForNextLead;
}

function visibleTeam(player) {
  if (player.knownTeam) return teamName(player.team);
  if (allPublicBigCardsKnown()) return teamName("plain");
  return "阵营未知";
}

function allKingPlayersKnown() {
  return allPublicBigCardsKnown();
}

function allTeamsDetermined() {
  return allPublicBigCardsKnown();
}

function allPublicBigCardsKnown() {
  return (state.publicBigIds?.size || 0) >= 2;
}

function renderHand() {
  const human = localPlayer();
  if (online.connected && online.waitingRoom) {
    el.hand.innerHTML = "";
    renderSelection();
    return;
  }
  sortHand(human.hand);
  el.hand.innerHTML = human.hand.map(card => {
    const selected = state.selected.has(card.id) ? " selected" : "";
    const color = card.color === "red" ? " red" : card.color === "joker" ? " joker" : "";
    const yaoHint = hasYaoHint(human.hand) && (card.rank === "A" || card.rank === "4") ? " yaoHint" : "";
    const bigState = cardStateClass(card);
    return `<div class="card${selected}${color}${yaoHint}${bigState}" data-id="${card.id}">
      <div class="rank">${cardLabel(card)}</div>
      <div class="suit">${card.suit}</div>
    </div>`;
  }).join("");
  el.hand.querySelectorAll(".card").forEach(node => {
    node.addEventListener("click", () => {
      const id = node.dataset.id;
      if (state.selected.has(id)) state.selected.delete(id);
      else state.selected.add(id);
      renderHand();
      renderSelection();
    });
  });
  renderSelection();
}

function renderSelection() {
  if (online.connected && online.waitingRoom) {
    el.selectionInfo.textContent = "房间准备中，开始本局后才会发牌。";
    el.playBtn.disabled = true;
    el.passBtn.disabled = true;
    return;
  }
  const cards = selectedCards();
  const play = classify(cards);
  const beat = canBeat(play, state.currentPlay);
  el.selectionInfo.textContent = play.valid
    ? `${play.name}：${beat.ok ? `可以出${playStrengthText(play)}` : beat.reason}`
    : play.reason;
  const humanTurn = !state.pendingSnowChoice && !state.revealPhase && state.current === localSeat() && (!state.gameOver || state.continuingForNextLead);
  el.playBtn.disabled = !humanTurn || !beat.ok || !cards.length;
  el.passBtn.disabled = !humanTurn || !state.currentPlay;
}

function playStrengthText(play) {
  if (!play || play.type !== "bomb") return "";
  if (play.absolute) return " · 最大";
  if (play.specialKind === "yao" || play.jokerKing) return ` · ${laneName(play.lane)}头`;
  return ` · ${laneName(play.lane)}`;
}

function laneName(lane) {
  const names = {
    3: "三路",
    4: "四路",
    5: "五路",
    6: "六路",
    7: "七路",
    8: "八路",
    9: "九路",
    10: "十路"
  };
  return names[lane] || `${lane}路`;
}

function renderPanels() {
  normalizeScores();
  el.newGameBtn.disabled = online.connected && !online.isHost;
  el.nextRoundBtn.disabled = online.waitingRoom || !state.gameOver || state.continuingForNextLead || state.revealPhase;
  if (online.connected && !online.isHost) el.nextRoundBtn.disabled = true;
  el.readyBtn.disabled = !online.connected || !online.waitingRoom;
  el.readyBtn.textContent = online.readySeats[localSeat()] ? "取消准备" : "准备";
  el.startOnlineBtn.disabled = !online.connected || !online.isHost || !online.waitingRoom || !allJoinedPlayersReady();
  el.autoBtn.disabled = online.waitingRoom || online.connected && !online.isHost || state.revealPhase || (state.gameOver && !state.continuingForNextLead) || state.current !== localSeat();
  el.trickPoints.textContent = state.trickPoints;
  const revealTeamScores = state.roundSettled || (state.gameOver && !state.continuingForNextLead) || allTeamsDetermined();
  el.kingScore.textContent = revealTeamScores ? state.scores.king : "未公开";
  el.plainScore.textContent = revealTeamScores ? state.scores.plain : "未公开";
  el.matchScore.innerHTML = state.players
    .map(player => `<span>${player.name}<b>${formatSigned(player.matchScore || 0)}</b></span>`)
    .join("");
  const player = state.players[state.current];
  el.statusBox.innerHTML = online.connected && online.waitingRoom
    ? `房间准备中<br>${humanSeatsInRoom().map(seat => `${state.players[seat]?.name || `玩家 ${seat}`}：${online.readySeats[seat] ? "已准备" : "未准备"}`).join("<br>")}`
    : state.revealPhase
    ? `亮王阶段<br>已亮大王：${bigRevealCount()} 张`
    : state.continuingForNextLead
    ? `本局已结算，继续找头走<br>轮到：<strong>${player.name}</strong><br>头走将作为下一局先手`
    : state.gameOver && !state.continuingForNextLead
    ? `本局已结束。<br>下一局先手：${state.players[state.firstFinisherNext]?.name || "未定"}`
    : `轮到：<strong>${player.name}</strong><br>先手：${state.players[state.leader]?.name || "无"}<br>已亮大王：${bigRevealCount()} 张`;
  el.currentPlay.innerHTML = state.currentPlay
    ? `<strong>${state.players[state.lastPlayer].name}</strong><br>${state.currentPlay.name}<div class="playedCards">${state.currentPlay.cards.map(tinyCard).join("")}</div>`
    : state.revealPhase ? "等待亮王阶段结束。" : "新回合，任意合法牌型都可以出。";
  el.log.innerHTML = state.log.map(item => `<div class="logItem">${item}</div>`).join("");
  renderRevealBox();
}

function normalizeScores() {
  const total = state.scores.king + state.scores.plain + state.trickPoints;
  if (total <= 200) return;
  const overflow = total - 200;
  if (state.scores.king >= state.scores.plain) state.scores.king = Math.max(0, state.scores.king - overflow);
  else state.scores.plain = Math.max(0, state.scores.plain - overflow);
  addLog("检测到牌分超过 200，已按总牌分自动校正。");
}

function renderRevealBox() {
  const human = localPlayer();
  if (state.pendingSnowChoice) {
    const pending = state.pendingSnowChoice;
    if (human.team === pending.winnerTeam && !human.finished) {
      el.revealBox.innerHTML = `<p>${teamName(pending.winnerTeam)}已满足胜利条件，对方未免雪。</p>
        <div class="revealChoice">
          <button class="snowChoiceBtn" data-choice="snow">雪</button>
          <button class="snowChoiceBtn" data-choice="noSnow">不雪</button>
        </div>`;
      el.revealBox.querySelectorAll(".snowChoiceBtn").forEach(button => {
        button.addEventListener("click", () => handleSnowChoice(button.dataset.choice));
      });
      return;
    }
    el.revealBox.innerHTML = `等待${teamName(pending.winnerTeam)}未出完玩家选择雪或不雪。`;
    return;
  }
  if (online.connected && online.waitingRoom) {
    el.revealBox.innerHTML = "房间准备中，所有已入房真人准备后由房主开始发牌。";
    return;
  }
  if (!state.revealPhase) {
    const bigs = human.hand.filter(card => card.joker === "big" && !human.revealedBigs.has(card.id));
    if (!bigs.length) {
      el.revealBox.innerHTML = "你没有未亮出的大王。";
      return;
    }
    el.revealBox.innerHTML = "亮王阶段已结束，未亮出的大王保持暗王。";
    return;
  }
  const bigs = human.hand.filter(card => card.joker === "big");
  const undecided = bigs.filter(card => !state.bigRevealDecisions.has(card.id));
  if (!bigs.length) {
    el.revealBox.innerHTML = "你没有大王，等待其余玩家选择亮王。";
    return;
  }
  if (!undecided.length) {
    el.revealBox.innerHTML = "你已完成亮王选择，等待其余玩家。";
    return;
  }
  if (undecided.length >= 2) {
    el.revealBox.innerHTML = `<p>你持有两张大王，请选择开局亮王数量。</p>
      <div class="revealChoice revealChoiceThree">
        <span>两张大王</span>
        <button class="revealCountBtn" data-count="0">都不亮</button>
        <button class="revealCountBtn" data-count="1">亮一张</button>
        <button class="revealCountBtn" data-count="2">亮两张</button>
      </div>`;
    el.revealBox.querySelectorAll(".revealCountBtn").forEach(button => {
      button.addEventListener("click", () => handleRevealChoice(Number(button.dataset.count)));
    });
    return;
  }
  el.revealBox.innerHTML = `<p>你持有一张大王，请在开局前选择亮出或不亮。</p>
    <div class="revealChoice">
      <span>${cardLabel(undecided[0])}</span>
      <button class="revealCountBtn" data-count="1">亮</button>
      <button class="revealCountBtn" data-count="0">不亮</button>
    </div>`;
  el.revealBox.querySelectorAll(".revealCountBtn").forEach(button => {
    button.addEventListener("click", () => handleRevealChoice(Number(button.dataset.count)));
  });
}

function handleRevealChoice(count) {
  if (online.connected && !online.isHost) {
    sendSocket({ type: "action", action: "reveal", count });
    return;
  }
  decidePlayerBigReveal(localPlayer(), count);
}

function handleSnowChoice(choice) {
  const pending = state.pendingSnowChoice;
  const player = localPlayer();
  if (!pending || player.team !== pending.winnerTeam || player.finished) return;
  if (online.connected && !online.isHost) {
    sendSocket({ type: "action", action: "snowChoice", choice });
    return;
  }
  chooseSnowChoice(choice);
}

function tinyCard(card) {
  const color = card.color === "red" ? " red" : card.color === "joker" ? " joker" : "";
  return `<span class="tinyCard${color}${cardStateClass(card)}">${cardLabel(card)}</span>`;
}

function selectedCards() {
  const ids = state.selected;
  return localPlayer().hand.filter(card => ids.has(card.id));
}

el.playBtn.addEventListener("click", () => {
  if (online.connected && !online.isHost) {
    sendSocket({ type: "action", action: "play", cardIds: selectedCards().map(card => card.id) });
    state.selected.clear();
    renderHand();
    return;
  }
  const result = playCards(localPlayer(), selectedCards());
  if (!result.ok) addLog(result.reason);
  state.selected.clear();
  render();
});

el.passBtn.addEventListener("click", () => {
  if (online.connected && !online.isHost) {
    sendSocket({ type: "action", action: "pass" });
    state.selected.clear();
    renderHand();
    return;
  }
  pass(localPlayer());
  state.selected.clear();
  render();
});

el.clearBtn.addEventListener("click", () => {
  state.selected.clear();
  renderHand();
});

el.autoBtn.addEventListener("click", () => {
  if (state.revealPhase) return;
  if (state.current !== localSeat()) return;
  const move = chooseMove(localPlayer());
  if (move.length) playCards(localPlayer(), move);
  else pass(localPlayer());
  state.selected.clear();
  render();
});

el.newGameBtn.addEventListener("click", () => {
  if (online.connected && !online.isHost) return;
  if (online.connected) {
    online.waitingRoom = true;
    online.readySeats = {};
    setupWaitingRoom({ resetMatch: true, preserveNames: preservedOnlineNames() });
    state.tableNotice = "新比赛已创建，等待玩家准备";
    render();
    return;
  }
  startGame({ resetMatch: true });
});
el.nextRoundBtn.addEventListener("click", () => {
  if (online.connected && !online.isHost) return;
  if (state.gameOver && !state.continuingForNextLead) {
    if (online.connected) {
      online.waitingRoom = true;
      online.readySeats = {};
      setupWaitingRoom({ preserveNames: preservedOnlineNames() });
      state.tableNotice = "下一局等待玩家准备";
      render();
      return;
    }
    startGame();
  }
});

el.startOnlineBtn.addEventListener("click", () => {
  if (!online.connected || !online.isHost) return;
  if (!allJoinedPlayersReady()) {
    state.tableNotice = "还有玩家未准备，不能开始";
    render();
    return;
  }
  online.waitingRoom = false;
  startGame({ preserveNames: preservedOnlineNames() });
});

el.readyBtn.addEventListener("click", () => {
  if (!online.connected || !online.waitingRoom) return;
  const seat = localSeat();
  const ready = !online.readySeats[seat];
  if (online.isHost) {
    setSeatReady(seat, ready);
    return;
  }
  sendSocket({ type: "action", action: "ready", ready });
});

el.hostBtn.addEventListener("click", async () => {
  await openSocket();
  online.isHost = true;
  online.seat = 0;
  state.players[0].name = cleanPlayerName(el.nameInput.value, "房主");
  online.waitingRoom = true;
  sendSocket({ type: "create" });
  render();
});

el.joinBtn.addEventListener("click", async () => {
  const roomId = el.roomInput.value.trim().toUpperCase();
  if (!roomId) {
    el.onlineStatus.textContent = "请输入房号";
    return;
  }
  await openSocket();
  online.isHost = false;
  const requestedSeat = Number(el.seatSelect.value);
  online.seat = requestedSeat;
  const name = cleanPlayerName(el.nameInput.value, `玩家 ${requestedSeat}`);
  online.waitingRoom = true;
  online.readySeats = {};
  setupWaitingRoom({ preserveNames: { [requestedSeat]: name } });
  state.players[requestedSeat].human = true;
  state.players[requestedSeat].name = name;
  state.tableNotice = "正在加入房间...";
  sendSocket({ type: "join", roomId, seat: requestedSeat, name });
  el.onlineStatus.textContent = "正在加入房间...";
  render();
});

el.renameBtn.addEventListener("click", () => {
  const name = cleanPlayerName(el.nameInput.value, localSeat() === 0 ? "你" : `玩家 ${localSeat()}`);
  if (online.connected && !online.isHost) {
    sendSocket({ type: "action", action: "rename", name });
    return;
  }
  renameSeat(localSeat(), name);
  render();
});

function renameSeat(seat, name) {
  const player = state.players[seat];
  if (!player) return;
  player.name = cleanPlayerName(name, seat === 0 ? "你" : `玩家 ${seat}`);
  state.tableNotice = `${player.name} 更新了昵称`;
}

function openSocket() {
  if (online.socket && online.socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}`);
    online.socket = socket;
    socket.addEventListener("open", () => {
      online.connected = true;
      updateOnlineStatus();
      resolve();
    }, { once: true });
    socket.addEventListener("message", event => handleSocketMessage(JSON.parse(event.data)));
    socket.addEventListener("close", () => {
      online.connected = false;
      updateOnlineStatus("联机已断开");
    });
    socket.addEventListener("error", () => {
      updateOnlineStatus("连接失败，请确认已启动 outputs/server.js");
      reject(new Error("socket failed"));
    }, { once: true });
  });
}

function handleSocketMessage(message) {
  if (message.type === "created") {
    online.roomId = message.roomId;
    online.clientId = message.clientId;
    online.connected = true;
    online.isHost = true;
    online.seat = 0;
    online.seatClients = {};
    online.clientSeats = {};
    online.readySeats = {};
    online.waitingRoom = true;
    setupWaitingRoom({ resetMatch: true, preserveNames: { 0: cleanPlayerName(el.nameInput.value, "房主") } });
    state.tableNotice = `房间 ${online.roomId} 已创建，等待玩家加入`;
    addLog(`房间 ${online.roomId} 已创建，所有已入房玩家准备后再发牌。`);
    updateOnlineStatus();
    render();
    return;
  }
  if (message.type === "joined") {
    online.roomId = message.roomId;
    online.clientId = message.clientId;
    online.connected = true;
    online.isHost = false;
    updateOnlineStatus("已加入，等待房主同步牌局");
    return;
  }
  if (message.type === "joinRequest" && online.isHost) {
    const requestedSeat = Number(message.seat);
    const seat = firstOpenSeat(requestedSeat);
    if (!seat) {
      sendSocket({ type: "relay", to: message.clientId, payload: { type: "error", message: "房间已满" } });
      return;
    }
    online.seatClients[seat] = message.clientId;
    online.clientSeats[message.clientId] = seat;
    delete online.readySeats[seat];
    state.players[seat].name = message.name || `玩家 ${seat}`;
    state.players[seat].human = true;
    const moved = requestedSeat !== seat;
    state.tableNotice = online.waitingRoom
      ? `${state.players[seat].name} 已加入座位 ${seat}，等待房主开始本局`
      : `${state.players[seat].name} 加入座位 ${seat}`;
    addLog(`${state.players[seat].name} 加入座位 ${seat}${moved ? `（原座位 ${requestedSeat} 已占用，自动分配）` : ""}。`);
    render();
    return;
  }
  if (message.type === "peerLeft" && online.isHost) {
    const seat = online.clientSeats[message.clientId];
    delete online.clientSeats[message.clientId];
    if (seat) {
      delete online.seatClients[seat];
      if (state.players[seat]) {
        state.players[seat].human = false;
        state.players[seat].name = `人机 ${seat}`;
      }
      delete online.readySeats[seat];
      addLog(`座位 ${seat} 的玩家离开，已改由人机接管。`);
      render();
    }
    return;
  }
  if (message.type === "clientMessage" && online.isHost) {
    handleRemoteAction(message.clientId, message.payload);
    return;
  }
  if (message.type === "snapshot") {
    const previousSeat = online.seat;
    loadState(message.state);
    online.seat = message.seat;
    online.roomId = message.roomId || online.roomId;
    online.waitingRoom = !!message.waitingRoom;
    online.readySeats = message.readySeats || {};
    if (state.players[online.seat] && !el.nameInput.value.trim()) el.nameInput.value = state.players[online.seat].name;
    if (previousSeat && previousSeat !== online.seat) {
      state.tableNotice = `你选择的座位已占用，已自动进入座位 ${online.seat}`;
    }
    render();
    updateOnlineStatus();
    return;
  }
  if (message.type === "error") updateOnlineStatus(message.message);
}

function handleRemoteAction(clientId, message) {
  const seat = online.clientSeats[clientId];
  const player = state.players[seat];
  if (!player) return;
  if (message.action === "rename") {
    renameSeat(seat, message.name);
    render();
    return;
  }
  if (message.action === "ready") {
    if (!online.waitingRoom) return;
    setSeatReady(seat, !!message.ready);
    return;
  }
  if (message.action === "snowChoice") {
    if (!state.pendingSnowChoice || player.team !== state.pendingSnowChoice.winnerTeam || player.finished) return;
    chooseSnowChoice(message.choice);
    return;
  }
  if (message.action === "reveal") {
    if (online.waitingRoom) return;
    decidePlayerBigReveal(player, Number(message.count));
    render();
    return;
  }
  if (message.action === "pass") {
    if (state.current === seat) pass(player);
    render();
    return;
  }
  if (message.action === "play") {
    if (state.current !== seat) return;
    const ids = new Set(message.cardIds || []);
    const cards = player.hand.filter(card => ids.has(card.id));
    playCards(player, cards);
    render();
  }
}

function updateOnlineStatus(extra = "") {
  if (!online.connected) {
    el.onlineStatus.textContent = extra || "本地人机模式";
    return;
  }
  if (online.isHost) {
    const phase = online.waitingRoom ? "等待开始" : "游戏中";
    const seats = Object.keys(online.seatClients).sort()
      .map(seat => `${seat}号 ${state.players[seat]?.name || `玩家 ${seat}`} ${online.waitingRoom ? (online.readySeats[seat] ? "已准备" : "未准备") : ""}`.trim())
      .join("、") || "暂无真人加入";
    const hostReady = online.waitingRoom ? ` · 房主${online.readySeats[0] ? "已准备" : "未准备"}` : "";
    el.onlineStatus.textContent = `房号 ${online.roomId || "生成中"} · ${phase}${hostReady} · ${state.players[0]?.name || "房主"}是房主 · ${seats}`;
  } else {
    const readyText = online.waitingRoom ? ` · ${online.readySeats[online.seat] ? "已准备" : "未准备"}` : "";
    el.onlineStatus.textContent = extra || `房号 ${online.roomId} · ${state.players[online.seat]?.name || "你"}在座位 ${online.seat}${readyText}`;
  }
}

startGame({ resetMatch: true });
