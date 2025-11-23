export class TargetShooter {
    constructor(canvas, onGameOver) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onGameOver = onGameOver;
        this.width = canvas.width;
        this.height = canvas.height;

        this.targets = [];
        this.particles = [];
        this.floatingTexts = [];

        this.score = 0;
        this.misses = 0;
        this.maxMisses = 10;
        this.timeLeft = 90; // Increased to 90s for warm-up

        this.combo = 0;
        this.maxCombo = 0;

        this.spawnTimer = 0;
        this.spawnInterval = 60; // Frames
        this.difficultyMultiplier = 1;

        this.gameOver = false;
        this.isRunning = false;
        this.animationId = null;

        // Special states
        this.frozen = false;
        this.frozenTimer = 0;

        this.targetTypes = {
            normal: { color: '#ef4444', radius: 30, points: 10, speed: 2, weight: 65 },
            golden: { color: '#fbbf24', radius: 20, points: 50, speed: 5, weight: 10 },
            bomb: { color: '#1e293b', radius: 35, points: -20, speed: 1, weight: 10, isBomb: true },
            time: { color: '#3b82f6', radius: 25, points: 5, speed: 3, weight: 5, effect: 'time' },
            freeze: { color: '#06b6d4', radius: 25, points: 5, speed: 3, weight: 5, effect: 'freeze' },
            accuracy: { color: '#10b981', radius: 28, points: 5, speed: 2, weight: 5, effect: 'accuracy' }
        };

        this.bindControls();
    }

    bindControls() {
        this.clickHandler = (e) => {
            if (!this.isRunning || this.gameOver) return;

            const rect = this.canvas.getBoundingClientRect();
            // Handle scaling if canvas is resized via CSS
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;

            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;

            let hit = false;
            // Iterate backwards to hit top targets first
            for (let i = this.targets.length - 1; i >= 0; i--) {
                const t = this.targets[i];
                const dist = Math.sqrt((x - t.x) ** 2 + (y - t.y) ** 2);

                if (dist < t.radius) {
                    this.handleHit(t, i, x, y);
                    hit = true;
                    break;
                }
            }

            if (!hit) {
                this.handleMiss(x, y);
            }
        };

        this.canvas.addEventListener('mousedown', this.clickHandler);
    }

    handleHit(target, index, x, y) {
        this.targets.splice(index, 1);

        if (target.type === 'bomb') {
            this.score += target.points;
            this.combo = 0;
            this.createExplosion(x, y, '#000', 20);
            this.showFloatingText(target.points, x, y, '#ef4444');
            this.misses += 2; // Penalty
            this.shakeScreen();
        } else {
            // Combo logic
            this.combo++;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;

            const multiplier = Math.min(5, 1 + Math.floor(this.combo / 5));
            const points = target.points * multiplier;

            this.score += points;

            // Special effects
            if (target.effect === 'time') {
                this.timeLeft += 35;
                this.showFloatingText('+35s', x, y - 20, '#3b82f6');
            } else if (target.effect === 'freeze') {
                this.frozen = true;
                this.frozenTimer = 180; // 3 seconds
                this.showFloatingText('FREEZE!', x, y - 20, '#06b6d4');
            } else if (target.effect === 'accuracy') {
                this.misses = Math.max(0, this.misses - 3);
                this.showFloatingText('-3 Misses', x, y - 20, '#10b981');
            }

            this.createExplosion(x, y, target.color, 10);
            this.showFloatingText(`+${points}`, x, y, '#fff');
        }

        if (this.misses >= this.maxMisses) this.endGame();
    }

    handleMiss(x, y) {
        this.combo = 0;
        this.misses++;
        this.showFloatingText('MISS', x, y, '#94a3b8');
        if (this.misses >= this.maxMisses) this.endGame();
    }

    start() {
        this.isRunning = true;
        this.loop();
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.canvas.removeEventListener('mousedown', this.clickHandler);
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

        // Timer
        this.timeLeft -= 1 / 60;
        if (this.timeLeft <= 0) {
            this.endGame();
            return;
        }

        // Difficulty progression (Warm-up: start at 0.5 speed, ramp up to 1.5+)
        // Base speed increases with score, but starts slower
        this.difficultyMultiplier = 0.5 + (this.score / 1500);

        // Spawning
        this.spawnTimer--;
        if (this.spawnTimer <= 0) {
            this.spawnTarget();

            // Base spawn rate based on difficulty
            let spawnDelay = Math.max(20, 70 - (this.difficultyMultiplier * 10));

            // "Frenzy Mode": Spawn much faster if low on time (< 30s)
            if (this.timeLeft < 30) {
                spawnDelay *= 0.6; // 40% faster
                this.showFloatingText('FRENZY!', this.width / 2, 100, '#ef4444'); // Visual cue (optional, might spam)
            }

            this.spawnTimer = spawnDelay;
        }

        // Freeze logic
        if (this.frozen) {
            this.frozenTimer--;
            if (this.frozenTimer <= 0) this.frozen = false;
        }

        // Update targets
        for (let i = this.targets.length - 1; i >= 0; i--) {
            const t = this.targets[i];

            if (!this.frozen) {
                t.x += t.vx;
                t.y += t.vy;

                // Bounce
                if (t.x - t.radius < 0 || t.x + t.radius > this.width) t.vx *= -1;
                if (t.y - t.radius < 0 || t.y + t.radius > this.height) t.vy *= -1;
            }

            t.life -= 1 / 60;
            if (t.life <= 0) {
                this.targets.splice(i, 1);
                if (t.type !== 'bomb') {
                    this.misses++;
                    this.combo = 0;
                }
            }
        }

        if (this.misses >= this.maxMisses) this.endGame();

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // Floating text
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.y -= 1;
            ft.life -= 0.02;
            if (ft.life <= 0) this.floatingTexts.splice(i, 1);
        }
    }

    spawnTarget() {
        const rand = Math.random() * 100;
        let type = 'normal';
        let cumWeight = 0;

        for (const [key, data] of Object.entries(this.targetTypes)) {
            cumWeight += data.weight;
            if (rand < cumWeight) {
                type = key;
                break;
            }
        }

        const data = this.targetTypes[type];
        const radius = data.radius;

        this.targets.push({
            x: Math.random() * (this.width - radius * 2) + radius,
            y: Math.random() * (this.height - radius * 2) + radius,
            vx: (Math.random() - 0.5) * data.speed * this.difficultyMultiplier,
            vy: (Math.random() - 0.5) * data.speed * this.difficultyMultiplier,
            radius: radius,
            color: data.color,
            type: type,
            points: data.points,
            effect: data.effect,
            life: 3 + Math.random() * 2, // Seconds
            maxLife: 5
        });
    }

    createExplosion(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: color,
                life: 1,
                size: Math.random() * 4 + 2
            });
        }
    }

    showFloatingText(text, x, y, color) {
        this.floatingTexts.push({
            text: text,
            x: x,
            y: y,
            color: color,
            life: 1
        });
    }

    shakeScreen() {
        this.canvas.style.transform = `translate(${Math.random() * 10 - 5}px, ${Math.random() * 10 - 5}px)`;
        setTimeout(() => this.canvas.style.transform = 'none', 200);
    }

    draw() {
        // Background
        this.ctx.fillStyle = '#1e293b';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Grid
        this.ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        this.ctx.lineWidth = 1;
        const gridSize = 50;
        for (let x = 0; x < this.width; x += gridSize) {
            this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, this.height); this.ctx.stroke();
        }
        for (let y = 0; y < this.height; y += gridSize) {
            this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(this.width, y); this.ctx.stroke();
        }

        // Targets
        this.targets.forEach(t => {
            // Pulse effect
            const pulse = 1 + Math.sin(Date.now() / 200) * 0.1;

            // Outer ring (timer)
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius + 5, 0, (t.life / t.maxLife) * Math.PI * 2);
            this.ctx.strokeStyle = t.color;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Main body
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius * pulse, 0, Math.PI * 2);
            this.ctx.fillStyle = t.color;
            this.ctx.fill();

            // Bullseye rings
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius * 0.6 * pulse, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
            this.ctx.fill();

            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius * 0.3 * pulse, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
            this.ctx.fill();

            // Icon/Symbol
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            let symbol = '';
            if (t.type === 'bomb') symbol = '💣';
            else if (t.type === 'time') symbol = '⏳';
            else if (t.type === 'freeze') symbol = '❄️';
            else if (t.type === 'accuracy') symbol = '🎯';
            else if (t.type === 'golden') symbol = '⭐';

            if (symbol) this.ctx.fillText(symbol, t.x, t.y);
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

        // Floating Text
        this.floatingTexts.forEach(ft => {
            this.ctx.globalAlpha = ft.life;
            this.ctx.fillStyle = ft.color;
            this.ctx.font = 'bold 20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(ft.text, ft.x, ft.y);
        });
        this.ctx.globalAlpha = 1;

        // UI Overlay
        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        this.ctx.fillRect(0, 0, this.width, 50);

        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 20px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Score: ${this.score}`, 20, 32);

        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = this.timeLeft < 10 ? '#ef4444' : '#fff';
        this.ctx.fillText(`Time: ${Math.ceil(this.timeLeft)}s`, this.width / 2, 32);

        this.ctx.textAlign = 'right';
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(`Misses: ${this.misses}/${this.maxMisses}`, this.width - 20, 32);

        // Combo display
        if (this.combo > 1) {
            this.ctx.textAlign = 'center';
            this.ctx.fillStyle = '#fbbf24';
            this.ctx.font = 'bold 24px Arial';
            this.ctx.fillText(`${this.combo}x COMBO!`, this.width / 2, 70);
        }

        // Custom Cursor (Crosshair)
        // Note: Real cursor is hidden via CSS usually, but we can draw one if needed.
        // For now, relying on system cursor or CSS cursor.
    }

    endGame() {
        this.gameOver = true;
        this.stop();
        alert(`Game Over! Final Score: ${this.score}`);
        if (this.onGameOver) this.onGameOver(this.score);
    }
}
