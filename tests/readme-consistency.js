#!/usr/bin/env node
/* 校验 README 与 index.html 的数值/规则描述是否一致。
 * 做法：从 index.html 里解析出真实常量，再去 README 里核对。
 * 只覆盖"能被机器验证"的部分（装备数值、价格、上限、索敌档数）。 */
'use strict';
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');

let fail = 0, pass = 0;
const check = (cond, msg) => { console.log((cond ? '  ✅ ' : '  ❌ ') + msg); cond ? pass++ : fail++; };

/* ---- 1) 从代码取出 EQUIP_TYPES ---- */
const m = code.match(/const EQUIP_TYPES = \{([\s\S]*?)\n  \};/);
if (!m) { console.error('❌ 无法从 index.html 解析 EQUIP_TYPES'); process.exit(1); }
const types = {};
m[1].split('\n').forEach((line) => {
  const t = line.match(/'([^']+)':\s*\{([^}]*)\}/);
  if (!t) return;
  const stats = {};
  t[2].split(',').forEach((kv) => {
    const p = kv.split(':');
    if (p.length === 2) stats[p[0].trim()] = Number(p[1].trim());
  });
  types[t[1]] = stats;
});
console.log('从代码解析出 ' + Object.keys(types).length + ' 种装备：' + Object.keys(types).join('/') + '\n');

/* ---- 2) README 表格里每件装备的数值必须一致 ---- */
console.log('【装备数值逐项核对（README 表格 vs EQUIP_TYPES）】');
const NAME = { atk: '攻击', hp: '血量', def: '防御', spd: '速度', crit: '暴击率', pen: '穿透' };
Object.keys(types).forEach((type) => {
  const row = readme.split('\n').find((l) => l.trim().startsWith('| ' + type + ' |'));
  if (!row) { check(false, type + ' 在 README 表格中缺失'); return; }
  const cells = row.split('|').map((s) => s.trim()).filter((s) => s !== '');
  // cells = [装备, 攻击, 血量, 防御, 速度, 暴击率, 穿透]
  const got = {};
  Object.keys(NAME).forEach((k, i) => { got[k] = cells[i + 1]; });
  const want = {};
  Object.keys(NAME).forEach((k) => {
    const v = types[type][k] || 0;
    want[k] = v === 0 ? '—' : (k === 'crit' || k === 'pen' ? v + '%' : String(v));
  });
  const ok = Object.keys(NAME).every((k) => got[k] === want[k]);
  check(ok, type.padEnd(4) + ' README[' + Object.keys(NAME).map((k) => got[k]).join(',') +
    '] 代码[' + Object.keys(NAME).map((k) => want[k]).join(',') + ']');
});

/* ---- 3) 其它常量 ---- */
console.log('\n【其它常量核对】');
const num = (re) => { const x = code.match(re); return x ? Number(x[1]) : null; };
const consts = [
  ['合成上限 Lv8', num(/MAX_EQUIP_LEVEL = (\d+)/), /上限 \*\*Lv(\d+)\*\*/],
  ['生产花费 20 金', num(/state\.gold -= (\d+);/), /花 (\d+) 金币/],
  ['收藏上限 10', num(/MAX_COLLECTION_SLOTS = (\d+)/), /收藏位上限 (\d+) 个/],
  ['复活价（勇士）50', num(/REVIVE_HERO_COST = (\d+)/), /复活价：勇士 (\d+) 金/],
  ['复活价（冒险者）30', num(/REVIVE_ADVENTURER_COST = (\d+)/), /勇士 \d+ 金 \/ 冒险者 (\d+) 金/],
  ['熔炉回收 10', num(/FURNACE_COST = (\d+)/), /熔炉回收：(\d+) 金/],
  ['晋升勇士 30', num(/UPGRADE_COST = (\d+)/), /晋升为勇士 (\d+) 金/],
  ['城镇上限 Lv10', num(/MAX_TOWN_LEVEL = (\d+)/), /升至 Lv(\d+)/],
];
consts.forEach(([label, codeVal, re]) => {
  const rm = readme.match(re);
  const rmVal = rm ? Number(rm[1]) : null;
  check(codeVal !== null && rmVal === codeVal,
    label + '：代码=' + codeVal + ' README=' + rmVal);
});

/* ---- 4) 明确不该出现的说法 ----
   注意：README 里可以出现这些词，但只能出现在"明确否定/澄清"的语境里。
   所以判据是"是否作为已实现来陈述"，而不是"是否出现过这个词"。 */
console.log('\n【不该作为"已实现"出现的说法】');
const mustNot = [
  ['属性每级翻倍（应说明是 1.5^ 而非 2^）',
    (t) => /每级翻倍|属性翻倍/.test(t) && !/不是每级翻倍/.test(t)],
  ['存档：localStorage 自动读档',
    (t) => /存档：\s*`?localStorage/.test(t)],
  ['"看广告"复活（作为已实现按钮）',
    (t) => /看广告/.test(t) && !/未接任何广告/.test(t)],
  ['广告复活/扩展/加速 作为已实现功能',
    (t) => /^\s*-\s*经济闭环实现：[^\n]*广告复活/m.test(t)],
  ['"策划案装备数值表逐条落地"（作为已实现）',
    (t) => /逐条落地/.test(t) && !/尚未逐条落地/.test(t)],
  ['冒险者"幸存"6 次晋升（代码统计的是参战次数）',
    (t) => /幸存\s*6\s*次|幸存次数/.test(t)],
];
mustNot.forEach(([label, fn]) => check(!fn(readme), 'README 未把「' + label + '」当作已实现'));

/* ---- 5) 该有的边界说明要在 ----
   作品集 README 的定位是"展示做了什么"，所以不写自我批评式的表述；
   但"设计"与"已实现"的边界必须仍然说清楚，否则读者会以为存档/变现都做进原型了。 */
console.log('\n【必须保留的边界说明】');
[
  ['等级成长公式 1.5^(等级−1)', /1\.5\^\(等级−1\)/],
  ['说明原型范围：玩法与数值验证', /玩法与数值验证原型/],
  ['说明存档/变现/工程化未接入原型', /未接入原型/],
  ['策划案含商业化方案（设计层面）', /商业化/],
].forEach(([label, re]) => check(re.test(readme), 'README 含：' + label));

console.log('\n' + (fail === 0 ? '✅ 全部通过（' + pass + ' 项）' : '❌ ' + fail + ' 项失败 / 共 ' + (pass + fail) + ' 项'));
process.exit(fail === 0 ? 0 : 1);
