const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const uploadRoot = path.join(root, "uploads");
const rooms = new Map();
const startedAt = Date.now();
const version = "2026-07-11-room-role-lock";

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
      ".webp": "image/webp"
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
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, message: "invalid image" }));
        return;
      }
      const ext = match[1].toLowerCase().replace("jpeg", "jpg");
      const buffer = Buffer.from(match[2], "base64");
      if (!buffer.length || buffer.length > 1024 * 1024) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, message: "image too large" }));
        return;
      }
      fs.mkdirSync(uploadRoot, { recursive: true });
      const fileName = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${ext}`;
      fs.writeFileSync(path.join(uploadRoot, fileName), buffer);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: true, avatarUrl: `/uploads/${fileName}` }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, message: "bad request" }));
    }
  });
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
    host: false,
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
    if (client.roomId) {
      send(client, { type: "error", message: "你已经在房间中，刷新页面后才能重新开房" });
      return;
    }
    leave(client);
    const requestedRoomId = normalizeRequestedRoomId(message.roomId);
    if (requestedRoomId && rooms.has(requestedRoomId)) {
      send(client, { type: "error", message: "房号已被占用，请重新开房" });
      return;
    }
    const roomId = requestedRoomId || newRoomId();
    rooms.set(roomId, { host: client, clients: new Map([[client.id, client]]) });
    client.roomId = roomId;
    client.host = true;
    send(client, { type: "created", roomId, clientId: client.id });
    return;
  }
  if (message.type === "join") {
    if (client.roomId) {
      send(client, { type: "error", message: "你已经在房间中，刷新页面后才能加入其他房间" });
      return;
    }
    leave(client);
    const room = rooms.get(String(message.roomId || "").toUpperCase());
    if (!room) return send(client, { type: "error", message: "房间不存在" });
    room.clients.set(client.id, client);
    client.roomId = String(message.roomId).toUpperCase();
    client.host = false;
    send(client, { type: "joined", roomId: client.roomId, clientId: client.id });
    send(room.host, { type: "joinRequest", clientId: client.id, seat: message.seat, name: message.name || "玩家", avatarUrl: message.avatarUrl || "" });
    return;
  }
  const room = rooms.get(client.roomId);
  if (!room) return;
  if (client.host) {
    if (message.to) {
      const target = room.clients.get(message.to);
      if (target) send(target, message.payload);
    } else {
      for (const peer of room.clients.values()) {
        if (peer !== client) send(peer, message.payload);
      }
    }
  } else {
    send(room.host, { type: "clientMessage", clientId: client.id, payload: message });
  }
}

function send(client, message) {
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

function leave(client) {
  const room = rooms.get(client.roomId);
  if (!room) return;
  room.clients.delete(client.id);
  if (room.host === client || room.clients.size === 0) rooms.delete(client.roomId);
  else send(room.host, { type: "peerLeft", clientId: client.id });
  client.roomId = null;
  client.host = false;
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

const port = Number(process.env.PORT || 8787);
server.listen(port, "0.0.0.0", () => {
  console.log(`五人牌局联机服务已启动: http://localhost:${port} (${version})`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
