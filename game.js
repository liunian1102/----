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
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.updateUI();
        this.showingPotentialMenu = false;
    }
    
    bindEvents() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
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
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                this.checkButtonClick(mouseX, mouseY);
            }
        });
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
        document.getElementById('gameOver').style.display = 'none';
        this.updateUI();
        this.render();
    }
    
    update() {
        if (!this.isPaused) {
            this.gameTime += 0.016;
            this.difficulty = 1 + this.gameTime / 60;
            
            // 检查空格键使用技能
            if (this.keys[' '] && this.player.class) {
                if (this.player.class === 'warrior') {
                    this.warriorSkill();
                } else if (this.player.class === 'mage') {
                    this.mageSkill();
                }
                // 防止技能连续释放
                this.keys[' '] = false;
            }
            
            this.updatePlayer();
            this.updateEnemies();
            this.updateItems();
            this.updateProjectiles();
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
            this.enemies[i].update(this.player.x, this.player.y, this.width, this.height);
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
                // 双方互相伤害
                this.player.takeDamage(this.enemies[i].attack);
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
                        // 重置玩家位置和状态
                        this.player.x = this.width / 2;
                        this.player.y = this.height / 2;
                        this.player.currentHealth = this.player.maxHealth;
                    }
                }
                
                // 检查敌人是否死亡
                if (this.enemies[i].currentHealth <= 0) {
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
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                if (this.checkCollision(this.projectiles[i], this.enemies[j])) {
                    if (this.projectiles[i] instanceof MagicProjectile) {
                        // 魔法弹伤害
                        this.enemies[j].takeDamage(this.projectiles[i].damage);
                    } else {
                        // 普通子弹伤害
                        this.enemies[j].takeDamage(15);
                    }
                    this.projectiles.splice(i, 1);
                    break;
                }
            }
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
        for (let enemy of this.enemies) {
            enemy.isFrozen = true;
            // 保存原始速度
            if (!enemy.originalSpeed) {
                enemy.originalSpeed = enemy.speed;
            }
            enemy.speed = 0;
            
            // 一段时间后恢复
            setTimeout(() => {
                if (enemy) {
                    enemy.isFrozen = false;
                    enemy.speed = enemy.originalSpeed || 2;
                }
            }, duration);
        }
    }
    
    explodeBomb(x, y, radius) {
        // 绘制爆炸效果
        this.ctx.fillStyle = 'rgba(255, 165, 0, 0.8)';
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
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
        // 保存原始属性
        if (!this.player.originalSize) {
            this.player.originalSize = this.player.size;
        }
        if (!this.player.originalAttack) {
            this.player.originalAttack = this.player.attack;
        }
        if (!this.player.originalDefense) {
            this.player.originalDefense = this.player.defense;
        }
        
        // 应用无敌效果
        this.player.size = this.player.originalSize * 2;
        this.player.attack = this.player.originalAttack * 2;
        this.player.defense = this.player.originalDefense * 2;
        this.player.color = '#ffeb3b'; // 变色效果
        
        // 一段时间后恢复
        setTimeout(() => {
            if (this.player) {
                this.player.size = this.player.originalSize;
                this.player.attack = this.player.originalAttack;
                this.player.defense = this.player.originalDefense;
                this.player.color = '#4CAF50'; // 恢复原始颜色
            }
        }, duration);
    }
    
    warriorSkill() {
        // 检查技能冷却
        if (this.player.skillCooldown > 0) {
            return;
        }
        
        // 计算牺牲的生命值
        const healthSacrifice = this.player.maxHealth * 0.1;
        
        // 检查生命值是否足够
        if (this.player.currentHealth <= healthSacrifice) {
            return;
        }
        
        // 牺牲生命值
        this.player.currentHealth -= healthSacrifice;
        
        // 计算技能伤害
        const baseDamage = this.player.attack * 1.5;
        const healthDamage = healthSacrifice * 0.8;
        const totalDamage = baseDamage + healthDamage;
        
        // 技能范围
        const skillRange = 120;
        
        // 对范围内敌人造成伤害
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const dx = enemy.x - this.player.x;
            const dy = enemy.y - this.player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= skillRange) {
                enemy.takeDamage(totalDamage);
                
                // 检查敌人是否死亡
                if (enemy.currentHealth <= 0) {
                    this.score += 10;
                    this.exp += 5;
                    this.checkLevelUp();
                    this.enemies.splice(i, 1);
                }
            }
        }
        
        // 显示技能效果
        this.showSkillEffect(this.player.x, this.player.y, skillRange, '#ff6b6b');
        
        // 设置技能冷却
        this.player.skillCooldown = this.player.maxSkillCooldown;
    }
    
    showSkillEffect(x, y, radius, color) {
        // 绘制技能效果
        const originalAlpha = this.ctx.globalAlpha;
        this.ctx.globalAlpha = 0.6;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x + this.player.size / 2, y + this.player.size / 2, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = originalAlpha;
    }
    
    mageSkill() {
        // 检查技能冷却
        if (this.player.skillCooldown > 0) {
            return;
        }
        
        // 检查法力值是否足够
        if (this.player.mana < 1) {
            return;
        }
        
        // 消耗法力值
        this.player.mana -= 1;
        
        // 寻找最近的敌人
        let closestEnemy = null;
        let closestDistance = Infinity;
        
        for (let enemy of this.enemies) {
            const dx = enemy.x - this.player.x;
            const dy = enemy.y - this.player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestEnemy = enemy;
            }
        }
        
        // 如果有敌人，发射魔法弹
        if (closestEnemy) {
            // 计算魔法弹方向
            const dx = closestEnemy.x + closestEnemy.size / 2 - (this.player.x + this.player.size / 2);
            const dy = closestEnemy.y + closestEnemy.size / 2 - (this.player.y + this.player.size / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                const speed = 8;
                const magDx = (dx / distance) * speed;
                const magDy = (dy / distance) * speed;
                
                // 创建魔法弹
                this.projectiles.push(new MagicProjectile(
                    this.player.x + this.player.size / 2 - 5,
                    this.player.y + this.player.size / 2 - 5,
                    magDx, magDy, closestEnemy
                ));
            }
        }
        
        // 设置技能冷却
        this.player.skillCooldown = this.player.maxSkillCooldown;
    }
    
    shoot() {
        const directions = [
            { dx: this.player.speed * 2, dy: 0 },
            { dx: -this.player.speed * 2, dy: 0 },
            { dx: 0, dy: this.player.speed * 2 },
            { dx: 0, dy: -this.player.speed * 2 }
        ];
        
        for (let dir of directions) {
            this.projectiles.push(new Projectile(
                this.player.x + this.player.size / 2 - 5,
                this.player.y + this.player.size / 2 - 5,
                dir.dx, dir.dy
            ));
        }
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
            // 绘制半透明背景
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillRect(0, 0, this.width, this.height);
            
            // 绘制菜单标题
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '30px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('恭喜达到等级3！', this.width / 2, 100);
            this.ctx.font = '20px Arial';
            this.ctx.fillText('请选择你的职业：', this.width / 2, 140);
            
            // 绘制职业选择按钮
            const buttonWidth = 200;
            const buttonHeight = 60;
            const buttonY = 200;
            const buttonSpacing = 40;
            
            // 战士按钮
            this.drawButton(this.width / 2 - buttonWidth - buttonSpacing / 2, buttonY, buttonWidth, buttonHeight, '#ff6b6b', '战士 - 舍命一击', 1);
            
            // 法师按钮
            this.drawButton(this.width / 2 + buttonSpacing / 2, buttonY, buttonWidth, buttonHeight, '#4ecdc4', '法师 - 魔法弹', 2);
            
            // 绘制职业描述
            this.ctx.font = '16px Arial';
            this.ctx.fillText('战士：牺牲10%生命，对范围内敌人造成伤害', this.width / 2 - buttonWidth - buttonSpacing / 2, buttonY + buttonHeight + 20);
            this.ctx.fillText('法师：消耗1法力，发射魔法弹攻击敌人', this.width / 2 + buttonSpacing / 2, buttonY + buttonHeight + 20);
        }
    }
    
    handleClassChoice(choice) {
        if (choice === 1) {
            // 选择战士
            this.player.class = 'warrior';
            this.player.maxSkillCooldown = 3000; // 3秒CD
        } else if (choice === 2) {
            // 选择法师
            this.player.class = 'mage';
            this.player.maxSkillCooldown = 1000; // 1秒CD
        }
        
        this.showingClassSelection = false;
        this.isPaused = false;
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
        if (this.player.potentialPoints > 0) {
            let stat;
            switch (choice) {
                case 1:
                    stat = 'attack';
                    break;
                case 2:
                    stat = 'defense';
                    break;
                case 3:
                    stat = 'health';
                    break;
                case 4:
                    stat = 'speed';
                    break;
                default:
                    return;
            }
            
            this.player.spendPotentialPoint(stat);
            this.updateUI();
            
            // 检查是否还有潜能点
            if (this.player.potentialPoints <= 0) {
                this.showingPotentialMenu = false;
                this.isPaused = false;
            }
        }
    }
    
    renderPotentialMenu() {
        if (this.showingPotentialMenu) {
            // 绘制半透明背景
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillRect(0, 0, this.width, this.height);
            
            // 绘制菜单标题
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '30px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('恭喜升级！', this.width / 2, 100);
            this.ctx.font = '20px Arial';
            this.ctx.fillText(`获得1点潜能点`, this.width / 2, 140);
            this.ctx.fillText(`当前潜能点: ${this.player.potentialPoints}`, this.width / 2, 180);
            
            // 绘制当前属性
            this.ctx.font = '16px Arial';
            this.ctx.fillText(`当前属性:`, this.width / 2, 220);
            this.ctx.fillText(`攻击力: ${this.player.attack}`, this.width / 2 - 100, 250);
            this.ctx.fillText(`防御力: ${this.player.defense}`, this.width / 2 + 100, 250);
            this.ctx.fillText(`最大生命值: ${this.player.maxHealth}`, this.width / 2 - 100, 280);
            this.ctx.fillText(`速度: ${this.player.speed.toFixed(1)}`, this.width / 2 + 100, 280);
            
            // 绘制选择按钮
            const buttonWidth = 150;
            const buttonHeight = 50;
            const buttonY = 330;
            const buttonSpacing = 20;
            
            // 攻击力按钮
            this.drawButton(this.width / 2 - buttonWidth - buttonSpacing / 2, buttonY, buttonWidth, buttonHeight, '#ff6b6b', '攻击力 (+5)', 1);
            
            // 防御力按钮
            this.drawButton(this.width / 2 + buttonSpacing / 2, buttonY, buttonWidth, buttonHeight, '#4ecdc4', '防御力 (+3)', 2);
            
            // 生命值按钮
            this.drawButton(this.width / 2 - buttonWidth - buttonSpacing / 2, buttonY + buttonHeight + buttonSpacing, buttonWidth, buttonHeight, '#45b7d1', '生命值 (+20)', 3);
            
            // 速度按钮
            this.drawButton(this.width / 2 + buttonSpacing / 2, buttonY + buttonHeight + buttonSpacing, buttonWidth, buttonHeight, '#96ceb4', '速度 (+0.5)', 4);
            
            // 完成按钮
            this.drawButton(this.width / 2 - buttonWidth / 2, buttonY + buttonHeight * 2 + buttonSpacing * 2, buttonWidth, buttonHeight, '#feca57', '完成', 0);
        }
    }
    
    drawButton(x, y, width, height, color, text, choice) {
        // 绘制按钮背景
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, width, height);
        
        // 绘制按钮边框
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);
        
        // 绘制按钮文本
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, x + width / 2, y + height / 2);
        
        // 存储按钮位置和选择
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
        
        // 更新职业信息
        if (this.player.class === 'warrior') {
            document.getElementById('class').textContent = '战士';
        } else if (this.player.class === 'mage') {
            document.getElementById('class').textContent = '法师';
        } else {
            document.getElementById('class').textContent = '无';
        }
        
        // 更新技能CD
        const cooldown = Math.max(0, Math.floor(this.player.skillCooldown / 1000 * 10) / 10);
        document.getElementById('skillCooldown').textContent = cooldown;
        
        // 更新法力值
        if (this.player.class === 'mage') {
            document.getElementById('mana').textContent = Math.floor(this.player.mana);
            document.getElementById('maxMana').textContent = this.player.maxMana;
        } else {
            document.getElementById('mana').textContent = '0';
            document.getElementById('maxMana').textContent = '0';
        }
        
        document.getElementById('time').textContent = Math.floor(this.gameTime);
        document.getElementById('score').textContent = this.score;
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
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
        
        // 渲染职业选择界面
        if (this.showingClassSelection) {
            this.renderClassSelection();
        }
        // 渲染潜能点分配菜单
        else if (this.showingPotentialMenu) {
            this.renderPotentialMenu();
        }
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
        
        // 职业相关属性
        this.class = null; // 职业类型：null, 'warrior', 'mage'
        this.skillCooldown = 0; // 技能冷却时间
        this.maxSkillCooldown = 3000; // 最大技能冷却时间
        
        // 法师相关属性
        this.mana = 10; // 法力值
        this.maxMana = 10; // 最大法力值
        this.manaRegen = 0.1; // 每秒法力回复
    }
    
    update(keys, width, height) {
        if (keys['ArrowUp'] || keys['w']) {
            this.y = Math.max(0, this.y - this.speed);
        }
        if (keys['ArrowDown'] || keys['s']) {
            this.y = Math.min(height - this.size, this.y + this.speed);
        }
        if (keys['ArrowLeft'] || keys['a']) {
            this.x = Math.max(0, this.x - this.speed);
        }
        if (keys['ArrowRight'] || keys['d']) {
            this.x = Math.min(width - this.size, this.x + this.speed);
        }
        
        // 更新职业相关逻辑
        this.updateClass();
    }
    
    updateClass() {
        // 更新技能冷却时间
        if (this.skillCooldown > 0) {
            this.skillCooldown -= 16; // 假设每帧16毫秒
        }
        
        // 法师法力值回复
        if (this.class === 'mage' && this.mana < this.maxMana) {
            this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * 0.016);
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
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.size, this.size);
        
        // 绘制生命值条
        const healthBarWidth = this.size;
        const healthBarHeight = 4;
        const healthPercentage = this.currentHealth / this.maxHealth;
        
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(this.x, this.y - 10, healthBarWidth, healthBarHeight);
        ctx.fillStyle = '#44ff44';
        ctx.fillRect(this.x, this.y - 10, healthBarWidth * healthPercentage, healthBarHeight);
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
        
        // 巨型追击者相关属性
        this.restTimer = 0; // 休息计时器
        this.restDuration = 2000; // 休息持续时间（毫秒）
        this.moveDistance = 0; // 移动距离
        this.maxMoveDistance = 200; // 最大移动距离
        this.isResting = false; // 是否正在休息
        
        // 根据类型初始化属性
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
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.size, this.size);
        
        // 绘制生命值条
        const healthBarWidth = this.size;
        const healthBarHeight = 4;
        const healthPercentage = this.currentHealth / this.maxHealth;
        
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(this.x, this.y - 10, healthBarWidth, healthBarHeight);
        ctx.fillStyle = '#44ff44';
        ctx.fillRect(this.x, this.y - 10, healthBarWidth * healthPercentage, healthBarHeight);
        
        // 绘制敌人类型标识
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        switch (this.type) {
            case 'chaser':
                ctx.fillText('追', this.x + this.size / 2, this.y + this.size / 2);
                break;
            case 'patroller':
                ctx.fillText('巡', this.x + this.size / 2, this.y + this.size / 2);
                break;
            case 'giant':
                ctx.fillText('巨', this.x + this.size / 2, this.y + this.size / 2);
                break;
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
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.size, this.size);
        
        // 绘制道具图标
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(this.icon, this.x + this.size / 2, this.y + this.size / 2);
    }
}

class Projectile {
    constructor(x, y, dx, dy) {
        this.x = x;
        this.y = y;
        this.size = 10;
        this.dx = dx;
        this.dy = dy;
        this.color = '#ff9800';
    }
    
    update() {
        this.x += this.dx;
        this.y += this.dy;
    }
    
    render(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
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
        this.damage = 25; // 魔法弹伤害
    }
    
    update() {
        // 更新位置
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
        // 绘制魔法弹
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x + this.size / 2, this.y + this.size / 2, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // 绘制魔法弹光晕
        const gradient = ctx.createRadialGradient(
            this.x + this.size / 2, this.y + this.size / 2, 0,
            this.x + this.size / 2, this.y + this.size / 2, this.size
        );
        gradient.addColorStop(0, 'rgba(78, 205, 196, 0.8)');
        gradient.addColorStop(1, 'rgba(78, 205, 196, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x + this.size / 2, this.y + this.size / 2, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

window.addEventListener('load', () => {
    const game = new Game();
    game.render();
});