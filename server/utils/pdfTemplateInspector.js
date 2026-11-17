import fs from "fs";
import zlib from "zlib";
import {
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFArray,
  PDFDict,
  PDFNumber,
  PDFString,
} from "pdf-lib";

export class PdfTemplateValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PdfTemplateValidationError";
    this.statusCode = 400;
    this.details = details;
  }
}

// WinAnsi codepoints for 0x80..0x9F (0xA0..0xFF match Unicode U+00A0..U+00FF)
const WINANSI_80_9F = {
  0x80: "\u20AC", 0x82: "\u201A", 0x83: "\u0192", 0x84: "\u201E", 0x85: "\u2026",
  0x86: "\u2020", 0x87: "\u2021", 0x88: "\u02C6", 0x89: "\u2030", 0x8a: "\u0160",
  0x8b: "\u2039", 0x8c: "\u0152", 0x8e: "\u017D", 0x91: "\u2018", 0x92: "\u2019",
  0x93: "\u201C", 0x94: "\u201D", 0x95: "\u2022", 0x96: "\u2013", 0x97: "\u2014",
  0x98: "\u02DC", 0x99: "\u2122", 0x9a: "\u0161", 0x9b: "\u203A", 0x9c: "\u0153",
  0x9e: "\u017E", 0x9f: "\u0178",
};

// Common Adobe glyph names for custom /Differences encodings
const GLYPH_NAME_TO_CHAR = {
  space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$",
  percent: "%", ampersand: "&", quotesingle: "'", parenleft: "(", parenright: ")",
  asterisk: "*", plus: "+", comma: ",", hyphen: "-", period: ".", slash: "/",
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", colon: ":", semicolon: ";",
  less: "<", equal: "=", greater: ">", question: "?", at: "@",
  bracketleft: "[", backslash: "\\", bracketright: "]", asciicircum: "^",
  underscore: "_", grave: "`", braceleft: "{", bar: "|", braceright: "}",
  asciitilde: "~", bullet: "\u2022", endash: "\u2013", emdash: "\u2014",
  quoteleft: "\u2018", quoteright: "\u2019", quotedblleft: "\u201C",
  quotedblright: "\u201D", nbspace: " ",
};

/**
 * Normalizes text safely for WinAnsi StandardFonts in pdf-lib.
 */
export function sanitizePdfText(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "*")
    .replace(/\u00A0/g, " ")
    .replace(/₹/g, "Rs.")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

function decodeStreamBytes(pdfDoc, obj) {
  if (!obj) return Buffer.alloc(0);
  const resolved = pdfDoc.context.lookup(obj);
  if (resolved instanceof PDFRawStream) {
    let buf = Buffer.from(resolved.contents);
    const filter = resolved.dict.get(PDFName.of("Filter"));
    const filterStr = filter ? filter.toString() : "";
    if (filterStr.includes("FlateDecode")) {
      try {
        buf = zlib.inflateSync(buf);
      } catch {
        // Fallback to raw bytes if inflate fails
      }
    }
    return buf;
  }
  return Buffer.alloc(0);
}

function parseToUnicodeCMap(cmapText) {
  const map = new Map();
  if (!cmapText) return map;

  const decodeHexUtf16 = (hex) => {
    const clean = hex.replace(/\s+/g, "");
    let out = "";
    for (let i = 0; i + 3 < clean.length; i += 4) {
      out += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
    }
    return out;
  };

  let match;
  const bfcharRe = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((match = bfcharRe.exec(cmapText)) !== null) {
    const pairRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let pm;
    while ((pm = pairRe.exec(match[1])) !== null) {
      map.set(parseInt(pm[1], 16), decodeHexUtf16(pm[2]));
    }
  }

  const bfrangeRe = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((match = bfrangeRe.exec(cmapText)) !== null) {
    for (const line of match[1].split(/\r?\n/)) {
      const rangeMatch = line.match(
        /^\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*$/
      );
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 16);
        const end = parseInt(rangeMatch[2], 16);
        let dst = parseInt(rangeMatch[3], 16);
        for (let code = start; code <= end; code++, dst++) {
          map.set(code, String.fromCharCode(dst));
        }
        continue;
      }
      const arrayMatch = line.match(
        /^\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]+)\]/
      );
      if (arrayMatch) {
        const start = parseInt(arrayMatch[1], 16);
        const items = [...arrayMatch[3].matchAll(/<([0-9A-Fa-f]+)>/g)];
        items.forEach((it, idx) => {
          map.set(start + idx, decodeHexUtf16(it[1]));
        });
      }
    }
  }

  return map;
}

function buildDifferencesMap(pdfDoc, encodingObj) {
  const diffMap = new Map();
  if (!encodingObj) return diffMap;
  const encDict = pdfDoc.context.lookup(encodingObj);
  if (!(encDict instanceof PDFDict)) return diffMap;
  const diffs = encDict.lookupMaybe(PDFName.of("Differences"), PDFArray);
  if (!diffs) return diffMap;

  let currentCode = 0;
  for (let i = 0; i < diffs.size(); i++) {
    const item = pdfDoc.context.lookup(diffs.get(i));
    if (item instanceof PDFNumber) {
      currentCode = item.asNumber();
    } else if (item instanceof PDFName) {
      const glyphName = item.decodeText();
      if (GLYPH_NAME_TO_CHAR[glyphName]) {
        diffMap.set(currentCode, GLYPH_NAME_TO_CHAR[glyphName]);
      } else if (glyphName.length === 1) {
        diffMap.set(currentCode, glyphName);
      }
      currentCode++;
    }
  }
  return diffMap;
}

function buildFontDecoders(pdfDoc, resourcesNode) {
  const decoders = new Map();
  if (!resourcesNode) return decoders;
  const fonts = resourcesNode.lookupMaybe(PDFName.of("Font"), PDFDict);
  if (!fonts) return decoders;

  for (const [nameKey, fontRef] of fonts.entries()) {
    const fontName = nameKey.toString();
    const fd = pdfDoc.context.lookup(fontRef);
    if (!fd || !(fd instanceof PDFDict)) continue;

    const subtype = fd.get(PDFName.of("Subtype"))?.toString() || "";
    const baseFont = fd.get(PDFName.of("BaseFont"))?.toString() || "";
    const toUniRef = fd.get(PDFName.of("ToUnicode"));
    let toUniMap = null;
    if (toUniRef) {
      const cmapBuf = decodeStreamBytes(pdfDoc, toUniRef);
      toUniMap = parseToUnicodeCMap(cmapBuf.toString("latin1"));
    }
    const diffMap = buildDifferencesMap(pdfDoc, fd.get(PDFName.of("Encoding")));
    const isTwoByte = subtype === "/Type0";

    decoders.set(fontName, {
      fontName,
      baseFont,
      subtype,
      isTwoByte,
      decodeBytes(bytes) {
        if (!bytes || bytes.length === 0) return "";
        if (toUniMap && isTwoByte) {
          let out = "";
          for (let i = 0; i + 1 < bytes.length; i += 2) {
            const code = (bytes[i] << 8) | bytes[i + 1];
            out += toUniMap.get(code) ?? "";
          }
          return out;
        }
        let out = "";
        for (let i = 0; i < bytes.length; i++) {
          const b = bytes[i];
          if (toUniMap && toUniMap.has(b)) out += toUniMap.get(b);
          else if (diffMap.has(b)) out += diffMap.get(b);
          else if (b >= 0x80 && b <= 0x9f && WINANSI_80_9F[b]) out += WINANSI_80_9F[b];
          else out += String.fromCharCode(b);
        }
        return out;
      },
    });
  }
  return decoders;
}

function tokenizeContentStream(buf) {
  const tokens = [];
  let i = 0;
  const len = buf.length;
  const isWs = (c) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 0;
  const isDelim = (c) =>
    isWs(c) || c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 47 || c === 37;

  while (i < len) {
    const c = buf[i];
    if (isWs(c)) {
      i++;
      continue;
    }
    if (c === 37) {
      while (i < len && buf[i] !== 10 && buf[i] !== 13) i++;
      continue;
    }
    if (c === 40) {
      i++;
      const bytes = [];
      let depth = 1;
      while (i < len && depth > 0) {
        const b = buf[i++];
        if (b === 92) {
          if (i >= len) break;
          const esc = buf[i++];
          if (esc === 110) bytes.push(10);
          else if (esc === 114) bytes.push(13);
          else if (esc === 116) bytes.push(9);
          else if (esc === 98) bytes.push(8);
          else if (esc === 102) bytes.push(12);
          else if (esc >= 48 && esc <= 55) {
            let oct = String.fromCharCode(esc);
            for (let k = 0; k < 2 && i < len && buf[i] >= 48 && buf[i] <= 55; k++) {
              oct += String.fromCharCode(buf[i++]);
            }
            bytes.push(parseInt(oct, 8) & 0xff);
          } else if (esc === 13 || esc === 10) {
            if (esc === 13 && buf[i] === 10) i++;
          } else {
            bytes.push(esc);
          }
        } else if (b === 40) {
          depth++;
          bytes.push(b);
        } else if (b === 41) {
          depth--;
          if (depth > 0) bytes.push(b);
        } else {
          bytes.push(b);
        }
      }
      tokens.push({ type: "str", bytes: Buffer.from(bytes) });
      continue;
    }
    if (c === 60) {
      if (buf[i + 1] === 60) {
        tokens.push({ type: "op", value: "<<" });
        i += 2;
      } else {
        i++;
        let hex = "";
        while (i < len && buf[i] !== 62) {
          const ch = String.fromCharCode(buf[i++]);
          if (!/\s/.test(ch)) hex += ch;
        }
        if (i < len && buf[i] === 62) i++;
        if (hex.length % 2 === 1) hex += "0";
        tokens.push({ type: "str", bytes: Buffer.from(hex, "hex") });
      }
      continue;
    }
    if (c === 62 && buf[i + 1] === 62) {
      tokens.push({ type: "op", value: ">>" });
      i += 2;
      continue;
    }
    if (c === 91 || c === 93) {
      tokens.push({ type: "op", value: String.fromCharCode(c) });
      i++;
      continue;
    }
    if (c === 47) {
      const start = i++;
      while (i < len && !isDelim(buf[i])) i++;
      tokens.push({ type: "name", value: buf.slice(start, i).toString("latin1") });
      continue;
    }
    const start = i;
    while (i < len && !isDelim(buf[i])) i++;
    const word = buf.slice(start, i).toString("latin1");
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)) {
      tokens.push({ type: "num", value: Number(word) });
    } else {
      tokens.push({ type: "op", value: word });
    }
  }
  return tokens;
}

