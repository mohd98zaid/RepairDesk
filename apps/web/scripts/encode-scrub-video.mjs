/**
 * Re-encode the disassembly video for smooth scroll scrubbing.
 * Forces every frame to be a keyframe (GOP=1) so seeking is instant.
 * Run: node scripts/encode-scrub-video.mjs
 */

import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ffmpegPath = require('ffmpeg-static');
const input  = path.resolve(__dirname, '../../../iPhone-17-Pro-Max-Disassembly-3D_Media.mp4');
const output = path.resolve(__dirname, '../public/disassembly.mp4');

if (!existsSync(input)) {
  console.error('❌ Source video not found:', input);
  process.exit(1);
}

console.log('🎬 Re-encoding for scroll scrubbing...');
console.log('   Input :', input);
console.log('   Output:', output);

try {
  execFileSync(ffmpegPath, [
    '-y',                      // overwrite output
    '-i', input,               // input file
    '-c:v', 'libx264',         // H.264 codec (universal browser support)
    '-preset', 'slow',         // better compression
    '-crf', '18',              // high quality (lower = better, 18 is near-lossless)
    '-pix_fmt', 'yuv420p',     // broad compatibility
    '-g', '1',                 // GOP size = 1 → EVERY frame is a keyframe
    '-keyint_min', '1',        // minimum keyframe interval = 1
    '-sc_threshold', '0',      // disable scene-cut detection (consistent keyframes)
    '-movflags', '+faststart', // move metadata to front for instant playback
    '-an',                     // strip audio (not needed for scroll scrubbing)
    output,
  ], { stdio: 'inherit' });

  console.log('\n✅ Done! Video encoded for smooth scrubbing at:', output);
} catch (err) {
  console.error('❌ Encoding failed:', err.message);
  process.exit(1);
}
