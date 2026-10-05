(function(){
  var sections = Array.prototype.slice.call(document.querySelectorAll('.panel-scroll .section'));
  var scenes = document.querySelectorAll('.scene');
  var list = document.getElementById('idx-list');
  var now = document.getElementById('idx-now');
  var label = document.getElementById('idx-label');
  var pad = function(n){ return (n < 10 ? '0' : '') + n; };
  document.getElementById('idx-total').textContent = pad(sections.length);

  // 左パネルの進捗ナビを生成
  var links = sections.map(function(s){
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '#' + s.id;
    a.setAttribute('aria-label', s.getAttribute('data-label'));
    a.appendChild(document.createElement('span'));
    li.appendChild(a); list.appendChild(li);
    return a;
  });

  function activate(id){
    var i = sections.findIndex(function(s){ return s.id === id; });
    if(i < 0) return;
    scenes.forEach(function(sc){ sc.classList.toggle('is-active', sc.getAttribute('data-scene') === id); });
    links.forEach(function(a, j){
      a.classList.toggle('is-active', j === i);
      if(j === i) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    now.textContent = pad(i + 1);
    label.textContent = sections[i].getAttribute('data-label');
    // canvas（回路アニメーション）へセクション切替を通知
    document.dispatchEvent(new CustomEvent('scene:change', { detail: { id: id, index: i } }));
  }

  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){ if(en.isIntersecting) activate(en.target.id); });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
    sections.forEach(function(s){ io.observe(s); });
  }
  activate('hero');
})();

/* =========================================================
   MOTION
   ========================================================= */
(function(){
  var root = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. 読み込み時
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ root.classList.add('is-loaded'); }); });

  // 2. スクロールでフェードイン（対象に自動で .reveal を付与）
  var groups = [
    '.sec-head', '.sec-title', '.sec-lead', '.sec-img', '.note', '.free', '.price-h',
    '.contact-box', '.foot > *',
    '.acc details', '.svc li', '.why li', '.flow li', '.voice li', '.faq details', 'tbody tr'
  ];
  var targets = document.querySelectorAll('.panel-scroll .section:not(.hero) ' + groups.join(', .panel-scroll .section:not(.hero) ') + ', .foot > *');
  // 同じ親の中で順番に遅らせる
  Array.prototype.forEach.call(targets, function(el){
    el.classList.add('reveal');
    var sibs = Array.prototype.filter.call(el.parentNode.children, function(c){ return c.matches && c.matches(groups.join(',')); });
    var i = sibs.indexOf(el);
    el.style.setProperty('--i', Math.min(i < 0 ? 0 : i, 6));
  });

  if(reduce || !('IntersectionObserver' in window)){
    Array.prototype.forEach.call(targets, function(el){ el.classList.add('is-in'); });
  } else {
    var ro = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){
          en.target.classList.add('is-in');
          ro.unobserve(en.target);
          if(en.target.tagName === 'TR') countUp(en.target.lastElementChild);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
    Array.prototype.forEach.call(targets, function(el){ ro.observe(el); });
  }

  // 4. 料金のカウントアップ
  function countUp(td){
    if(!td || reduce) return;
    var m = td.textContent.match(/([\d,]+)/);
    if(!m) return;
    var end = parseInt(m[1].replace(/,/g,''), 10);
    var before = td.textContent.slice(0, m.index), after = td.textContent.slice(m.index + m[1].length);
    var start = null, dur = 900;
    function step(t){
      if(!start) start = t;
      var p = Math.min((t - start) / dur, 1);
      var v = Math.round(end * (1 - Math.pow(1 - p, 3)) / 100) * 100;
      if(p === 1) v = end;
      td.textContent = before + v.toLocaleString('ja-JP') + after;
      if(p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // 3. 左パネルの番号・ラベル切替を滑らかに
  var now = document.getElementById('idx-now');
  var label = document.getElementById('idx-label');
  if(now && label && 'MutationObserver' in window && !reduce){
    var busy = false;
    new MutationObserver(function(){
      if(busy) return; busy = true;
      now.classList.add('is-changing'); label.classList.add('is-changing');
      setTimeout(function(){ now.classList.remove('is-changing'); label.classList.remove('is-changing'); busy = false; }, 180);
    }).observe(now, { childList: true });
  }
})();

/* =========================================================
   ハンバーガーメニュー・文字サイズ・表示モード
   ========================================================= */
(function(){
  var root = document.documentElement;
  var drawer = document.getElementById('drawer');
  var overlay = document.querySelector('.drawer-overlay');
  var openers = document.querySelectorAll('.menu-btn');
  var lastFocus = null;

  function save(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }

  // ---- 開閉 ----
  function openMenu(){
    lastFocus = document.activeElement;
    drawer.hidden = false; overlay.hidden = false;
    requestAnimationFrame(function(){ drawer.classList.add('is-open'); overlay.classList.add('is-open'); });
    root.classList.add('menu-open');
    openers.forEach(function(b){ b.setAttribute('aria-expanded','true'); });
    syncCurrent();
    setTimeout(function(){ drawer.querySelector('.drawer-close').focus(); }, 50);
  }
  function closeMenu(){
    drawer.classList.remove('is-open'); overlay.classList.remove('is-open');
    root.classList.remove('menu-open');
    openers.forEach(function(b){ b.setAttribute('aria-expanded','false'); });
    setTimeout(function(){ drawer.hidden = true; overlay.hidden = true; }, 450);
    if(lastFocus) lastFocus.focus();
  }
  openers.forEach(function(b){ b.addEventListener('click', openMenu); });
  document.querySelectorAll('[data-close]').forEach(function(el){ el.addEventListener('click', closeMenu); });
  drawer.querySelectorAll('.drawer-nav a, [data-close-link]').forEach(function(a){ a.addEventListener('click', closeMenu); });

  // Esc で閉じる／Tab をメニュー内に留める
  document.addEventListener('keydown', function(e){
    if(drawer.hidden) return;
    if(e.key === 'Escape'){ closeMenu(); return; }
    if(e.key === 'Tab'){
      var f = drawer.querySelectorAll('a[href],button:not([disabled])');
      var first = f[0], last = f[f.length - 1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  });

  // 今見ているセクションをメニューでも強調
  function syncCurrent(){
    var label = document.getElementById('idx-now');
    var i = label ? parseInt(label.textContent, 10) - 1 : -1;
    drawer.querySelectorAll('.drawer-nav a').forEach(function(a, j){
      if(j === i) a.setAttribute('aria-current','true'); else a.removeAttribute('aria-current');
    });
  }

  // ---- 文字サイズ ----
  var fontBtns = drawer.querySelectorAll('[data-font]');
  function setFont(v){
    root.setAttribute('data-font', v);
    fontBtns.forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-font') === v)); });
  }
  fontBtns.forEach(function(b){
    b.addEventListener('click', function(){ var v = b.getAttribute('data-font'); setFont(v); save('tr-font', v); });
  });
  setFont(root.getAttribute('data-font') || 'm');

  // ---- デイ／ナイト ----
  var themeBtns = drawer.querySelectorAll('[data-theme-set]');
  var meta = document.querySelector('meta[name="theme-color"]');
  if(!meta){ meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  function setTheme(v){
    root.setAttribute('data-theme', v);
    meta.content = v === 'night' ? '#0E1426' : '#F5F5F2';
    themeBtns.forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === v)); });
  }
  themeBtns.forEach(function(b){
    b.addEventListener('click', function(){ var v = b.getAttribute('data-theme-set'); setTheme(v); save('tr-theme', v); });
  });
  setTheme(root.getAttribute('data-theme') || 'day');
})();

