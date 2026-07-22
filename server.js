const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const uploadRoot = path.join(root, "uploads");
const rooms = new Map();
const startedAt = Date.now();
const version = "2026-07-22-reconnect-host-lock-v1";
const ROOM_IDLE_TTL_MS = 10 * 60 * 1000;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (req.method === "POST" && urlPath === "/api/avatar") {
    handleAvatarUpload(req, res);
    return;
  }
  if (urlPath === "/healthz") {
    const body = JSON.stringify({ ok: true, version, rooms: rooms.size, uptimeMs: Date.now() - startedAt });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(body);
    return;
  }
  const filePath = path.join(root, urlPath === "/" ? "index.html" : urlPath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
});

function handleAvatarUpload(req, res) {
  let body = "";
  req.setEncoding("utf8");
  req.on("data", chunk => {
    body += chunk;
    if (body.length > 4 * 1024 * 1024) req.destroy();
  });
  req.on("end", () => {
    try {
      const data = JSON.parse(body || "{}");
      const match = String(data.image || "").match(/^data:image\/(png|jpe?g|webp);base64,([a-z0-9+/=]+)$/i);
      if (!match) {
        writeJson(res, 400, { ok: false, message: "invalid image" });
        return;
      }
      const ext = match[1].toLowerCase().replace("jpeg", "jpg");
      const buffer = Buffer.from(match[2], "base64");
      if (!buffer.length || buffer.length > 1024 * 1024) {
        writeJson(res, 400, { ok: false, message: "image too large" });
        return;
      }
      fs.mkdirSync(uploadRoot, { recursive: true });
      const fileName = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${ext}`;
      fs.writeFileSync(path.join(uploadRoot, fileName), buffer);
      writeJson(res, 200, { ok: true, avatarUrl: `/uploads/${fileName}` });
    } catch {
      writeJson(res, 400, { ok: false, message: "bad request" });
    }
  });
}

function writeJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) return socket.destroy();
  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));
  const client = {
    id: crypto.randomBytes(4).toString("hex"),
    socket,
    roomId: null,
    seat: null,
    buffer: Buffer.alloc(0),
    messageParts: []
  };
  socket.setTimeout(1000 * 60 * 60);
  socket.on("data", data => handleFrames(client, data));
  socket.on("close", () => leave(client));
  socket.on("error", () => leave(client));
});

function handleFrames(client, data) {
  client.buffer = Buffer.concat([client.buffer, data]);
  let offset = 0;
  while (offset + 2 <= client.buffer.length) {
    const frameStart = offset;
    const byte1 = client.buffer[offset++];
    const fin = (byte1 & 128) !== 0;
    const opcode = byte1 & 15;
    const byte2 = client.buffer[offset++];
    let length = byte2 & 127;
    if (length === 126) {
      if (offset + 2 > client.buffer.length) {
        offset = frameStart;
        break;
      }
      length = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (offset + 8 > client.buffer.length) {
        offset = frameStart;
        break;
      }
      length = Number(client.buffer.readBigUInt64BE(offset));
      offset += 8;
    }
    const masked = (byte2 & 128) !== 0;
    if (masked && offset + 4 > client.buffer.length) {
      offset = frameStart;
      break;
    }
    const mask = masked ? client.buffer.slice(offset, offset + 4) : null;
    if (masked) offset += 4;
    if (offset + length > client.buffer.length) {
      offset = frameStart;
      break;
    }
    const payload = client.buffer.slice(offset, offset + length);
    offset += length;
    if (opcode === 8) return client.socket.end();
    if (mask) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }
    if (opcode === 9) {
      sendFrame(client, payload, 10);
      continue;
    }
    if (opcode === 0) {
      client.messageParts.push(Buffer.from(payload));
      if (fin) {
        handleTextPayload(client, Buffer.concat(client.messageParts));
        client.messageParts = [];
      }
      continue;
    }
    if (opcode !== 1) continue;
    if (!fin) {
      client.messageParts = [Buffer.from(payload)];
      continue;
    }
    handleTextPayload(client, payload);
  }
  client.buffer = client.buffer.slice(offset);
}

function handleTextPayload(client, payload) {
  if (payload.length > 2 * 1024 * 1024) {
    send(client, { type: "error", message: "消息过大" });
    return;
  }
  try {
    handleMessage(client, JSON.parse(payload.toString("utf8")));
  } catch {
    send(client, { type: "error", message: "消息格式错误" });
  }
}

function handleMessage(client, message) {
  if (message.type === "create") {
    createRoom(client, message);
    return;
  }
  if (message.type === "join") {
    joinRoom(client, message);
    return;
  }
  if (message.type === "rejoin") {
    rejoinRoom(client, message);
    return;
  }
  const room = rooms.get(client.roomId);
  if (!room) return;
  if (message.type === "stateSnapshot") {
    storeRoomSnapshot(room, client, message.payload || {});
    return;
  }
  if (message.type === "action") {
    handleRoomAction(room, client, message);
    return;
  }
  if (message.type === "relay") {
    relayLegacyGameMessage(room, client, message);
  }
}

function createRoom(client, message) {
  if (client.roomId) {
    send(client, { type: "error", message: "你已经在房间中，刷新页面后才能重新开房" });
    return;
  }
  const requestedRoomId = normalizeRequestedRoomId(message.roomId);
  if (requestedRoomId && rooms.has(requestedRoomId)) {
    send(client, { type: "error", message: "房号已被占用，请重新开房" });
    return;
  }
  const roomId = requestedRoomId || newRoomId();
  const room = {
    id: roomId,
    creatorId: client.id,
    clients: new Map([[client.id, client]]),
    seats: Array.from({ length: 5 }, () => null),
    voiceActiveUntil: new Map(),
    createdAt: Date.now(),
    emptySince: null,
    cleanupTimer: null,
    snapshot: null
  };
  rooms.set(roomId, room);
  client.roomId = roomId;
  client.seat = 0;
  client.sessionId = String(message.sessionId || "");
  room.seats[0] = humanSeat(client, 0, message.name || "房主", message.avatarUrl || "");
  send(client, { type: "created", roomId, clientId: client.id, seat: 0, creatorId: room.creatorId });
  broadcastRoomState(room);
}

function joinRoom(client, message) {
  if (client.roomId) {
    send(client, { type: "error", message: "你已经在房间中，刷新页面后才能加入其他房间" });
    return;
  }
  const roomId = String(message.roomId || "").trim().toUpperCase();
  const room = rooms.get(roomId);
  if (!room) {
    send(client, { type: "error", message: "房间不存在" });
    return;
  }
  const seat = firstOpenSeat(room, Number(message.seat));
  if (seat === null) {
    send(client, { type: "error", message: "房间已满" });
    return;
  }
  room.clients.set(client.id, client);
  room.emptySince = null;
  clearRoomCleanup(room);
  client.roomId = room.id;
  client.seat = seat;
  client.sessionId = String(message.sessionId || "");
  room.seats[seat] = humanSeat(client, seat, message.name || `玩家 ${seat}`, message.avatarUrl || "");
  send(client, { type: "joined", roomId: room.id, clientId: client.id, seat, creatorId: room.creatorId });
  broadcastRoomState(room);
  sendRoomSnapshot(room, client);
}

function rejoinRoom(client, message) {
  const roomId = String(message.roomId || "").trim().toUpperCase();
  const room = rooms.get(roomId);
  if (!room) {
    send(client, { type: "error", message: "room expired" });
    return;
  }
  const sessionId = String(message.sessionId || "");
  const fallbackName = cleanName(message.name, "player");
  const preferred = Number(message.seat);
  let seatIndex = null;
  if (preferred >= 0 && preferred <= 4) {
    const preferredSeat = room.seats[preferred];
    if (preferredSeat && preferredSeat.human && !preferredSeat.connected) {
      if (!preferredSeat.sessionId || preferredSeat.sessionId === sessionId || preferredSeat.name === fallbackName) {
        seatIndex = preferred;
      }
    }
  }
  if (seatIndex === null && sessionId) {
    const found = room.seats.findIndex(seat => seat && seat.human && !seat.connected && seat.sessionId === sessionId);
    if (found >= 0) seatIndex = found;
  }
  if (seatIndex === null) seatIndex = firstOpenSeat(room, preferred);
  if (seatIndex === null) {
    send(client, { type: "error", message: "room is full" });
    return;
  }

  const oldSeat = room.seats[seatIndex] || {};
  room.clients.set(client.id, client);
  room.emptySince = null;
  clearRoomCleanup(room);
  client.roomId = room.id;
  client.seat = seatIndex;
  client.sessionId = sessionId || oldSeat.sessionId || "";
  room.seats[seatIndex] = humanSeat(
    client,
    seatIndex,
    message.name || oldSeat.name || `player ${seatIndex}`,
    message.avatarUrl || oldSeat.avatarUrl || ""
  );
  room.seats[seatIndex].ready = !!oldSeat.ready;
  if (seatIndex === 0) room.creatorId = client.id;

  send(client, { type: "rejoined", roomId: room.id, clientId: client.id, seat: seatIndex, creatorId: room.creatorId });
  broadcastRoomState(room);
  sendRoomSnapshot(room, client);
}

function handleRoomAction(room, client, message) {
  const seatIndex = client.seat;
  const seat = room.seats[seatIndex];
  if (!seat) return;
  if (message.action === "ready") {
    seat.ready = !!message.ready;
    broadcastRoomState(room);
    return;
  }
  if (message.action === "rename") {
    seat.name = cleanName(message.name, seatIndex === 0 ? "房主" : `玩家 ${seatIndex}`);
    seat.avatarUrl = cleanAvatarUrl(message.avatarUrl);
    broadcastRoomState(room);
    return;
  }
  if (message.action === "fillBot") {
    if (client.id !== room.creatorId) {
      send(client, { type: "error", message: "只有创建房间的人可以填入人机" });
      return;
    }
    const targetSeat = Number(message.seat);
    if (targetSeat < 1 || targetSeat > 4 || room.seats[targetSeat] && room.seats[targetSeat].human) return;
    room.seats[targetSeat] = {
      seat: targetSeat,
      clientId: "",
      human: false,
      bot: true,
      name: `人机 ${targetSeat}`,
      avatarUrl: "",
      ready: true
    };
    broadcastRoomState(room);
    return;
  }
  if (message.action === "removeBot") {
    if (client.id !== room.creatorId) {
      send(client, { type: "error", message: "只有创建房间的人可以踢出人机" });
      return;
    }
    const targetSeat = Number(message.seat);
    if (targetSeat < 1 || targetSeat > 4) return;
    if (room.seats[targetSeat] && room.seats[targetSeat].bot && !room.seats[targetSeat].human) {
      room.seats[targetSeat] = null;
      broadcastRoomState(room);
    }
    return;
  }
  if (message.action === "socialEffect") {
    const effect = { ...(message.effect || {}), from: seatIndex };
    if (effect.kind === "voice") {
      const now = Date.now();
      const busyUntil = room.voiceActiveUntil.get(seatIndex) || 0;
      if (busyUntil > now) return;
      room.voiceActiveUntil.set(seatIndex, now + 3200);
    }
    broadcast(room, { type: "socialEffect", effect });
    return;
  }
  sendCreator(room, { type: "clientMessage", clientId: client.id, payload: message });
}

function relayLegacyGameMessage(room, client, message) {
  if (client.id !== room.creatorId) {
    sendCreator(room, { type: "clientMessage", clientId: client.id, payload: message });
    return;
  }
  if (message.to) {
    const target = room.clients.get(message.to);
    if (target) send(target, message.payload);
    return;
  }
  broadcast(room, message.payload, client);
}

function storeRoomSnapshot(room, client, payload) {
  if (client.id !== room.creatorId) return;
  if (!payload || payload.type !== "snapshot" || !payload.state) return;
  room.snapshot = {
    type: "snapshot",
    state: payload.state,
    roomId: room.id,
    waitingRoom: !!payload.waitingRoom,
    readySeats: payload.readySeats || {},
    updatedAt: Date.now()
  };
}

function sendRoomSnapshot(room, client) {
  if (!room.snapshot) return;
  send(client, { ...room.snapshot, seat: client.seat, roomId: room.id });
}

function leave(client) {
  const room = rooms.get(client.roomId);
  if (!room) return;
  room.clients.delete(client.id);
  if (client.seat !== null && room.seats[client.seat] && room.seats[client.seat].clientId === client.id) {
    room.seats[client.seat].clientId = "";
    room.seats[client.seat].connected = false;
    room.seats[client.seat].lastSeen = Date.now();
  }
  if (room.clients.size === 0) {
    room.emptySince = Date.now();
    scheduleRoomCleanup(room);
  } else {
    broadcastRoomState(room);
  }
  client.roomId = null;
  client.seat = null;
}

function humanSeat(client, seat, name, avatarUrl) {
  return {
    seat,
    clientId: client.id,
    human: true,
    bot: false,
    name: cleanName(name, seat === 0 ? "房主" : `玩家 ${seat}`),
    avatarUrl: cleanAvatarUrl(avatarUrl),
    ready: false,
    sessionId: String(client.sessionId || ""),
    connected: true,
    lastSeen: 0
  };
}

function firstOpenSeat(room, preferred) {
  if (preferred >= 0 && preferred <= 4 && (!room.seats[preferred] || room.seats[preferred].bot)) return preferred;
  for (let seat = 1; seat <= 4; seat += 1) {
    if (!room.seats[seat] || room.seats[seat].bot) return seat;
  }
  return !room.seats[0] || room.seats[0].bot ? 0 : null;
}

function broadcastRoomState(room) {
  for (const client of room.clients.values()) {
    send(client, {
      type: "roomState",
      roomId: room.id,
      clientId: client.id,
      seat: client.seat,
      creatorId: room.creatorId,
      seats: room.seats.map(seat => seat && {
        seat: seat.seat,
        clientId: seat.clientId,
        human: !!seat.human,
        bot: !!seat.bot,
        name: seat.name,
        avatarUrl: seat.avatarUrl,
        ready: !!seat.ready,
        connected: seat.connected !== false
      })
    });
  }
}

function sendCreator(room, message) {
  const creator = room.clients.get(room.creatorId);
  if (creator) send(creator, message);
}

function broadcast(room, message, except = null) {
  for (const peer of room.clients.values()) {
    if (peer !== except) send(peer, message);
  }
}

function scheduleRoomCleanup(room) {
  clearRoomCleanup(room);
  room.cleanupTimer = setTimeout(() => {
    const latest = rooms.get(room.id);
    if (!latest || latest.clients.size > 0) return;
    if (latest.emptySince && Date.now() - latest.emptySince >= ROOM_IDLE_TTL_MS) rooms.delete(latest.id);
  }, ROOM_IDLE_TTL_MS + 1000);
}

function clearRoomCleanup(room) {
  if (!room.cleanupTimer) return;
  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = null;
}

function send(client, message) {
  if (!client || client.socket.destroyed) return;
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  sendFrame(client, payload, 1);
}

function sendFrame(client, payload, opcode = 1) {
  let header;
  if (payload.length < 126) {
    header = Buffer.from([128 | opcode, payload.length]);
  } else if (payload.length <= 65535) {
    header = Buffer.from([128 | opcode, 126, payload.length >> 8, payload.length & 255]);
  } else {
    header = Buffer.alloc(10);
    header[0] = 128 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  client.socket.write(Buffer.concat([header, payload]));
}

function newRoomId() {
  let id;
  do {
    id = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(id));
  return id;
}

function normalizeRequestedRoomId(value) {
  const id = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(id) ? id : "";
}

function cleanName(name, fallback) {
  return String(name || "").trim().slice(0, 10) || fallback;
}

function cleanAvatarUrl(value) {
  const avatarUrl = String(value || "").trim();
  if (!avatarUrl) return "";
  if (avatarUrl.startsWith("/uploads/")) return avatarUrl;
  if (/^https:\/\/[a-z0-9.-]+\/uploads\/[-a-z0-9._%]+$/i.test(avatarUrl)) return avatarUrl;
  return "";
}

const port = Number(process.env.PORT || 8787);
server.listen(port, "0.0.0.0", () => {
  console.log(`五人牌局联机服务已启动: http://localhost:${port} (${version})`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
