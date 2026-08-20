import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { estimateTextTokens } from './text-estimate.js';

export const VISUAL_CONTEXT_CARRIER_SCHEMA_ID = 'enigma.visual_context_carrier.v1';
export const VISUAL_CONTEXT_CARRIER_PRODUCT_THESIS = 'A deterministic local image carrier for model context. The canonical memory remains in the local Enigma vault; rendered images are plaintext-equivalent derived artifacts whose recall, billing, and downscaling behavior must be benchmarked for each model.';

export const VISUAL_CONTEXT_CARRIER_MANIFEST_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: VISUAL_CONTEXT_CARRIER_SCHEMA_ID,
  type: 'object',
  additionalProperties: false,
  required: [
    'schema',
    'product_thesis',
    'carrier_id',
    'source_sha256',
    'encoded_sha256',
    'source_bytes',
    'source_characters',
    'encoded_characters',
    'estimated_text_tokens',
    'font',
    'layout',
    'image_token_estimate',
    'pages',
    'claim_boundaries',
  ],
  properties: {
    schema: { const: VISUAL_CONTEXT_CARRIER_SCHEMA_ID },
    product_thesis: { const: VISUAL_CONTEXT_CARRIER_PRODUCT_THESIS },
    carrier_id: { type: 'string', pattern: '^vctx_[a-f0-9]{32}$' },
    source_sha256: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    encoded_sha256: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    source_bytes: { type: 'integer', minimum: 0 },
    source_characters: { type: 'integer', minimum: 0 },
    encoded_characters: { type: 'integer', minimum: 0 },
    estimated_text_tokens: { type: 'integer', minimum: 0 },
    font: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'cell_width', 'cell_height', 'copyright', 'source'],
      properties: {
        name: { const: 'X11 6x10' },
        cell_width: { const: 6 },
        cell_height: { const: 10 },
        copyright: { type: 'string' },
        source: { type: 'string' },
      },
    },
    layout: {
      type: 'object',
      additionalProperties: false,
      required: ['width', 'height', 'margin', 'columns', 'physical_rows', 'content_rows_per_page', 'line_repeat', 'palette', 'encoding'],
      properties: {
        width: { type: 'integer', minimum: 300, maximum: 2048 },
        height: { type: 'integer', minimum: 200, maximum: 2048 },
        margin: { type: 'integer', minimum: 0, maximum: 32 },
        columns: { type: 'integer', minimum: 24 },
        physical_rows: { type: 'integer', minimum: 1 },
        content_rows_per_page: { type: 'integer', minimum: 1 },
        line_repeat: { type: 'integer', minimum: 1, maximum: 4 },
        palette: { enum: ['bw', 'row6'] },
        encoding: { const: 'bdf-glyphs-with-ascii-escapes-v1' },
      },
    },
    image_token_estimate: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['tokens', 'pixels_per_token', 'page_count', 'explicit_formula_input'],
          properties: {
            tokens: { type: 'integer', minimum: 0 },
            pixels_per_token: { type: 'number', exclusiveMinimum: 0 },
            page_count: { type: 'integer', minimum: 1 },
            explicit_formula_input: { const: true },
          },
        },
      ],
    },
    pages: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['page', 'encoded_character_start', 'encoded_character_end', 'content_line_start', 'content_line_end', 'png_sha256', 'png_bytes', 'mime_type'],
        properties: {
          page: { type: 'integer', minimum: 1 },
          encoded_character_start: { type: 'integer', minimum: 0 },
          encoded_character_end: { type: 'integer', minimum: 0 },
          content_line_start: { type: 'integer', minimum: 1 },
          content_line_end: { type: 'integer', minimum: 1 },
          png_sha256: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
          png_bytes: { type: 'integer', minimum: 1 },
          mime_type: { const: 'image/png' },
        },
      },
    },
    claim_boundaries: {
      type: 'object',
      additionalProperties: false,
      required: [
        'canonical_memory_local_vault',
        'derived_artifact',
        'contains_plaintext_equivalent',
        'encryption_claim',
        'model_recall_guarantee',
        'provider_billing_guarantee',
        'public_artifact_safe',
        'benchmark_each_model',
      ],
      properties: {
        canonical_memory_local_vault: { const: true },
        derived_artifact: { const: true },
        contains_plaintext_equivalent: { const: true },
        encryption_claim: { const: false },
        model_recall_guarantee: { const: false },
        provider_billing_guarantee: { const: false },
        public_artifact_safe: { const: false },
        benchmark_each_model: { const: true },
      },
    },
  },
});

