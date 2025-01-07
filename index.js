"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var ws_1 = require("ws");
var node_crypto_1 = require("node:crypto");
var SketchGameManager_1 = require("./models/SketchGameManager");
var PORT = process.env.PORT || 8080;
var wss = new ws_1.WebSocketServer({ port: PORT, host: "0.0.0.0" });
console.log("Server listening on ws://localhost:".concat(PORT));
// Conserve les clients connectés et autre
var state = {
    clients: [],
    typingTimeouts: {}, // Utilise setTimeout pour gérer le 'User is writting' sur le front
    writting: [], // Liste des utilisateurs en train d'écrire
    sketchGames: [], // Liste des parties draw en cours
    quizzes: [], // Liste des parties de quiz en cours
};
var connectionLimits = new Map();
//  Gére la redirection vers les fonctions pour simplifier le code
var messageHandlers = {
    connect: function (client, message) { return connectClient(client, message.username); },
    changeUsername: function (client, message) { return changeUsername(client, message.username); },
    writting: function (client, message) { return handleWritting(client, message); },
    createSketchGame: function (client, message) { return handleCreateSketchGame(client); },
    joinSketchGame: function (client, message) { return handleJoinSketchGame(client, message); },
    getSketchGame: function (client, message) { return handleGetSketchGame(client, message); },
    launchSketchGame: function (client, message) { return handleLaunchSketchGame(client, message); },
    chooseWord: function (client, message) { return handleChooseWord(client, message); },
    guess: function (client, message) { return handleGuess(client, message); },
    canvas: function (client, message) { return handleCanvas(client, message); },
    hello: function (client, message) { return console.log('Hello', client.id); }
};
var handleCanvas = function (client, message) {
    var game = state.sketchGames.find(function (g) { return g.id === message.game; });
    if (!game)
        return;
    game.canvas = message.image;
    game.sendCanvas();
};
var handleChooseWord = function (client, message) {
    var game = state.sketchGames.find(function (g) { return g.id === message.game; });
    if (!game)
        return;
    var player = game.players.find(function (p) { return p.id === client.id; });
    if (!player)
        return;
    game.chooseWord(player, message.value);
};
// Fonction permettant d'envoyer un message à une liste d'utilisateur
var broadcast = function (clients, message) {
    console.log('Broadcasting to clients:', clients.map(function (c) { return c.id; })); // Log pour chaque client
    clients.forEach(function (client) {
        client.send(JSON.stringify(message));
    });
};
// Fonction permettant de créer une partie
var handleCreateSketchGame = function (client) {
    var gameId = Math.random().toString(36).substring(2, 10);
    while (gameId in state.sketchGames) {
        gameId = Math.random().toString(36).substring(2, 10);
    }
    var player = Object.assign(client, { score: 0 });
    var game = new SketchGameManager_1.SketchGameManager(gameId, player);
    state.sketchGames.push(game);
    client.send(JSON.stringify(__assign(__assign({ sender: "server", type: "gameCreated" }, game.getGameInfo()), { gameId: game.id })));
};
// Fonction permettant de rejoindre une partie
var handleJoinSketchGame = function (client, message) {
    var game = state.sketchGames.find(function (g) { return g.id === message.game; });
    var player = Object.assign(client, { score: 0 });
    if (game && !game.players.find(function (p) { return p.id === player.id; })) {
        game.addPlayer(player);
    }
};
var handleGetSketchGame = function (client, message) {
    var game = state.sketchGames.find(function (g) { return g.id === message.game; });
    if (game) {
        client.send(JSON.stringify(__assign({ sender: "server", type: "getSketchGame" }, game.getGameInfo())));
    }
    else {
        client.send(JSON.stringify({
            sender: "server",
            type: "getSketchGame",
            state: "notFound",
        }));
    }
};
var handleLaunchSketchGame = function (client, message) {
    var game = state.sketchGames.find(function (g) { return g.id === message.game; });
    if (game && game.owner.id === client.id) {
        game.startGame();
    }
};
var handleGuess = function (client, message) {
    var game = state.sketchGames.find(function (g) { return g.id === message.game; });
    if (!game) {
        return;
    }
    var player = game.players.find(function (p) { return p.id === client.id; });
    if (!player) {
        return;
    }
    console.log('Guess:', message.value);
    game.guessWord(player, message);
};
// Utilise message handler pour rediriger vers la fonction approprié
var handleIncomingMessage = function (client, data) {
    try {
        var message = JSON.parse(data);
        if (message.type && typeof message.type === 'string' && message.type.length < 50) {
            if (message.type) {
                // Valider les propriétés spécifiques à chaque type de message
                console.log('Handling message:', message.type);
                messageHandlers[message.type](client, message);
            }
            else {
                console.warn("Unknown message type:", message.type);
            }
        }
        else {
            console.error('Invalid message type or length');
        }
    }
    catch (e) {
        console.error("Failed to parse message:", e);
    }
};
// Ajoute un client au state et lui donne un pseudo et id
var connectClient = function (client, username) {
    if (state.clients.find(function (c) { return c.username === username; })) {
        return client.send(JSON.stringify({
            sender: "server",
            value: "Username already taken",
            type: "login",
            success: false,
        }));
    }
    client.id = (0, node_crypto_1.randomUUID)();
    client.username = username;
    state.clients.push(client);
    var welcomeMessage = {
        sender: "server",
        username: username,
        value: "".concat(username, " has joined the chat"),
        type: "connect",
    };
    broadcast(__spreadArray([], state.clients.filter(function (c) { return c.id !== client.id; }), true), welcomeMessage);
    client.send(JSON.stringify({
        sender: "server",
        value: "Welcome to the chat",
        type: "login",
        success: true,
        users: __spreadArray(__spreadArray([], state.clients.map(function (c) { return c.username; }), true), [username], false).filter(function (u, i, a) { return a.indexOf(u) === i; }),
    }));
    console.log('Clients:', state.clients.map(function (c) { return c.username; }));
};
var changeUsername = function (client, username) {
    if (state.clients.find(function (c) { return c.username === username; })) {
        return client.send(JSON.stringify({
            sender: "server",
            value: "Username already taken",
            type: "changeUsername",
            success: false,
        }));
    }
    client.username = username;
    var stateClientIndex = state.clients.findIndex(function (c) { return c.id === client.id; });
    state.clients[stateClientIndex] = client;
    client.send(JSON.stringify({
        sender: "server",
        value: "Username changed successfully",
        type: "changeUsername",
        username: username,
        success: true,
        users: __spreadArray(__spreadArray([], state.clients.map(function (c) { return c.username; }), true), [username], false).filter(function (u, i, a) { return a.indexOf(u) === i; }),
    }));
};
// Déconnecte un utilisateur en le retirant du state
var disconnectClient = function (client) {
    console.log('Client disconnected: ', client.username);
    state.sketchGames.forEach(function (g) {
        g.removePlayer(client.id);
        g.players.length === 0 && state.sketchGames.splice(state.sketchGames.indexOf(g), 1);
    });
    var messageToSend = {
        sender: "server",
        username: client.username,
        value: "".concat(client.username, " has left the chat"),
        type: "disconnect",
        users: state.clients.map(function (c) { return c.username; })
    };
    broadcast(state.clients, messageToSend);
    state.clients = state.clients.filter(function (c) { return c.id !== client.id; });
};
// Permet d'envoyer qui écrit parmis les utilisateurs
var handleWritting = function (client, message) {
    var game = state.sketchGames.find(function (g) { return g.id === message.game; });
    if (!game)
        return;
    var player = game.players.find(function (p) { return p.id === client.id; });
    if (!player)
        return;
    if (!game.typingTimeouts[player.id]) {
        game.writtingUsers.push(player);
    }
    console.log(client.username + ' is writting');
    clearTimeout(game.typingTimeouts[player.id]);
    game.typingTimeouts[client.id] = setTimeout(function () {
        game.writtingUsers = game.writtingUsers.filter(function (c) { return c.id !== player.id; });
        delete game.typingTimeouts[player.id];
        game.broadcastGameEvent('writting', {
            sender: "user",
            username: client.username,
            writtingUsers: state.writting.map(function (c) { return c.username; }),
        });
    }, 5000);
    game.broadcastGameEvent('writting', {
        sender: "user",
        username: client.username,
        writtingUsers: game.writtingUsers.map(function (c) { return c.username; }),
    });
};
wss.on('connection', function (socket) {
    var ip = socket._socket.remoteAddress;
    var currentTime = Date.now();
    var LIMIT = 7; // Limite de 5 connexions par minute
    if (connectionLimits.has(ip)) {
        var _a = connectionLimits.get(ip), count = _a.count, lastTime = _a.lastTime;
        if (currentTime - lastTime < 60000 && count >= LIMIT) {
            socket.close(1008, 'Connection limit exceeded');
            return;
        }
        connectionLimits.set(ip, {
            count: count + 1,
            lastTime: currentTime
        });
    }
    else {
        connectionLimits.set(ip, { count: 1, lastTime: currentTime });
    }
    socket.on('close', function () {
        connectionLimits.set(ip, {
            count: connectionLimits.get(ip).count - 1,
            lastTime: currentTime
        });
        disconnectClient(socket);
    });
    socket.on('error', function (error) {
        console.error('Socket error:', error);
    });
    socket.on('connect', function () {
        console.log('Client connected');
    });
    socket.on('message', function (data) {
        handleIncomingMessage(socket, data);
    });
});
