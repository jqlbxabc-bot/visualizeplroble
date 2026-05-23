const $ = (selector) => document.querySelector(selector);
const paperInput = $('#paperInput');
const results = $('#results');
const statusBadge = $('#statusBadge');
const questionCount = $('#questionCount');
const showHints = $('#showHints');
const toast = $('#toast');
let lastSolutions = [];

const samples = {
  math: '已知一次函数 y=x+2 与反比例函数 y=4/x 交于 A、B 两点，求交点坐标并画图。',
  physics: '质量为 2kg 的物块放在倾角 30° 的光滑斜面上，画出受力分析图，并求重力沿斜面方向和垂直斜面方向的分力大小。',
  chemistry: '实验室用高锰酸钾制取氧气，请写出反应方程式，并画出加热固体制取并用排水法收集氧气的实验装置图。',
  paper: `1. 已知一次函数 y=x+2 与反比例函数 y=4/x 交于 A、B 两点，求交点坐标并画图。

2. 质量为 2kg 的物块放在倾角 30° 的光滑斜面上，画出受力分析图，并求重力沿斜面方向和垂直斜面方向的分力大小。

3. 实验室用高锰酸钾制取氧气，请写出反应方程式，并画出加热固体制取并用排水法收集氧气的实验装置图。`,
};

function esc(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&#039;');
}

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return '';
  return Math.abs(value - Math.round(value)) < 1e-9 ? String(Math.round(value)) : String(Number(value.toFixed(digits)));
}

function selectedSubject() {
  return document.querySelector('input[name="subject"]:checked')?.value || 'auto';
}

function splitQuestions(text) {
  const cleaned = text.replace(/\r/g, '').trim();
  if (!cleaned) return [];
  const lines = cleaned.split('\n');
  const out = [];
  let current = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (current.trim()) out.push(current.trim());
      current = '';
      continue;
    }
    const stripped = line.replace(/^(\d+[\.、)]|[一二三四五六七八九十]+[\.、)])\s*/, '');
    const startsNew = stripped !== line;
    if (startsNew && current.trim()) {
      out.push(current.trim());
      current = stripped;
    } else {
      current += `${current ? ' ' : ''}${stripped}`;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function detectSubject(text) {
  const t = text.toLowerCase();
  const score = { math: 0, physics: 0, chemistry: 0 };
  ['函数', '几何', '坐标', '方程', '交点', '抛物线', '三角形', '圆', '面积', 'y=', 'x='].forEach((w) => { if (t.includes(w)) score.math += 1; });
  ['质量', '斜面', '受力', '电路', '速度', '加速度', '滑轮', '透镜', '光线', 'kg', 'n'].forEach((w) => { if (t.includes(w)) score.physics += 1; });
  ['化学', '反应', '方程式', '实验', '装置', '氧气', '二氧化碳', '高锰酸钾', '盐酸', '乙醇', '乙酸'].forEach((w) => { if (t.includes(w)) score.chemistry += 1; });
  if (/y\s*=|x\^2|x²|∠|△/.test(t)) score.math += 2;
  if (/(kg|m\/s|n\b|牛|°)/i.test(text)) score.physics += 1;
  if (/(h2|o2|co2|kmno4|hcl|caco3|o₂|co₂|→)/i.test(text)) score.chemistry += 2;
  return Object.entries(score).sort((a, b) => b[1] - a[1])[0][0];
}

function parseLinear(text) {
  const s = text.replaceAll('＋', '+').replaceAll('－', '-').replaceAll('，', ',').replace(/\s+/g, '');
  const m = s.match(/y=([+-]?(?:\d+(?:\.\d+)?)?)x([+-]\d+(?:\.\d+)?)?/i);
  if (!m) return null;
  let a = m[1];
  if (a === '' || a === '+') a = '1';
  if (a === '-') a = '-1';
  return { a: Number(a), b: Number(m[2] || 0), raw: m[0] };
}

function parseReciprocal(text) {
  const s = text.replace(/\s+/g, '');
  const m = s.match(/y=([+-]?\d+(?:\.\d+)?)\/x/i);
  return m ? { k: Number(m[1]), raw: m[0] } : null;
}

function quad(a, b, c) {
  const d = b * b - 4 * a * c;
  if (d < -1e-9) return [];
  if (Math.abs(d) < 1e-9) return [-b / (2 * a)];
  return [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)];
}

