(() => {
  const FIGHTERS = window.SF_FIGHTERS;
  const FIGHTER_MAP = Object.fromEntries(FIGHTERS.map((f) => [f.id, f]));

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = 448;
  const GRAVITY = 0.72;

  // === 預載角色頭像 ===
  const portraits = {};
  FIGHTERS.forEach((f) => {
    const img = new Image();
    img.src = f.img;
    portraits[f.id] = img;
  });

  // === 街機音效 (Web Audio API) ===
  const SFX = {
    enabled: true,
    ctx: null,
    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
    },
    play(kind) {
      if (!this.enabled) return;
      try {
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        if (kind === 'hit') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(190, now);
          osc.frequency.exponentialRampToValueAtTime(55, now + 0.11);
          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
          osc.start(now);
          osc.stop(now + 0.13);
        } else if (kind === 'heavy') {
          osc.type = 'square';
          osc.frequency.setValueAtTime(140, now);
          osc.frequency.exponentialRampToValueAtTime(38, now + 0.18);
          gain.gain.setValueAtTime(0.24, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.start(now);
          osc.stop(now + 0.2);
        } else if (kind === 'block') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(620, now);
          osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.start(now);
          osc.stop(now + 0.09);
        } else if (kind === 'wave') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(340, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.16);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          osc.start(now);
          osc.stop(now + 0.18);
        } else if (kind === 'super') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(980, now + 0.3);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
          osc.start(now);
          osc.stop(now + 0.34);
        } else if (kind === 'ko') {
          osc.type = 'square';
          osc.frequency.setValueAtTime(260, now);
          osc.frequency.exponentialRampToValueAtTime(42, now + 0.55);
          gain.gain.setValueAtTime(0.26, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
          osc.start(now);
          osc.stop(now + 0.6);
        }
      } catch (_) {}
    }
  };

  // === 選角狀態 ===
  let gameMode = 'cpu'; // 'cpu' | 'pvp'
  let p1Id = 'gintoki';
  let p2Id = 'hijikata';
  let pickTurn = 1; // 1 = picking p1, 2 = picking p2
  let selectedStage = 'kabukicho';

  // === 對戰狀態 ===
  const keys = {};
  let match = null;
  let rafId = null;

  function createFighterState(fighterId, x, facing, isP1) {
    const def = FIGHTER_MAP[fighterId];
    return {
      def,
      isP1,
      x,
      y: GROUND_Y,
      vx: 0,
      vy: 0,
      facing, // 1 = right, -1 = left
      hp: 100,
      trailHp: 100,
      superMeter: 0,
      state: 'idle', // 'idle','walk','jump','crouch','attack','hurt','ko'
      stateTimer: 0,
      attackType: null, // 'light','heavy','special','super'
      attackFrame: 0,
      attackDuration: 0,
      hitDealt: false,
      crouching: false,
      blocking: false,
      comboCount: 0,
      comboTimer: 0,
      animTick: 0,
      aiCooldown: 0
    };
  }

  function startMatch() {
    match = {
      round: 1,
      p1Wins: 0,
      p2Wins: 0,
      timer: 99,
      timerTick: 0,
      phase: 'intro', // 'intro','fight','roundEnd','matchOver'
      phaseTimer: 95,
      bannerText: 'ROUND 1',
      bannerSub: 'READY...',
      hitstop: 0,
      shake: 0,
      superFlash: 0,
      superCallout: '',
      projectiles: [],
      particles: [],
      floatingTexts: [],
      p1: createFighterState(p1Id, 260, 1, true),
      p2: createFighterState(p2Id, W - 260, -1, false)
    };

    document.getElementById('select-screen').classList.remove('active');
    document.getElementById('battle-screen').classList.add('active');
    document.getElementById('btn-back-select').classList.remove('hidden');
    document.getElementById('ko-modal').classList.add('hidden');
    document.getElementById('p2-ctrl-hint').style.opacity = gameMode === 'pvp' ? '1' : '0.45';

    if (rafId) cancelAnimationFrame(rafId);
    loop();
  }

  function resetRound() {
    match.round += 1;
    match.timer = 99;
    match.timerTick = 0;
    match.phase = 'intro';
    match.phaseTimer = 95;
    match.bannerText = `ROUND ${match.round}`;
    match.bannerSub = 'READY...';
    match.projectiles = [];
    match.particles = [];
    match.floatingTexts = [];
    const p1Super = match.p1.superMeter;
    const p2Super = match.p2.superMeter;
    match.p1 = createFighterState(p1Id, 260, 1, true);
    match.p2 = createFighterState(p2Id, W - 260, -1, false);
    match.p1.superMeter = p1Super;
    match.p2.superMeter = p2Super;
  }

  // === 粒子與浮動文字 ===
  function spawnSparks(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 6;
      match.particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 1.5,
        life: 16 + Math.random() * 14,
        maxLife: 30,
        size: 3 + Math.random() * 4,
        color
      });
    }
  }

  function spawnText(x, y, text, color = '#fbbf24') {
    match.floatingTexts.push({ x, y, text, color, life: 42 });
  }

  // === 招式發動 ===
  function startAttack(f, opp, type) {
    if (f.state === 'hurt' || f.state === 'ko') return;
    if (f.state === 'attack') {
      // 允許輕攻取消接重攻或必殺技 (Cancel Combo)
      const canCancel = f.attackType === 'light' && f.hitDealt && (type === 'heavy' || type === 'special' || type === 'super');
      if (!canCancel) return;
    }
    if (type === 'super' && f.superMeter < 100) return;

    f.state = 'attack';
    f.attackType = type;
    f.attackFrame = 0;
    f.hitDealt = false;
    f.crouching = false;

    if (type === 'light') {
      f.attackDuration = 16;
      SFX.play('hit');
    } else if (type === 'heavy') {
      f.attackDuration = 26;
      f.vx = f.facing * 2.5;
      SFX.play('heavy');
    } else if (type === 'special') {
      f.attackDuration = 30;
      SFX.play('wave');
      spawnText(f.x, f.y - 125, f.def.specialName, f.def.projColor);

      if (f.def.specialType === 'wave') {
        match.projectiles.push({
          owner: f,
          x: f.x + f.facing * 45,
          y: f.y - 58,
          vx: f.facing * 9.5,
          vy: 0,
          radius: 18,
          dmg: Math.round(11 * f.def.power),
          color: f.def.projColor,
          kind: 'wave',
          life: 95
        });
      } else if (f.def.specialType === 'bazooka') {
        match.projectiles.push({
          owner: f,
          x: f.x + f.facing * 40,
          y: f.y - 68,
          vx: f.facing * 8.2,
          vy: -4.2,
          gravity: 0.22,
          radius: 16,
          dmg: Math.round(13 * f.def.power),
          color: '#fb923c',
          kind: 'rocket',
          life: 110
        });
      } else if (f.def.specialType === 'elizabeth') {
        match.projectiles.push({
          owner: f,
          x: f.x + f.facing * 42,
          y: GROUND_Y - 38,
          vx: f.facing * 7.0,
          vy: 0,
          radius: 26,
          dmg: Math.round(12 * f.def.power),
          color: '#f8fafc',
          kind: 'elizabeth',
          life: 115
        });
      } else if (f.def.specialType === 'dash') {
        f.vx = f.facing * 12;
      }
    } else if (type === 'super') {
      f.superMeter = 0;
      f.attackDuration = 42;
      match.superFlash = 24;
      match.superCallout = `${f.def.name}：${f.def.superName}`;
      SFX.play('super');
      spawnSparks(f.x, f.y - 55, '#fbbf24', 24);

      if (f.def.id === 'okita' || f.def.id === 'katsura' || f.def.id === 'kagura') {
        // 多發連射 / Justaway 齊射
        for (let i = 0; i < 4; i++) {
          match.projectiles.push({
            owner: f,
            x: f.x + f.facing * (35 + i * 18),
            y: f.y - 45 - (i % 2) * 28,
            vx: f.facing * (8.5 + i * 0.9),
            vy: f.def.id === 'okita' ? -2.2 - i * 0.5 : 0,
            gravity: f.def.id === 'okita' ? 0.14 : 0,
            radius: 16,
            dmg: 8,
            color: f.def.projColor,
            kind: f.def.id === 'katsura' ? 'justaway' : 'wave',
            life: 110
          });
        }
      } else if (f.def.id === 'hijikata' || f.def.id === 'takasugi') {
        // 巨大能量砲 / 全域紫電波
        match.projectiles.push({
          owner: f,
          x: f.x + f.facing * 50,
          y: f.y - 62,
          vx: f.facing * 10.5,
          vy: 0,
          radius: 34,
          dmg: 26,
          color: f.def.projColor,
          kind: 'superwave',
          life: 110
        });
      } else {
        // 銀時：白夜叉高速亂舞突進
        f.vx = f.facing * 15;
      }
    }
  }

  function applyDamage(attacker, defender, dmg, knockX, knockY, isProjectile = false) {
    if (defender.state === 'ko' || match.phase !== 'fight') return;

    // 判斷是否防禦成功
    const isBlocked = defender.blocking && defender.y >= GROUND_Y - 2;
    if (isBlocked) {
      const chipDmg = Math.max(1, Math.floor(dmg * 0.2));
      defender.hp = Math.max(0, defender.hp - chipDmg);
      defender.vx = knockX * 0.45;
      attacker.superMeter = Math.min(100, attacker.superMeter + 5);
      defender.superMeter = Math.min(100, defender.superMeter + 8);
      SFX.play('block');
      spawnSparks(defender.x, defender.y - 55, '#38bdf8', 10);
      spawnText(defender.x, defender.y - 105, 'GUARD!', '#38bdf8');
      match.hitstop = 4;
    } else {
      defender.hp = Math.max(0, defender.hp - dmg);
      defender.state = 'hurt';
      defender.stateTimer = 16;
      defender.vx = knockX;
      if (knockY < 0) defender.vy = knockY;

      attacker.comboCount += 1;
      attacker.comboTimer = 75;
      attacker.superMeter = Math.min(100, attacker.superMeter + 12);
      defender.superMeter = Math.min(100, defender.superMeter + 9);

      match.hitstop = dmg >= 14 ? 7 : 4;
      match.shake = dmg >= 14 ? 10 : 5;
      SFX.play(dmg >= 12 ? 'heavy' : 'hit');
      spawnSparks(defender.x, defender.y - 58, dmg >= 14 ? '#fbbf24' : '#ef4444', dmg >= 14 ? 18 : 10);
      spawnText(defender.x, defender.y - 110, `-${dmg}`, '#ef4444');
    }

    if (defender.hp <= 0) {
      defender.hp = 0;
      defender.state = 'ko';
      defender.vy = -8;
      defender.vx = -defender.facing * 6;
      match.phase = 'roundEnd';
      match.phaseTimer = 110;
      match.bannerText = 'K.O.!';
      match.bannerSub = `${attacker.def.name} 獲勝！`;
      match.shake = 16;
      SFX.play('ko');
      if (attacker.isP1) match.p1Wins += 1;
      else match.p2Wins += 1;
    }
  }

  // === 玩家與 AI 輸入控制 ===
  function handleFighterInput(f, opp, controls) {
    if (f.state === 'hurt' || f.state === 'ko' || f.state === 'attack') return;

    const left = keys[controls.left] || (controls.altLeft && keys[controls.altLeft]);
    const right = keys[controls.right] || (controls.altRight && keys[controls.altRight]);
    const up = keys[controls.up] || (controls.altUp && keys[controls.altUp]);
    const down = keys[controls.down] || (controls.altDown && keys[controls.altDown]);

    f.crouching = !!down && f.y >= GROUND_Y - 1;
    const holdingBack = (f.facing === 1 && left) || (f.facing === -1 && right);
    f.blocking = holdingBack || f.crouching;

    if (f.crouching) {
      f.vx = 0;
      f.state = 'crouch';
    } else if (left && !right) {
      f.vx = -f.def.speed;
      if (f.y >= GROUND_Y - 1) f.state = 'walk';
    } else if (right && !left) {
      f.vx = f.def.speed;
      if (f.y >= GROUND_Y - 1) f.state = 'walk';
    } else {
      f.vx *= 0.65;
      if (f.y >= GROUND_Y - 1) f.state = 'idle';
    }

    if (up && f.y >= GROUND_Y - 1) {
      f.vy = -14.2;
      f.state = 'jump';
    }

    if (keys[controls.light]) startAttack(f, opp, 'light');
    else if (keys[controls.heavy]) startAttack(f, opp, 'heavy');
    else if (keys[controls.special]) startAttack(f, opp, 'special');
    else if (keys[controls.super]) startAttack(f, opp, 'super');
  }

  function handleCpuAi(cpu, player) {
    if (cpu.state === 'hurt' || cpu.state === 'ko' || cpu.state === 'attack') return;
    if (cpu.aiCooldown > 0) cpu.aiCooldown -= 1;

    const dist = Math.abs(cpu.x - player.x);
    cpu.blocking = false;
    cpu.crouching = false;

    // 對手攻擊時有機會防禦
    if (player.state === 'attack' && dist < 130 && Math.random() < 0.48) {
      cpu.blocking = true;
      cpu.vx = -cpu.facing * (cpu.def.speed * 0.6);
      cpu.state = 'walk';
      return;
    }

    if (dist > 110) {
      // 遠距離：前進或放必殺波
      if (cpu.aiCooldown === 0 && Math.random() < 0.045) {
        startAttack(cpu, player, cpu.superMeter >= 100 && Math.random() < 0.5 ? 'super' : 'special');
        cpu.aiCooldown = 38;
      } else {
        cpu.vx = cpu.facing * cpu.def.speed * 0.85;
        if (cpu.y >= GROUND_Y - 1) cpu.state = 'walk';
      }
    } else {
      // 近距離：連段或防禦
      cpu.vx *= 0.6;
      if (cpu.y >= GROUND_Y - 1) cpu.state = 'idle';
      if (cpu.aiCooldown === 0) {
        const roll = Math.random();
        if (cpu.superMeter >= 100 && roll < 0.35) {
          startAttack(cpu, player, 'super');
          cpu.aiCooldown = 35;
        } else if (roll < 0.5) {
          startAttack(cpu, player, 'light');
          cpu.aiCooldown = 18;
        } else if (roll < 0.8) {
          startAttack(cpu, player, 'heavy');
          cpu.aiCooldown = 28;
        } else {
          startAttack(cpu, player, 'special');
          cpu.aiCooldown = 40;
        }
      }
    }
  }

  // === 主物理更新 ===
  function updateFighter(f, opp) {
    f.animTick += 1;
    if (f.trailHp > f.hp) f.trailHp = Math.max(f.hp, f.trailHp - 0.65);
    if (f.comboTimer > 0) {
      f.comboTimer -= 1;
      if (f.comboTimer === 0) f.comboCount = 0;
    }

    if (f.state !== 'attack' && f.state !== 'hurt' && f.state !== 'ko') {
      f.facing = opp.x >= f.x ? 1 : -1;
    }

    if (f.state === 'hurt') {
      f.stateTimer -= 1;
      f.vx *= 0.85;
      if (f.stateTimer <= 0 && f.y >= GROUND_Y - 1) f.state = 'idle';
    } else if (f.state === 'attack') {
      f.attackFrame += 1;
      f.vx *= 0.88;

      // 近戰命中判定窗口
      const activeStart = f.attackType === 'light' ? 4 : 7;
      const activeEnd = f.attackType === 'light' ? 10 : 18;
      const isMelee = f.attackType === 'light' || f.attackType === 'heavy' ||
        (f.attackType === 'special' && f.def.specialType === 'dash') ||
        (f.attackType === 'super' && f.def.id === 'gintoki');

      if (isMelee && !f.hitDealt && f.attackFrame >= activeStart && f.attackFrame <= activeEnd) {
        const reach = f.attackType === 'light' ? 88 : (f.attackType === 'super' ? 120 : 105);
        const dx = (opp.x - f.x) * f.facing;
        const dy = Math.abs(opp.y - f.y);
        if (dx >= -15 && dx <= reach && dy < 75) {
          f.hitDealt = true;
          let dmg = 7;
          if (f.attackType === 'heavy') dmg = 13;
          else if (f.attackType === 'special') dmg = 15;
          else if (f.attackType === 'super') dmg = 26;
          dmg = Math.round(dmg * f.def.power);
          const knockX = f.facing * (f.attackType === 'light' ? 4 : 8.5);
          const knockY = f.attackType === 'heavy' || f.attackType === 'super' ? -5.5 : 0;
          applyDamage(f, opp, dmg, knockX, knockY);
        }
      }

      if (f.attackFrame >= f.attackDuration) {
        f.state = f.y < GROUND_Y - 1 ? 'jump' : 'idle';
      }
    }

    // 重力與移動
    f.x += f.vx;
    f.y += f.vy;
    if (f.y < GROUND_Y) {
      f.vy += GRAVITY;
    } else {
      f.y = GROUND_Y;
      f.vy = 0;
      if (f.state === 'jump') f.state = 'idle';
    }

    f.x = Math.max(55, Math.min(W - 55, f.x));
  }

  function update() {
    if (!match) return;
    if (match.superFlash > 0) match.superFlash -= 1;
    if (match.shake > 0) match.shake *= 0.82;
    if (match.shake < 0.4) match.shake = 0;

    if (match.hitstop > 0) {
      match.hitstop -= 1;
      return;
    }

    // 階段控制
    if (match.phase === 'intro') {
      match.phaseTimer -= 1;
      if (match.phaseTimer === 40) match.bannerSub = 'FIGHT!!';
      if (match.phaseTimer <= 0) {
        match.phase = 'fight';
        match.bannerText = '';
      }
    } else if (match.phase === 'fight') {
      match.timerTick += 1;
      if (match.timerTick >= 60) {
        match.timerTick = 0;
        match.timer = Math.max(0, match.timer - 1);
        if (match.timer === 0) {
          // 時間到，血多者勝
          const p1Win = match.p1.hp >= match.p2.hp;
          if (p1Win) match.p1Wins += 1;
          else match.p2Wins += 1;
          match.phase = 'roundEnd';
          match.phaseTimer = 100;
          match.bannerText = 'TIME OVER';
          match.bannerSub = `${p1Win ? match.p1.def.name : match.p2.def.name} 判定勝利！`;
        }
      }

      const p1Ctrl = gameMode === 'cpu'
        ? { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', altLeft: 'ArrowLeft', altRight: 'ArrowRight', altUp: 'ArrowUp', altDown: 'ArrowDown', light: 'KeyJ', heavy: 'KeyK', special: 'KeyL', super: 'KeyU' }
        : { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', light: 'KeyJ', heavy: 'KeyK', special: 'KeyL', super: 'KeyU' };

      handleFighterInput(match.p1, match.p2, p1Ctrl);

      if (gameMode === 'cpu') {
        handleCpuAi(match.p2, match.p1);
      } else {
        const p2Ctrl = {
          left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
          light: 'Numpad1', heavy: 'Numpad2', special: 'Numpad3', super: 'Numpad4',
          // 筆電沒有小鍵盤時也支援 , . / ;
        };
        if (keys['Comma']) keys['Numpad1'] = true;
        if (keys['Period']) keys['Numpad2'] = true;
        if (keys['Slash']) keys['Numpad3'] = true;
        if (keys['Semicolon']) keys['Numpad4'] = true;
        handleFighterInput(match.p2, match.p1, p2Ctrl);
      }
    } else if (match.phase === 'roundEnd') {
      match.phaseTimer -= 1;
      if (match.phaseTimer <= 0) {
        if (match.p1Wins >= 2 || match.p2Wins >= 2) {
          match.phase = 'matchOver';
          showKoModal(match.p1Wins >= 2 ? match.p1 : match.p2);
        } else {
          resetRound();
        }
      }
    }

    updateFighter(match.p1, match.p2);
    updateFighter(match.p2, match.p1);

    // 雙方推擠防重疊
    const minSep = 54;
    const dx = match.p2.x - match.p1.x;
    if (Math.abs(dx) < minSep && Math.abs(match.p1.y - match.p2.y) < 70) {
      const push = (minSep - Math.abs(dx)) / 2;
      if (dx >= 0) {
        match.p1.x -= push;
        match.p2.x += push;
      } else {
        match.p1.x += push;
        match.p2.x -= push;
      }
    }

    // 飛行道具更新
    for (let i = match.projectiles.length - 1; i >= 0; i--) {
      const p = match.projectiles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.gravity) p.vy += p.gravity;
      p.life -= 1;

      const target = p.owner === match.p1 ? match.p2 : match.p1;
      if (Math.abs(p.x - target.x) < p.radius + 24 && Math.abs(p.y - (target.y - 52)) < p.radius + 42) {
        applyDamage(p.owner, target, p.dmg, Math.sign(p.vx) * 6, -3, true);
        match.projectiles.splice(i, 1);
        continue;
      }
      if (p.life <= 0 || p.x < -50 || p.x > W + 50 || p.y > GROUND_Y + 10) {
        spawnSparks(p.x, Math.min(p.y, GROUND_Y), p.color, 6);
        match.projectiles.splice(i, 1);
      }
    }

    // 粒子與文字
    for (let i = match.particles.length - 1; i >= 0; i--) {
      const pt = match.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vy += 0.18;
      pt.life -= 1;
      if (pt.life <= 0) match.particles.splice(i, 1);
    }
    for (let i = match.floatingTexts.length - 1; i >= 0; i--) {
      const ft = match.floatingTexts[i];
      ft.y -= 1.1;
      ft.life -= 1;
      if (ft.life <= 0) match.floatingTexts.splice(i, 1);
    }
  }

  // === 舞台與角色繪製 ===
  function drawStage() {
    if (selectedStage === 'kabukicho') {
      const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      grad.addColorStop(0, '#090d1f');
      grad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, GROUND_Y);

      // 建築與霓虹看板
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(60, 140, 180, 308);
      ctx.fillRect(320, 110, 210, 338);
      ctx.fillRect(620, 130, 190, 318);
      ctx.fillRect(880, 150, 180, 298);

      // 萬事屋 / 登勢酒館霓虹牌
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.fillRect(355, 165, 140, 52);
      ctx.strokeRect(355, 165, 140, 52);
      ctx.fillStyle = '#e0f2fe';
      ctx.font = 'bold 20px "Noto Sans TC"';
      ctx.textAlign = 'center';
      ctx.fillText('万事屋銀ちゃん', 425, 198);

      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.strokeStyle = '#ef4444';
      ctx.fillRect(655, 185, 120, 46);
      ctx.strokeRect(655, 185, 120, 46);
      ctx.fillStyle = '#fecaca';
      ctx.font = 'bold 18px "Noto Sans TC"';
      ctx.fillText('スナックお登勢', 715, 214);

      // 地板
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(W, GROUND_Y);
      ctx.stroke();
    } else if (selectedStage === 'dojo') {
      const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      grad.addColorStop(0, '#451a03');
      grad.addColorStop(1, '#78350f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, GROUND_Y);

      // 和室拉門
      for (let x = 80; x < W - 80; x += 140) {
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(x, 115, 120, 333);
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, 115, 120, 333);
      }
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(W / 2 - 70, 95, 140, 52);
      ctx.strokeStyle = '#fbbf24';
      ctx.strokeRect(W / 2 - 70, 95, 140, 52);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 24px "Noto Sans TC"';
      ctx.textAlign = 'center';
      ctx.fillText('恆 道 館', W / 2, 130);

      ctx.fillStyle = '#92400e';
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      grad.addColorStop(0, '#020617');
      grad.addColorStop(1, '#312e81');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, GROUND_Y);

      // 滿月
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(W / 2, 170, 72, 0, Math.PI * 2);
      ctx.fill();

      // 天守閣屋頂剪影
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(220, GROUND_Y);
      ctx.lineTo(350, 230);
      ctx.lineTo(770, 230);
      ctx.lineTo(900, GROUND_Y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    }
  }

  function drawFighter(f) {
    ctx.save();
    ctx.translate(f.x, f.y);

    // 地面陰影
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 30, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (f.state === 'ko') {
      ctx.rotate(-f.facing * Math.PI / 2);
      ctx.translate(0, -18);
    } else {
      ctx.scale(f.facing, 1);
    }

    const crouchOffset = f.crouching ? 22 : 0;
    const bob = f.state === 'idle' ? Math.sin(f.animTick * 0.12) * 2.5 : (f.state === 'walk' ? Math.abs(Math.sin(f.animTick * 0.25)) * 4 : 0);
    const bodyY = -74 + crouchOffset + bob;

    // 受傷閃白
    if (f.state === 'hurt' && f.animTick % 4 < 2) {
      ctx.globalAlpha = 0.65;
    }

    // 雙腳
    const walkSwing = f.state === 'walk' ? Math.sin(f.animTick * 0.25) * 14 : 0;
    ctx.fillStyle = f.def.pantsColor;
    ctx.fillRect(-14 + walkSwing, -32 + crouchOffset * 0.4, 11, 32 - crouchOffset * 0.4);
    ctx.fillRect(3 - walkSwing, -32 + crouchOffset * 0.4, 11, 32 - crouchOffset * 0.4);

    // 身體和服／制服
    ctx.fillStyle = f.def.bodyColor;
    ctx.beginPath();
    ctx.roundRect(-20, bodyY, 40, 46 - crouchOffset * 0.3, 8);
    ctx.fill();

    // 角色特徵花紋 / 腰帶
    ctx.fillStyle = f.def.accentColor;
    ctx.fillRect(-20, bodyY + 26, 40, 7);
    if (f.def.id === 'gintoki') {
      // 銀時左邊垂袖
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-22, bodyY + 4, 10, 22);
    } else if (f.def.id === 'hijikata' || f.def.id === 'okita') {
      // 真選組金色滾邊
      ctx.fillStyle = '#eab308';
      ctx.fillRect(-6, bodyY, 12, 38);
    }

    // 頭部
    const headY = bodyY - 22;
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(0, headY, 19, 0, Math.PI * 2);
    ctx.fill();

    // 髮型與原作頭飾
    ctx.fillStyle = f.def.hairColor;
    if (f.def.hairType === 'perm_silver') {
      // 銀時天然捲
      ctx.beginPath();
      ctx.arc(0, headY - 6, 21, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-13, headY - 4, 9, 0, Math.PI * 2);
      ctx.arc(11, headY - 9, 8, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.def.hairType === 'buns_orange') {
      // 神樂雙丸子頭
      ctx.beginPath();
      ctx.arc(0, headY - 5, 20, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(-16, headY - 14, 8, 0, Math.PI * 2);
      ctx.arc(16, headY - 14, 8, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.def.hairType === 'v_dark') {
      // 土方 V 字瀏海
      ctx.beginPath();
      ctx.arc(0, headY - 6, 20, Math.PI, 0);
      ctx.lineTo(0, headY + 3);
      ctx.closePath();
      ctx.fill();
    } else if (f.def.hairType === 'blonde_mask') {
      // 沖田金髮 + 紅眼罩掛額頭
      ctx.beginPath();
      ctx.arc(0, headY - 6, 20, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-16, headY - 15, 32, 8);
    } else if (f.def.hairType === 'long_black') {
      // 桂長直髮
      ctx.fillRect(-20, headY - 10, 11, 46);
      ctx.beginPath();
      ctx.arc(0, headY - 6, 20, Math.PI, 0);
      ctx.fill();
    } else if (f.def.hairType === 'bandage_purple') {
      // 高杉紫髮 + 繃帶
      ctx.beginPath();
      ctx.arc(0, headY - 6, 20, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-4, headY - 7, 20, 7);
    }

    // 眼睛
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(6, headY - 3, 5, 4);

    // 武器與攻擊動作
    const isAtk = f.state === 'attack';
    const swingAngle = isAtk ? (f.attackFrame / f.attackDuration) * 1.8 - 0.6 : -0.3;
    ctx.save();
    ctx.translate(14, bodyY + 18);
    ctx.rotate(swingAngle);

    if (f.def.weapon === 'bokuto') {
      ctx.fillStyle = '#d97706';
      ctx.fillRect(0, -4, 52, 6);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-10, -4, 14, 6);
    } else if (f.def.weapon === 'umbrella') {
      ctx.fillStyle = '#7e22ce';
      ctx.fillRect(0, -4, 48, 7);
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(48, -14);
      ctx.lineTo(58, 0);
      ctx.lineTo(48, 14);
      ctx.closePath();
      ctx.fill();
    } else if (f.def.weapon === 'katana' || f.def.weapon === 'katana_purple') {
      ctx.fillStyle = f.def.weapon === 'katana_purple' ? '#c084fc' : '#e2e8f0';
      ctx.fillRect(0, -3, 56, 4);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(0, -7, 4, 12);
    } else if (f.def.weapon === 'bazooka') {
      ctx.fillStyle = '#334155';
      ctx.fillRect(-14, -7, 54, 13);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(34, -8, 8, 15);
    } else if (f.def.weapon === 'elizabeth') {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, -3, 44, 5);
    }

    // 斬擊光弧特效
    if (isAtk && (f.attackType === 'light' || f.attackType === 'heavy' || f.attackType === 'super')) {
      ctx.strokeStyle = f.def.projColor;
      ctx.lineWidth = f.attackType === 'light' ? 3 : 6;
      ctx.beginPath();
      ctx.arc(10, 0, 52, -0.7, 0.7);
      ctx.stroke();
    }
    ctx.restore();

    // 防禦護罩
    if (f.blocking) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(16, bodyY + 20, 38, -1.1, 1.1);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawProjectiles() {
    match.projectiles.forEach((p) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.kind === 'elizabeth') {
        // 可愛的伊莉莎白衝撞
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.roundRect(-22, -30, 44, 56, 20);
        ctx.fill();
        ctx.fillStyle = '#fb923c';
        ctx.fillRect(6, -12, 16, 7);
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(8, -18, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'justaway') {
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(-10, -16, 20, 32);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, -16, 10, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-5, -6, 3, 3);
        ctx.fillRect(2, -6, 3, 3);
      } else {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, p.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawHud() {
    // 1P & 2P 頭像與血條
    const barW = 390;
    const barH = 26;
    const barY = 22;

    // 1P 頭像
    const p1Img = portraits[match.p1.def.id];
    if (p1Img && p1Img.complete) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(42, 40, 26, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(p1Img, 16, 14, 52, 52);
      ctx.restore();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(42, 40, 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2P 頭像
    const p2Img = portraits[match.p2.def.id];
    if (p2Img && p2Img.complete) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(W - 42, 40, 26, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(p2Img, W - 68, 14, 52, 52);
      ctx.restore();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(W - 42, 40, 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 1P 血條（右往左扣）
    const p1X = 78;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(p1X, barY, barW, barH);
    ctx.fillStyle = '#dc2626';
    const p1TrailW = (match.p1.trailHp / 100) * barW;
    ctx.fillRect(p1X + (barW - p1TrailW), barY, p1TrailW, barH);
    ctx.fillStyle = '#facc15';
    const p1HpW = (match.p1.hp / 100) * barW;
    ctx.fillRect(p1X + (barW - p1HpW), barY, p1HpW, barH);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(p1X, barY, barW, barH);

    // 2P 血條（左往右扣）
    const p2X = W - 78 - barW;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(p2X, barY, barW, barH);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(p2X, barY, (match.p2.trailHp / 100) * barW, barH);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(p2X, barY, (match.p2.hp / 100) * barW, barH);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(p2X, barY, barW, barH);

    // 角色名稱與勝場星星
    ctx.font = 'bold 16px "Noto Sans TC"';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(`${match.p1.def.name} ${'★'.repeat(match.p1Wins)}`, p1X, barY + 46);
    ctx.textAlign = 'right';
    ctx.fillText(`${'★'.repeat(match.p2Wins)} ${match.p2.def.name}`, W - 78, barY + 46);

    // 中央計時器
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.fillRect(W / 2 - 36, 12, 72, 48);
    ctx.strokeRect(W / 2 - 36, 12, 72, 48);
    ctx.fillStyle = match.timer <= 15 ? '#ef4444' : '#fbbf24';
    ctx.font = '900 30px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(String(match.timer).padStart(2, '0'), W / 2, 46);

    // 底部氣力條 (SUPER METER)
    const meterW = 240;
    const meterH = 14;
    const meterY = H - 28;
    [
      { x: 32, f: match.p1, align: 'left' },
      { x: W - 32 - meterW, f: match.p2, align: 'right' }
    ].forEach(({ x, f, align }) => {
      ctx.fillStyle = 'rgba(15,23,42,0.85)';
      ctx.fillRect(x, meterY, meterW, meterH);
      const ready = f.superMeter >= 100;
      ctx.fillStyle = ready ? '#fbbf24' : '#38bdf8';
      ctx.fillRect(x, meterY, (f.superMeter / 100) * meterW, meterH);
      ctx.strokeStyle = ready ? '#fff' : '#64748b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, meterY, meterW, meterH);
      ctx.fillStyle = ready ? '#fde047' : '#cbd5e1';
      ctx.font = 'bold 12px "Noto Sans TC"';
      ctx.textAlign = align;
      ctx.fillText(
        ready ? '⚡ 超必殺就緒 (按 U / 4)!' : `氣力 ${Math.floor(f.superMeter)}%`,
        align === 'left' ? x : x + meterW,
        meterY - 5
      );
    });

    // 連擊顯示
    if (match.p1.comboCount >= 2) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 28px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`${match.p1.comboCount} HITS!`, 36, 140);
    }
    if (match.p2.comboCount >= 2) {
      ctx.fillStyle = '#ef4444';
      ctx.font = '900 28px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`${match.p2.comboCount} HITS!`, W - 36, 140);
    }

    // 回合橫幅 (ROUND 1 / FIGHT / K.O.)
    if (match.bannerText) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, H / 2 - 58, W, 116);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '900 58px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(match.bannerText, W / 2, H / 2 + 8);
      if (match.bannerSub) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px "Noto Sans TC"';
        ctx.fillText(match.bannerSub, W / 2, H / 2 + 44);
      }
    }

    // 超必殺特寫
    if (match.superFlash > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fde047';
      ctx.font = '900 32px "Noto Sans TC"';
      ctx.textAlign = 'center';
      ctx.fillText(`⚡ ${match.superCallout}`, W / 2, H / 2 - 80);
    }
  }

  function render() {
    ctx.save();
    if (match.shake > 0) {
      ctx.translate((Math.random() - 0.5) * match.shake, (Math.random() - 0.5) * match.shake);
    }
    drawStage();
    drawFighter(match.p1);
    drawFighter(match.p2);
    drawProjectiles();

    // 粒子與傷害字
    match.particles.forEach((pt) => {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = pt.life / pt.maxLife;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    });
    ctx.globalAlpha = 1;

    match.floatingTexts.forEach((ft) => {
      ctx.fillStyle = ft.color;
      ctx.font = '900 18px "Noto Sans TC"';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    });

    drawHud();
    ctx.restore();
  }

  function loop() {
    update();
    render();
    rafId = requestAnimationFrame(loop);
  }

  function showKoModal(winner) {
    document.getElementById('winner-img').src = winner.def.img;
    document.getElementById('winner-name').textContent = `${winner.def.name} (${winner.isP1 ? '1P' : (gameMode === 'cpu' ? 'CPU' : '2P')}) 獲勝！`;
    document.getElementById('winner-quote').textContent = winner.def.winQuote;
    document.getElementById('ko-modal').classList.remove('hidden');
  }

  // === 選角畫面邏輯 ===
  function renderSelectGrid() {
    const grid = document.getElementById('fighter-grid');
    grid.innerHTML = '';
    FIGHTERS.forEach((f) => {
      const tile = document.createElement('div');
      tile.className = 'fighter-tile';
      if (f.id === p1Id) tile.classList.add('is-p1');
      if (f.id === p2Id) tile.classList.add('is-p2');

      const badges = [];
      if (f.id === p1Id) badges.push('<span class="tile-badge p1">1P</span>');
      if (f.id === p2Id) badges.push(`<span class="tile-badge p2">${gameMode === 'cpu' ? 'CPU' : '2P'}</span>`);

      tile.innerHTML = `
        <div class="tile-badges">${badges.join('')}</div>
        <img src="${f.img}" alt="${f.name}" />
        <div class="fighter-tile-name">${f.name}</div>
      `;

      tile.addEventListener('click', () => {
        if (pickTurn === 1) {
          p1Id = f.id;
          pickTurn = 2;
        } else {
          p2Id = f.id;
          pickTurn = 1;
        }
        updateSelectPreviews();
        renderSelectGrid();
      });
      grid.appendChild(tile);
    });
  }

  function updateSelectPreviews() {
    const f1 = FIGHTER_MAP[p1Id];
    const f2 = FIGHTER_MAP[p2Id];
    document.getElementById('p1-preview-img').src = f1.img;
    document.getElementById('p1-preview-name').textContent = f1.name;
    document.getElementById('p1-preview-style').textContent = f1.style;
    document.getElementById('p1-preview-quote').textContent = f1.quote;

    document.getElementById('p2-tag-label').textContent = gameMode === 'cpu' ? 'CPU' : '2P PLAYER';
    document.getElementById('p2-preview-img').src = f2.img;
    document.getElementById('p2-preview-name').textContent = f2.name;
    document.getElementById('p2-preview-style').textContent = f2.style;
    document.getElementById('p2-preview-quote').textContent = f2.quote;

    document.getElementById('select-hint').innerHTML = pickTurn === 1
      ? '現在請點擊選擇 <strong>1P 角色</strong>'
      : `現在請點擊選擇 <strong>${gameMode === 'cpu' ? '電腦對手' : '2P 角色'}</strong>`;
  }

  // === 初始化 ===
  function init() {
    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
      if (e.code === 'Comma') keys['Numpad1'] = false;
      if (e.code === 'Period') keys['Numpad2'] = false;
      if (e.code === 'Slash') keys['Numpad3'] = false;
      if (e.code === 'Semicolon') keys['Numpad4'] = false;
    });

    document.getElementById('btn-mode-cpu').addEventListener('click', (e) => {
      gameMode = 'cpu';
      e.target.classList.add('active');
      document.getElementById('btn-mode-pvp').classList.remove('active');
      updateSelectPreviews();
      renderSelectGrid();
    });

    document.getElementById('btn-mode-pvp').addEventListener('click', (e) => {
      gameMode = 'pvp';
      e.target.classList.add('active');
      document.getElementById('btn-mode-cpu').classList.remove('active');
      updateSelectPreviews();
      renderSelectGrid();
    });

    document.querySelectorAll('.stage-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.stage-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedStage = btn.dataset.stage;
      });
    });

    document.getElementById('btn-start-fight').addEventListener('click', startMatch);

    const backToSelect = () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.getElementById('battle-screen').classList.remove('active');
      document.getElementById('select-screen').classList.add('active');
      document.getElementById('btn-back-select').classList.add('hidden');
      document.getElementById('ko-modal').classList.add('hidden');
    };

    document.getElementById('btn-back-select').addEventListener('click', backToSelect);
    document.getElementById('btn-reselect').addEventListener('click', backToSelect);
    document.getElementById('btn-rematch').addEventListener('click', startMatch);

    document.getElementById('btn-sound').addEventListener('click', (e) => {
      SFX.enabled = !SFX.enabled;
      e.target.textContent = SFX.enabled ? '🔊' : '🔇';
    });

    updateSelectPreviews();
    renderSelectGrid();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
