(function () {
  "use strict";

  const SG = (window.SummonGame = window.SummonGame || {});
  const { CONFIG, Utils } = SG;

  class Battlefield {
    constructor(canvas, callbacks) {
      this.canvas = canvas;
      this.callbacks = callbacks || {};
      this.reset();
    }

    reset() {
      this.units = [];
      this.enemies = [];
      this.projectiles = [];
      this.particles = [];
      this.effects = [];
      this.floatTexts = [];
      this.waveQueue = [];
      this.spawnTimer = 0;
      this.waveBreakTimer = 0;
      this.waveActive = false;
      this.finished = false;
      this.warningTimer = 0;
      this.width = this.canvas.clientWidth || 1;
      this.height = this.canvas.clientHeight || 1;
      this.lanes = [0.31, 0.5, 0.69];
      this.syncGeometry();
    }

    update(dt, state) {
      this.syncGeometry();
      this.updateTimers(dt, state);
      if (state.mode === "coop") this.updateCoopWaves(dt, state);
      if (state.mode === "pk") this.updatePKRules(dt, state);

      this.updateUnits(dt, state);
      this.updateEnemies(dt, state);
      this.updateProjectiles(dt, state);
      this.updateEffects(dt);
      this.cleanup();
    }

    syncGeometry() {
      this.width = this.canvas.clientWidth || this.width || 1;
      this.height = this.canvas.clientHeight || this.height || 1;
      this.leftBaseX = Math.max(76, this.width * 0.08);
      this.rightBaseX = Math.min(this.width - 76, this.width * 0.92);
      this.baseY = this.height * 0.52;
    }

    updateTimers(dt, state) {
      this.warningTimer = Math.max(0, this.warningTimer - dt);
      state.baseShield = Math.max(0, (state.baseShield || 0) - dt * 0.9);
      if (state.enemyBase) state.enemyBase.shield = Math.max(0, (state.enemyBase.shield || 0) - dt * 0.65);
      if (state.bases) {
        state.bases.p1.shield = Math.max(0, state.bases.p1.shield - dt * 0.7);
        state.bases.p2.shield = Math.max(0, state.bases.p2.shield - dt * 0.7);
      }
    }

    laneY(index) {
      return this.height * this.lanes[index % this.lanes.length];
    }

    updateCoopWaves(dt, state) {
      if (this.finished) return;
      if (!this.waveActive && this.waveBreakTimer <= 0) {
        this.startCoopWave(state);
      }

      if (this.waveQueue.length > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          const id = this.waveQueue.shift();
          this.spawnEnemy(id, state);
          this.spawnTimer = Utils.rand(0.48, 0.95) / Math.max(1, state.difficulty * 0.08 + 1);
        }
        return;
      }

      if (this.enemies.length > 0) return;

      if (this.waveActive) {
        this.waveActive = false;
        this.waveBreakTimer = state.variant === "infinite" ? 2.4 : 2.9;
        if (state.variant === "infinite" || state.waveInStage < CONFIG.coopStages[state.stageIndex].waves) {
          this.callbacks.onLog?.("敌群暂时退去，召唤阵正在重整。");
        }
      } else {
        this.waveBreakTimer -= dt;
        if (this.waveBreakTimer <= 0) {
          this.advanceCoopWave(state);
        }
      }
    }

    startCoopWave(state) {
      const plan = this.getWavePlan(state);
      if (state.enemyBase) {
        const maxHp = CONFIG.baseMaxHp + state.stageIndex * 28 + (state.variant === "infinite" ? state.wave * 8 : 0);
        state.enemyBase.maxHp = maxHp;
        if (state.waveInStage === 1 || state.variant === "infinite" || state.enemyBase.hp <= 0) {
          state.enemyBase.hp = maxHp;
          state.enemyBase.shield = 0;
        }
      }
      this.waveQueue = this.expandEnemyPlan(plan, state);
      this.waveActive = true;
      this.spawnTimer = 0.22;
      state.waveLabel = this.getWaveLabel(state);
      if (plan.includes("chaosCore")) {
        this.warningTimer = 4;
        this.callbacks.onLog?.("警告：混沌核心正在进入战场。");
      } else {
        this.callbacks.onLog?.(`${state.stageName} 第 ${state.waveInStage} 波开始。`);
      }
    }

    advanceCoopWave(state) {
      if (state.variant === "infinite") {
        state.wave += 1;
        state.waveInStage = state.wave;
        state.difficulty = 1 + state.wave * 0.36;
        state.stageName = CONFIG.infinite.name;
        state.mapTone = CONFIG.infinite.mapTone;
        state.waveLabel = `无限 ${state.wave}`;
        this.startCoopWave(state);
        return;
      }

      const stage = CONFIG.coopStages[state.stageIndex];
      if (state.waveInStage < stage.waves) {
        state.wave += 1;
        state.waveInStage += 1;
        state.difficulty = 1 + state.stageIndex * 0.8 + state.waveInStage * 0.24;
        state.waveLabel = this.getWaveLabel(state);
        this.startCoopWave(state);
        return;
      }

      this.finished = true;
      this.callbacks.onLog?.(`${stage.name} 通关，进入关卡结算。`);
      this.callbacks.onBattleEnd?.(state.stageIndex >= CONFIG.coopStages.length - 1 ? "victory" : "stageVictory");
    }

    enterStage(state) {
      const stage = CONFIG.coopStages[state.stageIndex];
      state.stageName = stage.name;
      state.mapTone = stage.mapTone;
      state.difficulty = 1 + state.stageIndex * 0.8 + state.waveInStage * 0.24;
      state.waveLabel = this.getWaveLabel(state);
      this.callbacks.onLog?.(`进入${stage.name}：${stage.mechanic}`);
      this.effects.push({
        x: this.width * 0.5,
        y: this.height * 0.5,
        radius: 20,
        maxRadius: 280,
        life: 1.2,
        maxLife: 1.2,
        color: "#ffca67"
      });
    }

    getWavePlan(state) {
      if (state.variant === "infinite") {
        if (state.wave % CONFIG.infinite.bossEvery === 0) return ["chaosCore"];
        if (state.wave % CONFIG.infinite.eliteEvery === 0) return ["shield", "frostMage", "priest", "eye"];
        const pool = ["slime", "runner", "shield", "bomber", "frostMage", "eye", "priest"];
        return Array.from({ length: 3 + Math.min(4, Math.floor(state.wave / 3)) }, () => Utils.choose(pool));
      }
      const stage = CONFIG.coopStages[state.stageIndex];
      return stage.enemyPlan[state.waveInStage - 1] || stage.enemyPlan[stage.enemyPlan.length - 1];
    }

    getWaveLabel(state) {
      if (state.variant === "infinite") return `无限 ${state.wave}`;
      const stage = CONFIG.coopStages[state.stageIndex];
      return `第${state.stageIndex + 1}关 ${state.waveInStage}/${stage.waves}波`;
    }

    expandEnemyPlan(plan, state) {
      const expanded = [];
      plan.forEach((id) => {
        if (id === "chaosCore") {
          expanded.push("chaosCore");
          return;
        }
        const count = 1 + Math.floor(state.difficulty * 0.55) + (id === "slime" ? 1 : 0);
        for (let i = 0; i < count; i += 1) expanded.push(id);
      });
      return expanded.sort(() => Math.random() - 0.5);
    }

    updatePKRules(dt, state) {
      state.pkTimeLeft = Math.max(0, state.pkTimeLeft - dt);
      state.waveLabel = `PK ${Math.ceil(state.pkTimeLeft)}s`;
      if (this.finished) return;
      if (state.bases.p1.hp <= 0 || state.bases.p2.hp <= 0) {
        this.finished = true;
        this.callbacks.onBattleEnd?.(state.bases.p1.hp <= 0 ? "p2" : "p1");
        return;
      }
      if (state.pkTimeLeft <= 0) {
        this.finished = true;
        const diff = state.bases.p1.hp - state.bases.p2.hp;
        this.callbacks.onBattleEnd?.(Math.abs(diff) < 1 ? "draw" : diff > 0 ? "p1" : "p2");
      }
    }

    spawnUnit(type, owner, state, options) {
      const cfg = CONFIG.units[type] || CONFIG.units.slimeMech;
      const player = CONFIG.players[owner];
      const isPK = state?.mode === "pk";
      const lane = options?.lane ?? Math.floor(Utils.rand(0, this.lanes.length));
      const direction = isPK && owner === "p2" ? -1 : 1;
      const baseX = direction > 0 ? this.leftBaseX : this.rightBaseX;
      const unit = {
        id: `unit-${performance.now()}-${Math.random()}`,
        kind: "unit",
        type,
        owner,
        team: isPK ? owner : "player",
        lane,
        direction,
        x: baseX + direction * Utils.rand(36, 76),
        y: this.laneY(lane) + Utils.rand(-9, 9),
        hp: cfg.hp,
        maxHp: cfg.hp,
        speed: cfg.speed,
        range: cfg.range,
        damage: cfg.damage,
        attackRate: cfg.attackRate,
        attackTimer: Utils.rand(0, cfg.attackRate),
        radius: cfg.radius,
        behavior: cfg.behavior,
        color: cfg.color || player.color,
        sprite: options?.temporary ? "assets/generated/unit-temp-mech.png" : cfg.sprite,
        dead: false,
        dying: false,
        remove: false,
        action: "idle",
        actionTimer: 0,
        attackPulse: 0,
        hitPulse: 0,
        hitFlash: 0,
        isMoving: false,
        temporary: !!options?.temporary,
        life: options?.temporary ? 28 : Infinity,
        slowTimer: 0,
        slowMul: 1,
        step: Utils.rand(0, Math.PI * 2)
      };

      this.units.push(unit);
      this.effects.push({
        type: "summon",
        x: unit.x,
        y: unit.y,
        radius: 10,
        maxRadius: type === "starGolem" ? 110 : 64,
        life: type === "starGolem" ? 1 : 0.55,
        maxLife: type === "starGolem" ? 1 : 0.55,
        color: unit.color
      });
      this.spawnBurst(unit.x, unit.y, unit.color, type === "starGolem" ? 32 : 14, 0.9);
    }

    spawnEnemy(type, state) {
      const cfg = CONFIG.enemies[type] || CONFIG.enemies.slime;
      const lane = Math.floor(Utils.rand(0, this.lanes.length));
      const hpScale = cfg.boss ? 1 + Math.max(0, state.difficulty - 2) * 0.16 : 1 + Math.max(0, state.difficulty - 1) * 0.12;
      const enemy = {
        id: `enemy-${performance.now()}-${Math.random()}`,
        kind: "enemy",
        type,
        team: "enemy",
        lane,
        direction: -1,
        x: Math.min(this.width + 40, this.rightBaseX - Utils.rand(cfg.boss ? 22 : 34, cfg.boss ? 42 : 92)),
        y: cfg.boss ? this.height * 0.5 : this.laneY(lane),
        hp: Math.round(cfg.hp * hpScale),
        maxHp: Math.round(cfg.hp * hpScale),
        speed: cfg.speed + Math.max(0, state.difficulty - 1) * 0.8,
        range: cfg.range,
        damage: cfg.damage + Math.max(0, state.difficulty - 1) * 0.7,
        attackRate: cfg.attackRate,
        attackTimer: Utils.rand(0, cfg.attackRate),
        reward: Math.round(cfg.reward * (1 + Math.max(0, state.difficulty - 1) * 0.05)),
        radius: cfg.radius,
        behavior: cfg.behavior,
        color: cfg.color,
        armor: cfg.armor || 0,
        dead: false,
        flying: !!cfg.flying,
        boss: !!cfg.boss,
        sprite: cfg.sprite,
        phase: 1,
        skillTimer: cfg.boss ? 4.2 : Utils.rand(1.4, 2.4),
        slowTimer: 0,
        slowMul: 1,
        hitFlash: 0,
        dying: false,
        remove: false,
        action: "idle",
        actionTimer: 0,
        attackPulse: 0,
        hitPulse: 0,
        isMoving: false,
        step: Utils.rand(0, Math.PI * 2)
      };
      this.enemies.push(enemy);
      if (enemy.boss) {
        this.effects.push({ type: "boss-warning", x: enemy.x, y: enemy.y, radius: 40, maxRadius: 190, life: 1.2, maxLife: 1.2, color: enemy.color });
      }
    }

    setActorAction(actor, action, duration) {
      if (!actor || actor.dying || actor.remove) return;
      actor.action = action;
      actor.actionTimer = Math.max(actor.actionTimer || 0, duration || 0.18);
      if (action === "attack") actor.attackPulse = 1;
      if (action === "hit") actor.hitPulse = 1;
    }

    markActorDead(actor) {
      if (!actor || actor.dying || actor.remove) return;
      actor.dead = true;
      actor.dying = true;
      actor.action = "death";
      actor.actionTimer = 0.72;
      actor.deathTimer = actor.boss ? 1.2 : 0.72;
      actor.maxDeathTimer = actor.deathTimer;
      actor.attackPulse = 0;
      actor.hitPulse = Math.max(actor.hitPulse || 0, 0.8);
      actor.hitFlash = 0;
      actor.isMoving = false;
    }

    updateActorAnimation(actor, dt) {
      if (!actor) return;
      const moving = !!actor.isMoving && !actor.dead;
      actor.step = (actor.step || 0) + dt * (moving ? 11 : 4.4);
      actor.actionTimer = Math.max(0, (actor.actionTimer || 0) - dt);
      actor.attackPulse = Math.max(0, (actor.attackPulse || 0) - dt * 3.7);
      actor.hitPulse = Math.max(0, (actor.hitPulse || 0) - dt * 3.2);
      actor.hitFlash = Math.max(0, (actor.hitFlash || 0) - dt * 5);

      if (actor.dying) {
        actor.action = "death";
        actor.deathTimer = Math.max(0, (actor.deathTimer || 0) - dt);
        if (actor.deathTimer <= 0) actor.remove = true;
        return;
      }

      if (actor.actionTimer <= 0 || actor.action === "idle" || actor.action === "walk") {
        actor.action = moving ? "walk" : "idle";
      }
    }

    updateUnits(dt, state) {
      this.units.forEach((unit) => {
        unit.attackTimer -= dt;
        unit.life -= dt;
        if (unit.life <= 0) this.markActorDead(unit);
        unit.slowTimer = Math.max(0, unit.slowTimer - dt);
        if (unit.slowTimer <= 0) unit.slowMul = 1;
        this.updateActorAnimation(unit, dt);
        unit.isMoving = false;
        if (unit.dead) return;

        if (unit.behavior === "heal") {
          this.updateHealer(unit, dt);
          return;
        }

        const target = this.findTargetForUnit(unit, state);
        if (target) {
          if (unit.attackTimer <= 0) {
            this.unitAttack(unit, target, state);
            unit.attackTimer = unit.attackRate;
          }
          return;
        }

        const baseTarget = this.getOpposingBaseInRange(unit, state);
        if (baseTarget) {
          if (unit.attackTimer <= 0) {
            this.setActorAction(unit, "attack", 0.32);
            this.damageBase(baseTarget, unit.damage, state, unit.color);
            this.spawnHit(baseTarget === "p1" ? this.leftBaseX : this.rightBaseX, this.baseY, unit.color);
            unit.attackTimer = unit.attackRate;
          }
          return;
        }

        unit.x += unit.direction * unit.speed * unit.slowMul * dt;
        unit.isMoving = true;
      });
    }

    updateHealer(unit, dt) {
      const allies = this.units
        .filter((other) => other.team === unit.team && other.hp < other.maxHp && other !== unit && !other.dead)
        .sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y));
      const target = allies.find((ally) => Math.hypot(ally.x - unit.x, ally.y - unit.y) <= unit.range);
      if (target && unit.attackTimer <= 0) {
        this.setActorAction(unit, "attack", 0.36);
        this.effects.push({
          type: "beam",
          fromX: unit.x,
          fromY: unit.y - 12,
          toX: target.x,
          toY: target.y - 10,
          life: 0.34,
          maxLife: 0.34,
          color: unit.color
        });
        this.healUnit(target, Math.abs(unit.damage), unit.color);
        unit.attackTimer = unit.attackRate;
      } else if (!target) {
        unit.x += unit.direction * unit.speed * unit.slowMul * dt;
        unit.isMoving = true;
      }
    }

    updateEnemies(dt, state) {
      this.enemies.forEach((enemy) => {
        enemy.attackTimer -= dt;
        enemy.skillTimer -= dt;
        enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
        if (enemy.slowTimer <= 0) enemy.slowMul = 1;
        this.updateActorAnimation(enemy, dt);
        enemy.isMoving = false;
        if (enemy.dead) return;

        if (enemy.boss) this.updateBoss(enemy, state);
        if (enemy.behavior === "priest" && this.tryPriestHeal(enemy)) return;

        const target = this.findBlockingUnit(enemy);
        if (target) {
          if (enemy.attackTimer <= 0) {
            this.enemyAttack(enemy, target, state);
            enemy.attackTimer = enemy.attackRate;
          }
          return;
        }

        const baseDistance = enemy.x - this.leftBaseX;
        if (baseDistance <= enemy.range + 38) {
          if (enemy.attackTimer <= 0) {
            this.setActorAction(enemy, "attack", 0.32);
            this.damageBase("team", enemy.damage, state, enemy.color);
            enemy.attackTimer = enemy.attackRate;
          }
          return;
        }

        enemy.x -= enemy.speed * enemy.slowMul * dt;
        enemy.isMoving = true;
      });
    }

    updateBoss(enemy, state) {
      if (enemy.phase === 1 && enemy.hp < enemy.maxHp * 0.5) {
        enemy.phase = 2;
        enemy.damage *= 1.35;
        enemy.speed *= 1.22;
        this.warningTimer = 3.3;
        this.callbacks.onLog?.("混沌核心进入第二阶段：脉冲增强并召唤护卫。");
        this.effects.push({ type: "boss-warning", x: enemy.x, y: enemy.y, radius: 44, maxRadius: 230, life: 1.4, maxLife: 1.4, color: enemy.color });
        ["shield", "eye", "priest"].forEach((id) => this.spawnEnemy(id, state));
      }
      if (enemy.skillTimer <= 0) {
        enemy.skillTimer = enemy.phase === 2 ? 4.6 : 6.2;
        this.setActorAction(enemy, "attack", 0.54);
        const radius = enemy.phase === 2 ? 170 : 128;
        this.effects.push({
          type: "boss-pulse",
          x: enemy.x,
          y: enemy.y,
          radius: 20,
          maxRadius: radius,
          life: 0.72,
          maxLife: 0.72,
          color: enemy.color
        });
        this.units.forEach((unit) => {
          const distance = Math.hypot(unit.x - enemy.x, unit.y - enemy.y);
          if (distance <= radius) {
            this.damageUnit(unit, enemy.phase === 2 ? 18 : 12, enemy.color);
            unit.slowTimer = 1.2;
            unit.slowMul = 0.55;
          }
        });
        this.callbacks.onLog?.("混沌核心释放虚空脉冲。");
      }
    }

    tryPriestHeal(priest) {
      if (priest.attackTimer > 0) return false;
      const target = this.enemies
        .filter((enemy) => enemy !== priest && enemy.hp < enemy.maxHp && !enemy.dead)
        .find((enemy) => Math.hypot(enemy.x - priest.x, enemy.y - priest.y) <= priest.range);
      if (!target) return false;
      this.setActorAction(priest, "attack", 0.42);
      this.effects.push({
        type: "beam",
        fromX: priest.x,
        fromY: priest.y - 10,
        toX: target.x,
        toY: target.y - 10,
        life: 0.42,
        maxLife: 0.42,
        color: priest.color
      });
      this.healEnemy(target, CONFIG.enemies.priest.heal, priest.color);
      priest.attackTimer = priest.attackRate;
      return true;
    }

    findTargetForUnit(unit, state) {
      const candidates = state.mode === "pk"
        ? this.units.filter((other) => other.owner !== unit.owner && !other.dead)
        : this.enemies.filter((enemy) => !enemy.dead);
      let best = null;
      let bestScore = Infinity;
      candidates.forEach((target) => {
        const ahead = unit.direction > 0 ? target.x >= unit.x - 16 : target.x <= unit.x + 16;
        if (!ahead) return;
        const laneBias = Math.abs(target.y - unit.y) < 96 || target.flying ? 0 : 80;
        const dist = Math.hypot(target.x - unit.x, target.y - unit.y) + laneBias;
        if (dist <= unit.range + target.radius && dist < bestScore) {
          best = target;
          bestScore = dist;
        }
      });
      return best;
    }

    findBlockingUnit(enemy) {
      let best = null;
      let bestDist = Infinity;
      this.units.forEach((unit) => {
        if (unit.dead) return;
        const dist = Math.hypot(unit.x - enemy.x, unit.y - enemy.y);
        const range = enemy.range + unit.radius + (enemy.flying ? 40 : 10);
        if (dist < range && dist < bestDist) {
          best = unit;
          bestDist = dist;
        }
      });
      return best;
    }

    getOpposingBaseInRange(unit, state) {
      if (state.mode !== "pk") {
        if (unit.direction > 0 && this.rightBaseX - unit.x <= unit.range + 48) return "enemy";
        return null;
      }
      const target = unit.owner === "p1" ? "p2" : "p1";
      const baseX = target === "p1" ? this.leftBaseX : this.rightBaseX;
      if (Math.abs(unit.x - baseX) <= unit.range + 42) return target;
      return null;
    }

    unitAttack(unit, target, state) {
      this.setActorAction(unit, "attack", unit.behavior === "golem" ? 0.5 : 0.34);
      if (unit.behavior === "ranged") {
        this.projectiles.push({ type: "magic", x: unit.x, y: unit.y - 8, target, damage: unit.damage, speed: 330, color: unit.color, owner: unit.owner, trail: [] });
        return;
      }

      if (unit.behavior === "chain") {
        const points = [{ x: unit.x, y: unit.y - 12 }, { x: target.x, y: target.y - 8 }];
        this.damageTarget(target, unit.damage, state, unit.color);
        const list = target.kind === "enemy" ? this.enemies : this.units.filter((other) => other.owner !== unit.owner);
        list.filter((other) => other !== target && !other.dead)
          .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))
          .slice(0, 2)
          .forEach((other) => {
            if (Math.hypot(other.x - target.x, other.y - target.y) <= 110) {
              this.damageTarget(other, unit.damage * 0.65, state, unit.color);
              points.push({ x: other.x, y: other.y - 8 });
              this.effects.push({ type: "impact", x: other.x, y: other.y, radius: 8, maxRadius: 38, life: 0.32, maxLife: 0.32, color: "#ffe06a" });
            }
          });
        this.effects.push({ type: "chain", points, life: 0.38, maxLife: 0.38, color: "#ffe06a" });
        this.effects.push({ type: "impact", x: target.x, y: target.y, radius: 8, maxRadius: 70, life: 0.36, maxLife: 0.36, color: "#ffe06a" });
        return;
      }

      if (unit.behavior === "aoe" || unit.behavior === "golem") {
        const radius = unit.behavior === "golem" ? 96 : 64;
        const targets = target.kind === "enemy" ? this.enemies : this.units.filter((other) => other.owner !== unit.owner);
        targets.forEach((other) => {
          if (!other.dead && Math.hypot(other.x - target.x, other.y - target.y) <= radius) {
            this.damageTarget(other, other === target ? unit.damage : unit.damage * 0.58, state, unit.color);
          }
        });
        this.effects.push({ type: unit.behavior === "golem" ? "shockwave" : "flame", x: target.x, y: target.y, radius: 10, maxRadius: radius, life: 0.48, maxLife: 0.48, color: unit.color });
        this.spawnBurst(target.x, target.y, unit.color, unit.behavior === "golem" ? 26 : 18, 0.58);
        return;
      }

      this.effects.push({
        type: "slash",
        x: target.x,
        y: target.y,
        direction: unit.direction,
        life: 0.28,
        maxLife: 0.28,
        color: unit.color
      });
      this.damageTarget(target, unit.damage, state, unit.color);
      this.spawnHit(target.x, target.y, unit.color);
    }

    enemyAttack(enemy, target, state) {
      this.setActorAction(enemy, "attack", enemy.boss ? 0.54 : 0.32);
      this.damageUnit(target, enemy.damage, enemy.color);
      if (enemy.behavior === "frost") {
        target.slowTimer = 2.4;
        target.slowMul = CONFIG.enemies.frostMage.slow;
        this.projectiles.push({ type: "frost", x: enemy.x, y: enemy.y - 10, target, damage: 0, speed: 260, color: enemy.color, owner: "enemy", trail: [] });
        this.effects.push({ type: "frost", x: target.x, y: target.y, radius: 8, maxRadius: 52, life: 0.5, maxLife: 0.5, color: enemy.color });
      } else {
        this.effects.push({ type: "slash", x: target.x, y: target.y, direction: -1, life: 0.22, maxLife: 0.22, color: enemy.color });
        this.spawnHit(target.x, target.y, enemy.color);
      }
    }

    damageTarget(target, amount, state, color) {
      if (target.kind === "enemy") this.damageEnemy(target, amount, state, color);
      else this.damageUnit(target, amount, color);
    }

    damageEnemy(enemy, amount, state, color) {
      if (enemy.dead) return;
      const finalAmount = amount * (1 - (enemy.armor || 0));
      enemy.hp -= finalAmount;
      enemy.hitFlash = 1;
      this.setActorAction(enemy, "hit", 0.16);
      this.floatTexts.push({ x: enemy.x, y: enemy.y - enemy.radius - 12, text: `-${Math.ceil(finalAmount)}`, color, life: 0.62 });

      if (enemy.hp <= 0) {
        this.markActorDead(enemy);
        state.coins += enemy.reward;
        state.stats.coinsEarned += enemy.reward;
        state.kills += 1;
        if (state.mode === "coop" && state.enemyBase) {
          state.enemyBase.hp = Math.max(0, state.enemyBase.hp - (enemy.boss ? 32 : Math.max(4, enemy.reward * 0.35)));
        }
        this.spawnBurst(enemy.x, enemy.y, enemy.color, enemy.boss ? 42 : 18);
        if (enemy.behavior === "bomber") this.explodeEnemy(enemy, state);
        this.callbacks.onLog?.(`击败${CONFIG.enemies[enemy.type].name}，获得 ${enemy.reward} 金币。`);
      }
    }

    damageUnit(unit, amount, color) {
      if (unit.dead) return;
      unit.hp -= amount;
      unit.hitFlash = 1;
      this.setActorAction(unit, "hit", 0.16);
      this.floatTexts.push({ x: unit.x, y: unit.y - unit.radius - 12, text: `-${Math.ceil(amount)}`, color, life: 0.52 });
      if (unit.hp <= 0) {
        this.markActorDead(unit);
        this.spawnBurst(unit.x, unit.y, unit.color, 12);
      }
    }

    healUnit(unit, amount, color) {
      unit.hp = Math.min(unit.maxHp, unit.hp + amount);
      this.floatTexts.push({ x: unit.x, y: unit.y - unit.radius - 16, text: `+${Math.ceil(amount)}`, color, life: 0.58 });
      this.effects.push({ type: "heal", x: unit.x, y: unit.y, radius: 8, maxRadius: 52, life: 0.46, maxLife: 0.46, color });
    }

    healEnemy(enemy, amount, color) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + amount);
      this.floatTexts.push({ x: enemy.x, y: enemy.y - enemy.radius - 14, text: `+${amount}`, color, life: 0.58 });
      this.effects.push({ type: "heal", x: enemy.x, y: enemy.y, radius: 8, maxRadius: 50, life: 0.48, maxLife: 0.48, color });
    }

    explodeEnemy(enemy) {
      const radius = 72;
      this.effects.push({ type: "explosion", x: enemy.x, y: enemy.y, radius: 12, maxRadius: radius, life: 0.58, maxLife: 0.58, color: "#ff7777" });
      this.spawnBurst(enemy.x, enemy.y, "#ff9867", 28, 0.7);
      this.units.forEach((unit) => {
        if (!unit.dead && Math.hypot(unit.x - enemy.x, unit.y - enemy.y) <= radius) {
          this.damageUnit(unit, CONFIG.enemies.bomber.explode, "#ff7777");
        }
      });
    }

    damageBase(target, amount, state, color) {
      if (target === "team") {
        let remaining = amount;
        if (state.baseShield > 0) {
          const absorbed = Math.min(state.baseShield, remaining);
          state.baseShield -= absorbed;
          remaining -= absorbed;
        }
        if (remaining > 0) state.baseHp -= remaining;
        this.effects.push({ type: "base-hit", x: this.leftBaseX, y: this.baseY, radius: 24, maxRadius: 86, life: 0.48, maxLife: 0.48, color });
        this.floatTexts.push({ x: this.leftBaseX, y: this.baseY - 70, text: `核心-${Math.ceil(amount)}`, color: "#ff8b8b", life: 0.72 });
        if (state.baseHp <= 0 && !this.finished) {
          state.baseHp = 0;
          this.finished = true;
          this.callbacks.onBattleEnd?.("defeat");
        }
        return;
      }

      if (target === "enemy") {
        const enemyBase = state.enemyBase || { hp: 0, shield: 0 };
        let remaining = amount;
        if (enemyBase.shield > 0) {
          const absorbed = Math.min(enemyBase.shield, remaining);
          enemyBase.shield -= absorbed;
          remaining -= absorbed;
        }
        if (remaining > 0) enemyBase.hp = Math.max(0, enemyBase.hp - remaining);
        this.effects.push({ type: "base-hit", x: this.rightBaseX, y: this.baseY, radius: 24, maxRadius: 82, life: 0.42, maxLife: 0.42, color });
        return;
      }

      const base = state.bases[target];
      let remaining = amount;
      if (base.shield > 0) {
        const absorbed = Math.min(base.shield, remaining);
        base.shield -= absorbed;
        remaining -= absorbed;
      }
      if (remaining > 0) base.hp -= remaining;
      const x = target === "p1" ? this.leftBaseX : this.rightBaseX;
      this.effects.push({ type: "base-hit", x, y: this.baseY, radius: 24, maxRadius: 80, life: 0.42, maxLife: 0.42, color });
    }

    updateProjectiles(dt, state) {
      this.projectiles.forEach((projectile) => {
        if (!projectile.target || projectile.target.dead || projectile.target.hp <= 0) {
          projectile.dead = true;
          return;
        }
        const dx = projectile.target.x - projectile.x;
        const dy = projectile.target.y - projectile.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const step = projectile.speed * dt;
        projectile.trail = projectile.trail || [];
        projectile.trail.push({ x: projectile.x, y: projectile.y, life: 0.22 });
        projectile.trail.forEach((point) => { point.life -= dt; });
        projectile.trail = projectile.trail.filter((point) => point.life > 0).slice(-8);
        projectile.x += (dx / distance) * step;
        projectile.y += (dy / distance) * step;
        if (distance <= step + projectile.target.radius) {
          if (projectile.damage) this.damageTarget(projectile.target, projectile.damage, state, projectile.color);
          this.spawnHit(projectile.target.x, projectile.target.y, projectile.color);
          if (projectile.type === "frost") {
            this.effects.push({ type: "frost", x: projectile.target.x, y: projectile.target.y, radius: 8, maxRadius: 52, life: 0.45, maxLife: 0.45, color: projectile.color });
          }
          projectile.dead = true;
        }
      });
    }

    castSkill(skill, state) {
      const player = CONFIG.players[skill.owner];
      if (skill.type === "thunder") {
        const targets = this.hostileTargetsFor(skill.owner, state);
        const center = this.targetCenter(targets, skill.owner, state);
        const radius = 158;
        this.effects.push({ type: "thunder", x: center.x, y: center.y, radius: 20, maxRadius: radius, life: 0.9, maxLife: 0.9, color: player.color });
        for (let i = 0; i < 5; i += 1) {
          this.effects.push({
            type: "bolt",
            x: center.x + Utils.rand(-radius * 0.42, radius * 0.42),
            y: center.y + Utils.rand(-radius * 0.22, radius * 0.22),
            life: 0.42 + i * 0.04,
            maxLife: 0.52,
            color: i % 2 ? "#ffffff" : player.color
          });
        }
        targets.forEach((target) => {
          if (Math.hypot(target.x - center.x, target.y - center.y) <= radius + target.radius) {
            this.damageTarget(target, 48, state, player.color);
          }
        });
        this.spawnBurst(center.x, center.y, player.color, 36, 0.72);
        this.callbacks.onLog?.(`${player.name}释放雷霆轰击。`);
      }

      if (skill.type === "shield") {
        if (state.mode === "pk") state.bases[skill.owner].shield = Math.min(90, state.bases[skill.owner].shield + 38);
        else state.baseShield = Math.min(100, state.baseShield + 40);
        const x = state.mode === "pk" && skill.owner === "p2" ? this.rightBaseX : this.leftBaseX;
        this.effects.push({ type: "shield", x, y: this.baseY, radius: 38, maxRadius: 128, life: 1.15, maxLife: 1.15, color: "#ffca67" });
        this.callbacks.onLog?.(`${player.name}展开能量护盾。`);
      }

      if (skill.type === "slow") {
        const targets = this.hostileTargetsFor(skill.owner, state);
        targets.forEach((target) => {
          target.slowTimer = 4.2;
          target.slowMul = 0.42;
        });
        this.effects.push({ type: "slow", x: this.width * 0.5, y: this.height * 0.5, radius: 30, maxRadius: 280, life: 1.05, maxLife: 1.05, color: "#9fd6ff" });
        this.callbacks.onLog?.(`${player.name}释放时间减速。`);
      }

      if (skill.type === "airdrop") {
        for (let i = 0; i < 3; i += 1) {
          const x = skill.owner === "p2" && state.mode === "pk" ? this.rightBaseX - 52 : this.leftBaseX + 52;
          this.effects.push({ type: "airdrop", x: x + (i - 1) * 28, y: this.laneY(i), radius: 18, maxRadius: 70, life: 0.8, maxLife: 0.8, color: player.color });
          this.spawnUnit(i === 2 ? "catGunner" : "slimeMech", skill.owner, state, { temporary: true, lane: i });
        }
        this.effects.push({ type: "summon", x: skill.owner === "p2" && state.mode === "pk" ? this.rightBaseX : this.leftBaseX, y: this.baseY, radius: 20, maxRadius: 138, life: 0.8, maxLife: 0.8, color: player.color });
        this.callbacks.onLog?.(`${player.name}呼叫机械空投。`);
      }
    }

    hostileTargetsFor(owner, state) {
      if (state.mode === "pk") return this.units.filter((unit) => unit.owner !== owner && !unit.dead);
      return this.enemies.filter((enemy) => !enemy.dead);
    }

    targetCenter(targets, owner, state) {
      if (targets.length) {
        return {
          x: targets.reduce((sum, target) => sum + target.x, 0) / targets.length,
          y: targets.reduce((sum, target) => sum + target.y, 0) / targets.length
        };
      }
      if (state.mode === "pk") {
        return owner === "p1" ? { x: this.rightBaseX - 90, y: this.baseY } : { x: this.leftBaseX + 90, y: this.baseY };
      }
      return { x: this.width * 0.68, y: this.height * 0.5 };
    }

    updateEffects(dt) {
      this.effects.forEach((effect) => {
        effect.life -= dt;
        if (effect.maxRadius) {
          const t = 1 - Math.max(0, effect.life / effect.maxLife);
          effect.radius = Utils.lerp(effect.radius || 10, effect.maxRadius, t);
        }
      });
      this.effects = this.effects.filter((effect) => effect.life > 0);

      this.particles.forEach((particle) => {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.life -= dt;
      });
      this.particles = this.particles.filter((particle) => particle.life > 0);

      this.floatTexts.forEach((text) => {
        text.y -= dt * 28;
        text.life -= dt;
      });
      this.floatTexts = this.floatTexts.filter((text) => text.life > 0);
    }

    cleanup() {
      this.units = this.units.filter((unit) => !unit.remove && (unit.dying || (unit.hp > 0 && unit.x > -120 && unit.x < this.width + 120)));
      this.enemies = this.enemies.filter((enemy) => !enemy.remove && (enemy.dying || enemy.hp > 0));
      this.projectiles = this.projectiles.filter((projectile) => !projectile.dead);
    }

    spawnHit(x, y, color) {
      this.spawnBurst(x, y, color, 5, 0.35);
    }

    spawnBurst(x, y, color, count, lifeMax) {
      for (let i = 0; i < count; i += 1) {
        const angle = Utils.rand(0, Math.PI * 2);
        const speed = Utils.rand(28, 130);
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Utils.rand(2, 4),
          color,
          life: Utils.rand(0.18, lifeMax || 0.76)
        });
      }
    }

    draw(state) {
      const { ctx, width, height } = Utils.resizeCanvas(this.canvas);
      this.width = width;
      this.height = height;
      this.syncGeometry();

      ctx.clearRect(0, 0, width, height);
      this.drawBackground(ctx, width, height, state);
      this.drawBases(ctx, state);
      this.units.forEach((unit) => this.drawUnit(ctx, unit));
      this.enemies.forEach((enemy) => this.drawEnemy(ctx, enemy));
      this.projectiles.forEach((projectile) => this.drawProjectile(ctx, projectile));
      this.drawEffects(ctx);
      this.particles.forEach((particle) => this.drawParticle(ctx, particle));
      this.floatTexts.forEach((text) => this.drawFloatText(ctx, text));
      if (this.warningTimer > 0) this.drawWarning(ctx, width, height);
    }

    drawBackground(ctx, width, height, state) {
      const tones = {
        meadow: ["#193d36", "#08110d", "#182914", "#45f2b0"],
        starlight: ["#1e5c46", "#081412", "#14291d", "#45f2b0"],
        forest: ["#183f2a", "#07120b", "#172512", "#96dc7d"],
        mine: ["#29343a", "#0b0d0e", "#372614", "#ffca67"],
        machineMine: ["#29343a", "#0b0d0e", "#372614", "#ffca67"],
        frost: ["#18304a", "#071019", "#1d2748", "#9fd6ff"],
        frostRuins: ["#204869", "#071019", "#1d2748", "#9fd6ff"],
        lava: ["#3b2019", "#100807", "#451612", "#ff8a4b"],
        lavaFactory: ["#4e1f16", "#100807", "#451612", "#ff8a4b"],
        void: ["#301637", "#0b0710", "#35151e", "#ff5fb7"],
        skyCorridor: ["#264a76", "#0a0f22", "#1a2a52", "#89cdff"],
        voidAltar: ["#361648", "#0b0710", "#35151e", "#c475ff"],
        voidCore: ["#3e0e30", "#08030c", "#35151e", "#ff5fb7"],
        pk: ["#1c2d2d", "#0b0d0c", "#2b1b27", "#7db6ff"]
      };
      const tone = tones[state.mapTone] || tones.meadow;
      const bgSrc = state.mapTone === "pk"
        ? CONFIG.art.backgrounds.pkBattle
        : CONFIG.art.backgrounds[state.mapTone] || CONFIG.art.backgrounds.meadow;
      const bg = Utils.image(bgSrc);
      if (bg) {
        Utils.coverImage(ctx, bg, 0, 0, width, height);
        const shade = ctx.createLinearGradient(0, 0, width, height);
        shade.addColorStop(0, "rgba(3, 5, 6, 0.12)");
        shade.addColorStop(0.52, "rgba(3, 5, 6, 0.26)");
        shade.addColorStop(1, "rgba(3, 5, 6, 0.54)");
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, width, height);

        this.lanes.forEach((lane, index) => {
          const y = height * lane;
          ctx.strokeStyle = index === 1 ? `${tone[3]}77` : "rgba(255, 255, 255, 0.2)";
          ctx.lineWidth = index === 1 ? 3 : 1.4;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
          ctx.fillStyle = index === 1 ? `${tone[3]}14` : "rgba(0, 0, 0, 0.08)";
          ctx.fillRect(0, y - 18, width, 36);
        });

        ctx.fillStyle = "rgba(238, 248, 236, 0.88)";
        ctx.font = "800 13px Microsoft YaHei, sans-serif";
        ctx.fillText(`${state.stageName}  ${state.waveLabel}`, 18, height - 18);
        return;
      }
      const sky = ctx.createLinearGradient(0, 0, width, height);
      sky.addColorStop(0, tone[0]);
      sky.addColorStop(0.48, tone[1]);
      sky.addColorStop(1, tone[2]);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      const accent = tone[3];
      const glow = ctx.createRadialGradient(width * 0.68, height * 0.48, 10, width * 0.68, height * 0.48, width * 0.38);
      glow.addColorStop(0, `${accent}36`);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalAlpha = 0.58;
      if (state.mapTone === "meadow") {
        ctx.strokeStyle = "rgba(151, 255, 196, 0.22)";
        for (let i = 0; i < 34; i += 1) {
          const x = (i * 83 + performance.now() * 0.006) % width;
          const y = height * (0.18 + (i % 5) * 0.11);
          ctx.beginPath();
          ctx.arc(x, y, 1.2 + (i % 3), 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (state.mapTone === "mine") {
        ctx.strokeStyle = "rgba(255, 202, 103, 0.18)";
        for (let x = 40; x < width; x += 120) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x - 70, height);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(255, 202, 103, 0.08)";
        for (let x = 60; x < width; x += 180) ctx.fillRect(x, height * 0.16, 34, height * 0.64);
      } else if (state.mapTone === "frost") {
        ctx.strokeStyle = "rgba(185, 232, 255, 0.18)";
        for (let i = 0; i < 16; i += 1) {
          const x = i * 110;
          ctx.beginPath();
          ctx.moveTo(x, height * 0.18);
          ctx.lineTo(x + 38, height * 0.36);
          ctx.lineTo(x - 22, height * 0.58);
          ctx.stroke();
        }
      } else if (state.mapTone === "lava") {
        ctx.strokeStyle = "rgba(255, 138, 75, 0.35)";
        ctx.lineWidth = 2;
        for (let y = height * 0.22; y < height; y += 76) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          for (let x = 0; x <= width; x += 80) ctx.lineTo(x, y + Math.sin(x * 0.02 + performance.now() * 0.001) * 16);
          ctx.stroke();
        }
      } else if (state.mapTone === "void") {
        ctx.strokeStyle = "rgba(255, 95, 183, 0.24)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(width * 0.78, height * 0.5, 130 + Math.sin(performance.now() * 0.001) * 12, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = "rgba(174, 255, 218, 0.12)";
      ctx.lineWidth = 1;
      for (let y = height * 0.22; y < height; y += 38) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y + Math.sin(y * 0.02) * 12);
        ctx.stroke();
      }

      this.lanes.forEach((lane, index) => {
        const y = height * lane;
        ctx.strokeStyle = index === 1 ? `${accent}66` : "rgba(101, 255, 193, 0.2)";
        ctx.lineWidth = index === 1 ? 3 : 1.4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.fillStyle = index === 1 ? `${accent}12` : "rgba(255, 255, 255, 0.025)";
        ctx.fillRect(0, y - 18, width, 36);
      });

      ctx.fillStyle = "rgba(238, 248, 236, 0.72)";
      ctx.font = "700 13px Microsoft YaHei, sans-serif";
      ctx.fillText(`${state.stageName}  ${state.waveLabel}`, 18, height - 18);
    }

    drawBases(ctx, state) {
      if (state.mode === "pk") {
        this.drawBase(ctx, this.leftBaseX, this.baseY, CONFIG.players.p1.color, "P1 基地", state.bases.p1.hp, CONFIG.pkBaseMaxHp, state.bases.p1.shield, CONFIG.art.bases.p1);
        this.drawBase(ctx, this.rightBaseX, this.baseY, CONFIG.players.p2.color, "P2 基地", state.bases.p2.hp, CONFIG.pkBaseMaxHp, state.bases.p2.shield, CONFIG.art.bases.p2);
      } else {
        const enemyBase = state.enemyBase || { hp: CONFIG.baseMaxHp, maxHp: CONFIG.baseMaxHp, shield: 0 };
        this.drawBase(ctx, this.leftBaseX, this.baseY, "#65ffc1", "玩家核心", state.baseHp, CONFIG.baseMaxHp, state.baseShield, CONFIG.art.bases.ally);
        this.drawBase(ctx, this.rightBaseX, this.baseY, "#ff5fb7", "敌方巢穴", enemyBase.hp, enemyBase.maxHp || CONFIG.baseMaxHp, enemyBase.shield, state.mapTone === "voidCore" || state.mapTone === "voidAltar" ? CONFIG.art.bases.chaos : CONFIG.art.bases.enemy);
      }
    }

    drawBase(ctx, x, y, color, label, hp, maxHp, shield, sprite) {
      ctx.save();
      ctx.translate(x, y);
      const t = performance.now() * 0.001;
      const img = Utils.image(sprite);
      ctx.save();
      ctx.strokeStyle = "rgba(255, 202, 103, 0.35)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.rotate(t * 0.55);
      ctx.beginPath();
      ctx.arc(0, 4, 58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      if (shield > 0) {
        ctx.strokeStyle = `rgba(255, 202, 103, ${0.38 + Math.sin(t * 7) * 0.1})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 4, 70, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (img) {
        const w = 132;
        const h = w * img.naturalHeight / Math.max(1, img.naturalWidth);
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.52)";
        ctx.shadowBlur = 16;
        ctx.drawImage(img, -w / 2, -h * 0.58, w, h);
        ctx.restore();
      } else {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 42, 0, Math.PI * 2);
        ctx.stroke();
        const core = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
        core.addColorStop(0, "#ffffff");
        core.addColorStop(0.32, color);
        core.addColorStop(1, "#10231b");
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(0, 0, 31, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(4, 7, 9, 0.62)";
      ctx.beginPath();
      ctx.roundRect(-47, 49, 94, 20, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(238, 248, 236, 0.9)";
      ctx.font = "900 11px Microsoft YaHei, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, 0, 63);
      ctx.restore();
      Utils.drawHealthBar(ctx, x, y + 72, 100, hp / maxHp, color);
    }

    drawEffects(ctx) {
      this.effects.forEach((effect) => {
        const alpha = Utils.clamp(effect.life / effect.maxLife, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        if (effect.type === "bolt") {
          this.drawBoltEffect(ctx, effect, alpha);
        } else if (effect.type === "beam") {
          this.drawBeamEffect(ctx, effect, alpha);
        } else if (effect.type === "chain") {
          this.drawChainEffect(ctx, effect, alpha);
        } else if (effect.type === "slash") {
          this.drawSlashEffect(ctx, effect, alpha);
        } else if (effect.type === "flame" || effect.type === "explosion") {
          this.drawFlameEffect(ctx, effect, alpha);
        } else if (effect.type === "shield") {
          this.drawShieldEffect(ctx, effect, alpha);
        } else if (effect.type === "slow" || effect.type === "frost") {
          this.drawSlowEffect(ctx, effect, alpha);
        } else if (effect.type === "airdrop") {
          this.drawAirdropEffect(ctx, effect, alpha);
        } else if (effect.type === "summon") {
          this.drawSummonEffect(ctx, effect, alpha);
        } else if (effect.type === "boss-warning" || effect.type === "boss-pulse") {
          this.drawBossEffect(ctx, effect, alpha);
        } else {
          this.drawRingEffect(ctx, effect, alpha);
        }
        ctx.restore();
      });
    }

    drawRingEffect(ctx, effect, alpha) {
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 2 + alpha * 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([5, 9]);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawBoltEffect(ctx, effect, alpha) {
      const top = -10;
      const bottom = effect.y + 22;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 4 + alpha * 2;
      ctx.shadowColor = effect.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(effect.x + Math.sin(effect.life * 30) * 18, top);
      for (let i = 1; i <= 5; i += 1) {
        const y = Utils.lerp(top, bottom, i / 5);
        const x = effect.x + Math.sin(i * 1.8 + effect.life * 24) * (18 - i * 2);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.18 * alpha})`;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 28 * alpha, 0, Math.PI * 2);
      ctx.fill();
    }

    drawBeamEffect(ctx, effect, alpha) {
      const gradient = ctx.createLinearGradient(effect.fromX, effect.fromY, effect.toX, effect.toY);
      gradient.addColorStop(0, "rgba(255,255,255,0.9)");
      gradient.addColorStop(0.5, effect.color);
      gradient.addColorStop(1, "rgba(255,255,255,0.55)");
      ctx.strokeStyle = gradient;
      ctx.lineCap = "round";
      ctx.lineWidth = 5 + alpha * 5;
      ctx.shadowColor = effect.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(effect.fromX, effect.fromY);
      ctx.lineTo(effect.toX, effect.toY);
      ctx.stroke();
    }

    drawChainEffect(ctx, effect, alpha) {
      if (!effect.points || effect.points.length < 2) return;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 3 + alpha * 2;
      ctx.shadowColor = effect.color;
      ctx.shadowBlur = 20;
      for (let i = 1; i < effect.points.length; i += 1) {
        const a = effect.points[i - 1];
        const b = effect.points[i];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        const segments = 5;
        for (let s = 1; s <= segments; s += 1) {
          const t = s / segments;
          const x = Utils.lerp(a.x, b.x, t) + Math.sin((s + effect.life) * 4.1) * 8;
          const y = Utils.lerp(a.y, b.y, t) + Math.cos((s + effect.life) * 3.4) * 5;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    drawSlashEffect(ctx, effect, alpha) {
      ctx.translate(effect.x, effect.y);
      ctx.scale(effect.direction || 1, 1);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.shadowColor = effect.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, 0, 28, -0.85, 0.7);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.76)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 20, -0.7, 0.55);
      ctx.stroke();
    }

    drawFlameEffect(ctx, effect, alpha) {
      const gradient = ctx.createRadialGradient(effect.x, effect.y, 6, effect.x, effect.y, effect.radius);
      gradient.addColorStop(0, "rgba(255,255,255,0.8)");
      gradient.addColorStop(0.3, effect.color);
      gradient.addColorStop(1, "rgba(255,80,40,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = effect.type === "explosion" ? "#ffca67" : effect.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * 0.78, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawShieldEffect(ctx, effect, alpha) {
      const gradient = ctx.createRadialGradient(effect.x, effect.y, effect.radius * 0.2, effect.x, effect.y, effect.radius);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${0.18 * alpha})`);
      gradient.addColorStop(0.58, `rgba(255, 202, 103, ${0.13 * alpha})`);
      gradient.addColorStop(1, "rgba(255, 202, 103, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 7]);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawSlowEffect(ctx, effect, alpha) {
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,255,255,0.42)";
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawAirdropEffect(ctx, effect, alpha) {
      const yTop = Math.max(0, effect.y - 130);
      const gradient = ctx.createLinearGradient(effect.x, yTop, effect.x, effect.y);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.5, effect.color);
      gradient.addColorStop(1, "rgba(255,255,255,0.85)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(effect.x, yTop);
      ctx.lineTo(effect.x, effect.y);
      ctx.stroke();
      this.drawRingEffect(ctx, effect, alpha);
    }

    drawSummonEffect(ctx, effect, alpha) {
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 3;
      ctx.shadowColor = effect.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(effect.x, effect.y + 12, effect.radius * 1.25, effect.radius * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.ellipse(effect.x, effect.y + 12, effect.radius * 0.72, effect.radius * 0.24, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawBossEffect(ctx, effect, alpha) {
      ctx.strokeStyle = effect.color;
      ctx.fillStyle = `rgba(255, 95, 183, ${effect.type === "boss-warning" ? 0.06 : 0.12})`;
      ctx.lineWidth = effect.type === "boss-warning" ? 5 : 3;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#ffca67";
      ctx.setLineDash([12, 8]);
      ctx.strokeRect(effect.x - effect.radius * 0.75, effect.y - effect.radius * 0.45, effect.radius * 1.5, effect.radius * 0.9);
    }

    drawUnit(ctx, unit) {
      ctx.save();
      ctx.translate(unit.x, unit.y);
      if (unit.hitFlash > 0) {
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 14 * unit.hitFlash;
      }

      const drawMap = {
        melee: () => this.drawSlimeMech(ctx, unit),
        ranged: () => this.drawCatGunner(ctx, unit),
        chain: () => this.drawThunderDragon(ctx, unit),
        heal: () => this.drawHealDrone(ctx, unit),
        aoe: () => this.drawFlameKnight(ctx, unit),
        golem: () => this.drawStarGolem(ctx, unit)
      };
      this.drawActorUnderlay(ctx, unit, unit.radius, unit.behavior === "golem");
      ctx.save();
      this.applyActorMotion(ctx, unit, unit.radius, unit.behavior === "golem");
      if (unit.direction < 0) ctx.scale(-1, 1);
      if (!this.drawActorSprite(ctx, unit, unit.radius, unit.behavior === "golem")) {
        (drawMap[unit.behavior] || drawMap.melee)();
      }
      this.drawUnitCleanMotion(ctx, unit, unit.radius, unit.behavior === "golem");
      this.drawActorOverlay(ctx, unit, unit.radius, unit.behavior === "golem");
      ctx.restore();
      if (!unit.dying) Utils.drawHealthBar(ctx, 0, -unit.radius - 18, 46, unit.hp / unit.maxHp, unit.color);
      ctx.restore();
    }

    drawSlimeMech(ctx, unit) {
      const body = ctx.createLinearGradient(-18, -20, 18, 20);
      body.addColorStop(0, "#f5fff8");
      body.addColorStop(0.32, unit.color);
      body.addColorStop(1, "#17634a");
      ctx.fillStyle = body;
      ctx.strokeStyle = "rgba(238, 248, 236, 0.78)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-19, -15, 38, 30, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#07110b";
      ctx.fillRect(2, -5, 8, 4);
      ctx.strokeStyle = "#ffca67";
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(29, -5);
      ctx.stroke();
    }

    drawCatGunner(ctx, unit) {
      ctx.fillStyle = unit.color;
      ctx.strokeStyle = "rgba(238, 248, 236, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-16, -4);
      ctx.lineTo(-10, -22);
      ctx.lineTo(0, -8);
      ctx.lineTo(10, -22);
      ctx.lineTo(17, -3);
      ctx.quadraticCurveTo(16, 16, 0, 18);
      ctx.quadraticCurveTo(-16, 16, -16, -4);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#ffca67";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(13, 4);
      ctx.lineTo(34, 0);
      ctx.stroke();
    }

    drawThunderDragon(ctx, unit) {
      ctx.strokeStyle = "#ffe06a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(-8, -12);
      ctx.lineTo(8, -5);
      ctx.lineTo(20, -18);
      ctx.stroke();
      ctx.fillStyle = unit.color;
      ctx.beginPath();
      ctx.ellipse(0, 4, 20, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#07110b";
      ctx.fillRect(8, 0, 5, 4);
    }

    drawHealDrone(ctx, unit) {
      ctx.strokeStyle = unit.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(184, 255, 239, 0.72)";
      ctx.fillRect(-5, -14, 10, 28);
      ctx.fillRect(-14, -5, 28, 10);
    }

    drawFlameKnight(ctx, unit) {
      ctx.fillStyle = "#ff9a5c";
      ctx.strokeStyle = "rgba(255, 239, 198, 0.76)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(18, 0);
      ctx.lineTo(9, 20);
      ctx.lineTo(-12, 20);
      ctx.lineTo(-18, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffd36d";
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.quadraticCurveTo(12, -2, 0, 12);
      ctx.quadraticCurveTo(-10, -2, 0, -18);
      ctx.fill();
    }

    drawStarGolem(ctx, unit) {
      ctx.fillStyle = "#f4f7ff";
      ctx.strokeStyle = "#ffca67";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(28, -10);
      ctx.lineTo(18, 30);
      ctx.lineTo(-18, 30);
      ctx.lineTo(-28, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#62f4b5";
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawEnemy(ctx, enemy) {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      if (enemy.hitFlash > 0) {
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 13 * enemy.hitFlash;
      }

      const drawMap = {
        basic: () => this.drawEnemySlime(ctx, enemy),
        runner: () => this.drawRunnerEnemy(ctx, enemy),
        shield: () => this.drawShieldEnemy(ctx, enemy),
        bomber: () => this.drawBomberEnemy(ctx, enemy),
        frost: () => this.drawMageEnemy(ctx, enemy, "#9fd6ff"),
        eye: () => this.drawEyeEnemy(ctx, enemy),
        priest: () => this.drawMageEnemy(ctx, enemy, "#bf8cff"),
        chaos: () => this.drawBoss(ctx, enemy)
      };
      this.drawActorUnderlay(ctx, enemy, enemy.radius, enemy.boss);
      ctx.save();
      this.applyActorMotion(ctx, enemy, enemy.radius, enemy.boss);
      if (enemy.direction < 0) ctx.scale(-1, 1);
      if (!this.drawActorSprite(ctx, enemy, enemy.radius, enemy.boss)) {
        (drawMap[enemy.behavior] || drawMap.basic)();
      }
      this.drawEnemyCleanMotion(ctx, enemy, enemy.radius, enemy.boss);
      this.drawActorOverlay(ctx, enemy, enemy.radius, enemy.boss);
      ctx.restore();
      if (!enemy.dying) Utils.drawHealthBar(ctx, 0, -enemy.radius - 18, enemy.boss ? 86 : 44, enemy.hp / enemy.maxHp, enemy.color);
      ctx.restore();
    }

    drawActorUnderlay(ctx, actor, radius, large) {
      const deathT = actor.dying ? 1 - Utils.clamp((actor.deathTimer || 0) / Math.max(0.01, actor.maxDeathTimer || 1), 0, 1) : 0;
      const walk = actor.action === "walk" ? Math.sin(actor.step || 0) : 0;
      ctx.save();
      ctx.globalAlpha = actor.dying ? Math.max(0, 1 - deathT * 0.75) : 1;
      ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
      ctx.beginPath();
      ctx.ellipse(0, radius * 0.7, radius * (large ? 1.55 : 1.15), radius * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();

      if (!actor.flying && actor.behavior !== "heal" && !actor.dying) {
        ctx.fillStyle = `${actor.color}88`;
        ctx.shadowColor = actor.color;
        ctx.shadowBlur = actor.action === "walk" ? 9 : 3;
        ctx.beginPath();
        ctx.ellipse(-radius * 0.45, radius * 0.82 + walk * 2.2, radius * 0.28, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(radius * 0.45, radius * 0.82 - walk * 2.2, radius * 0.28, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      if (actor.slowTimer > 0 && !actor.dying) {
        ctx.strokeStyle = "rgba(159, 214, 255, 0.82)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.56, radius * 1.35, radius * 0.44, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    applyActorMotion(ctx, actor, radius, large) {
      const hit = actor.hitPulse || 0;
      const deathT = actor.dying ? 1 - Utils.clamp((actor.deathTimer || 0) / Math.max(0.01, actor.maxDeathTimer || 1), 0, 1) : 0;

      if (actor.dying) {
        ctx.globalAlpha = Math.max(0, 1 - deathT * 0.86);
        ctx.translate(-actor.direction * deathT * radius * 0.35, deathT * radius * 0.5);
        ctx.rotate(-actor.direction * deathT * 1.05);
        ctx.scale(1 + deathT * 0.12, Math.max(0.2, 1 - deathT * 0.58));
        return;
      }

      const hitShake = hit > 0 ? Math.sin(performance.now() * 0.08) * hit * 3.2 : 0;
      ctx.translate(hitShake, 0);
      if (hit > 0) ctx.scale(1 + hit * 0.018, 1 - hit * 0.012);
    }

    drawActorSprite(ctx, actor, radius, large) {
      const img = Utils.image(actor.sprite);
      if (!img) return false;
      const scale = large ? 4.0 : 3.45;
      const maxW = radius * scale;
      const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
      const w = maxW;
      const h = Utils.clamp(maxW * ratio, radius * 2.6, radius * (large ? 4.2 : 4.1));
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
      ctx.shadowBlur = 8;
      ctx.drawImage(img, -w / 2, -h * 0.58, w, h);
      if ((actor.hitPulse || 0) > 0) {
        ctx.globalAlpha = Math.min(0.55, actor.hitPulse * 0.55);
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(img, -w / 2, -h * 0.58, w, h);
      }
      ctx.restore();
      return true;
    }

    actorPose(actor) {
      const phase = actor.step || 0;
      const walk = actor.action === "walk" ? 1 : 0;
      return {
        walk,
        a: Math.sin(phase),
        b: Math.cos(phase),
        attack: actor.attackPulse || 0,
        hit: actor.hitPulse || 0,
        cast: actor.action === "attack" ? actor.attackPulse || 0 : 0,
        death: actor.dying ? 1 - Utils.clamp((actor.deathTimer || 0) / Math.max(0.01, actor.maxDeathTimer || 1), 0, 1) : 0
      };
    }

    drawUnitCleanMotion(ctx, unit, radius, large) {
      const pose = this.actorPose(unit);
      if (pose.death > 0.95) return;
      const phase = actorTime() * 0.006 + (unit.step || 0);
      const move = unit.action === "walk" ? 1 : 0;
      const attack = pose.attack;
      ctx.save();
      ctx.globalAlpha = Math.max(0.18, 1 - pose.death);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (unit.behavior === "melee" || unit.behavior === "golem") {
        const width = unit.behavior === "golem" ? radius * 1.6 : radius * 1.12;
        ctx.strokeStyle = `${unit.color}aa`;
        ctx.lineWidth = unit.behavior === "golem" ? 5 : 3;
        for (let i = 0; i < (unit.behavior === "golem" ? 3 : 4); i += 1) {
          const x = -width * 0.5 + (i / 3) * width;
          ctx.save();
          ctx.translate(x, radius * 0.76);
          ctx.rotate(phase * (move ? 1.7 : 0.25) + i);
          ctx.beginPath();
          ctx.arc(0, 0, radius * 0.13, 0, Math.PI * 1.55);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (unit.behavior === "ranged") {
        const recoil = attack * radius * 0.16;
        const muzzleX = radius * 1.0 - recoil;
        const muzzleY = -radius * 0.34;
        ctx.fillStyle = "rgba(255, 225, 114, 0.9)";
        ctx.strokeStyle = "#ffca67";
        ctx.shadowColor = "#ffca67";
        ctx.shadowBlur = 8 + attack * 16;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(muzzleX, muzzleY, radius * (0.12 + attack * 0.11), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (attack > 0.35) {
          ctx.beginPath();
          ctx.arc(muzzleX + radius * 0.2, muzzleY, radius * (0.2 + attack * 0.08), -0.72, 0.72);
          ctx.stroke();
        }
      } else if (unit.behavior === "melee") {
        ctx.strokeStyle = "#ffca67";
        ctx.lineWidth = 3.4;
        ctx.shadowColor = "#ffca67";
        ctx.shadowBlur = 8 + attack * 10;
        ctx.beginPath();
        ctx.arc(radius * 0.5, -radius * 0.1, radius * (0.52 + attack * 0.18), -0.85, 0.16);
        ctx.stroke();
      }

      if (unit.behavior === "chain") {
        const flap = Math.sin(phase * 2.2) * 0.18;
        this.drawCleanWing(ctx, -radius * 0.42, -radius * 0.42, radius * 0.75, "#ffe06a", -0.55 + flap);
        this.drawCleanWing(ctx, radius * 0.42, -radius * 0.42, radius * 0.75, "#ffe06a", -2.55 - flap);
        if (attack > 0) this.drawChargeOrb(ctx, radius * 0.78, -radius * 0.56, radius * (0.14 + attack * 0.18), "#ffe06a");
      }

      if (unit.behavior === "heal") {
        const spin = phase * 4;
        [-1, 1].forEach((side) => this.drawRotor(ctx, side * radius * 0.92, -radius * 0.64, radius * 0.3, "#b8ffef", spin * side));
        if (attack > 0) this.drawChargeOrb(ctx, radius * 0.5, -radius * 0.18, radius * (0.16 + attack * 0.12), "#b8ffef");
      }

      if (unit.behavior === "aoe") {
        ctx.strokeStyle = "#ff9a5c";
        ctx.lineWidth = 5;
        ctx.shadowColor = "#ff9a5c";
        ctx.shadowBlur = 14;
        const swing = attack > 0 ? 1 - attack : 0.15;
        ctx.beginPath();
        ctx.arc(radius * 0.44, -radius * 0.18, radius * (0.92 + attack * 0.18), -1.3 + swing * 0.5, -0.14 + swing * 0.6);
        ctx.stroke();
      }

      if (unit.behavior === "golem") {
        this.drawChargeOrb(ctx, 0, -radius * 0.14, radius * (0.25 + attack * 0.18), "#62f4b5");
        if (attack > 0.2) {
          ctx.strokeStyle = "rgba(98, 244, 181, 0.82)";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, radius * 0.58, radius * (0.7 + attack * 0.5), 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    drawEnemyCleanMotion(ctx, enemy, radius, large) {
      const pose = this.actorPose(enemy);
      if (pose.death > 0.95) return;
      const phase = actorTime() * 0.006 + (enemy.step || 0);
      const move = enemy.action === "walk" ? 1 : 0;
      const attack = pose.attack;
      ctx.save();
      ctx.globalAlpha = Math.max(0.18, 1 - pose.death);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (enemy.behavior === "basic") {
        ctx.fillStyle = `${enemy.color}88`;
        const squash = Math.abs(Math.sin(phase * 2)) * move;
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.72, radius * (0.62 + squash * 0.16), radius * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (enemy.behavior === "runner") {
        ctx.strokeStyle = "#e6ff8a";
        ctx.lineWidth = 3.2;
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          const y = radius * (0.72 - i * 0.18);
          ctx.moveTo(-radius * (0.58 + i * 0.08), y);
          ctx.lineTo(-radius * (1.05 + i * 0.08), y + Math.sin(phase * 3 + i) * 3);
          ctx.stroke();
        }
        if (attack > 0) this.drawSlashArc(ctx, radius, enemy.color, attack);
      } else if (enemy.behavior === "shield") {
        ctx.strokeStyle = "#ffca67";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#ffca67";
        ctx.shadowBlur = 10 * attack;
        ctx.beginPath();
        ctx.roundRect(-radius * (1.05 - attack * 0.12), -radius * 0.55, radius * 0.42, radius * 1.08, 6);
        ctx.stroke();
      } else if (enemy.behavior === "bomber") {
        const pulse = 0.35 + 0.35 * Math.abs(Math.sin(phase * 2.5));
        ctx.strokeStyle = `rgba(255, 119, 119, ${pulse + attack * 0.4})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, radius * (0.84 + pulse * 0.06 + attack * 0.16), 0, Math.PI * 2);
        ctx.stroke();
      } else if (enemy.behavior === "frost" || enemy.behavior === "priest") {
        const color = enemy.behavior === "frost" ? "#9fd6ff" : "#bf8cff";
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12 + attack * 14;
        const raise = -radius * (0.7 + attack * 0.35);
        ctx.beginPath();
        ctx.moveTo(radius * 0.28, radius * 0.18);
        ctx.lineTo(radius * 0.62, raise);
        ctx.stroke();
        this.drawChargeOrb(ctx, radius * 0.66, raise, radius * (0.12 + attack * 0.1), color);
      } else if (enemy.behavior === "eye") {
        const flap = Math.sin(phase * 2.5) * 0.16;
        this.drawCleanWing(ctx, -radius * 0.55, -radius * 0.18, radius * 0.58, "#bf8cff", -0.7 + flap);
        this.drawCleanWing(ctx, radius * 0.55, -radius * 0.18, radius * 0.58, "#bf8cff", -2.45 - flap);
        if (attack > 0) this.drawChargeOrb(ctx, radius * 0.12, -radius * 0.08, radius * (0.12 + attack * 0.1), "#ffca67");
      } else if (enemy.behavior === "chaos") {
        ctx.strokeStyle = "#ff5fb7";
        ctx.lineWidth = large ? 4 : 3;
        ctx.shadowColor = "#ff5fb7";
        ctx.shadowBlur = 20 + attack * 22;
        for (let i = 0; i < 2; i += 1) {
          ctx.save();
          ctx.rotate(phase * 0.35 * (i ? -1 : 1));
          ctx.beginPath();
          ctx.ellipse(0, -radius * 0.04, radius * (0.72 + i * 0.22 + attack * 0.08), radius * (0.38 + i * 0.08), 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        this.drawChargeOrb(ctx, 0, -radius * 0.04, radius * (0.18 + attack * 0.12), "#ffca67");
      }

      ctx.restore();
    }

    drawRotor(ctx, x, y, radius, color, angle) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(-radius, 0);
      ctx.lineTo(radius, 0);
      ctx.moveTo(0, -radius);
      ctx.lineTo(0, radius);
      ctx.stroke();
      ctx.restore();
    }

    drawChargeOrb(ctx, x, y, radius, color) {
      ctx.save();
      ctx.fillStyle = `${color}44`;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    drawCleanWing(ctx, x, y, radius, color, angle) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = `${color}24`;
      ctx.strokeStyle = `${color}bb`;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-radius * 0.85, -radius * 0.2, -radius, radius * 0.42);
      ctx.quadraticCurveTo(-radius * 0.36, radius * 0.24, 0, 0);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    drawSlashArc(ctx, radius, color, attack) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(radius * 0.54, -radius * 0.08, radius * (0.62 + attack * 0.18), -0.9, 0.2);
      ctx.stroke();
      ctx.restore();
    }

    drawActorOverlay(ctx, actor, radius, large) {
      const attack = actor.attackPulse || 0;
      const hit = actor.hitPulse || 0;
      const deathT = actor.dying ? 1 - Utils.clamp((actor.deathTimer || 0) / Math.max(0.01, actor.maxDeathTimer || 1), 0, 1) : 0;

      if ((actor.flying || actor.behavior === "heal" || actor.behavior === "chain" || actor.behavior === "eye") && !actor.dying) {
        const flap = Math.sin((actor.step || 0) * 1.7) * 4;
        ctx.save();
        ctx.strokeStyle = `${actor.color}aa`;
        ctx.lineWidth = large ? 4 : 2.4;
        ctx.shadowColor = actor.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(-radius * 0.55, -radius * 0.4 + flap, radius * 0.42, Math.PI * 0.9, Math.PI * 1.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(radius * 0.55, -radius * 0.4 - flap, radius * 0.42, Math.PI * 1.15, Math.PI * 2.1);
        ctx.stroke();
        ctx.restore();
      }

      if (attack > 0 && !actor.dying) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, attack + 0.15);
        ctx.strokeStyle = actor.behavior === "frost" ? "#d7f4ff" : actor.behavior === "priest" ? "#d7a9ff" : actor.color;
        ctx.fillStyle = `${actor.color}30`;
        ctx.shadowColor = actor.color;
        ctx.shadowBlur = 16 + attack * 14;
        ctx.lineWidth = large ? 5 : 3;
        if (actor.behavior === "ranged" || actor.behavior === "chain" || actor.behavior === "frost" || actor.behavior === "priest" || actor.behavior === "heal") {
          ctx.beginPath();
          ctx.arc(radius * 0.86, -radius * 0.28, radius * (0.28 + attack * 0.3), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(radius * 0.75 + attack * radius * 0.45, -radius * 0.06, radius * (0.72 + attack * 0.28), -Math.PI * 0.72, Math.PI * 0.22);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(radius * 0.22, radius * 0.2);
          ctx.lineTo(radius * (1.12 + attack * 0.35), -radius * 0.36);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (hit > 0 && !actor.dying) {
        ctx.save();
        ctx.globalAlpha = hit;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
        ctx.fillStyle = "rgba(255, 117, 117, 0.22)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = (Math.PI * 2 * i) / 6;
          const r = radius * (0.55 + hit * 0.42);
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r - radius * 0.15;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (deathT > 0) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - deathT);
        ctx.strokeStyle = `${actor.color}cc`;
        ctx.lineWidth = large ? 4 : 2;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.arc(0, radius * 0.1, radius * (0.8 + deathT * 0.8), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawEnemySlime(ctx, enemy) {
      ctx.fillStyle = enemy.color;
      ctx.strokeStyle = "rgba(255, 225, 225, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-17, -14, 34, 28, 13);
      ctx.fill();
      ctx.stroke();
    }

    drawRunnerEnemy(ctx, enemy) {
      ctx.fillStyle = enemy.color;
      ctx.beginPath();
      ctx.moveTo(-17, 13);
      ctx.lineTo(4, -17);
      ctx.lineTo(19, 13);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#233113";
      ctx.stroke();
    }

    drawShieldEnemy(ctx, enemy) {
      ctx.fillStyle = enemy.color;
      ctx.strokeStyle = "rgba(255, 239, 198, 0.76)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(22, -10);
      ctx.lineTo(16, 19);
      ctx.lineTo(0, 26);
      ctx.lineTo(-16, 19);
      ctx.lineTo(-22, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    drawBomberEnemy(ctx, enemy) {
      ctx.fillStyle = "#24181b";
      ctx.strokeStyle = enemy.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#ffca67";
      ctx.beginPath();
      ctx.moveTo(6, -12);
      ctx.quadraticCurveTo(16, -24, 24, -14);
      ctx.stroke();
    }

    drawMageEnemy(ctx, enemy, color) {
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(18, 12);
      ctx.lineTo(-18, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#0b0710";
      ctx.fillRect(-8, -3, 16, 5);
    }

    drawEyeEnemy(ctx, enemy) {
      ctx.fillStyle = enemy.color;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#14071f";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    drawBoss(ctx, enemy) {
      const t = performance.now() * 0.001;
      ctx.rotate(t * 0.7);
      ctx.fillStyle = enemy.phase === 2 ? "#ff5fb7" : "#a46cff";
      ctx.strokeStyle = "#ffca67";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const angle = (Math.PI * 2 * i) / 8;
        const r = i % 2 ? 32 : 44;
        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawProjectile(ctx, projectile) {
      ctx.save();
      (projectile.trail || []).forEach((point, index) => {
        ctx.globalAlpha = Utils.clamp(point.life / 0.22, 0, 1) * (0.18 + index * 0.06);
        ctx.fillStyle = projectile.color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, projectile.type === "frost" ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = projectile.color;
      ctx.fillStyle = projectile.color;
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = projectile.type === "frost" ? 16 : 12;
      ctx.lineWidth = projectile.type === "frost" ? 3 : 2;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, projectile.type === "frost" ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      if (projectile.type === "frost") {
        ctx.strokeStyle = "rgba(255,255,255,0.82)";
        ctx.beginPath();
        ctx.moveTo(projectile.x - 8, projectile.y);
        ctx.lineTo(projectile.x + 8, projectile.y);
        ctx.moveTo(projectile.x, projectile.y - 8);
        ctx.lineTo(projectile.x, projectile.y + 8);
        ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(projectile.x - 10, projectile.y + 2);
      ctx.lineTo(projectile.x + 4, projectile.y - 1);
      ctx.stroke();
      ctx.restore();
    }

    drawParticle(ctx, particle) {
      ctx.save();
      ctx.globalAlpha = Utils.clamp(particle.life / 0.7, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawFloatText(ctx, text) {
      ctx.save();
      ctx.globalAlpha = Utils.clamp(text.life / 0.62, 0, 1);
      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.shadowBlur = 5;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.72)";
      ctx.font = "900 14px Microsoft YaHei, sans-serif";
      ctx.strokeText(text.text, text.x - 10, text.y);
      ctx.fillStyle = text.color;
      ctx.font = "900 14px Microsoft YaHei, sans-serif";
      ctx.fillText(text.text, text.x - 10, text.y);
      ctx.restore();
    }

    drawWarning(ctx, width, height) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 70, 100, ${0.08 + Math.sin(performance.now() * 0.012) * 0.035})`;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(255, 202, 103, 0.65)";
      ctx.lineWidth = 3;
      ctx.strokeRect(18, 18, width - 36, height - 36);
      ctx.fillStyle = "rgba(255, 238, 196, 0.92)";
      ctx.font = "900 24px Microsoft YaHei, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Boss 警告：混沌核心接近", width / 2, 48);
      ctx.restore();
    }
  }

  function actorTime() {
    return performance.now();
  }

  SG.Battlefield = Battlefield;
})();
