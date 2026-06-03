(function () {
  "use strict";

  const SG = (window.SummonGame = window.SummonGame || {});
  const { CONFIG, Utils } = SG;

  class GameEngine {
    constructor(ui, input) {
      this.ui = ui;
      this.input = input;
      this.running = false;
      this.paused = false;
      this.ended = false;
      this.lastTime = Utils.now();
      this.loopStarted = false;
      this.soundOn = localStorage.getItem("summonGameSound") !== "off";
      this.audioContext = null;
      this.lastSetup = {
        mode: "coop",
        variant: "campaign",
        stageIndex: 0,
        miniGames: { p1: "collector", p2: "rhythm" },
        skills: CONFIG.defaultSkills.coop
      };
      this.campaignTotals = this.emptyCampaignTotals();
      this.stageStartTotals = this.emptyCampaignTotals();

      this.state = this.createState(this.lastSetup);

      this.minigames = {
        p1: new SG.MiniGame({
          canvas: document.getElementById("mini-p1"),
          playerId: "p1",
          type: "collector",
          callbacks: { onReward: (playerId, payload) => this.handleMiniReward(playerId, payload) }
        }),
        p2: new SG.MiniGame({
          canvas: document.getElementById("mini-p2"),
          playerId: "p2",
          type: "rhythm",
          callbacks: { onReward: (playerId, payload) => this.handleMiniReward(playerId, payload) }
        })
      };

      this.battlefield = new SG.Battlefield(document.getElementById("battle-canvas"), {
        onLog: (message) => this.log(message),
        onBattleEnd: (result) => this.finish(result)
      });

      this.bind();
      this.ui.setSound(this.soundOn);
      this.ui.updateGame(this.state);
      this.startLoop();
    }

    bind() {
      this.ui.onAction((action, payload) => {
        if (action === "start-coop") this.startCoop(payload);
        if (action === "start-pk") this.startPK(payload);
        if (action === "pause") this.setPaused(true);
        if (action === "resume") this.setPaused(false);
        if (action === "restart") this.restart();
        if (action === "next-stage") this.nextStage();
        if (action === "go-home") this.stop();
        if (action === "toggle-sound") this.toggleSound();
        if (action === "use-skill") this.useSkill(payload);
      });

      this.input.onPress((code) => {
        if (!this.running || this.paused || this.ui.currentScreen !== "game") return;
        const handledByMini = this.minigames.p1.handlePress(code, this.state.players.p1)
          || this.minigames.p2.handlePress(code, this.state.players.p2);
        if (handledByMini) return;
        const skillId = Object.keys(this.state.skillSlots).find((id) => this.state.skillSlots[id].keyCodes.includes(code));
        if (skillId) this.useSkill(skillId);
      });

      this.input.onSystem((action) => {
        if (action !== "pause-toggle") return;
        if (this.running && (this.ui.currentScreen === "game" || this.ui.pauseOpen)) {
          this.setPaused(!this.paused);
        }
      });
    }

    createState(setup) {
      const isPK = setup.mode === "pk";
      const stageIndex = Math.floor(Utils.clamp(setup.stageIndex || 0, 0, CONFIG.coopStages.length - 1));
      const stage = CONFIG.coopStages[stageIndex];
      const skillSlots = this.createSkillSlots(setup);
      const skillCooldowns = {};
      Object.keys(skillSlots).forEach((id) => {
        skillCooldowns[id] = 0;
      });
      const state = {
        mode: setup.mode,
        variant: setup.variant || "campaign",
        modeLabel: isPK ? "PK 双线对抗" : setup.variant === "infinite" ? "合作无限" : "合作闯关",
        stageIndex,
        stageName: isPK ? "双线竞技场" : setup.variant === "infinite" ? CONFIG.infinite.name : stage.name,
        mapTone: isPK ? "pk" : setup.variant === "infinite" ? CONFIG.infinite.mapTone : stage.mapTone,
        wave: 1,
        waveInStage: 1,
        waveLabel: isPK ? `PK ${CONFIG.pkTimeLimit}s` : setup.variant === "infinite" ? "无限 1" : `第${stageIndex + 1}关 1/${stage.waves}波`,
        difficulty: setup.variant === "infinite" ? 1 : 1 + stageIndex * 0.58,
        coins: CONFIG.initialCoins,
        kills: 0,
        elapsed: 0,
        pkTimeLeft: CONFIG.pkTimeLimit,
        baseHp: CONFIG.baseMaxHp,
        baseShield: 0,
        enemyBase: {
          hp: CONFIG.baseMaxHp,
          maxHp: CONFIG.baseMaxHp,
          shield: 0
        },
        bases: {
          p1: { hp: CONFIG.pkBaseMaxHp, shield: 0 },
          p2: { hp: CONFIG.pkBaseMaxHp, shield: 0 }
        },
        logs: ["小游戏收益会转化为召唤、金币和技能节奏。"],
        incomeHint: "选择小游戏后开始：合作可不同，PK 双方相同。",
        skillSlots,
        skillCooldowns,
        nextSummons: { p1: CONFIG.units.slimeMech.name, p2: CONFIG.units.slimeMech.name },
        collabCooldown: 0,
        interferenceCount: 0,
        stats: {
          coinsEarned: 0,
          skillCasts: 0,
          summons: 0
        },
        campaignTotals: setup.campaignTotals || this.emptyCampaignTotals(),
        players: {
          p1: this.createPlayerState(setup.miniGames.p1),
          p2: this.createPlayerState(setup.miniGames.p2)
        }
      };

      if (isPK) {
        state.players.p1.coins = 70;
        state.players.p2.coins = 70;
        state.coins = 0;
      }

      return state;
    }

    emptyCampaignTotals() {
      return {
        kills: 0,
        summons: 0,
        skillCasts: 0,
        coinsEarned: 0,
        elapsed: 0,
        p1BestCombo: 0,
        p2BestCombo: 0
      };
    }

    createSkillSlots(setup) {
      const selected = setup.skills || CONFIG.defaultSkills[setup.mode] || CONFIG.defaultSkills.coop;
      return {
        p1Skill1: this.makeSkillSlot("p1Skill1", "p1", "J", ["KeyJ"], selected.p1[0]),
        p1Skill2: this.makeSkillSlot("p1Skill2", "p1", "K", ["KeyK"], selected.p1[1]),
        p2Skill1: this.makeSkillSlot("p2Skill1", "p2", "1", ["Digit1", "Numpad1"], selected.p2[0]),
        p2Skill2: this.makeSkillSlot("p2Skill2", "p2", "2", ["Digit2", "Numpad2"], selected.p2[1])
      };
    }

    makeSkillSlot(slotId, owner, keyLabel, keyCodes, poolId) {
      const skill = CONFIG.skillPool[poolId] || CONFIG.skillPool.thunder;
      return {
        ...skill,
        slotId,
        poolId,
        owner,
        keyLabel,
        keyCodes
      };
    }

    createPlayerState(miniGame) {
      return {
        miniGame,
        energy: 0,
        special: 0,
        combo: 0,
        bestCombo: 0,
        score: 0,
        coins: 0,
        coinsEarned: 0,
        successes: 0,
        mistakes: 0,
        summons: 0,
        skillCasts: 0,
        readyUntil: 0,
        lastMistakeLog: -99,
        interference: null
      };
    }

    startCoop(payload) {
      const setup = {
        mode: "coop",
        variant: payload?.variant || "campaign",
        stageIndex: payload?.stageIndex || 0,
        campaignTotals: payload?.campaignTotals,
        miniGames: payload?.miniGames || { p1: "collector", p2: "rhythm" },
        skills: CONFIG.defaultSkills.coop
      };
      if (setup.variant === "campaign" && setup.stageIndex === 0 && !setup.campaignTotals) {
        this.campaignTotals = this.emptyCampaignTotals();
        setup.campaignTotals = this.campaignTotals;
      } else if (setup.variant === "campaign" && setup.campaignTotals) {
        this.campaignTotals = { ...setup.campaignTotals };
        setup.campaignTotals = this.campaignTotals;
      }
      this.startWithSetup(setup);
      const modeName = setup.variant === "infinite" ? "合作无限" : "合作闯关";
      this.log(`${modeName}开始：守住核心并用小游戏驱动召唤。`);
      const firstStage = setup.variant === "infinite" ? CONFIG.infinite.name : CONFIG.coopStages[setup.stageIndex].name;
      this.log(`进入${firstStage}。`);
    }

    startPK(payload) {
      const miniGame = payload?.miniGame || "collector";
      const setup = {
        mode: "pk",
        variant: "duel",
        miniGames: { p1: miniGame, p2: miniGame },
        skills: payload?.skills || CONFIG.defaultSkills.pk
      };
      this.startWithSetup(setup);
      this.log("PK 开始：左右基地互攻，限时结束后比较血量。");
      this.log("高连击会给对手施加短时干扰。");
    }

    startWithSetup(setup) {
      this.unlockAudio();
      this.stageStartTotals = setup.variant === "campaign"
        ? { ...(setup.campaignTotals || this.emptyCampaignTotals()) }
        : this.emptyCampaignTotals();
      setup.stageStartTotals = { ...this.stageStartTotals };
      this.lastSetup = setup;
      this.state = this.createState(setup);
      this.battlefield.reset();
      this.minigames.p1.setType(setup.miniGames.p1);
      this.minigames.p2.setType(setup.miniGames.p2);
      this.running = true;
      this.paused = false;
      this.ended = false;
      this.lastTime = Utils.now();
      this.ui.setPause(false);
      this.ui.showScreen("game");
      this.updateNextSummons();
      this.ui.updateGame(this.state);
    }

    restart() {
      if (this.running || this.ended || this.ui.currentScreen === "result") {
        if (this.lastSetup.mode === "pk") this.startPK({ miniGame: this.lastSetup.miniGames.p1, skills: this.lastSetup.skills });
        else this.startCoop({
          variant: this.lastSetup.variant,
          miniGames: this.lastSetup.miniGames,
          stageIndex: this.lastSetup.stageIndex || 0,
          campaignTotals: this.lastSetup.stageIndex ? (this.lastSetup.stageStartTotals || this.lastSetup.campaignTotals) : undefined
        });
      }
    }

    nextStage() {
      if (!this.state || this.state.mode !== "coop" || this.state.variant !== "campaign") return;
      const nextIndex = this.state.stageIndex + 1;
      if (nextIndex >= CONFIG.coopStages.length) return;
      this.startCoop({
        variant: "campaign",
        miniGames: this.lastSetup.miniGames,
        stageIndex: nextIndex,
        campaignTotals: this.campaignTotals
      });
    }

    stop() {
      this.running = false;
      this.paused = false;
      this.ended = false;
      this.ui.setPause(false);
      this.input.clear();
    }

    setPaused(paused) {
      if (!this.running || this.ended) return;
      this.paused = paused;
      this.ui.setPause(paused);
      if (!paused) this.lastTime = Utils.now();
    }

    toggleSound() {
      this.soundOn = !this.soundOn;
      localStorage.setItem("summonGameSound", this.soundOn ? "on" : "off");
      this.ui.setSound(this.soundOn);
      if (this.soundOn) {
        this.unlockAudio();
        this.playTone(660, 0.055, "triangle", 0.06);
      }
    }

    startLoop() {
      if (this.loopStarted) return;
      this.loopStarted = true;
      const tick = () => {
        this.frame();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    frame() {
      const now = Utils.now();
      const dt = Math.min(0.05, now - this.lastTime);
      this.lastTime = now;

      if (this.running && !this.paused && this.ui.currentScreen === "game") {
        this.update(dt);
      }

      if (this.running && this.ui.currentScreen === "game") {
        this.draw();
        this.ui.updateGame(this.state);
      }
    }

    update(dt) {
      this.state.elapsed += dt;
      this.state.collabCooldown = Math.max(0, this.state.collabCooldown - dt);
      Object.keys(this.state.skillCooldowns).forEach((id) => {
        this.state.skillCooldowns[id] = Math.max(0, this.state.skillCooldowns[id] - dt);
      });

      Object.values(this.state.players).forEach((player) => {
        if (player.interference) {
          player.interference.time -= dt;
          if (player.interference.time <= 0) player.interference = null;
        }
      });

      const difficulty = this.state.difficulty + this.state.elapsed / (this.state.mode === "pk" ? 95 : 120);
      this.minigames.p1.update(dt, this.input, this.state.players.p1, difficulty);
      this.minigames.p2.update(dt, this.input, this.state.players.p2, difficulty);
      this.battlefield.update(dt, this.state);
      this.updateNextSummons();
    }

    draw() {
      this.battlefield.draw(this.state);
      this.minigames.p1.draw(this.state.players.p1);
      this.minigames.p2.draw(this.state.players.p2);
    }

    handleMiniReward(playerId, payload) {
      if (!this.running || this.paused || this.ended) return;
      const player = this.state.players[playerId];
      const displayName = CONFIG.players[playerId].name;

      if (payload.kind === "mistake") {
        player.energy = Math.max(0, player.energy - (payload.energyLoss || 0));
        player.special = Math.max(0, player.special - (payload.specialLoss || 0));
        player.combo = 0;
        player.mistakes += 1;
        this.state.incomeHint = `${displayName}${payload.label}，连击中断。`;
        if (this.state.elapsed - player.lastMistakeLog > 2.2) {
          this.log(`${displayName}${payload.label}，召唤节奏下降。`);
          player.lastMistakeLog = this.state.elapsed;
        }
        this.playTone(170, 0.08, "sawtooth", 0.035);
        return;
      }

      player.combo += payload.comboGain || 1;
      player.bestCombo = Math.max(player.bestCombo, player.combo);
      player.successes += 1;
      player.score += 10 + player.combo;
      const comboBonus = Math.min(10, Math.floor(player.combo / 3) * 2);
      const energyGain = (payload.energy || 0) + comboBonus;
      const specialGain = payload.special || 0;
      const coinGain = (payload.coins || 0) + (player.combo >= 6 ? 1 : 0);

      player.energy = Math.min(CONFIG.summonEnergyMax + 60, player.energy + energyGain);
      player.special = Math.min(CONFIG.specialMax, player.special + specialGain);
      this.addCoins(playerId, coinGain);
      this.state.incomeHint = `${displayName}${payload.label}：+${energyGain} 能量，+${coinGain} 金币，+${specialGain} 特殊。`;
      this.playTone(payload.quality === "perfect" ? 920 : 680, 0.04, "sine", 0.045);

      if (player.combo > 0 && player.combo % 5 === 0) {
        this.log(`${displayName}连击 ${player.combo}，高级召唤概率提升。`);
      }

      if (this.state.mode === "pk" && player.combo > 0 && player.combo % 6 === 0) {
        this.applyInterference(this.opponentOf(playerId), playerId);
      }

      this.tryCoopCollab(playerId);
      this.tryAutoSummon(playerId);
      this.updateNextSummons();
    }

    addCoins(playerId, amount) {
      if (this.state.mode === "pk") {
        this.state.players[playerId].coins += amount;
      } else {
        this.state.coins += amount;
        this.state.stats.coinsEarned += amount;
      }
      this.state.players[playerId].coinsEarned += amount;
    }

    tryCoopCollab(playerId) {
      if (this.state.mode !== "coop") return;
      const player = this.state.players[playerId];
      if (player.special < CONFIG.specialMax) return;
      player.readyUntil = this.state.elapsed + 8;

      const p1Ready = this.state.players.p1.readyUntil > this.state.elapsed && this.state.players.p1.special >= CONFIG.specialMax;
      const p2Ready = this.state.players.p2.readyUntil > this.state.elapsed && this.state.players.p2.special >= CONFIG.specialMax;
      if (!p1Ready || !p2Ready || this.state.collabCooldown > 0) return;

      this.state.players.p1.special = 0;
      this.state.players.p2.special = 0;
      this.state.players.p1.readyUntil = 0;
      this.state.players.p2.readyUntil = 0;
      this.state.collabCooldown = 24;
      this.state.players.p1.summons += 1;
      this.state.players.p2.summons += 1;
      this.state.stats.summons += 1;
      this.battlefield.spawnUnit("starGolem", "p1", this.state);
      this.log("双人协作召唤成功：星核巨像降临。");
      this.playTone(1040, 0.16, "triangle", 0.08);
    }

    tryAutoSummon(playerId) {
      const player = this.state.players[playerId];
      while (player.energy >= CONFIG.summonEnergyMax) {
        const unitType = this.pickUnitType(player);
        player.energy -= CONFIG.summonEnergyMax;
        if (unitType === "healDrone") player.special = Math.max(0, player.special - 70);
        if (unitType === "thunderDragon" || unitType === "flameKnight") player.special = Math.max(0, player.special - 35);
        player.summons += 1;
        this.state.stats.summons += 1;
        this.battlefield.spawnUnit(unitType, playerId, this.state);
        this.playTone(unitType === "slimeMech" ? 540 : 880, 0.09, "triangle", 0.065);
        this.log(`${CONFIG.players[playerId].name}召唤${CONFIG.units[unitType].name}。`);
      }
    }

    pickUnitType(player) {
      if (player.special >= 70 && player.combo < 5) return "healDrone";
      if (player.combo >= 8) return "flameKnight";
      if (player.combo >= 5 || player.special >= 88) return "thunderDragon";
      if (player.combo >= 3) return "catGunner";
      return "slimeMech";
    }

    updateNextSummons() {
      this.state.nextSummons.p1 = CONFIG.units[this.pickUnitType(this.state.players.p1)].name;
      this.state.nextSummons.p2 = CONFIG.units[this.pickUnitType(this.state.players.p2)].name;
    }

    useSkill(skillId) {
      if (!this.running || this.paused || this.ended) return;
      const skill = this.state.skillSlots[skillId];
      if (!skill) return;
      const coins = this.state.mode === "pk" ? this.state.players[skill.owner].coins : this.state.coins;

      if (this.state.skillCooldowns[skillId] > 0) {
        this.ui.toast(`${skill.name}还在冷却中。`);
        return;
      }

      if (coins < skill.cost) {
        this.ui.toast(`金币不足，${skill.name}需要 ${skill.cost} 金币。`);
        return;
      }

      if (this.state.mode === "pk") this.state.players[skill.owner].coins -= skill.cost;
      else this.state.coins -= skill.cost;
      this.state.skillCooldowns[skillId] = skill.cooldown;
      this.state.players[skill.owner].skillCasts += 1;
      this.state.stats.skillCasts += 1;
      this.battlefield.castSkill(skill, this.state);
      this.playTone(skill.type === "thunder" ? 330 : skill.type === "slow" ? 260 : 520, 0.12, "triangle", 0.075);
    }

    applyInterference(targetId, sourceId) {
      const types = [
        { type: "shake", label: "屏幕抖动", time: 2.1 },
        { type: "fake", label: "假宝石", time: 4.2 },
        { type: "fog", label: "局部雾气", time: 3.5 },
        { type: "speed", label: "速度扰动", time: 3.0 }
      ];
      const effect = Utils.choose(types);
      this.state.players[targetId].interference = { ...effect };
      this.state.interferenceCount += 1;
      this.log(`${CONFIG.players[sourceId].name}触发干扰：${CONFIG.players[targetId].name}${effect.label}。`);
      this.playTone(130, 0.08, "square", 0.035);
    }

    opponentOf(playerId) {
      return playerId === "p1" ? "p2" : "p1";
    }

    finish(result) {
      if (this.ended) return;
      if (this.state.mode === "coop" && this.state.variant === "campaign" && (result === "stageVictory" || result === "victory")) {
        this.accumulateCampaignTotals();
      }
      this.ended = true;
      this.running = false;
      this.paused = false;
      this.ui.showResult(result, this.state);
      this.playTone(result === "victory" || result === "stageVictory" || result === "p1" || result === "p2" ? 820 : 140, 0.18, "triangle", 0.08);
    }

    accumulateCampaignTotals() {
      const totals = this.campaignTotals || this.emptyCampaignTotals();
      totals.kills += this.state.kills;
      totals.summons += this.state.stats.summons;
      totals.skillCasts += this.state.stats.skillCasts;
      totals.coinsEarned += this.state.stats.coinsEarned;
      totals.elapsed += this.state.elapsed;
      totals.p1BestCombo = Math.max(totals.p1BestCombo, this.state.players.p1.bestCombo);
      totals.p2BestCombo = Math.max(totals.p2BestCombo, this.state.players.p2.bestCombo);
      this.campaignTotals = totals;
      this.state.campaignTotals = { ...totals };
      this.lastSetup.campaignTotals = { ...totals };
    }

    log(message) {
      this.state.logs.push(message);
      this.state.logs = this.state.logs.slice(-40);
    }

    unlockAudio() {
      if (!this.soundOn) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        if (!this.audioContext) this.audioContext = new AudioContext();
        if (this.audioContext.state === "suspended") this.audioContext.resume();
      } catch (error) {
        this.audioContext = null;
      }
    }

    playTone(frequency, duration, type, gainValue) {
      if (!this.soundOn) return;
      this.unlockAudio();
      if (!this.audioContext) return;
      try {
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gain.gain.value = gainValue;
        gain.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + duration);
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);
      } catch (error) {
        // 音效失败不影响游戏循环。
      }
    }
  }

  SG.GameEngine = GameEngine;
})();
