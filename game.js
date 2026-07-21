const RANKS = ["4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const SEQ_RANKS = RANKS.slice(0, 11);
const RANK_VALUE = Object.fromEntries(RANKS.map((rank, index) => [rank, index + 1]));
const SUITS = ["♠", "♥", "♣", "♦"];
const RED_SUITS = new Set(["♥", "♦"]);
const bootParams = new URLSearchParams(window.location.search);
const isMiniProgramView = bootParams.get("mini") === "1";
if (isMiniProgramView) {
  document.body.dataset.miniapp = "true";
  updateMiniViewportSize();
  window.addEventListener("resize", updateMiniViewportSize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateMiniViewportSize);
    window.visualViewport.addEventListener("scroll", updateMiniViewportSize);
  }
  requestAnimationFrame(updateMiniViewportSize);
  setTimeout(updateMiniViewportSize, 300);
  setTimeout(updateMiniViewportSize, 1000);
}

function updateMiniViewportSize() {
  if (!isMiniProgramView) return;
  const viewport = window.visualViewport;
  const width = Math.max(1, Math.round((viewport && viewport.width) || window.innerWidth || document.documentElement.clientWidth || screen.width));
  const height = Math.max(1, Math.round((viewport && viewport.height) || window.innerHeight || document.documentElement.clientHeight || screen.height));
  document.documentElement.style.setProperty("--mini-vw", `${width}px`);
  document.documentElement.style.setProperty("--mini-vh", `${height}px`);
  if (document.body) {
    document.body.style.setProperty("--mini-vw", `${width}px`);
    document.body.style.setProperty("--mini-vh", `${height}px`);
    document.body.dataset.miniReady = "true";
  }
}

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
  tablePlayLayer: document.querySelector("#tablePlayLayer"),
  currentPlay: document.querySelector("#currentPlay"),
  log: document.querySelector("#log"),
  playBtn: document.querySelector("#playBtn"),
  passBtn: document.querySelector("#passBtn"),
  teammateBtn: document.querySelector("#teammateBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  gameMenu: document.querySelector("#gameMenu"),
  menuDragHandle: document.querySelector("#menuDragHandle"),
  menuShrinkBtn: document.querySelector("#menuShrinkBtn"),
  menuGrowBtn: document.querySelector("#menuGrowBtn"),
  menuToggleBtn: document.querySelector("#menuToggleBtn"),
  newGameBtn: document.querySelector("#newGameBtn"),
  nextRoundBtn: document.querySelector("#nextRoundBtn"),
  autoBtn: document.querySelector("#autoBtn"),
  hostBtn: document.querySelector("#hostBtn"),
  joinBtn: document.querySelector("#joinBtn"),
  readyBtn: document.querySelector("#readyBtn"),
  startOnlineBtn: document.querySelector("#startOnlineBtn"),
  renameBtn: document.querySelector("#renameBtn"),
  inviteBtn: document.querySelector("#inviteBtn"),
  nameInput: document.querySelector("#nameInput"),
  roomInput: document.querySelector("#roomInput"),
  seatSelect: document.querySelector("#seatSelect"),
  onlineStatus: document.querySelector("#onlineStatus"),
  joinOverlay: document.querySelector("#joinOverlay"),
  joinOverlayTitle: document.querySelector("#joinOverlayTitle"),
  joinOverlayText: document.querySelector("#joinOverlayText"),
  inviteJoinDialog: document.querySelector("#inviteJoinDialog"),
  inviteRoomLabel: document.querySelector("#inviteRoomLabel"),
  inviteNameInput: document.querySelector("#inviteNameInput"),
  inviteJoinBtn: document.querySelector("#inviteJoinBtn"),
  settlementOverlay: document.querySelector("#settlementOverlay"),
  settlementResult: document.querySelector("#settlementResult"),
  settlementTitle: document.querySelector("#settlementTitle"),
  settlementRows: document.querySelector("#settlementRows"),
  settlementNextBtn: document.querySelector("#settlementNextBtn")
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
  waitingRoom: false,
  joining: false,
  hasSnapshot: false,
  snapshotQueued: false,
  pendingSnapshot: null,
  connectionPromise: null,
  pendingRole: ""
};

let menuMode = "full";
let menuScale = 1;
let menuPosition = { left: 18, top: 62 };
let menuDragging = null;
let teammateView = false;

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
  return ((el.nameInput && el.nameInput.value) || "").trim() || "你";
}

function cleanPlayerName(name, fallback = "玩家") {
  return String(name || "").trim().slice(0, 10) || fallback;
}

function cleanAvatarUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("/uploads/")) return value;
  if (/^https:\/\/[a-z0-9.-]+\/uploads\/[-a-z0-9._%]+$/i.test(value)) return value;
  return "";
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function localSeat() {
  return online.connected ? online.seat : 0;
}

function localPlayer() {
  return state.players[localSeat()] || state.players[0];
}

function relativeSeatIndex(seat) {
  return (Number(seat) - localSeat() + 5) % 5;
}

function isHostRuntime() {
  return !online.connected || online.isHost;
}

