(function () {
  "use strict";

  const SG = (window.SummonGame = window.SummonGame || {});
  const { Utils, CONFIG } = SG;

  class UIManager {
    constructor() {
      this.currentScreen = "home";
      this.infoReturnScreen = "home";
      this.returnToPause = false;
      this.pauseOpen = false;
      this.soundOn = true;
      this.actionListeners = new Set();
      this.pendingCoopVariant = "campaign";
      this.pendingCoopStageIndex = 0;
      this.campaignProgress = this.loadCampaignProgress();
      this.choices = {
        "coop-p1-mini": "collector",
        "coop-p2-mini": "rhythm",
        "pk-mini": "collector",
        pkP1Skills: ["thunder", "shield"],
        pkP2Skills: ["slow", "airdrop"]
      };

      this.screens = {
        home: document.getElementById("screen-home"),
        mode: document.getElementById("screen-mode"),
        coop: document.getElementById("screen-coop"),
        coopStage: document.getElementById("screen-coop-stage"),
        coopMini: document.getElementById("screen-coop-mini"),
        pk: document.getElementById("screen-pk"),
        game: document.getElementById("screen-game"),
        help: document.getElementById("screen-help"),
        codex: document.getElementById("screen-codex"),
        result: document.getElementById("screen-result")
      };

      this.refs = {
        mode: document.getElementById("mode-text"),
        coins: document.getElementById("coin-text"),
        wave: document.getElementById("wave-text"),
        kills: document.getElementById("kill-text"),
        baseHpText: document.getElementById("base-hp-text"),
        baseHpBar: document.getElementById("base-hp-bar"),
        baseShieldText: document.getElementById("base-shield-text"),
        teamBaseText: document.getElementById("team-base-text"),
        p1BaseText: document.getElementById("p1-base-text"),
        p2BaseText: document.getElementById("p2-base-text"),
        p1EnergyText: document.getElementById("p1-energy-text"),
        p1EnergyBar: document.getElementById("p1-energy-bar"),
        p1SpecialText: document.getElementById("p1-special-text"),
        p1SpecialBar: document.getElementById("p1-special-bar"),
        p1Combo: document.getElementById("p1-combo-text"),
        p1SummonLabel: document.getElementById("p1-summon-label"),
        p1MiniLabel: document.getElementById("p1-mini-label"),
        p1ControlLabel: document.getElementById("p1-control-label"),
        p2EnergyText: document.getElementById("p2-energy-text"),
        p2EnergyBar: document.getElementById("p2-energy-bar"),
        p2SpecialText: document.getElementById("p2-special-text"),
        p2SpecialBar: document.getElementById("p2-special-bar"),
        p2Combo: document.getElementById("p2-combo-text"),
        p2SummonLabel: document.getElementById("p2-summon-label"),
        p2MiniLabel: document.getElementById("p2-mini-label"),
        p2ControlLabel: document.getElementById("p2-control-label"),
        resultTitle: document.getElementById("result-title"),
        resultStats: document.getElementById("result-stats"),
        resultNext: document.getElementById("result-next-btn"),
        resultRestart: document.getElementById("result-restart-btn"),
        resultStage: document.getElementById("result-stage-btn"),
        pause: document.getElementById("pause-overlay"),
        toast: document.getElementById("toast"),
        codexGrid: document.getElementById("codex-grid"),
        summonBoard: document.getElementById("summon-board"),
        incomeHint: document.getElementById("income-hint")
      };
      this.refs.coopVariantSummary = document.getElementById("coop-variant-summary");
      this.refs.coopMiniSummary = document.getElementById("coop-mini-summary");
      this.refs.stageGrid = document.getElementById("stage-grid");
      this.refs.stageSummary = document.getElementById("stage-summary");
      this.refs.pkMiniSummary = document.getElementById("pk-mini-summary");
      this.refs.pkSkillSummary = document.getElementById("pk-skill-summary");
      this.refs.pkP1Skills = document.getElementById("pk-p1-skills");
      this.refs.pkP2Skills = document.getElementById("pk-p2-skills");
      this.refs.coopP1MiniNote = document.getElementById("coop-p1-mini-note");
      this.refs.coopP2MiniNote = document.getElementById("coop-p2-mini-note");
      this.refs.pkMiniNote = document.getElementById("pk-mini-note");

      this.skillButtons = Array.from(document.querySelectorAll(".skill-slot"));
      this.soundButtons = Array.from(document.querySelectorAll("[data-action='toggle-sound']"));

      document.addEventListener("click", (event) => this.handleDocumentClick(event));
      this.populateCodex();
      this.populateSkillSelectors();
      this.renderStageSelect();
      this.updateSelectionSummaries();
      this.homeBackdrop = new HomeBackdrop(document.getElementById("home-bg-canvas"));
      this.homeBackdrop.start();
    }

    onAction(callback) {
      this.actionListeners.add(callback);
      return () => this.actionListeners.delete(callback);
    }

    emit(action, payload) {
      this.actionListeners.forEach((callback) => callback(action, payload));
    }

    handleDocumentClick(event) {
      const button = event.target.closest("button");
      if (!button) return;

      const skillOwner = button.dataset.skillOwner;
      const skillId = button.dataset.skillPick;
      if (skillOwner && skillId) {
        this.togglePKSkill(skillOwner, skillId);
        return;
      }

      const choiceGroup = button.closest("[data-choice-group]");
      if (choiceGroup && button.dataset.value) {
        this.setChoice(choiceGroup.dataset.choiceGroup, button.dataset.value);
        return;
      }

      if (button.dataset.stageIndex !== undefined) {
        this.selectStage(Number(button.dataset.stageIndex));
        return;
      }

      const nav = button.dataset.nav;
      const action = button.dataset.action;
      const skill = button.dataset.skill;

      if (nav) {
        this.navigate(nav);
        return;
      }

      if (skill) {
        this.emit("use-skill", skill);
        return;
      }

      if (action) {
        this.handleAction(action);
      }
    }

    setChoice(group, value) {
      this.choices[group] = value;
      const row = document.querySelector(`[data-choice-group="${group}"]`);
      if (!row) return;
      row.querySelectorAll(".choice-chip").forEach((button) => {
        button.classList.toggle("selected", button.dataset.value === value);
      });
      this.updateSelectionSummaries();
    }

    loadCampaignProgress() {
      const fallback = { unlocked: 1, cleared: [] };
      try {
        const saved = JSON.parse(localStorage.getItem("summonGameCampaignProgress") || "null");
        if (!saved || typeof saved !== "object") return fallback;
        const max = CONFIG.coopStages.length;
        const unlocked = Math.floor(Utils.clamp(Number(saved.unlocked) || 1, 1, max));
        const cleared = Array.isArray(saved.cleared)
          ? saved.cleared.map((value) => Math.floor(Number(value))).filter((value) => value >= 0 && value < max)
          : [];
        return { unlocked, cleared: [...new Set(cleared)] };
      } catch (error) {
        return fallback;
      }
    }

    saveCampaignProgress() {
      localStorage.setItem("summonGameCampaignProgress", JSON.stringify(this.campaignProgress));
    }

    isStageUnlocked(index) {
      return index < this.campaignProgress.unlocked || this.campaignProgress.cleared.includes(index);
    }

    completeCampaignStage(index) {
      const max = CONFIG.coopStages.length;
      this.campaignProgress.cleared = [...new Set(this.campaignProgress.cleared.concat(index))].filter((value) => value >= 0 && value < max);
      this.campaignProgress.unlocked = Math.min(max, Math.max(this.campaignProgress.unlocked, index + 2));
      this.saveCampaignProgress();
      this.renderStageSelect();
    }

    selectStage(index) {
      if (!this.isStageUnlocked(index)) {
        this.toast("该关卡尚未解锁。先通关前一关。");
        return;
      }
      this.pendingCoopStageIndex = index;
      this.renderStageSelect();
      this.updateSelectionSummaries();
    }

    togglePKSkill(owner, skillId) {
      const key = owner === "p1" ? "pkP1Skills" : "pkP2Skills";
      const selected = this.choices[key];
      const exists = selected.includes(skillId);
      if (exists) {
        if (selected.length <= 1) {
          this.toast("每名玩家至少保留 1 个技能。");
          return;
        }
        this.choices[key] = selected.filter((id) => id !== skillId);
      } else {
        if (selected.length >= 2) {
          this.toast("每名玩家最多选择 2 个技能。");
          return;
        }
        this.choices[key] = selected.concat(skillId);
      }
      this.populateSkillSelectors();
      this.updateSelectionSummaries();
    }

    handleAction(action) {
      if (action === "help-back" || action === "codex-back") {
        const target = this.infoReturnScreen || "home";
        this.showScreen(target);
        if (target === "game" && this.returnToPause) {
          this.setPause(true);
        }
        this.returnToPause = false;
        return;
      }

      if (action === "show-soon") {
        this.toast("该玩法入口已保留，当前版本优先开放合作、无限和双线 PK。");
        return;
      }

      if (action === "choose-coop-campaign") {
        this.pendingCoopVariant = "campaign";
        this.campaignProgress = this.loadCampaignProgress();
        if (!this.isStageUnlocked(this.pendingCoopStageIndex)) this.pendingCoopStageIndex = 0;
        this.renderStageSelect();
        this.updateSelectionSummaries();
        this.showScreen("coopStage");
        return;
      }

      if (action === "choose-coop-infinite") {
        this.pendingCoopVariant = "infinite";
        this.updateSelectionSummaries();
        this.showScreen("coopMini");
        return;
      }

      if (action === "confirm-stage") {
        if (!this.isStageUnlocked(this.pendingCoopStageIndex)) {
          this.toast("该关卡尚未解锁。");
          return;
        }
        this.pendingCoopVariant = "campaign";
        this.updateSelectionSummaries();
        this.showScreen("coopMini");
        return;
      }

      if (action === "coop-mini-back") {
        this.showScreen(this.pendingCoopVariant === "campaign" ? "coopStage" : "coop");
        return;
      }

      if (action === "back-stage-select") {
        this.campaignProgress = this.loadCampaignProgress();
        this.renderStageSelect();
        this.showScreen("coopStage");
        return;
      }

      if (action === "start-coop-selected") {
        this.emit("start-coop", {
          variant: this.pendingCoopVariant,
          stageIndex: this.pendingCoopVariant === "campaign" ? this.pendingCoopStageIndex : 0,
          miniGames: {
            p1: this.choices["coop-p1-mini"],
            p2: this.choices["coop-p2-mini"]
          }
        });
        return;
      }

      if (action === "start-pk") {
        if (this.choices.pkP1Skills.length !== 2 || this.choices.pkP2Skills.length !== 2) {
          this.toast("PK 开始前，每名玩家都需要选择 2 个技能。");
          return;
        }
        this.emit("start-pk", {
          miniGame: this.choices["pk-mini"],
          skills: {
            p1: this.choices.pkP1Skills,
            p2: this.choices.pkP2Skills
          }
        });
        return;
      }

      this.emit(action);
    }

    navigate(target) {
      if (target === "help" || target === "codex") {
        this.infoReturnScreen = this.currentScreen === "help" || this.currentScreen === "codex"
          ? this.infoReturnScreen
          : this.currentScreen;
        this.returnToPause = this.pauseOpen;
        this.setPause(false);
        this.showScreen(target);
        return;
      }

      if (target === "home") {
        this.setPause(false);
        this.emit("go-home");
      }

      this.showScreen(target);
    }

    showScreen(name) {
      Object.entries(this.screens).forEach(([screenName, element]) => {
        element.classList.toggle("active", screenName === name);
      });
      this.currentScreen = name;
    }

    setPause(open) {
      this.pauseOpen = open;
      this.refs.pause.classList.toggle("hidden", !open);
    }

    setSound(on) {
      this.soundOn = on;
      this.soundButtons.forEach((button) => {
        button.textContent = `音量：${on ? "开" : "关"}`;
      });
    }

    toast(message) {
      this.refs.toast.textContent = message;
      this.refs.toast.classList.remove("hidden");
      window.clearTimeout(this.toastTimer);
      this.toastTimer = window.setTimeout(() => {
        this.refs.toast.classList.add("hidden");
      }, 2200);
    }

    updateGame(state) {
      if (!state) return;
      this.refs.mode.textContent = state.modeLabel;
      this.refs.coins.textContent = state.mode === "pk"
        ? `${state.players.p1.coins} / ${state.players.p2.coins}`
        : String(state.coins);
      this.refs.wave.textContent = state.waveLabel || `${state.wave}`;
      this.refs.kills.textContent = String(state.kills);

      if (state.mode === "pk") {
        const p1Hp = Math.ceil(Utils.clamp(state.bases.p1.hp / CONFIG.pkBaseMaxHp, 0, 1) * 100);
        const p2Hp = Math.ceil(Utils.clamp(state.bases.p2.hp / CONFIG.pkBaseMaxHp, 0, 1) * 100);
        this.refs.baseHpText.textContent = `${p1Hp}%`;
        this.refs.baseHpBar.style.width = `${Utils.clamp(state.bases.p1.hp / CONFIG.pkBaseMaxHp, 0, 1) * 100}%`;
        this.refs.baseShieldText.textContent = `${Math.ceil(state.bases.p1.shield)}`;
        this.refs.teamBaseText.textContent = `剩余 ${Math.ceil(state.pkTimeLeft)}s`;
        this.refs.p1BaseText.textContent = `${p1Hp}%`;
        this.refs.p2BaseText.textContent = `${p2Hp}%`;
      } else {
        const hpPct = Utils.clamp(state.baseHp / CONFIG.baseMaxHp, 0, 1);
        const enemyPct = Utils.clamp((state.enemyBase?.hp || 0) / (state.enemyBase?.maxHp || CONFIG.baseMaxHp), 0, 1);
        this.refs.baseHpText.textContent = `${Math.ceil(hpPct * 100)}%`;
        this.refs.baseHpBar.style.width = `${hpPct * 100}%`;
        this.refs.baseShieldText.textContent = `${Math.ceil(state.baseShield)}`;
        this.refs.teamBaseText.textContent = `${state.stageName}`;
        this.refs.p1BaseText.textContent = `${Math.ceil(hpPct * 100)}%`;
        this.refs.p2BaseText.textContent = `${Math.ceil(enemyPct * 100)}%`;
      }

      this.updatePlayerHud("p1", state.players.p1, state);
      this.updatePlayerHud("p2", state.players.p2, state);
      this.updateSkills(state);
      this.updateLog(state.logs);
      this.updateSummonBoard(state);
      this.refs.incomeHint.textContent = state.incomeHint || "小游戏收益会转化为金币、召唤能量、连击和特殊进度。";
    }

    updatePlayerHud(playerId, player, state) {
      const energyPct = Utils.clamp(player.energy / CONFIG.summonEnergyMax, 0, 1);
      const specialPct = Utils.clamp(player.special / CONFIG.specialMax, 0, 1);
      const nextSummon = state.nextSummons?.[playerId] || CONFIG.units.slimeMech.name;
      const miniGame = CONFIG.miniGames[player.miniGame] || CONFIG.miniGames.collector;
      this.refs[`${playerId}EnergyText`].textContent = `${Math.floor(energyPct * 100)}%`;
      this.refs[`${playerId}EnergyBar`].style.width = `${energyPct * 100}%`;
      this.refs[`${playerId}SpecialText`].textContent = `${Math.floor(specialPct * 100)}%`;
      this.refs[`${playerId}SpecialBar`].style.width = `${specialPct * 100}%`;
      this.refs[`${playerId}Combo`].textContent = String(player.combo);
      this.refs[`${playerId}SummonLabel`].textContent = nextSummon;
      this.refs[`${playerId}MiniLabel`].textContent = miniGame.shortName;
      if (player.miniGame === "rhythm") {
        this.refs[`${playerId}ControlLabel`].textContent = playerId === "p1" ? "W A S D" : "↑ ← ↓ →";
      } else {
        this.refs[`${playerId}ControlLabel`].textContent = playerId === "p1" ? "A / D" : "← / →";
      }
    }

    updateSkills(state) {
      this.skillButtons.forEach((button) => {
        const id = button.dataset.skill;
        const config = state.skillSlots[id];
        button.hidden = !config;
        if (!config) return;
        button.dataset.skillType = config.type;
        button.style.setProperty("--skill-art", `url("../${config.icon}")`);
        button.querySelector("span").textContent = config.keyLabel;
        button.querySelector("strong").textContent = config.name;
        const cooldown = state.skillCooldowns[id] || 0;
        const small = button.querySelector("small");
        const payer = state.mode === "pk" ? state.players[config.owner] : null;
        const coins = payer ? payer.coins : state.coins;
        const canPay = coins >= config.cost;

        button.classList.toggle("cooling", cooldown > 0);
        button.classList.toggle("locked", cooldown <= 0 && !canPay);

        if (cooldown > 0) {
          small.textContent = `${config.cost} 金币 / ${cooldown.toFixed(1)}s`;
        } else if (!canPay) {
          small.textContent = `需要 ${config.cost} 金币`;
        } else {
          small.textContent = `${config.cost} 金币 / 准备`;
        }
      });
    }

    updateLog() {
      // Main tactical UI keeps combat events out of the center panel.
    }

    updateSummonBoard(state) {
      const makeChip = (label, playerId) => {
        const player = state.players[playerId];
        const unitName = state.nextSummons?.[playerId] || CONFIG.units.slimeMech.name;
        const energy = Math.floor(Utils.clamp(player.energy / CONFIG.summonEnergyMax, 0, 1) * 100);
        return `
          <div class="summon-chip">
            <span>${label}</span>
            <strong>${unitName}</strong>
            <small>召唤 ${energy}%</small>
          </div>
        `;
      };
      const collab = Math.floor(Utils.clamp((state.players.p1.special + state.players.p2.special) / (CONFIG.specialMax * 2), 0, 1) * 100);
      this.refs.summonBoard.innerHTML = `
        ${makeChip("P1 目标", "p1")}
        ${makeChip("P2 目标", "p2")}
        <div class="summon-chip collab-chip">
          <span>协作巨像</span>
          <strong>${CONFIG.units.starGolem.name}</strong>
          <small>同步 ${collab}%</small>
        </div>
      `;
    }

    renderStageSelect() {
      if (!this.refs.stageGrid) return;
      this.refs.stageGrid.innerHTML = CONFIG.coopStages.map((stage, index) => {
        const unlocked = this.isStageUnlocked(index);
        const cleared = this.campaignProgress.cleared.includes(index);
        const selected = this.pendingCoopStageIndex === index;
        const enemyIds = [...new Set(stage.enemyPlan.flat())].slice(0, 4);
        const enemies = enemyIds.map((id) => CONFIG.enemies[id]?.name || id).join(" / ");
        const bg = CONFIG.art.backgrounds[stage.mapTone] || CONFIG.art.backgrounds.meadow;
        return `
          <button class="stage-card ${selected ? "selected" : ""} ${cleared ? "cleared" : ""} ${unlocked ? "" : "locked"}" data-stage-index="${index}" ${unlocked ? "" : "disabled"}>
            <span class="stage-thumb"><img src="${bg}" alt="" /></span>
            <span class="stage-status">${cleared ? "已通关" : unlocked ? "已解锁" : "未解锁"}</span>
            <strong>第 ${index + 1} 关：${stage.name}</strong>
            <small>${stage.subtitle} · 难度 ${index + 1}</small>
            <em>${enemies}</em>
          </button>
        `;
      }).join("");
    }

    populateCodex() {
      const units = Object.entries(CONFIG.units).map(([id, unit]) => ({
        id,
        group: "召唤物",
        title: unit.name,
        subtitle: unit.role,
        body: unit.condition,
        sprite: unit.sprite
      }));
      const enemies = Object.entries(CONFIG.enemies).map(([id, enemy]) => ({
        id,
        group: enemy.boss ? "Boss" : "敌人",
        title: enemy.name,
        subtitle: enemy.role,
        body: this.enemyDescription(enemy),
        sprite: enemy.sprite
      }));

      this.refs.codexGrid.innerHTML = units.concat(enemies).map((entry) => `
          <article class="codex-entry">
            <div class="codex-art">
            <div class="codex-icon">
              <img src="${entry.sprite}" alt="" />
            </div>
          </div>
          <div class="codex-copy">
            <span class="entry-group">${entry.group}</span>
            <h2>${entry.title}</h2>
            <strong>${entry.subtitle}</strong>
            <p>${entry.body}</p>
          </div>
        </article>
      `).join("");
    }

    populateSkillSelectors() {
      if (!this.refs.pkP1Skills || !this.refs.pkP2Skills) return;
      this.refs.pkP1Skills.innerHTML = this.renderSkillPickCards("p1");
      this.refs.pkP2Skills.innerHTML = this.renderSkillPickCards("p2");
    }

    renderSkillPickCards(owner) {
      const selected = owner === "p1" ? this.choices.pkP1Skills : this.choices.pkP2Skills;
      return Object.values(CONFIG.skillPool).map((skill) => {
        const active = selected.includes(skill.id);
        return `
          <button class="skill-pick-card ${active ? "selected" : ""}" data-skill-owner="${owner}" data-skill-pick="${skill.id}">
            <span class="skill-pick-art"><img src="${skill.icon}" alt="" /></span>
            <span>${active ? "已选择" : "可选择"}</span>
            <strong>${skill.name}</strong>
            <small>${skill.desc}</small>
            <em>${skill.cost} 金币 / ${skill.cooldown}s</em>
          </button>
        `;
      }).join("");
    }

    updateSelectionSummaries() {
      const mini = (id) => CONFIG.miniGames[id]?.shortName || id;
      const stage = CONFIG.coopStages[this.pendingCoopStageIndex] || CONFIG.coopStages[0];
      if (this.refs.coopVariantSummary) {
        this.refs.coopVariantSummary.textContent = this.pendingCoopVariant === "infinite" ? "合作无限" : "合作闯关";
      }
      if (this.refs.stageSummary) {
        this.refs.stageSummary.textContent = `第 ${this.pendingCoopStageIndex + 1} 关：${stage.name}`;
      }
      if (this.refs.coopMiniSummary) {
        const stageText = this.pendingCoopVariant === "campaign" ? `第${this.pendingCoopStageIndex + 1}关 · ` : "";
        this.refs.coopMiniSummary.textContent = `${stageText}P1 ${mini(this.choices["coop-p1-mini"])} / P2 ${mini(this.choices["coop-p2-mini"])}`;
      }
      if (this.refs.pkMiniSummary) {
        this.refs.pkMiniSummary.textContent = mini(this.choices["pk-mini"]);
      }
      if (this.refs.pkSkillSummary) {
        const name = (id) => CONFIG.skillPool[id]?.name || id;
        this.refs.pkSkillSummary.textContent = `P1 ${this.choices.pkP1Skills.map(name).join(" + ")} / P2 ${this.choices.pkP2Skills.map(name).join(" + ")}`;
      }
      if (this.refs.coopP1MiniNote) this.refs.coopP1MiniNote.textContent = this.noteForMini(this.choices["coop-p1-mini"], "p1");
      if (this.refs.coopP2MiniNote) this.refs.coopP2MiniNote.textContent = this.noteForMini(this.choices["coop-p2-mini"], "p2");
      if (this.refs.pkMiniNote) this.refs.pkMiniNote.textContent = this.noteForMini(this.choices["pk-mini"], "both");
    }

    noteForMini(id, playerId) {
      if (id === "rhythm") return playerId === "p2" ? "节奏点击：四轨下落音符，使用 ↑/←/↓/→ 判定。" : "节奏点击：四轨下落音符，使用 W/A/S/D 判定。";
      if (id === "runner") return playerId === "p2" ? "三线跑酷：竖向三跑道，使用 ←/→ 左右换道。" : "三线跑酷：竖向三跑道，使用 A/D 左右换道。";
      return playerId === "p2" ? "接宝石：←/→ 移动，接宝石，避开炸弹和假宝石。" : "接宝石：A/D 移动，接宝石，避开炸弹和假宝石。";
    }

    enemyDescription(enemy) {
      if (enemy.boss) return "拥有阶段变化、脉冲伤害和召唤护卫能力。";
      if (enemy.behavior === "runner") return "速度快，容易越过前排防线。";
      if (enemy.behavior === "shield") return "护甲高，会吸收一部分伤害。";
      if (enemy.behavior === "bomber") return "死亡时爆炸，伤害附近召唤物。";
      if (enemy.behavior === "frost") return "远程攻击并减速召唤物。";
      if (enemy.behavior === "eye") return "飞行远程单位，会绕开部分阻挡。";
      if (enemy.behavior === "priest") return "周期治疗附近敌人。";
      return "基础敌人，用于组成第一波压力。";
    }

    showResult(result, state) {
      this.setPause(false);
      this.showScreen("result");
      const isStageClear = result === "stageVictory";
      const isCampaign = state.mode === "coop" && state.variant === "campaign";
      const finalCampaign = isCampaign && result === "victory";
      if (isCampaign && (isStageClear || finalCampaign)) {
        this.pendingCoopStageIndex = state.stageIndex;
        this.completeCampaignStage(state.stageIndex);
      }
      const hasNextStage = isStageClear && state.stageIndex < CONFIG.coopStages.length - 1;
      this.refs.resultNext.classList.toggle("hidden", !hasNextStage);
      this.refs.resultRestart.textContent = isCampaign ? "重玩本关" : "重新开始";
      if (this.refs.resultStage) this.refs.resultStage.classList.toggle("hidden", !isCampaign);

      if (state.mode === "pk") {
        const winner = result === "p1" ? "玩家一胜利" : result === "p2" ? "玩家二胜利" : "平局";
        const p1Pct = Math.ceil(Utils.clamp(state.bases.p1.hp / CONFIG.pkBaseMaxHp, 0, 1) * 100);
        const p2Pct = Math.ceil(Utils.clamp(state.bases.p2.hp / CONFIG.pkBaseMaxHp, 0, 1) * 100);
        this.refs.resultTitle.textContent = winner;
        this.refs.resultStats.innerHTML = `
          <div><span>P1 基地</span><strong>${p1Pct}%</strong></div>
          <div><span>P2 基地</span><strong>${p2Pct}%</strong></div>
          <div><span>战斗用时</span><strong>${Math.floor(state.elapsed)}s</strong></div>
          <div><span>P1 召唤</span><strong>${state.players.p1.summons}</strong></div>
          <div><span>P2 召唤</span><strong>${state.players.p2.summons}</strong></div>
          <div><span>干扰触发</span><strong>${state.interferenceCount}</strong></div>
          <div><span>P1 获得金币</span><strong>${state.players.p1.coinsEarned}</strong></div>
          <div><span>P2 获得金币</span><strong>${state.players.p2.coinsEarned}</strong></div>
          <div><span>技能释放</span><strong>${state.stats.skillCasts}</strong></div>
        `;
        return;
      }

      if (isStageClear) {
        this.refs.resultTitle.textContent = `${state.stageName} 通关`;
      } else if (finalCampaign) {
        this.refs.resultTitle.textContent = "合作闯关全部通关";
      } else {
        this.refs.resultTitle.textContent = result === "victory" ? "核心守住了" : "核心被击破";
      }
      const p1Accuracy = state.players.p1.successes + state.players.p1.mistakes > 0
        ? Math.round((state.players.p1.successes / (state.players.p1.successes + state.players.p1.mistakes)) * 100)
        : 100;
      const p2Accuracy = state.players.p2.successes + state.players.p2.mistakes > 0
        ? Math.round((state.players.p2.successes / (state.players.p2.successes + state.players.p2.mistakes)) * 100)
        : 100;
      const totals = state.campaignTotals || state.stats;
      this.refs.resultStats.innerHTML = `
        <div><span>${finalCampaign ? "总进度" : "当前关卡"}</span><strong>${state.stageName}</strong></div>
        <div><span>关卡结果</span><strong>${result === "defeat" ? "失败" : "胜利"}</strong></div>
        <div><span>关卡波次</span><strong>${state.waveLabel}</strong></div>
        <div><span>击败敌人</span><strong>${state.kills}</strong></div>
        <div><span>剩余金币</span><strong>${state.coins}</strong></div>
        <div><span>获得金币</span><strong>${state.stats.coinsEarned}</strong></div>
        <div><span>玩家一召唤</span><strong>${state.players.p1.summons}</strong></div>
        <div><span>玩家二召唤</span><strong>${state.players.p2.summons}</strong></div>
        <div><span>技能释放</span><strong>${state.stats.skillCasts}</strong></div>
        <div><span>最高连击</span><strong>${Math.max(state.players.p1.bestCombo, state.players.p2.bestCombo)}</strong></div>
        <div><span>P1 小游戏</span><strong>${p1Accuracy}% / ${state.players.p1.bestCombo}</strong></div>
        <div><span>P2 小游戏</span><strong>${p2Accuracy}% / ${state.players.p2.bestCombo}</strong></div>
        <div><span>战斗用时</span><strong>${Math.floor(state.elapsed)}s</strong></div>
        ${finalCampaign ? `
          <div><span>总击败</span><strong>${totals.kills}</strong></div>
          <div><span>总召唤</span><strong>${totals.summons}</strong></div>
          <div><span>总金币</span><strong>${totals.coinsEarned}</strong></div>
        ` : ""}
      `;
    }
  }

  class HomeBackdrop {
    constructor(canvas) {
      this.canvas = canvas;
      this.time = 0;
      this.running = false;
    }

    start() {
      if (this.running) return;
      this.running = true;
      const tick = (now) => {
        this.time = now / 1000;
        this.draw();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    draw() {
      const { ctx, width, height } = Utils.resizeCanvas(this.canvas);
      ctx.clearRect(0, 0, width, height);

      const horizon = height * 0.63;
      const glow = ctx.createLinearGradient(0, 0, width, height);
      glow.addColorStop(0, "rgba(69, 242, 176, 0.14)");
      glow.addColorStop(0.5, "rgba(255, 202, 103, 0.1)");
      glow.addColorStop(1, "rgba(255, 95, 183, 0.08)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(width * 0.68, horizon);
      ctx.rotate(this.time * 0.08);
      for (let i = 0; i < 7; i += 1) {
        ctx.rotate(Math.PI / 7);
        ctx.strokeStyle = i % 2 ? "rgba(255, 202, 103, 0.21)" : "rgba(69, 242, 176, 0.24)";
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-178 + i * 18, -178 + i * 18, 356 - i * 36, 356 - i * 36);
      }
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = "rgba(174, 255, 218, 0.13)";
      ctx.lineWidth = 1;
      for (let x = -width; x < width * 2; x += 70) {
        const drift = (this.time * 18) % 70;
        ctx.beginPath();
        ctx.moveTo(x + drift, height);
        ctx.lineTo(width * 0.56 + x * 0.04, horizon);
        ctx.stroke();
      }
      ctx.restore();

      for (let i = 0; i < 70; i += 1) {
        const x = (i * 97 + this.time * (12 + (i % 5) * 4)) % (width + 80) - 40;
        const y = (i * 53 + Math.sin(this.time + i) * 18) % height;
        const size = 1.4 + (i % 4) * 0.6;
        ctx.fillStyle = i % 3 === 0 ? "rgba(255, 202, 103, 0.48)" : "rgba(101, 255, 193, 0.4)";
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  SG.UIManager = UIManager;
})();
