/* ================================================================
   写信工坊 · 主逻辑
   两种模式：studio（写信台）/ reader（读信，链接打开时自动进入）
   ================================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = window.LetterEngine;
  const C = window.LetterCodec;

  const THEMES = [
    { key: 'rose',  name: '玫瑰', dark: false, bg: ['#fffaf2', '#fdeee6', '#f7dcd6'], env: ['#fdf3e6', '#eedcc6'], pocket: ['#f2e0c8', '#e0c8a6'], seal: ['#dd909b', '#a8505e'] },
    { key: 'sage',  name: '青竹', dark: false, bg: ['#f6fbf6', '#e9f3ea', '#d8e9da'], env: ['#f2f6ea', '#dde7d2'], pocket: ['#e4eed8', '#cddcbe'], seal: ['#8fb392', '#4f7d5c'] },
    { key: 'night', name: '暮山', dark: true,  bg: ['#2f3646', '#262c3a', '#1c212c'], env: ['#5a5f72', '#474c5d'], pocket: ['#525868', '#3d4252'], seal: ['#c98a94', '#8e4b58'] },
    { key: 'gold',  name: '鎏金', dark: false, bg: ['#fffdf6', '#faf0dc', '#f0e0c2'], env: ['#fbf1da', '#eeddb6'], pocket: ['#f4e5c2', '#e3cd9c'], seal: ['#d9a45b', '#a9762c'] }
  ];
  const THEME_MAP = {};
  THEMES.forEach(t => { THEME_MAP[t.key] = t; });

  const state = {
    scene: 'love',
    theme: 'rose',
    pages: [],
    letter: null,
    cur: 0,
    busy: false,
    opened: false,
    audio: null,
    audioOn: false
  };

  /* ---------------- 通用工具 ---------------- */
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /* **强调** → <span class="em">，其余按文本转义 */
  function paraHtml(text) {
    const parts = String(text).split(/\*\*([^*]+)\*\*/g);
    const inner = parts.map((p, i) => (i % 2 ? '<span class="em">' + esc(p) + '</span>' : esc(p))).join('');
    /* 必须用 <p> 包裹：.sheet .body p 上的行高、段间距、两端对齐都挂在 p 上 */
    return '<p>' + inner + '</p>';
  }

  function today() {
    const d = new Date();
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  /* ---------------- 写信台：场景与主题 ---------------- */
  function buildScenes() {
    const grid = $('sceneGrid');
    grid.innerHTML = '';
    E.SCENES.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene' + (s.key === state.scene ? ' on' : '');
      b.dataset.key = s.key;
      b.innerHTML = '<b>' + esc(s.name) + '</b><i>' + esc(s.hint) + '</i>';
      b.addEventListener('click', () => {
        state.scene = s.key;
        [].forEach.call(grid.children, x => x.classList.toggle('on', x.dataset.key === s.key));
        $('sceneHint').textContent = s.hint;
        regenerate();
      });
      grid.appendChild(b);
    });
    $('sceneHint').textContent = (E.SCENE_MAP[state.scene] || {}).hint || '';
  }

  function buildThemes() {
    const row = $('themeRow');
    row.innerHTML = '';
    THEMES.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme' + (t.key === state.theme ? ' on' : '') + (t.dark ? ' dark' : '');
      b.title = t.name;
      b.style.background = 'linear-gradient(160deg,' + t.bg[0] + ',' + t.bg[2] + ')';
      b.innerHTML = '<span>' + esc(t.name) + '</span>';
      b.addEventListener('click', () => {
        state.theme = t.key;
        [].forEach.call(row.children, x => x.classList.toggle('on', x.title === t.name));
        applyTheme();
      });
      row.appendChild(b);
    });
  }

  function applyTheme() {
    const t = THEME_MAP[state.theme];
    const reader = $('reader');
    reader.style.background = 'radial-gradient(120% 78% at 50% 0%,' + t.bg[0] + ' 0%,' + t.bg[1] + ' 42%,' + t.bg[2] + ' 100%)';
    const env = document.querySelector('.env-back');
    if (env) env.style.background = 'linear-gradient(165deg,' + t.env[0] + ',' + t.env[1] + ')';
    const pocket = document.querySelector('.env-pocket');
    if (pocket) pocket.style.background = 'linear-gradient(168deg,' + t.pocket[0] + ',' + t.pocket[1] + ')';
    const seal = document.querySelector('.seal');
    if (seal) seal.style.background = 'radial-gradient(circle at 34% 28%,' + t.seal[0] + ',' + t.seal[1] + ' 68%,' + t.seal[1] + ')';

    /* 深色主题下外围文字要转浅色，否则读不清 */
    reader.classList.toggle('dark-theme', !!t.dark);
  }

  /* ---------------- 写信台：生成 ---------------- */
  function collectCtx() {
    return {
      scene: state.scene,
      to: $('fTo').value.trim(),
      sign: $('fSign').value.trim(),
      rel: $('fRel').value.trim(),
      core: $('fCore').value.trim(),
      mems: $('fMems').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3),
      date: $('fDate').value.trim() || today()
    };
  }

  function regenerate() {
    const ctx = collectCtx();
    const res = E.compose(ctx, 'seed-' + ctx.scene);
    state.pages = res.pages;
    $('resultPanel').hidden = true;
  }

  function buildLetter() {
    const ctx = collectCtx();
    if (!ctx.to) {
      toast('先填一下 TA 的称呼');
      $('fTo').focus();
      return null;
    }
    if (!state.pages.length) regenerate();

    const letter = {
      v: 1,
      scene: state.scene,
      theme: state.theme,
      to: ctx.to,
      sign: ctx.sign || '你的朋友',
      rel: ctx.rel,
      date: ctx.date,
      pages: state.pages,
      unlock: $('oCapsule').checked ? ($('fUnlock').value ? new Date($('fUnlock').value).getTime() : 0) : 0,
      music: $('oMusic').checked,
      float: $('oFloat').checked,
      replyTo: null
    };
    if (!letter.unlock) letter.unlock = 0;
    return letter;
  }

  async function makeShareUrl(letter) {
    const payload = await C.encode(letter);
    const base = location.href.split('#')[0];
    return base + '#' + payload;
  }

  async function onMake() {
    const letter = buildLetter();
    if (!letter) return;
    state.letter = letter;
    const url = await makeShareUrl(letter);
    $('shareUrl').value = url;
    $('resultPanel').hidden = false;
    $('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('链接做好了，发给 TA 吧');
  }

  /* ---------------- 预览：直接进入阅读端 ---------------- */
  async function onPreview() {
    const letter = buildLetter();
    if (!letter) return;
    state.letter = letter;
    enterReader(letter);
  }

  /* ---------------- 阅读端 ---------------- */
  const book = $('book');
  const bookWrap = $('bookWrap');
  const dotsEl = $('dots');
  const pageEls = [];

  function buildBook(letter) {
    book.innerHTML = '';
    dotsEl.innerHTML = '';
    pageEls.length = 0;
    const N = letter.pages.length;

    letter.pages.forEach((paras, i) => {
      const page = document.createElement('div');
      page.className = 'page';
      page.style.zIndex = 1000 - i;

      const front = document.createElement('div');
      front.className = 'face front';
      const sheet = document.createElement('div');
      sheet.className = 'sheet';

      const orn = document.createElement('div');
      orn.className = 'orn';
      orn.textContent = '❦ ❦ ❦';

      const to = document.createElement('div');
      to.className = i === 0 ? 'to' : 'to cont';
      to.textContent = i === 0 ? ('亲爱的' + letter.to + '：') : ('致 ' + letter.to);

      const body = document.createElement('div');
      body.className = 'body';
      body.innerHTML = paras.map(paraHtml).join('');

      sheet.appendChild(orn);
      sheet.appendChild(to);
      sheet.appendChild(body);

      if (i === N - 1) {
        const sign = document.createElement('div');
        sign.className = 'sign';
        sign.innerHTML = esc(letter.sign) + '<br><span class="date">' + esc(letter.date) + '</span>';
        sheet.appendChild(sign);
      }
      const pgnum = document.createElement('div');
      pgnum.className = 'pgnum';
      pgnum.textContent = (i + 1) + ' / ' + N;
      sheet.appendChild(pgnum);

      front.appendChild(sheet);
      page.appendChild(front);
      const back = document.createElement('div');
      back.className = 'face back';
      page.appendChild(back);
      book.appendChild(page);
      pageEls.push(page);

      const dot = document.createElement('i');
      dot.addEventListener('click', () => jump(i));
      dotsEl.appendChild(dot);
    });
  }

  function layout() {
    /* clientHeight 含 padding，要扣掉上下留白才是书真正能占的高度 */
    const cs = getComputedStyle(bookWrap);
    const avail = bookWrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 6;
    if (avail <= 0) return;
    /* .body 是 flex 子项会被纵向拉满，scrollHeight 量到的是填充高度而非内容高度。
       改用「正文最后一行的底边」作为内容真实高度：
       sheet padding-top 28 + orn(绝对定位不计) + to + body 内容 */
    let max = 0;
    [].forEach.call(book.querySelectorAll('.page'), page => {
      const body = page.querySelector('.body');
      if (!body) return;
      let contentH = 0;
      const ps = body.querySelectorAll('p');
      if (ps.length) {
        const first = ps[0].getBoundingClientRect();
        const last = ps[ps.length - 1].getBoundingClientRect();
        contentH = last.bottom - first.top;
        /* 段间距 margin-bottom 是折叠掉的，按行高补齐 */
        const lh = parseFloat(getComputedStyle(ps[0]).lineHeight) || 24;
        contentH += lh * 0.05 * (ps.length - 1);
      }
      const to = page.querySelector('.to');
      if (to) contentH += to.offsetHeight + 20;   /* margin 6 上 + 14 下 */
      const sign = page.querySelector('.sign');
      if (sign) contentH += sign.offsetHeight + 18;
      const pg = page.querySelector('.pgnum');
      if (pg) contentH += pg.offsetHeight + 10;
      contentH += 48;  /* sheet padding 28 上 + 20 下 */
      max = Math.max(max, contentH);
    });
    book.style.height = Math.max(200, Math.min(max, avail, 640)) + 'px';
  }

  function updateUI() {
    const N = state.letter.pages.length;
    $('progressBar').style.width = ((state.cur + 1) / N * 100) + '%';
    $('btnPrev').disabled = (state.cur === 0);
    $('btnNext').disabled = (state.cur === N - 1);
    const dots = dotsEl.children;
    for (let i = 0; i < dots.length; i++) {
      dots[i].className = i === state.cur ? 'on' : (i < state.cur ? 'done' : '');
    }
  }

  function turn(i, forward) {
    const el = pageEls[i];
    el.style.zIndex = 3000;
    el.classList.add('turning');
    if (forward) {
      el.classList.add('flipped');
    } else {
      el.style.visibility = 'visible';
      void el.offsetWidth;
      el.classList.remove('flipped');
    }
    setTimeout(() => {
      el.classList.remove('turning');
      el.style.zIndex = forward ? (i + 1) : (1000 - i);
      if (forward) el.style.visibility = 'hidden';
    }, 920);
  }

  function unlock(delay) {
    clearTimeout(unlock._t);
    unlock._t = setTimeout(() => { state.busy = false; }, delay);
  }

  function go(dir) {
    if (state.busy) return;
    const N = state.letter.pages.length;
    if (dir > 0) {
      if (state.cur >= N - 1) return;
      state.busy = true;
      turn(state.cur, true);
      state.cur++;
      unlock(940);
    } else {
      if (state.cur <= 0) return;
      state.busy = true;
      state.cur--;
      turn(state.cur, false);
      unlock(940);
    }
    updateUI();
  }

  function jump(target) {
    if (state.busy || target === state.cur) return;
    state.busy = true;
    const from = state.cur;
    if (target > from) {
      for (let i = from; i < target; i++) setTimeout(() => turn(i, true), (i - from) * 70);
      state.cur = target;
    } else {
      for (let i = from - 1; i >= target; i--) setTimeout(() => turn(i, false), (from - 1 - i) * 70);
      state.cur = target;
    }
    updateUI();
    unlock(Math.abs(target - from) * 70 + 950);
  }

  /* ---------------- 轻音乐：WebAudio 合成，无外部音频文件 ---------------- */
  function startMusic() {
    if (state.audio) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    gain.connect(ctx.destination);

    /* 简单琶音：五声音阶循环，用三角波模拟八音盒 */
    const notes = [523.25, 587.33, 659.25, 783.99, 880.00];
    let step = 0;
    const tick = () => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = notes[step % notes.length];
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      osc.connect(g);
      g.connect(gain);
      osc.start(t);
      osc.stop(t + 1.7);
      step++;
    };
    tick();
    state.audio = { ctx, gain, timer: setInterval(tick, 720) };
    state.audioOn = true;
    $('btnMusic').hidden = false;
  }

  function stopMusic() {
    if (!state.audio) return;
    clearInterval(state.audio.timer);
    try { state.audio.ctx.close(); } catch (e) { /* 已关闭则忽略 */ }
    state.audio = null;
    state.audioOn = false;
  }

  function toggleMusic() {
    if (state.audioOn) {
      stopMusic();
      $('btnMusic').style.opacity = .45;
    } else {
      startMusic();
      $('btnMusic').style.opacity = 1;
    }
  }

  /* ---------------- 背景飘浮的心 ---------------- */
  function initBg(count) {
    const bg = $('bg');
    if (!bg) return;
    bg.innerHTML = '';
    const glyphs = ['♥', '♡', '♥', '❦'];
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.textContent = glyphs[i % glyphs.length];
      s.style.left = (Math.random() * 96) + '%';
      s.style.fontSize = (10 + Math.random() * 14) + 'px';
      s.style.animationDuration = (13 + Math.random() * 12) + 's';
      s.style.animationDelay = (-Math.random() * 20) + 's';
      s.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
      s.style.setProperty('--rot', (Math.random() * 300 - 150) + 'deg');
      bg.appendChild(s);
    }
  }

  /* ---------------- 时间胶囊 ---------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function startCountdown(target) {
    const box = $('countdown');
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        /* 到期：收起胶囊页，把信封让出来（不自动开信，交给用户点击） */
        $('capsule').hidden = true;
        $('stage').classList.remove('hide');
        $('hint').classList.remove('hide');
        clearInterval(tick._t);
        return;
      }
      const s = Math.floor(diff / 1000);
      const d = Math.floor(s / 86400);
      const hh = Math.floor(s % 86400 / 3600);
      const mm = Math.floor(s % 3600 / 60);
      const ss = s % 60;
      box.innerHTML =
        '<div><b>' + d + '</b><span>天</span></div>' +
        '<div><b>' + pad(hh) + '</b><span>时</span></div>' +
        '<div><b>' + pad(mm) + '</b><span>分</span></div>' +
        '<div><b>' + pad(ss) + '</b><span>秒</span></div>';
    };
    tick();
    tick._t = setInterval(tick, 1000);
  }

  /* ---------------- 进入阅读端 ---------------- */
  function enterReader(letter) {
    state.letter = letter;
    state.cur = 0;
    state.busy = false;
    state.opened = false;

    $('studio').hidden = true;
    $('topbar').hidden = true;
    $('reader').hidden = false;
    document.body.classList.add('reading');

    state.theme = letter.theme && THEME_MAP[letter.theme] ? letter.theme : 'rose';
    applyTheme();

    $('rTitle').textContent = letter.title || '写给你的信';
    $('peek').textContent = '致 ' + letter.to;
    $('coverText').textContent = '致 ' + letter.to;

    /* 回信：顶部提示这是回信，并可展开原信摘要 */
    if (letter.replyTo) {
      const bar = $('rTitle');
      bar.textContent = 'TA 给你的回信';
      let tip = $('replyTip');
      if (!tip) {
        tip = document.createElement('div');
        tip.className = 'reply-tip';
        tip.id = 'replyTip';
        $('reader').insertBefore(tip, $('bookWrap'));
      }
      tip.hidden = false;
      tip.innerHTML = '<span>你收到的是一封回信 · 原信写给「' + esc(letter.replyTo.to || 'TA') + '」</span>' +
        (letter.replyTo.summary ? '<em>' + esc(letter.replyTo.summary) + '</em>' : '');
    } else {
      const tip = $('replyTip');
      if (tip) tip.hidden = true;
    }

    buildBook(letter);
    initBg(letter.float === false ? 0 : (window.innerWidth < 500 ? 11 : 16));

    $('capsule').hidden = true;
    $('stage').classList.remove('hide', 'opening');
    $('envelope').classList.remove('open');
    $('hint').classList.remove('hide');
    $('bookWrap').classList.remove('show');
    /* 收到原信的人可以回信；已经是一封回信时不再显示 */
    $('btnReply').hidden = !!letter.replyTo;
    /* 控件区在拆信前隐藏，避免翻页按钮提前露出 */
    $('ctrlWrap').hidden = true;
    $('progressWrap').hidden = true;

    stopMusic();
    $('btnMusic').hidden = true;
    $('btnMusic').style.opacity = 1;

    if (letter.unlock && letter.unlock > Date.now()) {
      const d = new Date(letter.unlock);
      $('capTitle').textContent = '这封信还在路上';
      $('capDesc').textContent = '写这封信的人约好了，等 ' +
        d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) +
        ' 才能拆开。';
      $('capFoot').textContent = '到时候刷新这个页面就好。';
      $('capsule').hidden = false;
      $('stage').classList.add('hide');
      startCountdown(letter.unlock);
    }
    updateUI();
  }

  function exitReader() {
    $('reader').hidden = true;
    $('studio').hidden = false;
    $('topbar').hidden = false;
    document.body.classList.remove('reading');
    stopMusic();
  }

  /* ---------------- 回信 ---------------- */
  function openReply() {
    const L = state.letter;
    $('rBody').value = '';
    $('rSign').value = L.to;
    $('replyOut').hidden = true;
    $('replyModal').hidden = false;
  }

  async function sendReply() {
    const L = state.letter;
    const body = $('rBody').value.trim();
    if (!body) { toast('写点什么再发吧'); return; }
    const reply = {
      v: 1,
      scene: 'love',
      theme: L.theme,
      to: L.sign || 'TA',
      sign: $('rSign').value.trim() || L.to,
      rel: '',
      date: today(),
      pages: [
        ['**回信**', body],
        ['这封信我是收到了的。', '——' + ($('rSign').value.trim() || L.to)]
      ],
      unlock: 0,
      music: L.music,
      float: L.float,
      replyTo: { from: L.to, to: L.sign, summary: (L.pages[0] || []).join(' ').slice(0, 80) }
    };
    const url = await makeShareUrl(reply);
    $('replyUrl').value = url;
    $('replyOut').hidden = false;
    state.replyLetter = reply;
    toast('回信链接做好了');
  }

  async function onReplyShare() {
    const url = $('replyUrl').value;
    const letter = state.replyLetter;
    if (!url || !letter) return;
    const payload = {
      title: '给你的回信',
      text: '收到了你的信，也给你回了一封。\n\n点开看看：\n' + url,
      url: url
    };
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(payload.text);
      toast('已复制回信文案');
    } catch (err) {
      $('replyUrl').select();
      toast('请手动复制链接');
    }
  }

  /* ---------------- 分享：系统分享 / 复制 / 打印信纸 ---------------- */
  function shareText(letter, url) {
    return '我给你写了一封信。\n\n' +
      '亲爱的' + letter.to + '，\n' +
      (letter.pages[0] || []).join('\n') + '\n\n' +
      '点开链接就能拆开：\n' + url;
  }

  async function onShare() {
    const url = $('shareUrl').value;
    const letter = state.letter;
    if (!url || !letter) return;
    const payload = {
      title: '写给你的信',
      text: shareText(letter, url),
      url: url
    };
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareText(letter, url));
      toast('已复制分享文案，去微信粘贴给 TA');
    } catch (err) {
      $('shareUrl').select();
      toast('请手动复制链接');
    }
  }

  /* 打印信纸：把内容排成可打印的一页，便于手写或邮寄 */
  function onPrint() {
    const letter = state.letter;
    if (!letter) return;
    const pages = letter.pages.map((paras, i) =>
      '<section class="pp"><h3>' + (i === letter.pages.length - 1 ? '' : '') + '</h3>' +
      paras.map(p => '<p>' + esc(p).replace(/\*\*([^*]+)\*\*/g, '<em>$1</em>') + '</p>').join('') +
      (i === letter.pages.length - 1
        ? '<p class="sign">' + esc(letter.sign) + '<br><span>' + esc(letter.date) + '</span></p>'
        : '') +
      '</section>'
    ).join('');

    const w = window.open('', '_blank');
    if (!w) { toast('浏览器拦截了打印窗口，请允许弹窗'); return; }
    w.document.write(
      '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
      '<title>写给你的信</title><style>' +
      'body{font-family:"Kaiti SC","STKaiti","KaiTi",serif;color:#4a3a33;margin:0;padding:28px;background:#fffdf8}' +
      'h1{font-size:20px;text-align:center;letter-spacing:.2em;margin:0 0 6px}' +
      '.meta{text-align:center;font-size:12px;color:#8a786d;margin-bottom:22px}' +
      '.pp{page-break-after:always;padding:10px 0}' +
      '.pp:last-child{page-break-after:auto}' +
      'p{font-size:16px;line-height:2;text-align:justify;margin:0 0 1em}' +
      'em{color:#a8505e;font-style:normal;font-weight:600}' +
      '.sign{text-align:right;margin-top:20px}' +
      '.sign span{font-size:13px;color:#8a786d}' +
      '@media print{body{background:#fff;padding:0}}' +
      '</style></head><body>' +
      '<h1>写给你的信</h1><div class="meta">致 ' + esc(letter.to) + ' · ' + esc(letter.date) + '</div>' +
      pages + '</body></html>'
    );
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) { /* 用户可自行打印 */ } }, 300);
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    $('btnMake').addEventListener('click', onMake);
    $('btnPreview').addEventListener('click', onPreview);
    $('btnCopy').addEventListener('click', async () => {
      const v = $('shareUrl').value;
      try {
        await navigator.clipboard.writeText(v);
        toast('链接已复制');
      } catch (e) {
        $('shareUrl').select();
        toast('请手动复制（Ctrl+C）');
      }
    });
    $('btnOpenNew').addEventListener('click', () => {
      if (state.letter) window.open(location.href.split('#')[0] + '#' + location.hash.split('#')[1], '_blank');
    });
    $('btnShare').addEventListener('click', onShare);
    $('btnPrint').addEventListener('click', onPrint);

    $('oCapsule').addEventListener('change', () => {
      $('capsuleRow').hidden = !$('oCapsule').checked;
    });

    $('btnBack').addEventListener('click', () => {
      if (state.opened && !confirm('回到写信台？正在读的这封信会保留在链接里。')) return;
      exitReader();
    });
    $('btnMusic').addEventListener('click', toggleMusic);
    $('btnPrev').addEventListener('click', () => go(-1));
    $('btnNext').addEventListener('click', () => go(1));

    $('btnReply').addEventListener('click', openReply);
    $('btnReplyCancel').addEventListener('click', () => { $('replyModal').hidden = true; });
    $('btnReplySend').addEventListener('click', sendReply);
    $('btnReplyCopy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('replyUrl').value);
        toast('回信链接已复制');
      } catch (e) {
        $('replyUrl').select();
        toast('请手动复制（Ctrl+C）');
      }
    });
    $('btnReplyShare').addEventListener('click', onReplyShare);

    $('btnAbout').addEventListener('click', () => { $('aboutModal').hidden = false; });
    $('btnAboutClose').addEventListener('click', () => { $('aboutModal').hidden = true; });
    $('aboutModal').addEventListener('click', e => {
      if (e.target === $('aboutModal')) $('aboutModal').hidden = true;
    });

    /* 输入即重算 */
    ['fTo', 'fSign', 'fRel', 'fCore', 'fMems'].forEach(id => {
      $(id).addEventListener('input', regenerate);
    });

    /* 手势翻页 */
    let sx = 0, sy = 0, axis = null;
    bookWrap.addEventListener('touchstart', e => {
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; axis = null;
    }, { passive: true });
    bookWrap.addEventListener('touchmove', e => {
      const t = e.touches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (axis === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (axis === 'x' && e.cancelable) e.preventDefault();
    }, { passive: false });
    bookWrap.addEventListener('touchend', e => {
      if (axis !== 'x') return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1);
    });

    document.addEventListener('keydown', e => {
      if (!$('reader').hidden) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(1);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(-1);
        if ((e.key === 'Enter' || e.key === ' ') && !state.opened) openEnvelope();
      }
    });

    $('envelope').addEventListener('click', openEnvelope);
    $('envelope').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEnvelope(); }
    });

    window.addEventListener('resize', () => { if (!$('reader').hidden) setTimeout(layout, 120); });
  }

  /* ---------------- 开信封 ---------------- */
  function openEnvelope() {
    if (state.opened) return;
    state.opened = true;
    $('stage').classList.add('opening');
    $('hint').classList.add('hide');
    $('envelope').classList.add('open');
    setTimeout(() => {
      $('stage').classList.add('hide');
      $('bookWrap').classList.add('show');
      $('ctrlWrap').hidden = false;
      $('progressWrap').hidden = false;
      setTimeout(layout, 30);
      const tip = $('swipeTip');
      tip.classList.add('show');
      setTimeout(() => tip.classList.remove('show'), 3600);
      if (state.letter.music) startMusic();
    }, 1650);
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    buildScenes();
    buildThemes();
    bind();
    $('fDate').value = today();
    regenerate();

    const hash = location.hash.replace(/^#/, '');
    if (hash) {
      try {
        const letter = await C.decode(hash);
        if (letter && letter.pages && letter.pages.length) {
          enterReader(letter);
          return;
        }
      } catch (e) {
        toast('这个链接好像不完整');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
