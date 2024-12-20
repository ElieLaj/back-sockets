import { get } from 'http';
import { SketchGames } from '../types/game';
import { PlayerWebSocket } from '../types/websocket';
import { ClientMessage } from '../types/messages';
const wordsList = require('../words.json');

export class SketchGameManager implements SketchGames {
    id: string;
    owner: PlayerWebSocket;
    players: PlayerWebSocket[];
    state: string;
    word: string;
    words: string[] = [];
    round: number = 0;
    maxRound: number;
    roundDuration: number;
    roundWinners: PlayerWebSocket[] = [];
    drawer?: PlayerWebSocket;
    drawOrder: PlayerWebSocket[] = [];
    canvas: string = '';
    time: number;
    timerId?: NodeJS.Timeout;
    writtingUsers: PlayerWebSocket[] = [];
    typingTimeouts: {} = {};
    hiddenWord: string = '';
    drawindex: number = 0;

    constructor(gameId: string, owner: PlayerWebSocket, maxRound: number = 3, roundDuration: number = 60) {
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

    broadcast(message: any, clients: PlayerWebSocket[] = this.players) {
        clients.forEach((p: PlayerWebSocket) => {
            if (typeof p.send === 'function') {
                p.send(JSON.stringify(message));
            } else {
                console.error('Invalid player object. Missing send method:', p.username, ' ', p.readyState);
            }
        });
    }

    broadcastGameEvent(eventType: string, additionalData: any = {}, clients: PlayerWebSocket[] = this.players) {
        const message = {
            sender: 'server',
            type: eventType,
            ...this.getGameInfo(),
            ...additionalData,
        };
        this.broadcast(message, clients);
    }

    sendCanvas() {
        this.broadcastGameEvent('canvas')
    }

    getGameInfo() {
        if (this.state === 'playing' || this.state === 'chooseWord' || this.state === 'timeout') {
            return {
                sender: 'server',
                id: this.id,
                owner: this.owner.username,
                players: this.players.map((p) => ({ username: p.username, score: p.score })),
                state: this.state,
                drawOrder: this.drawOrder.map((p) => p.username),
                drawer: this.drawer?.username,
                round: this.round,
                maxRound: this.maxRound,
                roundDuration: this.roundDuration,
                roundWinners: this.roundWinners.map((p) => p.username),
                time: this.time,
                image: this.canvas
            }
        } else if (this.state === 'waiting') {
            return {
                sender: 'server',
                id: this.id,
                owner: this.owner.username,
                players: this.players.map((p) => ({ username: p.username, score: p.score })),
                state: this.state,
                image: this.canvas
            }
        } else if (this.state === 'ended') {
            return {
                sender: 'server',
                id: this.id,
                owner: this.owner.username,
                players: this.players.map((p) => ({ username: p.username, score: p.score })),
                state: this.state,
                winner: this.players?.reduce((a, b) => (a.score > b.score ? a : b)) || this.players[0],
            }
        }
    }

    addPlayer(player: PlayerWebSocket) {
        if (!this.players.find((p) => p.id === player.id)) {
            player.score = 0;
            this.players.push(player);

            if (this.state === 'playing' || this.state === 'chooseWord') {
                this.drawOrder.push(player);
            }

            this.broadcastGameEvent('playerJoined',
                { username: player.username }
            );
        }
    }

    removePlayer(playerId: string) {
        const player = this.players.find((p) => p.id === playerId);

        if (!player) {
            return;
        }

        this.players = this.players.filter((p) => p.id !== player.id);
        
        if (this.state === 'playing' || this.state === 'chooseWord') {
            this.drawOrder = this.drawOrder.filter((p) => p.id !== player.id);
            if (playerId === this.drawer?.id) {
                this.nextDrawer();
            }
        }

        if (this.players.length === 0) {
            return;
        } else if (this.players.length === 1) {
            this.endGame();
        }

        if (player.id === this.owner.id) {
            this.owner = this.players[0];
        } 
        
        this.broadcastGameEvent('playerLeft',
            { username: player.username }
        );
    }

    addMessage(player: PlayerWebSocket, message: ClientMessage, clients: PlayerWebSocket[] = this.players) {
            this.broadcast({
                sender: 'user',
                username: player.username,
                type: 'message',
                value: message.value,
                players: this.players.map((p) => p.username),
                writtingUsers: this.writtingUsers
            }, clients);
    }

    resetParameters() {
        this.round = 0;
        this.drawindex = 0;
        this.roundWinners = [];
        this.words = [];
        this.drawOrder = [];
        this.word = '';
        this.hiddenWord = '';
        this.canvas = '';
        this.time = this.roundDuration;
    }

    startGame() {
        if (this.state === 'playing' || this.state === 'chooseWord') {
            return;
        }

        this.state = 'chooseWord';

        this.resetParameters();

        for (let i = 0; i < this.players.length; i++) {
            this.players[i].score = 0;
        }

        this.sendCanvas();

        const playersCopy = [...this.players];

        while (playersCopy.length > 0) {
            const randomIndex = Math.floor(Math.random() * playersCopy.length);
            const player = playersCopy.splice(randomIndex, 1)[0]; // Retire un élément aléatoire
            this.drawOrder.push(player);
        }

        this.drawer = this.drawOrder[0];
        this.drawindex++;
        this.words = this.getRandomWords(3);

        this.players.forEach((p) => {
            if (p.id === this.drawer?.id) {
                p.send(
                    JSON.stringify({
                        ...this.getGameInfo(),
                        type: 'startDrawing',
                        words: this.words,
                    })
                );
            } else {
                p.send(
                JSON.stringify({
                    ...this.getGameInfo(),
                    type: 'gameUpdated',
                })
            );
            }
            
        });
        this.time = 15;
        this.startTimer();
    }

    chooseWord(player: PlayerWebSocket, word: string) {
        if (this.isPlayerDrawer(player) && this.state === 'chooseWord' && this.words.includes(word)) {
            this.word = word;
            this.state = 'playing';
            this.time = this.roundDuration;
            this.hiddenWord = this.getHiddenWord();
            this.startTimer();
            this.canvas = '';

            this.broadcastGameEvent('wordChosen', { username: this.drawer?.username, word: this.getHiddenWord() });
            this.time = this.roundDuration
            this.startTimer();
        }
    }

    getHiddenWord() {
        return this.word.replace(/[a-zA-Z]/g, '_');
    }

    getRandomPartOfWord() {
        let hiddenWordArray = this.hiddenWord.split('');
        let unrevealedIndices = hiddenWordArray
          .map((char, index) => (char === '_' ? index : -1))
          .filter(index => index !== -1);
      
        if (unrevealedIndices.length > 0) {
          const randomIndex = Math.floor(Math.random() * unrevealedIndices.length);
          hiddenWordArray[unrevealedIndices[randomIndex]] = this.word[unrevealedIndices[randomIndex]];
          this.hiddenWord = hiddenWordArray.join('');
        }
    }

    guessWord(player: PlayerWebSocket, word: ClientMessage) {
        const normalize = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f\s]/g, '').toLowerCase();

