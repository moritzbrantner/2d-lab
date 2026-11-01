// 2d-lab oracle report. Everything on the page comes from the oracle's own output:
//   run/report.json  the CI run on lavapipe that built this site (FLIP gate, images)
//   gpu/report.json  the latest committed local run on the RTX 3060 Ti (GPU-time gate)
//   build.json       commit and workflow run that produced the site
const REPO = 'https://github.com/moritzbrantner/2d-lab';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (v, d = 4) => (v == null ? '–' : v === 0 ? '0' : v.toFixed(d));
const ms = v => (v == null ? '–' : `${v.toFixed(3)} ms`);
// Limits are f32 in report.json (0.12999999523…); show them as written in the source.
const g = v => +v.toPrecision(3);

async function json(path) {
  try {
    const r = await fetch(path, { cache: 'no-cache' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function load() {
  const [ci, gpu, build] = await Promise.all([json('run/report.json'), json('gpu/report.json'), json('build.json')]);
  return { ci, gpu, build };
}

// Theme: follows the system until the visitor picks one; the pick is remembered per browser.
export function theme() {
  const root = document.documentElement;
  const button = document.querySelector('.theme');
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch {}
  if (saved) root.dataset.theme = saved;
  const current = () => root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const label = () => { button.textContent = current() === 'dark' ? 'Light theme' : 'Dark theme'; };
  label();
  button.addEventListener('click', () => {
    root.dataset.theme = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch {}
    label();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', label);
}

// The three renders and the three FLIP maps the oracle writes per scenario.
const RENDERS = [['custom', 'Custom WebGPU'], ['vello', 'Vello'], ['skia', 'Skia']];
const MAPS = [
  ['custom-vs-vello.flip', 'custom vs Vello', 'vs_vello'],
  ['custom-vs-skia.flip', 'custom vs Skia', 'vs_skia'],
  ['vello-vs-skia.flip', 'Vello vs Skia, noise floor', 'noise_floor'],
];
const img = (s, kind) => `run/${encodeURIComponent(s.name)}.${kind}.png`;
const href = s => `scenario.html?s=${encodeURIComponent(s.name)}`;

const STATUS = { pass: 'Pass', 'known-gap': 'Known gap', fail: 'Fail' };
const status = st => `<span class="status ${st === 'pass' ? 'pass' : st === 'fail' ? 'fail' : 'gap'}">${STATUS[st] ?? esc(st)}</span>`;

// A FLIP value against its limit on a linear scale up to 1.25× the limit; the tick is the limit.
// The per-scenario limits sit just above the Vello–Skia floor, so the bars show the headroom.
function meter(value, limit) {
  if (value == null) return '<span class="meter"><span class="v">–</span></span>';
  const max = limit * 1.25;
  const w = Math.min(1, value / max) * 100;
  return `<span class="meter" title="${value} (limit ${g(limit)})"><span class="v ${value > limit ? 'over' : ''}">${fmt(value, value < 0.01 ? 4 : 3)}</span>
    <span class="track"><span class="fill" style="width:${w}%;--full:${w > 0 ? (100 / w) * 100 : 100}%"></span><span class="gate-tick" style="left:${(limit / max) * 100}%"></span></span></span>`;
}

function flips(s) {
  const [mean, p99] = s.flip_limits;
  return `<div class="flips"><span class="h">FLIP</span><span class="h">mean ≤ ${g(mean)}</span><span class="h">p99 ≤ ${g(p99)}</span>
    ${MAPS.map(([, label, key]) => `<span class="k ${key === 'noise_floor' ? 'floor' : ''}">${esc(label.replace(', noise floor', ' (floor)'))}</span>${meter(s[key]?.mean, mean)}${meter(s[key]?.p99, p99)}`).join('')}
  </div>`;
}

function ratioBar(r, margin) {
  if (r == null) return '–';
  const max = Math.max(1.5, margin * 1.25);
  return `<div class="ratiobar ${r > margin ? 'slow' : ''}"><span class="track"><span class="fill" style="width:${Math.min(1, r / max) * 100}%"></span><span class="gate-tick" style="left:${(margin / max) * 100}%"></span></span><span>${r.toFixed(2)}×</span></div>`;
}

const adapterName = r => (r?.adapter ? `${r.adapter.name} (${r.adapter.backend})` : 'unknown adapter');

function gpuTable(gpu) {
  if (!gpu) return '<p class="empty">No local GPU run is committed yet. Run <code>bash scripts/record-oracle-gpu.sh</code> on the RTX 3060 Ti and commit <code>docs/oracle-local-gpu.json</code>.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Scenario</th><th>Custom vs Vello</th><th>Result</th><th>Custom GPU</th><th>Vello GPU</th><th>Skia CPU (not gated)</th></tr></thead>
    <tbody>${gpu.scenarios.map(s => `<tr><td><a href="${href(s)}">${esc(s.name)}</a></td>
      <td class="ratio">${ratioBar(s.gpu_ratio, gpu.gpu_margin)}</td><td>${status(s.status)}</td><td>${ms(s.custom_gpu_ms)}</td><td>${ms(s.vello_gpu_ms)}</td><td>${ms(s.skia_cpu_ms)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function gpuSource(gpu) {
  if (!gpu) return '';
  return `${esc(adapterName(gpu))}${gpu.commit ? `, commit <a href="${REPO}/commit/${esc(gpu.commit)}">${esc(gpu.commit.slice(0, 7))}</a>` : ''}${gpu.date ? `, ${esc(gpu.date)}` : ''}`;
}

function runInfo(build, ci, gpu) {
  const parts = [];
  if (build?.sha) parts.push(`Images and FLIP from ${esc(adapterName(ci))}, built from <a href="${REPO}/commit/${esc(build.sha)}">${esc(build.sha.slice(0, 7))}</a>${build.date ? ` on ${esc(build.date)}` : ''}${build.run_url ? ` by <a href="${esc(build.run_url)}">this CI run</a>` : ''}.`);
  if (gpu) parts.push(`GPU time: committed local run on ${gpuSource(gpu)}.`);
  return parts.join(' ');
}

// The comparison closest to its limit, as a share of the limit: where the gate is tightest.
// `keys` picks the custom-vs-oracle comparisons or the Vello–Skia floor.
function tightest(ci, keys) {
  let best = null;
  for (const s of ci.scenarios) {
    for (const [, label, key] of MAPS.filter(m => keys.includes(m[2]))) {
      const f = s[key];
      if (!f) continue;
      for (const [i, part] of [[0, 'mean'], [1, 'p99']]) {
        const share = f[part] / s.flip_limits[i];
        if (!best || share > best.share) best = { share, s, label, part, value: f[part], limit: s.flip_limits[i] };
      }
    }
  }
  return best;
}

export function renderIndex({ ci, gpu, build }) {
  const main = document.querySelector('main');
  if (!ci) {
    main.innerHTML = '<div class="wrap"><p class="empty">No oracle report yet. Run the oracle (<code>bun run oracle</code>), then <code>bash scripts/build-oracle-site.sh</code>.</p></div>';
    return;
  }
  const total = ci.scenarios.length;
  const passed = ci.scenarios.filter(s => s.status === 'pass').length;
  const gaps = ci.scenarios.filter(s => s.status === 'known-gap').length;
  const t = tightest(ci, ['vs_vello', 'vs_skia']);
  const tf = tightest(ci, ['noise_floor']);
  const floorMean = Math.max(...ci.scenarios.map(s => s.noise_floor.mean));
  const floorP99 = Math.max(...ci.scenarios.map(s => s.noise_floor.p99));
  const val = x => fmt(x.value, x.part === 'mean' ? 4 : 3);
  const ratios = gpu ? gpu.scenarios.map(s => s.gpu_ratio).filter(r => r != null) : [];
  const gpuPassed = gpu ? gpu.scenarios.filter(s => s.status === 'pass').length : 0;

  main.innerHTML = `
  <section class="hero"><div class="wrap">
    <h1 class="verdict ${passed + gaps < total ? 'failing' : ''}">${passed} <span class="of">of ${total} scenarios match Vello and Skia</span></h1>
    <p class="lede">Every scenario is one deterministic frame of a lab workload, packed into the same display list and rendered three ways: by the lab's custom Rust/WebGPU path and by two established rasterizers, Vello (GPU) and Skia (tiny-skia, CPU). The custom image is compared with each oracle by NVIDIA FLIP, a perceptual image difference; the two oracles' own difference is the noise floor. Open a scenario to swipe between the renders.</p>
    <div class="gates">
      <div class="gate"><h2>Image gate, CI on lavapipe</h2><p>FLIP against each oracle: mean ≤ ${g(ci.flip_mean_max)}, p99 ≤ ${g(ci.flip_p99_max)}, or the scenario's measured noise floor rounded up</p>${t ? `<p>Closest to its limit: <span class="num">${val(t)}</span> ${esc(t.part)} (limit ${g(t.limit)}), <a href="${href(t.s)}">${esc(t.s.name)}</a> ${esc(t.label)}</p>` : ''}</div>
      <div class="gate"><h2>Noise floor, Vello vs Skia</h2><p>The two oracles disagree by up to <span class="num">${fmt(floorMean, 4)}</span> mean, <span class="num">${fmt(floorP99, 3)}</span> p99 (edge anti-aliasing, ±1/255 rounding of translucent fills).</p>${tf ? `<p>Tightest limit: <a href="${href(tf.s)}">${esc(tf.s.name)}</a> floor ${val(tf)} ${esc(tf.part)} vs limit ${g(tf.limit)}.</p>` : ''}</div>
      <div class="gate"><h2>GPU-time gate, local RTX 3060 Ti</h2><p>Custom ≤ ${(gpu?.gpu_margin ?? ci.gpu_margin).toFixed(2)}× Vello's median GPU frame time</p>${gpu && ratios.length ? `<p>Slowest: <span class="num">${Math.max(...ratios).toFixed(2)}×</span>, ${gpuPassed} of ${gpu.scenarios.length} pass. <a href="#gpu-time">Table</a></p>` : '<p>No local run committed.</p>'}</div>
    </div>
  </div></section>
  <div class="wrap">
    <div class="list">${ci.scenarios.map(s => `
      <article class="scn">
        <div class="info">
          <div class="row"><h3><a href="${href(s)}">${esc(s.name)}</a></h3>${status(s.status)}</div>
          <p class="cap">${esc(s.capability)} · ${esc(s.workload)} · ${s.width}×${s.height} · ${s.commands} commands</p>
          ${flips(s)}
          ${s.problems.length || s.known_gaps.length ? `<ul class="problems">${[...s.problems, ...s.known_gaps].map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
          <a class="open" href="${href(s)}">Swipe compare</a>
        </div>
        <div class="tiles" style="--ar:${s.width} / ${s.height}">
          ${RENDERS.map(([k, label]) => `<a class="tile" href="${href(s)}"><img loading="lazy" src="${img(s, k)}" alt="${esc(s.name)}, ${label}"><figcaption><b>${label}</b></figcaption></a>`).join('')}
          ${MAPS.map(([k, label]) => `<a class="tile" href="${href(s)}"><img loading="lazy" src="${img(s, k)}" alt="FLIP map, ${label}"><figcaption class="flipcap">FLIP ${esc(label)}</figcaption></a>`).join('')}
        </div>
      </article>`).join('')}
      <div class="legend"><span>FLIP 0, identical</span><span class="ramp"></span><span>1, maximally different</span></div>
    </div>
    <section class="section" id="gpu-time">
      <span class="gpu-label">Local RTX 3060 Ti run, not this CI run</span>
      <h2>GPU time</h2>
      <p>Median GPU frame time from timestamp queries: each side warms up untimed, then rounds of ${gpu?.frames ?? 128} back-to-back frames alternate between Vello and the custom path, and each side keeps its fastest round. The gate is ${(gpu?.gpu_margin ?? ci.gpu_margin).toFixed(2)}× Vello, marked on each bar. Skia (tiny-skia) rasterizes on the CPU, so its time is shown for scale only. CI renders on lavapipe, a software Vulkan device, where timing is advisory; these numbers are the latest committed local run (${gpu ? gpuSource(gpu) : 'none yet'}), recorded with <code>scripts/record-oracle-gpu.sh</code>.</p>
      ${gpuTable(gpu)}
    </section>
    <footer>${runInfo(build, ci, gpu)} <a href="${REPO}#oracle-gate">How the gate works</a> · <a href="../">The lab</a> · <a href="${REPO}">Source</a>.</footer>
  </div>`;
  const initial = location.hash.slice(1);
  if (initial) document.getElementById(initial)?.scrollIntoView();
}

export function renderScenario({ ci, gpu, build }) {
  const main = document.querySelector('main');
  const name = new URLSearchParams(location.search).get('s');
  const i = ci ? ci.scenarios.findIndex(s => s.name === name) : -1;
  if (i < 0) {
    main.innerHTML = `<div class="wrap"><p class="empty">${ci ? `No scenario named “${esc(name ?? '')}” in this report.` : 'No oracle report yet.'} <a href="./">Show all scenarios</a></p></div>`;
    return;
  }
  const s = ci.scenarios[i];
  const local = gpu?.scenarios.find(x => x.name === s.name);
  const prev = ci.scenarios[(i - 1 + ci.scenarios.length) % ci.scenarios.length];
  const next = ci.scenarios[(i + 1) % ci.scenarios.length];
  document.title = `${s.name} · 2d-lab oracle`;

  main.innerHTML = `<div class="wrap">
    <p class="crumbs"><a href="./">All scenarios</a></p>
    <h1 class="title">${esc(s.name)}</h1>
    <p class="sub">${esc(s.capability)} · workload ${esc(s.workload)}${s.time_seconds ? ` at t = ${s.time_seconds} s` : ''} · ${s.width}×${s.height} · ${s.commands} commands</p>
    <div class="facts">
      <div class="gate"><h2>FLIP on ${esc(ci.adapter?.name ?? 'CI')}</h2>${flips(s)}<p class="chip-row" style="margin-top:8px">${status(s.status)}</p>
        ${s.problems.length || s.known_gaps.length ? `<ul class="problems">${[...s.problems, ...s.known_gaps].map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</div>
      <div class="gate"><span class="gpu-label">Local run</span><h2>GPU time, ${esc(gpu?.adapter?.name ?? 'RTX 3060 Ti')}</h2>${local ? `<p>Custom <span class="num">${ms(local.custom_gpu_ms)}</span></p><p>Vello ${ms(local.vello_gpu_ms)} · Skia CPU ${ms(local.skia_cpu_ms)}</p>${ratioBar(local.gpu_ratio, gpu.gpu_margin)}<p>${status(local.status)} gate ≤ ${gpu.gpu_margin.toFixed(2)}× Vello${gpu.date ? ` · ${esc(gpu.date)}` : ''}</p>` : '<p>Not in the committed local run.</p>'}</div>
      <div class="gate"><h2>GPU time on ${esc(ci.adapter?.name ?? 'CI')} (${esc(ci.gpu_gate)})</h2><p>Custom ${ms(s.custom_gpu_ms)}</p><p>Vello ${ms(s.vello_gpu_ms)}${s.gpu_ratio != null ? ` · ${s.gpu_ratio.toFixed(2)}×` : ''}</p><p>${ci.gpu_gate === 'enforced' ? 'Hardware adapter; gated.' : 'Software rendering; not gated.'}</p></div>
    </div>
    <div class="modes" role="group" aria-label="Comparison view">
      <button data-m="swipe" aria-pressed="true">Swipe</button>
      <button data-m="side" aria-pressed="false">All six</button>
      <button data-m="toggle" aria-pressed="false">Toggle</button>
    </div>
    <div id="view"></div>
    <nav class="pager"><a href="${href(prev)}">Previous: ${esc(prev.name)}</a><a href="${href(next)}">Next: ${esc(next.name)}</a></nav>
    <footer>${runInfo(build, ci, gpu)}</footer>
  </div>`;

  const legend = `<div class="legend"><span>0, identical</span><span class="ramp"></span><span>1, maximally different</span></div>`;
  const label = Object.fromEntries([...RENDERS, ...MAPS.map(([k, l]) => [k, `FLIP ${l}`])]);
  const PAIRS = [['custom', 'vello'], ['custom', 'skia'], ['vello', 'skia']];
  let pair = 0;
  const view = main.querySelector('#view');
  const modes = {
    swipe: () => {
      const [a, b] = PAIRS[pair];
      view.innerHTML = `<div class="stage-wrap">
        <div class="pairs" role="group" aria-label="Images to compare">${PAIRS.map(([x, y], n) => `<button class="chip" data-p="${n}" aria-pressed="${n === pair}">${label[x]} ↔ ${label[y]}</button>`).join('')}</div>
        <div class="stage" style="--x:50%">
          <img src="${img(s, b)}" alt="${label[b]}">
          <img class="top" src="${img(s, a)}" alt="${label[a]}">
          <span class="handle"></span><span class="tag l">${label[a]}</span><span class="tag r">${label[b]}</span>
          <input type="range" min="0" max="100" step="0.1" value="50" aria-label="Swipe between ${label[a]} and ${label[b]}">
        </div><p class="hint">Drag across the image, or focus it and use the arrow keys.</p></div>`;
      const stage = view.querySelector('.stage');
      const range = stage.querySelector('input');
      range.addEventListener('input', () => stage.style.setProperty('--x', `${range.value}%`));
      view.querySelectorAll('.pairs .chip').forEach(c => c.addEventListener('click', () => { pair = +c.dataset.p; modes.swipe(); }));
    },
    side: () => {
      view.innerHTML = `<div class="sixfold">
        ${RENDERS.map(([k, l]) => `<figure><img src="${img(s, k)}" alt="${l}"><figcaption>${l}${k === 'custom' ? '' : ' (oracle)'}</figcaption></figure>`).join('')}
        ${MAPS.map(([k, l, key]) => `<figure><img src="${img(s, k)}" alt="FLIP map, ${l}"><figcaption>FLIP ${l}: mean ${fmt(s[key]?.mean)}, p99 ${fmt(s[key]?.p99, 3)}</figcaption></figure>`).join('')}
      </div>${legend}`;
    },
    toggle: () => {
      const states = [...RENDERS.map(([k]) => k), ...MAPS.map(([k]) => k)];
      let at = 0;
      view.innerHTML = `<div class="stage-wrap"><div class="stage toggle" role="button" tabindex="0" aria-label="Show the next image">
        <img src="${img(s, states[0])}" alt=""><span class="tag l"></span>
      </div><p class="hint">Click, tap or press Space to cycle the custom path, Vello, Skia and the three FLIP maps.</p>${legend}</div>`;
      const stage = view.querySelector('.stage');
      const image = stage.querySelector('img');
      const tag = stage.querySelector('.tag');
      states.forEach(k => { new Image().src = img(s, k); });
      const show = n => { at = n; image.src = img(s, states[at]); image.alt = label[states[at]]; tag.textContent = label[states[at]]; };
      show(0);
      stage.addEventListener('click', () => show((at + 1) % states.length));
      stage.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); show((at + 1) % states.length); } });
    },
  };
  const buttons = [...main.querySelectorAll('.modes button')];
  const pick = m => {
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    modes[m]();
    try { localStorage.setItem('compare', m); } catch {}
  };
  buttons.forEach(b => b.addEventListener('click', () => pick(b.dataset.m)));
  let saved = 'swipe';
  try { saved = localStorage.getItem('compare') || 'swipe'; } catch {}
  pick(modes[saved] ? saved : 'swipe');
}
