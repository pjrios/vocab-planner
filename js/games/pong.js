export class Pong {
    constructor(canvas, onGameOver) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onGameOver = onGameOver;
        this.width = canvas.width;
        this.height = canvas.height;

        // Game Objects
        this.paddleWidth = 15;
        this.paddleHeight = 100;
        this.paddle1 = { x: 20, y: this.height / 2 - 50, width: this.paddleWidth, height: this.paddleHeight, color: '#0ff', score: 0, dy: 0 };
        this.paddle2 = { x: this.width - 35, y: this.height / 2 - 50, width: this.paddleWidth, height: this.paddleHeight, color: '#f0f', score: 0, dy: 0 };

        this.balls = [];
        this.particles = [];
        this.activeEffects = [];

        // QTE System
        this.qte = {
            active: false,
            letter: '',
            timer: 0,
            maxTime: 120, // 2 seconds at 60fps
            type: '',
            color: '',
            feedback: null, // { text: 'NICE!', color: '#0f0', timer: 60 }
            feedbackTimer: 0
        };

        // Game State
        this.winScore = 11;
        this.gameOver = false;
        this.isRunning = false;
        this.animationId = null;
        this.keys = {};

        // AI State
        this.aiTargetY = this.height / 2;
        this.aiReactionTimer = 0;

        // Visuals
        this.shakeTimer = 0;

        this.resetBall();
        this.bindControls();
    }

    bindControls() {
        this.keyDownHandler = (e) => {
            // Ignore if typing in an input
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

            // Prevent default for W/S to avoid any browser shortcuts/scrolling
            if (e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S') {
                e.preventDefault();
            }

            this.keys[e.key] = true;

            // QTE Input
            if (this.qte.active) {
                if (e.key.toUpperCase() === this.qte.letter) {
                    this.resolveQTE(true);
                } else if (e.key.length === 1 && e.key.match(/[a-z]/i)) {
                    // Wrong key penalty? For now, just ignore or maybe slight time penalty
                    // this.qte.timer -= 10; 
                }
            }
        };
        this.keyUpHandler = (e) => this.keys[e.key] = false;

        document.addEventListener('keydown', this.keyDownHandler);
        document.addEventListener('keyup', this.keyUpHandler);
    }

    start() {
        this.isRunning = true;
        this.loop();
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        document.removeEventListener('keydown', this.keyDownHandler);
        document.removeEventListener('keyup', this.keyUpHandler);
    }

    resetBall() {
        this.balls = [{
            x: this.width / 2,
            y: this.height / 2,
            radius: 8,
            dx: (Math.random() > 0.5 ? 1 : -1) * 6,
            dy: (Math.random() - 0.5) * 6,
            speed: 7,
            trail: [],
            color: '#fff'
        }];
    }

    triggerQTE() {
        if (!this.qte.active && this.qte.feedbackTimer <= 0 && Math.random() < 0.003) { // Low chance
            const types = ['expand', 'shrink', 'multiball', 'fast', 'slow'];
            const type = types[Math.floor(Math.random() * types.length)];
            const colors = { expand: '#0f0', shrink: '#f00', multiball: '#ff0', fast: '#f60', slow: '#00f' };
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

            this.qte.active = true;
            this.qte.letter = letters[Math.floor(Math.random() * letters.length)];
            this.qte.timer = this.qte.maxTime;
            this.qte.type = type;
            this.qte.color = colors[type];
        }
    }

    resolveQTE(success) {
        this.qte.active = false;
        const recipient = success ? this.paddle1 : this.paddle2;

        this.applyPowerUp(this.qte.type, recipient);

        this.qte.feedback = {
            text: success ? 'NICE!' : 'MISSED!',
            color: success ? '#0f0' : '#f00',
            subText: success ? this.qte.type.toUpperCase() : 'AI GOT IT'
        };
        this.qte.feedbackTimer = 60; // Show feedback for 1 second
    }

    applyPowerUp(type, recipient) {
        const opponent = recipient === this.paddle1 ? this.paddle2 : this.paddle1;

        // Visual flare
        this.createParticles(this.width / 2, this.height / 2, this.qte.color, 30);

        switch (type) {
            case 'expand':
                recipient.height = Math.min(200, recipient.height + 40);
                setTimeout(() => recipient.height = this.paddleHeight, 8000);
                break;
            case 'shrink':
                opponent.height = Math.max(40, opponent.height - 40);
                setTimeout(() => opponent.height = this.paddleHeight, 8000);
                break;
            case 'multiball':
                this.balls.push({
                    x: this.width / 2,
                    y: this.height / 2,
                    radius: 8,
                    dx: (Math.random() > 0.5 ? 1 : -1) * 6,
                    dy: (Math.random() - 0.5) * 6,
                    speed: 7,
                    trail: [],
                    color: '#ff0'
                });
                break;
            case 'fast':
                this.balls.forEach(b => b.speed *= 1.5);
                setTimeout(() => this.balls.forEach(b => b.speed /= 1.5), 5000);
                break;
            case 'slow':
                this.balls.forEach(b => b.speed *= 0.6);
                setTimeout(() => this.balls.forEach(b => b.speed /= 0.6), 5000);
                break;
        }
    }

    update() {
        if (this.gameOver) return;

        // Screen shake decay
        if (this.shakeTimer > 0) this.shakeTimer--;

        // QTE Logic
        this.triggerQTE();
        if (this.qte.active) {
            this.qte.timer--;
            if (this.qte.timer <= 0) {
                this.resolveQTE(false); // Time ran out, AI gets it
            }
        }
        if (this.qte.feedbackTimer > 0) {
            this.qte.feedbackTimer--;
        }

        // Player Movement (W/S keys only)
        if (this.keys['w'] || this.keys['W']) {
            this.paddle1.y = Math.max(0, this.paddle1.y - 8);
        }
        if (this.keys['s'] || this.keys['S']) {
            this.paddle1.y = Math.min(this.height - this.paddle1.height, this.paddle1.y + 8);
        }

        // AI Movement (Imperfect)
        // Find closest ball moving towards AI
        const targetBall = this.balls.filter(b => b.dx > 0).sort((a, b) => b.x - a.x)[0];

        if (targetBall) {
            // Reaction delay simulation
            if (this.aiReactionTimer-- <= 0) {
                this.aiTargetY = targetBall.y - this.paddle2.height / 2;
                this.aiReactionTimer = Math.random() * 10 + 5; // Re-evaluate every 5-15 frames
            }

            const dy = this.aiTargetY - this.paddle2.y;
            this.paddle2.y += Math.sign(dy) * Math.min(Math.abs(dy), 5.5); // Limited speed
        } else {
            // Return to center if no ball coming
            const dy = (this.height / 2 - this.paddle2.height / 2) - this.paddle2.y;
            this.paddle2.y += Math.sign(dy) * Math.min(Math.abs(dy), 2);
        }

        // Clamp AI
        this.paddle2.y = Math.max(0, Math.min(this.height - this.paddle2.height, this.paddle2.y));

        // Balls Logic
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];

            // Trail
            ball.trail.push({ x: ball.x, y: ball.y, alpha: 1 });
            if (ball.trail.length > 10) ball.trail.shift();
            ball.trail.forEach(t => t.alpha -= 0.1);

            // Movement
            ball.x += ball.dx;
            ball.y += ball.dy;

            // Wall Collisions
            if (ball.y - ball.radius < 0 || ball.y + ball.radius > this.height) {
                ball.dy = -ball.dy;
                this.shakeTimer = 5;
            }

            // Paddle Collisions
            const p1 = this.paddle1;
            const p2 = this.paddle2;

            // Check Paddle 1
            if (ball.dx < 0 && ball.x - ball.radius < p1.x + p1.width && ball.x + ball.radius > p1.x && ball.y > p1.y && ball.y < p1.y + p1.height) {
                this.handlePaddleHit(ball, p1, 1);
            }
            // Check Paddle 2
            if (ball.dx > 0 && ball.x + ball.radius > p2.x && ball.x - ball.radius < p2.x + p2.width && ball.y > p2.y && ball.y < p2.y + p2.height) {
                this.handlePaddleHit(ball, p2, -1);
            }

            // Scoring
            if (ball.x < 0) {
                this.paddle2.score++;
                this.createParticles(ball.x, ball.y, '#f0f', 30);
                this.balls.splice(i, 1);
                this.shakeTimer = 15;
            } else if (ball.x > this.width) {
                this.paddle1.score++;
                this.createParticles(ball.x, ball.y, '#0ff', 30);
                this.balls.splice(i, 1);
                this.shakeTimer = 15;
            }
        }

        if (this.balls.length === 0) {
            if (this.paddle1.score >= this.winScore || this.paddle2.score >= this.winScore) {
                this.endGame();
            } else {
                this.resetBall();
            }
        }

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    handlePaddleHit(ball, paddle, direction) {
        // Calculate relative impact point (-1 to 1)
        const collidePoint = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);

        // Add spin/angle
        const angleRad = collidePoint * (Math.PI / 4); // Max 45 degrees

        ball.speed = Math.min(ball.speed + 0.5, 15); // Increase speed
        ball.dx = direction * ball.speed * Math.cos(angleRad);
        ball.dy = ball.speed * Math.sin(angleRad);

        this.createParticles(ball.x, ball.y, paddle.color, 10);
        this.shakeTimer = 5;
    }

    createParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 5,
                vy: (Math.random() - 0.5) * 5,
                life: 1,
                color: color,
                size: Math.random() * 3 + 1
            });
        }
    }

    draw() {
        // Screen Shake
        this.ctx.save();
        if (this.shakeTimer > 0) {
            const dx = (Math.random() - 0.5) * this.shakeTimer;
            const dy = (Math.random() - 0.5) * this.shakeTimer;
            this.ctx.translate(dx, dy);
        }

        // Background
        this.ctx.fillStyle = '#050510';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Grid (Neon style)
        this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        for (let i = 0; i < this.width; i += 40) {
            this.ctx.beginPath(); this.ctx.moveTo(i, 0); this.ctx.lineTo(i, this.height); this.ctx.stroke();
        }
        for (let i = 0; i < this.height; i += 40) {
            this.ctx.beginPath(); this.ctx.moveTo(0, i); this.ctx.lineTo(this.width, i); this.ctx.stroke();
        }

        // Center Line
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.width / 2, 0);
        this.ctx.lineTo(this.width / 2, this.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Paddles (with Glow)
        this.ctx.shadowBlur = 20;

        this.ctx.shadowColor = this.paddle1.color;
        this.ctx.fillStyle = this.paddle1.color;
        this.ctx.fillRect(this.paddle1.x, this.paddle1.y, this.paddle1.width, this.paddle1.height);

        this.ctx.shadowColor = this.paddle2.color;
        this.ctx.fillStyle = this.paddle2.color;
        this.ctx.fillRect(this.paddle2.x, this.paddle2.y, this.paddle2.width, this.paddle2.height);

        // Balls (with Trails)
        this.balls.forEach(ball => {
            // Trail
            ball.trail.forEach(t => {
                this.ctx.globalAlpha = t.alpha * 0.5;
                this.ctx.fillStyle = ball.color;
                this.ctx.beginPath();
                this.ctx.arc(t.x, t.y, ball.radius * 0.8, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.globalAlpha = 1;

            // Ball
            this.ctx.shadowColor = ball.color;
            this.ctx.fillStyle = ball.color;
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Particles
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1;
        this.ctx.shadowBlur = 0;

        // QTE UI
        if (this.qte.active) {
            this.ctx.save();
            this.ctx.translate(this.width / 2, this.height / 2);

            // Timer Circle
            const progress = this.qte.timer / this.qte.maxTime;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 60, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress));
            this.ctx.strokeStyle = this.qte.color;
            this.ctx.lineWidth = 5;
            this.ctx.stroke();

            // Letter
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 60px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(this.qte.letter, 0, 5);

            // Type Label
            this.ctx.font = '16px Arial';
            this.ctx.fillText(this.qte.type.toUpperCase(), 0, 80);

            this.ctx.restore();
        }

        // Feedback UI
        if (this.qte.feedbackTimer > 0 && this.qte.feedback) {
            this.ctx.save();
            this.ctx.translate(this.width / 2, this.height / 2);
            this.ctx.globalAlpha = Math.min(1, this.qte.feedbackTimer / 20);

            this.ctx.fillStyle = this.qte.feedback.color;
            this.ctx.font = 'bold 40px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(this.qte.feedback.text, 0, -20);

            this.ctx.fillStyle = '#fff';
            this.ctx.font = '20px Arial';
            this.ctx.fillText(this.qte.feedback.subText, 0, 20);

            this.ctx.restore();
        }

        // Scores
        this.ctx.font = 'bold 60px Arial';
        this.ctx.textAlign = 'center';

        this.ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
        this.ctx.fillText(this.paddle1.score, this.width / 4, 80);

        this.ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
        this.ctx.fillText(this.paddle2.score, 3 * this.width / 4, 80);

        // Controls Hint
        this.ctx.font = '16px Arial';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fillText('Use W / S to move', this.width / 2, this.height - 20);

        this.ctx.restore();
    }

    loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        this.animationId = requestAnimationFrame(() => this.loop());
    }

    endGame() {
        this.gameOver = true;
        this.stop();
        const won = this.paddle1.score >= this.winScore;
        alert(won ? `You Win! ${this.paddle1.score}-${this.paddle2.score}` : `AI Wins! ${this.paddle1.score}-${this.paddle2.score}`);
        if (this.onGameOver) this.onGameOver(this.paddle1.score * 100);
    }
}
