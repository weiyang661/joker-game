const RANKS = ["4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const SEQ_RANKS = RANKS.slice(0, 11);
const RANK_VALUE = Object.fromEntries(RANKS.map((rank, index) => [rank, index + 1]));
const SUITS = ["S", "H", "C", "D"];
const RED_SUITS = new Set(["H", "D"]);
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

function getOnlineSessionId() {
  try {
    const key = "joker_online_session_id";
    const stored = localStorage.getItem(key);
    if (stored) {
      sessionStorage.setItem(key, stored);
      return stored;
    }
    const existing = sessionStorage.getItem(key);
    if (existing) {
      localStorage.setItem(key, existing);
      return existing;
    }
    const next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, next);
    localStorage.setItem(key, next);
    return next;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const online = {
  connected: false,
  isHost: false,
  socket: null,
  sessionId: getOnlineSessionId(),
  roomId: "",
  clientId: "",
  creatorId: "",
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
  pendingRole: "",
  roomStarted: false,
  snapshotRequestedAt: 0,
  reconnectTimer: null,
  reconnectAttempts: 0
};

let menuMode = "full";
let menuScale = 1;
let menuPosition = { left: 18, top: 62 };
let menuDragging = null;
let teammateView = false;
const audioState = {
  ctx: null,
  enabled: false,
  musicTimer: null,
  beat: 0,
  voiceCache: new Map(),
  voiceFetchCache: new Map(),
  voiceResolvedSrc: new Map(),
  voiceWarmed: false,
  voiceActiveUntil: new Map()
};
const seenSocialEffects = new Set();
const socialLabels = {
  tomato: { label: "???", icon: "??" },
  tea: { label: "??", icon: "??" },
  egg: { label: "???", icon: "??" }
};
const voicePresets = {
  voice01: { label: "????????", file: "????????.wav" },
  voice02: { label: "??", file: "??.mp3" },
  voice03: { label: "??", file: "??.mp3" },
  voice04: { label: "??????", file: "??????.wav" },
  voice05: { label: "??? ??", file: "??? ??.mp3" },
  voice06: { label: "????", file: "????.mp3" },
  voice07: { label: "???????", file: "???????.mp3" },
  voice08: { label: "????", file: "????.mp3" },
  voice09: { label: "??????????", file: "??????????.mp3" }
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
    cards.push({ id: `${pack}-SJ`, rank: "灏忕帇", suit: "Joker", joker: "small", color: "joker", value: 50, points: 0 });
    cards.push({ id: `${pack}-BJ`, rank: "澶х帇", suit: "Joker", joker: "big", color: "joker", value: 60, points: 0 });
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
  return ((el.nameInput && el.nameInput.value) || "").trim() || "?";
}

function cleanPlayerName(name, fallback = "鐜╁") {
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function localSeat() {
  return online.roomId ? online.seat : 0;
}

function applyLocalSeat(seat) {
  const nextSeat = Number(seat);
  if (Number.isFinite(nextSeat) && nextSeat >= 0 && nextSeat <= 4) {
    online.seat = nextSeat;
  }
  online.isHost = Number(online.seat) === 0;
}

function localPlayer() {
  return state.players[localSeat()] || state.players[0];
}

function relativeSeatIndex(seat) {
  return Number(seat);
}

function isHostRuntime() {
  return !online.roomId || online.isHost;
}

function isOnlineRoomMember() {
  return !!online.roomId;
}

function isHumanControlled(seat) {
  if (!online.roomId) return seat === 0;
  return online.connected && seat === localSeat();
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
  return index === localSeat() || Object.prototype.hasOwnProperty.call(online.seatClients, index);
}

function makeLobbyPlayer(index, name, profiles = {}) {
  const profile = playerProfileForSeat(index, name || (index === 0 ? playerNameFallback() : `浜烘満 ${index}`), profiles);
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
    botFilled: false,
    human: isOnlineHumanSeat(index)
  };
}

function isWaitingRoomView() {
  const noCardsDealt = state.players.every(player => !player.hand || player.hand.length === 0);
  if (online.roomStarted && !noCardsDealt) return false;
  return !!(online.roomId && noCardsDealt && (
    online.roomStarted ||
    online.waitingRoom ||
    (!state.hasPlayed && !state.revealPhase && !state.roundSettled && !state.lastSettlement.length)
  ));
}

function hasAnyCardsDealt() {
  return state.players.some(player => player.hand && player.hand.length > 0);
}

function isOnlineStartStalled() {
  return !!(online.roomId && online.roomStarted && !hasAnyCardsDealt());
}

function normalizeOnlineLobbyState() {
  if (!online.roomId || hasAnyCardsDealt()) return;
  if (online.roomStarted) {
    online.waitingRoom = true;
    state.gameOver = false;
    state.continuingForNextLead = false;
    if (!state.tableNotice || isFinalSettlementNotice(state.tableNotice) || state.tableNotice === "????") {
      state.tableNotice = "姝ｅ湪鍚屾鐗屽眬锛岃绋嶅€欐垨鐐瑰嚮閲嶆柊杩炴帴";
    }
    requestRoomSnapshot();
    return;
  }
  if (state.roundSettled || state.lastSettlement.length) return;
  if (online.waitingRoom || (!state.hasPlayed && !state.revealPhase)) {
    online.waitingRoom = true;
    state.gameOver = false;
    state.continuingForNextLead = false;
    state.pendingSnowChoice = null;
    if (!state.tableNotice || isFinalSettlementNotice(state.tableNotice)) {
      state.tableNotice = "????";
    }
  }
}

function isSeatHumanInWaiting(index) {
  if (!online.connected) return index === 0;
  if (index === localSeat()) return true;
  return Object.prototype.hasOwnProperty.call(online.seatClients, index);
}

function isWaitingBotSeat(player, index) {
  return isWaitingRoomView() && index > 0 && player && player.botFilled && !isSeatHumanInWaiting(index);
}

function isWaitingEmptySeat(player, index) {
  return isWaitingRoomView() && index > 0 && player && !isSeatHumanInWaiting(index) && !player.botFilled;
}

function setupWaitingRoom(options = {}) {
  online.roomStarted = false;
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
  state.gameOver = false;
  state.continuingForNextLead = false;
  state.hasPlayed = false;
  state.revealPhase = false;
  state.bigRevealDecisions = new Set();
  state.publicBigIds = new Set();
  state.pendingSnowChoice = null;
  state.snowChasingTeam = null;
  state.tableNotice = "????";
  state.lastSettlement = [];
  state.roundSettled = false;
  state.openingBigRevealCount = 0;
  state.revealToken = Symbol("lobby");
  state.log = [];
  addLog("????????????");
  render();
}

function humanSeatsInRoom() {
  if (!online.connected) return [0];
  return state.players
    .map((player, index) => index)
    .filter(index => isWaitingRoomView() ? isSeatHumanInWaiting(index) : state.players[index].human)
    .sort((a, b) => a - b);
}

function allJoinedPlayersReady() {
  const seats = humanSeatsInRoom();
  return seats.length > 0 && seats.every(seat => online.readySeats[seat]);
}

function canStartWaitingRoom() {
  if (!online.connected || !online.isHost || (!isWaitingRoomView() && !isOnlineStartStalled())) return false;
  const seats = humanSeatsInRoom();
  if (!seats.includes(localSeat())) return false;
  return !unreadyJoinedSeats().length;
}

function unreadyJoinedSeats() {
  return humanSeatsInRoom().filter(seat => seat !== localSeat() && !online.readySeats[seat]);
}

function setSeatReady(seat, ready) {
  if (ready) online.readySeats[seat] = true;
  else delete online.readySeats[seat];
  const player = state.players[seat];
  if (player) {
    state.tableNotice = `${player.name} ${ready ? "???" : "????"}`;
    addLog(`${player.name} ${ready ? "???" : "????"}?`);
  }
  render();
}

function firstOpenSeat(preferredSeat = null) {
  const preferred = Number(preferredSeat);
  if (preferred >= 1 && preferred <= 4 && !isSeatHumanInWaiting(preferred)) return preferred;
  for (let seat = 1; seat <= 4; seat += 1) {
    if (!isSeatHumanInWaiting(seat)) return seat;
  }
  return null;
}

function fillEmptySeatsWithBots() {
  let changed = false;
  for (let seat = 1; seat <= 4; seat += 1) {
    const player = state.players[seat];
    if (!player || isSeatHumanInWaiting(seat) || player.botFilled) continue;
    if (online.connected && online.isHost) {
      sendSocket({ type: "action", action: "fillBot", seat });
    }
    player.botFilled = true;
    player.human = false;
    player.name = `浜烘満 ${seat}`;
    player.avatarUrl = "";
    changed = true;
  }
  if (changed) {
    state.tableNotice = "????????";
    addLog("?????????");
  }
}

function startGame(options = {}) {
  if (options.resetMatch) {
    state.playerMatch = [0, 0, 0, 0, 0];
    state.firstFinisherNext = 0;
  }
  if (online.roomId) {
    online.waitingRoom = false;
    online.hasSnapshot = true;
  }
  const preservedProfiles = { ...preservedOnlineProfiles(), ...(options.preserveProfiles || {}) };
  const preservedNames = { ...preservedOnlineNames(), ...(options.preserveNames || {}) };
  Object.keys(preservedNames).forEach(seat => {
    preservedProfiles[seat] = { ...(preservedProfiles[seat] || {}), name: preservedNames[seat] };
  });
  const deck = shuffle(makeDeck());
  state.players = Array.from({ length: 5 }, (_, index) => ({
    id: index,
    name: playerProfileForSeat(index, preservedNames[index] || (index === 0 ? playerNameFallback() : `浜烘満 ${index}`), preservedProfiles).name,
    avatarUrl: playerProfileForSeat(index, preservedNames[index] || (index === 0 ? playerNameFallback() : `浜烘満 ${index}`), preservedProfiles).avatarUrl,
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
  state.tableNotice = "绛夊緟鎸佹湁澶х帇鐨勭帺瀹堕€夋嫨浜帇";
  state.lastSettlement = [];
  state.roundSettled = false;
  state.log = [];
  state.players.forEach(player => {
    if (player.revealedBigs.size) player.knownTeam = true;
  });
  state.openingBigRevealCount = 0;
  state.revealToken = Symbol("reveal");
  addLog("?????");
  render();
  if (!options.deferBots) scheduleBotRevealChoices();
}

function scheduleBotRevealChoices() {
  if (!isHostRuntime()) return;
  const token = Symbol("reveal");
  state.revealToken = token;
  for (const player of state.players) {
    const bigs = player.hand.filter(card => card.joker === "big");
    if (!player.human && bigs.length) {
      setTimeout(() => {
        if (state.revealToken === token && !player.human) {
          decidePlayerBigReveal(player, botRevealCount(bigs.length));
        }
      }, 450 + player.id * 220);
    }
  }
  if (!allBigCards().some(item => item.player.id === localSeat())) {
    addLog("???????");
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
    player.revealAnnouncement = "??????";
    state.tableNotice = `${player.name} ??????`;
    addLog(`${player.name} ???????`);
  } else {
    if (player.id === 0) addLog("????????");
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
    ? (showCount === 0 ? "???????" : showCount === 1 ? "??????" : "??????")
    : (showCount === 1 ? "??????" : "????");
  if (showCount > 0) {
    player.revealAnnouncement = showCount === 1 ? "??????" : "??????";
    state.tableNotice = `${player.name} ${player.revealAnnouncement}`;
    addLog(`${player.name} ${player.revealAnnouncement}?`);
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
  state.tableNotice = `????????? ${state.openingBigRevealCount} ??${state.players[state.current].name} ??`;
  addLog(`??????????? ${state.openingBigRevealCount} ??${state.players[state.current].name} ???`);
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
  if (!cards.length) return { valid: false, reason: "???????" };
  const jokers = cards.filter(card => card.joker);
  const counts = countByRank(cards);
  const ranks = [...counts.keys()].sort((a, b) => RANK_VALUE[a] - RANK_VALUE[b]);
  const bigs = jokers.filter(card => card.joker === "big");
  const smalls = jokers.filter(card => card.joker === "small");

  if (jokers.length) {
    const jokerPlay = classifyJokers(cards, bigs, smalls);
    if (jokerPlay.valid) return jokerPlay;
    return { valid: false, reason: "???????" };
  }

  if (counts.get("A") === 1 && (counts.get("4") || 0) >= 2 && counts.size === 2 && cards.length === (counts.get("4") + 1)) {
    const fours = counts.get("4");
    const names = { 2: "??", 3: "??", 4: "??" };
    return bombish(names[fours] || `${"?".repeat(fours - 3)}?`, 2 * fours, 1000, cards, {
      specialKind: "yao",
      yaoFours: fours,
      specialPower: yaoPower(fours)
    });
  }

  if (cards.length === 1) {
    return { valid: true, type: "single", name: `?? ${cards[0].rank}`, length: 1, high: cards[0].value, cards };
  }
  if (cards.length === 2 && counts.size === 1) {
    return { valid: true, type: "pair", name: `?? ${ranks[0]}`, length: 1, high: RANK_VALUE[ranks[0]], cards };
  }
  if (counts.size === 1 && cards.length >= 3) {
    const lane = cards.length;
    return bombish(`${lane}??? ${ranks[0]}`, lane, RANK_VALUE[ranks[0]], cards);
  }
  if (cards.length >= 3 && ranks.length === cards.length && isContinuous(ranks)) {
    return { valid: true, type: "singleSeq", name: `?? ${ranks.join("")}`, length: cards.length, high: RANK_VALUE[ranks[ranks.length - 1]], cards };
  }
  if (cards.length >= 6 && cards.length % 2 === 0 && ranks.every(rank => counts.get(rank) === 2) && isContinuous(ranks)) {
    return { valid: true, type: "doubleSeq", name: `?? ${ranks.join("")}`, length: ranks.length, high: RANK_VALUE[ranks[ranks.length - 1]], cards };
  }
  return { valid: false, reason: "??????????????????????" };
}

function classifyJokers(cards, bigs, smalls) {
  const revealCount = bigRevealCount();
  const revealed = revealedBigIds();
  if (cards.length >= 3 && cards.length === jokersOnly(cards).length) {
    return bombish(`${cards.length}??`, 100 + cards.length, 10000 + cards.length, cards, { absolute: true, jokerKing: true, specialKind: "absoluteJoker" });
  }
  if (cards.length === 2 && bigs.length === 2) {
    return bombish("????", 100, 10000, cards, { absolute: true, jokerKing: true, specialKind: "absoluteJoker" });
  }
  if (cards.length === 1 && bigs.length === 1) {
    const isRevealed = revealed.has(bigs[0].id);
    return bombish(isRevealed ? "???" : "???", isRevealed ? 6 : 5, isRevealed ? 1002 : 1000, cards, {
      jokerKing: true,
      specialKind: "bigSingle",
      bigRevealed: isRevealed,
      specialPower: isRevealed ? 700 : 590
    });
  }
  if (cards.length === 1 && smalls.length === 1) {
    return bombish("??", revealCount === 2 ? 4 : 3, revealCount === 2 ? 900 : 1000, cards, {
      jokerKing: true,
      specialKind: "smallSingle",
      specialPower: revealCount === 2 ? 450 : 390
    });
  }
  if (cards.length === 2 && smalls.length === 2) {
    if (revealCount === 2) return bombish("????", 8, 999, cards, { jokerKing: true, specialKind: "doubleSmall", specialPower: 880 });
    if (revealCount === 1) return bombish("????", 6, 1001, cards, { jokerKing: true, specialKind: "doubleSmall", onlyBeatsHiddenBig: true, specialPower: 610 });
    return bombish("????", 6, 1001, cards, { jokerKing: true, specialKind: "doubleSmall", onlyBeatsSingleBig: true, specialPower: 610 });
  }
  if (cards.length === 2 && bigs.length === 1 && smalls.length === 1) {
    const isRevealed = revealed.has(bigs[0].id);
    if (revealCount === 2) return bombish("????", 99, 9999, cards, { absolute: true, jokerKing: true, specialKind: "absoluteJoker" });
    if (revealCount === 1 && isRevealed) return bombish("??????", 9, 1000, cards, {
      jokerKing: true,
      specialKind: "bigSmall",
      specialPower: 900
    });
    return bombish("??????", 7, 1000, cards, {
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
  if (!play.valid) return { ok: false, reason: play.reason || "?????" };
  if (!target) return { ok: true };
  if (target.absolute) return { ok: false, reason: "????" };
  if (play.absolute) return { ok: true };
  const specialBeat = canSpecialBeat(play, target);
  if (specialBeat !== null) return specialBeat;

  if (target.jokerKing && play.type !== "bomb") return { ok: false, reason: "?????????" };

  if (play.type === target.type && play.type !== "bomb") {
    if (play.length !== target.length) return { ok: false, reason: "??????" };
    return play.high > target.high ? { ok: true } : { ok: false, reason: "????" };
  }

  if (play.type === "doubleSeq" && target.type === "singleSeq") {
    if (play.length !== target.length) return { ok: false, reason: "??????" };
    return play.high > target.high ? { ok: true } : { ok: false, reason: "????" };
  }

  if (play.type === "bomb") {
    if (target.type === "single" || target.type === "pair") return { ok: true };
    if (target.type === "singleSeq" && play.lane >= 3) return { ok: true };
    if (target.type === "doubleSeq" && play.lane >= 4) return { ok: true };
    if (target.type === "bomb") {
      const bombCompare = compareBombLike(play, target);
      if (bombCompare !== null) return bombCompare;
      if (play.lane !== target.lane) return play.lane > target.lane ? { ok: true } : { ok: false, reason: "??????" };
      return play.high > target.high ? { ok: true } : { ok: false, reason: "?????" };
    }
  }

  return { ok: false, reason: "???????" };
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
        : { ok: false, reason: "????????????" };
    }
    if (play.onlyBeatsSingleBig) {
      return target.specialKind === "bigSingle"
        ? { ok: true }
        : compareBombLike(play, target);
    }
  }
  if (play.specialKind === "bigSmall") {
    if (target.specialKind === "yao" && target.yaoFours >= 5) return { ok: false, reason: "??????" };
    if (target.specialKind === "yao" && target.yaoFours >= 4 && play.specialPower < 890) return { ok: false, reason: "?????" };
  }
  return compareBombLike(play, target);
}

function compareBombLike(play, target) {
  if (play.type !== "bomb" || target.type !== "bomb") return null;
  const playPower = bombPower(play);
  const targetPower = bombPower(target);
  if (playPower === null || targetPower === null) return null;
  return playPower > targetPower ? { ok: true } : { ok: false, reason: "????" };
}

function bombPower(play) {
  if (typeof play.specialPower === "number") return play.specialPower;
  if (play.type !== "bomb") return null;
  return play.lane * 100 + play.high;
}

function playCards(player, cards) {
  if (player.finished) return { ok: false, reason: "??????" };
  if (state.pendingSnowChoice) return { ok: false, reason: "????????" };
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
  playCardSfx();
  broadcastSocialEffect({ id: socialEffectId(), kind: "cardSfx", from: player.id });
  state.tableNotice = `${player.name} ? ${play.name}`;
  addLog(`${player.name} ? ${play.name} ${formatCards(cards)}?`);
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
  addLog(`${player.name} ?????`);
  if (state.finishedOrder.length === 1) {
    state.firstFinisherNext = player.id;
    if (state.continuingForNextLead && state.roundSettled) {
      state.continuingForNextLead = false;
      state.currentPlay = null;
      state.passes = new Set();
      addLog(`${player.name} ??????? ${player.name} ???`);
      render();
      return;
    }
    addLog(`${player.name} ???`);
    if (state.scores[player.team] >= 90) {
      offerSnowChoiceOrEnd(`${teamName(player.team)} ????? 90 ??????????`, player.team);
      return;
    }
    addLog(`${teamName(player.team)} ?????? 90 ???????`);
  }
  checkWin();
}

function pass(player) {
  if (state.pendingSnowChoice) return;
  if (player.finished) return;
  if (!state.currentPlay) return;
  state.passes.add(player.id);
  player.lastPlay = { name: "?", cards: [] };
  state.tableNotice = `${player.name} ?`;
  addLog(`${player.name} ??`);
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
  state.tableNotice = `${winner.name} ???? ${state.trickPoints} ?`;
  addLog(`${winner.name} ???? ${state.trickPoints} ??`);
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
      addLog(`${winner.name} ??????????????????? ${state.players[teammate].name} ???`);
      return teammate;
    }
  }
  const next = findNextActive(winner.id);
  addLog(`${winner.name} ????????? ${state.players[next].name} ???`);
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
    endRound(`${teamName(state.snowChasingTeam)} ?????????????????`, state.snowChasingTeam, 1);
    return;
  }
  for (const team of ["king", "plain"]) {
    const rival = team === "king" ? "plain" : "king";
    if (state.scores[team] >= 200) {
      endRound(`${teamName(team)} ?? 200 ???????`, team, 4);
      return;
    }
    if (state.scores[team] >= 180 && hasAnyHeadRunner() && allPointsAwarded()) {
      endRound(`????? 200 ?????${teamName(team)} ?? 180 ???????`, team, 2);
      return;
    }
    if (!state.snowChasingTeam && headRunnerTeam() === team && state.scores[team] >= 90) {
      offerSnowChoiceOrEnd(`${teamName(team)} ????? 90 ??????????`, team);
      return;
    }
    if (state.snowChasingTeam && state.snowChasingTeam !== team) continue;
    if (state.scores[team] >= 140) {
      offerSnowChoiceOrEnd(`${teamName(team)} ?? 140 ??????????`, team);
      return;
    }
    const teamPlayers = state.players.filter(player => player.team === team);
    if (teamPlayers.length && teamPlayers.every(player => player.finished) && state.scores[rival] < 140) {
      const bonus = state.scores[rival] === 0 ? 4 : (state.scores[rival] < 25 ? 2 : 1);
      endRound(`${teamName(team)} ?????${bonus === 4 ? "??" : bonus === 2 ? "??" : "??"}???`, team, bonus);
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
    if (state.scores[rival] >= 25) endRound(`${teamName(winnerTeam)} ????????????`, winnerTeam, 1);
    return;
  }
  if (state.scores[rival] < 25) {
    const deciders = unfinishedTeamPlayers(winnerTeam);
    if (!deciders.length) {
      const multiplier = state.scores[rival] === 0 ? 4 : 2;
      endRound(`${message} ${teamName(winnerTeam)} ??????????${multiplier === 4 ? "??" : "??"}???`, winnerTeam, multiplier);
      return;
    }
    state.pendingSnowChoice = { winnerTeam, message };
    state.tableNotice = `${message} ${teamName(winnerTeam)} ????????`;
    addLog(`${message} ????? ${teamName(winnerTeam)} ?????????`);
    render();
    return;
  }
  endRound(`${message} ?????????????`, winnerTeam, 1);
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
    endRound(`${teamName(winnerTeam)} ??????????`, winnerTeam, 1);
    render();
    return;
  }
  state.snowChasingTeam = winnerTeam;
  state.tableNotice = `${teamName(winnerTeam)} ?????????`;
  addLog(`${teamName(winnerTeam)} ????????????????`);
  if ((state.players[state.current] && state.players[state.current].finished)) {
    if (state.currentPlay && !anyActivePlayerCanBeatCurrentPlay()) {
      addLog(`${state.players[state.current].name} ????????? ${state.currentPlay.name}??????????`);
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
  state.gameOver = false;
  state.tableNotice = message;
  addLog(message);
  if (winnerTeam) settleRound(winnerTeam, multiplier);
  if (!state.finishedOrder.length) {
    state.continuingForNextLead = true;
    addLog("???????");
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
  const multiplierText = multiplier === 4 ? "大雪 x4" : multiplier === 2 ? "小雪 x2" : "无雪";
  state.tableNotice = `${teamName(winnerTeam)} 获胜 · ${multiplierText}`;
  addLog(`本局结算：${multiplierText}，${state.lastSettlement.map(item => `${item.name} 总分 ${item.total}（本局 ${formatSigned(item.delta)}）`).join("；")}。`);
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
    const snowText = multiplier === 4 ? "大雪" : multiplier === 2 ? "小雪" : "对方免雪";
    endRound(`${teamName(state.snowChasingTeam)} 选择雪后打完：${snowText}。`, state.snowChasingTeam, multiplier);
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
  if (isWaitingRoomView() || !hasAnyCardsDealt()) return;
  if (state.revealPhase) return;
  if (state.pendingSnowChoice) {
    const hasHumanWinner = unfinishedTeamPlayers(state.pendingSnowChoice.winnerTeam)
      .some(player => player.human);
    if (!hasHumanWinner) setTimeout(() => chooseSnowChoice("snow"), 450);
    return;
  }
  if (state.gameOver && !state.continuingForNextLead) return;
  const player = state.players[state.current];
  if (!player || player.human || player.finished) return;
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
  return team === "king" ? "??" : "???";
}

function isBigRevealed(card) {
  return (card && card.joker) === "big" && revealedBigIds().has(card.id);
}

function isBigDecided(card) {
  return (card && card.joker) === "big" && state.bigRevealDecisions.has(card.id);
}

function cardLabel(card) {
  if ((card && card.joker) === "big") {
    if (isBigRevealed(card)) return "???";
    if (!state.revealPhase || isBigDecided(card) || state.hasPlayed) return "???";
    return "??";
  }
  if ((card && card.joker) === "small") return "??";
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
  const title = card.joker === "small" ? "??" : cardLabel(card);
  return '<div class="jokerFace simpleJokerFace"><span class="jokerWord jokerWordLeft">JOKER</span><span class="jokerTitle">' + title + '</span><span class="jokerFigure simpleJokerFigure">*</span><span class="jokerWord jokerWordRight">JOKER</span></div>';
}

function jokerTableFaceHtml(card) {
  const title = card.joker === "small" ? "??" : cardLabel(card);
  return '<span class="jokerTableFace simpleJokerTableFace"><span>JOKER</span><strong>' + title + '</strong></span>';
}

function addLog(text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 80);
}

function getAudioContext() {
  if (audioState.ctx) return audioState.ctx;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioState.ctx = new AudioContext();
  return audioState.ctx;
}

function startAudioOnce() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  if (audioState.enabled) return;
  audioState.enabled = true;
  startBackgroundMusic();
}

function tone(freq, duration = 0.08, volume = 0.05, type = "sine", delay = 0) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playNoise(duration = 0.12, volume = 0.05, delay = 0) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain).connect(ctx.destination);
  source.start(ctx.currentTime + delay);
}

function startBackgroundMusic() {
  if (audioState.musicTimer) return;
  const notes = [196, 247, 294, 330, 294, 247];
  audioState.musicTimer = setInterval(() => {
    if (!audioState.enabled) return;
    const note = notes[audioState.beat % notes.length];
    tone(note, 0.16, 0.012, "triangle");
    if (audioState.beat % 4 === 0) tone(note / 2, 0.22, 0.008, "sine", 0.02);
    audioState.beat += 1;
  }, 620);
}

function playCardSfx() {
  startAudioOnce();
  playNoise(0.08, 0.045);
  tone(520, 0.045, 0.035, "triangle", 0.02);
  tone(660, 0.055, 0.026, "triangle", 0.075);
}

function playInteractionSfx(kind) {
  startAudioOnce();
  if (kind === "tea") {
    tone(360, 0.08, 0.012, "sine", 0.1);
    playNoise(0.44, 0.018, 0.48);
    tone(520, 0.18, 0.012, "sine", 0.56);
    return;
  }
  if (kind === "egg") {
    tone(520, 0.04, 0.018, "triangle");
    playNoise(0.12, 0.06, 0.54);
    tone(980, 0.045, 0.035, "square", 0.55);
    tone(620, 0.05, 0.03, "triangle", 0.61);
    return;
  }
  tone(720, 0.05, 0.026, "triangle");
  playNoise(0.16, 0.095, 0.56);
  tone(150, 0.09, 0.055, "sawtooth", 0.58);
}

function playVoicePresetSfx(kind, onDone) {
  startAudioOnce();
  const preset = voicePresets[kind];
  if (preset && preset.file) {
    preloadVoicePreset(kind);
    playVoiceAudioSources(voiceAudioSourcesFor(kind), preset.label, 0, onDone);
    return;
  }
  console.warn("??????", kind);
  if (onDone) onDone();
}

function voiceDurationMs(kind) {
  const preset = voicePresets[kind];
  if (!preset || !preset.file) return 2600;
  const loaded = voiceFileSources(preset.file)
    .map(src => audioState.voiceCache.get(src))
    .find(audio => audio && Number.isFinite(audio.duration) && audio.duration > 0);
  return loaded ? Math.max(1400, Math.ceil(loaded.duration * 1000) + 350) : 3200;
}

function isVoiceSeatBusy(seat) {
  const until = audioState.voiceActiveUntil.get(Number(seat)) || 0;
  if (until <= Date.now()) {
    audioState.voiceActiveUntil.delete(Number(seat));
    return false;
  }
  return true;
}

function lockVoiceSeat(seat, durationMs) {
  const key = Number(seat);
  const until = Date.now() + Math.max(1200, durationMs || 2600);
  audioState.voiceActiveUntil.set(key, until);
  setTimeout(() => {
    if ((audioState.voiceActiveUntil.get(key) || 0) <= until) audioState.voiceActiveUntil.delete(key);
  }, Math.max(1200, durationMs || 2600) + 120);
}

function unlockVoiceSeat(seat) {
  audioState.voiceActiveUntil.delete(Number(seat));
}

function voiceFileSources(file) {
  return [
    file,
    `闊抽/${file}`,
    encodeURI(file),
    `闊抽/${encodeURI(file)}`
  ];
}

function voiceAudioSourcesFor(kind) {
  const resolved = audioState.voiceResolvedSrc.get(kind);
  if (resolved) return [resolved];
  const preset = voicePresets[kind];
  return preset ? voiceFileSources(preset.file) : [];
}

function getVoiceAudio(src) {
  if (!audioState.voiceCache.has(src)) {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = 0.95;
    audio.load();
    audioState.voiceCache.set(src, audio);
  }
  return audioState.voiceCache.get(src);
}

function waitForAudioReady(audio, timeoutMs = 1800) {
  if (!audio) return Promise.resolve(false);
  if (audio.readyState >= 3) return Promise.resolve(true);
  return new Promise(resolve => {
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      audio.removeEventListener("canplaythrough", onReady);
      audio.removeEventListener("loadeddata", onReady);
      audio.removeEventListener("error", onError);
      resolve(ok);
    };
    const onReady = () => finish(true);
    const onError = () => finish(false);
    audio.addEventListener("canplaythrough", onReady, { once: true });
    audio.addEventListener("loadeddata", onReady, { once: true });
    audio.addEventListener("error", onError, { once: true });
    setTimeout(() => finish(audio.readyState >= 2), timeoutMs);
  });
}

async function preloadVoicePreset(kind) {
  const preset = voicePresets[kind];
  if (!preset || !preset.file) return false;
  if (audioState.voiceResolvedSrc.has(kind)) return true;
  if (audioState.voiceFetchCache.has(kind)) return audioState.voiceFetchCache.get(kind);
  const promise = (async () => {
    for (const src of voiceFileSources(preset.file)) {
      try {
        const audio = getVoiceAudio(src);
        audio.load();
        const ready = await waitForAudioReady(audio);
        if (ready || audio.readyState >= 2) {
          audioState.voiceResolvedSrc.set(kind, src);
          return true;
        }
      } catch {
        // Try the next path; some hosts handle Chinese filenames differently.
      }
    }
    return false;
  })();
  audioState.voiceFetchCache.set(kind, promise);
  return promise;
}

function warmVoiceAudioCache() {
  if (audioState.voiceWarmed) return;
  audioState.voiceWarmed = true;
  Object.keys(voicePresets).forEach((kind, index) => {
    setTimeout(() => {
      preloadVoicePreset(kind);
    }, index * 160);
  });
}

function playVoiceAudioSources(sources, label, index = 0, onDone) {
  const src = sources[index];
  if (!src) {
    console.warn("璇煶鎾斁澶辫触锛氭墍鏈夎矾寰勯兘鏃犳硶鎾斁", label);
    if (onDone) onDone();
    return;
  }
  const audio = getVoiceAudio(src);
  audio.volume = 0.95;
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    if (onDone) onDone();
  };
  const tryNext = () => {
    if (settled) return;
    settled = true;
    playVoiceAudioSources(sources, label, index + 1, onDone);
  };
  audio.addEventListener("ended", finish, { once: true });
  audio.addEventListener("error", tryNext, { once: true });
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {}
  audio.play().catch(tryNext);
}

function socialEffectId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dispatchSocialEffect(effect) {
  const normalized = { id: socialEffectId(), from: localSeat(), ...effect };
  if (normalized.kind === "voice" && isVoiceSeatBusy(normalized.from)) {
    updateOnlineStatus("????????????");
    return;
  }
  if (online.connected && !online.isHost) {
    if (normalized.kind === "voice") applySocialEffect(normalized);
    sendSocket({ type: "action", action: "socialEffect", effect: normalized });
    return;
  }
  applySocialEffect(normalized);
  broadcastSocialEffect(normalized);
}

function broadcastSocialEffect(effect) {
  if (!online.connected || !online.isHost) return;
  sendSocket({ type: "relay", payload: { type: "socialEffect", effect } });
}

function applySocialEffect(effect) {
  if (!effect || seenSocialEffects.has(effect.id)) return;
  seenSocialEffects.add(effect.id);
  if (seenSocialEffects.size > 80) seenSocialEffects.delete([...seenSocialEffects][0]);
  if (effect.kind === "cardSfx") {
    playCardSfx();
    return;
  }
  if (effect.kind === "voice") {
    if (isVoiceSeatBusy(effect.from)) return;
    lockVoiceSeat(effect.from, voiceDurationMs(effect.voice));
    showVoiceBubble(effect);
    playVoicePresetSfx(effect.voice, () => unlockVoiceSeat(effect.from));
    return;
  }
  showInteractionAnimation(effect);
  playInteractionSfx(effect.kind);
}

function ensureSocialControls() {
  if (!document.querySelector("#voiceFab")) {
    const button = document.createElement("button");
    button.id = "voiceFab";
    button.className = "voiceFab";
    button.type = "button";
    button.textContent = "璇煶";
    button.addEventListener("click", event => {
      startAudioOnce();
      warmVoiceAudioCache();
      showVoiceMenu(event);
    });
    document.body.appendChild(button);
  }
}

function showVoiceMenu(event) {
  closeFloatingSocialMenus();
  const menu = document.createElement("div");
  menu.className = "voiceMenu";
  const busy = isVoiceSeatBusy(localSeat());
  menu.innerHTML = Object.entries(voicePresets).map(([key, item]) =>
    `<button type="button" data-voice="${key}"><span>${item.icon || "馃帣"}</span>${escapeHtml(item.label)}</button>`
  ).join("");
  if (busy) {
    menu.innerHTML = `<button type="button" disabled><span>璇煶</span>鎾斁涓紝绋嶇瓑</button>`;
  }
  document.body.appendChild(menu);
  const rect = event.currentTarget.getBoundingClientRect();
  menu.style.left = `${Math.max(12, rect.left - 120)}px`;
  menu.style.top = `${Math.max(12, rect.top - menu.offsetHeight - 8)}px`;
  const closeOnOutside = evt => {
    if (!menu.isConnected) {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      return;
    }
    if (menu.contains(evt.target) || evt.target.closest(".voiceFab")) return;
    menu.remove();
    document.removeEventListener("pointerdown", closeOnOutside, true);
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", closeOnOutside, true);
  }, 0);
  menu.addEventListener("click", click => {
    const button = click.target.closest("[data-voice]");
    if (!button) return;
    const voice = button.dataset.voice;
    if (isVoiceSeatBusy(localSeat())) {
      updateOnlineStatus("????????????");
      menu.remove();
      return;
    }
    dispatchSocialEffect({ kind: "voice", voice, text: voicePresets[voice].label });
    menu.remove();
  });
}

function showSocialMenu(seat, event) {
  const targetPlayer = state.players[seat];
  if (!targetPlayer || isWaitingEmptySeat(targetPlayer, seat)) return;
  closeFloatingSocialMenus();
  const panel = document.createElement("div");
  panel.className = "socialPanel";
  const avatar = targetPlayer.avatarUrl
    ? `<img class="socialPanelAvatar" src="${escapeAttr(targetPlayer.avatarUrl)}" alt="">`
    : `<span class="socialPanelAvatar socialPanelAvatarEmpty">${escapeHtml(String(targetPlayer.name || "?").slice(0, 1))}</span>`;
  panel.innerHTML = `
    <div class="socialPanelCard">
      <button class="socialPanelClose" type="button" aria-label="鍏抽棴">脳</button>
      <div class="socialPanelHead">
        ${avatar}
        <div>
          <strong>${escapeHtml(targetPlayer.name || `鐜╁ ${seat}`)}</strong>
          <span>搴т綅 ${seat} 路 ${escapeHtml(visibleTeam(targetPlayer))}</span>
        </div>
      </div>
      <div class="socialGiftGrid">
        ${Object.entries(socialLabels).map(([key, item]) =>
          `<button type="button" class="socialGift" data-kind="${key}">
            <span class="socialGiftIcon">${item.icon}</span>
            <b>${item.label}</b>
            <em>鍙戦€?/em>
          </button>`
        ).join("")}
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.addEventListener("click", click => {
    if (click.target === panel || click.target.closest(".socialPanelClose")) {
      panel.remove();
      return;
    }
    const button = click.target.closest("[data-kind]");
    if (!button) return;
    dispatchSocialEffect({ kind: button.dataset.kind, to: seat });
    panel.remove();
  });
}

function closeFloatingSocialMenus() {
  document.querySelectorAll(".socialMenu, .voiceMenu").forEach(node => node.remove());
}

function showInteractionAnimation(effect) {
  const item = socialLabels[effect.kind] || socialLabels.tomato;
  const from = seatEffectPoint(effect.from);
  const to = seatEffectPoint(effect.to);
  const isTea = effect.kind === "tea";
  const impactDelay = isTea ? 610 : 555;
  const fly = document.createElement("div");
  fly.className = `socialProjectile socialProjectile-${effect.kind}`;
  fly.textContent = item.icon;
  fly.style.left = `${from.x}px`;
  fly.style.top = `${from.y}px`;
  fly.style.setProperty("--fly-ms", isTea ? "680ms" : "560ms");
  document.body.appendChild(fly);
  requestAnimationFrame(() => {
    fly.classList.add("socialProjectileFlying");
    fly.style.left = `${to.x}px`;
    fly.style.top = `${to.y}px`;
  });
  setTimeout(() => {
    fly.remove();
    showInteractionImpact(effect.kind, item, to);
  }, impactDelay);
}

function seatEffectPoint(seat) {
  const rel = relativeSeatIndex(seat);
  const target =
    document.querySelector(`.seat[data-seat="${seat}"] .seatAvatar`) ||
    document.querySelector(`.seat[data-seat="${seat}"]`) ||
    document.querySelector(`.seat${rel} .seatAvatar`) ||
    document.querySelector(`.seat${rel}`);
  if (!target) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const rect = target.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function showInteractionImpact(kind, item, point) {
  const impact = document.createElement("div");
  const count = kind === "tea" ? 0 : kind === "egg" ? 10 : 12;
  impact.className = `socialImpact socialImpact-${kind}`;
  impact.style.left = `${point.x}px`;
  impact.style.top = `${point.y}px`;
  const pieces = Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.45;
    const distance = 26 + Math.random() * (kind === "tomato" ? 70 : 54);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const rotate = Math.round(Math.random() * 180 - 90);
    return `<i style="--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px;--r:${rotate}deg"></i>`;
  }).join("");
  const core = kind === "tomato"
    ? `<b class="tomatoSplash"><span></span></b>`
    : kind === "egg"
      ? `<b class="eggSplash"><span></span></b>`
      : `<b class="teaSet"><span class="teapot"></span><span class="teaArc"></span><span class="teacup"></span></b>`;
  impact.innerHTML = `${core}${pieces}`;
  document.body.appendChild(impact);
  setTimeout(() => impact.remove(), kind === "tea" ? 1050 : 1320);
}

function showVoiceBubble(effect) {
  const from = state.players[effect.from];
  const preset = voicePresets[effect.voice] || { label: effect.text || "璇煶", icon: "馃帣" };
  const bubble = document.createElement("div");
  bubble.className = "voiceBubble";
  bubble.innerHTML = `<strong>${escapeHtml((from && from.name) || "鐜╁")}</strong><span>${preset.icon || "馃帣"} ${escapeHtml(preset.label)}</span>`;
  document.body.appendChild(bubble);
  setTimeout(() => bubble.remove(), 2200);
}

function render() {
  normalizeOnlineLobbyState();
  ensureSettlementOverlayInBody();
  ensureSocialControls();
  updateActionVisibility();
  renderTable();
  renderTablePlayLayer();
  renderHand();
  renderPanels();
  renderWaitingDock();
  renderSettlementOverlay();
  broadcastSnapshot();
}

function ensureWaitingDock() {
  if (el.waitingDock) return el.waitingDock;
  const dock = document.createElement("div");
  dock.id = "waitingDock";
  dock.className = "waitingDock";
  dock.setAttribute("aria-live", "polite");
  dock.addEventListener("click", event => {
    startAudioOnce();
    const action = event.target.closest("[data-waiting-dock-action]");
    if (!action) return;
    const type = action.dataset.waitingDockAction;
    if (type === "ready") {
      toggleOnlineReadyFromLobby();
    } else if (type === "start") {
      startOnlineRoundFromLobby();
    } else if (type === "invite") {
      el.inviteBtn.click();
    } else if (type === "reconnect") {
      rejoinCurrentRoom();
    }
  });
  document.body.appendChild(dock);
  el.waitingDock = dock;
  return dock;
}

function renderWaitingDock() {
  const dock = ensureWaitingDock();
  const show = online.connected && online.waitingRoom;
  document.body.dataset.waitingRoom = show ? "true" : "false";
  if (!show) {
    dock.hidden = true;
    dock.innerHTML = "";
    return;
  }
  const ready = !!online.readySeats[localSeat()];
  const canStart = online.isHost && allJoinedPlayersReady();
  const reconnect = online.socket && online.socket.readyState === WebSocket.OPEN ? "" : `
    <button class="waitingDockBtn secondary" type="button" data-waiting-dock-action="reconnect">閲嶆柊杩炴帴</button>`;
  const invite = online.isHost && online.roomId ? `
    <button class="waitingDockBtn secondary" type="button" data-waiting-dock-action="invite">閭€璇峰ソ鍙?/button>` : "";
  const start = online.isHost ? `
    <button class="waitingDockBtn primary" type="button" data-waiting-dock-action="start" ${canStart ? "" : "disabled"}>寮€濮嬫湰灞€</button>` : "";
  dock.hidden = false;
  dock.innerHTML = `
    ${invite}
    <button class="waitingDockBtn primary" type="button" data-waiting-dock-action="ready">${ready ? "鍙栨秷鍑嗗" : "鍑嗗"}</button>
    ${start}
    ${reconnect}`;
}

function renderWaitingDock() {
  const dock = ensureWaitingDock();
  normalizeOnlineLobbyState();
  const waitingView = isWaitingRoomView();
  const socketOpen = online.socket && online.socket.readyState === WebSocket.OPEN;
  const syncingStartedRoom = online.roomStarted && !!online.roomId && !hasAnyCardsDealt();
  const show = waitingView || syncingStartedRoom || (!!online.roomId && !socketOpen);
  document.body.dataset.waitingRoom = show ? "true" : "false";
  if (!show) {
    dock.hidden = true;
    dock.innerHTML = "";
    return;
  }
  const ready = !!online.readySeats[localSeat()];
  const canStart = canStartWaitingRoom();
  const invite = online.isHost && online.roomId ? `
    <button class="waitingDockBtn secondary" type="button" data-waiting-dock-action="invite">閭€璇峰ソ鍙?/button>` : "";
  const reconnect = socketOpen && !syncingStartedRoom ? "" : `
    <button class="waitingDockBtn secondary" type="button" data-waiting-dock-action="reconnect">閲嶆柊杩炴帴</button>`;
  const start = online.isHost ? `
    <button class="waitingDockBtn primary" type="button" data-waiting-dock-action="start" ${canStart ? "" : "disabled"}>寮€濮嬫湰灞€</button>` : "";
  dock.hidden = false;
  dock.innerHTML = `
    ${invite}
    <button class="waitingDockBtn primary" type="button" data-waiting-dock-action="ready" ${online.connected ? "" : "disabled"}>${ready ? "鍙栨秷鍑嗗" : "鍑嗗"}</button>
    ${start}
    ${reconnect}`;
}

function ensureSettlementOverlayInBody() {
  if (!el.settlementOverlay) {
    el.settlementOverlay = document.createElement("section");
    el.settlementOverlay.id = "settlementOverlay";
    el.settlementOverlay.className = "settlementOverlay";
    el.settlementOverlay.setAttribute("aria-live", "polite");
    el.settlementOverlay.innerHTML = `
      <div class="settlementPanel">
        <div class="settlementResult" id="settlementResult">鑳滃埄</div>
        <div class="settlementBoard">
          <div class="settlementTitle" id="settlementTitle">鏈眬缁撶畻</div>
          <div class="settlementHead">
            <span>鐜╁</span>
            <span>闃佃惀</span>
            <span>鏈眬</span>
            <span>鎬诲垎</span>
          </div>
          <div id="settlementRows" class="settlementRows"></div>
        </div>
        <button id="settlementNextBtn" class="settlementNextBtn">涓嬩竴灞€</button>
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

function setJoining(active, title = "姝ｅ湪鍔犲叆鎴块棿", text = "姝ｅ湪杩炴帴鏈嶅姟鍣ㄥ苟绛夊緟鎴夸富鍚屾鐗屽眬...") {
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
  const snapshotHasCards = hasAnyCardsDealt();
  applyLocalSeat(message.seat);
  online.roomId = message.roomId || online.roomId;
  online.roomStarted = snapshotHasCards && (!!message.roomStarted || !message.waitingRoom);
  online.waitingRoom = !online.roomStarted && (!!message.waitingRoom || !snapshotHasCards);
  online.readySeats = message.readySeats || {};
  online.hasSnapshot = true;
  if (state.players[online.seat] && !el.nameInput.value.trim()) el.nameInput.value = state.players[online.seat].name;
  if (previousSeat && previousSeat !== online.seat) {
    state.tableNotice = `浣犻€夋嫨鐨勫骇浣嶅凡鍗犵敤锛屽凡鑷姩杩涘叆搴т綅 ${online.seat}`;
  }
  normalizeOnlineLobbyState();
  setJoining(false);
  render();
  updateOnlineStatus();
}

function applyRoomState(message) {
  const alreadyDealt = hasAnyCardsDealt();
  const serverStarted = !!message.started;
  const keepLocalStarted = !serverStarted && alreadyDealt && online.roomStarted;
  online.roomId = message.roomId || online.roomId;
  online.clientId = message.clientId || online.clientId;
  online.creatorId = message.creatorId || online.creatorId;
  applyLocalSeat(message.seat);
  online.connected = true;
  online.roomStarted = serverStarted || keepLocalStarted;
  cancelReconnect();

  online.seatClients = {};
  online.clientSeats = {};
  online.readySeats = {};
  const seats = Array.isArray(message.seats) ? message.seats : [];
  const profiles = {};
  seats.forEach((seatInfo, index) => {
    if (!seatInfo) return;
    profiles[index] = { name: seatInfo.name || `鐜╁ ${index}`, avatarUrl: seatInfo.avatarUrl || "" };
    if (seatInfo.human && seatInfo.clientId && seatInfo.connected !== false) {
      online.seatClients[index] = seatInfo.clientId;
      online.clientSeats[seatInfo.clientId] = index;
    }
    if (seatInfo.ready) online.readySeats[index] = true;
  });

  if (!online.roomStarted) {
    online.waitingRoom = true;
    if (!isWaitingRoomView() || alreadyDealt || state.gameOver) {
      setupWaitingRoom({ preserveProfiles: profiles });
    }
    online.hasSnapshot = !!message.hasSnapshot;
  } else if (online.roomStarted && !alreadyDealt) {
    online.waitingRoom = true;
    requestRoomSnapshot();
  } else if (!alreadyDealt && (!online.hasSnapshot || !state.players.length)) {
    setupWaitingRoom({ preserveProfiles: profiles });
    online.hasSnapshot = true;
  }

  seats.forEach((seatInfo, index) => {
    const player = state.players[index];
    if (!player) return;
    if (!seatInfo) {
      if (isWaitingRoomView() && index > 0) {
        player.human = false;
        player.botFilled = false;
        player.name = `绌轰綅 ${index}`;
        player.avatarUrl = "";
      }
      return;
    }
    player.name = seatInfo.name || (index === 0 ? "鎴夸富" : `鐜╁ ${index}`);
    player.avatarUrl = cleanAvatarUrl(seatInfo.avatarUrl) || player.avatarUrl || "";
    if (!alreadyDealt) {
      player.human = !!seatInfo.human;
      player.botFilled = !!seatInfo.bot;
    }
  });

  normalizeOnlineLobbyState();
  setJoining(false);
  render();
  updateOnlineStatus();
}

function broadcastSnapshot() {
  if (!online.connected || !online.isHost || !online.socket || online.socket.readyState !== WebSocket.OPEN) return;
  const waitingRoom = isWaitingRoomView();
  const roomStarted = online.roomStarted || !waitingRoom;
  const snapshotState = serializeState();
  sendSocket({
    type: "stateSnapshot",
    payload: {
      type: "snapshot",
      state: snapshotState,
      roomId: online.roomId,
      waitingRoom,
      roomStarted,
      readySeats: online.readySeats
    }
  });
  updateOnlineStatus();
}

function sendSocket(message) {
  if (online.socket && online.socket.readyState === WebSocket.OPEN) {
    online.socket.send(JSON.stringify(message));
    return true;
  }
  if (online.roomId) scheduleReconnect();
  return false;
}

function requestRoomSnapshot() {
  if (!online.connected || !online.roomId) return;
  const now = Date.now();
  if (now - online.snapshotRequestedAt < 1200) return;
  online.snapshotRequestedAt = now;
  sendSocket({ type: "requestSnapshot" });
}

function cancelReconnect() {
  if (!online.reconnectTimer) return;
  clearTimeout(online.reconnectTimer);
  online.reconnectTimer = null;
}

function scheduleReconnect() {
  if (!online.roomId || online.reconnectTimer) return;
  const delay = Math.min(12000, 800 * (2 ** Math.min(online.reconnectAttempts, 4)));
  online.reconnectAttempts += 1;
  state.tableNotice = "鑱旀満涓柇锛屾鍦ㄨ嚜鍔ㄩ噸杩?..";
  updateOnlineStatus("鑱旀満涓柇锛屾鍦ㄨ嚜鍔ㄩ噸杩?..");
  render();
  online.reconnectTimer = setTimeout(() => {
    online.reconnectTimer = null;
    rejoinCurrentRoom();
  }, delay);
}

async function rejoinCurrentRoom() {
  if (!online.roomId) return;
  try {
    await openSocket();
    const player = state.players[online.seat] || {};
    online.pendingRole = "rejoin";
    sendSocket({
      type: "rejoin",
      roomId: online.roomId,
      seat: online.seat,
      sessionId: online.sessionId,
      name: player.name || playerNameFallback(),
      avatarUrl: player.avatarUrl || cleanAvatarUrl(bootParams.get("avatar"))
    });
    updateOnlineStatus("姝ｅ湪閲嶈繛鐗屽眬...");
  } catch {
    scheduleReconnect();
  }
}

function renderTableCenter() {
  if (online.waitingRoom) {
    el.tableCenter.classList.add("waitingCenter");
    const readyLine = humanSeatsInRoom()
      .map(seat => {
        const player = state.players[seat];
        const name = (player && player.name) || `?? ${seat}`;
        return `${name}: ${online.readySeats[seat] ? "???" : "???"}`;
      })
      .join("?");
    const ready = !!online.readySeats[localSeat()];
    const canStart = online.connected && online.isHost && allJoinedPlayersReady();
    const hostHint = online.isHost
      ? "????????????????????????"
      : "?????????";
    const reconnect = !online.connected && online.roomId
      ? '<button class="waitingBtn secondary" type="button" data-waiting-reconnect>????</button>'
      : "";
    const start = online.isHost
      ? '<button class="waitingBtn ' + (canStart ? "primary" : "disabled") + '" type="button" data-waiting-start ' + (canStart ? "" : "disabled") + '>????</button>'
      : "";
    el.tableCenter.innerHTML = `
      <div class="phasePill">????</div>
      <div class="centerNotice">${state.tableNotice || "??????"}</div>
      <div class="centerLine">${readyLine || "??????"}</div>
      <div class="centerLine">${hostHint}</div>
      <div class="waitingActions">
        <button class="waitingBtn primary" type="button" data-waiting-ready ${online.connected ? "" : "disabled"}>${ready ? "????" : "??"}</button>
        ${start}
        ${reconnect}
      </div>
    `;
    return;
  }
  el.tableCenter.classList.remove("waitingCenter");
  const player = state.players[state.current];
  const phase = state.revealPhase
    ? "????"
    : state.continuingForNextLead
    ? "?????????"
    : state.gameOver
    ? "????"
    : "????";
  const current = state.revealPhase || (state.gameOver && !state.continuingForNextLead)
    ? ""
    : `<div class="centerLine">???<strong>${(player && player.name) || "?"}</strong></div>`;
  const snowChoice = state.pendingSnowChoice
    ? `<div class="centerLine"><strong>${teamName(state.pendingSnowChoice.winnerTeam)}</strong> ???????</div>`
    : "";
  if (isMiniProgramView) {
    const turnText = state.revealPhase || (state.gameOver && !state.continuingForNextLead)
      ? ""
      : `???${(player && player.name) || "?"}`;
    const snowText = state.pendingSnowChoice ? `${teamName(state.pendingSnowChoice.winnerTeam)} ??????` : "";
    el.tableCenter.innerHTML = `
      <div class="trickScoreBadge">${state.trickPoints}<span>?</span></div>
      <div class="centerLine">${snowText || turnText || state.tableNotice || phase}</div>
    `;
    return;
  }
  el.tableCenter.innerHTML = `
    <div class="trickScoreBadge">${state.trickPoints}<span>?</span></div>
    ${current}
    <div class="centerLine">${state.tableNotice || phase} ? ?? ${remainingBigCount()} ?</div>
    ${snowChoice}
  `;
}

function renderTablePlayLayer() {
  if (!el.tablePlayLayer) return;
  if (isWaitingRoomView()) {
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
      ? `${isMiniProgramView ? "" : `<div class="tablePlayTitle">${player.name} 路 ${play.name}</div>`}<div class="tablePlayCards">${play.cards.map(tableCard).join("")}</div>`
      : `<div class="tablePlayPass">${player.name} 路 杩?/div>`;
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
  if (revealedIds.length === 1) return ` · ${inHand ? "亮王在手" : "亮王已打出"}`;
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
  const waitingView = isWaitingRoomView();
  const seats = state.players.map((player, index) => {
    const seatIndex = relativeSeatIndex(index);
    const isTurn = index === state.current && (!state.gameOver || state.continuingForNextLead);
    const emptySeat = isWaitingEmptySeat(player, index);
    const botWaitingSeat = isWaitingBotSeat(player, index);
    const humanWaitingSeat = waitingView && isSeatHumanInWaiting(index);
    const team = waitingView
      ? (humanWaitingSeat ? (online.readySeats[index] ? "???" : "???") : (botWaitingSeat ? "????" : "???"))
      : (player.id === localSeat() ? teamName(player.team) : visibleTeam(player));
    if (emptySeat) {
      return `<article class="seat seat${seatIndex} emptySeat" data-seat="${index}" style="left:${positions[seatIndex][0]};top:${positions[seatIndex][1]}">
        <button class="seatInviteBtn" type="button" data-seat="${index}" aria-label="???? ${index}"><span>+</span></button>
        <div class="name">?? ${index}</div>
      </article>`;
    }
    if (botWaitingSeat) {
      return `<article class="seat seat${seatIndex} emptySeat botWaitingSeat" data-seat="${index}" style="left:${positions[seatIndex][0]};top:${positions[seatIndex][1]}">
        <button class="seatInviteBtn botSeatBtn" type="button" data-seat="${index}" aria-label="?????? ${index}"><span>?</span></button>
        <div class="name">?? ${index}</div>
        <div class="meta">?????</div>
      </article>`;
    }
    const revealHands = shouldRevealHands();
    const handPreview = revealHands && player.hand.length
      ? `<div class="miniCards revealedHand">${player.hand.map(tinyCard).join("")}</div>`
      : player.id === localSeat() ? "" : `<div class="miniCards">${Array.from({ length: Math.min(player.hand.length, 10) }, () => '<span class="backCard"></span>').join("")}</div>`;
    const revealMark = player.revealAnnouncement ? `<div class="revealMark">${escapeHtml(player.revealAnnouncement)}${revealedBigStatus(player)}</div>` : "";
    const avatarImage = player.avatarUrl ? `<img class="seatAvatarImage" src="${escapeAttr(player.avatarUrl)}" alt="">` : "";
    return `<article class="seat seat${seatIndex}" data-seat="${index}" style="left:${positions[seatIndex][0]};top:${positions[seatIndex][1]}">
      <div class="seatTopInfo"><span>${team}</span><b>${player.score}?</b></div>
      <div class="seatAvatar">${avatarImage}</div>
      <div class="name">${isTurn ? "?" : ""}${escapeHtml(player.name)}</div>
      <div class="cardCountBadge">${player.hand.length}</div>
      <div class="meta">${player.finished ? "???" : ""}</div>
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
  const king = revealScores ? state.scores.king : "??";
  const plain = revealScores ? state.scores.plain : "??";
  const room = online.connected && online.roomId ? `<span class="roomCodeLabel">?? <b>${online.roomId}</b></span>` : "";
  return `<div class="tableScoreStrip">${room}<span>?? <b>${king}</b></span><span>?? <b>${plain}</b></span></div>`;
}


function shouldRevealHands() {
  return state.gameOver && !state.continuingForNextLead;
}

function visibleTeam(player) {
  if (player.knownTeam) return teamName(player.team);
  if (allPublicBigCardsKnown()) return teamName("plain");
  return "闃佃惀鏈煡";
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
  if (isWaitingRoomView()) {
    el.hand.innerHTML = "";
    renderSelection();
    return;
  }
  if (!human) {
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
          <strong>??????</strong>
          <span>${allTeamsDetermined() ? "?????????????" : "????????????????"}</span>
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
    const pointBadge = card.points ? `<div class="pointBadge">?</div>` : "";
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
  return !!(human && human.finished) && allTeamsDetermined() && !isWaitingRoomView();
}

function teammateHandsHtml(human) {
  const teammates = state.players.filter(player => player.id !== human.id && player.team === human.team);
  if (!teammates.length) {
    return `<div class="finishedView"><strong>娌℃湁闃熷弸鍙煡鐪?/strong></div>`;
  }
  return `<div class="teammateHands">${teammates.map(player => {
    const cards = [...player.hand];
    sortHand(cards);
    const hand = cards.length
      ? cards.map(tinyCard).join("")
      : `<span class="emptyHand">宸插嚭瀹?/span>`;
    return `<section class="teammateHand">
      <strong>${player.name}<em>${player.hand.length} 寮?/em></strong>
      <div class="teammateCards">${hand}</div>
    </section>`;
  }).join("")}</div>`;
}

function renderSelection() {
  if (isWaitingRoomView()) {
    document.body.dataset.actionVisible = "false";
    el.selectionInfo.textContent = "??????";
    el.teammateBtn.disabled = true;
    el.teammateBtn.hidden = true;
    renderActionButtons({ type: "waiting" });
    return;
  }
  const human = localPlayer();
  const actionMode = currentActionMode();
  document.body.dataset.actionVisible = shouldShowActionButtons(actionMode, human) ? "true" : "false";
  renderActionButtons(actionMode);
  if (!human) {
    el.selectionInfo.textContent = "?????";
    return;
  }
  if (actionMode.type === "reveal") {
    el.selectionInfo.textContent = actionMode.count >= 2 ? "????????" : "??????????";
    return;
  }
  if (actionMode.type === "snow") {
    el.selectionInfo.textContent = "????????";
    return;
  }
  const canSeeTeammates = canViewTeammateHands();
  el.teammateBtn.hidden = !human.finished;
  el.teammateBtn.disabled = human.finished && !canSeeTeammates;
  el.teammateBtn.textContent = human.finished
    ? (canSeeTeammates ? (teammateView ? "??????" : "?????") : "????")
    : "?????";
  if (human.finished) {
    el.selectionInfo.textContent = canSeeTeammates
      ? (teammateView ? "????????" : "???????????????")
      : "?????????????";
    el.playBtn.disabled = true;
    el.passBtn.disabled = true;
    el.clearBtn.disabled = true;
    return;
  }
  const cards = selectedCards();
  const play = classify(cards);
  const beat = canBeat(play, state.currentPlay);
  el.selectionInfo.textContent = play.valid
    ? `${play.name}?${beat.ok ? `???${playStrengthText(play)}` : beat.reason}`
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
  if (isWaitingRoomView()) {
    return { type: "waiting" };
  }
  if (state.revealPhase && !isWaitingRoomView()) {
    const undecided = undecidedLocalBigs();
    if (undecided.length) return { type: "reveal", count: undecided.length };
  }
  if (state.pendingSnowChoice && human && human.team === state.pendingSnowChoice.winnerTeam && !human.finished) {
    return { type: "snow" };
  }
  return { type: "play" };
}

function shouldShowActionButtons(mode, human) {
  if (!human) return false;
  if (mode.type === "waiting") return false;
  if (mode.type === "reveal" || mode.type === "snow") return true;
  if (human.finished) return canViewTeammateHands();
  return !state.pendingSnowChoice
    && !state.revealPhase
    && state.current === localSeat()
    && (!state.gameOver || state.continuingForNextLead);
}

function renderActionButtons(mode) {
  el.playBtn.classList.toggle("primary", mode.type !== "snow");
  el.clearBtn.hidden = false;
  if (mode.type === "waiting") {
    const ready = !!online.readySeats[localSeat()];
    el.playBtn.textContent = ready ? "????" : "??";
    el.passBtn.textContent = "????";
    el.clearBtn.textContent = "????";
    el.playBtn.disabled = !online.connected;
    el.passBtn.disabled = !online.connected || !online.isHost;
    el.clearBtn.disabled = !online.connected;
    el.teammateBtn.hidden = true;
    return;
  }
  if (mode.type === "reveal") {
    el.playBtn.textContent = mode.count >= 2 ? "???" : "?";
    el.passBtn.textContent = mode.count >= 2 ? "???" : "??";
    el.clearBtn.textContent = "??";
    el.playBtn.disabled = false;
    el.passBtn.disabled = false;
    el.clearBtn.disabled = mode.count < 2;
    el.clearBtn.hidden = mode.count < 2;
    el.teammateBtn.hidden = true;
    return;
  }
  if (mode.type === "snow") {
    el.playBtn.textContent = "?";
    el.passBtn.textContent = "??";
    el.clearBtn.textContent = "????";
    el.playBtn.disabled = false;
    el.passBtn.disabled = false;
    el.clearBtn.disabled = true;
    el.clearBtn.hidden = true;
    el.teammateBtn.hidden = true;
    return;
  }
  el.playBtn.textContent = "??";
  el.passBtn.textContent = "?";
  el.clearBtn.textContent = "????";
  el.clearBtn.hidden = false;
}

function playStrengthText(play) {
  if (!play || play.type !== "bomb") return "";
  if (play.absolute) return " ? ????";
  if (play.specialKind === "yao" || play.jokerKing) return ` ? ${laneName(play.lane)}?`;
  return ` ? ${laneName(play.lane)}`;
}

function laneName(lane) {
  const names = {
    3: "??",
    4: "??",
    5: "??",
    6: "??",
    7: "??",
    8: "??",
    9: "??",
    10: "??"
  };
  return names[lane] || `${lane}?`;
}

function renderPanels() {
  normalizeScores();
  const waitingView = isWaitingRoomView();
  const tableOnly = isMiniProgramView || !waitingView;
  document.body.dataset.tableOnly = tableOnly ? "true" : "false";
  document.body.dataset.menu = menuMode;
  applyMenuLayout();
  el.menuToggleBtn.textContent = menuMode === "full" ? "????" : menuMode === "mini" ? "????" : "????";
  el.newGameBtn.disabled = online.connected && !online.isHost;
  el.nextRoundBtn.disabled = waitingView || !state.gameOver || state.continuingForNextLead || state.revealPhase;
  if (online.connected && !online.isHost) el.nextRoundBtn.disabled = true;
  el.readyBtn.disabled = !online.connected || !waitingView;
  el.readyBtn.textContent = online.readySeats[localSeat()] ? "????" : "??";
  el.startOnlineBtn.disabled = !canStartWaitingRoom();
  if (el.inviteBtn) el.inviteBtn.disabled = !online.connected || !online.isHost || !online.roomId;
  if (el.hostBtn) el.hostBtn.disabled = online.joining || isOnlineRoomMember();
  if (el.joinBtn) el.joinBtn.disabled = online.joining || isOnlineRoomMember();
  el.autoBtn.disabled = waitingView || (online.connected && !online.isHost) || state.revealPhase || (state.gameOver && !state.continuingForNextLead) || state.current !== localSeat();
  el.trickPoints.textContent = state.trickPoints;
  const revealTeamScores = state.roundSettled || (state.gameOver && !state.continuingForNextLead) || allTeamsDetermined();
  el.kingScore.textContent = revealTeamScores ? state.scores.king : "???";
  el.plainScore.textContent = revealTeamScores ? state.scores.plain : "???";
  el.matchScore.innerHTML = state.players
    .map(player => `<span>${player.name}<b>${formatSigned(player.matchScore || 0)}</b></span>`)
    .join("");
  const player = state.players[state.current] || localPlayer();
  const bigCount = bigRevealCount();
  if (online.connected && waitingView) {
    const readyLines = humanSeatsInRoom()
      .map(seat => `${(state.players[seat] && state.players[seat].name) || `?? ${seat + 1}`}?${online.readySeats[seat] ? "???" : "???"}`)
      .join("<br>");
    el.statusBox.innerHTML = `?????<br>${readyLines || "??????"}`;
  } else if (state.revealPhase) {
    el.statusBox.innerHTML = `????<br>?????${bigCount} ?`;
  } else if (state.continuingForNextLead) {
    el.statusBox.innerHTML = `????????????<br>???<strong>${player.name}</strong><br>??????????`;
  } else if (state.gameOver && !state.continuingForNextLead) {
    el.statusBox.innerHTML = `?????<br>??????${(state.players[state.firstFinisherNext] && state.players[state.firstFinisherNext].name) || "??"}`;
  } else {
    el.statusBox.innerHTML = `???<strong>${player.name}</strong><br>???${(state.players[state.leader] && state.players[state.leader].name) || "?"}<br>?????${bigCount} ?`;
  }
  el.currentPlay.innerHTML = state.currentPlay
    ? `<strong>${state.players[state.lastPlayer].name}</strong><br>${state.currentPlay.name}<div class="playedCards">${state.currentPlay.cards.map(tinyCard).join("")}</div>`
    : state.revealPhase ? "??????" : "??????";
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
    el.settlementResult.textContent = localWon ? "??" : "??";
    el.settlementResult.dataset.result = localWon ? "win" : "lose";
  }
  if (el.settlementTitle) {
    el.settlementTitle.textContent = state.tableNotice || `${teamName(winnerTeam)}?? ? ????`;
  }
  const settlementHead = el.settlementOverlay.querySelector(".settlementHead");
  if (settlementHead) {
    settlementHead.innerHTML = "<span>??</span><span>??</span><span>????</span><span>??</span>";
  }
  if (el.settlementRows) {
    el.settlementRows.innerHTML = state.lastSettlement.map(item => {
      const player = state.players[item.playerId];
      const isSelf = item.playerId === (local && local.id);
      const deltaClass = item.delta >= 0 ? "plus" : "minus";
      return `
        <div class="settlementRow ${isSelf ? "self" : ""}">
          <span><b>${isSelf ? "?" : (player && player.name) || item.name}</b><small>${isSelf ? item.name : "??"}</small></span>
          <span>${teamName(player && player.team)}</span>
          <span class="${deltaClass}">${formatSigned(item.delta)}</span>
          <span>${item.total}</span>
        </div>
      `;
    }).join("");
  }
  if (el.settlementNextBtn) {
    const waitingForHeadRunner = state.continuingForNextLead;
    el.settlementNextBtn.disabled = waitingForHeadRunner || (online.connected && !online.isHost);
    el.settlementNextBtn.textContent = waitingForHeadRunner
      ? "????"
      : online.connected && !online.isHost
      ? "???????"
      : "???";
  }
}

function shouldShowSettlementOverlay() {
  if (isWaitingRoomView() || state.pendingSnowChoice) return false;
  if (state.roundSettled || state.lastSettlement.length > 0) return true;
  return isFinalSettlementNotice(state.tableNotice);
}

function isFinalSettlementNotice(notice) {
  const text = String(notice || "");
  return ["win", "settle", "snow", "roundOver", "gameOver"].some(word => text.includes(word));
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
  addLog("???? 200??????? ");
}

function renderRevealBox() {
  const human = localPlayer();
  if (state.pendingSnowChoice) {
    const pending = state.pendingSnowChoice;
    if (human && human.team === pending.winnerTeam && !human.finished) {
      el.revealBox.innerHTML = `${teamName(pending.winnerTeam)}????????????????`;
      return;
    }
    el.revealBox.innerHTML = `??${teamName(pending.winnerTeam)}????????????`;
    return;
  }
  if (isWaitingRoomView()) {
    el.revealBox.innerHTML = online.connected ? "?????" : "????";
    return;
  }
  if (!state.revealPhase) {
    const bigStatus = state.players.map(revealedBigStatus).filter(Boolean).join("<br>");
    el.revealBox.innerHTML = bigStatus || "?????????";
    return;
  }
  if (undecidedLocalBigs().length) {
    el.revealBox.innerHTML = "?????????????";
    return;
  }
  el.revealBox.innerHTML = "??????????????";
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
  const pointBadge = card.points ? `<em>鍒?/em>` : "";
  if (card.joker) {
    const label = card.joker === "small" ? "灏忕帇" : cardLabel(card);
    return `<span class="tinyCard${color}${cardStateClass(card)}${jokerKind}"><small>JOKER</small>${label}</span>`;
  }
  return `<span class="tinyCard${color}${cardStateClass(card)}${jokerKind}">${cardLabel(card)}${pointBadge}</span>`;
}

function tableCard(card) {
  const color = card.color === "red" ? " red" : card.color === "joker" ? " joker" : "";
  const jokerKind = jokerKindClass(card);
  const pointBadge = card.points ? `<em>鍒?/em>` : "";
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
  if (mode.type === "waiting") {
    toggleOnlineReadyFromLobby();
    return;
  }
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
  if (mode.type === "waiting") {
    startOnlineRoundFromLobby();
    return;
  }
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
    state.tableNotice = "??????????";
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
      state.tableNotice = "涓嬩竴灞€绛夊緟鐜╁鍑嗗";
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


function startOnlineRoundFromLobby() {
  if (!online.connected || !online.roomId || !online.isHost) return false;
  normalizeOnlineLobbyState();
  if (hasAnyCardsDealt()) return false;

  const notReady = unreadyJoinedSeats();
  if (notReady.length) {
    state.tableNotice = `还有真人玩家未准备：${notReady.map(seat => (state.players[seat] && state.players[seat].name) || `玩家 ${seat}`).join("、")}`;
    render();
    return true;
  }

  online.readySeats[localSeat()] = true;
  sendSocket({ type: "action", action: "ready", ready: true });
  fillEmptySeatsWithBots();
  online.waitingRoom = false;
  online.roomStarted = true;
  online.hasSnapshot = true;
  state.gameOver = false;
  state.roundSettled = false;
  state.lastSettlement = [];
  startGame({ preserveNames: preservedOnlineNames(), preserveProfiles: preservedOnlineProfiles() });
  sendSocket({ type: "action", action: "startRound" });

  if (!hasAnyCardsDealt()) {
    state.tableNotice = "鍙戠墝娌℃湁瀹屾垚锛岃鍐嶇偣涓€娆″紑濮嬫湰灞€";
    render();
    return true;
  }

  broadcastSnapshot();
  setTimeout(() => broadcastSnapshot(), 120);
  setTimeout(() => broadcastSnapshot(), 450);
  setTimeout(() => broadcastSnapshot(), 1000);
  return true;
}

function toggleOnlineReadyFromLobby() {
  normalizeOnlineLobbyState();
  if (!online.connected || !isWaitingRoomView()) return false;
  online.waitingRoom = true;
  const seat = localSeat();
  const ready = !online.readySeats[seat];
  setSeatReady(seat, ready);
  sendSocket({ type: "action", action: "ready", ready });
  return true;
}

el.startOnlineBtn.addEventListener("click", event => {
  if (!startOnlineRoundFromLobby()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

el.readyBtn.addEventListener("click", () => {
  toggleOnlineReadyFromLobby();
});

el.hostBtn.addEventListener("click", async () => {
  if (isOnlineRoomMember()) {
    updateOnlineStatus("Already in room");
    return;
  }
  setJoining(true, "Opening room", "Connecting to server...");
  try {
    await openSocket();
  } catch {
    setJoining(false);
    return;
  }
  applyLocalSeat(0);
  online.hasSnapshot = true;
  state.players[0].name = cleanPlayerName(el.nameInput.value, "??");
  state.players[0].avatarUrl = cleanAvatarUrl(bootParams.get("avatar"));
  online.waitingRoom = true;
  online.pendingRole = "host";
  const requestedRoomId = bootParams.get("host") === "1"
    ? String(bootParams.get("room") || "").trim().toUpperCase()
    : "";
  sendSocket({
    type: "create",
    roomId: requestedRoomId,
    name: state.players[0].name,
    avatarUrl: state.players[0].avatarUrl,
    sessionId: online.sessionId
  });
  setJoining(false);
  render();
});

async function joinRoomFromInputs(options = {}) {
  if (online.joining) return;
  if (isOnlineRoomMember()) {
    updateOnlineStatus("Already in room");
    return;
  }
  const roomId = String(options.roomId || el.roomInput.value).trim().toUpperCase();
  if (!roomId) {
    el.onlineStatus.textContent = "?????";
    return;
  }
  setJoining(true, "Joining room", "Connecting to server...");
  try {
    await openSocket();
  } catch {
    setJoining(false);
    return;
  }
  const requestedSeatRaw = Number(options.seat || el.seatSelect.value);
  const requestedSeat = requestedSeatRaw >= 1 && requestedSeatRaw <= 4 ? requestedSeatRaw : 1;
  online.seat = requestedSeat;
  online.isHost = false;
  online.roomId = roomId;
  const name = cleanPlayerName(options.name != null ? options.name : el.nameInput.value, `?? ${requestedSeat}`);
  el.roomInput.value = roomId;
  el.nameInput.value = name;
  online.waitingRoom = true;
  online.readySeats = {};
  online.hasSnapshot = false;
  online.pendingRole = "join";
  const avatarUrl = cleanAvatarUrl(options.avatarUrl || bootParams.get("avatar"));
  sendSocket({ type: "join", roomId, seat: requestedSeat, name, avatarUrl, sessionId: online.sessionId });
  updateOnlineStatus("Join request sent, waiting for room state...");
  setJoining(true, "Join request sent", "Waiting for host sync...");
}

el.joinBtn.addEventListener("click", () => {
  joinRoomFromInputs();
});

el.table.addEventListener("click", event => {
  startAudioOnce();
  const waitingReady = event.target.closest("[data-waiting-ready]");
  if (waitingReady) {
    toggleOnlineReadyFromLobby();
    return;
  }
  const waitingStart = event.target.closest("[data-waiting-start]");
  if (waitingStart) {
    startOnlineRoundFromLobby();
    return;
  }
  const waitingReconnect = event.target.closest("[data-waiting-reconnect]");
  if (waitingReconnect) {
    rejoinCurrentRoom();
    return;
  }
  const invite = event.target.closest(".seatInviteBtn");
  if (invite) {
    const seat = Number(invite.dataset.seat);
    if (!seat) return;
    showSeatChoice(seat);
    return;
  }
  const avatar = event.target.closest(".seatAvatar");
  if (avatar) {
    const seatNode = avatar.closest(".seat[data-seat]");
    const seat = Number(seatNode && seatNode.dataset.seat);
    if (Number.isFinite(seat)) showSocialMenu(seat, event);
  }
});

document.addEventListener("pointerdown", startAudioOnce, { once: true, passive: true });

el.renameBtn.addEventListener("click", () => {
  const name = cleanPlayerName(el.nameInput.value, localSeat() === 0 ? "?" : `?? ${localSeat()}`);
  if (online.connected) {
    sendSocket({ type: "action", action: "rename", name, avatarUrl: cleanAvatarUrl(bootParams.get("avatar")) });
    return;
  }
  renameSeat(localSeat(), name);
  render();
});

el.inviteBtn.addEventListener("click", async () => {
  if (!online.roomId) {
    el.onlineStatus.textContent = "???????";
    return;
  }
  const url = inviteUrl(online.roomId);
  try {
    await navigator.clipboard.writeText(url);
    el.onlineStatus.textContent = `?? ${online.roomId || ""} ? ${phase}${hostReady} ? ${seats}`;
  } catch {
    window.prompt("澶嶅埗杩欎釜閭€璇烽摼鎺ュ彂缁欐湅鍙嬶細", url);
  }
});

el.inviteJoinBtn && el.inviteJoinBtn.addEventListener("click", () => {
  const roomId = el.roomInput.value.trim().toUpperCase();
  const name = cleanPlayerName((el.inviteNameInput && el.inviteNameInput.value) || el.nameInput.value, "鐜╁");
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
  player.name = cleanPlayerName(name, seat === 0 ? "?" : `?? ${seat}`);
  state.tableNotice = `${player.name} ???`;
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
      action: "room",
      title: `???? ?? ${roomId}`
    }
  });
}

function postMiniProgramShare(roomId) {
  if (!roomId || !(window.wx && window.wx.miniProgram)) return;
  if (window.wx.miniProgram.postMessage) {
    window.wx.miniProgram.postMessage({
      data: {
        roomId,
        action: "share",
        title: `???? ?? ${roomId}`,
        path: `/pages/index/index?room=${encodeURIComponent(roomId)}`
      }
    });
  }
}

function showSeatChoice(seat) {
  const existing = document.querySelector(".seatChoiceOverlay");
  if (existing) existing.remove();
  const player = state.players[seat];
  if (!player || seat === localSeat()) return;
  const isBotSeat = isWaitingBotSeat(player, seat);
  const isHumanSeat = isSeatHumanInWaiting(seat);
  if (isHumanSeat) return;
  const overlay = document.createElement("section");
  overlay.className = "seatChoiceOverlay";
  overlay.innerHTML = `
    <div class="seatChoiceCard">
      <strong>${isBotSeat ? `?? ${seat}` : `?? ${seat}`}</strong>
      <span>${isBotSeat ? "????????????????" : "???????????????????"}</span>
      <div>
        <button class="primary" data-action="invite">????</button>
        ${isBotSeat ? `<button data-action="removeBot">????</button>` : `<button data-action="bot">????</button>`}
        <button data-action="cancel">??</button>
      </div>
    </div>
  `;
  overlay.addEventListener("click", event => {
    const action = event.target.dataset.action;
    if (!action && event.target !== overlay) return;
    if (action === "invite") requestSeatInvite(seat);
    if (action === "bot") fillSeatWithBot(seat);
    if (action === "removeBot") removeSeatBot(seat);
    overlay.remove();
  });
  document.body.appendChild(overlay);
}

function requestSeatInvite(seat) {
  if (!online.connected || !online.roomId) {
    updateOnlineStatus("?????????");
    return;
  }
  const url = inviteUrl(online.roomId);
  postMiniProgramRoom(online.roomId);
  if (isMiniProgramView) {
    postMiniProgramShare(online.roomId);
    state.tableNotice = `?? ${online.roomId} ????????????????`;
    updateOnlineStatus(`???? ${seat}`);
    render();
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      updateOnlineStatus(`????????${url}`);
    }).catch(() => {
      window.prompt("??????", url);
    });
  } else {
    window.prompt("??????", url);
  }
}

function fillSeatWithBot(seat) {
  const player = state.players[seat];
  if (!player || player.human) return;
  if (online.connected) {
    if (!online.isHost) {
      updateOnlineStatus("??????????");
      return;
    }
    sendSocket({ type: "action", action: "fillBot", seat });
  }
  player.botFilled = true;
  player.human = false;
  player.name = `?? ${seat}`;
  player.avatarUrl = "";
  online.readySeats[seat] = true;
  state.tableNotice = `?? ${seat} ?????`;
  render();
}

function removeSeatBot(seat) {
  const player = state.players[seat];
  if (!player || !isWaitingBotSeat(player, seat)) return;
  if (online.connected) {
    if (!online.isHost) {
      updateOnlineStatus("??????????");
      return;
    }
    sendSocket({ type: "action", action: "removeBot", seat });
  }
  player.botFilled = false;
  player.human = false;
  player.name = `?? ${seat}`;
  player.avatarUrl = "";
  player.hand = [];
  player.score = 0;
  delete online.readySeats[seat];
  state.tableNotice = `?? ${seat} ???`;
  render();
}

/*
function postMiniProgramShareLegacy(roomId) {
  if (!roomId || !(window.wx && window.wx.miniProgram)) return;
  if (window.wx.miniProgram.postMessage) window.wx.miniProgram.postMessage({
    data: {
      roomId,
      action: "share",
      title: `浜斾汉鐗屽眬 鎴块棿 ${roomId}锛岀偣鍑荤珛鍗冲姞鍏
    }
  });
  if (window.wx.miniProgram.navigateTo) {
    window.wx.miniProgram.navigateTo({
      url: `/pages/share/share?room=${encodeURIComponent(roomId)}`
    });
  }
}

function showSeatChoice(seat) {
  const existing = document.querySelector(".seatChoiceOverlay");
  if (existing) existing.remove();
  const player = state.players[seat];
  const isBotSeat = !!(player && player.botFilled && !player.human);
  const overlay = document.createElement("section");
  overlay.className = "seatChoiceOverlay";
  overlay.innerHTML = `
    <div class="seatChoiceCard">
      <strong>${isBotSeat ? `浜烘満 ${seat}` : `绌轰綅 ${seat}`}</strong>
      <span>${isBotSeat ? "杩欎釜搴т綅鐩墠鏄汉鏈猴紝鍙互韪㈠嚭锛屼篃鍙互閭€璇风湡浜哄姞鍏ユ浛鎹€? : "璇烽€夋嫨閭€璇峰ソ鍙嬪姞鍏ワ紝鎴栧厛鐢ㄤ汉鏈哄崰浣嶆祴璇曘€?}</span>
      <div>
        <button class="primary" data-action="invite">閭€璇峰井淇″ソ鍙?/button>
        ${isBotSeat ? `<button data-action="removeBot">韪㈠嚭浜烘満</button>` : `<button data-action="bot">浜烘満濉叆</button>`}
        <button data-action="cancel">鍙栨秷</button>
      </div>
    </div>
  `;
  overlay.addEventListener("click", event => {
    const action = event.target.dataset.action;
    if (!action && event.target !== overlay) return;
    if (action === "invite") requestSeatInvite(seat);
    if (action === "bot") fillSeatWithBot(seat);
    if (action === "removeBot") removeSeatBot(seat);
    overlay.remove();
  });
  document.body.appendChild(overlay);
}

function requestSeatInvite(seat) {
  if (!online.connected || !online.roomId) {
    updateOnlineStatus("??????????");
    return;
  }
  const url = inviteUrl(online.roomId);
  postMiniProgramRoom(online.roomId);
  if (isMiniProgramView) {
    postMiniProgramShare(online.roomId);
    state.tableNotice = `宸插噯澶囧ソ鎴块棿 ${online.roomId} 鐨勯個璇凤紝璇风偣鍑荤墝妗屼笂鏂光€滈個璇峰ソ鍙嬧€漙;
    updateOnlineStatus(`閭€璇峰骇浣?${seat}锛氱偣鍑诲皬绋嬪簭涓婃柟閭€璇峰ソ鍙嬶紝濂藉弸鎵撳紑鍚庝細鐩存帴杩涘叆鎴块棿`);
    render();
    return;
  }
  navigator.clipboard && navigator.clipboard.writeText(url).then(() => {
    updateOnlineStatus(`閭€璇烽摼鎺ュ凡澶嶅埗锛?{url}`);
  }).catch(() => {
    window.prompt("澶嶅埗杩欎釜閭€璇烽摼鎺ュ彂缁欐湅鍙嬶細", url);
  });
}

function fillSeatWithBot(seat) {
  const player = state.players[seat];
  if (!player) return;
  if (online.connected) {
    if (!online.isHost) updateOnlineStatus("?????????");
    else sendSocket({ type: "action", action: "fillBot", seat });
    return;
  }
  if (online.connected && !online.isHost) {
    updateOnlineStatus("??????????");
    return;
  }
  if (player.human) return;
  player.botFilled = true;
  player.name = `浜烘満 ${seat}`;
  player.avatarUrl = "";
  state.tableNotice = `搴т綅 ${seat} 宸茬敤浜烘満濉叆`;
  addLog(`搴т綅 ${seat} 宸茬敤浜烘満濉叆銆俙);
  render();
}

function removeSeatBot(seat) {
  const player = state.players[seat];
  if (!player) return;
  if (online.connected) {
    if (!online.isHost) updateOnlineStatus("?????????");
    else sendSocket({ type: "action", action: "removeBot", seat });
    return;
  }
  if (!player.botFilled || player.human) return;
  player.botFilled = false;
  player.human = false;
  player.name = `绌轰綅 ${seat}`;
  player.avatarUrl = "";
  player.hand = [];
  player.score = 0;
  state.tableNotice = `搴т綅 ${seat} 宸茬┖鍑篳;
  addLog(`搴т綅 ${seat} 宸茬┖鍑恒€俙);
  render();
}

*/

function rememberPlayerName(name) {
  return cleanPlayerName(name, "");
}

function rememberPlayerAvatar(url) {
  return cleanAvatarUrl(url);
}

function savedPlayerName() {
  return "";
}

function savedPlayerAvatar() {
  return "";
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
      online.reconnectAttempts = 0;
      cancelReconnect();
      updateOnlineStatus();
      clearPromise();
      resolve();
    }, { once: true });
    socket.addEventListener("message", event => {
      try {
        handleSocketMessage(JSON.parse(event.data));
      } catch {
        updateOnlineStatus("鏀跺埌寮傚父鑱旀満娑堟伅锛屽凡蹇界暐");
      }
    });
    socket.addEventListener("close", () => {
      if (online.socket === socket) online.socket = null;
      online.connected = false;
      if (online.pendingRole !== "rejoin") online.pendingRole = "";
      setJoining(false);
      clearPromise();
      if (online.roomId) {
        scheduleReconnect();
        return;
      }
      updateOnlineStatus("鑱旀満宸叉柇寮€");
    });
    socket.addEventListener("error", () => {
      if (online.socket === socket) online.socket = null;
      if (online.pendingRole !== "rejoin") online.pendingRole = "";
      setJoining(false);
      clearPromise();
      if (online.roomId) {
        scheduleReconnect();
        reject(new Error("socket failed"));
        return;
      }
      updateOnlineStatus("杩炴帴澶辫触锛岃鍒锋柊鍚庨噸璇曪紝鎴栫瓑寰?Render 鏈嶅姟鍞ら啋");
      reject(new Error("socket failed"));
    }, { once: true });
  });
  return online.connectionPromise;
}