/* =========================================================
   スマホ用：追従ドック
   - ヒーロー画像が画面外に出たら、上部に回路アニメ＋現在地を表示
   ========================================================= */
(function(){
  var dock = document.querySelector('.dock');
  var stage = document.getElementById('stage');
  if(!dock || !stage) return;
  var mq = window.matchMedia('(max-width: 860px)');
  var num = dock.querySelector('.dock-num');
  var label = dock.querySelector('.dock-label');
  var cap = dock.querySelector('.dock-cap');
  var bar = dock.querySelector('.dock-bar i');
  var stageVisible = true, shown = false;

  function update(){
    var show = mq.matches && !stageVisible;
    if(show === shown) return;
    shown = show;
    dock.classList.toggle('is-show', show);
    document.dispatchEvent(new CustomEvent('dock:toggle', { detail: { show: show } }));
  }
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(en){
      stageVisible = en[0].isIntersecting;
      update();
    }, { rootMargin: '-60px 0px 0px 0px' }).observe(stage);
  }
  if(mq.addEventListener) mq.addEventListener('change', update);

  // セクション切替で表示を更新
  document.addEventListener('scene:change', function(e){
    var id = e.detail.id, i = e.detail.index;
    var sec = document.getElementById(id);
    var fig = stage.querySelector('[data-scene="' + id + '"] .scene-text p');
    document.querySelectorAll('.section.is-current').forEach(function(s){ s.classList.remove('is-current'); });
    if(sec) sec.classList.add('is-current');
    dock.classList.add('is-changing');
    setTimeout(function(){
      num.textContent = (i < 9 ? '0' : '') + (i + 1);
      label.textContent = sec ? sec.getAttribute('data-label') : '';
      cap.textContent = fig ? fig.textContent : '';
      dock.classList.remove('is-changing');
    }, 200);
  });

  // ページ全体の進み具合
  var ticking = false;
  window.addEventListener('scroll', function(){
    if(ticking) return; ticking = true;
    requestAnimationFrame(function(){
      var max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, scrollY / max) : 0) + ')';
      ticking = false;
    });
  }, { passive: true });
})();
