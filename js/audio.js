// =========================================================================
//  AUDIO  (procedural — SFX + drum & bass, no audio files)
// =========================================================================
let actx = null, master = null, sfxGain = null, musicGain = null, noiseBuf = null;
let musicWanted = true, musicPlaying = false, musicTimer = null;

function initAudio() {
  if (actx) { actx.resume(); if (musicWanted && !musicPlaying) startMusic(); return; }
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination);
  sfxGain = actx.createGain(); sfxGain.gain.value = 0.6; sfxGain.connect(master);
  musicGain = actx.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);
  // noise buffer
  const len = actx.sampleRate;
  noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i=0;i<len;i++) d[i] = Math.random()*2-1;
  if (musicWanted) startMusic();
}
function noise(dest, dur, when) {
  const s = actx.createBufferSource(); s.buffer = noiseBuf; s.connect(dest);
  s.start(when); s.stop(when + dur); return s;
}

// ---- SFX ----
function sfxStep(vol) {
  if (!actx) return;
  const t = actx.currentTime;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.11);
  const bp = actx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=900; bp.Q.value=0.8;
  bp.connect(g); g.connect(sfxGain); noise(bp, 0.12, t);
  const o = actx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(85, t); o.frequency.exponentialRampToValueAtTime(45, t+0.09);
  const og = actx.createGain(); og.gain.setValueAtTime(vol*0.5,t); og.gain.exponentialRampToValueAtTime(0.001,t+0.1);
  o.connect(og); og.connect(sfxGain); o.start(t); o.stop(t+0.12);
}
function sfxJump(pitch=1) {
  if (!actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(220*pitch, t); o.frequency.exponentialRampToValueAtTime(560*pitch, t+0.12);
  const g = actx.createGain(); g.gain.setValueAtTime(0.25,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.14);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t+0.16);
  const bp = actx.createBiquadFilter(); bp.type='highpass'; bp.frequency.value=1200;
  const ng = actx.createGain(); ng.gain.setValueAtTime(0.12,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.1);
  bp.connect(ng); ng.connect(sfxGain); noise(bp, 0.1, t);
}
function sfxLand(vol) {
  if (!actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(50, t+0.14);
  const g = actx.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.18);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t+0.2);
  const lp = actx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2500;
  const ng = actx.createGain(); ng.gain.setValueAtTime(vol*0.6,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.12);
  lp.connect(ng); ng.connect(sfxGain); noise(lp, 0.12, t);
}
function sfxSlide() {
  if (!actx) return;
  const t = actx.currentTime;
  const lp = actx.createBiquadFilter(); lp.type='lowpass';
  lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(500, t+0.5);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.24, t+0.05);
  g.gain.exponentialRampToValueAtTime(0.001, t+0.55);
  lp.connect(g); g.connect(sfxGain); noise(lp, 0.56, t);
}
function sfxMantle() {
  if (!actx) return;
  const t = actx.currentTime;
  const bp = actx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=500; bp.Q.value=1;
  const g = actx.createGain(); g.gain.setValueAtTime(0.2,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.22);
  bp.connect(g); g.connect(sfxGain); noise(bp, 0.24, t);
}

// ---- MUSIC: procedural drum & bass (174 BPM) ----
const BPM = 174, STEP = 60/BPM/4;
const pKick  = [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0];
const pSnare = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1];
const pHat   = [0,1,0,1, 0,1,1,1, 0,1,0,1, 0,1,1,1];
const barRoots = [41.20, 41.20, 55.00, 48.99]; // E1 E1 A1 G1 (4-bar loop)
let step16 = 0, barCount = 0, nextNoteTime = 0;

