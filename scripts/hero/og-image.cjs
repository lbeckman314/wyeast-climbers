// Frame a capture of the 3D model as public/og.jpg, the 1200x630 link-preview image.
//
//   node scripts/hero/og-image.cjs capture.png public/og.jpg
//
// To capture: open the site at a 1200x760 window, and before the model loads run this in the console
//   const g = HTMLCanvasElement.prototype.getContext;
//   HTMLCanvasElement.prototype.getContext = function (t, o) { return g.call(this, t, /webgl/.test(t) ? { ...o, preserveDrawingBuffer: true } : o); };
// then, once it has drawn, save document.querySelector('.stage canvas').toDataURL() as a PNG.
const sharp = require("sharp");
const [, , src, out] = process.argv;
(async () => {
  const W = 2400, H = 1260, PAD = 150;
  // sky = 85% --sky + 15% --paper at the top, fading to --paper
  const mix = (a, b, t) => a.map((v, i) => Math.round(v * t + b[i] * (1 - t)));
  const sky = mix([0xdb, 0xe5, 0xe9], [0xf5, 0xf0, 0xe6], 0.85), paper = [0xf5, 0xf0, 0xe6];
  const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex(sky)}"/><stop offset="1" stop-color="${hex(paper)}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  const cap = await sharp(src).extract({ left: 0, top: 0, width: 2400, height: H - PAD }).toBuffer();
  const base = await sharp(bg).png().toBuffer();
  const full = await sharp(base).composite([{ input: cap, top: PAD, left: 0 }]).flatten().png().toBuffer();
  await sharp(full).resize(1200, 630)
    .jpeg({ quality: 82, mozjpeg: true }).toFile(out);
  console.log("wrote", out);
})();
