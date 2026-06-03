(function () {
  "use strict";

  const SG = (window.SummonGame = window.SummonGame || {});
  const { CONFIG, Utils } = SG;

  class MiniGame {
    constructor(options) {
      this.canvas = options.canvas;
      this.player = CONFIG.players[options.playerId];
      this.callbacks = options.callbacks || {};
      this.type = options.type || "collector";
      this.width = 1;
      this.height = 1;
      this.reset();
    }

    setType(type) {
      this.type = CONFIG.miniGames[type] ? type : "collector";
      this.reset();
    }

    reset() {
      this.items = [];
      this.beats = [];
      this.obstacles = [];
      this.particles = [];
      this.floatTexts = [];
      this.spawnTimer = Utils.rand(0.2, 0.55);
      this.beatTimer = 0.5;
      this.runnerTimer = 0.75;
      this.catcherX = 0;
      this.runnerLane = 1;
      this.runnerVisualLane = 1;
      this.runnerLaneDirection = 0;
      this.laneMoveTimer = 0;
      this.flash = 0;
      this.shake = 0;
      this.hitPulse = 0;
      this.reaction = "idle";
      this.reactionTimer = 0;
      this.catcherVelocity = 0;
      this.catcherFacing = 1;
      this.nearItem = false;
      this.runnerDodgePulse = 0;
      this.lastMessage = "";
      this.lastGrade = "";
      this.lastGradeTimer = 0;
      this.localHits = 0;
      this.localAttempts = 0;
    }

    handlePress(code, statePlayer) {
      if (this.type !== "rhythm") return false;
      const keys = this.player.rhythmKeys || this.player.tapKeys;
      const valid = keys.includes(code);
      if (!valid) return false;

      const targetY = this.height - 62;
      let best = null;
      let bestDelta = Infinity;
      this.beats.forEach((beat) => {
        if (beat.dead || beat.code !== code) return;
        const delta = Math.abs(beat.y - targetY);
        if (delta < bestDelta) {
          best = beat;
          bestDelta = delta;
        }
      });

      if (!best || bestDelta > 58) {
        this.lastGrade = "Miss";
        this.lastGradeTimer = 0.7;
        this.mistake("Miss", 10, "miss");
        this.spawnParticles(this.rhythmLaneX(this.width, keys.indexOf(code), keys.length), targetY, "#ff7777", 12);
        this.addFloat(this.rhythmLaneX(this.width, keys.indexOf(code), keys.length), targetY - 20, "Miss", "#ff8b8b");
        return true;
      }

      best.dead = true;
      const perfect = bestDelta < 20;
      this.lastGrade = perfect ? "Perfect" : "Good";
      this.lastGradeTimer = perfect ? 0.9 : 0.65;
      const reward = perfect
        ? { energy: 18, coins: 5, special: 12, label: "完美节奏", quality: "perfect" }
        : { energy: 12, coins: 3, special: 7, label: "节奏命中", quality: "good" };
      this.success(reward);
      this.spawnParticles(best.x, targetY, perfect ? "#ffef9e" : this.player.color, perfect ? 18 : 10);
      this.addFloat(best.x, targetY - 26, perfect ? "Perfect" : "Good", perfect ? "#ffef9e" : this.player.color);
      return true;
    }

    update(dt, input, statePlayer, difficulty) {
      const w = this.width || this.canvas.clientWidth || 1;
      const h = this.height || this.canvas.clientHeight || 1;
      const speedMod = statePlayer.interference?.type === "speed" ? 1.35 : 1;

      if (this.type === "collector") {
        this.updateCollector(dt, input, statePlayer, difficulty, w, h, speedMod);
      } else if (this.type === "rhythm") {
        this.updateRhythm(dt, statePlayer, difficulty, w, h, speedMod);
      } else {
        this.updateRunner(dt, input, statePlayer, difficulty, w, h, speedMod);
      }

      this.particles.forEach((particle) => {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.life -= dt;
        particle.vy += 76 * dt;
      });
      this.particles = this.particles.filter((particle) => particle.life > 0);
      this.floatTexts.forEach((text) => {
        text.y -= dt * 38;
        text.life -= dt;
      });
      this.floatTexts = this.floatTexts.filter((text) => text.life > 0);
      this.flash = Math.max(0, this.flash - dt * 3.3);
      this.shake = Math.max(0, this.shake - dt * 6);
      this.hitPulse = Math.max(0, this.hitPulse - dt * 4);
      this.reactionTimer = Math.max(0, this.reactionTimer - dt);
      if (this.reactionTimer <= 0) this.reaction = "idle";
      this.runnerDodgePulse = Math.max(0, this.runnerDodgePulse - dt * 4);
      this.lastGradeTimer = Math.max(0, this.lastGradeTimer - dt);
    }

    updateCollector(dt, input, statePlayer, difficulty, width, height, speedMod) {
      const left = input.isAnyDown(this.player.leftKeys);
      const right = input.isAnyDown(this.player.rightKeys);
      const speed = 315 * speedMod;
      const previousX = this.catcherX || width / 2;

      if (left !== right) {
        const direction = right ? 1 : -1;
        this.catcherFacing = direction;
        this.catcherX += direction * speed * dt;
      }

      const margin = 38;
      this.catcherX = Utils.clamp(this.catcherX || width / 2, margin, width - margin);
      this.catcherVelocity = (this.catcherX - previousX) / Math.max(0.001, dt);

      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnCollectorItem(width, difficulty, statePlayer);
        this.spawnTimer = Utils.rand(0.34, 0.72) / Math.max(0.9, difficulty * 0.36);
      }

      this.items.forEach((item) => {
        item.y += item.vy * dt * speedMod;
        item.spin += item.spinSpeed * dt;
      });

      this.checkCollectorCollisions(height);
      const catcherY = height - 44;
      this.nearItem = this.items.some((item) => !item.dead && item.y > catcherY - 112 && item.y < catcherY + 20 && Math.abs(item.x - this.catcherX) < 58);
      this.items = this.items.filter((item) => item.y < height + 40 && !item.dead);
    }

    spawnCollectorItem(width, difficulty, statePlayer) {
      let type = Math.random() < Math.min(0.34, 0.18 + difficulty * 0.018) ? "bomb" : "gem";
      if (statePlayer.interference?.type === "fake" && Math.random() < 0.34) {
        type = "fake";
      }
      this.items.push({
        type,
        x: Utils.rand(28, Math.max(30, width - 28)),
        y: -24,
        vy: Utils.rand(120, 174) + difficulty * 5,
        spin: Utils.rand(0, Math.PI * 2),
        spinSpeed: Utils.rand(-4, 4)
      });
    }

    checkCollectorCollisions(height) {
      const catcherY = height - 44;
      this.items.forEach((item) => {
        if (item.dead) return;
        const insideX = Math.abs(item.x - this.catcherX) < 43;
        const insideY = Math.abs(item.y - catcherY) < 26;
        if (!insideX || !insideY) return;

        item.dead = true;
        if (item.type === "gem") {
          this.success({ energy: 16, coins: 4, special: 7, label: "接到宝石" });
          this.spawnParticles(item.x, catcherY, this.player.color, 18);
          this.addFloat(item.x, catcherY - 26, "+能量", "#ffef9e");
        } else if (item.type === "fake") {
          this.mistake("假宝石", 12, "confused");
          this.spawnParticles(item.x, catcherY, "#b5b5b5", 16);
          this.addFloat(item.x, catcherY - 26, "假宝石", "#d0d0d0");
        } else {
          this.mistake("碰到炸弹", 18, "hurt");
          this.spawnParticles(item.x, catcherY, "#ff7777", 26);
          this.addFloat(item.x, catcherY - 26, "爆炸!", "#ff7777");
        }
      });
    }

    updateRhythm(dt, statePlayer, difficulty, width, height, speedMod) {
      this.beatTimer -= dt;
      if (this.beatTimer <= 0) {
        const keys = this.player.rhythmKeys || this.player.tapKeys;
        const keyIndex = Math.floor(Utils.rand(0, keys.length));
        const laneX = this.rhythmLaneX(width, keyIndex, keys.length);
        this.beats.push({
          code: keys[keyIndex],
          label: this.keyLabel(keys[keyIndex]),
          lane: keyIndex,
          x: laneX,
          y: -36,
          speed: (185 + difficulty * 9) * speedMod,
          dead: false,
          pulse: 0
        });
        this.beatTimer = Utils.rand(0.34, 0.66) / Math.max(1, difficulty * 0.055 + 1);
      }

      const targetY = height - 62;
      this.beats.forEach((beat) => {
        beat.y += beat.speed * dt;
        beat.pulse += dt * 8;
        if (!beat.dead && beat.y > targetY + 64) {
          beat.dead = true;
          this.lastGrade = "Miss";
          this.lastGradeTimer = 0.7;
          this.mistake("Miss", 8, "miss");
          this.spawnParticles(beat.x, targetY, "#ff7777", 10);
          this.addFloat(beat.x, targetY - 20, "Miss", "#ff8b8b");
        }
      });
      this.beats = this.beats.filter((beat) => beat.y < height + 70 && !beat.dead);
    }

    updateRunner(dt, input, statePlayer, difficulty, width, height, speedMod) {
      this.laneMoveTimer -= dt;
      if (this.laneMoveTimer <= 0) {
        if (input.isAnyDown(this.player.leftKeys)) {
          const previousLane = this.runnerLane;
          this.runnerLane = Math.max(0, this.runnerLane - 1);
          this.laneMoveTimer = 0.16;
          if (previousLane !== this.runnerLane) {
            this.reaction = "dash";
            this.reactionTimer = 0.2;
            this.runnerLaneDirection = -1;
            this.runnerDodgePulse = 1;
          }
        } else if (input.isAnyDown(this.player.rightKeys)) {
          const previousLane = this.runnerLane;
          this.runnerLane = Math.min(2, this.runnerLane + 1);
          this.laneMoveTimer = 0.16;
          if (previousLane !== this.runnerLane) {
            this.reaction = "dash";
            this.reactionTimer = 0.2;
            this.runnerLaneDirection = 1;
            this.runnerDodgePulse = 1;
          }
        }
      }

      this.runnerTimer -= dt;
      if (this.runnerTimer <= 0) {
        const obstacleChance = Math.min(0.68, 0.46 + difficulty * 0.02);
        this.obstacles.push({
          type: Math.random() < obstacleChance ? "obstacle" : "ring",
          lane: Math.floor(Utils.rand(0, 3)),
          y: -40,
          speed: (210 + difficulty * 12) * speedMod,
          dead: false,
          scored: false
        });
        this.runnerTimer = Utils.rand(0.52, 0.9) / Math.max(1, difficulty * 0.05 + 1);
      }

      const playerY = height - 54;
      this.obstacles.forEach((object) => {
        object.y += object.speed * dt;
        const sameLane = object.lane === this.runnerLane;
        const nearPlayer = Math.abs(object.y - playerY) < 26;
        if (!object.dead && sameLane && nearPlayer) {
          object.dead = true;
          const x = this.runnerLaneX(width, object.lane);
          if (object.type === "ring") {
            this.success({ energy: 22, coins: 4, special: 8, label: "穿过能量环" });
            this.spawnParticles(x, playerY, this.player.color, 22);
            this.addFloat(x, playerY - 28, "+环能量", "#ffef9e");
          } else {
            this.mistake("撞到障碍", 20, "hurt");
            this.spawnParticles(x, playerY, "#ff7777", 26);
            this.addFloat(x, playerY - 28, "撞击!", "#ff7777");
          }
        }
        if (!object.scored && object.type === "obstacle" && object.y > playerY + 36) {
          object.scored = true;
          this.success({ energy: 7, coins: 2, special: 3, label: "躲过障碍" });
        }
      });
      this.obstacles = this.obstacles.filter((object) => object.y < height + 80 && !object.dead);
    }

    success(payload) {
      this.flash = 1;
      this.hitPulse = 1;
      this.lastMessage = payload.label;
      if (this.type === "rhythm") {
        this.reaction = payload.quality === "perfect" ? "perfect" : "good";
      } else if (this.type === "runner") {
        this.reaction = "boost";
      } else {
        this.reaction = "catch";
      }
      this.reactionTimer = payload.quality === "perfect" ? 0.62 : 0.48;
      if (this.type === "rhythm") {
        this.localHits += 1;
        this.localAttempts += 1;
      }
      this.callbacks.onReward?.(this.player.id, {
        kind: "success",
        source: this.type,
        comboGain: 1,
        energy: payload.energy,
        coins: payload.coins,
        special: payload.special,
        label: payload.label,
        quality: payload.quality || "good"
      });
    }

    mistake(label, energyLoss, reason) {
      this.shake = 1;
      this.hitPulse = 1;
      this.lastMessage = label;
      this.reaction = reason || "hurt";
      this.reactionTimer = 0.56;
      if (this.type === "rhythm") {
        this.localAttempts += 1;
      }
      this.callbacks.onReward?.(this.player.id, {
        kind: "mistake",
        source: this.type,
        comboBreak: true,
        energyLoss,
        specialLoss: Math.ceil(energyLoss * 0.25),
        label
      });
    }

    spawnParticles(x, y, color, count) {
      for (let i = 0; i < count; i += 1) {
        const angle = Utils.rand(-Math.PI, Math.PI);
        const speed = Utils.rand(34, 150);
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: Utils.rand(0.24, 0.62),
          size: Utils.rand(2, 4),
          color
        });
      }
    }

    addFloat(x, y, text, color) {
      this.floatTexts.push({ x, y, text, color, life: 0.72 });
    }

    draw(statePlayer) {
      const { ctx, width, height } = Utils.resizeCanvas(this.canvas);
      this.width = width;
      this.height = height;

      if (!this.catcherX || this.catcherX < 2) {
        this.catcherX = width / 2;
      }

      const shakeX = this.shake > 0 || statePlayer.interference?.type === "shake"
        ? Math.sin(performance.now() * 0.06) * (this.shake > 0 ? 5 : 3)
        : 0;

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(shakeX, 0);
      this.drawBackdrop(ctx, width, height, statePlayer);
      if (this.type === "collector") this.drawCollector(ctx, height);
      if (this.type === "rhythm") this.drawRhythm(ctx, width, height);
      if (this.type === "runner") this.drawRunner(ctx, width, height);
      this.particles.forEach((particle) => this.drawParticle(ctx, particle));
      this.floatTexts.forEach((text) => this.drawFloatText(ctx, text));
      ctx.restore();

      if (this.flash > 0) {
        ctx.fillStyle = `rgba(101, 255, 193, ${0.08 * this.flash})`;
        ctx.fillRect(0, 0, width, height);
      }

      if (statePlayer.interference?.type === "fog") {
        this.drawFog(ctx, width, height);
      }
    }

    drawBackdrop(ctx, width, height, statePlayer) {
      const meta = CONFIG.miniGames[this.type];
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, `${this.player.color}24`);
      gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.026)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0.24)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 34) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - 34, height);
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(width * 0.5, height * 0.52);
      ctx.rotate(performance.now() * 0.00026);
      ctx.strokeStyle = `${this.player.color}36`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(width, height) * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(width, height) * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = "rgba(238, 248, 236, 0.75)";
      ctx.font = "700 13px Microsoft YaHei, sans-serif";
      ctx.fillText(meta.name, 14, 24);
      ctx.fillStyle = "rgba(167, 182, 164, 0.85)";
      ctx.font = "12px Microsoft YaHei, sans-serif";
      ctx.fillText(`连击 ${statePlayer.combo}  召唤 ${Math.floor(statePlayer.energy)}%  特殊 ${Math.floor(statePlayer.special)}%`, 14, 44);
      if (this.lastMessage) {
        const badReaction = this.reaction === "hurt" || this.reaction === "confused" || this.reaction === "miss";
        ctx.fillStyle = badReaction
          ? "rgba(255, 140, 140, 0.9)"
          : "rgba(255, 230, 120, 0.92)";
        ctx.fillText(this.lastMessage, 14, 64);
      }
    }

    drawCollector(ctx, height) {
      this.items.forEach((item) => this.drawCollectorItem(ctx, item));
      this.drawCatcher(ctx, height);
    }

    drawCollectorItem(ctx, item) {
      const art = CONFIG.art.mini;
      const src = item.type === "gem" ? art.gem : item.type === "fake" ? art.fakeGem : art.bomb;
      const img = Utils.image(src);
      if (img) {
        const size = item.type === "bomb" ? 34 : 36;
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.spin * (item.type === "bomb" ? 0.22 : 0.6));
        const glowColor = item.type === "bomb" ? "#ff7777" : item.type === "fake" ? "#a8a8a8" : this.player.color;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = item.type === "bomb" ? 22 : 18;
        ctx.globalAlpha = item.type === "fake" ? 0.78 : 1;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.54, 0, Math.PI * 2);
        ctx.strokeStyle = item.type === "bomb" ? "rgba(255, 111, 111, 0.65)" : "rgba(255, 255, 255, 0.45)";
        ctx.lineWidth = item.type === "bomb" ? 3 : 1.5;
        ctx.stroke();
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
        return;
      }

      if (item.type === "gem" || item.type === "fake") {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.spin);
        const fill = ctx.createLinearGradient(-10, -10, 10, 10);
        if (item.type === "fake") {
          fill.addColorStop(0, "#ffffff");
          fill.addColorStop(0.55, "#9b9b9b");
          fill.addColorStop(1, "#2f3432");
        } else {
          fill.addColorStop(0, "#ffffff");
          fill.addColorStop(0.28, "#ffef9e");
          fill.addColorStop(1, this.player.color);
        }
        Utils.drawDiamond(ctx, 0, 0, 18, fill, "rgba(255, 255, 255, 0.75)");
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.spin * 0.4);
      ctx.fillStyle = "#231b1e";
      ctx.strokeStyle = "#ff7777";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#ffca67";
      ctx.beginPath();
      ctx.moveTo(5, -9);
      ctx.quadraticCurveTo(12, -18, 18, -12);
      ctx.stroke();
      ctx.fillStyle = "#ff7777";
      ctx.fillRect(-4, -3, 8, 3);
      ctx.restore();
    }

    drawCatcher(ctx, height) {
      const y = height - 44;
      const now = performance.now() * 0.001;
      const lean = Utils.clamp((this.catcherVelocity || 0) / 620, -0.28, 0.28);
      const moving = Math.abs(this.catcherVelocity || 0) > 28;
      const bob = Math.sin(now * (moving ? 12 : 5.5)) * (moving ? 2.4 : 1.1);
      const catchPose = this.reaction === "catch" || this.reaction === "perfect" || this.reaction === "good";
      const hurtPose = this.reaction === "hurt" || this.reaction === "miss";
      const confusedPose = this.reaction === "confused";
      const reactT = Utils.clamp(this.reactionTimer / 0.56, 0, 1);

      this.drawCollectorCharacter(ctx, y, {
        lean,
        moving,
        facing: this.catcherFacing || 1,
        bob,
        catchPose,
        hurtPose,
        confusedPose,
        reactT
      });
    }

    drawCollectorCharacter(ctx, y, pose) {
      const now = performance.now() * 0.001;
      const hurtShake = pose.hurtPose ? Math.sin(now * 46) * 4 * pose.reactT : 0;
      const x = this.catcherX + hurtShake;
      const art = CONFIG.art.mini;
      const src = pose.hurtPose || pose.confusedPose
        ? art.collectorHurt
        : pose.catchPose || this.nearItem
          ? art.collectorCatch
          : pose.moving
            ? art.collectorMove
            : art.collectorIdle;
      const img = Utils.image(src);

      ctx.save();
      ctx.translate(x, y + 4);

      ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
      ctx.beginPath();
      ctx.ellipse(0, 28, 38, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      if (img) {
        ctx.save();
        ctx.translate(pose.lean * 5, pose.moving ? Math.sin(now * 10) * 1.2 : 0);
        ctx.rotate(pose.lean * 0.08);
        ctx.scale(pose.facing || 1, 1);
        const scale = pose.catchPose ? 1.06 : pose.hurtPose ? 0.98 : 1;
        const drawW = 124 * scale;
        const drawH = drawW * (img.naturalHeight / Math.max(1, img.naturalWidth));
        ctx.shadowColor = pose.catchPose ? "#ffef9e" : "rgba(0,0,0,0.5)";
        ctx.shadowBlur = pose.catchPose ? 14 : 7;
        ctx.drawImage(img, -drawW / 2, 30 - drawH, drawW, drawH);
        ctx.restore();
      }

      if (pose.catchPose) {
        ctx.fillStyle = "#ffef9e";
        ctx.shadowColor = "#ffef9e";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc((pose.facing || 1) * 31, -46, 3, 0, Math.PI * 2);
        ctx.arc((pose.facing || 1) * -29, -39, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (pose.hurtPose || pose.confusedPose) {
        ctx.font = "900 20px Microsoft YaHei, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = pose.hurtPose ? "#ff7777" : "#d7d7d7";
        ctx.shadowColor = pose.hurtPose ? "#ff7777" : "#ffffff";
        ctx.shadowBlur = 12;
        ctx.fillText(pose.hurtPose ? "!" : "?", 0, -61);
      }

      ctx.restore();
    }

    drawRhythm(ctx, width, height) {
      const keys = this.player.rhythmKeys || this.player.tapKeys;
      const targetY = height - 62;
      const top = 82;
      const comboGlow = Math.min(1, (this.localHits || 0) / 24);
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.beginPath();
      ctx.roundRect(18, top - 20, width - 36, height - top - 18, 12);
      ctx.fill();
      for (let i = 0; i < keys.length; i += 1) {
        const x = this.rhythmLaneX(width, i, keys.length);
        const laneW = (width - 58) / keys.length - 8;
        const laneGradient = ctx.createLinearGradient(x, top, x, height);
        laneGradient.addColorStop(0, `${this.player.color}${comboGlow > 0.45 ? "22" : "12"}`);
        laneGradient.addColorStop(1, `${this.player.color}${comboGlow > 0.45 ? "42" : "28"}`);
        ctx.fillStyle = laneGradient;
        ctx.beginPath();
        ctx.roundRect(x - laneW / 2, top - 12, laneW, height - top - 32, 10);
        ctx.fill();
        ctx.strokeStyle = i % 2 ? "rgba(255, 202, 103, 0.44)" : `${this.player.color}88`;
        ctx.lineWidth = comboGlow > 0.45 ? 2.4 : 1.6;
        ctx.stroke();
        ctx.fillStyle = "rgba(238, 248, 236, 0.82)";
        ctx.font = "900 13px Microsoft YaHei, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(this.keyLabel(keys[i]), x, height - 20);
      }
      ctx.strokeStyle = "#ffca67";
      ctx.shadowColor = this.lastGrade === "Perfect" ? "#ffef9e" : this.player.color;
      ctx.shadowBlur = 16 + comboGlow * 18;
      const lineArt = Utils.image(CONFIG.art.mini.judgmentLine);
      if (lineArt) {
        ctx.drawImage(lineArt, 24, targetY - 7, width - 48, 14);
      } else {
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(28, targetY);
        ctx.lineTo(width - 28, targetY);
        ctx.stroke();
      }
      ctx.restore();

      this.beats.forEach((beat) => {
        const noteArt = Utils.image(CONFIG.art.mini.rhythmNote);
        if (noteArt) {
          ctx.save();
          ctx.translate(beat.x, beat.y);
          const pulse = 1 + Math.sin(beat.pulse) * 0.08;
          ctx.scale(pulse, pulse);
          ctx.shadowColor = this.player.color;
          ctx.shadowBlur = 15;
          ctx.drawImage(noteArt, -22, -22, 44, 44);
          ctx.fillStyle = "#251013";
          ctx.font = "900 14px Microsoft YaHei, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(beat.label, 0, 2);
          ctx.restore();
          return;
        }
        ctx.save();
        ctx.translate(beat.x, beat.y);
        const pulse = 1 + Math.sin(beat.pulse) * 0.08;
        ctx.scale(pulse, pulse);
        const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
        glow.addColorStop(0, "#ffffff");
        glow.addColorStop(0.38, this.player.color);
        glow.addColorStop(1, "rgba(69, 242, 176, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = this.player.color;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-17, -17, 34, 34, 9);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#07110b";
        ctx.font = "900 14px Microsoft YaHei, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(beat.label, 0, 1);
        ctx.restore();
      });

      this.drawRhythmPulseField(ctx, width, height, comboGlow, targetY);
      const total = stateSafeTotal(this);
      const accuracy = total > 0 ? Math.round((this.localHits / total) * 100) : 100;
      ctx.fillStyle = this.lastGrade === "Miss" ? "#ff8b8b" : this.lastGrade === "Perfect" ? "#ffef9e" : this.player.color;
      ctx.font = `900 ${this.lastGradeTimer > 0 ? 28 : 22}px Microsoft YaHei, sans-serif`;
      ctx.textAlign = "right";
      ctx.shadowColor = this.lastGrade === "Miss" ? "#ff7777" : this.player.color;
      ctx.shadowBlur = this.lastGradeTimer > 0 ? 18 : 6;
      ctx.fillText(this.lastGrade || "READY", width - 20, 74);
      ctx.fillStyle = "rgba(238, 248, 236, 0.72)";
      ctx.font = "12px Microsoft YaHei, sans-serif";
      ctx.fillText(`准确率 ${accuracy}%`, width - 20, 94);
    }

    drawRhythmPulseField(ctx, width, height, comboGlow, targetY) {
      const now = performance.now() * 0.001;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const beat = this.lastGradeTimer > 0 ? this.lastGradeTimer : comboGlow * 0.4;
      const color = this.lastGrade === "Miss" ? "#ff7777" : this.lastGrade === "Perfect" ? "#ffef9e" : this.player.color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 + comboGlow * 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18 + comboGlow * 24;
      for (let i = 0; i < 4; i += 1) {
        const x = this.rhythmLaneX(width, i, 4);
        const pulse = 10 + (Math.sin(now * 6 + i) * 0.5 + 0.5) * 10 + beat * 18;
        ctx.beginPath();
        ctx.arc(x, targetY, pulse, 0, Math.PI * 2);
        ctx.stroke();
        if (comboGlow > 0.5) {
          ctx.beginPath();
          ctx.moveTo(x - 17, targetY + 21);
          ctx.lineTo(x + 17, targetY + 21);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawRunner(ctx, width, height) {
      const playerY = height - 54;
      const laneTop = 82;
      const laneBottom = height - 24;
      const roadArt = Utils.image(CONFIG.art.mini.runnerRoad);
      const roadGradient = ctx.createLinearGradient(0, laneTop, 0, laneBottom);
      roadGradient.addColorStop(0, "rgba(125, 182, 255, 0.08)");
      roadGradient.addColorStop(1, "rgba(69, 242, 176, 0.16)");
      ctx.fillStyle = roadGradient;
      ctx.beginPath();
      ctx.roundRect(24, laneTop - 12, width - 48, laneBottom - laneTop + 18, 14);
      ctx.fill();
      if (roadArt) {
        ctx.save();
        ctx.globalAlpha = 0.82;
        ctx.drawImage(roadArt, 24, laneTop - 12, width - 48, laneBottom - laneTop + 18);
        ctx.restore();
      }
      const speedT = performance.now() * 0.18;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 12; i += 1) {
        const y = laneTop + ((i * 58 + speedT) % Math.max(1, laneBottom - laneTop));
        ctx.beginPath();
        ctx.moveTo(36, y);
        ctx.lineTo(width - 36, y + 18);
        ctx.stroke();
      }
      ctx.restore();
      for (let lane = 0; lane < 3; lane += 1) {
        const x = this.runnerLaneX(width, lane);
        ctx.strokeStyle = lane === this.runnerLane ? `${this.player.color}99` : "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = lane === this.runnerLane ? 4 : 1;
        ctx.beginPath();
        ctx.moveTo(x, laneTop);
        ctx.lineTo(x, laneBottom);
        ctx.stroke();
      }

      this.obstacles.forEach((object) => {
        const x = this.runnerLaneX(width, object.lane);
        const img = Utils.image(object.type === "ring" ? CONFIG.art.mini.energyRing : CONFIG.art.mini.runnerObstacle);
        if (img) {
          const size = object.type === "ring" ? 42 : 48;
          ctx.save();
          ctx.shadowColor = object.type === "ring" ? this.player.color : "#ff7777";
          ctx.shadowBlur = object.type === "ring" ? 18 : 20;
          if (object.type === "obstacle") {
            ctx.strokeStyle = "rgba(255, 111, 111, 0.66)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, object.y, size * 0.48, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.drawImage(img, x - size / 2, object.y - size / 2, size, size);
          ctx.restore();
          return;
        }
        ctx.save();
        ctx.translate(x, object.y);
        if (object.type === "ring") {
          ctx.strokeStyle = this.player.color;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, 0, 19, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = "#ffca67";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 9, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = "#24181b";
          ctx.strokeStyle = "#ff7777";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -18);
          ctx.lineTo(18, 10);
          ctx.lineTo(-18, 10);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      });

      ctx.save();
      const targetDelta = this.runnerLane - this.runnerVisualLane;
      this.runnerVisualLane += targetDelta * 0.28;
      const laneDelta = this.runnerLane - this.runnerVisualLane;
      const laneDirection = Math.abs(targetDelta) > 0.01
        ? Math.sign(targetDelta)
        : this.runnerLaneDirection || 0;
      const now = performance.now() * 0.001;
      const hurtPose = this.reaction === "hurt";
      const boostPose = this.reaction === "boost";
      ctx.translate(this.runnerLaneX(width, this.runnerVisualLane) + (hurtPose ? Math.sin(now * 42) * 3.5 * this.reactionTimer : 0), playerY);
      this.drawBackRunner(ctx, {
        laneLean: laneDelta,
        laneDirection,
        hurtPose,
        boostPose,
        now
      });
      ctx.restore();
    }

    drawBackRunner(ctx, pose) {
      const run = pose.now * 13;
      const lanePose = Math.abs(pose.laneLean) > 0.08 || this.runnerDodgePulse > 0.05;
      const laneDirection = pose.laneDirection || this.runnerLaneDirection || Math.sign(pose.laneLean || 0);
      const lean = lanePose
        ? Utils.clamp(laneDirection * 0.18, -0.32, 0.32)
        : Utils.clamp(pose.laneLean * 0.34, -0.32, 0.32);
      const hurt = pose.hurtPose ? this.reactionTimer : 0;
      const boost = pose.boostPose ? this.reactionTimer : 0;
      const art = CONFIG.art.mini;
      const src = pose.hurtPose
        ? art.runnerBackHit
        : lanePose
          ? art.runnerBackLane
          : pose.boostPose
            ? art.runnerBackRun
            : art.runnerBackRun || art.runnerBackIdle;
      const img = Utils.image(src);

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
      ctx.beginPath();
      ctx.ellipse(0, 27, 31, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      if (img) {
        ctx.save();
        ctx.translate(0, -Math.abs(Math.sin(run)) * 1.2);
        ctx.rotate(lean * 0.55 - hurt * 0.12);
        if (lanePose && laneDirection > 0) ctx.scale(-1, 1);
        const scale = 1 + boost * 0.06 - hurt * 0.04;
        const drawW = 118 * scale;
        const drawH = drawW * (img.naturalHeight / Math.max(1, img.naturalWidth));
        ctx.shadowColor = boost > 0 ? "#ffef9e" : "rgba(0,0,0,0.55)";
        ctx.shadowBlur = boost > 0 ? 16 : 8;
        ctx.drawImage(img, -drawW / 2, 32 - drawH, drawW, drawH);
        ctx.restore();
      }

      if (boost > 0) {
        ctx.strokeStyle = "#ffef9e";
        ctx.shadowColor = "#ffef9e";
        ctx.shadowBlur = 18;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-23, 10);
        ctx.quadraticCurveTo(0, -8, 24, 10);
        ctx.stroke();
      }

      if (hurt > 0) {
        ctx.fillStyle = "#ff7777";
        ctx.font = "900 19px Microsoft YaHei, sans-serif";
        ctx.textAlign = "center";
        ctx.shadowColor = "#ff7777";
        ctx.shadowBlur = 14;
        ctx.fillText("!", 0, -58);
      }
      ctx.restore();
    }

    runnerLaneX(width, lane) {
      return width * (0.28 + lane * 0.22);
    }

    rhythmLaneX(width, lane, count) {
      const left = 48;
      const right = width - 48;
      return left + ((right - left) / Math.max(1, count - 1)) * lane;
    }

    drawFog(ctx, width, height) {
      const t = performance.now() * 0.001;
      ctx.save();
      for (let i = 0; i < 7; i += 1) {
        const x = (i * 92 + Math.sin(t + i) * 30) % (width + 90) - 45;
        const y = height * (0.18 + (i % 4) * 0.18);
        const gradient = ctx.createRadialGradient(x, y, 20, x, y, 110);
        gradient.addColorStop(0, "rgba(220, 230, 224, 0.22)");
        gradient.addColorStop(1, "rgba(220, 230, 224, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(x - 120, y - 90, 240, 180);
      }
      ctx.restore();
    }

    drawParticle(ctx, particle) {
      ctx.save();
      ctx.globalAlpha = Utils.clamp(particle.life / 0.62, 0, 1);
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
      ctx.globalAlpha = Utils.clamp(text.life / 0.72, 0, 1);
      ctx.font = "900 14px Microsoft YaHei, sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
      ctx.shadowBlur = 5;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
      ctx.strokeText(text.text, text.x, text.y);
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, text.x, text.y);
      ctx.restore();
    }

    keyLabel(code) {
      if (code === "KeyA") return "A";
      if (code === "KeyW") return "W";
      if (code === "KeyS") return "S";
      if (code === "KeyD") return "D";
      if (code === "ArrowUp") return "↑";
      if (code === "ArrowLeft") return "←";
      if (code === "ArrowDown") return "↓";
      if (code === "ArrowRight") return "→";
      return code;
    }
  }

  function stateSafeTotal(game) {
    game.localHits = game.localHits || 0;
    game.localAttempts = game.localAttempts || 0;
    return game.localAttempts;
  }

  SG.MiniGame = MiniGame;
})();