const FONT_URL = new URL('./6x10.bdf', import.meta.url);
const FONT_SOURCE = 'https://github.com/dylex/fonts/blob/master/6x10.bdf';
const FONT_COPYRIGHT = 'Public domain terminal emulator font. Share and enjoy.';
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const DEFAULT_WIDTH = 1568;
const DEFAULT_HEIGHT = 1568;
const DEFAULT_MARGIN = 4;
const DEFAULT_LINE_REPEAT = 2;
const DEFAULT_MAX_PAGES = 16;
const HEADER_ROWS = 3;
const BACKGROUND = Object.freeze([250, 249, 246]);
const HEADER_INK = Object.freeze([172, 66, 0]);
const BW_INK = Object.freeze([17, 20, 24]);
const ROW6_INKS = Object.freeze([
  Object.freeze([17, 20, 24]),
  Object.freeze([20, 54, 96]),
  Object.freeze([103, 33, 33]),
  Object.freeze([25, 78, 54]),
  Object.freeze([76, 45, 105]),
  Object.freeze([105, 66, 20]),
]);

let fontCache;
let crcTableCache;

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function integerOption(value, fallback, name, minimum, maximum) {
  const resolved = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return resolved;
}

function positiveNumberOption(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  const resolved = Number(value);
  if (!Number.isFinite(resolved) || resolved <= 0) throw new TypeError(`${name} must be a positive number`);
  return resolved;
}

function parseBdfFont(source) {
  const lines = String(source).split(/\r?\n/u);
  const glyphs = new Map();
  let cellWidth = 6;
  let cellHeight = 10;
  let ascent = 8;
  let defaultCharacter = 0;

  for (const line of lines) {
    if (line.startsWith('FONTBOUNDINGBOX ')) {
      const values = line.slice('FONTBOUNDINGBOX '.length).trim().split(/\s+/u).map(Number);
      [cellWidth, cellHeight] = values;
    } else if (line.startsWith('FONT_ASCENT ')) {
      ascent = Number(line.slice('FONT_ASCENT '.length));
    } else if (line.startsWith('DEFAULT_CHAR ')) {
      defaultCharacter = Number(line.slice('DEFAULT_CHAR '.length));
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('STARTCHAR ')) continue;
    let encoding;
    let bounds = [cellWidth, cellHeight, 0, -2];
    let bitmap = [];
    for (index += 1; index < lines.length && lines[index] !== 'ENDCHAR'; index += 1) {
      const line = lines[index];
      if (line.startsWith('ENCODING ')) {
        const candidate = Number(line.slice('ENCODING '.length).trim().split(/\s+/u)[0]);
        if (Number.isInteger(candidate) && candidate >= 0) encoding = candidate;
      } else if (line.startsWith('BBX ')) {
        bounds = line.slice(4).trim().split(/\s+/u).map(Number);
      } else if (line === 'BITMAP') {
        bitmap = [];
        for (index += 1; index < lines.length && lines[index] !== 'ENDCHAR'; index += 1) bitmap.push(lines[index]);
        break;
      }
    }
    if (encoding === undefined || bitmap.length === 0 || glyphs.has(encoding)) continue;
    const [width, height, xOffset, yOffset] = bounds;
    const rowBits = Math.ceil(width / 8) * 8;
    const top = ascent - (yOffset + height);
    const pixels = [];
    for (let row = 0; row < bitmap.length; row += 1) {
      const bits = BigInt(`0x${bitmap[row] || '0'}`);
      for (let column = 0; column < width; column += 1) {
        const mask = 1n << BigInt(rowBits - 1 - column);
        if ((bits & mask) !== 0n) pixels.push([xOffset + column, top + row]);
      }
    }
    glyphs.set(encoding, Object.freeze({ pixels: Object.freeze(pixels) }));
  }

  if (!glyphs.has(63)) throw new Error('X11 6x10 font is missing the question-mark fallback glyph');
  return Object.freeze({
    name: 'X11 6x10',
    cellWidth,
    cellHeight,
    defaultCharacter: glyphs.has(defaultCharacter) ? defaultCharacter : 63,
    glyphs,
  });
}

function visualFont() {
  if (fontCache === undefined) fontCache = parseBdfFont(readFileSync(FONT_URL, 'utf8'));
  return fontCache;
}

export function encodeVisualContextText(text) {
  if (typeof text !== 'string') throw new TypeError('encodeVisualContextText requires a string');
  const font = visualFont();
  let encoded = '';
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (character === '\n') encoded += '\n';
    else if (character === '\\') encoded += '\\\\';
    else if (character === '\t') encoded += '\\t';
    else if (character === '\r') encoded += '\\r';
    else if (codePoint >= 32 && font.glyphs.has(codePoint)) encoded += character;
    else encoded += `\\u{${codePoint.toString(16).toUpperCase()}}`;
  }
  return encoded;
}