function functionSvg(linear, reciprocal, points) {
  const width = 560, height = 390, left = 48, right = 24, top = 24, bottom = 42;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const xMin = Math.min(-6, Math.floor(Math.min(...xs) - 2));
  const xMax = Math.max(6, Math.ceil(Math.max(...xs) + 2));
  const yMin = Math.min(-6, Math.floor(Math.min(...ys) - 2));
  const yMax = Math.max(8, Math.ceil(Math.max(...ys) + 2));
  const px = (x) => left + ((x - xMin) / (xMax - xMin)) * (width - left - right);
  const py = (y) => top + (1 - (y - yMin) / (yMax - yMin)) * (height - top - bottom);
  const line = [];
  for (let i = 0; i <= 160; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / 160;
    line.push(`${px(x).toFixed(1)},${py(linear.a * x + linear.b).toFixed(1)}`);
  }
  const branches = [[], []];
  for (let i = 0; i <= 200; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / 200;
    if (Math.abs(x) < 0.12) continue;
    const y = reciprocal.k / x;
    if (y >= yMin - 4 && y <= yMax + 4) branches[x < 0 ? 0 : 1].push(`${px(x).toFixed(1)},${py(y).toFixed(1)}`);
  }
  const grid = [];
  for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x += 1) grid.push(`<line x1='${px(x)}' y1='${top}' x2='${px(x)}' y2='${height - bottom}' stroke='${x === 0 ? '#667085' : '#e3e8f0'}' stroke-width='${x === 0 ? 2 : 1}' />`);
  for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y += 1) grid.push(`<line x1='${left}' y1='${py(y)}' x2='${width - right}' y2='${py(y)}' stroke='${y === 0 ? '#667085' : '#e3e8f0'}' stroke-width='${y === 0 ? 2 : 1}' />`);
  const dots = points.map((p, i) => `<g><circle cx='${px(p.x)}' cy='${py(p.y)}' r='6' fill='#ef8354' stroke='#fff' stroke-width='2'/><text x='${px(p.x) + 9}' y='${py(p.y) - 9}' fill='#1f2933' font-size='15' font-weight='700'>${i === 0 ? 'A' : 'B'}(${fmt(p.x)}, ${fmt(p.y)})</text></g>`).join('');
  return `<svg viewBox='0 0 ${width} ${height}' role='img' aria-label='函数交点图像'><rect width='${width}' height='${height}' fill='#fbfcfe'/>${grid.join('')}<polyline points='${line.join(' ')}' fill='none' stroke='#1f7a68' stroke-width='3'/>${branches.filter((b) => b.length > 1).map((b) => `<polyline points='${b.join(' ')}' fill='none' stroke='#3d5a80' stroke-width='3'/>`).join('')}${dots}<rect x='54' y='30' width='164' height='54' rx='8' fill='#fff' stroke='#d8dee9'/><text x='70' y='53' fill='#1f7a68' font-size='13' font-weight='800'>${esc(linear.raw)}</text><text x='70' y='74' fill='#3d5a80' font-size='13' font-weight='800'>${esc(reciprocal.raw)}</text></svg>`;
}