function handleSocketMessage(message) {
  if (message.type === "created") {
    if (online.pendingRole !== "host") {
      updateOnlineStatus("蹇界暐浜嗕竴鏉″紓甯稿紑鎴垮洖鎵э紝褰撳墠韬唤淇濇寔涓嶅彉");
      return;
    }
    online.pendingRole = "";
    cancelReconnect();
    online.roomId = message.roomId;
    online.clientId = message.clientId;
    online.creatorId = message.creatorId || message.clientId;
    online.connected = true;
    applyLocalSeat(Number.isFinite(Number(message.seat)) ? Number(message.seat) : 0);
    online.roomStarted = false;
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
          name: cleanPlayerName(el.nameInput.value, "??"),
          avatarUrl: cleanAvatarUrl(bootParams.get("avatar")) || (state.players[0] && state.players[0].avatarUrl) || ""
        }
      }
    });
    state.tableNotice = `?? ${online.roomId} ??????????`;
    addLog(`?? ${online.roomId} ???`);
    updateOnlineStatus();
    render();
    return;
  }
  if (message.type === "joined") {
    if (online.pendingRole !== "join") {
      updateOnlineStatus("????????????");
      return;
    }
    online.pendingRole = "";
    cancelReconnect();
    online.roomId = message.roomId;
    online.clientId = message.clientId;
    online.creatorId = message.creatorId || online.creatorId;
    online.connected = true;
    applyLocalSeat(message.seat);
    online.roomStarted = false;
    postMiniProgramRoom(online.roomId);
    updateOnlineStatus("宸插姞鍏ワ紝绛夊緟鎴夸富鍚屾鐗屽眬");
    setJoining(true, "????", "??????...");
    return;
  }
  if (message.type === "rejoined") {
    online.pendingRole = "";
    cancelReconnect();
    online.roomId = message.roomId;
    online.clientId = message.clientId;
    online.creatorId = message.creatorId || online.creatorId;
    online.connected = true;
    applyLocalSeat(message.seat);
    postMiniProgramRoom(online.roomId);
    setJoining(false);
    updateOnlineStatus("宸查噸鏂拌繘鍏ョ墝灞€");
    render();
    return;
  }
  if (message.type === "roomState") {
    applyRoomState(message);
    return;
  }
  if (message.type === "joinRequest" && online.isHost) {
    const requestedSeat = Number(message.seat);
    const seat = firstOpenSeat(requestedSeat);
    if (!seat) {
      sendSocket({ type: "relay", to: message.clientId, payload: { type: "error", message: "????" } });
      return;
    }
    online.seatClients[seat] = message.clientId;
    online.clientSeats[message.clientId] = seat;
    delete online.readySeats[seat];
    state.players[seat].name = cleanPlayerName(message.name, `?? ${seat}`);
    state.players[seat].avatarUrl = cleanAvatarUrl(message.avatarUrl);
    state.players[seat].human = true;
    state.players[seat].botFilled = false;
    state.players[seat].hand = [];
    state.players[seat].score = 0;
    const moved = requestedSeat !== seat;
    state.tableNotice = moved
      ? `${state.players[seat].name} ????? ${seat}`
      : `${state.players[seat].name} ?????`;
    addLog(`${state.players[seat].name} ????? ${seat}`);
    broadcastSnapshot();
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
        state.players[seat].botFilled = false;
        state.players[seat].name = `?? ${seat}`;
        state.players[seat].avatarUrl = "";
        state.players[seat].hand = [];
        state.players[seat].score = 0;
      }
      delete online.readySeats[seat];
      addLog(`?? ${seat} ???`);
      broadcastSnapshot();
      render();
    }
    return;
  }
  if (message.type === "clientMessage" && online.isHost) {
    handleRemoteAction(message.clientId, message.payload);
    return;
  }
  if (message.type === "socialEffect") {
    applySocialEffect(message.effect);
    return;
  }
  if (message.type === "snapshot") {
    if (!online.isHost && Number(message.seat) === 0) {
      setJoining(false);
      updateOnlineStatus("鏀跺埌寮傚父搴т綅鍚屾锛屽凡鎷掔粷鍒囨崲鍒版埧涓昏瑙掞紝璇峰埛鏂板悗閲嶆柊鍔犲叆");
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
    if (!isWaitingRoomView()) return;
    setSeatReady(seat, !!message.ready);
    return;
  }
  if (message.action === "socialEffect") {
    const effect = { ...(message.effect || {}), from: seat };
    applySocialEffect(effect);
    broadcastSocialEffect(effect);
    return;
  }
  if (message.action === "snowChoice") {
    if (!state.pendingSnowChoice || player.team !== state.pendingSnowChoice.winnerTeam || player.finished) return;
    chooseSnowChoice(message.choice);
    return;
  }
  if (message.action === "reveal") {
    if (isWaitingRoomView()) return;
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
    el.onlineStatus.textContent = extra || "???";
    return;
  }
  if (extra) {
    el.onlineStatus.textContent = extra;
    return;
  }
  const waitingView = isWaitingRoomView();
  const phase = waitingView ? "???" : "???";
  if (online.isHost) {
    const seats = [1, 2, 3, 4].map(seat => {
      const player = state.players[seat];
      const name = player ? player.name : `?? ${seat}`;
      const ready = waitingView ? (online.readySeats[seat] ? "???" : "???") : "";
      return `${seat}:${name}${ready ? " " + ready : ""}`;
    }).join(" / ");
    const hostReady = waitingView ? (online.readySeats[0] ? "???" : "???") : "";
    el.onlineStatus.textContent = `?? ${online.roomId || ""} ${phase} ??${hostReady ? " " + hostReady : ""} ${seats}`;
  } else {
    const readyText = waitingView ? (online.readySeats[online.seat] ? "???" : "???") : "";
    el.onlineStatus.textContent = `?? ${online.roomId || ""} ?? ${online.seat}${readyText ? " " + readyText : ""}`;
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
  if (params.get("host") === "1") return;
  const savedName = queryName || savedPlayerName();
  if (savedName && !el.nameInput.value.trim()) el.nameInput.value = savedName;
  if (savedName) {
    joinRoomFromInputs({ roomId: room, name: savedName, avatarUrl: queryAvatar || savedPlayerAvatar() });
    return;
  }
  showInviteJoinDialog(room);
}

function showInviteJoinDialog(room) {
  if (!el.inviteJoinDialog) return;
  document.body.dataset.inviteJoin = "true";
  if (el.inviteRoomLabel) el.inviteRoomLabel.textContent = `鎴垮彿 ${room}`;
  if (el.inviteNameInput) {
    el.inviteNameInput.value = el.nameInput.value.trim();
    setTimeout(() => el.inviteNameInput.focus(), 80);
  }
}

function hideInviteJoinDialog() {
  document.body.dataset.inviteJoin = "false";
}

function bootGame() {
  setTimeout(warmVoiceAudioCache, 500);
  if (isMiniProgramView) {
    setupWaitingRoom({ resetMatch: true });
    initInviteParams();
    const room = String(bootParams.get("room") || "").trim().toUpperCase();
    if (!room || bootParams.get("host") === "1") {
      setTimeout(() => {
        if (!isOnlineRoomMember()) el.hostBtn.click();
      }, 120);
    }
    return;
  }
  startGame({ resetMatch: true });
  initInviteParams();
}

document.addEventListener("pointerdown", () => {
  startAudioOnce();
  warmVoiceAudioCache();
}, { once: true, passive: true });

bootGame();