function isOnlineRoomMember() {
  return online.connected && !!online.roomId;
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

function preservedOnlineProfiles() {
  const profiles = {};
  state.players.forEach((player, index) => {
    if (!player) return;
    profiles[index] = { name: player.name, avatarUrl: player.avatarUrl || "" };
  });
  return profiles;
}

function playerProfileForSeat(seat, fallbackName = "", profiles = {}) {
  const profile = profiles[seat] || {};
  return {
    name: profile.name || fallbackName,
    avatarUrl: cleanAvatarUrl(profile.avatarUrl)
  };
}

function isOnlineHumanSeat(index) {
  if (!online.connected) return index === 0;
  if (index === 0 && online.isHost) return true;
  return Object.prototype.hasOwnProperty.call(online.seatClients, index);
}

function makeLobbyPlayer(index, name, profiles = {}) {
  const profile = playerProfileForSeat(index, name || (index === 0 ? playerNameFallback() : `人机 ${index}`), profiles);
  return {
    id: index,
    name: profile.name,
    avatarUrl: profile.avatarUrl,
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
  const preservedProfiles = { ...preservedOnlineProfiles(), ...(options.preserveProfiles || {}) };
  const preservedNames = { ...preservedOnlineNames(), ...(options.preserveNames || {}) };
  Object.keys(preservedNames).forEach(seat => {
    preservedProfiles[seat] = { ...(preservedProfiles[seat] || {}), name: preservedNames[seat] };
  });
  state.players = Array.from({ length: 5 }, (_, index) => makeLobbyPlayer(index, preservedNames[index], preservedProfiles));
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
  const preservedProfiles = { ...preservedOnlineProfiles(), ...(options.preserveProfiles || {}) };
  const preservedNames = { ...preservedOnlineNames(), ...(options.preserveNames || {}) };
  Object.keys(preservedNames).forEach(seat => {
    preservedProfiles[seat] = { ...(preservedProfiles[seat] || {}), name: preservedNames[seat] };
  });
  const deck = shuffle(makeDeck());
  state.players = Array.from({ length: 5 }, (_, index) => ({
    id: index,
    name: playerProfileForSeat(index, preservedNames[index] || (index === 0 ? playerNameFallback() : `人机 ${index}`), preservedProfiles).name,
    avatarUrl: playerProfileForSeat(index, preservedNames[index] || (index === 0 ? playerNameFallback() : `人机 ${index}`), preservedProfiles).avatarUrl,
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
    return { valid: true, type: "singleSeq", name: `单顺 ${ranks.join("")}`, length: cards.length, high: RANK_VALUE[ranks[ranks.length - 1]], cards };
  }
  if (cards.length >= 6 && cards.length % 2 === 0 && ranks.every(rank => counts.get(rank) === 2) && isContinuous(ranks)) {
    return { valid: true, type: "doubleSeq", name: `双顺 ${ranks.join("")}`, length: ranks.length, high: RANK_VALUE[ranks[ranks.length - 1]], cards };
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
  if (player.finished) return { ok: false, reason: "你已经出完手牌。" };
  if (state.pendingSnowChoice) return { ok: false, reason: "等待胜利阵营选择雪或不雪。" };
  if (!state.currentPlay) clearCurrentTrickPlays();
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
  }
  checkWin();
}

function pass(player) {
  if (state.pendingSnowChoice) return;
  if (player.finished) return;
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
  clearCurrentTrickPlays();
  state.current = nextLeaderAfterTrick(winner);
  state.leader = state.current;
  checkWin();
  render();
  maybeBotTurn();
}

function clearCurrentTrickPlays() {
  state.players.forEach(player => {
    player.lastPlay = null;
  });
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
    if (state.scores[team] >= 180 && hasAnyHeadRunner() && allPointsAwarded()) {
      endRound(`已有头跑且 200 分已全部分完，${teamName(team)}达到 180 分，直接小雪。`, team, 2);
      return;
    }
    if (!state.snowChasingTeam && headRunnerTeam() === team && state.scores[team] >= 90) {
      offerSnowChoiceOrEnd(`${teamName(team)}已有头跑且达到 90 分，已满足胜利条件。`, team);
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

function hasAnyHeadRunner() {
  return state.finishedOrder.length > 0;
}

function headRunnerTeam() {
  const first = state.players[state.finishedOrder[0]];
  return (first && first.team) || null;
}

function allPointsAwarded() {
  return state.scores.king + state.scores.plain >= 200 && state.trickPoints === 0;
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
      const multiplier = state.scores[rival] === 0 ? 4 : 2;
      endRound(`${message} ${teamName(winnerTeam)}已全部出完，对方未免雪，直接${multiplier === 4 ? "大雪" : "小雪"}。`, winnerTeam, multiplier);
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
  if ((state.players[state.current] && state.players[state.current].finished)) {
    if (state.currentPlay && !anyActivePlayerCanBeatCurrentPlay()) {
      addLog(`${state.players[state.current].name}已出完，且无人能管最后出的${state.currentPlay.name}，直接交出牌权。`);
      awardTrick();
      return;
    }
    nextTurn();
    return;
  }
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
  if (state.roundSettled && !state.continuingForNextLead) {
    setTimeout(render, 0);
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
  const bigCount = (player.bigCardIds && player.bigCardIds.size) || 0;
  const playerRevealCount = [...(player.revealedBigs || [])].filter(id => (player.bigCardIds && player.bigCardIds.has(id))).length;
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
    return ((legal.find(item => item.play.type !== "bomb") || {}).cards || (legal[0] && legal[0].cards) || []);
  }
  return (legal[0] && legal[0].cards) || [];
}

function anyActivePlayerCanBeatCurrentPlay() {
  if (!state.currentPlay) return true;
  return state.players
    .filter(player => !player.finished && player.id !== state.lastPlayer)
    .some(player => generateMoves(player.hand).some(cards => canBeat(classify(cards), state.currentPlay).ok));
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
  return (card && card.joker) === "big" && revealedBigIds().has(card.id);
}

function isBigDecided(card) {
  return (card && card.joker) === "big" && state.bigRevealDecisions.has(card.id);
}

function cardLabel(card) {
  if ((card && card.joker) === "big") {
    if (isBigRevealed(card)) return "亮大王";
    if (!state.revealPhase || isBigDecided(card) || state.hasPlayed) return "暗大王";
    return "大王";
  }
  return card.rank;
}

function cardStateClass(card) {
  if ((card && card.joker) !== "big") return "";
  if (isBigRevealed(card)) return " brightBig";
  if (!state.revealPhase || isBigDecided(card) || state.hasPlayed) return " darkBig";
  return "";
}

function jokerKindClass(card) {
  if ((card && card.joker) === "big") return " bigJoker";
  if ((card && card.joker) === "small") return " smallJoker";
  return "";
}

function jokerFaceHtml(card) {
  const title = card.joker === "small" ? "小王" : cardLabel(card);
  return `<div class="jokerFace">
    <span class="jokerWord jokerWordLeft">JOKER</span>
    <span class="jokerTitle">${title}</span>
    <span class="jokerConfetti confettiOne"></span>
    <span class="jokerConfetti confettiTwo"></span>
    <span class="jokerConfetti confettiThree"></span>
    <span class="jokerFigure">
      <span class="jokerHat"></span>
      <span class="jokerHead"></span>
      <span class="jokerBody"></span>
      <span class="jokerLegs"></span>
    </span>
    <span class="jokerWord jokerWordRight">JOKER</span>
  </div>`;
}

function jokerTableFaceHtml(card) {
  const title = card.joker === "small" ? "小王" : cardLabel(card);
  return `<div class="jokerTableFace">
    <span>JOKER</span>
    <strong>${title}</strong>
  </div>`;
}

function addLog(text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 80);
}

function render() {
  ensureSettlementOverlayInBody();
  updateActionVisibility();
  renderTable();
  renderTablePlayLayer();
  renderHand();
  renderPanels();
  renderSettlementOverlay();
  broadcastSnapshot();
}

function ensureSettlementOverlayInBody() {
  if (!el.settlementOverlay) {
    el.settlementOverlay = document.createElement("section");
    el.settlementOverlay.id = "settlementOverlay";
    el.settlementOverlay.className = "settlementOverlay";
    el.settlementOverlay.setAttribute("aria-live", "polite");
    el.settlementOverlay.innerHTML = `
      <div class="settlementPanel">
        <div class="settlementResult" id="settlementResult">胜利</div>
        <div class="settlementBoard">
          <div class="settlementTitle" id="settlementTitle">本局结算</div>
          <div class="settlementHead">
            <span>玩家</span>
            <span>阵营</span>
            <span>本局</span>
            <span>总分</span>
          </div>
          <div id="settlementRows" class="settlementRows"></div>
        </div>
        <button id="settlementNextBtn" class="settlementNextBtn">下一局</button>
      </div>
    `;
    document.body.appendChild(el.settlementOverlay);
    el.settlementResult = el.settlementOverlay.querySelector("#settlementResult");
    el.settlementTitle = el.settlementOverlay.querySelector("#settlementTitle");
    el.settlementRows = el.settlementOverlay.querySelector("#settlementRows");
    el.settlementNextBtn = el.settlementOverlay.querySelector("#settlementNextBtn");
    el.settlementNextBtn.addEventListener("click", () => {
      if (online.connected && !online.isHost) return;
      el.nextRoundBtn.click();
    });
  }
  if (el.settlementOverlay && el.settlementOverlay.parentElement !== document.body) {
    document.body.appendChild(el.settlementOverlay);
  }
}

function updateActionVisibility() {
  const human = localPlayer();
  const actionMode = currentActionMode();
  document.body.dataset.actionVisible = shouldShowActionButtons(actionMode, human) ? "true" : "false";
}

function applyMenuLayout() {
  if (!el.gameMenu) return;
  const maxLeft = Math.max(8, window.innerWidth - 90);
  const maxTop = Math.max(8, window.innerHeight - 80);
  menuPosition.left = Math.min(Math.max(8, menuPosition.left), maxLeft);
  menuPosition.top = Math.min(Math.max(8, menuPosition.top), maxTop);
  el.gameMenu.style.setProperty("--menu-left", `${menuPosition.left}px`);
  el.gameMenu.style.setProperty("--menu-top", `${menuPosition.top}px`);
  el.gameMenu.style.setProperty("--menu-scale", menuScale.toFixed(2));
}

function serializeState() {
  return JSON.stringify(state, (key, value) => value instanceof Set ? { __set: [...value] } : value);
}

function loadState(serialized) {
  const next = JSON.parse(serialized, (key, value) => value && value.__set ? new Set(value.__set) : value);
  Object.assign(state, next);
}

function setJoining(active, title = "正在加入房间", text = "正在连接服务器并等待房主同步牌局...") {
  online.joining = !!active;
  document.body.dataset.joining = active ? "true" : "false";
  if (el.joinOverlayTitle) el.joinOverlayTitle.textContent = title;
  if (el.joinOverlayText) el.joinOverlayText.textContent = text;
  if (el.hostBtn) el.hostBtn.disabled = !!active || isOnlineRoomMember();
  if (el.joinBtn) el.joinBtn.disabled = !!active || isOnlineRoomMember();
}

function scheduleSnapshotApply(message) {
  online.pendingSnapshot = message;
  if (online.snapshotQueued) return;
  online.snapshotQueued = true;
  requestAnimationFrame(() => {
    online.snapshotQueued = false;
    const snapshot = online.pendingSnapshot;
    online.pendingSnapshot = null;
    if (!snapshot) return;
    applySnapshot(snapshot);
  });
}

function applySnapshot(message) {
  const previousSeat = online.seat;
  loadState(message.state);
  online.seat = message.seat;
  online.roomId = message.roomId || online.roomId;
  online.waitingRoom = !!message.waitingRoom;
  online.readySeats = message.readySeats || {};
  online.hasSnapshot = true;
  if (state.players[online.seat] && !el.nameInput.value.trim()) el.nameInput.value = state.players[online.seat].name;
  if (previousSeat && previousSeat !== online.seat) {
    state.tableNotice = `你选择的座位已占用，已自动进入座位 ${online.seat}`;
  }
  setJoining(false);
  render();
  updateOnlineStatus();
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
      .map(seat => `${(state.players[seat] && state.players[seat].name) || `玩家 ${seat}`}：${online.readySeats[seat] ? "已准备" : "未准备"}`)
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
    : `<div class="centerLine">轮到：<strong>${(player && player.name) || "无"}</strong></div>`;
  const settlement = state.roundSettled
    ? `<div class="settlementStrip">${state.lastSettlement.map(item => `<span>${item.name} 总分 ${item.total} 本局 ${formatSigned(item.delta)}</span>`).join("")}</div>`
    : "";
  const snowChoice = state.pendingSnowChoice
    ? `<div class="centerLine"><strong>${teamName(state.pendingSnowChoice.winnerTeam)}</strong> 未出完玩家可选择雪或不雪</div>`
    : "";
  if (isMiniProgramView) {
    const turnText = state.revealPhase || state.gameOver && !state.continuingForNextLead
      ? ""
      : `轮到：${(player && player.name) || "无"}`;
    const snowText = state.pendingSnowChoice ? `${teamName(state.pendingSnowChoice.winnerTeam)}选择雪局` : "";
    el.tableCenter.innerHTML = `
      <div class="trickScoreBadge">${state.trickPoints}<span>分</span></div>
      <div class="centerLine">${snowText || turnText || state.tableNotice || phase}</div>
    `;
    return;
  }
  el.tableCenter.innerHTML = `
    <div class="trickScoreBadge">${state.trickPoints}<span>分</span></div>
    ${current}
    <div class="centerLine">${state.tableNotice || phase} · 大王 ${remainingBigCount()} 张</div>
    ${snowChoice}
  `;
}

function renderTablePlayLayer() {
  if (!el.tablePlayLayer) return;
  if (online.connected && online.waitingRoom) {
    el.tablePlayLayer.innerHTML = "";
    return;
  }
  const hasPlay = state.players.some(player => player.lastPlay);
  if (!hasPlay) {
    el.tablePlayLayer.innerHTML = "";
    return;
  }
  const slots = [
    ["50%", "66%"],
    ["31%", "55%"],
    ["43%", "37%"],
    ["62%", "37%"],
    ["75%", "55%"]
  ];
  el.tablePlayLayer.innerHTML = state.players.map((player, index) => {
    const slotIndex = relativeSeatIndex(index);
    const play = player.lastPlay;
    const hideStaleSelfPlay = play && state.current === player.id && player.id !== state.lastPlayer;
    const content = !play || hideStaleSelfPlay
      ? ""
      : play.cards.length
      ? `${isMiniProgramView ? "" : `<div class="tablePlayTitle">${player.name} · ${play.name}</div>`}<div class="tablePlayCards">${play.cards.map(tableCard).join("")}</div>`
      : `<div class="tablePlayPass">${player.name} · 过</div>`;
    return `<div class="tablePlaySlot slot${slotIndex}" style="left:${slots[slotIndex][0]};top:${slots[slotIndex][1]}">${content}</div>`;
  }).join("");
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
    ["50%", "78%"],
    ["18%", "58%"],
    ["40%", "18%"],
    ["62%", "18%"],
    ["84%", "58%"]
  ];
  const seats = state.players.map((player, index) => {
    const seatIndex = relativeSeatIndex(index);
    const isTurn = index === state.current && (!state.gameOver || state.continuingForNextLead);
    const team = online.connected && online.waitingRoom
      ? (player.human ? (online.readySeats[index] ? "已准备" : "未准备") : "人机候补")
      : player.id === localSeat() ? teamName(player.team) : visibleTeam(player);
    const revealHands = shouldRevealHands();
    const handPreview = revealHands && player.hand.length
      ? `<div class="miniCards revealedHand">${player.hand.map(tinyCard).join("")}</div>`
      : player.id === localSeat() ? "" : `<div class="miniCards">${Array.from({ length: Math.min(player.hand.length, 10) }, () => `<span class="backCard"></span>`).join("")}</div>`;
    const revealMark = player.revealAnnouncement ? `<div class="revealMark">${player.revealAnnouncement}${revealedBigStatus(player)}</div>` : "";
    const roundScoreText = `${player.score}分`;
    const avatarStyle = player.avatarUrl ? ` style="background-image:url('${escapeAttr(player.avatarUrl)}')"` : "";
    return `<article class="seat seat${seatIndex}" style="left:${positions[seatIndex][0]};top:${positions[seatIndex][1]}">
      <div class="seatTopInfo"><span>${team}</span><b>${roundScoreText}</b></div>
      <div class="seatAvatar"${avatarStyle}></div>
      <div class="name">${isTurn ? "▶" : ""}${player.name}</div>
      <div class="cardCountBadge">${player.hand.length}</div>
      <div class="scoreTag">${player.score} 分</div>
      <div class="meta">${player.finished ? "已出完" : ""}</div>
      ${revealMark}
      ${handPreview}
    </article>`;
  }).join("");
  el.table.innerHTML = `${tableTeamScoreMarkup()}${seats}<div class="tableCenter" id="tableCenter"></div>`;
  el.tableCenter = document.querySelector("#tableCenter");
  renderTableCenter();
}

function tableTeamScoreMarkup() {
  const revealScores = state.roundSettled || (state.gameOver && !state.continuingForNextLead) || allTeamsDetermined();
  const king = revealScores ? state.scores.king : "未知";
  const plain = revealScores ? state.scores.plain : "未知";
  return `
    <div class="tableScoreStrip">
      <span>王队 <b>${king}</b></span>
      <span>平民 <b>${plain}</b></span>
    </div>
  `;
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
  return ((state.publicBigIds && state.publicBigIds.size) || 0) >= 2;
}

function renderHand() {
  const human = localPlayer();
  if (online.connected && online.waitingRoom) {
    el.hand.innerHTML = "";
    renderSelection();
    return;
  }
  if (human.finished) {
    state.selected.clear();
    if (!canViewTeammateHands()) teammateView = false;
    el.hand.innerHTML = teammateView
      ? teammateHandsHtml(human)
      : `<div class="finishedView">
          <strong>你已出完手牌</strong>
          <span>${allTeamsDetermined() ? "可以查看同阵营玩家的手牌。" : "阵营未明确，暂时不能查看队友牌。"}</span>
        </div>`;
    renderSelection();
    return;
  }
  teammateView = false;
  sortHand(human.hand);
  el.hand.innerHTML = human.hand.map(card => {
    const selected = state.selected.has(card.id) ? " selected" : "";
    const color = card.color === "red" ? " red" : card.color === "joker" ? " joker" : "";
    const yaoHint = hasYaoHint(human.hand) && (card.rank === "A" || card.rank === "4") ? " yaoHint" : "";
    const bigState = cardStateClass(card);
    const jokerKind = jokerKindClass(card);
    const pointBadge = card.points ? `<div class="pointBadge">分</div>` : "";
    if (card.joker) {
      return `<div class="card${selected} joker${bigState}${jokerKind}" data-id="${card.id}">
        ${jokerFaceHtml(card)}
      </div>`;
    }
    return `<div class="card${selected}${color}${yaoHint}${bigState}" data-id="${card.id}" data-suit="${card.suit}">
      <div class="cardCorner cardCornerTop"><span>${cardLabel(card)}</span><i>${card.suit}</i></div>
      <div class="suit">${card.suit}</div>
      ${pointBadge}
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

function canViewTeammateHands() {
  const human = localPlayer();
  return !!(human && human.finished) && allTeamsDetermined() && !online.waitingRoom;
}

function teammateHandsHtml(human) {
  const teammates = state.players.filter(player => player.id !== human.id && player.team === human.team);
  if (!teammates.length) {
    return `<div class="finishedView"><strong>没有队友可查看</strong></div>`;
  }
  return `<div class="teammateHands">${teammates.map(player => {
    const cards = [...player.hand];
    sortHand(cards);
    const hand = cards.length
      ? cards.map(tinyCard).join("")
      : `<span class="emptyHand">已出完</span>`;
    return `<section class="teammateHand">
      <strong>${player.name}<em>${player.hand.length} 张</em></strong>
      <div class="teammateCards">${hand}</div>
    </section>`;
  }).join("")}</div>`;
}

function renderSelection() {
  if (online.connected && online.waitingRoom) {
    document.body.dataset.actionVisible = "false";
    el.selectionInfo.textContent = "房间准备中，开始本局后才会发牌。";
    el.playBtn.textContent = "出牌";
    el.passBtn.textContent = "过";
    el.clearBtn.textContent = "取消选择";
    el.playBtn.disabled = true;
    el.passBtn.disabled = true;
    el.clearBtn.disabled = true;
    el.clearBtn.hidden = false;
    el.teammateBtn.disabled = true;
    el.teammateBtn.hidden = true;
    return;
  }
  const human = localPlayer();
  const actionMode = currentActionMode();
  document.body.dataset.actionVisible = shouldShowActionButtons(actionMode, human) ? "true" : "false";
  renderActionButtons(actionMode);
  if (actionMode.type === "reveal") {
    el.selectionInfo.textContent = actionMode.count >= 2 ? "请选择亮王数量。" : "请选择亮或不亮大王。";
    return;
  }
  if (actionMode.type === "snow") {
    el.selectionInfo.textContent = "请选择雪或不雪。";
    return;
  }
  const canSeeTeammates = canViewTeammateHands();
  el.teammateBtn.hidden = !human.finished;
  el.teammateBtn.disabled = human.finished && !canSeeTeammates;
  el.teammateBtn.textContent = human.finished
    ? (canSeeTeammates ? (teammateView ? "返回自己视角" : "查看队友牌") : "阵营未明确")
    : "查看队友牌";
  if (human.finished) {
    el.selectionInfo.textContent = canSeeTeammates
      ? (teammateView ? "正在查看队友牌。" : "你已出完，可以查看队友牌。")
      : "你已出完。阵营未明确前不能查看队友牌。";
    el.playBtn.disabled = true;
    el.passBtn.disabled = true;
    el.clearBtn.disabled = true;
    return;
  }
  const cards = selectedCards();
  const play = classify(cards);
  const beat = canBeat(play, state.currentPlay);
  el.selectionInfo.textContent = play.valid
    ? `${play.name}：${beat.ok ? `可以出${playStrengthText(play)}` : beat.reason}`
    : play.reason;
  const humanTurn = !human.finished && !state.pendingSnowChoice && !state.revealPhase && state.current === localSeat() && (!state.gameOver || state.continuingForNextLead);
  el.playBtn.disabled = !humanTurn || !beat.ok || !cards.length;
  el.passBtn.disabled = !humanTurn || !state.currentPlay;
  el.clearBtn.disabled = false;
}

function undecidedLocalBigs() {
  const human = localPlayer();
  return human.hand.filter(card => card.joker === "big" && !state.bigRevealDecisions.has(card.id));
}

function currentActionMode() {
  const human = localPlayer();
  if (state.revealPhase && !online.waitingRoom) {
    const undecided = undecidedLocalBigs();
    if (undecided.length) return { type: "reveal", count: undecided.length };
  }
  if (state.pendingSnowChoice && human.team === state.pendingSnowChoice.winnerTeam && !human.finished) {
    return { type: "snow" };
  }
  return { type: "play" };
}

function shouldShowActionButtons(mode, human) {
  if (!human || online.waitingRoom) return false;
  if (mode.type === "reveal" || mode.type === "snow") return true;
  if (human.finished) return canViewTeammateHands();
  return !state.pendingSnowChoice
    && !state.revealPhase
    && state.current === localSeat()
    && (!state.gameOver || state.continuingForNextLead);
}

function renderActionButtons(mode) {
  el.playBtn.classList.toggle("primary", mode.type !== "snow");
  if (mode.type === "reveal") {
    el.playBtn.textContent = mode.count >= 2 ? "亮一张" : "亮";
    el.passBtn.textContent = mode.count >= 2 ? "都不亮" : "不亮";
    el.clearBtn.textContent = "亮两张";
    el.playBtn.disabled = false;
    el.passBtn.disabled = false;
    el.clearBtn.disabled = mode.count < 2;
    el.clearBtn.hidden = mode.count < 2;
    el.teammateBtn.hidden = true;
    return;
  }
  if (mode.type === "snow") {
    el.playBtn.textContent = "雪";
    el.passBtn.textContent = "不雪";
    el.clearBtn.textContent = "取消选择";
    el.playBtn.disabled = false;
    el.passBtn.disabled = false;
    el.clearBtn.disabled = true;
    el.clearBtn.hidden = true;
    el.teammateBtn.hidden = true;
    return;
  }
  el.playBtn.textContent = "出牌";
  el.passBtn.textContent = "过";
  el.clearBtn.textContent = "取消选择";
  el.clearBtn.hidden = false;
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
  const tableOnly = !online.waitingRoom;
  document.body.dataset.tableOnly = tableOnly ? "true" : "false";
  document.body.dataset.menu = menuMode;
  applyMenuLayout();
  el.menuToggleBtn.textContent = menuMode === "full" ? "缩小菜单" : menuMode === "mini" ? "收起菜单" : "展开菜单";
  el.newGameBtn.disabled = online.connected && !online.isHost;
  el.nextRoundBtn.disabled = online.waitingRoom || !state.gameOver || state.continuingForNextLead || state.revealPhase;
  if (online.connected && !online.isHost) el.nextRoundBtn.disabled = true;
  el.readyBtn.disabled = !online.connected || !online.waitingRoom;
  el.readyBtn.textContent = online.readySeats[localSeat()] ? "取消准备" : "准备";
  el.startOnlineBtn.disabled = !online.connected || !online.isHost || !online.waitingRoom || !allJoinedPlayersReady();
  if (el.inviteBtn) el.inviteBtn.disabled = !online.connected || !online.isHost || !online.roomId;
  if (el.hostBtn) el.hostBtn.disabled = online.joining || isOnlineRoomMember();
  if (el.joinBtn) el.joinBtn.disabled = online.joining || isOnlineRoomMember();
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
    ? `房间准备中<br>${humanSeatsInRoom().map(seat => `${(state.players[seat] && state.players[seat].name) || `玩家 ${seat}`}：${online.readySeats[seat] ? "已准备" : "未准备"}`).join("<br>")}`
    : state.revealPhase
    ? `亮王阶段<br>已亮大王：${bigRevealCount()} 张`
    : state.continuingForNextLead
    ? `本局已结算，继续找头走<br>轮到：<strong>${player.name}</strong><br>头走将作为下一局先手`
    : state.gameOver && !state.continuingForNextLead
    ? `本局已结束。<br>下一局先手：${(state.players[state.firstFinisherNext] && state.players[state.firstFinisherNext].name) || "未定"}`
    : `轮到：<strong>${player.name}</strong><br>先手：${(state.players[state.leader] && state.players[state.leader].name) || "无"}<br>已亮大王：${bigRevealCount()} 张`;
  el.currentPlay.innerHTML = state.currentPlay
    ? `<strong>${state.players[state.lastPlayer].name}</strong><br>${state.currentPlay.name}<div class="playedCards">${state.currentPlay.cards.map(tinyCard).join("")}</div>`
    : state.revealPhase ? "等待亮王阶段结束。" : "新回合，任意合法牌型都可以出。";
  el.log.innerHTML = state.log.map(item => `<div class="logItem">${item}</div>`).join("");
  renderRevealBox();
}

function renderSettlementOverlay() {
  if (!el.settlementOverlay) return;
  ensureSettlementDataForDisplay();
  const show = shouldShowSettlementOverlay();
  document.body.dataset.settlement = show ? "true" : "false";
  el.settlementOverlay.classList.toggle("show", show);
  applySettlementOverlayStyle(show);
  if (!show) return;
  const local = localPlayer();
  const localSettlement = state.lastSettlement.find(item => item.playerId === (local && local.id));
  const localDelta = (localSettlement && localSettlement.delta) || 0;
  const winnerItem = state.lastSettlement.find(item => item.delta > 0);
  const winnerPlayer = state.players[(winnerItem && winnerItem.playerId)];
  const winnerTeam = (winnerPlayer && winnerPlayer.team) || (localDelta >= 0 ? (local && local.team) : opponentTeam((local && local.team)));
  const localWon = localDelta >= 0;
  if (el.settlementResult) {
    el.settlementResult.textContent = localWon ? "胜利" : "失败";
    el.settlementResult.dataset.result = localWon ? "win" : "lose";
  }
  if (el.settlementTitle) {
    el.settlementTitle.textContent = state.tableNotice || `${teamName(winnerTeam)}获胜 · 本局结算`;
  }
  const settlementHead = el.settlementOverlay.querySelector(".settlementHead");
  if (settlementHead) {
    settlementHead.innerHTML = "<span>昵称</span><span>阵营</span><span>本局得失</span><span>总分</span>";
  }
  if (el.settlementRows) {
    el.settlementRows.innerHTML = state.lastSettlement.map(item => {
      const player = state.players[item.playerId];
      const isSelf = item.playerId === (local && local.id);
      const deltaClass = item.delta >= 0 ? "plus" : "minus";
      return `
        <div class="settlementRow ${isSelf ? "self" : ""}">
          <span><b>${isSelf ? "你" : (player && player.name) || item.name}</b><small>${isSelf ? item.name : "玩家"}</small></span>
          <span>${teamName((player && player.team))}</span>
          <span class="${deltaClass}">${formatSigned(item.delta)}</span>
          <span>${item.total}</span>
        </div>
      `;
    }).join("");
  }
  if (el.settlementNextBtn) {
    const waitingForHeadRunner = state.continuingForNextLead;
    el.settlementNextBtn.disabled = waitingForHeadRunner || online.connected && !online.isHost;
    el.settlementNextBtn.textContent = waitingForHeadRunner
      ? "等待头跑"
      : online.connected && !online.isHost
      ? "等待房主下一局"
      : "下一局";
  }
}

function shouldShowSettlementOverlay() {
  if (online.waitingRoom || state.pendingSnowChoice) return false;
  if (state.roundSettled || state.lastSettlement.length > 0) return true;
  return isFinalSettlementNotice(state.tableNotice);
}

function isFinalSettlementNotice(notice) {
  return /获胜|结算|小雪|大雪|无雪|免雪/.test(String(notice || ""));
}

function ensureSettlementDataForDisplay() {
  if (state.lastSettlement.length > 0) return;
  if (state.pendingSnowChoice) return;
  if (!state.roundSettled && !isFinalSettlementNotice(state.tableNotice)) return;
  state.roundSettled = true;
  state.lastSettlement = state.players.map(player => {
    const delta = player.roundDelta || 0;
    const total = player.matchScore != null ? player.matchScore : (state.playerMatch[player.id] != null ? state.playerMatch[player.id] : 0);
    return { playerId: player.id, name: player.name, delta, total, base: 0 };
  });
}

function applySettlementOverlayStyle(show) {
  if (!el.settlementOverlay) return;
  Object.assign(el.settlementOverlay.style, show ? {
    display: "flex",
    position: "fixed",
    inset: "0",
    zIndex: "2147483000",
    visibility: "visible",
    opacity: "1",
    pointerEvents: "auto"
  } : {
    display: "",
    visibility: "",
    opacity: "",
    pointerEvents: ""
  });
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
      el.revealBox.innerHTML = `${teamName(pending.winnerTeam)}已满足胜利条件，对方未免雪。请在手牌栏选择雪或不雪。`;
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
    el.revealBox.innerHTML = "你持有两张大王，请在手牌栏选择都不亮、亮一张或亮两张。";
    return;
  }
  el.revealBox.innerHTML = `你持有一张大王，请在手牌栏选择亮或不亮。`;
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
  const jokerKind = jokerKindClass(card);
  const pointBadge = card.points ? `<em>分</em>` : "";
  if (card.joker) {
    const label = card.joker === "small" ? "小王" : cardLabel(card);
    return `<span class="tinyCard${color}${cardStateClass(card)}${jokerKind}"><small>JOKER</small>${label}</span>`;
  }
  return `<span class="tinyCard${color}${cardStateClass(card)}${jokerKind}">${cardLabel(card)}${pointBadge}</span>`;
}

function tableCard(card) {
  const color = card.color === "red" ? " red" : card.color === "joker" ? " joker" : "";
  const jokerKind = jokerKindClass(card);
  const pointBadge = card.points ? `<em>分</em>` : "";
  if (card.joker) {
    return `<span class="tableCard${color}${cardStateClass(card)}${jokerKind}">${jokerTableFaceHtml(card)}</span>`;
  }
  return `<span class="tableCard${color}${cardStateClass(card)}">
    <span class="tableCorner tableCornerTop"><b>${cardLabel(card)}</b><i>${card.suit}</i></span>
    <i class="tableSuit">${card.suit}</i>
    ${pointBadge}
  </span>`;
}

function selectedCards() {
  const ids = state.selected;
  return localPlayer().hand.filter(card => ids.has(card.id));
}

el.playBtn.addEventListener("click", () => {
  const mode = currentActionMode();
  if (mode.type === "reveal") {
    handleRevealChoice(mode.count >= 2 ? 1 : 1);
    return;
  }
  if (mode.type === "snow") {
    handleSnowChoice("snow");
    return;
  }
  if (localPlayer().finished) return;
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
  const mode = currentActionMode();
  if (mode.type === "reveal") {
    handleRevealChoice(0);
    return;
  }
  if (mode.type === "snow") {
    handleSnowChoice("noSnow");
    return;
  }
  if (localPlayer().finished) return;
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
  const mode = currentActionMode();
  if (mode.type === "reveal" && mode.count >= 2) {
    handleRevealChoice(2);
    return;
  }
  state.selected.clear();
  renderHand();
});

el.teammateBtn.addEventListener("click", () => {
  if (!canViewTeammateHands()) return;
  teammateView = !teammateView;
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

el.menuToggleBtn.addEventListener("click", () => {
  menuMode = menuMode === "full" ? "mini" : menuMode === "mini" ? "hidden" : "full";
  renderPanels();
});

el.menuShrinkBtn.addEventListener("click", () => {
  menuScale = Math.max(0.78, Number((menuScale - 0.08).toFixed(2)));
  applyMenuLayout();
});

el.menuGrowBtn.addEventListener("click", () => {
  menuScale = Math.min(1.28, Number((menuScale + 0.08).toFixed(2)));
  applyMenuLayout();
});

el.menuDragHandle.addEventListener("pointerdown", event => {
  if (event.target.closest("button")) return;
  menuDragging = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: menuPosition.left,
    top: menuPosition.top
  };
  el.menuDragHandle.setPointerCapture(event.pointerId);
});

el.menuDragHandle.addEventListener("pointermove", event => {
  if (!menuDragging || menuDragging.pointerId !== event.pointerId) return;
  menuPosition.left = menuDragging.left + event.clientX - menuDragging.startX;
  menuPosition.top = menuDragging.top + event.clientY - menuDragging.startY;
  applyMenuLayout();
});

function stopMenuDrag(event) {
  if (!menuDragging || menuDragging.pointerId !== event.pointerId) return;
  menuDragging = null;
}

el.menuDragHandle.addEventListener("pointerup", stopMenuDrag);
el.menuDragHandle.addEventListener("pointercancel", stopMenuDrag);
window.addEventListener("resize", applyMenuLayout);

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

el.settlementNextBtn && el.settlementNextBtn.addEventListener("click", () => {
  if (online.connected && !online.isHost) return;
  el.nextRoundBtn.click();
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
  if (isOnlineRoomMember()) {
    updateOnlineStatus("你已经在房间中，刷新页面后才能重新开房");
    return;
  }
  setJoining(true, "正在开房", "正在连接联机服务器...");
  try {
    await openSocket();
  } catch {
    setJoining(false);
    return;
  }
  online.isHost = true;
  online.seat = 0;
  online.hasSnapshot = true;
  state.players[0].name = cleanPlayerName(el.nameInput.value, "房主");
  state.players[0].avatarUrl = rememberPlayerAvatar(bootParams.get("avatar") || savedPlayerAvatar());
  rememberPlayerName(state.players[0].name);
  online.waitingRoom = true;
  online.pendingRole = "host";
  sendSocket({ type: "create" });
  setJoining(false);
  render();
});

async function joinRoomFromInputs(options = {}) {
  if (online.joining) return;
  if (isOnlineRoomMember()) {
    updateOnlineStatus("你已经在房间中，刷新页面后才能加入其他房间");
    return;
  }
  const roomId = String(options.roomId || el.roomInput.value).trim().toUpperCase();
  if (!roomId) {
    el.onlineStatus.textContent = "请输入房号";
    return;
  }
  setJoining(true, "正在加入房间", "正在连接服务器...");
  try {
    await openSocket();
  } catch {
    setJoining(false);
    return;
  }
  online.isHost = false;
  const requestedSeat = Number(options.seat || el.seatSelect.value);
  online.seat = requestedSeat;
  online.roomId = roomId;
  const name = cleanPlayerName(options.name != null ? options.name : el.nameInput.value, `玩家 ${requestedSeat}`);
  el.roomInput.value = roomId;
  el.nameInput.value = name;
  rememberPlayerName(name);
  online.waitingRoom = true;
  online.readySeats = {};
  online.hasSnapshot = false;
  online.pendingRole = "join";
  const avatarUrl = rememberPlayerAvatar(options.avatarUrl || bootParams.get("avatar") || savedPlayerAvatar());
  sendSocket({ type: "join", roomId, seat: requestedSeat, name, avatarUrl });
  updateOnlineStatus("正在加入房间，等待房主同步牌局...");
  setJoining(true, "已发送加入请求", "等待房主同步牌局，请不要重复点击。");
}

el.joinBtn.addEventListener("click", () => {
  joinRoomFromInputs();
});

el.renameBtn.addEventListener("click", () => {
  const name = cleanPlayerName(el.nameInput.value, localSeat() === 0 ? "你" : `玩家 ${localSeat()}`);
  rememberPlayerName(name);
  if (online.connected && !online.isHost) {
    sendSocket({ type: "action", action: "rename", name, avatarUrl: savedPlayerAvatar() });
    return;
  }
  renameSeat(localSeat(), name);
  render();
});

el.inviteBtn.addEventListener("click", async () => {
  if (!online.roomId) {
    el.onlineStatus.textContent = "先开房，再复制邀请链接";
    return;
  }
  const url = inviteUrl(online.roomId);
  try {
    await navigator.clipboard.writeText(url);
    el.onlineStatus.textContent = `邀请链接已复制：${url}`;
  } catch {
    window.prompt("复制这个邀请链接发给朋友：", url);
  }
});

el.inviteJoinBtn && el.inviteJoinBtn.addEventListener("click", () => {
  const roomId = el.roomInput.value.trim().toUpperCase();
  const name = cleanPlayerName((el.inviteNameInput && el.inviteNameInput.value) || el.nameInput.value, "玩家");
  hideInviteJoinDialog();
  joinRoomFromInputs({ roomId, name });
});

el.inviteNameInput && el.inviteNameInput.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  el.inviteJoinBtn && el.inviteJoinBtn.click();
});

function renameSeat(seat, name) {
  const player = state.players[seat];
  if (!player) return;
  player.name = cleanPlayerName(name, seat === 0 ? "你" : `玩家 ${seat}`);
  state.tableNotice = `${player.name} 更新了昵称`;
}

function inviteUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  if (isMiniProgramView) url.searchParams.set("mini", "1");
  postMiniProgramRoom(roomId);
  return url.toString();
}

function postMiniProgramRoom(roomId) {
  if (!roomId || !(window.wx && window.wx.miniProgram && window.wx.miniProgram.postMessage)) return;
  window.wx.miniProgram.postMessage({
    data: {
      roomId,
      title: `五人牌局 房间 ${roomId}`
    }
  });
}

function rememberPlayerName(name) {
  try {
    localStorage.setItem("jokerPlayerName", name);
  } catch {
    // ignore storage failures in private browsing
  }
}

function rememberPlayerAvatar(url) {
  const avatarUrl = cleanAvatarUrl(url);
  try {
    if (avatarUrl) localStorage.setItem("jokerPlayerAvatar", avatarUrl);
  } catch {
    // ignore storage failures in private browsing
  }
  return avatarUrl;
}

function savedPlayerName() {
  try {
    return localStorage.getItem("jokerPlayerName") || "";
  } catch {
    return "";
  }
}

function savedPlayerAvatar() {
  try {
    return cleanAvatarUrl(localStorage.getItem("jokerPlayerAvatar") || "");
  } catch {
    return "";
  }
}

function openSocket() {
  if (online.socket && online.socket.readyState === WebSocket.OPEN) return Promise.resolve();
  if (online.connectionPromise) return online.connectionPromise;
  online.connectionPromise = new Promise((resolve, reject) => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}`);
    online.socket = socket;
    const clearPromise = () => {
      if (online.socket === socket) online.connectionPromise = null;
    };
    socket.addEventListener("open", () => {
      online.connected = true;
      updateOnlineStatus();
      clearPromise();
      resolve();
    }, { once: true });
    socket.addEventListener("message", event => {
      try {
        handleSocketMessage(JSON.parse(event.data));
      } catch {
        updateOnlineStatus("收到异常联机消息，已忽略");
      }
    });
    socket.addEventListener("close", () => {
      online.connected = false;
      online.pendingRole = "";
      setJoining(false);
      clearPromise();
      updateOnlineStatus("联机已断开");
    });
    socket.addEventListener("error", () => {
      online.pendingRole = "";
      setJoining(false);
      clearPromise();
      updateOnlineStatus("连接失败，请刷新后重试，或等待 Render 服务唤醒");
      reject(new Error("socket failed"));
    }, { once: true });
  });
  return online.connectionPromise;
}

function handleSocketMessage(message) {
  if (message.type === "created") {
    if (online.pendingRole !== "host") {
      updateOnlineStatus("忽略了一条异常开房回执，当前身份保持不变");
      return;
    }
    online.pendingRole = "";
    online.roomId = message.roomId;
    online.clientId = message.clientId;
    online.connected = true;
    online.isHost = true;
    online.seat = 0;
    online.hasSnapshot = true;
    online.seatClients = {};
    online.clientSeats = {};
    online.readySeats = {};
    online.waitingRoom = true;
    if (el.roomInput) el.roomInput.value = online.roomId;
    postMiniProgramRoom(online.roomId);
    history.replaceState(null, "", inviteUrl(online.roomId));
    setupWaitingRoom({
      resetMatch: true,
      preserveProfiles: {
        0: {
          name: cleanPlayerName(el.nameInput.value, "房主"),
          avatarUrl: savedPlayerAvatar()
        }
      }
    });
    state.tableNotice = `房间 ${online.roomId} 已创建，等待玩家加入`;
    addLog(`房间 ${online.roomId} 已创建，所有已入房玩家准备后再发牌。`);
    updateOnlineStatus();
    render();
    return;
  }
  if (message.type === "joined") {
    if (online.pendingRole !== "join") {
      updateOnlineStatus("忽略了一条异常加入回执，当前身份保持不变");
      return;
    }
    online.pendingRole = "";
    online.roomId = message.roomId;
    online.clientId = message.clientId;
    online.connected = true;
    online.isHost = false;
    postMiniProgramRoom(online.roomId);
    updateOnlineStatus("已加入，等待房主同步牌局");
    setJoining(true, "已加入房间", "等待房主同步牌局...");
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
    state.players[seat].avatarUrl = cleanAvatarUrl(message.avatarUrl);
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
    if (!online.isHost && Number(message.seat) === 0) {
      setJoining(false);
      updateOnlineStatus("收到异常座位同步，已拒绝切换到房主视角，请刷新后重新加入");
      return;
    }
    scheduleSnapshotApply(message);
    return;
  }
  if (message.type === "error") {
    online.pendingRole = "";
    setJoining(false);
    updateOnlineStatus(message.message);
  }
}

function handleRemoteAction(clientId, message) {
  const seat = online.clientSeats[clientId];
  const player = state.players[seat];
  if (!player) return;
  if (message.action === "rename") {
    renameSeat(seat, message.name);
    if (message.avatarUrl && player) player.avatarUrl = cleanAvatarUrl(message.avatarUrl);
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
    if (state.current === seat && !player.finished) pass(player);
    render();
    return;
  }
  if (message.action === "play") {
    if (state.current !== seat || player.finished) return;
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
      .map(seat => `${seat}号 ${(state.players[seat] && state.players[seat].name) || `玩家 ${seat}`} ${online.waitingRoom ? (online.readySeats[seat] ? "已准备" : "未准备") : ""}`.trim())
      .join("、") || "暂无真人加入";
    const hostReady = online.waitingRoom ? ` · 房主${online.readySeats[0] ? "已准备" : "未准备"}` : "";
    el.onlineStatus.textContent = `房号 ${online.roomId || "生成中"} · ${phase}${hostReady} · ${(state.players[0] && state.players[0].name) || "房主"}是房主 · ${seats}`;
  } else {
    const readyText = online.waitingRoom ? ` · ${online.readySeats[online.seat] ? "已准备" : "未准备"}` : "";
    el.onlineStatus.textContent = extra || `房号 ${online.roomId} · ${(state.players[online.seat] && state.players[online.seat].name) || "你"}在座位 ${online.seat}${readyText}`;
  }
}

function initInviteParams() {
  const params = new URLSearchParams(window.location.search);
  const room = String(params.get("room") || "").trim().toUpperCase();
  const queryName = cleanPlayerName(params.get("name") || "", "");
  const queryAvatar = rememberPlayerAvatar(params.get("avatar") || "");
  if (queryName && !el.nameInput.value.trim()) {
    el.nameInput.value = queryName;
    rememberPlayerName(queryName);
  }
  if (state.players[0]) {
    if (queryName) state.players[0].name = queryName;
    if (queryAvatar) state.players[0].avatarUrl = queryAvatar;
  }
  if (!room) return;
  el.roomInput.value = room;
  const savedName = queryName || savedPlayerName();
  if (savedName && !el.nameInput.value.trim()) el.nameInput.value = savedName;
  el.onlineStatus.textContent = `已识别邀请房号 ${room}，准备进入房间。`;
  if (savedName) {
    joinRoomFromInputs({ roomId: room, name: savedName, avatarUrl: queryAvatar || savedPlayerAvatar() });
    return;
  }
  showInviteJoinDialog(room);
}

function showInviteJoinDialog(room) {
  if (!el.inviteJoinDialog) return;
  document.body.dataset.inviteJoin = "true";
  if (el.inviteRoomLabel) el.inviteRoomLabel.textContent = `房号 ${room}`;
  if (el.inviteNameInput) {
    el.inviteNameInput.value = el.nameInput.value.trim();
    setTimeout(() => el.inviteNameInput.focus(), 80);
  }
}

function hideInviteJoinDialog() {
  document.body.dataset.inviteJoin = "false";
}

startGame({ resetMatch: true });
initInviteParams();