const mulMat = (a, b) => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

const applyMat = (m, x, y) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

function parseStreamRecursive(
  pdfDoc,
  streamBytes,
  resourcesNode,
  initialCtm,
  results,
  depth = 0
) {
  if (depth > 5 || !streamBytes || streamBytes.length === 0) return;
  const decoders = buildFontDecoders(pdfDoc, resourcesNode);
  const xobjs = resourcesNode?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  const tokens = tokenizeContentStream(streamBytes);

  let ctm = [...initialCtm];
  const stack = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];
  let curFont = null;
  let curFontSize = 10;
  let tl = 0;
  let fillRgb = [0, 0, 0];
  let strokeRgb = [0, 0, 0];
  let lineWidth = 1;
  let currentPath = [];
  let lastPt = null;
  const operands = [];

  const popNums = (n) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      out.unshift(operands.pop()?.value ?? 0);
    }
    return out;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.type !== "op") {
      operands.push(tk);
      continue;
    }
    if (tk.value === "[") {
      const arr = [];
      i++;
      while (i < tokens.length && !(tokens[i].type === "op" && tokens[i].value === "]")) {
        arr.push(tokens[i++]);
      }
      operands.push({ type: "arr", value: arr });
      continue;
    }

    const op = tk.value;
    if (op === "q") {
      stack.push({
        ctm: [...ctm],
        fillRgb: [...fillRgb],
        strokeRgb: [...strokeRgb],
        lineWidth,
        curFont,
        curFontSize,
        tl,
      });
    } else if (op === "Q") {
      const s = stack.pop();
      if (s) {
        ctm = s.ctm;
        fillRgb = s.fillRgb;
        strokeRgb = s.strokeRgb;
        lineWidth = s.lineWidth;
        curFont = s.curFont;
        curFontSize = s.curFontSize;
        tl = s.tl;
      }
    } else if (op === "cm") {
      ctm = mulMat(popNums(6), ctm);
    } else if (op === "w") {
      lineWidth = popNums(1)[0] || 1;
    } else if (op === "rg") {
      fillRgb = popNums(3);
    } else if (op === "RG") {
      strokeRgb = popNums(3);
    } else if (op === "g") {
      const g = popNums(1)[0];
      fillRgb = [g, g, g];
    } else if (op === "G") {
      const g = popNums(1)[0];
      strokeRgb = [g, g, g];
    } else if (op === "m") {
      const [x, y] = popNums(2);
      lastPt = [x, y];
    } else if (op === "l") {
      const [x, y] = popNums(2);
      if (lastPt) {
        currentPath.push({ kind: "line", x1: lastPt[0], y1: lastPt[1], x2: x, y2: y });
      }
      lastPt = [x, y];
    } else if (op === "re") {
      const [x, y, w, h] = popNums(4);
      currentPath.push({ kind: "rect", x, y, w, h });
      lastPt = [x, y];
    } else if (["f", "F", "f*", "B", "B*", "b", "b*", "S", "s"].includes(op)) {
      const isFilled = !["S", "s"].includes(op);
      const isStroked = !["f", "F", "f*"].includes(op);
      for (const seg of currentPath) {
        if (seg.kind === "rect") {
          const [ax, ay] = applyMat(ctm, seg.x, seg.y);
          const [bx, by] = applyMat(ctm, seg.x + seg.w, seg.y + seg.h);
          const x0 = Math.min(ax, bx);
          const y0 = Math.min(ay, by);
          const x1 = Math.max(ax, bx);
          const y1 = Math.max(ay, by);
          results.rects.push({
            x0,
            y0,
            x1,
            y1,
            width: x1 - x0,
            height: y1 - y0,
            fillRgb: isFilled ? [...fillRgb] : null,
            strokeRgb: isStroked ? [...strokeRgb] : null,
          });
        } else if (seg.kind === "line" && isStroked) {
          const [ax, ay] = applyMat(ctm, seg.x1, seg.y1);
          const [bx, by] = applyMat(ctm, seg.x2, seg.y2);
          const pad = Math.max(0.5, lineWidth / 2);
          if (Math.abs(ay - by) < 1.5 && Math.abs(bx - ax) > 5) {
            results.rects.push({
              x0: Math.min(ax, bx),
              y0: Math.min(ay, by) - pad,
              x1: Math.max(ax, bx),
              y1: Math.max(ay, by) + pad,
              width: Math.abs(bx - ax),
              height: pad * 2,
              fillRgb: [...strokeRgb],
              strokeRgb: [...strokeRgb],
            });
          } else if (Math.abs(ax - bx) < 1.5 && Math.abs(by - ay) > 5) {
            results.rects.push({
              x0: Math.min(ax, bx) - pad,
              y0: Math.min(ay, by),
              x1: Math.max(ax, bx) + pad,
              y1: Math.max(ay, by),
              width: pad * 2,
              height: Math.abs(by - ay),
              fillRgb: [...strokeRgb],
              strokeRgb: [...strokeRgb],
            });
          }
        }
      }
      currentPath = [];
    } else if (op === "n" || op === "W" || op === "W*") {
      if (op === "n") currentPath = [];
    } else if (op === "Do") {
      const nameToken = operands.pop()?.value;
      const keyName = typeof nameToken === "string" && nameToken.startsWith("/") ? nameToken.slice(1) : "";
      const xRef = keyName && xobjs ? xobjs.get(PDFName.of(keyName)) : null;
      const xObj = xRef ? pdfDoc.context.lookup(xRef) : null;
      const sub = xObj?.dict?.get?.(PDFName.of("Subtype"))?.toString() || "";
      if (sub === "/Image") {
        const [ax, ay] = applyMat(ctm, 0, 0);
        const [bx, by] = applyMat(ctm, 1, 1);
        const x0 = Math.min(ax, bx);
        const y0 = Math.min(ay, by);
        const x1 = Math.max(ax, bx);
        const y1 = Math.max(ay, by);
        results.images.push({
          name: nameToken,
          x0,
          y0,
          x1,
          y1,
          width: x1 - x0,
          height: y1 - y0,
        });
      } else if (sub === "/Form" && xObj instanceof PDFRawStream) {
        const formRes = xObj.dict.lookupMaybe(PDFName.of("Resources"), PDFDict) || resourcesNode;
        const formMatrixArr = xObj.dict.lookupMaybe(PDFName.of("Matrix"), PDFArray);
        let formMat = [1, 0, 0, 1, 0, 0];
        if (formMatrixArr && formMatrixArr.size() === 6) {
          formMat = [0, 1, 2, 3, 4, 5].map((idx) => {
            const v = pdfDoc.context.lookup(formMatrixArr.get(idx));
            return v instanceof PDFNumber ? v.asNumber() : 0;
          });
        }
        const formBytes = decodeStreamBytes(pdfDoc, xObj);
        parseStreamRecursive(
          pdfDoc,
          formBytes,
          formRes,
          mulMat(formMat, ctm),
          results,
          depth + 1
        );
      }
    } else if (op === "BT") {
      tm = [1, 0, 0, 1, 0, 0];
      tlm = [1, 0, 0, 1, 0, 0];
    } else if (op === "TL") {
      tl = popNums(1)[0];
    } else if (op === "Tf") {
      curFontSize = operands.pop()?.value ?? 10;
      curFont = operands.pop()?.value ?? "";
    } else if (op === "Tm") {
      tm = popNums(6);
      tlm = [...tm];
    } else if (op === "Td" || op === "TD") {
      const [tx, ty] = popNums(2);
      if (op === "TD") tl = -ty;
      tm = mulMat([1, 0, 0, 1, tx, ty], tlm);
      tlm = [...tm];
    } else if (op === "T*") {
      tm = mulMat([1, 0, 0, 1, 0, -tl], tlm);
      tlm = [...tm];
    } else if (op === "Tj" || op === "'" || op === '"') {
      const strTk = operands.pop();
      if (op === "'" || op === '"') {
        tm = mulMat([1, 0, 0, 1, 0, -tl], tlm);
        tlm = [...tm];
      }
      if (strTk?.bytes && curFont) {
        const dec = decoders.get(curFont);
        const txt = dec ? dec.decodeBytes(strTk.bytes) : "";
        const abs = mulMat(tm, ctm);
        const fontSize = Math.hypot(abs[0], abs[1]) * curFontSize;
        results.textRuns.push({
          text: txt,
          x: abs[4],
          y: abs[5],
          size: fontSize,
          font: dec?.baseFont || curFont,
        });
      }
    } else if (op === "TJ") {
      const arrTk = operands.pop();
      if (arrTk?.type === "arr" && curFont) {
        const dec = decoders.get(curFont);
        let txt = "";
        for (const el of arrTk.value) {
          if (el.type === "str") {
            txt += dec ? dec.decodeBytes(el.bytes) : "";
          } else if (el.type === "num" && el.value < -240) {
            txt += " ";
          }
        }
        const abs = mulMat(tm, ctm);
        const fontSize = Math.hypot(abs[0], abs[1]) * curFontSize;
        results.textRuns.push({
          text: txt,
          x: abs[4],
          y: abs[5],
          size: fontSize,
          font: dec?.baseFont || curFont,
        });
      }
    }

    operands.length = 0;
  }
}

