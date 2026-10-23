/* 写信工坊 · 链接编解码
   v1（老链接，必须继续能开）：整封信的成文 JSON → deflate → base64url。
   v2（现行）：链接只带「配方」——场景、主题、种子、称呼、记忆点等原料，
              收信人用同一份 engine.js 在本地重排出完全一致的正文。
              打包规则：文本走 UTF-16LE（中文 2 字节/字），长度与数字用变长整数，
              场景与主题存下标，日期能拆就拆成年月日，回信带上原信的配方。 */
(function (global) {
  'use strict';

  /* 载荷前缀：一位字符说明后面是什么 */
  const LEGACY_RAW = '0';      // v1 未压缩 JSON
  const LEGACY_DEFLATE = '1';  // v1 deflate JSON
  const BIN_RAW = '2';         // v2 二进制
  const BIN_DEFLATE = '3';     // v2 二进制 + deflate

  /* v2 标志位 */
  const F_REPLY = 1;
  const F_MUSIC = 2;
  const F_FLOAT = 4;
  const F_UNLOCK = 8;
  const F_DATE_NUM = 16;
  const F_ORIG_RECIPE = 32;

  function bytesToB64Url(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64UrlToBytes(s) {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') throw new Error('no-compression');
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* ---------- 变长整数：低 7 位一组，最高位表示还有后续 ---------- */
  function pushVarint(out, v) {
    let n = Math.floor(v);
    if (n < 0) n = 0;
    while (n > 0x7f) {
      out.push((n & 0x7f) | 0x80);
      n = Math.floor(n / 128);
    }
    out.push(n & 0x7f);
  }

  function readVarint(bytes, pos) {
    let v = 0, mul = 1, b;
    do {
      b = bytes[pos++];
      v += (b & 0x7f) * mul;
      mul *= 128;
    } while (b & 0x80);
    return [v, pos];
  }

  /* ---------- 文本：UTF-16LE，中文 2 字节/字 ---------- */
  function pushStr(out, s) {
    const t = String(s == null ? '' : s);
    pushVarint(out, t.length);
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      out.push(c & 0xff, (c >>> 8) & 0xff);
    }
  }

  function readStr(bytes, pos) {
    let len;
    [len, pos] = readVarint(bytes, pos);
    let s = '';
    for (let i = 0; i < len; i++) {
      s += String.fromCharCode(bytes[pos] | (bytes[pos + 1] << 8));
      pos += 2;
    }
    return [s, pos];
  }

  /* ---------- 日期：能拆成年月日就拆，省下 3 个汉字 ---------- */
  function parseDate(s) {
    const m = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(String(s == null ? '' : s));
    if (!m) return null;
    const mo = +m[2], d = +m[3];
    /* 只接受无前导零的写法：只有这样拆完再拼回去才与原文逐字相同 */
    if (String(mo) !== m[2] || String(d) !== m[3]) return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y: +m[1], m: mo, d: d };
  }

  function formatDate(p) {
    return p.y + '年' + p.m + '月' + p.d + '日';
  }

  /* ---------- 与 engine.js 的协议常量对齐 ---------- */
  function sceneIndex(key) {
    const keys = global.LetterEngine.SCENE_KEYS;
    const i = keys.indexOf(key);
    return i < 0 ? 0 : i;
  }

  function themeIndex(key) {
    const keys = global.LetterEngine.THEME_KEYS;
    const i = keys.indexOf(key);
    return i < 0 ? 0 : i;
  }

  /* ---------- 配方 → 字节 ---------- */
  function packRecipe(r) {
    const out = [];
    const isReply = r.kind === 'reply';
    const dp = parseDate(r.date);

    let flags = 0;
    if (isReply) flags |= F_REPLY;
    if (r.music) flags |= F_MUSIC;
    if (r.float) flags |= F_FLOAT;
    if (r.unlock) flags |= F_UNLOCK;
    if (dp) flags |= F_DATE_NUM;
    if (isReply && r.orig && r.orig.recipe) flags |= F_ORIG_RECIPE;

    out.push(flags);
    out.push(r.lib || 1);
    out.push(isReply ? 0 : sceneIndex(r.scene));
    out.push(themeIndex(r.theme));
    pushVarint(out, isReply ? 0 : (r.seed || 0));

    if (r.unlock) pushVarint(out, Math.floor(r.unlock / 1000));
    if (dp) {
      pushVarint(out, dp.y);
      pushVarint(out, dp.m);
      pushVarint(out, dp.d);
    } else {
      pushStr(out, r.date);
    }

    pushStr(out, r.to);
    pushStr(out, r.sign);
    pushStr(out, r.rel);
    pushStr(out, r.core);

    const mems = r.mems || [];
    out.push(mems.length);
    mems.forEach(m => pushStr(out, m));

    if (isReply) {
      pushStr(out, r.body);
      if (r.orig && r.orig.recipe) {
        const sub = packRecipe(r.orig.recipe);
        pushVarint(out, sub.length);
        for (let i = 0; i < sub.length; i++) out.push(sub[i]);
      } else {
        pushStr(out, r.orig.to);
        pushStr(out, r.orig.sign);
        pushStr(out, r.orig.summary);
      }
    }

    return out;
  }

  /* ---------- 字节 → 配方 ---------- */
  function unpackRecipe(bytes, pos) {
    const flags = bytes[pos++];
    const lib = bytes[pos++];
    const sIdx = bytes[pos++];
    const tIdx = bytes[pos++];
    let seed;
    [seed, pos] = readVarint(bytes, pos);

    let unlock = 0;
    if (flags & F_UNLOCK) {
      let sec;
      [sec, pos] = readVarint(bytes, pos);
      unlock = sec * 1000;
    }

    let date;
    if (flags & F_DATE_NUM) {
      let y, m, d;
      [y, pos] = readVarint(bytes, pos);
      [m, pos] = readVarint(bytes, pos);
      [d, pos] = readVarint(bytes, pos);
      date = formatDate({ y: y, m: m, d: d });
    } else {
      [date, pos] = readStr(bytes, pos);
    }

    let to, sign, rel, core;
    [to, pos] = readStr(bytes, pos);
    [sign, pos] = readStr(bytes, pos);
    [rel, pos] = readStr(bytes, pos);
    [core, pos] = readStr(bytes, pos);

    const memCount = bytes[pos++];
    const mems = [];
    for (let i = 0; i < memCount; i++) {
      let m;
      [m, pos] = readStr(bytes, pos);
      mems.push(m);
    }

    const r = {
      kind: (flags & F_REPLY) ? 'reply' : 'letter',
      lib: lib,
      scene: global.LetterEngine.SCENE_KEYS[sIdx] || global.LetterEngine.SCENE_KEYS[0],
      theme: global.LetterEngine.THEME_KEYS[tIdx] || global.LetterEngine.THEME_KEYS[0],
      seed: seed,
      date: date,
      to: to,
      sign: sign,
      rel: rel,
      core: core,
      mems: mems,
      unlock: unlock,
      music: !!(flags & F_MUSIC),
      float: !!(flags & F_FLOAT)
    };

    if (r.kind === 'reply') {
      let body;
      [body, pos] = readStr(bytes, pos);
      r.body = body;
      if (flags & F_ORIG_RECIPE) {
        let len;
        [len, pos] = readVarint(bytes, pos);
        const sub = bytes.subarray(pos, pos + len);
        r.orig = { recipe: unpackRecipe(sub, 0)[0] };
        pos += len;
      } else {
        let oTo, oSign, summary;
        [oTo, pos] = readStr(bytes, pos);
        [oSign, pos] = readStr(bytes, pos);
        [summary, pos] = readStr(bytes, pos);
        r.orig = { to: oTo, sign: oSign, summary: summary };
      }
    }

    return [r, pos];
  }

  /* ---------- 对外 API ---------- */
  async function encode(recipe) {
    const raw = Uint8Array.from(packRecipe(recipe));
    /* 压缩只有真的更小时才用：短中文载荷上 deflate 常常反而变大 */
    try {
      const packed = await deflate(raw);
      if (packed.length < raw.length) return BIN_DEFLATE + bytesToB64Url(packed);
    } catch (e) { /* 没有 CompressionStream 就走明文 */ }
    return BIN_RAW + bytesToB64Url(raw);
  }

  async function decode(str) {
    if (!str) throw new Error('empty');
    const magic = str[0];
    const body = b64UrlToBytes(str.slice(1));
    if (magic === LEGACY_RAW) return { version: 1, letter: JSON.parse(new TextDecoder().decode(body)) };
    if (magic === LEGACY_DEFLATE) return { version: 1, letter: JSON.parse(new TextDecoder().decode(await inflate(body))) };
    if (magic === BIN_RAW) return { version: 2, recipe: unpackRecipe(body, 0)[0] };
    if (magic === BIN_DEFLATE) return { version: 2, recipe: unpackRecipe(await inflate(body), 0)[0] };
    throw new Error('bad payload');
  }

  global.LetterCodec = { encode, decode, packRecipe, unpackRecipe, parseDate, formatDate };
})(typeof window !== 'undefined' ? window : globalThis);