function genericSvg(subject) {
  const labels = subject === '数学' ? ['读题', '建模', '计算', '作图'] : subject === '物理' ? ['对象', '受力', '公式', '结论'] : ['物质', '反应', '装置', '现象'];
  return `<svg viewBox='0 0 560 300' role='img' aria-label='${subject}学习流程图'><rect width='560' height='300' fill='#fbfcfe'/><defs><marker id='arrow' markerWidth='10' markerHeight='10' refX='8' refY='3' orient='auto'><path d='M0,0 L0,6 L9,3 z' fill='#aeb8c8'/></marker></defs><text x='40' y='50' fill='#1f2933' font-size='18' font-weight='800'>${subject}题通用理解路线</text>${labels.map((label, i) => { const x = 58 + i * 124; const color = ['#1f7a68', '#3d5a80', '#ef8354', '#8a4fff'][i]; return `<g><rect x='${x}' y='112' width='88' height='62' rx='8' fill='#fff' stroke='${color}' stroke-width='3'/><text x='${x + 24}' y='150' fill='${color}' font-size='18' font-weight='800'>${label}</text>${i < labels.length - 1 ? `<line x1='${x + 88}' y1='143' x2='${x + 118}' y2='143' stroke='#aeb8c8' stroke-width='3' marker-end='url(#arrow)'/>` : ''}</g>`; }).join('')}</svg>`;
}

function generic(subject, type, question, steps) {
  return { subject, type, question, steps, formula: '当前题型未进入精确计算模板，已生成通用解题框架。', answer: '请补充更标准的题干，或使用示例题格式，可得到更精确的图形化解答。', hint: '先把题目转成“已知量、要求量、关系式/装置选择”三栏。', visual: genericSvg(subject), caption: '通用学习路线图帮助学生把题目拆成可处理的步骤。' };
}

function solveMath(question) {
  const linear = parseLinear(question), reciprocal = parseReciprocal(question);
  if (!linear || !reciprocal) return generic('数学', '建模思路', question, ['列出已知量与未知量。', '建立方程或几何关系。', '计算关键量后回到图形解释。']);
  const roots = quad(linear.a, linear.b, -reciprocal.k);
  const points = roots.map((x) => ({ x, y: linear.a * x + linear.b })).sort((a, b) => a.x - b.x);
  return { subject: '数学', type: '函数图像', question, steps: [`设交点横坐标为 x，则两个函数的 y 值相等。`, `联立得 ${fmt(linear.a)}x${linear.b >= 0 ? '+' : ''}${fmt(linear.b)}=${fmt(reciprocal.k)}/x。`, `两边同乘 x，得到 ${fmt(linear.a)}x^2${linear.b >= 0 ? '+' : ''}${fmt(linear.b)}x-${fmt(reciprocal.k)}=0。`, `解方程得 x=${roots.map((r) => fmt(r)).join(' 或 ')}，代回一次函数求 y。`], formula: `${fmt(linear.a)}x^2${linear.b >= 0 ? '+' : ''}${fmt(linear.b)}x-${fmt(reciprocal.k)}=0`, answer: `交点坐标：${points.map((p, i) => `${i === 0 ? 'A' : 'B'}(${fmt(p.x)}, ${fmt(p.y)})`).join('，')}。`, hint: '交点不是目测出来的，而是把两个函数的 y 值设为相等。', visual: functionSvg(linear, reciprocal, points), caption: '绿色为一次函数，蓝色为反比例函数，橙色点为交点。' };
}

function pickNumber(question, patterns, fallback) {
  for (const pattern of patterns) { const match = question.match(pattern); if (match) return Number(match[1]); }
  return fallback;
}

