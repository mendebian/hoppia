// 1. Constantes e Configurações Iniciais
const SKINS = ['black', 'blue', 'brown', 'green', 'grey', 'light_blue', 'orange', 'pink', 'purple', 'red', 'white', 'yellow'];
const CANVAS_WIDTH = 2048;
const CANVAS_HEIGHT = 2048;
const LERP_FACTOR = 0.1;
const PING_INTERVAL = 1000;
const ANIMATION_FRAME_INTERVAL = 200;
let DRAW_DISTANCE = 12 * 32;

// 2. Variáveis Globais
const socket = io();
const elements = {
    camera: document.getElementById('camera'),
    canvas: document.getElementById('canvas'),
    ping: document.getElementById('ping'),
    coords: document.getElementById('coords'),
    chat: document.getElementById('chat'),
    messages: document.getElementById('messages'),
    input: document.getElementById('input'),
    inventory: document.getElementById('inventory'),
};
const spriteCache = {};
const keysPressed = {};
let gameRunning = false;
let cameraX = 0, cameraY = 0;
let grid = { x: 0, y: 0 };
let currentAngle = null;
let playerId = null;
let map = [],players = {};
let lastUpdateTime = Date.now();
let animationFrame = 0;
let pingVal = 0;
let selectedTile = 0; // APAGAR

const metadata = {
    nickname: 'Guest_' + (Math.floor(Math.random() * 899) + 100),
    skin: SKINS[Math.floor(Math.random() * SKINS.length)]
};

// 3. Funções de Utilidade
function lerp(start, end, t) {
    return start + (end - start) * t;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function getDirectionFromAngle(angle) {
    if (angle === null) return 1;

    if (angle >= -Math.PI / 4 && angle < Math.PI / 4) return 3;
    if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) return 1;
    if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) return 4;
    return 2;
}

function getMaxCameraBounds() {
    return {
        maxX: elements.canvas.width - elements.camera.clientWidth,
        maxY: elements.canvas.height - elements.camera.clientHeight,
    };
}

function toggleVisibility(element, visibility = null) {
    if (visibility !== null) {
        element.style.display = visibility;
    } else {
        element.style.display = element.style.display === 'none' ? 'flex' : 'none';
    }
}

// 4. Funções de Carregamento de Recursos
function loadSprite(skin) {
    return new Promise((resolve, reject) => {
        if (spriteCache[skin]) {
            resolve(spriteCache[skin]);
        } else {
            const img = new Image();
            img.src = `assets/bunnies/${skin}.png`;
            img.onload = () => {
                spriteCache[skin] = img;
                resolve(img);
            };
            img.onerror = reject;
        }
    });
}

// 5. Funções de Renderização e Atualização
function drawPlayer(context, player, deltaTime) {
    const interpolatedX = lerp(player.prevX, player.x, deltaTime / (1000 / 24));
    const interpolatedY = lerp(player.prevY, player.y, deltaTime / (1000 / 24));

    const direction = getDirectionFromAngle(player.angle);
    const frame = player.angle === null ? 1 : animationFrame;

    const sprite = spriteCache[player.skin];
    if (sprite) {
        const spriteWidth = sprite.width / 3;
        const spriteHeight = sprite.height / 4;

        context.beginPath();
        context.arc(interpolatedX, interpolatedY + spriteHeight / 2, 10, 0, Math.PI * 2);
        context.fillStyle = 'rgba(0, 0, 0, 0.1)';
        context.fill();

        // Desenhar a imagem do jogador
        context.drawImage(
            sprite,
            frame * spriteWidth,
            (direction - 1) * spriteHeight,
            spriteWidth,
            spriteHeight,
            interpolatedX - spriteWidth / 2,
            interpolatedY - spriteHeight / 2,
            spriteWidth,
            spriteHeight
        );
    }
}

function updateGameStats() {
    if (playerId in players) {
        const player = players[playerId];
        elements.ping.textContent = `Ping: ${pingVal}ms`;
        elements.coords.textContent = `X: ${Math.round(player.x)}, Y: ${Math.round(player.y)}`;
    }
}

