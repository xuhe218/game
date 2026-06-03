(function () {
  "use strict";

  const SG = (window.SummonGame = window.SummonGame || {});

  SG.CONFIG = {
    initialCoins: 90,
    summonEnergyMax: 100,
    specialMax: 100,
    baseMaxHp: 120,
    pkBaseMaxHp: 120,
    pkTimeLimit: 180,
    players: {
      p1: {
        id: "p1",
        name: "玩家一",
        shortName: "P1",
        color: "#62f4b5",
        darkColor: "#17634a",
        side: "left",
        leftKeys: ["KeyA"],
        rightKeys: ["KeyD"],
        upKeys: ["KeyW"],
        downKeys: ["KeyS"],
        rhythmKeys: ["KeyW", "KeyA", "KeyS", "KeyD"],
        tapKeys: ["KeyW", "KeyA", "KeyS", "KeyD"]
      },
      p2: {
        id: "p2",
        name: "玩家二",
        shortName: "P2",
        color: "#7db6ff",
        darkColor: "#244f91",
        side: "right",
        leftKeys: ["ArrowLeft"],
        rightKeys: ["ArrowRight"],
        upKeys: ["ArrowUp"],
        downKeys: ["ArrowDown"],
        rhythmKeys: ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"],
        tapKeys: ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]
      }
    },
    miniGames: {
      collector: {
        id: "collector",
        name: "接宝石",
        shortName: "接宝石",
        hint: "A/D 或 ←/→ 移动，接宝石，躲炸弹和假宝石。",
        rewardText: "稳定金币和召唤能量"
      },
      rhythm: {
        id: "rhythm",
        name: "节奏点击",
        shortName: "节奏",
        hint: "四轨音符落到判定线时按对应键。P1：W/A/S/D，P2：上/左/下/右。",
        rewardText: "连击高，特殊进度快"
      },
      runner: {
        id: "runner",
        name: "三线跑酷",
        shortName: "跑酷",
        hint: "三条竖向跑道，A/D 或 ←/→ 左右换道，吃能量环，躲障碍。",
        rewardText: "风险高，召唤能量多"
      }
    },
    art: {
      backgrounds: {
        home: "assets/generated/bg-home.webp",
        coop: "assets/generated/bg-coop.webp",
        pk: "assets/generated/bg-pk.webp",
        meadow: "assets/generated/bg-lane-meadow.webp",
        starlight: "assets/generated/bg-lane-stage-1-starlight.webp",
        forest: "assets/generated/bg-lane-stage-2-ancient-forest.webp",
        mine: "assets/generated/bg-lane-mine.webp",
        machineMine: "assets/generated/bg-lane-stage-3-machine-mine.webp",
        frost: "assets/generated/bg-lane-frost.webp",
        frostRuins: "assets/generated/bg-lane-stage-5-frost-ruins.webp",
        lava: "assets/generated/bg-lane-lava.webp",
        lavaFactory: "assets/generated/bg-lane-stage-4-lava-factory.webp",
        skyCorridor: "assets/generated/bg-lane-stage-6-sky-corridor.webp",
        void: "assets/generated/bg-lane-void.webp",
        voidAltar: "assets/generated/bg-lane-stage-7-void-altar.webp",
        voidCore: "assets/generated/bg-lane-stage-8-void-core-final.webp",
        pkBattle: "assets/generated/bg-lane-pk.webp"
      },
      bases: {
        ally: "assets/generated/base-ally-core.png",
        enemy: "assets/generated/base-enemy-portal.png",
        p1: "assets/generated/base-p1-core.png",
        p2: "assets/generated/base-p2-core.png",
        neutral: "assets/generated/base-neutral-pad.png",
        chaos: "assets/generated/base-chaos-gate.png"
      },
      ui: {
        homeButton: "assets/generated/ui-home-button.png",
        modeCard: "assets/generated/ui-mode-card.png",
        panelFrame: "assets/generated/ui-panel-frame.png",
        codexCard: "assets/generated/ui-codex-card.png",
        skillBar: "assets/generated/ui-skill-bar.png",
        resultPanel: "assets/generated/ui-result-panel.png",
        miniCard: "assets/generated/ui-mini-card.png",
        pkSkillCard: "assets/generated/ui-pk-skill-card.png"
      },
      mini: {
        gem: "assets/generated/mini-gem.png",
        bomb: "assets/generated/mini-bomb.png",
        fakeGem: "assets/generated/mini-fake-gem.png",
        rhythmNote: "assets/generated/mini-rhythm-note.png",
        judgmentLine: "assets/generated/mini-judgment-line.png",
        runnerRoad: "assets/generated/mini-runner-road.png",
        runnerObstacle: "assets/generated/mini-runner-obstacle.png",
        energyRing: "assets/generated/mini-energy-ring.png",
        runnerAvatar: "assets/generated/mini-runner-avatar.png",
        collectorIdle: "assets/generated/mini-collector-idle.png",
        collectorMove: "assets/generated/mini-collector-move.png",
        collectorCatch: "assets/generated/mini-collector-catch.png",
        collectorHurt: "assets/generated/mini-collector-hurt.png",
        runnerBackIdle: "assets/generated/mini-runner-back-idle.png",
        runnerBackRun: "assets/generated/mini-runner-back-run.png",
        runnerBackLane: "assets/generated/mini-runner-back-lane.png",
        runnerBackHit: "assets/generated/mini-runner-back-hit.png"
      }
    },
    coopStages: [
      {
        id: "stage-1",
        name: "星光草原",
        subtitle: "教学关",
        waves: 3,
        mapTone: "starlight",
        enemyPlan: [
          ["slime", "slime"],
          ["slime", "runner"],
          ["slime", "slime", "runner", "runner"]
        ],
        mechanic: "教学关：小史莱姆负责压线，哥布林快跑者会快速突进。"
      },
      {
        id: "stage-2",
        name: "古树前线",
        subtitle: "快攻压线",
        waves: 4,
        mapTone: "forest",
        enemyPlan: [
          ["runner", "slime"],
          ["runner", "runner", "slime"],
          ["slime", "runner", "runner", "runner"],
          ["runner", "slime", "runner", "slime"]
        ],
        mechanic: "快跑者数量增加，会从不同路快速冲击基地。"
      },
      {
        id: "stage-3",
        name: "机械矿洞",
        subtitle: "重甲防线",
        waves: 4,
        mapTone: "machineMine",
        enemyPlan: [
          ["shield", "slime"],
          ["shield", "bomber", "runner"],
          ["shield", "shield", "frostMage"],
          ["bomber", "shield", "frostMage", "runner"]
        ],
        mechanic: "机械盾兵护甲更高，爆炸虫死亡会伤害附近召唤物。"
      },
      {
        id: "stage-4",
        name: "熔岩工厂",
        subtitle: "爆炸虫群",
        waves: 5,
        mapTone: "lavaFactory",
        enemyPlan: [
          ["bomber", "slime", "runner"],
          ["bomber", "bomber", "shield"],
          ["runner", "bomber", "shield", "slime"],
          ["frostMage", "bomber", "bomber", "shield"],
          ["bomber", "shield", "runner", "bomber", "slime"]
        ],
        mechanic: "爆炸虫密度上升，死亡爆炸会清理前排召唤物。"
      },
      {
        id: "stage-5",
        name: "冰霜遗迹",
        subtitle: "减速压制",
        waves: 5,
        mapTone: "frostRuins",
        enemyPlan: [
          ["eye", "slime", "runner"],
          ["frostMage", "shield", "eye"],
          ["eye", "frostMage", "runner"],
          ["shield", "eye", "frostMage", "bomber"],
          ["frostMage", "frostMage", "eye", "shield", "runner"]
        ],
        mechanic: "冰霜法师会减速召唤物，飞行眼球从远处施压。"
      },
      {
        id: "stage-6",
        name: "浮空回廊",
        subtitle: "空中威胁",
        waves: 5,
        mapTone: "skyCorridor",
        enemyPlan: [
          ["eye", "eye", "runner"],
          ["eye", "frostMage", "slime"],
          ["eye", "eye", "shield"],
          ["frostMage", "eye", "bomber", "runner"],
          ["eye", "eye", "frostMage", "shield", "runner"]
        ],
        mechanic: "飞行眼球增多，远程压力会绕开部分前排阻挡。"
      },
      {
        id: "stage-7",
        name: "虚空祭坛",
        subtitle: "治疗强化",
        waves: 6,
        mapTone: "voidAltar",
        enemyPlan: [
          ["priest", "slime", "runner"],
          ["priest", "shield", "eye"],
          ["priest", "frostMage", "shield"],
          ["bomber", "priest", "eye", "runner"],
          ["shield", "priest", "frostMage", "eye"],
          ["priest", "priest", "shield", "bomber", "eye"]
        ],
        mechanic: "虚空祭司会治疗敌人，必须尽快打断后排支援。"
      },
      {
        id: "stage-8",
        name: "虚空核心",
        subtitle: "Boss 关",
        waves: 4,
        mapTone: "voidCore",
        enemyPlan: [
          ["shield", "frostMage", "priest"],
          ["eye", "bomber", "runner", "shield"],
          ["priest", "eye", "shield", "frostMage"],
          ["chaosCore"]
        ],
        bossStage: true,
        mechanic: "Boss 会蓄力脉冲，半血后召唤护卫并提高攻击节奏。"
      }
    ],
    infinite: {
      name: "熔岩工厂",
      mapTone: "lava",
      eliteEvery: 4,
      bossEvery: 8
    },
    units: {
      slimeMech: {
        name: "史莱姆机兵",
        role: "近战坦克",
        condition: "基础召唤能量满",
        hp: 76,
        speed: 42,
        range: 32,
        damage: 10,
        attackRate: 0.72,
        radius: 17,
        behavior: "melee",
        color: "#62f4b5",
        sprite: "assets/generated/unit-slime-mech.png"
      },
      catGunner: {
        name: "魔法猫炮手",
        role: "远程输出",
        condition: "连击 3 以上召唤倾向出现",
        hp: 42,
        speed: 28,
        range: 178,
        damage: 9,
        attackRate: 0.88,
        radius: 14,
        behavior: "ranged",
        color: "#7db6ff",
        sprite: "assets/generated/unit-cat-gunner.png"
      },
      thunderDragon: {
        name: "雷电小龙",
        role: "连锁伤害",
        condition: "连击 5 或特殊进度较高",
        hp: 48,
        speed: 52,
        range: 136,
        damage: 9,
        attackRate: 1.04,
        radius: 15,
        behavior: "chain",
        color: "#ffe06a",
        sprite: "assets/generated/unit-thunder-dragon.png"
      },
      healDrone: {
        name: "治疗无人机",
        role: "治疗友方",
        condition: "特殊进度 70 以上",
        hp: 38,
        speed: 36,
        range: 150,
        damage: -13,
        attackRate: 1.15,
        radius: 13,
        behavior: "heal",
        color: "#b8ffef",
        sprite: "assets/generated/unit-heal-drone.png"
      },
      flameKnight: {
        name: "火焰骑士",
        role: "范围伤害",
        condition: "高连击或跑酷收益触发",
        hp: 66,
        speed: 48,
        range: 54,
        damage: 12,
        attackRate: 0.92,
        radius: 16,
        behavior: "aoe",
        color: "#ff9a5c",
        sprite: "assets/generated/unit-flame-knight.png"
      },
      starGolem: {
        name: "星核巨像",
        role: "双人协作高阶召唤",
        condition: "两名玩家 8 秒内特殊进度都满",
        hp: 210,
        speed: 24,
        range: 80,
        damage: 24,
        attackRate: 1.28,
        radius: 27,
        behavior: "golem",
        color: "#f4f7ff",
        sprite: "assets/generated/unit-star-golem.png"
      }
    },
    enemies: {
      slime: {
        name: "小史莱姆",
        role: "基础近战",
        hp: 38,
        speed: 31,
        range: 25,
        damage: 6,
        attackRate: 0.78,
        reward: 9,
        radius: 15,
        behavior: "basic",
        color: "#ff8585",
        sprite: "assets/generated/enemy-slime.png"
      },
      runner: {
        name: "哥布林快跑者",
        role: "高速突袭",
        hp: 30,
        speed: 50,
        range: 22,
        damage: 5,
        attackRate: 0.58,
        reward: 10,
        radius: 13,
        behavior: "runner",
        color: "#a8ff74",
        sprite: "assets/generated/enemy-runner.png"
      },
      shield: {
        name: "机械盾兵",
        role: "高防御",
        hp: 86,
        speed: 20,
        range: 28,
        damage: 9,
        attackRate: 1.08,
        reward: 18,
        radius: 18,
        armor: 0.32,
        behavior: "shield",
        color: "#ffca67",
        sprite: "assets/generated/enemy-shield.png"
      },
      bomber: {
        name: "爆炸虫",
        role: "死亡爆炸",
        hp: 26,
        speed: 35,
        range: 18,
        damage: 11,
        attackRate: 1.2,
        reward: 13,
        radius: 13,
        explode: 30,
        behavior: "bomber",
        color: "#ff6f6f",
        sprite: "assets/generated/enemy-bomber.png"
      },
      frostMage: {
        name: "冰霜法师",
        role: "减速控制",
        hp: 52,
        speed: 22,
        range: 150,
        damage: 7,
        attackRate: 1.5,
        reward: 18,
        radius: 14,
        slow: 0.42,
        behavior: "frost",
        color: "#9fd6ff",
        sprite: "assets/generated/enemy-frost-mage.png"
      },
      eye: {
        name: "飞行眼球",
        role: "远程飞行",
        hp: 44,
        speed: 38,
        range: 132,
        damage: 8,
        attackRate: 1.0,
        reward: 16,
        radius: 14,
        flying: true,
        behavior: "eye",
        color: "#d39bff",
        sprite: "assets/generated/enemy-eye.png"
      },
      priest: {
        name: "虚空祭司",
        role: "敌方治疗",
        hp: 62,
        speed: 18,
        range: 142,
        damage: 5,
        attackRate: 1.7,
        reward: 22,
        radius: 15,
        heal: 13,
        behavior: "priest",
        color: "#bf8cff",
        sprite: "assets/generated/enemy-priest.png"
      },
      chaosCore: {
        name: "Boss：混沌核心",
        role: "阶段 Boss",
        hp: 520,
        speed: 13,
        range: 92,
        damage: 18,
        attackRate: 1.45,
        reward: 120,
        radius: 38,
        boss: true,
        behavior: "chaos",
        color: "#ff5fb7",
        sprite: "assets/generated/enemy-boss-chaos-core.png"
      }
    },
    skillPool: {
      thunder: {
        id: "thunder",
        name: "雷霆轰击",
        icon: "assets/generated/skill-thunder-art.png",
        desc: "对敌方密集区域造成范围雷电伤害。",
        cost: 36,
        cooldown: 8,
        type: "thunder"
      },
      shield: {
        id: "shield",
        name: "能量护盾",
        icon: "assets/generated/skill-shield-art.png",
        desc: "为己方核心、基地或友方阵线提供短时护盾。",
        cost: 30,
        cooldown: 12,
        type: "shield"
      },
      slow: {
        id: "slow",
        name: "时间减速",
        icon: "assets/generated/skill-slow-art.png",
        desc: "短时间减速所有敌对单位，给召唤物争取输出时间。",
        cost: 34,
        cooldown: 10,
        type: "slow"
      },
      airdrop: {
        id: "airdrop",
        name: "机械空投",
        icon: "assets/generated/skill-airdrop-art.png",
        desc: "立刻空投一组临时机械兵压线推进。",
        cost: 42,
        cooldown: 14,
        type: "airdrop"
      }
    },
    defaultSkills: {
      coop: {
        p1: ["thunder", "shield"],
        p2: ["slow", "airdrop"]
      },
      pk: {
        p1: ["thunder", "shield"],
        p2: ["slow", "airdrop"]
      }
    }
  };

  SG.Utils = {
    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    },

    lerp(a, b, t) {
      return a + (b - a) * t;
    },

    rand(min, max) {
      return min + Math.random() * (max - min);
    },

    choose(list) {
      return list[Math.floor(Math.random() * list.length)];
    },

    weightedChoose(list) {
      const total = list.reduce((sum, item) => sum + (item.weight || 1), 0);
      let roll = Math.random() * total;
      for (const item of list) {
        roll -= item.weight || 1;
        if (roll <= 0) return item.id;
      }
      return list[0].id;
    },

    now() {
      return performance.now() / 1000;
    },

    image(src) {
      if (!src) return null;
      SG.imageCache = SG.imageCache || new Map();
      if (!SG.imageCache.has(src)) {
        const img = new Image();
        img.src = src;
        SG.imageCache.set(src, img);
      }
      const img = SG.imageCache.get(src);
      return img.complete && img.naturalWidth > 0 ? img : null;
    },

    coverImage(ctx, img, x, y, w, h) {
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const sw = w / scale;
      const sh = h / scale;
      const sx = (img.naturalWidth - sw) / 2;
      const sy = (img.naturalHeight - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    },

    resizeCanvas(canvas) {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(rect.width * ratio));
      const height = Math.max(1, Math.floor(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      return { ctx, width: rect.width, height: rect.height, ratio };
    },

    circleHit(a, b, range) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return dx * dx + dy * dy <= range * range;
    },

    drawDiamond(ctx, x, y, size, fill, stroke) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-size / 2, -size / 2, size, size, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },

    drawHealthBar(ctx, x, y, w, pct, color) {
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
      ctx.fillRect(x - w / 2, y, w, 5);
      ctx.fillStyle = color;
      ctx.fillRect(x - w / 2, y, w * SG.Utils.clamp(pct, 0, 1), 5);
      ctx.restore();
    }
  };
})();