function slopeSvg(angle, weight, downSlope, normalComponent) {
  const theta = angle * Math.PI / 180;
  const sx = 76, sy = 310, ex = 480, ey = 310 - Math.tan(theta) * 404;
  const bx = 290, by = 310 - Math.tan(theta) * (290 - 76) - 32;
  const arrow = (x2, y2, color, label) => `<line x1='${bx}' y1='${by}' x2='${x2}' y2='${y2}' stroke='${color}' stroke-width='4' marker-end='url(#a${color.slice(1)})'/><text x='${x2 + 8}' y='${y2 + 18}' fill='${color}' font-size='16' font-weight='800'>${label}</text>`;
  return `<svg viewBox='0 0 560 390' role='img' aria-label='斜面受力分析图'><defs>${['ef8354', '1f7a68', '3d5a80', '8a4fff'].map((c) => `<marker id='a${c}' markerWidth='10' markerHeight='10' refX='8' refY='3' orient='auto'><path d='M0,0 L0,6 L9,3 z' fill='#${c}'/></marker>`).join('')}</defs><rect width='560' height='390' fill='#fbfcfe'/><polygon points='${sx},${sy} ${ex},${ey} ${ex},${sy}' fill='#eef3f8' stroke='#aeb8c8'/><line x1='${sx}' y1='${sy}' x2='${ex}' y2='${ey}' stroke='#667085' stroke-width='4'/><g transform='translate(${bx} ${by}) rotate(${-angle})'><rect x='-38' y='-24' width='76' height='48' rx='6' fill='#f2c94c' stroke='#9f7d16' stroke-width='2'/><text x='-21' y='6' fill='#1f2933' font-size='15' font-weight='800'>m</text></g>${arrow(bx, by + 122, '#ef8354', `G=${fmt(weight)}N`)}${arrow(bx - 102 * Math.cos(theta), by + 102 * Math.sin(theta), '#1f7a68', `G₁=${fmt(downSlope)}N`)}${arrow(bx - 88 * Math.sin(theta), by - 88 * Math.cos(theta), '#3d5a80', `G₂=${fmt(normalComponent)}N`)}${arrow(bx + 88 * Math.sin(theta), by + 88 * Math.cos(theta), '#8a4fff', 'N')}<text x='150' y='294' fill='#1f2933' font-size='15' font-weight='800'>${angle}°</text><text x='34' y='36' fill='#667085' font-size='14'>光滑斜面：没有摩擦力</text></svg>`;
}

function solvePhysics(question) {
  if (!/斜面|倾角|受力/.test(question)) return generic('物理', '情境建模', question, ['画研究对象。', '统一单位并写公式。', '建立方向后代入计算。']);
  const mass = pickNumber(question, [/(\d+(?:\.\d+)?)\s*kg/i, /质量为?\s*(\d+(?:\.\d+)?)/], 2);
  const angle = pickNumber(question, [/(\d+(?:\.\d+)?)\s*°/, /倾角为?\s*(\d+(?:\.\d+)?)/], 30);
  const g = 9.8, weight = mass * g, downSlope = weight * Math.sin(angle * Math.PI / 180), normalComponent = weight * Math.cos(angle * Math.PI / 180);
  return { subject: '物理', type: '斜面受力', question, steps: ['物块受重力 G 和支持力 N；光滑斜面不画摩擦力。', `把重力沿斜面和垂直斜面分解，倾角为 ${fmt(angle)}°。`, `沿斜面向下分力 G₁=mg sinθ=${fmt(downSlope)}N。`, `垂直斜面向下分力 G₂=mg cosθ=${fmt(normalComponent)}N，支持力大小 N=G₂。`], formula: `G=mg=${fmt(weight)}N；G₁=${fmt(downSlope)}N；G₂=${fmt(normalComponent)}N`, answer: `沿斜面向下的分力为 ${fmt(downSlope)}N，垂直斜面向下的分力为 ${fmt(normalComponent)}N。`, hint: '分解的是重力，不是支持力。', visual: slopeSvg(angle, weight, downSlope, normalComponent), caption: '橙色为重力，绿色为沿斜面分力，蓝色为垂直斜面分力，紫色为支持力。' };
}

