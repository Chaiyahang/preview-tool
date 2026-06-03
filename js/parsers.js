// parsers.js — All binary format parsers

export function parseExifData(data, info) {
  var le = data[0] === 0x49;
  function read16(off) { return le ? (data[off] | (data[off+1]<<8)) : ((data[off]<<8) | data[off+1]); }
  function read32(off) { return le ? (data[off] | (data[off+1]<<8) | (data[off+2]<<16) | (data[off+3]<<24)) : ((data[off]<<24) | (data[off+1]<<16) | (data[off+2]<<8) | data[off+3]); }
  function readRational(off) { var n = read32(off), d = read32(off+4); return d ? n/d : 0; }
  function readString(off, len) { var s = ''; for (var i = 0; i < len && data[off+i] !== 0; i++) s += String.fromCharCode(data[off+i]); return s.trim(); }

  if (read16(2) !== 0x002A) return;
  var ifdOffset = read32(4);
  var gpsIfdOffset = 0, exifIfdOffset = 0;

  function parseIFD(off) {
    if (off + 2 > data.length) return;
    var count = read16(off); off += 2;
    for (var i = 0; i < count && off + 12 <= data.length; i++) {
      var tag = read16(off), type = read16(off+2), cnt = read32(off+4), valOff = off + 8;
      if (cnt * [0,1,1,2,4,8,1,1,2,4,8,4,8][type] > 4) valOff = read32(off+8);
      if (tag === 0x010F || tag === 0x0110) {
        var str = readString(valOff, cnt);
        if (tag === 0x010F) info.camera = str;
        else info.camera = (info.camera ? info.camera + ' ' : '') + str;
      }
      if (tag === 0x0132 || tag === 0x9003) { info.dateTime = readString(valOff, cnt).replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'); }
      if (tag === 0x829A) { var num = read32(valOff), den = read32(valOff+4); if (den) info.exposureTime = num + '/' + den; }
      if (tag === 0x829D) { info.fNumber = readRational(valOff); }
      if (tag === 0x8827) { info.iso = (type === 3) ? read16(valOff) : read32(valOff); }
      if (tag === 0x920A) { info.focalLength = readRational(valOff); }
      if (tag === 0xA405) { info.focalLength35 = (type === 3) ? read16(valOff) : read32(valOff); }
      if (tag === 0x8769) { exifIfdOffset = read32(off+8); }
      if (tag === 0x8825) { gpsIfdOffset = read32(off+8); }
      off += 12;
    }
  }

  parseIFD(ifdOffset);
  if (exifIfdOffset > 0 && exifIfdOffset < data.length) parseIFD(exifIfdOffset);
  var nextIfdOff = ifdOffset + 2 + read16(ifdOffset) * 12;
  if (nextIfdOff + 4 <= data.length) { var nextIfd = read32(nextIfdOff); if (nextIfd > 0 && nextIfd < data.length) parseIFD(nextIfd); }

  if (gpsIfdOffset > 0 && gpsIfdOffset + 2 < data.length) {
    var gpsCount = read16(gpsIfdOffset); var gOff = gpsIfdOffset + 2;
    var lat = 0, lng = 0, latRef = 'N', lngRef = 'E';
    for (var i = 0; i < gpsCount && gOff + 12 <= data.length; i++) {
      var gTag = read16(gOff), gType = read16(gOff+2), gCnt = read32(gOff+4), gValOff = gOff + 8;
      if (gCnt * [0,1,1,2,4,8,1,1,2,4,8,4,8][gType] > 4) gValOff = read32(gOff+8);
      if (gTag === 1) latRef = String.fromCharCode(data[gValOff]);
      if (gTag === 3) lngRef = String.fromCharCode(data[gValOff]);
      if (gTag === 2) { lat = readRational(gValOff) + readRational(gValOff+8)/60 + readRational(gValOff+16)/3600; }
      if (gTag === 4) { lng = readRational(gValOff) + readRational(gValOff+8)/60 + readRational(gValOff+16)/3600; }
      gOff += 12;
    }
    if (lat !== 0 || lng !== 0) {
      if (latRef === 'S') lat = -lat;
      if (lngRef === 'W') lng = -lng;
      info.gps = { lat: lat, lng: lng };
    }
  }
}

export function parseEXIF(bytes, info) {
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return;
  var offset = 2;
  while (offset < bytes.length - 4) {
    if (bytes[offset] !== 0xFF) break;
    var marker = bytes[offset + 1];
    if (marker === 0xE1) {
      var len = (bytes[offset + 2] << 8) | bytes[offset + 3];
      var exifData = bytes.slice(offset + 4, offset + 2 + len);
      if (String.fromCharCode(exifData[0], exifData[1], exifData[2], exifData[3]) === 'Exif') {
        parseExifData(exifData.slice(6), info);
      }
      return;
    }
    var segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 2 + segLen;
  }
}

export function parseGIF(bytes, info) {
  if (bytes.length < 13) return;
  info.gifVersion = String.fromCharCode(bytes[3], bytes[4], bytes[5]);
  info.width = bytes[6] | (bytes[7] << 8); info.height = bytes[8] | (bytes[9] << 8);
  var offset = 13; if (bytes[10] & 0x80) offset += 3 * (1 << ((bytes[10] & 0x07) + 1));
  var frames = 0, totalDelay = 0;
  while (offset < bytes.length) {
    if (bytes[offset] === 0x21) {
      if (bytes[offset + 1] === 0xF9 && bytes[offset + 2] >= 4) { totalDelay += (bytes[offset + 4] | (bytes[offset + 5] << 8)) * 10; offset += bytes[offset + 2] + 4; }
      else if (bytes[offset + 1] === 0xFF && bytes[offset + 2] >= 15) {
        var nsStart = offset + 3;
        if (String.fromCharCode.apply(null, Array.from(bytes.slice(nsStart, nsStart + 11))) === 'NETSCAPE2.0') {
          info.loopCount = bytes[nsStart + 12] | (bytes[nsStart + 13] << 8);
        }
        offset += bytes[offset + 2] + 3;
      } else { offset += 2; while (offset < bytes.length && bytes[offset] !== 0) offset += bytes[offset] + 1; offset++; }
    }
    else if (bytes[offset] === 0x2C) { frames++; offset += 10; if (bytes[offset - 1] & 0x80) offset += 3 * (1 << ((bytes[offset - 1] & 0x07) + 1)); offset++; while (offset < bytes.length && bytes[offset] !== 0) offset += bytes[offset] + 1; offset++; }
    else if (bytes[offset] === 0x3B) { break; } else { offset++; }
  }
  info.frames = frames; info.duration = totalDelay / 1000; info.animated = frames > 1;
}

export function parseWebP(bytes, info) {
  if (bytes.length < 30) return; var offset = 12; var frameDurations = [];
  while (offset < bytes.length - 8) {
    var chunk = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]);
    var size = bytes[offset+4] | (bytes[offset+5]<<8) | (bytes[offset+6]<<16) | (bytes[offset+7]<<24);
    if (chunk === 'VP8X') { info.animated = !!(bytes[offset + 8] & 0x02); info.hasAlpha = !!(bytes[offset + 8] & 0x10); info.width = ((bytes[offset+12] | (bytes[offset+13]<<8) | (bytes[offset+14]<<16)) & 0xFFFFFF) + 1; info.height = ((bytes[offset+15] | (bytes[offset+16]<<8) | (bytes[offset+17]<<16)) & 0xFFFFFF) + 1; }
    else if (chunk === 'VP8 ') { info.compression = 'Lossy'; if (!info.width && size > 10) { info.width = (bytes[offset+14] | (bytes[offset+15]<<8)) & 0x3FFF; info.height = (bytes[offset+16] | (bytes[offset+17]<<8)) & 0x3FFF; } }
    else if (chunk === 'VP8L') { info.compression = 'Lossless'; }
    else if (chunk === 'ANIM') { info.loopCount = bytes[offset+8] | (bytes[offset+9] << 8); }
    else if (chunk === 'ANMF') { info.frames++; frameDurations.push(bytes[offset+20] | (bytes[offset+21] << 8)); }
    else if (chunk === 'EXIF') { var exifBytes = bytes.slice(offset + 8, offset + 8 + size); if (exifBytes[0] === 0x49 || exifBytes[0] === 0x4D) { parseExifData(exifBytes, info); } else if (exifBytes.length > 6 && String.fromCharCode(exifBytes[0], exifBytes[1], exifBytes[2], exifBytes[3]) === 'Exif') { parseExifData(exifBytes.slice(6), info); } }
    offset += 8 + size + (size & 1);
  }
  if (frameDurations.length > 1) { var sorted = frameDurations.slice(0, -1).sort(function(a, b) { return a - b; }); var median = sorted[Math.floor(sorted.length / 2)]; if (frameDurations[frameDurations.length - 1] > median * 3) { info.duration = frameDurations.slice(0, -1).reduce(function(s, d) { return s + d; }, 0); } else { info.duration = frameDurations.reduce(function(s, d) { return s + d; }, 0); } }
  else { info.duration = frameDurations.reduce(function(s, d) { return s + d; }, 0); }
  info.duration /= 1000;
}