export function decodeVisualContextText(encoded) {
  if (typeof encoded !== 'string') throw new TypeError('decodeVisualContextText requires a string');
  let decoded = '';
  for (let index = 0; index < encoded.length; index += 1) {
    const character = encoded[index];
    if (character !== '\\') {
      decoded += character;
      continue;
    }
    const next = encoded[index + 1];
    if (next === '\\') {
      decoded += '\\';
      index += 1;
    } else if (next === 't') {
      decoded += '\t';
      index += 1;
    } else if (next === 'r') {
      decoded += '\r';
      index += 1;
    } else if (next === 'u' && encoded[index + 2] === '{') {
      const close = encoded.indexOf('}', index + 3);
      if (close === -1) throw new Error('Invalid visual context Unicode escape');
      const hex = encoded.slice(index + 3, close);
      if (!/^[A-F0-9]{1,6}$/u.test(hex)) throw new Error('Invalid visual context Unicode escape');
      const codePoint = Number.parseInt(hex, 16);
      if (codePoint > 0x10ffff) throw new Error('Visual context Unicode escape is out of range');
      decoded += String.fromCodePoint(codePoint);
      index = close;
    } else {
      throw new Error(`Invalid visual context escape at index ${index}`);
    }
  }
  return decoded;
}

function encodedAtoms(line) {
  const atoms = [];
  for (let index = 0; index < line.length;) {
    if (line[index] !== '\\') {
      const codePoint = line.codePointAt(index);
      const text = String.fromCodePoint(codePoint);
      atoms.push({ text, start: index, end: index + text.length, cells: 1 });
      index += text.length;
      continue;
    }
    let end;
    if (line[index + 1] === 'u' && line[index + 2] === '{') {
      const close = line.indexOf('}', index + 3);
      if (close === -1) throw new Error('Invalid visual context Unicode escape');
      end = close + 1;
    } else {
      end = index + 2;
    }
    const text = line.slice(index, end);
    atoms.push({ text, start: index, end, cells: Array.from(text).length });
    index = end;
  }
  return atoms;
}

function wrapEncodedText(encoded, columns) {
  const sourceLines = encoded.split('\n');
  const wrapped = [];
  let absoluteOffset = 0;
  for (let sourceIndex = 0; sourceIndex < sourceLines.length; sourceIndex += 1) {
    const sourceLine = sourceLines[sourceIndex];
    const atoms = encodedAtoms(sourceLine);
    if (atoms.length === 0) {
      wrapped.push({ text: '', start: absoluteOffset, end: absoluteOffset });
    } else {
      let text = '';
      let cells = 0;
      let start = absoluteOffset + atoms[0].start;
      let end = start;
      for (const atom of atoms) {
        if (cells > 0 && cells + atom.cells > columns) {
          wrapped.push({ text, start, end });
          text = '';
          cells = 0;
          start = absoluteOffset + atom.start;
        }
        text += atom.text;
        cells += atom.cells;
        end = absoluteOffset + atom.end;
      }
      wrapped.push({ text, start, end });
    }
    absoluteOffset += sourceLine.length;
    if (sourceIndex < sourceLines.length - 1) absoluteOffset += 1;
  }
  return wrapped;
}

function setPixel(pixels, width, height, x, y, ink) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = ((y * width) + x) * 3;
  pixels[offset] = ink[0];
  pixels[offset + 1] = ink[1];
  pixels[offset + 2] = ink[2];
}

function drawLine(pixels, width, height, x, y, text, ink, font) {
  let column = 0;
  for (const character of text) {
    const glyph = font.glyphs.get(character.codePointAt(0)) ?? font.glyphs.get(font.defaultCharacter);
    for (const [pixelX, pixelY] of glyph.pixels) {
      setPixel(pixels, width, height, x + (column * font.cellWidth) + pixelX, y + pixelY, ink);
    }
    column += 1;
  }
}

function crcTable() {
  if (crcTableCache !== undefined) return crcTableCache;
  crcTableCache = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    crcTableCache[index] = value >>> 0;
  }
  return crcTableCache;
}

function crc32(value) {
  const table = crcTable();
  let crc = 0xffffffff;
  for (const byte of value) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const stride = width * 3;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) pixels.copy(scanlines, (row * (stride + 1)) + 1, row * stride, (row + 1) * stride);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

