// Whack-a-Mole game implementation with delayed angry mole attack and explode on leaving mole
export class WhackAMole {
    constructor(canvas, onGameOver) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onGameOver = onGameOver;
        this.width = canvas.width;
        this.height = canvas.height;

        this.holes = [];
        this.moles = [];
        this.particles = [];
        this.floatingTexts = [];

        this.score = 0;
        this.lives = 3;
        this.maxLives = 3;
        this.initialTime = 60;
        this.timeLeft = this.initialTime;
        this.combo = 0;
        this.gameOver = false;
        this.isRunning = false;
        this.animationId = null;
        this.lastTime = Date.now();
        this.elapsedTime = 0;

        // Difficulty pacing
        this.speedMultiplier = 0.75;
        this.baseSpawnInterval = 1.5;
        this.minSpawnInterval = 0.5;
        this.spawnTimer = 0;
        this.bossSpawnTimer = 10;
        this.bossSpawnInterval = 15;
        this.bossActive = false;
        this.bossActiveDuration = 6;

        // Input tracking
        this.mouseX = 0;
        this.mouseY = 0;
        this.hammer = { x: 0, y: 0, angle: 0, state: 'idle' };

        // Sprite handling
        this.sprites = [];
        this.spritesLoaded = 0;
        this.totalSprites = 45;

