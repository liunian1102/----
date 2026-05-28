const DT = 16 / 1000; // 单帧时长(秒),与 setInterval(16ms) 对应

// 职业 Q/E 技能基础冷却(秒),职业选择 + 技能升级天赋共用
const CLASS_BASE_CD = {
    warrior:  { q: 3, e: 5  },
    mage:     { q: 1, e: 8  },
    assassin: { q: 4, e: 6  },
    archer:   { q: 3, e: 8  },
    paladin:  { q: 4, e: 12 }
};

// 选择职业时叠加的基础属性偏移,强化职业特色
//  - warrior 攻高防低血厚
//  - archer  攻偏高、防低、自动攻击投射物倍率高
//  - assassin 移速高
//  - paladin 防高血厚、攻低
//  - mage    法力回复加强
const CLASS_BASE_ADJUST = {
    warrior:  { attack:  10, defense: -5, maxHealth: 20 },
    mage:     { manaRegen: 2, maxMana: 10 },
    archer:   { attack:   8, defense: -5, autoAttackDmgMult: 1.3 },
    assassin: { speed:  1.5 },
    paladin:  { defense: 10, attack:  -5, maxHealth: 30 }
};

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
        this.enemyBullets = []; // 炮手发射的敌方投射物
        this.effects = [];
        this.particles = [];

        this.stars = this._initStars(120);
        this.bgTime = 0;

        this.pendingActions = []; // 帧驱动延迟队列,替代 setTimeout(暂停时一起停)
        this._uiTimer = 0;        // updateUI 降频累计
        this.buttons = [];        // 菜单命中区,每帧 render 时重置
        this.skillButtons = [];   // Q/E 技能按钮命中区,每帧 _renderSkillHUD 时重置
        this.freezeOverlay = null; // 全屏冰封特效数据

        this.keys = {};
        this._rafId = null;
        this.isRunning = false;
        this.isPaused = false;
        
        this.life = 1;
        this.maxLife = 3; // 生命上限,可由天赋"传承"扩展
        this.level = 1;
        this.exp = 0;
        this.expToNext = 100;
        this.score = 0;
        this.gameTime = 0;
        this.difficulty = 1;

        this.enemyFreezeTimer = 0;
        this.autoAttackTimer = 0;
        this.autoAttackInterval = 0.6;

        // 方块大魔王调度
        this.bossState = 'idle';      // idle | warning | active | retreating
        this.bossTimer = 60;          // 距离下次魔王出现的剩余秒数
        this.bossWarningTimer = 0;    // 预告倒计时
        this.bossActiveTimer = 0;     // 魔王已持续时间
        this.bossDamageDealt = 0;     // 本轮累计造成伤害
        this.boss = null;
        this.bossDamageRequired = 1500;
        this.bossDuration = 30;
        this.bossInterval = 60;
        this.bossWarningDuration = 5;
        this.screenShake = 0;         // 屏幕震动剩余时长

        // 天赋系统
        this.talentDefs = this._buildTalentDefs();
        this.acquiredTalents = [];      // [{ id, count }]
        this.currentTalentChoices = []; // 当前菜单的 3 张候选(talentDef)
        this.scoreMult = 1;             // 击杀分数倍率(丰厚奖励天赋)
        this.expGrowthMult = 1;         // 升级所需经验递增系数(速学天赋,<1 表示放缓)
        // 职业天赋累积倍率默认值
        this.warriorSkillDmgMult = 1;
        this.warriorRageDecayMult = 1;
        this.mageStunBonus = 0;
        this.magePenetration = 0;
        this.mageQCostMult = 1;
        this.assassinSkillDmgMult = 1;
        this.assassinExtraTargets = 0;
        this.archerSkillDmgMult = 1;
        this.archerProjSpeedMult = 1;
        this.archerMultiShot = 1;
        this.archerPiercing = 0;
        this.paladinSkillDmgMult = 1;
        this.paladinAuraDurationBonus = 0;
        // 新职业专属 flag
        this.bloodRageStacks = 0;      // 战士:血怒叠层
        this.warriorRavenous = false;  // 战士:嗜血战意
        this.mageMulticast = false;    // 法师:奥术连击
        this.mageBloodMagic = false;   // 法师:血魔契约
        this.archerAutoDmgMult = 1;    // 弓手:普攻投射物倍率
        // 魔王状态重置
        this.bossState = 'idle';
        this.bossTimer = this.bossInterval || 60;
        this.bossWarningTimer = 0;
        this.bossActiveTimer = 0;
        this.bossDamageDealt = 0;
        this.boss = null;
        this.screenShake = 0;
        this._lastBossWarnSec = 0;

        this.init();
    }

    _buildTalentDefs() {
        // rarity: 'common'(权重60) | 'rare'(权重30) | 'epic'(权重10)
        // applicable(game): 返回 true 才允许出现
        // apply(game): 执行效果
        // stackable: 是否可重复获取
        // maxStacks: 可叠加次数上限(stackable=true 时使用)
        return [
            // --- 进攻类 ---
            { id: 'blade',       name: '利刃',       icon: '⚔', color: '#ff7043', rarity: 'common',
              desc: '攻击力 +8', stackable: true, maxStacks: 99,
              apply: g => { g.player.attack += 8; } },
            { id: 'berserk',     name: '狂战',       icon: '🔥', color: '#ff3d3d', rarity: 'rare',
              desc: '攻击力 +15,防御力 -3', stackable: true, maxStacks: 5,
              apply: g => { g.player.attack += 15; g.player.defense = Math.max(0, g.player.defense - 3); } },
            { id: 'rapidFire',   name: '连射',       icon: '➳', color: '#ffb74d', rarity: 'rare',
              desc: '自动攻击间隔 ×0.85', stackable: true, maxStacks: 4,
              apply: g => { g.autoAttackInterval = Math.max(0.1, g.autoAttackInterval * 0.85); } },
            { id: 'wrath',       name: '暴怒',       icon: '💢', color: '#e53935', rarity: 'epic',
              desc: '永久效果:每损失 10% 生命,攻击力额外 +5%', stackable: false,
              apply: g => { g.player.wrathBonus = true; } },

            // --- 防御类 ---
            { id: 'ironWall',    name: '铁壁',       icon: '🛡', color: '#42a5f5', rarity: 'common',
              desc: '防御力 +5', stackable: true, maxStacks: 99,
              apply: g => { g.player.defense += 5; } },
            { id: 'vitality',    name: '生命之泉',   icon: '❤', color: '#ef5350', rarity: 'common',
              desc: '最大生命 +30 并回满', stackable: true, maxStacks: 99,
              apply: g => { g.player.maxHealth += 30; g.player.currentHealth = g.player.maxHealth; } },
            { id: 'evasion',     name: '回避',       icon: '✦', color: '#7e57c2', rarity: 'rare',
              desc: '受击后无敌帧时间 +0.3 秒', stackable: true, maxStacks: 3,
              apply: g => { g.player.hurtCooldownBonus = (g.player.hurtCooldownBonus || 0) + 0.3; } },
            { id: 'armorMaster', name: '护甲专精',   icon: '◆', color: '#26a69a', rarity: 'rare',
              desc: '防御力 +3,所有伤害额外固定减免 2', stackable: true, maxStacks: 5,
              apply: g => { g.player.defense += 3; g.player.flatDamageReduction = (g.player.flatDamageReduction || 0) + 2; } },

            // --- 移动类 ---
            { id: 'swift',       name: '疾风',       icon: '➤', color: '#66bb6a', rarity: 'common',
              desc: '移动速度 +1', stackable: true, maxStacks: 5,
              apply: g => { g.player.speed += 1; } },
            { id: 'blink',       name: '瞬步',       icon: '⚡', color: '#ffee58', rarity: 'rare',
              desc: '速度 +0.5,自动攻击伤害 +10%', stackable: true, maxStacks: 5,
              apply: g => { g.player.speed += 0.5; g.player.autoAttackDmgMult = (g.player.autoAttackDmgMult || 1) * 1.1; } },

            // --- 通用技能强化(需要对应职业 & 未满级)---
            { id: 'skillQUp',    name: 'Q 技能强化', icon: 'Q', color: '#ff8a65', rarity: 'epic',
              desc: 'Q 技能等级 +1', stackable: true, maxStacks: 2,
              applicable: g => !!g.player.class && g.player.skillQ.level < 3,
              apply: g => {
                  g.player.skillQ.level = Math.min(3, g.player.skillQ.level + 1);
                  const cdm = g._getCDMultiplier(g.player.skillQ.level);
                  const base = (CLASS_BASE_CD[g.player.class] || { q: 3 }).q;
                  g.player.skillQ.maxCooldown = base * cdm;
              } },
            { id: 'skillEUp',    name: 'E 技能强化', icon: 'E', color: '#ba68c8', rarity: 'epic',
              desc: 'E 技能等级 +1', stackable: true, maxStacks: 2,
              applicable: g => !!g.player.class && g.player.skillE.level < 3,
              apply: g => {
                  g.player.skillE.level = Math.min(3, g.player.skillE.level + 1);
                  const cdm = g._getCDMultiplier(g.player.skillE.level);
                  const base = (CLASS_BASE_CD[g.player.class] || { e: 5 }).e;
                  g.player.skillE.maxCooldown = base * cdm;
              } },

            // --- 战士专属 ---
            { id: 'warriorRageBoost', name: '怒火中烧', icon: '🔥', color: '#ff5722', rarity: 'rare',
              desc: '怒气获取量 +50%', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'warrior',
              apply: g => { g.player.rageGainMult = (g.player.rageGainMult || 1) + 0.5; } },
            { id: 'warriorHeavyHit', name: '重击', icon: '⚒', color: '#bf360c', rarity: 'rare',
              desc: '战士技能伤害 +30%', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'warrior',
              apply: g => { g.warriorSkillDmgMult = (g.warriorSkillDmgMult || 1) * 1.30; } },
            { id: 'warriorIronWill', name: '钢铁意志', icon: '✚', color: '#d84315', rarity: 'common',
              desc: '受伤额外获得 5 怒气', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'warrior',
              apply: g => { g.player.rageOnHurtBonus = (g.player.rageOnHurtBonus || 0) + 5; } },

            // --- 法师专属 ---
            { id: 'magePenetrate', name: '法术穿透', icon: '✸', color: '#26c6da', rarity: 'rare',
              desc: '法师技能无视目标 30% 防御', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'mage',
              apply: g => { g.magePenetration = (g.magePenetration || 0) + 0.3; } },
            { id: 'mageManaWell', name: '法力之泉', icon: '✺', color: '#29b6f6', rarity: 'rare',
              desc: '最大法力 +10,法力恢复 +1/s', stackable: true, maxStacks: 4,
              applicable: g => g.player.class === 'mage',
              apply: g => { g.player.maxMana += 10; g.player.manaRegen += 1; g.player.mana = g.player.maxMana; } },
            { id: 'mageFrostMastery', name: '斥力精通', icon: '↔', color: '#80deea', rarity: 'epic',
              desc: 'E 斥力波击退距离 +30% 并附加短暂僵直', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'mage',
              apply: g => { g.mageStunBonus = (g.mageStunBonus || 0) + 2; } },

            // --- 刺客专属 ---
            { id: 'assassinDeadly', name: '致命一击', icon: '☠', color: '#7b1fa2', rarity: 'rare',
              desc: '刺客技能伤害 +25%', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'assassin',
              apply: g => { g.assassinSkillDmgMult = (g.assassinSkillDmgMult || 1) * 1.25; } },
            { id: 'assassinShadow', name: '影袭', icon: '◐', color: '#9c27b0', rarity: 'common',
              desc: 'Q 闪现斩冷却 -1 秒', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'assassin' && g.player.skillQ.maxCooldown > 1,
              apply: g => { g.player.skillQ.maxCooldown = Math.max(1, g.player.skillQ.maxCooldown - 1); } },
            { id: 'assassinCombo', name: '连击专精', icon: '✕', color: '#aa00ff', rarity: 'epic',
              desc: 'E 连刺额外多攻击 1 个目标', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'assassin',
              apply: g => { g.assassinExtraTargets = (g.assassinExtraTargets || 0) + 1; } },

            // --- 弓手专属 ---
            { id: 'archerSharpshooter', name: '神射手', icon: '◎', color: '#9ccc65', rarity: 'rare',
              desc: '弓手技能伤害 +20%', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'archer',
              apply: g => { g.archerSkillDmgMult = (g.archerSkillDmgMult || 1) * 1.20; } },
            { id: 'archerBigQuiver', name: '大箭袋', icon: '⫷', color: '#558b2f', rarity: 'rare',
              desc: '最大箭矢 +2', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'archer',
              apply: g => { g.player.maxArrows += 2; g.player.arrows = g.player.maxArrows; } },
            { id: 'archerFastReload', name: '速装', icon: '⟳', color: '#33691e', rarity: 'common',
              desc: '装填时间 -0.5 秒(最低 0.3 秒)', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'archer' && g.player.reloadDuration > 0.3,
              apply: g => { g.player.reloadDuration = Math.max(0.3, g.player.reloadDuration - 0.5); } },

            // --- 圣骑士专属 ---
            { id: 'paladinHolyStrike', name: '神圣冲击', icon: '✦', color: '#ffd700', rarity: 'rare',
              desc: '圣骑士技能伤害 +30%', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'paladin',
              apply: g => { g.paladinSkillDmgMult = (g.paladinSkillDmgMult || 1) * 1.30; } },
            { id: 'paladinFaithLight', name: '持久信念', icon: '✟', color: '#ffd54f', rarity: 'rare',
              desc: '最大信念 +30,信念恢复 +3/s', stackable: true, maxStacks: 4,
              applicable: g => g.player.class === 'paladin',
              apply: g => { g.player.maxFaith += 30; g.player.faithRegen += 3; g.player.faith = g.player.maxFaith; } },
            { id: 'paladinAuraDuration', name: '光辉持续', icon: '☀', color: '#ffecb3', rarity: 'epic',
              desc: 'E 神圣光环持续时间 +2 秒', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'paladin',
              apply: g => { g.paladinAuraDurationBonus = (g.paladinAuraDurationBonus || 0) + 2; } },

            // --- 新机制相关天赋 ---
            // 战士:狂涛(怒气衰减减半)
            { id: 'warriorWildTide', name: '狂涛', icon: '〜', color: '#ff6f00', rarity: 'epic',
              desc: '怒气衰减速度 ×0.5', stackable: false,
              applicable: g => g.player.class === 'warrior',
              apply: g => { g.warriorRageDecayMult = (g.warriorRageDecayMult || 1) * 0.5; } },

            // 法师:冷凝(Q 开关消耗减半)
            { id: 'mageCondense', name: '冷凝', icon: '❅', color: '#26c6da', rarity: 'epic',
              desc: '魔力涌注每次普攻法力消耗 ×0.5', stackable: false,
              applicable: g => g.player.class === 'mage',
              apply: g => { g.mageQCostMult = (g.mageQCostMult || 1) * 0.5; } },

            // 圣骑士:壁垒(护盾上限 +5% maxHP)
            { id: 'paladinBulwark', name: '壁垒', icon: '◫', color: '#1976d2', rarity: 'epic',
              desc: '护盾上限 +5% 最大生命', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'paladin',
              apply: g => { g.player.shieldCapRatio = (g.player.shieldCapRatio || 0.10) + 0.05; } },

            // 刺客:迅捷蓄力(蓄力获取 ×2)
            { id: 'assassinSwiftCharge', name: '迅捷蓄力', icon: '➹', color: '#ba68c8', rarity: 'epic',
              desc: '移动蓄力获取速度 ×2', stackable: false,
              applicable: g => g.player.class === 'assassin',
              apply: g => { g.player.chargeGainMult = (g.player.chargeGainMult || 1) * 2; } },

            // --- 弓手投射物天赋(普攻强化)---
            { id: 'archerSwiftBolt', name: '疾矢', icon: '➳', color: '#9ccc65', rarity: 'common',
              desc: '普攻投射物速度 +25%', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'archer',
              apply: g => { g.archerProjSpeedMult = (g.archerProjSpeedMult || 1) * 1.25; } },
            { id: 'archerMultiShot', name: '多重射击', icon: '✂', color: '#7cb342', rarity: 'rare',
              desc: '普攻额外发射 1 发(扇形散布)', stackable: true, maxStacks: 1,
              applicable: g => g.player.class === 'archer' && (g.archerMultiShot || 1) < 3,
              apply: g => { g.archerMultiShot = (g.archerMultiShot || 1) + 1; } },
            { id: 'archerPiercing', name: '箭无虚发', icon: '➝', color: '#558b2f', rarity: 'epic',
              desc: '普攻穿透 1 个敌人', stackable: true, maxStacks: 1,
              applicable: g => g.player.class === 'archer' && (g.archerPiercing || 0) < 2,
              apply: g => { g.archerPiercing = (g.archerPiercing || 0) + 1; } },

            // --- 史诗类 ---
            { id: 'fastLearner', name: '速学',       icon: '★', color: '#ab47bc', rarity: 'epic',
              desc: '后续升级所需经验 ×0.8', stackable: true, maxStacks: 3,
              apply: g => { g.expToNext = Math.max(20, Math.floor(g.expToNext * 0.8)); g.expGrowthMult = (g.expGrowthMult || 1) * 0.95; } },
            { id: 'lifeSteal',   name: '生命汲取',   icon: '✜', color: '#d81b60', rarity: 'epic',
              desc: '每击杀敌人回复 5 点生命', stackable: true, maxStacks: 4,
              apply: g => { g.player.lifeStealPerKill = (g.player.lifeStealPerKill || 0) + 5; } },
            { id: 'bounty',      name: '丰厚奖励',   icon: '◈', color: '#ffca28', rarity: 'epic',
              desc: '击杀获得分数 ×2(可叠加)', stackable: true, maxStacks: 3,
              apply: g => { g.scoreMult = (g.scoreMult || 1) * 2; } },
            { id: 'heritage',    name: '传承',       icon: '♛', color: '#ff80ab', rarity: 'epic',
              desc: '生命上限 +1 并立即 +1 命', stackable: true, maxStacks: 4,
              apply: g => { g.maxLife += 1; g.life = Math.min(g.life + 1, g.maxLife); } },

            // === 强化职业特色:战士(攻高防低,怒气=攻击)===
            { id: 'warriorBloodRage', name: '血怒', icon: '🩸', color: '#d50000', rarity: 'rare',
              desc: '战士每 20 怒气提供 +5% 攻击伤害(可叠加)', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'warrior',
              apply: g => { g.bloodRageStacks = (g.bloodRageStacks || 0) + 1; } },
            { id: 'warriorRavenous', name: '嗜血战意', icon: '⚔', color: '#b71c1c', rarity: 'epic',
              desc: '战士怒气 ≥70 时全部伤害 +30%', stackable: false,
              applicable: g => g.player.class === 'warrior',
              apply: g => { g.warriorRavenous = true; } },

            // === 强化职业特色:法师(多重施法 / 法力不够血来凑)===
            { id: 'mageMulticast', name: '奥术连击', icon: '✦', color: '#26c6da', rarity: 'epic',
              desc: '斥力波释放后 0.4s 再次无消耗触发一次', stackable: false,
              applicable: g => g.player.class === 'mage',
              apply: g => { g.mageMulticast = true; } },
            { id: 'mageBloodMagic', name: '血魔契约', icon: '✟', color: '#ad1457', rarity: 'epic',
              desc: '法力不足时消耗 2× 差额生命替代', stackable: false,
              applicable: g => g.player.class === 'mage',
              apply: g => { g.mageBloodMagic = true; } },

            // === 强化职业特色:弓手(投射物伤害高,防御低)===
            { id: 'archerStrongBow', name: '强弓', icon: '⟶', color: '#7cb342', rarity: 'rare',
              desc: '弓手普攻投射物伤害 +25%(可叠加)', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'archer',
              apply: g => { g.archerAutoDmgMult = (g.archerAutoDmgMult || 1) * 1.25; } },
            { id: 'archerHunter', name: '猎手本能', icon: '◉', color: '#33691e', rarity: 'epic',
              desc: '弓手普攻投射物伤害 +60%,防御 -3', stackable: false,
              applicable: g => g.player.class === 'archer',
              apply: g => { g.archerAutoDmgMult = (g.archerAutoDmgMult || 1) * 1.60; g.player.defense = Math.max(0, g.player.defense - 3); } },

            // === 强化职业特色:刺客(高移速)===
            { id: 'assassinFleet', name: '疾影', icon: '➹', color: '#ce93d8', rarity: 'common',
              desc: '速度 +1(刺客专属,可叠加)', stackable: true, maxStacks: 5,
              applicable: g => g.player.class === 'assassin',
              apply: g => { g.player.speed += 1; } },
            { id: 'assassinShadowstep', name: '影步', icon: '☄', color: '#7b1fa2', rarity: 'epic',
              desc: '移动速度 ×1.3,刺客技能伤害 +15%', stackable: false,
              applicable: g => g.player.class === 'assassin',
              apply: g => { g.player.speed *= 1.3; g.assassinSkillDmgMult = (g.assassinSkillDmgMult || 1) * 1.15; } },

            // === 强化职业特色:圣骑士(高防低攻)===
            { id: 'paladinHolyShield', name: '圣盾术', icon: '🛡', color: '#1565c0', rarity: 'rare',
              desc: '防御 +8(圣骑士专属,可叠加)', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'paladin',
              apply: g => { g.player.defense += 8; } },
            { id: 'paladinHolyVow', name: '神圣誓约', icon: '✟', color: '#0d47a1', rarity: 'epic',
              desc: '防御 +25,攻击 -10(圣骑士专属)', stackable: false,
              applicable: g => g.player.class === 'paladin' && g.player.attack > 10,
              apply: g => { g.player.defense += 25; g.player.attack = Math.max(5, g.player.attack - 10); } }
        ];
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
        
        // 统一坐标换算
        const toCanvas = (clientX, clientY) => {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: (clientX - rect.left) * (this.canvas.width  / rect.width),
                y: (clientY - rect.top)  * (this.canvas.height / rect.height)
            };
        };

        // 点击/触摸分派:菜单 → 技能按钮 → 移动
        const handlePointer = (clientX, clientY) => {
            const { x, y } = toCanvas(clientX, clientY);

            if (this.showingPotentialMenu || this.showingClassSelection) {
                this.checkButtonClick(x, y);
                return;
            }

            if (!this.isRunning || this.isPaused) return;

            // 检查是否点在技能按钮上
            for (const btn of this.skillButtons) {
                if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                    if (btn.skill === 'Q') this.castSkillQ();
                    else                   this.castSkillE();
                    return; // 不触发移动
                }
            }

            // 否则移动
            this.setPlayerTarget(x, y);
        };

        this.canvas.addEventListener('click', (e) => {
            handlePointer(e.clientX, e.clientY);
        });

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            handlePointer(e.touches[0].clientX, e.touches[0].clientY);
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
            this._lastFrameTime = performance.now();
            this._frameAccum = 0;
            const TICK_MS = 16;
            const loop = (now) => {
                if (!this.isRunning) return;
                try {
                    const elapsed = Math.min(100, now - this._lastFrameTime); // 切后台回来时一次性补帧,封顶 100ms
                    this._lastFrameTime = now;
                    this._frameAccum += elapsed;
                    // 安全阀:累计帧步数封顶 10 帧,避免长时间冻结后死循环补帧
                    let steps = 0;
                    while (this._frameAccum >= TICK_MS && steps < 10) {
                        this.update();
                        this._frameAccum -= TICK_MS;
                        steps++;
                    }
                    if (this._frameAccum > TICK_MS * 10) this._frameAccum = 0;
                    this.render();
                } catch (err) {
                    // 不让一次异常杀死整个循环;打印堆栈供排查
                    console.error('[game loop error]', err);
                }
                this._rafId = requestAnimationFrame(loop);
            };
            this._rafId = requestAnimationFrame(loop);
        }
    }
    
    togglePause() {
        if (this.isRunning) {
            this.isPaused = !this.isPaused;
        }
    }
    
    restartGame() {
        this.isRunning = false; // 让当前 rAF 循环自然结束
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        this.player = new Player(this.width / 2, this.height / 2);
        this.enemies = [];
        this.items = [];
        this.projectiles = [];
        this.effects = [];
        this.enemyBullets = [];
        this.keys = {};
        this.isRunning = false;
        this.isPaused = false;
        this.life = 1;
        this.maxLife = 3;
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
        this.pendingActions = [];
        this._uiTimer = 0;
        this.buttons = [];
        this.skillButtons = [];
        this.freezeOverlay = null;
        this.bgTime = 0;
        this.stars = this._initStars(120);
        // 天赋状态重置
        this.acquiredTalents = [];
        this.currentTalentChoices = [];
        this.autoAttackInterval = 0.6;
        this.scoreMult = 1;
        this.expGrowthMult = 1;
        // 职业天赋累积倍率重置
        this.warriorSkillDmgMult = 1;
        this.warriorRageDecayMult = 1;
        this.mageStunBonus = 0;
        this.magePenetration = 0;
        this.mageQCostMult = 1;
        this.assassinSkillDmgMult = 1;
        this.assassinExtraTargets = 0;
        this.archerSkillDmgMult = 1;
        this.archerProjSpeedMult = 1;
        this.archerMultiShot = 1;
        this.archerPiercing = 0;
        this.paladinSkillDmgMult = 1;
        this.paladinAuraDurationBonus = 0;
        this.bloodRageStacks = 0;
        this.warriorRavenous = false;
        this.mageMulticast = false;
        this.mageBloodMagic = false;
        this.archerAutoDmgMult = 1;
        // 魔王状态重置
        this.bossState = 'idle';
        this.bossTimer = this.bossInterval || 60;
        this.bossWarningTimer = 0;
        this.bossActiveTimer = 0;
        this.bossDamageDealt = 0;
        this.boss = null;
        this.screenShake = 0;
        this._lastBossWarnSec = 0;
        document.getElementById('gameOver').style.display = 'none';
        this.updateUI();
        this.render();
    }
    
    update() {
        if (!this.isPaused) {
            this.gameTime += DT;
            // 难度更平缓且封顶，避免后期速度碾压必死
            this.difficulty = Math.min(4, 1 + this.gameTime / 90);

            // 计时器随暂停一起停（按帧推进，不再用 setTimeout）
            if (this.enemyFreezeTimer > 0) this.enemyFreezeTimer -= DT;
            this.updateInvincible();

            // 基础自动攻击：朝最近敌人(或魔王)发射,无职业/前期也有输出
            this.autoAttackTimer -= DT;
            if (this.autoAttackTimer <= 0 && (this.enemies.length > 0 || (this.boss && this.bossState === 'active'))) {
                this.shoot();
                this.autoAttackTimer = this.autoAttackInterval;
            }

            if (this.player.skillQ.cooldown > 0) this.player.skillQ.cooldown -= DT;
            if (this.player.skillE.cooldown > 0) this.player.skillE.cooldown -= DT;

            if (this.player.class === 'mage' && this.player.mana < this.player.maxMana) {
                this.player.mana = Math.min(this.player.maxMana, this.player.mana + this.player.manaRegen * DT);
            }
            // 战士怒气自动衰减(战斗中也持续)
            if (this.player.class === 'warrior' && this.player.rage > 0) {
                const decayRate = 2 * (this.warriorRageDecayMult || 1); // /秒
                this.player.rage = Math.max(0, this.player.rage - decayRate * DT);
            }
            // 圣骑士护盾持续回复(上限 = maxHealth * shieldCapRatio)
            if (this.player.class === 'paladin') {
                const cap = this.player.maxHealth * (this.player.shieldCapRatio || 0.10);
                if (this.player.shield < cap) {
                    const regen = this.player.maxHealth * 0.02; // /秒(2% maxHP)
                    this.player.shield = Math.min(cap, this.player.shield + regen * DT);
                }
            }
            if (this.player.class === 'archer' && this.player.reloadTimer > 0) {
                this.player.reloadTimer -= DT;
                if (this.player.reloadTimer <= 0) {
                    this.player.arrows = Math.min(this.player.arrows + 1, this.player.maxArrows);
                    // 没装满就继续下一发
                    if (this.player.arrows < this.player.maxArrows) {
                        this.player.reloadTimer = this.player.reloadDuration;
                    } else {
                        this.player.reloadTimer = 0;
                    }
                }
            }
            if (this.player.class === 'paladin') {
                if (this.player.faith < this.player.maxFaith) {
                    this.player.faith = Math.min(this.player.maxFaith, this.player.faith + this.player.faithRegen * DT);
                }
                if (this.player.holyAuraActive) {
                    this.player.holyAuraTimer -= DT;
                    if (this.player.holyAuraTimer <= 0) {
                        this.player.holyAuraActive = false;
                    } else {
                        this.player.heal(this.player.maxHealth * 0.1 * DT);
                        const pcx = this.player.x + this.player.size / 2;
                        const pcy = this.player.y + this.player.size / 2;
                        const auraDmgTick = this._computeAttackDamage(this.player.attack) * 0.5 * DT * (this.paladinSkillDmgMult || 1);
                        for (let i = this.enemies.length - 1; i >= 0; i--) {
                            const e = this.enemies[i];
                            const dx = e.x + e.size / 2 - pcx;
                            const dy = e.y + e.size / 2 - pcy;
                            if (Math.sqrt(dx * dx + dy * dy) <= 80) {
                                e.takeDamage(auraDmgTick);
                                if (e.currentHealth <= 0) {
                                    this.spawnHitParticles(e.x + e.size / 2, e.y + e.size / 2, e.color, 10);
                                    this._onEnemyKilled();
                                    this.enemies.splice(i, 1);
                                }
                            }
                        }
                        // 圣光光环对魔王也持续造伤
                        if (this.boss && this.bossState === 'active') {
                            const bx = this.boss.x + this.boss.size / 2;
                            const by = this.boss.y + this.boss.size / 2;
                            if (Math.sqrt((bx - pcx) ** 2 + (by - pcy) ** 2) <= 80 + this.boss.size / 2) {
                                this.boss.takeDamage(auraDmgTick);
                                this.bossDamageDealt += auraDmgTick;
                            }
                        }
                        this.effects.push({ type: 'holyAura', x: pcx, y: pcy, radius: 80, color: '#ffd700', ttl: 0.35, maxTtl: 0.35, pulse: this.player.holyAuraTimer });
                    }
                }
            }

            this.bgTime += DT;
            this.updatePlayer();
            this.updateEnemies();
            this.updateEnemyBullets();
            this.updateItems();
            this.updateProjectiles();
            this.updateEffects();
            this.updateParticles();
            this._updateBoss();
            this._tickPendingActions();
            this.checkCollisions();
            this.spawnEnemies();
            this.spawnItems();
            // updateUI 降频:每 100ms 刷新一次 DOM
            this._uiTimer += DT;
            if (this._uiTimer >= 0.1) {
                this.updateUI();
                this._uiTimer = 0;
            }
            this.checkGameOver();

            // 屏幕震动衰减
            if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - DT);
        }
    }

    _tickPendingActions() {
        // 按帧推进延迟动作,暂停时自动停止,避免 setTimeout 在菜单/暂停期间继续触发
        for (let i = this.pendingActions.length - 1; i >= 0; i--) {
            const a = this.pendingActions[i];
            a.delay -= DT;
            if (a.delay <= 0) {
                this.pendingActions.splice(i, 1);
                try { a.fn(); } catch (e) { console.error(e); }
            }
        }
    }

    _updateBoss() {
        switch (this.bossState) {
            case 'idle': {
                this.bossTimer -= DT;
                if (this.bossTimer <= 0) {
                    this.bossState = 'warning';
                    this.bossWarningTimer = this.bossWarningDuration;
                    this._showFloatingText('魔王降临!', this.width / 2, this.height * 0.35, '#ff1744');
                }
                break;
            }
            case 'warning': {
                this.bossWarningTimer -= DT;
                this.screenShake = 0.2; // 持续震动
                // 倒计时每整秒提示
                const sec = Math.ceil(this.bossWarningTimer);
                if (sec !== this._lastBossWarnSec && sec > 0) {
                    this._lastBossWarnSec = sec;
                    this._showFloatingText(`${sec}`, this.width / 2, this.height / 2, '#ff5252');
                }
                if (this.bossWarningTimer <= 0) {
                    this._spawnBoss();
                }
                break;
            }
            case 'active': {
                if (!this.boss) { this.bossState = 'idle'; this.bossTimer = this.bossInterval; break; }
                this.boss.update(this.player.x, this.player.y);
                this.bossActiveTimer += DT;

                // 受击判定:魔王 vs 玩家
                if (this.checkCollision(this.player, this.boss)) {
                    if (this.player.hurtCooldown <= 0) {
                        this.player.takeDamage(this.boss.attack);
                        this.player.hurtCooldown = 0.6 + (this.player.hurtCooldownBonus || 0);
                        this.player.gainRage(15 + (this.player.rageOnHurtBonus || 0));
                        this.spawnHitParticles(this.player.x + this.player.size / 2, this.player.y + this.player.size / 2, '#ff1744', 16);
                        this.screenShake = 0.3;
                    }
                    // 玩家挨打位移(被推开)
                    const dx = this.player.x - this.boss.x;
                    const dy = this.player.y - this.boss.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    this.player.x = Math.max(0, Math.min(this.width - this.player.size, this.player.x + (dx / dist) * 15));
                    this.player.y = Math.max(0, Math.min(this.height - this.player.size, this.player.y + (dy / dist) * 15));
                    // 玩家死亡检查
                    if (this.player.currentHealth <= 0) {
                        this.life--;
                        if (this.life > 0) {
                            this.player.x = this.width / 2;
                            this.player.y = this.height / 2;
                            this.player.currentHealth = this.player.maxHealth;
                            this.player.hurtCooldown = 1.5;
                        }
                    }
                }

                // 投射物 vs 魔王(单独处理,因为 boss 不在 enemies 数组里)
                for (let i = this.projectiles.length - 1; i >= 0; i--) {
                    const proj = this.projectiles[i];
                    if (proj.isPiercing && !proj.pierceRemaining) continue; // PiercingArrow 自处理
                    if (this.checkCollision(proj, this.boss)) {
                        if (proj.hitEnemies && proj.hitEnemies.has(this.boss)) continue;
                        const dmg = proj.damage != null ? proj.damage : 15;
                        this.boss.takeDamage(dmg);
                        this.bossDamageDealt += dmg;
                        if (proj.hitEnemies) proj.hitEnemies.add(this.boss);
                        this.spawnHitParticles(this.boss.x + this.boss.size / 2, this.boss.y + this.boss.size / 2, '#ff1744', 6);
                        if (proj.pierceRemaining && proj.pierceRemaining > 0) {
                            proj.pierceRemaining--;
                            if (proj.pierceRemaining <= 0) this.projectiles.splice(i, 1);
                        } else {
                            this.projectiles.splice(i, 1);
                        }
                    }
                }

                // 战士近战光环(在 shoot 里只对 enemies 命中,需要补一个对 boss 的检测)
                // — 已通过 _warriorMeleeAttack 命中 enemies。我们在这里"补打"魔王:
                // 注:战士每 autoAttackInterval 触发一次,这里独立检测一次会重复。
                // 改为:_warriorMeleeAttack 内补打 boss(已确保只在 shoot 时触发)
                // 此处仅累计天赋触发的玩家命中伤害:_dealDamage 不进 boss,所以不重复

                // 击退判定:HP 归零 或 累计伤害达标 或 时间到
                const dmgGoal = this.bossDamageRequired * this.difficulty;
                const repelled = this.boss.currentHealth <= 0
                    || this.bossDamageDealt >= dmgGoal
                    || this.bossActiveTimer >= this.bossDuration;
                if (repelled) this._repelBoss();
                break;
            }
            case 'retreating': {
                if (this.boss) {
                    this.boss.update(this.player.x, this.player.y);
                    if (this.boss.retreatTimer <= 0) {
                        this.boss = null;
                        this.bossState = 'idle';
                        this.bossTimer = this.bossInterval;
                    }
                }
                break;
            }
        }
    }

    _spawnBoss() {
        // 在屏幕外随机一侧生成
        let x, y;
        if (Math.random() < 0.5) {
            x = Math.random() < 0.5 ? -100 : this.width + 20;
            y = Math.random() * this.height;
        } else {
            x = Math.random() * this.width;
            y = Math.random() < 0.5 ? -100 : this.height + 20;
        }
        this.boss = new BlockBoss(x, y, this.difficulty, this.player.maxHealth);
        this.bossState = 'active';
        this.bossActiveTimer = 0;
        this.bossDamageDealt = 0;
        this.screenShake = 0.6;
        // 出场闪白 / 大震动
        this.effects.push({ type: 'shockwave', x: this.boss.x + 40, y: this.boss.y + 40, radius: 5, maxRadius: 200, color: '#ff1744', ttl: 0.8, maxTtl: 0.8 });
        this.spawnParticles(this.boss.x + 40, this.boss.y + 40, '#ff1744', 30, 2, 6, 3, 6, 0.03);
        this._showFloatingText('方块大魔王!', this.width / 2, this.height * 0.4, '#ff1744');
    }

    _repelBoss() {
        if (!this.boss) return;
        // 奖励
        this.life = Math.min(this.life + 1, this.maxLife);
        this.player.addPotentialPoints(1);
        this.score += 100 * (this.scoreMult || 1);
        // 击退动画
        this.boss.triggerRetreat(this.player.x, this.player.y);
        this.bossState = 'retreating';
        // 视效:闪白 + 大粒子爆发
        this.effects.push({ type: 'shockwave', x: this.boss.x + 40, y: this.boss.y + 40, radius: 10, maxRadius: 250, color: '#ffffff', ttl: 0.7, maxTtl: 0.7 });
        this.spawnParticles(this.boss.x + 40, this.boss.y + 40, '#ffeb3b', 40, 2, 7, 3, 6, 0.03);
        this.spawnParticles(this.boss.x + 40, this.boss.y + 40, '#ffffff', 20, 3, 8, 2, 5, 0.04);
        this._showFloatingText('击退魔王!  +1 命  +1 潜能  +100 分', this.width / 2, this.height * 0.4, '#ffeb3b');
        this.screenShake = 0.5;
        // 立即弹天赋菜单(奖励的潜能点)
        this.showPotentialMenu();
    }
    
    updatePlayer() {
        this.player.update(this.keys, this.width, this.height);
    }
    
    updateEnemies() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (this.enemyFreezeTimer <= 0) {
                e.update(this.player.x, this.player.y, this.width, this.height);
            }
            // 炮手开火:取出 pendingShot 并生成敌方子弹
            if (e.pendingShot) {
                const s = e.pendingShot;
                this.enemyBullets.push(new EnemyBullet(s.x, s.y, s.vx, s.vy, s.damage));
                this.spawnParticles(s.x, s.y, '#ff9800', 5, 2, 4, 1, 3, 0.07);
                e.pendingShot = null;
            }
            if (e.currentHealth <= 0) {
                this._onEnemyKilled();
                this.enemies.splice(i, 1);
            }
        }
    }

    updateEnemyBullets() {
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            b.update();
            if (b.x < -20 || b.x > this.width + 20 || b.y < -20 || b.y > this.height + 20) {
                this.enemyBullets.splice(i, 1);
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
                    this.player.hurtCooldown = 0.6 + (this.player.hurtCooldownBonus || 0);
                    this.player.gainRage(15 + (this.player.rageOnHurtBonus || 0));
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
                    this._onEnemyKilled();
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

        // 敌方子弹碰玩家
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            if (this.checkCollision(this.player, b)) {
                if (this.player.hurtCooldown <= 0) {
                    this.player.takeDamage(b.damage);
                    this.player.hurtCooldown = 0.6 + (this.player.hurtCooldownBonus || 0);
                    this.player.gainRage(15 + (this.player.rageOnHurtBonus || 0));
                    this.spawnHitParticles(this.player.x + this.player.size / 2, this.player.y + this.player.size / 2, '#ff9800', 8);
                    if (this.player.currentHealth <= 0) {
                        this.life--;
                        if (this.life > 0) {
                            this.player.x = this.width / 2;
                            this.player.y = this.height / 2;
                            this.player.currentHealth = this.player.maxHealth;
                            this.player.hurtCooldown = 1.5;
                        }
                    }
                }
                this.enemyBullets.splice(i, 1);
            }
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            // PiercingArrow 走自己的碰撞逻辑
            if (proj.isPiercing && !proj.pierceRemaining) continue;
            let hit = false;
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                if (this.checkCollision(proj, this.enemies[j])) {
                    // 有限穿透:已命中过的同一敌人跳过
                    if (proj.hitEnemies && proj.hitEnemies.has(this.enemies[j])) continue;
                    const dmg = proj.damage != null ? proj.damage : 15;
                    this.enemies[j].takeDamage(dmg);
                    if (proj.hitEnemies) proj.hitEnemies.add(this.enemies[j]);
                    // 投射物击杀立即结算
                    if (this.enemies[j].currentHealth <= 0) {
                        this.spawnHitParticles(this.enemies[j].x + this.enemies[j].size / 2, this.enemies[j].y + this.enemies[j].size / 2, this.enemies[j].color, 10);
                        this._onEnemyKilled();
                        this.enemies.splice(j, 1);
                    } else {
                        this.spawnHitParticles(this.enemies[j].x + this.enemies[j].size / 2, this.enemies[j].y + this.enemies[j].size / 2, '#ffaa00', 4);
                    }
                    // 有限穿透 → 计数,用完才销毁;无穿透 → 立即销毁
                    if (proj.pierceRemaining && proj.pierceRemaining > 0) {
                        proj.pierceRemaining--;
                        if (proj.pierceRemaining <= 0) {
                            hit = true;
                            break;
                        }
                        // 继续穿透下一敌人(本帧)
                    } else {
                        hit = true;
                        break;
                    }
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
        // 魔王活跃 / 击退中,停刷普通敌人
        if (this.bossState === 'active' || this.bossState === 'retreating') return;
        // 刷怪概率随难度上升但封顶,避免后期数量碾压
        const spawnChance = Math.min(0.045, 0.018 + 0.008 * (this.difficulty - 1));
        if (Math.random() < spawnChance) {
            // 使用加权随机降低巨型追击者的刷新概率
            // chaser 50% / patroller 28% / gunner 17% / giant 5%
            let type;
            const rand = Math.random();
            if (rand < 0.50)      type = 'chaser';
            else if (rand < 0.78) type = 'patroller';
            else if (rand < 0.95) type = 'gunner';
            else                  type = 'giant';
            
            let x, y;

            if (type === 'gunner') {
                // 炮手不会移动,必须生成在屏幕内边缘(距边 30~100px)且远离玩家
                const margin = 30;
                const inset  = 100;
                let attempts = 0;
                do {
                    const side = Math.floor(Math.random() * 4);
                    if (side === 0)      { x = margin + Math.random() * inset;              y = margin + Math.random() * (this.height - margin * 2); }
                    else if (side === 1) { x = this.width - margin - inset + Math.random() * inset; y = margin + Math.random() * (this.height - margin * 2); }
                    else if (side === 2) { x = margin + Math.random() * (this.width - margin * 2); y = margin + Math.random() * inset; }
                    else                { x = margin + Math.random() * (this.width - margin * 2); y = this.height - margin - inset + Math.random() * inset; }
                    attempts++;
                    // 与玩家保持至少 200px 距离
                } while (attempts < 10 && Math.hypot(x - this.player.x, y - this.player.y) < 200);
            } else if (Math.random() < 0.5) {
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
        // 降低道具刷新频率以提高难度(原 0.015)
        if (Math.random() < 0.008) {
            // 加权随机:potion 35 / exp_book 25 / snowflake 15 / bomb 12 / heart 8 / potion_invicible 5
            const itemPool = [
                { type: 'potion',           weight: 35 },
                { type: 'exp_book',         weight: 25 },
                { type: 'snowflake',        weight: 15 },
                { type: 'bomb',             weight: 12 },
                { type: 'heart',            weight: 8  },
                { type: 'potion_invicible', weight: 5  }
            ];
            let total = 0;
            for (const it of itemPool) total += it.weight;
            let roll = Math.random() * total;
            let type = itemPool[0].type;
            for (const it of itemPool) {
                roll -= it.weight;
                if (roll <= 0) { type = it.type; break; }
            }
            const x = Math.random() * (this.width - 30);
            const y = Math.random() * (this.height - 30);
            this.items.push(new Item(x, y, type));
        }
    }
    
    collectItem(item) {
        // 拾取视觉反馈:按稀有度爆出粒子 + 飘字
        const cx = item.x + item.size / 2;
        const cy = item.y + item.size / 2;
        const burstCount = { common: 12, rare: 20, epic: 30 }[item.rarity] || 12;
        this.spawnBurstRing(cx, cy, item.size * 1.5, item.color, burstCount);
        this.spawnParticles(cx, cy, item.color, burstCount, 1.5, 5, 2, 5, 0.04);
        // 史诗道具额外金色光圈
        if (item.rarity === 'epic') {
            this.effects.push({ type: 'shockwave', x: cx, y: cy, radius: 10, maxRadius: 80, color: '#ffd700', ttl: 0.6, maxTtl: 0.6 });
            this.spawnParticles(cx, cy, '#ffd700', 16, 2, 6, 2, 4, 0.03);
        } else if (item.rarity === 'rare') {
            this.effects.push({ type: 'shockwave', x: cx, y: cy, radius: 8, maxRadius: 50, color: item.color, ttl: 0.45, maxTtl: 0.45 });
        }

        let label = '';
        switch (item.type) {
            case 'potion':
                this.player.heal(50);
                label = '+50 HP';
                break;
            case 'snowflake':
                this.freezeEnemies(5000);
                label = '冻结 5s';
                break;
            case 'bomb':
                this.explodeBomb(this.player.x, this.player.y, 150);
                label = '💥 清场';
                break;
            case 'heart':
                this.life = Math.min(this.life + 1, this.maxLife);
                label = '+1 命';
                break;
            case 'potion_invicible':
                this.activateInvincible(10000);
                label = '无敌 10s';
                break;
            case 'exp_book':
                this.exp += 15;
                this.checkLevelUp();
                label = '+15 EXP';
                break;
        }
        if (label) this._showFloatingText(label, cx, cy - 12, item.color);
    }
    
    freezeEnemies(duration) {
        // 按帧计时，暂停时一起停，且对定身期间新刷出的敌人同样生效
        this.enemyFreezeTimer = duration / 1000;
        // 生成全屏冰封特效数据
        this._initFreezeOverlay(duration / 1000);
    }

    _initFreezeOverlay(duration) {
        // 随机预生成冰裂纹路径（坐标归一化到 0~1，渲染时乘以 width/height）
        const cracks = [];
        for (let i = 0; i < 18; i++) {
            // 从四条边随机出发的折线
            const side = Math.floor(Math.random() * 4);
            let sx, sy;
            if (side === 0) { sx = Math.random(); sy = 0; }
            else if (side === 1) { sx = 1; sy = Math.random(); }
            else if (side === 2) { sx = Math.random(); sy = 1; }
            else { sx = 0; sy = Math.random(); }
            const segs = [];
            let cx = sx, cy = sy;
            const angle = Math.atan2(0.5 - cy, 0.5 - cx) + (Math.random() - 0.5) * 0.8;
            for (let s = 0; s < 5 + Math.floor(Math.random() * 4); s++) {
                const len = 0.04 + Math.random() * 0.08;
                const a = angle + (Math.random() - 0.5) * 0.6;
                const nx = Math.min(1, Math.max(0, cx + Math.cos(a) * len));
                const ny = Math.min(1, Math.max(0, cy + Math.sin(a) * len));
                segs.push({ x: nx, y: ny });
                cx = nx; cy = ny;
            }
            cracks.push({ sx, sy, segs, width: 0.5 + Math.random() * 1.5 });
        }
        // 四角冰晶簇（每角若干尖刺）
        const corners = [];
        const cornerDefs = [[0,0,0.55],[1,0,2.3],[1,1,3.9],[0,1,5.5]];
        for (const [ox, oy, baseAngle] of cornerDefs) {
            for (let i = 0; i < 6 + Math.floor(Math.random() * 4); i++) {
                const a = baseAngle + (Math.random() - 0.5) * 1.2;
                const len = 0.08 + Math.random() * 0.14;
                const w = 0.012 + Math.random() * 0.018;
                corners.push({ ox, oy, a, len, w });
            }
        }
        this.freezeOverlay = { duration, cracks, corners };
    }

    addEffect(x, y, radius, color, duration) {
        this.effects.push({ x, y, radius, color, ttl: duration, maxTtl: duration });
    }

    updateEffects() {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            this.effects[i].ttl -= DT;
            if (this.effects[i].ttl <= 0) this.effects.splice(i, 1);
        }
    }

    spawnHitParticles(x, y, color, count) {
        // 粒子数量上限,避免密集场景导致掉帧
        const cap = 500;
        if (this.particles.length >= cap) return;
        count = Math.min(count, cap - this.particles.length);
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
        const cap = 500;
        if (this.particles.length >= cap) return;
        count = Math.min(count, cap - this.particles.length);
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
        const cap = 500;
        if (this.particles.length >= cap) return;
        count = Math.min(count, cap - this.particles.length);
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
                this._onEnemyKilled();
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
        // 记录"无敌期间额外加上"的增量，结束时减回去。
        // 这样无敌期间获得的任何外部修改（天赋、升级、其它道具）都能保留。
        const sizeBonus = this.player.size;       // +1x 原值 = 翻倍
        const attackBonus = this.player.attack;
        const defenseBonus = this.player.defense;

        this.player.invincibleSizeBonus = sizeBonus;
        this.player.invincibleAttackBonus = attackBonus;
        this.player.invincibleDefenseBonus = defenseBonus;

        this.player.size += sizeBonus;
        this.player.attack += attackBonus;
        this.player.defense += defenseBonus;
        this.player.color = '#ffeb3b';
        this.player.invincibleTimer = duration / 1000;
    }

    updateInvincible() {
        if (this.player.invincibleTimer > 0) {
            this.player.invincibleTimer -= DT;
            if (this.player.invincibleTimer <= 0) {
                this.player.invincibleTimer = 0;
                // 减回无敌时加的增量，无敌期间任何外部加成都被保留
                this.player.size -= (this.player.invincibleSizeBonus || 0);
                this.player.attack -= (this.player.invincibleAttackBonus || 0);
                this.player.defense -= (this.player.invincibleDefenseBonus || 0);
                this.player.invincibleSizeBonus = 0;
                this.player.invincibleAttackBonus = 0;
                this.player.invincibleDefenseBonus = 0;
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
        // 包含魔王(若存在且活跃),让技能能锁定魔王
        // count=1 走 O(n) 单次扫描;否则才排序
        if (count === 1) {
            const t = this._findClosestTarget();
            return t ? [t] : [];
        }
        const pool = this.enemies.slice();
        if (this.boss && this.bossState === 'active') pool.push(this.boss);
        const px = this.player.x, py = this.player.y;
        pool.sort((a, b) => {
            const dxa = a.x - px, dya = a.y - py;
            const dxb = b.x - px, dyb = b.y - py;
            return (dxa * dxa + dya * dya) - (dxb * dxb + dyb * dyb);
        });
        return pool.slice(0, count);
    }

    _findClosestTarget() {
        // O(n) 找最近敌人(含活跃魔王),无敌人返回 null
        let closest = null;
        let bestD = Infinity;
        const px = this.player.x, py = this.player.y;
        for (const e of this.enemies) {
            const dx = e.x - px, dy = e.y - py;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; closest = e; }
        }
        if (this.boss && this.bossState === 'active') {
            const dx = this.boss.x - px, dy = this.boss.y - py;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; closest = this.boss; }
        }
        return closest;
    }

    _dealDamage(target, dmg) {
        target.takeDamage(dmg);
        this.player.gainRage(10);
        // 魔王特殊处理:不死亡,只累计伤害
        if (this.boss && target === this.boss) {
            this.bossDamageDealt += dmg;
            this.spawnHitParticles(target.x + target.size / 2, target.y + target.size / 2, '#ff1744', 6);
            return;
        }
        if (target.currentHealth <= 0) {
            const idx = this.enemies.indexOf(target);
            if (idx >= 0) {
                this.spawnHitParticles(target.x + target.size / 2, target.y + target.size / 2, target.color, 10);
                this._onEnemyKilled();
                this.enemies.splice(idx, 1);
            }
        } else {
            this.spawnHitParticles(target.x + target.size / 2, target.y + target.size / 2, '#ffaa00', 4);
        }
    }

    _consumeAssassinCharge() {
        // 清空蓄力,返回伤害倍率(1 + charge*0.02,charge=100 时 ×3)
        const stock = this.player.assassinCharge;
        this.player.assassinCharge = 0;
        const mult = 1 + stock * 0.02;
        if (stock > 5) {
            const pcx = this.player.x + this.player.size / 2;
            const pcy = this.player.y + this.player.size / 2;
            this._showFloatingText(`蓄力 ×${mult.toFixed(2)}`, pcx, pcy - 30, '#ce93d8');
            this.spawnParticles(pcx, pcy, '#aa66ff', Math.min(20, Math.floor(stock / 5)), 2, 5, 2, 4, 0.05);
        }
        return mult;
    }

    _consumeArrows(n) {
        // 装填中(reloadTimer > 0)拒绝所有施法,并给视觉反馈
        if (this.player.reloadTimer > 0) {
            this._showFloatingText('装填中', this.player.x + this.player.size / 2, this.player.y - 20, '#ff5252');
            return false;
        }
        if (this.player.arrows < n) {
            this._showFloatingText('箭矢不足', this.player.x + this.player.size / 2, this.player.y - 20, '#ff5252');
            return false;
        }
        this.player.arrows -= n;
        // 箭袋打空 → 启动装填
        if (this.player.arrows <= 0 && this.player.reloadTimer <= 0) {
            this.player.reloadTimer = this.player.reloadDuration;
        }
        return true;
    }

    _showFloatingText(text, x, y, color) {
        this.effects.push({ type: 'floatText', text, x, y, color, ttl: 0.8, maxTtl: 0.8 });
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
        if (this.player.rage < 30) return;
        this.player.rage -= 30;
        const dmg = this._computeAttackDamage(this.player.attack) * 1.5 * this._getSkillMultiplier(skill.level) * (this.warriorSkillDmgMult || 1);
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
        // 魔王也在范围内则命中
        if (this.boss && this.bossState === 'active') {
            const bx = this.boss.x + this.boss.size / 2;
            const by = this.boss.y + this.boss.size / 2;
            if (Math.sqrt((bx - pcx) ** 2 + (by - pcy) ** 2) <= range + this.boss.size / 2) {
                this._dealDamage(this.boss, dmg);
            }
        }
        this.effects.push({ type: 'ring', x: pcx, y: pcy, radius: range, color: '#ff6030', ttl: 0.5, maxTtl: 0.5, rotation: 0, rotSpeed: 4 });
        this.spawnBurstRing(pcx, pcy, range * 0.6, '#ff8040', particleCount);
        this.spawnParticles(pcx, pcy, '#ff4020', particleCount, 2, 6, 2, 5, 0.04);
        skill.cooldown = skill.maxCooldown;
    }

    _warriorE(skill) {
        if (this.player.rage < 50) return;
        const targets = this._findClosestEnemies(1);
        if (targets.length === 0) return;
        this.player.rage -= 50;
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
            const dmg = this._computeAttackDamage(this.player.attack) * 2 * this._getSkillMultiplier(skill.level) * (this.warriorSkillDmgMult || 1);
            this._dealDamage(target, dmg);
            this.effects.push({ type: 'slash', x1: pcx, y1: pcy, x2: pcx + nx * 100, y2: pcy + ny * 100, color: '#4488ff', ttl: 0.3, maxTtl: 0.3 });
            this.effects.push({ type: 'shockwave', x: tcx, y: tcy, radius: 10, maxRadius: 80, color: '#88aaff', ttl: 0.35, maxTtl: 0.35 });
            this.spawnParticles(tcx, tcy, '#4488ff', 12, 2, 5, 2, 5, 0.04);
        }
        skill.cooldown = skill.maxCooldown;
    }

    _mageQ(skill) {
        // 切换"魔力涌注"开关:激活后每次普攻附加 maxMana×1.5 法术伤害,消耗 10% maxMana
        this.player.qToggleActive = !this.player.qToggleActive;
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        if (this.player.qToggleActive) {
            this._showFloatingText('魔力涌注 开', pcx, pcy - 30, '#80deea');
            this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 5, maxRadius: 50, color: '#4ecdc4', ttl: 0.4, maxTtl: 0.4 });
        } else {
            this._showFloatingText('魔力涌注 关', pcx, pcy - 30, '#90a4ae');
        }
        skill.cooldown = 0.5; // 防狂按
    }

    _mageE(skill) {
        if (!this._payMana(3)) return;
        this._mageRepulseEffect(skill);
        // 奥术连击:0.4s 后再次无消耗触发一次
        if (this.mageMulticast) {
            this.pendingActions.push({ delay: 0.4, fn: () => this._mageRepulseEffect(skill) });
        }
        skill.cooldown = skill.maxCooldown;
    }

    _mageRepulseEffect(skill) {
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const range      = skill.level >= 3 ? 210 : 160;
        // 击退力度:3级更强
        const pushForce  = skill.level >= 3 ? 220 : skill.level === 2 ? 180 : 140;
        const dmg        = this._computeAttackDamage(this.player.attack) * 1.0
                           * this._getSkillMultiplier(skill.level)
                           * (1 + (this.magePenetration || 0));
        const stunBonus  = this.mageStunBonus || 0; // 天赋"寒冰精通"复用:短暂僵直
        const particleCount = skill.level >= 3 ? 36 : 24;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const ex = e.x + e.size / 2;
            const ey = e.y + e.size / 2;
            const dx = ex - pcx;
            const dy = ey - pcy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= range) {
                // 距离越近推得越远(近处最多 pushForce,边缘衰减到 40%)
                const ratio = dist > 0 ? dist / range : 0;
                const actualPush = pushForce * (1 - ratio * 0.6);
                const nx = dist > 0 ? dx / dist : Math.random() - 0.5;
                const ny = dist > 0 ? dy / dist : Math.random() - 0.5;
                e.x += nx * actualPush;
                e.y += ny * actualPush;
                // 短暂僵直(天赋加成),让玩家有反应时间
                if (stunBonus > 0) e.stunTimer = Math.max(e.stunTimer, 0.4 + stunBonus * 0.2);
                this._dealDamage(e, dmg);
                // 击退粒子
                this.spawnParticles(ex, ey, '#80d8ff', 4, 2, 5, 1, 3, 0.06);
            }
        }
        // 魔王:推力减半,短暂减速
        if (this.boss && this.bossState === 'active') {
            const bx = this.boss.x + this.boss.size / 2;
            const by = this.boss.y + this.boss.size / 2;
            const dx = bx - pcx, dy = by - pcy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= range + this.boss.size / 2) {
                const nx = dist > 0 ? dx / dist : 0;
                const ny = dist > 0 ? dy / dist : 0;
                this.boss.x += nx * pushForce * 0.35;
                this.boss.y += ny * pushForce * 0.35;
                if (stunBonus > 0) this.boss.stunTimer = Math.min(1.0, stunBonus * 0.15);
                this._dealDamage(this.boss, dmg);
            }
        }

        // 视觉:扩散冲击波 + 放射线粒子
        this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 14, maxRadius: range, color: '#80d8ff', ttl: 0.45, maxTtl: 0.45 });
        this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 6,  maxRadius: range * 0.6, color: '#ffffff', ttl: 0.3, maxTtl: 0.3 });
        this.spawnBurstRing(pcx, pcy, range * 0.4, '#b3e5fc', particleCount);
        // 放射状光线
        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2;
            this.effects.push({
                type: 'iceShard',
                x: pcx, y: pcy,
                angle,
                length: 20 + Math.random() * 14,
                color: '#e1f5fe',
                ttl: 0.35, maxTtl: 0.35
            });
        }
        this._showFloatingText('斥力波！', pcx, pcy - 28, '#80d8ff');
        this.screenShake = 0.18;
    }

    _payMana(cost) {
        // 法师法力支付辅助:成功返回 true
        // 若蓝不够且开启"血魔契约",改用 2× 差额生命补足
        if (this.player.mana >= cost) { this.player.mana -= cost; return true; }
        if (this.mageBloodMagic) {
            const deficit = cost - this.player.mana;
            const hpCost = deficit * 2;
            if (this.player.currentHealth > hpCost + 1) {
                this.player.mana = 0;
                this.player.currentHealth -= hpCost;
                this._showFloatingText(`血魔 -${Math.ceil(hpCost)}`, this.player.x + this.player.size / 2, this.player.y - 20, '#ff1744');
                this.spawnHitParticles(this.player.x + this.player.size / 2, this.player.y + this.player.size / 2, '#ff1744', 6);
                return true;
            }
        }
        return false;
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
        const chargeMult = this._consumeAssassinCharge();
        const dmg = this._computeAttackDamage(this.player.attack) * 2.5 * this._getSkillMultiplier(skill.level) * (this.assassinSkillDmgMult || 1) * chargeMult;
        this._dealDamage(target, dmg);
        const newPcx = this.player.x + this.player.size / 2;
        const newPcy = this.player.y + this.player.size / 2;
        this.spawnParticles(newPcx, newPcy, '#cc88ff', 8, 2, 4, 2, 4, 0.05);
        this.spawnSlashEffect(newPcx - 20, newPcy - 20, newPcx + 20, newPcy + 20, '#dd88ff');
        this.spawnSlashEffect(newPcx - 20, newPcy + 20, newPcx + 20, newPcy - 20, '#dd88ff');
        skill.cooldown = skill.maxCooldown;
    }

    _assassinE(skill) {
        const baseTargets = 3 + (this.assassinExtraTargets || 0);
        const targets = this._findClosestEnemies(baseTargets);
        if (targets.length === 0) return;
        const chargeMult = this._consumeAssassinCharge();
        for (let idx = 0; idx < targets.length; idx++) {
            const t = targets[idx];
            this.pendingActions.push({
                delay: idx * 0.1,
                fn: () => {
                    if (t.currentHealth <= 0) return;
                    const dmg = this._computeAttackDamage(this.player.attack) * 1.0 * this._getSkillMultiplier(skill.level) * (this.assassinSkillDmgMult || 1) * chargeMult;
                    this._dealDamage(t, dmg);
                    const tx = t.x + t.size / 2;
                    const ty = t.y + t.size / 2;
                    this.spawnSlashEffect(tx - 25, ty, tx + 25, ty, '#ffffff');
                    this.spawnSlashEffect(tx, ty - 25, tx, ty + 25, '#ffffff');
                    this.spawnParticles(tx, ty, '#ffffff', 6, 2, 4, 1, 3, 0.06);
                }
            });
        }
        skill.cooldown = skill.maxCooldown;
    }

    _archerQ(skill) {
        // 最后一发判定:在消耗前先看是不是最后一发
        const isLastArrow = this.player.arrows === 1;
        if (!this._consumeArrows(1)) return;
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const targets = this._findClosestEnemies(1);
        let angle = 0;
        if (targets.length > 0) {
            const t = targets[0];
            angle = Math.atan2(t.y + t.size / 2 - pcy, t.x + t.size / 2 - pcx);
        }
        const speed = 12;
        const lastArrowMult = isLastArrow ? 2 : 1;
        const dmg = this._computeAttackDamage(this.player.attack) * 1.8 * this._getSkillMultiplier(skill.level) * (this.archerSkillDmgMult || 1) * lastArrowMult;
        const arrow = new PiercingArrow(pcx - 4, pcy - 4, Math.cos(angle) * speed, Math.sin(angle) * speed, dmg, this);
        this.projectiles.push(arrow);
        const arrowColor = isLastArrow ? '#ffeb3b' : '#aaff44';
        this.effects.push({ type: 'arrow', x: pcx, y: pcy, angle, length: isLastArrow ? 42 : 30, color: arrowColor, ttl: 0.3, maxTtl: 0.3 });
        this.spawnParticles(pcx, pcy, isLastArrow ? '#fff176' : '#ccff88', isLastArrow ? 16 : 8, 2, 5, 2, 4, 0.05);
        if (isLastArrow) this._showFloatingText('最后一发!', pcx, pcy - 30, '#ffeb3b');
        skill.cooldown = skill.maxCooldown;
    }

    _archerE(skill) {
        if (!this._consumeArrows(3)) return;
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const count = skill.level >= 3 ? 14 : 10;
        const dmg = this._computeAttackDamage(this.player.attack) * 0.8 * this._getSkillMultiplier(skill.level) * (this.archerSkillDmgMult || 1);
        for (let i = 0; i < count; i++) {
            this.pendingActions.push({
                delay: i * 0.1,
                fn: () => {
                    const tx = pcx + (Math.random() - 0.5) * 200;
                    const ty = pcy + (Math.random() - 0.5) * 200;
                    this.effects.push({ type: 'arrow', x: tx, y: ty - 120, angle: Math.PI / 2, length: 24, color: '#aaff44', ttl: 0.25, maxTtl: 0.25 });
                    this.pendingActions.push({
                        delay: 0.2,
                        fn: () => {
                            this.spawnHitParticles(tx, ty, '#aaff44', 6);
                            this.effects.push({ type: 'shockwave', x: tx, y: ty, radius: 5, maxRadius: 30, color: '#aaff44', ttl: 0.2, maxTtl: 0.2 });
                            for (let j = this.enemies.length - 1; j >= 0; j--) {
                                const e = this.enemies[j];
                                const dx = e.x + e.size / 2 - tx;
                                const dy = e.y + e.size / 2 - ty;
                                if (Math.sqrt(dx * dx + dy * dy) <= 25) this._dealDamage(e, dmg);
                            }
                        }
                    });
                }
            });
        }
        skill.cooldown = skill.maxCooldown;
    }

    _paladinQ(skill) {
        if (this.player.faith < 20) return;
        const targets = this._findClosestEnemies(1);
        if (targets.length === 0) return;
        const target = targets[0];
        this.player.faith -= 20;
        const dmg = this._computeAttackDamage(this.player.attack) * 2 * this._getSkillMultiplier(skill.level) * (this.paladinSkillDmgMult || 1);
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
        this.player.holyAuraTimer = 5 + (this.paladinAuraDurationBonus || 0);
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        this.effects.push({ type: 'holyAura', x: pcx, y: pcy, radius: 80, color: '#ffd700', ttl: 0.6, maxTtl: 0.6, pulse: 5 });
        this.spawnBurstRing(pcx, pcy, 80, '#ffd700', skill.level >= 3 ? 24 : 16);
        skill.cooldown = skill.maxCooldown;
    }
    
    shoot() {
        const cls = this.player.class;
        // 圣骑士:不再具备自动远程攻击
        if (cls === 'paladin') return;
        // 战士:近战光环(范围伤害)
        if (cls === 'warrior') {
            this._warriorMeleeAttack();
            return;
        }
        // 其它职业:正常发射投射物(候选包含魔王)
        const closest = this._findClosestTarget();
        if (!closest) return;

        const cx = this.player.x + this.player.size / 2;
        const cy = this.player.y + this.player.size / 2;
        const dx = closest.x + closest.size / 2 - cx;
        const dy = closest.y + closest.size / 2 - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0) return;

        // 弓手:疾矢(投射物速度倍率),多重射击(扇形多发),箭无虚发(穿透)
        const baseSpeed = 7;
        const speed = baseSpeed * (cls === 'archer' ? (this.archerProjSpeedMult || 1) : 1);
        // 弓手专属:自动攻击投射物伤害倍率(强弓/猎手本能/狩猎专精天赋)
        const archerAutoMult = cls === 'archer' ? (this.archerAutoDmgMult || 1) : 1;
        const dmg = this._computeAttackDamage(this.player.attack) * (this.player.autoAttackDmgMult || 1) * archerAutoMult;

        // 法师 Q 开关:激活时附加法术伤害并消耗法力(支持血魔契约)
        let mageBonusDmg = 0;
        if (cls === 'mage' && this.player.qToggleActive) {
            const cost = Math.max(1, Math.ceil(this.player.maxMana * 0.10 * (this.mageQCostMult || 1)));
            if (this._payMana(cost)) {
                mageBonusDmg = this.player.maxMana * 1.5;
            } else {
                // 蓝不够且血魔契约也不满足 → 自动关闭
                this.player.qToggleActive = false;
            }
        }

        const fanCount = cls === 'archer' ? (this.archerMultiShot || 1) : 1;
        const pierce = cls === 'archer' ? (this.archerPiercing || 0) : 0;
        // 扇形角度散布
        const spread = fanCount > 1 ? (15 * Math.PI / 180) : 0; // ±15°
        const baseAngle = Math.atan2(dy, dx);
        for (let i = 0; i < fanCount; i++) {
            // 等分散布
            const offset = fanCount === 1 ? 0 : (-spread + (2 * spread) * (i / (fanCount - 1)));
            const ang = baseAngle + offset;
            const vx = Math.cos(ang) * speed;
            const vy = Math.sin(ang) * speed;
            const proj = new Projectile(cx - 5, cy - 5, vx, vy, dmg + mageBonusDmg);
            proj.bonusMagicDmg = mageBonusDmg;
            if (pierce > 0) {
                proj.isPiercing = true;
                proj.pierceRemaining = pierce;
                proj.hitEnemies = new Set();
            }
            this.projectiles.push(proj);
        }
    }

    _warriorMeleeAttack() {
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const range = 80;
        const baseDmg = this._computeAttackDamage(this.player.attack) * (this.player.autoAttackDmgMult || 1);
        let hit = false;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const ex = e.x + e.size / 2;
            const ey = e.y + e.size / 2;
            const dx = ex - pcx, dy = ey - pcy;
            if (Math.sqrt(dx * dx + dy * dy) <= range) {
                this._dealDamage(e, baseDmg);
                hit = true;
            }
        }
        // 范围内的魔王也吃伤
        if (this.boss && this.bossState === 'active') {
            const bcx = this.boss.x + this.boss.size / 2;
            const bcy = this.boss.y + this.boss.size / 2;
            const dx = bcx - pcx, dy = bcy - pcy;
            if (Math.sqrt(dx * dx + dy * dy) <= range + this.boss.size / 2) {
                this.boss.takeDamage(baseDmg);
                this.bossDamageDealt += baseDmg;
                this.spawnHitParticles(bcx, bcy, '#ff1744', 6);
                hit = true;
            }
        }
        // 视觉:挥砍光环(浅红色弧)
        this.effects.push({
            type: 'meleeSwing',
            x: pcx, y: pcy, radius: range,
            startAngle: 0, endAngle: Math.PI * 2,
            color: hit ? '#ff7043' : '#bf6040',
            ttl: 0.22, maxTtl: 0.22
        });
    }

    // 攻击伤害最终结算:叠加暴怒(损血)/战士血怒(怒气)/嗜血战意(满怒)等加成
    _computeAttackDamage(base) {
        let dmg = base;
        // 暴怒天赋:每损失 10% 生命,攻击力 +5%
        if (this.player.wrathBonus) {
            const lost = 1 - (this.player.currentHealth / this.player.maxHealth);
            const stacks = Math.floor(lost * 10);
            dmg *= (1 + stacks * 0.05);
        }
        // 战士:血怒(每 20 怒气 +5% 攻击,× 已叠层数)
        if (this.player.class === 'warrior') {
            const bloodStacks = this.bloodRageStacks || 0;
            if (bloodStacks > 0) {
                const rageBands = Math.floor(this.player.rage / 20);
                dmg *= (1 + rageBands * 0.05 * bloodStacks);
            }
            // 嗜血战意:怒气 ≥70 时所有伤害 +30%
            if (this.warriorRavenous && this.player.rage >= 70) dmg *= 1.3;
        }
        return dmg;
    }

    // 统一击杀结算入口:替代旧的 score+=10; exp+=5; checkLevelUp() 三连
    _onEnemyKilled() {
        this.score += 10 * (this.scoreMult || 1);
        this.exp += 5;
        if (this.player.lifeStealPerKill) {
            this.player.heal(this.player.lifeStealPerKill);
        }
        this.player.gainRage(20);
        this.checkLevelUp();
    }
    
    checkLevelUp() {
        if (this.exp >= this.expToNext) {
            this.exp -= this.expToNext;
            this.level++;
            this.expToNext = Math.floor(this.expToNext * 1.5 * (this.expGrowthMult || 1));
            this.player.speed += 0.2;
            
            // 每次升级获得1点潜能点
            this.player.addPotentialPoints(1);
            
            if (this.level % 3 === 0) {
                this.life = Math.min(this.life + 1, this.maxLife);
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
        if (!this.showingClassSelection) return;
        this.buttons = [];
        const ctx = this.ctx;
        const W = this.width, H = this.height;
        const portrait = W < H || W < 520;

        // 背景
        const bgGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.8);
        bgGrad.addColorStop(0, 'rgba(8,12,30,0.97)');
        bgGrad.addColorStop(1, 'rgba(0,0,0,0.99)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // 标题
        const titleFS = Math.min(24, W * 0.055);
        ctx.save();
        ctx.shadowBlur = 22; ctx.shadowColor = '#00c8ff';
        ctx.fillStyle = '#00e5ff';
        ctx.font = `bold ${titleFS}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('选择职业', W / 2, H * 0.03);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(180,220,255,0.55)';
        ctx.font = `${Math.min(11, W * 0.025)}px Arial`;
        ctx.fillText('点击卡片选择  ·  每个职业玩法截然不同', W / 2, H * 0.03 + titleFS + 4);
        ctx.restore();

        // 职业数据
        const classDefs = [
            {
                choice: 1, name: '战士', icon: '⚔', color: '#ff6b3a',
                tag: '近战  高攻  怒气',
                tagColor: '#ff8a65',
                flavor: '攻高防低，怒气越满伤害越高',
                stats: ['攻击 +10  防御 -5  生命 +20', '近战范围自动攻击'],
                q: { name: '旋风斩', cd: '3s', desc: '消耗30怒气，范围斩击周围敌人' },
                e: { name: '盾击',   cd: '5s', desc: '消耗50怒气，击飞并重创单体目标' }
            },
            {
                choice: 2, name: '法师', icon: '✦', color: '#4ecdc4',
                tag: '远程  法力  爆发',
                tagColor: '#80deea',
                flavor: '法力不足时可消耗生命释放技能',
                stats: ['法力 +10  回复 +2/s', '远程自动攻击，Q开关附魔'],
                q: { name: '魔力涌注', cd: '切换', desc: '开启后每发普攻附加法术伤害，消耗法力' },
                e: { name: '斥力波',   cd: '8s',  desc: '消耗3法力，将周围敌人向四周强力推开并造成伤害' }
            },
            {
                choice: 3, name: '刺客', icon: '☄', color: '#aa66ff',
                tag: '移速  蓄力  爆发',
                tagColor: '#ce93d8',
                flavor: '移动积累蓄力，蓄力越高技能伤害越强',
                stats: ['移动速度 +1.5', '远程自动攻击'],
                q: { name: '闪现斩', cd: '4s', desc: '瞬移至目标身旁并造成高额伤害' },
                e: { name: '连刺',   cd: '6s', desc: '连续攻击3个最近敌人，依次结算' }
            },
            {
                choice: 4, name: '弓手', icon: '◎', color: '#aaff44',
                tag: '远程  高投射  箭矢',
                tagColor: '#c6ef6b',
                flavor: '投射物伤害高，防御低，箭矢用尽需装填',
                stats: ['攻击 +8  防御 -5', '普攻伤害×1.3，多天赋支持多重射击'],
                q: { name: '穿透箭', cd: '3s', desc: '消耗1箭，发射穿透敌阵的强力箭矢' },
                e: { name: '箭雨',   cd: '8s', desc: '消耗3箭，在大范围内降下密集箭雨' }
            },
            {
                choice: 5, name: '圣骑士', icon: '✟', color: '#ffd700',
                tag: '高防  护盾  信念',
                tagColor: '#ffe082',
                flavor: '攻击偏低，防御极高，拥有持续生成的护盾',
                stats: ['防御 +10  攻击 -5  生命 +30', '护盾持续再生，无远程普攻'],
                q: { name: '圣光打击', cd: '4s',  desc: '消耗20信念，重击目标并短暂晕眩' },
                e: { name: '神圣光环', cd: '12s', desc: '消耗50信念，持续治愈自身并灼烧周围敌人' }
            }
        ];

        // 卡片布局
        const n = classDefs.length;
        let cardW, cardH, cols, rows, startX, startY, gapX, gapY;
        if (portrait) {
            // 竖屏:2列3行(最后一行居中)
            cols = 2; rows = 3;
            gapX = Math.min(10, W * 0.02); gapY = Math.min(8, H * 0.015);
            cardW = (W - gapX * 3) / 2;
            cardH = Math.min(155, (H * 0.84 - gapY * (rows + 1)) / rows);
            startX = gapX;
            startY = H * 0.12;
        } else {
            // 横屏:5列1行 或 按宽度降级到2行
            const maxCardW = Math.min(138, (W - 12 * 6) / 5);
            if (maxCardW >= 100) {
                cols = 5; rows = 1;
                cardW = maxCardW;
                cardH = Math.min(240, H * 0.72);
                gapX = (W - cardW * 5) / 6;
                gapY = 0;
                startX = gapX;
                startY = H * 0.14;
            } else {
                cols = 3; rows = 2;
                gapX = Math.min(10, W * 0.02); gapY = Math.min(10, H * 0.02);
                cardW = (W - gapX * 4) / 3;
                cardH = Math.min(160, (H * 0.8 - gapY * 3) / 2);
                startX = gapX;
                startY = H * 0.13;
            }
        }

        const nameFS   = Math.min(15, cardW * 0.13);
        const tagFS    = Math.min(10, cardW * 0.085);
        const statFS   = Math.min(10, cardW * 0.083);
        const skillFS  = Math.min(10, cardW * 0.085);
        const descFS   = Math.min(9,  cardW * 0.075);
        const rarityColor = { common: '#90a4ae', rare: '#42a5f5', epic: '#ba68c8' };

        classDefs.forEach((cls, i) => {
            let col = i % cols;
            let row = Math.floor(i / cols);
            // 最后一行若只剩一个,居中
            const lastRowCount = n % cols || cols;
            if (row === rows - 1 && lastRowCount < cols) {
                col = i - row * cols;
                const totalW = lastRowCount * cardW + (lastRowCount - 1) * gapX;
                var bx = (W - totalW) / 2 + col * (cardW + gapX);
            } else {
                var bx = startX + col * (cardW + gapX);
            }
            const by = startY + row * (cardH + gapY);

            ctx.save();
            // 卡片背景
            const cg = ctx.createLinearGradient(bx, by, bx, by + cardH);
            cg.addColorStop(0, 'rgba(18,26,52,0.97)');
            cg.addColorStop(1, 'rgba(8,12,28,0.97)');
            ctx.fillStyle = cg;
            ctx.shadowBlur = 18; ctx.shadowColor = cls.color;
            roundRect(ctx, bx, by, cardW, cardH, 10);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = `${cls.color}cc`;
            ctx.lineWidth = 2;
            roundRect(ctx, bx, by, cardW, cardH, 10);
            ctx.stroke();

            let oy = by + 10;

            // 图标 + 名称
            ctx.shadowBlur = 12; ctx.shadowColor = cls.color;
            ctx.fillStyle = cls.color;
            ctx.font = `bold ${Math.min(22, cardW * 0.18)}px Arial`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText(cls.icon, bx + cardW / 2, oy);
            oy += Math.min(22, cardW * 0.18) + 4;

            ctx.shadowBlur = 8;
            ctx.font = `bold ${nameFS}px Arial`;
            ctx.fillText(cls.name, bx + cardW / 2, oy);
            oy += nameFS + 3;
            ctx.shadowBlur = 0;

            // 标签
            ctx.fillStyle = cls.tagColor;
            ctx.font = `${tagFS}px Arial`;
            ctx.fillText(cls.tag, bx + cardW / 2, oy);
            oy += tagFS + 4;

            // 特色描述
            ctx.fillStyle = 'rgba(200,232,255,0.8)';
            ctx.font = `${statFS}px Arial`;
            this._wrapTextCenter(ctx, cls.flavor, bx + cardW / 2, oy, cardW - 10, statFS + 2);
            oy += (statFS + 2) * Math.ceil(ctx.measureText(cls.flavor).width / (cardW - 10)) + 3;

            // 属性加成
            ctx.fillStyle = 'rgba(160,200,160,0.75)';
            ctx.font = `${statFS * 0.9}px Arial`;
            for (const st of cls.stats) {
                ctx.fillText(st, bx + cardW / 2, oy);
                oy += statFS + 1;
            }
            oy += 4;

            // 分隔线
            ctx.strokeStyle = `${cls.color}44`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx + 8, oy); ctx.lineTo(bx + cardW - 8, oy);
            ctx.stroke();
            oy += 5;

            // Q/E 技能
            for (const [key, sk] of [['Q', cls.q], ['E', cls.e]]) {
                ctx.fillStyle = key === 'Q' ? cls.color : 'rgba(200,200,255,0.9)';
                ctx.font = `bold ${skillFS}px Arial`;
                ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                ctx.fillText(`[${key}] ${sk.name}`, bx + 8, oy);
                ctx.fillStyle = 'rgba(180,180,180,0.6)';
                ctx.font = `${skillFS * 0.85}px Arial`;
                ctx.fillText(`CD:${sk.cd}`, bx + cardW - 8 - ctx.measureText(`CD:${sk.cd}`).width, oy);
                oy += skillFS + 2;
                ctx.fillStyle = 'rgba(180,210,240,0.7)';
                ctx.font = `${descFS}px Arial`;
                this._wrapText(ctx, sk.desc, bx + 8, oy, cardW - 16, descFS + 2);
                const descLines = Math.ceil(ctx.measureText(sk.desc).width / (cardW - 16)) || 1;
                oy += (descFS + 2) * descLines + 4;
            }

            ctx.restore();

            // 注册命中区
            this.buttons.push({ x: bx, y: by, width: cardW, height: cardH, choice: cls.choice });
        });
    }
    
    handleClassChoice(choice) {
        const nameByChoice = { 1: 'warrior', 2: 'mage', 3: 'assassin', 4: 'archer', 5: 'paladin' };
        const name = nameByChoice[choice];
        if (!name) return;
        const cd = CLASS_BASE_CD[name];
        this.player.class = name;
        this.player.skillQ = { cooldown: 0, maxCooldown: cd.q, level: 1 };
        this.player.skillE = { cooldown: 0, maxCooldown: cd.e, level: 1 };

        // 应用职业基础属性偏移
        const adj = CLASS_BASE_ADJUST[name] || {};
        if (adj.attack)    this.player.attack += adj.attack;
        if (adj.defense)   this.player.defense = Math.max(0, this.player.defense + adj.defense);
        if (adj.maxHealth) { this.player.maxHealth += adj.maxHealth; this.player.currentHealth = this.player.maxHealth; }
        if (adj.speed)     this.player.speed += adj.speed;
        if (adj.manaRegen) this.player.manaRegen += adj.manaRegen;
        if (adj.maxMana)   { this.player.maxMana += adj.maxMana; this.player.mana = this.player.maxMana; }
        if (adj.autoAttackDmgMult) this.player.autoAttackDmgMult = (this.player.autoAttackDmgMult || 1) * adj.autoAttackDmgMult;

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
            this.isPaused = true;
            this.showingPotentialMenu = true;
            this.currentTalentChoices = this._rollTalentChoices(3);
        }
    }

    openPotentialMenu() {
        // 这个方法现在由鼠标点击事件处理
    }

    _rollTalentChoices(count) {
        // 1. 过滤可用天赋:满足 applicable + 未达 maxStacks
        const eligible = this.talentDefs.filter(t => {
            if (t.applicable && !t.applicable(this)) return false;
            const got = this.acquiredTalents.find(a => a.id === t.id);
            if (got) {
                if (!t.stackable) return false;
                if (t.maxStacks && got.count >= t.maxStacks) return false;
            }
            return true;
        });
        if (eligible.length === 0) return [];

        // 2. 加权随机(common 60 / rare 30 / epic 10),不重复抽取同一张
        const weights = { common: 60, rare: 30, epic: 10 };
        const pool = eligible.slice();
        const chosen = [];
        for (let i = 0; i < count && pool.length > 0; i++) {
            let total = 0;
            for (const t of pool) total += weights[t.rarity] || 10;
            let roll = Math.random() * total;
            let pickIdx = 0;
            for (let j = 0; j < pool.length; j++) {
                roll -= weights[pool[j].rarity] || 10;
                if (roll <= 0) { pickIdx = j; break; }
            }
            chosen.push(pool[pickIdx]);
            pool.splice(pickIdx, 1);
        }
        return chosen;
    }

    handlePotentialChoice(choice) {
        // choice: 0 = 跳过, 1/2/3 = 天赋卡索引(1-based)
        if (choice === 0) {
            this._closeTalentMenu();
            return;
        }
        const idx = choice - 1;
        const talent = this.currentTalentChoices[idx];
        if (!talent || this.player.potentialPoints <= 0) {
            this._closeTalentMenu();
            return;
        }

        talent.apply(this);
        this.player.potentialPoints--;

        const existing = this.acquiredTalents.find(a => a.id === talent.id);
        if (existing) existing.count++;
        else this.acquiredTalents.push({ id: talent.id, count: 1 });

        this.updateUI();

        // 还有剩余点数 → 重抽继续选;否则关闭
        if (this.player.potentialPoints > 0) {
            this.currentTalentChoices = this._rollTalentChoices(3);
            if (this.currentTalentChoices.length === 0) this._closeTalentMenu();
        } else {
            this._closeTalentMenu();
        }
    }

    _closeTalentMenu() {
        this.showingPotentialMenu = false;
        this.isPaused = false;
        this.currentTalentChoices = [];
    }
    
    renderPotentialMenu() {
        if (!this.showingPotentialMenu) return;
        this.buttons = [];
        const ctx = this.ctx;

        // 背景遮罩
        const bgGrad = ctx.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, this.width * 0.7);
        bgGrad.addColorStop(0, 'rgba(10, 15, 35, 0.93)');
        bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0.96)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, this.width, this.height);

        // 自适应字号
        const titleFontSize = Math.min(28, this.width * 0.06);
        const subFontSize = Math.min(14, this.width * 0.032);
        const cardNameSize = Math.min(16, this.width * 0.038);
        const cardDescSize = Math.min(11, this.width * 0.026);
        const cardIconSize = Math.min(36, this.width * 0.085);

        // 标题
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#00c8ff';
        ctx.fillStyle = '#00e5ff';
        ctx.font = `bold ${titleFontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('选择天赋', this.width / 2, this.height * 0.09);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffcc00';
        ctx.font = `${subFontSize}px Arial`;
        ctx.fillText(`剩余潜能点: ${this.player.potentialPoints}`, this.width / 2, this.height * 0.14);
        ctx.restore();

        // 卡牌布局:横屏三列横排;竖屏(宽<高)三行竖排
        const portrait = this.width < this.height;
        const choices = this.currentTalentChoices;
        const n = choices.length;

        let cardW, cardH, startX, startY, stepX, stepY;
        if (portrait || this.width < 480) {
            cardW = Math.min(280, this.width * 0.75);
            cardH = Math.min(110, this.height * 0.14);
            startX = (this.width - cardW) / 2;
            startY = this.height * 0.20;
            stepX = 0;
            stepY = cardH + Math.max(8, this.height * 0.015);
        } else {
            const spacing = Math.min(16, this.width * 0.025);
            cardW = Math.min(180, (this.width - spacing * (n + 1)) / Math.max(n, 1));
            cardH = Math.min(220, this.height * 0.42);
            const totalW = cardW * n + spacing * (n - 1);
            startX = (this.width - totalW) / 2;
            startY = this.height * 0.22;
            stepX = cardW + spacing;
            stepY = 0;
        }

        // 稀有度边框颜色
        const rarityColor = { common: '#90a4ae', rare: '#42a5f5', epic: '#ba68c8' };
        const rarityLabel = { common: '普通', rare: '稀有', epic: '史诗' };

        // 绘制卡牌
        for (let i = 0; i < n; i++) {
            const t = choices[i];
            const cx = startX + stepX * i;
            const cy = startY + stepY * i;
            const borderColor = rarityColor[t.rarity] || '#888';

            ctx.save();
            // 卡牌背景
            const cardGrad = ctx.createLinearGradient(cx, cy, cx, cy + cardH);
            cardGrad.addColorStop(0, 'rgba(20, 30, 55, 0.95)');
            cardGrad.addColorStop(1, 'rgba(10, 15, 30, 0.95)');
            ctx.fillStyle = cardGrad;
            ctx.shadowBlur = 16;
            ctx.shadowColor = borderColor;
            roundRect(ctx, cx, cy, cardW, cardH, 12);
            ctx.fill();

            // 稀有度边框
            ctx.shadowBlur = 0;
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 2.5;
            roundRect(ctx, cx, cy, cardW, cardH, 12);
            ctx.stroke();

            // 稀有度标签(右上角)
            ctx.fillStyle = borderColor;
            ctx.font = `bold ${Math.max(9, subFontSize - 2)}px Arial`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(rarityLabel[t.rarity] || '', cx + cardW - 8, cy + 6);

            if (portrait || this.width < 480) {
                // 竖屏:图标左侧 | 名字/描述右侧
                const iconBoxW = cardH;
                ctx.fillStyle = t.color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = t.color;
                ctx.font = `bold ${cardIconSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(t.icon, cx + iconBoxW / 2, cy + cardH / 2);
                ctx.shadowBlur = 0;

                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${cardNameSize}px Arial`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(t.name, cx + iconBoxW, cy + 14);

                ctx.fillStyle = 'rgba(200, 232, 255, 0.85)';
                ctx.font = `${cardDescSize}px Arial`;
                this._wrapText(ctx, t.desc, cx + iconBoxW, cy + 14 + cardNameSize + 6, cardW - iconBoxW - 10, cardDescSize + 3);

                const got = this.acquiredTalents.find(a => a.id === t.id);
                if (got) {
                    ctx.fillStyle = 'rgba(255, 204, 0, 0.85)';
                    ctx.font = `${Math.max(9, cardDescSize - 1)}px Arial`;
                    ctx.textAlign = 'right';
                    ctx.fillText(`已持有 ×${got.count}`, cx + cardW - 8, cy + cardH - 16);
                }
            } else {
                // 横屏:图标上 | 名字中 | 描述下
                ctx.fillStyle = t.color;
                ctx.shadowBlur = 12;
                ctx.shadowColor = t.color;
                ctx.font = `bold ${cardIconSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(t.icon, cx + cardW / 2, cy + cardH * 0.25);
                ctx.shadowBlur = 0;

                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${cardNameSize}px Arial`;
                ctx.fillText(t.name, cx + cardW / 2, cy + cardH * 0.50);

                ctx.fillStyle = 'rgba(200, 232, 255, 0.85)';
                ctx.font = `${cardDescSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                this._wrapTextCenter(ctx, t.desc, cx + cardW / 2, cy + cardH * 0.60, cardW - 16, cardDescSize + 3);

                const got = this.acquiredTalents.find(a => a.id === t.id);
                if (got) {
                    ctx.fillStyle = 'rgba(255, 204, 0, 0.85)';
                    ctx.font = `${Math.max(9, cardDescSize - 1)}px Arial`;
                    ctx.fillText(`已持有 ×${got.count}`, cx + cardW / 2, cy + cardH - 18);
                }
            }
            ctx.restore();

            // 注册命中区域(choice 用 1-based)
            this.buttons.push({ x: cx, y: cy, width: cardW, height: cardH, choice: i + 1 });
        }

        // 跳过按钮
        const skipW = Math.min(140, this.width * 0.35);
        const skipH = Math.max(36, Math.min(44, this.height * 0.075));
        const skipX = (this.width - skipW) / 2;
        let skipY;
        if (portrait || this.width < 480) {
            skipY = startY + stepY * n + Math.max(8, this.height * 0.015);
            skipY = Math.min(skipY, this.height - skipH - 12);
        } else {
            skipY = startY + cardH + Math.max(16, this.height * 0.04);
        }
        this.drawButton(skipX, skipY, skipW, skipH, '#78909c', '跳过', 0);

        // 已获得天赋小列表(底部)
        if (this.acquiredTalents.length > 0) {
            ctx.save();
            ctx.fillStyle = 'rgba(200, 232, 255, 0.55)';
            ctx.font = `${Math.max(9, subFontSize - 3)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const summary = this.acquiredTalents.map(a => {
                const def = this.talentDefs.find(d => d.id === a.id);
                return def ? (def.name + (a.count > 1 ? `×${a.count}` : '')) : '';
            }).filter(Boolean).join('  ·  ');
            ctx.fillText(`已获得: ${summary}`, this.width / 2, this.height - 6);
            ctx.restore();
        }
    }

    _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const chars = text.split('');
        let line = '';
        let yy = y;
        for (let i = 0; i < chars.length; i++) {
            const test = line + chars[i];
            if (ctx.measureText(test).width > maxWidth && line.length > 0) {
                ctx.fillText(line, x, yy);
                line = chars[i];
                yy += lineHeight;
            } else {
                line = test;
            }
        }
        if (line) ctx.fillText(line, x, yy);
    }

    _wrapTextCenter(ctx, text, cx, y, maxWidth, lineHeight) {
        const chars = text.split('');
        let line = '';
        let yy = y;
        for (let i = 0; i < chars.length; i++) {
            const test = line + chars[i];
            if (ctx.measureText(test).width > maxWidth && line.length > 0) {
                ctx.fillText(line, cx, yy);
                line = chars[i];
                yy += lineHeight;
            } else {
                line = test;
            }
        }
        if (line) ctx.fillText(line, cx, yy);
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

        // 命中区(this.buttons 在每帧 render 开头由调用方清空)
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
                    // 0 = 跳过, 1/2/3 = 天赋卡索引;两者都交给 handlePotentialChoice
                    this.handlePotentialChoice(button.choice);
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
        this.isRunning = false;
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
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
            const toggle = this.player.qToggleActive ? ' [涌注]' : '';
            document.getElementById('mana').textContent = Math.floor(this.player.mana) + toggle;
            document.getElementById('maxMana').textContent = this.player.maxMana;
        } else if (this.player.class === 'paladin') {
            const cap = Math.floor(this.player.maxHealth * (this.player.shieldCapRatio || 0.10));
            const sh = Math.floor(this.player.shield);
            document.getElementById('mana').textContent = `${Math.floor(this.player.faith)} | 盾${sh}/${cap}`;
            document.getElementById('maxMana').textContent = this.player.maxFaith;
        } else if (this.player.class === 'warrior') {
            document.getElementById('mana').textContent = Math.floor(this.player.rage);
            document.getElementById('maxMana').textContent = this.player.maxRage;
        } else if (this.player.class === 'archer') {
            const reload = this.player.reloadTimer > 0 ? ` (装填 ${this.player.reloadTimer.toFixed(1)}s)` : '';
            document.getElementById('mana').textContent = this.player.arrows + reload;
            document.getElementById('maxMana').textContent = this.player.maxArrows;
        } else if (this.player.class === 'assassin') {
            document.getElementById('mana').textContent = Math.floor(this.player.assassinCharge);
            document.getElementById('maxMana').textContent = this.player.maxAssassinCharge;
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
        // 去 shadowBlur:粒子数量大时 shadow 是主要瓶颈,关闭后大幅提速
        const ctx = this.ctx;
        ctx.save();
        ctx.shadowBlur = 0;
        for (const p of this.particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _renderFreezeOverlay() {
        if (!this.freezeOverlay || this.enemyFreezeTimer <= 0) {
            this.freezeOverlay = null;
            return;
        }
        const { duration, cracks, corners } = this.freezeOverlay;
        const ratio = this.enemyFreezeTimer / duration; // 1→0 随时间消退
        // 入场：前 0.3s 快速冻结铺开；消退：最后 1s 渐淡
        const fadeIn  = Math.min(1, (duration - this.enemyFreezeTimer) / 0.3);
        const fadeOut = Math.min(1, this.enemyFreezeTimer / 1.0);
        const alpha   = Math.min(fadeIn, fadeOut);
        if (alpha <= 0) return;

        const ctx = this.ctx;
        const W = this.width, H = this.height;

        ctx.save();

        // ── 全屏蓝色半透明蒙版 ──
        ctx.globalAlpha = alpha * 0.22;
        const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.75);
        grad.addColorStop(0, 'rgba(140,220,255,0)');
        grad.addColorStop(0.6, 'rgba(100,190,255,0.4)');
        grad.addColorStop(1, 'rgba(40,120,220,0.9)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // ── 四角冰晶簇 ──
        ctx.globalAlpha = alpha * 0.9;
        for (const c of corners) {
            const ox = c.ox * W, oy = c.oy * H;
            const len = c.len * Math.min(W, H) * fadeIn;
            const halfW = c.w * Math.min(W, H);
            const ex = ox + Math.cos(c.a) * len;
            const ey = oy + Math.sin(c.a) * len;
            const px = Math.cos(c.a + Math.PI/2) * halfW;
            const py = Math.sin(c.a + Math.PI/2) * halfW;
            const iceGrad = ctx.createLinearGradient(ox, oy, ex, ey);
            iceGrad.addColorStop(0, 'rgba(200,240,255,0.95)');
            iceGrad.addColorStop(0.5, 'rgba(120,200,255,0.8)');
            iceGrad.addColorStop(1, 'rgba(80,160,220,0.3)');
            ctx.fillStyle = iceGrad;
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#88ccff';
            ctx.beginPath();
            ctx.moveTo(ox + px, oy + py);
            ctx.lineTo(ex, ey);
            ctx.lineTo(ox - px, oy - py);
            ctx.closePath();
            ctx.fill();
        }

        // ── 冰裂纹 ──
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#aaddff';
        ctx.lineCap = 'round';
        for (const crack of cracks) {
            ctx.globalAlpha = alpha * 0.75;
            ctx.strokeStyle = 'rgba(180,230,255,0.85)';
            ctx.lineWidth = crack.width;
            ctx.beginPath();
            ctx.moveTo(crack.sx * W, crack.sy * H);
            for (const seg of crack.segs) {
                ctx.lineTo(seg.x * W, seg.y * H);
            }
            ctx.stroke();
            // 内芯高光
            ctx.globalAlpha = alpha * 0.4;
            ctx.strokeStyle = 'rgba(240,250,255,0.9)';
            ctx.lineWidth = crack.width * 0.4;
            ctx.beginPath();
            ctx.moveTo(crack.sx * W, crack.sy * H);
            for (const seg of crack.segs) {
                ctx.lineTo(seg.x * W, seg.y * H);
            }
            ctx.stroke();
        }

        // ── 四边冰霜边框 ──
        ctx.shadowBlur = 0;
        const edgeH = H * 0.18 * fadeIn;
        const edgeW = W * 0.18 * fadeIn;
        const makeEdgeGrad = (x0, y0, x1, y1) => {
            const g = ctx.createLinearGradient(x0, y0, x1, y1);
            g.addColorStop(0, `rgba(160,220,255,${alpha * 0.6})`);
            g.addColorStop(1, 'rgba(160,220,255,0)');
            return g;
        };
        ctx.fillStyle = makeEdgeGrad(0, 0, 0, edgeH);
        ctx.fillRect(0, 0, W, edgeH);
        ctx.fillStyle = makeEdgeGrad(0, H, 0, H - edgeH);
        ctx.fillRect(0, H - edgeH, W, edgeH);
        ctx.fillStyle = makeEdgeGrad(0, 0, edgeW, 0);
        ctx.fillRect(0, 0, edgeW, H);
        ctx.fillStyle = makeEdgeGrad(W, 0, W - edgeW, 0);
        ctx.fillRect(W - edgeW, 0, edgeW, H);

        // ── 倒计时文字 ──
        if (this.enemyFreezeTimer > 0.5) {
            ctx.globalAlpha = alpha * 0.9;
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#aaddff';
            ctx.fillStyle = '#ddf4ff';
            ctx.font = `bold ${Math.min(20, W * 0.04)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`❄ 冻结 ${this.enemyFreezeTimer.toFixed(1)}s ❄`, W / 2, 10);
        }

        ctx.restore();
    }

    render() {
        const ctx = this.ctx;
        ctx.save();
        // 屏幕震动:对整个画面施加随机平移(暂停时不抖,避免 warning 期间暂停定格抖动)
        if (this.screenShake > 0 && !this.isPaused) {
            const intensity = Math.min(12, this.screenShake * 30);
            ctx.translate((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
        }

        this.renderBackground();

        this.player.render(this.ctx);

        const frozen = this.enemyFreezeTimer > 0;
        for (let enemy of this.enemies) {
            enemy.render(this.ctx, frozen);
        }

        // 渲染魔王(在敌人之上,投射物之下)
        if (this.boss) this.boss.render(this.ctx);

        for (let item of this.items) {
            item.render(this.ctx);
        }

        for (let projectile of this.projectiles) {
            projectile.render(this.ctx);
        }

        for (let b of this.enemyBullets) {
            b.render(this.ctx);
        }

        this._renderEffects();

        this.renderParticles();

        ctx.restore(); // 结束震动 transform

        // 全屏冰封叠加层(不受震动影响,叠在游戏世界之上 HUD 之下)
        this._renderFreezeOverlay();

        // 以下 UI 不受震动影响
        this._renderSkillHUD();
        this._renderBossHUD();

        if (this.showingClassSelection) {
            this.renderClassSelection();
        } else if (this.showingPotentialMenu) {
            this.renderPotentialMenu();
        }
    }

    _renderBossHUD() {
        const ctx = this.ctx;
        // 预告:红色边框 + 中央倒计时
        if (this.bossState === 'warning') {
            const alpha = 0.3 + 0.4 * Math.abs(Math.sin(this.bossWarningTimer * 8));
            ctx.save();
            ctx.strokeStyle = `rgba(255, 23, 68, ${alpha})`;
            ctx.lineWidth = 12;
            ctx.shadowBlur = 30;
            ctx.shadowColor = '#ff1744';
            ctx.strokeRect(6, 6, this.width - 12, this.height - 12);
            // 中央大字
            ctx.fillStyle = `rgba(255, 23, 68, ${alpha + 0.3})`;
            ctx.font = `bold ${Math.min(56, this.width * 0.12)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('魔王降临', this.width / 2, this.height * 0.42);
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.min(72, this.width * 0.16)}px Arial`;
            ctx.fillText(`${Math.ceil(this.bossWarningTimer)}`, this.width / 2, this.height * 0.55);
            ctx.restore();
            return;
        }
        // 活跃:顶部血条 + 进度条
        if (this.bossState === 'active' && this.boss) {
            ctx.save();
            // 持续红边
            ctx.strokeStyle = 'rgba(255, 23, 68, 0.5)';
            ctx.lineWidth = 6;
            ctx.shadowBlur = 18;
            ctx.shadowColor = '#ff1744';
            ctx.strokeRect(3, 3, this.width - 6, this.height - 6);
            ctx.shadowBlur = 0;

            // 顶部魔王血条
            const barW = this.width * 0.7;
            const barH = 18;
            const bx = (this.width - barW) / 2;
            const by = 18;
            const hpRatio = this.boss.currentHealth / this.boss.maxHealth;

            // 背景
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            roundRect(ctx, bx, by, barW, barH, 4);
            ctx.fill();
            // 血量(紫红渐变)
            const grad = ctx.createLinearGradient(bx, by, bx + barW, by);
            grad.addColorStop(0, '#7c4dff');
            grad.addColorStop(1, '#ff1744');
            ctx.fillStyle = grad;
            roundRect(ctx, bx, by, barW * hpRatio, barH, 4);
            ctx.fill();
            // 框
            ctx.strokeStyle = '#ff1744';
            ctx.lineWidth = 1.5;
            roundRect(ctx, bx, by, barW, barH, 4);
            ctx.stroke();
            // 文字
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`方块大魔王  ${Math.ceil(this.boss.currentHealth)}/${this.boss.maxHealth}`, bx + barW / 2, by + barH / 2);

            // 第二行:坚持倒计时 + 累计伤害进度
            const subBarW = barW;
            const subBarH = 10;
            const sby = by + barH + 6;
            const remainTime = Math.max(0, this.bossDuration - this.bossActiveTimer);
            const dmgGoal = this.bossDamageRequired * this.difficulty;
            const dmgRatio = Math.min(1, this.bossDamageDealt / dmgGoal);
            // 时间进度
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            roundRect(ctx, bx, sby, subBarW / 2 - 4, subBarH, 3);
            ctx.fill();
            ctx.fillStyle = '#ffeb3b';
            roundRect(ctx, bx, sby, (subBarW / 2 - 4) * (this.bossActiveTimer / this.bossDuration), subBarH, 3);
            ctx.fill();
            // 伤害进度
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            roundRect(ctx, bx + subBarW / 2 + 4, sby, subBarW / 2 - 4, subBarH, 3);
            ctx.fill();
            ctx.fillStyle = '#00e676';
            roundRect(ctx, bx + subBarW / 2 + 4, sby, (subBarW / 2 - 4) * dmgRatio, subBarH, 3);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`坚持 ${remainTime.toFixed(1)}s`, bx + subBarW / 4, sby + subBarH + 12);
            ctx.fillText(`伤害 ${Math.floor(this.bossDamageDealt)} / ${Math.floor(dmgGoal)}`, bx + subBarW * 3 / 4, sby + subBarH + 12);

            ctx.restore();
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
                if (fx.rotSpeed) fx.rotation = (fx.rotation || 0) + fx.rotSpeed * DT;
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
            } else if (fx.type === 'floatText') {
                const prog = 1 - alpha;
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 8;
                ctx.shadowColor = fx.color;
                ctx.fillStyle = fx.color;
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(fx.text, fx.x, fx.y - prog * 24);
            } else if (fx.type === 'meleeSwing') {
                const prog = 1 - alpha;
                ctx.globalAlpha = alpha * 0.6;
                ctx.shadowBlur = 16;
                ctx.shadowColor = fx.color;
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, fx.radius * (0.6 + prog * 0.4), fx.startAngle, fx.endAngle);
                ctx.stroke();
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

        // 每帧重置技能命中区
        this.skillButtons = [
            { x: baseX,              y: baseY, w: slotW, h: slotH, skill: 'Q' },
            { x: baseX + slotW + margin, y: baseY, w: slotW, h: slotH, skill: 'E' }
        ];

        const qNames = { warrior: '旋', mage: '弹', assassin: '闪', archer: '穿', paladin: '圣' };
        const eNames = { warrior: '盾', mage: '斥', assassin: '刺', archer: '雨', paladin: '环' };
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
        } else if (cls === 'warrior') {
            this._renderResourceBar(baseX - 22, baseY, 14, slotH + 20, this.player.rage, this.player.maxRage, '#ff5722', '#7f0000', '怒');
        } else if (cls === 'archer') {
            this._renderArrowBar(baseX - 22, baseY, 14, slotH + 20);
        } else if (cls === 'assassin') {
            this._renderResourceBar(baseX - 22, baseY, 14, slotH + 20, this.player.assassinCharge, this.player.maxAssassinCharge, '#ce93d8', '#4a148c', '蓄');
        }

        // 法师 Q 开关激活时,在 Q 槽周围加发光指示 + 显示每次普攻消耗
        if (cls === 'mage' && this.player.qToggleActive) {
            const qSlotX = slots[0].x;
            ctx.save();
            ctx.strokeStyle = '#4dd0e1';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 18;
            ctx.shadowColor = '#4dd0e1';
            roundRect(ctx, qSlotX - 3, baseY - 3, slotW + 6, slotH + 6, slotR + 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
            const cost = Math.max(1, Math.ceil(this.player.maxMana * 0.10 * (this.mageQCostMult || 1)));
            ctx.fillStyle = '#4dd0e1';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`-${cost}/发`, qSlotX + slotW / 2, baseY - 6);
            ctx.restore();
        }

        // 触屏/鼠标提示:选职业后前 12s 显示"可点击"小字
        if (this.player.class && this.gameTime < 12) {
            const alpha = Math.min(1, (12 - this.gameTime) / 3); // 最后 3s 渐隐
            ctx.save();
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = '#ffffff';
            ctx.font = `${Math.max(9, Math.min(11, this.width * 0.022))}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('可点击', baseX + slotW / 2, baseY + slotH + 22);
            ctx.fillText('可点击', baseX + slotW + margin + slotW / 2, baseY + slotH + 22);
            ctx.restore();
        }

        ctx.restore();
    }

    _renderArrowBar(x, y, w, h, label = '箭') {
        const ctx = this.ctx;
        const max = this.player.maxArrows;
        const cur = this.player.arrows;
        const reloading = this.player.reloadTimer > 0;
        const reloadProg = reloading ? 1 - (this.player.reloadTimer / this.player.reloadDuration) : 0;

        // 背景
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, x, y, w, h, 4);
        ctx.fill();

        // 每个箭槽(从底到顶)
        const gap = 2;
        const slotH = (h - gap * (max + 1)) / max;
        for (let i = 0; i < max; i++) {
            const slotY = y + h - gap - (i + 1) * slotH - i * gap;
            const filled = i < cur;
            // 正在装填的"下一格"显示填充进度(对应箭袋中第 cur 槽,从 0 开始)
            const isReloadingSlot = reloading && i === cur;

            if (filled) {
                ctx.fillStyle = '#aaff44';
                ctx.shadowBlur = 6;
                ctx.shadowColor = '#aaff44';
                roundRect(ctx, x + 2, slotY, w - 4, slotH, 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (isReloadingSlot) {
                // 装填进度从底部往上充
                const fillH = slotH * reloadProg;
                ctx.fillStyle = 'rgba(170,255,68,0.35)';
                roundRect(ctx, x + 2, slotY + slotH - fillH, w - 4, fillH, 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(170,255,68,0.6)';
                ctx.lineWidth = 1;
                roundRect(ctx, x + 2, slotY, w - 4, slotH, 2);
                ctx.stroke();
            } else {
                // 空槽
                ctx.strokeStyle = 'rgba(170,255,68,0.25)';
                ctx.lineWidth = 1;
                roundRect(ctx, x + 2, slotY, w - 4, slotH, 2);
                ctx.stroke();
            }
        }

        // 外框
        ctx.strokeStyle = 'rgba(170,255,68,0.6)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, w, h, 4);
        ctx.stroke();

        // 标签
        ctx.fillStyle = '#aaff44';
        ctx.font = `bold 10px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, x + w / 2, y - 2);
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

        // 战士怒气资源:攻击/受伤/击杀 时获取,技能消耗
        this.rage = 0;
        this.maxRage = 100;
        this.rageGainMult = 1; // 战士天赋"怒火中烧"用

        // 弓手箭矢资源:技能消耗,空袋后启动装填
        this.arrows = 5;
        this.maxArrows = 5;
        this.reloadTimer = 0;     // > 0 表示装填中
        this.reloadDuration = 1.5;

        // 法师 Q 开关
        this.qToggleActive = false;

        // 圣骑士护盾(持续生成,上限 maxHealth × shieldCapRatio)
        this.shield = 0;
        this.shieldCapRatio = 0.10;

        // 刺客移动蓄力
        this.assassinCharge = 0;
        this.maxAssassinCharge = 100;
        this.lastChargeX = x;
        this.lastChargeY = y;
        this.chargeGainMult = 1;

        this.stunTimer = 0;

        this.hurtCooldown = 0;
        this.invincibleTimer = 0;
        this.invincibleSizeBonus = 0;
        this.invincibleAttackBonus = 0;
        this.invincibleDefenseBonus = 0;

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
            this.hurtCooldown -= DT;
            if (this.hurtCooldown < 0) this.hurtCooldown = 0;
        }

        // 刺客移动蓄力:基于位移累积(1 像素 = 0.1 stock,封顶 maxAssassinCharge)
        if (this.class === 'assassin') {
            const dxc = this.x - this.lastChargeX;
            const dyc = this.y - this.lastChargeY;
            const moved = Math.sqrt(dxc * dxc + dyc * dyc);
            if (moved > 0) {
                this.assassinCharge = Math.min(this.maxAssassinCharge, this.assassinCharge + moved * 0.1 * (this.chargeGainMult || 1));
            }
        }
        this.lastChargeX = this.x;
        this.lastChargeY = this.y;

    }

    takeDamage(damage) {
        const flatReduction = this.flatDamageReduction || 0;
        let actualDamage = Math.max(1, damage - this.defense - flatReduction);
        // 圣骑士护盾优先全额抵挡(不再因 Math.max(1) 强制漏 1 点)
        if (this.shield > 0) {
            const absorbed = Math.min(this.shield, actualDamage);
            this.shield -= absorbed;
            actualDamage -= absorbed;
        }
        if (actualDamage > 0) {
            this.currentHealth = Math.max(0, this.currentHealth - actualDamage);
        }
        return actualDamage;
    }

    heal(amount) {
        this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
    }
    
    addPotentialPoints(points) {
        this.potentialPoints += points;
    }

    gainRage(amount) {
        if (this.class !== 'warrior') return;
        this.rage = Math.min(this.maxRage, this.rage + amount * (this.rageGainMult || 1));
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

        // 护盾条(蓝色,叠在 HP 条上方)
        if (this.shield > 0) {
            const cap = this.maxHealth * (this.shieldCapRatio || 0.10);
            const shieldPct = Math.min(1, this.shield / cap);
            const sby = by - healthBarHeight - 1;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            roundRect(ctx, bx, sby, healthBarWidth, healthBarHeight, 3);
            ctx.fill();
            ctx.fillStyle = '#42a5f5';
            ctx.shadowBlur = 6;
            ctx.shadowColor = '#42a5f5';
            roundRect(ctx, bx, sby, healthBarWidth * shieldPct, healthBarHeight, 3);
            ctx.fill();
        }
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
        this.restDuration = 2; // 秒(用 DT 推进,暂停时自动停)

        // 炮手专属
        this.shootTimer = 1 + Math.random() * 1.5; // 错开初始开火,避免齐射
        this.shootInterval = 2.5;
        this.pendingShot = null;
        this.aimAngle = 0;
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
            case 'gunner': // 远程炮手:不移动,定期朝玩家发射投射物
                this.size = 32;
                this.speed = 0;
                this.maxHealth = 55 * this.difficulty;
                this.currentHealth = 55 * this.difficulty;
                this.attack = 15 * this.difficulty;
                this.defense = 2 * this.difficulty;
                this.color = '#ff6f00';
                this.shootInterval = Math.max(1.0, 2.5 - (this.difficulty - 1) * 0.3); // 难度越高射速越快
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
            this.stunTimer -= DT;
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
            case 'gunner':
                this.updateGunner(playerX, playerY);
                break;
        }
    }

    updateGunner(playerX, playerY) {
        // 计算瞄准角
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        this.aimAngle = Math.atan2(dy, dx);

        this.shootTimer -= DT;
        if (this.shootTimer <= 0) {
            this.shootTimer = this.shootInterval;
            const speed = 4.5 + this.difficulty * 0.5;
            this.pendingShot = {
                x: this.x + this.size / 2,
                y: this.y + this.size / 2,
                vx: Math.cos(this.aimAngle) * speed,
                vy: Math.sin(this.aimAngle) * speed,
                damage: this.attack
            };
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
            // 休息中(秒)
            this.restTimer += DT;
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
    
    render(ctx, frozen = false) {
        // 炮手有专属渲染
        if (this.type === 'gunner') {
            this._renderGunner(ctx, frozen);
            return;
        }

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
        const labels = { chaser: '追', patroller: '巡', giant: '巨', gunner: '炮' };
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

        // 冻结时:在敌人身上叠加冰封效果(蓝色半透明 + 冰晶高光)
        if (frozen) {
            ctx.save();
            ctx.globalAlpha = 0.55;
            // 蓝色冰块叠加
            const iceGrad = ctx.createLinearGradient(this.x, this.y, this.x + this.size, this.y + this.size);
            iceGrad.addColorStop(0, 'rgba(160,220,255,0.9)');
            iceGrad.addColorStop(1, 'rgba(60,140,220,0.7)');
            ctx.fillStyle = iceGrad;
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#88ddff';
            roundRect(ctx, this.x, this.y, this.size, this.size, this.type === 'giant' ? 10 : 6);
            ctx.fill();
            // 冰晶高光纹路
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = 'rgba(200,240,255,0.8)';
            ctx.lineWidth = 1.2;
            ctx.shadowBlur = 0;
            const cx2 = this.x + this.size / 2, cy2 = this.y + this.size / 2;
            // 米字纹
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI;
                const r = this.size * 0.42;
                ctx.beginPath();
                ctx.moveTo(cx2 + Math.cos(a) * r, cy2 + Math.sin(a) * r);
                ctx.lineTo(cx2 - Math.cos(a) * r, cy2 - Math.sin(a) * r);
                ctx.stroke();
            }
            // 中心小六角
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const r = this.size * 0.12;
                i === 0 ? ctx.moveTo(cx2 + Math.cos(a)*r, cy2 + Math.sin(a)*r)
                        : ctx.lineTo(cx2 + Math.cos(a)*r, cy2 + Math.sin(a)*r);
            }
            ctx.closePath();
            ctx.stroke();
            // ❄ 图标
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = '#ddf4ff';
            ctx.font = `bold ${Math.floor(this.size * 0.35)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('❄', cx2, cy2);
            ctx.restore();
        }
    }

    _renderGunner(ctx, frozen) {
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;

        ctx.save();
        // 底座:深橙方块
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#ff6f00';
        const grad = ctx.createLinearGradient(this.x, this.y, this.x + this.size, this.y + this.size);
        grad.addColorStop(0, '#ffab40');
        grad.addColorStop(1, '#e65100');
        ctx.fillStyle = grad;
        roundRect(ctx, this.x, this.y, this.size, this.size, 7);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,111,0,0.8)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, this.x, this.y, this.size, this.size, 7);
        ctx.stroke();

        // 炮管:从中心向瞄准角延伸的矩形
        const barrelLen = this.size * 0.65;
        const barrelW   = this.size * 0.28;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.aimAngle);
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ff9800';
        const bGrad = ctx.createLinearGradient(0, -barrelW / 2, barrelLen, barrelW / 2);
        bGrad.addColorStop(0, '#ffd54f');
        bGrad.addColorStop(1, '#bf360c');
        ctx.fillStyle = bGrad;
        roundRect(ctx, 0, -barrelW / 2, barrelLen, barrelW, 3);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,200,50,0.7)';
        ctx.lineWidth = 1;
        roundRect(ctx, 0, -barrelW / 2, barrelLen, barrelW, 3);
        ctx.stroke();
        ctx.restore();

        // 炮管口火花(开火前 0.3s 闪烁)
        if (this.shootTimer < 0.3) {
            const flash = (0.3 - this.shootTimer) / 0.3;
            ctx.save();
            ctx.globalAlpha = flash * 0.8;
            ctx.shadowBlur = 16;
            ctx.shadowColor = '#ffeb3b';
            ctx.fillStyle = '#ffee58';
            const ex = cx + Math.cos(this.aimAngle) * barrelLen;
            const ey = cy + Math.sin(this.aimAngle) * barrelLen;
            ctx.beginPath();
            ctx.arc(ex, ey, barrelW * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 中心图标
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `bold ${Math.floor(this.size * 0.3)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('炮', cx, cy);
        ctx.restore();

        ctx.restore();

        // 血条
        const healthBarHeight = 4;
        const healthPercentage = this.currentHealth / this.maxHealth;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, this.x, this.y - 10, this.size, healthBarHeight, 2);
        ctx.fill();
        ctx.fillStyle = '#ff6f00';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#ff6f00';
        roundRect(ctx, this.x, this.y - 10, this.size * healthPercentage, healthBarHeight, 2);
        ctx.fill();
        ctx.restore();

        // 装弹进度条(显示下次开火倒计时)
        const reloadPct = Math.max(0, 1 - this.shootTimer / this.shootInterval);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        roundRect(ctx, this.x, this.y - 5, this.size, 3, 1);
        ctx.fill();
        ctx.fillStyle = reloadPct > 0.8 ? '#ffeb3b' : '#ff9800';
        roundRect(ctx, this.x, this.y - 5, this.size * reloadPct, 3, 1);
        ctx.fill();
        ctx.restore();

        // 冻结叠加
        if (frozen) {
            ctx.save();
            ctx.globalAlpha = 0.55;
            const iceGrad = ctx.createLinearGradient(this.x, this.y, this.x + this.size, this.y + this.size);
            iceGrad.addColorStop(0, 'rgba(160,220,255,0.9)');
            iceGrad.addColorStop(1, 'rgba(60,140,220,0.7)');
            ctx.fillStyle = iceGrad;
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#88ddff';
            roundRect(ctx, this.x, this.y, this.size, this.size, 7);
            ctx.fill();
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = '#ddf4ff';
            ctx.shadowBlur = 0;
            ctx.font = `bold ${Math.floor(this.size * 0.35)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('❄', cx, cy);
            ctx.restore();
        }
    }
}

class Item {
    constructor(x, y, type) {
        this.targetX = x;
        this.targetY = y;
        this.x = x;
        this.y = y - 80; // 从上方开始下落
        this.size = 25;
        this.type = type;
        this.color = '#2196F3';
        this.icon = '';
        this.rarity = 'common';

        // 稀有度配置:寿命越短表示越稀有(应尽快拾取)
        // 配色:普通绿、稀有蓝、史诗紫金
        const cfg = {
            potion:           { color: '#4CAF50', icon: '💊', rarity: 'common', duration: 15 },
            exp_book:         { color: '#ff9800', icon: '📚', rarity: 'common', duration: 15 },
            snowflake:        { color: '#2196F3', icon: '❄️', rarity: 'rare',   duration: 10 },
            bomb:             { color: '#f44336', icon: '💣', rarity: 'rare',   duration: 10 },
            heart:            { color: '#e91e63', icon: '❤️', rarity: 'epic',   duration: 6  },
            potion_invicible: { color: '#9c27b0', icon: '⚡', rarity: 'epic',   duration: 5  }
        };
        const c = cfg[type] || cfg.potion;
        this.color = c.color;
        this.icon = c.icon;
        this.rarity = c.rarity;
        this.duration = c.duration;
        this.maxDuration = c.duration;

        // 下落入场动画
        this.landTimer = 0.4; // 0.4s 落地
        this.maxLandTimer = 0.4;
        this.spawnY = this.y;

        // 旋转 & 浮动相位(用于 render)
        this.spinPhase = Math.random() * Math.PI * 2;
        this.bobPhase = Math.random() * Math.PI * 2;
    }

    update() {
        this.duration -= DT;
        if (this.landTimer > 0) {
            this.landTimer -= DT;
            // 缓动:easeOutQuad
            const t = 1 - Math.max(0, this.landTimer / this.maxLandTimer);
            const eased = 1 - (1 - t) * (1 - t);
            this.y = this.spawnY + (this.targetY - this.spawnY) * eased;
            if (this.landTimer <= 0) this.y = this.targetY;
        }
        this.spinPhase += 0.04;
        this.bobPhase += 0.08;
    }

    render(ctx) {
        const time = Date.now() * 0.001;
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        const landing = this.landTimer > 0;

        // 落地光圈(下落动画结束瞬间扩散)
        if (landing) {
            const prog = 1 - (this.landTimer / this.maxLandTimer);
            ctx.save();
            ctx.globalAlpha = (1 - prog) * 0.7;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 14;
            ctx.shadowColor = this.color;
            ctx.beginPath();
            ctx.arc(this.targetX + this.size / 2, this.targetY + this.size / 2, this.size * (0.5 + prog * 1.5), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 浮动效果(着陆后)
        const bob = landing ? 0 : Math.sin(this.bobPhase) * 2;
        const drawY = this.y + bob;
        const drawCy = cy + bob;

        // 寿命警告:剩余 < 30% 闪烁,剩 < 15% 红框
        const lifePct = this.duration / this.maxDuration;
        let flicker = 1;
        let warningFlash = false;
        if (lifePct < 0.30) {
            const speed = lifePct < 0.15 ? 18 : 10;
            flicker = 0.4 + 0.6 * Math.abs(Math.sin(time * speed));
            warningFlash = lifePct < 0.15;
        }

        // 稀有度光环强度
        const rarityAuraScale = { common: 1.0, rare: 1.4, epic: 1.8 };
        const auraScale = rarityAuraScale[this.rarity] || 1;
        const pulse = 0.7 + Math.sin(time * 5 + this.spinPhase) * 0.3;

        ctx.save();
        ctx.globalAlpha = flicker;

        // 外层稀有度光环(史诗有第二层金色)
        if (this.rarity === 'epic') {
            ctx.shadowBlur = 28;
            ctx.shadowColor = '#ffd700';
            ctx.fillStyle = 'rgba(255, 215, 0, 0.18)';
            ctx.beginPath();
            ctx.arc(cx, drawCy, this.size * 1.1 * pulse * auraScale, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.rarity === 'rare') {
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#42a5f5';
        }

        // 主光环
        ctx.shadowBlur = 18 * pulse * auraScale;
        ctx.shadowColor = this.color;
        ctx.fillStyle = `${this.color}33`;
        ctx.beginPath();
        ctx.arc(cx, drawCy, this.size * 0.75 * pulse * auraScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 主体方块(稍微旋转感)
        const grad = ctx.createRadialGradient(
            this.x + this.size * 0.35, drawY + this.size * 0.35, 0,
            cx, drawCy, this.size * 0.7
        );
        grad.addColorStop(0, `${this.color}ff`);
        grad.addColorStop(1, `${this.color}88`);
        ctx.fillStyle = grad;
        roundRect(ctx, this.x, drawY, this.size, this.size, 8);
        ctx.fill();

        // 边框(警告时变红)
        ctx.strokeStyle = warningFlash ? '#ff1744' : `${this.color}cc`;
        ctx.lineWidth = warningFlash ? 2.5 : 1.5;
        roundRect(ctx, this.x, drawY, this.size, this.size, 8);
        ctx.stroke();

        // 稀有度小标识(史诗在右上画小星星)
        if (this.rarity === 'epic') {
            ctx.fillStyle = '#ffd700';
            ctx.shadowBlur = 6;
            ctx.shadowColor = '#ffd700';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('★', this.x + this.size - 2, drawY + 4);
            ctx.shadowBlur = 0;
        }
        ctx.restore();

        // 图标
        ctx.save();
        ctx.globalAlpha = flicker;
        ctx.font = '15px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icon, cx, drawCy);
        ctx.restore();
    }
}

class BlockBoss {
    constructor(x, y, difficulty, playerMaxHealth) {
        this.x = x;
        this.y = y;
        this.size = 80;
        this.difficulty = difficulty;
        this.speed = 2.2; // 略低于玩家基础 5,但难度提高后会追近
        this.maxHealth = 2000 * difficulty;
        this.currentHealth = this.maxHealth;
        this.attack = Math.max(50, playerMaxHealth * 0.5);
        this.defense = 0; // 不靠防御,血厚
        this.color = '#4a0080';
        this.stunTimer = 0;
        // 用于击退动画(被击退时关闭碰撞)
        this.retreating = false;
        this.retreatVx = 0;
        this.retreatVy = 0;
        this.retreatTimer = 0;
        // 浮动相位
        this.phase = 0;
    }

    update(playerX, playerY) {
        this.phase += 0.04;
        if (this.retreating) {
            this.x += this.retreatVx;
            this.y += this.retreatVy;
            this.retreatTimer -= DT;
            return;
        }
        if (this.stunTimer > 0) {
            this.stunTimer -= DT;
            return;
        }
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
            this.x += (dx / dist) * this.speed;
            this.y += (dy / dist) * this.speed;
        }
    }

    takeDamage(damage) {
        // 魔王不死,血量归零由 Game 端判定击退
        this.currentHealth = Math.max(0, this.currentHealth - damage);
        return damage;
    }

    triggerRetreat(playerX, playerY) {
        // 沿背离玩家方向飞走
        const dx = this.x - playerX;
        const dy = this.y - playerY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        this.retreatVx = (dx / dist) * 8;
        this.retreatVy = (dy / dist) * 8;
        this.retreating = true;
        this.retreatTimer = 1.5;
    }

    render(ctx) {
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        const pulse = 0.8 + Math.sin(this.phase * 3) * 0.2;

        // 外层威胁红光环
        ctx.save();
        ctx.globalAlpha = this.retreating ? Math.max(0, this.retreatTimer / 1.5) : 1;
        ctx.shadowBlur = 40 * pulse;
        ctx.shadowColor = '#ff1744';
        ctx.fillStyle = 'rgba(255, 23, 68, 0.18)';
        ctx.beginPath();
        ctx.arc(cx, cy, this.size * 0.95 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // 紫色主体光晕
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#7c4dff';

        const grad = ctx.createLinearGradient(this.x, this.y, this.x + this.size, this.y + this.size);
        grad.addColorStop(0, '#7c4dff');
        grad.addColorStop(0.5, '#4a0080');
        grad.addColorStop(1, '#1a0033');
        ctx.fillStyle = grad;
        roundRect(ctx, this.x, this.y, this.size, this.size, 14);
        ctx.fill();

        // 边框(脉冲红)
        ctx.shadowBlur = 16;
        ctx.shadowColor = '#ff1744';
        ctx.strokeStyle = `rgba(255, 23, 68, ${0.5 + 0.5 * pulse})`;
        ctx.lineWidth = 3;
        roundRect(ctx, this.x, this.y, this.size, this.size, 14);
        ctx.stroke();
        ctx.restore();

        // 中心红色眼睛/符号
        ctx.save();
        ctx.globalAlpha = this.retreating ? Math.max(0, this.retreatTimer / 1.5) : 1;
        ctx.fillStyle = '#ff1744';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff1744';
        ctx.font = `bold ${Math.floor(this.size * 0.45)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('魔', cx, cy);
        ctx.restore();
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

        const ax = this.x + this.size / 2;
        const ay = this.y + this.size / 2;

        for (let j = this.game.enemies.length - 1; j >= 0; j--) {
            const e = this.game.enemies[j];
            if (this.hitEnemies.has(e)) continue;
            const ex = e.x + e.size / 2;
            const ey = e.y + e.size / 2;
            if (Math.abs(ax - ex) < (e.size / 2 + this.size / 2) && Math.abs(ay - ey) < (e.size / 2 + this.size / 2)) {
                this.hitEnemies.add(e);
                e.takeDamage(this.damage);
                this.game.spawnHitParticles(ex, ey, '#aaff44', 6);
                if (e.currentHealth <= 0) {
                    this.game.spawnHitParticles(ex, ey, e.color, 10);
                    this.game._onEnemyKilled();
                    this.game.enemies.splice(j, 1);
                }
            }
        }
        // 命中魔王
        const boss = this.game.boss;
        if (boss && this.game.bossState === 'active' && !this.hitEnemies.has(boss)) {
            const bx = boss.x + boss.size / 2;
            const by = boss.y + boss.size / 2;
            if (Math.abs(ax - bx) < (boss.size / 2 + this.size / 2) && Math.abs(ay - by) < (boss.size / 2 + this.size / 2)) {
                this.hitEnemies.add(boss);
                boss.takeDamage(this.damage);
                this.game.bossDamageDealt += this.damage;
                this.game.spawnHitParticles(bx, by, '#ff1744', 8);
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

class EnemyBullet {
    constructor(x, y, vx, vy, damage) {
        this.x = x - 6;
        this.y = y - 6;
        this.size = 12;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.trail = [];
        this.angle = Math.atan2(vy, vx);
    }

    update() {
        this.trail.push({ x: this.x + this.size / 2, y: this.y + this.size / 2 });
        if (this.trail.length > 8) this.trail.shift();
        this.x += this.vx;
        this.y += this.vy;
    }

    render(ctx) {
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        ctx.save();
        // 弹道尾迹
        for (let i = 0; i < this.trail.length; i++) {
            const t = i / this.trail.length;
            ctx.globalAlpha = t * 0.45;
            ctx.fillStyle = '#ffcc80';
            ctx.beginPath();
            ctx.arc(this.trail[i].x, this.trail[i].y, this.size * 0.3 * t, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 炮弹主体:椭圆形朝飞行方向
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff6f00';
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        const bGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size * 0.6);
        bGrad.addColorStop(0, '#ffee58');
        bGrad.addColorStop(0.5, '#ff9800');
        bGrad.addColorStop(1, '#bf360c');
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size * 0.6, this.size * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
        // 高光
        ctx.fillStyle = 'rgba(255,255,200,0.5)';
        ctx.beginPath();
        ctx.ellipse(-this.size * 0.15, -this.size * 0.1, this.size * 0.22, this.size * 0.12, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.restore();
    }
}

window.addEventListener('load', () => {
    const game = new Game();
    game.render();
});