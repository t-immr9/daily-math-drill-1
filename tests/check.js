// 毎日3分数学(数学I)の自動チェック
// 使い方: リポジトリのフォルダで  node tests/check.js
// 失敗が1つでもあると、最後に「失敗」と表示して終了コード1で終わる。index.html は書き換えない。
const vm = require('vm'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1];
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else { fail++; console.log('✗ ' + name + (detail ? '  ' + detail : '')); } };
const el = () => new Proxy(function () {}, {
  get: (t, p) => p === 'classList' ? { add() {}, remove() {}, toggle() {} } : p === 'style' ? {} :
    ['appendChild', 'append', 'select', 'addEventListener'].includes(p) ? () => {} : p === 'closest' ? () => null : undefined,
  set: () => true
});
const store = {};
const ctx = vm.createContext({ document: { querySelector: () => el(), createElement: () => el() },
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } }, btoa, atob, console });
try { vm.runInContext(script, ctx); ok('スクリプトが読み込める', true); }
catch (e) { console.log('✗ スクリプトの読み込みでエラー: ' + e.message); process.exit(1); }
const run = c => vm.runInContext(c, ctx);

// ---- 1. 記録を守る約束 ----
ok('保存名が daily-math1-progress(2年生版と別)', run('STORAGE') === 'daily-math1-progress');
ok('スタンプの記録の形 {completed:true,score}', /P\.days\[key\]=\{completed:true,score\}/.test(script));

// ---- 2. 問題データ ----
const Q = run('Q.map(q=>({id:q.id,t:q.t,q:q.q,i:q.i,m:q.m,a:q.a,f:q.f,k:q.k}))');
const ids = new Set(); let dup = 0; Q.forEach(q => { if (ids.has(q.id)) dup++; ids.add(q.id); });
ok('問題IDに重複がない', dup === 0);
ok('問題IDは英数字・記号のみ', Q.every(q => /^[\x20-\x7e]+$/.test(q.id)));
run('PLAN.map(e=>[e.name,pool(e).length])').forEach(([n, c]) => ok(`単元「${n}」に問題がある`, c > 0));

