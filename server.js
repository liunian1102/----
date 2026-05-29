const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// rooms: Map<code, { host: ws, guests: Map<id, ws>, started: bool, nextId: number }>
const rooms = new Map();
// ws → { roomCode, playerId, isHost }
const clients = new Map();

function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do { code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
    while (rooms.has(code));
    return code;
}

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function broadcastRoom(room, data, excludeWs) {
    if (room.host !== excludeWs) send(room.host, data);
    for (const ws of room.guests.values()) {
        if (ws !== excludeWs) send(ws, data);
    }
}

function getRoom(code) { return rooms.get(code); }

function roomPlayerList(room) {
    const list = [{ id: 0, isHost: true }];
    for (const id of room.guests.keys()) list.push({ id, isHost: false });
    return list;
}

function removeClient(ws) {
    const info = clients.get(ws);
    if (!info) return;
    clients.delete(ws);
    const room = getRoom(info.roomCode);
    if (!room) return;

    if (info.isHost) {
        // Host left: notify all guests, dissolve room
        broadcastRoom(room, { type: 'host_left' }, ws);
        rooms.delete(info.roomCode);
    } else {
        room.guests.delete(info.playerId);
        broadcastRoom(room, { type: 'player_left', playerId: info.playerId });
        send(room.host, { type: 'room_info', players: roomPlayerList(room) });
    }
}

wss.on('connection', ws => {
    ws.on('message', raw => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        switch (msg.type) {
            case 'create': {
                const code = genCode();
                const room = { host: ws, guests: new Map(), started: false, nextId: 1 };
                rooms.set(code, room);
                clients.set(ws, { roomCode: code, playerId: 0, isHost: true });
                send(ws, { type: 'created', code, playerId: 0 });
                break;
            }

            case 'join': {
                const code = (msg.code || '').toUpperCase().trim();
                const room = getRoom(code);
                if (!room) { send(ws, { type: 'error', msg: '房间不存在' }); break; }
                if (room.started) { send(ws, { type: 'error', msg: '游戏已开始' }); break; }
                if (room.guests.size >= 3) { send(ws, { type: 'error', msg: '房间已满（最多4人）' }); break; }
                const playerId = room.nextId++;
                room.guests.set(playerId, ws);
                clients.set(ws, { roomCode: code, playerId, isHost: false });
                send(ws, { type: 'joined', code, playerId });
                send(room.host, { type: 'player_joined', playerId });
                broadcastRoom(room, { type: 'room_info', players: roomPlayerList(room) });
                break;
            }

            case 'start': {
                const info = clients.get(ws);
                if (!info || !info.isHost) break;
                const room = getRoom(info.roomCode);
                if (!room) break;
                room.started = true;
                broadcastRoom(room, { type: 'game_start' });
                break;
            }

            // Host → all guests (game state snapshot)
            case 'state': {
                const info = clients.get(ws);
                if (!info || !info.isHost) break;
                const room = getRoom(info.roomCode);
                if (!room) break;
                for (const gWs of room.guests.values()) send(gWs, { type: 'state', data: msg.data });
                break;
            }

            // Guest → host (input)
            case 'input': {
                const info = clients.get(ws);
                if (!info || info.isHost) break;
                const room = getRoom(info.roomCode);
                if (!room) break;
                send(room.host, { type: 'input', playerId: info.playerId, keys: msg.keys,
                    targetX: msg.targetX, targetY: msg.targetY, moving: msg.moving });
                break;
            }

            // Guest → host (class choice)
            case 'classChoose': {
                const info = clients.get(ws);
                if (!info || info.isHost) break;
                const room = getRoom(info.roomCode);
                if (!room) break;
                send(room.host, { type: 'classChoose', playerId: info.playerId, choice: msg.choice });
                break;
            }

            // Guest → host (talent choice)
            case 'talentChoose': {
                const info = clients.get(ws);
                if (!info || info.isHost) break;
                const room = getRoom(info.roomCode);
                if (!room) break;
                send(room.host, { type: 'talentChoose', playerId: info.playerId, choiceIndex: msg.choiceIndex });
                break;
            }

            // Host → specific guest (show class selection UI)
            case 'showClassSelection': {
                const info = clients.get(ws);
                if (!info || !info.isHost) break;
                const room = getRoom(info.roomCode);
                if (!room) break;
                const targetWs = room.guests.get(msg.playerId);
                if (targetWs) send(targetWs, { type: 'showClassSelection' });
                break;
            }

            // Host → specific guest (show talent menu)
            case 'showTalentMenu': {
                const info = clients.get(ws);
                if (!info || !info.isHost) break;
                const room = getRoom(info.roomCode);
                if (!room) break;
                const targetWs = room.guests.get(msg.playerId);
                if (targetWs) send(targetWs, { type: 'showTalentMenu', choices: msg.choices });
                break;
            }

            // Host → all (game over)
            case 'game_over': {
                const info = clients.get(ws);
                if (!info || !info.isHost) break;
                const room = getRoom(info.roomCode);
                if (!room) break;
                broadcastRoom(room, { type: 'game_over', stats: msg.stats }, ws);
                break;
            }

            // Guest → host (skill cast)
            case 'castSkill': {
                const info = clients.get(ws);
                if (!info || info.isHost) break;
                const room = getRoom(info.roomCode);
                if (!room) break;
                send(room.host, { type: 'castSkill', playerId: info.playerId, skill: msg.skill });
                break;
            }
        }
    });

    ws.on('close', () => removeClient(ws));
    ws.on('error', () => removeClient(ws));
});

console.log(`方块快跑 联机服务器启动，端口 ${PORT}`);
