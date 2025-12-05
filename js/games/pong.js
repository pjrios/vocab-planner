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
        this.paddle1 = { 
            x: 20, 
            y: this.height / 2 - 50, 
            width: this.paddleWidth, 
            height: this.paddleHeight, 
            baseHeight: this.paddleHeight,
            color: '#0ff', 
            score: 0, 
            dy: 0,
            speedBoost: false,
            shield: false
        };
        this.paddle2 = { 
            x: this.width - 35, 
            y: this.height / 2 - 50, 
            width: this.paddleWidth, 
            height: this.paddleHeight, 
            baseHeight: this.paddleHeight,
            color: '#f0f', 
            score: 0, 
            dy: 0,
            speedBoost: false,
            shield: false
        };

        this.balls = [];
        this.particles = [];
        this.activeEffects = [];

        // Power-up definitions
        this.powerUpTypes = [
            { 
                id: 'expand', 
                name: 'EXPAND', 
                icon: '⬆️', 
                color: '#00ff88',
                chargeTime: 900, // 15 seconds at 60fps
                chargeMethod: 'time',
                description: 'Grow paddle 50%'
            },
            { 
                id: 'shield', 
                name: 'SHIELD', 
                icon: '🛡️', 
                color: '#00aaff',
                chargeTime: 5, // 5 successful hits
                chargeMethod: 'hits',
                description: 'Block one goal'
            },
            { 
                id: 'multiball', 
                name: 'MULTI', 
                icon: '⚡', 
                color: '#ffff00',
                chargeTime: 1200, // 20 seconds
                chargeMethod: 'time',
                description: 'Spawn extra ball'
            }
        ];

        // Player power-up slots
        this.playerPowerUps = this.powerUpTypes.map(type => ({
            ...type,
            charge: 0,
            maxCharge: type.chargeTime,
            isReady: false,
            cooldown: 0,
            cooldownMax: 180, // 3 second cooldown after use
            isActive: false
        }));

        // AI power-up slots
        this.aiPowerUps = this.powerUpTypes.map(type => ({
            ...type,
            charge: 0,
            maxCharge: type.chargeTime,
            isReady: false,
            cooldown: 0,
            cooldownMax: 180,
            isActive: false
        }));

        // Track hits for hit-based charging
        this.playerHits = 0;
        this.aiHits = 0;

        // Game State
        this.winScore = 11;
        this.gameOver = false;
        this.isRunning = false;
        this.animationId = null;
        this.keys = {};

        // AI State
        this.aiTargetY = this.height / 2;
        this.aiReactionTimer = 0;
        this.aiPowerUpTimer = 0; // Timer for AI power-up decisions

        // Visuals
        this.shakeTimer = 0;
        
        // Feedback messages
        this.feedback = null;
        this.feedbackTimer = 0;

        this.resetBall();
        this.bindControls();
    }

    bindControls() {
        this.keyDownHandler = (e) => {
            // Ignore if typing in an input
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

            // Prevent default for game keys
            if (['w', 'W', 's', 'S', '1', '2', '3'].includes(e.key)) {
                e.preventDefault();
            }

            this.keys[e.key] = true;

            // Power-up activation (1, 2, 3 keys)
            if (e.key === '1') this.activatePowerUp(0, 'player');
            if (e.key === '2') this.activatePowerUp(1, 'player');
            if (e.key === '3') this.activatePowerUp(2, 'player');
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

    activatePowerUp(slotIndex, owner) {
        const powerUps = owner === 'player' ? this.playerPowerUps : this.aiPowerUps;
        const paddle = owner === 'player' ? this.paddle1 : this.paddle2;
        const opponent = owner === 'player' ? this.paddle2 : this.paddle1;
        const powerUp = powerUps[slotIndex];

        if (!powerUp.isReady || powerUp.cooldown > 0) return false;

        // Activate the power-up
        powerUp.isReady = false;
        powerUp.charge = 0;
        powerUp.cooldown = powerUp.cooldownMax;
        powerUp.isActive = true;

        // Visual feedback
        this.createParticles(
            owner === 'player' ? 100 : this.width - 100,
            this.height / 2,
            powerUp.color,
            20
        );

        // Show feedback
        this.showFeedback(
            owner === 'player' ? 'YOU' : 'AI',
            powerUp.name,
            powerUp.color
        );

        // Apply effect based on type
        switch (powerUp.id) {
            case 'expand':
                paddle.height = paddle.baseHeight * 1.5;
                setTimeout(() => {
                    if (this.isRunning) {
                        paddle.height = paddle.baseHeight;
                        powerUp.isActive = false;
                    }
                }, 5000);
                break;

            case 'shield':
                paddle.shield = true;
                powerUp.isActive = true;
                // Shield stays until used
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
                powerUp.isActive = false;
                break;
        }

        return true;
    }

    showFeedback(who, what, color) {
        this.feedback = { who, what, color };
        this.feedbackTimer = 90; // 1.5 seconds
    }

    updatePowerUps() {
        // Update player power-ups
        this.playerPowerUps.forEach((powerUp, index) => {
            if (powerUp.cooldown > 0) {
                powerUp.cooldown--;
            } else if (!powerUp.isReady) {
                // Charge based on method
                if (powerUp.chargeMethod === 'time') {
                    powerUp.charge++;
                }
                // Hit-based charging is handled in handlePaddleHit

                if (powerUp.charge >= powerUp.maxCharge) {
                    powerUp.isReady = true;
                    powerUp.charge = powerUp.maxCharge;
                }
            }
        });

        // Update AI power-ups
        this.aiPowerUps.forEach((powerUp, index) => {
            if (powerUp.cooldown > 0) {
                powerUp.cooldown--;
            } else if (!powerUp.isReady) {
                if (powerUp.chargeMethod === 'time') {
                    powerUp.charge++;
                }

                if (powerUp.charge >= powerUp.maxCharge) {
                    powerUp.isReady = true;
                    powerUp.charge = powerUp.maxCharge;
                }
            }
        });

        // AI power-up usage logic
        this.aiPowerUpTimer++;
        if (this.aiPowerUpTimer > 60) { // Check every second
            this.aiPowerUpTimer = 0;
            this.aiUsePowerUp();
        }
    }

    aiUsePowerUp() {
        // AI strategic power-up usage
        const readyPowerUps = this.aiPowerUps
            .map((p, i) => ({ ...p, index: i }))
            .filter(p => p.isReady);

        if (readyPowerUps.length === 0) return;

        // Decision logic based on game state
        const scoreDiff = this.paddle1.score - this.paddle2.score;
        const ballComingToAI = this.balls.some(b => b.dx > 0);

        // Use shield if losing and don't have one
        if (scoreDiff > 0 && !this.paddle2.shield) {
            const shieldPowerUp = readyPowerUps.find(p => p.id === 'shield');
            if (shieldPowerUp && Math.random() < 0.7) {
                this.activatePowerUp(shieldPowerUp.index, 'ai');
                return;
            }
        }

        // Use expand when ball is coming and AI is struggling
        if (ballComingToAI && scoreDiff > 1) {
            const expandPowerUp = readyPowerUps.find(p => p.id === 'expand');
            if (expandPowerUp && Math.random() < 0.5) {
                this.activatePowerUp(expandPowerUp.index, 'ai');
                return;
            }
        }

        // Use multiball when AI is winning to press advantage
        if (scoreDiff < -1) {
            const multiballPowerUp = readyPowerUps.find(p => p.id === 'multiball');
            if (multiballPowerUp && Math.random() < 0.4) {
                this.activatePowerUp(multiballPowerUp.index, 'ai');
                return;
            }
        }

        // Random usage if nothing strategic
        if (Math.random() < 0.1 && readyPowerUps.length > 0) {
            const randomPowerUp = readyPowerUps[Math.floor(Math.random() * readyPowerUps.length)];
            this.activatePowerUp(randomPowerUp.index, 'ai');
        }
    }

    update() {
        if (this.gameOver) return;

        // Screen shake decay
        if (this.shakeTimer > 0) this.shakeTimer--;

        // Feedback timer
        if (this.feedbackTimer > 0) this.feedbackTimer--;

        // Update power-ups
        this.updatePowerUps();

        // Player Movement (W/S keys only)
        const playerSpeed = this.paddle1.speedBoost ? 12 : 8;
        if (this.keys['w'] || this.keys['W']) {
            this.paddle1.y = Math.max(0, this.paddle1.y - playerSpeed);
        }
        if (this.keys['s'] || this.keys['S']) {
            this.paddle1.y = Math.min(this.height - this.paddle1.height, this.paddle1.y + playerSpeed);
        }

        // AI Movement (Imperfect)
        const targetBall = this.balls.filter(b => b.dx > 0).sort((a, b) => b.x - a.x)[0];

        if (targetBall) {
            if (this.aiReactionTimer-- <= 0) {
                this.aiTargetY = targetBall.y - this.paddle2.height / 2;
                this.aiReactionTimer = Math.random() * 10 + 5;
            }

            const aiSpeed = this.paddle2.speedBoost ? 7 : 5.5;
            const dy = this.aiTargetY - this.paddle2.y;
            this.paddle2.y += Math.sign(dy) * Math.min(Math.abs(dy), aiSpeed);
        } else {
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
                this.handlePaddleHit(ball, p1, 1, 'player');
            }
            // Check Paddle 2
            if (ball.dx > 0 && ball.x + ball.radius > p2.x && ball.x - ball.radius < p2.x + p2.width && ball.y > p2.y && ball.y < p2.y + p2.height) {
                this.handlePaddleHit(ball, p2, -1, 'ai');
            }

            // Scoring
            if (ball.x < 0) {
                // Ball went past player
                if (this.paddle1.shield) {
                    // Shield blocks the goal
                    this.paddle1.shield = false;
                    ball.dx = Math.abs(ball.dx); // Bounce back
                    ball.x = 10;
                    this.createParticles(ball.x, ball.y, '#00aaff', 30);
                    this.showFeedback('SHIELD', 'BLOCKED!', '#00aaff');
                    // Mark shield power-up as inactive
                    const shieldPowerUp = this.playerPowerUps.find(p => p.id === 'shield');
                    if (shieldPowerUp) shieldPowerUp.isActive = false;
                } else {
                    this.paddle2.score++;
                    this.createParticles(ball.x, ball.y, '#f0f', 30);
                    this.balls.splice(i, 1);
                    this.shakeTimer = 15;
                }
            } else if (ball.x > this.width) {
                // Ball went past AI
                if (this.paddle2.shield) {
                    this.paddle2.shield = false;
                    ball.dx = -Math.abs(ball.dx);
                    ball.x = this.width - 10;
                    this.createParticles(ball.x, ball.y, '#00aaff', 30);
                    this.showFeedback('AI SHIELD', 'BLOCKED!', '#00aaff');
                    const shieldPowerUp = this.aiPowerUps.find(p => p.id === 'shield');
                    if (shieldPowerUp) shieldPowerUp.isActive = false;
                } else {
                    this.paddle1.score++;
                    this.createParticles(ball.x, ball.y, '#0ff', 30);
                    this.balls.splice(i, 1);
                    this.shakeTimer = 15;
                }
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

    handlePaddleHit(ball, paddle, direction, owner) {
        // Calculate relative impact point (-1 to 1)
        const collidePoint = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);

        // Add spin/angle
        const angleRad = collidePoint * (Math.PI / 4);

        ball.speed = Math.min(ball.speed + 0.5, 15);
        ball.dx = direction * ball.speed * Math.cos(angleRad);
        ball.dy = ball.speed * Math.sin(angleRad);

        this.createParticles(ball.x, ball.y, paddle.color, 10);
        this.shakeTimer = 5;

        // Charge hit-based power-ups
        const powerUps = owner === 'player' ? this.playerPowerUps : this.aiPowerUps;
        powerUps.forEach(powerUp => {
            if (powerUp.chargeMethod === 'hits' && !powerUp.isReady && powerUp.cooldown <= 0) {
                powerUp.charge++;
                if (powerUp.charge >= powerUp.maxCharge) {
                    powerUp.isReady = true;
                }
            }
        });
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

    drawPowerUpSlot(x, y, powerUp, keyLabel, isPlayer) {
        const ctx = this.ctx;
        const size = 40;
        const chargePercent = powerUp.charge / powerUp.maxCharge;
        const isOnCooldown = powerUp.cooldown > 0;

        // Background circle
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = isOnCooldown ? 'rgba(50, 50, 50, 0.8)' : 'rgba(20, 20, 40, 0.8)';
        ctx.fill();

        // Charge ring
        if (!powerUp.isReady && !isOnCooldown) {
            ctx.beginPath();
            ctx.arc(x, y, size / 2 + 3, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * chargePercent));
            ctx.strokeStyle = powerUp.color + '80';
            ctx.lineWidth = 4;
            ctx.stroke();
        }

        // Ready glow
        if (powerUp.isReady) {
            ctx.beginPath();
            ctx.arc(x, y, size / 2 + 5, 0, Math.PI * 2);
            ctx.strokeStyle = powerUp.color;
            ctx.lineWidth = 3;
            ctx.shadowColor = powerUp.color;
            ctx.shadowBlur = 15;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Pulsing effect
            const pulse = Math.sin(Date.now() / 200) * 0.2 + 0.8;
            ctx.beginPath();
            ctx.arc(x, y, size / 2, 0, Math.PI * 2);
            ctx.fillStyle = powerUp.color + Math.floor(pulse * 60).toString(16).padStart(2, '0');
            ctx.fill();
        }

        // Cooldown overlay
        if (isOnCooldown) {
            const cooldownPercent = powerUp.cooldown / powerUp.cooldownMax;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.arc(x, y, size / 2, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * cooldownPercent));
            ctx.closePath();
            ctx.fillStyle = 'rgba(100, 100, 100, 0.7)';
            ctx.fill();
        }

        // Icon
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = powerUp.isReady ? '#fff' : (isOnCooldown ? '#666' : '#aaa');
        ctx.fillText(powerUp.icon, x, y);

        // Key label (only for player)
        if (isPlayer) {
            ctx.font = 'bold 12px Arial';
            ctx.fillStyle = powerUp.isReady ? '#fff' : '#666';
            ctx.fillText(keyLabel, x, y + size / 2 + 12);
        }

        // Active indicator
        if (powerUp.isActive) {
            ctx.beginPath();
            ctx.arc(x, y - size / 2 - 8, 4, 0, Math.PI * 2);
            ctx.fillStyle = powerUp.color;
            ctx.fill();
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

        // Player paddle
        this.ctx.shadowColor = this.paddle1.color;
        this.ctx.fillStyle = this.paddle1.color;
        this.ctx.fillRect(this.paddle1.x, this.paddle1.y, this.paddle1.width, this.paddle1.height);

        // Shield indicator on paddle
        if (this.paddle1.shield) {
            this.ctx.strokeStyle = '#00aaff';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(this.paddle1.x - 5, this.paddle1.y - 5, this.paddle1.width + 10, this.paddle1.height + 10);
        }

        // AI paddle
        this.ctx.shadowColor = this.paddle2.color;
        this.ctx.fillStyle = this.paddle2.color;
        this.ctx.fillRect(this.paddle2.x, this.paddle2.y, this.paddle2.width, this.paddle2.height);

        if (this.paddle2.shield) {
            this.ctx.strokeStyle = '#00aaff';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(this.paddle2.x - 5, this.paddle2.y - 5, this.paddle2.width + 10, this.paddle2.height + 10);
        }

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

        // Power-up UI - Player (left side, bottom)
        const playerPowerUpY = this.height - 60;
        this.playerPowerUps.forEach((powerUp, index) => {
            this.drawPowerUpSlot(60 + index * 55, playerPowerUpY, powerUp, String(index + 1), true);
        });

        // Power-up UI - AI (right side, bottom)
        const aiPowerUpY = this.height - 60;
        this.aiPowerUps.forEach((powerUp, index) => {
            this.drawPowerUpSlot(this.width - 170 + index * 55, aiPowerUpY, powerUp, '', false);
        });

        // Feedback UI
        if (this.feedbackTimer > 0 && this.feedback) {
            this.ctx.save();
            this.ctx.translate(this.width / 2, this.height / 2);
            this.ctx.globalAlpha = Math.min(1, this.feedbackTimer / 30);

            this.ctx.fillStyle = this.feedback.color;
            this.ctx.font = 'bold 24px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.shadowColor = this.feedback.color;
            this.ctx.shadowBlur = 20;
            this.ctx.fillText(this.feedback.who, 0, -15);
            this.ctx.fillText(this.feedback.what, 0, 15);
            this.ctx.shadowBlur = 0;

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
        this.ctx.font = '14px Arial';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.fillText('W/S: Move  |  1/2/3: Power-ups', this.width / 2, 25);

        // Power-up labels
        this.ctx.font = '10px Arial';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('YOUR POWER-UPS', 35, this.height - 95);
        this.ctx.textAlign = 'right';
        this.ctx.fillText('AI POWER-UPS', this.width - 35, this.height - 95);

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