export function parsePNG(bytes, info) {
  if (bytes.length < 33) return; info.width = (bytes[16]<<24)|(bytes[17]<<16)|(bytes[18]<<8)|bytes[19]; info.height = (bytes[20]<<24)|(bytes[21]<<16)|(bytes[22]<<8)|bytes[23];
  info.bitDepth = bytes[24]; var colorType = bytes[25];
  var COLOR_TYPES = ['Grayscale', '', 'RGB', 'Indexed', 'Grayscale+Alpha', '', 'RGBA'];
  info.colorType = COLOR_TYPES[colorType] || ('Type ' + colorType);
  info.hasAlpha = (colorType === 4 || colorType === 6);
  var offset = 8, totalDelay = 0;
  while (offset < bytes.length - 8) { var len = (bytes[offset]<<24)|(bytes[offset+1]<<16)|(bytes[offset+2]<<8)|bytes[offset+3]; var type = String.fromCharCode(bytes[offset+4],bytes[offset+5],bytes[offset+6],bytes[offset+7]);
    if (type === 'acTL') { info.animated = true; info.format = 'APNG'; info.frames = (bytes[offset+8]<<24)|(bytes[offset+9]<<16)|(bytes[offset+10]<<8)|bytes[offset+11]; info.loopCount = (bytes[offset+12]<<24)|(bytes[offset+13]<<16)|(bytes[offset+14]<<8)|bytes[offset+15]; }
    else if (type === 'fcTL') { var dn = (bytes[offset+28]<<8)|bytes[offset+29]; var dd = (bytes[offset+30]<<8)|bytes[offset+31]; if (dd === 0) dd = 100; totalDelay += dn / dd; }
    else if (type === 'eXIf') { parseExifData(bytes.slice(offset + 8, offset + 8 + len), info); }
    offset += 12 + len; }
  info.duration = totalDelay;
}