function renderPage({ width, height, margin, lineRepeat, palette, headerLines, contentLines, font }) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let offset = 0; offset < pixels.length; offset += 3) {
    pixels[offset] = BACKGROUND[0];
    pixels[offset + 1] = BACKGROUND[1];
    pixels[offset + 2] = BACKGROUND[2];
  }
  const logicalLines = [...headerLines, ...contentLines.map((line) => line.text)];
  for (let logicalRow = 0; logicalRow < logicalLines.length; logicalRow += 1) {
    const ink = logicalRow < HEADER_ROWS
      ? HEADER_INK
      : palette === 'bw' ? BW_INK : ROW6_INKS[(logicalRow - HEADER_ROWS) % ROW6_INKS.length];
    for (let repeat = 0; repeat < lineRepeat; repeat += 1) {
      const physicalRow = (logicalRow * lineRepeat) + repeat;
      drawLine(pixels, width, height, margin, margin + (physicalRow * font.cellHeight), logicalLines[logicalRow], ink, font);
    }
  }
  return encodePng(width, height, pixels);
}

export function estimateVisualImageTokens(input = {}) {
  const width = integerOption(input.width, DEFAULT_WIDTH, 'width', 1, 100_000);
  const height = integerOption(input.height, DEFAULT_HEIGHT, 'height', 1, 100_000);
  const pageCount = integerOption(input.page_count ?? input.pageCount, 1, 'page_count', 1, 100_000);
  const pixelsPerToken = positiveNumberOption(input.pixels_per_token ?? input.pixelsPerToken, 'pixels_per_token');
  if (pixelsPerToken === undefined) throw new TypeError('estimateVisualImageTokens requires explicit pixels_per_token');
  return Math.ceil((width * height * pageCount) / pixelsPerToken);
}

