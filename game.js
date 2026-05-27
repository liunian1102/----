function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        this.player = new Player(this.width / 2, this.height / 2);
        this.enemies = [];
        this.items = [];
        this.projectiles = [];
        this.effects = [];
        this.particles = [];

        this.stars = this._initStars(120);
        this.bgTime = 0;

        this.keys = {};
        this.gameLoop = null;
        this.isRunning = false;
        this.isPaused = false;
        
        this.life = 3;
        this.level = 1;
        this.exp = 0;
        this.expToNext = 100;
        this.score = 0;
        this.gameTime = 0;
        this.difficulty = 1;

        this.enemyFreezeTimer = 0;
        this.autoAttackTimer = 0;
        this.autoAttackInterval = 0.6;

        this.init();
    }
    
    _initStars(count) {
        const stars = [];
        for (let i = 0; i < count; i++) {
            stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                r: Math.random() * 1.5 + 0.3,
                alpha: Math.random() * 0.6 + 0.2,
                twinkleSpeed: Math.random() * 0.02 + 0.005,
                twinkleOffset: Math.random() * Math.PI * 2
            });
        }
        return stars;
    }

    init() {
        this.bindEvents();
        this.updateUI();
        this.showingPotentialMenu = false;
    }
    
    bindEvents() {
        document.addEventListener('keydown', (e) => {
            if (e.key === ' ') {
                e.preventDefault();
            }
            this.keys[e.key] = true;

            if (!this.isPaused && this.isRunning) {
                if (e.key === 'q' || e.key === 'Q') {
                    this.castSkillQ();
                } else if (e.key === 'e' || e.key === 'E') {
                    this.castSkillE();
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
        
        document.getElementById('startBtn').addEventListener('click', () => {
            this.startGame();
        });
        
        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.togglePause();
        });
        
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.restartGame();
        });
        
        // 添加鼠标点击事件监听
        this.canvas.addEventListener('click', (e) => {
            if (this.showingPotentialMenu || this.showingClassSelection) {
                const rect = this.canvas.getBoundingClientRect();
                // 计算点击坐标，考虑canvas的实际尺寸与显示尺寸的比例
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                const mouseX = (e.clientX - rect.left) * scaleX;
                const mouseY = (e.clientY - rect.top) * scaleY;
                this.checkButtonClick(mouseX, mouseY);
            } else {
                // 点击地图控制角色移动
                const rect = this.canvas.getBoundingClientRect();
                // 计算点击坐标，考虑canvas的实际尺寸与显示尺寸的比例
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                const clickX = (e.clientX - rect.left) * scaleX;
                const clickY = (e.clientY - rect.top) * scaleY;
                this.setPlayerTarget(clickX, clickY);
            }
        });
        
        // 添加触摸事件监听
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.showingPotentialMenu || this.showingClassSelection) {
                const rect = this.canvas.getBoundingClientRect();
                const touch = e.touches[0];
                // 计算触摸坐标，考虑canvas的实际尺寸与显示尺寸的比例
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                const touchX = (touch.clientX - rect.left) * scaleX;
                const touchY = (touch.clientY - rect.top) * scaleY;
                this.checkButtonClick(touchX, touchY);
            } else {
                const rect = this.canvas.getBoundingClientRect();
                const touch = e.touches[0];
                
                // 计算触摸坐标，考虑canvas的实际尺寸与显示尺寸的比例
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                const clickX = (touch.clientX - rect.left) * scaleX;
                const clickY = (touch.clientY - rect.top) * scaleY;
                
                this.setPlayerTarget(clickX, clickY);
            }
        });
    }
    
    setPlayerTarget(x, y) {
        // 设置玩家的目标位置
        this.player.targetX = x;
        this.player.targetY = y;
        this.player.moving = true;
    }
    
    startGame() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.isPaused = false;
            this.gameLoop = setInterval(() => {
                this.update();
                this.render();
            }, 16);
        }
    }
    
    togglePause() {
        if (this.isRunning) {
            this.isPaused = !this.isPaused;
        }
    }
    
    restartGame() {
        clearInterval(this.gameLoop);
        this.player = new Player(this.width / 2, this.height / 2);
        this.enemies = [];
        this.items = [];
        this.projectiles = [];
        this.effects = [];
        this.keys = {};
        this.isRunning = false;
        this.isPaused = false;
        this.life = 3;
        this.level = 1;
        this.exp = 0;
        this.expToNext = 100;
        this.score = 0;
        this.gameTime = 0;
        this.difficulty = 1;
        this.enemyFreezeTimer = 0;
        this.autoAttackTimer = 0;
        this.showingPotentialMenu = false;
        this.showingClassSelection = false;
        this.particles = [];
        this.bgTime = 0;
        this.stars = this._initStars(120);
        document.getElementById('gameOver').style.display = 'none';
        this.updateUI();
        this.render();
    }
    
    update() {
        if (!this.isPaused) {
            this.gameTime += 0.016;
            // 难度更平缓且封顶，避免后期速度碾压必死
            this.difficulty = Math.min(4, 1 + this.gameTime / 90);

            // 计时器随暂停一起停（按帧推进，不再用 setTimeout）
            if (this.enemyFreezeTimer > 0) this.enemyFreezeTimer -= 0.016;
            this.updateInvincible();

            // 基础自动攻击：朝最近敌人发射，无职业/前期也有输出
            this.autoAttackTimer -= 0.016;
            if (this.autoAttackTimer <= 0 && this.enemies.length > 0) {
                this.shoot();
                this.autoAttackTimer = this.autoAttackInterval;
            }

            if (this.player.skillQ.cooldown > 0) this.player.skillQ.cooldown -= 0.016;
            if (this.player.skillE.cooldown > 0) this.player.skillE.cooldown -= 0.016;

            if (this.player.class === 'mage' && this.player.mana < this.player.maxMana) {
                this.player.mana = Math.min(this.player.maxMana, this.player.mana + this.player.manaRegen * 0.016);
            }
            if (this.player.class === 'paladin') {
                if (this.player.faith < this.player.maxFaith) {
                    this.player.faith = Math.min(this.player.maxFaith, this.player.faith + this.player.faithRegen * 0.016);
                }
                if (this.player.holyAuraActive) {
                    this.player.holyAuraTimer -= 0.016;
                    if (this.player.holyAuraTimer <= 0) {
                        this.player.holyAuraActive = false;
                    } else {
                        this.player.heal(this.player.maxHealth * 0.1 * 0.016);
                        const pcx = this.player.x + this.player.size / 2;
                        const pcy = this.player.y + this.player.size / 2;
                        for (let i = this.enemies.length - 1; i >= 0; i--) {
                            const e = this.enemies[i];
                            const dx = e.x + e.size / 2 - pcx;
                            const dy = e.y + e.size / 2 - pcy;
                            if (Math.sqrt(dx * dx + dy * dy) <= 80) {
                                e.takeDamage(this.player.attack * 0.5 * 0.016);
                                if (e.currentHealth <= 0) {
                                    this.spawnHitParticles(e.x + e.size / 2, e.y + e.size / 2, e.color, 10);
                                    this.score += 10;
                                    this.exp += 5;
                                    this.checkLevelUp();
                                    this.enemies.splice(i, 1);
                                }
                            }
                        }
                        this.effects.push({ type: 'holyAura', x: pcx, y: pcy, radius: 80, color: '#ffd700', ttl: 0.35, maxTtl: 0.35, pulse: this.player.holyAuraTimer });
                    }
                }
            }

            this.bgTime += 0.016;
            this.updatePlayer();
            this.updateEnemies();
            this.updateItems();
            this.updateProjectiles();
            this.updateEffects();
            this.updateParticles();
            this.checkCollisions();
            this.spawnEnemies();
            this.spawnItems();
            this.updateUI();
            this.checkGameOver();
        }
    }
    
    updatePlayer() {
        this.player.update(this.keys, this.width, this.height);
    }
    
    updateEnemies() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.enemyFreezeTimer <= 0) {
                this.enemies[i].update(this.player.x, this.player.y, this.width, this.height);
            }
            if (this.enemies[i].currentHealth <= 0) {
                this.score += 10;
                this.exp += 5;
                this.checkLevelUp();
                this.enemies.splice(i, 1);
            }
        }
    }
    
    updateItems() {
        for (let i = this.items.length - 1; i >= 0; i--) {
            this.items[i].update();
            if (this.items[i].duration <= 0) {
                this.items.splice(i, 1);
            }
        }
    }
    
    updateProjectiles() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            this.projectiles[i].update();
            if (this.projectiles[i].x < 0 || this.projectiles[i].x > this.width || 
                this.projectiles[i].y < 0 || this.projectiles[i].y > this.height) {
                this.projectiles.splice(i, 1);
            }
        }
    }
    
    checkCollisions() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.checkCollision(this.player, this.enemies[i])) {
                // 受击无敌帧：冷却期内不再结算玩家受伤，避免重叠时血量瞬间被掏空
                if (this.player.hurtCooldown <= 0) {
                    this.player.takeDamage(this.enemies[i].attack);
                    this.player.hurtCooldown = 0.6;
                    this.spawnHitParticles(this.player.x + this.player.size / 2, this.player.y + this.player.size / 2, '#ff4444', 8);
                }
                this.enemies[i].takeDamage(this.player.attack);
                
                // 简单的碰撞后分离，避免持续碰撞
                const dx = this.player.x - this.enemies[i].x;
                const dy = this.player.y - this.enemies[i].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDistance = (this.player.size + this.enemies[i].size) / 2;
                
                if (distance < minDistance && distance > 0) {
                    const pushFactor = 10;
                    const pushX = (dx / distance) * pushFactor;
                    const pushY = (dy / distance) * pushFactor;
                    
                    // 计算新位置
                    let newPlayerX = this.player.x + pushX;
                    let newPlayerY = this.player.y + pushY;
                    
                    // 确保主角不会超出地图边界
                    newPlayerX = Math.max(0, Math.min(this.width - this.player.size, newPlayerX));
                    newPlayerY = Math.max(0, Math.min(this.height - this.player.size, newPlayerY));
                    
                    // 应用新位置
                    this.player.x = newPlayerX;
                    this.player.y = newPlayerY;
                    
                    // 敌人位置调整
                    this.enemies[i].x -= pushX;
                    this.enemies[i].y -= pushY;
                }
                
                // 检查玩家是否死亡
                if (this.player.currentHealth <= 0) {
                    this.life--;
                    if (this.life > 0) {
                        // 重置玩家位置和状态，复活后给一小段无敌避免连死
                        this.player.x = this.width / 2;
                        this.player.y = this.height / 2;
                        this.player.currentHealth = this.player.maxHealth;
                        this.player.hurtCooldown = 1.5;
                    }
                }
                
                if (this.enemies[i] && this.enemies[i].currentHealth <= 0) {
                    this.spawnHitParticles(this.enemies[i].x + this.enemies[i].size / 2, this.enemies[i].y + this.enemies[i].size / 2, this.enemies[i].color, 12);
                    this.score += 10;
                    this.exp += 5;
                    this.checkLevelUp();
                    this.enemies.splice(i, 1);
                }
            }
        }
        
        for (let i = this.items.length - 1; i >= 0; i--) {
            if (this.checkCollision(this.player, this.items[i])) {
                this.collectItem(this.items[i]);
                this.items.splice(i, 1);
            }
        }
        
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            if (this.projectiles[i].isPiercing) continue;
            let hit = false;
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                if (this.checkCollision(this.projectiles[i], this.enemies[j])) {
                    const dmg = this.projectiles[i].damage != null ? this.projectiles[i].damage : 15;
                    this.enemies[j].takeDamage(dmg);
                    // 投射物击杀立即结算，不再依赖下一帧 updateEnemies
                    if (this.enemies[j].currentHealth <= 0) {
                        this.spawnHitParticles(this.enemies[j].x + this.enemies[j].size / 2, this.enemies[j].y + this.enemies[j].size / 2, this.enemies[j].color, 10);
                        this.score += 10;
                        this.exp += 5;
                        this.checkLevelUp();
                        this.enemies.splice(j, 1);
                    } else {
                        this.spawnHitParticles(this.enemies[j].x + this.enemies[j].size / 2, this.enemies[j].y + this.enemies[j].size / 2, '#ffaa00', 4);
                    }
                    hit = true;
                    break;
                }
            }
            if (hit) this.projectiles.splice(i, 1);
        }
    }
    
    checkCollision(a, b) {
        return a.x < b.x + b.size &&
               a.x + a.size > b.x &&
               a.y < b.y + b.size &&
               a.y + a.size > b.y;
    }
    
    spawnEnemies() {
        if (Math.random() < 0.02 * this.difficulty) {
            // 使用加权随机降低巨型追击者的刷新概率
            let type;
            const rand = Math.random();
            if (rand < 0.6) {
                type = 'chaser'; // 60%概率
            } else if (rand < 0.97) {
                type = 'patroller'; // 37%概率
            } else {
                type = 'giant'; // 3%概率
            }
            
            let x, y;
            
            if (Math.random() < 0.5) {
                x = Math.random() < 0.5 ? -50 : this.width + 50;
                y = Math.random() * this.height;
            } else {
                x = Math.random() * this.width;
                y = Math.random() < 0.5 ? -50 : this.height + 50;
            }
            
            this.enemies.push(new Enemy(x, y, type, this.difficulty));
        }
    }
    
    spawnItems() {
        if (Math.random() < 0.015) {
            const itemTypes = ['potion', 'snowflake', 'bomb', 'heart', 'potion_invicible', 'exp_book'];
            const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];
            const x = Math.random() * (this.width - 30);
            const y = Math.random() * (this.height - 30);
            this.items.push(new Item(x, y, type));
        }
    }
    
    collectItem(item) {
        switch (item.type) {
            case 'potion': // 药
                // 恢复50点HP
                this.player.heal(50);
                break;
            case 'snowflake': // 雪花
                // 敌人定身5秒
                this.freezeEnemies(5000);
                break;
            case 'bomb': // 炸弹
                // 范围秒杀敌人
                this.explodeBomb(this.player.x, this.player.y, 150);
                break;
            case 'heart': // 爱心
                // 增加一条生命
                this.life = Math.min(this.life + 1, 10);
                break;
            case 'potion_invicible': // 无敌药水
                // 体型、攻击、防御翻倍，持续10秒
                this.activateInvincible(10000);
                break;
            case 'exp_book': // 经验宝典
                // 提供少量经验
                this.exp += 15;
                this.checkLevelUp();
                break;
        }
    }
    
    freezeEnemies(duration) {
        // 按帧计时，暂停时一起停，且对定身期间新刷出的敌人同样生效
        this.enemyFreezeTimer = duration / 1000;
    }

    addEffect(x, y, radius, color, duration) {
        this.effects.push({ x, y, radius, color, ttl: duration, maxTtl: duration });
    }

    updateEffects() {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            this.effects[i].ttl -= 0.016;
            if (this.effects[i].ttl <= 0) this.effects.splice(i, 1);
        }
    }

    spawnHitParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: Math.random() * 0.04 + 0.03,
                size: Math.random() * 4 + 2,
                color
            });
        }
    }

    spawnParticles(x, y, color, count, speedMin, speedMax, sizeMin, sizeMax, decay) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = speedMin + Math.random() * (speedMax - speedMin);
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: decay || (Math.random() * 0.03 + 0.02),
                size: sizeMin + Math.random() * (sizeMax - sizeMin),
                color
            });
        }
    }

    spawnBurstRing(x, y, radius, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const speed = 1.5 + Math.random() * 2;
            this.particles.push({
                x: x + Math.cos(angle) * radius * 0.3,
                y: y + Math.sin(angle) * radius * 0.3,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: Math.random() * 0.025 + 0.02,
                size: Math.random() * 4 + 2,
                color
            });
        }
    }

    spawnSlashEffect(x1, y1, x2, y2, color) {
        this.effects.push({ type: 'slash', x1, y1, x2, y2, color, ttl: 0.25, maxTtl: 0.25 });
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.vx *= 0.96;
            p.life -= p.decay;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }
    
    explodeBomb(x, y, radius) {
        this.addEffect(x + this.player.size / 2, y + this.player.size / 2, radius, '#ffa500', 0.45);
        this.spawnHitParticles(x + this.player.size / 2, y + this.player.size / 2, '#ffcc44', 30);

        // 检查并秒杀范围内的敌人
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const dx = enemy.x - x;
            const dy = enemy.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= radius) {
                // 秒杀敌人
                this.score += 10;
                this.exp += 5;
                this.checkLevelUp();
                this.enemies.splice(i, 1);
            }
        }
    }
    
    activateInvincible(duration) {
        // 已在无敌中则只续时，避免叠加翻倍
        if (this.player.invincibleTimer > 0) {
            this.player.invincibleTimer = duration / 1000;
            return;
        }
        // 记录当前属性为基准（含已加点），还原时按基准恢复
        this.player.baseSize = this.player.size;
        this.player.baseAttack = this.player.attack;
        this.player.baseDefense = this.player.defense;

        this.player.size = this.player.baseSize * 2;
        this.player.attack = this.player.baseAttack * 2;
        this.player.defense = this.player.baseDefense * 2;
        this.player.color = '#ffeb3b';
        this.player.invincibleTimer = duration / 1000;
    }

    updateInvincible() {
        if (this.player.invincibleTimer > 0) {
            this.player.invincibleTimer -= 0.016;
            if (this.player.invincibleTimer <= 0) {
                this.player.invincibleTimer = 0;
                this.player.size = this.player.baseSize;
                this.player.attack = this.player.baseAttack;
                this.player.defense = this.player.baseDefense;
                this.player.color = '#4CAF50';
            }
        }
    }
    
    _getSkillMultiplier(level) {
        if (level === 2) return 1.2;
        if (level >= 3) return 1.5;
        return 1.0;
    }

    _getCDMultiplier(level) {
        if (level === 2) return 0.85;
        if (level >= 3) return 0.7;
        return 1.0;
    }

    _findClosestEnemies(count) {
        const sorted = this.enemies.slice().sort((a, b) => {
            const dxa = a.x - this.player.x, dya = a.y - this.player.y;
            const dxb = b.x - this.player.x, dyb = b.y - this.player.y;
            return (dxa * dxa + dya * dya) - (dxb * dxb + dyb * dyb);
        });
        return sorted.slice(0, count);
    }

    _dealDamage(enemy, dmg) {
        enemy.takeDamage(dmg);
        if (enemy.currentHealth <= 0) {
            const idx = this.enemies.indexOf(enemy);
            if (idx >= 0) {
                this.spawnHitParticles(enemy.x + enemy.size / 2, enemy.y + enemy.size / 2, enemy.color, 10);
                this.score += 10;
                this.exp += 5;
                this.checkLevelUp();
                this.enemies.splice(idx, 1);
            }
        } else {
            this.spawnHitParticles(enemy.x + enemy.size / 2, enemy.y + enemy.size / 2, '#ffaa00', 4);
        }
    }

    castSkillQ() {
        if (!this.player.class) return;
        const skill = this.player.skillQ;
        if (skill.cooldown > 0) return;
        const cls = this.player.class;
        if (cls === 'warrior') this._warriorQ(skill);
        else if (cls === 'mage') this._mageQ(skill);
        else if (cls === 'assassin') this._assassinQ(skill);
        else if (cls === 'archer') this._archerQ(skill);
        else if (cls === 'paladin') this._paladinQ(skill);
    }

    castSkillE() {
        if (!this.player.class) return;
        const skill = this.player.skillE;
        if (skill.cooldown > 0) return;
        const cls = this.player.class;
        if (cls === 'warrior') this._warriorE(skill);
        else if (cls === 'mage') this._mageE(skill);
        else if (cls === 'assassin') this._assassinE(skill);
        else if (cls === 'archer') this._archerE(skill);
        else if (cls === 'paladin') this._paladinE(skill);
    }

    _warriorQ(skill) {
        const healthSacrifice = this.player.maxHealth * 0.1;
        if (this.player.currentHealth <= healthSacrifice) return;
        this.player.currentHealth -= healthSacrifice;
        const dmg = this.player.attack * 1.5 * this._getSkillMultiplier(skill.level);
        const range = skill.level >= 3 ? 150 : 120;
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const particleCount = skill.level >= 3 ? 24 : 16;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const dx = e.x + e.size / 2 - pcx;
            const dy = e.y + e.size / 2 - pcy;
            if (Math.sqrt(dx * dx + dy * dy) <= range) this._dealDamage(e, dmg);
        }
        this.effects.push({ type: 'ring', x: pcx, y: pcy, radius: range, color: '#ff6030', ttl: 0.5, maxTtl: 0.5, rotation: 0, rotSpeed: 4 });
        this.spawnBurstRing(pcx, pcy, range * 0.6, '#ff8040', particleCount);
        this.spawnParticles(pcx, pcy, '#ff4020', particleCount, 2, 6, 2, 5, 0.04);
        skill.cooldown = skill.maxCooldown;
    }

    _warriorE(skill) {
        const targets = this._findClosestEnemies(1);
        if (targets.length === 0) return;
        const target = targets[0];
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const tcx = target.x + target.size / 2;
        const tcy = target.y + target.size / 2;
        const dx = tcx - pcx, dy = tcy - pcy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
            const nx = dx / dist, ny = dy / dist;
            target.x -= nx * 150;
            target.y -= ny * 150;
            const dmg = this.player.attack * 2 * this._getSkillMultiplier(skill.level);
            this._dealDamage(target, dmg);
            this.effects.push({ type: 'slash', x1: pcx, y1: pcy, x2: pcx + nx * 100, y2: pcy + ny * 100, color: '#4488ff', ttl: 0.3, maxTtl: 0.3 });
            this.effects.push({ type: 'shockwave', x: tcx, y: tcy, radius: 10, maxRadius: 80, color: '#88aaff', ttl: 0.35, maxTtl: 0.35 });
            this.spawnParticles(tcx, tcy, '#4488ff', 12, 2, 5, 2, 5, 0.04);
        }
        skill.cooldown = skill.maxCooldown;
    }

    _mageQ(skill) {
        if (this.player.mana < 1) return;
        this.player.mana -= 1;
        const targets = this._findClosestEnemies(1);
        if (targets.length === 0) { skill.cooldown = skill.maxCooldown; return; }
        const target = targets[0];
        const pcx = this.player.x + this.player.size / 2 - 5;
        const pcy = this.player.y + this.player.size / 2 - 5;
        const dx = target.x + target.size / 2 - (pcx + 5);
        const dy = target.y + target.size / 2 - (pcy + 5);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
            const speed = 8;
            const proj = new MagicProjectile(pcx, pcy, (dx / dist) * speed, (dy / dist) * speed, target);
            proj.damage = (this.player.attack * 1.2 + 10) * this._getSkillMultiplier(skill.level);
            this.projectiles.push(proj);
        }
        skill.cooldown = skill.maxCooldown;
    }

    _mageE(skill) {
        if (this.player.mana < 3) return;
        this.player.mana -= 3;
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const range = skill.level >= 3 ? 200 : 150;
        const dmg = this.player.attack * 1.2 * this._getSkillMultiplier(skill.level);
        const particleCount = skill.level >= 3 ? 32 : 20;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const dx = e.x + e.size / 2 - pcx;
            const dy = e.y + e.size / 2 - pcy;
            if (Math.sqrt(dx * dx + dy * dy) <= range) {
                e.stunTimer = 3;
                this._dealDamage(e, dmg);
            }
        }
        this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 10, maxRadius: range, color: '#88eeff', ttl: 0.5, maxTtl: 0.5 });
        this.spawnBurstRing(pcx, pcy, range * 0.5, '#aaeeff', particleCount);
        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2;
            const r = range * (0.4 + Math.random() * 0.5);
            this.effects.push({ type: 'iceShard', x: pcx, y: pcy, angle, length: 18 + Math.random() * 12, color: '#c8f8ff', ttl: 0.45, maxTtl: 0.45 });
        }
        skill.cooldown = skill.maxCooldown;
    }

    _assassinQ(skill) {
        const targets = this._findClosestEnemies(1);
        if (targets.length === 0) return;
        const target = targets[0];
        const tcx = target.x + target.size / 2;
        const tcy = target.y + target.size / 2;
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const dx = tcx - pcx, dy = tcy - pcy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.spawnParticles(pcx, pcy, '#aa44ff', 10, 2, 5, 2, 4, 0.05);
        if (dist > 0) {
            const nx = dx / dist, ny = dy / dist;
            this.player.x = target.x - nx * (target.size + this.player.size * 0.5);
            this.player.y = target.y - ny * (target.size + this.player.size * 0.5);
        }
        const dmg = this.player.attack * 2.5 * this._getSkillMultiplier(skill.level);
        this._dealDamage(target, dmg);
        const newPcx = this.player.x + this.player.size / 2;
        const newPcy = this.player.y + this.player.size / 2;
        this.spawnParticles(newPcx, newPcy, '#cc88ff', 8, 2, 4, 2, 4, 0.05);
        this.spawnSlashEffect(newPcx - 20, newPcy - 20, newPcx + 20, newPcy + 20, '#dd88ff');
        this.spawnSlashEffect(newPcx - 20, newPcy + 20, newPcx + 20, newPcy - 20, '#dd88ff');
        skill.cooldown = skill.maxCooldown;
    }

    _assassinE(skill) {
        const targets = this._findClosestEnemies(3);
        if (targets.length === 0) return;
        let delay = 0;
        for (let idx = 0; idx < targets.length; idx++) {
            const t = targets[idx];
            setTimeout(() => {
                if (t.currentHealth <= 0) return;
                const dmg = this.player.attack * 1.0 * this._getSkillMultiplier(skill.level);
                this._dealDamage(t, dmg);
                const tx = t.x + t.size / 2;
                const ty = t.y + t.size / 2;
                this.spawnSlashEffect(tx - 25, ty, tx + 25, ty, '#ffffff');
                this.spawnSlashEffect(tx, ty - 25, tx, ty + 25, '#ffffff');
                this.spawnParticles(tx, ty, '#ffffff', 6, 2, 4, 1, 3, 0.06);
            }, delay);
            delay += 100;
        }
        skill.cooldown = skill.maxCooldown;
    }

    _archerQ(skill) {
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const targets = this._findClosestEnemies(1);
        let angle = 0;
        if (targets.length > 0) {
            const t = targets[0];
            angle = Math.atan2(t.y + t.size / 2 - pcy, t.x + t.size / 2 - pcx);
        }
        const speed = 12;
        const dmg = this.player.attack * 1.8 * this._getSkillMultiplier(skill.level);
        const arrow = new PiercingArrow(pcx - 4, pcy - 4, Math.cos(angle) * speed, Math.sin(angle) * speed, dmg, this);
        this.projectiles.push(arrow);
        this.effects.push({ type: 'arrow', x: pcx, y: pcy, angle, length: 30, color: '#aaff44', ttl: 0.3, maxTtl: 0.3 });
        this.spawnParticles(pcx, pcy, '#ccff88', 8, 2, 5, 2, 4, 0.05);
        skill.cooldown = skill.maxCooldown;
    }

    _archerE(skill) {
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const count = skill.level >= 3 ? 14 : 10;
        const dmg = this.player.attack * 0.8 * this._getSkillMultiplier(skill.level);
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const tx = pcx + (Math.random() - 0.5) * 200;
                const ty = pcy + (Math.random() - 0.5) * 200;
                this.effects.push({ type: 'arrow', x: tx, y: ty - 120, angle: Math.PI / 2, length: 24, color: '#aaff44', ttl: 0.25, maxTtl: 0.25 });
                setTimeout(() => {
                    this.spawnHitParticles(tx, ty, '#aaff44', 6);
                    this.effects.push({ type: 'shockwave', x: tx, y: ty, radius: 5, maxRadius: 30, color: '#aaff44', ttl: 0.2, maxTtl: 0.2 });
                    for (let j = this.enemies.length - 1; j >= 0; j--) {
                        const e = this.enemies[j];
                        const dx = e.x + e.size / 2 - tx;
                        const dy = e.y + e.size / 2 - ty;
                        if (Math.sqrt(dx * dx + dy * dy) <= 25) this._dealDamage(e, dmg);
                    }
                }, 200);
            }, i * 100);
        }
        skill.cooldown = skill.maxCooldown;
    }

    _paladinQ(skill) {
        if (this.player.faith < 20) return;
        const targets = this._findClosestEnemies(1);
        if (targets.length === 0) return;
        const target = targets[0];
        this.player.faith -= 20;
        const dmg = this.player.attack * 2 * this._getSkillMultiplier(skill.level);
        this._dealDamage(target, dmg);
        target.stunTimer = 1.5;
        const tcx = target.x + target.size / 2;
        const tcy = target.y + target.size / 2;
        this.effects.push({ type: 'shockwave', x: tcx, y: tcy, radius: 5, maxRadius: skill.level >= 3 ? 100 : 70, color: '#ffd700', ttl: 0.5, maxTtl: 0.5 });
        this.spawnParticles(tcx, tcy - 30, '#ffd700', skill.level >= 3 ? 20 : 14, 1, 4, 2, 5, 0.03);
        this.spawnParticles(tcx, tcy, '#fff8dc', 8, 0.5, 2, 1, 3, 0.04);
        skill.cooldown = skill.maxCooldown;
    }

    _paladinE(skill) {
        if (this.player.faith < 50) return;
        this.player.faith -= 50;
        this.player.holyAuraActive = true;
        this.player.holyAuraTimer = 5;
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        this.effects.push({ type: 'holyAura', x: pcx, y: pcy, radius: 80, color: '#ffd700', ttl: 0.6, maxTtl: 0.6, pulse: 5 });
        this.spawnBurstRing(pcx, pcy, 80, '#ffd700', skill.level >= 3 ? 24 : 16);
        skill.cooldown = skill.maxCooldown;
    }
    
    shoot() {
        // 锁定最近敌人发射一发普通弹，伤害随攻击力成长
        let closest = null;
        let closestDist = Infinity;
        for (let enemy of this.enemies) {
            const dx = enemy.x - this.player.x;
            const dy = enemy.y - this.player.y;
            const d = dx * dx + dy * dy;
            if (d < closestDist) {
                closestDist = d;
                closest = enemy;
            }
        }
        if (!closest) return;

        const cx = this.player.x + this.player.size / 2;
        const cy = this.player.y + this.player.size / 2;
        const dx = closest.x + closest.size / 2 - cx;
        const dy = closest.y + closest.size / 2 - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0) return;

        const speed = 7;
        this.projectiles.push(new Projectile(
            cx - 5, cy - 5,
            (dx / dist) * speed, (dy / dist) * speed,
            this.player.attack
        ));
    }
    
    checkLevelUp() {
        if (this.exp >= this.expToNext) {
            this.exp -= this.expToNext;
            this.level++;
            this.expToNext = Math.floor(this.expToNext * 1.5);
            this.player.speed += 0.2;
            
            // 每次升级获得1点潜能点
            this.player.addPotentialPoints(1);
            
            if (this.level % 3 === 0) {
                this.life++;
            }
            
            // 升级后自动暂停游戏
            this.isPaused = true;
            
            // 检查是否达到等级3且未选择职业
            if (this.level === 3 && !this.player.class) {
                // 显示职业选择界面
                this.showClassSelection();
            } else {
                // 显示潜能点分配界面
                this.showPotentialMenu();
            }
        }
    }
    
    showClassSelection() {
        this.isPaused = true;
        this.showingClassSelection = true;
    }
    
    renderClassSelection() {
        if (this.showingClassSelection) {
            this.buttons = [];
            const ctx = this.ctx;

            const bgGrad = ctx.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, this.width * 0.7);
            bgGrad.addColorStop(0, 'rgba(10, 15, 35, 0.95)');
            bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0.97)');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, this.width, this.height);

            const titleFontSize = Math.min(28, this.width * 0.065);
            const subtitleFontSize = Math.min(16, this.width * 0.04);
            const descFontSize = Math.min(12, this.width * 0.03);

            ctx.save();
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#00c8ff';
            ctx.fillStyle = '#00e5ff';
            ctx.font = `bold ${titleFontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText('恭喜达到等级3！请选择职业', this.width / 2, this.height * 0.12);
            ctx.shadowBlur = 0;
            ctx.restore();

            const bw = Math.min(160, this.width * 0.36);
            const bh = Math.max(64, Math.min(80, this.height * 0.13));
            const sp = Math.min(14, this.width * 0.03);
            const row1Y = this.height * 0.22;
            const row2Y = row1Y + bh + sp;
            const row3Y = row2Y + bh + sp;
            const col1X = this.width / 2 - bw - sp / 2;
            const col2X = this.width / 2 + sp / 2;

            const classes = [
                { name: '战士', color: '#ff6b3a', q: '旋风斩', e: '盾击', choice: 1, row: 0, col: 0 },
                { name: '法师', color: '#4ecdc4', q: '魔法弹', e: '冰封新星', choice: 2, row: 0, col: 1 },
                { name: '刺客', color: '#aa66ff', q: '闪现斩', e: '连刺', choice: 3, row: 1, col: 0 },
                { name: '弓手', color: '#aaff44', q: '穿透箭', e: '箭雨', choice: 4, row: 1, col: 1 },
                { name: '圣骑士', color: '#ffd700', q: '圣光打击', e: '神圣光环', choice: 5, row: 2, col: 0 }
            ];

            for (const cls of classes) {
                let bx, by;
                if (cls.row === 2) {
                    bx = this.width / 2 - bw / 2;
                    by = row3Y;
                } else {
                    bx = cls.col === 0 ? col1X : col2X;
                    by = cls.row === 0 ? row1Y : row2Y;
                }
                this.drawButton(bx, by, bw, bh, cls.color, cls.name, cls.choice);
                ctx.save();
                ctx.fillStyle = 'rgba(200,232,255,0.75)';
                ctx.font = `${descFontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.fillText(`Q:${cls.q}  E:${cls.e}`, bx + bw / 2, by + bh + 13);
                ctx.restore();
            }
        }
    }
    
    handleClassChoice(choice) {
        const classDefs = {
            1: { name: 'warrior',  qCD: 3,  eCD: 5  },
            2: { name: 'mage',     qCD: 1,  eCD: 8  },
            3: { name: 'assassin', qCD: 4,  eCD: 6  },
            4: { name: 'archer',   qCD: 3,  eCD: 8  },
            5: { name: 'paladin',  qCD: 4,  eCD: 12 }
        };
        const def = classDefs[choice];
        if (!def) return;
        this.player.class = def.name;
        this.player.skillQ = { cooldown: 0, maxCooldown: def.qCD, level: 1 };
        this.player.skillE = { cooldown: 0, maxCooldown: def.eCD, level: 1 };

        this.showingClassSelection = false;
        if (this.player.potentialPoints > 0) {
            this.showPotentialMenu();
        } else {
            this.isPaused = false;
        }
        this.updateUI();
    }
    
    showPotentialMenu() {
        if (this.player.potentialPoints > 0) {
            // 显示潜能点分配界面
            this.isPaused = true;
            this.showingPotentialMenu = true;
        }
    }
    
    openPotentialMenu() {
        // 这个方法现在由鼠标点击事件处理
    }
    
    handlePotentialChoice(choice) {
        if (choice === 5) {
            if (this.player.potentialPoints >= 2 && this.player.class && this.player.skillQ.level < 3) {
                this.player.potentialPoints -= 2;
                this.player.skillQ.level++;
                const cdm = this._getCDMultiplier(this.player.skillQ.level);
                const baseCDs = { warrior: 3, mage: 1, assassin: 4, archer: 3, paladin: 4 };
                const base = baseCDs[this.player.class] || 3;
                this.player.skillQ.maxCooldown = base * cdm;
            }
            this.updateUI();
            if (this.player.potentialPoints <= 0) { this.showingPotentialMenu = false; this.isPaused = false; }
            return;
        }
        if (choice === 6) {
            if (this.player.potentialPoints >= 2 && this.player.class && this.player.skillE.level < 3) {
                this.player.potentialPoints -= 2;
                this.player.skillE.level++;
                const cdm = this._getCDMultiplier(this.player.skillE.level);
                const baseCDs = { warrior: 5, mage: 8, assassin: 6, archer: 8, paladin: 12 };
                const base = baseCDs[this.player.class] || 5;
                this.player.skillE.maxCooldown = base * cdm;
            }
            this.updateUI();
            if (this.player.potentialPoints <= 0) { this.showingPotentialMenu = false; this.isPaused = false; }
            return;
        }
        if (this.player.potentialPoints > 0) {
            let stat;
            switch (choice) {
                case 1: stat = 'attack'; break;
                case 2: stat = 'defense'; break;
                case 3: stat = 'health'; break;
                case 4: stat = 'speed'; break;
                default: return;
            }
            this.player.spendPotentialPoint(stat);
            this.updateUI();
            if (this.player.potentialPoints <= 0) {
                this.showingPotentialMenu = false;
                this.isPaused = false;
            }
        }
    }
    
    renderPotentialMenu() {
        if (this.showingPotentialMenu) {
            this.buttons = [];
            const ctx = this.ctx;

            const bgGrad = ctx.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, this.width * 0.7);
            bgGrad.addColorStop(0, 'rgba(10, 15, 35, 0.93)');
            bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0.96)');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, this.width, this.height);
            
            const titleFontSize = Math.min(30, this.width * 0.07);
            const subtitleFontSize = Math.min(20, this.width * 0.05);
            const descFontSize = Math.min(14, this.width * 0.035);
            
            ctx.save();
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#00c8ff';
            ctx.fillStyle = '#00e5ff';
            ctx.font = `bold ${titleFontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText('恭喜升级！', this.width / 2, this.height * 0.15);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#c8e8ff';
            ctx.font = subtitleFontSize + 'px Arial';
            ctx.fillText(`获得1点潜能点`, this.width / 2, this.height * 0.22);
            ctx.fillStyle = '#ffcc00';
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ffcc00';
            ctx.fillText(`当前潜能点: ${this.player.potentialPoints}`, this.width / 2, this.height * 0.29);
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = 'rgba(200, 232, 255, 0.6)';
            ctx.font = descFontSize + 'px Arial';
            ctx.fillText(`当前属性:`, this.width / 2, this.height * 0.36);
            ctx.fillStyle = 'rgba(200, 232, 255, 0.85)';
            ctx.fillText(`攻击力: ${this.player.attack}`, this.width / 2 - this.width * 0.25, this.height * 0.42);
            ctx.fillText(`防御力: ${this.player.defense}`, this.width / 2 + this.width * 0.25, this.height * 0.42);
            ctx.fillText(`最大生命值: ${this.player.maxHealth}`, this.width / 2 - this.width * 0.25, this.height * 0.48);
            ctx.fillText(`速度: ${this.player.speed.toFixed(1)}`, this.width / 2 + this.width * 0.25, this.height * 0.48);
            ctx.restore();
            
            const buttonWidth = Math.min(150, this.width * 0.4);
            const buttonHeight = Math.max(46, Math.min(56, this.height * 0.095));
            const buttonY = this.height * 0.5;
            const buttonSpacing = Math.min(14, this.width * 0.03);

            this.drawButton(this.width / 2 - buttonWidth - buttonSpacing / 2, buttonY, buttonWidth, buttonHeight, '#ff6b6b', '攻击力 (+5)', 1);
            this.drawButton(this.width / 2 + buttonSpacing / 2, buttonY, buttonWidth, buttonHeight, '#4ecdc4', '防御力 (+3)', 2);
            this.drawButton(this.width / 2 - buttonWidth - buttonSpacing / 2, buttonY + buttonHeight + buttonSpacing, buttonWidth, buttonHeight, '#45b7d1', '生命值 (+20)', 3);
            this.drawButton(this.width / 2 + buttonSpacing / 2, buttonY + buttonHeight + buttonSpacing, buttonWidth, buttonHeight, '#96ceb4', '速度 (+0.5)', 4);

            if (this.player.class) {
                const qLv = this.player.skillQ.level;
                const eLv = this.player.skillE.level;
                const qLabel = qLv >= 3 ? 'Q技能 已满级' : `升级Q技能 (${qLv}→${qLv+1}) -2点`;
                const eLabel = eLv >= 3 ? 'E技能 已满级' : `升级E技能 (${eLv}→${eLv+1}) -2点`;
                const qColor = qLv >= 3 || this.player.potentialPoints < 2 ? '#666666' : '#ffaa33';
                const eColor = eLv >= 3 || this.player.potentialPoints < 2 ? '#666666' : '#ff66aa';
                this.drawButton(this.width / 2 - buttonWidth - buttonSpacing / 2, buttonY + (buttonHeight + buttonSpacing) * 2, buttonWidth, buttonHeight, qColor, qLabel, 5);
                this.drawButton(this.width / 2 + buttonSpacing / 2, buttonY + (buttonHeight + buttonSpacing) * 2, buttonWidth, buttonHeight, eColor, eLabel, 6);
            }

            this.drawButton(this.width / 2 - buttonWidth / 2, buttonY + (buttonHeight + buttonSpacing) * 3, buttonWidth, buttonHeight, '#feca57', '完成', 0);
        }
    }
    
    drawButton(x, y, width, height, color, text, choice) {
        const ctx = this.ctx;
        ctx.save();

        ctx.shadowBlur = 16;
        ctx.shadowColor = color;
        const grad = ctx.createLinearGradient(x, y, x, y + height);
        grad.addColorStop(0, `${color}ee`);
        grad.addColorStop(1, `${color}88`);
        ctx.fillStyle = grad;
        roundRect(ctx, x, y, width, height, 10);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = `${color}ff`;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, width, height, 10);
        ctx.stroke();

        const fontSize = Math.min(16, width * 0.12);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.fillText(text, x + width / 2, y + height / 2);
        ctx.restore();

        this.buttons = this.buttons || [];
        this.buttons.push({ x, y, width, height, choice });
    }
    
    checkButtonClick(mouseX, mouseY) {
        if (this.showingClassSelection && this.buttons) {
            for (let button of this.buttons) {
                if (mouseX >= button.x && mouseX <= button.x + button.width && 
                    mouseY >= button.y && mouseY <= button.y + button.height) {
                    // 处理职业选择
                    this.handleClassChoice(button.choice);
                    break;
                }
            }
        } else if (this.showingPotentialMenu && this.buttons) {
            for (let button of this.buttons) {
                if (mouseX >= button.x && mouseX <= button.x + button.width && 
                    mouseY >= button.y && mouseY <= button.y + button.height) {
                    if (button.choice === 0) {
                        // 完成按钮
                        this.showingPotentialMenu = false;
                        this.isPaused = false;
                    } else {
                        // 属性选择按钮
                        this.handlePotentialChoice(button.choice);
                    }
                    break;
                }
            }
        }
        this.buttons = [];
    }
    
    checkGameOver() {
        if (this.life <= 0) {
            this.endGame();
        }
    }
    
    endGame() {
        clearInterval(this.gameLoop);
        this.isRunning = false;
        document.getElementById('finalTime').textContent = Math.floor(this.gameTime);
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('gameOver').style.display = 'flex';
    }
    
    updateUI() {
        document.getElementById('life').textContent = this.life;
        document.getElementById('level').textContent = this.level;
        document.getElementById('exp').textContent = Math.floor(this.exp);
        document.getElementById('expToNext').textContent = this.expToNext;
        document.getElementById('potentialPoints').textContent = this.player.potentialPoints;
        document.getElementById('attack').textContent = this.player.attack;
        document.getElementById('defense').textContent = this.player.defense;
        document.getElementById('maxHealth').textContent = this.player.maxHealth;
        document.getElementById('speed').textContent = this.player.speed.toFixed(1);
        
        const classNames = { warrior: '战士', mage: '法师', assassin: '刺客', archer: '弓手', paladin: '圣骑士' };
        document.getElementById('class').textContent = this.player.class ? (classNames[this.player.class] || this.player.class) : '无';

        const qCD = this.player.skillQ.cooldown > 0 ? this.player.skillQ.cooldown.toFixed(1) : '就绪';
        const eCD = this.player.skillE.cooldown > 0 ? this.player.skillE.cooldown.toFixed(1) : '就绪';
        document.getElementById('skillCooldown').textContent = this.player.class ? `Q:${qCD} E:${eCD}` : '无职业';

        if (this.player.class === 'mage') {
            document.getElementById('mana').textContent = Math.floor(this.player.mana);
            document.getElementById('maxMana').textContent = this.player.maxMana;
        } else if (this.player.class === 'paladin') {
            document.getElementById('mana').textContent = Math.floor(this.player.faith);
            document.getElementById('maxMana').textContent = this.player.maxFaith;
        } else {
            document.getElementById('mana').textContent = '-';
            document.getElementById('maxMana').textContent = '-';
        }
        
        document.getElementById('time').textContent = Math.floor(this.gameTime);
        document.getElementById('score').textContent = this.score;
    }
    
    renderBackground() {
        const ctx = this.ctx;
        const grad = ctx.createLinearGradient(0, 0, 0, this.height);
        grad.addColorStop(0, '#07101a');
        grad.addColorStop(1, '#050c12');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.width, this.height);

        const t = this.bgTime;
        ctx.save();
        for (const s of this.stars) {
            const twinkle = s.alpha + Math.sin(t * s.twinkleSpeed * 60 + s.twinkleOffset) * 0.25;
            ctx.globalAlpha = Math.max(0.05, Math.min(1, twinkle));
            ctx.fillStyle = '#c8e8ff';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        ctx.save();
        const gridSize = 60;
        const gridAlpha = 0.06 + Math.sin(t * 0.5) * 0.02;
        ctx.strokeStyle = `rgba(0, 200, 255, ${gridAlpha})`;
        ctx.lineWidth = 0.5;
        for (let x = 0; x < this.width; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke();
        }
        for (let y = 0; y < this.height; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke();
        }
        ctx.restore();
    }

    renderParticles() {
        const ctx = this.ctx;
        ctx.save();
        for (const p of this.particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 6;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    render() {
        this.renderBackground();
        
        this.player.render(this.ctx);
        
        for (let enemy of this.enemies) {
            enemy.render(this.ctx);
        }
        
        for (let item of this.items) {
            item.render(this.ctx);
        }
        
        for (let projectile of this.projectiles) {
            projectile.render(this.ctx);
        }

        this._renderEffects();

        this.renderParticles();

        this._renderSkillHUD();

        if (this.showingClassSelection) {
            this.renderClassSelection();
        } else if (this.showingPotentialMenu) {
            this.renderPotentialMenu();
        }
    }

    _renderEffects() {
        const ctx = this.ctx;
        for (const fx of this.effects) {
            const alpha = Math.max(0, fx.ttl / fx.maxTtl);
            ctx.save();

            if (!fx.type) {
                ctx.globalAlpha = alpha * 0.5;
                ctx.shadowBlur = 30;
                ctx.shadowColor = fx.color;
                ctx.fillStyle = fx.color;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
                ctx.fill();
            } else if (fx.type === 'ring') {
                ctx.globalAlpha = alpha * 0.85;
                ctx.shadowBlur = 22;
                ctx.shadowColor = fx.color;
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 3;
                ctx.save();
                ctx.translate(fx.x, fx.y);
                ctx.rotate(fx.rotation || 0);
                ctx.beginPath();
                ctx.arc(0, 0, fx.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 8;
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + (fx.rotation || 0);
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * fx.radius * 0.8, Math.sin(a) * fx.radius * 0.8);
                    ctx.lineTo(Math.cos(a) * fx.radius, Math.sin(a) * fx.radius);
                    ctx.stroke();
                }
                ctx.restore();
                if (fx.rotSpeed) fx.rotation = (fx.rotation || 0) + fx.rotSpeed * 0.016;
            } else if (fx.type === 'shockwave') {
                const prog = 1 - alpha;
                const r = fx.radius + (fx.maxRadius - fx.radius) * prog;
                ctx.globalAlpha = alpha * 0.7;
                ctx.shadowBlur = 18;
                ctx.shadowColor = fx.color;
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
                ctx.stroke();
            } else if (fx.type === 'slash') {
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 12;
                ctx.shadowColor = fx.color;
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 3 * alpha;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(fx.x1, fx.y1);
                ctx.lineTo(fx.x2, fx.y2);
                ctx.stroke();
            } else if (fx.type === 'arrow') {
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 14;
                ctx.shadowColor = fx.color;
                ctx.save();
                ctx.translate(fx.x, fx.y);
                ctx.rotate(fx.angle);
                ctx.fillStyle = fx.color;
                ctx.beginPath();
                ctx.moveTo(fx.length, 0);
                ctx.lineTo(-fx.length * 0.6, -4);
                ctx.lineTo(-fx.length * 0.6, 4);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-fx.length * 0.6, 0);
                ctx.lineTo(-fx.length, 0);
                ctx.stroke();
                ctx.restore();
            } else if (fx.type === 'holyAura') {
                const pulse = Math.sin(fx.ttl * 8) * 0.3 + 0.7;
                ctx.globalAlpha = alpha * pulse * 0.5;
                ctx.shadowBlur = 28;
                ctx.shadowColor = fx.color;
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * pulse * 0.12;
                ctx.fillStyle = fx.color;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
                ctx.fill();
            } else if (fx.type === 'iceShard') {
                const prog = 1 - alpha;
                const dist = fx.length * 2 * prog + fx.length;
                const endX = fx.x + Math.cos(fx.angle) * dist;
                const endY = fx.y + Math.sin(fx.angle) * dist;
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 10;
                ctx.shadowColor = fx.color;
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(fx.x + Math.cos(fx.angle) * dist * 0.6, fx.y + Math.sin(fx.angle) * dist * 0.6);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }

            ctx.restore();
        }
    }

    _renderSkillHUD() {
        if (!this.player.class) return;
        const ctx = this.ctx;
        ctx.save();

        const cls = this.player.class;
        const slotW = 56, slotH = 56, slotR = 8;
        const margin = 10;
        const baseX = this.width - (slotW * 2 + margin * 3);
        const baseY = this.height - slotH - margin * 2 - 16;

        const qNames = { warrior: '旋', mage: '弹', assassin: '闪', archer: '穿', paladin: '圣' };
        const eNames = { warrior: '盾', mage: '冰', assassin: '刺', archer: '雨', paladin: '环' };
        const qColors = { warrior: '#ff6030', mage: '#4ecdc4', assassin: '#aa66ff', archer: '#aaff44', paladin: '#ffd700' };
        const eColors = { warrior: '#4488ff', mage: '#88eeff', assassin: '#ffffff', archer: '#88ff44', paladin: '#fff8dc' };

        const slots = [
            { skill: this.player.skillQ, label: 'Q', icon: qNames[cls] || 'Q', color: qColors[cls] || '#fff', x: baseX },
            { skill: this.player.skillE, label: 'E', icon: eNames[cls] || 'E', color: eColors[cls] || '#fff', x: baseX + slotW + margin }
        ];

        for (const s of slots) {
            const cdRatio = s.skill.maxCooldown > 0 ? Math.max(0, s.skill.cooldown / s.skill.maxCooldown) : 0;
            const ready = cdRatio <= 0;

            ctx.shadowBlur = ready ? 16 : 4;
            ctx.shadowColor = ready ? s.color : '#333333';
            ctx.fillStyle = ready ? `${s.color}33` : 'rgba(0,0,0,0.6)';
            roundRect(ctx, s.x, baseY, slotW, slotH, slotR);
            ctx.fill();

            ctx.strokeStyle = ready ? `${s.color}cc` : '#555555';
            ctx.lineWidth = 2;
            roundRect(ctx, s.x, baseY, slotW, slotH, slotR);
            ctx.stroke();

            ctx.shadowBlur = ready ? 10 : 0;
            ctx.shadowColor = s.color;
            ctx.fillStyle = ready ? s.color : '#888888';
            ctx.font = `bold 22px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(s.icon, s.x + slotW / 2, baseY + slotH / 2 - 4);

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#cccccc';
            ctx.font = `11px Arial`;
            ctx.fillText(s.label, s.x + slotW / 2, baseY + slotH / 2 + 14);

            if (cdRatio > 0) {
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                roundRect(ctx, s.x, baseY, slotW, slotH * cdRatio, slotR);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.font = `bold 13px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(s.skill.cooldown.toFixed(1), s.x + slotW / 2, baseY + slotH / 2);
            }

            ctx.fillStyle = '#aaaaaa';
            ctx.font = `10px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`Lv${s.skill.level}`, s.x + slotW / 2, baseY + slotH + 3);

            const barW = slotW;
            const barH = 5;
            const barY2 = baseY + slotH + 14;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            roundRect(ctx, s.x, barY2, barW, barH, 2);
            ctx.fill();
            if (cdRatio > 0) {
                ctx.fillStyle = s.color;
                ctx.shadowBlur = 4;
                ctx.shadowColor = s.color;
                roundRect(ctx, s.x, barY2, barW * (1 - cdRatio), barH, 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else {
                ctx.fillStyle = s.color;
                ctx.shadowBlur = 6;
                ctx.shadowColor = s.color;
                roundRect(ctx, s.x, barY2, barW, barH, 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        if (cls === 'mage') {
            this._renderResourceBar(baseX - 22, baseY, 14, slotH + 20, this.player.mana, this.player.maxMana, '#00ccff', '#0044aa', '法');
        } else if (cls === 'paladin') {
            this._renderResourceBar(baseX - 22, baseY, 14, slotH + 20, this.player.faith, this.player.maxFaith, '#ffd700', '#aa6600', '信');
        }

        ctx.restore();
    }

    _renderResourceBar(x, y, w, h, current, max, colorA, colorB, label) {
        const ctx = this.ctx;
        const ratio = max > 0 ? current / max : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, x, y, w, h, 4);
        ctx.fill();

        const fillH = h * ratio;
        const grad = ctx.createLinearGradient(x, y + h - fillH, x, y + h);
        grad.addColorStop(0, colorA);
        grad.addColorStop(1, colorB);
        ctx.fillStyle = grad;
        ctx.shadowBlur = 8;
        ctx.shadowColor = colorA;
        roundRect(ctx, x, y + h - fillH, w, fillH, 4);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = `${colorA}99`;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, w, h, 4);
        ctx.stroke();

        ctx.fillStyle = colorA;
        ctx.font = `bold 10px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, x + w / 2, y - 2);
    }
}

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 30;
        this.speed = 5;
        this.color = '#4CAF50';
        this.maxHealth = 100;
        this.currentHealth = 100;
        this.attack = 20;
        this.defense = 10;
        this.potentialPoints = 0;
        
        this.class = null;
        this.skillCooldown = 0;
        this.maxSkillCooldown = 3000;

        this.skillQ = { cooldown: 0, maxCooldown: 3, level: 1 };
        this.skillE = { cooldown: 0, maxCooldown: 5, level: 1 };

        this.mana = 10;
        this.maxMana = 10;
        this.manaRegen = 1;

        this.faith = 50;
        this.maxFaith = 100;
        this.faithRegen = 5;
        this.holyAuraActive = false;
        this.holyAuraTimer = 0;

        this.stunTimer = 0;

        this.hurtCooldown = 0;
        this.invincibleTimer = 0;

        this.targetX = null;
        this.targetY = null;
        this.moving = false;
    }
    
    update(keys, width, height) {
        // 键盘控制
        if (keys['ArrowUp'] || keys['w']) {
            this.y = Math.max(0, this.y - this.speed);
            // 重置目标位置，优先键盘控制
            this.moving = false;
            this.targetX = null;
            this.targetY = null;
        }
        if (keys['ArrowDown'] || keys['s']) {
            this.y = Math.min(height - this.size, this.y + this.speed);
            this.moving = false;
            this.targetX = null;
            this.targetY = null;
        }
        if (keys['ArrowLeft'] || keys['a']) {
            this.x = Math.max(0, this.x - this.speed);
            this.moving = false;
            this.targetX = null;
            this.targetY = null;
        }
        if (keys['ArrowRight'] || keys['d']) {
            this.x = Math.min(width - this.size, this.x + this.speed);
            this.moving = false;
            this.targetX = null;
            this.targetY = null;
        }
        
        // 点击移动
        if (this.moving && this.targetX !== null && this.targetY !== null) {
            const dx = this.targetX - (this.x + this.size / 2);
            const dy = this.targetY - (this.y + this.size / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 5) { // 到达目标附近时停止
                const moveX = (dx / distance) * this.speed;
                const moveY = (dy / distance) * this.speed;
                
                // 边界检查
                this.x = Math.max(0, Math.min(width - this.size, this.x + moveX));
                this.y = Math.max(0, Math.min(height - this.size, this.y + moveY));
            } else {
                this.moving = false;
                this.targetX = null;
                this.targetY = null;
            }
        }
        
        // 受击无敌帧倒计时
        if (this.hurtCooldown > 0) {
            this.hurtCooldown -= 0.016;
            if (this.hurtCooldown < 0) this.hurtCooldown = 0;
        }

        // 更新职业相关逻辑
        this.updateClass();
    }
    
    updateClass() {
        if (this.skillCooldown > 0) {
            this.skillCooldown -= 16;
        }
    }
    
    takeDamage(damage) {
        const actualDamage = Math.max(1, damage - this.defense);
        this.currentHealth = Math.max(0, this.currentHealth - actualDamage);
        return actualDamage;
    }
    
    heal(amount) {
        this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
    }
    
    addPotentialPoints(points) {
        this.potentialPoints += points;
    }
    
    spendPotentialPoint(stat) {
        if (this.potentialPoints > 0) {
            switch (stat) {
                case 'attack':
                    this.attack += 5;
                    break;
                case 'defense':
                    this.defense += 3;
                    break;
                case 'health':
                    this.maxHealth += 20;
                    this.currentHealth = this.maxHealth;
                    break;
                case 'speed':
                    this.speed += 0.5;
                    break;
            }
            this.potentialPoints--;
            return true;
        }
        return false;
    }
    
    render(ctx) {
        const flicker = this.hurtCooldown > 0 && Math.floor(this.hurtCooldown * 20) % 2 === 0;
        ctx.save();
        ctx.globalAlpha = flicker ? 0.3 : 1;

        const isInvincible = this.invincibleTimer > 0;
        const baseColor = isInvincible ? '#ffeb3b' : this.color;

        ctx.shadowBlur = isInvincible ? 24 : 14;
        ctx.shadowColor = baseColor;

        const grad = ctx.createLinearGradient(this.x, this.y, this.x + this.size, this.y + this.size);
        grad.addColorStop(0, isInvincible ? '#fff176' : '#69f0ae');
        grad.addColorStop(1, isInvincible ? '#f9a825' : '#00897b');
        ctx.fillStyle = grad;
        roundRect(ctx, this.x, this.y, this.size, this.size, 7);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = isInvincible ? 'rgba(255,235,59,0.8)' : 'rgba(0,230,150,0.6)';
        ctx.lineWidth = 2;
        roundRect(ctx, this.x, this.y, this.size, this.size, 7);
        ctx.stroke();
        ctx.restore();

        const healthBarWidth = this.size;
        const healthBarHeight = 5;
        const healthPercentage = this.currentHealth / this.maxHealth;
        const bx = this.x;
        const by = this.y - 12;

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, bx, by, healthBarWidth, healthBarHeight, 3);
        ctx.fill();

        const hpColor = healthPercentage > 0.5 ? '#00e676' : healthPercentage > 0.25 ? '#ffca28' : '#ff1744';
        ctx.fillStyle = hpColor;
        ctx.shadowBlur = 6;
        ctx.shadowColor = hpColor;
        roundRect(ctx, bx, by, healthBarWidth * healthPercentage, healthBarHeight, 3);
        ctx.fill();
        ctx.restore();
    }
}

class Enemy {
    constructor(x, y, type, difficulty) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.difficulty = difficulty;
        this.size = 30;
        this.speed = 2;
        this.maxHealth = 50;
        this.currentHealth = 50;
        this.attack = 10;
        this.defense = 5;
        this.color = '#f44336';
        
        // 巡逻者相关属性
        this.patrolDirection = Math.random() < 0.5 ? 1 : -1; // 1为右/下，-1为左/上
        this.patrolAxis = Math.random() < 0.5 ? 'x' : 'y'; // x轴或y轴巡逻
        this.patrolRange = 100; // 巡逻范围
        this.patrolStart = this.patrolAxis === 'x' ? this.x : this.y;
        this.isChasing = false; // 是否正在追击
        this.chaseRange = 150; // 追击范围
        
        this.restTimer = 0;
        this.restDuration = 2000;
        this.moveDistance = 0;
        this.maxMoveDistance = 200;
        this.isResting = false;

        this.stunTimer = 0;

        this.initType();
    }
    
    initType() {
        switch (this.type) {
            case 'chaser': // 追击者
                this.size = 30;
                this.speed = 2.5 * this.difficulty;
                this.maxHealth = 50 * this.difficulty;
                this.currentHealth = 50 * this.difficulty;
                this.attack = 10 * this.difficulty;
                this.defense = 5 * this.difficulty;
                this.color = '#f44336';
                break;
            case 'patroller': // 巡逻者
                this.size = 25;
                this.speed = 1.8 * this.difficulty;
                this.maxHealth = 40 * this.difficulty;
                this.currentHealth = 40 * this.difficulty;
                this.attack = 8 * this.difficulty;
                this.defense = 3 * this.difficulty;
                this.color = '#2196F3';
                break;
            case 'giant': // 巨型追击者
                this.size = 50;
                this.speed = 1.2 * this.difficulty;
                this.maxHealth = 150 * this.difficulty;
                this.currentHealth = 150 * this.difficulty;
                this.attack = 25 * this.difficulty;
                this.defense = 15 * this.difficulty;
                this.color = '#9c27b0';
                break;
            default: // 默认追击者
                this.type = 'chaser';
                this.size = 30;
                this.speed = 2.5 * this.difficulty;
                this.maxHealth = 50 * this.difficulty;
                this.currentHealth = 50 * this.difficulty;
                this.attack = 10 * this.difficulty;
                this.defense = 5 * this.difficulty;
                this.color = '#f44336';
        }
    }
    
    update(playerX, playerY, width, height) {
        if (this.stunTimer > 0) {
            this.stunTimer -= 0.016;
            return;
        }
        switch (this.type) {
            case 'chaser':
                this.updateChaser(playerX, playerY);
                break;
            case 'patroller':
                this.updatePatroller(playerX, playerY, width, height);
                break;
            case 'giant':
                this.updateGiant(playerX, playerY);
                break;
        }
    }
    
    updateChaser(playerX, playerY) {
        // 追击者：持续追击玩家
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            this.x += (dx / distance) * this.speed;
            this.y += (dy / distance) * this.speed;
        }
    }
    
    updatePatroller(playerX, playerY, width, height) {
        // 计算与玩家的距离
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 检查是否进入追击范围
        if (distance <= this.chaseRange) {
            this.isChasing = true;
        }
        
        // 如果正在追击
        if (this.isChasing) {
            // 向玩家移动
            if (distance > 0) {
                this.x += (dx / distance) * this.speed;
                this.y += (dy / distance) * this.speed;
            }
            
            // 检查是否离开追击范围
            if (distance > this.chaseRange * 1.5) {
                this.isChasing = false;
                // 重置巡逻起点
                this.patrolStart = this.patrolAxis === 'x' ? this.x : this.y;
            }
        } else {
            // 巡逻模式
            if (this.patrolAxis === 'x') {
                // x轴巡逻
                this.x += this.speed * this.patrolDirection;
                
                // 检查是否到达巡逻边界
                if (Math.abs(this.x - this.patrolStart) >= this.patrolRange) {
                    this.patrolDirection *= -1; // 反转方向
                }
            } else {
                // y轴巡逻
                this.y += this.speed * this.patrolDirection;
                
                // 检查是否到达巡逻边界
                if (Math.abs(this.y - this.patrolStart) >= this.patrolRange) {
                    this.patrolDirection *= -1; // 反转方向
                }
            }
        }
    }
    
    updateGiant(playerX, playerY) {
        // 巨型追击者：移动一定距离后休息
        if (this.isResting) {
            // 休息中
            this.restTimer += 16; // 假设每帧16毫秒
            if (this.restTimer >= this.restDuration) {
                this.isResting = false;
                this.restTimer = 0;
                this.moveDistance = 0;
            }
        } else {
            // 移动中
            const dx = playerX - this.x;
            const dy = playerY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                const moveX = (dx / distance) * this.speed;
                const moveY = (dy / distance) * this.speed;
                
                // 计算移动距离
                this.moveDistance += Math.sqrt(moveX * moveX + moveY * moveY);
                
                // 移动
                this.x += moveX;
                this.y += moveY;
                
                // 检查是否达到最大移动距离
                if (this.moveDistance >= this.maxMoveDistance) {
                    this.isResting = true;
                    this.restTimer = 0;
                }
            }
        }
    }
    
    takeDamage(damage) {
        const actualDamage = Math.max(1, damage - this.defense);
        this.currentHealth = Math.max(0, this.currentHealth - actualDamage);
        return actualDamage;
    }
    
    render(ctx) {
        ctx.save();
        const glowColors = { chaser: '#ff1744', patroller: '#2979ff', giant: '#d500f9' };
        const lightColors = { chaser: '#ff6b6b', patroller: '#64b5f6', giant: '#e040fb' };
        const darkColors = { chaser: '#b71c1c', patroller: '#0d47a1', giant: '#6a0080' };
        const glow = glowColors[this.type] || '#ff1744';

        ctx.shadowBlur = this.type === 'giant' ? 20 : 12;
        ctx.shadowColor = glow;

        const grad = ctx.createLinearGradient(this.x, this.y, this.x + this.size, this.y + this.size);
        grad.addColorStop(0, lightColors[this.type] || '#ff6b6b');
        grad.addColorStop(1, darkColors[this.type] || '#b71c1c');
        ctx.fillStyle = grad;
        roundRect(ctx, this.x, this.y, this.size, this.size, this.type === 'giant' ? 10 : 6);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = `${glow}99`;
        ctx.lineWidth = 1.5;
        roundRect(ctx, this.x, this.y, this.size, this.size, this.type === 'giant' ? 10 : 6);
        ctx.stroke();
        ctx.restore();

        const healthBarWidth = this.size;
        const healthBarHeight = 4;
        const healthPercentage = this.currentHealth / this.maxHealth;
        const bx = this.x;
        const by = this.y - 10;

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, bx, by, healthBarWidth, healthBarHeight, 2);
        ctx.fill();
        ctx.fillStyle = '#ff1744';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#ff1744';
        roundRect(ctx, bx, by, healthBarWidth * healthPercentage, healthBarHeight, 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `bold ${Math.floor(this.size * 0.38)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labels = { chaser: '追', patroller: '巡', giant: '巨' };
        ctx.fillText(labels[this.type] || '?', this.x + this.size / 2, this.y + this.size / 2);
        ctx.restore();

        if (this.stunTimer > 0) {
            const cx = this.x + this.size / 2;
            const cy = this.y - 16;
            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffd700';
            for (let i = 0; i < 3; i++) {
                const a = (Date.now() * 0.003 + i * (Math.PI * 2 / 3));
                const sx = cx + Math.cos(a) * 8;
                const sy = cy + Math.sin(a) * 4 - 2;
                ctx.fillStyle = '#ffd700';
                ctx.font = '11px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('★', sx, sy);
            }
            ctx.restore();
        }
    }
}

class Item {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.size = 25;
        this.type = type;
        this.duration = 15;
        this.color = '#2196F3';
        this.icon = '';
        
        switch (type) {
            case 'potion': // 药
                this.color = '#4CAF50';
                this.icon = '💊';
                break;
            case 'snowflake': // 雪花
                this.color = '#2196F3';
                this.icon = '❄️';
                break;
            case 'bomb': // 炸弹
                this.color = '#f44336';
                this.icon = '💣';
                break;
            case 'heart': // 爱心
                this.color = '#e91e63';
                this.icon = '❤️';
                break;
            case 'potion_invicible': // 无敌药水
                this.color = '#9c27b0';
                this.icon = '⚡';
                break;
            case 'exp_book': // 经验宝典
                this.color = '#ff9800';
                this.icon = '📚';
                break;
        }
    }
    
    update() {
        this.duration -= 0.016;
    }
    
    render(ctx) {
        const pulse = 0.7 + Math.sin(Date.now() * 0.005) * 0.3;
        ctx.save();
        ctx.shadowBlur = 18 * pulse;
        ctx.shadowColor = this.color;
        ctx.fillStyle = `${this.color}33`;
        ctx.beginPath();
        ctx.arc(this.x + this.size / 2, this.y + this.size / 2, this.size * 0.75 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        const grad = ctx.createRadialGradient(
            this.x + this.size * 0.35, this.y + this.size * 0.35, 0,
            this.x + this.size / 2, this.y + this.size / 2, this.size * 0.7
        );
        grad.addColorStop(0, `${this.color}ff`);
        grad.addColorStop(1, `${this.color}88`);
        ctx.fillStyle = grad;
        roundRect(ctx, this.x, this.y, this.size, this.size, 8);
        ctx.fill();

        ctx.strokeStyle = `${this.color}cc`;
        ctx.lineWidth = 1.5;
        roundRect(ctx, this.x, this.y, this.size, this.size, 8);
        ctx.stroke();
        ctx.restore();

        ctx.font = '15px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icon, this.x + this.size / 2, this.y + this.size / 2);
    }
}

class Projectile {
    constructor(x, y, dx, dy, damage = 15) {
        this.x = x;
        this.y = y;
        this.size = 8;
        this.dx = dx;
        this.dy = dy;
        this.color = '#ff9800';
        this.damage = damage;
        this.trail = [];
    }
    
    update() {
        this.trail.push({ x: this.x + this.size / 2, y: this.y + this.size / 2 });
        if (this.trail.length > 8) this.trail.shift();
        this.x += this.dx;
        this.y += this.dy;
    }
    
    render(ctx) {
        ctx.save();
        for (let i = 0; i < this.trail.length; i++) {
            const a = (i / this.trail.length) * 0.4;
            const r = (i / this.trail.length) * this.size * 0.5;
            ctx.globalAlpha = a;
            ctx.fillStyle = '#ffcc80';
            ctx.beginPath();
            ctx.arc(this.trail[i].x, this.trail[i].y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff9800';
        ctx.fillStyle = '#ffe082';
        ctx.beginPath();
        ctx.arc(this.x + this.size / 2, this.y + this.size / 2, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class MagicProjectile {
    constructor(x, y, dx, dy, target) {
        this.x = x;
        this.y = y;
        this.size = 10;
        this.dx = dx;
        this.dy = dy;
        this.color = '#4ecdc4';
        this.target = target;
        this.damage = 25;
        this.trail = [];
    }
    
    update() {
        this.trail.push({ x: this.x + this.size / 2, y: this.y + this.size / 2 });
        if (this.trail.length > 10) this.trail.shift();
        this.x += this.dx;
        this.y += this.dy;
        
        // 如果目标还存在，调整方向
        if (this.target && this.target.currentHealth > 0) {
            const dx = this.target.x + this.target.size / 2 - (this.x + this.size / 2);
            const dy = this.target.y + this.target.size / 2 - (this.y + this.size / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                const speed = 8;
                this.dx = (dx / distance) * speed;
                this.dy = (dy / distance) * speed;
            }
        }
    }
    
    render(ctx) {
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        ctx.save();
        for (let i = 0; i < this.trail.length; i++) {
            const a = (i / this.trail.length) * 0.45;
            const r = (i / this.trail.length) * this.size * 0.6;
            ctx.globalAlpha = a;
            ctx.fillStyle = '#80cbc4';
            ctx.beginPath();
            ctx.arc(this.trail[i].x, this.trail[i].y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#4ecdc4';
        ctx.fillStyle = '#4ecdc4';
        ctx.beginPath();
        ctx.arc(cx, cy, this.size / 2, 0, Math.PI * 2);
        ctx.fill();

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.size);
        gradient.addColorStop(0, 'rgba(178, 255, 250, 0.9)');
        gradient.addColorStop(1, 'rgba(78, 205, 196, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class PiercingArrow {
    constructor(x, y, dx, dy, damage, game) {
        this.x = x;
        this.y = y;
        this.size = 8;
        this.dx = dx;
        this.dy = dy;
        this.damage = damage;
        this.game = game;
        this.color = '#aaff44';
        this.trail = [];
        this.hitEnemies = new Set();
        this.angle = Math.atan2(dy, dx);
        this.isPiercing = true;
    }

    update() {
        this.trail.push({ x: this.x + this.size / 2, y: this.y + this.size / 2 });
        if (this.trail.length > 12) this.trail.shift();
        this.x += this.dx;
        this.y += this.dy;

        for (let j = this.game.enemies.length - 1; j >= 0; j--) {
            const e = this.game.enemies[j];
            if (this.hitEnemies.has(e)) continue;
            const ex = e.x + e.size / 2;
            const ey = e.y + e.size / 2;
            const ax = this.x + this.size / 2;
            const ay = this.y + this.size / 2;
            if (Math.abs(ax - ex) < (e.size / 2 + this.size / 2) && Math.abs(ay - ey) < (e.size / 2 + this.size / 2)) {
                this.hitEnemies.add(e);
                e.takeDamage(this.damage);
                this.game.spawnHitParticles(ex, ey, '#aaff44', 6);
                if (e.currentHealth <= 0) {
                    this.game.spawnHitParticles(ex, ey, e.color, 10);
                    this.game.score += 10;
                    this.game.exp += 5;
                    this.game.checkLevelUp();
                    this.game.enemies.splice(j, 1);
                }
            }
        }
    }

    render(ctx) {
        ctx.save();
        for (let i = 0; i < this.trail.length; i++) {
            const a = (i / this.trail.length) * 0.4;
            const r = (i / this.trail.length) * this.size * 0.4;
            ctx.globalAlpha = a;
            ctx.fillStyle = '#ccff88';
            ctx.beginPath();
            ctx.arc(this.trail[i].x, this.trail[i].y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#aaff44';
        ctx.save();
        ctx.translate(this.x + this.size / 2, this.y + this.size / 2);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#ddff88';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-8, -3);
        ctx.lineTo(-8, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.restore();
    }
}

window.addEventListener('load', () => {
    const game = new Game();
    game.render();
});