export function parsePAG(bytes, info) { info.animated = true; info.frames = 0; info.duration = 0; }

export async function parsePAGAsync(buffer, info) {
  if (!window.libpag) return;
  try {
    var PAG = await window.libpag.PAGInit({
      locateFile: function(file) { return 'https://cdn.jsdelivr.net/npm/libpag@4.2.81/lib/' + file; }
    });
    var pagFile = await PAG.PAGFile.load(buffer);
    info.width = pagFile.width();
    info.height = pagFile.height();
    info.duration = pagFile.duration() / 1000000;
    info.frames = Math.round(pagFile.frameRate() * info.duration);
    info.animated = info.duration > 0;
    pagFile.destroy();
  } catch(e) { console.warn('PAG parse failed:', e); }
}

export function parseHEIF(bytes, info) {
  function read32At(off) { return (bytes[off]<<24)|(bytes[off+1]<<16)|(bytes[off+2]<<8)|bytes[off+3]; }
  var scanEnd = Math.min(bytes.length, 500000);

  var maxW = 0, maxH = 0;
  for (var i = 0; i < scanEnd - 20; i++) {
    if (bytes[i+4] === 0x69 && bytes[i+5] === 0x73 && bytes[i+6] === 0x70 && bytes[i+7] === 0x65) {
      var w = read32At(i + 12), h = read32At(i + 16);
      if (w > 0 && h > 0 && w < 65536 && h < 65536 && w * h > maxW * maxH) { maxW = w; maxH = h; }
    }
  }
  if (maxW > 0) { info.width = maxW; info.height = maxH; }

  for (var i = 0; i < scanEnd - 14; i++) {
    if (bytes[i] === 0x45 && bytes[i+1] === 0x78 && bytes[i+2] === 0x69 && bytes[i+3] === 0x66 && bytes[i+4] === 0x00 && bytes[i+5] === 0x00) {
      var ts = i + 6;
      if ((bytes[ts] === 0x49 && bytes[ts+1] === 0x49) || (bytes[ts] === 0x4D && bytes[ts+1] === 0x4D)) {
        parseExifData(bytes.slice(ts), info); return;
      }
    }
  }
  for (var i = 100; i < scanEnd - 12; i++) {
    var isTiff = (bytes[i] === 0x49 && bytes[i+1] === 0x49 && bytes[i+2] === 0x2A && bytes[i+3] === 0x00) ||
                 (bytes[i] === 0x4D && bytes[i+1] === 0x4D && bytes[i+2] === 0x00 && bytes[i+3] === 0x2A);
    if (isTiff) {
      var le = bytes[i] === 0x49;
      var ifdOff = le ? (bytes[i+4]|(bytes[i+5]<<8)|(bytes[i+6]<<16)|(bytes[i+7]<<24)) : read32At(i+4);
      if (ifdOff >= 8 && ifdOff < 65536) { parseExifData(bytes.slice(i), info); return; }
    }
  }
}
