export class FlappyBird {
    constructor(canvas, onGameOver) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onGameOver = onGameOver;
        this.width = canvas.width;
        this.height = canvas.height;

        this.bird = {
            x: 150,
            y: this.height / 2,
            width: 34,
            height: 24,
            velocity: 0,
            gravity: 0.25, // Reduced from 0.5 for easier control
            jump: -6,      // Reduced from -10 for easier control
            frame: 0,
            frameTimer: 0
        };

        this.pipes = [];
        this.pipeWidth = 52;
        this.pipeGap = 150;
        this.pipeSpeed = 3;
        this.pipeInterval = 90;
        this.frameCount = 0;

        this.score = 0;
        this.gameOver = false;
        this.gameOver = false;
        this.isRunning = false;
        this.countdown = 0; // New countdown state
        this.animationId = null;

        this.baseY = this.height - 112;
        this.baseX = 0;

        // Load sprites
        this.sprites = {};
        this.spritesLoaded = 0;
        this.totalSprites = 7;
        this.loadSprites();

        this.bindControls();
    }

    loadSprites() {
        const spritesToLoad = {
            bg: './js/games/flappy-bird-sprites/background-day.png',
            base: './js/games/flappy-bird-sprites/base.png',
            bird0: './js/games/flappy-bird-sprites/yellowbird-upflap.png',
            bird1: './js/games/flappy-bird-sprites/yellowbird-midflap.png',
            bird2: './js/games/flappy-bird-sprites/yellowbird-downflap.png',
            pipe: './js/games/flappy-bird-sprites/pipe-green.png',
            gameover: './js/games/flappy-bird-sprites/gameover.png'
        };

        for (const [key, src] of Object.entries(spritesToLoad)) {
            const img = new Image();
            img.onload = () => {
                this.spritesLoaded++;
            };
            img.onerror = () => {
                console.error(`Failed to load sprite: ${src}`);
                this.spritesLoaded++;
            };
            img.src = src;
            this.sprites[key] = img;
        }
    }

    bindControls() {
        this.clickHandler = () => {
            if (this.isRunning && !this.gameOver && this.countdown <= 0) {
                this.bird.velocity = this.bird.jump;
            }
        };

        this.keyHandler = (e) => {
            if ((e.key === ' ' || e.key === 'ArrowUp') && this.isRunning && !this.gameOver && this.countdown <= 0) {
                this.bird.velocity = this.bird.jump;
                e.preventDefault();
            }
        };

        this.canvas.addEventListener('click', this.clickHandler);
        document.addEventListener('keydown', this.keyHandler);
    }

    start() {
        // Wait for sprites to load
        const checkSprites = setInterval(() => {
            if (this.spritesLoaded >= this.totalSprites) {
                clearInterval(checkSprites);
                this.startCountdown();
            }
        }, 100);
    }

    startCountdown() {
        this.countdown = 3;
        this.isRunning = true;
        this.loop();

        const timer = setInterval(() => {
            this.countdown--;
            if (this.countdown <= 0) {
                clearInterval(timer);
                this.bird.velocity = 0;
            }
        }, 1000);
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.canvas.removeEventListener('click', this.clickHandler);
        document.removeEventListener('keydown', this.keyHandler);
    }

    pause() {
        this.isRunning = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
    }

    resume() {
        this.isRunning = true;
        this.loop();
    }

    loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        this.animationId = requestAnimationFrame(() => this.loop());
    }

    update() {
        if (this.gameOver) return;

        // Countdown hover
        if (this.countdown > 0) {
            this.bird.y = this.height / 2 + Math.sin(Date.now() / 300) * 10;
            this.bird.velocity = 0;

            // Still animate bird wings
            this.bird.frameTimer++;
            if (this.bird.frameTimer > 5) {
                this.bird.frame = (this.bird.frame + 1) % 3;
                this.bird.frameTimer = 0;
            }

            // Scroll base
            this.baseX -= this.pipeSpeed;
            if (this.baseX <= -48) this.baseX = 0;

            return;
        }

        // Bird physics
        this.bird.velocity += this.bird.gravity;
        this.bird.y += this.bird.velocity;

        // Bird animation
        this.bird.frameTimer++;
        if (this.bird.frameTimer > 5) {
            this.bird.frame = (this.bird.frame + 1) % 3;
            this.bird.frameTimer = 0;
        }

        // Scroll base
        this.baseX -= this.pipeSpeed;
        if (this.baseX <= -48) this.baseX = 0;

        // Generate pipes
        this.frameCount++;
        if (this.frameCount % this.pipeInterval === 0) {
            const minHeight = 50;
            const maxHeight = this.baseY - this.pipeGap - 50;
            const topHeight = Math.random() * (maxHeight - minHeight) + minHeight;

            this.pipes.push({
                x: this.width,
                topHeight: topHeight,
                bottomY: topHeight + this.pipeGap,
                scored: false
            });
        }

        // Move and check pipes
        for (let i = this.pipes.length - 1; i >= 0; i--) {
            const pipe = this.pipes[i];
            pipe.x -= this.pipeSpeed;

            // Score
            if (!pipe.scored && pipe.x + this.pipeWidth < this.bird.x) {
                this.score++;
                pipe.scored = true;
            }

            // Collision
            if (
                this.bird.x + this.bird.width > pipe.x &&
                this.bird.x < pipe.x + this.pipeWidth &&
                (this.bird.y < pipe.topHeight || this.bird.y + this.bird.height > pipe.bottomY)
            ) {
                this.endGame();
                return;
            }

            // Remove off-screen pipes
            if (pipe.x + this.pipeWidth < 0) {
                this.pipes.splice(i, 1);
            }
        }

        // Check bounds
        if (this.bird.y + this.bird.height > this.baseY || this.bird.y < 0) {
            this.endGame();
        }
    }

    draw() {
        // Background
        if (this.sprites.bg && this.sprites.bg.complete) {
            this.ctx.drawImage(this.sprites.bg, 0, 0, this.width, this.baseY);
        } else {
            this.ctx.fillStyle = '#4ec0ca';
            this.ctx.fillRect(0, 0, this.width, this.baseY);
        }

        // Pipes
        if (this.sprites.pipe && this.sprites.pipe.complete) {
            this.pipes.forEach(pipe => {
                // Top pipe (flipped)
                this.ctx.save();
                this.ctx.translate(pipe.x + this.pipeWidth / 2, pipe.topHeight);
                this.ctx.rotate(Math.PI);
                this.ctx.drawImage(
                    this.sprites.pipe,
                    -this.pipeWidth / 2,
                    0,
                    this.pipeWidth,
                    pipe.topHeight
                );
                this.ctx.restore();

                // Bottom pipe
                this.ctx.drawImage(
                    this.sprites.pipe,
                    pipe.x,
                    pipe.bottomY,
                    this.pipeWidth,
                    this.baseY - pipe.bottomY
                );
            });
        } else {
            // Fallback rectangles
            this.ctx.fillStyle = '#228B22';
            this.pipes.forEach(pipe => {
                this.ctx.fillRect(pipe.x, 0, this.pipeWidth, pipe.topHeight);
                this.ctx.fillRect(pipe.x, pipe.bottomY, this.pipeWidth, this.baseY - pipe.bottomY);
            });
        }

        // Base
        if (this.sprites.base && this.sprites.base.complete) {
            this.ctx.drawImage(this.sprites.base, this.baseX, this.baseY, 336 * 3, 112);
            this.ctx.drawImage(this.sprites.base, this.baseX + 336 * 3, this.baseY, 336 * 3, 112);
        } else {
            this.ctx.fillStyle = '#ded895';
            this.ctx.fillRect(0, this.baseY, this.width, this.height - this.baseY);
        }

        // Bird
        const birdSprite = this.sprites[`bird${this.bird.frame}`];
        if (birdSprite && birdSprite.complete) {
            this.ctx.save();
            this.ctx.translate(this.bird.x + this.bird.width / 2, this.bird.y + this.bird.height / 2);
            const rotation = Math.min(Math.max(this.bird.velocity * 0.05, -0.5), 0.5);
            this.ctx.rotate(rotation);
            this.ctx.drawImage(
                birdSprite,
                -this.bird.width / 2,
                -this.bird.height / 2,
                this.bird.width,
                this.bird.height
            );
            this.ctx.restore();
        } else {
            this.ctx.fillStyle = '#FFD700';
            this.ctx.fillRect(this.bird.x, this.bird.y, this.bird.width, this.bird.height);
        }

        // Score
        this.ctx.fillStyle = '#fff';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 3;
        this.ctx.font = 'bold 40px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.strokeText(this.score, this.width / 2, 60);
        this.ctx.fillText(this.score, this.width / 2, 60);

        // Countdown
        if (this.countdown > 0) {
            this.ctx.fillStyle = '#fff';
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 4;
            this.ctx.font = 'bold 100px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.strokeText(this.countdown, this.width / 2, this.height / 2);
            this.ctx.fillText(this.countdown, this.width / 2, this.height / 2);

            this.ctx.font = 'bold 30px Arial';
            this.ctx.strokeText("Get Ready!", this.width / 2, this.height / 2 - 80);
            this.ctx.fillText("Get Ready!", this.width / 2, this.height / 2 - 80);
        }
    }

    endGame() {
        this.gameOver = true;
        this.stop();
        alert(`Game Over! Score: ${this.score}`);
        if (this.onGameOver) this.onGameOver(this.score);
    }
}
