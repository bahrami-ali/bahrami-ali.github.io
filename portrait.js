// Text-character portrait: samples assets/portrait.png (grayscale + transparency) into glyphs that
// assemble on load, move away from the pointer, then settle. The loop stops when nothing moves.
(() => {
  "use strict";
  const RAMP = " .:-=+*#%@";  // light to dense
  const canvas = document.getElementById("portrait");
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer = { x: 0, y: 0, t: 0, active: false };
  let size = 0, photo = null, lo = 0, hi = 1, color = "", font = "", parts = [], start = 0, running = false;
  let sx = -1e4, sy = -1e4; // smoothed pointer


  function fit() {
    size = canvas.getBoundingClientRect().width;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Each glyph covers one cell; the photo is shrunk to one pixel per cell, which averages the cell's tones.
  function cells(cols, rows) {
    const c = document.createElement("canvas");
    c.width = cols; c.height = rows;
    const cc = c.getContext("2d", { willReadFrequently: true });
    cc.imageSmoothingQuality = "high";
    cc.drawImage(photo, 0, 0, cols, rows);
    return cc.getImageData(0, 0, cols, rows).data;
  }

  function build() {
    if (!photo) return;
    const style = getComputedStyle(document.documentElement);
    const dark = style.colorScheme === "dark";
    color = style.getPropertyValue("--ink").trim();
    const fs = size < 300 ? 5 : 7, cols = Math.floor(size / (fs * 0.7)), rows = Math.floor(size / (fs * 1.1));
    const px = cells(cols, rows), cw = size / cols, ch = size / rows;
    const scatter = reduced ? 0 : size;
    parts = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 4;
        if (px[i + 3] < 128) continue;                // transparent background
        const lum = px[i] / 255;
        // Dark theme: bright skin gets dense glyphs. Light theme: stretch to the photo's tone range so skin
        // stays light and features (brows, eyes, beard) carry the ink, like a pencil drawing.
        const weight = dark ? lum : 1 - Math.min(1, Math.max(0, (lum - lo) / Math.max(hi - lo, 0.01)));
        const glyph = RAMP[Math.round(weight * (RAMP.length - 1))];
        if (glyph === " ") continue;
        const x = (c + 0.5) * cw, y = (r + 0.5) * ch;
        parts.push({ tx: x, ty: y, x: x + (Math.random() - 0.5) * scatter, y: y + (Math.random() - 0.5) * scatter,
                     vx: 0, vy: 0, glyph, alpha: 0.35 + 0.65 * weight, delay: reduced ? 0 : Math.random() * 0.4,
                     phase: Math.random() * Math.PI * 2 });
      }
    }
    font = `${fs}px ui-monospace, Menlo, Consolas, monospace`;
    start = performance.now() - (reduced ? 5000 : 0);
    wake();
  }

  function wake() { if (!running) { running = true; requestAnimationFrame(frame); } }

  function frame(now) {
    const t = (now - start) / 1000;
    const recent = pointer.active && now - pointer.t < 1500; // a cursor resting still lets the loop sleep
    const lively = !reduced && (recent || t < 3);
    sx += ((pointer.active ? pointer.x : -1e4) - sx) * 0.15;
    sy += ((pointer.active ? pointer.y : -1e4) - sy) * 0.15;
    const radius = size * 0.2;
    let moving = false;
    ctx.clearRect(0, 0, size, size);
    // Text settings are set every frame because resizing a canvas resets them.
    Object.assign(ctx, { font, fillStyle: color, textAlign: "center", textBaseline: "middle" });
    for (const p of parts) {
      const age = t - p.delay;
      if (age < 0) { moving = true; continue; }
      const fade = 1 - (1 - Math.min(age / 1.5, 1)) ** 2;
      const pull = 0.01 + 0.08 * (1 - (1 - Math.min(age / 2.5, 1)) ** 3);
      if (pointer.active && !reduced) {
        const dx = p.x - sx, dy = p.y - sy, d = Math.hypot(dx, dy);
        if (d > 0 && d < radius) { const f = (1 - d / radius) * 3; p.vx += (dx / d) * f; p.vy += (dy / d) * f; }
      }
      p.vx += (p.tx - p.x) * pull;
      p.vy += (p.ty - p.y) * pull;
      if (lively) {
        p.vx += Math.sin(t * 0.5 + p.ty * 0.1) * 0.12;
        p.vy += Math.cos(t * 0.5 + p.tx * 0.1) * 0.12;
      }
      const damping = lively ? 0.9 : 0.82;
      p.vx *= damping; p.vy *= damping;
      p.x += p.vx; p.y += p.vy;
      if (Math.abs(p.vx) + Math.abs(p.vy) > 0.02 || Math.abs(p.tx - p.x) + Math.abs(p.ty - p.y) > 0.1) moving = true;
      else { p.x = p.tx; p.y = p.ty; }
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha * fade + (lively ? Math.sin(t * 2 + p.phase) * 0.1 : 0)));
      ctx.fillText(p.glyph, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    running = moving || lively;
    if (running) requestAnimationFrame(frame);
  }

  // If the image cannot be read (e.g. page opened as a local file), show the plain photo instead.
  function fallback(img) {
    img.alt = canvas.getAttribute("aria-label");
    canvas.replaceWith(img);
  }

  // Tone range of the opaque pixels (2nd to 98th percentile), used to stretch contrast in the light theme.
  function toneRange(source) {
    const c = document.createElement("canvas");
    c.width = source.width; c.height = source.height;
    const cc = c.getContext("2d", { willReadFrequently: true });
    cc.drawImage(source, 0, 0);
    const d = cc.getImageData(0, 0, c.width, c.height).data, tones = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128) tones.push(d[i] / 255);
    if (!tones.length) return [0, 1];
    tones.sort((a, b) => a - b);
    return [tones[Math.floor(tones.length * 0.02)], tones[Math.floor(tones.length * 0.98)]];
  }

  const img = new Image();
  img.onload = () => {
    try { [lo, hi] = toneRange(img); } catch (e) { fallback(img); return; }
    photo = img;
    fit();
    build();
  };
  img.src = "assets/portrait.png";

  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    Object.assign(pointer, { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now(), active: true });
    wake();
  });
  canvas.addEventListener("pointerleave", () => { pointer.active = false; });
  canvas.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") pointer.active = false; });
  // Phones fire resize when the address bar shows or hides on scroll; only a width change needs a rebuild.
  addEventListener("resize", () => {
    if (Math.abs(canvas.getBoundingClientRect().width - size) > 1) { fit(); build(); }
  });
  new MutationObserver(build).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
