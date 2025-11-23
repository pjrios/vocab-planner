export class Snake {
    constructor(canvas, onGameOver) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onGameOver = onGameOver;
        this.width = canvas.width;
        this.height = canvas.height;

        this.gridSize = 20;
        this.gridSize = 20;
        this.tileCountX = Math.floor(this.width / this.gridSize);
        this.tileCountY = Math.floor(this.height / this.gridSize);

        this.snake = [{ x: 10, y: 10 }];
        this.direction = { x: 1, y: 0 };
        this.nextDirection = { x: 1, y: 0 };

        // Initialize arrays and configs BEFORE calling any methods
        this.specialFood = null;
        this.powerUps = [];
        this.obstacles = [];
        this.obstacleWarnings = []; // New: warnings for upcoming obstacles
        this.obstacleSpawnTimer = 0;
        this.particles = [];

        this.score = 0;
        this.gameOver = false;
        this.speed = 150; // Start slower
        this.baseSpeed = 150;

        this.isRunning = false;
        this.gameLoop = null;

        // Power-up states
        this.invincible = false;
        this.ghostMode = false;
        this.speedBoost = false;
        this.scoreMultiplier = 1;

        // Special food types - MUST be defined before randomFood()
        this.foodTypes = [
            { type: 'normal', color: '#ff6b6b', points: 10, size: 1 },
            { type: 'golden', color: '#ffd93d', points: 50, size: 1.2, rare: 0.85 },
            { type: 'mega', color: '#6c5ce7', points: 25, size: 1.5, grows: 3, rare: 0.9 },
            { type: 'speed', color: '#00b894', points: 15, size: 1, effect: 'speedBoost', rare: 0.92 }
        ];

        // Power-up types
        this.powerUpTypes = [
            { type: 'invincible', color: '#74b9ff', symbol: '◈', duration: 5000 },
            { type: 'ghost', color: '#a29bfe', symbol: '👻', duration: 7000 },
            { type: 'slowmo', color: '#55efc4', symbol: '⏰', duration: 6000 },
            { type: 'multiplier', color: '#fdcb6e', symbol: '×2', duration: 8000 }
        ];

        this.combo = 0;
        this.comboTimer = 0;

        // NOW we can call randomFood() since everything is initialized
        this.foods = [];
        // Spawn 3 initial food items
        for (let i = 0; i < 3; i++) {
            this.foods.push(this.randomFood());
        }

        this.bindControls();
        // Spawn some initial obstacles to make it less empty, but keep center clear
        this.spawnObstacles(5);
    }

    bindControls() {
        this.keyHandler = (e) => {
            if (!this.isRunning) return;

            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    if (this.direction.y === 0) this.nextDirection = { x: 0, y: -1 };
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    if (this.direction.y === 0) this.nextDirection = { x: 0, y: 1 };
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    if (this.direction.x === 0) this.nextDirection = { x: -1, y: 0 };
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    if (this.direction.x === 0) this.nextDirection = { x: 1, y: 0 };
                    break;
            }
            e.preventDefault();
        };

        document.addEventListener('keydown', this.keyHandler);
    }

    randomFood() {
        let food;
        let attempts = 0;
        let foundSpot = false;

        // Try random spots first
        do {
            food = {
                x: Math.floor(Math.random() * this.tileCountX),
                y: Math.floor(Math.random() * this.tileCountY)
            };
            attempts++;
            if (!this.isOccupied(food.x, food.y)) {
                foundSpot = true;
                break;
            }
        } while (attempts < 50);

        // If random failed, scan the grid for a spot
        if (!foundSpot) {
            for (let x = 0; x < this.tileCountX; x++) {
                for (let y = 0; y < this.tileCountY; y++) {
                    if (!this.isOccupied(x, y)) {
                        food = { x, y };
                        foundSpot = true;
                        break;
                    }
                }
                if (foundSpot) break;
            }
        }

        // If grid is completely full (rare), just use 0,0
        if (!foundSpot) food = { x: 0, y: 0 };

        // Randomly assign food type - Iterate BACKWARDS to prioritize rarer items
        const roll = Math.random();
        for (let i = this.foodTypes.length - 1; i >= 0; i--) {
            const foodType = this.foodTypes[i];
            if (foodType.rare && roll > foodType.rare) {
                return { ...food, ...foodType };
            }
        }
        return { ...food, ...this.foodTypes[0] };
    }

    spawnSpecialFood() {
        if (Math.random() < 0.3 && !this.specialFood) {
            const foodType = this.foodTypes[Math.floor(Math.random() * (this.foodTypes.length - 1)) + 1];
            let pos;
            do {
                pos = {
                    x: Math.floor(Math.random() * this.tileCountX),
                    y: Math.floor(Math.random() * this.tileCountY)
                };
            } while (this.isOccupied(pos.x, pos.y));

            this.specialFood = { ...pos, ...foodType, timer: 150 };
        }
    }

    spawnPowerUp() {
        if (Math.random() < 0.2) {
            const powerUpType = this.powerUpTypes[Math.floor(Math.random() * this.powerUpTypes.length)];
            let pos;
            do {
                pos = {
                    x: Math.floor(Math.random() * this.tileCountX),
                    y: Math.floor(Math.random() * this.tileCountY)
                };
            } while (this.isOccupied(pos.x, pos.y));

            this.powerUps.push({ ...pos, ...powerUpType, timer: 120 });
        }
    }

    spawnObstacles(count) {
        for (let i = 0; i < count; i++) {
            let pos;
            let attempts = 0;
            do {
                pos = {
                    x: Math.floor(Math.random() * this.tileCountX),
                    y: Math.floor(Math.random() * this.tileCountY)
                };
                attempts++;
                if (attempts > 100) break;
            } while (this.isOccupied(pos.x, pos.y) ||
                (Math.abs(pos.x - this.snake[0].x) < 5 && Math.abs(pos.y - this.snake[0].y) < 5)); // Keep start area clear

            this.obstacles.push(pos);
        }
    }

    scheduleObstacleSpawn() {
        // Schedule a new obstacle to appear after warning
        if (this.obstacles.length >= 15) return; // Max obstacles

        let pos;
        let attempts = 0;
        do {
            pos = {
                x: Math.floor(Math.random() * this.tileCountX),
                y: Math.floor(Math.random() * this.tileCountY)
            };
            attempts++;
            if (attempts > 100) return; // Safety
        } while (this.isOccupied(pos.x, pos.y) ||
        this.obstacleWarnings.some(w => w.x === pos.x && w.y === pos.y) ||
            (Math.abs(pos.x - this.snake[0].x) < 3 && Math.abs(pos.y - this.snake[0].y) < 3)); // Not too close to snake

        // Add warning that will become obstacle after 3 seconds
        this.obstacleWarnings.push({
            x: pos.x,
            y: pos.y,
            timer: 180 // 3 seconds at 60 updates/sec (approx)
        });
    }

    isOccupied(x, y) {
        return this.snake.some(s => s.x === x && s.y === y) ||
            (this.foods && this.foods.some(f => f.x === x && f.y === y)) ||
            (this.specialFood && this.specialFood.x === x && this.specialFood.y === y) ||
            this.obstacles.some(o => o.x === x && o.y === y) ||
            this.powerUps.some(p => p.x === x && p.y === y);
    }

    applyPowerUp(powerUp) {
        switch (powerUp.type) {
            case 'invincible':
                this.invincible = true;
                setTimeout(() => { if (this.isRunning) this.invincible = false; }, powerUp.duration);
                break;
            case 'ghost':
                this.ghostMode = true;
                setTimeout(() => { if (this.isRunning) this.ghostMode = false; }, powerUp.duration);
                break;
            case 'slowmo':
                this.speed = this.baseSpeed * 1.5;
                clearInterval(this.gameLoop);
                this.gameLoop = setInterval(() => this.update(), this.speed);
                setTimeout(() => {
                    if (this.isRunning) {
                        this.speed = this.baseSpeed;
                        clearInterval(this.gameLoop);
                        this.gameLoop = setInterval(() => this.update(), this.speed);
                    }
                }, powerUp.duration);
                break;
            case 'multiplier':
                this.scoreMultiplier = 2;
                setTimeout(() => { if (this.isRunning) this.scoreMultiplier = 1; }, powerUp.duration);
                break;
        }
    }

    createParticles(x, y, color, count = 8) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const speed = 2 + Math.random() * 2;
            this.particles.push({
                x: x * this.gridSize + this.gridSize / 2,
                y: y * this.gridSize + this.gridSize / 2,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                color: color,
                size: 3 + Math.random() * 3
            });
        }
    }

    start() {
        this.isRunning = true;
        this.gameLoop = setInterval(() => this.update(), this.speed);
    }

    stop() {
        this.isRunning = false;
        if (this.gameLoop) clearInterval(this.gameLoop);
        document.removeEventListener('keydown', this.keyHandler);
    }

    pause() {
        this.isRunning = false;
        if (this.gameLoop) clearInterval(this.gameLoop);
    }

    resume() {
        this.isRunning = true;
        this.gameLoop = setInterval(() => this.update(), this.speed);
    }

    update() {
        if (this.gameOver || !this.isRunning) return;

        this.direction = this.nextDirection;

        const head = {
            x: this.snake[0].x + this.direction.x,
            y: this.snake[0].y + this.direction.y
        };

        // Wall collision - ALWAYS wrap to opposite side
        if (head.x < 0) head.x = this.tileCountX - 1;
        if (head.x >= this.tileCountX) head.x = 0;
        if (head.y < 0) head.y = this.tileCountY - 1;
        if (head.y >= this.tileCountY) head.y = 0;

        // Self collision
        if (!this.invincible && this.snake.some(segment => segment.x === head.x && segment.y === head.y)) {
            this.endGame();
            return;
        }

        // Obstacle collision (ghost mode lets you pass through obstacles too)
        if (!this.invincible && !this.ghostMode && this.obstacles.some(o => o.x === head.x && o.y === head.y)) {
            this.endGame();
            return;
        }

        this.snake.unshift(head);

        // Food collision
        let ateFood = false;
        let foodIndex = -1;

        // Check collision with any food
        if (this.foods) {
            for (let i = 0; i < this.foods.length; i++) {
                if (head.x === this.foods[i].x && head.y === this.foods[i].y) {
                    foodIndex = i;
                    break;
                }
            }
        }

        if (foodIndex !== -1) {
            const food = this.foods[foodIndex];
            const points = food.points * this.scoreMultiplier * (1 + this.combo * 0.1);
            this.score += Math.floor(points);
            this.combo++;
            this.comboTimer = 30;

            this.createParticles(food.x, food.y, food.color, 12);

            if (food.effect === 'speedBoost') {
                this.baseSpeed = Math.max(50, this.baseSpeed - 5);
                clearInterval(this.gameLoop);
                this.gameLoop = setInterval(() => this.update(), this.baseSpeed);
            }

            // Grow snake
            const growAmount = food.grows || 1;
            for (let i = 1; i < growAmount; i++) {
                this.snake.push({ ...this.snake[this.snake.length - 1] });
            }

            // Replace eaten food
            this.foods.splice(foodIndex, 1);
            this.foods.push(this.randomFood());

            this.spawnSpecialFood();
            this.spawnPowerUp();

            // Spawn obstacles progressively - FASTER NOW
            this.obstacleSpawnTimer++;
            if (this.obstacleSpawnTimer >= 5) { // Every 5 food items (was 10)
                this.scheduleObstacleSpawn();
                this.obstacleSpawnTimer = 0;
            }

            ateFood = true;
        }

        // Special food collision
        if (this.specialFood && head.x === this.specialFood.x && head.y === this.specialFood.y) {
            const points = this.specialFood.points * this.scoreMultiplier * (1 + this.combo * 0.1);
            this.score += Math.floor(points);
            this.combo += 2;
            this.comboTimer = 30;

            this.createParticles(this.specialFood.x, this.specialFood.y, this.specialFood.color, 15);

            if (this.specialFood.effect === 'speedBoost') {
                this.baseSpeed = Math.max(50, this.baseSpeed - 5);
                clearInterval(this.gameLoop);
                this.gameLoop = setInterval(() => this.update(), this.baseSpeed);
            }

            const growAmount = this.specialFood.grows || 1;
            for (let i = 1; i < growAmount; i++) {
                this.snake.push({ ...this.snake[this.snake.length - 1] });
            }

            this.specialFood = null;
            ateFood = true;
        }

        // Power-up collision
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.powerUps[i];
            if (head.x === powerUp.x && head.y === powerUp.y) {
                this.applyPowerUp(powerUp);
                this.createParticles(powerUp.x, powerUp.y, powerUp.color, 10);
                this.score += 20 * this.scoreMultiplier;
                this.powerUps.splice(i, 1);
            }
        }

        if (!ateFood) {
            this.snake.pop();
        }

        // Update special food timer
        if (this.specialFood) {
            this.specialFood.timer--;
            if (this.specialFood.timer <= 0) {
                this.specialFood = null;
            }
        }

        // Update power-up timers
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            this.powerUps[i].timer--;
            if (this.powerUps[i].timer <= 0) {
                this.powerUps.splice(i, 1);
            }
        }

        // Update combo
        if (this.comboTimer > 0) {
            this.comboTimer--;
        } else if (this.combo > 0) {
            this.combo = 0;
        }

        // Update obstacle warnings
        for (let i = this.obstacleWarnings.length - 1; i >= 0; i--) {
            this.obstacleWarnings[i].timer--;
            if (this.obstacleWarnings[i].timer <= 0) {
                // Warning expired - create actual obstacle
                const warning = this.obstacleWarnings[i];
                this.obstacles.push({ x: warning.x, y: warning.y });
                this.obstacleWarnings.splice(i, 1);
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        this.draw();
    }

    draw() {
        // Clear canvas with gradient background
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#0f172a');
        gradient.addColorStop(1, '#1e293b');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw subtle grid
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        this.ctx.lineWidth = 1;
        for (let i = 0; i < this.tileCountX; i++) {
            for (let j = 0; j < this.tileCountY; j++) {
                this.ctx.strokeRect(i * this.gridSize, j * this.gridSize, this.gridSize, this.gridSize);
            }
        }

        // Draw particles
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1;

        // Draw obstacle warnings (pulsing)
        this.obstacleWarnings.forEach(warning => {
            const opacity = 0.3 + Math.sin(Date.now() / 100) * 0.3;
            this.ctx.fillStyle = `rgba(239, 68, 68, ${opacity})`; // Red pulse
            this.ctx.fillRect(
                warning.x * this.gridSize,
                warning.y * this.gridSize,
                this.gridSize,
                this.gridSize
            );

            // Warning symbol
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('!',
                warning.x * this.gridSize + this.gridSize / 2,
                warning.y * this.gridSize + this.gridSize / 2
            );
        });

        // Obstacles
        this.obstacles.forEach(obstacle => {
            this.ctx.fillStyle = '#64748b';
            this.ctx.fillRect(
                obstacle.x * this.gridSize + 2,
                obstacle.y * this.gridSize + 2,
                this.gridSize - 4,
                this.gridSize - 4
            );
            this.ctx.strokeStyle = '#94a3b8';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(
                obstacle.x * this.gridSize + 2,
                obstacle.y * this.gridSize + 2,
                this.gridSize - 4,
                this.gridSize - 4
            );
        });

        // Draw ALL foods
        if (this.foods && this.foods.length > 0) {
            this.foods.forEach(food => {
                this.ctx.fillStyle = food.color;
                this.ctx.shadowColor = food.color;
                this.ctx.shadowBlur = 15;

                const pulse = 1 + Math.sin(Date.now() / 200) * 0.2;
                const size = this.gridSize * food.size * pulse;

                this.ctx.beginPath();
                this.ctx.arc(
                    food.x * this.gridSize + this.gridSize / 2,
                    food.y * this.gridSize + this.gridSize / 2,
                    size / 2,
                    0,
                    Math.PI * 2
                );
                this.ctx.fill();
            });
        }
        this.ctx.shadowBlur = 0;

        // Special food
        if (this.specialFood) {
            const specialPulse = Math.sin(Date.now() / 100) * 3 + 3;

            this.ctx.fillStyle = this.specialFood.color;
            this.ctx.shadowColor = this.specialFood.color;
            this.ctx.shadowBlur = 15;
            this.ctx.beginPath();
            const specialSize = (this.gridSize / 2) * (this.specialFood.size || 1) + specialPulse;
            this.ctx.arc(
                this.specialFood.x * this.gridSize + this.gridSize / 2,
                this.specialFood.y * this.gridSize + this.gridSize / 2,
                specialSize,
                0,
                Math.PI * 2
            );
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }

        // Power-ups
        this.powerUps.forEach(powerUp => {
            const rotation = Date.now() / 500;
            this.ctx.save();
            this.ctx.translate(
                powerUp.x * this.gridSize + this.gridSize / 2,
                powerUp.y * this.gridSize + this.gridSize / 2
            );
            this.ctx.rotate(rotation);

            this.ctx.fillStyle = powerUp.color;
            this.ctx.shadowColor = powerUp.color;
            this.ctx.shadowBlur = 10;
            this.ctx.fillRect(-8, -8, 16, 16);

            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(powerUp.symbol, 0, 4);

            this.ctx.restore();
        });

        // Draw snake with gradient and effects
        this.snake.forEach((segment, index) => {
            const isHead = index === 0;
            const alpha = this.invincible ? 0.5 + Math.sin(Date.now() / 100) * 0.5 : 1;
            const ghostAlpha = this.ghostMode ? 0.5 : 1;

            this.ctx.globalAlpha = alpha * ghostAlpha;

            // Body gradient
            const segmentGradient = this.ctx.createLinearGradient(
                segment.x * this.gridSize,
                segment.y * this.gridSize,
                segment.x * this.gridSize + this.gridSize,
                segment.y * this.gridSize + this.gridSize
            );

            if (isHead) {
                segmentGradient.addColorStop(0, this.invincible ? '#fbbf24' : '#22d3ee');
                segmentGradient.addColorStop(1, this.invincible ? '#f59e0b' : '#0ea5e9');
            } else {
                const bodyAlpha = 1 - (index / this.snake.length) * 0.5;
                segmentGradient.addColorStop(0, `rgba(34, 211, 238, ${bodyAlpha})`);
                segmentGradient.addColorStop(1, `rgba(14, 165, 233, ${bodyAlpha})`);
            }

            this.ctx.fillStyle = segmentGradient;

            // Rounded rectangle
            const x = segment.x * this.gridSize + 2;
            const y = segment.y * this.gridSize + 2;
            const w = this.gridSize - 4;
            const h = this.gridSize - 4;
            const radius = 4;

            this.ctx.beginPath();
            this.ctx.moveTo(x + radius, y);
            this.ctx.lineTo(x + w - radius, y);
            this.ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            this.ctx.lineTo(x + w, y + h - radius);
            this.ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
            this.ctx.lineTo(x + radius, y + h);
            this.ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
            this.ctx.lineTo(x, y + radius);
            this.ctx.quadraticCurveTo(x, y, x + radius, y);
            this.ctx.closePath();
            this.ctx.fill();

            // Head eyes
            if (isHead) {
                this.ctx.fillStyle = '#fff';
                const eyeSize = 2;
                let eyeOffsetX = 0, eyeOffsetY = 0;

                if (this.direction.x === 1) {
                    eyeOffsetX = 4; eyeOffsetY = 0;
                } else if (this.direction.x === -1) {
                    eyeOffsetX = -4; eyeOffsetY = 0;
                } else if (this.direction.y === 1) {
                    eyeOffsetX = 0; eyeOffsetY = 4;
                } else if (this.direction.y === -1) {
                    eyeOffsetX = 0; eyeOffsetY = -4;
                }

                this.ctx.beginPath();
                this.ctx.arc(x + w / 2 - 3 + eyeOffsetX, y + h / 2 - 2 + eyeOffsetY, eyeSize, 0, Math.PI * 2);
                this.ctx.arc(x + w / 2 + 3 + eyeOffsetX, y + h / 2 - 2 + eyeOffsetY, eyeSize, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
        this.ctx.globalAlpha = 1;

        // Draw score with glow effect
        this.ctx.shadowColor = 'rgba(34, 211, 238, 0.5)';
        this.ctx.shadowBlur = 10;
        this.ctx.fillStyle = '#22d3ee';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText(`Score: ${this.score}`, 15, 35);

        if (this.combo > 0) {
            this.ctx.fillStyle = '#fbbf24';
            this.ctx.shadowColor = '#fbbf24';
            this.ctx.fillText(`×${this.combo} Combo!`, 15, 65);
        }

        this.ctx.font = 'bold 18px Arial';
        this.ctx.fillText(`Length: ${this.snake.length}`, 15, this.combo > 0 ? 90 : 60);

        // Active power-ups indicator
        let statusY = this.height - 20;
        if (this.invincible) {
            this.ctx.fillStyle = '#74b9ff';
            this.ctx.fillText('◈ INVINCIBLE', this.width - 150, statusY);
            statusY -= 25;
        }
        if (this.ghostMode) {
            this.ctx.fillStyle = '#a29bfe';
            this.ctx.fillText('👻 GHOST MODE', this.width - 150, statusY);
            statusY -= 25;
        }
        if (this.scoreMultiplier > 1) {
            this.ctx.fillStyle = '#fdcb6e';
            this.ctx.fillText('×2 MULTIPLIER', this.width - 150, statusY);
        }

        this.ctx.shadowBlur = 0;
    }

    endGame() {
        this.gameOver = true;
        this.stop();
        alert(`Game Over! Final Score: ${this.score}\nLength: ${this.snake.length}`);
        if (this.onGameOver) this.onGameOver(this.score);
    }
}
