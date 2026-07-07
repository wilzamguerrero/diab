import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

/**
 * Generate valid PNG icons for PWA manifest.
 * Creates solid dark-blue squares with a simple drop shape.
 * Replace these with properly designed icons later.
 */

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function createPng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);   // width
  ihdrData.writeUInt32BE(size, 4);   // height
  ihdrData.writeUInt8(8, 8);         // bit depth
  ihdrData.writeUInt8(2, 9);         // color type RGB
  ihdrData.writeUInt8(0, 10);        // compression
  ihdrData.writeUInt8(0, 11);        // filter
  ihdrData.writeUInt8(0, 12);        // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // Image data: dark blue background (#1a1f36) with a lime drop in center
  const bgR = 26, bgG = 31, bgB = 54;
  const fgR = 200, fgG = 255, fgB = 0;
  const centerX = size / 2, centerY = size / 2;
  const radius = size * 0.22;

  const rawRows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3); // filter byte + RGB per pixel
    row[0] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Draw circle (body of drop) + triangle (drip)
      const inCircle = dist <= radius && dy >= -radius * 0.8;
      const inTop = dy < -radius * 0.3 && dy > -radius * 1.8 && Math.abs(dx) < (-dy - radius * 0.3) * 0.5;
      const isIcon = inCircle || inTop;

      const offset = 1 + x * 3;
      if (isIcon) {
        row[offset] = fgR;
        row[offset + 1] = fgG;
        row[offset + 2] = fgB;
      } else {
        row[offset] = bgR;
        row[offset + 1] = bgG;
        row[offset + 2] = bgB;
      }
    }
    rawRows.push(row);
  }

  const rawData = Buffer.concat(rawRows);
  const compressed = deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

writeFileSync('public/icon-192.png', createPng(192));
console.log('Created public/icon-192.png');

writeFileSync('public/icon-512.png', createPng(512));
console.log('Created public/icon-512.png');