function groupTextRunsIntoLines(textRuns, yTolerance = 2.5) {
  const lines = [];
  for (const run of textRuns) {
    if (!run.text) continue;
    let line = lines.find((l) => Math.abs(l.y - run.y) <= yTolerance);
    if (!line) {
      line = { y: run.y, spans: [] };
      lines.push(line);
    }
    line.spans.push(run);
  }
  lines.sort((a, b) => b.y - a.y);

  return lines
    .map((line) => {
      line.spans.sort((a, b) => a.x - b.x);
      let text = "";
      let prevEndApprox = null;
      for (const sp of line.spans) {
        if (prevEndApprox !== null && sp.x - prevEndApprox > Math.max(2.5, sp.size * 0.28)) {
          if (!text.endsWith(" ") && !sp.text.startsWith(" ")) {
            text += " ";
          }
        }
        text += sp.text;
        prevEndApprox = sp.x + Math.max(1, sp.text.length * sp.size * 0.44);
      }
      const trimmed = text.replace(/\s+/g, " ").trim();
      const firstNonEmpty = line.spans.find((s) => s.text.trim().length > 0) || line.spans[0];
      return {
        y: line.y,
        x: firstNonEmpty.x,
        size: firstNonEmpty.size,
        font: firstNonEmpty.font,
        text: trimmed,
        spans: line.spans,
      };
    })
    .filter((l) => l.text.length > 0);
}

function extractPlaceholderMatches(lines, pageIndex) {
  const tokens = [];
  for (const line of lines) {
    const matches = line.text.match(/\{[^{}]+\}/g) || [];
    for (const raw of matches) {
      const normalized = raw.slice(1, -1).replace(/\s+/g, "");
      if (normalized) {
        tokens.push({
          token: normalized,
          raw,
          pageIndex,
          x: line.x,
          y: line.y,
          fontSize: line.size,
          lineText: line.text,
        });
      }
    }
  }
  return tokens;
}

function detectFontFamilyFromLines(lines) {
  let sansCount = 0;
  let serifCount = 0;
  for (const l of lines) {
    for (const s of l.spans || []) {
      const f = (s.font || "").toLowerCase();
      if (f.includes("calibri") || f.includes("arial") || f.includes("helvetica")) {
        sansCount += s.text.length;
      } else if (f.includes("cambria") || f.includes("times") || f.includes("centaur")) {
        serifCount += s.text.length;
      }
    }
  }
  return sansCount > serifCount ? "sans" : "serif";
}

function clusterSegments(values, tol = 1.6) {
  const sorted = [...values].sort((a, b) => a.pos - b.pos);
  const clusters = [];
  for (const item of sorted) {
    const existing = clusters.find((c) => Math.abs(c.pos - item.pos) <= tol);
    if (existing) {
      existing.minSpan = Math.min(existing.minSpan, item.spanStart);
      existing.maxSpan = Math.max(existing.maxSpan, item.spanEnd);
      existing.segments.push({ start: item.spanStart, end: item.spanEnd });
      existing.thickness = Math.max(existing.thickness, item.thickness);
    } else {
      clusters.push({
        pos: item.pos,
        thickness: item.thickness,
        minSpan: item.spanStart,
        maxSpan: item.spanEnd,
        segments: [{ start: item.spanStart, end: item.spanEnd }],
      });
    }
  }
  return clusters;
}

function isDarkColor(rgbArr) {
  if (!rgbArr || rgbArr.length < 3) return false;
  return rgbArr[0] < 0.3 && rgbArr[1] < 0.3 && rgbArr[2] < 0.3;
}

export function extractTableGrid(rects) {
  const vRaw = [];
  const hRaw = [];
  const shadedBoxes = [];

  for (const r of rects) {
    const color = r.fillRgb || r.strokeRgb;
    const isDark = isDarkColor(color);
    if (isDark && r.width <= 3.5 && r.height >= 8) {
      vRaw.push({
        pos: (r.x0 + r.x1) / 2,
        thickness: Math.max(0.75, r.width),
        spanStart: r.y0,
        spanEnd: r.y1,
      });
    } else if (isDark && r.height <= 3.5 && r.width >= 18) {
      hRaw.push({
        pos: (r.y0 + r.y1) / 2,
        thickness: Math.max(0.75, r.height),
        spanStart: r.x0,
        spanEnd: r.x1,
      });
    } else if (r.fillRgb && r.width > 20 && r.height > 8) {
      const [cr, cg, cb] = r.fillRgb;
      const isWhite = cr > 0.97 && cg > 0.97 && cb > 0.97;
      if (!isWhite) {
        shadedBoxes.push(r);
      }
    }
  }

  return {
    vlines: clusterSegments(vRaw),
    hlines: clusterSegments(hRaw),
    shadedBoxes,
  };
}

/**
 * Inspects a PDF buffer/file completely: dimensions, text lines, placeholders, vector grid, images.
 */
export async function inspectPdfTemplate(pdfSource) {
  const bytes = Buffer.isBuffer(pdfSource) || pdfSource instanceof Uint8Array
    ? pdfSource
    : fs.readFileSync(pdfSource);

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch (err) {
    throw new PdfTemplateValidationError(
      `Invalid or corrupted PDF file: ${err.message}`
    );
  }

  const pageCount = pdfDoc.getPageCount();
  if (pageCount === 0) {
    throw new PdfTemplateValidationError("Uploaded PDF contains no pages.");
  }

  const pages = [];
  const allPlaceholders = [];
  let totalTextCount = 0;

  for (let pIdx = 0; pIdx < pageCount; pIdx++) {
    const page = pdfDoc.getPages()[pIdx];
    const { width, height } = page.getSize();
    const resources = page.node.Resources();
    const contents = page.node.Contents();
    let streamBytes = Buffer.alloc(0);
    if (contents instanceof PDFArray) {
      streamBytes = Buffer.concat(
        contents.asArray().map((ref) => decodeStreamBytes(pdfDoc, ref))
      );
    } else if (contents) {
      streamBytes = decodeStreamBytes(pdfDoc, contents);
    }

    const parsed = { textRuns: [], rects: [], images: [] };
    parseStreamRecursive(pdfDoc, streamBytes, resources, [1, 0, 0, 1, 0, 0], parsed);

    const lines = groupTextRunsIntoLines(parsed.textRuns);
    const placeholders = extractPlaceholderMatches(lines, pIdx);
    const grid = extractTableGrid(parsed.rects);
    const fontFamily = detectFontFamilyFromLines(lines);

    totalTextCount += lines.length;
    allPlaceholders.push(...placeholders);

    pages.push({
      pageIndex: pIdx,
      width,
      height,
      fontFamily,
      lines,
      textRuns: parsed.textRuns,
      placeholders,
      rects: parsed.rects,
      images: parsed.images,
      grid,
      fullText: lines.map((l) => l.text).join("\n"),
    });
  }

  const tokenSet = new Set(allPlaceholders.map((p) => p.token));
  const combinedText = pages.map((p) => p.fullText).join("\n");

  return {
    pageCount,
    pages,
    allPlaceholders,
    tokenSet,
    totalTextCount,
    combinedText,
  };
}

/**
 * Scores category cues to catch wrong-category uploads before applying layouts.
 */
export function detectLikelyPdfCategory(inspection) {
  const txt = (inspection.combinedText || "").toLowerCase();
  const tokens = inspection.tokenSet || new Set();

  const hasTaxCues =
    (txt.includes("igst") || tokens.has("igstAmount") || tokens.has("igstPercentage")) &&
    (txt.includes("cgst") || txt.includes("sgst") || tokens.has("cgstAmount") || tokens.has("sgstAmount"));
  const hasOneTimeCues =
    (txt.includes("job no") || tokens.has("jobNo")) &&
    (txt.includes("operator") || tokens.has("operatorName1") || tokens.has("serviceDate1"));
  const hasRenewalCues =
    txt.includes("contractee") ||
    tokens.has("contracteeName") ||
    tokens.has("renewalDate") ||
    txt.includes("i agree and accept");
  const hasPcQuotationCues =
    (txt.includes("annexure i") ||
      txt.includes("annexure ii") ||
      txt.includes("commercial proposal") ||
      tokens.has("services") ||
      tokens.has("#services") ||
      tokens.has("billingTerm")) &&
    !hasRenewalCues &&
    !tokens.has("warrantyPeriod") &&
    !tokens.has("chemicalUsed");
  const hasAttCues =
    !hasPcQuotationCues &&
    (tokens.has("warrantyPeriod") ||
      tokens.has("chemicalUsed") ||
      tokens.has("typeOfTreatment") ||
      (txt.includes("warranty") && txt.includes("chemical") && txt.includes("specification")));
  const hasNonGstCues =
    (txt.includes("invoice no") || tokens.has("invoiceNumber")) &&
    !hasTaxCues &&
    (txt.includes("contract period") || tokens.has("contractPeriod") || txt.includes("particulars"));

  if (hasOneTimeCues) return "one-time-job";
  if (hasPcQuotationCues) return "quotation";
  if (hasAttCues) return "att-quotation";
  if (hasRenewalCues) return "contract-renewal";
  if (hasTaxCues && (txt.includes("invoice") || tokens.has("invoiceNumber"))) return "tax-invoice";
  if (hasNonGstCues) return "invoice";
  return null;
}

const hasAnyToken = (tokenSet, names) => names.some((n) => tokenSet.has(n));

const findLine = (lines, predicate) => lines.find(predicate) || null;

const findSpanX = (line, needleLower) => {
  if (!line?.spans) return null;
  let running = "";
  let firstX = null;
  for (const sp of line.spans) {
    if (firstX === null && sp.text.trim()) firstX = sp.x;
    running += sp.text.toLowerCase();
    if (running.includes(needleLower)) {
      const exactSpan = line.spans.find((s) => s.text.toLowerCase().includes(needleLower.trim()));
      return exactSpan ? exactSpan.x : firstX;
    }
  }
  return line.x;
};

/**
 * Resolves exact table/field geometry for GST Tax Invoice (`tax-invoice`) templates
 * (supports Letter `FORMAT - TAX BILL SINGLE PAGE.pdf`, A4 `FORMAT TAX BILL PLACEHOLDER.pdf`,
 * and structurally valid exports of this GST Invoice template).
 */