        if (normalize(word.value) === normalize(this.word) 
            && !this.roundWinners.find((p) => p.id === player.id) 
            && !this.isPlayerDrawer(player) 
            && this.state === 'playing'
            && this.time > 0
        ) {
            player.score += 100 * (1 / (this.roundWinners.length + 1)); // Ensure correct score calculation
            this.roundWinners.push(player);
            this.broadcastGameEvent('guess', { isRight: true, value: `${player.username} has found the word !` });
            this.broadcastGameEvent('wordFound', { username: player.username, word: this.word }, [player]);
            if (this.roundWinners.length === this.players.length - 1) {
                this.broadcastGameEvent('revealWord', { value: `The word was ${this.word}`, word: this.word });
                this.stopTimer();
                this.timeout();
            }
        } else if (this.isWordClose(word.value) && this.time > 0 && !this.roundWinners.find((p) => p.id === player.id) && !this.isPlayerDrawer(player)) {
            player.send(
                JSON.stringify({
                    sender: 'server',
                    type: 'guess',
                    value: 'You are getting close to the word',
                    guess: word.value,
                    isRight: false
                })
            )
            this.broadcastGameEvent('message', { value: word.value, sender: 'user', username: player.username }, this.drawer ? [this.drawer, ...this.roundWinners] : [...this.roundWinners]);
        } else if (this.roundWinners.find((p) => p.id === player.id) || this.isPlayerDrawer(player)) {
            if (this.drawer){
                this.addMessage(player, word, [...this.roundWinners, this.drawer])
            } else {
                this.addMessage(player, word, this.roundWinners)
            }
        } 
        else {
            this.addMessage(player, word);
        }
    }

    nextDrawer() {
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

        this.players.forEach((p) => {
            if (p.id === this.drawer?.id) {
                p.send(
                    JSON.stringify({
                        ...this.getGameInfo(),
                        type: 'startDrawing',
                        words: this.words,
                    })
                );
            } else {
                p.send(
                    JSON.stringify({
                        ...this.getGameInfo(),
                        type: 'nextDrawer',
                    })
                );
            }
        });

        this.time = 15;
        this.state = 'chooseWord';
        this.startTimer();

        this.drawindex++; // Incrémente après avoir défini le dessinateur
    }

    nextRound() {
        this.round++;

        if (this.round >= this.maxRound) {
            this.endGame();
            return;
        }
        this.drawindex = 0;
        this.drawer = this.drawOrder[0];
        this.nextDrawer();
    }

    timeout() {
        this.state = 'timeout'
        this.time = 10;
        this.startTimer()
    }

    endGame() {
        this.state = 'ended';

        this.resetParameters();

        this.players.forEach((p) => {
            p.send(
                JSON.stringify({
                    sender: 'server',
                    type: 'gameEnded',
                    ...this.getGameInfo(),
                })
            );
        });
    }

    // ------- Utils --------

    isPlayerDrawer(player: PlayerWebSocket) {
        return this.drawer?.id === player.id;
    }


    getRandomWords(number: number) {
        const wordsCopy = [...wordsList];
        const words: string[] = [];
        for (let i = 0; i < number; i++) {
            const index = Math.floor(Math.random() * wordsCopy.length);
            words.push(wordsCopy.splice(index, 1)[0]);
        }
        return words;
    }

    startTimer() {
        this.stopTimer();
        this.timerId = setInterval(() => {
            this.time -= 1;

            if (this.state === 'playing') this.handlePlayingTimerUpdate();
            else if (this.state === 'timeout') this.handleTimeoutUpdate();
            else if (this.state === 'chooseWord') this.handleWordTimeout();
            else if (this.state === 'ended') this.stopTimer();
            console.log(this.state, this.time)
            
        }, 1000);
    }

    handlePlayingTimerUpdate() {
        if (this.time <= 0) {
            this.stopTimer();
            if (this.round >= this.maxRound) {
                this.endGame();
            } else {
                this.timeout();
            }
        }

        if (this.time === 40 || this.time === 20) {
            this.getRandomPartOfWord();
            console.log(this.hiddenWord);
            this.broadcastGameEvent('timerUpdate', { time: this.time, word: this.hiddenWord }, [...this.players.filter((p) => p.id !== this.drawer?.id && !this.roundWinners.find((player) => player.id === p.id))]);
        } else {
            this.broadcastGameEvent('timerUpdate', { time: this.time, word: this.hiddenWord }, [...this.players.filter((p) => p.id !== this.drawer?.id && !this.roundWinners.find((player) => player.id === p.id))]);
            if (this.drawer) {
                this.broadcastGameEvent('timerUpdate', { time: this.time, word: this.word }, [this.drawer, ...this.roundWinners]);
            }
            
        }
    }

    handleTimeoutUpdate() {
        this.broadcastGameEvent('timerUpdate', { time: this.time });

        if (this.time <= 0) {
            this.stopTimer();
            this.nextDrawer();
        }
    }

    handleWordTimeout() {
        this.broadcastGameEvent('timerUpdate', { time: this.time, word: this.word });
        if (this.time <= 0) {
            this.stopTimer();
            if (this.drawer)
                this.chooseWord(this.drawer, this.words[Math.floor(Math.random() * this.words.length)]);
        }
    }

    stopTimer() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = undefined; // Réinitialise l'ID du timer
        }
    }


    isWordClose(word: string) {
        const normalize = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f\s]/g, '').toLowerCase();

        if (this.word === '' || word === '') {
            return false;
        }
    
        const distance = (a: string, b: string): number => {
            const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

            for (let i = 0; i <= a.length; i++) {
                for (let j = 0; j <= b.length; j++) {
                    if (i === 0) {
                        matrix[i][j] = j;
                    } else if (j === 0) {
                        matrix[i][j] = i;
                    } else if (a[i - 1] === b[j - 1]) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = 1 + Math.min(matrix[i - 1][j - 1], matrix[i - 1][j], matrix[i][j - 1]);
                    }
                }
            }

            return matrix[a.length][b.length];
        };

        return distance(normalize(this.word), normalize(word)) <= 2;
    }
}