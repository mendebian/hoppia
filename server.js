// Importação de módulos necessários para o funcionamento do servidor
const express = require('express'); 
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');

// Inicialização do Express, servidor HTTP e Socket.io
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configuração de middlewares
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Variáveis relacionadas ao jogo.
const rooms = {};

// Configuração do loop do servidor
const TICK_RATE = 24; 
const TICK_INTERVAL = 1000 / TICK_RATE;

function roomLoop(roomId) {
	const room = rooms[roomId];
	if (!room) return;

	const players = room.players;
	
	for (const playerId in players) {
		const player = players[playerId];

		if (player.angle !== null) {
			const speed = 3;

			player.x += Math.cos(player.angle) * speed;
			player.y += Math.sin(player.angle) * speed;
		}
	}

	emitEvents(roomId, {
		event: 'update',
		content: {
			players: players,
			map: room.map,
		}
	});

	setTimeout(() => roomLoop(roomId), TICK_INTERVAL);
}

// Interação com o Socket.IO
io.on('connection', (socket) => {

	// Tratamento genérico de eventos.
	socket.on('event', (data) => {
		const { event, content } = data;

		switch (event) {
			case 'player':
				handlePlayerActions(socket, content);
				break;
			case 'terrain':
				handleTerrainManipulation(socket, content);
				break;
			case 'room':
				handleRoomEvents(socket, content);
				break;
			case 'rcon':
				handleRemoteConsole(socket, content);
				break;
		}
	});

	// Resposta para teste de ping.
	socket.on("ping", callback => callback());

	// Monitorar desconexões.
	socket.on('disconnect', () => {
		const playerId = socket.id;

		for (const roomId in rooms) {
			const room = rooms[roomId];
			if (room.players[playerId]) {
				delete room.players[playerId];

				if (Object.keys(room.players).length === 0) {
					delete rooms[roomId];
				}
				break;
			}
		}
	});
});	

// Método de emissão de eventos.
const emitEvents = (channel, data) => {
  channel === 'global' ? io.emit('event', data) : io.to(channel).emit('event', data);
};

// Eventos relacionados à sala de jogo.
function handleRoomEvents(socket, content) {
	const { type, data } = content;
	
	switch (type) {
		case 'join':
			handleJoinRoom(socket, data);
			break;
		case 'chat':
			handleRoomChat(socket, data);
			break;
	}
};

// Eventos do console remoto (feature para administradores).
function handleRemoteConsole(socket, content) {
	// nada por fazer ainda.
};

// Eventos relacionados aos players
function handlePlayerActions(socket, content) {
	const { type, data } = content;
	
	switch (type) {
		case 'move':
			handlePlayerMove(socket, data);
			break;
	}
}

function handleTerrainManipulation(socket, content) {
	const { type, data } = content;
	
	const { grid, tile } = data;
	const position = (grid.x - 16) / 32 + (grid.y - 16) / 32 * 64;

	const playerId = socket.id;

	for (const roomId in rooms) {
		const room = rooms[roomId];

		if (room.players[playerId]) {
			const map = room.map;
			map[position] = tile;
			break;
		}
	}
}

// Evento para direcionar à uma sala.
function handleJoinRoom(socket, data) {
    if (!data) return;

    const { nickname, skin } = data;

    const roomId = findOrCreateRoom(rooms);
    const playerId = socket.id;

    socket.join(roomId);

    const room = rooms[roomId];

    room.players[playerId] = {
        id: playerId,
        room: roomId,
        nickname: nickname.slice(0, 24),
		skin: skin,
        angle: null,
        x: Math.floor(Math.random() * 2028) + 10,
        y: Math.floor(Math.random() * 2028) + 10,
    };
}

function handleRoomChat(socket, data) {
	const playerId = socket.id;

	for (const roomId in rooms) {
		const room = rooms[roomId];

		if (room.players[playerId]) {
			const player = room.players[playerId];
			data.entity = player;

			emitEvents(roomId, {
				event: 'room',
				content: {
					type: 'chat',
					data
				}
			});
			break;
		}
	}
}

function handlePlayerMove(socket, data) {
	const { angle } = data;

    const playerId = socket.id;

    for (const roomId in rooms) {
        const room = rooms[roomId];
        
        if (room.players && room.players[playerId]) {
            room.players[playerId].angle = angle;
            break;
        }
    }
}

// Função para encontrar uma sala disponível ou criar uma nova.
function findOrCreateRoom(rooms) {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (Object.keys(room.players).length < 32) {
            return roomId;
        }
    }
	  
    const roomId = uuidv4();
    rooms[roomId] = { map: new Array(4096).fill(71), players: {} }; // Sala genérica.
    roomLoop(roomId); // Certifique-se de que esta função está definida.

    return roomId;
}

// Iniciar 'server' na porta 3000.
server.listen(3000, () => {
  console.log('Server is running...');
});