export function resolveTaxInvoicePdfLayout(inspection) {
  if (!inspection || inspection.totalTextCount === 0) {
    throw new PdfTemplateValidationError(
      "Uploaded GST Invoice PDF has no extractable text (scanned or image-only PDFs are unsupported)."
    );
  }

  const detectedOther = detectLikelyPdfCategory(inspection);
  if (detectedOther && detectedOther !== "tax-invoice") {
    throw new PdfTemplateValidationError(
      `Uploaded PDF matches '${detectedOther}' rather than 'tax-invoice'. Please upload a valid GST Tax Invoice PDF template.`
    );
  }

  const p0 = inspection.pages[0];
  const tokens = inspection.tokenSet;
  const txtLower = p0.fullText.toLowerCase();

  // Required tax-invoice placeholders and structure
  const missing = [];
  if (!hasAnyToken(tokens, ["invoiceNumber"])) missing.push("{invoiceNumber}");
  if (!hasAnyToken(tokens, ["customerName", "customerCompanyName"])) missing.push("{customerName}");
  if (!hasAnyToken(tokens, ["subtotal"])) missing.push("{subtotal}");
  if (!hasAnyToken(tokens, ["totalAmount"])) missing.push("{totalAmount}");
  const hasGstTax =
    txtLower.includes("igst") ||
    txtLower.includes("cgst") ||
    txtLower.includes("sgst") ||
    hasAnyToken(tokens, ["igstAmount", "cgstAmount", "sgstAmount"]);
  if (!hasGstTax) missing.push("IGST/CGST/SGST tax rows");

  if (missing.length > 0) {
    throw new PdfTemplateValidationError(
      `Invalid or unsupported GST Tax Invoice PDF template. Missing required fields/sections: ${missing.join(", ")}`
    );
  }

  const lines = p0.lines;
  const particularsLine = findLine(
    lines,
    (l) => /\bparticulars\b/i.test(l.text) && /\bamount\b/i.test(l.text)
  );
  if (!particularsLine) {
    throw new PdfTemplateValidationError(
      "Invalid GST Tax Invoice PDF layout: could not locate the 'Particulars | Amount' table header."
    );
  }

  const igstLine = findLine(lines, (l) => /add\s+igst/i.test(l.text));
  const cgstLine = findLine(lines, (l) => /add\s+cgst/i.test(l.text));
  const sgstLine = findLine(lines, (l) => /add\s+sgst/i.test(l.text));
  const wordsLine = findLine(lines, (l) => /amount\s+in\s+words/i.test(l.text));
  if (!igstLine || !cgstLine || !sgstLine || !wordsLine) {
    throw new PdfTemplateValidationError(
      "Invalid GST Tax Invoice PDF layout: missing IGST, CGST, SGST, or AMOUNT IN WORDS table rows."
    );
  }

  const { vlines, hlines } = p0.grid;
  const partY = particularsLine.y;

  // Vertical table borders spanning around or near the Particulars row
  const tableVlines = vlines
    .filter((v) => v.maxSpan >= partY - 25 && v.minSpan <= wordsLine.y + 40)
    .sort((a, b) => a.pos - b.pos);

  const leftV = tableVlines[0];
  const rightV = tableVlines[tableVlines.length - 1];
  if (!leftV || !rightV || rightV.pos - leftV.pos < 300) {
    throw new PdfTemplateValidationError(
      "Invalid GST Tax Invoice PDF layout: could not detect the outer invoice table borders."
    );
  }

  const amountLabelX = findSpanX(particularsLine, "amount") ?? rightV.pos - 100;
  const amountSplitV =
    vlines
      .filter(
        (v) =>
          v.pos > leftV.pos + 250 &&
          v.pos < amountLabelX + 10 &&
          v.minSpan <= igstLine.y + 30 &&
          v.maxSpan >= partY - 5
      )
      .sort((a, b) => Math.abs(amountLabelX - a.pos) - Math.abs(amountLabelX - b.pos))[0] ||
    tableVlines.find((v) => v.pos > leftV.pos + 250 && v.pos < rightV.pos - 50);

  if (!amountSplitV) {
    throw new PdfTemplateValidationError(
      "Invalid GST Tax Invoice PDF layout: could not detect Particulars/Amount column divider."
    );
  }

  const metaSplitV = vlines
    .filter(
      (v) =>
        v.pos > leftV.pos + 180 &&
        v.pos < rightV.pos - 100 &&
        v.maxSpan >= partY + 50
    )
    .sort((a, b) => a.pos - b.pos)[0];

  const hsnLine = findLine(lines, (l) => /\bhsn\b/i.test(l.text));
  const sacLine = findLine(lines, (l) => /\bsac\b/i.test(l.text));
  const hsnSacSplitV = hsnLine
    ? vlines.find(
        (v) =>
          v.pos > (metaSplitV ? metaSplitV.pos + 30 : leftV.pos + 250) &&
          v.pos < rightV.pos - 30 &&
          v.minSpan <= hsnLine.y + 5 &&
          v.maxSpan >= hsnLine.y - 5
      )
    : null;

  // Horizontal lines spanning the table (sorted top-to-bottom)
  const majorHLines = hlines
    .filter((h) => h.maxSpan - h.minSpan >= (rightV.pos - leftV.pos) * 0.45)
    .sort((a, b) => b.pos - a.pos);

  const metaHLinesRight = hlines
    .filter((h) => h.maxSpan > (metaSplitV?.pos ?? amountSplitV.pos) && h.pos > partY)
    .sort((a, b) => b.pos - a.pos);

  const firstHAbove = (yVal, pool = majorHLines) =>
    pool.filter((h) => h.pos > yVal + 1).sort((a, b) => a.pos - b.pos)[0]?.pos ?? null;
  const firstHBelow = (yVal, pool = majorHLines) =>
    pool.filter((h) => h.pos < yVal - 1).sort((a, b) => b.pos - a.pos)[0]?.pos ?? null;

  const toLine = findLine(lines, (l) => /\bto\s*,/i.test(l.text)) || findLine(lines, (l) => /invoice\s*no/i.test(l.text));
  const headerBannerBottom = p0.images
    .filter((im) => im.y1 > p0.height * 0.8)
    .reduce((minY, im) => Math.min(minY, im.y0), p0.height);

  const tableTopY =
    majorHLines[0]?.pos ??
    firstHAbove(toLine?.y ?? partY + 90) ??
    Math.min(headerBannerBottom - 1, p0.height - 90);

  const particularsHeaderTopY = firstHAbove(partY) ?? partY + 14;
  const particularsHeaderBottomY = firstHBelow(partY) ?? partY - 11;

  const hsnTopY = hsnLine ? firstHAbove(hsnLine.y, metaHLinesRight) : null;
  const hsnBottomY = hsnLine ? firstHBelow(hsnLine.y, metaHLinesRight) : null;

  const igstTopY = firstHAbove(igstLine.y) ?? igstLine.y + 12;
  const igstBottomY = firstHBelow(igstLine.y) ?? cgstLine.y + 12;
  const cgstBottomY = firstHBelow(cgstLine.y) ?? sgstLine.y + 12;
  const sgstBottomY = firstHBelow(sgstLine.y) ?? wordsLine.y + 12;
  const totalBottomY = firstHBelow(wordsLine.y) ?? wordsLine.y - 12;

  // Detect placeholders & footer features
  const bankPlaceholders = p0.placeholders.filter((p) =>
    ["bankName", "accountNumber", "gstAccountNumber", "ifsc", "ifscCode"].includes(p.token)
  );
  const bankDetailsHeading = findLine(lines, (l) => /bank\s*details/i.test(l.text));
  const hasBankPlaceholders = bankPlaceholders.length > 0;
  const bottomLeftImage = p0.images.find(
    (im) => im.y1 < totalBottomY && im.x0 < (amountSplitV.pos * 0.75)
  );

  // Detect footer safe top boundary (bullets / notes / signature below total row)
  const footerLines = lines.filter((l) => l.y < totalBottomY - 2);
  const footerTopY = footerLines.reduce(
    (maxY, l) => Math.max(maxY, l.y + (l.size || 10) * 0.9),
    0
  );

  const gstLine = findLine(lines, (l) => /gst\s*no/i.test(l.text));
  const stateCodeText = gstLine?.text?.match(/state\s*code/i) ? "STATE CODE" : "CODE";
  const hasGstCodeToken = tokens.has("gstCode");

  // Detect actual Amount value column start & right edge from Rs. {subtotal} / Rs. {totalAmount}
  const subtotalLine = findLine(lines, (l) => /\{subtotal\}/i.test(l.text));

  return {
    category: "tax-invoice",
    pageWidth: p0.width,
    pageHeight: p0.height,
    fontFamily: p0.fontFamily,
    headerBannerBottomY: headerBannerBottom,
    table: {
      leftX: leftV.pos,
      leftThickness: leftV.thickness,
      metaSplitX: metaSplitV?.pos ?? amountSplitV.pos - 80,
      hsnSacSplitX: hsnSacSplitV?.pos ?? null,
      amountSplitX: amountSplitV.pos,
      splitThickness: amountSplitV.thickness,
      rightX: rightV.pos,
      rightThickness: rightV.thickness,
      tableTopY,
      hsnTopY,
      hsnBottomY,
      particularsHeaderTopY,
      particularsHeaderBottomY,
      bodyTopY: particularsHeaderBottomY,
      bodyBottomY: igstTopY,
      igstRow: { topY: igstTopY, bottomY: igstBottomY, textY: igstLine.y },
      cgstRow: { topY: igstBottomY, bottomY: cgstBottomY, textY: cgstLine.y },
      sgstRow: { topY: cgstBottomY, bottomY: sgstBottomY, textY: sgstLine.y },
      totalRow: { topY: sgstBottomY, bottomY: totalBottomY, textY: wordsLine.y },
    },
    fields: {
      toY: toLine?.y ?? tableTopY - 16,
      gstY: gstLine?.y ?? particularsHeaderTopY + 8,
      stateCodeLabel: stateCodeText,
      hasGstCodeToken,
      hasSeparateSacField: Boolean(sacLine),
      subtotalY: subtotalLine?.y ?? (particularsHeaderBottomY + igstTopY) / 2,
      hasAmountInWordsPlaceholder: tokens.has("amountInWords") || tokens.has("amountWords"),
    },
    bank: {
      hasBankPlaceholders,
      preserveStaticBankImage: !hasBankPlaceholders && Boolean(bottomLeftImage),
      placeholders: bankPlaceholders,
      headingY: bankDetailsHeading?.y ?? null,
    },
    footerTopY,
  };
}