function updateCamera() {
    if (playerId in players) {
        const player = players[playerId];
        const targetX = player.x - elements.camera.clientWidth / 2;
        const targetY = player.y - elements.camera.clientHeight / 2;

        cameraX = lerp(cameraX, targetX, LERP_FACTOR);
        cameraY = lerp(cameraY, targetY, LERP_FACTOR);

        const { maxX, maxY } = getMaxCameraBounds();
        const clampedX = clamp(cameraX, 0, maxX);
        const clampedY = clamp(cameraY, 0, maxY);

        elements.canvas.style.left = `-${clampedX}px`;
        elements.canvas.style.top = `-${clampedY}px`;
    }
}

// 6. Funções de Controle de Jogo
function handleInput() {
    if (elements.input === document.activeElement) return null;

    let dx = 0, dy = 0;

    if (keysPressed['KeyW'] || keysPressed['ArrowUp']) dy -= 1;
    if (keysPressed['KeyS'] || keysPressed['ArrowDown']) dy += 1;
    if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) dx -= 1;
    if (keysPressed['KeyD'] || keysPressed['ArrowRight']) dx += 1;

    return dx || dy ? Math.atan2(dy, dx) : null;
}

function movePlayer() {
    const angle = handleInput();

    if (angle !== currentAngle || angle === null) {
        currentAngle = angle;
        emitEvents({
            event: 'player',
            content: {
                type: 'move',
                data: {
                    angle: currentAngle,
                }
            }
        });
    }
}

function gameLoop() {
    const now = Date.now();
    const deltaTime = now - lastUpdateTime;

    context.fillStyle = "#7C8B42";
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const player = players[playerId];
    if (!player) return;

    map.forEach((i, pos) => {
        const x = (pos % (CANVAS_HEIGHT / 32)) * 32;
        const y = Math.floor(pos / (CANVAS_WIDTH / 32)) * 32;
    
        // Calcular a distância entre o centro do jogador e o centro do tile
        const dx = x - player.x;
        const dy = y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (!tileset.complete || distance > DRAW_DISTANCE) return;
    
        context.drawImage(
            tileset,
            (i % 30) * 32,
            Math.floor(i / 30) * 32,
            32, 32,
            x, y,
            32, 32
        );
    });

    context.strokeStyle = '#F5F5F5';
    context.lineWidth = 1;
    context.strokeRect(grid.x - 16, grid.y - 16, 32, 32);
    
    Object.values(players)
        .sort((a, b) => a.y - b.y)
        .forEach(player => {
            drawPlayer(context, player, deltaTime);
        });

    movePlayer();
    updateGameStats();
    updateCamera();
    requestAnimationFrame(gameLoop);
}

function handleChatCommands(command, args) {
    switch (command) {
        case 'draw':
            const distance = Number(args[0]);  // Converte para número
            if (Number.isInteger(distance) && distance >= 4 && distance <= 32) {
                DRAW_DISTANCE = distance * 32;  // Se for válido, atualiza a variável
            } else {
                console.log('Valor de draw distance inválido. Deve ser um número inteiro entre 4 e 32.');
            }
            break;
        case 'tp':
            for (id in players) {
                if (players[id].nickname === args[0]) {
                    const player = players[id];
                    console.log(player);
                    break;
                }
            } 
            break;
    }
}

// 7. Eventos de Socket e Inicialização
socket.on('connect', () => {
    playerId = socket.id;

    if (metadata) {
        emitEvents({
            event: 'room',
            content: {
                type: 'join',
                data: metadata
            }
        });

        loadSprite(metadata.skin).then(() => {
            gameLoop();
        });
    } else {
        window.location.href = "/";
    }
});

socket.on('event', (data) => {
    const { event, content } = data;

    switch (event) {
        case 'update':
            handleServerUpdate(content);
            break;
        case 'room':
            handleRoomEvents(content);
            break;
    }
});

function handleServerUpdate(content) {
    const now = Date.now();
    const activePlayerIds = new Set(Object.keys(content.players));

    Object.keys(players).forEach(id => {
        if (!activePlayerIds.has(id)) {
            delete players[id];
        }
    });

    Object.keys(content.players).forEach(id => {
        if (!players[id]) {
            players[id] = {};
        }

        players[id].prevX = players[id].x || content.players[id].x;
        players[id].prevY = players[id].y || content.players[id].y;

        players[id].x = content.players[id].x + 16;
        players[id].y = content.players[id].y + 16;
        players[id].angle = content.players[id].angle;
        players[id].nickname = content.players[id].nickname;
        players[id].skin = content.players[id].skin;

        players[id].lastUpdate = now;

        if (!spriteCache[players[id].skin]) {
            loadSprite(players[id].skin);
        }
    });

    map = content.map;

    lastUpdateTime = now;

    if (!gameRunning) {
        gameRunning = true;
        gameLoop();
    }
}

