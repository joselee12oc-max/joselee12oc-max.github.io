(() => {
  const { FACTIONS, CARDS, DEFAULT_DECK, STAGES, RESULT_QUOTES } = window.GINTAMA_DATA;
  const CARD_MAP = Object.fromEntries(CARDS.map((c) => [c.id, c]));
  const STORAGE_KEY = 'gintama_card_deck_v1';
  const UNLOCK_KEY = 'gintama_hidden_unlocked_v1';
  const BOSS_UNLOCK_KEY = 'gintama_boss_unlocked_v1';
  const CHALLENGE_BEST_KEY = 'gintama_challenge_best_v1';
  let challengeStreak = 0;

  function isHiddenUnlocked() {
    return localStorage.getItem(UNLOCK_KEY) === '1';
  }

  function isBossUnlocked() {
    return localStorage.getItem(BOSS_UNLOCK_KEY) === '1';
  }

  function getChallengeBest() {
    return Number(localStorage.getItem(CHALLENGE_BEST_KEY) || 0);
  }

  function populateStageSelect() {
    const stageSelect = document.getElementById('stage-select');
    if (!stageSelect) return;
    const prevVal = stageSelect.value;
    stageSelect.innerHTML = '';
    STAGES.forEach((s, idx) => {
      if (s.hidden && !isHiddenUnlocked()) return;
      if (s.challenge && !isBossUnlocked()) return;
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = s.challenge
        ? `${s.name} (最高 ${getChallengeBest()} 連勝)`
        : s.name;
      stageSelect.appendChild(opt);
    });
    if (prevVal !== '' && [...stageSelect.options].some((o) => o.value === prevVal)) {
      stageSelect.value = prevVal;
    }
  }

  // === 音效系統 (Web Audio API) ===
  const Sound = {
    enabled: true,
    ctx: null,
    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
    },
    play(type) {
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

      if (type === 'draw') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'summon') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.14);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(170, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.15);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
        osc.start(now);
        osc.stop(now + 0.17);
      } else if (type === 'heal') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.22);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.start(now);
        osc.stop(now + 0.24);
      } else if (type === 'boom') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.28);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'win') {
        [523, 659, 784, 1046].forEach((freq, idx) => {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.connect(g);
          g.connect(this.ctx.destination);
          o.type = 'triangle';
          o.frequency.setValueAtTime(freq, now + idx * 0.09);
          g.gain.setValueAtTime(0.12, now + idx * 0.09);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.25);
          o.start(now + idx * 0.09);
          o.stop(now + idx * 0.09 + 0.25);
        });
        }
      } catch (_) {}
    }
  };

  // === 工具函式 ===
  let uidCounter = 1;
  const nextUid = () => `u_${uidCounter++}`;

  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function loadSavedDeck() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 20 && parsed.every((id) => CARD_MAP[id] && (!CARD_MAP[id].bossOnly || isBossUnlocked()))) {
          return parsed;
        }
      }
    } catch (_) {}
    return [...DEFAULT_DECK];
  }

  function saveDeck(deckIds) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deckIds));
  }

  function spawnFloatText(el, text, color = '#ef4444') {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const div = document.createElement('div');
    div.className = 'float-dmg';
    div.style.left = `${rect.left + rect.width / 2}px`;
    div.style.top = `${rect.top + rect.height / 3}px`;
    div.style.color = color;
    div.textContent = text;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 920);
  }

  // === 遊戲狀態 ===
  let playerDeckTemplate = loadSavedDeck();
  let currentStageIdx = 0;
  let state = null;
  let selectedAttackerUid = null;
  let pendingSpell = null; // { handIndex, card }
  let activeDeckFilter = 'all';

  function createUnitInstance(card) {
    const kws = [...(card.keywords || [])];
    const hasRush = kws.includes('突襲');
    return {
      uid: nextUid(),
      cardId: card.id,
      name: card.name,
      faction: card.faction,
      img: card.img,
      atk: card.atk,
      hp: card.hp,
      maxHp: card.hp,
      keywords: kws,
      canAttack: hasRush,
      shield: kws.includes('護盾'),
      stunned: false,
      onDeath: card.onDeath || null
    };
  }

  function damageUnit(unit, amount, sideLabel = '') {
    if (!unit || amount <= 0) return 0;
    if (unit.shield) {
      unit.shield = false;
      addLog(`🛡️ ${unit.name} 的【護盾】抵擋了這次攻擊！`, sideLabel || 'system');
      return 0;
    }
    unit.hp -= amount;
    return amount;
  }

  function startNewGame(stageIdx = currentStageIdx) {
    currentStageIdx = stageIdx;
    let stage = STAGES[stageIdx];
    if (stage.challenge) {
      const pool = STAGES.filter((s) => !s.challenge && !s.hidden);
      const pick = pool[challengeStreak % pool.length];
      const bonusHp = challengeStreak * 6;
      stage = {
        ...stage,
        enemyName: `${pick.enemyName} (第 ${challengeStreak + 1} 戰)`,
        enemyTitle: `挑戰賽修羅場・${pick.enemyTitle}`,
        enemyAvatar: pick.enemyAvatar,
        enemyHp: 32 + bonusHp,
        taunt: pick.taunt,
        winQuote: pick.winQuote,
        loseQuote: pick.loseQuote,
        deck: pick.deck
      };
    }
    selectedAttackerUid = null;
    pendingSpell = null;

    state = {
      turn: 1,
      activeSide: 'player',
      gameOver: false,
      heroSkillUsed: false,
      endReason: '',
      lastHitBy: '',
      stage,
      player: {
        hp: 30,
        maxHp: 30,
        sugar: 1,
        maxSugar: 1,
        deck: shuffle(playerDeckTemplate),
        hand: [],
        board: []
      },
      enemy: {
        hp: stage.enemyHp,
        maxHp: stage.enemyHp,
        sugar: 0,
        maxSugar: 0,
        deck: shuffle(stage.deck),
        hand: [],
        board: []
      },
      logs: []
    };

    // 起始手牌直接補滿 5 張
    refillHand('player', false);
    refillHand('enemy', false);

    addLog(`⚔️ 決鬥開始！對手是【${stage.enemyName}】`, 'system');

    if (stage.id === 'stage_9') {
      state.player.sugar = 99;
      state.player.maxSugar = 99;
      if (CARD_MAP['shouyou']) state.enemy.board.push(createUnitInstance(CARD_MAP['shouyou']));
      if (CARD_MAP['utsuro']) state.enemy.board.push(createUnitInstance(CARD_MAP['utsuro']));
      addLog('🔥 【白夜叉全力解放】隱藏關卡我方糖分點數無限（∞）！', 'system');
      addLog('🌑 宿命降臨！對手開局即派出【吉田松陽】與【虛 (Utsuro)】！', 'enemy');
      showComicToast('assets/cards/char_124135.png', '虛 & 吉田松陽', '「銀時，這一次你救得了誰呢……」');
    }

    renderAll();
  }

  function addLog(msg, kind = 'player') {
    if (!state) return;
    state.logs.unshift({ msg, kind });
    if (state.logs.length > 40) state.logs.pop();
  }

  function drawCard(side, withSound = true) {
    if (!state || state.gameOver) return;
    const actor = state[side];
    if (actor.deck.length === 0) {
      state.endReason = side === 'player'
        ? '💀 敗因：你的牌庫已抽乾（0 張），無牌可抽！'
        : '🏆 勝因：敵方牌庫已抽乾（0 張），無牌可抽！';
      actor.hp = 0;
      addLog(`📚 ${side === 'player' ? '我方' : '敵方'}牌庫已空，無牌可抽，直接判負！`, side === 'player' ? 'enemy' : 'player');
      checkGameOver();
      return;
    }
    const cardId = actor.deck.pop();
    if (side === 'player' && actor.deck.length <= 3 && actor.deck.length > 0) {
      addLog(`⚠️ 警告：我方牌庫只剩 ${actor.deck.length} 張，抽乾會直接落敗！`, 'system');
    }
    if (actor.hand.length >= 5) {
      addLog(`${side === 'player' ? '我方' : '敵方'}手牌已滿，「${CARD_MAP[cardId].name}」被燒毀！`, 'system');
      return;
    }
    actor.hand.push(cardId);
    if (withSound && side === 'player') Sound.play('draw');
  }

  function refillHand(side, withSound = true) {
    if (!state || state.gameOver) return;
    const actor = state[side];
    while (actor.hand.length < 5 && actor.deck.length > 0 && !state.gameOver) {
      drawCard(side, withSound);
    }
  }

  function hasTaunt(side) {
    return state[side].board.some((u) => u.keywords.includes('嘲諷'));
  }

  function removeDeadUnits(side) {
    const actor = state[side];
    const survivors = [];
    const dead = [];
    for (const u of actor.board) {
      if (u.hp > 0) survivors.push(u);
      else dead.push(u);
    }
    actor.board = survivors;
    for (const d of dead) {
      addLog(`💀 ${d.name} 退場了！`, side === 'player' ? 'enemy' : 'player');
      if (d.onDeath && d.onDeath.type === 'draw_and_heal') {
        drawCard(side, false);
        actor.hp = Math.min(actor.maxHp, actor.hp + d.onDeath.heal);
        addLog(`🕶️ ${d.name}【亡語】觸發：抽 1 張牌並回復 ${d.onDeath.heal} 點體力！`, side);
      } else if (d.onDeath && d.onDeath.type === 'draw_card') {
        for (let i = 0; i < d.onDeath.amount; i++) drawCard(side, false);
        addLog(`👓 ${d.name}【亡語】只剩眼鏡在地上……抽 ${d.onDeath.amount} 張牌！`, side);
      } else if (d.onDeath && d.onDeath.type === 'elizabeth_protest') {
        const oppSide = side === 'player' ? 'enemy' : 'player';
        state[oppSide].board.forEach((u) => { u.atk = Math.max(0, u.atk - 1); });
        addLog(`🪧 ${d.name}【亡語】舉牌抗議！敵方全體角色 -1 攻擊力！`, side);
      } else if (d.onDeath && d.onDeath.type === 'utsuro_rebirth') {
        const oppSide = side === 'player' ? 'enemy' : 'player';
        state[oppSide].hp -= d.onDeath.dmg;
        actor.hp = Math.min(actor.maxHp, actor.hp + d.onDeath.heal);
        drawCard(side, false);
        addLog(`🌑 ${d.name}【亡語】不死餘波！對敵方主將造成 ${d.onDeath.dmg} 傷、回 ${d.onDeath.heal} 血並抽 1 牌！`, side);
        checkGameOver();
      }
    }

    if (!state.gameOver && side === 'enemy' && state.stage.id === 'stage_9' && dead.length > 0) {
      const hasShouyou = state.enemy.board.some((u) => u.cardId === 'shouyou');
      const hasUtsuro = state.enemy.board.some((u) => u.cardId === 'utsuro');
      if (!hasShouyou && !hasUtsuro) {
        state.endReason = '🏆 勝因：成功擊倒【吉田松陽】與【虛 (Utsuro)】，斬斷宿命！';
        state.enemy.hp = 0;
        addLog('✨ 吉田松陽與虛均已退場，隱藏關卡直接勝利！', 'system');
        checkGameOver();
      }
    }
  }

  function checkGameOver() {
    if (!state || state.gameOver) return false;
    if (state.enemy.hp <= 0) {
      state.enemy.hp = 0;
      state.gameOver = true;
      if (!state.endReason) {
        state.endReason = state.lastHitBy
          ? `🏆 勝因：擊倒敵方主將（最後一擊：${state.lastHitBy}）`
          : '🏆 勝因：敵方主將體力歸零！';
      }
      Sound.play('win');
      showResultModal(true);
      return true;
    }
    if (state.player.hp <= 0) {
      state.player.hp = 0;
      state.gameOver = true;
      if (!state.endReason) {
        state.endReason = state.lastHitBy
          ? `💀 敗因：我方主將體力歸零（致命一擊：${state.lastHitBy}）`
          : '💀 敗因：我方主將體力歸零！';
      }
      Sound.play('boom');
      showResultModal(false);
      return true;
    }
    return false;
  }

  function triggerOnPlay(side, card, summonedUnit) {
    const eff = card.onPlay;
    if (!eff) return;
    const enemySide = side === 'player' ? 'enemy' : 'player';
    const actor = state[side];
    const enemy = state[enemySide];

    switch (eff.type) {
      case 'gintoki_awaken':
        if (actor.hand.length < 5) {
          actor.hand.push('item_strawberry_milk');
          addLog(`🍓 坂田銀時拿出了 1 瓶「草莓牛奶」！`, side);
        }
        if (actor.hp <= 15 && summonedUnit) {
          summonedUnit.atk += 2;
          summonedUnit.hp += 2;
          summonedUnit.maxHp += 2;
          summonedUnit.canAttack = true;
          if (!summonedUnit.keywords.includes('突襲')) summonedUnit.keywords.push('突襲');
          addLog(`🔥 坂田銀時【白夜叉覺醒】！獲得 +2/+2 與【突襲】！`, side);
        }
        break;
      case 'kagura_bond':
        if (summonedUnit && actor.board.some((u) => u.cardId === 'sadaharu' || u.cardId === 'gintoki')) {
          summonedUnit.atk += 2;
          summonedUnit.hp += 1;
          summonedUnit.maxHp += 1;
          addLog(`☂️ 神樂與萬事屋夥伴並肩作戰，獲得 +2/+1！`, side);
        }
        break;
      case 'sadaharu_bite':
        if (enemy.board.length > 0) {
          const target = enemy.board[Math.floor(Math.random() * enemy.board.length)];
          damageUnit(target, eff.amount, side);
          addLog(`🐶 定春一口咬住 ${target.name}，造成 ${eff.amount} 點傷害！`, side);
          removeDeadUnits(enemySide);
          Sound.play('hit');
        }
        break;
      case 'yamazaki_anpan':
        drawCard(side, side === 'player');
        if (summonedUnit) {
          summonedUnit.hp += 1;
          summonedUnit.maxHp += 1;
        }
        addLog(`🍞 山崎退狂吃紅豆麵包！抽 1 張牌並獲得 +0/+1！`, side);
        break;
      case 'katsura_summon':
        if (actor.board.length < 5 && CARD_MAP[eff.cardId]) {
          const token = createUnitInstance(CARD_MAP[eff.cardId]);
          actor.board.push(token);
          addLog(`🪧 桂小太郎召喚了「${token.name}」！`, side);
        }
        if (actor.hand.length < 5) {
          actor.hand.push('item_justaway');
          addLog(`💣 桂小太郎將 1 張「Justaway 炸彈」加入手牌！`, side);
        }
        break;
      case 'takasugi_destroy':
        enemy.board.forEach((u) => { damageUnit(u, eff.amount, side); });
        enemy.hp -= eff.amount;
        addLog(`🦋 高杉晉助破壞一切！敵方全體角色與主將各受到 ${eff.amount} 點傷害！`, side);
        removeDeadUnits(enemySide);
        Sound.play('boom');
        break;
      case 'kamui_umbrella':
        if (enemy.board.length > 0) {
          const target = [...enemy.board].sort((a, b) => b.atk - a.atk)[0];
          damageUnit(target, eff.amount, side);
          addLog(`☂️ 神威傘槍先制射擊！對 ${target.name} 造成 ${eff.amount} 點傷害！`, side);
          removeDeadUnits(enemySide);
          Sound.play('hit');
        }
        break;
      case 'sacchan_simping':
        enemy.hp -= eff.amount;
        addLog(`🥷 猿飛菖蒲納豆突襲！對敵方主將造成 ${eff.amount} 點傷害！`, side);
        if (summonedUnit && actor.board.some((u) => u.cardId === 'gintoki')) {
          summonedUnit.atk += 2;
          summonedUnit.hp += 2;
          summonedUnit.maxHp += 2;
          addLog(`😍 發現阿銀！猿飛菖蒲花癡爆發，獲得 +2/+2！`, side);
        }
        Sound.play('hit');
        break;
      case 'shouyou_boss':
        actor.board.forEach((u) => {
          u.atk += eff.atk;
          u.hp += eff.hp;
          u.maxHp += eff.hp;
          u.shield = true;
        });
        actor.hp = Math.min(actor.maxHp, actor.hp + eff.heal);
        enemy.board.forEach((u) => {
          u.stunned = true;
          u.canAttack = false;
        });
        addLog(`🌸 吉田松陽全力守護！友方全體 +${eff.atk}/+${eff.hp} 與【護盾】、主將回 ${eff.heal} 血並使敵軍全體【煞車】！`, side);
        Sound.play('heal');
        break;
      case 'utsuro_doom':
        enemy.board.forEach((u) => {
          damageUnit(u, eff.amount, side);
          u.stunned = true;
          u.canAttack = false;
        });
        enemy.hp -= eff.amount;
        state.lastHitBy = '虛 (Utsuro) 降臨毀滅衝擊';
        addLog(`🌑 虛降臨！對敵方全體角色與主將造成 ${eff.amount} 點傷害並全體【煞車】！`, side);
        removeDeadUnits(enemySide);
        Sound.play('boom');
        break;
      case 'shinpachi_tsukkomi':
        actor.board.forEach((u) => {
          if (u.uid !== summonedUnit?.uid && u.faction === eff.faction) {
            u.atk += eff.atk;
            u.hp += eff.hp;
            u.maxHp += eff.hp;
          }
        });
        if (enemy.board.length > 0) {
          const target = enemy.board[Math.floor(Math.random() * enemy.board.length)];
          target.stunned = true;
          target.canAttack = false;
          addLog(`👓 ${card.name} 吐槽連發！萬事屋 +1/+1，並讓 ${target.name}【煞車】！`, side);
        } else {
          addLog(`👓 ${card.name} 吐槽加持！萬事屋夥伴獲得 +${eff.atk}/+${eff.hp}`, side);
        }
        break;
      case 'hijikata_mayo':
        if (actor.hand.length < 5) {
          actor.hand.push(eff.cardId);
        }
        actor.board.forEach((u) => {
          if (u.uid !== summonedUnit?.uid && u.faction === eff.faction) {
            u.atk += 1;
            u.hp += 1;
            u.maxHp += 1;
          }
        });
        addLog(`🟨 ${card.name} 獲得「特製美乃滋」，並讓真選組夥伴 +1/+1！`, side);
        break;
      case 'kondo_stalker':
        actor.hp = Math.min(actor.maxHp, actor.hp + eff.amount);
        if (enemy.board.length > 0) {
          const target = enemy.board[Math.floor(Math.random() * enemy.board.length)];
          target.stunned = true;
          target.canAttack = false;
          addLog(`🦍 ${card.name} 回復 ${eff.amount} 血，並把 ${target.name} 嚇到【煞車】！`, side);
        } else {
          addLog(`💚 ${card.name} 為我方主將恢復 ${eff.amount} 點體力！`, side);
        }
        Sound.play('heal');
        break;
      case 'damage_and_stun_highest':
        if (enemy.board.length > 0) {
          const target = [...enemy.board].sort((a, b) => b.hp - a.hp)[0];
          damageUnit(target, eff.amount, side);
          target.stunned = true;
          target.canAttack = false;
          addLog(`🌙 ${card.name} 苦無封鎖！對 ${target.name} 造成 ${eff.amount} 點傷害並【煞車】！`, side);
          removeDeadUnits(enemySide);
          Sound.play('hit');
        }
        break;
      case 'stun_strongest_enemy':
        if (enemy.board.length > 0) {
          const target = [...enemy.board].sort((a, b) => b.atk - a.atk)[0];
          target.stunned = true;
          target.canAttack = false;
          addLog(`👑 將軍駕到！全場驚呼，${target.name} 緊急【煞車】一回合！`, side);
        }
        break;
      case 'buff_faction':
        actor.board.forEach((u) => {
          if (u.uid !== summonedUnit?.uid && u.faction === eff.faction) {
            u.atk += eff.atk;
            u.hp += eff.hp;
            u.maxHp += eff.hp;
          }
        });
        addLog(`👓 ${card.name} 吐槽加持！萬事屋夥伴獲得 +${eff.atk}/+${eff.hp}`, side);
        break;
      case 'add_card':
        if (actor.hand.length < 5) {
          actor.hand.push(eff.cardId);
          addLog(`🃏 ${card.name} 將「${CARD_MAP[eff.cardId].name}」加入手牌！`, side);
        }
        break;
      case 'damage_random_enemy': {
        const targets = [{ type: 'hero' }, ...enemy.board.map((u) => ({ type: 'unit', unit: u }))];
        const pick = targets[Math.floor(Math.random() * targets.length)];
        if (pick.type === 'hero') {
          enemy.hp -= eff.amount;
          addLog(`🚀 ${card.name} 火箭筒命中敵方主將，造成 ${eff.amount} 點傷害！`, side);
        } else {
          damageUnit(pick.unit, eff.amount, side);
          addLog(`🚀 ${card.name} 火箭筒命中 ${pick.unit.name}，造成 ${eff.amount} 點傷害！`, side);
          removeDeadUnits(enemySide);
        }
        Sound.play('boom');
        break;
      }
      case 'heal_hero':
        actor.hp = Math.min(actor.maxHp, actor.hp + eff.amount);
        addLog(`💚 ${card.name} 為我方主將恢復 ${eff.amount} 點體力！`, side);
        Sound.play('heal');
        break;
      case 'draw':
        for (let i = 0; i < eff.amount; i++) drawCard(side, side === 'player');
        addLog(`🍞 ${card.name} 抽了 ${eff.amount} 張牌！`, side);
        break;
      case 'summon_token':
        if (actor.board.length < 5 && CARD_MAP[eff.cardId]) {
          const token = createUnitInstance(CARD_MAP[eff.cardId]);
          actor.board.push(token);
          addLog(`🪧 ${card.name} 召喚了「${token.name}」！`, side);
        }
        break;
      case 'aoe_enemy_units':
        enemy.board.forEach((u) => { damageUnit(u, eff.amount, side); });
        addLog(`⚔️ ${card.name} 對敵方全體角色造成 ${eff.amount} 點傷害！`, side);
        removeDeadUnits(enemySide);
        Sound.play('boom');
        break;
      case 'gain_sugar_and_draw':
        actor.sugar = Math.min(10, actor.sugar + eff.sugar);
        drawCard(side, side === 'player');
        addLog(`💰 ${card.name} 帶來 ${eff.sugar} 點糖分並抽 1 張牌！`, side);
        break;
      case 'damage_highest_enemy_unit':
        if (enemy.board.length > 0) {
          const target = [...enemy.board].sort((a, b) => b.hp - a.hp)[0];
          target.hp -= eff.amount;
          addLog(`🌙 ${card.name} 的苦無命中 ${target.name}，造成 ${eff.amount} 點傷害！`, side);
          removeDeadUnits(enemySide);
          Sound.play('hit');
        }
        break;
      case 'heal_all_allies':
        actor.board.forEach((u) => {
          u.hp = Math.min(u.maxHp, u.hp + eff.amount);
        });
        addLog(`🍵 ${card.name} 為所有友方角色恢復 ${eff.amount} 點體力！`, side);
        Sound.play('heal');
        break;
      case 'damage_enemy_hero':
        enemy.hp -= eff.amount;
        addLog(`🥷 ${card.name} 納豆突襲！對敵方主將造成 ${eff.amount} 點傷害！`, side);
        Sound.play('hit');
        break;
      case 'buff_all_allies':
        actor.board.forEach((u) => {
          u.atk += eff.atk;
          u.hp += eff.hp;
          u.maxHp += eff.hp;
        });
        addLog(`🌸 ${card.name} 的教誨讓全體友方角色獲得 +${eff.atk}/+${eff.hp}！`, side);
        Sound.play('heal');
        break;
    }
    checkGameOver();
  }

  function castSpell(side, card, target) {
    const enemySide = side === 'player' ? 'enemy' : 'player';
    const actor = state[side];
    const enemy = state[enemySide];
    const eff = card.spellEffect;

    if (eff.type === 'strawberry_milk') {
      if (target.kind === 'hero') {
        actor.hp = Math.min(actor.maxHp, actor.hp + 5);
        addLog(`🍓 草莓牛奶！主將恢復 5 點體力！`, side);
      } else {
        target.unit.hp = Math.min(target.unit.maxHp, target.unit.hp + 5);
        target.unit.atk += 1;
        target.unit.hp += 1;
        target.unit.maxHp += 1;
        addLog(`🍓 草莓牛奶！${target.unit.name} 恢復 5 點體力並獲得 +1/+1！`, side);
      }
      Sound.play('heal');
    } else if (eff.type === 'buff_unit') {
      target.unit.atk += eff.atk;
      target.unit.hp += eff.hp;
      target.unit.maxHp += eff.hp;
      addLog(`✨ ${card.name}！${target.unit.name} 獲得 +${eff.atk}/+${eff.hp}！`, side);
      Sound.play('heal');
    } else if (eff.type === 'damage_target') {
      if (target.kind === 'hero') {
        enemy.hp -= eff.amount;
        addLog(`💣 ${card.name} 炸中敵方主將，造成 ${eff.amount} 點傷害！`, side);
      } else {
        damageUnit(target.unit, eff.amount, side);
        addLog(`💣 ${card.name} 炸中 ${target.unit.name}，造成 ${eff.amount} 點傷害！`, side);
        removeDeadUnits(enemySide);
      }
      Sound.play('boom');
    } else if (eff.type === 'dark_matter') {
      damageUnit(target.unit, 3, side);
      enemy.board.forEach((u) => { u.atk = Math.max(0, u.atk - 1); });
      addLog(`🍳 黑暗料理！對 ${target.unit.name} 造成 3 點傷害，敵軍全體 -1 攻擊力！`, side);
      removeDeadUnits(enemySide);
      Sound.play('hit');
    } else if (eff.type === 'armstrong_cannon') {
      enemy.board.forEach((u) => {
        damageUnit(u, 3, side);
        u.stunned = true;
        u.canAttack = false;
      });
      addLog(`⛄ 阿姆斯特朗砲！敵方全體受到 3 點傷害並全體【煞車】！`, side);
      removeDeadUnits(enemySide);
      drawCard(side, side === 'player');
      Sound.play('boom');
    } else if (eff.type === 'patriot') {
      damageUnit(target.unit, 2, side);
      target.unit.stunned = true;
      target.unit.canAttack = false;
      addLog(`🧻 愛國者發射！對 ${target.unit.name} 造成 2 點傷害並【煞車】，抽 1 張牌！`, side);
      removeDeadUnits(enemySide);
      drawCard(side, side === 'player');
      Sound.play('hit');
    } else if (eff.type === 'sandpaper') {
      damageUnit(target.unit, 1, side);
      enemy.board.forEach((u) => {
        u.stunned = true;
        u.canAttack = false;
      });
      addLog(`🧻 廁所的砂紙！${target.unit.name} 受到 1 點傷害，敵方全體痛到【煞車】！`, side);
      removeDeadUnits(enemySide);
      Sound.play('hit');
    } else if (eff.type === 'shinpachi_glasses') {
      const isPachi = target.unit.cardId === 'shinpachi';
      target.unit.atk += isPachi ? 3 : 2;
      target.unit.hp += isPachi ? 3 : 2;
      target.unit.maxHp += isPachi ? 3 : 2;
      if (isPachi) target.unit.shield = true;
      addLog(`👓 新八的本體！${target.unit.name} 獲得 ${isPachi ? '+3/+3 與【護盾】' : '+2/+2'}！`, side);
      Sound.play('heal');
    } else if (eff.type === 'shogun_briefs') {
      enemy.board.forEach((u) => {
        u.stunned = true;
        u.canAttack = false;
      });
      actor.hp = Math.min(actor.maxHp, actor.hp + 3);
      addLog(`🩲 將軍的三角內褲！敵方全體緊急【煞車】，我方主將恢復 3 血！`, side);
      Sound.play('heal');
    } else if (eff.type === 'cosplay_mimic') {
      const src = target.unit;
      if (actor.board.length < 5) {
        const clone = {
          uid: nextUid(),
          cardId: src.cardId,
          name: src.name.startsWith('偽・') ? src.name : `偽・${src.name}`,
          faction: src.faction,
          img: src.img,
          atk: src.atk,
          hp: src.hp,
          maxHp: src.maxHp,
          keywords: [...new Set([...src.keywords, '突襲'])],
          canAttack: true,
          shield: src.shield,
          stunned: false,
          onDeath: src.onDeath
        };
        actor.board.push(clone);
        addLog(`🎭 廉價 Cosplay 變裝組！成功模仿並召喚了【${clone.name}】(${clone.atk}/${clone.hp})！`, side);
        Sound.play('summon');
      } else {
        actor.hp = Math.min(actor.maxHp, actor.hp + 2);
        drawCard(side, side === 'player');
        addLog(`🎭 場上已滿！Cosplay 失敗改為回復 2 血並抽 1 張牌！`, side);
        Sound.play('heal');
      }
    }
    checkGameOver();
  }

  let toastTimer = null;
  function showComicToast(img, speaker, text) {
    const el = document.getElementById('comic-toast');
    if (!el) return;
    document.getElementById('toast-avatar').src = img;
    document.getElementById('toast-speaker').textContent = speaker;
    document.getElementById('toast-text').textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  function isInfiniteSugar(side) {
    return side === 'player' && state?.stage?.id === 'stage_9';
  }

  function useHeroSkill() {
    if (!state || state.activeSide !== 'player' || state.gameOver || state.heroSkillUsed) return;
    if (!isInfiniteSugar('player') && state.player.sugar < 2) {
      addLog('🍮 糖分不足！銀時必殺技需要 2 點糖分。', 'system');
      renderAll();
      return;
    }
    if (!isInfiniteSugar('player')) state.player.sugar -= 2;
    state.heroSkillUsed = true;
    const dmg = state.player.hp <= 15 ? 2 : 1;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 2);
    state.enemy.board.forEach((u) => damageUnit(u, dmg, 'player'));
    removeDeadUnits('enemy');
    Sound.play('boom');
    showComicToast(
      'assets/cards/char_672.png',
      dmg === 2 ? '坂田銀時 (白夜叉覺醒)' : '坂田銀時',
      dmg === 2 ? '「白夜叉一閃！通通給我閃開！」' : '「糖分補給完畢！吃我一記洞爺湖木刀！」'
    );
    addLog(`🍓 銀時必殺技！回復 2 血並對敵方全體角色造成 ${dmg} 點傷害！`, 'player');
    checkGameOver();
    renderAll();
  }

  function playCardFromHand(side, handIndex, target = null) {
    const actor = state[side];
    const cardId = actor.hand[handIndex];
    const card = CARD_MAP[cardId];
    if (!card || (!isInfiniteSugar(side) && actor.sugar < card.cost)) return false;

    if (card.type === 'unit') {
      if (actor.board.length >= 5) {
        if (side === 'player') addLog('⚠️ 場上最多只能有 5 名角色！', 'system');
        return false;
      }
      if (!isInfiniteSugar(side)) actor.sugar -= card.cost;
      actor.hand.splice(handIndex, 1);
      const unit = createUnitInstance(card);
      actor.board.push(unit);
      addLog(`${side === 'player' ? '我方' : '敵方'}召喚了【${card.name}】`, side);
      Sound.play('summon');
      if (card.quote) showComicToast(card.img, card.name, card.quote);
      triggerOnPlay(side, card, unit);
      refillHand(side, side === 'player');
      return true;
    }

    // Spell
    if (!isInfiniteSugar(side)) actor.sugar -= card.cost;
    actor.hand.splice(handIndex, 1);
    castSpell(side, card, target);
    refillHand(side, side === 'player');
    return true;
  }

  function performAttack(attackerSide, attackerUid, target) {
    const defenderSide = attackerSide === 'player' ? 'enemy' : 'player';
    const attacker = state[attackerSide].board.find((u) => u.uid === attackerUid);
    if (!attacker || !attacker.canAttack) return false;

    if (hasTaunt(defenderSide)) {
      if (target.kind === 'hero' || !target.unit.keywords.includes('嘲諷')) {
        if (attackerSide === 'player') addLog('🛡️ 必須先擊敗具有【嘲諷】的敵方角色！', 'system');
        return false;
      }
    }

    attacker.canAttack = false;
    Sound.play('hit');

    if (target.kind === 'hero') {
      state.lastHitBy = `${attacker.name}（${attacker.atk} 點攻擊）`;
      state[defenderSide].hp -= attacker.atk;
      addLog(`⚔️ ${attacker.name} 攻擊${defenderSide === 'enemy' ? '敵方' : '我方'}主將，造成 ${attacker.atk} 點傷害！`, attackerSide);
      const heroBox = document.getElementById(defenderSide === 'enemy' ? 'enemy-hero-box' : 'player-hero-box');
      spawnFloatText(heroBox, `-${attacker.atk}`);
    } else {
      const def = target.unit;
      const dealt = damageUnit(def, attacker.atk, attackerSide);
      const taken = damageUnit(attacker, def.atk, defenderSide);
      addLog(`⚔️ ${attacker.name} 與 ${def.name} 交鋒！（造成 ${dealt} / 受到 ${taken}）`, attackerSide);
      const defEl = document.querySelector(`[data-uid="${def.uid}"]`);
      const atkEl = document.querySelector(`[data-uid="${attacker.uid}"]`);
      spawnFloatText(defEl, dealt > 0 ? `-${dealt}` : '🛡️ 抵擋', dealt > 0 ? '#ef4444' : '#fbbf24');
      if (def.atk > 0) spawnFloatText(atkEl, taken > 0 ? `-${taken}` : '🛡️ 抵擋', taken > 0 ? '#ef4444' : '#fbbf24');
      removeDeadUnits(defenderSide);
      removeDeadUnits(attackerSide);
    }

    checkGameOver();
    return true;
  }

  // === 玩家操作事件 ===
  function handleHandCardClick(handIndex) {
    if (!state || state.activeSide !== 'player' || state.gameOver) return;
    const card = CARD_MAP[state.player.hand[handIndex]];
    inspectCard(card);

    if (!isInfiniteSugar('player') && state.player.sugar < card.cost) {
      addLog(`🍮 糖分不足！需要 ${card.cost} 點糖分。`, 'system');
      renderAll();
      return;
    }

    selectedAttackerUid = null;

    if (card.type === 'unit' || card.targetType === 'none') {
      pendingSpell = null;
      playCardFromHand('player', handIndex);
      renderAll();
      return;
    }

    // 需要選目標的道具/事件卡
    if (card.targetType === 'enemy_unit' && state.enemy.board.length === 0) {
      addLog('⚠️ 敵方場上沒有角色可以作為目標！', 'system');
      renderAll();
      return;
    }
    if (card.targetType === 'friendly_unit' && state.player.board.length === 0) {
      addLog('⚠️ 我方場上沒有角色可以強化！', 'system');
      renderAll();
      return;
    }
    if (card.targetType === 'any_unit' && state.player.board.length === 0 && state.enemy.board.length === 0) {
      addLog('⚠️ 場上目前沒有任何角色可以模仿！', 'system');
      renderAll();
      return;
    }

    pendingSpell = { handIndex, card };
    renderAll();
  }

  function handlePlayerUnitClick(uid) {
    if (!state || state.activeSide !== 'player' || state.gameOver) return;
    const unit = state.player.board.find((u) => u.uid === uid);
    if (!unit) return;
    inspectCard(CARD_MAP[unit.cardId]);

    if (pendingSpell) {
      const tt = pendingSpell.card.targetType;
      if (tt === 'friendly_unit' || tt === 'friendly_any' || tt === 'any_unit') {
        const { handIndex } = pendingSpell;
        pendingSpell = null;
        playCardFromHand('player', handIndex, { kind: 'unit', unit });
        renderAll();
      }
      return;
    }

    if (!unit.canAttack) return;
    selectedAttackerUid = selectedAttackerUid === uid ? null : uid;
    renderAll();
  }

  function handleEnemyUnitClick(uid) {
    if (!state || state.activeSide !== 'player' || state.gameOver) return;
    const unit = state.enemy.board.find((u) => u.uid === uid);
    if (!unit) return;
    inspectCard(CARD_MAP[unit.cardId]);

    if (pendingSpell) {
      const tt = pendingSpell.card.targetType;
      if (tt === 'enemy_unit' || tt === 'enemy_any' || tt === 'any_unit') {
        const { handIndex } = pendingSpell;
        pendingSpell = null;
        playCardFromHand('player', handIndex, { kind: 'unit', unit });
        renderAll();
      }
      return;
    }

    if (selectedAttackerUid) {
      const ok = performAttack('player', selectedAttackerUid, { kind: 'unit', unit });
      if (ok) selectedAttackerUid = null;
      renderAll();
    }
  }

  function handleEnemyHeroClick() {
    if (!state || state.activeSide !== 'player' || state.gameOver) return;
    if (pendingSpell && pendingSpell.card.targetType === 'enemy_any') {
      const { handIndex } = pendingSpell;
      pendingSpell = null;
      playCardFromHand('player', handIndex, { kind: 'hero' });
      renderAll();
      return;
    }
    if (selectedAttackerUid) {
      const ok = performAttack('player', selectedAttackerUid, { kind: 'hero' });
      if (ok) selectedAttackerUid = null;
      renderAll();
    }
  }

  function handlePlayerHeroClick() {
    if (!state || state.activeSide !== 'player' || state.gameOver) return;
    if (pendingSpell && pendingSpell.card.targetType === 'friendly_any') {
      const { handIndex } = pendingSpell;
      pendingSpell = null;
      playCardFromHand('player', handIndex, { kind: 'hero' });
      renderAll();
    }
  }

  // === 回合與 AI ===
  function endPlayerTurn() {
    if (!state || state.activeSide !== 'player' || state.gameOver) return;
    selectedAttackerUid = null;
    pendingSpell = null;
    state.player.board.forEach((u) => { u.stunned = false; });
    state.activeSide = 'enemy';
    renderAll();
    setTimeout(runEnemyTurn, 550);
  }

  function runEnemyTurn() {
    if (!state || state.gameOver) return;
    const enemy = state.enemy;
    const startSugar = currentStageIdx >= 2 ? 3 : 2;
    enemy.maxSugar = Math.min(10, enemy.maxSugar === 0 ? startSugar : enemy.maxSugar + 1);
    enemy.sugar = enemy.maxSugar;
    drawCard('enemy', false);
    refillHand('enemy', false);
    enemy.board.forEach((u) => {
      u.canAttack = !u.stunned;
    });
    addLog(`😈 敵方第 ${state.turn} 回合開始（糖分 ${enemy.sugar}）`, 'enemy');
    renderAll();

    // 高難度 AI 出牌邏輯：優先挑最強高費角色，精準施放道具
    setTimeout(() => {
      if (!state || state.gameOver) return;
      let played = true;
      while (played) {
        played = false;
        const canPlayCard = (cid) => {
          const c = CARD_MAP[cid];
          if (!c || c.cost > enemy.sugar) return false;
          if (c.type === 'unit') return enemy.board.length < 5;
          if (c.targetType === 'friendly_unit' && enemy.board.length === 0) return false;
          if (c.targetType === 'enemy_unit' && state.player.board.length === 0) return false;
          if (c.targetType === 'any_unit' && enemy.board.length === 0 && state.player.board.length === 0) return false;
          if (c.id === 'item_armstrong' && state.player.board.length < 2) return false;
          return true;
        };

        // 優先找「費用最高」的可出角色卡
        let bestIdx = -1;
        let bestScore = -1;
        enemy.hand.forEach((cid, idx) => {
          if (!canPlayCard(cid)) return;
          const c = CARD_MAP[cid];
          let score = c.cost * 10 + (c.type === 'unit' ? 50 : 10);
          if (c.id === 'item_justaway' && state.player.hp <= 4) score += 200;
          if (score > bestScore) {
            bestScore = score;
            bestIdx = idx;
          }
        });

        if (bestIdx !== -1) {
          const c = CARD_MAP[enemy.hand[bestIdx]];
          let target = null;
          if (c.type === 'spell') {
            const strongAlly = [...enemy.board].sort((a, b) => b.atk - a.atk)[0];
            const strongPlayerUnit = [...state.player.board].sort((a, b) => b.atk - a.atk)[0];
            if (c.targetType === 'friendly_unit') target = { kind: 'unit', unit: strongAlly };
            else if (c.targetType === 'friendly_any') {
              target = enemy.hp <= 12 || !strongAlly ? { kind: 'hero' } : { kind: 'unit', unit: strongAlly };
            } else if (c.targetType === 'enemy_unit') {
              target = { kind: 'unit', unit: strongPlayerUnit };
            } else if (c.targetType === 'any_unit') {
              target = strongPlayerUnit ? { kind: 'unit', unit: strongPlayerUnit } : { kind: 'unit', unit: strongAlly };
            } else if (c.targetType === 'enemy_any') {
              if (state.player.hp <= 4 || !strongPlayerUnit) target = { kind: 'hero' };
              else target = { kind: 'unit', unit: strongPlayerUnit };
            }
          }
          played = playCardFromHand('enemy', bestIdx, target);
        }
      }
      renderAll();

      // 高難度 AI 攻擊邏輯：先算斬殺，再聰明解場或搶血
      setTimeout(() => {
        if (!state || state.gameOver) return;
        const attackers = [...enemy.board].filter((u) => u.canAttack);
        const totalPotentialDmg = attackers.reduce((sum, u) => sum + u.atk, 0);
        const playerHasTaunt = hasTaunt('player');

        if (!playerHasTaunt && totalPotentialDmg >= state.player.hp) {
          // 斬殺線達成：全軍直接打臉！
          for (const atk of attackers) {
            if (state.gameOver) break;
            if (!enemy.board.some((u) => u.uid === atk.uid)) continue;
            performAttack('enemy', atk.uid, { kind: 'hero' });
          }
        } else {
          for (const atk of attackers) {
            if (state.gameOver) break;
            if (!enemy.board.some((u) => u.uid === atk.uid)) continue;
            const taunts = state.player.board.filter((u) => u.keywords.includes('嘲諷'));
            if (taunts.length > 0) {
              performAttack('enemy', atk.uid, { kind: 'unit', unit: taunts[0] });
              continue;
            }
            // 尋找可以「白吃」或「消滅高威脅角色(atk>=4)」的目標
            const freeKill = state.player.board.find((u) => !u.shield && u.hp <= atk.atk && u.atk < atk.hp);
            const highThreat = state.player.board.find((u) => u.atk >= 4 && u.hp <= atk.atk);
            const victim = freeKill || highThreat;
            if (victim) {
              performAttack('enemy', atk.uid, { kind: 'unit', unit: victim });
            } else {
              performAttack('enemy', atk.uid, { kind: 'hero' });
            }
          }
        }

        if (!state.gameOver) {
          enemy.board.forEach((u) => { u.stunned = false; });
          state.turn += 1;
          state.activeSide = 'player';
          state.heroSkillUsed = false;
          state.player.maxSugar = isInfiniteSugar('player') ? 99 : Math.min(10, state.player.maxSugar + 1);
          state.player.sugar = state.player.maxSugar;
          drawCard('player', true);
          refillHand('player', true);
          state.player.board.forEach((u) => {
            u.canAttack = !u.stunned;
          });
          addLog(`☀️ 我方第 ${state.turn} 回合開始！`, 'system');
        }
        renderAll();
      }, 500);
    }, 500);
  }

  // === UI 渲染 ===
  function createCardElement(card, options = {}) {
    const { unit = null, inHand = false, playable = false, readyAttack = false, selected = false, targetable = false, friendlyTargetable = false } = options;
    const div = document.createElement('div');
    div.className = `card faction-${card.faction}`;
    if (playable) div.classList.add('playable');
    if (readyAttack) div.classList.add('ready-attack');
    if (selected) div.classList.add('selected');
    if (targetable) div.classList.add('targetable');
    if (friendlyTargetable) div.classList.add('friendly-targetable');
    if (unit && unit.shield) div.classList.add('shielded');
    if (unit && unit.stunned) div.classList.add('stunned');
    if (unit) div.dataset.uid = unit.uid;

    const kws = unit ? unit.keywords : (card.keywords || []);
    const kwIconMap = { '煞車': '🛑煞車', '護盾': '🛡️護盾', '嘲諷': '🚧嘲諷', '突襲': '⚡突襲' };
    const kwBadges = kws.slice(0, 2).map((k) => `<span class="kw-badge">${kwIconMap[k] || k}</span>`).join('');

    const statusLabels = [];
    if (unit && unit.stunned) statusLabels.push('🛑 煞車中');
    if (unit && unit.shield) statusLabels.push('🛡️ 護盾');
    const statusRibbon = statusLabels.length > 0
      ? `<div class="card-status-ribbon">${statusLabels.join(' · ')}</div>`
      : '';

    const atkVal = unit ? unit.atk : card.atk;
    const hpVal = unit ? unit.hp : card.hp;
    const statsHtml = card.type === 'unit'
      ? `<span class="stat-atk">⚔️ ${atkVal}</span><span class="stat-hp">❤️ ${hpVal}</span>`
      : `<span class="stat-spell">✨ 事件・道具</span>`;

    div.innerHTML = `
      <div class="card-art-wrap">
        <img class="card-art" src="${card.img}" alt="${card.name}" loading="lazy" />
        ${inHand || !unit ? `<span class="card-cost">${card.cost}</span>` : ''}
        <div class="card-badges">${kwBadges}</div>
        ${statusRibbon}
      </div>
      <div class="card-body">
        <div class="card-name">${card.name}</div>
        <div class="card-desc">${card.desc}</div>
        <div class="card-stats">${statsHtml}</div>
      </div>
    `;

    div.addEventListener('mouseenter', () => inspectCard(card));
    return div;
  }

  function inspectCard(card) {
    if (!card) return;
    const el = document.getElementById('card-inspector');
    const factionInfo = FACTIONS[card.faction] || { name: '其他' };
    const kws = (card.keywords || []).map((k) => `<span class="tag">${k}</span>`).join('');
    const stats = card.type === 'unit'
      ? `<span class="tag">糖分 ${card.cost}</span><span class="tag">攻擊 ${card.atk}</span><span class="tag">體力 ${card.hp}</span>`
      : `<span class="tag">糖分 ${card.cost}</span><span class="tag">事件/道具</span>`;

    el.innerHTML = `
      <div class="inspector-card-preview">
        <img src="${card.img}" alt="${card.name}" />
        <div class="inspector-meta">
          <h4>${card.name}</h4>
          <div class="small muted">${factionInfo.name}</div>
          <div class="inspector-tags">${stats}${kws}</div>
        </div>
      </div>
      <p class="small">${card.desc}</p>
      <div class="inspector-quote">${card.quote}</div>
    `;
  }

  function renderAll() {
    if (!state) return;
    const isPlayerTurn = state.activeSide === 'player' && !state.gameOver;

    // 敵方主將
    document.getElementById('enemy-avatar').src = state.stage.enemyAvatar;
    document.getElementById('enemy-name').textContent = state.stage.enemyName;
    document.getElementById('enemy-title').textContent = state.stage.enemyTitle;
    document.getElementById('enemy-taunt').textContent = state.stage.taunt;
    document.getElementById('enemy-hp').textContent = state.enemy.hp;
    document.getElementById('enemy-sugar').textContent = `${state.enemy.sugar}/${state.enemy.maxSugar}`;
    document.getElementById('enemy-hand-count').textContent = state.enemy.hand.length;
    document.getElementById('enemy-deck-count').textContent = state.enemy.deck.length;

    const enemyHeroBox = document.getElementById('enemy-hero-box');
    const canHitEnemyHero = isPlayerTurn && (
      (selectedAttackerUid && !hasTaunt('enemy')) ||
      (pendingSpell && pendingSpell.card.targetType === 'enemy_any')
    );
    enemyHeroBox.classList.toggle('targetable', !!canHitEnemyHero);

    // 我方主將
    document.getElementById('player-avatar').src = 'assets/cards/char_672.png';
    document.getElementById('player-hp').textContent = state.player.hp;
    document.getElementById('player-sugar').textContent = isInfiniteSugar('player')
      ? '∞ / ∞'
      : `${state.player.sugar}/${state.player.maxSugar}`;
    document.getElementById('player-hand-count').textContent = state.player.hand.length;
    const playerDeckEl = document.getElementById('player-deck-count');
    playerDeckEl.textContent = state.player.deck.length;
    playerDeckEl.closest('.resource-pill')?.classList.toggle('danger-pill', state.player.deck.length <= 3);

    const playerHeroBox = document.getElementById('player-hero-box');
    const canBuffPlayerHero = isPlayerTurn && pendingSpell && pendingSpell.card.targetType === 'friendly_any';
    playerHeroBox.classList.toggle('friendly-targetable', !!canBuffPlayerHero);

    const skillBtn = document.getElementById('btn-hero-skill');
    if (skillBtn) {
      skillBtn.disabled = !isPlayerTurn || state.heroSkillUsed || (!isInfiniteSugar('player') && state.player.sugar < 2);
      skillBtn.classList.toggle('used', state.heroSkillUsed);
      skillBtn.textContent = state.heroSkillUsed ? '🍓 必殺技已使用' : (state.player.hp <= 15 ? '🔥 白夜叉一閃 (2糖)' : '🍓 銀時必殺技 (2糖)');
    }

    // 中央狀態列
    let turnText = `第 ${state.turn} 回合 — ${isPlayerTurn ? '你的回合' : '對手思考中…'}`;
    if (state.gameOver) {
      turnText = state.enemy.hp <= 0 ? '🏆 戰鬥結束 — 你贏了！' : '💀 戰鬥結束 — 你輸了！';
    }
    document.getElementById('turn-indicator').textContent = turnText;
    document.getElementById('btn-end-turn').disabled = !isPlayerTurn;

    const targetBanner = document.getElementById('targeting-banner');
    if (pendingSpell) {
      targetBanner.classList.remove('hidden');
      document.getElementById('targeting-text').textContent = `為【${pendingSpell.card.name}】選擇目標`;
    } else {
      targetBanner.classList.add('hidden');
    }

    // 敵方場上
    const enemyBoardEl = document.getElementById('enemy-board');
    enemyBoardEl.innerHTML = '';
    if (state.enemy.board.length === 0) {
      enemyBoardEl.innerHTML = '<span class="empty-board-hint">敵方場上目前空無一人</span>';
    } else {
      const enemyHasTaunt = hasTaunt('enemy');
      state.enemy.board.forEach((u) => {
        const canAttackThis = isPlayerTurn && selectedAttackerUid && (!enemyHasTaunt || u.keywords.includes('嘲諷'));
        const canSpellThis = isPlayerTurn && pendingSpell && (pendingSpell.card.targetType === 'enemy_unit' || pendingSpell.card.targetType === 'enemy_any' || pendingSpell.card.targetType === 'any_unit');
        const el = createCardElement(CARD_MAP[u.cardId], {
          unit: u,
          targetable: !!(canAttackThis || canSpellThis)
        });
        el.addEventListener('click', () => handleEnemyUnitClick(u.uid));
        enemyBoardEl.appendChild(el);
      });
    }

    // 我方場上
    const playerBoardEl = document.getElementById('player-board');
    playerBoardEl.innerHTML = '';
    if (state.player.board.length === 0) {
      playerBoardEl.innerHTML = '<span class="empty-board-hint">點擊下方手牌召喚萬事屋夥伴！</span>';
    } else {
      state.player.board.forEach((u) => {
        const isFriendlyTarget = isPlayerTurn && pendingSpell && (pendingSpell.card.targetType === 'friendly_unit' || pendingSpell.card.targetType === 'friendly_any' || pendingSpell.card.targetType === 'any_unit');
        const el = createCardElement(CARD_MAP[u.cardId], {
          unit: u,
          readyAttack: isPlayerTurn && u.canAttack && !pendingSpell,
          selected: selectedAttackerUid === u.uid,
          friendlyTargetable: !!isFriendlyTarget
        });
        el.addEventListener('click', () => handlePlayerUnitClick(u.uid));
        playerBoardEl.appendChild(el);
      });
    }

    // 我方手牌
    const handEl = document.getElementById('player-hand');
    handEl.innerHTML = '';
    state.player.hand.forEach((cid, idx) => {
      const card = CARD_MAP[cid];
      const playable = isPlayerTurn && (isInfiniteSugar('player') || state.player.sugar >= card.cost);
      const el = createCardElement(card, { inHand: true, playable });
      el.addEventListener('click', () => handleHandCardClick(idx));
      handEl.appendChild(el);
    });

    // 戰況紀錄
    const logEl = document.getElementById('battle-log');
    logEl.innerHTML = state.logs
      .map((l) => `<div class="log-entry ${l.kind}">${l.msg}</div>`)
      .join('');
  }

  function showResultModal(isWin) {
    const modal = document.getElementById('result-modal');
    const modalBox = document.getElementById('modal-box');
    const badge = document.getElementById('modal-badge');

    modalBox.classList.remove('win', 'lose');
    modalBox.classList.add(isWin ? 'win' : 'lose');

    badge.classList.remove('win', 'lose');
    badge.classList.add(isWin ? 'win' : 'lose');
    badge.textContent = isWin ? 'WIN · 你贏了！' : 'LOSE · 你輸了！';

    document.getElementById('modal-emoji').textContent = isWin ? '🏆' : '💀';
    document.getElementById('modal-title').textContent = isWin ? '委託達成！勝利！' : '敗北……再戰一局！';
    document.getElementById('modal-reason').textContent = state.endReason || (isWin ? '🏆 勝因：擊敗敵方主將！' : '💀 敗因：我方主將體力歸零！');

    const pool = isWin ? RESULT_QUOTES.win : RESULT_QUOTES.lose;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    document.getElementById('modal-speaker-img').src = picked.img;
    document.getElementById('modal-speaker-name').textContent = picked.speaker;
    document.getElementById('modal-quote-text').textContent = picked.text;

    const enemyReaction = isWin ? state.stage.winQuote : state.stage.loseQuote;
    document.getElementById('modal-desc').textContent = `${state.stage.enemyName}：${enemyReaction}`;

    addLog(isWin ? `🏆 戰鬥結束：你贏了！` : `💀 戰鬥結束：你輸了！`, 'system');

    let justUnlockedHidden = false;
    let justUnlockedBossAndChallenge = false;
    if (isWin && state.stage.id === 'stage_8' && !isHiddenUnlocked()) {
      localStorage.setItem(UNLOCK_KEY, '1');
      justUnlockedHidden = true;
      populateStageSelect();
      addLog('🌑 隱藏關卡已解鎖！【虛＆吉田松陽】現身！', 'system');
    }
    if (isWin && state.stage.id === 'stage_9' && !isBossUnlocked()) {
      localStorage.setItem(BOSS_UNLOCK_KEY, '1');
      justUnlockedBossAndChallenge = true;
      populateStageSelect();
      addLog('🎉 獲得神級卡牌【吉田松陽】與【虛 (Utsuro)】！並開啟【🔥 無盡挑戰賽】！', 'system');
    }
    if (state.stage.challenge) {
      if (isWin) {
        challengeStreak += 1;
        if (challengeStreak > getChallengeBest()) {
          localStorage.setItem(CHALLENGE_BEST_KEY, String(challengeStreak));
        }
        populateStageSelect();
        addLog(`🔥 挑戰賽 ${challengeStreak} 連勝達成！`, 'system');
      } else {
        challengeStreak = 0;
      }
    }

    const nextBtn = document.getElementById('btn-modal-next');
    const nextStage = STAGES[currentStageIdx + 1];
    const canGoNext = isWin && (
      state.stage.challenge ||
      (nextStage && (!nextStage.hidden || isHiddenUnlocked()) && (!nextStage.challenge || isBossUnlocked()))
    );
    nextBtn.classList.toggle('hidden', !canGoNext);
    if (state.stage.challenge) {
      nextBtn.textContent = `🔥 繼續挑戰第 ${challengeStreak + 1} 戰`;
    } else if (justUnlockedBossAndChallenge || (nextStage && nextStage.challenge)) {
      nextBtn.textContent = '🔥 進入無盡挑戰賽';
    } else if (justUnlockedHidden || (nextStage && nextStage.hidden)) {
      nextBtn.textContent = '🌑 挑戰隱藏關卡';
    } else {
      nextBtn.textContent = '挑戰下一關';
    }
    if (justUnlockedHidden) {
      document.getElementById('modal-desc').textContent = '✨ 隱藏關卡已解鎖！終極宿敵【虛＆吉田松陽】現身！';
    } else if (justUnlockedBossAndChallenge) {
      document.getElementById('modal-desc').textContent = '🎉 恭喜獲得【吉田松陽】與【虛 (Utsuro)】（可在牌組編輯使用）！並已開啟【🔥 無盡挑戰賽】！';
    }
    modal.classList.remove('hidden');
  }

  // === 牌組編輯與圖鑑 ===
  function renderDeckBuilder() {
    const poolEl = document.getElementById('deck-card-pool');
    poolEl.innerHTML = '';

    const collectible = CARDS.filter((c) => !c.bossOnly || isBossUnlocked());
    const filtered = activeDeckFilter === 'all'
      ? collectible
      : collectible.filter((c) => c.faction === activeDeckFilter);

    filtered.forEach((card) => {
      const el = createCardElement(card, { inHand: true });
      el.addEventListener('click', () => {
        if (playerDeckTemplate.length >= 20) return;
        const count = playerDeckTemplate.filter((id) => id === card.id).length;
        if (count >= 2) return;
        playerDeckTemplate.push(card.id);
        renderDeckList();
      });
      poolEl.appendChild(el);
    });

    renderDeckList();
  }

  function renderDeckList() {
    document.getElementById('deck-count').textContent = playerDeckTemplate.length;
    const listEl = document.getElementById('current-deck-list');
    listEl.innerHTML = '';

    const counts = {};
    playerDeckTemplate.forEach((id) => { counts[id] = (counts[id] || 0) + 1; });

    Object.entries(counts)
      .sort((a, b) => CARD_MAP[a[0]].cost - CARD_MAP[b[0]].cost)
      .forEach(([id, count]) => {
        const card = CARD_MAP[id];
        const row = document.createElement('div');
        row.className = 'deck-item';
        row.innerHTML = `
          <span><span class="deck-item-cost">${card.cost}</span>${card.name}</span>
          <span>x${count} ✖</span>
        `;
        row.addEventListener('click', () => {
          const idx = playerDeckTemplate.indexOf(id);
          if (idx !== -1) playerDeckTemplate.splice(idx, 1);
          renderDeckList();
        });
        listEl.appendChild(row);
      });
  }

  function renderGallery() {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '';
    CARDS.forEach((card) => {
      const div = document.createElement('div');
      div.className = 'gallery-card';
      const fName = FACTIONS[card.faction]?.name || '其他';
      const stats = card.type === 'unit'
        ? `糖分 ${card.cost} ｜ ⚔️ ${card.atk} ｜ ❤️ ${card.hp}`
        : `糖分 ${card.cost} ｜ ✨ 事件・道具`;

      div.innerHTML = `
        <img src="${card.img}" alt="${card.name}" loading="lazy" />
        <div class="gallery-card-info">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
            <strong>${card.name}</strong>
            <span class="tag">${card.bossOnly ? (isBossUnlocked() ? '✅ 已獲得・神卡' : '🔒 隱藏關卡限定') : fName}</span>
          </div>
          <div class="small muted">${stats}</div>
          <div class="small">${card.desc}</div>
          <div class="inspector-quote">${card.quote}</div>
        </div>
      `;
      grid.appendChild(div);
    });
  }

  // === 初始化綁定 ===
  function init() {
    const stageSelect = document.getElementById('stage-select');
    populateStageSelect();

    stageSelect.addEventListener('change', (e) => {
      startNewGame(Number(e.target.value));
    });

    document.getElementById('btn-new-game').addEventListener('click', () => startNewGame(currentStageIdx));
    document.getElementById('btn-end-turn').addEventListener('click', endPlayerTurn);
    document.getElementById('btn-hero-skill').addEventListener('click', useHeroSkill);
    document.getElementById('btn-cancel-target').addEventListener('click', () => {
      pendingSpell = null;
      renderAll();
    });

    document.getElementById('enemy-hero-box').addEventListener('click', handleEnemyHeroClick);
    document.getElementById('player-hero-box').addEventListener('click', handlePlayerHeroClick);

    document.getElementById('btn-sound').addEventListener('click', (e) => {
      Sound.enabled = !Sound.enabled;
      e.target.textContent = Sound.enabled ? '🔊' : '🔇';
    });

    // 分頁切換
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`view-${btn.dataset.tab}`).classList.add('active');
        if (btn.dataset.tab === 'deck') renderDeckBuilder();
        if (btn.dataset.tab === 'gallery') renderGallery();
      });
    });

    // 牌組過濾
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeDeckFilter = btn.dataset.faction;
        renderDeckBuilder();
      });
    });

    document.getElementById('btn-reset-deck').addEventListener('click', () => {
      playerDeckTemplate = [...DEFAULT_DECK];
      renderDeckList();
    });

    document.getElementById('btn-save-deck').addEventListener('click', () => {
      if (playerDeckTemplate.length !== 20) {
        alert(`牌組必須剛好 20 張！目前為 ${playerDeckTemplate.length} 張。`);
        return;
      }
      saveDeck(playerDeckTemplate);
      document.querySelector('.nav-btn[data-tab="battle"]').click();
      startNewGame(currentStageIdx);
    });

    // 結算視窗按鈕
    document.getElementById('btn-modal-retry').addEventListener('click', () => {
      document.getElementById('result-modal').classList.add('hidden');
      startNewGame(currentStageIdx);
    });

    document.getElementById('btn-modal-next').addEventListener('click', () => {
      document.getElementById('result-modal').classList.add('hidden');
      const nextIdx = Math.min(STAGES.length - 1, currentStageIdx + 1);
      stageSelect.value = nextIdx;
      startNewGame(nextIdx);
    });

    startNewGame(0);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