/**
 * Resolve & validate geometry for Non-GST Invoice (`invoice`) PDF templates.
 * Ensures the uploaded PDF is extractable text, does not belong to GST Tax Invoice
 * or another document category, and exposes exact table/header/footer/QR boundaries.
 */
export function resolveNonGstInvoicePdfLayout(inspection) {
  if (!inspection || inspection.totalTextCount === 0) {
    throw new PdfTemplateValidationError(
      "Uploaded Non-GST Invoice PDF has no extractable text (scanned or image-only PDFs are unsupported)."
    );
  }

  const detectedOther = detectLikelyPdfCategory(inspection);
  if (detectedOther && detectedOther !== "invoice") {
    throw new PdfTemplateValidationError(
      `Uploaded PDF matches '${detectedOther}' rather than 'invoice'. Please upload a valid Non-GST Invoice PDF template.`
    );
  }

  const p0 = inspection.pages[0];
  const tokens = inspection.tokenSet;
  const txtLower = p0.fullText.toLowerCase();

  // Reject templates that contain GST tax rows
  const hasGstTax =
    /\b(igst|cgst|sgst)\b/i.test(txtLower) ||
    hasAnyToken(tokens, ["igstAmount", "cgstAmount", "sgstAmount"]);
  if (hasGstTax) {
    throw new PdfTemplateValidationError(
      "Uploaded PDF contains GST tax rows (IGST/CGST/SGST) and belongs to 'tax-invoice' rather than Non-GST 'invoice'."
    );
  }

  const missing = [];
  if (!hasAnyToken(tokens, ["invoiceNumber"])) missing.push("{invoiceNumber}");
  if (!hasAnyToken(tokens, ["customerName", "customerCompanyName"])) missing.push("{customerName}");
  if (!hasAnyToken(tokens, ["subtotal"])) missing.push("{subtotal}");
  if (!hasAnyToken(tokens, ["totalAmount"])) missing.push("{totalAmount}");

  if (missing.length > 0) {
    throw new PdfTemplateValidationError(
      `Invalid or unsupported Non-GST Invoice PDF template. Missing required fields: ${missing.join(", ")}`
    );
  }

  const lines = p0.lines;
  const particularsLine = findLine(
    lines,
    (l) => /\bparticulars\b/i.test(l.text) && /\bamount\b/i.test(l.text)
  );
  const wordsLine = findLine(lines, (l) => /amount\s+in\s+words/i.test(l.text));
  if (!particularsLine || !wordsLine) {
    throw new PdfTemplateValidationError(
      "Invalid Non-GST Invoice PDF layout: missing 'Particulars | Amount' header or 'AMOUNT IN WORDS' total row."
    );
  }

  const { vlines, hlines } = p0.grid;
  const partY = particularsLine.y;

  const tableVlines = vlines
    .filter((v) => v.maxSpan >= partY - 25 && v.minSpan <= wordsLine.y + 40)
    .sort((a, b) => a.pos - b.pos);

  const leftV = tableVlines[0];
  const rightV = tableVlines[tableVlines.length - 1];
  if (!leftV || !rightV || rightV.pos - leftV.pos < 300) {
    throw new PdfTemplateValidationError(
      "Invalid Non-GST Invoice PDF layout: could not detect outer invoice table borders."
    );
  }

  const amountLabelX = findSpanX(particularsLine, "amount") ?? rightV.pos - 100;
  const amountSplitV =
    vlines
      .filter(
        (v) =>
          v.pos > leftV.pos + 250 &&
          v.pos < amountLabelX + 10 &&
          v.minSpan <= wordsLine.y + 40 &&
          v.maxSpan >= partY - 5
      )
      .sort((a, b) => Math.abs(amountLabelX - a.pos) - Math.abs(amountLabelX - b.pos))[0] ||
    tableVlines.find((v) => v.pos > leftV.pos + 250 && v.pos < rightV.pos - 50);

  if (!amountSplitV) {
    throw new PdfTemplateValidationError(
      "Invalid Non-GST Invoice PDF layout: could not detect Particulars/Amount column divider."
    );
  }

  const metaSplitV = vlines
    .filter(
      (v) =>
        v.pos > leftV.pos + 180 &&
        v.pos < rightV.pos - 100 &&
        v.maxSpan >= partY + 50
    )
    .sort((a, b) => a.pos - b.pos)[0];

  const majorHLines = hlines
    .filter((h) => h.maxSpan - h.minSpan >= (rightV.pos - leftV.pos) * 0.45)
    .sort((a, b) => b.pos - a.pos);

  const firstHAbove = (yVal, pool = majorHLines) =>
    pool.filter((h) => h.pos > yVal + 1).sort((a, b) => a.pos - b.pos)[0]?.pos ?? null;
  const firstHBelow = (yVal, pool = majorHLines) =>
    pool.filter((h) => h.pos < yVal - 1).sort((a, b) => b.pos - a.pos)[0]?.pos ?? null;

  const toLine =
    findLine(lines, (l) => /\bto\s*,/i.test(l.text)) ||
    findLine(lines, (l) => /invoice\s*no/i.test(l.text));
  const headerBannerBottom = p0.images
    .filter((im) => im.y1 > p0.height * 0.8)
    .reduce((minY, im) => Math.min(minY, im.y0), p0.height);

  const tableTopY =
    majorHLines[0]?.pos ??
    firstHAbove(toLine?.y ?? partY + 90) ??
    Math.min(headerBannerBottom - 1, p0.height - 90);

  const particularsHeaderTopY = firstHAbove(partY) ?? partY + 14;
  const particularsHeaderBottomY = firstHBelow(partY) ?? partY - 12;
  const totalTopY = firstHAbove(wordsLine.y) ?? wordsLine.y + 13;
  const totalBottomY = firstHBelow(wordsLine.y) ?? wordsLine.y - 13;

  // Right-side metadata cell dividers between tableTopY and particularsHeaderTopY
  const rightMetaX = metaSplitV?.pos ?? amountSplitV.pos - 80;
  const metaRightHLines = hlines
    .filter(
      (h) =>
        h.maxSpan > rightMetaX + 5 &&
        h.minSpan >= rightMetaX - 5 &&
        h.pos < tableTopY - 2 &&
        h.pos > particularsHeaderTopY + 2
    )
    .sort((a, b) => b.pos - a.pos);

  const billingLine = findLine(lines, (l) => /billing\s*period/i.test(l.text));
  const contractLine = findLine(lines, (l) => /contract\s*period/i.test(l.text));
  const custNamePlaceholder = p0.placeholders.find((p) =>
    ["customerName", "customerCompanyName", "customerFullName"].includes(p.token)
  );
  const custAddrPlaceholder = p0.placeholders.find((p) => p.token === "customerAddress");

  // Detect bank placeholders and any footer QR / stamp images below the table
  const bankPlaceholders = p0.placeholders.filter((p) =>
    ["bankName", "accountNumber", "nonGstAccountNumber", "ifsc", "ifscCode"].includes(p.token)
  );
  const bankDetailsHeading = findLine(lines, (l) => /bank\s*details/i.test(l.text));
  const footerImages = p0.images.filter((im) => im.y1 < totalBottomY);
  const qrImageBox =
    footerImages.find(
      (im) =>
        im.x0 > leftV.pos + 90 &&
        im.x1 < rightV.pos * 0.65 &&
        im.width >= 35 &&
        im.height >= 35
    ) || null;

  const subtotalLine = findLine(lines, (l) => /\{subtotal\}/i.test(l.text));
  const footerLines = lines.filter((l) => l.y < totalBottomY - 2);
  const footerTopY = footerLines.reduce(
    (maxY, l) => Math.max(maxY, l.y + (l.size || 10) * 0.9),
    0
  );

  return {
    category: "invoice",
    pageWidth: p0.width,
    pageHeight: p0.height,
    fontFamily: p0.fontFamily,
    headerBannerBottomY: headerBannerBottom,
    table: {
      leftX: leftV.pos,
      leftThickness: leftV.thickness,
      metaSplitX: rightMetaX,
      amountSplitX: amountSplitV.pos,
      splitThickness: amountSplitV.thickness,
      rightX: rightV.pos,
      rightThickness: rightV.thickness,
      tableTopY,
      metaRightDividers: metaRightHLines.map((h) => ({ y: h.pos, thickness: h.thickness || 1.2 })),
      particularsHeaderTopY,
      particularsHeaderBottomY,
      bodyTopY: particularsHeaderBottomY,
      bodyBottomY: totalTopY,
      totalRow: { topY: totalTopY, bottomY: totalBottomY, textY: wordsLine.y },
    },
    fields: {
      toX: leftV.pos + 8,
      custIndentX: custNamePlaceholder?.x ?? custAddrPlaceholder?.x ?? leftV.pos + 26,
      toY: toLine?.y ?? tableTopY - 15,
      hasBillingRow: Boolean(billingLine),
      hasContractRow: Boolean(contractLine),
      subtotalY: subtotalLine?.y ?? (particularsHeaderBottomY + totalTopY) / 2,
      hasAmountInWordsPlaceholder: tokens.has("amountInWords") || tokens.has("amountWords"),
    },
    bank: {
      hasBankPlaceholders: bankPlaceholders.length > 0,
      placeholders: bankPlaceholders,
      headingY: bankDetailsHeading?.y ?? null,
      qrImageBox,
    },
    footerTopY,
  };
}

/**
 * Resolve & validate geometry for PC Quotation (`quotation`) PDF templates.
 * Extracts header banner bounds, customer/metadata anchors, `#92D050` Premises bar,
 * 5-column commercial proposal table borders, footer terms, Stamp XObject, & Annexures.
 */