function oxygenSvg() {
  return `<svg viewBox='0 0 560 390' role='img' aria-label='高锰酸钾制取氧气装置图'><rect width='560' height='390' fill='#fbfcfe'/><line x1='38' y1='326' x2='522' y2='326' stroke='#aeb8c8' stroke-width='2'/><rect x='90' y='162' width='150' height='42' rx='21' fill='#fff' stroke='#667085' stroke-width='3' transform='rotate(-10 165 183)'/><rect x='96' y='173' width='52' height='18' rx='9' fill='#d7b56d' transform='rotate(-10 122 182)'/><text x='108' y='154' fill='#1f2933' font-size='14' font-weight='800'>KMnO₄</text><circle cx='239' cy='170' r='9' fill='#2f3a4a'/><path d='M247 170 C302 146, 326 150, 360 180 L386 204' fill='none' stroke='#3d5a80' stroke-width='5'/><rect x='111' y='244' width='50' height='82' rx='8' fill='#30343f'/><path d='M126 250 C132 224, 148 224, 153 250 C147 244, 132 244, 126 250 Z' fill='#ef8354'/><path d='M132 250 C136 236, 145 236, 148 250 C143 247, 137 247, 132 250 Z' fill='#f2c94c'/><text x='93' y='348' fill='#1f2933' font-size='14' font-weight='800'>酒精灯</text><rect x='350' y='226' width='150' height='82' rx='8' fill='#d9edf7' stroke='#7ea8bd' stroke-width='3'/><path d='M414 154 L468 154 L458 284 L424 284 Z' fill='#fff' stroke='#667085' stroke-width='3'/><text x='407' y='142' fill='#1f2933' font-size='14' font-weight='800'>集气瓶</text><text x='40' y='42' fill='#1f2933' font-size='16' font-weight='800'>加热固体制 O₂：试管口略向下，先撤导管后熄灯</text></svg>`;
}

function solveChemistry(question) {
  if (/高锰酸钾|KMnO4|氧气|O2|O₂/.test(question)) return { subject: '化学', type: '实验装置', question, steps: ['高锰酸钾受热分解生成锰酸钾、二氧化锰和氧气。', '配平：2KMnO₄ = K₂MnO₄ + MnO₂ + O₂↑。', '固体加热，发生装置选试管和酒精灯。', '氧气不易溶于水，可用排水法收集。'], formula: '2KMnO₄  △  K₂MnO₄ + MnO₂ + O₂↑', answer: '装置组合：酒精灯、略向下倾斜的试管、带导管的橡皮塞、水槽、集气瓶。', hint: '试管口略向下是为了防止冷凝水倒流使热试管炸裂。', visual: oxygenSvg(), caption: '加热固体制取氧气，并用排水法收集氧气。' };
  if (/乙酸|醋酸/.test(question)) return structureSolution(question, '乙酸结构 CH₃COOH', 'CH₃COOH', '乙酸的官能团是羧基 -COOH。');
  if (/乙醇|酒精/.test(question)) return structureSolution(question, '乙醇结构 CH₃CH₂OH', 'CH₃CH₂OH', '乙醇的官能团是羟基 -OH。');
  return generic('化学', '反应与装置分析', question, ['判断题目问结构、反应还是装置。', '反应题先写反应物和生成物，再配平。', '实验题根据状态、加热和气体性质选装置。']);
}

function structureSolution(question, title, formula, hint) {
  const visual = `<svg viewBox='0 0 560 300' role='img' aria-label='${title}'><rect width='560' height='300' fill='#fbfcfe'/><text x='42' y='44' fill='#1f2933' font-size='18' font-weight='800'>${title}</text><circle cx='170' cy='160' r='42' fill='#fff' stroke='#1f7a68' stroke-width='3'/><text x='148' y='168' font-size='20' font-weight='800' fill='#1f7a68'>CH₃</text><line x1='212' y1='160' x2='252' y2='160' stroke='#1f2933' stroke-width='4'/><circle cx='294' cy='160' r='42' fill='#fff' stroke='#ef8354' stroke-width='3'/><text x='276' y='168' font-size='20' font-weight='800' fill='#ef8354'>${formula.includes('COOH') ? 'COOH' : 'CH₂'}</text>${formula.includes('CH₂') ? `<line x1='336' y1='160' x2='376' y2='160' stroke='#1f2933' stroke-width='4'/><circle cx='418' cy='160' r='42' fill='#fff' stroke='#3d5a80' stroke-width='3'/><text x='397' y='168' font-size='20' font-weight='800' fill='#3d5a80'>OH</text>` : ''}</svg>`;
  return { subject: '化学', type: '结构式', question, steps: ['找出有机物名称。', hint, '检查碳链和官能团连接方式。'], formula, answer: `${title}：${formula}。`, hint: '有机结构题先看官能团，再看碳链连接方式。', visual, caption: '结构示意图用于先看清官能团和碳链骨架。' };
}

