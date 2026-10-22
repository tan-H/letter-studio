/* 写信工坊 · 链接编解码
   整封信压缩后编码进 URL hash，接收方打开即读，不需要任何服务器存储。
   前缀标记压缩方式：'1' = deflate-raw，'0' = 原始 JSON（老浏览器兜底）。 */
(function (global) {
  'use strict';

  const MAGIC = '1';

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

  async function encode(obj) {
    const json = JSON.stringify(obj);
    const raw = new TextEncoder().encode(json);
    try {
      const packed = await deflate(raw);
      return MAGIC + bytesToB64Url(packed);
    } catch (e) {
      return '0' + bytesToB64Url(raw);
    }
  }

  async function decode(str) {
    if (!str) throw new Error('empty');
    const magic = str[0];
    const body = b64UrlToBytes(str.slice(1));
    let bytes;
    if (magic === MAGIC) {
      bytes = await inflate(body);
    } else {
      bytes = body;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  global.LetterCodec = { encode, decode };
})(window);