export function resolveQuotationPdfLayout(inspection) {
  if (!inspection || inspection.totalTextCount === 0) {
    throw new PdfTemplateValidationError(
      "Uploaded PC Quotation PDF has no extractable text (scanned or image-only PDFs are unsupported)."
    );
  }

  const detectedOther = detectLikelyPdfCategory(inspection);
  if (detectedOther && detectedOther !== "quotation") {
    throw new PdfTemplateValidationError(
      `Uploaded PDF matches '${detectedOther}' rather than 'quotation'. Please upload a valid PC Quotation PDF template.`
    );
  }

  const p0 = inspection.pages[0];
  const p0Lower = (p0.fullText || "").toLowerCase();
  if (
    /rate\s*\/\s*sq\.?\s*ft|\batt\s+quotation\b/i.test(p0Lower) ||
    (/\banti[\s-]*termite\b/i.test(p0Lower) && !/\bpc\s+quotation\b/i.test(p0Lower))
  ) {
    throw new PdfTemplateValidationError(
      "Uploaded PDF appears to be an ATT Quotation rather than a PC Quotation ('quotation')."
    );
  }
  const lines = p0.lines;
  const tokens = inspection.tokenSet;

  const headerRowLine = findLine(
    lines,
    (l) => /location\s+to\s+be\s+treated/i.test(l.text) && /service\s+name/i.test(l.text)
  );
  const totalAmountLine = findLine(lines, (l) => /total\s+amount/i.test(l.text));
  const missing = [];
  if (!hasAnyToken(tokens, ["quotationNumber", "quoteNumber"]) && !/\bqtn\s*no\b/i.test(p0.fullText)) {
    missing.push("{quotationNumber} / QTN NO");
  }
  if (!hasAnyToken(tokens, ["customerName", "customerCompanyName", "customerFullName"]) && !/\bto\s*,/i.test(p0.fullText)) {
    missing.push("{customerName}");
  }
  if (!headerRowLine) missing.push("Proposal table header ('Location to be Treated | Service Name')");
  if (!totalAmountLine) missing.push("'TOTAL AMOUNT' row");

  if (missing.length > 0) {
    throw new PdfTemplateValidationError(
      `Invalid or unsupported PC Quotation PDF template. Missing required sections: ${missing.join(", ")}`
    );
  }

  const { vlines, hlines, shadedBoxes } = p0.grid;
  const headerBannerBottom = p0.images
    .filter((im) => im.y1 > p0.height * 0.78)
    .reduce((minY, im) => Math.min(minY, im.y0), p0.height);

  const majorHLines = hlines
    .filter((h) => h.maxSpan - h.minSpan >= p0.width * 0.45)
    .sort((a, b) => b.pos - a.pos);

  const firstHAbove = (yVal, pool = majorHLines) =>
    pool.filter((h) => h.pos > yVal + 1).sort((a, b) => a.pos - b.pos)[0]?.pos ?? null;
  const firstHBelow = (yVal, pool = majorHLines) =>
    pool.filter((h) => h.pos < yVal - 1).sort((a, b) => b.pos - a.pos)[0]?.pos ?? null;

  const headerTopY = firstHAbove(headerRowLine.y) ?? 388.37;
  const headerBottomY = firstHBelow(headerRowLine.y) ?? 361.37;
  const totalTopY = firstHAbove(totalAmountLine.y) ?? 312.77;
  const totalBottomY = firstHBelow(totalAmountLine.y) ?? 283.13;

  // Detect 5-column proposal vertical borders spanning headerBottomY..headerTopY
  const rawTableVs = vlines
    .filter((v) => v.maxSpan >= headerTopY - 3 && v.minSpan <= headerBottomY + 3)
    .sort((a, b) => a.pos - b.pos);
  const clusteredColX = [];
  for (const v of rawTableVs) {
    if (clusteredColX.length === 0 || Math.abs(v.pos - clusteredColX[clusteredColX.length - 1]) > 5) {
      clusteredColX.push(v.pos);
    }
  }
  const colX =
    clusteredColX.length >= 6
      ? clusteredColX.slice(0, 6)
      : [19.08, 78.02, 304.49, 399.67, 488.14, 569.64];

  // Detect "Premises to be Treated" green banner row
  const premisesLine = findLine(lines, (l) => /premises\s+to\s+be\s+treated/i.test(l.text));
  const premY = premisesLine?.y ?? headerTopY + 18;
  const premTopY = firstHAbove(premY) ?? 425.71;
  const premBottomY = firstHBelow(premY) ?? 394.97;
  const rawPremVs = vlines
    .filter((v) => v.maxSpan >= premTopY - 4 && v.minSpan <= premBottomY + 4)
    .sort((a, b) => a.pos - b.pos);
  const clusteredPremX = [];
  for (const v of rawPremVs) {
    if (clusteredPremX.length === 0 || Math.abs(v.pos - clusteredPremX[clusteredPremX.length - 1]) > 5) {
      clusteredPremX.push(v.pos);
    }
  }
  const premLeftX = clusteredPremX[0] ?? 14.16;
  const premSplitX = clusteredPremX.length >= 3 ? clusteredPremX[1] : 151.94;
  const premRightX = clusteredPremX.length >= 2 ? clusteredPremX[clusteredPremX.length - 1] : 574.2;

  const greenShade = shadedBoxes.find(
    (b) => b.fillRgb && b.fillRgb[1] > 0.65 && b.fillRgb[0] < 0.7 && b.fillRgb[2] < 0.5
  );
  const greenColorRgb = greenShade?.fillRgb || [146 / 255, 208 / 255, 80 / 255];

  const dateLine = findLine(lines, (l) => /\bdate\s*:/i.test(l.text));
  const qtnLine = findLine(lines, (l) => /\bqtn\s*no\s*:/i.test(l.text));
  const toLine = findLine(lines, (l) => /^\s*to\s*,?\s*$/i.test(l.text));
  const custNamePh = p0.placeholders.find((p) =>
    ["customerName", "customerCompanyName", "customerFullName"].includes(p.token)
  );
  const refLine = findLine(lines, (l) => /\breference\s*:/i.test(l.text));

  const stampImage =
    p0.images.find((im) => im.y1 < totalBottomY && im.width >= 20 && im.height >= 12) || null;

  return {
    category: "quotation",
    pageCount: inspection.pageCount,
    pageWidth: p0.width,
    pageHeight: p0.height,
    fontFamily: p0.fontFamily,
    headerBannerBottomY: headerBannerBottom,
    greenColorRgb,
    fields: {
      metaX: Math.min(dateLine?.x ?? 435, qtnLine?.x ?? 435),
      dateY: dateLine?.y ?? 715.3,
      qtnY: qtnLine?.y ?? 704.98,
      toY: toLine?.y ?? 693.46,
      custX: custNamePh?.x ?? 42.48,
      custTopY: custNamePh?.y ?? 682.18,
      refY: refLine?.y ?? 642.34,
    },
    premisesBox: {
      leftX: premLeftX,
      splitX: premSplitX,
      rightX: premRightX,
      topY: premTopY,
      bottomY: premBottomY,
    },
    table: {
      colX,
      headerTopY,
      headerBottomY,
      totalTopY,
      totalBottomY,
    },
    stampImage,
    hasAnnexurePages: inspection.pageCount > 1,
  };
}

/**
 * Resolve & validate geometry for Contract Renewal (`contract-renewal`) PDF templates.
 * Extracts table column bounds, header/row/total shading colors, summary bullets,
 * Terms & Conditions list, Stamp XObject, and acceptance/contractee anchors.
 */
