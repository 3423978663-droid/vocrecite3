#!/usr/bin/env node
// 生成本地词库 web/public/data/dict-3500.json（中考 + 高考约 3900 词，含音标/词性/中文释义）。
// 数据来源（开源）：https://github.com/C3H3-AI/vocab-wordbank
// 运行方式（可选，词库文件已随项目提供，通常无需重跑）：
//   cd web && node scripts/build-dict.js
const fs = require('fs');
const path = require('path');

const API = 'https://api.github.com/repos/C3H3-AI/vocab-wordbank/contents/wordbanks/';

async function fetchJson(name) {
  const r = await fetch(API + name, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'readvocab-build-dict' },
  });
  if (!r.ok) throw new Error('下载失败 ' + name + '，HTTP ' + r.status);
  const meta = await r.json();
  return JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8'));
}

const MARKERS = ['vt', 'vi', 'adj', 'adv', 'prep', 'conj', 'pron', 'num', 'art', 'int', 'aux', 'abbr', 'det', 'n', 'v', 'a'];
const markerAlt = MARKERS.join('|');
const posRe = new RegExp('^\\s*(' + markerAlt + ')\\.\\s*');
const nextRe = new RegExp('\\s+(?=(?:' + markerAlt + ')\\.\\s+)');

function clean(t) {
  t = (t || '').replace(/\s+/g, ' ').trim();
  return t.replace(/\s*([，。；：、])\s*/g, '$1');
}

function preprocess(text) {
  return (text || '')
    .replace(/\bindefinite\s+article\b/gi, 'art')
    .replace(/\bdefinite\s+article\b/gi, 'art')
    .replace(/\barticle\b/gi, 'art')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDef(text) {
  text = preprocess(text);
  const segs = [];
  let rest = text;
  while (rest) {
    const m = rest.match(posRe);
    if (!m) {
      const leftover = clean(rest);
      if (leftover) {
        if (segs.length) segs[segs.length - 1][1] = clean(segs[segs.length - 1][1] + ' ' + leftover);
        else segs.push(['', leftover]);
      }
      break;
    }
    const pos = m[1];
    rest = rest.slice(m[0].length);
    const nxt = rest.match(nextRe);
    let zh;
    if (nxt) {
      zh = clean(rest.slice(0, nxt.index));
      rest = rest.slice(nxt.index);
    } else {
      zh = clean(rest);
      rest = '';
    }
    if (zh || pos) segs.push([pos, zh]);
  }
  return segs;
}

function score(z) {
  const zz = z.replace(/\s+/g, '');
  return (zz.match(/；/g) || []).length
    + (zz.match(/，/g) || []).length
    + (zz.match(/、/g) || []).length * 0.5
    + zz.length * 0.01;
}

function penalty(z) {
  return Math.abs((z.match(/\(/g) || []).length - (z.match(/\)/g) || []).length) * 3
    + Math.abs((z.match(/（/g) || []).length - (z.match(/）/g) || []).length) * 3;
}

function best(variants) {
  const seen = [];
  for (const v of variants) if (!seen.includes(v)) seen.push(v);
  if (!seen.length) return '';
  let out = seen[0];
  let outScore = score(out) - penalty(out);
  for (const v of seen) {
    const sc = score(v) - penalty(v);
    if (sc > outScore) { out = v; outScore = sc; }
  }
  return out;
}

(async () => {
  // 释义来源：初中(中考) + 高中(高考)
  const defSources = ['junior.json', 'senior.json'];
  // 音标来源（有表头，需跳过第一行）
  const phSources = [
    ['gaokao-3500.json', true],
    ['gaokao-michael.json', true],
    ['gaokao-24days.json', true],
    ['gaokao-core-20days.json', true],
    ['primary.json', true],
  ];

  const ph = {};
  for (const [name, skipHeader] of phSources) {
    const data = await fetchJson(name);
    for (let i = 0; i < data.words.length; i++) {
      if (skipHeader && i === 0) continue;
      const row = data.words[i];
      if (Array.isArray(row) && row.length >= 2 && row[0] && row[1]) {
        const w = String(row[0]).trim().toLowerCase();
        const p = String(row[1]).trim();
        if (w && p && !ph[w]) ph[w] = p;
      }
    }
  }

  const merged = {};
  const order = [];
  function add(w, pos, zh) {
    w = String(w).trim().toLowerCase();
    if (!w) return;
    if (!merged[w]) { merged[w] = {}; order.push(w); }
    pos = String(pos || '').trim();
    zh = clean(zh);
    if (!pos && !zh) return;
    (merged[w][pos] = merged[w][pos] || []).push(zh);
  }

  for (const name of defSources) {
    const data = await fetchJson(name);
    for (const row of data.words) {
      if (!Array.isArray(row) || row.length < 4) continue;
      const w = String(row[0]).trim().toLowerCase();
      const pos = String(row[2] || '').trim();
      const def = String(row[3] || '').trim();
      if (!w || !def) continue;
      const full = pos ? pos + '. ' + def : def;
      for (const [p, z] of parseDef(full)) add(w, p, z);
    }
  }

  const POS_ORDER = ['n', 'v', 'vt', 'vi', 'adj', 'adv', 'prep', 'conj', 'pron', 'num', 'art', 'int', 'aux', 'det', 'abbr', 'a', ''];
  const out = {};
  for (const w of order) {
    const d = merged[w];
    const senses = [];
    for (const pos of POS_ORDER) {
      if (d[pos]) {
        const z = best(d[pos]);
        if (pos || z) senses.push([pos, z]);
      }
    }
    for (const pos of Object.keys(d)) {
      if (!POS_ORDER.includes(pos)) senses.push([pos, best(d[pos])]);
    }
    out[w] = { p: ph[w] || '', s: senses };
  }

  const outPath = path.join(__dirname, '..', 'public', 'data', 'dict-3500.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out), 'utf8');
  const total = Object.keys(out).length;
  const withPh = Object.values(out).filter((x) => x.p).length;
  console.log('✅ 已生成：' + outPath);
  console.log('   单词数：' + total + '，含音标：' + withPh + '，缺音标：' + (total - withPh));
})().catch((err) => { console.error(err); process.exit(1); });