        // Grid setup (3x3)
        const cols = 3;
        const rows = 3;
        const holeSize = 160;
        const spacing = 200;
        const gridWidth = (cols - 1) * spacing + holeSize;
        const gridHeight = (rows - 1) * spacing + holeSize;
        const startX = (this.width - gridWidth) / 2 + holeSize / 2;
        const startY = (this.height - gridHeight) / 2 + holeSize / 2;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                this.holes.push({
                    x: startX + c * spacing - holeSize / 2,
                    y: startY + r * spacing - holeSize / 2,
                    size: holeSize
                });
            }
        }

        this.loadSprites();
        this.bindControls();
    }

    loadSprites() {
        for (let i = 0; i < this.totalSprites; i++) {
            const img = new Image();
            const num = String(i).padStart(3, '0');
            img.onload = () => this.spritesLoaded++;
            img.onerror = () => this.spritesLoaded++;
            img.src = `./js/games/whack-a-mol-assets/tile${num}.png`;
            this.sprites[i] = img;
        }
    }

    bindControls() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
            this.hammer.x = this.mouseX;
            this.hammer.y = this.mouseY;
        });

        this.clickHandler = () => {
            if (!this.isRunning || this.gameOver) return;
            // Hammer animation
            this.hammer.state = 'hit';
            this.hammer.angle = -45;
            setTimeout(() => {
                this.hammer.angle = 45;
                setTimeout(() => {
                    this.hammer.state = 'idle';
                    this.hammer.angle = 0;
                }, 100);
            }, 50);

            let hit = false;
            for (let i = this.moles.length - 1; i >= 0; i--) {
                const mole = this.moles[i];
                const hole = this.holes[mole.holeIndex];
                const dx = this.mouseX - (hole.x + hole.size / 2);
                const dy = this.mouseY - (hole.y + hole.size / 2);
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < hole.size / 2) {
                    if (mole.state === 'spawning' || mole.state === 'angry' || mole.state === 'boss_intro' || mole.state === 'boss_active') {
                        this.handleHit(mole);
                        hit = true;
                        break;
                    } else if (mole.state === 'leaving_bomb') {
                        this.defuseBomb(mole);
                        hit = true;
                        break;
                    } else if (mole.state === 'bomb') {
                        this.triggerBomb(mole);
                        hit = true;
                        break;
                    } else if (mole.state === 'leaving') {
                        this.explodeMole(mole);
                        hit = true;
                        break;
                    }
                }
            }
            if (!hit) this.combo = 0;
        };
        this.canvas.addEventListener('mousedown', this.clickHandler);
    }

    // -------------------- Game Logic --------------------
    handleHit(mole) {
        if (mole.type === 'bomb') {
            this.defuseBomb(mole);
            return;
        }
        // Boss multi‑hit
        if (mole.type === 'boss') {
            if (mole.state === 'boss_intro') {
                if (this.lives < this.maxLives) {
                    this.lives++;
                    this.showFloatingText('+1 ❤️', this.width / 2, 70, '#0f0', 1.5);
                }
                mole.state = 'leaving';
                mole.frame = 5;
                mole.timer = 0;
                this.bossActive = false;
                return;
            }
            mole.hp--;
            this.createParticles(this.holes[mole.holeIndex].x + 80, this.holes[mole.holeIndex].y + 80, '#f00', 10);
            if (mole.hp <= 0) this.bossActive = false;
            if (mole.hp > 0) return; // still alive
        }
        // Angry mole – start delayed attack but still grant points
        if (mole.type === 'angry') {
            this.grantHitRewards(mole);
            mole.state = 'pre_attack';
            mole.attackTimer = 0;
            return;
        }
        // Regular hit – award points
        mole.state = 'hit';
        mole.frame = 0;
        mole.timer = 0;
        this.grantHitRewards(mole);
    }

    grantHitRewards(mole) {
        if (mole.scored) return 0;
        let points = mole.type === 'boss' ? 100 : 10;
        this.combo++;
        let multiplier = 1;
        if (this.combo >= 5) multiplier = 2;
        if (this.combo >= 10) multiplier = 3;
        points *= multiplier;
        this.score += points;
        mole.scored = true;
        const hole = this.holes[mole.holeIndex];
        this.showFloatingText(`+${points}`, hole.x + hole.size / 2, hole.y, '#fff');
        this.createParticles(hole.x + hole.size / 2, hole.y + hole.size / 2, '#8B4513', 15);
        return points;
    }

    triggerBomb(mole) {
        this.applyDamage(1);
        this.combo = 0;
        this.shakeScreen(20);
        this.showFloatingText('BOOM!', this.holes[mole.holeIndex].x + 80, this.holes[mole.holeIndex].y, '#f00');
        mole.state = 'gone';
        if (this.lives <= 0) this.endGame();
    }

    defuseBomb(mole) {
        this.grantHitRewards(mole);
        mole.state = 'defused';
        mole.frame = 0;
        mole.timer = 0;
    }

    explodeMole(mole) {
        const points = 20;
        this.score += points;
        const hole = this.holes[mole.holeIndex];
        this.showFloatingText(`+${points}`, hole.x + hole.size / 2, hole.y, '#ff0');
        this.createParticles(hole.x + hole.size / 2, hole.y + hole.size / 2, '#ff0', 15);
        mole.state = 'gone';
    }

    loseLife() {
        this.applyDamage(1);
        this.combo = 0;
        this.shakeScreen(15);
        this.showFloatingText('OUCH!', this.width / 2, this.height / 2, '#f00', 60);
        if (this.lives <= 0) this.endGame();
    }

    applyDamage(amount = 1) {
        const dmg = Math.ceil(amount * (this.bossActive ? 2 : 1));
        this.lives = Math.max(0, this.lives - dmg);
    }

    // -------------------- Game Loop --------------------
    start() {
        const checkSprites = setInterval(() => {
            if (this.spritesLoaded >= 1) {
                clearInterval(checkSprites);
                this.isRunning = true;
                this.lastTime = Date.now();
                this.loop();
            }
        }, 100);
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.canvas.removeEventListener('mousedown', this.clickHandler);
    }

    loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        this.animationId = requestAnimationFrame(() => this.loop());
    }

    update() {
        if (this.gameOver) return;
        const now = Date.now();
        const deltaTime = (now - this.lastTime) / 1000;
        this.lastTime = now;
        this.timeLeft -= deltaTime;
        if (this.timeLeft <= 0) { this.endGame(); return; }

        // Difficulty ramps up over time (faster animations/spawns)
        this.elapsedTime += deltaTime;
        const progress = Math.min(1, this.elapsedTime / this.initialTime);
        this.speedMultiplier = 0.75 + progress * 1.25;

        // Spawn new moles based on interval that shrinks as speed rises
        const spawnInterval = Math.max(this.minSpawnInterval, this.baseSpawnInterval / this.speedMultiplier);
        this.spawnTimer -= deltaTime;
        if (this.spawnTimer <= 0 && this.moles.length < 4) {
            this.spawnMole();
            this.spawnTimer = spawnInterval;
        }
        // Guarantee boss appearances
        this.bossSpawnTimer -= deltaTime;
        if (this.bossSpawnTimer <= 0 && this.moles.length < 4) {
            const spawned = this.spawnMole('boss');
            this.bossSpawnTimer = spawned ? this.bossSpawnInterval : 3;
        }
        // Boss aura makes other threats hit harder

        // Update each mole
        for (let i = this.moles.length - 1; i >= 0; i--) {
            const mole = this.moles[i];
            mole.timer += deltaTime * this.speedMultiplier;
            mole.animTimer += deltaTime * this.speedMultiplier;
            if (mole.animTimer > 0.1) { mole.frame++; mole.animTimer = 0; }

            switch (mole.state) {
                case 'spawning':
                    if (mole.frame > 5) { mole.state = mole.nextState; mole.frame = 0; }
                    break;
                case 'angry':
                    mole.frame = mole.frame % 4; // loop animation
                    if (mole.timer > 2.0) { mole.state = 'leaving'; mole.frame = 5; }
                    break;
                case 'pre_attack':
                    mole.attackTimer += deltaTime * this.speedMultiplier;
                    if (mole.attackTimer >= 0.5) { mole.state = 'attacking'; mole.frame = 0; }
                    break;
                case 'attacking':
                    if (mole.frame > 5) {
                        // Only lose life if mouse is over the mole
                        const hole = this.holes[mole.holeIndex];
                        const dx = this.mouseX - (hole.x + hole.size / 2);
                        const dy = this.mouseY - (hole.y + hole.size / 2);
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < hole.size / 2) {
                            this.loseLife();
                        }
                        mole.state = 'leaving';
                        mole.frame = 5;
                    }
                    break;
                case 'leaving_bomb':
                    if (mole.frame > 5) { mole.state = 'bomb'; mole.frame = 0; mole.timer = 0; }
                    break;
                case 'bomb':
                    mole.frame = 0;
                    if (mole.timer > 3.0) mole.state = 'gone';
                    break;
                case 'defused':
                    if (mole.frame > 2) mole.state = 'gone';
                    break;
                case 'boss_intro':
                    if (mole.frame >= 9) { mole.state = 'boss_active'; mole.frame = 9; mole.timer = 0; this.bossActive = true; }
                    break;
                case 'boss_active':
                    mole.frame = 9;
                    break;
                case 'hit':
                    if (mole.frame > 4) {
                        if (mole.type === 'boss') this.bossActive = false;
                        mole.state = 'gone';
                    }
                    break;
                case 'leaving':
                    mole.frame--;
                    if (mole.frame < 0) {
                        if (mole.type === 'boss') this.bossActive = false;
                        mole.state = 'gone';
                    }
                    break;
            }
            if (mole.state === 'gone') this.moles.splice(i, 1);
        }
        if (!this.moles.some(m => m.type === 'boss')) this.bossActive = false;
        this.updateEffects(deltaTime);
    }

    spawnMole(forceType) {
        const available = this.holes.map((_, i) => i).filter(i => !this.moles.some(m => m.holeIndex === i));
        if (!available.length) return false;
        const bossPresent = this.moles.some(m => m.type === 'boss');
        const holeIndex = available[Math.floor(Math.random() * available.length)];
        const rand = Math.random();
        let type = forceType || 'angry';
        let nextState = 'angry';
        if (type === 'boss') {
            if (bossPresent) return false;
            nextState = 'boss_intro';
        }
        else if (type === 'bomb') nextState = 'leaving_bomb';
        else {
            if (rand < 0.2) { type = 'bomb'; nextState = 'leaving_bomb'; }
            else if (rand < 0.25 && !bossPresent && !this.bossActive) { type = 'boss'; nextState = 'boss_intro'; }
        }
        this.moles.push({
            holeIndex,
            state: 'spawning',
            nextState,
            type,
            frame: 0,
            timer: 0,
            animTimer: 0,
            attackTimer: 0,
            hp: type === 'boss' ? 3 : 1,
            maxHp: type === 'boss' ? 3 : 1,
            scored: false
        });
        if (type === 'boss') this.bossActive = true;
        return true;
    }

    // -------------------- Visuals --------------------
    updateEffects(dt) {
        // particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx; p.y += p.vy; p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        // floating texts
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const t = this.floatingTexts[i];
            t.y -= 1; t.life -= dt;
            if (t.life <= 0) this.floatingTexts.splice(i, 1);
        }
    }

    draw() {
        // screen shake
        this.ctx.save();
        if (this.shakeOffset) {
            this.ctx.translate(Math.random() * this.shakeOffset - this.shakeOffset / 2,
                Math.random() * this.shakeOffset - this.shakeOffset / 2);
            this.shakeOffset *= 0.9;
            if (this.shakeOffset < 0.5) this.shakeOffset = 0;
        }
        // background
        this.ctx.fillStyle = '#90EE90';
        this.ctx.fillRect(0, 0, this.width, this.height);
        // holes
        this.holes.forEach(hole => {
            const sprite = this.sprites[0];
            if (sprite && sprite.complete && sprite.naturalWidth) {
                this.ctx.drawImage(sprite, hole.x, hole.y, hole.size, hole.size);
            } else {
                this.ctx.fillStyle = '#654321';
                this.ctx.beginPath();
                this.ctx.ellipse(hole.x + hole.size / 2, hole.y + hole.size / 2 + 20, 50, 20, 0, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
        // moles
        this.moles.forEach(mole => {
            const hole = this.holes[mole.holeIndex];
            let tileIndex = 0;
            switch (mole.state) {
                case 'spawning': tileIndex = 1 + mole.frame; break;
                case 'leaving': tileIndex = 6 - Math.abs(mole.frame); break;
                case 'angry': tileIndex = 7 + mole.frame; break;
                case 'attacking': tileIndex = 11 + mole.frame; break;
                case 'leaving_bomb': tileIndex = 17 + mole.frame; break;
                case 'bomb': tileIndex = 23; break;
                case 'boss_intro': tileIndex = 24 + mole.frame; break;
                case 'boss_active': tileIndex = 33; break;
                case 'hit': tileIndex = 34 + mole.frame; break;
                case 'defused': tileIndex = 39 + mole.frame; break;
            }
            tileIndex = Math.max(0, Math.min(tileIndex, 44));
            const sprite = this.sprites[tileIndex];
            if (sprite && sprite.complete && sprite.naturalWidth) {
                this.ctx.drawImage(sprite, hole.x, hole.y, hole.size, hole.size);
            } else {
                this.ctx.fillStyle = mole.type === 'bomb' ? '#000' : '#8B4513';
                this.ctx.beginPath();
                this.ctx.arc(hole.x + hole.size / 2, hole.y + hole.size / 2, 40, 0, Math.PI * 2);
                this.ctx.fill();
            }
            if (mole.type === 'boss') {
                const barWidth = hole.size * 0.8;
                const barHeight = 12;
                const barX = hole.x + (hole.size - barWidth) / 2;
                const barY = hole.y - 10;
                const hpRatio = mole.hp / mole.maxHp;
                this.ctx.fillStyle = '#400';
                this.ctx.fillRect(barX, barY, barWidth, barHeight);
                this.ctx.fillStyle = '#0f0';
                this.ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
                this.ctx.strokeStyle = '#222';
                this.ctx.strokeRect(barX, barY, barWidth, barHeight);
            }
        });
        // particles & texts
        this.drawEffects();
        // hammer
        this.ctx.restore();
        this.drawHammer();
        // UI
        this.drawUI();
    }

    drawEffects() {
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1;
        this.floatingTexts.forEach(t => {
            this.ctx.globalAlpha = t.life;
            this.ctx.fillStyle = t.color;
            this.ctx.font = 'bold 24px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(t.text, t.x, t.y);
        });
        this.ctx.globalAlpha = 1;
    }

    drawHammer() {
        this.ctx.save();
        this.ctx.translate(this.hammer.x, this.hammer.y);
        this.ctx.rotate(this.hammer.angle * Math.PI / 180);
        this.ctx.fillStyle = '#8B4513';
        this.ctx.fillRect(-5, 0, 10, 50);
        this.ctx.fillStyle = '#555';
        this.ctx.fillRect(-20, -15, 40, 30);
        this.ctx.restore();
    }

    drawUI() {
        this.ctx.fillStyle = '#000';
        this.ctx.font = 'bold 28px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Score: ${this.score}`, 20, 40);
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`Time: ${Math.ceil(this.timeLeft)}s`, this.width - 20, 40);
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#f00';
        this.ctx.fillText(`Lives: ${'❤️'.repeat(this.lives)}`, this.width / 2, 40);
    }

    createParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1,
                color,
                size: Math.random() * 5 + 2
            });
        }
    }

    showFloatingText(text, x, y, color, life = 1) {
        this.floatingTexts.push({ text, x, y, color, life });
    }

    shakeScreen(amount) { this.shakeOffset = amount; }

    endGame() {
        this.gameOver = true;
        this.stop();
        alert(`Game Over! Final Score: ${this.score}`);
        if (this.onGameOver) this.onGameOver(this.score);
    }
}