export function resolveContractRenewalPdfLayout(inspection) {
  if (!inspection || inspection.totalTextCount === 0) {
    throw new PdfTemplateValidationError(
      "Uploaded Contract Renewal PDF has no extractable text (scanned or image-only PDFs are unsupported)."
    );
  }

  const detectedOther = detectLikelyPdfCategory(inspection);
  if (detectedOther && detectedOther !== "contract-renewal") {
    throw new PdfTemplateValidationError(
      `Uploaded PDF matches '${detectedOther}' rather than 'contract-renewal'. Please upload a valid Contract Renewal PDF template.`
    );
  }

  const p0 = inspection.pages[0];
  const lines = p0.lines;
  const tokens = inspection.tokenSet;

  const headerRowLine = findLine(
    lines,
    (l) => /location\s+to\s+be\s+treated/i.test(l.text) && /service\s+name/i.test(l.text)
  );
  const wordsLine = findLine(lines, (l) => /amount\s+in\s+words/i.test(l.text));
  const missing = [];
  if (!hasAnyToken(tokens, ["customerName", "customerCompanyName", "customerFullName"]) && !/\bto\s*,/i.test(p0.fullText)) {
    missing.push("{customerName}");
  }
  if (!headerRowLine) missing.push("Services table header ('Location to be Treated | Service Name')");
  if (!wordsLine) missing.push("'AMOUNT IN WORDS' row");
  if (!hasAnyToken(tokens, ["contractPeriod"]) && !/contract\s+period/i.test(p0.fullText)) {
    missing.push("{contractPeriod}");
  }

  if (missing.length > 0) {
    throw new PdfTemplateValidationError(
      `Invalid or unsupported Contract Renewal PDF template. Missing required sections: ${missing.join(", ")}`
    );
  }

  const { vlines, hlines, shadedBoxes } = p0.grid;
  const headerBannerBottom = p0.images
    .filter((im) => im.y1 > p0.height * 0.78)
    .reduce((minY, im) => Math.min(minY, im.y0), p0.height);

  const majorHLines = hlines
    .filter((h) => h.maxSpan - h.minSpan >= p0.width * 0.45)
    .sort((a, b) => b.pos - a.pos);

  const headerShade = shadedBoxes.find(
    (b) =>
      Math.abs((b.y0 + b.y1) / 2 - headerRowLine.y) < 12 &&
      b.fillRgb &&
      b.fillRgb[1] > 0.65
  );
  const headerTopY = majorHLines.find((h) => h.pos > headerRowLine.y)?.pos ?? headerShade?.y1 ?? 568.03;
  const headerBottomY = headerShade?.y0 ?? 549.79;
  const totalTopY = majorHLines.find((h) => Math.abs(h.pos - wordsLine.y) < 25 && h.pos > wordsLine.y)?.pos ?? 500.35;
  const totalBottomY = majorHLines.find((h) => Math.abs(h.pos - wordsLine.y) < 25 && h.pos < wordsLine.y)?.pos ?? 477.67;

  const rawTableVs = vlines
    .filter((v) => v.maxSpan >= headerTopY - 3 && v.minSpan <= totalTopY + 3)
    .sort((a, b) => a.pos - b.pos);
  const clusteredColX = [];
  for (const v of rawTableVs) {
    if (clusteredColX.length === 0 || Math.abs(v.pos - clusteredColX[clusteredColX.length - 1]) > 5) {
      clusteredColX.push(v.pos);
    }
  }
  const colX =
    clusteredColX.length >= 6
      ? clusteredColX.slice(0, 6)
      : [36.24, 76.22, 256.25, 396.31, 486.34, 581.88];

  const rowShade = shadedBoxes.find(
    (b) => b.y1 <= headerBottomY + 2 && b.y0 >= totalTopY - 2 && b.fillRgb
  );
  const totalShade = shadedBoxes.find(
    (b) => b.y1 <= totalTopY + 2 && b.y0 >= totalBottomY - 2 && b.fillRgb
  );

  const dateLine = findLine(lines, (l) => /\bdate\s*:/i.test(l.text));
  const toLine = findLine(lines, (l) => /^\s*to\s*,?\s*$/i.test(l.text));
  const custNamePh = p0.placeholders.find((p) =>
    ["customerName", "customerCompanyName", "customerFullName"].includes(p.token)
  );
  const subLine = findLine(lines, (l) => /\bsub\s*:/i.test(l.text));
  const tcHeadingLine = findLine(lines, (l) => /terms\s+and\s+conditions/i.test(l.text));
  const yoursLine = findLine(lines, (l) => /yours\s+faithfully/i.test(l.text));
  const payTermLine = findLine(lines, (l) => /payment\s+term/i.test(l.text));
  const contracteeLine = findLine(lines, (l) => /\{contractee/i.test(l.text));

  // Extract Terms & Conditions bullets dynamically from template text
  const tcStartY = tcHeadingLine?.y ?? 417.5;
  const tcEndY = yoursLine?.y ?? 267.3;
  const tcRawLines = lines
    .filter((l) => l.y < tcStartY - 2 && l.y > tcEndY + 2)
    .sort((a, b) => b.y - a.y);
  const tcBullets = [];
  for (const l of tcRawLines) {
    const txt = l.text.trim();
    if (!txt) continue;
    if (/^[●•\-]/.test(txt) || tcBullets.length === 0) {
      tcBullets.push(txt.replace(/^[●•\-]\s*/, "").trim());
    } else {
      tcBullets[tcBullets.length - 1] = `${tcBullets[tcBullets.length - 1]} ${txt}`;
    }
  }

  const stampImage =
    p0.images.find((im) => im.y1 < tcStartY && im.width >= 20 && im.height >= 12) || null;

  return {
    category: "contract-renewal",
    pageWidth: p0.width,
    pageHeight: p0.height,
    fontFamily: p0.fontFamily,
    headerBannerBottomY: headerBannerBottom,
    colors: {
      headerFillRgb: headerShade?.fillRgb || [0.675, 0.863, 0.0902],
      rowFillRgb: rowShade?.fillRgb || [0.8, 0.8, 0.8],
      totalFillRgb: totalShade?.fillRgb || [0.898, 0.898, 0.898],
    },
    fields: {
      dateX: dateLine?.x ?? 471.58,
      dateY: dateLine?.y ?? 711.22,
      toY: toLine?.y ?? 699.58,
      custX: custNamePh?.x ?? 55.8,
      custTopY: custNamePh?.y ?? 689.62,
      subY: subLine?.y ?? 656.74,
      tcHeadingY: tcStartY,
      payTermBottomY: (payTermLine?.y ?? 435.67) - 6,
      contracteeY: contracteeLine?.y ?? 153.14,
    },
    table: {
      colX,
      headerTopY,
      headerBottomY,
      origTotalTopY: totalTopY,
      origTotalBottomY: totalBottomY,
    },
    tcBullets,
    stampImage,
  };
}

/**
 * Resolve & validate geometry for One Time Job Service Paper (`one-time-job`) PDF templates.
 * Extracts key-value row bounds, 3-occurrence column dividers, GPAY line, & footer images
 * so cell interiors are replaced without breaking vertical grid borders or static bank/QR/stamp graphics.
 */
export function resolveOneTimeJobPdfLayout(inspection) {
  if (!inspection || inspection.totalTextCount === 0) {
    throw new PdfTemplateValidationError(
      "Uploaded One Time Job PDF has no extractable text (scanned or image-only PDFs are unsupported)."
    );
  }

  const detectedOther = detectLikelyPdfCategory(inspection);
  if (detectedOther && detectedOther !== "one-time-job") {
    throw new PdfTemplateValidationError(
      `Uploaded PDF matches '${detectedOther}' rather than 'one-time-job'. Please upload a valid Service Paper PDF template.`
    );
  }

  const p0 = inspection.pages[0];
  const lines = p0.lines;
  const tokens = inspection.tokenSet;

  const titleLine = findLine(lines, (l) => /service\s+paper/i.test(l.text));
  const descLine = findLine(lines, (l) => /\bdescription\b/i.test(l.text));
  const serviceDateLine = findLine(lines, (l) => /service\s+date/i.test(l.text));
  const missing = [];
  if (!titleLine) missing.push("'SERVICE PAPER' heading");
  if (!hasAnyToken(tokens, ["jobNo"]) && !/job\s*no/i.test(p0.fullText)) missing.push("{jobNo}");
  if (!hasAnyToken(tokens, ["customerName"]) && !/client\s*name/i.test(p0.fullText)) {
    missing.push("{customerName}");
  }
  if (!descLine) missing.push("'DESCRIPTION' section");
  if (!serviceDateLine) missing.push("'Service Date' occurrence grid");

  if (missing.length > 0) {
    throw new PdfTemplateValidationError(
      `Invalid or unsupported One Time Job PDF template. Missing required sections: ${missing.join(", ")}`
    );
  }

  const { vlines, hlines } = p0.grid;
  const headerBannerBottom = p0.images
    .filter((im) => im.y1 > p0.height * 0.78)
    .reduce((minY, im) => Math.min(minY, im.y0), p0.height);

  const majorHLines = hlines
    .filter((h) => h.maxSpan - h.minSpan >= p0.width * 0.45)
    .sort((a, b) => b.pos - a.pos);

  const firstHAbove = (yVal, pool = majorHLines) =>
    pool.filter((h) => h.pos > yVal + 1).sort((a, b) => a.pos - b.pos)[0]?.pos ?? null;
  const firstHBelow = (yVal, pool = majorHLines) =>
    pool.filter((h) => h.pos < yVal - 1).sort((a, b) => b.pos - a.pos)[0]?.pos ?? null;

  const outerV = vlines
    .filter((v) => v.maxSpan - v.minSpan > 300)
    .sort((a, b) => a.pos - b.pos);
  const leftX = outerV[0]?.pos ?? 21.12;
  const rightX = outerV[outerV.length - 1]?.pos ?? 581.28;
  const borderW = outerV[0]?.thickness || 1.44;

  const midVs = vlines
    .filter((v) => v.pos > leftX + 60 && v.pos < rightX - 60)
    .sort((a, b) => a.pos - b.pos);
  const splitX = midVs[0]?.pos ?? 155.9;
  const occSplit1X = midVs.find((v) => v.pos > splitX + 60)?.pos ?? 304.73;
  const occSplit2X = midVs.find((v) => v.pos > occSplit1X + 60)?.pos ?? 425.23;

  const jobLine = findLine(lines, (l) => /job\s*no/i.test(l.text));
  const rowBoundsFor = (line, fallbackTop, fallbackBottom) => {
    if (!line) return { topY: fallbackTop, bottomY: fallbackBottom };
    return {
      topY: firstHAbove(line.y) ?? fallbackTop,
      bottomY: firstHBelow(line.y) ?? fallbackBottom,
    };
  };

  const typeLine = findLine(lines, (l) => /type\s+of\s+service/i.test(l.text));
  const areaLine = findLine(lines, (l) => /premises\s+area/i.test(l.text));
  const pestLine = findLine(lines, (l) => /location\s+of\s+pest/i.test(l.text));
  const freqLine = findLine(lines, (l) => /service\s+frequency/i.test(l.text));
  const chargesLine = findLine(lines, (l) => /service\s+charges/i.test(l.text));
  const occHdrLine = findLine(lines, (l) => /1st\s+service/i.test(l.text));
  const timeLine = findLine(lines, (l) => /service\s+time/i.test(l.text));
  const opLine = findLine(lines, (l) => /operator\s+name/i.test(l.text));
  const sigLine = findLine(lines, (l) => /client\s+signature/i.test(l.text));
  const payLine = findLine(lines, (l) => /payment\s+details/i.test(l.text));
  const remarkLine = findLine(lines, (l) => /\bremark\b/i.test(l.text));

  const metaTopY = firstHAbove(jobLine?.y ?? 697) ?? 711.22;
  const metaBottomY = firstHAbove(descLine.y) ?? 589.66;
  const descHdrBottomY = firstHBelow(descLine.y) ?? 561.55;

  const remarkBox = rowBoundsFor(remarkLine, 280.13, 246.05);
  const gpayLine = findLine(lines, (l) => /gpay\s*no/i.test(l.text));
  const footerImages = p0.images.filter((im) => im.y1 < remarkBox.bottomY);

  return {
    category: "one-time-job",
    pageWidth: p0.width,
    pageHeight: p0.height,
    fontFamily: p0.fontFamily,
    headerBannerBottomY: headerBannerBottom,
    borderW,
    cols: {
      leftX,
      splitX,
      occSplit1X,
      occSplit2X,
      rightX,
    },
    rows: {
      meta: { topY: metaTopY, bottomY: metaBottomY },
      descHeading: { topY: metaBottomY, bottomY: descHdrBottomY },
      typeOfService: {
        label: "Type of Service",
        ...rowBoundsFor(typeLine, descHdrBottomY, 539.35),
      },
      premisesArea: {
        label: "Premises Area",
        ...rowBoundsFor(areaLine, 539.35, 517.51),
      },
      locationOfPest: {
        label: "Location of Pest",
        ...rowBoundsFor(pestLine, 517.51, 495.31),
      },
      frequency: {
        label: "Service Frequency",
        ...rowBoundsFor(freqLine, 495.31, 473.23),
      },
      serviceCharges: {
        label: "Service Charges",
        ...rowBoundsFor(chargesLine, 473.23, 448.51),
      },
      occHeader: rowBoundsFor(occHdrLine, 448.51, 436.39),
      serviceDate: {
        label: "Service Date",
        ...rowBoundsFor(serviceDateLine, 436.39, 406.15),
      },
      serviceTime: {
        label: "Service Time",
        ...rowBoundsFor(timeLine, 406.15, 383.57),
      },
      operatorName: {
        label: "Operator Name",
        ...rowBoundsFor(opLine, 383.57, 354.53),
      },
      clientSignature: {
        label: "Client Signature",
        ...rowBoundsFor(sigLine, 354.53, 309.53),
      },
      paymentDetails: {
        label: "Payment Details",
        ...rowBoundsFor(payLine, 309.53, 280.13),
      },
      remark: {
        label: "Remark",
        ...remarkBox,
      },
    },
    footer: {
      gpayY: gpayLine?.y ?? 228.41,
      gpayX: gpayLine?.x ?? 78.02,
      images: footerImages,
    },
  };
}

/**
 * Resolve & validate geometry for ATT Quotation (`att-quotation`) PDF templates.
 */
export function resolveAttQuotationPdfLayout(inspection) {
  if (!inspection?.pages?.length) {
    throw new PdfTemplateValidationError("Uploaded PDF has no readable pages.");
  }

  const detectedOther = detectLikelyPdfCategory(inspection);
  if (detectedOther && detectedOther !== "att-quotation") {
    throw new PdfTemplateValidationError(
      `Uploaded PDF matches '${detectedOther}' rather than 'att-quotation'. Please upload a valid ATT Quotation PDF template.`
    );
  }

  const p0 = inspection.pages[0];
  const lines = p0.lines;
  const tokens = inspection.tokenSet;

  const titleLine = findLine(lines, (l) => /att\s+quotation/i.test(l.text));
  const specLine = findLine(lines, (l) => /\bspecification\b/i.test(l.text));
  const equipLine = findLine(lines, (l) => /\bequipment\b/i.test(l.text));
  const payLine = findLine(lines, (l) => /payment\s+terms?/i.test(l.text));
  const trHdrLine = findLine(
    lines,
    (l) => /type\s+of\s+treatment/i.test(l.text) || /warranty/i.test(l.text)
  );

  const missing = [];
  if (!titleLine && !hasAnyToken(tokens, ["warrantyPeriod", "chemicalUsed", "typeOfTreatment"])) {
    missing.push("'ATT QUOTATION' heading");
  }
  if (!specLine && !hasAnyToken(tokens, ["specification"])) missing.push("Specification row");
  if (!trHdrLine && !hasAnyToken(tokens, ["warrantyPeriod", "chemicalUsed"])) {
    missing.push("Treatments/Warranty table");
  }

  if (missing.length > 0) {
    throw new PdfTemplateValidationError(
      `Invalid or unsupported ATT Quotation PDF template. Missing required sections: ${missing.join(", ")}`
    );
  }

  const { vlines, hlines } = p0.grid;
  const headerBannerBottom = p0.images
    .filter((im) => im.y1 > p0.height * 0.78)
    .reduce((minY, im) => Math.min(minY, im.y0), p0.height);

  const scopeVs = vlines
    .filter((v) => v.segments.some((s) => s.end > 450 && s.start < 430))
    .sort((a, b) => a.pos - b.pos);
  const trVs = vlines
    .filter((v) => v.segments.some((s) => s.end > 370 && s.start < 360))
    .sort((a, b) => a.pos - b.pos);

  const leftX = scopeVs[0]?.pos ?? trVs[0]?.pos ?? 46.2;
  const scopeSplitX = scopeVs.find((v) => v.pos > leftX + 40 && v.pos < 200)?.pos ?? 119.42;
  const rightX = scopeVs[scopeVs.length - 1]?.pos ?? trVs[trVs.length - 1]?.pos ?? 572.38;
  const borderW = scopeVs[0]?.thickness || trVs[0]?.thickness || 0.75;

  const trMidVs = trVs
    .filter((v) => v.pos > leftX + 60 && v.pos < rightX - 60)
    .map((v) => v.pos)
    .sort((a, b) => a - b);
  const trCols =
    trMidVs.length >= 3
      ? [leftX, trMidVs[0], trMidVs[1], trMidVs[2], rightX]
      : [leftX, 172.7, 272.45, 452.5, rightX];

  const sortedHs = [...hlines].sort((a, b) => b.pos - a.pos);
  const firstHAbove = (yVal) =>
    sortedHs.filter((h) => h.pos > yVal + 1).sort((a, b) => a.pos - b.pos)[0]?.pos ?? null;
  const firstHBelow = (yVal) =>
    sortedHs.filter((h) => h.pos < yVal - 1).sort((a, b) => b.pos - a.pos)[0]?.pos ?? null;

  const premLine = findLine(lines, (l) => /premise/i.test(l.text) || /\{premises\}/i.test(l.text));
  const rowBounds = (yHint, fbTop, fbBot) => ({
    topY: (yHint !== null ? firstHAbove(yHint) : null) ?? fbTop,
    bottomY: (yHint !== null ? firstHBelow(yHint) : null) ?? fbBot,
  });

  const premiseRow = rowBounds(premLine?.y ?? 498.43, 509.35, 473.95);
  const specRow = rowBounds(specLine?.y ?? 456.19, 473.95, 438.43);
  const equipRow = rowBounds(equipLine?.y ?? 427.51, 438.43, 416.71);
  const payRow = rowBounds(payLine?.y ?? 406.27, 416.71, 394.99);
  const trHeaderRow = rowBounds(trHdrLine?.y ?? 376.01, 386.95, 368.69);
  const trBodyBottomY = firstHBelow(trHeaderRow.bottomY - 2) ?? 309.29;

  const dateLine = findLine(lines, (l) => /\bdate\s*:/i.test(l.text));
  const qtnLine = findLine(lines, (l) => /\bqtn\s*:/i.test(l.text));
  const toLine = findLine(lines, (l) => /^to\s*,?$/i.test(l.text.trim()));
  const custNameLine = findLine(lines, (l) => /\{customername\}/i.test(l.text));
  const custAddrLine = findLine(lines, (l) => /\{customeraddress\}/i.test(l.text));
  const subjectLine = findLine(lines, (l) => /\bsubject\s*:/i.test(l.text));
  const respectedLine = findLine(lines, (l) => /respected\s+sir/i.test(l.text));
  const stampImage = p0.images.find((im) => im.y1 < trBodyBottomY + 10) || null;

  return {
    category: "att-quotation",
    pageWidth: p0.width,
    pageHeight: p0.height,
    fontFamily: p0.fontFamily,
    headerBannerBottomY: headerBannerBottom,
    borderW,
    meta: {
      titleY: titleLine?.y ?? 686.38,
      dateX: dateLine?.x ?? 430.39,
      dateY: dateLine?.y ?? 670.54,
      qtnX: qtnLine?.x ?? 431.11,
      qtnY: qtnLine?.y ?? 655.3,
      toY: toLine?.y ?? 640.18,
      customerX: custNameLine?.x ?? 64.34,
      customerNameY: custNameLine?.y ?? 624.82,
      customerAddressY: custAddrLine?.y ?? 609.82,
      subjectX: subjectLine?.x ?? 122.54,
      subjectY: subjectLine?.y ?? 582.7,
      respectedY: respectedLine?.y ?? 555.22,
    },
    scopeTable: {
      leftX,
      splitX: scopeSplitX,
      rightX,
      rows: {
        premise: { label: "Premise To Be Treated", ...premiseRow },
        specification: { label: "Specification", ...specRow },
        equipment: { label: "Equipment", ...equipRow },
        paymentTerms: { label: "Payment Terms", ...payRow },
      },
    },
    treatmentsTable: {
      cols: trCols,
      headerTopY: trHeaderRow.topY,
      headerBottomY: trHeaderRow.bottomY,
      bodyBottomY: trBodyBottomY,
    },
    footer: {
      stampImage,
    },
  };
}

/**
 * Inspects and validates a PDF buffer against the expected CRM document category.
 * Rejects unreadable, image-only/scanned, or wrong-category PDFs with PdfTemplateValidationError (400).
 */
export async function validatePdfTemplateForCategory(pdfBytes, documentType) {
  const inspection = await inspectPdfTemplate(pdfBytes);

  switch (documentType) {
    case "tax-invoice":
      return { inspection, layout: resolveTaxInvoicePdfLayout(inspection) };
    case "invoice":
      return { inspection, layout: resolveNonGstInvoicePdfLayout(inspection) };
    case "quotation":
      return { inspection, layout: resolveQuotationPdfLayout(inspection) };
    case "contract-renewal":
      return { inspection, layout: resolveContractRenewalPdfLayout(inspection) };
    case "one-time-job":
      return { inspection, layout: resolveOneTimeJobPdfLayout(inspection) };
    case "att-quotation":
      return { inspection, layout: resolveAttQuotationPdfLayout(inspection) };
    default:
      throw new PdfTemplateValidationError(
        `Unsupported document category for PDF templates: ${documentType}`
      );
  }
}