function solveQuestion(question) {
  const forced = selectedSubject();
  const subject = forced === 'auto' ? detectSubject(question) : forced;
  if (subject === 'math') return solveMath(question);
  if (subject === 'physics') return solvePhysics(question);
  return solveChemistry(question);
}

function card(solution, index) {
  const steps = solution.steps.map((step, i) => `<li><span class='step-index'>${i + 1}</span><span>${esc(step)}</span></li>`).join('');
  const hint = showHints.checked ? `<div class='hint-box'>${esc(solution.hint)}</div>` : '';
  return `<article class='solution-card'><div class='solution-main'><div class='question-title'><h3>第 ${index + 1} 题</h3><span class='mini-badge'>${esc(solution.subject)} · ${esc(solution.type)}</span></div><p class='question-text'>${esc(solution.question)}</p><ol class='step-list'>${steps}</ol><div class='formula-box'>${esc(solution.formula)}</div><div class='answer-box'>${esc(solution.answer)}</div>${hint}</div><div class='visual-panel'><div class='visual-card'>${solution.visual}</div><p class='caption'>${esc(solution.caption)}</p></div></article>`;
}

function renderEmpty() {
  results.innerHTML = `<div class='empty-state'><div class='empty-visual' aria-hidden='true'><svg viewBox='0 0 260 180' role='img'><rect x='24' y='24' width='212' height='132' rx='8' fill='#fff' stroke='#c8d1de'/><path d='M52 128 L106 72 L148 104 L202 48' fill='none' stroke='#1f7a68' stroke-width='5'/><circle cx='106' cy='72' r='6' fill='#ef8354'/><circle cx='148' cy='104' r='6' fill='#3d5a80'/></svg></div><h3>把题目放进左侧，我会生成步骤和图</h3><p>当前版本离线运行，适合常见函数图像、斜面受力、实验装置和结构理解题。</p></div>`;
}

function updateStatus() {
  const count = splitQuestions(paperInput.value).length;
  questionCount.textContent = `${count} 题`;
  statusBadge.textContent = count ? '可以生成' : '等待输入';
}

function solvePaper() {
  const questions = splitQuestions(paperInput.value);
  if (!questions.length) {
    lastSolutions = [];
    renderEmpty();
    updateStatus();
    showToast('请先输入一道试题');
    return;
  }
  lastSolutions = questions.map(solveQuestion);
  results.innerHTML = lastSolutions.map(card).join('');
  updateStatus();
  showToast(`已生成 ${lastSolutions.length} 题图形化解答`);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function plainText() {
  return lastSolutions.map((s, i) => `第 ${i + 1} 题（${s.subject} · ${s.type}）\n题目：${s.question}\n解题步骤：\n${s.steps.map((step, j) => `${j + 1}. ${step}`).join('\n')}\n关键公式：${s.formula}\n答案：${s.answer}\n提示：${s.hint}`).join('\n\n');
}

document.querySelectorAll('.sample-button').forEach((button) => button.addEventListener('click', () => { paperInput.value = samples[button.dataset.sample] || ''; solvePaper(); }));
paperInput.addEventListener('input', updateStatus);
showHints.addEventListener('change', () => { if (lastSolutions.length) results.innerHTML = lastSolutions.map(card).join(''); });
$('#solveBtn').addEventListener('click', solvePaper);
$('#printBtn').addEventListener('click', () => window.print());
$('#copyBtn').addEventListener('click', async () => { if (!lastSolutions.length) return showToast('还没有可复制的解答'); try { await navigator.clipboard.writeText(plainText()); showToast('已复制文字解答'); } catch { showToast('当前环境无法自动复制，可使用打印保存'); } });
$('#clearBtn').addEventListener('click', () => { paperInput.value = ''; lastSolutions = []; renderEmpty(); updateStatus(); paperInput.focus(); });
document.querySelectorAll('input[name="subject"]').forEach((radio) => radio.addEventListener('change', () => { if (lastSolutions.length) solvePaper(); }));
renderEmpty();
updateStatus();
