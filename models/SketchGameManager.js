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
exports.SketchGameManager = void 0;
var wordsList = require('../words.json');
var SketchGameManager = /** @class */ (function () {
    function SketchGameManager(gameId, owner, maxRound, roundDuration) {
        if (maxRound === void 0) { maxRound = 3; }
        if (roundDuration === void 0) { roundDuration = 60; }
        this.words = [];
        this.round = 0;
        this.roundWinners = [];
        this.drawOrder = [];
        this.canvas = '';
        this.writtingUsers = [];
        this.typingTimeouts = {};
        this.hiddenWord = '';
        this.drawindex = 0;
        this.id = gameId;
        this.owner = owner;
        this.players = [];
        this.state = 'waiting';
        this.word = '';
        this.round = 0;
        this.maxRound = maxRound;
        this.roundDuration = roundDuration;
        this.time = roundDuration;
        this.addPlayer(owner);
    }
    SketchGameManager.prototype.broadcast = function (message, clients) {
        if (clients === void 0) { clients = this.players; }
        clients.forEach(function (p) {
            if (typeof p.send === 'function') {
                p.send(JSON.stringify(message));
            }
            else {
                console.error('Invalid player object. Missing send method:', p.username, ' ', p.readyState);
            }
        });
    };
    SketchGameManager.prototype.broadcastGameEvent = function (eventType, additionalData, clients) {
        if (additionalData === void 0) { additionalData = {}; }
        if (clients === void 0) { clients = this.players; }
        var message = __assign(__assign({ sender: 'server', type: eventType }, this.getGameInfo()), additionalData);
        this.broadcast(message, clients);
    };
    SketchGameManager.prototype.sendCanvas = function () {
        this.broadcastGameEvent('canvas');
    };
    SketchGameManager.prototype.getGameInfo = function () {
        var _a, _b;
        if (this.state === 'playing' || this.state === 'chooseWord' || this.state === 'timeout') {
            return {
                sender: 'server',
                id: this.id,
                owner: this.owner.username,
                players: this.players.map(function (p) { return ({ username: p.username, score: p.score }); }),
                state: this.state,
                drawOrder: this.drawOrder.map(function (p) { return p.username; }),
                drawer: (_a = this.drawer) === null || _a === void 0 ? void 0 : _a.username,
                round: this.round,
                maxRound: this.maxRound,
                roundDuration: this.roundDuration,
                roundWinners: this.roundWinners.map(function (p) { return p.username; }),
                time: this.time,
                image: this.canvas
            };
        }
        else if (this.state === 'waiting') {
            return {
                sender: 'server',
                id: this.id,
                owner: this.owner.username,
                players: this.players.map(function (p) { return ({ username: p.username, score: p.score }); }),
                state: this.state,
                image: this.canvas
            };
        }
        else if (this.state === 'ended') {
            return {
                sender: 'server',
                id: this.id,
                owner: this.owner.username,
                players: this.players.map(function (p) { return ({ username: p.username, score: p.score }); }),
                state: this.state,
                winner: ((_b = this.players) === null || _b === void 0 ? void 0 : _b.reduce(function (a, b) { return (a.score > b.score ? a : b); })) || this.players[0],
            };
        }
    };
    SketchGameManager.prototype.addPlayer = function (player) {
        if (!this.players.find(function (p) { return p.id === player.id; })) {
            player.score = 0;
            this.players.push(player);
            if (this.state === 'playing' || this.state === 'chooseWord') {
                this.drawOrder.push(player);
            }
            this.broadcastGameEvent('playerJoined', { username: player.username });
        }
    };
    SketchGameManager.prototype.removePlayer = function (playerId) {
        var _a;
        var player = this.players.find(function (p) { return p.id === playerId; });
        if (!player) {
            return;
        }
        this.players = this.players.filter(function (p) { return p.id !== player.id; });
        if (this.state === 'playing' || this.state === 'chooseWord') {
            this.drawOrder = this.drawOrder.filter(function (p) { return p.id !== player.id; });
            if (playerId === ((_a = this.drawer) === null || _a === void 0 ? void 0 : _a.id)) {
                this.nextDrawer();
            }
        }
        if (this.players.length === 0) {
            return;
        }
        else if (this.players.length === 1) {
            this.endGame();
        }
        if (player.id === this.owner.id) {
            this.owner = this.players[0];
        }
        this.broadcastGameEvent('playerLeft', { username: player.username });
    };
    SketchGameManager.prototype.addMessage = function (player, message, clients) {
        if (clients === void 0) { clients = this.players; }
        this.broadcast({
            sender: 'user',
            username: player.username,
            type: 'message',
            value: message.value,
            players: this.players.map(function (p) { return p.username; }),
            writtingUsers: this.writtingUsers
        }, clients);
    };
    SketchGameManager.prototype.resetParameters = function () {
        this.round = 0;
        this.drawindex = 0;
        this.roundWinners = [];
        this.words = [];
        this.drawOrder = [];
        this.word = '';
        this.hiddenWord = '';
        this.canvas = '';
        this.time = this.roundDuration;
    };
    SketchGameManager.prototype.startGame = function () {
        var _this = this;
        if (this.state === 'playing' || this.state === 'chooseWord') {
            return;
        }
        this.state = 'chooseWord';
        this.resetParameters();
        for (var i = 0; i < this.players.length; i++) {
            this.players[i].score = 0;
        }
        this.sendCanvas();
        var playersCopy = __spreadArray([], this.players, true);
        while (playersCopy.length > 0) {
            var randomIndex = Math.floor(Math.random() * playersCopy.length);
            var player = playersCopy.splice(randomIndex, 1)[0]; // Retire un élément aléatoire
            this.drawOrder.push(player);
        }
        this.drawer = this.drawOrder[0];
        this.drawindex++;
        this.words = this.getRandomWords(3);
        this.players.forEach(function (p) {
            var _a;
            if (p.id === ((_a = _this.drawer) === null || _a === void 0 ? void 0 : _a.id)) {
                p.send(JSON.stringify(__assign(__assign({}, _this.getGameInfo()), { type: 'startDrawing', words: _this.words })));
            }
            else {
                p.send(JSON.stringify(__assign(__assign({}, _this.getGameInfo()), { type: 'gameUpdated' })));
            }
        });
        this.time = 15;
        this.startTimer();
    };
    SketchGameManager.prototype.chooseWord = function (player, word) {
        var _a;
        if (this.isPlayerDrawer(player) && this.state === 'chooseWord' && this.words.includes(word)) {
            this.word = word;
            this.state = 'playing';
            this.time = this.roundDuration;
            this.hiddenWord = this.getHiddenWord();
            this.startTimer();
            this.canvas = '';
            this.broadcastGameEvent('wordChosen', { username: (_a = this.drawer) === null || _a === void 0 ? void 0 : _a.username, word: this.getHiddenWord() });
            this.time = this.roundDuration;
            this.startTimer();
        }
    };
    SketchGameManager.prototype.getHiddenWord = function () {
        return this.word.replace(/[a-zA-Z]/g, '_');
    };
    SketchGameManager.prototype.getRandomPartOfWord = function () {
        var hiddenWordArray = this.hiddenWord.split('');
        var unrevealedIndices = hiddenWordArray
            .map(function (char, index) { return (char === '_' ? index : -1); })
            .filter(function (index) { return index !== -1; });
        if (unrevealedIndices.length > 0) {
            var randomIndex = Math.floor(Math.random() * unrevealedIndices.length);
            hiddenWordArray[unrevealedIndices[randomIndex]] = this.word[unrevealedIndices[randomIndex]];
            this.hiddenWord = hiddenWordArray.join('');
        }
    };
    SketchGameManager.prototype.guessWord = function (player, word) {
        var normalize = function (str) { return str.normalize('NFD').replace(/[\u0300-\u036f\s]/g, '').toLowerCase(); };
        if (normalize(word.value) === normalize(this.word)
            && !this.roundWinners.find(function (p) { return p.id === player.id; })
            && !this.isPlayerDrawer(player)
            && this.state === 'playing'
            && this.time > 0) {
            player.score += 100 * (1 / (this.roundWinners.length + 1)); // Ensure correct score calculation
            this.roundWinners.push(player);
            this.broadcastGameEvent('guess', { isRight: true, value: "".concat(player.username, " has found the word !") });
            this.broadcastGameEvent('wordFound', { username: player.username, word: this.word }, [player]);
            if (this.roundWinners.length === this.players.length - 1) {
                this.broadcastGameEvent('revealWord', { value: "The word was ".concat(this.word), word: this.word });
                this.stopTimer();
                this.timeout();
            }
        }
        else if (this.isWordClose(word.value) && this.time > 0 && !this.roundWinners.find(function (p) { return p.id === player.id; }) && !this.isPlayerDrawer(player)) {
            player.send(JSON.stringify({
                sender: 'server',
                type: 'guess',
                value: 'You are getting close to the word',
                guess: word.value,
                isRight: false
            }));
            this.broadcastGameEvent('message', { value: word.value, sender: 'user', username: player.username }, this.drawer ? __spreadArray([this.drawer], this.roundWinners, true) : __spreadArray([], this.roundWinners, true));
        }
        else if (this.roundWinners.find(function (p) { return p.id === player.id; }) || this.isPlayerDrawer(player)) {
            if (this.drawer) {
                this.addMessage(player, word, __spreadArray(__spreadArray([], this.roundWinners, true), [this.drawer], false));
            }
            else {
                this.addMessage(player, word, this.roundWinners);
            }
        }
        else {
            this.addMessage(player, word);
        }
    };
    SketchGameManager.prototype.nextDrawer = function () {
        var _this = this;
        this.word = '';
        this.words = this.getRandomWords(3);
        this.hiddenWord = '';
        this.roundWinners = [];
        this.time = this.roundDuration;
        this.canvas = '';
        this.sendCanvas();
        if (this.drawindex >= this.drawOrder.length) {
            this.nextRound();
            return;
        }
        // Définir le prochain dessinateur
        this.drawer = this.drawOrder[this.drawindex];
        this.state = 'chooseWord';
        this.players.forEach(function (p) {
            var _a;
            if (p.id === ((_a = _this.drawer) === null || _a === void 0 ? void 0 : _a.id)) {
                p.send(JSON.stringify(__assign(__assign({}, _this.getGameInfo()), { type: 'startDrawing', words: _this.words })));
            }
            else {
                p.send(JSON.stringify(__assign(__assign({}, _this.getGameInfo()), { type: 'nextDrawer' })));
            }
        });
        this.time = 15;
        this.state = 'chooseWord';
        this.startTimer();
        this.drawindex++; // Incrémente après avoir défini le dessinateur
    };
    SketchGameManager.prototype.nextRound = function () {
        this.round++;
        if (this.round >= this.maxRound) {
            this.endGame();
            return;
        }
        this.drawindex = 0;
        this.drawer = this.drawOrder[0];
        this.nextDrawer();
    };
    SketchGameManager.prototype.timeout = function () {
        this.state = 'timeout';
        this.time = 10;
        this.startTimer();
    };
    SketchGameManager.prototype.endGame = function () {
        var _this = this;
        this.state = 'ended';
        this.resetParameters();
        this.players.forEach(function (p) {
            p.send(JSON.stringify(__assign({ sender: 'server', type: 'gameEnded' }, _this.getGameInfo())));
        });
    };
    // ------- Utils --------
    SketchGameManager.prototype.isPlayerDrawer = function (player) {
        var _a;
        return ((_a = this.drawer) === null || _a === void 0 ? void 0 : _a.id) === player.id;
    };
    SketchGameManager.prototype.getRandomWords = function (number) {
        var wordsCopy = __spreadArray([], wordsList, true);
        var words = [];
        for (var i = 0; i < number; i++) {
            var index = Math.floor(Math.random() * wordsCopy.length);
            words.push(wordsCopy.splice(index, 1)[0]);
        }
        return words;
    };
    SketchGameManager.prototype.startTimer = function () {
        var _this = this;
        this.stopTimer();
        this.timerId = setInterval(function () {
            _this.time -= 1;
            if (_this.state === 'playing')
                _this.handlePlayingTimerUpdate();
            else if (_this.state === 'timeout')
                _this.handleTimeoutUpdate();
            else if (_this.state === 'chooseWord')
                _this.handleWordTimeout();
            else if (_this.state === 'ended')
                _this.stopTimer();
            console.log(_this.state, _this.time);
        }, 1000);
    };
    SketchGameManager.prototype.handlePlayingTimerUpdate = function () {
        var _this = this;
        if (this.time <= 0) {
            this.stopTimer();
            if (this.round >= this.maxRound) {
                this.endGame();
            }
            else {
                this.timeout();
            }
        }
        if (this.time === 40 || this.time === 20) {
            this.getRandomPartOfWord();
            console.log(this.hiddenWord);
            this.broadcastGameEvent('timerUpdate', { time: this.time, word: this.hiddenWord }, __spreadArray([], this.players.filter(function (p) { var _a; return p.id !== ((_a = _this.drawer) === null || _a === void 0 ? void 0 : _a.id) && !_this.roundWinners.find(function (player) { return player.id === p.id; }); }), true));
        }
        else {
            this.broadcastGameEvent('timerUpdate', { time: this.time, word: this.hiddenWord }, __spreadArray([], this.players.filter(function (p) { var _a; return p.id !== ((_a = _this.drawer) === null || _a === void 0 ? void 0 : _a.id) && !_this.roundWinners.find(function (player) { return player.id === p.id; }); }), true));
            if (this.drawer) {
                this.broadcastGameEvent('timerUpdate', { time: this.time, word: this.word }, __spreadArray([this.drawer], this.roundWinners, true));
            }
        }
    };
    SketchGameManager.prototype.handleTimeoutUpdate = function () {
        this.broadcastGameEvent('timerUpdate', { time: this.time });
        if (this.time <= 0) {
            this.stopTimer();
            this.nextDrawer();
        }
    };
    SketchGameManager.prototype.handleWordTimeout = function () {
        this.broadcastGameEvent('timerUpdate', { time: this.time, word: this.word });
        if (this.time <= 0) {
            this.stopTimer();
            if (this.drawer)
                this.chooseWord(this.drawer, this.words[Math.floor(Math.random() * this.words.length)]);
        }
    };
    SketchGameManager.prototype.stopTimer = function () {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = undefined; // Réinitialise l'ID du timer
        }
    };
    SketchGameManager.prototype.isWordClose = function (word) {
        var normalize = function (str) { return str.normalize('NFD').replace(/[\u0300-\u036f\s]/g, '').toLowerCase(); };
        if (this.word === '' || word === '') {
            return false;
        }
        var distance = function (a, b) {
            var matrix = Array.from({ length: a.length + 1 }, function () { return Array(b.length + 1).fill(0); });
            for (var i = 0; i <= a.length; i++) {
                for (var j = 0; j <= b.length; j++) {
                    if (i === 0) {
                        matrix[i][j] = j;
                    }
                    else if (j === 0) {
                        matrix[i][j] = i;
                    }
                    else if (a[i - 1] === b[j - 1]) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    }
                    else {
                        matrix[i][j] = 1 + Math.min(matrix[i - 1][j - 1], matrix[i - 1][j], matrix[i][j - 1]);
                    }
                }
            }
            return matrix[a.length][b.length];
        };
        return distance(normalize(this.word), normalize(word)) <= 2;
    };
    return SketchGameManager;
}());
exports.SketchGameManager = SketchGameManager;
