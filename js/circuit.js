/* =========================================================
   基板の回路アニメーション（canvas）
   data-scene ごとに動きが変わります。

   ・既定では data-scene の値で下の PRESETS を選びます。
   ・<figure class="scene" data-scene="xxx" data-motion="glitch"> のように
     data-motion を書くと、PRESETS のキー名で動きを上書きできます。
   ========================================================= */
(function(){
  var stage = document.getElementById('stage');
  if(!stage || !document.createElement('canvas').getContext) return;

  /* ---------------------------------------------------------
     シーン別の動き（ここを編集すると動きを調整できます）
     mode    : flow / glitch / build / sync / sequence / breathe / connect
     speed   : 信号の速さ [最小, 最大] px/秒
     density : 同時に流す信号の量（配線数に対する割合）
     tail    : 信号の尾の長さ px
     scan    : セクション切替時の演出 line（横スキャン）/ radar（円形）/ none
     toCenter: true で信号が中央へ向かって流れる
     --------------------------------------------------------- */
  var PRESETS = {
    hero:     { mode:'flow',     speed:[70,160],  density:1/7,  tail:42, scan:'line'  },            // 起動：基板に電気が通る
    symptoms: { mode:'glitch',   speed:[40,140],  density:1/6,  tail:30, scan:'line', error:.2 },   // 不調：途切れる・ちらつく
    services: { mode:'build',    speed:[80,150],  density:1/8,  tail:42, scan:'none'  },            // 修理：配線がつながり直す
    why:      { mode:'flow',     speed:[35,60],   density:1/12, tail:60, scan:'radar' },            // 確認：ゆっくり丁寧に点検
    pricing:  { mode:'sync',     speed:[110,110], density:0,    tail:36, scan:'line', interval:1800, ratio:.35 }, // 明確：そろって流れる
    flow:     { mode:'sequence', speed:[170,170], density:0,    tail:50, scan:'none', steps:4 },    // 流れ：順番にバトンをつなぐ
    voice:    { mode:'breathe',  speed:[30,55],   density:1/14, tail:70, scan:'none'  },            // 快適：穏やかに呼吸する
    faq:      { mode:'flow',     speed:[60,110],  density:1/9,  tail:42, scan:'radar', toCenter:true }, // 理解：中心に集まる
    contact:  { mode:'connect',  speed:[90,140],  density:1/4,  tail:48, scan:'radar', toCenter:true }  // つなぐ：すべてが中央へ
  };

  var COLOR = { lime:'180,207,93', warn:'242,160,90', line:'200,210,240' };
  var GRID = 26;
  // スマホ用の追従ドック（index.html の .dock-canvas）
  var dockHost = document.querySelector('.dock-canvas');
  var host = stage;               // いま描画しているエリア
  var stageInView = true;
  var boost = 0;                  // スクロール速度に応じた加速
  var lastScrollY = window.scrollY || 0;
  var ripples = [];               // タップの波紋
  var DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];

  var cv = document.createElement('canvas');
  cv.className = 'circuit';
  cv.setAttribute('aria-hidden', 'true');
  stage.appendChild(cv);
  var ctx = cv.getContext('2d');
  var base = document.createElement('canvas');
  var bctx = base.getContext('2d');

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, dpr = 1, cx = 0, cy = 0;
  var traces = [], pulses = [], sparks = [];
  var P = PRESETS.hero, sceneStart = 0;
  var scan = null, mouse = null, seq = null, build = null;
  var lastSpawn = 0, lastWave = 0, lastTime = 0, raf = 0;

  function rand(a, b){ return a + Math.random() * (b - a); }

  /* ================= 配線をつくる ================= */
  function makeTraces(){
    var r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    var isDock = host !== stage;
    // 小さい画面ほど配線を細かくして密度を保つ
    GRID = isDock ? 13 : (W < 520 ? 20 : 26);
    cx = isDock ? W * .72 : W / 2;
    cy = isDock ? H / 2 : H * 0.42;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    [cv, base].forEach(function(c){ c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var cols = Math.floor(W / GRID), rows = Math.floor(H / GRID);
    var ox = (W - cols * GRID) / 2, oy = (H - rows * GRID) / 2;
    var used = {}, key = function(x, y){ return x + ',' + y; };
    traces = []; pulses = []; sparks = [];

    var tries = Math.round(cols * rows / 9);
    for(var t = 0; t < tries; t++){
      var x = 1 + Math.floor(Math.random() * (cols - 1));
      var y = 1 + Math.floor(Math.random() * (rows - 1));
      if(used[key(x, y)]) continue;
      var d = Math.floor(Math.random() * 4) * 2;
      var pts = [[x, y]]; used[key(x, y)] = 1;
      var len = 4 + Math.floor(Math.random() * 16);
      for(var i = 0; i < len; i++){
        if(Math.random() < 0.22) d = (d + (Math.random() < .5 ? 1 : 7)) % 8;
        var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if(nx < 1 || ny < 1 || nx >= cols || ny >= rows || used[key(nx, ny)]) break;
        x = nx; y = ny; used[key(x, y)] = 1; pts.push([x, y]);
      }
      if(pts.length < 3) continue;
      var p = pts.map(function(q){ return [ox + q[0] * GRID, oy + q[1] * GRID]; });
      var seg = [0], L = 0;
      for(var k = 1; k < p.length; k++){ L += Math.hypot(p[k][0] - p[k-1][0], p[k][1] - p[k-1][1]); seg.push(L); }
      var a = p[0], b = p[p.length - 1];
      traces.push({
        p: p, seg: seg, L: L,
        glowA: 0, glowB: 0, err: false, scanned: false, phase: Math.random() * 6.28,
        // 中央に近い側の端がどちらか（toCenter 用）
        endIsCenter: Math.hypot(b[0]-cx, b[1]-cy) < Math.hypot(a[0]-cx, a[1]-cy)
      });
    }

    // 下地（基板の目・配線・端子）
    bctx.clearRect(0, 0, W, H);
    bctx.fillStyle = 'rgba(' + COLOR.line + ',.07)';
    for(var gx = 0; gx <= cols; gx++) for(var gy = 0; gy <= rows; gy++){
      bctx.fillRect(ox + gx * GRID - .5, oy + gy * GRID - .5, 1, 1);
    }
    bctx.lineWidth = 1.2; bctx.lineJoin = 'round'; bctx.lineCap = 'round';
    bctx.strokeStyle = 'rgba(' + COLOR.line + ',.20)';
    traces.forEach(function(tr){
      bctx.beginPath();
      tr.p.forEach(function(q, i){ i ? bctx.lineTo(q[0], q[1]) : bctx.moveTo(q[0], q[1]); });
      bctx.stroke();
    });
    bctx.strokeStyle = 'rgba(' + COLOR.line + ',.38)';
    traces.forEach(function(tr){
      [tr.p[0], tr.p[tr.p.length - 1]].forEach(function(q){
        bctx.beginPath(); bctx.arc(q[0], q[1], 2.6, 0, Math.PI * 2); bctx.stroke();
      });
    });
  }

  /* ================= 配線上の位置 ================= */
  function pointAt(tr, s){
    s = Math.max(0, Math.min(tr.L, s));
    for(var i = 1; i < tr.seg.length; i++){
      if(s <= tr.seg[i]){
        var a = tr.p[i-1], b = tr.p[i], f = (s - tr.seg[i-1]) / (tr.seg[i] - tr.seg[i-1] || 1);
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      }
    }
    return tr.p[tr.p.length - 1];
  }
  function strokeRange(tr, a, b){
    a = Math.max(0, a); b = Math.min(tr.L, b);
    if(b <= a) return;
    var s0 = pointAt(tr, a);
    ctx.beginPath(); ctx.moveTo(s0[0], s0[1]);
    for(var i = 1; i < tr.seg.length - 1; i++){
      if(tr.seg[i] > a && tr.seg[i] < b) ctx.lineTo(tr.p[i][0], tr.p[i][1]);
    }
    var s1 = pointAt(tr, b); ctx.lineTo(s1[0], s1[1]);
    ctx.stroke();
  }
  // 信号の向きを考慮した描画・位置
  function pPos(pu, s){ return pointAt(pu.tr, pu.rev ? pu.tr.L - s : s); }
  function pStroke(pu, a, b){ pu.rev ? strokeRange(pu.tr, pu.tr.L - b, pu.tr.L - a) : strokeRange(pu.tr, a, b); }

  /* ================= 信号 ================= */
  function spawn(tr, opt){
    if(!traces.length) return;
    opt = opt || {};
    tr = tr || traces[Math.floor(Math.random() * traces.length)];
    var rev = P.toCenter ? !tr.endIsCenter : (opt.rev != null ? opt.rev : Math.random() < .5);
    pulses.push({
      tr: tr, s: 0, rev: rev,
      v: opt.v || rand(P.speed[0], P.speed[1]),
      tail: P.tail,
      color: tr.err ? COLOR.warn : COLOR.lime,
      // 不調シーン：エラー配線の途中で止まる
      stopAt: tr.err ? tr.L * rand(.35, .65) : Infinity,
      onEnd: opt.onEnd || null
    });
  }
  function burst(x, y, color, n){
    for(var i = 0; i < n; i++){
      var a = Math.random() * 6.28, v = rand(30, 110);
      sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: color });
    }
  }
  function nearestTrace(x, y){
    var best = null, bd = 1e9;
    traces.forEach(function(tr){
      var q = tr.p[0], d = (q[0]-x)*(q[0]-x) + (q[1]-y)*(q[1]-y);
      if(d < bd){ bd = d; best = tr; }
    });
    return bd < 160 * 160 ? best : null;
  }

  /* ================= シーン切替 ================= */
  function setScene(id){
    var fig = stage.querySelector('[data-scene="' + id + '"]');
    var key = (fig && fig.getAttribute('data-motion')) || id;
    P = PRESETS[key] || PRESETS.hero;
    sceneStart = performance.now();
    seq = null; build = null;

    traces.forEach(function(tr){
      tr.scanned = false;
      tr.err = P.mode === 'glitch' && Math.random() < (P.error || .2);
    });
    // 前のシーンの信号は少しだけ残して入れ替える
    pulses = pulses.slice(-6);

    if(P.scan === 'line' || P.scan === 'radar') scan = { type: P.scan, start: sceneStart };
    else scan = null;

    if(P.mode === 'build'){
      var maxEnd = 0;
      traces.forEach(function(tr){
        tr.bDelay = (tr.p[0][0] / W) * 1.1 + Math.random() * .35;
        tr.bDur = Math.max(.35, tr.L / 240);
        tr.bDone = false;
        maxEnd = Math.max(maxEnd, tr.bDelay + tr.bDur);
      });
      build = { start: sceneStart, end: maxEnd };
      pulses = [];
    }
    if(P.mode === 'sequence'){
      var longest = traces.slice().sort(function(a, b){ return b.L - a.L; }).slice(0, 14);
      var steps = [];
      var n = P.steps || 4;
      longest.sort(function(a, b){ return a.p[0][0] - b.p[0][0]; });
      for(var i = 0; i < n && longest.length; i++){
        steps.push(longest[Math.min(longest.length - 1, Math.round(i * (longest.length - 1) / Math.max(1, n - 1)))]);
      }
      seq = { steps: steps, idx: 0, next: sceneStart + 300 };
    }
    lastWave = 0;
  }

  /* ================= 毎フレーム ================= */
  function frame(now){
    raf = 0;
    if((host === stage && !stageInView) || document.hidden) return;
    var dt = Math.min(0.05, (now - (lastTime || now)) / 1000);
    lastTime = now;
    var t = (now - sceneStart) / 1000;
    boost *= Math.pow(.9, dt * 60);

    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    /* --- 下地 --- */
    if(build && t < build.end){
      // 修理：薄い下地の上に、配線を左から順に引き直す
      ctx.globalAlpha = .25; ctx.drawImage(base, 0, 0, W, H); ctx.globalAlpha = 1;
      ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(' + COLOR.line + ',.45)';
      traces.forEach(function(tr){
        var r = Math.max(0, Math.min(1, (t - tr.bDelay) / tr.bDur));
        if(r <= 0) return;
        strokeRange(tr, 0, tr.L * r);
        if(r < 1){
          var h = pointAt(tr, tr.L * r);
          ctx.fillStyle = 'rgba(' + COLOR.lime + ',1)';
          ctx.shadowColor = 'rgba(' + COLOR.lime + ',.9)'; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(h[0], h[1], 2.2, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0;
          if(Math.random() < .08) burst(h[0], h[1], COLOR.lime, 2);
        } else if(!tr.bDone){ tr.bDone = true; tr.glowB = 1; }
      });
    } else {
      ctx.drawImage(base, 0, 0, W, H);
      if(P.mode === 'connect'){
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .45;
        ctx.drawImage(base, 0, 0, W, H); ctx.restore();
      }
    }

    /* --- 不調：エラー配線を点滅 --- */
    if(P.mode === 'glitch'){
      ctx.lineWidth = 1.4;
      traces.forEach(function(tr){
        if(!tr.err) return;
        var a = Math.random() < .12 ? .05 : rand(.25, .6);
        ctx.strokeStyle = 'rgba(' + COLOR.warn + ',' + a.toFixed(2) + ')';
        strokeRange(tr, 0, tr.L);
      });
    }

    /* --- 呼吸：端子がゆっくり明滅 --- */
    if(P.mode === 'breathe'){
      traces.forEach(function(tr){
        var g = .15 + .25 * (1 + Math.sin(now / 900 + tr.phase)) / 2;
        var q = tr.p[tr.p.length - 1];
        ctx.fillStyle = 'rgba(' + COLOR.lime + ',' + g.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(q[0], q[1], 2.8, 0, 6.28); ctx.fill();
      });
    }

    /* --- つなぐ：中央のノード --- */
    if(P.mode === 'connect' || P.toCenter){
      for(var k = 0; k < 3; k++){
        var rr = ((now / 1000 + k * .8) % 2.4) / 2.4;
        ctx.strokeStyle = 'rgba(' + COLOR.lime + ',' + ((1 - rr) * (P.mode === 'connect' ? .45 : .22)).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, cy, 8 + rr * 90, 0, 6.28); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(' + COLOR.lime + ',.9)';
      ctx.shadowColor = 'rgba(' + COLOR.lime + ',.9)'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0;
    }

    /* --- マウス周辺を点灯 --- */
    if(mouse){
      ctx.save();
      ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 130, 0, 6.28); ctx.clip();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .9;
      ctx.drawImage(base, 0, 0, W, H);
      ctx.restore();
      var mg = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 130);
      mg.addColorStop(0, 'rgba(' + COLOR.lime + ',.12)'); mg.addColorStop(1, 'rgba(' + COLOR.lime + ',0)');
      ctx.fillStyle = mg; ctx.fillRect(mouse.x - 130, mouse.y - 130, 260, 260);
    }

    /* --- 切替時のスキャン --- */
    if(scan){
      var sp = (now - scan.start) / (scan.type === 'radar' ? 1700 : 1400);
      if(sp >= 1){ scan = null; }
      else if(scan.type === 'line' && host !== stage){
        // ドックでは左から右へスキャン
        var x = -40 + (W + 80) * (1 - Math.pow(1 - sp, 2));
        ctx.save(); ctx.beginPath(); ctx.rect(x - 80, 0, 80, H); ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(base, 0, 0, W, H); ctx.drawImage(base, 0, 0, W, H);
        ctx.restore();
        var xg = ctx.createLinearGradient(x - 80, 0, x, 0);
        xg.addColorStop(0, 'rgba(' + COLOR.lime + ',0)'); xg.addColorStop(1, 'rgba(' + COLOR.lime + ',.2)');
        ctx.fillStyle = xg; ctx.fillRect(x - 80, 0, 80, H);
        ctx.fillStyle = 'rgba(' + COLOR.lime + ',.7)'; ctx.fillRect(x, 0, 1, H);
        traces.forEach(function(tr){
          if(!tr.scanned && tr.p[0][0] < x){ tr.scanned = true; if(Math.random() < .35) spawn(tr); }
        });
      }
      else if(scan.type === 'line'){
        var y = -40 + (H + 80) * (1 - Math.pow(1 - sp, 2));
        ctx.save(); ctx.beginPath(); ctx.rect(0, y - 60, W, 60); ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(base, 0, 0, W, H); ctx.drawImage(base, 0, 0, W, H);
        ctx.restore();
        var sg = ctx.createLinearGradient(0, y - 60, 0, y);
        sg.addColorStop(0, 'rgba(' + COLOR.lime + ',0)'); sg.addColorStop(1, 'rgba(' + COLOR.lime + ',.16)');
        ctx.fillStyle = sg; ctx.fillRect(0, y - 60, W, 60);
        ctx.fillStyle = 'rgba(' + COLOR.lime + ',.55)'; ctx.fillRect(0, y, W, 1);
        traces.forEach(function(tr){
          if(!tr.scanned && tr.p[0][1] < y){ tr.scanned = true; if(Math.random() < .3) spawn(tr); }
        });
      } else {
        var maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
        var R = maxR * (1 - Math.pow(1 - sp, 2));
        ctx.save(); ctx.beginPath();
        ctx.arc(cx, cy, R, 0, 6.28); ctx.arc(cx, cy, Math.max(0, R - 55), 0, 6.28, true);
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(base, 0, 0, W, H); ctx.drawImage(base, 0, 0, W, H);
        ctx.restore();
        ctx.strokeStyle = 'rgba(' + COLOR.lime + ',.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.28); ctx.stroke();
        traces.forEach(function(tr){
          if(!tr.scanned && Math.hypot(tr.p[0][0]-cx, tr.p[0][1]-cy) < R){ tr.scanned = true; if(Math.random() < .25) spawn(tr); }
        });
      }
    }

    /* --- 信号 --- */
    for(var i = pulses.length - 1; i >= 0; i--){
      var pu = pulses[i];
      var v = pu.v * (1 + boost);
      if(P.mode === 'glitch' && Math.random() < .08) v = 0;           // 不調：ときどき止まる
      pu.s = Math.min(pu.s + v * dt, pu.stopAt + pu.tail + 1);
      var s = pu.s, tl = pu.tail, col = pu.color;
      var flick = P.mode === 'glitch' && Math.random() < .15 ? .3 : 1;

      ctx.lineWidth = 1.8;
      ctx.strokeStyle = 'rgba(' + col + ',' + (.18 * flick) + ')'; pStroke(pu, s - tl, s - tl * .55);
      ctx.strokeStyle = 'rgba(' + col + ',' + (.45 * flick) + ')'; pStroke(pu, s - tl * .55, s - tl * .22);
      ctx.strokeStyle = 'rgba(' + col + ',' + (.95 * flick) + ')'; pStroke(pu, s - tl * .22, Math.min(s, pu.stopAt));

      var headS = Math.min(s, pu.stopAt);
      if(headS <= pu.tr.L){
        var h = pPos(pu, headS);
        ctx.fillStyle = 'rgba(' + col + ',' + flick + ')';
        ctx.shadowColor = 'rgba(' + col + ',.9)'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(h[0], h[1], 1.9, 0, 6.28); ctx.fill();
        ctx.shadowBlur = 0;
      }

      if(s >= pu.stopAt && pu.stopAt < Infinity){
        // 不調：途中で途切れて火花
        var bp = pPos(pu, pu.stopAt);
        burst(bp[0], bp[1], COLOR.warn, 6);
        pulses.splice(i, 1);
      } else if(s - tl > pu.tr.L){
        if(pu.rev) pu.tr.glowA = 1; else pu.tr.glowB = 1;
        if(pu.onEnd) pu.onEnd(pu);
        pulses.splice(i, 1);
      }
    }

    /* --- 端子の発光 --- */
    traces.forEach(function(tr){
      [['glowA', tr.p[0]], ['glowB', tr.p[tr.p.length - 1]]].forEach(function(g){
        var v = tr[g[0]];
        if(v <= 0) return;
        var big = P.mode === 'sequence' ? 2 : 1;
        ctx.fillStyle = 'rgba(' + COLOR.lime + ',' + (v * .9).toFixed(3) + ')';
        ctx.shadowColor = 'rgba(' + COLOR.lime + ',.8)'; ctx.shadowBlur = 12 * v * big;
        ctx.beginPath(); ctx.arc(g[1][0], g[1][1], 3 * big, 0, 6.28); ctx.fill();
        ctx.shadowBlur = 0;
        tr[g[0]] = Math.max(0, v - dt * (P.mode === 'sequence' ? .5 : 1.2));
      });
    });

    /* --- タップの波紋 --- */
    for(var q = ripples.length - 1; q >= 0; q--){
      var rp = ripples[q];
      rp.life -= dt * 1.4;
      if(rp.life <= 0){ ripples.splice(q, 1); continue; }
      ctx.strokeStyle = 'rgba(' + COLOR.lime + ',' + (rp.life * .6).toFixed(3) + ')';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, (1 - rp.life) * 90 + 4, 0, 6.28); ctx.stroke();
    }

    /* --- 火花 --- */
    for(var j = sparks.length - 1; j >= 0; j--){
      var sk = sparks[j];
      sk.x += sk.vx * dt; sk.y += sk.vy * dt; sk.vy += 120 * dt; sk.life -= dt * 2.2;
      if(sk.life <= 0){ sparks.splice(j, 1); continue; }
      ctx.fillStyle = 'rgba(' + sk.color + ',' + sk.life.toFixed(3) + ')';
      ctx.fillRect(sk.x - .8, sk.y - .8, 1.6, 1.6);
    }

    /* --- シーンごとの信号の出し方 --- */
    if(P.mode === 'sync'){
      // 明確：一定間隔でそろって流れる
      if(!lastWave || now - lastWave > P.interval){
        lastWave = now;
        traces.forEach(function(tr){ if(Math.random() < P.ratio) spawn(tr, { v: P.speed[0], rev: false }); });
      }
    } else if(P.mode === 'sequence' && seq && seq.steps.length){
      // 流れ：01→02→03→04 と順番にバトンを渡す
      if(seq.next && now >= seq.next){
        var stepTr = seq.steps[seq.idx];
        seq.next = 0;
        var mySeq = seq;
        spawn(stepTr, { rev: false, onEnd: function(){
          if(seq !== mySeq) return;   // 途中でシーンが変わった
          seq.idx = (seq.idx + 1) % seq.steps.length;
          seq.next = performance.now() + (seq.idx === 0 ? 1400 : 200);
        }});
      }
      // 順番の配線をうっすら強調
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(' + COLOR.lime + ',.18)';
      seq.steps.forEach(function(tr){ strokeRange(tr, 0, tr.L); });
    } else if(!(build && t < build.end)){
      var target = Math.max(P.density ? 3 : 0, Math.round(traces.length * P.density)) + Math.round(boost * 4);
      if(pulses.length < target && now - lastSpawn > 220){ spawn(); lastSpawn = now; }
    }

    /* --- 不調：画面の一部が横にずれる --- */
    if(P.mode === 'glitch' && Math.random() < .045){
      var gy = Math.random() * H * .7, gh = rand(4, 20), gx = rand(-14, 14);
      ctx.drawImage(cv, 0, gy * dpr, W * dpr, gh * dpr, gx, gy, W, gh);
    }

    raf = requestAnimationFrame(frame);
  }
  function start(){ if(!raf && !reduce){ lastTime = 0; raf = requestAnimationFrame(frame); } }

  /* ================= イベント ================= */
  function bindPointer(el){
    if(!el) return;
    el.addEventListener('pointermove', function(e){
      if(el !== host || e.pointerType === 'touch') return;
      var r = el.getBoundingClientRect();
      var now = performance.now();
      var prev = mouse && mouse.t || 0;
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top, t: prev };
      if(now - prev > 180){
        var tr = nearestTrace(mouse.x, mouse.y);
        if(tr && pulses.length < 40) spawn(tr);
        mouse.t = now;
      }
    });
    el.addEventListener('pointerleave', function(){ mouse = null; });
    // タップ・クリック：波紋と、近くの配線からまとめて信号を出す
    el.addEventListener('pointerdown', function(e){
      if(el !== host || reduce) return;
      var r = el.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      ripples.push({ x: x, y: y, life: 1 });
      burst(x, y, COLOR.lime, 10);
      traces.slice().sort(function(a, b){
        return Math.hypot(a.p[0][0]-x, a.p[0][1]-y) - Math.hypot(b.p[0][0]-x, b.p[0][1]-y);
      }).slice(0, 6).forEach(function(tr){ spawn(tr, { rev: false }); });
      boost = Math.min(2, boost + .8);
    });
  }
  bindPointer(stage);
  bindPointer(dockHost);

  // スクロールの勢いで信号が加速する
  window.addEventListener('scroll', function(){
    var y = window.scrollY || 0;
    boost = Math.min(2.5, boost + Math.abs(y - lastScrollY) / 260);
    lastScrollY = y;
  }, { passive: true });

  // ドックの表示・非表示に合わせて描画先を切り替える
  function useHost(next){
    if(!next || next === host) return;
    host = next;
    host.appendChild(cv);
    mouse = null; ripples = [];
    makeTraces(); setScene(currentId());
    if(reduce){ ctx.clearRect(0, 0, W, H); ctx.drawImage(base, 0, 0, W, H); }
    start();
  }
  document.addEventListener('dock:toggle', function(e){
    useHost(e.detail.show && dockHost ? dockHost : stage);
  });

  document.addEventListener('scene:change', function(e){ setScene(e.detail.id); });
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) start(); });

  if('IntersectionObserver' in window){
    new IntersectionObserver(function(en){
      stageInView = en[0].isIntersecting;
      if(stageInView) start();
    }).observe(stage);
  }

  var resizeTimer = 0;
  function currentId(){
    var a = stage.querySelector('.scene.is-active');
    return a ? a.getAttribute('data-scene') : 'hero';
  }
  function onResize(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){
      makeTraces(); setScene(currentId());
      if(reduce){ ctx.clearRect(0, 0, W, H); ctx.drawImage(base, 0, 0, W, H); }
    }, 150);
  }
  if('ResizeObserver' in window){ var ro = new ResizeObserver(onResize); ro.observe(stage); if(dockHost) ro.observe(dockHost); }
  else window.addEventListener('resize', onResize);

  makeTraces();
  setScene(currentId());
  if(reduce){ ctx.drawImage(base, 0, 0, W, H); }   // 動きを減らす設定：配線だけ静止表示
  else start();
})();
