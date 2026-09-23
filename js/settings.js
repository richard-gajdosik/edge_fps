// =========================================================================
//  SETTINGS — audio / graphics / controls, saved in localStorage
// =========================================================================
const SETTINGS_DEFAULT = {
  music: 70, sfx: 80,
  quality: 'high',        // render resolution: low | medium | high | ultra
  shadows: 'high',        // off | low | high | ultra
  effects: true,          // film grain + vignette
  backdrop: true,         // skyline, terrain, clouds
  fps: true,              // FPS counter
  fov: 80, sens: 1.0,
};
const SETTINGS = Object.assign({}, SETTINGS_DEFAULT);
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem('edge_settings') || '{}')); } catch (e) {}
function saveSettings() { try { localStorage.setItem('edge_settings', JSON.stringify(SETTINGS)); } catch (e) {} }

// render resolution: ultra = full retina, high = capped at 1.25, medium/low render below native
function pixelRatioFor(q) {
  const dpr = devicePixelRatio || 1;
  return { low: 0.55, medium: 0.8, high: Math.min(dpr, 1.25), ultra: Math.min(dpr, 2) }[q] || 1;
}
const SHADOW_SIZE = { low: 1024, high: 2048, ultra: 4096 };

function musicLevel() { return 0.32 * SETTINGS.music / 100; }
function sfxLevel() { return 0.6 * SETTINGS.sfx / 100; }

function applySettings() {
  // audio
  if (actx) {
    sfxGain.gain.setTargetAtTime(sfxLevel(), actx.currentTime, 0.05);
    if (musicPlaying) musicGain.gain.setTargetAtTime(musicLevel(), actx.currentTime, 0.1);
  }
  // resolution
  renderer.setPixelRatio(pixelRatioFor(SETTINGS.quality));
  renderer.setSize(innerWidth, innerHeight);
  // shadows (changing castShadow makes three.js rebuild the affected shaders)
  sun.castShadow = SETTINGS.shadows !== 'off';
  const size = SHADOW_SIZE[SETTINGS.shadows] || 2048;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  // post / backdrop / hud
  document.getElementById('grain').style.display    = SETTINGS.effects ? '' : 'none';
  document.getElementById('vignette').style.display = SETTINGS.effects ? '' : 'none';
  backdrop.visible = SETTINGS.backdrop;
  document.getElementById('fps').style.display = SETTINGS.fps ? '' : 'none';
}

// ---------- settings panel ----------
const SETTINGS_UI = [
  { head: 'ZVUK' },
  { key: 'music',   label: 'Hudba',          type: 'range', min: 0, max: 100, step: 1, fmt: v => v + ' %' },
  { key: 'sfx',     label: 'Zvuky',          type: 'range', min: 0, max: 100, step: 1, fmt: v => v + ' %' },
  { head: 'GRAFIKA' },
  { key: 'quality', label: 'Rozlíšenie',     type: 'choice', options: [['low','NÍZKE'],['medium','STREDNÉ'],['high','VYSOKÉ'],['ultra','ULTRA']] },
  { key: 'shadows', label: 'Tiene',          type: 'choice', options: [['off','VYP'],['low','NÍZKE'],['high','VYSOKÉ'],['ultra','ULTRA']] },
  { key: 'effects', label: 'Zrno + vinetácia', type: 'toggle' },
  { key: 'backdrop',label: 'Mesto a mraky',  type: 'toggle' },
  { key: 'fps',     label: 'FPS počítadlo',  type: 'toggle' },
  { head: 'OVLÁDANIE' },
  { key: 'fov',     label: 'Zorné pole (FOV)', type: 'range', min: 65, max: 115, step: 1, fmt: v => v + '°' },
  { key: 'sens',    label: 'Citlivosť myši', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: v => (+v).toFixed(2) + '×' },
];

function buildSettingsPanel() {
  const body = document.getElementById('settingsbody');
  body.innerHTML = '';
  for (const it of SETTINGS_UI) {
    if (it.head) { const h = document.createElement('div'); h.className = 'shead'; h.textContent = it.head; body.appendChild(h); continue; }
    const row = document.createElement('div'); row.className = 'srow';
    const lab = document.createElement('span'); lab.className = 'slabel'; lab.textContent = it.label;
    const ctl = document.createElement('div'); ctl.className = 'sctl';
    row.append(lab, ctl);
    if (it.type === 'range') {
      const inp = document.createElement('input');
      Object.assign(inp, { type: 'range', min: it.min, max: it.max, step: it.step, value: SETTINGS[it.key] });
      const val = document.createElement('span'); val.className = 'sval'; val.textContent = it.fmt(SETTINGS[it.key]);
      inp.addEventListener('input', () => {
        SETTINGS[it.key] = parseFloat(inp.value); val.textContent = it.fmt(SETTINGS[it.key]);
        applySettings(); saveSettings();
      });
      ctl.append(inp, val);
    } else {
      const opts = it.type === 'toggle' ? [[true, 'ZAP'], [false, 'VYP']] : it.options;
      for (const [v, text] of opts) {
        const b = document.createElement('button'); b.textContent = text;
        b.classList.toggle('on', SETTINGS[it.key] === v);
        b.addEventListener('click', () => {
          SETTINGS[it.key] = v; applySettings(); saveSettings();
          for (const c of ctl.children) c.classList.toggle('on', c === b);
        });
        ctl.appendChild(b);
      }
    }
    body.appendChild(row);
  }
}

function showSettings(show) {
  document.getElementById('overlay').classList.toggle('settings-open', show);
  if (show) buildSettingsPanel();
}
document.getElementById('settingsbtn').addEventListener('click', e => { e.stopPropagation(); showSettings(true); });
document.getElementById('settingsback').addEventListener('click', e => { e.stopPropagation(); showSettings(false); });
document.getElementById('settingsreset').addEventListener('click', e => {
  e.stopPropagation();
  Object.assign(SETTINGS, SETTINGS_DEFAULT); saveSettings(); applySettings(); buildSettingsPanel();
});

// ---------- FPS counter ----------
const elFps = document.getElementById('fps');
let fpsFrames = 0, fpsTime = 0, fpsWorst = 0;
function updateFps(rawDt) {
  fpsFrames++; fpsTime += rawDt; fpsWorst = Math.max(fpsWorst, rawDt);
  if (fpsTime >= 0.5) {
    const fps = fpsFrames / fpsTime;
    elFps.innerHTML = `<b>${Math.round(fps)}</b> FPS · ${(fpsTime / fpsFrames * 1000).toFixed(1)} ms · max ${(fpsWorst * 1000).toFixed(0)} ms`;
    elFps.classList.toggle('low', fps < 50);
    fpsFrames = 0; fpsTime = 0; fpsWorst = 0;
  }
}