function mKick(t){
  const o=actx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(140,t); o.frequency.exponentialRampToValueAtTime(45,t+0.11);
  const g=actx.createGain(); g.gain.setValueAtTime(1.0,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t+0.22);
}
function mSnare(t){
  const bp=actx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1900; bp.Q.value=0.6;
  const g=actx.createGain(); g.gain.setValueAtTime(0.5,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.15);
  bp.connect(g); g.connect(musicGain); noise(bp,0.16,t);
  const o=actx.createOscillator(); o.type='triangle'; o.frequency.value=180;
  const og=actx.createGain(); og.gain.setValueAtTime(0.25,t); og.gain.exponentialRampToValueAtTime(0.001,t+0.1);
  o.connect(og); og.connect(musicGain); o.start(t); o.stop(t+0.12);
}
function mHat(t, accent){
  const hp=actx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=8000;
  const g=actx.createGain(); const v=accent?0.16:0.08;
  g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.03);
  hp.connect(g); g.connect(musicGain); noise(hp,0.04,t);
}
function mSub(t, f){
  const o=actx.createOscillator(); o.type='sine'; o.frequency.value=f;
  const g=actx.createGain();
  g.gain.setValueAtTime(0.0,t); g.gain.linearRampToValueAtTime(0.55,t+0.01);
  g.gain.setValueAtTime(0.55,t+0.12); g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t+0.22);
}
function mReese(t, f){
  const lp=actx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=420; lp.Q.value=6;
  const g=actx.createGain();
  g.gain.setValueAtTime(0.0,t); g.gain.linearRampToValueAtTime(0.12,t+0.02);
  g.gain.exponentialRampToValueAtTime(0.001,t+0.45);
  const o1=actx.createOscillator(); o1.type='sawtooth'; o1.frequency.value=f*2; o1.detune.value=-8;
  const o2=actx.createOscillator(); o2.type='sawtooth'; o2.frequency.value=f*2; o2.detune.value=8;
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(musicGain);
  o1.start(t); o2.start(t); o1.stop(t+0.46); o2.stop(t+0.46);
}
function scheduleStep(step, t) {
  const root = barRoots[barCount % barRoots.length];
  if (pKick[step])  { mKick(t); mSub(t, root); }
  if (pSnare[step]) mSnare(t);
  if (pHat[step])   mHat(t, step % 4 === 2);
  if (step === 0)   mReese(t, root);
  if (step === 8)   mSub(t, root); // extra bass push mid-bar
}
function musicScheduler() {
  while (nextNoteTime < actx.currentTime + 0.12) {
    scheduleStep(step16, nextNoteTime);
    nextNoteTime += STEP;
    step16 = (step16 + 1) % 16;
    if (step16 === 0) barCount++;
  }
}
function startMusic() {
  if (!actx || musicPlaying) return;
  musicPlaying = true;
  step16 = 0; barCount = 0; nextNoteTime = actx.currentTime + 0.1;
  musicGain.gain.cancelScheduledValues(actx.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, actx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.32, actx.currentTime + 1.0);
  musicTimer = setInterval(musicScheduler, 25);
}
function stopMusic() {
  if (!musicPlaying) return;
  musicPlaying = false;
  clearInterval(musicTimer);
  musicGain.gain.linearRampToValueAtTime(0.0, actx.currentTime + 0.3);
}
function toggleMusic() {
  musicWanted = !musicWanted;
  document.getElementById('musictoggle').textContent = '♪ HUDBA: ' + (musicWanted ? 'ZAP' : 'VYP');
  document.getElementById('music').style.opacity = musicWanted ? '0.35' : '0.12';
  if (!actx) return;
  musicWanted ? startMusic() : stopMusic();
}
document.getElementById('musictoggle').addEventListener('click', (e) => { e.stopPropagation(); toggleMusic(); });

// ---- WEAPON SFX ----
function sfxShot(kind) {
  if (!actx) return;
  const t = actx.currentTime;
  const heavy = kind === 'pistol';
  // crack: filtered noise burst
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = heavy ? 3800 : 5200;
  const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = heavy ? 300 : 700;
  const ng = actx.createGain(); const dur = heavy ? 0.14 : 0.07;
  ng.gain.setValueAtTime(heavy ? 0.55 : 0.34, t); ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
  hp.connect(lp); lp.connect(ng); ng.connect(sfxGain); noise(hp, dur + 0.01, t);
  // body: pitch-dropping thump
  const o = actx.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(heavy ? 170 : 240, t); o.frequency.exponentialRampToValueAtTime(heavy ? 45 : 90, t + dur);
  const og = actx.createGain(); og.gain.setValueAtTime(heavy ? 0.5 : 0.28, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(og); og.connect(sfxGain); o.start(t); o.stop(t + dur + 0.02);
}
function sfxClick(freq = 1800, vol = 0.12, when = 0) {
  if (!actx) return;
  const t = actx.currentTime + when;
  const o = actx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
  const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.04);
}
function sfxEmpty() { sfxClick(2400, 0.08); }
function sfxReload(dur) { sfxClick(900, 0.1, 0.05); sfxClick(1300, 0.12, dur * 0.55); sfxClick(700, 0.14, dur - 0.08); }
function sfxSwitch() { sfxClick(1100, 0.07); }
function sfxHit(crit) {
  if (!actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = crit ? 1900 : 1250;
  const g = actx.createGain(); g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.07);
}
function sfxBreak() {
  if (!actx) return;
  const t = actx.currentTime;
  const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.7;
  const g = actx.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  bp.connect(g); g.connect(sfxGain); noise(bp, 0.36, t);
  const o = actx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
  const og = actx.createGain(); og.gain.setValueAtTime(0.18, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(og); og.connect(sfxGain); o.start(t); o.stop(t + 0.2);
}