// ---- 3. 答えの数学的な正しさ ----
const js = e => e.replace(/−/g, '-').replace(/＋/g, '+').replace(/√(\d+)/g, 'Math.sqrt($1)').replace(/x²/g, '(x**2)').replace(/²/g, '**2')
  .replace(/(\d)(x|\(|M)/g, '$1*$2').replace(/\)\(/g, ')*(').replace(/x\(/g, 'x*(').replace(/\)(x|\d)/g, ')*$1');
const f = (e, x) => eval(js(e));                                     // 多項式の値
const val = s => eval(js(s));                                        // 数値の答え
const nums = s => s.replace(/\s/g, '').split(/[，,]/).filter(Boolean).flatMap(p => p.includes('±') ? [val(p.replace('±', '+')), val(p.replace('±', '-'))] : [val(p)]);
const coef = e => { const c = f(e, 0), p = f(e, 1), m = f(e, -1); return [(p + m) / 2 - c, (p - m) / 2, c]; };
const close = (x, y) => Math.abs(x - y) < 1e-9;
const sameSet = (A, B) => A.length === B.length && [...A].sort((p, q) => p - q).every((v, i) => close(v, [...B].sort((p, q) => p - q)[i]));
const realRoots = ([a, b, c]) => { const D = b * b - 4 * a * c; return D < -1e-12 ? [] : Math.abs(D) < 1e-12 ? [-b / (2 * a)] : [(-b - Math.sqrt(D)) / (2 * a), (-b + Math.sqrt(D)) / (2 * a)]; };
// 不等式の答え → x についての条件
const pred = (ans, env = {}) => {
  const parts = ans.replace(/\s/g, '').split(/[，,]/).map(p => {
    if (p === 'すべての実数') return () => true;
    if (p === '解なし') return () => false;
    let m = /^(.+)以外のすべての実数$/.exec(p); if (m) { const v = valE(m[1], env); return x => !close(x, v); }
    const t = p.split(/(＜|＞|≦|≧|＝)/);
    return x => { for (let i = 1; i < t.length; i += 2) { const L = t[i - 1] === 'x' ? x : valE(t[i - 1], env), Rr = t[i + 1] === 'x' ? x : valE(t[i + 1], env), o = t[i];
      if (!(o === '＜' ? L < Rr - 1e-12 : o === '＞' ? L > Rr + 1e-12 : o === '≦' ? L <= Rr + 1e-12 : o === '≧' ? L >= Rr - 1e-12 : close(L, Rr))) return false; } return true; };
  });
  return x => parts.some(g => g(x));
};
const valE = (s, env) => s in env ? env[s] : val(s);
const ineqHolds = (lhs, op, x) => { const v = f(lhs, x); return op === '＞' ? v > 1e-12 : op === '＜' ? v < -1e-12 : op === '≧' ? v >= -1e-12 : v <= 1e-12; };
const xs = []; for (let x = -12; x <= 12; x += 0.25) xs.push(x);
const median = a => { a = [...a].sort((p, q) => p - q); const n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
const quart = a => { a = [...a].sort((p, q) => p - q); const n = a.length, h = Math.floor(n / 2); return [median(a.slice(0, h)), median(a), median(a.slice(n % 2 ? h + 1 : h))]; };
const data = s => s.split('，').map(Number);
const mean = a => a.reduce((p, q) => p + q, 0) / a.length;
const vari = a => { const m = mean(a); return mean(a.map(v => (v - m) ** 2)); };
var c1s = 'a＞0 で、ax²＋bx＋c＝0 が異なる';
const ansNum = q => q.m === 'f' ? val(q.f[0][0].replace('±', '+')) / val(q.f[0][1]) : val(q.a[0]);

for (const q of Q) {
  const tag = q.q + (q.i ? '(' + q.i.slice(0, 18) + '…)' : '');
  try {
    if (q.t === 'A' && /＝0$/.test(q.q)) {
      const e = q.q.replace('＝0', ''), roots = realRoots(coef(e));
      const ans = q.m === 'f' ? [1, -1].map(s => val(q.f[0][0].replace('±', s > 0 ? '+' : '-')) / val(q.f[0][1])) : nums(q.a[0]);
      ok('解: ' + tag, sameSet([...new Set(ans.map(v => +v.toFixed(9)))], roots.map(v => +v.toFixed(9))));
      q.a && q.a.slice(1).forEach(alt => ok('別の書き方も同じ解: ' + tag, sameSet(nums(alt), nums(q.a[0]))));
    } else if (q.t === 'B' && /^\d*x²|^x²/.test(q.q)) {
      const [a, b, c] = coef(q.q.replace('＝0', '')), D = b * b - 4 * a * c;
      ok('判別式・個数: ' + tag, q.i.includes('個数') ? +q.a[0] === realRoots([a, b, c]).length : close(D, +val(q.a[0])));
    } else if (q.t === 'C') {
      const r = realRoots(coef(q.q.replace('y＝', '')));
      ok('共有点: ' + tag, q.i.includes('個数') ? +q.a[0] === r.length : sameSet(nums(q.a[0]), r));
    } else if (q.t === 'D' || q.t === 'E') {
      const [, lhs, op] = /^(.*)(＞|＜|≧|≦)0$/.exec(q.q), P = pred(q.a[0]);
      const pts = [...xs, ...realRoots(coef(lhs))];
      ok('不等式: ' + tag, pts.every(x => P(x) === ineqHolds(lhs, op, x)));
    } else if (q.t === 'F') {
      const op = /(＞|＜|≧|≦)0$/.exec(q.q)[1];
      const [poly, env] = q.i.startsWith(c1s) ? ['(x−1)(x−3)', { α: 1, β: 3 }] : q.i.includes('重解') ? ['(x−2)²', { α: 2 }] : ['x²＋1', {}];
      const P = pred(q.a[0], env); ok('解のまとめ: ' + tag, [...xs, 1, 2, 3].every(x => P(x) === ineqHolds(poly, op, x)));
    } else if (q.t === 'G') {
      let m, v; if ((m = /^(\d+)以上(\d+)未満$/.exec(q.q))) v = (+m[1] + +m[2]) / 2;
      else if ((m = /度数 (\d+)，度数の合計 (\d+)/.exec(q.q))) v = m[1] / m[2]; else v = data(q.q.replace('度数 ', '')).reduce((p, c) => p + c, 0);
      ok('データの整理: ' + tag, close(v, ansNum(q)));
    } else if (q.t === 'H') {
      const a = data(q.q); let v;
      if (q.i.startsWith('平均')) v = mean(a); else if (q.i.startsWith('中央')) v = median(a);
      else { const c = {}; a.forEach(x => c[x] = (c[x] || 0) + 1); v = +Object.keys(c).sort((p, r) => c[r] - c[p])[0]; }
      ok('代表値: ' + tag, close(v, ansNum(q)));
    } else if (q.t === 'I') {
      let v, m;
      if ((m = /Q₁＝(\d+)，Q₃＝(\d+)/.exec(q.q))) { const i = m[2] - m[1]; v = q.i.startsWith('下') ? m[1] - 1.5 * i : +m[2] + 1.5 * i; }
      else { const a = data(q.q), [q1, q2, q3] = quart(a);
        v = q.i.startsWith('範囲') ? Math.max(...a) - Math.min(...a) : q.i.startsWith('第1') ? q1 : q.i.startsWith('第2') ? q2 : q.i.startsWith('第3') ? q3 : q3 - q1; }
      ok('散らばり: ' + tag, close(v, ansNum(q)));
    } else if (q.t === 'J') {
      let v, m;
      if ((m = /平均値 (\d+)，値 (\d+)/.exec(q.q))) v = m[2] - m[1];
      else if ((m = /^分散 (\d+)$/.exec(q.q))) v = Math.sqrt(+m[1]);
      else if ((m = /x²の平均値 (\d+)，xの平均値 (\d+)/.exec(q.q))) v = m[1] - m[2] ** 2;
      else { const a = data(q.q); v = q.i.startsWith('分散') ? vari(a) : Math.sqrt(vari(a)); }
      ok('分散・標準偏差: ' + tag, close(v, ansNum(q)));
    } else if (q.t === 'K') {
      let v, m;
      if (q.q === '相関係数 r') { const P = pred(q.a[0].replace(/r/g, 'x')); ok('相関係数の範囲', P(-1) && P(1) && P(0.3) && !P(1.1) && !P(-1.1)); continue; }
      if ((m = /共分散 (−?\d+)，標準偏差 (\d+) と (\d+)/.exec(q.q))) v = val(m[1]) / (m[2] * m[3]);
      else { m = /x：(.+) ／ y：(.+)/.exec(q.q); const X = data(m[1]), Y = data(m[2]), mx = mean(X), my = mean(Y); v = mean(X.map((x, i) => (x - mx) * (Y[i] - my))); }
      ok('相関係数・共分散: ' + tag, close(v, ansNum(q)));
    }
  } catch (e) { ok('チェック中にエラー: ' + tag, false, e.message); }
}

// ---- 4. その単元のキーだけで答えを入力でき、正解になるか(全問・全部の書き方) ----
const tokenize = (str, keys) => { const ks = [...keys, '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '−'].sort((a, b) => b.length - a.length), out = []; let s = str.replace(/-/g, '−');
  while (s.length) { const k = ks.find(k => s.startsWith(k)); if (!k) return null; out.push(k); s = s.slice(k.length); } return out; };
const play = (id, setter) => run(`(()=>{daily=[Q.find(q=>q.id===${JSON.stringify(id)})];index=0;results=[];checked=false;fractions=[];render();raw.answer='';raw.numerator='';raw.denominator='';${setter};check();return results[0]})()`);
const typeS = (field, keys) => `active='${field}';` + keys.map(k => `keyPress(${JSON.stringify(k)});`).join('');
let typed = 0;
for (const q of Q) {
  const tag = q.q + (q.i ? '(' + q.i.slice(0, 18) + '…)' : '');
  const forms = q.m === 'f' ? q.f.map(([n, d]) => [['numerator', n], ['denominator', d]]) : q.a.map(a => [['answer', a]]);
  for (const form of forms) {
    const seq = form.map(([fld, s]) => [fld, tokenize(s, q.k)]);
    if (seq.some(([, t]) => !t)) { ok('この単元のキーで入力できる: ' + tag, false, JSON.stringify(form)); continue; }
    typed++; ok('入力すると正解になる: ' + tag, play(q.id, seq.map(([fld, t]) => typeS(fld, t)).join('')) === true, JSON.stringify(form));
  }
}

// ---- 5. 書き方の違いへの対応と、まちがいの判定 ----
const byQ = (s, i) => Q.find(q => q.q === s && (!i || (q.i || '').startsWith(i))).id;
const ans = (id, s) => play(id, `raw.answer=${JSON.stringify(s)}`);
ok('解の順序が逆でも正解(3，2)', ans(byQ('x²−5x＋6＝0'), '3，2') === true);
ok('x＝ を付けても正解(x＝2，x＝3)', ans(byQ('x²−5x＋6＝0'), 'x＝2，x＝3') === true);
ok('± を2つに分けて書いても正解', ans(byQ('x²−2x−1＝0'), '1−√2，1＋√2') === true);
ok('不等式の順序が逆でも正解(3＜x，x＜1)', ans(byQ('(x−1)(x−3)＞0'), '3＜x，x＜1') === true);
ok('不等式の向きを変えても正解(x＞3，x＜1)', ans(byQ('(x−1)(x−3)＞0'), 'x＞3，x＜1') === true);
ok('逆向きの連続不等式も正解(3＞x＞1)', ans(byQ('(x−1)(x−3)＜0'), '3＞x＞1') === true);
ok('まちがい: 解の範囲が逆は不正解', ans(byQ('(x−1)(x−3)＞0'), '1＜x＜3') === false);
ok('まちがい: 等号の有無', ans(byQ('(x＋2)(x−4)≦0'), '−2＜x＜4') === false);
ok('まちがい: 解が1つ足りない', ans(byQ('x²−5x＋6＝0'), '2') === false);
ok('まちがい: 小数の数字の順(5.2 は 2.5 ではない)', ans(byQ('0以上5未満'), '5.2') === false);
ok('まちがい: 「すべての実数」と「2以外のすべての実数」は区別', ans(byQ('(x−2)²＞0'), 'すべての実数') === false);
ok('判別式の式は項の順が逆でも正解', ans(byQ('ax²＋bx＋c＝0', 'この2次方程式の判別式'), '−4ac＋b²') === true);

// ---- 6. キー配置: 1〜9は3×3、その下が − 0 ⌫ ----
const seen = new Set();
for (const q of Q) { if (seen.has(q.t)) continue; seen.add(q.t);
  const L = run(`keyLayout(Q.find(q=>q.id===${JSON.stringify(q.id)}))`), k = L.indexOf('1');
  ok('キー配置: 単元' + q.t, k % 3 === 0 && L.slice(k, k + 12).join('') === '123456789−0⌫'); }
// 不等式の問題では ＜ ＞ ≦ ≧ の4つがそろっている(1つだけだとヒントになる)
for (const q of Q) if (/[＜＞≦≧]/.test(q.q + (q.a || []).join(''))) {
  const L = run(`keyLayout(Q.find(q=>q.id===${JSON.stringify(q.id)}))`);
  ok('不等号4つ: ' + q.q, ['＜', '＞', '≦', '≧'].every(s => L.includes(s))); }

// ---- 7. 記録・単元・引き継ぎ ----
run("P.days={};P.wrong={};P.units=PLAN.map(e=>e.id);P.set=null");
ok('1日の問題数は5問', run('buildDaily().length') === 5);
run("P.units=['ds']"); ok('1単元だけでも5問', run('buildDaily().length') === 5);
const setDays = a => run(`P.days={};${JSON.stringify(a)}.forEach(o=>{P.days[dayKey(o)]={completed:true,score:5}})`);
setDays([-2, -1, 0]); ok('連続日数', run("drawRecords('',0)") === 3);
const code = run('exportCode()'); run('P.days={}');
ok('引き継ぎコード', run(`importCode(${JSON.stringify(code)})`) === true && run('Object.keys(P.days).length') === 3);

console.log(`\n確認した項目: ${pass + fail}(うち入力テスト ${typed} 通り)`);
console.log(fail ? `失敗: ${fail} 件` : 'すべて成功');
process.exit(fail ? 1 : 0);
