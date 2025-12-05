export class SpaceInvaders {
    constructor(canvas, onGameOver) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onGameOver = onGameOver;
        this.width = canvas.width;
        this.height = canvas.height;

        this.player = {
            x: this.width / 2 - 25,
            y: this.height - 60,
            width: 50,
            height: 30,
            speed: 5,
            shield: false,
            spreadShot: false,
            doubleSpeed: false
        };

        this.bullets = [];
        this.aliens = [];
        this.alienBullets = [];
        this.particles = [];

        this.alienRows = 5;
        this.alienCols = 9;
        this.alienWidth = 40;
        this.alienHeight = 30;
        this.alienSpeed = 1;
        this.alienDirection = 1;
        this.formationPattern = 0; // Changes each wave

        this.score = 0;
        this.combo = 1;
        this.comboTimer = 0;
        this.lives = 3;
        this.gameOver = false;
        this.isRunning = false;
        this.animationId = null;
        this.wave = 1;

        this.keys = {};
        this.shootCooldown = 0;
        this.alienShootTimer = 0;
        this.alienFrame = 0;
        this.alienAnimTimer = 0;

        // Power-ups
        this.pickups = [];
        this.pickupPulse = 0;

        // Power-up types with enhanced visuals
        this.powerUpTypes = [
            { name: 'extraLife', color: '#e74c3c', symbol: '♥', glow: '#ff6b6b' },
            { name: 'scoreBonus', color: '#f1c40f', symbol: '★', glow: '#ffd93d' },
            { name: 'rapidFire', color: '#9b59b6', symbol: '⚡', glow: '#c56cf0' },
            { name: 'shield', color: '#3498db', symbol: '◈', glow: '#74b9ff' },
            { name: 'spreadShot', color: '#e67e22', symbol: '◆', glow: '#ff9f43' },
            { name: 'slowMotion', color: '#1abc9c', symbol: '⏰', glow: '#55efc4' }
        ];

        // Alien types with different properties
        this.alienTypes = [
            { color: '#ff6b9d', points: 10, speed: 1, health: 1, shape: 'basic' },
            { color: '#4ecdc4', points: 20, speed: 1.2, health: 1, shape: 'fast' },
            { color: '#ffe66d', points: 15, speed: 0.8, health: 2, shape: 'tank' },
            { color: '#a29bfe', points: 25, speed: 1.5, health: 1, shape: 'scout' },
            { color: '#fd79a8', points: 50, speed: 0.5, health: 3, shape: 'boss' }
        ];

        this.initAliens();
        this.bindControls();
    }

    initAliens() {
        this.aliens = [];
        const pattern = this.formationPattern % 4;

        for (let row = 0; row < this.alienRows; row++) {
            for (let col = 0; col < this.alienCols; col++) {
                let x, y;
                const offsetX = (this.width - (this.alienCols * (this.alienWidth + 10))) / 2;

                // Different formation patterns
                switch (pattern) {
                    case 0: // Standard grid
                        x = offsetX + col * (this.alienWidth + 10);
                        y = 50 + row * (this.alienHeight + 10);
                        break;
                    case 1: // V-shape
                        const vOffset = Math.abs(col - this.alienCols / 2) * 15;
                        x = offsetX + col * (this.alienWidth + 10);
                        y = 50 + row * (this.alienHeight + 10) + vOffset;
                        break;
                    case 2: // Wave pattern
                        const waveOffset = Math.sin(col * 0.5) * 20;
                        x = offsetX + col * (this.alienWidth + 10);
                        y = 50 + row * (this.alienHeight + 10) + waveOffset;
                        break;
                    case 3: // Diamond
                        const centerCol = this.alienCols / 2;
                        const diamondOffset = Math.abs(col - centerCol) * 10;
                        x = offsetX + col * (this.alienWidth + 10);
                        y = 50 + row * (this.alienHeight + 10) - diamondOffset;
                        break;
                }

                // Vary alien types by row
                let typeIndex = Math.min(Math.floor(row / 2), this.alienTypes.length - 2);
                // Occasionally spawn a boss
                if (Math.random() < 0.05 && row > 0) typeIndex = 4;

                const type = this.alienTypes[typeIndex];
                this.aliens.push({
                    x, y,
                    width: this.alienWidth,
                    height: this.alienHeight,
                    alive: true,
                    health: type.health,
                    maxHealth: type.health,
                    type: typeIndex,
                    wobble: Math.random() * Math.PI * 2
                });
            }
        }
    }

    bindControls() {
        this.keyDownHandler = (e) => {
            this.keys[e.key] = true;
            if (e.key === ' ') e.preventDefault();
        };

        this.keyUpHandler = (e) => {
            this.keys[e.key] = false;
        };

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

    createExplosion(x, y, color) {
        for (let i = 0; i < 15; i++) {
            const angle = (Math.PI * 2 * i) / 15;
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

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1; // Gravity
            p.life -= 0.02;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    update() {
        if (this.gameOver) return;

        this.pickupPulse += 0.1;

        // Combo timer
        if (this.comboTimer > 0) {
            this.comboTimer--;
        } else if (this.combo > 1) {
            this.combo = 1;
        }

        // Alien animation
        this.alienAnimTimer++;
        if (this.alienAnimTimer > 30) {
            this.alienFrame = 1 - this.alienFrame;
            this.alienAnimTimer = 0;
        }

        // Update alien wobble
        this.aliens.forEach(a => { if (a.alive) a.wobble += 0.05; });

        // Player movement
        const speed = this.player.doubleSpeed ? this.player.speed * 2 : this.player.speed;
        if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) {
            this.player.x = Math.max(0, this.player.x - speed);
        }
        if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) {
            this.player.x = Math.min(this.width - this.player.width, this.player.x + speed);
        }

        // Player shooting
        this.shootCooldown--;
        if ((this.keys[' '] || this.keys['ArrowUp']) && this.shootCooldown <= 0) {
            const cooldown = this.player.spreadShot || this.player.rapidFire ? 8 : 15;

            if (this.player.spreadShot) {
                // Fire 3 bullets
                for (let i = -1; i <= 1; i++) {
                    this.bullets.push({
                        x: this.player.x + this.player.width / 2 - 2,
                        y: this.player.y,
                        width: 4,
                        height: 12,
                        speed: 7,
                        angle: i * 0.3
                    });
                }
            } else {
                this.bullets.push({
                    x: this.player.x + this.player.width / 2 - 2,
                    y: this.player.y,
                    width: 4,
                    height: 12,
                    speed: 7,
                    angle: 0
                });
            }
            this.shootCooldown = cooldown;
        }

        // Move bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.y -= bullet.speed;
            bullet.x += bullet.speed * Math.sin(bullet.angle);
            if (bullet.y < 0 || bullet.x < 0 || bullet.x > this.width) {
                this.bullets.splice(i, 1);
            }
        }

        // Move aliens
        let hitEdge = false;
        this.aliens.forEach(alien => {
            if (!alien.alive) return;
            const alienType = this.alienTypes[alien.type];
            alien.x += this.alienSpeed * this.alienDirection * alienType.speed;
            if (alien.x <= 0 || alien.x + alien.width >= this.width) {
                hitEdge = true;
            }
        });

        if (hitEdge) {
            this.alienDirection *= -1;
            this.aliens.forEach(alien => {
                if (alien.alive) alien.y += 20;
            });
        }

        // Alien shooting
        this.alienShootTimer++;
        if (this.alienShootTimer > 60) {
            const aliveAliens = this.aliens.filter(a => a.alive);
            if (aliveAliens.length > 0) {
                const shooter = aliveAliens[Math.floor(Math.random() * aliveAliens.length)];
                this.alienBullets.push({
                    x: shooter.x + shooter.width / 2 - 2,
                    y: shooter.y + shooter.height,
                    width: 4,
                    height: 12,
                    speed: 3
                });
            }
            this.alienShootTimer = 0;
        }

        // Move alien bullets
        for (let i = this.alienBullets.length - 1; i >= 0; i--) {
            this.alienBullets[i].y += this.alienBullets[i].speed;

            // Hit player
            if (this.checkCollision(this.alienBullets[i], this.player)) {
                this.alienBullets.splice(i, 1);

                if (this.player.shield) {
                    this.player.shield = false; // Shield absorbed hit
                } else {
                    this.lives--;
                    this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#4ecdc4');
                    if (this.lives <= 0) {
                        this.endGame();
                        return;
                    }
                }
                continue;
            }

            if (this.alienBullets[i].y > this.height) {
                this.alienBullets.splice(i, 1);
            }
        }

        // Check bullet collisions with aliens
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            for (let j = 0; j < this.aliens.length; j++) {
                if (this.aliens[j].alive && this.checkCollision(this.bullets[i], this.aliens[j])) {
                    const alien = this.aliens[j];
                    alien.health--;

                    if (alien.health <= 0) {
                        alien.alive = false;
                        const alienType = this.alienTypes[alien.type];
                        this.score += alienType.points * this.combo;
                        this.combo = Math.min(this.combo + 0.5, 5);
                        this.comboTimer = 120;

                        this.createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alienType.color);

                        // 30% chance to drop a power-up
                        if (Math.random() < 0.3) {
                            const powerUp = this.powerUpTypes[Math.floor(Math.random() * this.powerUpTypes.length)];
                            this.pickups.push({
                                x: alien.x + alien.width / 2 - 20,
                                y: alien.y,
                                width: 40,
                                height: 40,
                                speed: 1.5,
                                rotation: 0,
                                ...powerUp
                            });
                        }
                    }

                    this.bullets.splice(i, 1);
                    break;
                }
            }
        }

        // Move pickups and check collection
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const pickup = this.pickups[i];
            pickup.y += pickup.speed;
            pickup.rotation += 0.1;

            if (this.checkCollision(pickup, this.player)) {
                this.applyPickup(pickup.name);
                this.createExplosion(pickup.x + 20, pickup.y + 20, pickup.color);
                this.pickups.splice(i, 1);
                continue;
            }

            if (pickup.y > this.height) {
                this.pickups.splice(i, 1);
            }
        }

        // Update particles
        this.updateParticles();

        // Check if all aliens dead
        if (this.aliens.every(a => !a.alive)) {
            this.wave++;
            this.formationPattern++;
            this.score += 100 * this.wave;
            this.initAliens();
            this.alienSpeed += 0.3;
        }

        // Check if aliens reached player
        if (this.aliens.some(a => a.alive && a.y + a.height >= this.player.y)) {
            this.endGame();
        }
    }

    applyPickup(type) {
        switch (type) {
            case 'extraLife':
                this.lives++;
                break;
            case 'scoreBonus':
                this.score += 100 * this.combo;
                break;
            case 'rapidFire':
                this.player.rapidFire = true;
                setTimeout(() => { if (this.isRunning) this.player.rapidFire = false; }, 8000);
                break;
            case 'shield':
                this.player.shield = true;
                break;
            case 'spreadShot':
                this.player.spreadShot = true;
                setTimeout(() => { if (this.isRunning) this.player.spreadShot = false; }, 10000);
                break;
            case 'slowMotion':
                this.player.doubleSpeed = true;
                setTimeout(() => { if (this.isRunning) this.player.doubleSpeed = false; }, 6000);
                break;
        }
    }

    checkCollision(a, b) {
        return a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y;
    }

    drawAlien(alien) {
        const alienType = this.alienTypes[alien.type];
        const wobbleOffset = Math.sin(alien.wobble) * 2;

        // Health bar for damaged aliens
        if (alien.health < alien.maxHealth) {
            const barWidth = 30;
            const healthPercent = alien.health / alien.maxHealth;
            this.ctx.fillStyle = '#2c3e50';
            this.ctx.fillRect(alien.x + 5, alien.y - 8, barWidth, 3);
            this.ctx.fillStyle = '#e74c3c';
            this.ctx.fillRect(alien.x + 5, alien.y - 8, barWidth * healthPercent, 3);
        }

        // Body (varies by type)
        this.ctx.fillStyle = alienType.color;

        if (alienType.shape === 'boss') {
            // Larger boss shape
            this.ctx.fillRect(alien.x, alien.y + 5, alien.width, alien.height - 10);
            this.ctx.fillRect(alien.x + 5, alien.y, alien.width - 10, alien.height);
        } else if (alienType.shape === 'scout') {
            // Diamond shape
            this.ctx.beginPath();
            this.ctx.moveTo(alien.x + alien.width / 2, alien.y);
            this.ctx.lineTo(alien.x + alien.width, alien.y + alien.height / 2);
            this.ctx.lineTo(alien.x + alien.width / 2, alien.y + alien.height);
            this.ctx.lineTo(alien.x, alien.y + alien.height / 2);
            this.ctx.closePath();
            this.ctx.fill();
        } else {
            // Standard shape
            this.ctx.fillRect(alien.x + 5, alien.y + 10 + wobbleOffset, alien.width - 10, alien.height - 15);

            // Antenna
            const antennaOffset = this.alienFrame * 3;
            this.ctx.fillRect(alien.x + 10, alien.y + 5 - antennaOffset, 3, 8);
            this.ctx.fillRect(alien.x + alien.width - 13, alien.y + 5 - antennaOffset, 3, 8);

            // Eyes
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(alien.x + 12, alien.y + 15, 6, 6);
            this.ctx.fillRect(alien.x + alien.width - 18, alien.y + 15, 6, 6);

            // Legs
            const legOffset = this.alienFrame * 2;
            this.ctx.fillStyle = alienType.color;
            this.ctx.fillRect(alien.x + 8 - legOffset, alien.y + alien.height - 5, 4, 5);
            this.ctx.fillRect(alien.x + alien.width - 12 + legOffset, alien.y + alien.height - 5, 4, 5);
        }
    }

    draw() {
        // Space background
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#0a0e27');
        gradient.addColorStop(1, '#16213e');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Animated stars
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let i = 0; i < 100; i++) {
            const x = (i * 137.5) % this.width;
            const y = (i * 173.7 + this.alienFrame * 2) % this.height;
            const size = (i % 3) + 1;
            const twinkle = Math.sin(Date.now() / 1000 + i) * 0.5 + 0.5;
            this.ctx.globalAlpha = twinkle;
            this.ctx.fillRect(x, y, size, size);
        }
        this.ctx.globalAlpha = 1;

        // Particles
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1;

        // Player ship
        this.ctx.fillStyle = '#4ecdc4';
        this.ctx.beginPath();
        this.ctx.moveTo(this.player.x + this.player.width / 2, this.player.y);
        this.ctx.lineTo(this.player.x, this.player.y + this.player.height);
        this.ctx.lineTo(this.player.x + 10, this.player.y + this.player.height - 5);
        this.ctx.lineTo(this.player.x + this.player.width - 10, this.player.y + this.player.height - 5);
        this.ctx.lineTo(this.player.x + this.player.width, this.player.y + this.player.height);
        this.ctx.closePath();
        this.ctx.fill();

        // Shield visual
        if (this.player.shield) {
            this.ctx.strokeStyle = '#3498db';
            this.ctx.lineWidth = 3;
            this.ctx.globalAlpha = 0.6;
            this.ctx.beginPath();
            this.ctx.arc(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 35, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.globalAlpha = 1;
        }

        // Cockpit
        this.ctx.fillStyle = '#00ffff';
        this.ctx.fillRect(this.player.x + this.player.width / 2 - 4, this.player.y + 8, 8, 8);

        // Aliens
        this.aliens.forEach(alien => {
            if (alien.alive) this.drawAlien(alien);
        });

        // Bullets
        this.ctx.fillStyle = '#00ffff';
        this.ctx.shadowColor = '#00ffff';
        this.ctx.shadowBlur = 10;
        this.bullets.forEach(bullet => {
            this.ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        });
        this.ctx.shadowBlur = 0;

        // Alien bullets
        this.ctx.fillStyle = '#ff4757';
        this.ctx.shadowColor = '#ff4757';
        this.ctx.shadowBlur = 10;
        this.alienBullets.forEach(bullet => {
            this.ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        });
        this.ctx.shadowBlur = 0;

        // Power-ups with enhanced visuals
        this.pickups.forEach(pickup => {
            const pulseSize = Math.sin(this.pickupPulse + pickup.y * 0.01) * 5 + 40;

            // Glow effect
            const gradient = this.ctx.createRadialGradient(
                pickup.x + 20, pickup.y + 20, 0,
                pickup.x + 20, pickup.y + 20, pulseSize / 2
            );
            gradient.addColorStop(0, pickup.glow + '88');
            gradient.addColorStop(1, pickup.glow + '00');
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(pickup.x - 10, pickup.y - 10, 60, 60);

            // Rotating border
            this.ctx.save();
            this.ctx.translate(pickup.x + 20, pickup.y + 20);
            this.ctx.rotate(pickup.rotation);
            this.ctx.strokeStyle = pickup.color;
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(-18, -18, 36, 36);
            this.ctx.restore();

            // Icon
            this.ctx.font = 'bold 30px Arial';
            this.ctx.fillStyle = pickup.color;
            this.ctx.textAlign = 'center';
            this.ctx.shadowColor = pickup.glow;
            this.ctx.shadowBlur = 15;
            this.ctx.fillText(pickup.symbol, pickup.x + 20, pickup.y + 28);
            this.ctx.shadowBlur = 0;
        });

        // UI
        this.ctx.fillStyle = '#4ecdc4';
        this.ctx.font = 'bold 24px "Courier New", monospace';
        this.ctx.textAlign = 'left';
        this.ctx.shadowColor = '#4ecdc4';
        this.ctx.shadowBlur = 10;
        this.ctx.fillText(`SCORE: ${this.score.toString().padStart(6, '0')}`, 15, 35);

        // Combo indicator
        if (this.combo > 1) {
            this.ctx.fillStyle = '#f1c40f';
            this.ctx.shadowColor = '#f1c40f';
            this.ctx.fillText(`x${this.combo.toFixed(1)} COMBO!`, 15, 60);
        }

        // Wave
        this.ctx.fillText(`WAVE: ${this.wave}`, this.width / 2 - 80, 35);
        this.ctx.shadowBlur = 0;

        // Lives - display up to 3 ship icons, then show number for extras
        const maxDisplayLives = Math.min(this.lives, 3);
        const livesStartX = this.width - 140;
        
        this.ctx.fillText(`LIVES:`, this.width - 220, 35);
        
        for (let i = 0; i < maxDisplayLives; i++) {
            this.ctx.fillStyle = '#4ecdc4';
            const lx = livesStartX + i * 25;
            this.ctx.beginPath();
            this.ctx.moveTo(lx + 10, 20);
            this.ctx.lineTo(lx, 35);
            this.ctx.lineTo(lx + 20, 35);
            this.ctx.closePath();
            this.ctx.fill();
        }

        // Show +X if more than 3 lives
        if (this.lives > 3) {
            this.ctx.fillStyle = '#4ecdc4';
            this.ctx.font = 'bold 16px "Courier New", monospace';
            this.ctx.fillText(`+${this.lives - 3}`, livesStartX + maxDisplayLives * 25 + 5, 32);
        }
    }

    endGame() {
        this.gameOver = true;
        this.stop();
        alert(`Game Over! Final Score: ${this.score}\nWave Reached: ${this.wave}`);
        if (this.onGameOver) this.onGameOver(this.score);
    }
}