export function createVisualContextCarrier(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('createVisualContextCarrier requires an options object');
  if (typeof input.text !== 'string') throw new TypeError('createVisualContextCarrier requires text as a string');
  const font = visualFont();
  const width = integerOption(input.width, DEFAULT_WIDTH, 'width', 300, 2048);
  const height = integerOption(input.height, DEFAULT_HEIGHT, 'height', 200, 2048);
  const margin = integerOption(input.margin, DEFAULT_MARGIN, 'margin', 0, 32);
  const lineRepeat = integerOption(input.line_repeat ?? input.lineRepeat, DEFAULT_LINE_REPEAT, 'line_repeat', 1, 4);
  const maxPages = integerOption(input.max_pages ?? input.maxPages, DEFAULT_MAX_PAGES, 'max_pages', 1, 32);
  const palette = input.palette ?? 'row6';
  if (palette !== 'bw' && palette !== 'row6') throw new TypeError('palette must be bw or row6');
  const pixelsPerToken = positiveNumberOption(input.pixels_per_token ?? input.pixelsPerToken, 'pixels_per_token');
  const columns = Math.floor((width - (margin * 2)) / font.cellWidth);
  const physicalRows = Math.floor((height - (margin * 2)) / font.cellHeight);
  const logicalRows = Math.floor(physicalRows / lineRepeat);
  const contentRowsPerPage = logicalRows - HEADER_ROWS;
  if (columns < 24 || contentRowsPerPage < 1) throw new Error('Visual context dimensions are too small for the font, repetition, and carrier header');

  const encodedText = encodeVisualContextText(input.text);
  const wrappedLines = wrapEncodedText(encodedText, columns);
  const pageCount = Math.max(1, Math.ceil(wrappedLines.length / contentRowsPerPage));
  if (pageCount > maxPages) throw new Error(`Visual context requires ${pageCount} pages, exceeding max_pages ${maxPages}`);
  const sourceHash = sha256(Buffer.from(input.text, 'utf8'));
  const encodedHash = sha256(Buffer.from(encodedText, 'utf8'));
  const carrierSeed = JSON.stringify({
    schema: VISUAL_CONTEXT_CARRIER_SCHEMA_ID,
    source_sha256: sourceHash,
    encoded_sha256: encodedHash,
    width,
    height,
    margin,
    line_repeat: lineRepeat,
    palette,
  });
  const carrierId = `vctx_${sha256(Buffer.from(carrierSeed, 'utf8')).slice('sha256:'.length, 'sha256:'.length + 32)}`;
  const pages = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const startLine = pageIndex * contentRowsPerPage;
    const contentLines = wrappedLines.slice(startLine, startLine + contentRowsPerPage);
    const first = contentLines[0] ?? { start: 0, end: 0 };
    const last = contentLines.at(-1) ?? first;
    const headerLines = [
      'ENIGMA VISUAL CONTEXT V1',
      `PAGE ${pageIndex + 1}/${pageCount}  SRC ${sourceHash.slice(7, 23)}`,
      'UNICODE: \\u{HEX}  BACKSLASH: \\\\',
    ].map((line) => Array.from(line).slice(0, columns).join(''));
    const png = renderPage({ width, height, margin, lineRepeat, palette, headerLines, contentLines, font });
    const page = {
      page: pageIndex + 1,
      encoded_character_start: first.start,
      encoded_character_end: last.end,
      content_line_start: startLine + 1,
      content_line_end: startLine + contentLines.length,
      png_sha256: sha256(png),
      png_bytes: png.length,
      mime_type: 'image/png',
    };
    Object.defineProperty(page, 'png', { value: png, enumerable: false, configurable: false, writable: false });
    pages.push(Object.freeze(page));
  }

  const imageTokenEstimate = pixelsPerToken === undefined ? null : Object.freeze({
    tokens: estimateVisualImageTokens({ width, height, page_count: pageCount, pixels_per_token: pixelsPerToken }),
    pixels_per_token: pixelsPerToken,
    page_count: pageCount,
    explicit_formula_input: true,
  });
  const carrier = {
    schema: VISUAL_CONTEXT_CARRIER_SCHEMA_ID,
    product_thesis: VISUAL_CONTEXT_CARRIER_PRODUCT_THESIS,
    carrier_id: carrierId,
    source_sha256: sourceHash,
    encoded_sha256: encodedHash,
    source_bytes: Buffer.byteLength(input.text, 'utf8'),
    source_characters: Array.from(input.text).length,
    encoded_characters: Array.from(encodedText).length,
    estimated_text_tokens: estimateTextTokens(input.text),
    font: Object.freeze({
      name: font.name,
      cell_width: font.cellWidth,
      cell_height: font.cellHeight,
      copyright: FONT_COPYRIGHT,
      source: FONT_SOURCE,
    }),
    layout: Object.freeze({
      width,
      height,
      margin,
      columns,
      physical_rows: physicalRows,
      content_rows_per_page: contentRowsPerPage,
      line_repeat: lineRepeat,
      palette,
      encoding: 'bdf-glyphs-with-ascii-escapes-v1',
    }),
    image_token_estimate: imageTokenEstimate,
    pages: Object.freeze(pages),
    claim_boundaries: Object.freeze({
      canonical_memory_local_vault: true,
      derived_artifact: true,
      contains_plaintext_equivalent: true,
      encryption_claim: false,
      model_recall_guarantee: false,
      provider_billing_guarantee: false,
      public_artifact_safe: false,
      benchmark_each_model: true,
    }),
  };
  Object.defineProperty(carrier, 'encoded_text', { value: encodedText, enumerable: false, configurable: false, writable: false });
  return Object.freeze(carrier);
}

export function visualContextCarrierManifest(carrier) {
  if (!carrier || carrier.schema !== VISUAL_CONTEXT_CARRIER_SCHEMA_ID || !Array.isArray(carrier.pages)) {
    throw new TypeError('visualContextCarrierManifest requires an Enigma visual context carrier');
  }
  return JSON.parse(JSON.stringify(carrier));
}

export function verifyVisualContextCarrier(carrier, options = {}) {
  const manifest = visualContextCarrierManifest(carrier);
  const page_results = carrier.pages.map((page) => {
    const png = page.png;
    const signature_valid = Buffer.isBuffer(png) && png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
    const hash_valid = Buffer.isBuffer(png) && sha256(png) === page.png_sha256;
    return Object.freeze({ page: page.page, signature_valid, hash_valid, ok: signature_valid && hash_valid });
  });
  let source_hash_valid = null;
  let encoding_round_trip_valid = null;
  if (options.source_text !== undefined) {
    if (typeof options.source_text !== 'string') throw new TypeError('source_text must be a string');
    source_hash_valid = sha256(Buffer.from(options.source_text, 'utf8')) === manifest.source_sha256;
    encoding_round_trip_valid = decodeVisualContextText(encodeVisualContextText(options.source_text)) === options.source_text;
  }
  const ok = page_results.every((page) => page.ok)
    && source_hash_valid !== false
    && encoding_round_trip_valid !== false;
  return Object.freeze({
    schema: 'enigma.visual_context_carrier_verification.v1',
    carrier_id: manifest.carrier_id,
    ok,
    page_results: Object.freeze(page_results),
    source_hash_valid,
    encoding_round_trip_valid,
    claim_boundaries: manifest.claim_boundaries,
  });
}