function handleRoomEvents(content) {
    const { type, data } = content;
    
    switch (type) {
        case 'chat':
            handleChatMessage(data);
            break;
    }
}

function handleChatMessage(data) {
    const { entity, message, timestamp } = data;

    const body = document.createElement('p');
    body.textContent = (entity.id === playerId ? 'You' : entity.nickname) + ': ' + message;

    elements.messages.appendChild(body);
    elements.messages.scrollTop = elements.messages.scrollHeight;
}

const emitEvents = (data) => {
    socket.emit('event', data);
};

// Inicialização do Canvas
elements.canvas.width = CANVAS_WIDTH;
elements.canvas.height = CANVAS_HEIGHT;
const context = elements.canvas.getContext('2d');

// Carregar o tileset
const tileset = new Image();
tileset.src = 'assets/tilesets/tileset.png';

tileset.onload = () => {
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 30; col++) {
            const x = col * 32;
            const y = row * 32;

            const tileCanvas = document.createElement('canvas');
            tileCanvas.width = 32;
            tileCanvas.height = 32;
            const tileContext = tileCanvas.getContext('2d');

            tileContext.drawImage(tileset, x, y, 32, 32, 0, 0, 32, 32);

            const itemImage = document.createElement('img');
            itemImage.src = tileCanvas.toDataURL();
            itemImage.style.width = '32px';
            itemImage.style.height = '32px';

            itemImage.addEventListener('click', () => {
                selectedTile = (row * 30) + col;
                toggleVisibility(elements.inventory, 'none');
            });

            elements.inventory.appendChild(itemImage);
        }
    }
};

// Configuração de Intervalos
setInterval(() => {
    animationFrame++;
    if (animationFrame > 2) {
        animationFrame = 0;
    }
}, ANIMATION_FRAME_INTERVAL);

setInterval(() => {
    const start = Date.now();
    socket.emit('ping', () => {
        pingVal = Math.min(Date.now() - start, 999);
    });
}, PING_INTERVAL);

// Posição do mouse
document.addEventListener('mousemove', (event) => {
    const rect = elements.canvas.getBoundingClientRect();
    const scaleX = elements.canvas.width / rect.width;
    const scaleY = elements.canvas.height / rect.height;

    // Calcula a posição do mouse no canvas, considerando o deslocamento da câmera
    const mouseX = (event.clientX - rect.left) * scaleX - cameraX / 128;
    const mouseY = (event.clientY - rect.top) * scaleY - cameraY / 128;

    // Ajusta as coordenadas para a grade 32x32, e soma 16 para centralizar no grid
    grid.x = Math.floor(mouseX / 32) * 32 + 16;
    grid.y = Math.floor(mouseY / 32) * 32 + 16;
});

// Eventos de Teclado
document.addEventListener('keydown', (e) => {
    keysPressed[e.code] = true;
});

document.addEventListener('keyup', (e) => {
    keysPressed[e.code] = false;

    const keyCode = e.code;

    if (elements.input === document.activeElement) { 
        if (keyCode === 'Enter') {
            const text = elements.input.value.trim();

            if (text) {
                if (text.startsWith('/')) {
                    const args = text.slice(1).split(' ');
                    const command = args[0];
                    args.shift();

                    handleChatCommands(command, args);
                } else {
                    emitEvents({
                        event: 'room',
                        content: {
                            type: 'chat',
                            data: {
                                message: text,
                                timestamp: Date.now(),
                            }
                        }
                    });
                }
            }

            toggleVisibility(elements.chat, 'none');
            elements.input.value = '';
            elements.input.blur();
        }
    } else {
        if (keyCode === 'KeyE') {
            toggleVisibility(elements.inventory);
        }
        
        if (keyCode === 'Enter') {
            toggleVisibility(elements.chat, 'flex');
            elements.input.focus();
        }

        if (keyCode === 'IntlRo') {
            toggleVisibility(elements.chat, 'flex');
            elements.input.value = '/';
            elements.input.focus();
        }
    }
});

// Colocar bloco
elements.canvas.addEventListener('click', function() {
    emitEvents({
        event: 'terrain',
        content: {
            type: 'insert',
            data: {
                tile: selectedTile,
                grid
            }
        }
    });
});