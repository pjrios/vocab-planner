export class GalacticBreaker {
    constructor(canvas, onGameOver) {
        this.canvas = canvas;
        this.onGameOver = onGameOver;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;

        this.animationId = null;
        this.isRunning = false;

        // Game Objects
        this.paddle = {
            width: 100,
            height: 15,
            x: this.width / 2 - 50,
            y: this.height - 30,
            speed: 8,
            dx: 0,
            color: '#8b5cf6',
            magnetActive: false,
            expandActive: false
        };

        this.ball = {
            x: this.width / 2,
            y: this.height - 50,
            radius: 8,
            speed: 5,
            dx: 4,
            dy: -4,
            color: '#fbbf24',
            trail: [],
            fireball: false
        };

        this.bricks = [];
        this.powerUps = [];
        this.particles = [];
        this.brickRowCount = 5;
        this.brickColumnCount = 9;
        this.brickWidth = 75;
        this.brickHeight = 25;
        this.brickPadding = 10;
        this.brickOffsetTop = 60;
        this.brickOffsetLeft = 30;

        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.combo = 0;
        this.comboTimer = 0;

        // Brick types
        this.brickTypes = [
            { color: '#ef4444', points: 10, hits: 1 },      // Red - Basic
            { color: '#f59e0b', points: 20, hits: 2 },      // Orange - Strong
            { color: '#10b981', points: 30, hits: 3 },      // Green - Very Strong
            { color: '#3b82f6', points: 50, hits: 1, special: 'explode' }, // Blue - Explosive
            { color: '#8b5cf6', points: 100, hits: 1, special: 'multiball' }, // Purple - Multiball
            { color: '#ec4899', points: 15, hits: 1, special: 'powerup' }  // Pink - Power-up
        ];

        // Power-up types
        this.powerUpTypes = [
            { type: 'expand', color: '#10b981', symbol: '▬', duration: 10000 },
            { type: 'shrink', color: '#ef4444', symbol: '―', duration: 8000 },
            { type: 'slow', color: '#3b82f6', symbol: '◐', duration: 7000 },
            { type: 'fast', color: '#f59e0b', symbol: '◑', duration: 6000 },
            { type: 'multiball', color: '#8b5cf6', symbol: '●●', duration: 0 },
            { type: 'extralife', color: '#ec4899', symbol: '♥', duration: 0 },
            { type: 'fireball', color: '#fbbf24', symbol: '🔥', duration: 12000 },
            { type: 'magnet', color: '#06b6d4', symbol: '⬇', duration: 8000 }
        ];

        this.balls = [this.ball]; // Support multiple balls

        this.initBricks();
        this.bindControls();
    }

    initBricks() {
        this.bricks = [];
        for (let c = 0; c < this.brickColumnCount; c++) {
            this.bricks[c] = [];
            for (let r = 0; r < this.brickRowCount; r++) {
                const brickX = c * (this.brickWidth + this.brickPadding) + this.brickOffsetLeft;
                const brickY = r * (this.brickHeight + this.brickPadding) + this.brickOffsetTop;

                // Determine brick type based on row with some randomness
                let typeIndex;
                if (Math.random() < 0.1) {
                    // 10% chance for special bricks
                    typeIndex = Math.floor(Math.random() * 3) + 3; // Blue, Purple, or Pink
                } else if (r === 0) {
                    typeIndex = 2; // Top row - Green (3 hits)
                } else if (r === 1 || r === 2) {
                    typeIndex = 1; // Middle rows - Orange (2 hits)
                } else {
                    typeIndex = 0; // Bottom rows - Red (1 hit)
                }

                const type = this.brickTypes[typeIndex];
                this.bricks[c][r] = {
                    x: brickX,
                    y: brickY,
                    status: 1,
                    hits: type.hits,
                    maxHits: type.hits,
                    type: typeIndex
                };
            }
        }
    }

    createParticles(x, y, color, count = 10) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = 2 + Math.random() * 3;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                color: color,
                size: 2 + Math.random() * 3
            });
        }
    }

    spawnPowerUp(x, y) {
        const powerUp = this.powerUpTypes[Math.floor(Math.random() * this.powerUpTypes.length)];
        this.powerUps.push({
            x: x,
            y: y,
            width: 40,
            height: 20,
            speed: 2,
            rotation: 0,
            ...powerUp
        });
    }

    applyPowerUp(powerUp) {
        switch (powerUp.type) {
            case 'expand':
                this.paddle.expandActive = true;
                this.paddle.width = 150;
                setTimeout(() => {
                    if (this.isRunning) {
                        this.paddle.width = 100;
                        this.paddle.expandActive = false;
                    }
                }, powerUp.duration);
                break;
            case 'shrink':
                this.paddle.width = 60;
                setTimeout(() => {
                    if (this.isRunning) this.paddle.width = 100;
                }, powerUp.duration);
                break;
            case 'slow':
                this.balls.forEach(b => {
                    b.speed *= 0.6;
                    b.dx *= 0.6;
                    b.dy *= 0.6;
                });
                setTimeout(() => {
                    if (this.isRunning) {
                        this.balls.forEach(b => {
                            b.speed /= 0.6;
                            b.dx /= 0.6;
                            b.dy /= 0.6;
                        });
                    }
                }, powerUp.duration);
                break;
            case 'fast':
                this.balls.forEach(b => {
                    b.speed *= 1.5;
                    b.dx *= 1.5;
                    b.dy *= 1.5;
                });
                setTimeout(() => {
                    if (this.isRunning) {
                        this.balls.forEach(b => {
                            b.speed /= 1.5;
                            b.dx /= 1.5;
                            b.dy /= 1.5;
                        });
                    }
                }, powerUp.duration);
                break;
            case 'multiball':
                // Create 2 extra balls
                for (let i = 0; i < 2; i++) {
                    const newBall = {
                        x: this.balls[0].x,
                        y: this.balls[0].y,
                        radius: this.balls[0].radius,
                        speed: this.balls[0].speed,
                        dx: (Math.random() - 0.5) * 8,
                        dy: -Math.abs(this.balls[0].dy),
                        color: '#fbbf24',
                        trail: [],
                        fireball: false
                    };
                    this.balls.push(newBall);
                }
                break;
            case 'extralife':
                this.lives++;
                break;
            case 'fireball':
                this.balls.forEach(b => b.fireball = true);
                setTimeout(() => {
                    if (this.isRunning) this.balls.forEach(b => b.fireball = false);
                }, powerUp.duration);
                break;
            case 'magnet':
                this.paddle.magnetActive = true;
                setTimeout(() => {
                    if (this.isRunning) this.paddle.magnetActive = false;
                }, powerUp.duration);
                break;
        }
    }

    bindControls() {
        this.keyDownHandler = (e) => {
            if (e.key === 'Right' || e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                this.paddle.dx = this.paddle.speed;
            } else if (e.key === 'Left' || e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                this.paddle.dx = -this.paddle.speed;
            }
        };

        this.keyUpHandler = (e) => {
            if (e.key === 'Right' || e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' ||
                e.key === 'Left' || e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                this.paddle.dx = 0;
            }
        };

        document.addEventListener('keydown', this.keyDownHandler);
        document.addEventListener('keyup', this.keyUpHandler);
    }

    start() {
        this.isRunning = true;
        this.loop();
    }

    pause() {
        this.isRunning = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
    }

    resume() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.loop();
        }
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        document.removeEventListener('keydown', this.keyDownHandler);
        document.removeEventListener('keyup', this.keyUpHandler);
    }

    loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        this.animationId = requestAnimationFrame(() => this.loop());
    }

    update() {
        // Update paddle
        this.paddle.x += this.paddle.dx;
        if (this.paddle.x < 0) this.paddle.x = 0;
        if (this.paddle.x + this.paddle.width > this.width) {
            this.paddle.x = this.width - this.paddle.width;
        }

        // Update balls
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];

            // Trail effect
            ball.trail.push({ x: ball.x, y: ball.y });
            if (ball.trail.length > 8) ball.trail.shift();

            ball.x += ball.dx;
            ball.y += ball.dy;

            // Wall collision
            if (ball.x + ball.radius > this.width || ball.x - ball.radius < 0) {
                ball.dx = -ball.dx;
            }
            if (ball.y - ball.radius < 0) {
                ball.dy = -ball.dy;
            }

            // Paddle collision
            if (ball.y + ball.radius > this.paddle.y &&
                ball.y + ball.radius < this.paddle.y + this.paddle.height &&
                ball.x > this.paddle.x &&
                ball.x < this.paddle.x + this.paddle.width) {

                // Add spin based on where ball hits paddle
                const hitPos = (ball.x - this.paddle.x) / this.paddle.width;
                ball.dx = (hitPos - 0.5) * 10;
                ball.dy = -Math.abs(ball.dy);

                if (this.paddle.magnetActive) {
                    ball.dy *= 0.5; // Slow ball if magnet active
                }
            }

            // Bottom collision - lose life
            if (ball.y + ball.radius > this.height) {
                this.balls.splice(i, 1);
                if (this.balls.length === 0) {
                    this.lives--;
                    if (this.lives > 0) {
                        this.resetBall();
                    } else {
                        this.endGame();
                        return;
                    }
                }
            }

            // Brick collision
            for (let c = 0; c < this.brickColumnCount; c++) {
                for (let r = 0; r < this.brickRowCount; r++) {
                    const b = this.bricks[c][r];
                    if (b.status === 1) {
                        if (
                            ball.x > b.x &&
                            ball.x < b.x + this.brickWidth &&
                            ball.y > b.y &&
                            ball.y < b.y + this.brickHeight
                        ) {
                            const brickType = this.brickTypes[b.type];

                            if (ball.fireball) {
                                // Fireball destroys instantly
                                b.status = 0;
                                this.score += brickType.points * (1 + this.combo * 0.5);
                            } else {
                                ball.dy = -ball.dy;
                                b.hits--;

                                if (b.hits <= 0) {
                                    b.status = 0;
                                    this.score += brickType.points * (1 + this.combo * 0.5);
                                    this.combo++;
                                    this.comboTimer = 120;

                                    // Special brick effects
                                    if (brickType.special === 'explode') {
                                        // Destroy adjacent bricks
                                        for (let ec = Math.max(0, c - 1); ec <= Math.min(this.brickColumnCount - 1, c + 1); ec++) {
                                            for (let er = Math.max(0, r - 1); er <= Math.min(this.brickRowCount - 1, r + 1); er++) {
                                                if (this.bricks[ec][er].status === 1) {
                                                    this.bricks[ec][er].status = 0;
                                                    this.score += 5;
                                                    this.createParticles(
                                                        this.bricks[ec][er].x + this.brickWidth / 2,
                                                        this.bricks[ec][er].y + this.brickHeight / 2,
                                                        '#3b82f6',
                                                        8
                                                    );
                                                }
                                            }
                                        }
                                    } else if (brickType.special === 'multiball') {
                                        this.applyPowerUp({ type: 'multiball' });
                                    } else if (brickType.special === 'powerup') {
                                        this.spawnPowerUp(b.x + this.brickWidth / 2, b.y + this.brickHeight);
                                    }
                                }
                            }

                            this.createParticles(b.x + this.brickWidth / 2, b.y + this.brickHeight / 2, brickType.color);
                        }
                    }
                }
            }
        }

        // Update power-ups
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.powerUps[i];
            powerUp.y += powerUp.speed;
            powerUp.rotation += 0.1;

            // Check paddle collision
            if (powerUp.y + powerUp.height > this.paddle.y &&
                powerUp.y < this.paddle.y + this.paddle.height &&
                powerUp.x + powerUp.width > this.paddle.x &&
                powerUp.x < this.paddle.x + this.paddle.width) {
                this.applyPowerUp(powerUp);
                this.createParticles(powerUp.x + 20, powerUp.y + 10, powerUp.color, 15);
                this.powerUps.splice(i, 1);
                continue;
            }

            // Remove if off screen
            if (powerUp.y > this.height) {
                this.powerUps.splice(i, 1);
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1;
            p.life -= 0.02;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Update combo
        if (this.comboTimer > 0) {
            this.comboTimer--;
        } else if (this.combo > 0) {
            this.combo = 0;
        }

        // Check for level completion
        let activeBricks = 0;
        for (let c = 0; c < this.brickColumnCount; c++) {
            for (let r = 0; r < this.brickRowCount; r++) {
                if (this.bricks[c][r].status === 1) activeBricks++;
            }
        }

        if (activeBricks === 0) {
            this.level++;
            this.score += 200 * this.level;
            this.ball.speed += 0.5;
            this.brickRowCount = Math.min(this.brickRowCount + 1, 8);
            this.initBricks();
            this.resetBall();
        }
    }

    resetBall() {
        this.balls = [{
            x: this.width / 2,
            y: this.height - 50,
            radius: 8,
            speed: 5 + (this.level - 1) * 0.5,
            dx: 4,
            dy: -4,
            color: '#fbbf24',
            trail: [],
            fireball: false
        }];
    }

    draw() {
        // Space background
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#1e1b4b');
        gradient.addColorStop(1, '#0f172a');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Stars
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let i = 0; i < 60; i++) {
            const x = (i * 123.4) % this.width;
            const y = (i * 234.5) % this.height;
            this.ctx.fillRect(x, y, 2, 2);
        }

        // Particles
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1;

        // Bricks
        for (let c = 0; c < this.brickColumnCount; c++) {
            for (let r = 0; r < this.brickRowCount; r++) {
                if (this.bricks[c][r].status === 1) {
                    const brick = this.bricks[c][r];
                    const brickType = this.brickTypes[brick.type];

                    // Gradient fill
                    const brickGradient = this.ctx.createLinearGradient(
                        brick.x, brick.y,
                        brick.x, brick.y + this.brickHeight
                    );
                    brickGradient.addColorStop(0, brickType.color);
                    brickGradient.addColorStop(1, brickType.color + '99');

                    this.ctx.fillStyle = brickGradient;
                    this.ctx.fillRect(brick.x, brick.y, this.brickWidth, this.brickHeight);

                    // Border
                    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(brick.x, brick.y, this.brickWidth, this.brickHeight);

                    // Special brick indicators
                    if (brickType.special) {
                        this.ctx.fillStyle = '#fff';
                        this.ctx.font = 'bold 16px Arial';
                        this.ctx.textAlign = 'center';
                        const symbols = { explode: '💥', multiball: '●●', powerup: '?' };
                        this.ctx.fillText(symbols[brickType.special] || '★', brick.x + this.brickWidth / 2, brick.y + this.brickHeight / 2 + 5);
                    }

                    // Health bar for multi-hit bricks
                    if (brick.maxHits > 1) {
                        const healthPercent = brick.hits / brick.maxHits;
                        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                        this.ctx.fillRect(brick.x + 5, brick.y + this.brickHeight - 8, this.brickWidth - 10, 3);
                        this.ctx.fillStyle = '#10b981';
                        this.ctx.fillRect(brick.x + 5, brick.y + this.brickHeight - 8, (this.brickWidth - 10) * healthPercent, 3);
                    }
                }
            }
        }

        // Paddle
        const paddleGradient = this.ctx.createLinearGradient(
            this.paddle.x, this.paddle.y,
            this.paddle.x, this.paddle.y + this.paddle.height
        );
        paddleGradient.addColorStop(0, this.paddle.color);
        paddleGradient.addColorStop(1, '#6d28d9');
        this.ctx.fillStyle = paddleGradient;
        this.ctx.fillRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height);

        // Paddle effects
        if (this.paddle.magnetActive) {
            this.ctx.strokeStyle = '#06b6d4';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(this.paddle.x - 2, this.paddle.y - 2, this.paddle.width + 4, this.paddle.height + 4);
        }
        if (this.paddle.expandActive) {
            this.ctx.strokeStyle = '#10b981';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(this.paddle.x - 1, this.paddle.y - 1, this.paddle.width + 2, this.paddle.height + 2);
        }

        // Balls with trail
        this.balls.forEach(ball => {
            // Trail
            ball.trail.forEach((pos, i) => {
                const alpha = i / ball.trail.length;
                this.ctx.globalAlpha = alpha * 0.5;
                this.ctx.fillStyle = ball.fireball ? '#ff6b00' : ball.color;
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, ball.radius * alpha, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.globalAlpha = 1;

            // Ball
            const ballGradient = this.ctx.createRadialGradient(
                ball.x - 2, ball.y - 2, 0,
                ball.x, ball.y, ball.radius
            );
            ballGradient.addColorStop(0, ball.fireball ? '#ffeb3b' : '#fef3c7');
            ballGradient.addColorStop(1, ball.fireball ? '#ff6f00' : ball.color);
            this.ctx.fillStyle = ballGradient;
            this.ctx.shadowColor = ball.fireball ? '#ff6f00' : ball.color;
            this.ctx.shadowBlur = ball.fireball ? 20 : 10;
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        });

        // Power-ups
        this.powerUps.forEach(powerUp => {
            this.ctx.save();
            this.ctx.translate(powerUp.x + 20, powerUp.y + 10);
            this.ctx.rotate(powerUp.rotation);

            // Glow
            this.ctx.shadowColor = powerUp.color;
            this.ctx.shadowBlur = 15;
            this.ctx.fillStyle = powerUp.color;
            this.ctx.fillRect(-20, -10, 40, 20);

            // Symbol
            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(powerUp.symbol, 0, 5);

            this.ctx.restore();
        });

        // UI
        this.ctx.fillStyle = '#fbbf24';
        this.ctx.font = 'bold 20px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.shadowColor = '#fbbf24';
        this.ctx.shadowBlur = 10;
        this.ctx.fillText(`SCORE: ${this.score}`, 10, 30);
        this.ctx.fillText(`LEVEL: ${this.level}`, 10, 55);

        if (this.combo > 0) {
            this.ctx.fillStyle = '#10b981';
            this.ctx.shadowColor = '#10b981';
            this.ctx.fillText(`COMBO x${this.combo}!`, this.width / 2 - 60, 30);
        }

        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = '#ef4444';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`LIVES: ${this.lives}`, this.width - 10, 30);

        // Balls count
        if (this.balls.length > 1) {
            this.ctx.fillStyle = '#8b5cf6';
            this.ctx.fillText(`BALLS: ${this.balls.length}`, this.width - 10, 55);
        }
    }

    endGame() {
        this.stop();
        alert(`Game Over!\nFinal Score: ${this.score}\nLevel Reached: ${this.level}`);
        if (this.onGameOver) this.onGameOver(this.score);
    }
}
