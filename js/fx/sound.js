// The hatch's sounds and each scene's ambience, from recorded files in sounds/.
// A missing or undecodable file just stays silent. Sound is a bonus: nothing
// here may throw into the page.

const MUTE_KEY = 'flightpath:muted';
const VOLUME = 0.35;
const FADE = 1.2; // seconds, ambience cross-fade
const LOOPS = new Set(['wind', 'chorus', 'gulls']);

const safeStorage = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

export function isMuted(storage = safeStorage()) {
  try { return storage?.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function setMuted(value, storage = safeStorage()) {
  try { storage?.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* not remembered */ }
}

export function createSound({ doc = globalThis.document, storage = safeStorage(), base = 'sounds/' } = {}) {
  let ctx = null;
  let master = null;
  let muted = isMuted(storage);
  let current = null; // { name, source, gain }
  let owlTimer = null;
  const buffers = new Map();

  function context() {
    if (ctx) return ctx;
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(ctx.destination);
    return ctx;
  }

  function load(name) {
    if (!buffers.has(name)) {
      buffers.set(name, (async () => {
        try {
          const res = await fetch(`${base}${name}.mp3`);
          if (!res.ok || !/audio|mpeg|octet/.test(res.headers.get('content-type') ?? '')) return null;
          return await ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          return null;
        }
      })());
    }
    return buffers.get(name);
  }

  function start(name, { loop = false, level = 1 } = {}) {
    if (!context() || typeof ctx.createBufferSource !== 'function') return null;
    const gain = ctx.createGain();
    gain.gain.value = loop ? 0 : level;
    gain.connect(master);
    const voice = { name, gain, source: null };
    load(name).then((buffer) => {
      if (!buffer || voice.stopped) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      source.connect(gain);
      source.start();
      voice.source = source;
      if (loop) gain.gain.setTargetAtTime(level, ctx.currentTime, FADE / 3);
    }).catch(() => {});
    return voice;
  }

  function fadeOut(voice) {
    if (!voice) return;
    voice.stopped = true;
    try {
      voice.gain.gain.setTargetAtTime(0, ctx.currentTime, FADE / 3);
      setTimeout(() => { try { voice.source?.stop(); voice.gain.disconnect(); } catch { /* gone */ } }, FADE * 1500);
    } catch { /* gone */ }
  }

  const onVisibility = () => {
    if (!ctx) return;
    if (doc.hidden) ctx.suspend().catch(() => {});
    else if (!muted) ctx.resume().catch(() => {});
  };
  doc?.addEventListener?.('visibilitychange', onVisibility);

  return {
    /** Call from a tap, drop or key press: browsers only start audio after one. */
    unlock() {
      try {
        if (!context()) return;
        if (!muted && ctx.state === 'suspended') ctx.resume().catch(() => {});
        for (const name of ['crack', 'flutter', 'wind']) load(name);
      } catch { /* bonus */ }
    },
    play(name) {
      try { if (!muted) start(name); } catch { /* bonus */ }
    },
    /** A looping bed for the scene: wind, chorus, gulls; owl = wind plus one hoot. null = silence. */
    ambient(name) {
      try {
        clearTimeout(owlTimer);
        const bed = name === 'owl' ? 'wind' : name;
        if (name === 'owl') owlTimer = setTimeout(() => { if (!muted) start('owl', { level: 0.8 }); }, 1500);
        if (current?.name === bed) return;
        if (ctx) fadeOut(current);
        current = bed && LOOPS.has(bed) ? start(bed, { loop: true, level: 0.6 }) : null;
      } catch { /* bonus */ }
    },
    setMuted(value) {
      muted = value;
      setMuted(value, storage);
      try {
        if (!ctx) return;
        master.gain.setTargetAtTime(value ? 0 : VOLUME, ctx.currentTime, 0.05);
        if (!value && !doc?.hidden) ctx.resume().catch(() => {});
      } catch { /* bonus */ }
    },
    get muted() { return muted; },
    dispose() {
      clearTimeout(owlTimer);
      doc?.removeEventListener?.('visibilitychange', onVisibility);
      const c = ctx;
      ctx = null;
      current = null;
      buffers.clear();
      c?.close?.().catch(() => {});
    },
  };
}
